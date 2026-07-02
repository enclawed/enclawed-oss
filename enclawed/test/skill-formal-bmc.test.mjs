import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  biconditionalHolds,
  referenceGate,
  simulateTrace,
  bmcBiconditional,
  methodC,
} from '../src/skill-formal-bmc.mjs';

test('referenceGate: in-manifest cap admits + executes + audits', () => {
  const r = referenceGate(new Set(['net.egress']), 'net.egress');
  assert.deepEqual(r, {
    envelopeCap: 'net.egress',
    gateVerdict: 'admit',
    executed: true,
    audited: true,
  });
});

test('referenceGate: out-of-manifest cap denies; not executed; still audited', () => {
  const r = referenceGate(new Set(['net.egress']), 'fs.write.irrev');
  assert.deepEqual(r, {
    envelopeCap: 'fs.write.irrev',
    gateVerdict: 'deny',
    executed: false,
    audited: true,
  });
});

test('referenceGate: synthetic out-of-manifest cap denies', () => {
  const r = referenceGate(new Set(['net.egress']), '__OUT__');
  assert.equal(r.gateVerdict, 'deny');
  assert.equal(r.executed, false);
});

test('biconditionalHolds: ok on a well-formed simulated trace', () => {
  const trace = simulateTrace(new Set(['net.egress', 'fs.read']),
                              ['net.egress', '__OUT__', 'fs.read']);
  const r = biconditionalHolds(trace);
  assert.equal(r.ok, true);
});

test('biconditionalHolds: detects executed-without-audit (synthetic violation)', () => {
  const r = biconditionalHolds([
    { envelopeCap: 'net.egress', gateVerdict: 'admit', executed: true, audited: false },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.violation.kind, 'world-change-without-admitted-record');
});

test('biconditionalHolds: detects executed-but-gate-said-deny (synthetic violation)', () => {
  const r = biconditionalHolds([
    { envelopeCap: 'fs.write.irrev', gateVerdict: 'deny', executed: true, audited: true },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.violation.kind, 'world-change-without-admitted-record');
});

test('biconditionalHolds: detects admitted-without-audit (synthetic)', () => {
  const r = biconditionalHolds([
    { envelopeCap: 'net.egress', gateVerdict: 'admit', executed: false, audited: false },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.violation.kind, 'admitted-record-without-audit-entry');
});

test('bmcBiconditional: UNSAT for a well-formed manifest at small bound', () => {
  const r = bmcBiconditional({ declaredCaps: ['net.egress', 'fs.read'], bound: 4 });
  assert.equal(r.verdict, 'unsat');
  assert.ok(r.exploredTraces > 0);
  assert.equal(r.bound, 4);
});

test('bmcBiconditional: bound=0 explores exactly 1 (empty) trace', () => {
  const r = bmcBiconditional({ declaredCaps: ['net.egress'], bound: 0 });
  assert.equal(r.verdict, 'unsat');
  assert.equal(r.exploredTraces, 1);
});

test('bmcBiconditional: rejects non-integer / negative bound', () => {
  assert.throws(() => bmcBiconditional({ declaredCaps: [], bound: -1 }), /non-negative integer/);
  assert.throws(() => bmcBiconditional({ declaredCaps: [], bound: 1.5 }), /non-negative integer/);
});

test('bmcBiconditional: rejects unknown capability tokens up front', () => {
  assert.throws(() => bmcBiconditional({ declaredCaps: ['BOGUS'], bound: 1 }), /unknown capability/);
});

test('bmcBiconditional: state-space size matches (|caps|+1)^bound enumeration', () => {
  // 2 caps + 1 OUT = 3 abstract envelopes; bound=3 ⇒ 1 + 3 + 9 + 27 = 40 traces.
  const r = bmcBiconditional({ declaredCaps: ['net.egress', 'fs.read'], bound: 3 });
  assert.equal(r.exploredTraces, 1 + 3 + 9 + 27);
});

test('methodC: produces a JSON-serialisable verdict with a stable instanceHash', () => {
  const v1 = methodC({ declaredCaps: ['net.egress', 'fs.read'], bound: 4 });
  const v2 = methodC({ declaredCaps: ['fs.read', 'net.egress'], bound: 4 });
  assert.equal(v1.method, 'C');
  assert.equal(v1.contained, true);
  assert.doesNotThrow(() => JSON.stringify(v1));
  // Order-independent: cap set + bound determines the instance.
  assert.equal(v1.instanceHash, v2.instanceHash);
});

test('methodC: changing bound changes the instanceHash', () => {
  const v1 = methodC({ declaredCaps: ['net.egress'], bound: 3 });
  const v2 = methodC({ declaredCaps: ['net.egress'], bound: 4 });
  assert.notEqual(v1.instanceHash, v2.instanceHash);
});
