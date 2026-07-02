import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFlavor, isEnclaved, parseFlavor } from '../src/flavor.mjs';

test('parseFlavor accepts secure aliases', () => {
  for (const v of ['enclaved', 'secure', 'classified', 'high-side', 'ENCLAVED']) {
    assert.equal(parseFlavor(v), 'enclaved');
  }
});

test('parseFlavor accepts open aliases', () => {
  for (const v of ['open', 'enclawed-compat', 'permissive', 'default']) {
    assert.equal(parseFlavor(v), 'open');
  }
});

test('parseFlavor returns null for unknown values', () => {
  assert.equal(parseFlavor(undefined), null);
  assert.equal(parseFlavor('zzzz'), null);
  assert.equal(parseFlavor(42), null);
});

test('getFlavor defaults to open', () => {
  assert.equal(getFlavor({}), 'open');
});

test('getFlavor reads ENCLAWED_FLAVOR=enclaved', () => {
  assert.equal(getFlavor({ ENCLAWED_FLAVOR: 'enclaved' }), 'enclaved');
  assert.equal(isEnclaved({ ENCLAWED_FLAVOR: 'enclaved' }), true);
});
