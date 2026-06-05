import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, redact, highestSeverity } from '../src/dlp-scanner.mjs';

test('detects US classification banner', () => {
  const f = scan('Header: TOP SECRET//SI/TK//NOFORN body...');
  const ids = f.map((x) => x.id);
  assert.ok(ids.includes('us-classification-banner'));
});

test('detects DOE Restricted Data marking', () => {
  const f = scan('See FORMERLY RESTRICTED DATA section');
  assert.ok(f.some((x) => x.id === 'us-doe-restricted-data'));
});

test('detects industry distribution caveats', () => {
  const f = scan('Please keep this UNDER NDA and EYES_ONLY for the deal team.');
  assert.ok(f.some((x) => x.id === 'industry-distribution-caveat'));
});

test('detects international PII (email, E.164 phone, IBAN)', () => {
  const f = scan('Contact alice@example.com or +442071234567; bank GB82WEST12345698765432');
  const ids = f.map((x) => x.id);
  assert.ok(ids.includes('email-address'));
  assert.ok(ids.includes('phone-e164'));
  assert.ok(ids.includes('iban'));
});

test('detects AWS access key', () => {
  const f = scan('aws=AKIA1234567890ABCDEF more');
  assert.ok(f.some((x) => x.id === 'aws-access-key-id'));
});

test('detects PEM private key header', () => {
  const f = scan('-----BEGIN RSA PRIVATE KEY-----\nbase64...');
  assert.ok(f.some((x) => x.id === 'pem-private-key' && x.severity === 'critical'));
});

test('detects US SSN', () => {
  const f = scan('SSN 123-45-6789 do not share');
  assert.ok(f.some((x) => x.id === 'us-ssn'));
});

test('does not flag clean text', () => {
  const f = scan('hello world, nothing to see here');
  assert.equal(f.length, 0);
});

test('highestSeverity returns the worst', () => {
  const f = [
    { id: 'a', severity: 'medium' },
    { id: 'b', severity: 'critical' },
    { id: 'c', severity: 'low' },
  ];
  assert.equal(highestSeverity(f), 'critical');
});

test('redact replaces high-severity matches', () => {
  const out = redact('key=AKIA1234567890ABCDEF tail');
  assert.match(out, /\[REDACTED\]/);
  assert.doesNotMatch(out, /AKIA1234567890ABCDEF/);
});

test('redact below threshold leaves text alone', () => {
  const text = 'see ticket JWT-1234';  // not a real JWT, no detections
  assert.equal(redact(text), text);
});
