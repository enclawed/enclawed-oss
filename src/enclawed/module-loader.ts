// Decision function for "should this module be permitted to load?".
//
// In the "open" flavor, unsigned modules are permitted (a soft warning is
// returned in the decision so the host can log it). In the "enclaved"
// flavor, every module MUST present a manifest signed by a trust-root
// signer that is approved for the manifest's declared clearance level,
// and the manifest's clearance must meet any caller-specified requirement.
//
// The host calls checkModule() with the parsed manifest. If allowed=false,
// the host MUST refuse to import the module's code. The host MUST also
// audit the decision (an audit append happens automatically when the
// runtime is set).

import type { Flavor } from "./flavor.js";
import { getFlavor } from "./flavor.js";
import {
  type ClearanceLevel,
  canonicalManifestBytes,
  meetsClearance,
  type ModuleManifest,
} from "./module-manifest.js";
import { verifyManifestSignature } from "./module-signing.js";
import { getRuntime } from "./runtime.js";
import { findSigner } from "./trust-root.js";

export type ModuleDecision =
  | {
      allowed: true;
      flavor: Flavor;
      clearance: ClearanceLevel;
      signerKeyId: string | null;
      warnings: ReadonlyArray<string>;
    }
  | {
      allowed: false;
      flavor: Flavor;
      reason: string;
    };

export function checkModule(
  manifest: ModuleManifest,
  opts?: { requiredClearance?: ClearanceLevel; flavor?: Flavor },
): ModuleDecision {
  const flavor = opts?.flavor ?? getFlavor();
  const required = opts?.requiredClearance;

  const audit = (decision: ModuleDecision) => {
    const rt = getRuntime();
    if (rt) {
      rt.audit
        .append({
          type: "module.decision",
          actor: manifest.id,
          level: manifest.clearance,
          payload: { decision, flavor },
        })
        .catch(() => {});
    }
    return decision;
  };

  // Open flavor: allowlist is permissive; missing/invalid signature is a
  // warning, not a deny. Required-clearance is still enforced if the caller
  // supplied it (e.g. the Q-cleared MCP module asking for q-cleared peers).
  if (flavor === "open") {
    const warnings: string[] = [];
    let signerKeyId: string | null = null;
    if (manifest.signerKeyId && manifest.signature) {
      const signer = findSigner(manifest.signerKeyId);
      if (!signer) {
        warnings.push(`signer "${manifest.signerKeyId}" not in trust root (open mode: warn-only)`);
      } else if (
        !verifyManifestSignature(
          canonicalManifestBytes(manifest),
          manifest.signature,
          signer.publicKeyPem,
        )
      ) {
        warnings.push("signature verification failed (open mode: warn-only)");
      } else if (!signer.approvedClearance.includes(manifest.clearance)) {
        warnings.push(
          `signer not approved for clearance "${manifest.clearance}" (open mode: warn-only)`,
        );
      } else {
        signerKeyId = signer.keyId;
      }
    } else {
      warnings.push("module is unsigned (open mode: warn-only)");
    }
    if (required && !meetsClearance(manifest.clearance, required)) {
      return audit({
        allowed: false,
        flavor,
        reason: `module clearance "${manifest.clearance}" below required "${required}"`,
      });
    }
    return audit({
      allowed: true,
      flavor,
      clearance: manifest.clearance,
      signerKeyId,
      warnings: Object.freeze(warnings),
    });
  }

  // Enclaved flavor: hard requirements.
  if (!manifest.signerKeyId || !manifest.signature) {
    return audit({
      allowed: false,
      flavor,
      reason: "enclaved flavor: module has no signature",
    });
  }
  const signer = findSigner(manifest.signerKeyId);
  if (!signer) {
    return audit({
      allowed: false,
      flavor,
      reason: `enclaved flavor: signer "${manifest.signerKeyId}" not in trust root`,
    });
  }
  if (signer.notAfter && Date.parse(signer.notAfter) < Date.now()) {
    return audit({
      allowed: false,
      flavor,
      reason: `enclaved flavor: signer "${signer.keyId}" expired (${signer.notAfter})`,
    });
  }
  if (!signer.approvedClearance.includes(manifest.clearance)) {
    return audit({
      allowed: false,
      flavor,
      reason: `enclaved flavor: signer "${signer.keyId}" not approved for clearance "${manifest.clearance}"`,
    });
  }
  if (
    !verifyManifestSignature(
      canonicalManifestBytes(manifest),
      manifest.signature,
      signer.publicKeyPem,
    )
  ) {
    return audit({
      allowed: false,
      flavor,
      reason: "enclaved flavor: signature verification failed",
    });
  }
  if (required && !meetsClearance(manifest.clearance, required)) {
    return audit({
      allowed: false,
      flavor,
      reason: `enclaved flavor: module clearance "${manifest.clearance}" below required "${required}"`,
    });
  }
  return audit({
    allowed: true,
    flavor,
    clearance: manifest.clearance,
    signerKeyId: signer.keyId,
    warnings: Object.freeze([]),
  });
}
