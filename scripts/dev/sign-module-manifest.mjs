// One-shot helper to generate a dev signing key + signed manifest for the
// reference Q-cleared MCP module. Run once during module dev; output goes
// into the module's enclawed.module.json and the trust-root entry in
// src/enclawed/trust-root.ts. The private key is printed once and then
// discarded — in a real lab build this would live only inside the HSM.

import { createHash, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

const KEY_ID = 'enclawed-q-cleared-reference-2026';

const manifest = {
  v: 1,
  id: 'mcp-q-cleared',
  publisher: 'enclawed reference',
  version: '0.1.0',
  clearance: 'q-cleared',
  capabilities: ['mcp-client', 'tool'],
  signerKeyId: KEY_ID,
};
const body = {
  v: manifest.v,
  id: manifest.id,
  publisher: manifest.publisher,
  version: manifest.version,
  clearance: manifest.clearance,
  capabilities: [...manifest.capabilities].sort(),
  signerKeyId: manifest.signerKeyId,
};
const canonicalBytes = Buffer.from(canonicalize(body), 'utf8');
const signature = cryptoSign(null, canonicalBytes, privateKey).toString('base64');
manifest.signature = signature;

console.log('--- public key (paste into trust-root.ts as REFERENCE_Q_CLEARED_PUBKEY) ---');
console.log(publicPem);
console.log('--- key id ---');
console.log(KEY_ID);
console.log('--- canonical hash ---');
console.log(createHash('sha256').update(canonicalBytes).digest('hex'));

await writeFile(
  process.argv[2] ?? 'enclawed.module.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log('--- wrote', process.argv[2]);
