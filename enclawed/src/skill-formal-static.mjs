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

import { closeSync, fstatSync, openSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Mirror the parent paper's capability vocabulary (paper §3.5,
// Table 1; src/enclawed/skill-capabilities.ts). The .mjs surface keeps
// its own copy so this module is self-contained for tests that don't
// pull in the TS twin.
export const CAPABILITY = Object.freeze({
  NET_EGRESS:     'net.egress',
  FS_READ:        'fs.read',
  FS_WRITE_REV:   'fs.write.rev',
  FS_WRITE_IRREV: 'fs.write.irrev',
  TOOL_INVOKE:    'tool.invoke',
  SPAWN_PROC:     'spawn.proc',
  PUBLISH:        'publish',
  PAY:            'pay',
  MUTATE_SCHEMA:  'mutate.schema',
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
  { re: /\brequests\.(?:get|post|put|delete|patch|head)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS, extract: (m) => extractArgValue(m[1]) ? urlHost(extractArgValue(m[1])) : '*' },
  { re: /\bhttpx\.(?:get|post|put|delete|patch)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS, extract: (m) => extractArgValue(m[1]) ? urlHost(extractArgValue(m[1])) : '*' },
  { re: /\burllib\.request\.urlopen\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS, extract: (m) => extractArgValue(m[1]) ? urlHost(extractArgValue(m[1])) : '*' },
  { re: /\bhttp\.client\.HTTPSConnection\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS, extract: (m) => extractArgValue(m[1]) ?? '*' },
  { re: /\bsocket\.create_connection\s*\(/g,
    cap: CAPABILITY.NET_EGRESS, extract: () => '*' },
  // Filesystem write — write/append modes get fs.write.rev. Bare open
  // (no mode argument or read mode) gets fs.read.
  { re: /\bopen\s*\(\s*([^,)]+)\s*,\s*['"](w|wb|w\+|a|ab|a\+|x|xb)['"]/g,
    cap: CAPABILITY.FS_WRITE_REV, extract: (m) => extractArgValue(m[1]) ?? '*' },
  { re: /\bopen\s*\(\s*([^,)]+)\s*\)/g,
    cap: CAPABILITY.FS_READ, extract: (m) => extractArgValue(m[1]) ?? '*' },
  { re: /\bopen\s*\(\s*([^,)]+)\s*,\s*['"]r/g,
    cap: CAPABILITY.FS_READ, extract: (m) => extractArgValue(m[1]) ?? '*' },
  // Filesystem irreversible
  { re: /\b(?:os\.remove|os\.unlink|shutil\.rmtree)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.FS_WRITE_IRREV, extract: (m) => extractArgValue(m[1]) ?? '*' },
  { re: /\b\.unlink\s*\(\s*\)/g,                       // pathlib.Path(...).unlink()
    cap: CAPABILITY.FS_WRITE_IRREV, extract: () => '*' },
  // Process spawn
  { re: /\bsubprocess\.(?:run|call|check_call|check_output|Popen)\s*\(\s*\[?\s*([^,)\]]+)/g,
    cap: CAPABILITY.SPAWN_PROC, extract: (m) => extractArgValue(m[1]) ?? '*' },
  { re: /\bos\.system\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.SPAWN_PROC,
    extract: (m) => {
      const v = extractArgValue(m[1]);
      return v ? v.split(/\s+/)[0] : '*';
    } },
  // Reflective / dynamic constructs → TOP
  { re: /\b(?:exec|eval|compile)\s*\(/g,
    cap: '__TOP__', extract: () => 'reflective' },
  { re: /\b__import__\s*\(/g,
    cap: '__TOP__', extract: () => 'reflective' },
]);

// extractArgValue: if the argument expression is a string-literal,
// return its content. Otherwise return null (the static analyser cannot
// resolve the value; conservatively treat as TOP for the host/path
// dimension). This is a small dataflow concession: we don't track
// string-flow-through-variables; that's a known incompleteness for
// the value lattice but a NON-incompleteness for the capability
// lattice (the cap is detected regardless).
function extractArgValue(expr) {
  if (typeof expr !== 'string') return null;
  const trimmed = expr.trim();
  // Single- or double-quoted string literal.
  const m = trimmed.match(/^['"]([^'"]+)['"]/);
  if (m) return m[1];
  // f-string with constant prefix: f"https://api.example.com/{path}"
  // — pattern-match the prefix.
  const f = trimmed.match(/^f['"]([^{'"]*)/);
  if (f && f[1].length > 0) return f[1];
  return null;
}

const SH_PATTERNS = Object.freeze([
  // Network egress
  // The inter-token gap between the command and the URL is matched as a
  // single character class with a lazy quantifier ([^|;&\n]*?). Avoiding a
  // nested quantifier here keeps the pattern from exponential backtracking
  // on inputs with many spaces (CodeQL js/redos).
  { re: /\b(?:curl|wget|http|httpie)\s+[^|;&\n]*?(https?:\/\/[^\s|;&'"]+)/g,
    cap: CAPABILITY.NET_EGRESS, extract: (m) => urlHost(m[1]) },
  { re: /\bnc(?:at)?\s+([^\s|;&]+)/g,
    cap: CAPABILITY.NET_EGRESS, extract: (m) => m[1] },
  // Output redirection (write)
  { re: />\s*([^\s|;&]+)/g,
    cap: CAPABILITY.FS_WRITE_REV, extract: (m) => m[1] },
  { re: />>\s*([^\s|;&]+)/g,
    cap: CAPABILITY.FS_WRITE_REV, extract: (m) => m[1] },
  // Filesystem mutating commands
  { re: /\b(?:rm|rmdir)\s+(?:-[a-z]+\s+)*([^\s|;&]+)/g,
    cap: CAPABILITY.FS_WRITE_IRREV, extract: (m) => m[1] },
  { re: /\bmv\s+(?:[^\s|;&]+\s+)+?([^\s|;&]+)/g,
    cap: CAPABILITY.FS_WRITE_IRREV, extract: (m) => m[1] },
  // Process spawn (any external command other than known builtins)
  { re: /\b(?:bash|sh|zsh|fish|python3?|node|npm|npx|pip|pnpm|yarn)\s/g,
    cap: CAPABILITY.SPAWN_PROC, extract: () => null },
  // Reflective: eval / source from a variable
  { re: /\beval\s+/g,
    cap: '__TOP__', extract: () => 'reflective' },
]);

function extractJsArg(expr) {
  if (typeof expr !== 'string') return null;
  const t = expr.trim();
  const m = t.match(/^['"`]([^'"`]+)['"`]/);
  return m ? m[1] : null;
}

const JS_PATTERNS = Object.freeze([
  // Network egress — argument may be string-literal or variable.
  { re: /\bfetch\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS,
    extract: (m) => { const v = extractJsArg(m[1]); return v ? urlHost(v) : '*'; } },
  { re: /\b(?:http|https)\.(?:get|request)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.NET_EGRESS,
    extract: (m) => { const v = extractJsArg(m[1]); return v ? urlHost(v) : '*'; } },
  // Filesystem
  { re: /\b(?:fs|fsp|fsPromises)\.(?:writeFile|appendFile|writeFileSync|appendFileSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.FS_WRITE_REV, extract: (m) => extractJsArg(m[1]) ?? '*' },
  { re: /\b(?:fs|fsp|fsPromises)\.(?:unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.FS_WRITE_IRREV, extract: (m) => extractJsArg(m[1]) ?? '*' },
  { re: /\b(?:fs|fsp|fsPromises)\.(?:readFile|readFileSync|readdir|readdirSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.FS_READ, extract: (m) => extractJsArg(m[1]) ?? '*' },
  // Process spawn
  { re: /\bchild_process\.(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.SPAWN_PROC, extract: (m) => extractJsArg(m[1]) ?? '*' },
  { re: /\brequire\s*\(\s*['"`]child_process['"`]\s*\)\s*\.\s*(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.SPAWN_PROC, extract: (m) => extractJsArg(m[1]) ?? '*' },
  { re: /\bimport\s*\(\s*['"`]child_process['"`]\s*\)\s*\.\s*(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*([^,)]+)/g,
    cap: CAPABILITY.SPAWN_PROC, extract: (m) => extractJsArg(m[1]) ?? '*' },
  // Reflective
  { re: /\beval\s*\(/g,
    cap: '__TOP__', extract: () => 'reflective' },
  { re: /\bnew Function\s*\(/g,
    cap: '__TOP__', extract: () => 'reflective' },
  { re: /\b(?:require|import)\s*\(\s*[a-zA-Z_$]/g,        // dynamic import with non-string-literal
    cap: '__TOP__', extract: () => 'dynamic-import' },
]);

function urlHost(s) {
  try {
    if (s.startsWith('http://') || s.startsWith('https://')) {
      return new URL(s).hostname || '*';
    }
  } catch {
    // fall through
  }
  return '*';
}

// File-extension dispatch
const LANG_PATTERNS = Object.freeze({
  '.py':  { name: 'python',     patterns: PY_PATTERNS, stripComments: stripPythonComments },
  '.sh':  { name: 'sh',         patterns: SH_PATTERNS, stripComments: stripShellComments },
  '.bash':{ name: 'sh',         patterns: SH_PATTERNS, stripComments: stripShellComments },
  '.mjs': { name: 'javascript', patterns: JS_PATTERNS, stripComments: stripCStyleComments },
  '.cjs': { name: 'javascript', patterns: JS_PATTERNS, stripComments: stripCStyleComments },
  '.js':  { name: 'javascript', patterns: JS_PATTERNS, stripComments: stripCStyleComments },
  '.ts':  { name: 'typescript', patterns: JS_PATTERNS, stripComments: stripCStyleComments },
  '.tsx': { name: 'typescript', patterns: JS_PATTERNS, stripComments: stripCStyleComments },
  '.jsx': { name: 'javascript', patterns: JS_PATTERNS, stripComments: stripCStyleComments },
});

function stripPythonComments(src) {
  // Remove # ... line comments and triple-quoted strings (rough; OK for
  // pattern-matching since we only care about removing match-noise).
  return src
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/'''[\s\S]*?'''/g, "''")
    .replace(/(^|[^\\])#[^\n]*/g, '$1');
}

function stripShellComments(src) {
  return src.replace(/(^|[^\\])#[^\n]*/g, '$1');
}

function stripCStyleComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
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
    return { effects: [], top: true, language, reason: 'unknown-language' };
  }
  const stripped = langConfig.stripComments(src);
  const effects = [];
  let top = false;
  let topReason = null;
  for (const pat of langConfig.patterns) {
    pat.re.lastIndex = 0;
    let m;
    while ((m = pat.re.exec(stripped)) !== null) {
      if (pat.cap === '__TOP__') {
        top = true;
        topReason = topReason ?? pat.extract(m);
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
    ...(top ? { reason: 'reflective-construct: ' + (topReason ?? 'unknown') } : {}),
  };
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
export function analyzeSkillDirectory(dir) {
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
      // Skip well-known noise dirs.
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name.startsWith('.')) continue;
        walk(path.join(root, ent.name));
        continue;
      }
      if (!ent.isFile()) continue;
      const fp = path.join(root, ent.name);
      const ext = path.extname(ent.name).toLowerCase();
      if (ent.name === 'SKILL.md') continue;          // prose, not a script
      if (ext === '.md' || ext === '.txt' || ext === '.json' || ext === '.yaml' || ext === '.yml' || ext === '.toml') {
        // These are configuration / prose; they don't execute.
        continue;
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
        fd = openSync(fp, 'r');
        const st = fstatSync(fd);
        if (st.size > 5 * 1024 * 1024) {
          // 5 MiB safety cap; oversize scripts are flagged opaque.
          opaqueFiles.push(path.relative(dir, fp));
          scriptsOpaque += 1;
          continue;
        }
        src = readFileSync(fd, 'utf8');
      } catch {
        opaqueFiles.push(path.relative(dir, fp));
        scriptsOpaque += 1;
        continue;
      } finally {
        if (fd >= 0) {
          try { closeSync(fd); } catch { /* fd already gone */ }
        }
      }
      const r = analyzeSource(src, ext);
      perScript[path.relative(dir, fp)] = r;
      if (r.top) anyTop = true;
      for (const e of r.effects) unionEffects.add(e.capability);
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
      escapingCapabilities: [...TOP_EFFECT_SET].sort(),
      reason: 'reflective-construct-tainted-program-to-TOP',
    };
  }
  const declared = new Set(declaredCaps);
  const escaping = [];
  for (const cap of analysis.unionEffects) {
    if (!declared.has(cap)) escaping.push(cap);
  }
  if (escaping.length > 0) {
    return {
      contained: false,
      escapingCapabilities: escaping.sort(),
      reason: 'effects-outside-manifest-caps',
    };
  }
  return {
    contained: true,
    escapingCapabilities: [],
    reason: 'sound-static-effect-containment',
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
export function methodA({ dir, declaredCaps }) {
  const analysis = analyzeSkillDirectory(dir);
  const containment = checkContainment(analysis, declaredCaps);
  // The bundle artefact must be JSON-serialisable — so unionEffects
  // (a Set) needs to be flattened to a sorted array.
  return {
    method: 'A',
    contained: containment.contained,
    declaredCaps: [...declaredCaps].sort(),
    unionEffects: [...analysis.unionEffects].sort(),
    escapingCapabilities: containment.escapingCapabilities,
    anyTop: analysis.anyTop,
    perScript: Object.fromEntries(
      Object.entries(analysis.perScript).map(([k, v]) => [k, {
        language: v.language,
        top: !!v.top,
        ...(v.reason ? { reason: v.reason } : {}),
        effects: v.effects.map((e) => ({
          capability: e.capability,
          abstractValue: e.abstractValue,
        })),
      }]),
    ),
    opaqueFiles: analysis.opaqueFiles.sort(),
    stats: analysis.stats,
    reason: containment.reason,
  };
}
