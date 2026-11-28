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
//       rename, link, symlink, truncate, chmod, utime; their *at forms) to a user-space
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
// Exec (execve, execveat) is the one call the supervisor cannot perform for
// the caller: it decides, then lets the kernel continue the call. What it
// decides is only whether the target is one of the real programs' execute-only
// copies (exec_check): refused unless the caller is a wrapper; a path that
// resolves through a descriptor link or to a procfs object is refused too. The
// kernel re-reads the path when it continues; the supervisor reads it twice and
// refuses when it changed in between, and a caller with more than one thread
// (which could change it after the second read) starts only a read-only system
// binary (shared_exec_ok). Residual: a process created with CLONE_VM (vfork)
// shares its parent's memory but counts one thread; what a changed path can
// reach is still bounded by the view (the real programs' copies are not in it
// and are not reachable through procfs) (see docs/security/containment-hardening.md).
//
// Modes, ownership, times and extended attributes: ownership changes and
// extended-attribute writes are refused outright (EPERM, EOPNOTSUPP); chmod and
// the utime calls are performed here (do_chmod, do_utimes).
//
// If the supervisor dies, every intercepted call fails (ENOSYS): fail closed.

#define _GNU_SOURCE
#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/magic.h>
#include <sys/statfs.h>
#include <dirent.h>
#include <linux/openat2.h>
#include <sys/statvfs.h>
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
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/sysmacros.h>
#include <sys/uio.h>
#include <sys/un.h>
#include <unistd.h>
#include <sys/time.h>
#include <utime.h>

#define NR_fchmodat2 452
#define NR_setxattrat 463
#define NR_removexattrat 466

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
  // Extended attributes are never set or removed (security.*, trusted.* and
  // user.* ones some tools read as settings): as on a file system without them.
  const unsigned int NOXATTR = SECCOMP_RET_ERRNO | EOPNOTSUPP;
  int noxattr[] = {SYS_setxattr, SYS_lsetxattr, SYS_fsetxattr, SYS_removexattr,
                   SYS_lremovexattr, SYS_fremovexattr, NR_setxattrat, NR_removexattrat};
  for (size_t i = 0; i < sizeof(noxattr) / sizeof(noxattr[0]); i++) {
    on_nr(noxattr[i], NOXATTR);
  }
  // Ownership never changes.
  const unsigned int NOPERM = SECCOMP_RET_ERRNO | EPERM;
#if defined(__x86_64__)
  on_nr(SYS_chown, NOPERM);
  on_nr(SYS_lchown, NOPERM);
#endif
  on_nr(SYS_fchown, NOPERM);
  on_nr(SYS_fchownat, NOPERM);
  int notified[] = {
#if defined(__x86_64__)
      SYS_creat, SYS_mkdir, SYS_mknod, SYS_rename, SYS_link, SYS_symlink,
#endif
      SYS_mkdirat, SYS_mknodat, SYS_renameat, SYS_renameat2, SYS_linkat, SYS_symlinkat,
      SYS_truncate,
      // Modes and times: performed here (do_chmod, do_utimes).
#if defined(__x86_64__)
      SYS_chmod, SYS_utime, SYS_utimes, SYS_futimesat,
#endif
      SYS_fchmod, SYS_fchmodat, NR_fchmodat2, SYS_utimensat,
      // Every exec: no process but a wrapper starts a real program's copy.
      SYS_execve, SYS_execveat,
  };
  for (size_t i = 0; i < sizeof(notified) / sizeof(notified[0]); i++) {
    on_nr(notified[i], NOTIFY);
  }
  // Every open: writes are performed here; reads are a real shell's read pins
  // (serve_read), or continued.
#if defined(__x86_64__)
  on_nr(SYS_open, NOTIFY);
#endif
  on_nr(SYS_openat, NOTIFY);
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
// File-name endings and [prefix, ending] pairs that configure what runs later
// (*.code-workspace, mise.<env>.toml): config lines "suffix S" and "affix P S".
static char *suffixes[MAXLIST];
static int nsuffixes;
static char *affix_pre[MAXLIST], *affix_suf[MAXLIST];
static int naffixes;
// The real programs the wrappers start: each one's path in the view, the
// execute-only copy on the host, and the descriptor opened on it at start.
static char *realviews[MAXLIST];
static int nrealviews;
static char *realhosts[MAXLIST];
static int nrealhosts;
static int realfds[MAXLIST];
// The files a real shell may read from a writable place: (SHA-256, real path).
static char *readpin_path[MAXLIST * 4];
static char readpin_sha[MAXLIST * 4][65];
static int nreadpins;
// Contained builds (config "commwrite"): a task of the caller's own thread
// group may have its name (/proc/.../comm) written; see comm_open.
static int commwrite;
static struct stat selfst;
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
static int git_refs_writable; // config "gitrefs": the line may move git's refs
static char *modeoks[MAXLIST]; // config "modeok": files whose mode the line changes (Enclawed read it)
static int nmodeoks;
// Files the line runs directly, bound executable in the view (config
// "execpin"): no write reaches them during the run, so no path that is
// executable is ever writable.
static char *execpins[MAXLIST];
static int nexecpins;
// Files a protected configuration names to run (config "protectpath": yarn's
// yarnPath): never created, written or named again.
static char *protectpaths[MAXLIST];
static int nprotectpaths;
static int py_startup_refused; // config "pystartup": no python start-up file is made (not an install)
// Implicit execution caches (config "xcache*", not an install): what a later
// tool of the person runs or prefers to its source without asking (Python's
// bytecode, a bundler's or transpiler's cache). Never written.
static char *xcache_dirs[MAXLIST];
static int nxcache_dirs;
static char *xcache_suffixes[MAXLIST];
static int nxcache_suffixes;
static char *xcache_pairs[MAXLIST][2];
static int nxcache_pairs;
static char *xcache_under[MAXLIST][2]; // b anywhere below a
static int nxcache_under;
static char *xcache_prefixes[MAXLIST];
static int nxcache_prefixes;
// Package-manager state (config "pmnodemodules"): node_modules is read-only but
// for a package's own build/ tree; Composer vendor trees found at the start.
static int pm_node_modules;
static char *composer_vendors[MAXLIST];
static int ncomposer_vendors;
static char *xcache_files[MAXLIST];
static int nxcache_files;
// Virtual environments found at the start (a directory holding pyvenv.cfg or
// conda-meta): their entry points are what the person runs next.
#define MAXVENVS 4096
static char *venvs[MAXVENVS];
static int nvenvs;
static int venvs_overflow; // more than MAXVENVS: every bin/ and Scripts/ is refused
// Git directories inside a read-write root not named .git (a .git file's
// "gitdir:" target found at the start): each is a git directory as .git is.
// More than the list holds fails closed: a path in a git directory the list
// misses is decided as in its parent's (where modules/... is never written)
// or as a .git name (never written).
#define MAXGITDIRS 4096
static char *gitdirs[MAXGITDIRS];
static int ngitdirs;
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
    if (!strcmp(line, "gitrefs")) {
      git_refs_writable = 1;
    } else if (!strcmp(line, "modeok")) {
      ADD(modeoks, nmodeoks);
    } else if (!strcmp(line, "execpin")) {
      ADD(execpins, nexecpins);
    } else if (!strcmp(line, "protectpath")) {
      ADD(protectpaths, nprotectpaths);
    } else if (!strcmp(line, "xcachedir")) {
      ADD(xcache_dirs, nxcache_dirs);
    } else if (!strcmp(line, "xcachesuffix")) {
      ADD(xcache_suffixes, nxcache_suffixes);
    } else if (!strcmp(line, "xcachepair") || !strcmp(line, "xcacheunder")) {
      int under = !strcmp(line, "xcacheunder");
      int *cnt = under ? &nxcache_under : &nxcache_pairs;
      char *(*list)[2] = under ? xcache_under : xcache_pairs;
      char *sp2 = strchr(v, ' ');
      if (!sp2 || *cnt >= MAXLIST) {
        fprintf(stderr, "enclawed name guard: bad %s\n", line);
        exit(126);
      }
      *sp2 = 0;
      list[*cnt][0] = strdup(v);
      list[*cnt][1] = strdup(sp2 + 1);
      (*cnt)++;
    } else if (!strcmp(line, "xcacheprefix")) {
      ADD(xcache_prefixes, nxcache_prefixes);
    } else if (!strcmp(line, "pmnodemodules")) {
      pm_node_modules = 1;
    } else if (!strcmp(line, "xcachefile")) {
      ADD(xcache_files, nxcache_files);
    } else if (!strcmp(line, "pystartup")) {
      py_startup_refused = 1;
    } else if (!strcmp(line, "root")) {
      ADD(roots, nroots);
    } else if (!strcmp(line, "allow")) {
      ADD(allows, nallows);
    } else if (!strcmp(line, "dir")) {
      ADD(dirnames, ndirs);
    } else if (!strcmp(line, "file")) {
      ADD(filenames, nfiles);
    } else if (!strcmp(line, "commwrite")) {
      commwrite = !strcmp(v, "1");
    } else if (!strcmp(line, "approvals")) {
      approvals_file = strdup(v);
    } else if (!strcmp(line, "gitexe")) {
      ADD(gitexes, ngitexes);
    } else if (!strcmp(line, "exempt")) {
      ADD(exempts, nexempts);
    } else if (!strcmp(line, "suffix")) {
      ADD(suffixes, nsuffixes);
    } else if (!strcmp(line, "affix")) {
      char *sp2 = strchr(v, ' ');
      if (sp2 && naffixes < MAXLIST) {
        *sp2 = 0;
        affix_pre[naffixes] = strdup(v);
        affix_suf[naffixes] = strdup(sp2 + 1);
        naffixes++;
      }
    } else if (!strcmp(line, "readpin")) {
      char *sp2 = strchr(v, ' ');
      if (sp2 && sp2 - v == 64 && nreadpins < (int)(sizeof(readpin_path) / sizeof(readpin_path[0]))) {
        memcpy(readpin_sha[nreadpins], v, 64);
        readpin_sha[nreadpins][64] = 0;
        readpin_path[nreadpins] = strdup(sp2 + 1);
        nreadpins++;
      }
    } else if (!strcmp(line, "realview")) {
      ADD(realviews, nrealviews);
    } else if (!strcmp(line, "realhost")) {
      ADD(realhosts, nrealhosts);
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


static int name_ends_with(const char *name, const char *suf) {
  size_t n = strlen(name), k = strlen(suf);
  return n > k && !strcasecmp(name + n - k, suf);
}

static int protected_file_name(const char *name) {
  if (in_list(filenames, nfiles, name)) {
    return 1;
  }
  for (int i = 0; i < nsuffixes; i++) {
    if (name_ends_with(name, suffixes[i])) {
      return 1;
    }
  }
  for (int i = 0; i < naffixes; i++) {
    size_t n = strlen(name), a = strlen(affix_pre[i]), b = strlen(affix_suf[i]);
    if (n > a + b && !strncasecmp(name, affix_pre[i], a) && name_ends_with(name, affix_suf[i])) {
      return 1;
    }
  }
  return 0;
}

/** `name` without its trailing dots and spaces, in place (as a Windows file system names it). */
static void strip_trailing(char *name) {
  size_t k = strlen(name);
  if (!strcmp(name, ".") || !strcmp(name, "..")) {
    return;
  }
  while (k > 0 && (name[k - 1] == '.' || name[k - 1] == ' ')) {
    name[--k] = 0;
  }
}

static int is_pair_parent(const char *raw) {
  char name[NAME_MAX + 1];
  snprintf(name, sizeof(name), "%s", raw);
  strip_trailing(name);
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
static int name_in(const char *c, const char *const *names) {
  for (; *names; names++) {
    if (!strcasecmp(c, *names)) {
      return 1;
    }
  }
  return 0;
}

/**
 * May a path inside a git directory (its components below it, `c[0..m)`) be
 * created or written? An allowlist of what git writes for what a contained run
 * may do: objects (not objects/info, whose alternates redirect object reads),
 * the index; with "gitrefs", its refs, HEAD, logs and a merge's state. Never
 * its config, commondir, hooks, info, gitdir files, shallow, a rebase's or
 * sequencer's todo (exec lines), a worktree's or submodule's configuration.
 */
static int git_entry_allowed(char **c, int m) {
  // With refs: what a commit, a branch, a checkout and a merge write (a
  // commit's message; rerere's recorded resolutions, which the host checks
  // when git replays one).
  static const char *const REF_FILES[] = {"HEAD", "ORIG_HEAD", "packed-refs", "MERGE_HEAD", "MERGE_MSG",
                                          "MERGE_MODE", "MERGE_RR", "AUTO_MERGE", "CHERRY_PICK_HEAD",
                                          "REVERT_HEAD", "COMMIT_EDITMSG", NULL};
  if (m < 1) {
    return 0;
  }
  // objects: its fan-out directories and packs, a loose object or pack file in
  // them (never objects/info, whose alternates redirect object reads, and
  // nothing deeper).
  if (!strcasecmp(c[0], "objects")) {
    if (m == 1) {
      return 1;
    }
    int fan = strlen(c[1]) == 2 && isxdigit((unsigned char)c[1][0]) && isxdigit((unsigned char)c[1][1]);
    return (fan || !strcasecmp(c[1], "pack")) && m <= 3;
  }
  if (m == 1 && (!strcasecmp(c[0], "index") || !strcasecmp(c[0], "index.lock"))) {
    return 1;
  }
  if (git_refs_writable) {
    if (!strcasecmp(c[0], "refs") || !strcasecmp(c[0], "logs") || !strcasecmp(c[0], "rr-cache")) {
      return 1;
    }
    if (m == 1) {
      char stem[NAME_MAX + 1];
      size_t len = strlen(c[0]);
      snprintf(stem, sizeof(stem), "%s", c[0]);
      if (len > 5 && !strcasecmp(stem + len - 5, ".lock")) {
        stem[len - 5] = 0;
      }
      return name_in(stem, REF_FILES);
    }
  }
  return 0;
}

static int deny_path(const char *full) {
  int r = root_of(full);
  if (r < 0) {
    return 0; // outside every read-write root (the private /tmp, HOME)
  }
  for (int i = 0; i < nprotectpaths; i++) {
    if (!strcmp(full, protectpaths[i])) {
      return EACCES;
    }
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
  // A git directory (the project's .git, each submodule's and worktree's in
  // it, a nested repository's, one a .git file names: enumerated exactly at
  // the start, gitdirs) and anything inside it: only what git writes for the
  // run's own operations, decided relative to the git directory the path is
  // in (git_entry_allowed). Anywhere else, no name .git is made or written
  // (a submodule's git directory the start did not find is not made either).
  // Not inside a dependency tree (a package's own repository is nobody's).
  {
    int g = -1;
    size_t gl = 0;
    for (int i = 0; i < ngitdirs; i++) {
      size_t l = strlen(gitdirs[i]);
      if (!strncmp(full, gitdirs[i], l) && (full[l] == '/' || full[l] == 0) && (g < 0 || l > gl)) {
        g = i;
        gl = l;
      }
    }
    if (g >= 0) {
      if (full[gl] == 0) {
        return EACCES;
      }
      char gb[PATH_MAX];
      snprintf(gb, sizeof(gb), "%s", full + gl + 1);
      char *rest[PATH_MAX / 2];
      int m = 0;
      for (char *save = NULL, *c = strtok_r(gb, "/", &save); c && m < PATH_MAX / 2;
           c = strtok_r(NULL, "/", &save)) {
        strip_trailing(c);
        if (!strcasecmp(c, ".git")) {
          return EACCES;
        }
        rest[m++] = c;
      }
      if (!git_entry_allowed(rest, m)) {
        return EACCES;
      }
    } else {
      for (int i = 0; i < n; i++) {
        if (in_list(exempts, nexempts, comps[i])) {
          break;
        }
        char gn[NAME_MAX + 1];
        snprintf(gn, sizeof(gn), "%s", comps[i]);
        strip_trailing(gn);
        if (!strcasecmp(gn, ".git")) {
          return EACCES;
        }
      }
    }
  }
  // Python's start-up files, which every later python of the person runs:
  // sitecustomize.py and usercustomize.py anywhere (a virtualenv included),
  // and a .pth file in a site-packages or dist-packages directory. (Not in an
  // install, which writes a package's own .pth files.)
  // Implicit execution caches, and a virtual environment's entry points
  // (bin/, Scripts/, pyvenv.cfg, conda's activate.d and deactivate.d): what
  // the person's next python, activate or tool runs without a decision.
  if (n > 0) {
    static char nm[512][NAME_MAX + 1];
    if (n > 512) {
      return ENAMETOOLONG;
    }
    int cnt = n;
    for (int i = 0; i < cnt; i++) {
      snprintf(nm[i], sizeof(nm[i]), "%s", comps[i]);
      strip_trailing(nm[i]);
    }
    for (int i = 0; i < cnt; i++) {
      for (int k = 0; k < nxcache_dirs; k++) {
        if (!strcasecmp(nm[i], xcache_dirs[k])) {
          return EACCES;
        }
      }
      for (int k = 0; i > 0 && k < nxcache_pairs; k++) {
        if (!strcasecmp(nm[i - 1], xcache_pairs[k][0]) && !strcasecmp(nm[i], xcache_pairs[k][1])) {
          return EACCES;
        }
      }
      for (int k = 0; k < nxcache_under; k++) {
        if (!strcasecmp(nm[i], xcache_under[k][1])) {
          for (int j = 0; j < i; j++) {
            if (!strcasecmp(nm[j], xcache_under[k][0])) {
              return EACCES;
            }
          }
        }
      }
    }
    for (int k = 0; k < nxcache_files; k++) {
      if (!strcasecmp(nm[cnt - 1], xcache_files[k])) {
        return EACCES;
      }
    }
    for (int k = 0; k < nxcache_prefixes; k++) {
      if (!strncasecmp(nm[cnt - 1], xcache_prefixes[k], strlen(xcache_prefixes[k]))) {
        return EACCES;
      }
    }
    // node_modules: installed packages, read-only but for a package's own
    // build/ tree (a native addon's outputs), counted from the last node_modules.
    if (pm_node_modules) {
      int j = -1;
      for (int i = 0; i < cnt; i++) {
        if (!strcasecmp(nm[i], "node_modules")) {
          j = i;
        }
      }
      if (j >= 0) {
        int pkg_end = (j + 1 < cnt && nm[j + 1][0] == '@') ? j + 2 : j + 1;
        if (!(cnt > pkg_end + 1 && !strcasecmp(nm[pkg_end + 1], "build"))) {
          return EACCES;
        }
      }
      for (int v = 0; v < ncomposer_vendors; v++) {
        size_t vl = strlen(composer_vendors[v]);
        if (!strncmp(full, composer_vendors[v], vl) && (full[vl] == '/' || full[vl] == 0)) {
          return EACCES;
        }
      }
    }
    size_t ll = strlen(nm[cnt - 1]);
    for (int k = 0; k < nxcache_suffixes; k++) {
      size_t sl = strlen(xcache_suffixes[k]);
      if (ll > sl && !strcasecmp(nm[cnt - 1] + ll - sl, xcache_suffixes[k])) {
        return EACCES;
      }
    }
    if (py_startup_refused) {
      if (!strcasecmp(nm[cnt - 1], "pyvenv.cfg")) {
        return EACCES; // a new virtual environment, or one changed
      }
      for (int i = 0; venvs_overflow && i < cnt; i++) {
        if (!strcasecmp(nm[i], "bin") || !strcasecmp(nm[i], "Scripts") ||
            !strcasecmp(nm[i], "site-packages")) {
          return EACCES;
        }
      }
      for (int v = 0; v < nvenvs; v++) {
        size_t vl = strlen(venvs[v]);
        if (strncmp(full, venvs[v], vl) || (full[vl] != '/' && full[vl] != 0)) {
          continue;
        }
        if (full[vl] == 0) {
          return EACCES; // the environment itself (renamed, replaced)
        }
        char vb[PATH_MAX];
        snprintf(vb, sizeof(vb), "%s", full + vl + 1);
        char *vc[8];
        int m = 0;
        for (char *save = NULL, *c = strtok_r(vb, "/", &save); c && m < 8; c = strtok_r(NULL, "/", &save)) {
          strip_trailing(c);
          vc[m++] = c;
        }
        // Its entry points and its installed packages (lib*/, Lib/, include/): a
        // contained run of the environment's Python trusts its packages as
        // toolchain code. Only an install writes them. And the mark Enclawed
        // leaves when a run changed them anyway.
        if (m >= 1 && (!strcasecmp(vc[0], "bin") || !strcasecmp(vc[0], "Scripts") ||
                       !strncasecmp(vc[0], "lib", 3) || !strcasecmp(vc[0], "include") ||
                       !strcasecmp(vc[0], ".enclawed-tainted"))) {
          return EACCES;
        }
        if (m >= 3 && !strcasecmp(vc[0], "etc") && !strcasecmp(vc[1], "conda") &&
            (!strcasecmp(vc[2], "activate.d") || !strcasecmp(vc[2], "deactivate.d"))) {
          return EACCES;
        }
      }
    }
  }
  if (n > 0 && py_startup_refused) {
    char last[NAME_MAX + 1];
    snprintf(last, sizeof(last), "%s", comps[n - 1]);
    strip_trailing(last);
    if (!strcasecmp(last, "sitecustomize.py") || !strcasecmp(last, "usercustomize.py")) {
      return EACCES;
    }
    size_t ll = strlen(last);
    if (ll > 4 && !strcasecmp(last + ll - 4, ".pth")) {
      for (int i = 0; i < n - 1; i++) {
        char d[NAME_MAX + 1];
        snprintf(d, sizeof(d), "%s", comps[i]);
        strip_trailing(d);
        if (!strcasecmp(d, "site-packages") || !strcasecmp(d, "dist-packages")) {
          return EACCES;
        }
      }
    }
  }
  for (int i = 0; i < n; i++) {
    if (in_list(exempts, nexempts, comps[i])) {
      return 0; // a dependency tree (node_modules, a virtualenv): nobody reads it as config
    }
  }
  // Each name as a Windows file system names it (WSL's /mnt/c, SMB, vfat,
  // exFAT, NTFS drop trailing dots and spaces: ".github." is ".github");
  // elsewhere such a name is only an odd name. A name of dots and spaces
  // only (not . or ..) is refused. Exemptions above match only as written.
  for (int i = 0; i < n; i++) {
    strip_trailing(comps[i]);
    if (comps[i][0] == 0) {
      return EACCES;
    }
  }
  for (int i = 0; i < n; i++) {
    const char *c = comps[i];
    int last = i == n - 1;
    // A name with a colon is matched as what comes before it too (an
    // alternate data stream's form, "name:stream").
    char stem[NAME_MAX + 1];
    const char *colon = strchr(c, ':');
    int has_stem = 0;
    if (colon) {
      snprintf(stem, sizeof(stem), "%.*s", (int)(colon - c), c);
      strip_trailing(stem);
      if (stem[0] == 0) {
        return EACCES;
      }
      has_stem = 1;
    }
    if (in_list(dirnames, ndirs, c) || (has_stem && in_list(dirnames, ndirs, stem))) {
      return EACCES; // an agent/editor config directory, or anything inside one
    }
    if (last && (protected_file_name(c) || (has_stem && protected_file_name(stem)))) {
      return EACCES;
    }
    if (i > 0 && (is_pair(comps[i - 1], c) || (has_stem && is_pair(comps[i - 1], stem)))) {
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
// The caller's memory, read with process_vm_readv: it needs only
// CAP_SYS_PTRACE over the caller's user namespace, so it also reads a caller
// that is not dumpable (a wrapper, a program started from an execute-only
// copy), whose /proc/<pid>/mem belongs to a root this namespace does not map.
static int read_string(pid_t pid, uint64_t addr, char *out, size_t size) {
  size_t got = 0;
  while (got < size) {
    size_t page = 4096 - ((addr + got) & 4095);
    size_t want = page < size - got ? page : size - got;
    struct iovec local = {.iov_base = out + got, .iov_len = want};
    struct iovec remote = {.iov_base = (void *)(uintptr_t)(addr + got), .iov_len = want};
    ssize_t n = process_vm_readv(pid, &local, 1, &remote, 1, 0);
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
/** A copy of the caller's descriptor `n`, or -errno. */
static int caller_fd(pid_t pid, int n) {
  int pfd = (int)syscall(SYS_pidfd_open, pid, 0);
  if (pfd < 0) {
    return -errno;
  }
  int fd = (int)syscall(SYS_pidfd_getfd, pfd, n, 0);
  int e = errno;
  close(pfd);
  if (fd < 0) {
    return -e;
  }
  fcntl(fd, F_SETFD, FD_CLOEXEC);
  return fd;
}

/** The thread group of task `tid` (what its /proc/self names), or `tid` itself. */
static pid_t tgid_of(pid_t tid) {
  char p[64];
  snprintf(p, sizeof(p), "%d/status", (int)tid);
  int fd = openat(procfd, p, O_RDONLY | O_CLOEXEC);
  if (fd < 0) {
    return tid;
  }
  char buf[2048];
  ssize_t n = read(fd, buf, sizeof(buf) - 1);
  close(fd);
  if (n <= 0) {
    return tid;
  }
  buf[n] = 0;
  const char *t = strstr(buf, "\nTgid:");
  return t ? (pid_t)atoi(t + 6) : tid;
}

/** The innermost (the caller's namespace) id of task `tid`, from its NSpid line, or -1. */
static long inner_id(pid_t tid) {
  char p[64];
  snprintf(p, sizeof(p), "%d/status", (int)tid);
  int fd = openat(procfd, p, O_RDONLY | O_CLOEXEC);
  if (fd < 0) {
    return -1;
  }
  char buf[4096];
  ssize_t n = read(fd, buf, sizeof(buf) - 1);
  close(fd);
  if (n <= 0) {
    return -1;
  }
  buf[n] = 0;
  const char *t = strstr(buf, "\nNSpid:");
  if (!t) {
    return -1;
  }
  t += 7;
  const char *end = strchr(t, '\n');
  long last = -1;
  while (*t && (!end || t < end)) {
    while (*t == ' ' || *t == '\t') {
      t++;
    }
    if (*t < '0' || *t > '9') {
      break;
    }
    last = strtol(t, (char **)&t, 10);
  }
  return last;
}

/** A plain decimal id ("38"), or -1. */
static long plain_id(const char *s, size_t n) {
  if (n == 0 || n > 9) {
    return -1;
  }
  long v = 0;
  for (size_t i = 0; i < n; i++) {
    if (s[i] < '0' || s[i] > '9') {
      return -1;
    }
    v = v * 10 + (s[i] - '0');
  }
  return v;
}

/**
 * A contained build (commwrite) writes the name of one of its own threads:
 * libraries name helper threads through /proc/self/task/<tid>/comm (the WSL
 * CUDA driver stops when it cannot). Every procfs object is otherwise refused
 * for writing (pseudo_fs). Only the comm file of a task of the CALLER'S OWN
 * thread group, named /proc/self/comm, /proc/thread-self/comm,
 * /proc/self/task/<tid>/comm or /proc/<its pid>/[task/<tid>/]comm (ids as the
 * caller sees them, translated to ours), is opened, from our procfs, write
 * only: a comm file holds a 16-byte name and nothing else. Returns the
 * descriptor, or -ENOENT for any other path (the ordinary checks then apply).
 */
static int comm_open(pid_t pid, int dirarg, const char *path, int flags) {
  if (!commwrite || strncmp(path, "/proc/", 6) != 0 || (dirarg != AT_FDCWD && path[0] != '/')) {
    return -ENOENT;
  }
  int acc = flags & O_ACCMODE;
  if ((acc != O_WRONLY && acc != O_RDWR) ||
      (flags & ~(O_ACCMODE | O_CREAT | O_TRUNC | O_CLOEXEC | O_NOFOLLOW | O_LARGEFILE | O_NOCTTY))) {
    return -ENOENT;
  }
  pid_t tg = tgid_of(pid);
  pid_t task = -1;
  const char *rest = path + 6;
  const char *slash = strchr(rest, '/');
  if (!slash) {
    return -ENOENT;
  }
  size_t head = (size_t)(slash - rest);
  const char *after = slash + 1;
  if (head == 11 && !strncmp(rest, "thread-self", 11)) {
    if (strcmp(after, "comm") != 0) {
      return -ENOENT;
    }
    task = pid;
  } else {
    long want = -1;
    if (!(head == 4 && !strncmp(rest, "self", 4))) {
      want = plain_id(rest, head);
      if (want < 0 || inner_id(tg) != want) {
        return -ENOENT; // not the caller's own process
      }
    }
    if (!strcmp(after, "comm")) {
      task = tg;
    } else if (!strncmp(after, "task/", 5)) {
      const char *tid_s = after + 5;
      const char *e = strchr(tid_s, '/');
      if (!e || strcmp(e + 1, "comm") != 0) {
        return -ENOENT;
      }
      long vtid = plain_id(tid_s, (size_t)(e - tid_s));
      if (vtid < 0) {
        return -ENOENT;
      }
      char dir[64];
      snprintf(dir, sizeof(dir), "%d/task", (int)tg);
      int dfd = openat(procfd, dir, O_RDONLY | O_DIRECTORY | O_CLOEXEC);
      if (dfd < 0) {
        return -ENOENT;
      }
      DIR *d = fdopendir(dfd);
      if (!d) {
        close(dfd);
        return -ENOENT;
      }
      struct dirent *de;
      while ((de = readdir(d))) {
        long t = plain_id(de->d_name, strlen(de->d_name));
        if (t > 0 && inner_id((pid_t)t) == vtid && tgid_of((pid_t)t) == tg) {
          task = (pid_t)t;
          break;
        }
      }
      closedir(d);
    } else {
      return -ENOENT;
    }
  }
  if (task <= 0 || tgid_of(task) != tg) {
    return -ENOENT;
  }
  char p[96];
  snprintf(p, sizeof(p), "%d/task/%d/comm", (int)tg, (int)task);
  int fd = openat(procfd, p, (acc == O_RDWR ? O_RDWR : O_WRONLY) | O_CLOEXEC);
  return fd < 0 ? -errno : fd;
}

/** Whether `rest` (after a mapped prefix) holds a `..` component. */
static int has_dotdot(const char *rest) {
  for (const char *p = rest; *p;) {
    const char *e = strchr(p, '/');
    size_t n = e ? (size_t)(e - p) : strlen(p);
    if (n == 2 && p[0] == '.' && p[1] == '.') {
      return 1;
    }
    if (!e) {
      break;
    }
    p = e + 1;
  }
  return 0;
}

static int base_and_path(pid_t pid, int dirarg, const char *in, char *path, size_t size,
                         int caller_names) {
  // /proc/self names the caller's thread group, /proc/thread-self the task
  // itself (req->pid is the task); its descriptors are the group's.
  pid_t tgid = caller_names ? tgid_of(pid) : pid;
  struct {
    const char *prefix;
    const char *to;
  } map[] = {{"/proc/self/", "%d/"},     {"/proc/thread-self/", "%d/task/%d/"},
             {"/dev/fd/", "%d/fd/"},     {"/dev/stdin", "%d/fd/0"},
             {"/dev/stdout", "%d/fd/1"}, {"/dev/stderr", "%d/fd/2"}};
  // Only the caller's own literal path: a symbolic link target this supervisor
  // follows by hand resolves in the sandbox's view (where its /proc is the
  // sandbox's read-only procfs and does not know this process).
  for (size_t i = 0; caller_names && i < sizeof(map) / sizeof(map[0]); i++) {
    size_t n = strlen(map[i].prefix);
    if (!strncmp(in, map[i].prefix, n) &&
        (map[i].prefix[n - 1] == '/' || in[n] == 0 || in[n] == '/')) {
      // The caller's text is never spliced after the mapped prefix with a `..`
      // in it: in our procfs, `..` from the caller's entry leads to ours.
      if (has_dotdot(in + n)) {
        return -EACCES;
      }
      char head[64];
      snprintf(head, sizeof(head), map[i].to, (int)tgid, (int)pid);
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
    int fd = openat(procfd, link, O_PATH | O_CLOEXEC);
    return fd < 0 ? -errno : fd;
  }
  // The caller's descriptor itself (pidfd_getfd needs ptrace rights only, so it
  // also reaches a caller that is not dumpable, whose /proc/<pid>/fd is closed).
  return caller_fd(pid, dirarg);
}

/**
 * Split into parent directory (opened) and last component; the last component
 * is not followed. `caller_names`: the path is the caller's own (its /proc/self,
 * /dev/fd, ... map to its entries in our procfs), not a link target.
 */
static int split_names(pid_t pid, int dirarg, const char *in, Split *s, int caller_names) {
  char path[PATH_MAX];
  int base = base_and_path(pid, dirarg, in, path, sizeof(path), caller_names);
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

static int split(pid_t pid, int dirarg, const char *in, Split *s) {
  return split_names(pid, dirarg, in, s, 1);
}

/**
 * Pseudo filesystems (procfs, sysfs, debugfs, ...) hold process and kernel
 * state, not files a contained run writes: an object on one is never handed
 * back for writing (/proc/<pid>/mem writes through the caller's code pages).
 */
static int pseudo_fs(int fd) {
  struct statfs sf;
  if (fstatfs(fd, &sf) != 0) {
    return 1;
  }
  switch ((unsigned long)sf.f_type) {
  case PROC_SUPER_MAGIC:
  case SYSFS_MAGIC:
  case DEBUGFS_MAGIC:
  case TRACEFS_MAGIC:
  case SECURITYFS_MAGIC:
  case CGROUP_SUPER_MAGIC:
  case CGROUP2_SUPER_MAGIC:
  case BPF_FS_MAGIC:
  case PSTOREFS_MAGIC:
  case EFIVARFS_MAGIC:
  case BINFMTFS_MAGIC:
    return 1;
  default:
    return 0;
  }
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
// Files the run itself gave another name (link, performed here): writing one
// changes only names the run made. Any other file with more than one name may
// share its inode with a place the run may not write.
#define MAX_RUN_LINKS 4096
static struct {
  dev_t dev;
  ino_t ino;
} run_links[MAX_RUN_LINKS];
static int nrun_links;

static void note_run_link(const struct stat *st) {
  run_links[nrun_links % MAX_RUN_LINKS].dev = st->st_dev;
  run_links[nrun_links % MAX_RUN_LINKS].ino = st->st_ino;
  nrun_links++;
}

static int run_linked(const struct stat *st) {
  int n = nrun_links < MAX_RUN_LINKS ? nrun_links : MAX_RUN_LINKS;
  for (int i = 0; i < n; i++) {
    if (run_links[i].dev == st->st_dev && run_links[i].ino == st->st_ino) {
      return 1;
    }
  }
  return 0;
}

// Inodes known at the start of the run (recorded before the caller runs):
// PROTECTED, a file under a read-only bind inside a read-write root (.git's
// hooks, config and info, an exec-config placeholder) or a file whose own name
// is protected; MULTI, a file that already had more than one name. Neither is
// written through another name, nor given a new name, whatever its link count
// becomes during the run (the other names can be removed, and a descriptor
// link can name the inode again).
enum { INO_PROTECTED = 1, INO_MULTI = 2, INO_CREATED = 4, INO_MODE_OK = 8, INO_EXEC_PIN = 16 };
#define MAX_WALK 500000
static struct ino_ent {
  dev_t dev;
  ino_t ino;
  unsigned char kind;
} *iset;
static size_t icap, icount, iwalked;

static size_t ino_slot(struct ino_ent *t, size_t cap, dev_t d, ino_t i) {
  size_t h = ((size_t)i * 0x9E3779B97F4A7C15ull) ^ (size_t)d;
  for (h &= cap - 1;; h = (h + 1) & (cap - 1)) {
    if (!t[h].kind || (t[h].dev == d && t[h].ino == i)) {
      return h;
    }
  }
}

static int under_root(const char *full);

static void iset_add(const struct stat *st, unsigned char kind) {
  if ((icount + 1) * 2 > icap) {
    size_t ncap = icap ? icap * 2 : 1024;
    struct ino_ent *n = calloc(ncap, sizeof(*n));
    if (!n) {
      die("record the project's inodes");
    }
    for (size_t k = 0; k < icap; k++) {
      if (iset[k].kind) {
        n[ino_slot(n, ncap, iset[k].dev, iset[k].ino)] = iset[k];
      }
    }
    free(iset);
    iset = n;
    icap = ncap;
  }
  size_t h = ino_slot(iset, icap, st->st_dev, st->st_ino);
  if (!iset[h].kind) {
    iset[h].dev = st->st_dev;
    iset[h].ino = st->st_ino;
    icount++;
  }
  iset[h].kind |= kind;
}

static int iset_kind(const struct stat *st) {
  if (!icap) {
    return 0;
  }
  struct ino_ent e = iset[ino_slot(iset, icap, st->st_dev, st->st_ino)];
  return e.kind;
}

static void add_gitdir(const char *d) {
  for (int i = 0; i < ngitdirs; i++) {
    if (!strcmp(gitdirs[i], d)) {
      return;
    }
  }
  if (ngitdirs < MAXGITDIRS) {
    gitdirs[ngitdirs++] = strdup(d);
  }
}

static int has_file(int dfd, const char *name) {
  struct stat st;
  return fstatat(dfd, name, &st, AT_SYMLINK_NOFOLLOW) == 0 && S_ISREG(st.st_mode);
}

static int is_hex2(const char *n) {
  return strlen(n) == 2 && isxdigit((unsigned char)n[0]) && isxdigit((unsigned char)n[1]);
}

/**
 * Every git directory below `dir` (a repository's modules/): each directory
 * holding a HEAD and a config file, whatever its name says (a submodule's name
 * may hold slashes and any word: a/objects/b is a git directory as a/b is).
 * Inside a git directory's objects, git's own fan-out and pack directories are
 * passed over; any other directory there is looked into.
 */
static void enum_modules(const char *dir, int depth, int *budget) {
  if (depth > 32 || --*budget < 0) {
    return;
  }
  int dfd = open(dir, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (dfd < 0) {
    return;
  }
  int is_gitdir = has_file(dfd, "HEAD") && has_file(dfd, "config");
  if (is_gitdir) {
    add_gitdir(dir);
  }
  DIR *d = fdopendir(dfd);
  if (!d) {
    close(dfd);
    return;
  }
  const char *base = strrchr(dir, '/');
  base = base ? base + 1 : dir;
  int in_objects = !strcmp(base, "objects");
  for (struct dirent *e; (e = readdir(d)) != NULL;) {
    if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) {
      continue;
    }
    if (in_objects && (is_hex2(e->d_name) || !strcmp(e->d_name, "pack") || !strcmp(e->d_name, "info"))) {
      continue;
    }
    struct stat st;
    if (fstatat(dirfd(d), e->d_name, &st, AT_SYMLINK_NOFOLLOW) != 0 || !S_ISDIR(st.st_mode)) {
      continue;
    }
    char sub[PATH_MAX];
    int n = snprintf(sub, sizeof(sub), "%s/%s", dir, e->d_name);
    if (n > 0 && (size_t)n < sizeof(sub)) {
      enum_modules(sub, depth + 1, budget);
    }
  }
  closedir(d);
}

/** A repository's git directory `gd`: it, its submodules' and its worktrees'. */
static void note_repo(const char *gd) {
  add_gitdir(gd);
  char p[PATH_MAX];
  int budget = 200000;
  snprintf(p, sizeof(p), "%s/modules", gd);
  enum_modules(p, 0, &budget);
  snprintf(p, sizeof(p), "%s/worktrees", gd);
  DIR *d = opendir(p);
  if (d) {
    for (struct dirent *e; (e = readdir(d)) != NULL;) {
      if (e->d_name[0] != '.') {
        char w[PATH_MAX];
        int n = snprintf(w, sizeof(w), "%s/%s", p, e->d_name);
        if (n > 0 && (size_t)n < sizeof(w)) {
          add_gitdir(w);
        }
      }
    }
    closedir(d);
  }
}

/**
 * A .git file ("gitdir: <path>"): the git directory it names, when that lies
 * in a read-write root outside every .git directory, is a git directory too.
 */
static void note_gitfile(int dfd, const char *dir) {
  int fd = openat(dfd, ".git", O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) {
    return;
  }
  char buf[PATH_MAX + 16];
  ssize_t n = read(fd, buf, sizeof(buf) - 1);
  close(fd);
  if (n <= 8 || strncmp(buf, "gitdir:", 7) != 0) {
    return;
  }
  buf[n] = 0;
  char *t = buf + 7;
  t += strspn(t, " \t");
  t[strcspn(t, "\r\n")] = 0;
  char where[PATH_MAX * 2], real[PATH_MAX];
  snprintf(where, sizeof(where), t[0] == '/' ? "%s" : "%s/%s", t[0] == '/' ? t : dir, t);
  if (!realpath(where, real) || !under_root(real) || strstr(real, "/.git/")) {
    return;
  }
  note_repo(real);
}

/** Record the files below the directory `dfd` (named `dir` in the view). */
static void walk_record(int dfd, const char *dir, int all_protected, int depth) {
  DIR *d = fdopendir(dfd);
  if (!d) {
    close(dfd);
    return;
  }
  const char *base = strrchr(dir, '/');
  base = base ? base + 1 : dir;
  for (struct dirent *e; (e = readdir(d)) != NULL;) {
    if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) {
      continue;
    }
    if (++iwalked > MAX_WALK) {
      break;
    }
    char full[PATH_MAX];
    int n = snprintf(full, sizeof(full), "%s%s%s", dir, strcmp(dir, "/") ? "/" : "", e->d_name);
    if (n < 0 || (size_t)n >= sizeof(full)) {
      continue;
    }
    struct stat st;
    if (fstatat(dirfd(d), e->d_name, &st, AT_SYMLINK_NOFOLLOW) != 0) {
      continue;
    }
    if (S_ISREG(st.st_mode) && !strcmp(e->d_name, ".git")) {
      note_gitfile(dirfd(d), dir);
    }
    if (S_ISDIR(st.st_mode) && !strcmp(e->d_name, ".git") && !strstr(full, "/.git/")) {
      note_repo(full); // a nested repository
    }
    if (S_ISREG(st.st_mode)) {
      if (all_protected || deny_path(full)) {
        iset_add(&st, INO_PROTECTED);
      }
      if (st.st_nlink > 1) {
        iset_add(&st, INO_MULTI);
      }
    } else if (S_ISDIR(st.st_mode) && depth < 64) {
      {
        int vd = openat(dirfd(d), e->d_name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
        if (vd >= 0) {
          struct stat cs;
          if (!strcmp(e->d_name, "vendor") && has_file(vd, "autoload.php") && ncomposer_vendors < MAXLIST) {
            composer_vendors[ncomposer_vendors++] = strdup(full);
          }
          if (has_file(vd, "pyvenv.cfg") ||
              (fstatat(vd, "conda-meta", &cs, AT_SYMLINK_NOFOLLOW) == 0 && S_ISDIR(cs.st_mode))) {
            if (nvenvs < MAXVENVS) {
              venvs[nvenvs++] = strdup(full);
            } else {
              venvs_overflow = 1;
            }
          }
          close(vd);
        }
      }
      // A dependency tree is nobody's config; git's object store is large and
      // holds no file the run may write through.
      if (in_list(exempts, nexempts, e->d_name) || (!strcmp(base, ".git") && !strcmp(e->d_name, "objects"))) {
        continue;
      }
      int sub = openat(dirfd(d), e->d_name, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
      if (sub >= 0) {
        walk_record(sub, full, all_protected, depth + 1);
      }
    }
  }
  closedir(d);
}

/** Undo mountinfo's octal escapes (\040 for a space) in place. */
static void mi_unescape(char *s) {
  char *o = s;
  for (; *s; s++) {
    if (s[0] == '\\' && s[1] >= '0' && s[1] <= '3' && s[2] >= '0' && s[2] <= '7' && s[3] >= '0' && s[3] <= '7') {
      *o++ = (char)((s[1] - '0') * 64 + (s[2] - '0') * 8 + (s[3] - '0'));
      s += 3;
    } else {
      *o++ = *s;
    }
  }
  *o = 0;
}

static void record_project_inodes(void) {
  // Each root's repository first (the walk below decides names with them).
  for (int i = 0; i < nroots; i++) {
    char gd[PATH_MAX];
    struct stat st;
    snprintf(gd, sizeof(gd), "%s/.git", roots[i]);
    if (lstat(gd, &st) == 0 && S_ISDIR(st.st_mode)) {
      note_repo(gd);
    }
  }
  // The files whose mode the line itself changes (chmod of a file this
  // session wrote), as Enclawed read the line: by inode, at the start.
  for (int i = 0; i < nmodeoks; i++) {
    struct stat st;
    if (stat(modeoks[i], &st) == 0 && S_ISREG(st.st_mode)) {
      iset_add(&st, INO_MODE_OK);
    }
  }
  for (int i = 0; i < nexecpins; i++) {
    struct stat st;
    if (stat(execpins[i], &st) != 0 || !S_ISREG(st.st_mode)) {
      die("find a file the line runs");
    }
    iset_add(&st, INO_EXEC_PIN);
  }
  // Read-only binds inside the read-write roots: every file below one.
  FILE *f = fopen("/proc/self/mountinfo", "r");
  if (f) {
    char line[PATH_MAX * 2];
    while (fgets(line, sizeof(line), f)) {
      char *save = NULL, *fld[6];
      int k = 0;
      for (char *t = strtok_r(line, " ", &save); t && k < 6; t = strtok_r(NULL, " ", &save)) {
        fld[k++] = t;
      }
      if (k < 6) {
        continue;
      }
      int ro = 0;
      for (char *s2 = NULL, *o = strtok_r(fld[5], ",", &s2); o; o = strtok_r(NULL, ",", &s2)) {
        ro |= !strcmp(o, "ro");
      }
      char *mp = fld[4];
      mi_unescape(mp);
      if (!ro || !under_root(mp)) {
        continue;
      }
      struct stat st;
      if (stat(mp, &st) != 0) {
        continue;
      }
      if (S_ISREG(st.st_mode)) {
        iset_add(&st, INO_PROTECTED);
      } else if (S_ISDIR(st.st_mode)) {
        int dfd = open(mp, O_RDONLY | O_DIRECTORY | O_CLOEXEC);
        if (dfd >= 0) {
          walk_record(dfd, mp, 1, 0);
        }
      }
    }
    fclose(f);
  }
  // Each root: the files whose own name is protected, and those with more
  // than one name.
  for (int i = 0; i < nroots; i++) {
    int dfd = open(roots[i], O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (dfd >= 0) {
      walk_record(dfd, roots[i], 0, 0);
    }
  }
}

/**
 * Was `last` in `dfd` reached through a descriptor link (/proc/<pid>/fd/N,
 * /dev/fd/N, /proc/<pid>/cwd or root at the end)? Such a name reaches an
 * inode the caller holds open, whether or not any name still leads to it.
 */
static int through_magic(int dfd, const char *last, int nofollow) {
  struct open_how how = {.flags = O_PATH | O_CLOEXEC | (nofollow ? O_NOFOLLOW : 0),
                         .resolve = RESOLVE_NO_MAGICLINKS};
  int fd = (int)syscall(SYS_openat2, dfd, last, &how, sizeof(how));
  if (fd >= 0) {
    close(fd);
    return 0;
  }
  return errno == ELOOP;
}

/** What a new file or directory never gets in a read-write root: group or other write, set-ID, sticky. */
static mode_t new_mode_mask(const char *full) {
  return under_root(full) ? (mode_t)~(07000 | 0022) : (mode_t)~07000;
}

static int do_open(pid_t pid, int dirarg, const char *path, int flags, mode_t mode) {
#ifdef O_TMPFILE
  // An unnamed file in a directory (O_TMPFILE, Python's tempfile.TemporaryFile):
  // not offered; the caller falls back to a named temporary file, created and
  // checked like any other.
  if ((flags & O_TMPFILE) == O_TMPFILE) {
    return -EOPNOTSUPP;
  }
#endif
  int c = comm_open(pid, dirarg, path, flags);
  if (c != -ENOENT) {
    return c;
  }
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
      r = split_names(pid, AT_FDCWD, where, &s, 0);
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
    // Created here (O_EXCL): a name that came to exist meanwhile is opened
    // as an existing file, with every check of a write open.
    fd = openat(s.dfd, s.last, (flags & ~O_CLOEXEC) | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
                mode & ~caller_umask(pid) & new_mode_mask(full));
    if (fd < 0 && errno == EEXIST && !(flags & O_EXCL)) {
      close(s.dfd);
      return do_open(pid, dirarg, path, flags & ~O_CREAT, mode);
    }
    r = fd < 0 ? -errno : fd;
    struct stat cst;
    if (fd >= 0 && fstat(fd, &cst) == 0) {
      iset_add(&cst, INO_CREATED);
    }

    close(s.dfd);
    if (fd >= 0 && pseudo_fs(fd)) {
      close(fd);
      r = -EROFS;
    }
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
    // A procfs file is never opened for writing on the caller's behalf: the
    // caller's own /proc/self, /proc/thread-self and /dev/fd names resolve in OUR
    // procfs (writable), where /proc/<pid>/mem writes through the caller's code
    // pages. The sandbox's own /proc is read-only for the same reason.
    if (r == 0 && pseudo_fs(pfd)) {
      r = -EROFS;
    }
    // A file with more than one name is not written through any of them: the
    // others (a hook of a read-only .git, say) would change with it.
    struct stat lst;
    if (r == 0 && fstat(pfd, &lst) == 0 && S_ISREG(lst.st_mode) && lst.st_nlink > 1 &&
        !run_linked(&lst)) {
      r = -EPERM;
    }
    // A file known at the start (a protected one, or one with other names) is
    // written only through its own protected name, under the checks above,
    // however many names it has now.
    if (r == 0 && S_ISREG(lst.st_mode)) {
      int kind = iset_kind(&lst);
      if ((kind & (INO_MULTI | INO_EXEC_PIN)) || ((kind & INO_PROTECTED) && !deny_path(full))) {
        r = -EPERM;
      }
    }
    // A descriptor link (/proc/<pid>/fd/N, /dev/fd/N) to a regular file is
    // written only when it names a file a name still leads to (then checked as
    // that name, above): never a file whose name the run removed.
    if (r == 0 && S_ISREG(lst.st_mode) && through_magic(s.dfd, s.last, flags & O_NOFOLLOW)) {
      struct stat now;
      if (ends_with(full, " (deleted)") || stat(full, &now) != 0 || now.st_dev != lst.st_dev ||
          now.st_ino != lst.st_ino) {
        r = -EPERM;
      }
    }
    if (r == 0) {
      char link[64];
      snprintf(link, sizeof(link), "%d/fd/%d", (int)mypid, pfd);
      fd = openat(procfd, link, (flags & ~(O_NOFOLLOW | O_CLOEXEC)) | O_CLOEXEC);
      r = fd < 0 ? -errno : fd;
      // What was opened is checked again (the object behind the link reopened).
      if (fd >= 0 && pseudo_fs(fd)) {
        close(fd);
        r = -EROFS;
      }
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
  } else if (mkdirat(s.dfd, s.last, mode & ~caller_umask(pid) & new_mode_mask(full)) != 0) {
    r = -errno;
  } else {
    int fd = openat(s.dfd, s.last, O_PATH | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    struct stat cst;
    if (fd >= 0 && fstat(fd, &cst) == 0) {
      iset_add(&cst, INO_CREATED);
    }
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
  } else if (mknodat(s.dfd, s.last, (mode & S_IFMT) | (mode & ~S_IFMT & ~caller_umask(pid) & new_mode_mask(full)), dev) != 0) {
    r = -errno;
  } else {
    int fd = openat(s.dfd, s.last, O_PATH | O_NOFOLLOW | O_CLOEXEC);
    struct stat cst;
    if (fd >= 0 && fstat(fd, &cst) == 0) {
      iset_add(&cst, INO_CREATED);
    }
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
  // The file the new name is given to: a file with one name (then only the run
  // names it twice) or one the run already linked; never one that had other
  // names before the run (those may share an inode with a read-only place).
  // A new name ".github" (or any protected parent) for an existing file or
  // directory could carry a "workflows" made beforehand under another name.
  if (!deny && is_pair_parent(b.last)) {
    deny = EACCES;
  }
  // A new name is given only to a file a name leads to: never through a
  // descriptor link (/proc/<pid>/fd/N, /dev/fd/N, or a link that leads to one),
  // which names a file the caller holds open even after its last name is gone.
  if (!deny && ((flags & AT_EMPTY_PATH) || pseudo_fs(a.dfd) ||
                ((flags & AT_SYMLINK_FOLLOW) && through_magic(a.dfd, a.last, 0)))) {
    deny = EPERM;
  }
  struct stat src;
  int found = fstatat(a.dfd, a.last, &src, (flags & AT_SYMLINK_FOLLOW) ? 0 : AT_SYMLINK_NOFOLLOW) == 0;
  // Nor to a file known at the start as protected (a hook of the read-only
  // .git, an exec-config file).
  if (!deny && found && S_ISREG(src.st_mode) && (iset_kind(&src) & INO_PROTECTED)) {
    deny = EPERM;
  }
  // Run-made: a file with one name at the start, never one that had others.
  int had_one = found && S_ISREG(src.st_mode) && !(iset_kind(&src) & (INO_PROTECTED | INO_MULTI)) &&
                (src.st_nlink == 1 || run_linked(&src));
  if (deny) {
    r = -deny;
  } else if (linkat(a.dfd, a.last, b.dfd, b.last, flags & AT_SYMLINK_FOLLOW) != 0) {
    r = -errno;
  } else if (had_one) {
    note_run_link(&src);
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
  // A link named ".github" (any protected parent), or one whose target names a
  // protected name (q -> .github): writes through it under an unprotected name
  // would land in what configures what runs later.
  if (!deny && is_pair_parent(b.last)) {
    deny = EACCES;
  }
  if (!deny) {
    char t[PATH_MAX];
    snprintf(t, sizeof(t), "%s", target);
    for (char *save = NULL, *c = strtok_r(t, "/", &save); c; c = strtok_r(NULL, "/", &save)) {
      strip_trailing(c);
      if (is_pair_parent(c) || in_list(dirnames, ndirs, c) || protected_file_name(c)) {
        deny = EACCES;
        break;
      }
    }
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

/** `len` bytes of the caller's memory at `addr`, or -EFAULT. */
static int read_mem(pid_t pid, uint64_t addr, void *out, size_t len) {
  struct iovec local = {.iov_base = out, .iov_len = len};
  struct iovec remote = {.iov_base = (void *)(uintptr_t)addr, .iov_len = len};
  return process_vm_readv(pid, &local, 1, &remote, 1, 0) == (ssize_t)len ? 0 : -EFAULT;
}

/**
 * The object a mode or time change names, opened O_PATH: through the
 * caller's descriptor (`path` NULL, or "" with AT_EMPTY_PATH) or by name,
 * the final link followed unless AT_SYMLINK_NOFOLLOW. Its view path in
 * `full`. Returns the descriptor or -errno.
 */
static int change_target(pid_t pid, int dirarg, const char *path, int flags, char *full, size_t size,
                         Split *keep, int *have_split) {
  *have_split = 0;
  int fd;
  if (!path || (!path[0] && (flags & AT_EMPTY_PATH))) {
    fd = caller_fd(pid, dirarg);
    if (fd < 0) {
      return fd;
    }
  } else {
    if (!path[0]) {
      return -ENOENT;
    }
    int r = split(pid, dirarg, path, keep);
    if (r < 0) {
      return r;
    }
    fd = openat(keep->dfd, keep->last, O_PATH | O_CLOEXEC | ((flags & AT_SYMLINK_NOFOLLOW) ? O_NOFOLLOW : 0));
    if (fd < 0) {
      r = -errno;
      close(keep->dfd);
      return r;
    }
    *have_split = 1;
  }
  int r = fd_path(fd, full, size);
  if (r != 0) {
    close(fd);
    if (*have_split) {
      close(keep->dfd);
    }
    return r;
  }
  return fd;
}

// A file's mode or times are never changed on a protected file (a name the
// writes refuse, or a file known at the start as protected), nor through a
// procfs object.
static int change_refused(pid_t pid, int fd, const char *full, const struct stat *st) {
  if (pseudo_fs(fd)) {
    return EROFS;
  }
  // The name as a write of it is decided (deny_for: git saving its config
  // through config.lock keeps the lock's mode); the inode by what it was at the start.
  int deny = deny_for(pid, full);
  if (deny) {
    return deny == EACCES ? EPERM : deny;
  }
  if ((iset_kind(st) & INO_PROTECTED) && deny_path(full) == 0) {
    return EPERM;
  }
  return 0;
}

/**
 * chmod, fchmod, fchmodat, fchmodat2. Never: on a protected file; adding
 * set-user/group-ID, sticky, group or other write anywhere; changing the mode
 * of a file in a read-write root that existed before the run (history keeps
 * contents, not modes, so the change could not be undone) unless it is in a
 * dependency tree (regenerated from its lockfile). A run's own new files, and
 * the private /tmp and home, take any other mode.
 */
static long do_chmod(pid_t pid, int dirarg, const char *path, mode_t mode, int flags) {
  if (flags & ~(AT_SYMLINK_NOFOLLOW | AT_EMPTY_PATH)) {
    return -EINVAL;
  }
  char full[PATH_MAX];
  Split s;
  int have_split;
  int fd = change_target(pid, dirarg, path, flags, full, sizeof(full), &s, &have_split);
  if (fd < 0) {
    return fd;
  }
  if (have_split) {
    close(s.dfd);
  }
  struct stat st;
  long r = 0;
  if (fstat(fd, &st) != 0) {
    r = -errno;
  } else if (S_ISLNK(st.st_mode)) {
    r = -EOPNOTSUPP; // a link's own mode: Linux has none
  } else if ((r = -change_refused(pid, fd, full, &st)) != 0) {
  } else if ((mode & 07777 & ~st.st_mode) & (07000 | 0022)) {
    r = -EPERM;
  } else if ((mode & 07777) != (st.st_mode & 07777) && under_root(full) &&
             !(iset_kind(&st) & (INO_CREATED | INO_MODE_OK)) && !under_exempt(full)) {
    r = -EPERM;
  } else {
    char link[64];
    snprintf(link, sizeof(link), "%d/fd/%d", (int)mypid, fd);
    r = fchmodat(procfd, link, mode & 07777, 0) == 0 ? 0 : -errno;
  }
  close(fd);
  return r;
}

/**
 * utimensat (and utime, utimes, futimesat, converted): never on a protected
 * file. `ts` is NULL (now) or two timespecs, already in this process.
 */
static long do_utimes(pid_t pid, int dirarg, const char *path, const struct timespec *ts, int flags) {
  if (flags & ~(AT_SYMLINK_NOFOLLOW | AT_EMPTY_PATH)) {
    return -EINVAL;
  }
  char full[PATH_MAX];
  Split s;
  int have_split;
  int fd = change_target(pid, dirarg, path, flags, full, sizeof(full), &s, &have_split);
  if (fd < 0) {
    return fd;
  }
  struct stat st;
  long r = 0;
  if (fstat(fd, &st) != 0) {
    r = -errno;
  } else if (S_ISLNK(st.st_mode) && have_split) {
    // A link's own times: the name was checked, the link is what is changed.
    r = deny_path(full) ? -EPERM : (utimensat(s.dfd, s.last, ts, AT_SYMLINK_NOFOLLOW) == 0 ? 0 : -errno);
  } else if ((r = -change_refused(pid, fd, full, &st)) != 0) {
  } else {
    char link[64];
    snprintf(link, sizeof(link), "%d/fd/%d", (int)mypid, fd);
    r = utimensat(procfd, link, ts, 0) == 0 ? 0 : -errno;
  }
  if (have_split) {
    close(s.dfd);
  }
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

#define WRAP_EXEC_FD_PATH "/.enclawed/exec-fd"

static struct stat realst[MAXLIST];

/**
 * An exec's target, resolved as the caller would (its own /proc/self,
 * /dev/fd, cwd and descriptors mapped to its entries in our procfs): 0 when the
 * kernel may continue it, or the error to answer. A real program's copy starts
 * only in a wrapper (the caller's executable is this binary): anywhere else,
 * by any name (/proc/self/exe, a link to it, a descriptor of it), EPERM. A
 * target this resolution does not reach is answered with that error (a link
 * whose text names /proc/self resolves here in the sandbox's procfs, which
 * does not know this process: it fails rather than reaching the copy).
 */
static int caller_is_guard(pid_t pid) {
  char x[64];
  snprintf(x, sizeof(x), "%d/exe", (int)pid);
  struct stat me;
  return fstatat(procfd, x, &me, 0) == 0 && me.st_dev == selfst.st_dev && me.st_ino == selfst.st_ino;
}

/** The number of threads in task `pid`'s thread group (its status), or 0. */
static int writable_device(dev_t d);

static int threads_of(pid_t pid) {
  char p[64];
  snprintf(p, sizeof(p), "%d/status", (int)pid);
  int fd = openat(procfd, p, O_RDONLY | O_CLOEXEC);
  if (fd < 0) {
    return 0;
  }
  char buf[4096];
  ssize_t n = read(fd, buf, sizeof(buf) - 1);
  close(fd);
  if (n <= 0) {
    return 0;
  }
  buf[n] = 0;
  char *t = strstr(buf, "\nThreads:");
  return t ? atoi(t + 9) : 0;
}

/**
 * The kernel reads an exec's path again when the supervisor lets it continue;
 * another thread of the caller may change it in between. A caller with more
 * than one thread therefore starts only a program of the view's read-only
 * system part: a binary (no "#!" script, no wrapped interpreter, which is
 * this binary) on a read-only mount outside every read-write root. What a
 * changed path can still reach is what any exec reaches: the real programs'
 * copies are not in the view and are not readable through another process's
 * /proc entries (they are not dumpable).
 */
static int shared_exec_ok(int tfd, const struct stat *st) {
  if (!S_ISREG(st->st_mode) || (st->st_dev == selfst.st_dev && st->st_ino == selfst.st_ino) ||
      writable_device(st->st_dev)) {
    return 0;
  }
  struct statfs sf;
  char full[PATH_MAX];
  if (fstatfs(tfd, &sf) != 0 || !(sf.f_flags & ST_RDONLY) || fd_path(tfd, full, sizeof(full)) != 0 ||
      under_root(full)) {
    return 0;
  }
  char link[64];
  snprintf(link, sizeof(link), "%d/fd/%d", (int)mypid, tfd);
  int rfd = openat(procfd, link, O_RDONLY | O_CLOEXEC);
  if (rfd >= 0) {
    char head[2] = {0, 0};
    ssize_t n = read(rfd, head, 2);
    close(rfd);
    if (n == 2 && head[0] == '#' && head[1] == '!') {
      return 0;
    }
  }
  return 1;
}

static long exec_check(pid_t pid, int dirarg, const char *path, int flags) {
  struct stat st;
  int r;
  if (path[0] == 0) {
    if (!(flags & AT_EMPTY_PATH)) {
      return -ENOENT;
    }
    int fd = dirarg == AT_FDCWD ? -EBADF : caller_fd(pid, dirarg);
    if (fd < 0) {
      return fd;
    }
    r = fstat(fd, &st);
    int e = errno;
    if (r == 0 && !caller_is_guard(pid) &&
        (pseudo_fs(fd) || (threads_of(pid) > 1 && !shared_exec_ok(fd, &st)))) {
      r = -1;
      e = EPERM;
    }
    close(fd);
    if (r != 0) {
      return -e;
    }
  } else {
    Split s;
    r = split(pid, dirarg, path, &s);
    if (r < 0) {
      return r;
    }
    // No program starts from a name in procfs (/proc/<pid>/exe, /proc/self/fd/N,
    // /dev/fd/N): those are processes' own files and descriptors.
    struct statfs sf;
    if (fstatfs(s.dfd, &sf) != 0 || (unsigned long)sf.f_type == PROC_SUPER_MAGIC) {
      close(s.dfd);
      return caller_is_guard(pid) ? 0 : -EPERM;
    }
    // Nor through a descriptor link anywhere on the way (a link whose text is
    // /proc/<pid>/exe or /dev/fd/N), nor to an object procfs holds: decided
    // by how the name resolves, not by how it is spelled.
    int nofollow = (flags & AT_SYMLINK_NOFOLLOW) != 0;
    if (through_magic(s.dfd, s.last, nofollow)) {
      close(s.dfd);
      return caller_is_guard(pid) ? 0 : -EPERM;
    }
    int tfd = openat(s.dfd, s.last, O_PATH | O_CLOEXEC | (nofollow ? O_NOFOLLOW : 0));
    int e = errno;
    close(s.dfd);
    if (tfd < 0) {
      return -e;
    }
    r = fstat(tfd, &st);
    e = errno;
    if (r == 0 && pseudo_fs(tfd)) {
      close(tfd);
      return caller_is_guard(pid) ? 0 : -EPERM;
    }
    if (r == 0 && threads_of(pid) > 1 && !caller_is_guard(pid)) {
      r = shared_exec_ok(tfd, &st) ? 0 : (e = EPERM, -1);
    }
    close(tfd);
    if (r != 0) {
      return -e;
    }
  }
  for (int i = 0; i < nrealhosts; i++) {
    if (st.st_dev == realst[i].st_dev && st.st_ino == realst[i].st_ino) {
      return caller_is_guard(pid) ? 0 : -EPERM;
    }
  }
  return 0;
}

/**
 * The real program for a wrapper's open of WRAP_EXEC_FD_PATH: only when the
 * caller (held in the call, so its executable cannot change) runs this very
 * binary at a wrapped program's path. A new close-on-exec descriptor, or
 * -EACCES.
 */
static long exec_fd(pid_t pid) {
  char p[64];
  snprintf(p, sizeof(p), "%d/exe", (int)pid);
  struct stat st;
  if (fstatat(procfd, p, &st, 0) != 0 || st.st_dev != selfst.st_dev || st.st_ino != selfst.st_ino) {
    return -EACCES;
  }
  char link[PATH_MAX];
  ssize_t n = readlinkat(procfd, p, link, sizeof(link) - 1);
  if (n <= 0) {
    return -EACCES;
  }
  link[n] = 0;
  for (int i = 0; i < nrealviews; i++) {
    if (!strcmp(realviews[i], link)) {
      int d = fcntl(realfds[i], F_DUPFD_CLOEXEC, 0);
      return d < 0 ? -errno : d;
    }
  }
  return -EACCES;
}


// ─── Read pins: what a real shell reads from a writable place ──────────
//
// A real shell's process tree carries a second filter (installed by its
// wrapper) that notifies every open for reading; the wrapper hands its
// listener over with the exec-fd request. For a shell caller, a regular file on
// a writable mount (the project, /tmp, the home) is read here into a sealed
// memfd, hashed while it is copied, and handed over only when its (real path,
// SHA-256) is one Enclawed read for this line. (No exception for files the
// shell wrote itself: `prog > f; . f` would run bytes no one read. bash sends a
// here-document through a pipe when it fits one; a larger one fails.) Everything else
// opens unchanged; callers that are not a real shell continue.

typedef struct {
  uint32_t h[8];
  uint64_t len;
  unsigned char buf[64];
  size_t n;
} Sha256;

static const uint32_t SHA_K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};

#define ROR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))

static void sha_block(Sha256 *c, const unsigned char *p) {
  uint32_t w[64];
  for (int i = 0; i < 16; i++) {
    w[i] = (uint32_t)p[4 * i] << 24 | (uint32_t)p[4 * i + 1] << 16 | (uint32_t)p[4 * i + 2] << 8 | p[4 * i + 3];
  }
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = ROR(w[i - 15], 7) ^ ROR(w[i - 15], 18) ^ (w[i - 15] >> 3);
    uint32_t s1 = ROR(w[i - 2], 17) ^ ROR(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  uint32_t a = c->h[0], b = c->h[1], cc = c->h[2], d = c->h[3], e = c->h[4], f = c->h[5], g = c->h[6], h = c->h[7];
  for (int i = 0; i < 64; i++) {
    uint32_t t1 = h + (ROR(e, 6) ^ ROR(e, 11) ^ ROR(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i];
    uint32_t t2 = (ROR(a, 2) ^ ROR(a, 13) ^ ROR(a, 22)) + ((a & b) ^ (a & cc) ^ (b & cc));
    h = g, g = f, f = e, e = d + t1, d = cc, cc = b, b = a, a = t1 + t2;
  }
  c->h[0] += a, c->h[1] += b, c->h[2] += cc, c->h[3] += d, c->h[4] += e, c->h[5] += f, c->h[6] += g, c->h[7] += h;
}

static void sha_init(Sha256 *c) {
  static const uint32_t iv[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
  memcpy(c->h, iv, sizeof(iv));
  c->len = 0;
  c->n = 0;
}

static void sha_update(Sha256 *c, const unsigned char *p, size_t n) {
  c->len += n;
  while (n) {
    size_t k = 64 - c->n < n ? 64 - c->n : n;
    memcpy(c->buf + c->n, p, k);
    c->n += k, p += k, n -= k;
    if (c->n == 64) {
      sha_block(c, c->buf);
      c->n = 0;
    }
  }
}

static void sha_hex(Sha256 *c, char out[65]) {
  uint64_t bits = c->len * 8;
  unsigned char pad = 0x80, z = 0;
  sha_update(c, &pad, 1);
  while (c->n != 56) {
    sha_update(c, &z, 1);
  }
  unsigned char lb[8];
  for (int i = 0; i < 8; i++) {
    lb[i] = (unsigned char)(bits >> (56 - 8 * i));
  }
  sha_update(c, lb, 8);
  for (int i = 0; i < 8; i++) {
    snprintf(out + 8 * i, 9, "%08x", c->h[i]);
  }
}

#define READ_PIN_MAX_BYTES (16 * 1024 * 1024)
static int shell_copy(const struct stat *exe) {
  for (int i = 0; i < nrealhosts; i++) {
    const char *b = strrchr(realviews[i], '/');
    b = b ? b + 1 : realviews[i];
    if ((!strcmp(b, "sh") || !strcmp(b, "dash") || !strcmp(b, "bash")) &&
        exe->st_dev == realst[i].st_dev && exe->st_ino == realst[i].st_ino) {
      return 1;
    }
  }
  return 0;
}

/**
 * A real shell's open for reading, performed here: an fd to install, or
 * -errno. A regular file on a writable mount is handed over only as a sealed
 * copy of bytes Enclawed read (or of a file this shell created).
 */
// The devices of the places the run can write, and the data devices a shell
// may open (/dev/null, /dev/zero, /dev/urandom): captured in the sandbox's view
// once it is joined (capture_view).
static dev_t writable_devs[MAXLIST + 8];
static int nwritable_devs;
static struct stat data_devs[3];
static int ndata_devs;

static void capture_view(void) {
  const char *places[] = {"/tmp", "/sandbox/home", "/dev/shm"};
  struct stat st;
  for (size_t i = 0; i < sizeof(places) / sizeof(places[0]); i++) {
    if (stat(places[i], &st) == 0) {
      writable_devs[nwritable_devs++] = st.st_dev;
    }
  }
  for (int i = 0; i < nroots && nwritable_devs < (int)(sizeof(writable_devs) / sizeof(writable_devs[0])); i++) {
    if (stat(roots[i], &st) == 0) {
      writable_devs[nwritable_devs++] = st.st_dev;
    }
  }
  const char *devs[] = {"/dev/null", "/dev/zero", "/dev/urandom"};
  for (size_t i = 0; i < sizeof(devs) / sizeof(devs[0]); i++) {
    if (stat(devs[i], &st) == 0 && S_ISCHR(st.st_mode)) {
      data_devs[ndata_devs++] = st;
    }
  }
}

static int writable_device(dev_t d) {
  for (int i = 0; i < nwritable_devs; i++) {
    if (writable_devs[i] == d) {
      return 1;
    }
  }
  return 0;
}

static int data_device(const struct stat *st) {
  for (int i = 0; i < ndata_devs; i++) {
    if (S_ISCHR(st->st_mode) && st->st_rdev == data_devs[i].st_rdev) {
      return 1;
    }
  }
  return 0;
}

static int under_root(const char *full) {
  for (int i = 0; i < nroots; i++) {
    size_t n = strlen(roots[i]);
    while (n > 1 && roots[i][n - 1] == '/') {
      n--;
    }
    if (!strncmp(full, roots[i], n) && (full[n] == 0 || full[n] == '/')) {
      return 1;
    }
  }
  return 0;
}

static long do_read_open(pid_t pid, int dirarg, const char *path, int flags) {
#ifdef O_TMPFILE
  if ((flags & O_TMPFILE) == O_TMPFILE) {
    return -EOPNOTSUPP;
  }
#endif
  Split s;
  int r = split(pid, dirarg, path, &s);
  if (r < 0) {
    return r;
  }
  int pfd = openat(s.dfd, s.last, O_PATH | O_CLOEXEC | (flags & O_NOFOLLOW));
  r = -errno;
  close(s.dfd);
  if (pfd < 0) {
    return r;
  }
  if (flags & O_PATH) {
    return pfd; // no content is read through it
  }
  // Decided on the object itself, before anything is opened for reading: a
  // FIFO, socket or device is never reopened (a FIFO with no writer would hold
  // this supervisor); only directories and a few data devices are.
  struct stat st;
  if (fstat(pfd, &st) != 0) {
    close(pfd);
    return -EACCES;
  }
  if (!S_ISREG(st.st_mode) && !S_ISDIR(st.st_mode) && !data_device(&st)) {
    close(pfd);
    return -EACCES;
  }
  char full[PATH_MAX];
  if (fd_path(pfd, full, sizeof(full)) != 0) {
    close(pfd);
    return -EACCES;
  }
  struct statfs sf;
  // A regular file is read only as Enclawed read it when the run could have
  // changed it: on a writable mount; under a read-write root (a part of the
  // project bound read-only, such as .git, is still the project's inode); or
  // linked more than once on a device the run can write (a hard link to it).
  int pinned_only = S_ISREG(st.st_mode) &&
                    (fstatfs(pfd, &sf) != 0 || !(sf.f_flags & ST_RDONLY) || under_root(full) ||
                     (st.st_nlink > 1 && writable_device(st.st_dev)));
  char link[64];
  snprintf(link, sizeof(link), "%d/fd/%d", (int)mypid, pfd);
  int fd = openat(procfd, link, (flags & ~(O_NOFOLLOW | O_CLOEXEC | O_CREAT | O_TRUNC)) | O_CLOEXEC);
  r = -errno;
  close(pfd);
  if (fd < 0) {
    return r;
  }
  if (!pinned_only) {
    return fd;
  }
  if (st.st_size > READ_PIN_MAX_BYTES) {
    close(fd);
    return -EACCES;
  }
  int mfd = (int)syscall(SYS_memfd_create, "enclawed-read", MFD_CLOEXEC | MFD_ALLOW_SEALING);
  if (mfd < 0) {
    close(fd);
    return -EACCES;
  }
  Sha256 h;
  sha_init(&h);
  unsigned char buf[65536];
  off_t off = 0;
  int ok = 1;
  for (;;) {
    ssize_t n = pread(fd, buf, sizeof(buf), off);
    if (n < 0 || off + n > READ_PIN_MAX_BYTES) {
      ok = 0;
      break;
    }
    if (n == 0) {
      break;
    }
    sha_update(&h, buf, (size_t)n);
    if (write(mfd, buf, (size_t)n) != n) {
      ok = 0;
      break;
    }
    off += n;
  }
  close(fd);
  char hex[65];
  sha_hex(&h, hex);
  int pinned = 0;
  for (int i = 0; ok && i < nreadpins; i++) {
    if (!strcmp(readpin_path[i], full) && !strcmp(readpin_sha[i], hex)) {
      pinned = 1;
    }
  }
  if (!pinned || lseek(mfd, 0, SEEK_SET) != 0 ||
      fcntl(mfd, F_ADD_SEALS, F_SEAL_WRITE | F_SEAL_GROW | F_SEAL_SHRINK | F_SEAL_SEAL) != 0) {
    close(mfd);
    return -EACCES;
  }
  return mfd;
}

/**
 * An open for reading (no write or create bit), answered here: a real shell's
 * through do_read_open, anyone else's continued unchanged (nothing is decided
 * for them, so the kernel's second reading of the path changes nothing).
 */
static void serve_read(int lfd, struct seccomp_notif *req, struct seccomp_notif_resp *resp,
                       const struct seccomp_notif_sizes *sizes) {
  pid_t pid = (pid_t)req->pid;
  const __u64 *A = req->data.args;
  int nr = req->data.nr;
  long ret = 0;
  int cont = 1;
  char x[64];
  snprintf(x, sizeof(x), "%d/exe", (int)pid);
  struct stat exe;
  if (fstatat(procfd, x, &exe, 0) == 0 && shell_copy(&exe)) {
    cont = 0;
    char p1[PATH_MAX];
    int dirarg = AT_FDCWD, flags = 0;
    uint64_t at = 0;
    if (nr == SYS_openat) {
      dirarg = (int)A[0], at = A[1], flags = (int)A[2];
#if defined(__x86_64__)
    } else if (nr == SYS_open) {
      at = A[0], flags = (int)A[1];
#endif
    } else {
      ret = -ENOSYS;
    }
    if (ret == 0) {
      int e = read_string(pid, at, p1, sizeof(p1));
      ret = e < 0 ? e : 0;
    }
    if (ioctl(lfd, SECCOMP_IOCTL_NOTIF_ID_VALID, &req->id) != 0) {
      return;
    }
    if (ret == 0) {
      ret = do_read_open(pid, dirarg, p1, flags);
    }
    if (ret >= 0) {
      struct seccomp_notif_addfd add = {.id = req->id, .flags = SECCOMP_ADDFD_FLAG_SEND,
                                        .srcfd = (unsigned)ret, .newfd = 0,
                                        .newfd_flags = (unsigned)(flags & O_CLOEXEC)};
      int got = ioctl(lfd, SECCOMP_IOCTL_NOTIF_ADDFD, &add);
      int e = errno;
      close((int)ret);
      if (got >= 0 || e == ENOENT) {
        return;
      }
      ret = -e;
    }
  }
  memset(resp, 0, sizes->seccomp_notif_resp);
  resp->id = req->id;
  if (cont) {
    resp->flags = SECCOMP_USER_NOTIF_FLAG_CONTINUE; // not a shell: nothing is decided here
  } else {
    resp->error = (int)ret;
  }
  if (ioctl(lfd, SECCOMP_IOCTL_NOTIF_SEND, resp) != 0 && errno != ENOENT) {
    return;
  }
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
  if (nrealviews != nrealhosts) {
    fprintf(stderr, "enclawed name guard: real programs misconfigured\n");
    return 126;
  }
  // The copies are opened here, on the host, before joining the sandbox: none
  // of them is in the view. Each must be execute-only (not readable or
  // writable by anyone), so the program it runs is not dumpable.
  for (int i = 0; i < nrealhosts; i++) {
    // Read-only (seccomp hands over no O_PATH descriptor), opened while this
    // process still holds its capabilities: no one can read the copy itself.
    realfds[i] = open(realhosts[i], O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    struct stat st;
    if (realfds[i] < 0 || fstat(realfds[i], &st) != 0) {
      die("open a real program's copy");
    }
    realst[i] = st;
    if (!S_ISREG(st.st_mode) || (st.st_mode & 07666) != 0 || !(st.st_mode & 0111)) {
      fprintf(stderr, "enclawed name guard: %s is not an execute-only copy\n", realhosts[i]);
      return 126;
    }
  }
  if (stat("/proc/self/exe", &selfst) != 0) {
    die("stat the guard itself");
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
  capture_view();
  record_project_inodes();
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
    if ((req->data.nr == SYS_openat && !((int)req->data.args[2] & WRITE_FLAGS))
#if defined(__x86_64__)
        || (req->data.nr == SYS_open && !((int)req->data.args[1] & WRITE_FLAGS))
#endif
    ) {
      serve_read(listener, req, resp, &sizes);
      continue;
    }
    pid_t pid = (pid_t)req->pid;
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
    case SYS_execve:
      n1 = 0;
      break;
    case SYS_execveat:
      n1 = 1;
      break;
#if defined(__x86_64__)
    case SYS_chmod: case SYS_utime: case SYS_utimes:
      n1 = 0;
      break;
    case SYS_futimesat:
      n1 = A[1] ? 1 : -1; // a NULL name: the descriptor itself
      break;
#endif
    case SYS_fchmod:
      break;
    case SYS_fchmodat: case NR_fchmodat2:
      n1 = 1;
      break;
    case SYS_utimensat:
      n1 = A[1] ? 1 : -1;
      break;
    default:
      ret = -ENOSYS;
    }
    if (ret == 0 && n1 >= 0) {
      int e = read_string(pid, A[n1], p1, sizeof(p1));
      if (e < 0) ret = e;
    }
    if (ret == 0 && n2 >= 0) {
      int e = read_string(pid, A[n2], p2, sizeof(p2));
      if (e < 0) ret = e;
    }
    // An exec: refused when it would start a real program's copy anywhere but
    // in a wrapper; else continued by the kernel (exec_check).
    if (nr == SYS_execve || nr == SYS_execveat) {
      long er = ret;
      if (er == 0) {
        er = exec_check(pid, nr == SYS_execveat ? (int)A[0] : AT_FDCWD, p1,
                        nr == SYS_execveat ? (int)A[4] : 0);
      }
      // The kernel reads the path again when it continues: read it once more
      // here, and refuse when another thread changed it in between.
      if (er == 0) {
        char again[PATH_MAX];
        if (read_string(pid, A[n1], again, sizeof(again)) != 0 || strcmp(again, p1) != 0) {
          er = -EPERM;
        }
      }
      if (ioctl(listener, SECCOMP_IOCTL_NOTIF_ID_VALID, &req->id) != 0) {
        continue;
      }
      memset(resp, 0, sizes.seccomp_notif_resp);
      resp->id = req->id;
      if (er < 0) {
        resp->error = (int)er;
      } else {
        resp->flags = SECCOMP_USER_NOTIF_FLAG_CONTINUE;
      }
      if (ioctl(listener, SECCOMP_IOCTL_NOTIF_SEND, resp) != 0 && errno != ENOENT) {
        die("answer a notification");
      }
      continue;
    }
    // A wrapper asking for its real program (exec_fd): answered with a descriptor.
    int real_req = 0;
    if (ret == 0 && n1 >= 0 && !strcmp(p1, WRAP_EXEC_FD_PATH) &&
        (nr == SYS_openat
#if defined(__x86_64__)
         || nr == SYS_open
#endif
         )) {
      real_req = 1;
      ret = exec_fd(pid);

      is_fd = ret >= 0;
    }
    // The memory read belonged to this very call of this very task.
    if (ioctl(listener, SECCOMP_IOCTL_NOTIF_ID_VALID, &req->id) != 0) {
      if (real_req && ret >= 0) {
        close((int)ret);
      }
      continue;
    }
    if (ret == 0 && !real_req) {
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
      case SYS_fchmod:
        ret = do_chmod(pid, (int)A[0], NULL, (mode_t)A[1], 0);
        break;
      case SYS_fchmodat:
        ret = do_chmod(pid, (int)A[0], p1, (mode_t)A[2], 0);
        break;
      case NR_fchmodat2:
        ret = do_chmod(pid, (int)A[0], p1, (mode_t)A[2], (int)A[3]);
        break;
      case SYS_utimensat: {
        struct timespec ts[2];
        if (A[2] && read_mem(pid, A[2], ts, sizeof(ts)) != 0) {
          ret = -EFAULT;
        } else {
          ret = do_utimes(pid, (int)A[0], A[1] ? p1 : NULL, A[2] ? ts : NULL, (int)A[3]);
        }
        break;
      }
#if defined(__x86_64__)
      case SYS_chmod:
        ret = do_chmod(pid, AT_FDCWD, p1, (mode_t)A[1], 0);
        break;
      case SYS_utime: {
        struct utimbuf ub;
        struct timespec ts[2];
        if (A[1] && read_mem(pid, A[1], &ub, sizeof(ub)) != 0) {
          ret = -EFAULT;
        } else {
          ts[0] = (struct timespec){.tv_sec = ub.actime};
          ts[1] = (struct timespec){.tv_sec = ub.modtime};
          ret = do_utimes(pid, AT_FDCWD, p1, A[1] ? ts : NULL, 0);
        }
        break;
      }
      case SYS_utimes: case SYS_futimesat: {
        int futimes = nr == SYS_futimesat;
        uint64_t tva = futimes ? A[2] : A[1];
        struct timeval tv[2];
        struct timespec ts[2];
        if (tva && read_mem(pid, tva, tv, sizeof(tv)) != 0) {
          ret = -EFAULT;
        } else if (tva && (tv[0].tv_usec < 0 || tv[0].tv_usec >= 1000000 || tv[1].tv_usec < 0 ||
                           tv[1].tv_usec >= 1000000)) {
          ret = -EINVAL;
        } else {
          for (int k = 0; k < 2; k++) {
            ts[k] = (struct timespec){.tv_sec = tv[k].tv_sec, .tv_nsec = tv[k].tv_usec * 1000};
          }
          ret = do_utimes(pid, futimes ? (int)A[0] : AT_FDCWD, (futimes && !A[1]) ? NULL : p1,
                          tva ? ts : NULL, 0);
        }
        break;
      }
#endif
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
                                        .newfd_flags = real_req ? O_CLOEXEC : (unsigned)(flags & O_CLOEXEC)};
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


// ─── Wrapper: the guarded programs ──────────────────────────────────────
//
// In a contained run with code pins, each wrapped program's path in the view
// (/usr/bin/node, /bin/sh, ...) is this binary, bound read-only. The real
// program is nowhere in the view: run here, this binary checks what the run
// asks for (the same rules the generated wrapper scripts had), then asks the
// supervisor for the real program by opening WRAP_EXEC_FD for writing. The
// supervisor answers that open only for a process whose executable is this
// binary at a wrapped path (a fact of the kernel, read while the caller is
// held in the call), with a close-on-exec descriptor of an execute-only copy
// of the real program, which this process then executes (execveat). Execute-
// only, the program runs not dumpable: no other process opens its executable
// or its descriptors through /proc.

#define WRAP_CONF "/.enclawed/code/wrappers.conf"
#define WRAP_EXEC_FD "/.enclawed/exec-fd"

static char **wl_text, **wl_copy_real, **wl_copy, **wl_place, **wl_pyflag, **wl_bin, **wl_kind;
static int wn_text, wn_copy, wn_place, wn_pyflag, wn_bin;
static char *w_pyguard, *w_nodeopts;

static void wpush(char ***list, int *n, char *v) {
  char **l = realloc(*list, sizeof(char *) * (size_t)(*n + 1));
  if (!l) {
    exit(126);
  }
  l[(*n)++] = v;
  *list = l;
}

static int hexv(int c) {
  return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1;
}

/** A hex field as a string; NULL when it is not hex or holds a NUL. */
static char *unhex(const char *h, size_t n) {
  if (n % 2) {
    return NULL;
  }
  char *out = malloc(n / 2 + 1);
  if (!out) {
    exit(126);
  }
  for (size_t i = 0; i < n; i += 2) {
    int a = hexv((unsigned char)h[i]), b = hexv((unsigned char)h[i + 1]);
    if (a < 0 || b < 0 || (a | b) == 0) {
      free(out);
      return NULL;
    }
    out[i / 2] = (char)(a * 16 + b);
  }
  out[n / 2] = 0;
  return out;
}

static void wrefuse(const char *why) {
  fprintf(stderr, "Enclawed: %s; nothing was run (this contained run runs only the code Enclawed read)\n", why);
  exit(126);
}

/** Read the wrappers' configuration: "<key> <hex> [<hex>]" lines. 0: read; -1: none here. */
static int load_wrappers(void) {
  FILE *f = fopen(WRAP_CONF, "re");
  if (!f) {
    return -1;
  }
  char *line = NULL;
  size_t cap = 0;
  ssize_t len;
  while ((len = getline(&line, &cap, f)) > 0) {
    line[strcspn(line, "\n")] = 0;
    char *sp = strchr(line, ' ');
    if (!sp) {
      continue;
    }
    *sp = 0;
    char *v1 = sp + 1;
    char *sp2 = strchr(v1, ' ');
    char *v2 = NULL;
    if (sp2) {
      *sp2 = 0;
      v2 = sp2 + 1;
    }
    char *a = unhex(v1, strlen(v1));
    char *b = v2 ? unhex(v2, strlen(v2)) : NULL;
    if (!a || (v2 && !b)) {
      wrefuse("the wrappers' configuration is not readable");
    }
    if (!strcmp(line, "bin") && b) {
      wpush(&wl_bin, &wn_bin, a);
      int k = wn_bin - 1;
      wpush(&wl_kind, &k, b);
    } else if (!strcmp(line, "text")) {
      wpush(&wl_text, &wn_text, a);
    } else if (!strcmp(line, "copy") && b) {
      wpush(&wl_copy_real, &wn_copy, a);
      int k = wn_copy - 1;
      wpush(&wl_copy, &k, b);
    } else if (!strcmp(line, "place")) {
      wpush(&wl_place, &wn_place, a);
    } else if (!strcmp(line, "pyflag")) {
      wpush(&wl_pyflag, &wn_pyflag, a);
    } else if (!strcmp(line, "pyguard")) {
      w_pyguard = a;
    } else if (!strcmp(line, "nodeopts")) {
      w_nodeopts = a;
    }
  }
  free(line);
  fclose(f);
  return 0;
}

static const char *wrapped_kind(const char *self) {
  for (int i = 0; i < wn_bin; i++) {
    if (!strcmp(wl_bin[i], self)) {
      return wl_kind[i];
    }
  }
  return NULL;
}

typedef struct {
  char **v;
  int n;
} argvec;

static void apush(argvec *a, char *s) {
  char **l = realloc(a->v, sizeof(char *) * (size_t)(a->n + 2));
  if (!l) {
    exit(126);
  }
  l[a->n++] = s;
  l[a->n] = NULL;
  a->v = l;
}

/** Shell options a run may set by name (-o NAME, +o NAME): none of them reads code. */
static const char *SHELL_O_OK[] = {"errexit", "nounset", "pipefail", "xtrace", "noglob", "noclobber", "verbose", NULL};
/** Long options of bash a run may pass: none of them reads a startup file. */
static const char *SHELL_LONG_OK[] = {"--norc", "--noprofile", "--posix", "--noediting", NULL};

static int in_names(const char **l, const char *v) {
  for (; *l; l++) {
    if (!strcmp(*l, v)) {
      return 1;
    }
  }
  return 0;
}

static int under_dir(const char *p, const char *d) {
  size_t n = strlen(d);
  return !strncmp(p, d, n) && (p[n] == 0 || p[n] == '/');
}

/**
 * The shell guard's rules. -c TEXT runs only a text Enclawed read; a script
 * runs only as the copy Enclawed read (by the script's full real path), or as
 * itself when it is a regular file on a read-only mount (the toolchain) outside
 * /dev, /proc, /sys and every place the run can write. No login shell, no
 * startup file, no program from the input, no option that reads code.
 */
static void shell_args(int argc, char **argv, argvec *out) {
  if (argv[0][0] == '-') {
    wrefuse("a login shell (reads startup files)");
  }
  apush(out, argv[0]);
  int i = 1, cf = 0;
  argvec opts = {0};
  while (i < argc) {
    char *a = argv[i];
    if (!strcmp(a, "--")) {
      i++;
      break;
    }
    if (!strcmp(a, "-") ) {
      wrefuse("a shell reading its program from its input");
    }
    if (a[0] == '-' && a[1] == '-') {
      if (!in_names(SHELL_LONG_OK, a)) {
        wrefuse("a shell option that may read code");
      }
      apush(&opts, a);
      i++;
      continue;
    }
    if ((a[0] == '-' || a[0] == '+') && a[1]) {
      // A cluster of one-letter options: c reads the program from the next
      // argument; s and i from the input, l starts a login shell, O sets
      // bash's own options; each o takes the next argument, an option name.
      int takes = 0;
      for (const char *p = a + 1; *p; p++) {
        if (*p == 'c' && a[0] == '-') {
          cf = 1;
        } else if (*p == 's' || *p == 'i') {
          wrefuse("a shell reading its program from its input");
        } else if (*p == 'l') {
          wrefuse("a login shell (reads startup files)");
        } else if (*p == 'O') {
          wrefuse("a shell option that may read code");
        } else if (*p == 'o') {
          takes++;
        }
      }
      apush(&opts, a);
      i++;
      for (; takes > 0; takes--) {
        if (i >= argc || !in_names(SHELL_O_OK, argv[i])) {
          wrefuse("a shell option that may read code");
        }
        apush(&opts, argv[i++]);
      }
      continue;
    }
    break;
  }
  for (int k = 0; k < opts.n; k++) {
    apush(out, opts.v[k]);
  }
  if (cf) {
    if (i >= argc) {
      wrefuse("a shell with -c and no text");
    }
    for (int k = 0; k < wn_text; k++) {
      if (!strcmp(wl_text[k], argv[i])) {
        for (; i < argc; i++) {
          apush(out, argv[i]);
        }
        return;
      }
    }
    wrefuse("a -c line Enclawed did not read");
  }
  if (i >= argc || !strcmp(argv[i], "-")) {
    wrefuse("a shell reading its program from its input");
  }
  char *s = argv[i++];
  char r[PATH_MAX];
  if (!realpath(s, r)) {
    wrefuse("the script does not exist");
  }
  for (int k = 0; k < wn_copy; k++) {
    if (!strcmp(wl_copy_real[k], r)) {
      char *dot = malloc(strlen(wl_copy[k]) + 3);
      if (!dot) {
        exit(126);
      }
      sprintf(dot, ". %s", wl_copy[k]);
      apush(out, "-c");
      apush(out, dot);
      apush(out, s);
      for (; i < argc; i++) {
        apush(out, argv[i]);
      }
      return;
    }
  }
  if (under_dir(r, "/dev") || under_dir(r, "/proc") || under_dir(r, "/sys")) {
    wrefuse("the script is not a file Enclawed read");
  }
  for (int k = 0; k < wn_place; k++) {
    char w[PATH_MAX];
    snprintf(w, sizeof(w), "%s", wl_place[k]);
    size_t n = strlen(w);
    while (n > 1 && w[n - 1] == '/') {
      w[--n] = 0;
    }
    if (under_dir(r, w)) {
      wrefuse("the script is not one Enclawed read");
    }
  }
  int fd = open(r, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  struct stat st;
  struct statfs sf;
  if (fd < 0 || fstat(fd, &st) != 0 || !S_ISREG(st.st_mode) || fstatfs(fd, &sf) != 0 ||
      !(sf.f_flags & ST_RDONLY)) {
    wrefuse("the script is not a read-only file of the toolchain");
  }
  close(fd);
  // The path checked, not the name given (a link could be changed in between;
  // this one is on a read-only mount).
  apush(out, r);
  for (; i < argc; i++) {
    apush(out, argv[i]);
  }
}

/**
 * The environment a wrapped program starts with: the run's, without the
 * variables that make the dynamic loader, the C library or the program itself
 * load or run other code. `keep_node` names the NODE_* variables node keeps.
 */
static const char *DROP_ALL[] = {"GCONV_PATH", "HOSTALIASES", "LOCPATH", "NLSPATH", "GLIBC_TUNABLES",
                                 "TZDIR", "RESOLV_HOST_CONF", "MALLOC_TRACE", NULL};
static const char *DROP_SHELL[] = {"BASH_ENV", "ENV", "SHELLOPTS", "BASHOPTS", "PS4", "PROMPT_COMMAND",
                                   "CDPATH", "GLOBIGNORE", "EXECIGNORE", "BASH_XTRACEFD", "INPUTRC",
                                   "BASH_LOADABLES_PATH", "BASH_COMPAT", NULL};
static const char *DROP_AWK[] = {"AWKPATH", "AWKLIBPATH", NULL};
static const char *KEEP_NODE[] = {"NODE_ENV", "NODE_NO_WARNINGS", "NODE_DISABLE_COLORS",
                                  "NODE_TEST_CONTEXT", "NODE_V8_COVERAGE", NULL};

static int env_named(const char *entry, const char **names) {
  for (; *names; names++) {
    size_t n = strlen(*names);
    if (!strncmp(entry, *names, n) && entry[n] == '=') {
      return 1;
    }
  }
  return 0;
}

static char **clean_env(const char *kind) {
  extern char **environ;
  argvec e = {0};
  for (char **p = environ; *p; p++) {
    const char *v = *p;
    if (!strncmp(v, "LD_", 3) || env_named(v, DROP_ALL)) {
      continue;
    }
    if (!strcmp(kind, "shell") && (env_named(v, DROP_SHELL) || !strncmp(v, "BASH_FUNC_", 10))) {
      continue;
    }
    if (!strcmp(kind, "awk") && env_named(v, DROP_AWK)) {
      continue;
    }
    if (!strcmp(kind, "python") && !strncmp(v, "PYTHON", 6)) {
      continue;
    }
    if (!strcmp(kind, "node") && !strncmp(v, "NODE_", 5) && !env_named(v, KEEP_NODE)) {
      continue;
    }
    apush(&e, (char *)v);
  }
  // Shells and awk run in the C locale: patterns and ranges match bytes, as Enclawed read them.
  if (!strcmp(kind, "shell") || !strcmp(kind, "awk")) {
    argvec k = {0};
    for (int i = 0; i < e.n; i++) {
      const char *v = e.v[i];
      if (strncmp(v, "LANG=", 5) && strncmp(v, "LANGUAGE=", 9) && strncmp(v, "LC_", 3)) {
        apush(&k, (char *)v);
      }
    }
    apush(&k, "LC_ALL=C");
    e = k;
  }
  if (!strcmp(kind, "node")) {
    if (!w_nodeopts) {
      wrefuse("the node guard is not configured");
    }
    char *o = malloc(strlen(w_nodeopts) + 14);
    if (!o) {
      exit(126);
    }
    sprintf(o, "NODE_OPTIONS=%s", w_nodeopts);
    apush(&e, o);
  }
  if (!e.v) {
    apush(&e, NULL);
    e.n = 0;
  }
  return e.v;
}

/** The python guard's start (formerly pythonWrapper): its flags, the guard, the run's arguments. */
static void python_args(const char *self, int argc, char **argv, argvec *out) {
  apush(out, (char *)self);
  for (int k = 0; k < wn_pyflag; k++) {
    apush(out, wl_pyflag[k]);
  }
  int i = 1;
  for (; i < argc; i++) {
    const char *a = argv[i];
    if (a[0] != '-' || !a[1] || strspn(a + 1, "IBEsuOqP") != strlen(a + 1)) {
      break;
    }
    apush(out, argv[i]);
  }
  if (!w_pyguard) {
    wrefuse("the python guard is not configured");
  }
  apush(out, w_pyguard);
  for (; i < argc; i++) {
    apush(out, argv[i]);
  }
}

static void node_args(int argc, char **argv, argvec *out) {
  apush(out, argv[0]);
  if (!w_nodeopts) {
    wrefuse("the node guard is not configured");
  }
  char *copy = strdup(w_nodeopts);
  for (char *t = strtok(copy, " "); t; t = strtok(NULL, " ")) {
    apush(out, t);
  }
  for (int i = 1; i < argc; i++) {
    apush(out, argv[i]);
  }
}

/**
 * The python wrapper's own filter, inherited by the interpreter and all it
 * starts: no executable memory that the run could have written. Refused
 * (EACCES): an anonymous mapping that is executable, a mapping both writable
 * and executable, making any mapping executable afterwards (mprotect,
 * pkey_mprotect), and memfd_create / memfd_secret (a second, writable mapping
 * of an executable file). A program's and its libraries' code maps from their
 * files (read-only places; every writable mount is noexec). node is not given
 * this filter: its JIT writes the code it runs.
 */
static void python_wx_filter(void) {
  struct sock_filter f[32];
  int n = 0;
#define WS(code, k) (f[n++] = (struct sock_filter)BPF_STMT(code, k))
#define WJ(code, k, jt, jf) (f[n++] = (struct sock_filter)BPF_JUMP(code, k, jt, jf))
  const unsigned int DENY = SECCOMP_RET_ERRNO | EACCES;
  WS(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch));
  WJ(BPF_JMP | BPF_JEQ | BPF_K, GUARD_ARCH, 1, 0);
  WS(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS);
  WS(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr));
  WJ(BPF_JMP | BPF_JEQ | BPF_K, SYS_memfd_create, 0, 1);
  WS(BPF_RET | BPF_K, DENY);
  WJ(BPF_JMP | BPF_JEQ | BPF_K, SYS_memfd_secret, 0, 1);
  WS(BPF_RET | BPF_K, DENY);
  // mprotect / pkey_mprotect: prot (argument 2) with PROT_EXEC.
  WJ(BPF_JMP | BPF_JEQ | BPF_K, SYS_mprotect, 1, 0);
  WJ(BPF_JMP | BPF_JEQ | BPF_K, SYS_pkey_mprotect, 0, 3);
  WS(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[2]));
  WJ(BPF_JMP | BPF_JSET | BPF_K, PROT_EXEC, 0, 1);
  WS(BPF_RET | BPF_K, DENY);
  // mmap: PROT_EXEC with PROT_WRITE, or with MAP_ANONYMOUS (argument 3).
  WS(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr));
  WJ(BPF_JMP | BPF_JEQ | BPF_K, SYS_mmap, 0, 7);
  WS(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[2]));
  WJ(BPF_JMP | BPF_JSET | BPF_K, PROT_EXEC, 0, 5);
  WJ(BPF_JMP | BPF_JSET | BPF_K, PROT_WRITE, 0, 1);
  WS(BPF_RET | BPF_K, DENY);
  WS(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[3]));
  WJ(BPF_JMP | BPF_JSET | BPF_K, MAP_ANONYMOUS, 0, 1);
  WS(BPF_RET | BPF_K, DENY);
  WS(BPF_RET | BPF_K, SECCOMP_RET_ALLOW);
#undef WS
#undef WJ
  struct sock_fprog fp = {.len = (unsigned short)n, .filter = f};
  if (syscall(SYS_seccomp, SECCOMP_SET_MODE_FILTER, 0, &fp) != 0) {
    wrefuse("the python wrapper could not refuse executable memory");
  }
}

static int wrapper(const char *self, const char *kind, int argc, char **argv) {
  // Not dumpable from here on: the real program's descriptor, once here, is
  // not reachable through /proc by any other process.
  if (prctl(PR_SET_DUMPABLE, 0, 0, 0, 0) != 0) {
    wrefuse("the wrapper could not protect itself");
  }
  char **env = clean_env(kind);
  argvec out = {0};
  if (argc < 1) {
    wrefuse("a program started with no name");
  }
  if (!strcmp(kind, "shell")) {
    shell_args(argc, argv, &out);
  } else if (!strcmp(kind, "python")) {
    python_args(self, argc, argv, &out);
  } else if (!strcmp(kind, "node")) {
    node_args(argc, argv, &out);
  } else if (!strcmp(kind, "awk")) {
    apush(&out, argv[0]);
    apush(&out, "--sandbox");
    for (int i = 1; i < argc; i++) {
      apush(&out, argv[i]);
    }
  } else {
    wrefuse("an unknown wrapped program");
  }
  int fd = open(WRAP_EXEC_FD, O_WRONLY | O_CLOEXEC);
  if (fd < 0) {
    wrefuse("the real program is not available to this run");
  }
  if (!strcmp(kind, "python")) {
    python_wx_filter();
  }
  syscall(SYS_execveat, fd, "", out.v, env, AT_EMPTY_PATH);
  fprintf(stderr, "Enclawed: the real program did not start: %s\n", strerror(errno));
  return 126;
}

/** This binary started at a wrapped program's path: its kind; else NULL. */
static const char *wrapped_self(char *self, size_t size) {
  ssize_t n = readlink("/proc/self/exe", self, size - 1);
  if (n <= 0) {
    return NULL;
  }
  self[n] = 0;
  if (load_wrappers() != 0) {
    return NULL;
  }
  return wrapped_kind(self);
}

int main(int argc, char **argv) {
  {
    // At a wrapped program's path in a contained run: the wrapper, whatever argv says.
    char self[PATH_MAX];
    const char *kind = wrapped_self(self, sizeof(self));
    if (kind) {
      return wrapper(self, kind, argc, argv);
    }
  }
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
