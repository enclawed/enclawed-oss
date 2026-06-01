import { getFlavor } from './flavor.mjs';
import { canonicalManifestBytes, meetsClearance } from './module-manifest.mjs';
import { verifyManifestSignature } from './module-signing.mjs';
import { findSigner } from './trust-root.mjs';

export function checkModule(manifest, opts = {}) {
  const flavor = opts.flavor ?? getFlavor();
  const required = opts.requiredClearance;

  if (flavor === 'open') {
    const warnings = [];
    let signerKeyId = null;
    if (manifest.signerKeyId && manifest.signature) {
      const signer = findSigner(manifest.signerKeyId);
      if (!signer) {
        warnings.push(`signer "${manifest.signerKeyId}" not in trust root (open mode: warn-only)`);
      } else if (!verifyManifestSignature(canonicalManifestBytes(manifest), manifest.signature, signer.publicKeyPem)) {
        warnings.push('signature verification failed (open mode: warn-only)');
      } else if (!signer.approvedClearance.includes(manifest.clearance)) {
        warnings.push(`signer not approved for clearance "${manifest.clearance}" (open mode: warn-only)`);
      } else {
        signerKeyId = signer.keyId;
      }
    } else {
      warnings.push('module is unsigned (open mode: warn-only)');
    }
    if (required && !meetsClearance(manifest.clearance, required)) {
      return { allowed: false, flavor, reason: `module clearance "${manifest.clearance}" below required "${required}"` };
    }
    return { allowed: true, flavor, clearance: manifest.clearance, signerKeyId, warnings: Object.freeze(warnings) };
  }

  // enclaved
  if (!manifest.signerKeyId || !manifest.signature) {
    return { allowed: false, flavor, reason: 'enclaved flavor: module has no signature' };
  }
  const signer = findSigner(manifest.signerKeyId);
  if (!signer) {
    return { allowed: false, flavor, reason: `enclaved flavor: signer "${manifest.signerKeyId}" not in trust root` };
  }
  if (signer.notAfter && Date.parse(signer.notAfter) < Date.now()) {
    return { allowed: false, flavor, reason: `enclaved flavor: signer "${signer.keyId}" expired (${signer.notAfter})` };
  }
  if (!signer.approvedClearance.includes(manifest.clearance)) {
    return { allowed: false, flavor, reason: `enclaved flavor: signer "${signer.keyId}" not approved for clearance "${manifest.clearance}"` };
  }
  if (!verifyManifestSignature(canonicalManifestBytes(manifest), manifest.signature, signer.publicKeyPem)) {
    return { allowed: false, flavor, reason: 'enclaved flavor: signature verification failed' };
  }
  if (required && !meetsClearance(manifest.clearance, required)) {
    return { allowed: false, flavor, reason: `enclaved flavor: module clearance "${manifest.clearance}" below required "${required}"` };
  }
  return { allowed: true, flavor, clearance: manifest.clearance, signerKeyId: signer.keyId, warnings: Object.freeze([]) };
}
