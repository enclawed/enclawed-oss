import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  CAPABILITY,
  analyzeSource,
  analyzeSkillDirectory,
  checkContainment,
  methodA,
} from '../src/skill-formal-static.mjs';

function makeTinySkill(scripts) {
  const dir = mkdtempSync(path.join(tmpdir(), 'skill-formal-static-'));
  writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: test\n---\n# Test\n');
  for (const [name, src] of Object.entries(scripts)) {
    const fp = path.join(dir, name);
    mkdirSync(path.dirname(fp), { recursive: true });
    writeFileSync(fp, src);
  }
  return dir;
}

// --- analyzeSource: per-language pattern matching ---

test('Python: requests.get → net.egress with the URL host as abstract value', () => {
  const r = analyzeSource(
    "import requests\nrequests.get('https://api.example.com/foo')\n",
    '.py',
  );
  assert.equal(r.top, false);
  assert.deepEqual(
    r.effects.map(e => ({ cap: e.capability, val: e.abstractValue })),
    [{ cap: CAPABILITY.NET_EGRESS, val: 'api.example.com' }],
  );
});

test('Python: open(path,"w") → fs.write.rev; bare open() → fs.read', () => {
  const r = analyzeSource(
    "open('/tmp/out', 'w')\nopen('/etc/passwd')\n",
    '.py',
  );
  const caps = r.effects.map(e => e.capability).sort();
  assert.ok(caps.includes(CAPABILITY.FS_WRITE_REV));
  assert.ok(caps.includes(CAPABILITY.FS_READ));
});

test('Python: subprocess.run + os.remove → spawn.proc + fs.write.irrev', () => {
  const r = analyzeSource(
    "import subprocess, os\nsubprocess.run(['ls', '/tmp'])\nos.remove('/tmp/x')\n",
    '.py',
  );
  const caps = new Set(r.effects.map(e => e.capability));
  assert.ok(caps.has(CAPABILITY.SPAWN_PROC));
  assert.ok(caps.has(CAPABILITY.FS_WRITE_IRREV));
});

test('Python: exec()/eval() taints program to TOP', () => {
  const r = analyzeSource(
    "exec(some_string)\n",
    '.py',
  );
  assert.equal(r.top, true);
  assert.match(r.reason, /reflective/);
});

test('shell: curl → net.egress; > redirect → fs.write.rev; rm → fs.write.irrev', () => {
  const r = analyzeSource(
    "curl https://example.com/foo > /tmp/out\nrm -f /tmp/old\n",
    '.sh',
  );
  const caps = new Set(r.effects.map(e => e.capability));
  assert.ok(caps.has(CAPABILITY.NET_EGRESS));
  assert.ok(caps.has(CAPABILITY.FS_WRITE_REV));
  assert.ok(caps.has(CAPABILITY.FS_WRITE_IRREV));
});

test('JavaScript: fetch + fs.writeFile + child_process.spawn', () => {
  const r = analyzeSource(
    `import fs from 'node:fs';
     await fetch('https://api.example.com');
     fs.writeFileSync('/tmp/out', 'x');
     require('child_process').spawn('ls');
    `,
    '.js',
  );
  const caps = new Set(r.effects.map(e => e.capability));
  assert.ok(caps.has(CAPABILITY.NET_EGRESS));
  assert.ok(caps.has(CAPABILITY.FS_WRITE_REV));
  assert.ok(caps.has(CAPABILITY.SPAWN_PROC));
});

test('JavaScript: eval()/new Function() taints to TOP', () => {
  const r = analyzeSource("eval(blob)\n", '.js');
  assert.equal(r.top, true);
});

test('Unknown language conservatively reports TOP', () => {
  const r = analyzeSource("anything", '.weird-ext');
  assert.equal(r.top, true);
  assert.equal(r.reason, 'unknown-language');
});

test('Python comments do not contribute spurious matches', () => {
  const r = analyzeSource(
    "# requests.get('https://no.real.call/')\nx = 1\n",
    '.py',
  );
  assert.equal(r.effects.length, 0);
  assert.equal(r.top, false);
});

// --- analyzeSkillDirectory ---

test('analyzeSkillDirectory walks scripts and skips SKILL.md / docs / configs', () => {
  const dir = makeTinySkill({
    'fetch.py': "import requests\nrequests.get('https://example.com')\n",
    'helper.sh': 'echo hi > /tmp/out\n',
    'config.json': '{"x": 1}',
    'README.md': '# README',
  });
  const out = analyzeSkillDirectory(dir);
  assert.equal(out.stats.scriptsAnalysed, 2);
  assert.deepEqual([...out.unionEffects].sort(), [
    CAPABILITY.FS_WRITE_REV,
    CAPABILITY.NET_EGRESS,
  ]);
  assert.equal(out.anyTop, false);
});

test('analyzeSkillDirectory marks unknown extensions opaque', () => {
  const dir = makeTinySkill({
    'data.weird': 'binary or unknown',
    'fetch.py': "import requests\nrequests.get('https://x')\n",
  });
  const out = analyzeSkillDirectory(dir);
  assert.equal(out.opaqueFiles.length, 1);
  assert.equal(out.opaqueFiles[0], 'data.weird');
  assert.equal(out.stats.scriptsOpaque, 1);
});

test('analyzeSkillDirectory anyTop=true if any script taints', () => {
  const dir = makeTinySkill({
    'a.py': "import requests\nrequests.get('https://x')\n",
    'b.py': 'eval(some)\n',
  });
  const out = analyzeSkillDirectory(dir);
  assert.equal(out.anyTop, true);
});

// --- checkContainment & methodA ---

test('checkContainment: contained when union ⊆ M.caps', () => {
  const analysis = {
    unionEffects: new Set([CAPABILITY.NET_EGRESS, CAPABILITY.FS_READ]),
    anyTop: false,
  };
  const r = checkContainment(analysis, [CAPABILITY.NET_EGRESS, CAPABILITY.FS_READ, CAPABILITY.FS_WRITE_REV]);
  assert.equal(r.contained, true);
  assert.deepEqual(r.escapingCapabilities, []);
});

test('checkContainment: not contained — escaping caps reported', () => {
  const analysis = {
    unionEffects: new Set([CAPABILITY.NET_EGRESS, CAPABILITY.FS_WRITE_IRREV]),
    anyTop: false,
  };
  const r = checkContainment(analysis, [CAPABILITY.NET_EGRESS]);
  assert.equal(r.contained, false);
  assert.deepEqual(r.escapingCapabilities, [CAPABILITY.FS_WRITE_IRREV]);
});

test('checkContainment: anyTop forces non-containment', () => {
  const analysis = {
    unionEffects: new Set([CAPABILITY.NET_EGRESS]),
    anyTop: true,
  };
  const r = checkContainment(analysis, [CAPABILITY.NET_EGRESS]);
  assert.equal(r.contained, false);
  assert.match(r.reason, /reflective/);
});

test('methodA round-trip: contained skill produces a JSON-serialisable verdict', () => {
  const dir = makeTinySkill({
    'fetch.py': "import requests\nrequests.get('https://example.com')\n",
  });
  const v = methodA({
    dir,
    declaredCaps: [CAPABILITY.NET_EGRESS],
  });
  // JSON-serialisable
  assert.doesNotThrow(() => JSON.stringify(v));
  assert.equal(v.method, 'A');
  assert.equal(v.contained, true);
  assert.deepEqual(v.escapingCapabilities, []);
});

test('methodA: non-contained skill reports the escape', () => {
  const dir = makeTinySkill({
    'a.py': "import requests, os\nrequests.get('https://x')\nos.remove('/x')\n",
  });
  const v = methodA({
    dir,
    declaredCaps: [CAPABILITY.NET_EGRESS],   // missing fs.write.irrev
  });
  assert.equal(v.contained, false);
  assert.deepEqual(v.escapingCapabilities, [CAPABILITY.FS_WRITE_IRREV]);
});
