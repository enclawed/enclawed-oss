import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL, makeLabel, dominates, combine, format, parse,
  canRead, canWrite, DOE_Q_TEMPLATE, UNCLASSIFIED,
} from '../src/classification.mjs';

test('makeLabel rejects invalid level', () => {
  assert.throws(() => makeLabel({ level: 99 }), /invalid classification level/);
});

test('UNCLASSIFIED is the bottom of the lattice', () => {
  const ts = makeLabel({ level: LEVEL.TOP_SECRET });
  assert.equal(dominates(ts, UNCLASSIFIED), true);
  assert.equal(dominates(UNCLASSIFIED, ts), false);
});

test('dominates is reflexive', () => {
  const l = makeLabel({ level: LEVEL.SECRET, compartments: ['RD'] });
  assert.equal(dominates(l, l), true);
});

test('compartment containment matters even at higher level', () => {
  const subject = makeLabel({ level: LEVEL.TOP_SECRET, compartments: ['SI'] });
  const object = makeLabel({ level: LEVEL.SECRET, compartments: ['SI', 'TK'] });
  // Higher level alone is insufficient if object has compartments subject lacks.
  assert.equal(dominates(subject, object), false);
});

test('combine yields least-upper-bound', () => {
  const a = makeLabel({ level: LEVEL.SECRET, compartments: ['RD'] });
  const b = makeLabel({ level: LEVEL.TOP_SECRET, compartments: ['SI'] });
  const c = combine(a, b);
  assert.equal(c.level, LEVEL.TOP_SECRET);
  assert.deepEqual([...c.compartments], ['RD', 'SI']);
});

test('format produces standard generic banner by default', () => {
  const l = makeLabel({
    level: LEVEL.TOP_SECRET,
    compartments: ['FINANCE', 'M_AND_A'],
    releasability: ['EYES_ONLY'],
  });
  assert.equal(format(l), 'RESTRICTED-PLUS//FINANCE/M_AND_A//EYES_ONLY');
});

test('format with nameStyle:us-gov produces US-government banner', () => {
  const l = makeLabel({
    level: LEVEL.TOP_SECRET,
    compartments: ['SI', 'TK'],
    releasability: ['NOFORN'],
  });
  assert.equal(format(l, { nameStyle: 'us-gov' }), 'TOP SECRET//SI/TK//NOFORN');
});

test('parse round-trips with format for generic markings', () => {
  const cases = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'RESTRICTED-PLUS//FINANCE//EYES_ONLY'];
  for (const s of cases) {
    const parsed = parse(s);
    const reformatted = format(parsed);
    assert.equal(reformatted, s, `round-trip failed for ${s}`);
  }
});

test('parse round-trips with format for US-gov markings using nameStyle', () => {
  const cases = ['UNCLASSIFIED', 'CUI', 'SECRET', 'TOP SECRET//SI//NOFORN'];
  for (const s of cases) {
    const parsed = parse(s);
    const reformatted = format(parsed, { nameStyle: 'us-gov' });
    assert.equal(reformatted, s, `round-trip failed for ${s}`);
  }
});

test('parse keeps level=TS for SCI compartments and round-trips', () => {
  const l = parse('TOP SECRET//SI');
  assert.equal(l.level, LEVEL.TOP_SECRET);
  assert.ok(l.compartments.includes('SI'));
});

test('Q clearance dominates a SECRET//RD object', () => {
  const q = makeLabel(DOE_Q_TEMPLATE);
  const obj = makeLabel({ level: LEVEL.SECRET, compartments: ['RD'] });
  assert.equal(canRead(q, obj), true);
});

test('canWrite enforces no-write-down', () => {
  const subj = makeLabel({ level: LEVEL.SECRET });
  const ts = makeLabel({ level: LEVEL.TOP_SECRET });
  const u = UNCLASSIFIED;
  assert.equal(canWrite(subj, ts), true);   // writing UP is OK
  assert.equal(canWrite(subj, u), false);    // writing DOWN denied
});

test('label objects are frozen', () => {
  const l = makeLabel({ level: LEVEL.SECRET, compartments: ['RD'] });
  assert.throws(() => { l.level = 0; });
  // compartments / releasability are frozen arrays, so push() throws too.
  assert.throws(() => l.compartments.push('TK'));
  assert.ok(Object.isFrozen(l.compartments));
});
