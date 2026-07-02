import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPolicy, checkChannel, checkProvider, checkTool,
  defaultClassifiedPolicy, defaultEnclavedPolicy, defaultOpenPolicy,
} from '../src/policy.mjs';
import { makeLabel, LEVEL } from '../src/classification.mjs';

test('createPolicy requires clearance and default label', () => {
  assert.throws(() => createPolicy({}), /maxOutputClearance is required/);
  assert.throws(
    () => createPolicy({ maxOutputClearance: makeLabel({ level: LEVEL.SECRET }) }),
    /defaultDataLabel is required/,
  );
});

test('default policy denies cloud channels', () => {
  const p = defaultClassifiedPolicy();
  assert.equal(checkChannel(p, 'whatsapp').allowed, false);
  assert.equal(checkChannel(p, 'discord').allowed, false);
  assert.equal(checkChannel(p, 'slack').allowed, false);
  assert.equal(checkChannel(p, 'web-loopback').allowed, true);
});

test('default policy denies cloud providers', () => {
  const p = defaultClassifiedPolicy();
  assert.equal(checkProvider(p, 'openai').allowed, false);
  assert.equal(checkProvider(p, 'anthropic').allowed, false);
  assert.equal(checkProvider(p, 'local-model').allowed, true);
});

test('default policy denies all tools by default', () => {
  const p = defaultClassifiedPolicy();
  assert.equal(checkTool(p, 'web-search').allowed, false);
  assert.equal(checkTool(p, 'shell-exec').allowed, false);
});

test('deny reasons name the offending id', () => {
  const p = defaultClassifiedPolicy();
  const r = checkChannel(p, 'discord');
  assert.match(r.reason, /discord/);
});

test('policy is immutable after creation', () => {
  const p = defaultClassifiedPolicy();
  assert.throws(() => { p.allowedChannels = new Set(); });
});

test('defaultEnclavedPolicy enforces allowlists', () => {
  const p = defaultEnclavedPolicy();
  assert.equal(p.enforceAllowlists, true);
  assert.equal(checkChannel(p, 'whatsapp').allowed, false);
});

test('defaultOpenPolicy permits everything (allowlist disabled)', () => {
  const p = defaultOpenPolicy();
  assert.equal(p.enforceAllowlists, false);
  assert.equal(checkChannel(p, 'whatsapp').allowed, true);
  assert.equal(checkProvider(p, 'openai').allowed, true);
  assert.equal(checkTool(p, 'shell').allowed, true);
});

test('defaultClassifiedPolicy is an alias of defaultEnclavedPolicy', () => {
  assert.equal(defaultClassifiedPolicy, defaultEnclavedPolicy);
});
