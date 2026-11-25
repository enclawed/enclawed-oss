// Enclawed containment name guard: no contained process may create, write,
// rename onto or link to an execution-configuration name ANYWHERE in a
// read-write root (sub/.envrc, packages/x/.mcp.json, a/.vscode/tasks.json,
// .git/hooks/x, .git/config.lock, ...), and every inode it creates or opens
// for writing is journaled so the host can tell its own writes from the
// sandbox's.
//
// Two modes, one binary (built from this file by ./name-guard.ts):
//
//   shim <socket> <command> [args...]
//       Runs INSIDE the sandbox as the first program. Installs a seccomp
//       filter that hands every path-based creating or writing system call
//       (open/openat/creat with a write or create flag, mkdir, mknod,
//       rename, link, symlink, truncate; their *at forms) to a user-space
//       supervisor, refuses openat2 and io_uring (whose arguments seccomp
//       cannot see) and every foreign-ABI call, passes the listener to the
//       supervisor over an abstract socket and executes the command. The
//       filter is inherited by every descendant and cannot be removed.
//
//   supervise <socket> <config> <journal>
//       Runs OUTSIDE the sandbox (a child of contain-init, in its user,
//       PID and network namespaces). Accepts exactly one connection (the
//       shim's), joins the sandbox's mount namespace, keeps only
//       CAP_SYS_PTRACE (to read the caller's memory) and then serves every
//       notification by PERFORMING the call itself on its own copy of the
//       path, never by letting the kernel continue it: the caller's memory
//       is read once, and what is checked is exactly what is done, so no
//       other thread can change the path between the check and the use
//       (the TOCTOU that makes SECCOMP_USER_NOTIF_FLAG_CONTINUE unsound for
//       pointer arguments). Paths resolve in the sandbox's own root, so
//       symbolic links mean what they mean for the caller; with every
//       DAC-overriding capability dropped, permission checks are the
//       caller's (the same kernel uid). New file descriptors are installed
//       in the caller atomically (SECCOMP_ADDFD_FLAG_SEND). Waits are
//       killable only, so a signal never makes the caller restart a call
//       the supervisor already performed.
//
// If the supervisor dies, every intercepted call fails (ENOSYS): fail closed.

#define _GNU_SOURCE
#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <linux/audit.h>
#include <linux/capability.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <poll.h>
#include <sched.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/sysmacros.h>
#include <sys/un.h>
#include <unistd.h>

#if defined(__x86_64__)
#define GUARD_ARCH AUDIT_ARCH_X86_64
#elif defined(__aarch64__)
#define GUARD_ARCH AUDIT_ARCH_AARCH64
#else
#error "name guard: unsupported architecture"
#endif

#ifndef RENAME_EXCHANGE
#define RENAME_EXCHANGE (1 << 1) /* <linux/fs.h>; not exported by every libc (musl) */
#endif

#ifndef SECCOMP_FILTER_FLAG_WAIT_KILLABLE_RECV
#define SECCOMP_FILTER_FLAG_WAIT_KILLABLE_RECV (1UL << 5)
#endif

static void die(const char *what) {
  fprintf(stderr, "enclawed name guard: %s: %s\n", what, strerror(errno));
  exit(126);
}

static int abstract_addr(const char *name, struct sockaddr_un *a, socklen_t *len) {
  memset(a, 0, sizeof(*a));
  a->sun_family = AF_UNIX;
  size_t n = strlen(name);
  if (n + 1 > sizeof(a->sun_path)) {
    return -1;
  }
  memcpy(a->sun_path + 1, name, n); // abstract: leading NUL
  *len = (socklen_t)(offsetof(struct sockaddr_un, sun_path) + 1 + n);
  return 0;
}

// ─── Shim ───────────────────────────────────────────────────────────────

#define ARGLO(n) (offsetof(struct seccomp_data, args) + 8 * (n))
#define WRITE_FLAGS (O_WRONLY | O_RDWR | O_CREAT | O_TRUNC)

static struct sock_filter prog[128];
static unsigned short plen;

static void emit(struct sock_filter f) {
  if (plen >= 128) {
    fprintf(stderr, "enclawed name guard: filter too long\n");
    exit(126);
  }
  prog[plen++] = f;
}
#define S(code, k) emit((struct sock_filter)BPF_STMT(code, k))
#define J(code, k, jt, jf) emit((struct sock_filter)BPF_JUMP(code, k, jt, jf))

// nr == x: return `ret`.
static void on_nr(int nr, unsigned int ret) {
  J(BPF_JMP | BPF_JEQ | BPF_K, (unsigned)nr, 0, 1);
  S(BPF_RET | BPF_K, ret);
}

// nr == x: notify when the flags argument has a write or create bit, else allow.
static void on_open(int nr, int flag_arg) {
  J(BPF_JMP | BPF_JEQ | BPF_K, (unsigned)nr, 0, 4);
  S(BPF_LD | BPF_W | BPF_ABS, ARGLO(flag_arg));
  J(BPF_JMP | BPF_JSET | BPF_K, WRITE_FLAGS, 0, 1);
  S(BPF_RET | BPF_K, SECCOMP_RET_USER_NOTIF);
  S(BPF_RET | BPF_K, SECCOMP_RET_ALLOW);
}

static void build_filter(void) {
  plen = 0;
  S(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch));
  J(BPF_JMP | BPF_JEQ | BPF_K, GUARD_ARCH, 1, 0);
  S(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS);
  S(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr));
#if defined(__x86_64__)
  // x32 system calls (bit 30): never needed, never inspected.
  J(BPF_JMP | BPF_JGE | BPF_K, 0x40000000, 0, 1);
  S(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | ENOSYS);
#endif
  const unsigned int NOTIFY = SECCOMP_RET_USER_NOTIF;
  const unsigned int NOSYS = SECCOMP_RET_ERRNO | ENOSYS;
  on_nr(SYS_openat2, NOSYS);
  on_nr(SYS_io_uring_setup, NOSYS);
  on_nr(SYS_io_uring_enter, NOSYS);
  on_nr(SYS_io_uring_register, NOSYS);
  int notified[] = {
#if defined(__x86_64__)
      SYS_creat, SYS_mkdir, SYS_mknod, SYS_rename, SYS_link, SYS_symlink,
#endif
      SYS_mkdirat, SYS_mknodat, SYS_renameat, SYS_renameat2, SYS_linkat, SYS_symlinkat,
      SYS_truncate,
  };
  for (size_t i = 0; i < sizeof(notified) / sizeof(notified[0]); i++) {
    on_nr(notified[i], NOTIFY);
  }
#if defined(__x86_64__)
  on_open(SYS_open, 1);
  S(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr));
#endif
  on_open(SYS_openat, 2);
  S(BPF_RET | BPF_K, SECCOMP_RET_ALLOW);
}

static int shim(int argc, char **argv) {
  if (argc < 4) {
    fprintf(stderr, "usage: shim <socket> <command> [args...]\n");
    return 126;
  }
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
    die("no_new_privs");
  }
  build_filter();
  struct sock_fprog fp = {.len = plen, .filter = prog};
  int sock = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
  struct sockaddr_un a;
  socklen_t alen;
  if (sock < 0 || abstract_addr(argv[2], &a, &alen) != 0 ||
      connect(sock, (struct sockaddr *)&a, alen) != 0) {
    die("connect to the supervisor");
  }
  long lfd = syscall(SYS_seccomp, SECCOMP_SET_MODE_FILTER,
                     SECCOMP_FILTER_FLAG_NEW_LISTENER | SECCOMP_FILTER_FLAG_WAIT_KILLABLE_RECV, &fp);
  if (lfd < 0) {
    die("seccomp listener (this kernel lacks user notification with killable waits)");
  }
  char byte = 'L';
  struct iovec iov = {.iov_base = &byte, .iov_len = 1};
  union {
    char buf[CMSG_SPACE(sizeof(int))];
    struct cmsghdr align;
  } u;
  struct msghdr msg = {.msg_iov = &iov, .msg_iovlen = 1, .msg_control = u.buf,
                       .msg_controllen = sizeof(u.buf)};
  struct cmsghdr *c = CMSG_FIRSTHDR(&msg);
  c->cmsg_level = SOL_SOCKET;
  c->cmsg_type = SCM_RIGHTS;
  c->cmsg_len = CMSG_LEN(sizeof(int));
  int lfd_int = (int)lfd;
  memcpy(CMSG_DATA(c), &lfd_int, sizeof(int));
  if (sendmsg(sock, &msg, 0) != 1) {
    die("send the listener");
  }
  close(lfd_int);
  // The supervisor answers once it serves the listener.
  if (read(sock, &byte, 1) != 1 || byte != 'K') {
    fprintf(stderr, "enclawed name guard: the supervisor did not start\n");
    return 126;
  }
  close(sock);
  extern char **environ;
  execve(argv[3], argv + 3, environ);
  fprintf(stderr, "enclawed name guard: %s: %s\n", argv[3], strerror(errno));
  return 127;
}

// ─── Supervisor: policy ─────────────────────────────────────────────────

#define MAXLIST 256
static char *roots[MAXLIST];
static int nroots;
static char *allows[MAXLIST];
static int nallows;
static char *dirnames[MAXLIST];
static int ndirs;
static char *filenames[MAXLIST];
static int nfiles;
static char *pairs[MAXLIST][2];
static int npairs;
static char *exempts[MAXLIST];
static int nexempts;
static char *gitexes[MAXLIST];
static int ngitexes;
static char *approvals_file;
static int approvals_dir = -1; // opened before joining the sandbox's mount namespace
static char approvals_name[NAME_MAX + 1];

static void load_config(const char *path) {
  FILE *f = fopen(path, "r");
  if (!f) {
    die("config");
  }
  char line[PATH_MAX + 64];
  while (fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\n")] = 0;
    char *sp = strchr(line, ' ');
    if (!sp) {
      continue;
    }
    *sp = 0;
    char *v = sp + 1;
#define ADD(list, n)                                                                               \
  do {                                                                                             \
    if (n >= MAXLIST) {                                                                            \
      fprintf(stderr, "enclawed name guard: config list too long\n");                             \
      exit(126);                                                                                   \
    }                                                                                              \
    list[n++] = strdup(v);                                                                         \
  } while (0)
    if (!strcmp(line, "root")) {
      ADD(roots, nroots);
    } else if (!strcmp(line, "allow")) {
      ADD(allows, nallows);
    } else if (!strcmp(line, "dir")) {
      ADD(dirnames, ndirs);
    } else if (!strcmp(line, "file")) {
      ADD(filenames, nfiles);
    } else if (!strcmp(line, "approvals")) {
      approvals_file = strdup(v);
    } else if (!strcmp(line, "gitexe")) {
      ADD(gitexes, ngitexes);
    } else if (!strcmp(line, "exempt")) {
      ADD(exempts, nexempts);
    } else if (!strcmp(line, "pair")) {
      char *sp2 = strchr(v, ' ');
      if (sp2 && npairs < MAXLIST) {
        *sp2 = 0;
        pairs[npairs][0] = strdup(v);
        pairs[npairs][1] = strdup(sp2 + 1);
        npairs++;
      }
    }
  }
  fclose(f);
}

static int in_list(char **list, int n, const char *s) {
  for (int i = 0; i < n; i++) {
    if (!strcasecmp(list[i], s)) {
      return 1;
    }
  }
  return 0;
}

static int is_pair(const char *parent, const char *child) {
  for (int i = 0; i < npairs; i++) {
    if (!strcasecmp(pairs[i][0], parent) && !strcasecmp(pairs[i][1], child)) {
      return 1;
    }
  }
  return 0;
}

static int is_pair_parent(const char *name) {
  for (int i = 0; i < npairs; i++) {
    if (!strcasecmp(pairs[i][0], name)) {
      return 1;
    }
  }
  return 0;
}

/** The read-write root `full` lies in (index), or -1. */
static int root_of(const char *full) {
  int best = -1;
  size_t bestlen = 0;
  for (int i = 0; i < nroots; i++) {
    size_t n = strlen(roots[i]);
    if (!strncmp(full, roots[i], n) && (full[n] == '/' || full[n] == 0) && n >= bestlen) {
      best = i;
      bestlen = n;
    }
  }
  return best;
}

/** Is any component of `full` below its root an exempt (dependency-tree) directory? */
static int under_exempt(const char *full) {
  int r = root_of(full);
  if (r < 0) {
    return 0;
  }
  char buf[PATH_MAX];
  snprintf(buf, sizeof(buf), "%s", full + strlen(roots[r]));
  for (char *save = NULL, *c = strtok_r(buf, "/", &save); c; c = strtok_r(NULL, "/", &save)) {
    if (in_list(exempts, nexempts, c)) {
      return 1;
    }
  }
  return 0;
}

/**
 * May a NEW name `full` (an absolute path in the sandbox's view) come to
 * exist, or be opened for writing? 0: yes; EACCES: an exec-config path.
 */
static int deny_path(const char *full) {
  int r = root_of(full);
  if (r < 0) {
    return 0; // outside every read-write root (the private /tmp, HOME)
  }
  if (in_list(allows, nallows, full)) {
    return 0;
  }
  char buf[PATH_MAX];
  snprintf(buf, sizeof(buf), "%s", full + strlen(roots[r]));
  char *comps[PATH_MAX / 2];
  int n = 0;
  for (char *save = NULL, *c = strtok_r(buf, "/", &save); c && n < PATH_MAX / 2;
       c = strtok_r(NULL, "/", &save)) {
    comps[n++] = c;
  }
  for (int i = 0; i < n; i++) {
    if (in_list(exempts, nexempts, comps[i])) {
      return 0; // a dependency tree (node_modules, a virtualenv): nobody reads it as config
    }
  }
  for (int i = 0; i < n; i++) {
    const char *c = comps[i];
    int last = i == n - 1;
    if (in_list(dirnames, ndirs, c)) {
      return EACCES; // an agent/editor config directory, or anything inside one
    }
    if (last && in_list(filenames, nfiles, c)) {
      return EACCES;
    }
    if (i > 0 && is_pair(comps[i - 1], c)) {
      return EACCES; // .git/hooks, .git/config, .github/workflows, ... and below
    }
    // A lock or staging file of a protected file (".git/config.lock",
    // ".npmrc.lock"): what the host renames into place must not be ours.
    size_t len = strlen(c);
    if (last && len > 5 && !strcasecmp(c + len - 5, ".lock")) {
      char stem[NAME_MAX + 1];
      snprintf(stem, sizeof(stem), "%.*s", (int)(len - 5), c);
      if (in_list(filenames, nfiles, stem) || (i > 0 && is_pair(comps[i - 1], stem))) {
        return EACCES;
      }
    }
  }
  return 0;
}

// ─── Supervisor: emulation ──────────────────────────────────────────────

static int procfd = -1;
static int journalfd = -1;
static pid_t mypid;

static int fd_path(int fd, char *out, size_t size) {
  char link[64];
  snprintf(link, sizeof(link), "%d/fd/%d", (int)mypid, fd);
  ssize_t n = readlinkat(procfd, link, out, size - 1);
  if (n < 0) {
    return -errno;
  }
  out[n] = 0;
  return 0;
}

static void journal(int fd) {
  struct statx sx;
  if (statx(fd, "", AT_EMPTY_PATH, STATX_INO | STATX_BTIME, &sx) != 0) {
    return;
  }
  char line[160];
  unsigned long long dev = makedev(sx.stx_dev_major, sx.stx_dev_minor);
  long long bs = (sx.stx_mask & STATX_BTIME) ? (long long)sx.stx_btime.tv_sec : 0;
  long nsec = (sx.stx_mask & STATX_BTIME) ? (long)sx.stx_btime.tv_nsec : 0;
  int n = snprintf(line, sizeof(line), "%llu %llu %lld %ld\n", dev,
                   (unsigned long long)sx.stx_ino, bs, nsec);
  // Written before the call returns to the caller: complete by construction.
  if (write(journalfd, line, (size_t)n) != n) {
    fprintf(stderr, "enclawed name guard: journal write failed\n");
    exit(126);
  }
}

/**
 * The contained git materializing tracked files: the caller's executable is
 * the git the plan allowed, its subcommand is one that checks files out of
 * the repository, and the path is not inside a .git directory (hooks and
 * config are never tracked content). Such a write is allowed and journaled
 * ("G <pid> <path>"); once that process has exited, the host compares the
 * file with the blob the index records for it (./repo-config.ts) and
 * quarantines it when they differ. Anything else stays refused.
 */
static const char *checkout_cmds[] = {
    "checkout", "switch",  "merge",      "pull",          "rebase",         "stash",
    "reset",    "restore", "cherry-pick", "revert",       "read-tree",      "checkout-index",
    "clone",    "am",      "apply",      "worktree",      "sparse-checkout", "merge-ort",
    "merge-recursive", NULL};

/**
 * git subcommands that write the repository's own config (.git/config,
 * through .git/config.lock): `git config`, `git remote add`, `git branch
 * --set-upstream-to`, `git submodule init`, tracking set up by checkout,
 * switch, push -u and pull. What they wrote is checked afterwards for
 * every execution-capable key (./repo-config.ts).
 */
static const char *config_cmds[] = {"config",   "remote", "branch", "submodule", "worktree", "clone",
                                    "checkout", "switch", "push",   "pull",      "init",     NULL};

static int in_cmds(const char **cmds, const char *a) {
  for (int i = 0; cmds[i]; i++) {
    if (!strcmp(a, cmds[i])) {
      return 1;
    }
  }
  return 0;
}

/** The argv of the last git caller, as read for git_subcommand (NUL-separated). */
static char last_argv[8192];
static ssize_t last_argv_len;

/** The subcommand of the caller when it is the allowed git binary (else 0). */
static int git_subcommand(pid_t pid, char *out, size_t size) {
  if (ngitexes == 0) {
    return 0;
  }
  char link[64], exe[PATH_MAX];
  snprintf(link, sizeof(link), "%d/exe", (int)pid);
  ssize_t n = readlinkat(procfd, link, exe, sizeof(exe) - 1);
  if (n <= 0) {
    return 0;
  }
  exe[n] = 0;
  if (!in_list(gitexes, ngitexes, exe)) {
    return 0;
  }
  snprintf(link, sizeof(link), "%d/cmdline", (int)pid);
  int fd = openat(procfd, link, O_RDONLY | O_CLOEXEC);
  if (fd < 0) {
    return 0;
  }
  char cmd[8192];
  ssize_t len = read(fd, cmd, sizeof(cmd) - 1);
  close(fd);
  if (len <= 0) {
    return 0;
  }
  cmd[len] = 0;
  memcpy(last_argv, cmd, (size_t)len);
  last_argv_len = len;
  // Skip argv[0] and git's own options; the first other word is the subcommand.
  char *a = cmd + strlen(cmd) + 1;
  while (a < cmd + len) {
    if (!strcmp(a, "-C") || !strcmp(a, "-c") || !strcmp(a, "--git-dir") ||
        !strcmp(a, "--work-tree") || !strcmp(a, "--namespace")) {
      a += strlen(a) + 1;
      if (a < cmd + len) {
        a += strlen(a) + 1;
      }
      continue;
    }
    if (a[0] == '-') {
      a += strlen(a) + 1;
      continue;
    }
    snprintf(out, size, "%s", a);
    return 1;
  }
  return 0;
}

/** The parent of `pid` in our PID namespace (0 when unknown). */
static pid_t parent_of(pid_t pid) {
  char link[64], buf[512];
  snprintf(link, sizeof(link), "%d/stat", (int)pid);
  int fd = openat(procfd, link, O_RDONLY | O_CLOEXEC);
  if (fd < 0) {
    return 0;
  }
  ssize_t n = read(fd, buf, sizeof(buf) - 1);
  close(fd);
  if (n <= 0) {
    return 0;
  }
  buf[n] = 0;
  char *rp = strrchr(buf, ')');
  int ppid = 0;
  return rp && sscanf(rp + 2, "%*c %d", &ppid) == 1 ? (pid_t)ppid : 0;
}

/**
 * octopus and resolve merge each path with git-merge-one-file, a shell
 * script that `git merge-index` runs and that writes the merged file with
 * the shell: a writer whose parent or grandparent is the allowed git running
 * merge-index counts as git's checkout (what it wrote is still compared with
 * git's merge afterwards, so a program merge-index was told to run gains
 * nothing).
 */
static int under_merge_index(pid_t pid) {
  pid_t p = pid;
  for (int up = 0; up < 3; up++) {
    p = parent_of(p);
    if (p <= 1) {
      return 0;
    }
    char sub[256];
    if (git_subcommand(p, sub, sizeof(sub)) && !strcmp(sub, "merge-index")) {
      return 1;
    }
  }
  return 0;
}

static int has_git_component(const char *full) {
  const char *g = full;
  while ((g = strcasestr(g, "/.git")) != NULL) {
    if (g[5] == '/' || g[5] == 0) {
      return 1;
    }
    g += 5;
  }
  return 0;
}

static int ends_with(const char *s, const char *t) {
  size_t a = strlen(s), b = strlen(t);
  return a >= b && !strcmp(s + a - b, t);
}

/**
 * The invocation of a git process the guard let through ("V <pid> <argv
 * separated by 0x1f>"), once per process: the host reads the merge options
 * (-X, --strategy-option) it ran with to rebuild a conflict the same way.
 */
static pid_t argv_journaled[64];
static void journal_argv(pid_t pid) {
  for (int i = 0; i < 64; i++) {
    if (argv_journaled[i] == pid) {
      return;
    }
  }
  memmove(argv_journaled + 1, argv_journaled, sizeof(argv_journaled) - sizeof(pid_t));
  argv_journaled[0] = pid;
  char line[sizeof(last_argv) + 64];
  int n = snprintf(line, sizeof(line), "V %d ", (int)pid);
  for (ssize_t i = 0; i < last_argv_len && n < (int)sizeof(line) - 2; i++) {
    char c = last_argv[i];
    line[n++] = c == 0 ? 0x1f : (c == '\n' ? ' ' : c);
  }
  line[n++] = '\n';
  if (write(journalfd, line, (size_t)n) != n) {
    fprintf(stderr, "enclawed name guard: journal write failed\n");
    exit(126);
  }
}

static void journal_kind(char kind, pid_t pid, const char *full) {
  char line[PATH_MAX + 64];
  int n = snprintf(line, sizeof(line), "%c %d %s\n", kind, (int)pid, full);
  if (n < 0 || (size_t)n >= sizeof(line) || write(journalfd, line, (size_t)n) != n) {
    fprintf(stderr, "enclawed name guard: journal write failed\n");
    exit(126);
  }
}

/** Has the session approved writing `full` (a conflicted file a person resolves)? */
static int approved(const char *full) {
  if (approvals_dir < 0) {
    return 0;
  }
  int afd = openat(approvals_dir, approvals_name, O_RDONLY | O_CLOEXEC);
  FILE *f = afd < 0 ? NULL : fdopen(afd, "r");
  if (!f) {
    if (afd >= 0) {
      close(afd);
    }
    return 0;
  }
  char line[PATH_MAX + 2];
  int ok = 0;
  while (!ok && fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\n")] = 0;
    ok = !strcmp(line, full);
  }
  fclose(f);
  return ok;
}

/**
 * deny_path, with three exceptions, each journaled and checked afterwards
 * on the host:
 *   G  the contained git checking tracked files out (outside .git): the
 *      result must be the index's blob, or git's own merge of the conflict;
 *   C  the contained git writing .git/config through .git/config.lock: the
 *      new config may add no execution-capable key;
 *   A  a write the session approved (a person resolving a conflicted file):
 *      reported for admission.
 */
static int deny_for(pid_t pid, const char *full) {
  int deny = deny_path(full);
  if (deny != EACCES) {
    return deny;
  }
  char sub[256];
  int is_git = git_subcommand(pid, sub, sizeof(sub));
  int checkout_writer = is_git ? in_cmds(checkout_cmds, sub) : under_merge_index(pid);
  if (checkout_writer && !has_git_component(full)) {
    journal_argv(pid);
    journal_kind('G', pid, full);
    return 0;
  }
  int worktree_cfg = strstr(full, "/.git/") != NULL &&
                     (ends_with(full, "/config.worktree") || ends_with(full, "/config.worktree.lock"));
  if (is_git && in_cmds(config_cmds, sub) &&
      (ends_with(full, "/.git/config") || ends_with(full, "/.git/config.lock") || worktree_cfg)) {
    char cfg[PATH_MAX];
    snprintf(cfg, sizeof(cfg), "%.*s", (int)(strlen(full) - (ends_with(full, ".lock") ? 5 : 0)), full);
    journal_kind('C', pid, cfg);
    return 0;
  }
  if (approved(full)) {
    journal_kind('A', pid, full);
    return 0;
  }
  return deny;
}

/** Read a NUL-terminated string from the caller's memory. */
static int read_string(int memfd, uint64_t addr, char *out, size_t size) {
  size_t got = 0;
  while (got < size) {
    size_t page = 4096 - ((addr + got) & 4095);
    size_t want = page < size - got ? page : size - got;
    ssize_t n = pread(memfd, out + got, want, (off_t)(addr + got));
    if (n <= 0) {
      return -EFAULT;
    }
    void *nul = memchr(out + got, 0, (size_t)n);
    if (nul) {
      return 0;
    }
    got += (size_t)n;
  }
  return -ENAMETOOLONG;
}

typedef struct {
  int dfd;  // parent directory (O_PATH), owned
  char last[NAME_MAX + 1];
  char parent_path[PATH_MAX];
} Split;

/**
 * The base directory a path is resolved from, as the caller would: its cwd,
 * one of its descriptors, or (for an absolute path) the sandbox root. The
 * caller's own /proc/self, /dev/fd and /dev/std* entries are mapped to its
 * entries in our procfs (the sandbox's procfs does not know us).
 */
static int base_and_path(pid_t pid, int dirarg, const char *in, char *path, size_t size) {
  struct {
    const char *prefix;
    const char *to;
  } map[] = {{"/proc/self/", "%d/"},     {"/proc/thread-self/", "%d/task/%d/"},
             {"/dev/fd/", "%d/fd/"},     {"/dev/stdin", "%d/fd/0"},
             {"/dev/stdout", "%d/fd/1"}, {"/dev/stderr", "%d/fd/2"}};
  for (size_t i = 0; i < sizeof(map) / sizeof(map[0]); i++) {
    size_t n = strlen(map[i].prefix);
    if (!strncmp(in, map[i].prefix, n) &&
        (map[i].prefix[n - 1] == '/' || in[n] == 0 || in[n] == '/')) {
      char head[64];
      snprintf(head, sizeof(head), map[i].to, (int)pid, (int)pid);
      if (snprintf(path, size, "%s%s", head, in + n) >= (int)size) {
        return -ENAMETOOLONG;
      }
      return dup(procfd);
    }
  }
  if (snprintf(path, size, "%s", in) >= (int)size) {
    return -ENAMETOOLONG;
  }
  if (in[0] == '/') {
    return open("/", O_PATH | O_DIRECTORY | O_CLOEXEC);
  }
  char link[64];
  if (dirarg == AT_FDCWD) {
    snprintf(link, sizeof(link), "%d/cwd", (int)pid);
  } else {
    snprintf(link, sizeof(link), "%d/fd/%d", (int)pid, dirarg);
  }
  int fd = openat(procfd, link, O_PATH | O_CLOEXEC);
  return fd < 0 ? -errno : fd;
}

/** Split into parent directory (opened) and last component; the last component is not followed. */
static int split(pid_t pid, int dirarg, const char *in, Split *s) {
  char path[PATH_MAX];
  int base = base_and_path(pid, dirarg, in, path, sizeof(path));
  if (base < 0) {
    return base;
  }
  if (path[0] == 0) {
    close(base);
    return -ENOENT;
  }
  size_t len = strlen(path);
  while (len > 1 && path[len - 1] == '/') {
    path[--len] = 0;
  }
  char *slash = strrchr(path, '/');
  const char *parent;
  const char *last;
  if (!slash) {
    parent = ".";
    last = path;
  } else if (slash == path) {
    parent = "/";
    last = slash + 1;
  } else {
    *slash = 0;
    parent = path;
    last = slash + 1;
  }
  if (strlen(last) > NAME_MAX) {
    close(base);
    return -ENAMETOOLONG;
  }
  s->dfd = openat(base, parent, O_PATH | O_DIRECTORY | O_CLOEXEC);
  int e = errno;
  close(base);
  if (s->dfd < 0) {
    return -e;
  }
  snprintf(s->last, sizeof(s->last), "%s", last[0] ? last : ".");
  int r = fd_path(s->dfd, s->parent_path, sizeof(s->parent_path));
  if (r < 0) {
    close(s->dfd);
    return r;
  }
  return 0;
}

/** The path of the new name; a path too long to hold whole is refused, never truncated. */
static int full_of(const Split *s, char *out, size_t size) {
  int n = snprintf(out, size, "%s%s%s", s->parent_path, strcmp(s->parent_path, "/") ? "/" : "",
                   s->last);
  return n < 0 || (size_t)n >= size ? ENAMETOOLONG : 0;
}

static mode_t caller_umask(pid_t pid) {
  char p[64];
  snprintf(p, sizeof(p), "%d/status", (int)pid);
  int fd = openat(procfd, p, O_RDONLY | O_CLOEXEC);
  mode_t m = 022;
  if (fd >= 0) {
    char buf[4096];
    ssize_t n = read(fd, buf, sizeof(buf) - 1);
    close(fd);
    if (n > 0) {
      buf[n] = 0;
      char *u = strstr(buf, "Umask:");
      if (u) {
        m = (mode_t)strtol(u + 6, NULL, 8);
      }
    }
  }
  return m;
}

/** Open (with a write or create flag) on the caller's behalf. Returns an fd or -errno. */
static int do_open(pid_t pid, int dirarg, const char *path, int flags, mode_t mode) {
  Split s;
  int r = split(pid, dirarg, path, &s);
  if (r < 0) {
    return r;
  }
  char full[PATH_MAX];
  int fd;
  if ((flags & O_CREAT) && !(flags & O_EXCL)) {
    // An existing object (through links, procfs descriptor links included)
    // is opened, not created: handled as a plain write open below.
    int probe = openat(s.dfd, s.last, O_PATH | O_CLOEXEC | (flags & O_NOFOLLOW));
    if (probe >= 0) {
      close(probe);
      flags &= ~O_CREAT;
    }
  }
  if (flags & O_CREAT) {
    // A final symbolic link would be followed by the kernel (without
    // O_EXCL): follow it here, checking each name it leads to.
    for (int depth = 0; !(flags & O_EXCL); depth++) {
      struct stat st;
      if (fstatat(s.dfd, s.last, &st, AT_SYMLINK_NOFOLLOW) != 0 || !S_ISLNK(st.st_mode)) {
        break;
      }
      if (depth >= 40 || (flags & O_NOFOLLOW)) {
        close(s.dfd);
        return -ELOOP;
      }
      char target[PATH_MAX];
      ssize_t n = readlinkat(s.dfd, s.last, target, sizeof(target) - 1);
      if (n < 0) {
        r = -errno;
        close(s.dfd);
        return r;
      }
      target[n] = 0;
      char where[PATH_MAX];
      int wn = target[0] == '/' ? snprintf(where, sizeof(where), "%s", target)
                                : snprintf(where, sizeof(where), "%s/%s", s.parent_path, target);
      if (wn < 0 || (size_t)wn >= sizeof(where)) {
        close(s.dfd);
        return -ENAMETOOLONG;
      }
      close(s.dfd);
      r = split(pid, AT_FDCWD, where, &s);
      if (r < 0) {
        return r;
      }
    }
    int deny = full_of(&s, full, sizeof(full));
    if (!deny) {
      deny = deny_for(pid, full);
    }
    if (deny) {
      close(s.dfd);
      return -deny;
    }
    fd = openat(s.dfd, s.last, (flags & ~O_CLOEXEC) | O_NOFOLLOW | O_CLOEXEC,
                mode & ~caller_umask(pid));
    r = fd < 0 ? -errno : fd;
    close(s.dfd);
  } else {
    // Resolve exactly as the kernel would (final link followed unless
    // O_NOFOLLOW), check the object that resolved, then open THAT object.
    int pfd = openat(s.dfd, s.last, O_PATH | O_CLOEXEC | (flags & O_NOFOLLOW));
    r = -errno;
    close(s.dfd);
    if (pfd < 0) {
      return r;
    }
    r = fd_path(pfd, full, sizeof(full));
    if (r == 0) {
      r = -deny_for(pid, full);
    }
    if (r == 0) {
      char link[64];
      snprintf(link, sizeof(link), "%d/fd/%d", (int)mypid, pfd);
      fd = openat(procfd, link, (flags & ~(O_NOFOLLOW | O_CLOEXEC)) | O_CLOEXEC);
      r = fd < 0 ? -errno : fd;
    }
    close(pfd);
  }
  if (r >= 0) {
    journal(r);
  }
  return r;
}

static long do_mkdir(pid_t pid, int dirarg, const char *path, mode_t mode) {
  Split s;
  int r = split(pid, dirarg, path, &s);
  if (r < 0) {
    return r;
  }
  char full[PATH_MAX];
  int deny = full_of(&s, full, sizeof(full));
  if (!deny) {
    deny = deny_for(pid, full);
  }
  if (deny) {
    r = -deny;
  } else if (mkdirat(s.dfd, s.last, mode & ~caller_umask(pid)) != 0) {
    r = -errno;
  } else {
    int fd = openat(s.dfd, s.last, O_PATH | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (fd >= 0) {
      journal(fd);
      close(fd);
    }
  }
  close(s.dfd);
  return r;
}

static long do_mknod(pid_t pid, int dirarg, const char *path, mode_t mode, dev_t dev) {
  mode_t type = mode & S_IFMT;
  if (type != 0 && type != S_IFREG && type != S_IFIFO) {
    return -EPERM; // devices and sockets: never created by an unprivileged caller here
  }
  Split s;
  int r = split(pid, dirarg, path, &s);
  if (r < 0) {
    return r;
  }
  char full[PATH_MAX];
  int deny = full_of(&s, full, sizeof(full));
  if (!deny) {
    deny = deny_path(full);
  }
  if (deny) {
    r = -deny;
  } else if (mknodat(s.dfd, s.last, mode & ~caller_umask(pid), dev) != 0) {
    r = -errno;
  } else {
    int fd = openat(s.dfd, s.last, O_PATH | O_NOFOLLOW | O_CLOEXEC);
    if (fd >= 0) {
      journal(fd);
      close(fd);
    }
  }
  close(s.dfd);
  return r;
}

static long do_rename(pid_t pid, int od, const char *op, int nd, const char *np, unsigned flags) {
  Split a, b;
  int r = split(pid, od, op, &a);
  if (r < 0) {
    return r;
  }
  r = split(pid, nd, np, &b);
  if (r < 0) {
    close(a.dfd);
    return r;
  }
  char fa[PATH_MAX], fb[PATH_MAX];
  int deny = full_of(&a, fa, sizeof(fa));
  if (!deny) {
    deny = full_of(&b, fb, sizeof(fb));
  }
  if (!deny) {
    deny = deny_for(pid, fb);
  }
  if (!deny && (flags & RENAME_EXCHANGE)) {
    deny = deny_path(fa);
  }
  if (!deny && root_of(fb) >= 0) {
    // A directory becoming ".git" or ".github" could bring a "hooks" or
    // "workflows" made beforehand under another name: refused.
    if (is_pair_parent(b.last)) {
      deny = EACCES;
    }
    // Out of a dependency tree into the project: whatever it holds was
    // never checked.
    struct stat st;
    if (!deny && under_exempt(fa) && !under_exempt(fb) &&
        fstatat(a.dfd, a.last, &st, AT_SYMLINK_NOFOLLOW) == 0 && S_ISDIR(st.st_mode)) {
      deny = EACCES;
    }
  }
  if (deny) {
    r = -deny;
  } else if (syscall(SYS_renameat2, a.dfd, a.last, b.dfd, b.last, flags) != 0) {
    r = -errno;
  }
  close(a.dfd);
  close(b.dfd);
  return r;
}

static long do_link(pid_t pid, int od, const char *op, int nd, const char *np, int flags) {
  Split a, b;
  int r = split(pid, od, op, &a);
  if (r < 0) {
    return r;
  }
  r = split(pid, nd, np, &b);
  if (r < 0) {
    close(a.dfd);
    return r;
  }
  char fb[PATH_MAX];
  int deny = full_of(&b, fb, sizeof(fb));
  if (!deny) {
    deny = deny_path(fb);
  }
  if (deny) {
    r = -deny;
  } else if (linkat(a.dfd, a.last, b.dfd, b.last, flags & AT_SYMLINK_FOLLOW) != 0) {
    r = -errno;
  }
  close(a.dfd);
  close(b.dfd);
  return r;
}

static long do_symlink(pid_t pid, const char *target, int nd, const char *np) {
  Split b;
  int r = split(pid, nd, np, &b);
  if (r < 0) {
    return r;
  }
  char fb[PATH_MAX];
  int deny = full_of(&b, fb, sizeof(fb));
  if (!deny) {
    deny = deny_path(fb);
  }
  if (!deny && root_of(fb) >= 0 && !under_exempt(fb)) {
    // A link from the project into a dependency tree would make what lies
    // there (unchecked) appear in the project.
    char t[PATH_MAX];
    snprintf(t, sizeof(t), "%s", target);
    for (char *save = NULL, *c = strtok_r(t, "/", &save); c; c = strtok_r(NULL, "/", &save)) {
      if (in_list(exempts, nexempts, c)) {
        deny = EACCES;
        break;
      }
    }
  }
  if (deny) {
    r = -deny;
  } else if (symlinkat(target, b.dfd, b.last) != 0) {
    r = -errno;
  }
  close(b.dfd);
  return r;
}

static long do_truncate(pid_t pid, const char *path, off_t len) {
  int fd = do_open(pid, AT_FDCWD, path, O_WRONLY, 0);
  if (fd < 0) {
    return fd;
  }
  long r = ftruncate(fd, len) == 0 ? 0 : -errno;
  close(fd);
  return r;
}

static int drop_caps(void) {
  struct __user_cap_header_struct h = {.version = _LINUX_CAPABILITY_VERSION_3, .pid = 0};
  struct __user_cap_data_struct d[2];
  memset(d, 0, sizeof(d));
  d[0].effective = d[0].permitted = 1u << CAP_SYS_PTRACE;
  return (int)syscall(SYS_capset, &h, d);
}

static int supervise(int argc, char **argv) {
  if (argc < 5) {
    fprintf(stderr, "usage: supervise <socket> <config> <journal>\n");
    return 126;
  }
  load_config(argv[3]);
  if (approvals_file) {
    char dir[PATH_MAX];
    snprintf(dir, sizeof(dir), "%s", approvals_file);
    char *slash = strrchr(dir, '/');
    if (!slash || strlen(slash + 1) > NAME_MAX) {
      fprintf(stderr, "enclawed name guard: bad approvals path\n");
      return 126;
    }
    snprintf(approvals_name, sizeof(approvals_name), "%s", slash + 1);
    *slash = 0;
    approvals_dir = open(dir, O_PATH | O_DIRECTORY | O_CLOEXEC);
    if (approvals_dir < 0) {
      die("open the approvals directory");
    }
  }
  mypid = getpid();
  procfd = open("/proc", O_PATH | O_DIRECTORY | O_CLOEXEC);
  journalfd = open(argv[4], O_WRONLY | O_APPEND | O_CREAT | O_CLOEXEC, 0600);
  if (procfd < 0 || journalfd < 0) {
    die("open /proc or the journal");
  }
  int ls = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
  struct sockaddr_un a;
  socklen_t alen;
  if (ls < 0 || abstract_addr(argv[2], &a, &alen) != 0 || bind(ls, (struct sockaddr *)&a, alen) != 0 ||
      listen(ls, 1) != 0) {
    die("listen");
  }
  printf("ready\n");
  fflush(stdout);
  int conn = accept4(ls, NULL, NULL, SOCK_CLOEXEC);
  close(ls); // exactly one connection: the shim's, before any contained code runs
  if (conn < 0) {
    die("accept");
  }
  struct ucred cred;
  socklen_t cl = sizeof(cred);
  if (getsockopt(conn, SOL_SOCKET, SO_PEERCRED, &cred, &cl) != 0) {
    die("peer credentials");
  }
  char byte;
  struct iovec iov = {.iov_base = &byte, .iov_len = 1};
  union {
    char buf[CMSG_SPACE(sizeof(int))];
    struct cmsghdr align;
  } u;
  struct msghdr msg = {.msg_iov = &iov, .msg_iovlen = 1, .msg_control = u.buf,
                       .msg_controllen = sizeof(u.buf)};
  if (recvmsg(conn, &msg, MSG_CMSG_CLOEXEC) != 1) {
    die("receive the listener");
  }
  struct cmsghdr *c = CMSG_FIRSTHDR(&msg);
  if (!c || c->cmsg_type != SCM_RIGHTS) {
    fprintf(stderr, "enclawed name guard: no listener received\n");
    return 126;
  }
  int listener;
  memcpy(&listener, CMSG_DATA(c), sizeof(int));
  char ns[64];
  snprintf(ns, sizeof(ns), "%d/ns/mnt", (int)cred.pid);
  int nsfd = openat(procfd, ns, O_RDONLY | O_CLOEXEC);
  if (nsfd < 0 || setns(nsfd, CLONE_NEWNS) != 0) {
    die("join the sandbox's mount namespace");
  }
  close(nsfd);
  umask(0);
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 || drop_caps() != 0) {
    die("drop capabilities");
  }
  byte = 'K';
  if (write(conn, &byte, 1) != 1) {
    die("answer the shim");
  }
  close(conn);

  struct seccomp_notif_sizes sizes;
  if (syscall(SYS_seccomp, SECCOMP_GET_NOTIF_SIZES, 0, &sizes) != 0) {
    die("notification sizes");
  }
  struct seccomp_notif *req = calloc(1, sizes.seccomp_notif > sizeof(*req) ? sizes.seccomp_notif : sizeof(*req));
  struct seccomp_notif_resp *resp =
      calloc(1, sizes.seccomp_notif_resp > sizeof(*resp) ? sizes.seccomp_notif_resp : sizeof(*resp));
  for (;;) {
    struct pollfd p = {.fd = listener, .events = POLLIN};
    if (poll(&p, 1, -1) < 0) {
      if (errno == EINTR) {
        continue;
      }
      die("poll");
    }
    if (p.revents & (POLLHUP | POLLERR)) {
      return 0; // every contained process is gone
    }
    memset(req, 0, sizes.seccomp_notif);
    if (ioctl(listener, SECCOMP_IOCTL_NOTIF_RECV, req) != 0) {
      if (errno == EINTR || errno == ENOENT) {
        continue;
      }
      die("receive a notification");
    }
    pid_t pid = (pid_t)req->pid;
    char mem[64];
    snprintf(mem, sizeof(mem), "%d/mem", (int)pid);
    int memfd = openat(procfd, mem, O_RDONLY | O_CLOEXEC);
    long ret = 0;
    int is_fd = 0;
    char p1[PATH_MAX], p2[PATH_MAX];
    const __u64 *A = req->data.args;
    int nr = req->data.nr;
    int n1 = -1, n2 = -1; // which arguments are paths
    switch (nr) {
#if defined(__x86_64__)
    case SYS_open: case SYS_creat: case SYS_mkdir: case SYS_mknod: case SYS_truncate:
      n1 = 0;
      break;
    case SYS_rename: case SYS_link:
      n1 = 0, n2 = 1;
      break;
    case SYS_symlink:
      n1 = 0, n2 = 1;
      break;
#else
    case SYS_truncate:
      n1 = 0;
      break;
#endif
    case SYS_openat: case SYS_mkdirat: case SYS_mknodat:
      n1 = 1;
      break;
    case SYS_renameat: case SYS_renameat2: case SYS_linkat:
      n1 = 1, n2 = 3;
      break;
    case SYS_symlinkat:
      n1 = 0, n2 = 2;
      break;
    default:
      ret = -ENOSYS;
    }
    if (memfd < 0) {
      ret = -EPERM;
    } else {
      if (ret == 0 && n1 >= 0) {
        int e = read_string(memfd, A[n1], p1, sizeof(p1));
        if (e < 0) ret = e;
      }
      if (ret == 0 && n2 >= 0) {
        int e = read_string(memfd, A[n2], p2, sizeof(p2));
        if (e < 0) ret = e;
      }
      close(memfd);
    }
    // The memory read belonged to this very call of this very task.
    if (ioctl(listener, SECCOMP_IOCTL_NOTIF_ID_VALID, &req->id) != 0) {
      continue;
    }
    if (ret == 0) {
      switch (nr) {
#if defined(__x86_64__)
      case SYS_open:
        ret = do_open(pid, AT_FDCWD, p1, (int)A[1], (mode_t)A[2]);
        is_fd = 1;
        break;
      case SYS_creat:
        ret = do_open(pid, AT_FDCWD, p1, O_CREAT | O_WRONLY | O_TRUNC, (mode_t)A[1]);
        is_fd = 1;
        break;
      case SYS_mkdir:
        ret = do_mkdir(pid, AT_FDCWD, p1, (mode_t)A[1]);
        break;
      case SYS_mknod:
        ret = do_mknod(pid, AT_FDCWD, p1, (mode_t)A[1], (dev_t)A[2]);
        break;
      case SYS_rename:
        ret = do_rename(pid, AT_FDCWD, p1, AT_FDCWD, p2, 0);
        break;
      case SYS_link:
        ret = do_link(pid, AT_FDCWD, p1, AT_FDCWD, p2, 0);
        break;
      case SYS_symlink:
        ret = do_symlink(pid, p1, AT_FDCWD, p2);
        break;
#endif
      case SYS_openat:
        ret = do_open(pid, (int)A[0], p1, (int)A[2], (mode_t)A[3]);
        is_fd = 1;
        break;
      case SYS_mkdirat:
        ret = do_mkdir(pid, (int)A[0], p1, (mode_t)A[2]);
        break;
      case SYS_mknodat:
        ret = do_mknod(pid, (int)A[0], p1, (mode_t)A[2], (dev_t)A[3]);
        break;
      case SYS_renameat:
        ret = do_rename(pid, (int)A[0], p1, (int)A[2], p2, 0);
        break;
      case SYS_renameat2:
        ret = do_rename(pid, (int)A[0], p1, (int)A[2], p2, (unsigned)A[4]);
        break;
      case SYS_linkat:
        ret = do_link(pid, (int)A[0], p1, (int)A[2], p2, (int)A[4]);
        break;
      case SYS_symlinkat:
        ret = do_symlink(pid, p1, (int)A[1], p2);
        break;
      case SYS_truncate:
        ret = do_truncate(pid, p1, (off_t)A[1]);
        break;
      }
    }
    if (is_fd && ret >= 0) {
      int flags = nr == SYS_openat ? (int)A[2] :
#if defined(__x86_64__)
                  nr == SYS_open ? (int)A[1] :
#endif
                  0;
      struct seccomp_notif_addfd add = {.id = req->id, .flags = SECCOMP_ADDFD_FLAG_SEND,
                                        .srcfd = (unsigned)ret, .newfd = 0,
                                        .newfd_flags = (unsigned)(flags & O_CLOEXEC)};
      int got = ioctl(listener, SECCOMP_IOCTL_NOTIF_ADDFD, &add);
      int e = errno;
      close((int)ret);
      if (got >= 0 || e == ENOENT) {
        continue; // answered atomically, or the caller is gone
      }
      ret = -e;
    }
    memset(resp, 0, sizes.seccomp_notif_resp);
    resp->id = req->id;
    if (ret < 0) {
      resp->error = (int)ret;
    } else {
      resp->val = ret;
    }
    if (ioctl(listener, SECCOMP_IOCTL_NOTIF_SEND, resp) != 0 && errno != ENOENT) {
      die("answer a notification");
    }
  }
}

/**
 * selftest <config> <path>...: the policy alone (no seccomp, no namespaces),
 * one "deny <path>" or "allow <path>" line per path. Lets the build check a
 * cross-built binary under an emulator, where seccomp itself cannot run.
 */
static int selftest(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: selftest <config> <path>...\n");
    return 126;
  }
  load_config(argv[2]);
  for (int i = 3; i < argc; i++) {
    printf("%s %s\n", deny_path(argv[i]) ? "deny" : "allow", argv[i]);
  }
  return 0;
}

int main(int argc, char **argv) {
  if (argc >= 2 && !strcmp(argv[1], "selftest")) {
    return selftest(argc, argv);
  }
  if (argc >= 2 && !strcmp(argv[1], "shim")) {
    return shim(argc, argv);
  }
  if (argc >= 2 && !strcmp(argv[1], "supervise")) {
    return supervise(argc, argv);
  }
  fprintf(stderr, "usage: name-guard shim|supervise ...\n");
  return 126;
}
