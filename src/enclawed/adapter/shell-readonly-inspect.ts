// enclawed adapter kit: the read-only forms of the inspection programs whose
// arguments the getopt-style specs of ./shell-readonly.ts cannot express:
// awk (a program text), sed (a script text), nvidia-smi (multi-letter
// single-dash options and subcommands) and the MPI compiler wrappers
// (show-only modes).
//
// Each check accepts only forms that write no file, start no program the
// command line does not name, and change no system state; everything else is
// refused, which makes the command wait for a person.

export type InspectCheck = Readonly<{ ok: true }> | Readonly<{ ok: false; detail: string }>;

const OK: InspectCheck = { ok: true };
const no = (detail: string): InspectCheck => ({ ok: false, detail });

// ─── awk ────────────────────────────────────────────────────────────────
//
// An awk program reads its input and prints. It writes or runs something
// only through: system(); getline (`"cmd" | getline`, and `getline < FILE`
// reads a file the command line does not name); output redirection in print
// and printf (`> FILE`, `>> FILE`, `| "cmd"`, gawk's `|& "cmd"`); fflush and
// close (of such streams); a program loaded from a file (-f, gawk -i/-l/-E,
// @include, @load, mawk -W exec); gawk's indirect calls (`@f()`, which since
// gawk 4.1.2 reach built-ins such as system); and gawk's -o/-p/-d, which
// write awkprof.out / awkvars.out. ARGV and ARGC are refused too: assigning
// them makes awk read files the command line does not name.
//
// The command line accepts only -F FS and -v VAR=VALUE (data, never code, in
// every awk) and one inline program. The program is tokenized the way awk
// lexes it, so `|` and `>` inside a string or a regular expression literal
// are data: a single `|` (or `|&`) anywhere in code is refused, `||` is the
// logical or; `>` is refused anywhere inside a print or printf statement (its
// output position, and conservatively a parenthesized comparison there too)
// and is a comparison elsewhere (`$3 > 100`). Wherever two awks could read a
// construct differently (a `/` after a keyword or `$`, a `/` or a nested `[`
// inside a bracket expression of a regex literal, a newline inside
// parentheses), the program is refused rather than guessed.

const AWK_REFUSED_NAME = /\b(?:system|getline|fflush|close|ARGV|ARGC)\b/;

// Keywords and built-in functions: a `/` right after one is read as a
// regular expression by some awks and as division by none that matters, so it
// is refused (never guessed).
const AWK_KEYWORDS = new Set(
  "BEGIN END BEGINFILE ENDFILE function func if else while for do break continue next nextfile exit return delete in getline print printf switch case default length atan2 cos sin exp log sqrt int rand srand index match split sprintf sub gsub substr tolower toupper gensub strftime systime mktime and or xor lshift rshift compl asort asorti patsplit isarray typeof strtonum bindtextdomain dcgettext dcngettext mkbool".split(
    " ",
  ),
);
// The keywords whose parenthesized condition is followed by a statement (a
// `/` after its `)` starts a regular expression, not a division).
const AWK_CONTROL = new Set(["if", "while", "for", "switch"]);
const AWK_POSIX_CLASS =
  /^\[:(?:alpha|digit|alnum|upper|lower|space|blank|punct|print|graph|cntrl|xdigit):\]/;
const AWK_NUMBER = /^(?:0[xX][0-9A-Fa-f]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;
const AWK_NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
// Longest first.
const AWK_OPS = [
  "**=",
  "^=",
  "+=",
  "-=",
  "*=",
  "%=",
  "**",
  "==",
  "!=",
  "<=",
  ">=",
  ">>",
  "&&",
  "||",
  "!~",
  "++",
  "--",
  "|&",
  "+",
  "-",
  "*",
  "%",
  "^",
  "!",
  "~",
  "<",
  ">",
  "=",
  "?",
  ":",
  ",",
  ";",
  "{",
  "}",
  "[",
  "]",
  "|",
  "$",
];

// What the previous token leaves the lexer expecting: an operand (a `/`
// starts a regular expression), an operator (a `/` divides), or unknown.
type AwkPrev = "start" | "operand" | "ambiguous";

/** Scan a regular expression literal from its opening `/`; the index after its closing `/`, or a refusal. */
function awkRegexEnd(src: string, open: number): number | string {
  let j = open + 1;
  let inBracket = false;
  for (;;) {
    if (j >= src.length) {
      return "an unterminated regular expression";
    }
    const ch = src[j];
    if (ch === "\n" || ch === "\r") {
      return "a newline in a regular expression";
    }
    if (ch === "\\") {
      // Every awk lexer consumes the character after a backslash, inside a
      // bracket expression or not.
      if (j + 1 >= src.length || src[j + 1] === "\n") {
        return "a backslash at the end of a regular expression";
      }
      j += 2;
      continue;
    }
    if (!inBracket) {
      if (ch === "/") {
        return j + 1;
      }
      if (ch === "[") {
        inBracket = true;
        j++;
        if (src[j] === "^") {
          j++;
        }
        // `[]...]` (a literal `]` first) is read differently by different lexers.
        if (src[j] === "]") {
          return "a ] first in a bracket expression";
        }
        continue;
      }
      j++;
      continue;
    }
    // Inside a bracket expression: a `/` there ends the literal in some awks
    // and not in others, and a nested `[` is tracked differently; only
    // [:class:] is accepted.
    if (ch === "/") {
      return "a / inside a bracket expression";
    }
    if (ch === "]") {
      inBracket = false;
      j++;
      continue;
    }
    if (ch === "[") {
      const m = AWK_POSIX_CLASS.exec(src.slice(j));
      if (!m) {
        return "a [ inside a bracket expression";
      }
      j += m[0].length;
      continue;
    }
    j++;
  }
}

/** Is an inline awk program read-only (see the header)? */
export function awkProgramReadOnly(src: string): InspectCheck {
  const refuse = (d: string) => no(`awk program: ${d}`);
  if (src.includes("@")) {
    return refuse("@ (gawk directives and indirect calls) is not on the read-only list");
  }
  const named = AWK_REFUSED_NAME.exec(src);
  if (named) {
    return refuse(`${named[0]} is not on the read-only list`);
  }
  let prev: AwkPrev = "start";
  // One entry per open parenthesis: true when it holds a control condition.
  const parens: boolean[] = [];
  let brackets = 0;
  let control = false;
  // The parenthesis depth of the print or printf statement being read, -1: none.
  let printDepth = -1;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "\\") {
      if (src[i + 1] === "\n") {
        i += 2; // a continued line
        continue;
      }
      return refuse("a backslash outside a string");
    }
    if (c === "\n") {
      if (prev !== "start" && (parens.length > 0 || brackets > 0)) {
        return refuse("a newline inside parentheses or brackets");
      }
      // A newline after an operand ends the statement (POSIX awk grammar).
      if (printDepth >= 0 && prev === "operand") {
        printDepth = -1;
      }
      prev = "start";
      i++;
      continue;
    }
    if (c === "#") {
      while (i < src.length && src[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      for (; j < src.length && src[j] !== '"'; j++) {
        if (src[j] === "\\") {
          j++;
        } else if (src[j] === "\n") {
          return refuse("a newline in a string");
        }
      }
      if (j >= src.length) {
        return refuse("an unterminated string");
      }
      i = j + 1;
      prev = "operand";
      control = false;
      continue;
    }
    if (c === "/") {
      if (prev === "start") {
        const end = awkRegexEnd(src, i);
        if (typeof end === "string") {
          return refuse(end);
        }
        i = end;
        prev = "operand";
      } else if (prev === "operand") {
        i += src[i + 1] === "=" ? 2 : 1; // division, or /=
        prev = "start";
      } else {
        return refuse("a / that could be a division or a regular expression");
      }
      control = false;
      continue;
    }
    const num = AWK_NUMBER.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      prev = "operand";
      control = false;
      continue;
    }
    const name = AWK_NAME.exec(src.slice(i));
    if (name) {
      const w = name[0];
      i += w.length;
      control = AWK_CONTROL.has(w);
      if (w === "print" || w === "printf") {
        if (printDepth >= 0) {
          return refuse("a print inside a print statement");
        }
        printDepth = parens.length;
        prev = "ambiguous";
      } else if (w === "else" || w === "do") {
        prev = "start";
      } else {
        prev = AWK_KEYWORDS.has(w) ? "ambiguous" : "operand";
      }
      continue;
    }
    if (c === "(") {
      parens.push(control);
      control = false;
      prev = "start";
      i++;
      continue;
    }
    if (c === ")") {
      if (parens.length === 0) {
        return refuse("an unbalanced )");
      }
      prev = parens.pop() ? "start" : "operand";
      control = false;
      i++;
      continue;
    }
    const op = AWK_OPS.find((o) => src.startsWith(o, i));
    if (!op) {
      return refuse(`${JSON.stringify(c)} is not awk syntax the kit reads`);
    }
    i += op.length;
    control = false;
    if (op === "|" || op === "|&") {
      return refuse("a pipe (|) is not on the read-only list");
    }
    if ((op === ">" || op === ">>" || op === ">=") && printDepth >= 0) {
      return refuse("output redirection (>) in print is not on the read-only list");
    }
    if ((op === ";" || op === "}") && printDepth >= 0 && parens.length === printDepth) {
      printDepth = -1;
    }
    if (op === "[") {
      brackets++;
    } else if (op === "]") {
      if (brackets === 0) {
        return refuse("an unbalanced ]");
      }
      brackets--;
    }
    prev =
      op === "]" || op === "++" || op === "--" ? "operand" : op === "$" ? "ambiguous" : "start";
  }
  return OK;
}

/** awk, gawk, mawk, nawk: only -F FS, -v VAR=VALUE and one inline program (see the header). */
export function awkReadOnly(args: readonly string[]): InspectCheck {
  if (args.length === 1 && args[0] === "--version") {
    return OK;
  }
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === "--") {
      i++;
      break;
    }
    if (a === "-" || !a.startsWith("-")) {
      break;
    }
    if (a === "-F" || a === "-v") {
      if (i + 1 >= args.length) {
        return no(`awk ${a} needs a value`);
      }
      i += 2;
      continue;
    }
    // -F: and -vX=1: the value attached, as getopt and every awk read it.
    if (/^-[Fv]./.test(a)) {
      i++;
      continue;
    }
    // -f/--file, gawk -i/-l/-E/-e/-o/-p/-d/-D, mawk -W, ...
    return no(`awk option ${a} is not on the read-only list`);
  }
  const program = args[i];
  if (program === undefined) {
    return no("awk with no program text");
  }
  // After the program: input files and VAR=VALUE assignments. An awk that
  // permuted its options would read a later `-f` as one: refused.
  if (args.slice(i + 1).some((a) => a.startsWith("-") && a !== "-")) {
    return no("awk: an option after the program text");
  }
  return awkProgramReadOnly(program);
}

// ─── nvidia-smi ─────────────────────────────────────────────────────────
//
// nvidia-smi (NVIDIA driver 595, `nvidia-smi -h`) mixes queries with device
// modification options in one option set: -pm, -e, -p (reset ECC counts),
// -c, -dm, -r (GPU reset), -vm, -lgc, -rgc, -lmc, -ac, -rac, -pl, -cc, -am,
// -caa, -mig, -gtt, -t (unit LED), --gom, --auto-boost-*, --set-hostname, and
// subcommands that set state (mig, drain, clocks, boost-slider, ...). Only
// the query forms are accepted, each option word matched exactly: the
// summary (no arguments, -col), the lists (-L, -B), the full query (-q with
// -u, -x, --dtd, -d/--display, -i/--id) and the selective queries
// (--query-*=FIELDS with --format=csv[,noheader][,nounits], -i). -f/--filename
// and --debug write a file. -l/--loop and -lms/--loop-ms are read-only but
// never finish (they probe until interrupted), and dmon/pmon/daemon likewise:
// left out, a command that runs until someone stops it waits for a person.
// `topo -m` / `-mp` print the topology matrix.

const NVSMI_FLAGS = new Set([
  "-h",
  "--help",
  "--version",
  "-L",
  "--list-gpus",
  "-B",
  "--list-excluded-gpus",
  "-col",
  "--columns",
  "-q",
  "--query",
  "-u",
  "--unit",
  "-x",
  "--xml-format",
  "--dtd",
  "--help-query-gpu",
  "--help-query-supported-clocks",
  "--help-query-compute-apps",
  "--help-query-accounted-apps",
  "--help-query-retired-pages",
  "--help-query-remapped-rows",
]);
// Short options whose value is the next word.
const NVSMI_SHORT_ARG = new Set(["-i", "-d"]);
// Long options whose value is attached with `=`.
const NVSMI_LONG_ARG = new Set([
  "--id",
  "--display",
  "--query-gpu",
  "--query-supported-clocks",
  "--query-compute-apps",
  "--query-accounted-apps",
  "--query-retired-pages",
  "--query-remapped-rows",
  "--format",
]);
const NVSMI_FORMAT = new Set(["csv", "noheader", "nounits"]);
const NVSMI_TOPO = new Set(["-m", "--matrix", "-mp", "--matrix_pci"]);

/** nvidia-smi: only its query forms (see above). */
export function nvidiaSmiReadOnly(args: readonly string[]): InspectCheck {
  if (args[0] === "topo") {
    return args.length === 2 && NVSMI_TOPO.has(args[1])
      ? OK
      : no("nvidia-smi topo: only -m / --matrix and -mp / --matrix_pci");
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (NVSMI_FLAGS.has(a)) {
      continue;
    }
    if (NVSMI_SHORT_ARG.has(a)) {
      const v = args[i + 1];
      if (v === undefined || v === "" || v.startsWith("-")) {
        return no(`nvidia-smi ${a} needs a value`);
      }
      i++;
      continue;
    }
    const eq = a.indexOf("=");
    if (eq > 0 && NVSMI_LONG_ARG.has(a.slice(0, eq)) && eq + 1 < a.length) {
      const v = a.slice(eq + 1);
      if (a.startsWith("--format=") && !v.split(",").every((x) => NVSMI_FORMAT.has(x))) {
        return no("nvidia-smi --format: only csv, noheader, nounits");
      }
      continue;
    }
    return no(`nvidia-smi ${a} is not on the read-only list`);
  }
  return OK;
}

// ─── MPI compiler wrappers ──────────────────────────────────────────────
//
// mpicc and its siblings print the compiler command line they would run
// (Open MPI --showme[:part], MPICH -show, -compile_info, -link_info) or the
// compiler's version (--version, which runs the underlying compiler with
// --version only). Any other argument compiles or links: refused. The
// compiler the wrapper starts is found along PATH; ./program-path.ts checks
// the common compiler names for these wrappers.

export const MPI_WRAPPERS: ReadonlySet<string> = new Set([
  "mpicc",
  "mpicxx",
  "mpic++",
  "mpiCC",
  "mpif77",
  "mpif90",
  "mpifort",
]);
const MPI_SHOW =
  /^(?:--version|-show|-compile_info|-link_info|--?showme(?::(?:compile|link|command|incdirs|libdirs|libs|libdirs_static|libs_static|version|help))?)$/;

/** An MPI compiler wrapper: one show or version argument only. */
export function mpiWrapperReadOnly(args: readonly string[]): InspectCheck {
  return args.length === 1 && MPI_SHOW.test(args[0])
    ? OK
    : no("MPI wrapper: only --version, -show, --showme[:part], -compile_info, -link_info");
}

// ─── sed ────────────────────────────────────────────────────────────────
//
// sed prints its input as its script says. It writes or runs something only
// through: -i/--in-place (rewrites the files it is given); the w and W
// commands and the s///w flag (write a file); r and R (read a file the
// command line does not name); e and the s///e flag (GNU: run the pattern
// space as a command); -f/--file (a script from a file). GNU sed permutes its
// options, so an option after a file operand still counts: every word is
// checked.
//
// Accepted: the options -n/--quiet/--silent, -E/-r/--regexp-extended,
// -s/--separate, -u/--unbuffered, -z/--null-data, and the script, one -e/
// --expression or more, or else the first operand. The script may hold only
// addresses (N, $, FIRST~STEP, /REGEX/ with I or M, and ADDR,ADDR / ADDR,+N /
// ADDR,~N), ! and { } groups, and the commands that only print or move
// through the input: p P = l n N d D and q Q (with an exit code), and the
// substitution s/RE/REPL/ with only the flags g p i I m M and a number (any
// delimiter but a backslash, a blank, a letter or a digit; the delimiter or a
// newline inside a bracket expression, or a newline anywhere in it, refused:
// seds differ there on where the parts end). Any other command, or a regex
// form two seds could read differently, is refused.

const SED_FLAGS = new Set([
  "-n",
  "--quiet",
  "--silent",
  "-E",
  "-r",
  "--regexp-extended",
  "-s",
  "--separate",
  "-u",
  "--unbuffered",
  "-z",
  "--null-data",
]);
const SED_SHORT = new Set(["n", "E", "r", "s", "u", "z"]);

/** One /REGEX/ starting at `at` (the opening /): the index after the closing /, or -1. */
function sedRegexEnd(t: string, at: number): number {
  let i = at + 1;
  while (i < t.length) {
    const c = t[i];
    if (c === "\n") {
      return -1;
    }
    if (c === "\\") {
      if (i + 1 >= t.length || t[i + 1] === "\n") {
        return -1;
      }
      i += 2;
      continue;
    }
    if (c === "[") {
      // A bracket expression: ] first (or after ^) is literal; a / or newline inside is
      // read differently by different seds, so it is refused.
      let j = i + 1;
      if (t[j] === "^") {
        j++;
      }
      if (t[j] === "]") {
        j++;
      }
      while (j < t.length && t[j] !== "]") {
        if (t[j] === "/" || t[j] === "\n") {
          return -1;
        }
        j++;
      }
      if (j >= t.length) {
        return -1;
      }
      i = j + 1;
      continue;
    }
    if (c === "/") {
      return i + 1;
    }
    i++;
  }
  return -1;
}

/** One address at `at`: the index after it, or -1 (none there, or a form that is refused). */
function sedAddressEnd(t: string, at: number, second: boolean): number {
  const rest = t.slice(at);
  const m = (second ? /^(?:\d+|\$|[+~]\d+)/ : /^(?:\d+~\d+|\d+|\$)/).exec(rest);
  if (m) {
    return at + m[0].length;
  }
  if (t[at] === "/") {
    let i = sedRegexEnd(t, at);
    if (i < 0) {
      return -1;
    }
    while (t[i] === "I" || t[i] === "M") {
      i++;
    }
    return i;
  }
  return -1;
}

/**
 * The substitution at t[at] (`s`): the index after its flags, or -1. The
 * delimiter is any character but a backslash, a newline or a blank; the
 * regular expression honors escapes and bracket expressions; the
 * replacement honors escapes; the flags are only g, p, i, I, m, M and digits.
 */
function sedSubstitutionEnd(t: string, at: number): number {
  const d = t[at + 1];
  if (d === undefined || /[\\\n \t;{}]/.test(d) || /[A-Za-z0-9]/.test(d)) {
    return -1;
  }
  let i = at + 2;
  for (let part = 0; part < 2; part++) {
    let inBracket = false;
    for (; i < t.length; i++) {
      const c = t[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (part === 0 && !inBracket && c === "[") {
        inBracket = true;
        if (t[i + 1] === "^") {
          i++;
        }
        if (t[i + 1] === "]") {
          i++;
        }
        continue;
      }
      // The delimiter or a newline inside a bracket expression: seds differ on where it ends.
      if (c === "\n" || (inBracket && c === d)) {
        return -1;
      }
      if (inBracket) {
        if (c === "[" && /[:.=]/.test(t[i + 1] ?? "")) {
          const close = t.indexOf(`${t[i + 1]}]`, i + 2);
          if (close < 0 || t.slice(i, close).includes(d)) {
            return -1;
          }
          i = close + 1;
        } else if (c === "]") {
          inBracket = false;
        }
        continue;
      }
      if (c === d) {
        break;
      }
    }
    if (i >= t.length) {
      return -1;
    }
    i++;
  }
  while (i < t.length && /[gpiImM0-9]/.test(t[i])) {
    i++;
  }
  return i;
}

/** A sed script that only prints or moves through its input (see the header). */
export function sedScriptReadOnly(t: string): InspectCheck {
  let i = 0;
  let depth = 0;
  const blank = (c: string | undefined) => c === " " || c === "\t";
  const skip = () => {
    while (i < t.length && (blank(t[i]) || t[i] === ";" || t[i] === "\n")) {
      i++;
    }
  };
  for (skip(); i < t.length; skip()) {
    if (t[i] === "}") {
      if (--depth < 0) {
        return no("sed: an unmatched }");
      }
      i++;
      continue;
    }
    if (/[0-9$/]/.test(t[i])) {
      const e = sedAddressEnd(t, i, false);
      if (e < 0) {
        return no("sed: an address form that is not on the read-only list");
      }
      i = e;
      if (t[i] === ",") {
        const e2 = sedAddressEnd(t, i + 1, true);
        if (e2 < 0) {
          return no("sed: an address form that is not on the read-only list");
        }
        i = e2;
      }
    }
    while (blank(t[i])) {
      i++;
    }
    if (t[i] === "!") {
      i++;
      while (blank(t[i])) {
        i++;
      }
    }
    const c = t[i];
    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    // s/RE/REPL/FLAGS: it rewrites the pattern space it prints. Only the flags that
    // change what matches or prints (g p i I m M and a number); `w FILE` writes a
    // file and `e` runs the pattern space as a command: refused.
    if (c === "s") {
      const e = sedSubstitutionEnd(t, i);
      if (e < 0) {
        return no("sed: a substitution form that is not on the read-only list");
      }
      i = e;
      while (blank(t[i])) {
        i++;
      }
      if (i < t.length && t[i] !== ";" && t[i] !== "\n" && t[i] !== "}") {
        return no("sed: text after a command");
      }
      continue;
    }
    if (c === undefined || !"pP=lnNdDqQ".includes(c)) {
      return no(
        `sed: the command ${c === undefined ? "(none)" : JSON.stringify(c)} is not on the read-only list`,
      );
    }
    i++;
    if (c === "q" || c === "Q") {
      while (blank(t[i])) {
        i++;
      }
      while (/[0-9]/.test(t[i] ?? "")) {
        i++;
      }
    }
    while (blank(t[i])) {
      i++;
    }
    if (i < t.length && t[i] !== ";" && t[i] !== "\n" && t[i] !== "}") {
      return no("sed: text after a command");
    }
  }
  return depth === 0 ? OK : no("sed: an unclosed {");
}

/** sed / gsed: the print-only options and script forms (see the header). */
export function sedReadOnly(args: readonly string[]): InspectCheck {
  if (args.length === 1 && args[0] === "--version") {
    return OK;
  }
  const scripts: string[] = [];
  const operands: string[] = [];
  let ended = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (ended || a === "-" || !a.startsWith("-")) {
      operands.push(a);
      continue;
    }
    if (a === "--") {
      ended = true;
      continue;
    }
    if (SED_FLAGS.has(a)) {
      continue;
    }
    if (a === "-e" || a === "--expression") {
      if (i + 1 >= args.length) {
        return no(`sed ${a} needs a script`);
      }
      scripts.push(args[++i]);
      continue;
    }
    if (a.startsWith("--expression=")) {
      scripts.push(a.slice("--expression=".length));
      continue;
    }
    // Clustered short flags (-nE), possibly ending in e with its script (-ne 1p, -ne1p).
    if (/^-[A-Za-z]/.test(a) && !a.startsWith("--")) {
      let j = 1;
      for (; j < a.length && SED_SHORT.has(a[j]); j++) {
        /* a flag that only changes how input is read or printed */
      }
      if (j === a.length) {
        continue;
      }
      if (a[j] === "e") {
        const attached = a.slice(j + 1);
        if (attached) {
          scripts.push(attached);
        } else if (i + 1 < args.length) {
          scripts.push(args[++i]);
        } else {
          return no("sed -e needs a script");
        }
        continue;
      }
    }
    // -i/--in-place, -f/--file, --follow-symlinks, --debug, --posix, -l N, ...
    return no(`sed option ${a} is not on the read-only list`);
  }
  if (scripts.length === 0) {
    const first = operands.shift();
    if (first === undefined) {
      return no("sed with no script");
    }
    scripts.push(first);
  }
  for (const sc of scripts) {
    const v = sedScriptReadOnly(sc);
    if (!v.ok) {
      return v;
    }
  }
  return OK;
}
