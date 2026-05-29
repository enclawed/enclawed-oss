import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditLogger, verifyChain, buildRecord } from '../src/audit-log.mjs';

async function tmp() {
  const dir = await mkdtemp(join(tmpdir(), 'enclawed-audit-'));
  return join(dir, 'audit.jsonl');
}

test('append + verify chain on fresh log', async () => {
  const path = await tmp();
  const a = new AuditLogger({ filePath: path, clock: () => 1000 });
  await a.append({ type: 'test.boot', actor: 'unit', level: null, payload: { x: 1 } });
  await a.append({ type: 'test.act', actor: 'unit', level: null, payload: { x: 2 } });
  await a.close();
  const result = await verifyChain(path);
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
});

test('verifyChain detects in-place tampering', async () => {
  const path = await tmp();
  const a = new AuditLogger({ filePath: path, clock: () => 1000 });
  await a.append({ type: 't', actor: 'u', level: null, payload: { x: 1 } });
  await a.append({ type: 't', actor: 'u', level: null, payload: { x: 2 } });
  await a.append({ type: 't', actor: 'u', level: null, payload: { x: 3 } });
  await a.close();

  const raw = await readFile(path, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const tampered = JSON.parse(lines[1]);
  tampered.payload.x = 999;  // edit in place
  lines[1] = JSON.stringify(tampered);
  await writeFile(path, lines.join('\n') + '\n');

  const result = await verifyChain(path);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
  assert.equal(result.reason, 'recordHash mismatch');
});

test('reopen continues the chain', async () => {
  const path = await tmp();
  const a = new AuditLogger({ filePath: path, clock: () => 1000 });
  await a.append({ type: 't', actor: 'u', level: null, payload: { x: 1 } });
  await a.close();
  const b = new AuditLogger({ filePath: path, clock: () => 2000 });
  await b.append({ type: 't', actor: 'u', level: null, payload: { x: 2 } });
  await b.close();
  const result = await verifyChain(path);
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
});

test('buildRecord is deterministic given inputs', () => {
  const r1 = buildRecord({
    prevHash: '0'.repeat(64),
    type: 't', actor: 'u', level: null, payload: { a: 1, b: 2 }, ts: 5,
  });
  const r2 = buildRecord({
    prevHash: '0'.repeat(64),
    type: 't', actor: 'u', level: null, payload: { b: 2, a: 1 }, ts: 5,
  });
  assert.equal(r1.recordHash, r2.recordHash);
});
