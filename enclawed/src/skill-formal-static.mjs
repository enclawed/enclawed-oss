// Method A from the formal-verification paper: sound static effect-
// containment analysis for skill-side scripts.
//
// Walks each script in a skill's content and over-approximates the
// system effects (capability + abstract argument) the script can
// produce, then checks the over-approximation is contained in the
// skill manifest's declared capability set M.caps. Soundness: if the
// analyser reports E^(p) ⊆ M.caps then every concrete execution of p
// emits only effects in M.caps. Reflective constructs taint the
// program with TOP and force the operator either to remove them or to
// drop the skill below the FORMAL verification level.
//
// We do NOT depend on Semgrep/CodeQL at runtime. The rules are
// expressed as small per-language pattern packs that recognise the
// canonical entry points each language uses to produce the parent
// paper's capability tokens. Adding a language is a one-file
// extension: define its entry-point patterns and a transfer function
// per pattern.
//
// Languages covered today: Python (.py), POSIX shell (.sh), Node /
// TypeScript (.mjs / .cjs / .js / .ts). Every other extension is
// classified as opaque and the analyser conservatively reports TOP
// for it (capability containment cannot then be established at
// FORMAL).

import { closeSync, fstatSync, openSync, readFileSync, readSync, readdirSync } from "node:fs";
import path from "node:path";

// Mirror the parent paper's capability vocabulary (paper §3.5,
// Table 1; src/enclawed/skill-capabilities.ts). The .mjs surface keeps
// its own copy so this module is self-contained for tests that don't
// pull in the TS twin.
export const CAPABILITY = Object.freeze({
  NET_EGRESS: "net.egress",
  FS_READ: "fs.read",
  FS_WRITE_REV: "fs.write.rev",
  FS_WRITE_IRREV: "fs.write.irrev",
  TOOL_INVOKE: "tool.invoke",
  SPAWN_PROC: "spawn.proc",
  PUBLISH: "publish",
  PAY: "pay",
  MUTATE_SCHEMA: "mutate.schema",
});

// "TOP" is encoded as the full capability set; if any rule lifts a
// program to TOP it cannot be FORMAL-certified.
const TOP_EFFECT_SET = Object.freeze(new Set(Object.values(CAPABILITY)));

// ---------------------------------------------------------------- Patterns
//
// Each entry: a regex that matches a canonical entry point in source,
// the capability token it implies, and a value-extractor that returns
// an abstract value (host glob / path / cmd / etc.) or null when the
// argument cannot be statically resolved.

// Per-language patterns. Each pattern matches a function-call entry
// point (no string-literal requirement on the argument) and ascribes
// a capability + abstract value extracted from the first argument
// when statically resolvable, or '*' / null when only the call itself
// is detectable. Soundness is preserved: an unknown abstract value is
// `*` (matches anything), which is the over-approximation the
// containment check then bounds.

const PY_PATTERNS = Object.freeze([
  // Network egress
  {
    re: /\brequests\.(?:get|post|put|delete|patch|head)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS,
    extract: (m) => (extractArgValue(m[1]) ? urlHost(extractArgValue(m[1])) : "*"),
  },
  {
    re: /\bhttpx\.(?:get|post|put|delete|patch)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS,
    extract: (m) => (extractArgValue(m[1]) ? urlHost(extractArgValue(m[1])) : "*"),
  },
  {
    re: /\burllib\.request\.urlopen\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS,
    extract: (m) => (extractArgValue(m[1]) ? urlHost(extractArgValue(m[1])) : "*"),
  },
  {
    re: /\bhttp\.client\.HTTPSConnection\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS,
    extract: (m) => extractArgValue(m[1]) ?? "*",
  },
  { re: /\bsocket\.create_connection\s*\(/g, cap: CAPABILITY.NET_EGRESS, extract: () => "*" },
  // Filesystem write — write/append modes get fs.write.rev. Bare open
  // (no mode argument or read mode) gets fs.read.
  {
    re: /\bopen\s*\(\s*([^,)]+)\s*,\s*['"](w|wb|w\+|a|ab|a\+|x|xb)['"]/g,
    cap: CAPABILITY.FS_WRITE_REV,
    extract: (m) => extractArgValue(m[1]) ?? "*",
  },
  // A write mode anywhere after the first argument (open(os.path.join(d,
  // name), "wb"), open(p, "r" if x else "w"), open(p, mode="a")), or a mode
  // the code computes: the path is the first argument when literal. A literal
  // FIRST argument is the path, never the mode: open('x') or open("a") reads
  // a file named x or a, so a comma must come before the mode literal.
  {
    re: /\bopen\s*\(([^\n]*?,[^\n]*?)['"](?:w|wb|w\+|wb\+|a|ab|a\+|ab\+|x|xb|r\+|rb\+)['"]/g,
    cap: CAPABILITY.FS_WRITE_REV,
    extract: (m) => extractArgValue(m[1]) ?? "*",
  },
  {
    // A mode the code computes: a name (open(p, mode)), or unpacked
    // arguments (open(p, *args), open(p, **kw)).
    re: /\bopen\s*\(\s*[^,()\n]*(?:\([^()\n]*\))?[^,()\n]*,\s*(?:[A-Za-z_][\w.]*\s*[,)]|\*)/g,
    cap: CAPABILITY.FS_WRITE_REV,
    extract: () => "*",
  },
  {
    re: /\.(?:write_text|write_bytes|touch|mkdir)\s*\(|\bos\.(?:makedirs|mkdir)\s*\(|\bshutil\.(?:copy|copy2|copyfile|copytree)\s*\(/g,
    cap: CAPABILITY.FS_WRITE_REV,
    extract: () => "*",
  },
  {
    re: /\bshutil\.move\s*\(|\bos\.(?:rename|replace|rmdir|removedirs)\s*\(|\.rename\s*\(|\.rmdir\s*\(/g,
    cap: CAPABILITY.FS_WRITE_IRREV,
    extract: () => "*",
  },
  {
    re: /\bopen\s*\(\s*([^,)]+)\s*\)/g,
    cap: CAPABILITY.FS_READ,
    extract: (m) => extractArgValue(m[1]) ?? "*",
  },
  {
    re: /\bopen\s*\(\s*([^,)]+)\s*,\s*['"]r/g,
    cap: CAPABILITY.FS_READ,
    extract: (m) => extractArgValue(m[1]) ?? "*",
  },
  // Filesystem irreversible
  {
    re: /\b(?:os\.remove|os\.unlink|shutil\.rmtree)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.FS_WRITE_IRREV,
    extract: (m) => extractArgValue(m[1]) ?? "*",
  },
  {
    re: /\b\.unlink\s*\(\s*\)/g, // pathlib.Path(...).unlink()
    cap: CAPABILITY.FS_WRITE_IRREV,
    extract: () => "*",
  },
  // Process spawn
  {
    re: /\bsubprocess\.(?:run|call|check_call|check_output|Popen)\s*\(\s*\[?\s*([^,)\]]+)/g,
    cap: CAPABILITY.SPAWN_PROC,
    extract: (m) => extractArgValue(m[1]) ?? "*",
  },
  {
    re: /\bos\.system\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.SPAWN_PROC,
    extract: (m) => {
      const v = extractArgValue(m[1]);
      return v ? v.split(/\s+/)[0] : "*";
    },
  },
  // A database client running a query (see the JS rule).
  {
    re: /\b(?:session|tx|txn|transaction|cursor|cur|conn|connection|graph|db|client|engine)\.(?:run|execute|executemany|executescript|query|cypher|write_transaction|execute_write)\s*\(\s*('[^'\n]*'|"[^"\n]*"|[^,)]*)/g,
    cap: "__DB__",
    extract: (m) => extractArgValue(m[1]),
  },
  // Reflective / dynamic constructs → TOP
  { re: /\b(?:exec|eval|compile)\s*\(/g, cap: "__TOP__", extract: () => "reflective" },
  { re: /\b__import__\s*\(/g, cap: "__TOP__", extract: () => "reflective" },
  {
    re: /\bimportlib\.import_module\s*\(\s*[^'")\s]/g,
    cap: "__TOP__",
    extract: () => "dynamic-import",
  },
  {
    re: /\bgetattr\s*\(\s*[^,]+,\s*[^'"\s)]/g,
    cap: "__TOP__",
    extract: () => "computed-attribute",
  },
  // Deserialization into live objects.
  {
    re: /\b(?:pickle|cPickle|_pickle|dill|cloudpickle|marshal|shelve|jsonpickle)\.(?:load|loads|Unpickler|open|decode)\b/g,
    cap: "__TOP__",
    extract: () => "deserialization-into-live-objects",
  },
  {
    re: /\byaml\.(?:load|load_all|unsafe_load|full_load)\s*\((?![^)]*SafeLoader)/g,
    cap: "__TOP__",
    extract: () => "deserialization-into-live-objects",
  },
  {
    re: /\btorch\.load\s*\((?![^)]*weights_only\s*=\s*True)/g,
    cap: "__TOP__",
    extract: () => "deserialization-into-live-objects",
  },
]);

// extractArgValue: if the argument expression is a string-literal,
// return its content. Otherwise return null (the static analyser cannot
// resolve the value; conservatively treat as TOP for the host/path
// dimension). This is a small dataflow concession: we don't track
// string-flow-through-variables; that's a known incompleteness for
// the value lattice but a NON-incompleteness for the capability
// lattice (the cap is detected regardless).
function extractArgValue(expr) {
  if (typeof expr !== "string") {
    return null;
  }
  const trimmed = expr.trim();
  // Single- or double-quoted string literal.
  const m = trimmed.match(/^['"]([^'"]+)['"]/);
  if (m) {
    return m[1];
  }
  // f-string with constant prefix: f"https://api.example.com/{path}"
  // — pattern-match the prefix.
  const f = trimmed.match(/^f['"]([^{'"]*)/);
  if (f && f[1].length > 0) {
    return f[1];
  }
  return null;
}

const SH_PATTERNS = Object.freeze([
  // Network egress
  // The inter-token gap between the command and the URL is matched as a
  // single character class with a lazy quantifier ([^|;&\n]*?). Avoiding a
  // nested quantifier here keeps the pattern from exponential backtracking
  // on inputs with many spaces (CodeQL js/redos).
  {
    re: /\b(?:curl|wget|http|httpie)\s+[^|;&\n]*?(https?:\/\/[^\s|;&'"]+)/g,
    cap: CAPABILITY.NET_EGRESS,
    extract: (m) => urlHost(m[1]),
  },
  { re: /\bnc(?:at)?\s+([^\s|;&]+)/g, cap: CAPABILITY.NET_EGRESS, extract: (m) => m[1] },
  // Output redirection (write)
  { re: />\s*([^\s|;&]+)/g, cap: CAPABILITY.FS_WRITE_REV, extract: (m) => m[1] },
  { re: />>\s*([^\s|;&]+)/g, cap: CAPABILITY.FS_WRITE_REV, extract: (m) => m[1] },
  // Filesystem mutating commands
  {
    re: /\b(?:rm|rmdir)\s+(?:-[a-z]+\s+)*([^\s|;&]+)/g,
    cap: CAPABILITY.FS_WRITE_IRREV,
    extract: (m) => m[1],
  },
  {
    re: /\bmv\s+(?:[^\s|;&]+\s+)+?([^\s|;&]+)/g,
    cap: CAPABILITY.FS_WRITE_IRREV,
    extract: (m) => m[1],
  },
  // Process spawn (any external command other than known builtins)
  {
    re: /\b(?:bash|sh|zsh|fish|python3?|node|npm|npx|pip|pnpm|yarn)\s/g,
    cap: CAPABILITY.SPAWN_PROC,
    extract: () => null,
  },
  // Reading files (their content reaches the script's output).
  {
    re: /(?:^|[\s;&|(`])(?:cat|head|tail|less|more|grep|egrep|fgrep|awk|sed|cut|sort|uniq|wc|od|xxd|base64|strings)\s+(?:-[A-Za-z0-9]+\s+)*([^\s|;&<>-][^\s|;&<>]*)/gm,
    cap: CAPABILITY.FS_READ,
    extract: (m) => m[1],
  },
  { re: /<\s*([^\s|;&<>(]+)/g, cap: CAPABILITY.FS_READ, extract: (m) => m[1] },
  // Writing files by a program (not a redirection).
  {
    re: /(?:^|[\s;&|(`])(?:tee|cp|install|touch|mkdir|ln)\s+(?:-[A-Za-z]+\s+)*(?:[^\s|;&]+\s+)*?([^\s|;&-][^\s|;&]*)\s*(?=$|[|;&\n])/gm,
    cap: CAPABILITY.FS_WRITE_REV,
    extract: (m) => m[1],
  },
  {
    re: /(?:^|[\s;&|(`])sed\s+(?:-[A-Za-z]*\s+)*-i/gm,
    cap: CAPABILITY.FS_WRITE_REV,
    extract: () => "*",
  },
  {
    re: /(?:^|[\s;&|(`])(?:dd|truncate|shred|chmod|chown)\s/gm,
    cap: CAPABILITY.FS_WRITE_IRREV,
    extract: () => "*",
  },
  // Other ways to reach the network.
  {
    re: /(?:^|[\s;&|(`])(?:ssh|scp|sftp|rsync|ftp|telnet|socat)\s/gm,
    cap: CAPABILITY.NET_EGRESS,
    extract: () => "*",
  },
  { re: /\/dev\/(?:tcp|udp)\//g, cap: CAPABILITY.NET_EGRESS, extract: () => "*" },
  // Reflective: eval, and sourcing a file named by a variable.
  { re: /\beval\s+/g, cap: "__TOP__", extract: () => "reflective" },
  {
    re: /(?:^|[\s;&|(])(?:source|\.)\s+["']?\$/gm,
    cap: "__TOP__",
    extract: () => "source-of-a-variable",
  },
]);

function extractJsArg(expr) {
  if (typeof expr !== "string") {
    return null;
  }
  const t = expr.trim();
  const m = t.match(/^['"`]([^'"`]+)['"`]/);
  return m ? m[1] : null;
}

const JS_PATTERNS = Object.freeze([
  // Network egress — argument may be string-literal or variable.
  {
    re: /\bfetch\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS,
    extract: (m) => {
      const v = extractJsArg(m[1]);
      return v ? urlHost(v) : "*";
    },
  },
  {
    re: /\b(?:http|https)\.(?:get|request)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS,
    extract: (m) => {
      const v = extractJsArg(m[1]);
      return v ? urlHost(v) : "*";
    },
  },
  // Filesystem
  {
    re: /\b(?:fs|fsp|fsPromises)\.(?:writeFile|appendFile|writeFileSync|appendFileSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.FS_WRITE_REV,
    extract: (m) => extractJsArg(m[1]) ?? "*",
  },
  {
    re: /\b(?:fs|fsp|fsPromises)\.(?:unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.FS_WRITE_IRREV,
    extract: (m) => extractJsArg(m[1]) ?? "*",
  },
  {
    re: /\b(?:fs|fsp|fsPromises)\.(?:readFile|readFileSync|readdir|readdirSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.FS_READ,
    extract: (m) => extractJsArg(m[1]) ?? "*",
  },
  // Process spawn
  {
    re: /\bchild_process\.(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.SPAWN_PROC,
    extract: (m) => extractJsArg(m[1]) ?? "*",
  },
  {
    re: /\brequire\s*\(\s*['"`]child_process['"`]\s*\)\s*\.\s*(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.SPAWN_PROC,
    extract: (m) => extractJsArg(m[1]) ?? "*",
  },
  {
    re: /\bimport\s*\(\s*['"`]child_process['"`]\s*\)\s*\.\s*(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.SPAWN_PROC,
    extract: (m) => extractJsArg(m[1]) ?? "*",
  },
  // A database client running a query: a literal read-only statement reads;
  // a literal write changes data, DDL changes the schema; a query the code
  // builds (an LLM-generated Cypher or SQL string) can do anything a query can.
  {
    re: /\b(?:session|tx|txn|transaction|client|pool|db|conn|connection|graph|driver|knex|sequelize|prisma)\.(?:run|query|execute|executeRead|executeWrite|raw|\$queryRawUnsafe|\$executeRawUnsafe|cypher)\s*\(\s*('[^'\n]*'|"[^"\n]*"|`[^`$]*`|[^,)]*)/g,
    cap: "__DB__",
    extract: (m) => extractJsArg(m[1]),
  },
  // Reflective
  { re: /\beval\s*\(/g, cap: "__TOP__", extract: () => "reflective" },
  { re: /\bnew Function\s*\(/g, cap: "__TOP__", extract: () => "reflective" },
  { re: /(?<![.\w$])Function\s*\(\s*['"`]/g, cap: "__TOP__", extract: () => "reflective" },
  {
    re: /\bvm\.(?:runIn\w*|compileFunction|Script)\b/g,
    cap: "__TOP__",
    extract: () => "reflective",
  },
  // Deserialization into live objects: a class chosen by data (a constructor
  // map, Reflect.construct, `new` on a computed member) or a serializer that
  // revives functions.
  {
    re: /\bReflect\.construct\s*\(/g,
    cap: "__TOP__",
    extract: () => "deserialization-into-live-objects",
  },
  {
    re: /\bnew(?:\s+|\s*\(\s*)[\w$.]+\s*\[[^\]]+\]/g,
    cap: "__TOP__",
    extract: () => "deserialization-into-live-objects",
  },
  {
    re: /\b(?:unserialize|deserialize)\s*\(/g,
    cap: "__TOP__",
    extract: () => "deserialization-into-live-objects",
  },
  {
    re: /\byaml\.load\s*\([^)]*(?:schema\s*:\s*\w*(?:UNSAFE|unsafe|Unsafe)|DEFAULT_FULL_SCHEMA)/g,
    cap: "__TOP__",
    extract: () => "deserialization-into-live-objects",
  },
  {
    re: /\b(?:require|import)\s*\(\s*[a-zA-Z_$]/g, // dynamic import with non-string-literal
    cap: "__TOP__",
    extract: () => "dynamic-import",
  },
]);

const FS_WRITE_NAMES = new Set([
  "writeFile",
  "writeFileSync",
  "appendFile",
  "appendFileSync",
  "createWriteStream",
  "copyFile",
  "copyFileSync",
  "cp",
  "cpSync",
  "mkdir",
  "mkdirSync",
  "open",
  "openSync",
]);
const FS_IRREV_NAMES = new Set([
  "unlink",
  "unlinkSync",
  "rm",
  "rmSync",
  "rmdir",
  "rmdirSync",
  "rename",
  "renameSync",
  "truncate",
  "truncateSync",
]);
const FS_READ_NAMES = new Set([
  "readFile",
  "readFileSync",
  "readdir",
  "readdirSync",
  "createReadStream",
]);

/** Local name -> imported name of every binding taken from fs / fs/promises. */
function fsImports(src) {
  const out = new Map();
  const lists = [
    ...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](?:node:)?fs(?:\/promises)?['"]/g),
    ...src.matchAll(
      /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:require\s*\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)|await\s+import\s*\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\))/g,
    ),
  ];
  for (const m of lists) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      const as = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(t) ?? /^([\w$]+)\s*:\s*([\w$]+)$/.exec(t);
      if (as) {
        out.set(as[2], as[1]);
      } else if (/^[\w$]+$/.test(t)) {
        out.set(t, t);
      }
    }
  }
  return out;
}

// What a database query can do: a literal read-only statement reads; a
// literal DDL statement changes the schema; any other literal writes data;
// a query the code builds can do all three.
const QUERY_WRITE =
  /\b(?:CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|INSERT|UPDATE|ALTER|TRUNCATE|REPLACE|GRANT|REVOKE|CALL|LOAD|COPY|ATTACH|VACUUM|UPSERT)\b/i;
const QUERY_DDL =
  /\b(?:CREATE\s+(?:TABLE|INDEX|CONSTRAINT|DATABASE|SCHEMA|VIEW|TRIGGER)|DROP|ALTER|TRUNCATE)\b/i;
function queryCapabilities(literal) {
  if (typeof literal !== "string") {
    return [CAPABILITY.FS_READ, CAPABILITY.FS_WRITE_IRREV, CAPABILITY.MUTATE_SCHEMA];
  }
  if (QUERY_DDL.test(literal)) {
    return [CAPABILITY.MUTATE_SCHEMA];
  }
  return QUERY_WRITE.test(literal) ? [CAPABILITY.FS_WRITE_IRREV] : [CAPABILITY.FS_READ];
}

function urlHost(s) {
  try {
    if (s.startsWith("http://") || s.startsWith("https://")) {
      return new URL(s).hostname || "*";
    }
  } catch {
    // fall through
  }
  return "*";
}

/** The source as the pattern packs read it (comments removed), for a second analysis. */
export function stripForAnalysis(src, ext) {
  const c = LANG_PATTERNS[ext];
  return c ? c.stripComments(src) : src;
}

// File-extension dispatch
const LANG_PATTERNS = Object.freeze({
  ".py": { name: "python", patterns: PY_PATTERNS, stripComments: stripPythonComments },
  ".sh": { name: "sh", patterns: SH_PATTERNS, stripComments: stripShellComments },
  ".bash": { name: "sh", patterns: SH_PATTERNS, stripComments: stripShellComments },
  ".mjs": { name: "javascript", patterns: JS_PATTERNS, stripComments: stripCStyleComments },
  ".cjs": { name: "javascript", patterns: JS_PATTERNS, stripComments: stripCStyleComments },
  ".js": { name: "javascript", patterns: JS_PATTERNS, stripComments: stripCStyleComments },
  ".ts": { name: "typescript", patterns: JS_PATTERNS, stripComments: stripCStyleComments },
  ".tsx": { name: "typescript", patterns: JS_PATTERNS, stripComments: stripCStyleComments },
  ".jsx": { name: "javascript", patterns: JS_PATTERNS, stripComments: stripCStyleComments },
});

function stripPythonComments(src) {
  // Remove # ... line comments and triple-quoted strings (rough; OK for
  // pattern-matching since we only care about removing match-noise).
  return src
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/'''[\s\S]*?'''/g, "''")
    .replace(/(^|[^\\])#[^\n]*/g, "$1");
}

function stripShellComments(src) {
  return src.replace(/(^|[^\\])#[^\n]*/g, "$1");
}

function stripCStyleComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Analyse a single source string under a chosen language. Returns
 *   { effects: Array<{cap, abstractValue, location}>, top: bool, language }
 * where `top` is true iff a reflective construct lifted the analysis
 * to TOP (the program may produce any effect; capability containment
 * cannot be established by static means).
 */
export function analyzeSource(src, language) {
  const langConfig = LANG_PATTERNS[language];
  if (!langConfig) {
    // Unknown language → conservatively TOP.
    return { effects: [], top: true, language, reason: "unknown-language" };
  }
  const stripped = langConfig.stripComments(src);
  const effects = [];
  // A class chosen by data: `const C = map[key]` (or `map.get(key)`, `Reflect.get`) and then `new C(...)`
  // revives whatever class the data names (deserialization into live objects).
  if (langConfig.patterns === JS_PATTERNS) {
    for (const m of stripped.matchAll(
      /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:[\w$.]+\s*\[[^\]]+\]|[\w$.]+\.get\s*\(|Reflect\.get\s*\()/g,
    )) {
      const id = m[1].replace(/\$/g, "\\$");
      if (new RegExp(`\\bnew\\s+${id}\\s*\\(`).test(stripped)) {
        return {
          effects: [],
          top: true,
          language: langConfig.name,
          reason: "reflective-construct: deserialization-into-live-objects",
        };
      }
    }
  }
  // Filesystem functions imported by name (import { writeFileSync as w } from "node:fs";
  // const { rmSync } = require("fs")): their local names are the entry points.
  if (langConfig.patterns === JS_PATTERNS) {
    for (const [local, imported] of fsImports(stripped)) {
      const cap = FS_WRITE_NAMES.has(imported)
        ? CAPABILITY.FS_WRITE_REV
        : FS_IRREV_NAMES.has(imported)
          ? CAPABILITY.FS_WRITE_IRREV
          : FS_READ_NAMES.has(imported)
            ? CAPABILITY.FS_READ
            : null;
      if (!cap) {
        continue;
      }
      const re = new RegExp(`(?<![\\w$.])${local.replace(/\$/g, "\\$")}\\s*\\(\\s*([^,)]+)`, "g");
      let m;
      while ((m = re.exec(stripped)) !== null) {
        effects.push({
          capability: cap,
          abstractValue: extractJsArg(m[1]) ?? "*",
          location: { offset: m.index, snippet: m[0].slice(0, 80) },
        });
      }
    }
  }
  let top = false;
  let topReason = null;
  for (const pat of langConfig.patterns) {
    pat.re.lastIndex = 0;
    let m;
    while ((m = pat.re.exec(stripped)) !== null) {
      if (pat.cap === "__TOP__") {
        top = true;
        topReason = topReason ?? pat.extract(m);
        continue;
      }
      if (pat.cap === "__DB__") {
        for (const cap of queryCapabilities(pat.extract(m))) {
          effects.push({
            capability: cap,
            abstractValue: "query",
            location: { offset: m.index, snippet: m[0].slice(0, 80) },
          });
        }
        continue;
      }
      const abstractValue = pat.extract(m);
      const offset = m.index;
      effects.push({
        capability: pat.cap,
        abstractValue: abstractValue ?? null,
        location: { offset, snippet: m[0].slice(0, 80) },
      });
    }
  }
  return {
    effects,
    top,
    language: langConfig.name,
    ...(top ? { reason: "reflective-construct: " + (topReason ?? "unknown") } : {}),
  };
}

// Files that never execute: configuration, prose, media, type maps.
const DATA_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".rst",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".csv",
  ".tsv",
  ".xml",
  ".lock",
  ".map",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".bmp",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".pdf",
  ".css",
  ".license",
  ".gitignore",
  ".npmignore",
  ".editorconfig",
]);

/** The language of an extensionless file run directly, or null when it is not a script. */
function shebangLanguage(fp) {
  let head = "";
  let exec = false;
  let fd = -1;
  try {
    fd = openSync(fp, "r");
    exec = (fstatSync(fd).mode & 0o111) !== 0;
    const buf = Buffer.alloc(256);
    const n = readSync(fd, buf, 0, 256, 0);
    head = buf.subarray(0, n).toString("latin1");
  } catch {
    return ".opaque";
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd);
      } catch {
        /* gone */
      }
    }
  }
  const m = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(head);
  if (!m) {
    return exec ? ".opaque" : null;
  }
  const interp = path.basename(m[1]) === "env" ? (m[2] ?? "") : path.basename(m[1]);
  if (/^(sh|bash|dash|zsh)$/.test(interp)) {
    return ".sh";
  }
  if (/^python[0-9.]*$/.test(interp)) {
    return ".py";
  }
  if (/^(node|nodejs)$/.test(interp)) {
    return ".js";
  }
  return ".opaque";
}

/**
 * Analyse a directory tree of skill content. Walks every regular file,
 * dispatches by extension, returns:
 *   {
 *     perScript: Record<scriptPath, { language, top, reason?, effects[] }>,
 *     unionEffects: Set<capability-token>,
 *     opaqueFiles: string[],   // files whose extension has no analyser
 *     anyTop: bool,
 *     stats: { scriptsAnalysed, scriptsOpaque, totalEffects }
 *   }
 *
 * @param {string} dir
 * @returns {Object}
 */
export function analyzeSkillDirectory(dir, { onScript } = {}) {
  const perScript = {};
  const unionEffects = new Set();
  const opaqueFiles = [];
  let anyTop = false;
  let totalEffects = 0;
  let scriptsAnalysed = 0;
  let scriptsOpaque = 0;

  const walk = (root) => {
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      // Every directory the skill's content digest pins is read: its
      // libraries (node_modules, site-packages-style vendored trees) and
      // dot-directories run with the skill. A repository inside the skill
      // (.git) holds content no analysis reads, so it is opaque.
      if (ent.isDirectory()) {
        if (ent.name === ".git") {
          opaqueFiles.push(path.relative(dir, path.join(root, ent.name)) + "/");
          scriptsOpaque += 1;
          continue;
        }
        walk(path.join(root, ent.name));
        continue;
      }
      if (!ent.isFile()) {
        // A symbolic link or special file: its content is not the skill's (the digest refuses it too).
        opaqueFiles.push(path.relative(dir, path.join(root, ent.name)));
        scriptsOpaque += 1;
        continue;
      }
      const fp = path.join(root, ent.name);
      let ext = path.extname(ent.name).toLowerCase();
      if (ent.name === "SKILL.md") {
        continue;
      } // prose, not a script
      if (DATA_EXTENSIONS.has(ext)) {
        // Configuration, prose and media; they don't execute.
        continue;
      }
      if (ext === "") {
        // No extension: a script by its shebang or its exec bit; otherwise prose (LICENSE, README).
        const lang = shebangLanguage(fp);
        if (lang === null) {
          continue;
        }
        ext = lang;
      }
      if (!LANG_PATTERNS[ext]) {
        opaqueFiles.push(path.relative(dir, fp));
        scriptsOpaque += 1;
        continue;
      }
      // Open once and operate on the file descriptor so the size check and
      // the read see the same inode — closing the TOCTOU window between
      // a path-based stat and a path-based read (CodeQL js/file-system-race).
      let src;
      let fd = -1;
      try {
        fd = openSync(fp, "r");
        const st = fstatSync(fd);
        if (st.size > 5 * 1024 * 1024) {
          // 5 MiB safety cap; oversize scripts are flagged opaque.
          opaqueFiles.push(path.relative(dir, fp));
          scriptsOpaque += 1;
          continue;
        }
        src = readFileSync(fd, "utf8");
      } catch {
        opaqueFiles.push(path.relative(dir, fp));
        scriptsOpaque += 1;
        continue;
      } finally {
        if (fd >= 0) {
          try {
            closeSync(fd);
          } catch {
            /* fd already gone */
          }
        }
      }
      const r = analyzeSource(src, ext);
      perScript[path.relative(dir, fp)] = r;
      // A second analysis over the same files reads exactly what this one read.
      onScript?.({ src, ext, file: fp, rel: path.relative(dir, fp) });
      if (r.top) {
        anyTop = true;
      }
      for (const e of r.effects) {
        unionEffects.add(e.capability);
      }
      totalEffects += r.effects.length;
      scriptsAnalysed += 1;
    }
  };
  walk(dir);

  return {
    perScript,
    unionEffects,
    opaqueFiles,
    anyTop,
    stats: { scriptsAnalysed, scriptsOpaque, totalEffects },
  };
}

/**
 * Soundness check: report whether the analysed effect union is
 * contained in M.caps. Returns
 *   { contained: bool, escapingCapabilities: string[], reason: string }
 *
 * If `anyTop` is true the analyser cannot conclude containment by
 * static means — return contained=false with reason="reflective".
 *
 * @param {Object} analysis  — output of analyzeSkillDirectory
 * @param {Array<string>}  declaredCaps  — manifest M.caps
 * @returns {{ contained: bool, escapingCapabilities: string[], reason: string }}
 */
export function checkContainment(analysis, declaredCaps) {
  if (analysis.anyTop) {
    return {
      contained: false,
      escapingCapabilities: [...TOP_EFFECT_SET].toSorted(),
      reason: "reflective-construct-tainted-program-to-TOP",
    };
  }
  const declared = new Set(declaredCaps);
  const escaping = [];
  for (const cap of analysis.unionEffects) {
    if (!declared.has(cap)) {
      escaping.push(cap);
    }
  }
  if (escaping.length > 0) {
    return {
      contained: false,
      escapingCapabilities: escaping.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      reason: "effects-outside-manifest-caps",
    };
  }
  return {
    contained: true,
    escapingCapabilities: [],
    reason: "sound-static-effect-containment",
  };
}

/**
 * Convenience: run analyzeSkillDirectory + checkContainment and return
 * a single Method-A verdict object suitable for inclusion in a PCC
 * bundle (\\S 8 of the paper).
 *
 * @param {string} dir
 * @param {Array<string>} declaredCaps
 */
export function methodA({ dir, declaredCaps, writeRoots }) {
  const analysis = analyzeSkillDirectory(dir);
  let containment = checkContainment(analysis, declaredCaps);
  // Declared write folders (SKILL.md enclawed-write-roots): every write the
  // analysis finds must name a literal path inside one of them. A path the
  // code computes (a joined, user-supplied file name) can leave them.
  const roots =
    Array.isArray(writeRoots) && writeRoots.length
      ? [...writeRoots].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      : null;
  const escapingWrites = roots ? writesOutside(analysis, roots) : [];
  if (containment.contained && escapingWrites.length) {
    containment = {
      contained: false,
      escapingCapabilities: [],
      reason: "write-path-may-leave-declared-folders",
    };
  }
  // The bundle artefact must be JSON-serialisable — so unionEffects
  // (a Set) needs to be flattened to a sorted array.
  return {
    method: "A",
    contained: containment.contained,
    declaredCaps: [...declaredCaps].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    unionEffects: [...analysis.unionEffects].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    escapingCapabilities: containment.escapingCapabilities,
    anyTop: analysis.anyTop,
    perScript: Object.fromEntries(
      Object.entries(analysis.perScript).map(([k, v]) => [
        k,
        {
          language: v.language,
          top: !!v.top,
          ...(v.reason ? { reason: v.reason } : {}),
          effects: v.effects.map((e) => ({
            capability: e.capability,
            abstractValue: e.abstractValue,
          })),
        },
      ]),
    ),
    opaqueFiles: analysis.opaqueFiles.toSorted(),
    stats: analysis.stats,
    reason: containment.reason,
    ...(roots ? { writeRoots: roots, escapingWrites } : {}),
  };
}

/** Every write effect whose path is not a literal inside a declared root: { script, value }. */
function writesOutside(analysis, roots) {
  const norm = (p) => path.posix.normalize(String(p).replace(/^\.\//, "")).replace(/\/+$/, "");
  const inside = (v) =>
    typeof v === "string" &&
    v !== "*" &&
    !path.isAbsolute(v) &&
    !norm(v).split("/").includes("..") &&
    roots.some((r) => norm(v) === norm(r) || norm(v).startsWith(`${norm(r)}/`));
  const out = [];
  for (const [script, r] of Object.entries(analysis.perScript)) {
    for (const e of r.effects) {
      if (
        (e.capability === CAPABILITY.FS_WRITE_REV || e.capability === CAPABILITY.FS_WRITE_IRREV) &&
        !inside(e.abstractValue)
      ) {
        out.push({ script, value: e.abstractValue ?? "*" });
      }
    }
  }
  return out.toSorted((a, b) => (a.script + a.value < b.script + b.value ? -1 : 1));
}
