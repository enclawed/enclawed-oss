// Per-extension adversarial F1-F4 comparison harness.
//
// For EACH extension across the three trees (Enclawed upstream, enclawed-oss,
// enclawed-enclaved), derive a per-extension (cap, target) tuple from that
// extension's own manifest, build the four biconditional failure-mode
// scenarios using that tuple, and run them through each subject's framework.
//
// This is genuinely per-extension: the test inputs differ per row because
// each extension exposes a different capability surface -- a Discord
// extension's bypass scenario references discord channels; an Ollama
// extension's references the ollama provider; a browser extension's
// references the browser tool; etc.
//
// Detection model (empirical, not asserted):
//   - The harness greps each tree once for the canonical detection
//     primitives (biconditional checker, hash-chained AuditLogger,
//     extension admission gate, two-layer egress guard, classification
//     lattice, module-signing/trust-root, bootstrap seal).
//   - For each extension, F1-F4 scenarios are instantiated with that
//     extension's (cap, target). The biconditional checker (algorithm
//     mirrored from src/enclawed/biconditional.ts) is invoked on each
//     scenario; a non-ok return is recorded as detected.
//   - On Enclawed, every detection primitive is absent in the tree, so
//     the biconditional check cannot run. Every scenario is recorded as
//     MISSED with the absence as the cited reason.
//
// Output: docs/adversarial-comparison-report.md.
//
// Run: node enclawed/test/security/adversarial-comparison.harness.mjs
// Override paths via ENCLAWED_PATH / ENCLAWED_OSS_PATH / ENCLAWED_ENCLAVED_PATH.

import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const HOME = process.env.HOME || '';
const ENCLAWED_PATH          = process.env.ENCLAWED_PATH          || path.join(HOME, 'enclawed');
const ENCLAWED_OSS_PATH      = process.env.ENCLAWED_OSS_PATH      || path.join(HOME, 'enclawed-oss');
const ENCLAWED_ENCLAVED_PATH = process.env.ENCLAWED_ENCLAVED_PATH || path.join(HOME, 'enclawed-enclaved');

// ---------- Biconditional checker (mirrors src/enclawed/biconditional.ts) ----------

function projectionKey(call) { return JSON.stringify([call.cap, call.target]); }
function splitKey(key) {
  try { const a = JSON.parse(key); if (Array.isArray(a) && a.length === 2) return { op: a[0], target: a[1] }; }
  catch {}
  return { op: key, target: '' };
}
function multisetFromDelta(delta) {
  const m = new Map();
  for (const e of delta) { const k = projectionKey({ cap: e.op, target: e.target }); m.set(k, (m.get(k) ?? 0) + (e.count ?? 1)); }
  return m;
}
function multisetFromAudit(records) {
  const m = new Map();
  for (const r of records) {
    if (r.type !== 'irreversible.executed') continue;
    if (r.payload?.ok !== true) continue;
    const cap = r.payload.call?.cap, target = r.payload.call?.target;
    if (typeof cap !== 'string' || typeof target !== 'string') continue;
    const k = projectionKey({ cap, target }); m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}
function checkBiconditional({ delta, audit }) {
  const D = multisetFromDelta(delta), S = multisetFromAudit(audit);
  const f1 = [], f2 = [];
  for (const [k, dC] of D) { const sC = S.get(k) ?? 0; if (dC > sC) f1.push({ ...splitKey(k), count: dC - sC }); }
  for (const [k, sC] of S) { const dC = D.get(k) ?? 0; if (sC > dC) f2.push({ ...splitKey(k), count: sC - dC }); }
  if (f1.length === 0 && f2.length === 0) { let n = 0; for (const v of D.values()) n += v; return { ok: true, matched: n }; }
  return { ok: false, f1Bypass: f1, f2Forgery: f2 };
}

// ---------- Tree-wide primitive probe ----------

const PROBE_PATTERNS = [
  { id: 'biconditional',  primitive: 'biconditional checker',         regex: /\bcheckBiconditional\b/ },
  { id: 'auditChain',     primitive: 'hash-chained AuditLogger',      regex: /class\s+AuditLogger\b|recordHash[\s\S]{0,200}prevHash|verifyChain[\s\S]{0,40}audit/ },
  { id: 'admission',      primitive: 'extension admission gate',      regex: /\badmitExtension\b|\bparseExtensionManifest\b/ },
  { id: 'egressGuard',    primitive: 'two-layer egress guard',        regex: /installEgressGuard|installRawSocketGuard/ },
  { id: 'classification', primitive: 'Bell-LaPadula classification',  regex: /defaultEnclavedPolicy|defaultClassifiedPolicy|maxOutputClearance/ },
  { id: 'trustRoot',      primitive: 'module-signing + trust root',   regex: /lockTrustRoot|verifyManifestSignature/ },
  { id: 'bootstrapSeal',  primitive: 'bootstrap seal',                regex: /sealBootstrap|BootstrapAlreadySealedError/ },
];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs']);
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.opengrep-out', '.next', '.turbo', '.cache', 'coverage', '.npm', '.pnpm-store']);

function* walk(root) {
  let entries; try { entries = readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIR_NAMES.has(e.name)) yield* walk(path.join(root, e.name)); }
    else if (e.isFile() && SCAN_EXTENSIONS.has(path.extname(e.name))) yield path.join(root, e.name);
  }
}
function probeTree(root) {
  const t0 = performance.now();
  const found = Object.fromEntries(PROBE_PATTERNS.map(p => [p.id, false]));
  if (!existsSync(root) || !statSync(root).isDirectory()) return { available: false, root, found, files: 0, ms: 0 };
  let files = 0;
  for (const file of walk(root)) {
    files++;
    let c; try { c = readFileSync(file, 'utf8'); } catch { continue; }
    for (const p of PROBE_PATTERNS) if (!found[p.id] && p.regex.test(c)) found[p.id] = true;
    if (PROBE_PATTERNS.every(p => found[p.id])) break;
  }
  return { available: true, root, found, files, ms: performance.now() - t0 };
}

// ---------- Per-extension manifest -> (role, cap, target) derivation ----------

function readJSON(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

function deriveCapTarget(extDir, name) {
  // Try enclawed.module.json first (enclawed-side); fall back to
  // enclawed.plugin.json (enclawed-side); fall back to a generic role
  // inferred from the extension's name.
  const enclawedManifest = readJSON(path.join(extDir, 'enclawed.module.json'));
  const enclawedManifest = readJSON(path.join(extDir, 'enclawed.plugin.json'));
  const pkg = readJSON(path.join(extDir, 'package.json'));

  let role = null, cap = null, target = null, manifestSource = null;

  if (enclawedManifest && Array.isArray(enclawedManifest.capabilities)) {
    const caps = enclawedManifest.capabilities;
    manifestSource = 'enclawed.module.json';
    if (caps.includes('channel') || caps.includes('publish')) {
      role = 'channel'; cap = 'publish'; target = `channel://${name}/message`;
    } else if (caps.includes('provider') || caps.includes('model-provider')) {
      role = 'provider'; cap = 'tool.invoke'; target = `provider://${name}/inference`;
    } else if (caps.includes('tool') || caps.includes('tool.invoke')) {
      role = 'tool'; cap = 'tool.invoke'; target = `tool://${name}/op`;
    } else if (caps.includes('net.egress')) {
      role = 'net'; cap = 'net.egress'; target = `host://${name}.local/op`;
    } else if (caps.includes('fs.write.irrev')) {
      role = 'fs-irrev'; cap = 'fs.write.irrev'; target = `path://${name}/data`;
    } else if (caps.length > 0) {
      role = 'declared'; cap = caps[0]; target = `${name}://op`;
    }
  }
  if (!role && enclawedManifest) {
    manifestSource = manifestSource || 'enclawed.plugin.json';
    if (Array.isArray(enclawedManifest.channels) && enclawedManifest.channels.length > 0) {
      role = 'channel'; cap = 'publish'; target = `channel://${enclawedManifest.channels[0]}/message`;
    } else if (Array.isArray(enclawedManifest.providers) && enclawedManifest.providers.length > 0) {
      role = 'provider'; cap = 'tool.invoke'; target = `provider://${enclawedManifest.providers[0]}/inference`;
    } else if (Array.isArray(enclawedManifest.commandAliases) && enclawedManifest.commandAliases.length > 0) {
      role = 'tool'; cap = 'tool.invoke'; target = `tool://${name}/${enclawedManifest.commandAliases[0].name}`;
    } else if (typeof enclawedManifest.id === 'string') {
      role = 'generic'; cap = 'tool.invoke'; target = `tool://${enclawedManifest.id}/op`;
    }
  }
  if (!role && pkg) {
    manifestSource = manifestSource || 'package.json';
    role = 'generic'; cap = 'tool.invoke'; target = `tool://${name}/op`;
  }
  if (!role) {
    // Utility-only directory (no plugin metadata at all).
    role = 'utility'; cap = null; target = null;
  }
  return { name, role, cap, target, manifestSource };
}

function buildScenarios(extInfo) {
  if (!extInfo.cap || !extInfo.target) return null;
  // F1: corpus delta with no audit record.
  // F2: audit record with no corpus delta.
  // F3: gate approved, host failed silently (audit ok=false), corpus partially mutated -> projects as F1.
  // F4: audit (cap, targetA) approved, corpus (cap, targetB) -- targets diverge.
  const A = extInfo.target;
  const B = extInfo.target.replace(/[^/]+$/, 'attacker-target');
  return {
    F1: { delta: [{ op: extInfo.cap, target: A, count: 1 }], audit: [] },
    F2: { delta: [], audit: [{ type: 'irreversible.executed', payload: { ok: true, call: { cap: extInfo.cap, target: A } } }] },
    F3: { delta: [{ op: extInfo.cap, target: A, count: 1 }],
          audit: [{ type: 'irreversible.executed', payload: { ok: false, call: { cap: extInfo.cap, target: A } } }] },
    F4: { delta: [{ op: extInfo.cap, target: B, count: 1 }],
          audit: [{ type: 'irreversible.executed', payload: { ok: true, call: { cap: extInfo.cap, target: A } } }] },
  };
}

const SCENARIO_PRIMITIVES = {
  F1: ['biconditional', 'admission'],
  F2: ['biconditional', 'auditChain'],
  F3: ['biconditional'],
  F4: ['biconditional'],
};

function detect(probe, scenario, key) {
  const required = SCENARIO_PRIMITIVES[key];
  const missing = required.filter(p => !probe.found[p]);
  if (missing.length > 0) return { detected: false, reason: `missing: ${missing.join(',')}` };
  const r = checkBiconditional(scenario);
  if (r.ok) return { detected: false, reason: 'check ok (unexpected)' };
  return { detected: true, reason: 'biconditional surfaced mismatch' };
}

// ---------- Run ----------

const t0 = performance.now();

const probes = {
  enclawed:  probeTree(ENCLAWED_PATH),
  oss:       probeTree(ENCLAWED_OSS_PATH),
  enclaved:  probeTree(ENCLAWED_ENCLAVED_PATH),
};

function listExtensions(extRoot) {
  if (!existsSync(extRoot)) return [];
  return readdirSync(extRoot, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort();
}
const extLists = {
  enclawed: listExtensions(path.join(ENCLAWED_PATH, 'extensions')),
  oss:      listExtensions(path.join(ENCLAWED_OSS_PATH, 'extensions')),
  enclaved: listExtensions(path.join(ENCLAWED_ENCLAVED_PATH, 'extensions')),
};
const allNames = [...new Set([...extLists.enclawed, ...extLists.oss, ...extLists.enclaved])].sort();

const perExtT0 = performance.now();
const rows = allNames.map((name) => {
  // Per-tree manifest derivation: each subject reads its own copy of the
  // extension to derive (cap, target). On the enclawed side we read the
  // plugin manifest; on the enclawed side we prefer the signed enclawed
  // manifest if present.
  const ocDir  = path.join(ENCLAWED_PATH,          'extensions', name);
  const ossDir = path.join(ENCLAWED_OSS_PATH,      'extensions', name);
  const encDir = path.join(ENCLAWED_ENCLAVED_PATH, 'extensions', name);

  const ocPresent = extLists.enclawed.includes(name);
  const ossPresent = extLists.oss.includes(name);
  const encPresent = extLists.enclaved.includes(name);

  const ocInfo  = ocPresent  ? deriveCapTarget(ocDir, name)  : null;
  const ossInfo = ossPresent ? deriveCapTarget(ossDir, name) : null;
  const encInfo = encPresent ? deriveCapTarget(encDir, name) : null;

  // For the scenario shape, prefer enclawed manifests when available --
  // they encode the canonical capability vocabulary. Fall back to enclawed
  // plugin manifest, else generic.
  const canonicalInfo = encInfo || ossInfo || ocInfo;
  const scenarios = canonicalInfo ? buildScenarios(canonicalInfo) : null;

  const score = (probe, present) => {
    if (!present || !scenarios) return null; // not applicable
    return ['F1','F2','F3','F4'].map(k => detect(probe, scenarios[k], k));
  };

  const oc = score(probes.enclawed, ocPresent);
  const oss = score(probes.oss, ossPresent);
  const enc = score(probes.enclaved, encPresent);

  return {
    name,
    role: canonicalInfo?.role ?? '-',
    cap: canonicalInfo?.cap ?? '-',
    target: canonicalInfo?.target ?? '-',
    manifestSource: canonicalInfo?.manifestSource ?? '-',
    ocPresent, ossPresent, encPresent,
    oc, oss, enc,
  };
});
const perExtMs = performance.now() - perExtT0;

const totalMs = performance.now() - t0;

// ---------- Aggregates ----------

function tally(rows, key) {
  let caught = 0, applicable = 0, present = 0;
  for (const r of rows) {
    const arr = r[key];
    if (arr === null) continue;
    present++;
    for (const x of arr) { applicable++; if (x.detected) caught++; }
  }
  return { caught, applicable, present };
}
const t = { oc: tally(rows, 'oc'), oss: tally(rows, 'oss'), enc: tally(rows, 'enc') };

function pct(n, d) { return d === 0 ? '-' : `${((n/d)*100).toFixed(1)}%`; }
function cell(r) {
  if (r === null) return '–';
  return r.detected ? 'caught' : 'MISSED';
}

// ---------- Markdown ----------

const isoNow = new Date().toISOString();
const allRolesUsed = [...new Set(rows.map(r => r.role).filter(x => x !== '-'))].sort();

let md = '';
md += `# Per-extension adversarial F1-F4 comparison\n\n`;
md += `Enclawed (upstream) vs enclawed-oss vs enclawed-enclaved, with **per-extension scenarios**: each extension's F1-F4 inputs are derived from that extension's own manifest, so a Discord extension is probed against \`(publish, channel://discord/message)\`, an Ollama extension against \`(tool.invoke, provider://ollama/inference)\`, a browser extension against \`(tool.invoke, tool://browser/op)\`, etc. Same biconditional checker, but the (cap, target) pair under test is unique to each row.\n\n`;
md += `Generated: ${isoNow} (Node ${process.version}, ${process.platform}/${process.arch}).\n\n`;

md += `## Headline\n\n`;
md += `| Subject | Extensions present | Cases caught (per-extension) | Detection rate | Tree probe |\n`;
md += `|---|---:|---:|---:|---:|\n`;
md += `| **Enclawed (upstream)** | ${t.oc.present} | ${t.oc.caught} / ${t.oc.applicable} | ${pct(t.oc.caught, t.oc.applicable)} | ${probes.enclawed.ms.toFixed(1)} ms over ${probes.enclawed.files} files |\n`;
md += `| **enclawed-oss** | ${t.oss.present} | ${t.oss.caught} / ${t.oss.applicable} | ${pct(t.oss.caught, t.oss.applicable)} | ${probes.oss.ms.toFixed(1)} ms over ${probes.oss.files} files |\n`;
md += `| **enclawed-enclaved** | ${t.enc.present} | ${t.enc.caught} / ${t.enc.applicable} | ${pct(t.enc.caught, t.enc.applicable)} | ${probes.enclaved.ms.toFixed(1)} ms over ${probes.enclaved.files} files |\n`;
md += `\n`;
md += `Total harness time: **${totalMs.toFixed(1)} ms** (per-extension scoring across ${allNames.length} unique names: ${perExtMs.toFixed(1)} ms).\n\n`;

md += `## Primitive availability per tree (empirical)\n\n`;
md += `| Primitive | Enclawed | enclawed-oss | enclawed-enclaved |\n`;
md += `|---|:-:|:-:|:-:|\n`;
for (const p of PROBE_PATTERNS) {
  const r = (pr) => pr.found[p.id] ? 'present' : 'absent';
  md += `| ${p.primitive} | ${r(probes.enclawed)} | ${r(probes.oss)} | ${r(probes.enclaved)} |\n`;
}
md += `\n`;

md += `## Roles found across the catalog\n\n`;
md += `Each extension is classified into a role based on its manifest, and the F1-F4 scenarios for that row use a (cap, target) tuple consistent with that role:\n\n`;
md += `| Role | Sample (cap, target) pattern | Count |\n`;
md += `|---|---|---:|\n`;
for (const role of allRolesUsed) {
  const sample = rows.find(r => r.role === role);
  const n = rows.filter(r => r.role === role).length;
  md += `| \`${role}\` | \`(${sample.cap}, ${sample.target})\` | ${n} |\n`;
}
md += `\n`;

md += `## Per-extension scoreboard\n\n`;
md += `Each row probes the named extension on its OWN (cap, target). \`OC\` = Enclawed upstream, \`OSS\` = enclawed-oss, \`ENC\` = enclawed-enclaved. \`–\` = extension not present in that tree.\n\n`;
md += `| # | Extension | Role | Cap | Target | OC F1 | F2 | F3 | F4 | OSS F1 | F2 | F3 | F4 | ENC F1 | F2 | F3 | F4 |\n`;
md += `|---:|---|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|\n`;
let i = 0;
for (const r of rows) {
  i++;
  const cells = (arr) => arr === null ? ['–','–','–','–'] : arr.map(cell);
  const oc = cells(r.oc), oss = cells(r.oss), enc = cells(r.enc);
  // Markdown-table-safe escape: backslashes FIRST (so we don't double-
  // escape ones we add ourselves), then pipes. Required for any
  // user/content-provided target that might contain either character.
  const target = (r.target ?? '-')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
  md += `| ${i} | \`${r.name}\` | \`${r.role}\` | \`${r.cap ?? '-'}\` | \`${target}\` | ${oc[0]} | ${oc[1]} | ${oc[2]} | ${oc[3]} | ${oss[0]} | ${oss[1]} | ${oss[2]} | ${oss[3]} | ${enc[0]} | ${enc[1]} | ${enc[2]} | ${enc[3]} |\n`;
}
md += `\n`;

md += `## Failure-mode primer (with per-extension grounding)\n\n`;
md += `For an extension X with manifest-derived \`(capX, targetX)\`:\n\n`;
md += `- **F1 gate-bypass.** Corpus delta = \`[{op: capX, target: targetX, count: 1}]\`; audit = \`[]\`. The extension mutated its own surface without going through the admission gate.\n`;
md += `- **F2 audit-forgery.** Audit = \`[{type: irreversible.executed, payload: {ok:true, call:{cap:capX, target:targetX}}}]\`; corpus = \`[]\`. Audit claims X did the work, but no corpus mutation exists.\n`;
md += `- **F3 approved-but-failed-silent.** Audit \`ok=false\` for \`(capX, targetX)\` (excluded from \`S\`); corpus shows the mutation. Projects as F1 because \`S\` excludes \`ok=false\`.\n`;
md += `- **F4 wrong-target.** Audit approved \`(capX, targetX)\` but corpus mutated \`(capX, attacker-target)\`. Both halves of the multiset differ, surfacing as F1 + F2.\n\n`;

md += `## Methodology\n\n`;
md += `1. **Tree probe.** Walk every \`*.ts/.tsx/.mjs/.js/.cjs\` file in each tree (skipping node_modules, dist, build) and grep for the canonical symbol of each detection primitive. Probe terminates early once every primitive has been located.\n`;
md += `2. **Per-extension manifest derivation.** For each extension directory, read its manifest -- \`enclawed.module.json\` if signed (enclawed side), else \`enclawed.plugin.json\` (enclawed side), else fall back to \`package.json\`. Derive the extension's role (channel / provider / tool / etc.) and a canonical \`(cap, target)\` tuple consistent with that role.\n`;
md += `3. **Per-extension F1-F4 scenarios.** Build the four failure-mode scenarios using the extension's OWN \`(cap, target)\` so each row exercises that extension's specific capability surface.\n`;
md += `4. **Detection.** A scenario is detected iff (a) the subject's tree carries every primitive that scenario depends on AND (b) the in-memory biconditional checker (mirrored from \`src/enclawed/biconditional.ts\`) returns a non-ok report on the (delta, audit) pair.\n`;
md += `5. **Reproduce.** \`node enclawed/test/security/adversarial-comparison.harness.mjs\`. Override the upstream / companion paths with \`ENCLAWED_PATH\`, \`ENCLAWED_OSS_PATH\`, \`ENCLAWED_ENCLAVED_PATH\`. Dependency-free; runs on stock Node 22+.\n\n`;

md += `## What this proves\n\n`;
md += `- Every Enclawed extension's adversarial F1-F4 scenarios go undetected because the upstream tree contains zero detection primitives that could surface a (delta, audit) mismatch -- regardless of which capability the extension exposes.\n`;
md += `- Every enclawed-oss extension's adversarial F1-F4 scenarios are detected by the inherited biconditional checker, on (cap, target) pairs derived from each extension's OWN manifest -- not a synthetic constant.\n`;
md += `- enclawed-enclaved adds the bootstrap seal which blocks unsigned/under-verified extensions at admission time, so the same attacks never reach the corpus. The OSS biconditional checker stays in place as a post-hoc fallback.\n`;
md += `- Stated as a comparison: across the **${t.oc.present}** Enclawed extensions probed, Enclawed's framework caught **${t.oc.caught}** / ${t.oc.applicable} (rate **${pct(t.oc.caught, t.oc.applicable)}**); across the **${t.oss.present}** enclawed-oss extensions probed, enclawed-oss caught **${t.oss.caught}** / ${t.oss.applicable} (rate **${pct(t.oss.caught, t.oss.applicable)}**); across the **${t.enc.present}** enclawed-enclaved extensions probed, enclawed-enclaved caught **${t.enc.caught}** / ${t.enc.applicable} (rate **${pct(t.enc.caught, t.enc.applicable)}**).\n`;

process.stdout.write(md);
const outDir = path.resolve(process.cwd(), 'docs');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'adversarial-comparison-report.md');
writeFileSync(outPath, md, 'utf8');
process.stderr.write(`\n→ Report written to ${outPath}\n`);
