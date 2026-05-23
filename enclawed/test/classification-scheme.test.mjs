import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILT_IN_SCHEMES,
  DEFAULT_SCHEME,
  FINANCIAL_SERVICES_SCHEME,
  GENERIC_3_TIER_SCHEME,
  HEALTHCARE_HIPAA_SCHEME,
  US_GOVERNMENT_SCHEME,
  clearanceNameToRank,
  getActiveScheme,
  loadSchemeByName,
  maxRank,
  parseClassificationScheme,
  resetActiveScheme,
  setActiveScheme,
} from '../src/classification-scheme.mjs';
import { format, makeLabel, parse } from '../src/classification.mjs';

test('default scheme has 6 ranks 0..5', () => {
  resetActiveScheme();
  assert.equal(maxRank(), 5);
  assert.equal(getActiveScheme().id, 'enclawed-default');
});

test('every built-in preset round-trips its canonical names', () => {
  for (const [name, scheme] of Object.entries(BUILT_IN_SCHEMES)) {
    setActiveScheme(scheme);
    try {
      for (const lv of scheme.levels) {
        const label = makeLabel({ level: lv.rank });
        const formatted = format(label);
        const reparsed = parse(formatted);
        assert.equal(reparsed.level, lv.rank, `${name}: ${lv.canonicalName} did not round-trip`);
      }
    } finally { resetActiveScheme(); }
  }
});

test('healthcare scheme accepts "PHI" but not "TOP SECRET"', () => {
  setActiveScheme(HEALTHCARE_HIPAA_SCHEME);
  try {
    assert.equal(clearanceNameToRank('PHI'), 2);
    assert.equal(clearanceNameToRank('SENSITIVE-PHI'), 3);
    assert.equal(clearanceNameToRank('TOP SECRET'), undefined);
    assert.throws(() => parse('TOP SECRET'), /unrecognized classification head/);
  } finally { resetActiveScheme(); }
});

test('financial-services scheme has MNPI at rank 3', () => {
  setActiveScheme(FINANCIAL_SERVICES_SCHEME);
  try {
    assert.equal(clearanceNameToRank('MNPI'), 3);
    assert.equal(clearanceNameToRank('insider'), 3);  // alias, case-insensitive
    assert.equal(format(makeLabel({ level: 3, compartments: ['DEAL_TEAM'] })),
                 'MNPI//DEAL_TEAM');
  } finally { resetActiveScheme(); }
});

test('us-government scheme uses canonical us-gov banner names', () => {
  setActiveScheme(US_GOVERNMENT_SCHEME);
  try {
    assert.equal(format(makeLabel({ level: 4 })), 'TOP SECRET');
    assert.equal(parse('SECRET').level, 3);
    // Validates releasability whitelist from the scheme
    const l = parse('TOP SECRET//SI//NOFORN');
    assert.deepEqual([...l.releasability], ['NOFORN']);
    assert.deepEqual([...l.compartments], ['SI']);
  } finally { resetActiveScheme(); }
});

test('generic-3-tier scheme rejects ranks above its max', () => {
  setActiveScheme(GENERIC_3_TIER_SCHEME);
  try {
    assert.throws(() => makeLabel({ level: 5 }), /scheme "generic-3-tier" supports ranks 0..2/);
    assert.doesNotThrow(() => makeLabel({ level: 2 }));
  } finally { resetActiveScheme(); }
});

test('parseClassificationScheme accepts a custom JSON scheme', () => {
  const custom = parseClassificationScheme({
    id: 'acme-2026',
    description: 'ACME Corp internal data classification policy v3.2',
    levels: [
      { rank: 0, canonicalName: 'Public', aliases: ['P'] },
      { rank: 1, canonicalName: 'Internal', aliases: ['I'] },
      { rank: 2, canonicalName: 'Customer Data', aliases: [] },
      { rank: 3, canonicalName: 'Privileged', aliases: ['legal'] },
    ],
    validCompartments: ['FINANCE', 'ENG', 'LEGAL'],
    validReleasability: ['NDA', 'EYES_ONLY'],
  });
  assert.equal(custom.id, 'acme-2026');
  assert.equal(custom.levels.length, 4);
  setActiveScheme(custom);
  try {
    assert.equal(parse('Privileged').level, 3);
    assert.equal(parse('legal').level, 3);  // alias
    assert.equal(format(makeLabel({ level: 2, compartments: ['FINANCE'] })),
                 'Customer Data//FINANCE');
    assert.throws(() => makeLabel({ level: 4 }), /supports ranks 0..3/);
  } finally { resetActiveScheme(); }
});

test('parseClassificationScheme rejects non-contiguous ranks', () => {
  assert.throws(
    () => parseClassificationScheme({
      id: 'broken', description: '',
      levels: [
        { rank: 0, canonicalName: 'A', aliases: [] },
        { rank: 2, canonicalName: 'B', aliases: [] },
      ],
    }),
    /ranks must be contiguous/,
  );
});

test('parseClassificationScheme rejects duplicate names', () => {
  assert.throws(
    () => parseClassificationScheme({
      id: 'broken', description: '',
      levels: [
        { rank: 0, canonicalName: 'Alpha', aliases: [] },
        { rank: 1, canonicalName: 'Beta', aliases: ['ALPHA'] },
      ],
    }),
    /duplicate name/,
  );
});

test('loadSchemeByName resolves built-in ids', async () => {
  const s = await loadSchemeByName('healthcare-hipaa');
  assert.equal(s.id, 'healthcare-hipaa');
});

test('switching schemes mid-run does not leak state', () => {
  resetActiveScheme();
  assert.equal(getActiveScheme().id, 'enclawed-default');
  setActiveScheme(HEALTHCARE_HIPAA_SCHEME);
  assert.equal(getActiveScheme().id, 'healthcare-hipaa');
  resetActiveScheme();
  assert.equal(getActiveScheme().id, 'enclawed-default');
});
