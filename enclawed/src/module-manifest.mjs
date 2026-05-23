import { createHash } from 'node:crypto';

// Manifest clearance is now scheme-driven; CLEARANCE_ORDER below is a
// fallback for callers that look up a string clearance without going
// through the active scheme. See classification-scheme.mjs.
import { clearanceNameToRank as schemeNameToRank } from './classification-scheme.mjs';

export const LEGACY_CLEARANCE_ORDER = Object.freeze({
  public: 0, internal: 1, confidential: 2, restricted: 3, 'restricted-plus': 4,
  unclassified: 0, cui: 1, secret: 3, 'top-secret': 4, 'q-cleared': 4,
});
export const CLEARANCE_ORDER = LEGACY_CLEARANCE_ORDER;

export function clearanceToRank(name) {
  const fromScheme = schemeNameToRank(name);
  if (fromScheme !== undefined) return fromScheme;
  return LEGACY_CLEARANCE_ORDER[String(name).toLowerCase()];
}

export function parseManifest(raw) {
  if (raw === null || typeof raw !== 'object') {
    throw new TypeError('manifest must be a JSON object');
  }
  if (raw.v !== 1) throw new Error(`unsupported manifest version: ${raw.v}`);
  const id = String(raw.id ?? '').trim();
  if (!id) throw new Error('manifest.id is required');
  const publisher = String(raw.publisher ?? '').trim();
  if (!publisher) throw new Error('manifest.publisher is required');
  const version = String(raw.version ?? '').trim();
  if (!version) throw new Error('manifest.version is required');
  const clearance = String(raw.clearance ?? '').trim();
  if (clearanceToRank(clearance) === undefined) {
    throw new Error(
      `manifest.clearance "${clearance}" is not a recognized name in the active classification scheme`,
    );
  }
  if (!Array.isArray(raw.capabilities) || !raw.capabilities.every((c) => typeof c === 'string')) {
    throw new Error('manifest.capabilities must be string[]');
  }
  const capabilities = Object.freeze(raw.capabilities.slice());
  const signerKeyId =
    typeof raw.signerKeyId === 'string' && raw.signerKeyId.trim().length > 0
      ? raw.signerKeyId.trim()
      : undefined;
  const signature =
    typeof raw.signature === 'string' && raw.signature.trim().length > 0
      ? raw.signature.trim()
      : undefined;
  // `verification` and `netAllowedHosts` participate in the canonical
  // signed form (see canonicalExtensionManifestBytes() in
  // extension-admission.mjs). Preserve them so the runtime can
  // reconstruct the exact bytes the manifest was signed against;
  // dropping them here makes every signature look invalid because the
  // runtime canonicalizes a body with `verification: undefined`.
  const verification =
    typeof raw.verification === 'string' && raw.verification.trim().length > 0
      ? raw.verification.trim()
      : undefined;
  const netAllowedHosts =
    Array.isArray(raw.netAllowedHosts) && raw.netAllowedHosts.every((h) => typeof h === 'string')
      ? Object.freeze(raw.netAllowedHosts.slice())
      : Object.freeze([]);
  return Object.freeze({
    v: 1, id, publisher, version, clearance, capabilities,
    signerKeyId, signature, verification, netAllowedHosts,
  });
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

export function canonicalManifestBytes(manifest) {
  // Canonical body — MUST match canonicalExtensionManifestBytes() in
  // extension-admission.mjs and the body shape constructed by the
  // bulk signer at scripts/dev/sign-all-bundled-manifests.mjs. All
  // three paths (admitExtension, checkModule, the signing script)
  // canonicalize the same fields in the same order; otherwise a
  // signature produced by one path won't verify on another.
  // `verification` and `netAllowedHosts` are admission-relevant fields
  // and must be in the signed bytes — leaving them out would allow a
  // signed manifest to silently change its verification level or
  // host allow-list without invalidating the signature.
  const body = {
    v: manifest.v,
    id: manifest.id,
    publisher: manifest.publisher,
    version: manifest.version,
    clearance: manifest.clearance,
    capabilities: [...manifest.capabilities].sort(),
    signerKeyId: manifest.signerKeyId ?? null,
    verification: manifest.verification,
    netAllowedHosts: [...(manifest.netAllowedHosts ?? [])].sort(),
  };
  return Buffer.from(canonicalize(body), 'utf8');
}

export function canonicalManifestHash(manifest) {
  return createHash('sha256').update(canonicalManifestBytes(manifest)).digest('hex');
}

export function meetsClearance(actual, required) {
  return CLEARANCE_ORDER[actual] >= CLEARANCE_ORDER[required];
}
