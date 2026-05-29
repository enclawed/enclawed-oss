import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CAPS,
  RefinementError,
  normaliseDeclaredCaps,
  buildRefinedDispatch,
  isRefinedDispatchAdmissible,
  methodB,
} from '../src/skill-formal-types.mjs';

test('normaliseDeclaredCaps: rejects unknown tokens', () => {
  assert.throws(() => normaliseDeclaredCaps(['net.egress', 'BOGUS']), /unknown capability/);
});

test('normaliseDeclaredCaps: deduplicates and sorts', () => {
  const r = normaliseDeclaredCaps(['fs.read', 'net.egress', 'fs.read']);
  assert.deepEqual(r, ['fs.read', 'net.egress']);
});

test('normaliseDeclaredCaps: accepts a Set', () => {
  const r = normaliseDeclaredCaps(new Set(['publish']));
  assert.deepEqual(r, ['publish']);
});

test('buildRefinedDispatch: in-manifest envelope passes through unchanged', () => {
  const f = buildRefinedDispatch({ id: 'k', caps: ['net.egress', 'fs.read'] });
  const env = { capability: 'net.egress', target: 'example.com' };
  const out = f(env);
  assert.deepEqual(out, env);
});

test('buildRefinedDispatch: out-of-manifest envelope rejected with RefinementError', () => {
  const f = buildRefinedDispatch({ id: 'k', caps: ['net.egress'] });
  assert.throws(
    () => f({ capability: 'fs.write.irrev' }),
    RefinementError,
    'out-of-manifest must throw',
  );
  assert.throws(
    () => f({ capability: 'fs.write.irrev' }),
    /not in declared caps/,
  );
});

test('buildRefinedDispatch: unknown capability token rejected at the schema vocabulary level', () => {
  const f = buildRefinedDispatch({ id: 'k', caps: ['net.egress'] });
  assert.throws(
    () => f({ capability: 'BOGUS' }),
    /unknown capability/,
  );
});

test('buildRefinedDispatch: bad envelope shape', () => {
  const f = buildRefinedDispatch({ id: 'k', caps: ['net.egress'] });
  assert.throws(() => f(null), /envelope must be an object/);
  assert.throws(() => f({ capability: 42 }), /envelope.capability must be a string/);
});

test('buildRefinedDispatch: unauthorised manifest rejected eagerly', () => {
  assert.throws(() => buildRefinedDispatch(null), /manifest required/);
  assert.throws(() => buildRefinedDispatch({ caps: ['BOGUS'] }), /unknown capability/);
  // Empty caps is a valid but maximally-restrictive manifest (deny everything),
  // so it's accepted; the resulting dispatch denies every probe envelope.
  const f = buildRefinedDispatch({});
  assert.throws(() => f({ capability: 'net.egress' }), /not in declared caps/);
});

test('isRefinedDispatchAdmissible: predicate form mirrors throw form', () => {
  const m = { id: 'k', caps: ['net.egress', 'publish'] };
  assert.equal(isRefinedDispatchAdmissible(m, { capability: 'net.egress' }), true);
  assert.equal(isRefinedDispatchAdmissible(m, { capability: 'fs.read' }), false);
  assert.equal(isRefinedDispatchAdmissible(m, { capability: 'BOGUS' }), false);
});

test('methodB: probe-set verdict reproduces for every capability in the schema', () => {
  const v = methodB({
    manifest: { id: 'k', version: 1, caps: ['net.egress', 'fs.read'] },
  });
  assert.equal(v.method, 'B');
  assert.equal(v.contained, true);
  assert.equal(v.skillId, 'k');
  assert.equal(v.skillVersion, 1);
  assert.equal(v.probe.length, ALL_CAPS.size);
  // Each probe entry: actual matches expected
  for (const p of v.probe) {
    assert.equal(p.match, true);
  }
  // Specifically: declared caps should admit
  const admit = v.probe.filter(p => p.actual === 'admit').map(p => p.capability).sort();
  assert.deepEqual(admit, ['fs.read', 'net.egress']);
});

test('methodB: empty caps → every probe denies', () => {
  const v = methodB({ manifest: { caps: [] } });
  assert.equal(v.contained, true);   // probe vs spec all match: every probe is denied
  assert.equal(v.probe.every(p => p.actual === 'deny'), true);
});

test('methodB: JSON-serialisable verdict', () => {
  const v = methodB({ manifest: { id: 'k', caps: ['publish'] } });
  assert.doesNotThrow(() => JSON.stringify(v));
});
