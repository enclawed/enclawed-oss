// enclawed adapter kit: inline Python that only computes on its input.
//
// `python3 -c CODE` whose code can do nothing but read its standard input
// and arguments and print: no file, no program, no network, no code built
// at run time. Such code is a filter like `tr` or `grep`; what it is fed
// (a page fetched over the network, say) is data, never code it runs.
//
// The reading is deliberately narrow (a whitelist, not a list of bad
// things): every import must be one of a few pure modules; no name may
// begin or end with a double underscore anywhere in the text (string
// literals included), which closes the attribute-walk escapes
// (`().__class__.__mro__[1].__subclasses__()`); the builtins that open
// files, reach other modules or objects by a computed name, or run code
// (open, exec, eval, compile, getattr, setattr, delattr, globals, locals,
// vars, breakpoint, help, ...) are refused by name; of `sys`
// only the standard streams, argv and exit are used. Anything else: not
// pure, the ordinary rules decide.

import { parse } from "acorn";

const PURE_MODULES = new Set([
  "sys",
  "re",
  "html",
  "json",
  "collections",
  "unicodedata",
  "string",
  "math",
  "itertools",
  "base64",
  "binascii",
  "textwrap",
  "statistics",
]);
const REFUSED_NAMES =
  /\b(?:open|exec|eval|compile|getattr|setattr|delattr|hasattr|globals|locals|vars|breakpoint|help|memoryview|classmethod|staticmethod|property|super|type|object|importlib|builtins|os|io|subprocess|socket|shutil|pathlib|ctypes|codecs|operator|functools|attrgetter|methodcaller|pickle|marshal|signal)\b/;
const SYS_ALLOWED = new Set(["stdin", "stdout", "stderr", "argv", "exit", "maxsize"]);
const MAX_CODE = 8 * 1024;

/** Is this inline Python a pure filter (reads stdin and argv, prints, nothing else)? */
export function pythonIsPureFilter(code: unknown): boolean {
  if (typeof code !== "string" || code.length === 0 || code.length > MAX_CODE) {
    return false;
  }
  if (code.includes("__") || REFUSED_NAMES.test(code)) {
    return false;
  }
  // Every import statement, wherever it is (`;` joined, indented, after `if`).
  for (const m of code.matchAll(/(?:^|[;:\n])\s*(?:from\s+(\S+)\s+import\b|import\s+([^;\n]+))/g)) {
    const mods = m[1]
      ? [m[1]]
      : m[2].split(",").map((x) =>
          x
            .trim()
            .split(/\s+as\s+/)[0]
            .trim(),
        );
    if (!mods.every((x) => PURE_MODULES.has(x))) {
      return false;
    }
  }
  // `import` anywhere else (inside an expression, after `else:` on one line, ...): refused.
  const importWords = code.match(/\bimport\b/g)?.length ?? 0;
  const importStatements =
    code.match(/(?:^|[;:\n])\s*(?:from\s+\S+\s+import\b|import\s)/g)?.length ?? 0;
  if (importWords !== importStatements) {
    return false;
  }
  for (const m of code.matchAll(/\bsys\s*\.\s*([A-Za-z_]\w*)/g)) {
    if (!SYS_ALLOWED.has(m[1])) {
      return false;
    }
  }
  // `sys` used other than as `sys.X` (passed along, aliased): refused.
  const sysWords = code.match(/\bsys\b/g)?.length ?? 0;
  const sysUses = code.match(/\bsys\s*\./g)?.length ?? 0;
  const sysImports = code.match(/\bimport\s+[^;\n]*\bsys\b/g)?.length ?? 0;
  return sysWords === sysUses + sysImports;
}

/**
 * The inline code of `python3 [-I|-E|-s|-S|-B|-u|-q]... -c CODE [ARG...]`,
 * when the flags include -I: isolated mode puts neither the current
 * directory nor PYTHONPATH on the module path, so `import re` loads the
 * standard library, never a file the project planted. Otherwise null.
 */
function isolatedInlineCode(argv: readonly string[]): string | null {
  if (!/^python3?(?:\.\d+)?$/.test(argv[0] ?? "")) {
    return null;
  }
  let i = 1;
  let isolated = false;
  while (i < argv.length && /^-[IEsSBuq]+$/.test(argv[i])) {
    isolated ||= argv[i].includes("I");
    i++;
  }
  return isolated && argv[i] === "-c" && typeof argv[i + 1] === "string" ? argv[i + 1] : null;
}

/**
 * `python3 -I -c CODE [ARG...]` with a pure-filter CODE: the code it runs is
 * CODE, never what it reads on its input.
 */
export function isPurePythonFilter(argv: readonly string[]): boolean {
  const code = isolatedInlineCode(argv);
  return code !== null && pythonIsPureFilter(code);
}

/**
 * `python3 -I -c CODE` whose only reach beyond a pure filter is one
 * `urllib.request.urlopen('URL')` (optionally `timeout=N`) of a literal URL
 * `isNamed` accepts: `import urllib.request` and that one call are the only
 * places `urllib` appears, so there is no Request, no data, no header, no
 * other method and no urlretrieve; urlopen of a URL with no data is a GET.
 */
export function isPythonGetOf(argv: readonly string[], isNamed: (url: string) => boolean): boolean {
  const code = isolatedInlineCode(argv);
  return code !== null && pythonCodeIsGetOf(code, isNamed);
}

/** The code reading of isPythonGetOf, on code from wherever it comes (inline, here-document, script). */
export function pythonCodeIsGetOf(code: string, isNamed: (url: string) => boolean): boolean {
  if (code.length > MAX_CODE) {
    return false;
  }
  const calls = [
    ...code.matchAll(
      /urllib\.request\.urlopen\(\s*(['"])([^'"\\\s]+)\1\s*(?:,\s*timeout\s*=\s*\d+(?:\.\d+)?\s*)?\)/g,
    ),
  ];
  if (calls.length !== 1 || !isNamed(calls[0][2])) {
    return false;
  }
  // `import urllib.request` (alone or in a list such as `import urllib.request, sys`), once.
  const imports = [...code.matchAll(/(^|[;\n])([ \t]*)import\s+([^;\n]+)/g)].filter((m) =>
    m[3].split(",").some((x) => x.trim() === "urllib.request"),
  );
  if (imports.length !== 1) {
    return false;
  }
  const urllibWords = code.match(/\burllib\b/g)?.length ?? 0;
  if (urllibWords !== 2) {
    return false;
  }
  // The rest, with the import and the call taken out, must be a pure filter.
  const others = imports[0][3]
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x !== "urllib.request");
  const rest = code
    .replace(calls[0][0], "_page")
    .replace(
      imports[0][0],
      `${imports[0][1]}${imports[0][2]}${others.length ? `import ${others.join(", ")}` : "pass"}`,
    );
  return pythonIsPureFilter(rest.trim() === "" ? "pass" : rest);
}

/**
 * One sed script that only substitutes or prints: `s<d>RE<d>REPL<d>FLAGS`
 * with flags from g, p, i, I and digits (no w file, no e), or `Np`, `N,Mp`,
 * `Nq`, `$p`. Anything else (w, r, e, W, R commands, several commands): false.
 */
function sedScriptIsPure(script: string): boolean {
  if (/^(?:\d+|\$)(?:,(?:\d+|\$))?[pq]$/.test(script) || /^(?:\d+|\$)?[pq]$/.test(script)) {
    return true;
  }
  if (script[0] !== "s" || script.length < 4) {
    return false;
  }
  const d = script[1];
  if (/[\\\n\w\s]/.test(d)) {
    return false;
  }
  // Walk RE and REPL, honoring backslash escapes and (in RE) bracket expressions.
  let i = 2;
  for (let part = 0; part < 2; part++) {
    let inBracket = false;
    for (; i < script.length; i++) {
      const c = script[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (part === 0 && !inBracket && c === "[") {
        inBracket = true;
        // `[]...]` and `[^]...]`: a leading ] is a member.
        if (script[i + 1] === "^") {
          i++;
        }
        if (script[i + 1] === "]") {
          i++;
        }
        continue;
      }
      if (inBracket) {
        if (c === "[" && /[:.=]/.test(script[i + 1] ?? "")) {
          const close = script.indexOf(`${script[i + 1]}]`, i + 2);
          if (close < 0) {
            return false;
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
    if (i >= script.length) {
      return false;
    }
    i++;
  }
  return /^[gpiImM0-9]*$/.test(script.slice(i));
}

/** `sed [-n|-E|-r|-u|-z|--posix]... (SCRIPT | -e SCRIPT...)` with pure scripts and no file written or read as a script. */
export function isPureSedFilter(argv: readonly string[]): boolean {
  if (argv[0] !== "sed") {
    return false;
  }
  const scripts: string[] = [];
  let i = 1;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (/^-[nEruz]+$/.test(a) || a === "--posix" || a === "--quiet" || a === "--silent") {
      continue;
    }
    if (a === "-e" || a === "--expression") {
      if (typeof argv[i + 1] !== "string") {
        return false;
      }
      scripts.push(argv[++i]);
      continue;
    }
    if (a.startsWith("-")) {
      return false;
    }
    break;
  }
  if (scripts.length === 0) {
    if (i >= argv.length) {
      return false;
    }
    scripts.push(argv[i++]);
  }
  // Remaining words are input files (read): the caller's read rules decide them.
  return scripts.every(sedScriptIsPure) && argv.slice(i).every((a) => !a.startsWith("-"));
}

/** `tr` reads only its standard input and writes only its standard output. */
export function isTrFilter(argv: readonly string[]): boolean {
  return (
    argv[0] === "tr" && argv.slice(1).every((a) => /^-[cdsCt]+$/.test(a) || !a.startsWith("-"))
  );
}

// ─── node -e: one fetch of a literal URL, printed ───────────────────────

// An ESTree node from acorn (fields read by the ESTree specification).
// oxlint-disable-next-line typescript-eslint/no-explicit-any
type JsNode = { type: string; [k: string]: any };

const NODE_MEMBERS = new Set([
  "then",
  "catch",
  "text",
  "json",
  "log",
  "error",
  "message",
  "status",
]);

/**
 * `node -e CODE` whose code, read as a syntax tree, is exactly a promise
 * chain on one `fetch('URL')` of a string literal `isNamed` accepts: calls of
 * `fetch` (once), of `.then` / `.catch` / `.text` / `.json` and of
 * `console.log` / `console.error`; arrow functions with plain identifier
 * parameters and an expression body; string and number literals; members by
 * name only (then, catch, text, json, log, error, message, status), never
 * computed. No other name, global or construct. `fetch` with one argument is
 * a GET. The session's environment must be known and set no NODE_OPTIONS
 * (which could load code first).
 */
export function isNodeGetOf(
  argv: readonly string[],
  isNamed: (url: string) => boolean,
  environment: Readonly<Record<string, string>> | null | undefined,
): boolean {
  if (argv[0] !== "node" || argv.length !== 3 || (argv[1] !== "-e" && argv[1] !== "--eval")) {
    return false;
  }
  if (!environment || (environment.NODE_OPTIONS ?? "") !== "") {
    return false;
  }
  let ast: JsNode;
  try {
    ast = parse(argv[2], { ecmaVersion: "latest", sourceType: "script" }) as unknown as JsNode;
  } catch {
    return false;
  }
  if (ast.body.length !== 1 || ast.body[0].type !== "ExpressionStatement") {
    return false;
  }
  let fetches = 0;
  const ok = (n: JsNode, scope: ReadonlySet<string>): boolean => {
    switch (n.type) {
      case "Literal":
        return typeof n.value === "string" || typeof n.value === "number";
      case "Identifier":
        return scope.has(n.name);
      case "MemberExpression":
        return (
          !n.computed &&
          !n.optional &&
          n.property.type === "Identifier" &&
          NODE_MEMBERS.has(n.property.name) &&
          (n.object.type === "Identifier" && n.object.name === "console"
            ? n.property.name === "log" || n.property.name === "error"
            : ok(n.object, scope))
        );
      case "ArrowFunctionExpression": {
        if (n.async || n.generator || n.body.type === "BlockStatement") {
          return false;
        }
        const inner = new Set(scope);
        for (const p of n.params) {
          if (p.type !== "Identifier" || p.name === "fetch" || p.name === "console") {
            return false;
          }
          inner.add(p.name);
        }
        return ok(n.body, inner);
      }
      case "CallExpression": {
        if (n.optional || n.arguments.some((a: JsNode) => a.type === "SpreadElement")) {
          return false;
        }
        const c = n.callee;
        if (c.type === "Identifier" && c.name === "fetch" && !scope.has("fetch")) {
          fetches++;
          const a = n.arguments;
          return (
            a.length === 1 &&
            a[0].type === "Literal" &&
            typeof a[0].value === "string" &&
            isNamed(a[0].value)
          );
        }
        if (c.type !== "MemberExpression" || !ok(c, scope)) {
          return false;
        }
        return n.arguments.every((a: JsNode) => ok(a, scope));
      }
      default:
        return false;
    }
  };
  return ok(ast.body[0].expression, new Set()) && fetches === 1;
}

// open(P[, 'r'|'rb'][, encoding='…'][, errors='…']), P a string literal or sys.argv[N].
const READ_OPEN =
  /\bopen\(\s*(?:(['"])([^'"\\\n]+)\1|sys\.argv\[(\d+)\])\s*(?:,\s*(['"])rb?\4\s*)?(?:,\s*encoding\s*=\s*(['"])[\w-]+\5\s*)?(?:,\s*errors\s*=\s*(['"])\w+\6\s*)?\)/g;

/**
 * Inline Python that is a pure filter (pythonIsPureFilter) except that it
 * may open files for reading: every `open(` is `open(P)` with an optional
 * 'r'/'rb' mode and encoding/errors keywords, P a string literal or
 * `sys.argv[N]` with N inside `args` (sys.argv as the code gets it), and
 * `readable` accepts each such file. A file opened that way cannot be
 * written (a write on it fails). Anything else: false.
 */
export function pythonIsPureReader(
  code: string,
  args: readonly string[],
  readable: (file: string) => boolean,
): boolean {
  if (code.length > MAX_CODE) {
    return false;
  }
  let opens = 0;
  let bad = false;
  const rest = code.replace(READ_OPEN, (_m, _q, lit: string | undefined, n: string | undefined) => {
    opens++;
    const file = lit ?? (n !== undefined ? args[Number(n)] : undefined);
    if (typeof file !== "string" || file === "" || !readable(file)) {
      bad = true;
    }
    return "_opened";
  });
  return !bad && opens > 0 && pythonIsPureFilter(rest);
}
