import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEgressGuard, installEgressGuard, EgressDeniedError,
} from '../src/egress-guard.mjs';

function fakeFetch() {
  return async (input) => ({ ok: true, url: String(input) });
}

test('guard blocks unallowed host', async () => {
  const guard = createEgressGuard({
    allowedHosts: ['127.0.0.1'],
    fetchImpl: fakeFetch(),
  });
  await assert.rejects(
    () => guard('https://evil.example.com/'),
    EgressDeniedError,
  );
});

test('guard allows host on the list', async () => {
  const guard = createEgressGuard({
    allowedHosts: ['127.0.0.1'],
    fetchImpl: fakeFetch(),
  });
  const r = await guard('http://127.0.0.1:8000/health');
  assert.equal(r.ok, true);
});

test('guard handles Request-like input', async () => {
  const guard = createEgressGuard({
    allowedHosts: ['localhost'],
    fetchImpl: fakeFetch(),
  });
  const r = await guard({ url: 'http://localhost/x' });
  assert.equal(r.ok, true);
});

test('guard rejects malformed URL strings', async () => {
  const guard = createEgressGuard({
    allowedHosts: ['localhost'],
    fetchImpl: fakeFetch(),
  });
  await assert.rejects(() => guard('not-a-url'), EgressDeniedError);
});

test('onDeny callback fires and exceptions are swallowed', async () => {
  const calls = [];
  const guard = createEgressGuard({
    allowedHosts: [],
    fetchImpl: fakeFetch(),
    onDeny: (info) => { calls.push(info); throw new Error('callback boom'); },
  });
  await assert.rejects(() => guard('https://x.example.com/'), EgressDeniedError);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].host, 'x.example.com');
});

test('installEgressGuard / restore round-trips global.fetch', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = fakeFetch();
  const restore = installEgressGuard({ allowedHosts: ['localhost'] });
  assert.notEqual(globalThis.fetch, orig);
  assert.equal(globalThis.fetch.__enclawedGuard, true);
  restore();
  globalThis.fetch = orig;
});
