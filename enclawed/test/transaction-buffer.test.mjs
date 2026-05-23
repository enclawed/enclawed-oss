import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TransactionBuffer } from '../src/transaction-buffer.mjs';

function buf(opts = {}) {
  // Tiny synthetic memory so eviction is easy to trigger.
  return new TransactionBuffer({ totalMemory: 10_000, ...opts });
}

test('default ramPercent = 50% of provided totalMemory', () => {
  const b = buf();
  assert.equal(b.bytesLimit(), 5000);
});

test('explicit ramPercent overrides default', () => {
  assert.equal(buf({ ramPercent: 25 }).bytesLimit(), 2500);
  assert.equal(buf({ ramPercent: 100 }).bytesLimit(), 10000);
});

test('explicit maxBytes wins over ramPercent', () => {
  assert.equal(buf({ maxBytes: 1234 }).bytesLimit(), 1234);
});

test('rejects ramPercent outside (0,100]', () => {
  assert.throws(() => buf({ ramPercent: 0 }), /must be in/);
  assert.throws(() => buf({ ramPercent: 101 }), /must be in/);
  assert.throws(() => buf({ ramPercent: -5 }), /must be in/);
});

test('record returns a frozen transaction with hash chain', () => {
  const b = buf();
  const tx = b.record({ description: 'create', payload: { x: 1 }, inverse: () => {} });
  assert.equal(typeof tx.id, 'string');
  assert.equal(tx.description, 'create');
  assert.equal(typeof tx.hash, 'string');
  assert.equal(tx.hash.length, 64);
  assert.equal(tx.prevHash, '0'.repeat(64));
  assert.ok(Object.isFrozen(tx));
  assert.throws(() => { tx.description = 'evil'; });
});

test('rejects non-function inverse and empty description', () => {
  const b = buf();
  assert.throws(() => b.record({ description: '', payload: {}, inverse: () => {} }), TypeError);
  assert.throws(() => b.record({ description: 'x', payload: {}, inverse: 'nope' }), TypeError);
});

test('verifyChain succeeds across many records (no eviction)', () => {
  // Pick a buffer big enough to hold all 25 records without auto-commit.
  const b = new TransactionBuffer({ totalMemory: 40_000 });
  for (let i = 0; i < 25; i++) {
    b.record({ description: 'op-' + i, payload: { i }, inverse: () => {} });
  }
  assert.equal(b.verifyChain(), true);
  assert.equal(b.size(), 25);
  assert.equal(b.totalEvicted(), 0);
});

test('rollback runs inverses in LIFO order', async () => {
  const b = buf();
  const order = [];
  for (let i = 0; i < 5; i++) {
    b.record({ description: 'op-' + i, payload: { i }, inverse: () => order.push(i) });
  }
  const r = await b.rollback(3);
  assert.equal(r.rolledBack, 3);
  assert.equal(r.failed, 0);
  assert.deepEqual(order, [4, 3, 2]);
  assert.equal(b.size(), 2);
});

test('rollback past the head returns rolledBack=size, failed=0', async () => {
  const b = buf();
  for (let i = 0; i < 3; i++) {
    b.record({ description: 't', payload: i, inverse: () => {} });
  }
  const r = await b.rollback(10);
  assert.equal(r.rolledBack, 3);
  assert.equal(r.failed, 0);
  assert.equal(b.size(), 0);
});

test('rollback continues past failing inverses but reports them', async () => {
  const b = buf();
  let count = 0;
  for (let i = 0; i < 4; i++) {
    b.record({
      description: 'op-' + i,
      payload: i,
      inverse: () => { if (i === 2) throw new Error('inverse-2 fails'); count++; },
    });
  }
  const r = await b.rollback(4);
  assert.equal(r.rolledBack, 3);
  assert.equal(r.failed, 1);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].error, /inverse-2 fails/);
  assert.equal(count, 3);
});

test('commit drops the oldest n from the rollback buffer', () => {
  const b = buf();
  for (let i = 0; i < 5; i++) {
    b.record({ description: 't', payload: i, inverse: () => {} });
  }
  const r = b.commit(2);
  assert.equal(r.committed, 2);
  assert.equal(b.size(), 3);
  assert.equal(b.totalCommitted(), 2);
});

test('commit() with no arg drains the entire buffer', () => {
  const b = buf();
  for (let i = 0; i < 5; i++) {
    b.record({ description: 't', payload: i, inverse: () => {} });
  }
  b.commit();
  assert.equal(b.size(), 0);
});

test('eviction auto-commits oldest when adding would exceed cap', () => {
  // Each record ~ 256 bytes overhead + small payload, so 8 records ~ 2k.
  const b = buf({ maxBytes: 1500 });
  // Insert until eviction kicks in
  for (let i = 0; i < 10; i++) {
    b.record({ description: 'op', payload: { i }, inverse: () => {} });
  }
  assert.ok(b.size() < 10, 'some records should have been evicted');
  assert.ok(b.bytesUsed() <= b.bytesLimit());
  assert.ok(b.totalEvicted() > 0);
  // Surviving chain still verifies (the chain anchor of the tail is preserved).
  assert.equal(b.verifyChain(), true);
});

test('rejects a single transaction larger than the entire buffer', () => {
  const b = buf({ maxBytes: 100 });
  assert.throws(() => b.record({
    description: 'huge',
    payload: 'x'.repeat(10000),
    inverse: () => {},
  }), RangeError);
});

test('verifyChain detects in-place tampering', () => {
  const b = buf();
  b.record({ description: 'a', payload: { x: 1 }, inverse: () => {} });
  b.record({ description: 'b', payload: { x: 2 }, inverse: () => {} });
  // Tamper by replacing a record's payload via direct array access. Records
  // are frozen; we have to swap the array entry entirely.
  const arr = b._txs;
  const old = arr[0];
  arr[0] = { ...old, payload: { x: 99 } };
  assert.equal(b.verifyChain(), false);
});

test('audit-log integration captures record + rollback + commit + eviction', async () => {
  const seen = [];
  const audit = { append: async (r) => { seen.push(r.type); return r; } };
  // Sized so the first ~10 records fit but adding more triggers eviction.
  // Each record ~280 bytes, so 4000 holds ~14, then more inserts evict.
  const b = new TransactionBuffer({ maxBytes: 4000, audit });
  for (let i = 0; i < 18; i++) {
    b.record({ description: 'op', payload: i, inverse: () => {} });
  }
  await b.rollback(2);
  b.commit(1);
  await new Promise((r) => setImmediate(r));
  assert.ok(seen.includes('transaction.recorded'),  'record audit missing');
  assert.ok(seen.includes('transaction.rolled-back'), 'rollback audit missing');
  assert.ok(seen.includes('transaction.committed'),   'commit audit missing');
  assert.ok(seen.includes('transaction.evicted'),     'eviction audit missing');
});

test('rollback re-anchors chain so subsequent records continue cleanly', async () => {
  const b = buf();
  for (let i = 0; i < 5; i++) {
    b.record({ description: 'op', payload: i, inverse: () => {} });
  }
  await b.rollback(2);
  b.record({ description: 'after-rollback', payload: 'x', inverse: () => {} });
  assert.equal(b.verifyChain(), true);
});

test('rollback throws on non-positive n', async () => {
  const b = buf();
  await assert.rejects(() => b.rollback(0), RangeError);
  await assert.rejects(() => b.rollback(-3), RangeError);
  await assert.rejects(() => b.rollback(NaN), RangeError);
});
