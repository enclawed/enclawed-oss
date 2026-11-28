// enclawed adapter kit: the strict read-only shell allowlist, the kit's
// default ShellClassifier.
//
// The parser is deliberately conservative. It accepts one simple command:
// words separated by blanks, optionally single- or double-quoted. Anything a
// shell could turn into a second command, a redirection, an expansion or a
// variable assignment is refused outright (pipes, lists, redirects,
// substitutions, `$`, backticks, backslashes, braces, `!`, `#`, newlines).
//
// The command word must then be on the allowlist, and every option must be
// one the command's spec lists. Options are parsed the way getopt parses
// them: a short-option cluster (`-abc`) is read character by character and a
// character that takes a value takes the rest of the cluster (`-Orm`,
// `-oout.txt`) or the next word; a long option is `--name` or `--name=value`
// and must match a listed name exactly (GNU tools also accept unambiguous
// abbreviations, which is why exact matching, not prefix matching, is
// required: `--out=x` would mean `--output=x`). An option that is not listed
// refuses the command. Refusal does not block the command: it makes it
// irreversible, so it waits for a person.
//
// Ported unchanged in its semantics from codenclawed's shell-readonly.mjs
// (red-team F1, R1; docs-agent bug 2).

import path from "node:path";
import type { ShellClassifier, ShellVerdict } from "./contracts.js";
import { parseCompound, type ShellContext, type SimpleCommand } from "./shell-compound.js";
import { parseOptions, spec, words, type OptionSpec, type ParseResult } from "./shell-options.js";
import { ghReadOnly } from "./shell-readonly-gh.js";
import {
  awkReadOnly,
  MPI_WRAPPERS,
  mpiWrapperReadOnly,
  nvidiaSmiReadOnly,
  sedReadOnly,
} from "./shell-readonly-inspect.js";

export { parseOptions, type OptionSpec, type ParseResult } from "./shell-options.js";

export type SplitResult =
  | Readonly<{ ok: true; argv: string[] }>
  | Readonly<{ ok: false; code: string; detail?: string }>;

const UNQUOTED_REFUSED = new Set([
  "|",
  "&",
  ";",
  "<",
  ">",
  "(",
  ")",
  "$",
  "`",
  "\\",
  "{",
  "}",
  "!",
  "\n",
  "\r",
  "#",
]);
const DQUOTE_REFUSED = new Set(["$", "`", "\\", "!", "\n", "\r"]);

/** Split one simple command into words; anything a shell would expand or chain is refused. */
export function splitSimpleCommand(command: unknown): SplitResult {
  if (typeof command !== "string") {
    return { ok: false, code: "no-command" };
  }
  if (command.length > 4096) {
    return { ok: false, code: "command-too-long" };
  }
  const argv: string[] = [];
  let cur = "";
  let inWord = false;
  let i = 0;
  while (i < command.length) {
    const c = command[i];
    if (c === " " || c === "\t") {
      if (inWord) {
        argv.push(cur);
        cur = "";
        inWord = false;
      }
      i++;
      continue;
    }
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      if (end < 0) {
        return { ok: false, code: "unbalanced-quote" };
      }
      cur += command.slice(i + 1, end);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < command.length && command[j] !== '"') {
        if (DQUOTE_REFUSED.has(command[j])) {
          return { ok: false, code: "shell-expansion", detail: command[j] };
        }
        j++;
      }
      if (j >= command.length) {
        return { ok: false, code: "unbalanced-quote" };
      }
      cur += command.slice(i + 1, j);
      inWord = true;
      i = j + 1;
      continue;
    }
    if (UNQUOTED_REFUSED.has(c)) {
      return { ok: false, code: "shell-metacharacter", detail: c };
    }
    cur += c;
    inWord = true;
    i++;
  }
  if (inWord) {
    argv.push(cur);
  }
  if (argv.length === 0) {
    return { ok: false, code: "no-command" };
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0])) {
    return { ok: false, code: "env-assignment" };
  }
  return { ok: true, argv };
}

type Check =
  | Readonly<{ ok: true; git?: Readonly<{ sub: string; cdirs: string[] }> }>
  | Readonly<{ ok: false; detail: string }>;

function grepSpec(): OptionSpec {
  return spec({
    flags: "EFGPiyvwxcLloqsbHhnTZzraIUu",
    args: "efmABCdD",
    numeric: true,
    long: "extended-regexp fixed-strings basic-regexp perl-regexp ignore-case no-ignore-case word-regexp line-regexp count files-without-match files-with-matches only-matching quiet silent no-messages byte-offset with-filename no-filename line-number initial-tab null null-data text recursive dereference-recursive binary line-buffered",
    longArgs:
      "regexp file max-count label after-context before-context context binary-files devices directories exclude exclude-from exclude-dir include",
    longOpt: "color colour",
  });
}

function sumSpec(extraArgs = ""): OptionSpec {
  return spec({
    flags: "bctwz",
    args: extraArgs,
    long: "binary check tag text zero ignore-missing quiet status strict warn",
    longArgs: "length",
  });
}

type CommandSpec = OptionSpec | "any" | "find" | "git" | "set";

const APT_CACHE_QUERIES = new Set(
  words("policy show showpkg showsrc depends rdepends search madison pkgnames stats"),
);
const SYSTEMCTL_QUERIES = new Set(
  words(
    "status is-active is-enabled is-failed is-system-running list-units list-unit-files list-timers list-sockets list-dependencies list-jobs list-machines get-default",
  ),
);
const APT_QUERIES = new Set(words("list show search policy depends rdepends showsrc"));

/** Commands whose every option is read-only are "any" (they have no option that writes or runs anything). */
const COMMANDS: Readonly<Record<string, CommandSpec>> = {
  pwd: spec({ flags: "LP" }),
  cd: spec({ flags: "LPe@", maxPos: 1 }),
  // echo prints its options too; none writes or runs anything.
  echo: "any",
  // printf prints (its -v sets a shell variable, which no later word may read: refused there).
  printf: "any",
  // test and [ only evaluate their arguments (file tests show no content).
  test: "any",
  "[": "any",
  true: "any",
  false: "any",
  // tr reads its input and prints; it takes no file and has no option that writes or runs.
  tr: "any",
  // set with only shell options (-e, -u, -x, -o pipefail): no output, no command (bare `set` prints the environment: not here).
  set: "set",
  // ps has no option that writes a file or starts a program; BSD-style
  // operands (`ps aux`) are options without a dash.
  ps: "any",
  // sleep only waits: durations (GNU suffixes s m h d, decimals, infinity) and --help/--version.
  sleep: spec({
    long: "help version",
    check: (r) =>
      r.positionals.every((a) => /^(?:\d+(?:\.\d+)?|\.\d+)[smhd]?$|^infinity$/.test(a)) &&
      (r.positionals.length > 0 || r.options.length > 0),
  }),
  // pgrep / pidof print process ids (and names or command lines, as ps does); they
  // never signal (pkill and kill do). Left out: -F/--pidfile (reads a file named)
  // and --signal (pkill's).
  pgrep: spec({
    flags: "flaxnoicvwAhV",
    args: "dgGPstuUr",
    long: "full list-name list-full exact newest oldest count inverse lightweight ignore-case ignore-ancestors require-handler help version",
    longArgs:
      "delimiter pgroup group parent session terminal euid uid runstates ns nslist env cgroup",
    longOpt: "logpidfile",
    check: (r) => !r.options.some((o) => o.name === "--logpidfile"),
  }),
  pidof: spec({ flags: "scqwxznhV", args: "oSd" }),

  printenv: spec({ flags: "0", long: "null" }),
  // ─── Text and number utilities: they print what they compute or read ───
  // None has an option that writes a file, starts a program or uses the
  // network; the files they read are their operands (the path rules check them).
  // seq, expr, yes and factor only compute from their words.
  seq: "any",
  expr: "any",
  yes: "any",
  factor: "any",
  // bc and dc read programs from their operands or input; neither can write a
  // file or start a program (GNU bc has no system call; dc's `!` runs one: left out).
  bc: spec({
    flags: "hilqsvwg",
    long: "help interactive mathlib quiet standard version warn global-stacks",
  }),
  tac: spec({ flags: "br", args: "s", long: "before regex", longArgs: "separator" }),
  rev: spec({ flags: "0", long: "zero help version" }),
  expand: spec({ flags: "i", args: "t", numeric: true, long: "initial", longArgs: "tabs" }),
  unexpand: spec({
    flags: "a",
    args: "t",
    numeric: true,
    long: "all first-only",
    longArgs: "tabs",
  }),
  fold: spec({ flags: "bs", args: "w", numeric: true, long: "bytes spaces", longArgs: "width" }),
  fmt: spec({
    flags: "ctsu",
    args: "wpg",
    numeric: true,
    long: "crown-margin tagged-paragraph split-only uniform-spacing",
    longArgs: "width prefix goal",
  }),
  // column (util-linux): every option only shapes the table it prints.
  column: spec({
    flags: "tdmeLJxhV",
    args: "nOCNlEHRTWripcosS",
    long: "table table-noheadings table-maxout table-header-repeat keep-empty-lines json fillrows help version",
    longArgs:
      "table-name table-order table-column table-columns table-columns-limit table-noextreme table-hide table-right table-truncate table-wrap tree tree-id tree-parent output-width output-separator separator use-spaces",
  }),
  paste: spec({ flags: "sz", args: "d", long: "serial zero-terminated", longArgs: "delimiters" }),
  join: spec({
    flags: "iz",
    args: "aveotj12",
    long: "ignore-case check-order nocheck-order header zero-terminated",
  }),
  // binutils strings: an `@FILE` word reads more options from FILE (refused).
  strings: spec({
    flags: "afdwhvU",
    args: "ntesT",
    numeric: true,
    long: "all data print-file-name include-all-whitespace help version",
    longArgs: "bytes radix encoding output-separator target unicode",
    check: (r) => !r.positionals.some((a) => a.startsWith("@")),
  }),
  // base64/base32 encode or decode to standard output (one operand: a second one is not an output file, it is refused).
  base64: spec({
    flags: "di",
    args: "w",
    long: "decode ignore-garbage",
    longArgs: "wrap",
    maxPos: 1,
  }),
  base32: spec({
    flags: "di",
    args: "w",
    long: "decode ignore-garbage",
    longArgs: "wrap",
    maxPos: 1,
  }),
  sum: spec({ flags: "rs", long: "sysv" }),
  tty: spec({ flags: "s", long: "silent quiet", maxPos: 0 }),
  logname: spec({ maxPos: 0 }),
  users: spec({ maxPos: 1 }),
  who: spec({
    flags: "abdHlmpqrstTuw",
    long: "all boot dead heading login lookup process count runlevel short time mesg users writable",
    maxPos: 2,
  }),
  // top only in batch mode with a count (`top -b -n 1`): it prints and exits; its
  // interactive commands (kill, renice) need its input, which batch mode does not read.
  top: spec({
    flags: "bcHiSs1",
    args: "dnpuUoOwEe",
    check: (r) =>
      r.positionals.length === 0 &&
      r.options.some((o) => o.name === "-b") &&
      r.options.some((o) => o.name === "-n"),
  }),
  // ss lists sockets; -K (kill sockets), -D (dump to a file) and -N (another namespace) are left out.
  ss: spec({
    flags: "hVHOnraloemipsEZzb46071tudwxSM",
    args: "fAF",
    long: "help version no-header oneline numeric resolve all listening options extended memory processes threads info tos cgroup summary events context contexts bpf ipv4 ipv6 packet tcp udp dccp raw unix sctp vsock xdp mptcp tipc tipcinfo inet-sockets",
    longArgs: "family query socket filter",
  }),
  // systemctl: only the query verbs (status, is-*, list-*); show and cat are left out
  // (they print a unit's Environment=, which may hold credentials), and so are
  // -H / -M (another host or machine).
  systemctl: spec({
    flags: "aqlrt",
    args: "pnPt",
    long: "user system all quiet full no-pager no-legend plain value failed recursive reverse after before show-types version help",
    longArgs: "property type state lines output",
    check: (r) =>
      r.positionals.length > 0
        ? SYSTEMCTL_QUERIES.has(r.positionals[0])
        : r.options.some((o) => o.name === "--version" || o.name === "--help"),
  }),
  // journalctl reads the journal and prints. Left out: every action that changes it
  // (--rotate, --vacuum-*, --flush, --sync, --relinquish-var, --setup-keys,
  // --update-catalog), -D / --file / --root / -M (another journal) and --cursor-file (writes).
  journalctl: spec({
    flags: "bkrxeqamfN",
    args: "nuptogUS",
    long: "user system no-pager reverse catalog pager-end quiet all merge follow no-full full utc list-boots disk-usage no-hostname dmesg header version help",
    longArgs:
      "lines unit user-unit priority identifier output grep since until boot facility output-fields",
  }),
  // kpsewhich finds TeX files; --must-exist may run mktex* scripts that make them.
  kpsewhich: spec({
    long: "all help version",
    longArgs:
      "format progname engine dpi var-value expand-var expand-path expand-braces show-path path subdir",
    check: (r) => !r.positionals.some((a) => a.startsWith("-")),
  }),
  findmnt: spec({
    flags: "AabcDdefiklmnPRrsSTtUuvJxyMhV",
    args: "CEFINOopSTtwQ",
    long: "all ascii bytes canonicalize df direction evaluate first-only invert kernel list mountinfo-fd noheadings pairs raw submounts fstab mtab tree uniq verbose json verify notruncate shell pseudo real help version",
    longArgs:
      "id-tables output output-all poll timeout source target tab-file types nofsroot options mountpoint filter",
  }),
  ls: spec({
    flags: "aAbBcCdfFghGHiklLmnNopqQrRsStuUvxXZ1",
    args: "IwT",
    long: "all almost-all author escape directory dired classify file-type full-time group-directories-first no-group human-readable si dereference-command-line dereference-command-line-symlink-to-dir dereference inode kibibytes literal numeric-uid-gid hide-control-chars show-control-chars quote-name recursive reverse size zero context",
    longArgs:
      "block-size format hide ignore indicator-style quoting-style sort time time-style tabsize width",
    longOpt: "color hyperlink",
  }),
  cat: spec({
    flags: "AbeEnstTuv",
    long: "show-all number-nonblank number squeeze-blank show-ends show-tabs show-nonprinting",
  }),
  head: spec({
    flags: "qvz",
    args: "nc",
    numeric: true,
    long: "quiet silent verbose zero-terminated",
    longArgs: "lines bytes",
  }),
  tail: spec({
    flags: "fFqvz",
    args: "ncs",
    numeric: true,
    long: "retry quiet silent verbose zero-terminated",
    longArgs: "lines bytes pid sleep-interval max-unchanged-stats",
    longOpt: "follow",
  }),
  wc: spec({
    flags: "clmwL",
    long: "bytes chars lines words max-line-length",
    longArgs: "files0-from total",
  }),
  nl: spec({
    flags: "p",
    args: "bdfhilnsvw",
    long: "no-renumber",
    longArgs:
      "body-numbering section-delimiter footer-numbering header-numbering line-increment join-blank-lines number-format number-separator starting-line-number number-width",
  }),
  cut: spec({
    flags: "nsz",
    args: "bcdf",
    long: "complement only-delimited zero-terminated",
    longArgs: "bytes characters delimiter fields output-delimiter",
  }),
  comm: spec({
    flags: "123z",
    long: "check-order nocheck-order total zero-terminated",
    longArgs: "output-delimiter",
  }),
  cmp: spec({
    flags: "bls",
    args: "in",
    long: "print-bytes verbose quiet silent",
    longArgs: "ignore-initial bytes",
  }),
  diff: spec({
    flags: "abBdeEfHiInNpPqrsStTuwyZ",
    args: "CDFIlLSUWxX",
    numeric: true,
    long: "normal brief report-identical-files ed rcs side-by-side left-column suppress-common-lines show-c-function expand-tabs initial-tab suppress-blank-empty new-file unidirectional-new-file ignore-case ignore-file-name-case no-ignore-file-name-case ignore-tab-expansion ignore-trailing-space ignore-space-change ignore-all-space ignore-blank-lines strip-trailing-cr text minimal speed-large-files recursive no-dereference",
    longArgs:
      "ignore-matching-lines label width tabsize exclude exclude-from starting-file from-file to-file horizon-lines show-function-line line-format old-line-format new-line-format unchanged-line-format old-group-format new-group-format changed-group-format unchanged-group-format ifdef palette",
    longOpt: "context unified color",
  }),
  od: spec({
    flags: "bcdfilosvx",
    args: "AjNtwS",
    long: "output-duplicates traditional",
    longArgs: "address-radix skip-bytes read-bytes format strings endian",
    longOpt: "width",
  }),
  hexdump: spec({ flags: "bcCdovx", args: "enfs" }),
  stat: spec({
    flags: "LfZt",
    args: "c",
    long: "dereference file-system terse",
    longArgs: "format printf cached",
  }),
  realpath: spec({
    flags: "eEmLPqsz",
    long: "canonicalize-existing canonicalize-missing logical physical quiet strip no-symlinks zero",
    longArgs: "relative-to relative-base",
  }),
  readlink: spec({
    flags: "efmnqsvz",
    long: "canonicalize canonicalize-existing canonicalize-missing no-newline quiet silent verbose zero",
  }),
  basename: spec({ flags: "az", args: "s", long: "multiple zero", longArgs: "suffix" }),
  dirname: spec({ flags: "z", long: "zero" }),
  du: spec({
    flags: "0abcDhHklLmPsSx",
    args: "dBtX",
    long: "null all apparent-size bytes total dereference-args human-readable inodes count-links dereference no-dereference separate-dirs si summarize one-file-system",
    longArgs: "block-size max-depth threshold exclude exclude-from time-style files0-from",
    longOpt: "time",
  }),
  df: spec({
    flags: "ahHiklPTv",
    args: "tBx",
    long: "all human-readable si inodes local portability print-type total sync no-sync",
    longArgs: "block-size type exclude-type",
    longOpt: "output",
  }),
  which: spec({ flags: "a" }),
  type: spec({ flags: "afptP" }),
  whoami: spec({ maxPos: 0 }),
  id: spec({ flags: "agGnruzZ", long: "group groups name real user zero context" }),
  uname: spec({
    flags: "asnrvmpio",
    long: "all kernel-name nodename kernel-release kernel-version machine processor hardware-platform operating-system",
    maxPos: 0,
  }),
  uptime: spec({ flags: "ps", long: "pretty since", maxPos: 0 }),
  nproc: spec({ long: "all", longArgs: "ignore", maxPos: 0 }),
  free: spec({
    flags: "bkmghltwv",
    args: "sc",
    long: "bytes kibi mebi gibi tebi pebi kilo mega giga tera peta human lohi total wide si committed",
    longArgs: "seconds count",
    maxPos: 0,
  }),
  grep: grepSpec(),
  egrep: grepSpec(),
  fgrep: grepSpec(),
  jq: spec({
    flags: "rcnesSjaCMRh",
    args: "fL",
    long: "raw-output compact-output null-input exit-status slurp sort-keys join-output ascii-output color-output monochrome-output raw-input tab seq stream stream-errors raw-output0 args jsonargs",
    longArgs: "indent",
    // --arg NAME VALUE and friends take two words: parsed by jqReadOnly.
  }),
  sha1sum: sumSpec(),
  sha224sum: sumSpec(),
  sha256sum: sumSpec(),
  sha384sum: sumSpec(),
  sha512sum: sumSpec(),
  md5sum: sumSpec(),
  b2sum: sumSpec("l"),
  cksum: spec({
    flags: "bctwz",
    args: "al",
    long: "base64 binary check raw tag text untagged warn status quiet strict ignore-missing zero debug",
    longArgs: "algorithm length",
  }),
  // `hostname NAME`, `-F FILE` and `-b` set the host name: no operands, display flags only.
  hostname: spec({
    flags: "afdisAIT",
    long: "alias fqdn long domain ip-address all-fqdns all-ip-addresses short",
    maxPos: 0,
  }),
  // `date -s` and `date MMDDhhmm` set the clock: only +FORMAT operands, display options only.
  date: spec({
    flags: "uR",
    args: "dfr",
    optArgs: "I",
    long: "utc universal rfc-email debug",
    longArgs: "date file reference rfc-3339",
    longOpt: "iso-8601",
    check: (p) => p.positionals.every((x) => x.startsWith("+")),
  }),
  rg: spec({
    flags: "abcFHhiIlLnNoPqsSUuvwxz0",
    args: "AeBCEfgjmMrtT",
    numeric: true,
    long: "binary block-buffered byte-offset case-sensitive column count count-matches crlf debug files files-with-matches files-without-match fixed-strings follow glob-case-insensitive heading hidden ignore-case invert-match json line-buffered line-number line-regexp max-columns-preview mmap multiline multiline-dotall no-config no-filename no-heading no-ignore no-ignore-dot no-ignore-exclude no-ignore-files no-ignore-global no-ignore-parent no-ignore-vcs no-line-number no-messages no-mmap no-pcre2-unicode no-require-git no-unicode null null-data one-file-system only-matching passthru pcre2 pretty quiet search-zip smart-case sort-files stats text trim type-list unrestricted vimgrep with-filename word-regexp files-with-matches no-column no-hidden no-follow",
    longArgs:
      "after-context before-context context color colors context-separator dfa-size-limit encoding engine field-context-separator field-match-separator file glob iglob ignore-file max-columns max-count max-depth max-filesize path-separator regex-size-limit regexp replace sort sortr threads type type-add type-clear type-not",
    // Deliberately absent: --pre and --pre-glob (run a program per file).
  }),
  find: "find",
  sort: spec({
    flags: "bdfgiMhnRrVcCsumz",
    args: "ktS",
    long: "ignore-leading-blanks dictionary-order ignore-case general-numeric-sort ignore-nonprinting month-sort human-numeric-sort numeric-sort random-sort reverse version-sort merge stable unique zero-terminated debug",
    longArgs: "key field-separator buffer-size parallel sort random-source files0-from",
    longOpt: "check",
    // Deliberately absent: -o/--output (writes), -T/--temporary-directory,
    // --compress-program (runs a program).
  }),
  // `uniq IN OUT` writes OUT.
  uniq: spec({
    flags: "cdDiuz",
    args: "fsw",
    long: "count repeated ignore-case unique zero-terminated",
    longArgs: "skip-fields skip-chars check-chars",
    longOpt: "all-repeated group",
    maxPos: 1,
  }),
  // `xxd -r` and `xxd IN OUT` write a file.
  xxd: spec({ flags: "abCEiepuh", args: "clgosn", maxPos: 1 }),
  // `file -C` compiles a magic file.
  file: spec({
    flags: "bcdEhiklLNnprsSvzZ0",
    args: "eFfmP",
    long: "brief checking-printout dereference no-dereference keep-going list mime mime-type mime-encoding no-buffer no-pad preserve-date raw special-files uncompress uncompress-noreport print0 extension apple",
    longArgs: "exclude exclude-quiet files-from magic-file parameter separator",
  }),
  // `tree -o FILE` writes FILE.
  tree: spec({
    flags: "adlfxpsughDFqNQrtvcUSnCAJX",
    args: "LPIHT",
    long: "noreport dirsfirst filesfirst du prune matchdirs ignore-case gitignore fromfile metafirst inodes device si",
    longArgs: "filelimit timefmt sort charset gitfile infofile hintro houtro",
    longOpt: "info",
  }),
  git: "git",
  // ─── Machine and toolchain inspection ───
  // lscpu (util-linux) prints what /proc/cpuinfo and /sys report; --sysroot
  // (read a different tree) is left out.
  lscpu: spec({
    flags: "abBcJrxyhV",
    optArgs: "Cep",
    long: "all online bytes offline json raw hex physical output-all help version",
    longOpt: "caches extended parse hierarchic",
    maxPos: 0,
  }),
  // lsblk (util-linux) lists block devices from /sys; every option only selects
  // or formats columns (--sysroot left out). Operands are device names to show.
  lsblk: spec({
    flags: "ADJMOPSNvabdfilmnprstzyHhV",
    optArgs: "T",
    args: "EIQeowx",
    long: "noempty discard json merge output-all pairs scsi nvme virtio all bytes nodeps fs ascii list perms noheadings paths raw inverse topology zoned shell list-columns help version",
    longArgs: "dedup include filter highlight ct-filter ct exclude output width sort properties-by",
    longOpt: "tree",
  }),
  // lspci (pciutils) reads /sys/bus/pci. Left out: -x (config space dumps; some
  // devices misbehave when parts of it are read), -H (direct hardware access),
  // -M (bus mapping scan), -A / -O / -F (access method, its parameters, a dump
  // file), -i / -p (other ID files) and -q / -Q (ID lookups over DNS).
  lspci: spec({ flags: "mtkbDPnv", args: "sd", long: "version help", maxPos: 0 }),
  // lsusb (usbutils) reads the device descriptors (-v included); -D FILE left out.
  lsusb: spec({ flags: "vtVh", args: "sd", long: "verbose tree version help", maxPos: 0 }),
  // lsmod prints /proc/modules; it takes no argument.
  lsmod: spec({ maxPos: 0 }),
  // groups prints the groups of this user or of the named users.
  groups: spec({ long: "help version" }),
  // getconf prints a system configuration value (-a: all of them).
  getconf: spec({ flags: "a", args: "v", maxPos: 2 }),
  arch: spec({ long: "help version", maxPos: 0 }),
  // locale prints the locale settings or the names of the installed locales.
  locale: spec({
    flags: "amckv",
    long: "all-locales charmaps category-name keyword-name verbose help usage version",
  }),
  // whereis searches the standard binary, manual and source directories for names.
  whereis: spec({ flags: "bmsulf", args: "BMS" }),
  // ulimit (a builtin) with only option letters prints limits; a value operand
  // (`ulimit -n 1024`) sets one: no operand.
  ulimit: spec({ flags: "HSabcdefiklmnpqrstuvxPRT", maxPos: 0 }),
  // pkg-config / pkgconf print what .pc files say (no .pc field runs anything).
  // Left out: --log-file (writes) and the personality / path options.
  "pkg-config": pkgConfigSpec(),
  pkgconf: pkgConfigSpec(),
  // dpkg: only the query actions. dpkg hands -l, -L, -s, -S, -p to dpkg-query
  // (./program-path.ts checks that program too). Measured with dpkg 1.23.7:
  // --status-logger, --pre-invoke and --log given on the command line (a
  // superset of what ~/.dpkg.cfg can set) start and write nothing for these
  // actions, nor for --get-selections, --print-*architecture(s), --version.
  // Every other action installs, removes, configures or changes the database;
  // --admindir / --root / --instdir and every hook or logging option are left
  // out, so the read-only forms read only the system's database.
  dpkg: spec({
    flags: "lLsSp",
    long: "list listfiles status search print-avail get-selections print-architecture print-foreign-architectures version help no-pager",
  }),
  // apt-cache: the query actions only. They read the package lists and the
  // status database and print; none starts a program (APT's Pre-Invoke /
  // Post-Invoke hooks belong to update and dpkg runs). Left out: -o / -c (set
  // any configuration value, Dir:: paths included), -p / -s (write a cache to a
  // file named), -g / --generate, and every other action (gencaches writes the
  // caches). Run as root it may rebuild APT's own caches in /var/cache/apt,
  // regenerable data.
  "apt-cache": spec({
    flags: "qifanhv",
    long: "quiet important full all-versions no-all-versions names-only all-names recurse installed implicit no-pre-depends no-depends no-recommends no-suggests no-conflicts no-breaks no-replaces no-enhances no-generate help version",
    check: (r) =>
      r.positionals.length === 0
        ? r.options.some((o) => ["-h", "-v", "--help", "--version"].includes(o.name))
        : APT_CACHE_QUERIES.has(r.positionals[0]),
  }),
  // apt: its query actions (the same library and files as apt-cache), same exclusions.
  apt: spec({
    flags: "qa",
    long: "quiet all-versions installed upgradable manual-installed names-only full",
    check: (r) => r.positionals.length > 0 && APT_QUERIES.has(r.positionals[0]),
  }),
  // dpkg-query has no action that writes; --admindir / --root are left out.
  "dpkg-query": spec({
    flags: "lWLsSpc",
    args: "f",
    long: "list show listfiles status search print-avail control-list control-show control-path load-avail no-pager version help",
    longArgs: "showformat",
  }),
};

function pkgConfigSpec(): OptionSpec {
  return spec({
    long: "help about version verbose list-all list-package-names exists cflags cflags-only-I cflags-only-other libs libs-only-l libs-only-L libs-only-other modversion static shared print-errors short-errors silence-errors errors-to-stdout print-variables print-requires print-requires-private print-provides uninstalled no-uninstalled",
    longArgs:
      "atleast-version exact-version max-version variable define-variable atleast-pkgconfig-version",
  });
}

// ─── find ───────────────────────────────────────────────────────────────

const FIND_GLOBAL = new Set(["-H", "-L", "-P"]);
const FIND_NOARG = new Set(
  words(
    "-print -print0 -ls -prune -not -a -o -and -or -true -false -follow -depth -mount -xdev -empty -readable -writable -executable -nouser -nogroup -noleaf -ignore_readdir_race -noignore_readdir_race -daystart -quit ! ( ) ,",
  ),
);
const FIND_ARG = new Set(
  words(
    "-name -iname -path -ipath -wholename -iwholename -regex -iregex -regextype -type -xtype -maxdepth -mindepth -size -mtime -mmin -atime -amin -ctime -cmin -newer -anewer -cnewer -newermm -newerma -newermc -newerBt -user -group -uid -gid -perm -samefile -links -inum -lname -ilname -used -fstype -printf -context",
  ),
);

function findReadOnly(args: readonly string[]): Check {
  let i = 0;
  while (i < args.length && FIND_GLOBAL.has(args[i])) {
    i++;
  }
  // Starting points: everything before the first expression word.
  while (i < args.length && !args[i].startsWith("-") && !["!", "(", ")", ","].includes(args[i])) {
    i++;
  }
  for (; i < args.length; i++) {
    const a = args[i];
    if (FIND_NOARG.has(a)) {
      continue;
    }
    if (FIND_ARG.has(a) || /^-newer[aBcmt][aBcmt]$/.test(a)) {
      if (i + 1 >= args.length) {
        return { ok: false, detail: `${a} needs a value` };
      }
      i++;
      continue;
    }
    // -exec/-execdir CMD ... {} ; or + : read-only when CMD with its arguments is
    // (`{}` stands for the files find yields, all under its starting points, which
    // the path rules read as a recursive search); a nested find or xargs is not read here.
    if (a === "-exec" || a === "-execdir") {
      const end = args.findIndex((x, k) => k > i && (x === ";" || x === "+"));
      const cmd = end > i + 1 ? args.slice(i + 1, end) : [];
      if (
        cmd.length === 0 ||
        (args[end] === "+" && args[end - 1] !== "{}") ||
        cmd[0] === "find" ||
        cmd[0] === "xargs" ||
        !classifyArgv(cmd.map((x) => (x === "{}" ? "." : x))).readOnly
      ) {
        return { ok: false, detail: `find ${a} runs a command that is not read-only` };
      }
      i = end;
      continue;
    }
    // -ok, -okdir, -delete, -fprint*, -fls and anything unknown.
    return { ok: false, detail: `find ${a} is not on the read-only list` };
  }
  return { ok: true };
}

// ─── jq (two-word options) ──────────────────────────────────────────────

function jqReadOnly(args: readonly string[]): Check {
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (["--arg", "--argjson", "--slurpfile", "--rawfile"].includes(args[i])) {
      if (i + 2 >= args.length) {
        return { ok: false, detail: `${args[i]} needs a name and a value` };
      }
      i += 2;
      continue;
    }
    if (args[i] === "--args" || args[i] === "--jsonargs") {
      // Everything after is a positional argument for the program.
      break;
    }
    rest.push(args[i]);
  }
  const r = parseOptions(rest, COMMANDS.jq as OptionSpec);
  return r.ok ? { ok: true } : r;
}

// ─── git ────────────────────────────────────────────────────────────────

const GIT_LOG_LONG =
  "oneline graph no-decorate shortstat numstat name-only name-status raw patch no-patch patch-with-stat patch-with-raw summary abbrev-commit no-abbrev-commit full-history first-parent merges no-merges reverse follow date-order author-date-order topo-order left-right cherry-pick cherry-mark cherry boundary source walk-reflogs no-color cached staged ignore-all-space ignore-space-change ignore-space-at-eol ignore-blank-lines ignore-cr-at-eol minimal patience histogram function-context full-index binary no-renames no-relative exit-code quiet check no-ext-diff no-textconv mailmap no-mailmap use-mailmap no-notes standard-notes no-standard-notes parents children dense sparse simplify-merges simplify-by-decoration do-walk all-match invert-grep regexp-ignore-case basic-regexp extended-regexp fixed-strings perl-regexp remove-empty no-min-parents no-max-parents log-size no-expand-tabs numbered email committer cc combined-all-paths irreversible-delete text root no-prefix default-prefix compact-summary cumulative merge-base find-copies-harder all ita-invisible-in-index ita-visible-in-index no-indent-heuristic indent-heuristic pickaxe-all pickaxe-regex no-stat";
const GIT_LOG_ARGS =
  "max-count skip since after until before author committer grep grep-reflog format date min-parents max-parents diff-filter src-prefix dst-prefix line-prefix stat-width stat-name-width stat-count stat-graph-width word-diff-regex anchored diff-algorithm ws-error-highlight color-moved-ws ignore-matching-lines rotate-to skip-to exclude glob encoding unified inter-hunk-context relative-date-format";
const GIT_LOG_OPT =
  "branches tags remotes decorate stat abbrev color word-diff color-words find-renames find-copies relative notes show-notes ancestry-path no-walk expand-tabs pretty dirstat ignore-submodules submodule color-moved break-rewrites show-linear-break";

// -O<file> (orderfile) is left out on purpose: on `git grep` -O runs a program.
const GIT_LOG = spec({
  flags: "pusmctwbRiEFPzN",
  optArgs: "MCBU",
  args: "nSGL",
  numeric: true,
  long: GIT_LOG_LONG,
  longArgs: GIT_LOG_ARGS,
  longOpt: GIT_LOG_OPT,
});

const GIT_SPECS: Readonly<Record<string, OptionSpec>> = {
  log: GIT_LOG,
  show: GIT_LOG,
  diff: GIT_LOG,
  whatchanged: GIT_LOG,
  shortlog: GIT_LOG,
  status: spec({
    flags: "sbvz",
    optArgs: "u",
    long: "short branch long verbose no-column ahead-behind no-ahead-behind renames no-renames show-stash null",
    longOpt: "porcelain untracked-files ignore-submodules ignored column find-renames",
  }),
  blame: spec({
    flags: "bcflnpsetwk",
    optArgs: "MC",
    args: "LS",
    long: "root show-stats porcelain line-porcelain incremental progress no-progress minimal reverse first-parent color-lines color-by-age score-debug show-name show-number show-email",
    longArgs: "contents date ignore-rev ignore-revs-file encoding",
    longOpt: "abbrev",
  }),
  grep: spec({
    flags: "aiIvwcLlhHnoqrzEFGPWp",
    args: "efmABC",
    numeric: true,
    long: "cached untracked no-index no-exclude-standard exclude-standard recurse-submodules text ignore-case word-regexp invert-match full-name extended-regexp basic-regexp fixed-strings perl-regexp line-number column files-with-matches name-only files-without-match null count no-color break heading show-function function-context and or not all-match quiet no-textconv",
    longArgs: "max-depth context after-context before-context max-count threads",
    longOpt: "color",
    // Deliberately absent: -O / --open-files-in-pager (runs a program per
    // matching file, F1) and --textconv.
  }),
  // cat-file: only the read modes (`<type> <object>`, -e, -p, -t, -s) and the
  // mailmap switches. --textconv, --filters (run configured programs), --path
  // (only meaningful with them) and every --batch* mode are left out, so their
  // abbreviations (`--te`, `--fi`, `--ba`) are refused too (R1).
  "cat-file": spec({
    flags: "epts",
    long: "use-mailmap no-use-mailmap mailmap no-mailmap",
    maxPos: 2,
  }),
};

// Plumbing reads whose options never write or run anything, apart from the
// ones refused below. Their option sets are large and stable; they are
// checked against a deny list instead.
const GIT_PLUMBING_READ = new Set([
  "rev-parse",
  "ls-files",
  "ls-tree",
  "describe",
  "merge-base",
  "rev-list",
  "name-rev",
  "check-ignore",
  "count-objects",
  "version",
]);
const GIT_REFUSED_LONG = [
  "output",
  "open-files-in-pager",
  "ext-diff",
  "exec",
  "textconv",
  "upload-pack",
  "receive-pack",
  "config-env",
  "work-tree",
  "git-dir",
  "filters",
  "batch-command",
  // Verifies signatures: runs gpg (or gpg.ssh.program, ssh-keygen).
  "show-signature",
];

// Commands that print commits by a pretty format: a signature placeholder
// (%G?, %GS, %GK, ...) verifies the signature, running gpg or ssh-keygen.
const GIT_FORMATS_COMMITS = new Set([
  "log",
  "show",
  "whatchanged",
  "shortlog",
  "rev-list",
  "reflog",
]);

/**
 * git's parse-options accepts any unambiguous prefix of a long option, down
 * to one character after `--`, and an exact match of a real option name
 * always wins. So `git cat-file --te` runs --textconv. An option name that is
 * a prefix of a refused long option (or of its `no-` negation) is refused,
 * unless it is exactly a listed option of that subcommand. `--n`, `--no`,
 * `--no-` are prefixes of every negation and so are refused too (R1).
 */
export function abbreviatesRefused(
  name: string,
  exact: ReadonlySet<string> | null = null,
): string | null {
  if (name.length === 0 || exact?.has(name)) {
    return null;
  }
  for (const r of GIT_REFUSED_LONG) {
    if (r.startsWith(name) || `no-${r}`.startsWith(name)) {
      return r;
    }
  }
  return null;
}

function gitAbbrevCheck(args: readonly string[], s: OptionSpec | null = null): Check {
  const exact = s ? new Set([...s.long, ...s.longArgs, ...s.longOpt]) : null;
  for (const a of args) {
    if (a === "--") {
      break;
    }
    if (a.startsWith("--")) {
      const name = a.slice(2).split("=")[0];
      const r = abbreviatesRefused(name, exact);
      if (r) {
        return {
          ok: false,
          detail: `git option --${name} ${name === r ? "is" : `abbreviates --${r}, which is`} not on the read-only list`,
        };
      }
    }
  }
  return { ok: true };
}

function gitPlumbingOk(args: readonly string[]): Check {
  const abbrev = gitAbbrevCheck(args);
  if (!abbrev.ok) {
    return abbrev;
  }
  for (const a of args) {
    if (a === "--") {
      break;
    }
    if (!a.startsWith("--") && /^-[A-Za-z]*O/.test(a)) {
      return { ok: false, detail: `git option -O (in ${a}) is not on the read-only list` };
    }
  }
  return { ok: true };
}

const BRANCH_LIST = new Set([
  "-a",
  "-r",
  "-v",
  "-vv",
  "-l",
  "--list",
  "--show-current",
  "--all",
  "--remotes",
  "--verbose",
  "--merged",
  "--no-merged",
  "--contains",
]);

function gitReadOnly(args: readonly string[]): Check {
  let i = 0;
  // Global options before the subcommand: only -C <dir> and --no-pager.
  const cdirs: string[] = [];
  while (i < args.length && args[i].startsWith("-")) {
    if (args[i] === "-C" && i + 1 < args.length) {
      cdirs.push(args[i + 1]);
      i += 2;
    } else if (args[i] === "--no-pager") {
      i += 1;
    } else {
      // -c, --exec-path, --git-dir, -p/--paginate, ...
      return { ok: false, detail: `git ${args[i]} is not on the read-only list` };
    }
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === undefined) {
    return { ok: false, detail: "git with no subcommand" };
  }
  const done = (r: Check | ParseResult): Check =>
    r.ok ? { ok: true, git: { sub, cdirs } } : { ok: false, detail: r.detail };
  if (GIT_FORMATS_COMMITS.has(sub)) {
    const dd = rest.indexOf("--");
    const sig = (dd < 0 ? rest : rest.slice(0, dd)).find((a) => a.includes("%G"));
    if (sig !== undefined) {
      return { ok: false, detail: `git ${sub} ${sig}: a signature placeholder runs gpg` };
    }
  }
  if (Object.hasOwn(GIT_SPECS, sub)) {
    // Exact matching already refuses abbreviations; the prefix rule is kept
    // as a second, independent layer.
    const abbrev = gitAbbrevCheck(rest, GIT_SPECS[sub]);
    return done(abbrev.ok ? parseOptions(rest, GIT_SPECS[sub]) : abbrev);
  }
  if (GIT_PLUMBING_READ.has(sub)) {
    return done(gitPlumbingOk(rest));
  }
  const listOnly = (ok: boolean): Check =>
    ok ? done({ ok: true }) : { ok: false, detail: `git ${sub} ${rest.join(" ")} may write` };
  switch (sub) {
    case "hash-object": {
      // Prints an object id; -w writes it into the repository, --stdin* read names or
      // content from input. A file's clean filter (a program) runs unless --no-filters,
      // so a file other than /dev/null needs --no-filters.
      const noFilters = rest.includes("--no-filters");
      let ok = true;
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === "-t" && /^(?:blob|tree|commit|tag)$/.test(rest[i + 1] ?? "")) {
          i++;
        } else if (a === "--no-filters") {
          continue;
        } else if (a.startsWith("-") || (a !== "/dev/null" && !noFilters)) {
          ok = false;
        }
      }
      return listOnly(ok);
    }
    case "branch":
      return listOnly(rest.every((o) => BRANCH_LIST.has(o)));
    case "tag":
      return listOnly(
        rest.length === 0 || (rest.length === 1 && (rest[0] === "-l" || rest[0] === "--list")),
      );
    case "remote":
      return listOnly(rest.length === 0 || (rest.length === 1 && rest[0] === "-v"));
    case "stash":
    case "worktree":
      return listOnly(rest.length === 1 && rest[0] === "list");
    case "reflog":
      return listOnly(rest.length === 0 || (rest[0] === "show" && gitPlumbingOk(rest.slice(1)).ok));
    case "clean": {
      // A dry run only lists what clean would delete: every option a cluster of
      // n, d, x, X, q with n present, then paths.
      let dry = false;
      let ok = true;
      for (let k = 0; k < rest.length; k++) {
        const a = rest[k];
        if (a === "--") {
          break;
        }
        if (a === "--dry-run") {
          dry = true;
        } else if (a === "--quiet") {
          /* output only */
        } else if (/^-[ndxXq]+$/.test(a)) {
          dry ||= a.includes("n");
        } else if (a.startsWith("-")) {
          ok = false;
        }
      }
      return listOnly(ok && dry);
    }
    case "config": {
      const scoped0 = rest[0] === "--global" || rest[0] === "--local" ? rest.slice(1) : rest;
      // --show-origin and --show-scope only label the listing.
      const scoped = scoped0.filter((a) => a !== "--show-origin" && a !== "--show-scope");
      const ok =
        (scoped.length === 1 && ["--list", "-l"].includes(scoped[0])) ||
        (scoped.length >= 2 &&
          scoped.length <= 3 &&
          ["--get", "--get-all", "--get-regexp"].includes(scoped[0]) &&
          !scoped.slice(1).some((a) => a.startsWith("-")));
      return listOnly(ok);
    }
    default:
      return { ok: false, detail: `git ${sub} is not on the read-only list` };
  }
}

// ─── The classifiers ────────────────────────────────────────────────────

// Version probes of common toolchains: only the exact `--version` form.
const VERSION_ONLY = new Set([
  "node",
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "deno",
  "python",
  "python3",
  "go",
  "cargo",
  "rustc",
  "java",
  "javac",
  "dotnet",
  "ruby",
  "gcc",
  "clang",
  "make",
  "cmake",
  "docker",
  "kubectl",
  // Compilers, linkers and HPC launchers: --version prints and exits.
  "cc",
  "c++",
  "g++",
  "gfortran",
  "clang++",
  "flang",
  "ld",
  "as",
  "ninja",
  "nvcc",
  "nvc",
  "nvc++",
  "nvfortran",
  "icx",
  "icpx",
  "ifx",
  "mpirun",
  "mpiexec",
]);

const AWKS = new Set(["awk", "gawk", "mawk", "nawk"]);
const SEDS = new Set(["sed", "gsed"]);
// numactl with a command runs it; --hardware and --show only print.
const NUMACTL_SHOW = new Set(["-H", "--hardware", "-s", "--show"]);

export type ShellClassification =
  | Readonly<{
      readOnly: true;
      argv: readonly string[];
      /** Words of wrappers (timeout, nice, stdbuf, env) before the command they run. */
      inner?: number;
      git?: Readonly<{ sub: string; cdirs: readonly string[] }>;
      /** A program (gh) that runs git in the working directory itself: the git command it runs, for the repository-config check. */
      gitImplicit?: Readonly<{ sub: string; args: readonly string[]; global: readonly string[] }>;
    }>
  | Readonly<{ readOnly: false; code: string; detail?: string }>;

// What xargs may run: commands that show names, sizes, counts or types, never a
// file's content, for whatever names its input holds (the kit cannot know them).
const XARGS_NAMES_ONLY = new Set(["ls", "stat", "du", "wc", "file"]);
const XARGS_FLAGS = new Set(["-0", "--null", "-r", "--no-run-if-empty", "-t", "--verbose"]);
const XARGS_ARG = new Set([
  "-n",
  "--max-args",
  "-L",
  "--max-lines",
  "-P",
  "--max-procs",
  "-d",
  "--delimiter",
  "-s",
  "--max-chars",
]);

/** xargs [options] CMD ARGS: read-only when CMD only shows names, sizes, counts or types. */
function xargsReadOnly(args: readonly string[]): Check {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    if (XARGS_FLAGS.has(args[i])) {
      i++;
    } else if (XARGS_ARG.has(args[i]) && i + 1 < args.length) {
      i += 2;
    } else {
      return { ok: false, detail: `xargs ${args[i]} is not on the read-only list` };
    }
  }
  const cmd = args.slice(i);
  if (cmd.length === 0 || !XARGS_NAMES_ONLY.has(cmd[0])) {
    return { ok: false, detail: "xargs runs a command that may show content" };
  }
  // wc --files0-from reads names from a file; the rest of its options only count.
  if (cmd.some((a) => a.startsWith("--files0") || a === "--f")) {
    return { ok: false, detail: "xargs wc --files0-from" };
  }
  const v = classifyArgv(cmd);
  return v.readOnly ? { ok: true } : { ok: false, detail: `xargs ${cmd[0]}: not read-only` };
}

/**
 * Read-only PDF inspection. Poppler's tools take single-dash word options
 * (`-list`, `-f 3`), so they are matched word by word: pdfinfo prints
 * metadata (-js prints the document's scripts as text, it runs none);
 * pdfimages only with -list (without it, it writes every image); mutool show,
 * info and pages print objects and page data (show -o writes a file; run
 * executes JavaScript, draw/convert/clean/extract/... write files: not here).
 * The operands are files they read (the path rules check them).
 */
function pdfReadOnly(cmd: string, args: readonly string[]): Check {
  const words = (flags: string, vals: string) => ({
    flags: new Set(flags.split(" ")),
    vals: new Set(vals.split(" ")),
  });
  const scan = (
    a: readonly string[],
    o: { flags: Set<string>; vals: Set<string> },
  ): { ok: boolean; pos: string[]; seen: Set<string> } => {
    const pos: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < a.length; i++) {
      const w = a[i];
      if (w.startsWith("-") && w !== "-") {
        if (o.flags.has(w)) {
          seen.add(w);
        } else if (o.vals.has(w) && i + 1 < a.length) {
          seen.add(w);
          i++;
        } else {
          return { ok: false, pos, seen };
        }
      } else {
        pos.push(w);
      }
    }
    return { ok: true, pos, seen };
  };
  const bad = { ok: false as const, detail: `${cmd}: not a read-only form` };
  if (cmd === "pdfinfo") {
    const r = scan(
      args,
      words(
        "-box -meta -custom -js -struct -struct-text -url -isodates -rawdates -dests -listenc -v -h -help --help",
        "-f -l -enc -opw -upw",
      ),
    );
    return r.ok && r.pos.length <= 1 ? { ok: true } : bad;
  }
  if (cmd === "pdftotext") {
    // Only to standard output (IN -): with an output file it writes (decided as that Write).
    const r = scan(
      args,
      words(
        "-layout -raw -nodiag -htmlmeta -tsv -nopgbrk -bbox -bbox-layout -cropbox -q -v -h -help --help",
        "-f -l -r -x -y -W -H -fixed -enc -eol -colspacing -opw -upw",
      ),
    );
    return r.ok && r.pos.length === 2 && r.pos[1] === "-" && r.pos[0] !== "-" ? { ok: true } : bad;
  }
  if (cmd === "pdfimages") {
    const r = scan(
      args,
      words("-list -j -png -tiff -all -p -print-filenames -v -h -help", "-f -l -opw -upw"),
    );
    return r.ok && r.seen.has("-list") && r.pos.length >= 1 && r.pos.length <= 2
      ? { ok: true }
      : bad;
  }
  // mutool SUB [options] file [objects or pages]
  const [sub, ...rest] = args;
  const r =
    sub === "show"
      ? scan(rest, words("-e -b -g -r -L", "-p"))
      : sub === "info"
        ? scan(rest, words("-F -I -M -P -S -X -Z", "-p"))
        : sub === "pages"
          ? scan(rest, words("", "-p"))
          : null;
  return r?.ok && r.pos.length >= 1 ? { ok: true } : bad;
}

const PDF_READERS = new Set(["pdfinfo", "pdfimages", "mutool", "pdftotext"]);

/**
 * Wrappers that run one command: timeout, nice, stdbuf, and env with no option
 * and no assignment. The wrapped command is classified as itself; how many
 * words the wrapper takes, or null when this is not such a wrapper form.
 */
export function wrapperWords(argv: readonly string[]): number | null {
  const [w, ...a] = argv;
  let i = 0;
  if (w === "timeout") {
    // timeout [-s SIG] [-k DUR] [--preserve-status] [--foreground] [-v] DURATION CMD...
    for (; i < a.length && a[i].startsWith("-"); i++) {
      if (/^(?:-s|--signal|-k|--kill-after)$/.test(a[i])) {
        i++;
      } else if (
        !/^(?:--preserve-status|--foreground|-v|--verbose|--signal=\S+|--kill-after=\S+|-s\S+|-k\S+)$/.test(
          a[i],
        )
      ) {
        return null;
      }
    }
    if (!/^\d+(?:\.\d+)?[smhd]?$/.test(a[i] ?? "")) {
      return null;
    }
    i++;
  } else if (w === "nice") {
    // nice [-n N | -N | --adjustment=N] CMD...
    if (a[0] === "-n" || a[0] === "--adjustment") {
      i = /^-?\d+$/.test(a[1] ?? "") ? 2 : -1;
    } else if (/^(?:-n-?\d+|-\d+|--adjustment=-?\d+)$/.test(a[0] ?? "")) {
      i = 1;
    }
    if (i < 0) {
      return null;
    }
  } else if (w === "stdbuf") {
    // stdbuf -i/-o/-e MODE ... CMD...
    for (; i < a.length && a[i].startsWith("-"); i++) {
      if (/^(?:-[ioe]|--input|--output|--error)$/.test(a[i])) {
        i++;
      } else if (!/^(?:-[ioe]\S+|--(?:input|output|error)=\S+)$/.test(a[i])) {
        return null;
      }
    }
  } else if (w === "env") {
    // env CMD...: no option (-i, -u, -S, -C, ...) and no NAME=VALUE.
    if (a.length === 0 || a[0].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(a[0])) {
      return null;
    }
  } else {
    return null;
  }
  return i < a.length ? i + 1 : null;
}

// What xargs may run over a find's exact listing: readers of the files named.
const XARGS_LISTED_READERS = new Set(["grep", "wc", "head", "tail", "file", "stat", "ls", "du"]);

/** `xargs -0 [opts] CMD ARGS` where CMD reads the files it is given and the rest is read-only. */
function xargsListedReadOnly(argv: readonly string[]): boolean {
  const args = argv.slice(1);
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    if (XARGS_FLAGS.has(args[i])) {
      i++;
    } else if (
      XARGS_ARG.has(args[i]) &&
      args[i] !== "-d" &&
      args[i] !== "--delimiter" &&
      i + 1 < args.length
    ) {
      i += 2;
    } else {
      return false;
    }
  }
  const cmd = args.slice(i);
  if (!XARGS_LISTED_READERS.has(cmd[0] ?? "")) {
    return false;
  }
  // Names from a file (wc --files0-from, grep -f FILE reads patterns: allowed; -r reads trees: the fileset holds them).
  if (cmd.some((a) => a.startsWith("--files0"))) {
    return false;
  }
  return classifyArgv(cmd).readOnly;
}

/** Is one simple command (its words, quotes removed) on the strict read-only allowlist? */
export function classifyArgv(argv: readonly string[]): ShellClassification {
  if (argv.length === 0) {
    return { readOnly: false, code: "no-command" };
  }
  const [cmd, ...args] = argv;
  // A path to a program (./x, /usr/bin/x) is not the allowlisted program.
  if (cmd.includes("/")) {
    return { readOnly: false, code: "command-not-allowlisted", detail: cmd };
  }
  // A wrapper (timeout, nice, stdbuf, env CMD) is the command it runs.
  // Not for a program whose reading depends on where it stands in the line
  // (git and gh: the repository-config checks; find: -exec file sets; xargs: its input).
  const wrapped = wrapperWords(argv);
  if (wrapped !== null) {
    const innerProg = argv[wrapped];
    if (["git", "gh", "find", "xargs"].includes(innerProg)) {
      return { readOnly: false, code: "argument-not-read-only", detail: `${cmd} ${innerProg}` };
    }
    const v = classifyArgv(argv.slice(wrapped));
    return v.readOnly ? { ...v, argv, inner: wrapped + (v.inner ?? 0) } : v;
  }
  let result: Check;
  let gitImplicit: { sub: string; args: string[]; global: string[] } | null = null;
  if (VERSION_ONLY.has(cmd)) {
    result =
      args.length === 1 && args[0] === "--version"
        ? { ok: true }
        : { ok: false, detail: `${cmd}: only --version` };
  } else if (cmd === "env") {
    // `env` with arguments runs a program; bare `env` only prints.
    result =
      args.length === 0 ? { ok: true } : { ok: false, detail: "env with arguments runs a program" };
  } else if (cmd === "command") {
    // `command -v X` only reports; `command X` runs X.
    result =
      (args[0] === "-v" || args[0] === "-V") &&
      args.length >= 2 &&
      !args.slice(1).some((a) => a.startsWith("-"))
        ? { ok: true }
        : { ok: false, detail: "only command -v NAME" };
  } else if (cmd === "xargs") {
    result = xargsReadOnly(args);
  } else if (AWKS.has(cmd)) {
    result = awkReadOnly(args);
  } else if (SEDS.has(cmd)) {
    result = sedReadOnly(args);
  } else if (PDF_READERS.has(cmd)) {
    result = pdfReadOnly(cmd, args);
  } else if (cmd === "nvidia-smi") {
    result = nvidiaSmiReadOnly(args);
  } else if (MPI_WRAPPERS.has(cmd)) {
    result = mpiWrapperReadOnly(args);
  } else if (cmd === "gh") {
    const g = ghReadOnly(args);
    result = g.ok ? { ok: true } : g;
    // gh reads the repository's remotes with git, output captured (no pager).
    if (g.ok && g.repoScoped) {
      gitImplicit = { sub: "remote", args: ["-v"], global: ["--no-pager"] };
    }
  } else if (cmd === "numactl") {
    result =
      args.length === 1 && NUMACTL_SHOW.has(args[0])
        ? { ok: true }
        : { ok: false, detail: "numactl: only --hardware or --show" };
  } else if (!Object.hasOwn(COMMANDS, cmd)) {
    return { readOnly: false, code: "command-not-allowlisted", detail: cmd };
  } else {
    const s = COMMANDS[cmd];
    if (s === "any") {
      result = { ok: true };
    } else if (s === "set") {
      result =
        args.length > 0 &&
        args.every(
          (a, i) =>
            /^[-+][euxo]+$/.test(a) ||
            (/^[-+][a-z]*o$/.test(args[i - 1] ?? "") &&
              ["pipefail", "errexit", "nounset", "xtrace"].includes(a)),
        )
          ? { ok: true }
          : { ok: false, detail: "set: only -e, -u, -x and -o pipefail/errexit/nounset/xtrace" };
    } else if (s === "find") {
      result = findReadOnly(args);
    } else if (s === "git") {
      result = gitReadOnly(args);
    } else if (cmd === "jq") {
      result = jqReadOnly(args);
    } else {
      const r = parseOptions(args, s);
      result =
        r.ok && s.check && !s.check(r)
          ? { ok: false, detail: `${cmd}: operand not allowed` }
          : r.ok
            ? { ok: true }
            : r;
    }
  }
  if (!result.ok) {
    return { readOnly: false, code: "argument-not-read-only", detail: result.detail ?? cmd };
  }
  return {
    readOnly: true,
    argv,
    ...(result.git ? { git: result.git } : {}),
    ...(gitImplicit ? { gitImplicit } : {}),
  };
}

/** Is a POSIX shell command (one simple command) on the strict read-only allowlist? */
export function classifyShellCommand(command: unknown): ShellClassification {
  const parsed = splitSimpleCommand(command);
  if (!parsed.ok) {
    return {
      readOnly: false,
      code: parsed.code,
      ...(parsed.detail ? { detail: parsed.detail } : {}),
    };
  }
  return classifyArgv(parsed.argv);
}

/** One git command of a read-only line: where it runs and what it runs (for the repository-config check). */
export type GitCall = Readonly<{
  cwd: string;
  sub: string;
  args: readonly string[];
  /** The options before the subcommand (-C DIR, --no-pager). */
  global: readonly string[];
}>;

export type CompoundClassification =
  | Readonly<{
      readOnly: true;
      commands: readonly SimpleCommand[];
      gits: readonly GitCall[];
    }>
  | Readonly<{
      readOnly: false;
      code: string;
      detail?: string;
      /** The parsed commands, when the line parsed (for the rules that decide what is not read-only). */
      commands?: readonly SimpleCommand[];
      /** The simple command that is not read-only (its words joined by blanks), when the line parsed. */
      segment?: string;
    }>;

/** A simple command as the shell runs it: assignments, words and redirections, joined by blanks. */
function segmentOf(c: SimpleCommand): string {
  return [
    ...c.assigns.map((a) => `${a.name}=${a.value}`),
    ...c.argv,
    ...c.redirects.map((r) => r.text),
  ]
    .join(" ")
    .slice(0, 400);
}

/**
 * Is a POSIX command line read-only? It is when it parses (./shell-compound.ts:
 * lists, pipelines, harmless redirections, the known expansions, `cd`) and
 * every simple command in it is on the strict allowlist with no variable
 * assignment in front (an assignment can change what an allowlisted program
 * runs, such as GIT_EXTERNAL_DIFF or PAGER).
 */
export function classifyCompound(command: unknown, ctx: ShellContext): CompoundClassification {
  // A file read as input (`< FILE`) or a here-document is data for an allowlisted
  // command (its path is one of the command's words for the path rules); a file
  // written by a redirection is never read-only.
  const p = parseCompound(command, ctx, { fileRedirects: true });
  if (!p.ok) {
    return { readOnly: false, code: p.code, ...(p.detail ? { detail: p.detail } : {}) };
  }
  const gits: GitCall[] = [];
  const host = ctx.readOnlyArgv ?? [];
  for (const c of p.commands) {
    const segment = segmentOf(c);
    if (c.writes?.length) {
      return { readOnly: false, code: "redirect", commands: p.commands, segment };
    }
    if (c.argv[0] === "cd") {
      continue;
    }
    if (c.assigns.length) {
      return { readOnly: false, code: "env-assignment", commands: p.commands, segment };
    }
    // An exact argument vector the host application declares read-only (its own CLI's
    // status commands): words equal one by one, nothing more (the engine still checks
    // that the program word resolves along PATH to the machine's own file).
    if (host.some((h) => h.length === c.argv.length && h.every((w, i) => w === c.argv[i]))) {
      continue;
    }
    // xargs over exactly the files a find lists (-print0 | xargs -0): a content
    // reader is read-only too, every listed file being checked by the path rules.
    if (c.xargsListed && xargsListedReadOnly(c.argv)) {
      continue;
    }
    // export NAME=VALUE the parser read: an assignment (exportedName), nothing runs.
    if (c.exports?.length && c.argv[0] === "export") {
      continue;
    }
    const v = classifyArgv(c.argv);
    if (!v.readOnly) {
      return {
        readOnly: false,
        code: v.code,
        ...(v.detail ? { detail: v.detail } : {}),
        commands: p.commands,
        segment,
      };
    }
    if (v.git) {
      const g = v.git;
      const argv = c.argv.slice(v.inner ?? 0);
      // The subcommand's position: after git's own options (-C DIR, --no-pager).
      let at = 1;
      while (at < argv.length && argv[at].startsWith("-")) {
        at += argv[at] === "-C" ? 2 : 1;
      }
      for (const d of c.cwds) {
        gits.push({
          cwd: g.cdirs.reduce((acc, x) => path.resolve(acc, x), d),
          sub: g.sub,
          args: argv.slice(at + 1),
          global: argv.slice(1, at),
        });
      }
    }
    if (v.gitImplicit) {
      for (const d of c.cwds) {
        gits.push({ cwd: d, ...v.gitImplicit });
      }
    }
  }
  return { readOnly: true, commands: p.commands, gits };
}

// PowerShell: a minimal read-only set of cmdlets and aliases, one simple
// command, with PowerShell's own metacharacters refused.
const PS_REFUSED = /[|&;<>()$`@{}[\]\n\r#]/;
const PS_COMMANDS = new Set([
  "get-childitem",
  "gci",
  "dir",
  "ls",
  "get-content",
  "gc",
  "cat",
  "type",
  "get-location",
  "pwd",
  "gl",
  "get-item",
  "gi",
  "test-path",
  "select-string",
  "sls",
  "get-filehash",
  "resolve-path",
  "get-date",
]);

/** Is a PowerShell command one of the read-only cmdlets, as one simple command? */
export function classifyPowerShellCommand(command: unknown): ShellClassification {
  if (typeof command !== "string" || command.trim() === "") {
    return { readOnly: false, code: "no-command" };
  }
  if (command.length > 4096) {
    return { readOnly: false, code: "command-too-long" };
  }
  if (PS_REFUSED.test(command)) {
    return { readOnly: false, code: "shell-metacharacter" };
  }
  const argv = command.trim().split(/\s+/);
  const cmd = argv[0].replace(/^['"]|['"]$/g, "").toLowerCase();
  if (!PS_COMMANDS.has(cmd)) {
    return { readOnly: false, code: "command-not-allowlisted", detail: argv[0] };
  }
  return { readOnly: true, argv };
}

/**
 * The kit's default ShellClassifier: the strict allowlist above for POSIX
 * shells and PowerShell. A command it does not accept is not refused; it is
 * irreversible, so it waits for a person.
 */
export const strictShellClassifier: ShellClassifier = {
  classify(command, dialect, ctx): ShellVerdict {
    if (dialect === "powershell") {
      const v = classifyPowerShellCommand(command);
      return v.readOnly ? { readOnly: true } : v;
    }
    if (ctx) {
      // With the directory and home known: lists, pipelines and the known expansions too.
      const v = classifyCompound(command, ctx);
      if (!v.readOnly) {
        return {
          readOnly: false,
          code: v.code,
          ...(v.detail ? { detail: v.detail } : {}),
          ...(v.segment ? { segment: v.segment } : {}),
        };
      }
      return {
        readOnly: true,
        commands: v.commands,
        gits: v.gits,
        ...(v.gits.length ? { git: { cdirs: [] } } : {}),
      };
    }
    const v = classifyShellCommand(command);
    if (!v.readOnly) {
      return v;
    }
    return v.git || v.gitImplicit
      ? { readOnly: true, git: { cdirs: v.git?.cdirs ?? [] } }
      : { readOnly: true };
  },
};
