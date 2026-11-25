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

// ─── Option specs ───────────────────────────────────────────────────────
//
//   flags     short options without a value
//   args      short options that take a value (rest of the cluster, or next word)
//   optArgs   short options with an optional value, attached only (`-M50`, `-Iseconds`)
//   long      long options without a value
//   longArgs  long options that take a value (`--x=v` or `--x v`)
//   longOpt   long options with an optional value, `=` form only (`--color[=when]`)
//   numeric   `-<digits>` is accepted (head -5, grep -3, git log -20)
//   maxPos    most positionals allowed
//   check     extra check on the parsed result

type Parsed = { positionals: string[]; options: { name: string; value?: string }[] };

export type OptionSpec = Readonly<{
  flags: ReadonlySet<string>;
  args: ReadonlySet<string>;
  optArgs: ReadonlySet<string>;
  long: ReadonlySet<string>;
  longArgs: ReadonlySet<string>;
  longOpt: ReadonlySet<string>;
  numeric: boolean;
  maxPos: number;
  check: ((p: Parsed) => boolean) | null;
}>;

type Check =
  | Readonly<{ ok: true; git?: Readonly<{ sub: string; cdirs: string[] }> }>
  | Readonly<{ ok: false; detail: string }>;

export type ParseResult = (Parsed & { ok: true }) | Readonly<{ ok: false; detail: string }>;

const words = (s: string) => s.split(/\s+/).filter(Boolean);

function spec(
  o: {
    flags?: string;
    args?: string;
    optArgs?: string;
    long?: string;
    longArgs?: string;
    longOpt?: string;
    numeric?: boolean;
    maxPos?: number;
    check?: ((p: Parsed) => boolean) | null;
  } = {},
): OptionSpec {
  return {
    flags: new Set(o.flags ?? ""),
    args: new Set(o.args ?? ""),
    optArgs: new Set(o.optArgs ?? ""),
    long: new Set(words(o.long ?? "")),
    longArgs: new Set(words(o.longArgs ?? "")),
    longOpt: new Set(words(o.longOpt ?? "")),
    numeric: o.numeric ?? false,
    maxPos: o.maxPos ?? Infinity,
    check: o.check ?? null,
  };
}

/** Parse `args` against `s`, getopt style, exact long-option names only. */
export function parseOptions(args: readonly string[], s: OptionSpec): ParseResult {
  const positionals: string[] = [];
  const options: { name: string; value?: string }[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (a === "-" || !a.startsWith("-")) {
      positionals.push(a);
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq < 0 ? a.slice(2) : a.slice(2, eq);
      const value = eq < 0 ? undefined : a.slice(eq + 1);
      if (s.long.has(name) && value === undefined) {
        options.push({ name: `--${name}` });
      } else if (s.longOpt.has(name)) {
        options.push({ name: `--${name}`, value });
      } else if (s.longArgs.has(name)) {
        if (value !== undefined) {
          options.push({ name: `--${name}`, value });
        } else if (i + 1 < args.length) {
          options.push({ name: `--${name}`, value: args[++i] });
        } else {
          return { ok: false, detail: `${a} needs a value` };
        }
      } else {
        return {
          ok: false,
          detail: `option ${eq < 0 ? a : a.slice(0, eq)} is not on the read-only list`,
        };
      }
      continue;
    }
    if (s.numeric && /^-\d+$/.test(a)) {
      options.push({ name: "-N", value: a.slice(1) });
      continue;
    }
    // A short-option cluster.
    for (let j = 1; j < a.length; j++) {
      const c = a[j];
      if (s.flags.has(c)) {
        options.push({ name: `-${c}` });
      } else if (s.optArgs.has(c)) {
        options.push({ name: `-${c}`, value: a.slice(j + 1) || undefined });
        break;
      } else if (s.args.has(c)) {
        const rest = a.slice(j + 1);
        if (rest) {
          options.push({ name: `-${c}`, value: rest });
        } else if (i + 1 < args.length) {
          options.push({ name: `-${c}`, value: args[++i] });
        } else {
          return { ok: false, detail: `-${c} needs a value` };
        }
        break;
      } else {
        return {
          ok: false,
          detail: `option -${c}${j === 1 && a.length > 2 ? ` (in ${a})` : ""} is not on the read-only list`,
        };
      }
    }
  }
  if (positionals.length > s.maxPos) {
    return { ok: false, detail: `at most ${s.maxPos} operand(s)` };
  }
  return { ok: true, positionals, options };
}

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
  printenv: spec({ flags: "0", long: "null" }),
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
};

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
];

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
]);

export type ShellClassification =
  | Readonly<{
      readOnly: true;
      argv: readonly string[];
      git?: Readonly<{ sub: string; cdirs: readonly string[] }>;
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
  let result: Check;
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
  return { readOnly: true, argv, ...(result.git ? { git: result.git } : {}) };
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
    }>;

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
  for (const c of p.commands) {
    if (c.writes?.length) {
      return { readOnly: false, code: "redirect", commands: p.commands };
    }
    if (c.argv[0] === "cd") {
      continue;
    }
    if (c.assigns.length) {
      return { readOnly: false, code: "env-assignment", commands: p.commands };
    }
    const v = classifyArgv(c.argv);
    if (!v.readOnly) {
      return {
        readOnly: false,
        code: v.code,
        ...(v.detail ? { detail: v.detail } : {}),
        commands: p.commands,
      };
    }
    if (v.git) {
      const g = v.git;
      // The subcommand's position: after git's own options (-C DIR, --no-pager).
      let at = 1;
      while (at < c.argv.length && c.argv[at].startsWith("-")) {
        at += c.argv[at] === "-C" ? 2 : 1;
      }
      for (const d of c.cwds) {
        gits.push({
          cwd: g.cdirs.reduce((acc, x) => path.resolve(acc, x), d),
          sub: g.sub,
          args: c.argv.slice(at + 1),
          global: c.argv.slice(1, at),
        });
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
        return { readOnly: false, code: v.code, ...(v.detail ? { detail: v.detail } : {}) };
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
    return v.git ? { readOnly: true, git: { cdirs: v.git.cdirs } } : { readOnly: true };
  },
};
