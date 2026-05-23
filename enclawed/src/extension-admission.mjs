// Biconditional admission gate for non-skill extensions (paper §3 + §5).
//
// "Like skills" — every loadable extension is the tuple
//     Extension = (manifest M, content, signature σ)
// where M declares the runtime capabilities the extension intends to use.
// The trust schema is identical in spirit to skill admission: declared
// capabilities (D) must equal observed capabilities (S) at run time.
// Anything below verification=tested is denied any net.* capability in
// enclaved flavor, and the runtime never elevates verification.
//
// What this module owns:
//   1. parseExtensionManifest(): structural + cap-vocabulary validation,
//      verification-level parsing, and per-cap target lists (for net.egress
//      this is `netAllowedHosts`).
//   2. admitExtension(): the biconditional admission gate.
//        - default deny: any extension without a manifest is rejected
//          outright in enclaved flavor; in open flavor it is admitted at
//          verification=unverified with NO net capabilities at all (any
//          Socket.connect attempt by such an extension fails).
//        - net.egress requires verification >= tested in enclaved flavor;
//          declared/unverified extensions cannot ship internet access.
//        - signed-by-trust-root is mandatory in enclaved flavor; in open
//          flavor unsigned modules are admitted but flagged.
//   3. installPerExtensionEgressGuard(): a per-extension wrapper around
//      installRawSocketGuard() that admits ONLY the hosts declared in the
//      manifest and records a biconditional.violation audit record on any
//      out-of-bound connect. This is the runtime half of the biconditional:
//      observed egress targets are compared to declared net.egress hosts.
//
// LIMITATION (intentional):
//   - The biconditional is per-process: a child process spawned by the
//     extension via spawn.proc and then making outbound connections is
//     out of scope here. The extension that declares spawn.proc must
//     either keep the child confined or the deploying organization must
//     enforce kernel-level egress controls (paper §4.4).
//   - Native modules (N-API addons) using raw connect(2) are outside JS
//     reach and outside this gate.

import { parseManifest } from './module-manifest.mjs';
import { verifyManifestSignature } from './module-signing.mjs';
import { findSigner } from './trust-root.mjs';
import { getFlavor } from './flavor.mjs';
import { EgressDeniedError, installRawSocketGuard } from './egress-guard.mjs';

// Capability vocabulary mirrors skill-capabilities.ts. Mirrored here so
// the .mjs runtime does not depend on the TypeScript twin at run time.
export const CAPABILITY = Object.freeze({
  NET_EGRESS: 'net.egress',
  FS_READ: 'fs.read',
  FS_WRITE_REV: 'fs.write.rev',
  FS_WRITE_IRREV: 'fs.write.irrev',
  TOOL_INVOKE: 'tool.invoke',
  SPAWN_PROC: 'spawn.proc',
  PUBLISH: 'publish',
  PAY: 'pay',
  MUTATE_SCHEMA: 'mutate.schema',
});

const ALL_CAPS = Object.freeze(Object.values(CAPABILITY));
const CAP_SET = new Set(ALL_CAPS);

export const VERIFICATION = Object.freeze({
  UNVERIFIED: 'unverified',
  DECLARED: 'declared',
  TESTED: 'tested',
  FORMAL: 'formal',
});

const VERIFICATION_RANK = Object.freeze({
  unverified: 0, declared: 1, tested: 2, formal: 3,
});

function rank(v) {
  return VERIFICATION_RANK[v] ?? 0;
}

// Extension-specific canonical bytes. Unlike module-manifest's
// canonicalManifestBytes, this commits *every* admission-relevant field
// to the signature, including verification and netAllowedHosts. Without
// this, an adversary who edits netAllowedHosts post-signing keeps a
// legitimate signature on a manifest with a wider net allowlist than
// the publisher actually attested to.
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

export function canonicalExtensionManifestBytes(manifest) {
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

export class ExtensionAdmissionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ExtensionAdmissionError';
    this.code = code;
  }
}

// Parse an extension manifest beyond what module-manifest.mjs already does:
// validate the cap vocabulary, verification level, and net.egress target
// list (an explicit array of literal hostnames or IPv4 addresses; CIDR
// matching is handled by the policy layer, not the per-extension manifest).
export function parseExtensionManifest(raw) {
  const base = parseManifest(raw);
  const unknown = base.capabilities.filter((c) => !CAP_SET.has(c));
  if (unknown.length > 0) {
    throw new ExtensionAdmissionError(
      `extension manifest: unknown capabilities: ${unknown.join(', ')}`,
      'unknown_capability',
    );
  }
  const verification =
    typeof raw.verification === 'string' && raw.verification in VERIFICATION_RANK
      ? raw.verification
      : VERIFICATION.UNVERIFIED;
  const netAllowedHosts = Array.isArray(raw.netAllowedHosts)
    ? raw.netAllowedHosts.filter((h) => typeof h === 'string').map(String)
    : [];
  if (base.capabilities.includes(CAPABILITY.NET_EGRESS) && netAllowedHosts.length === 0) {
    throw new ExtensionAdmissionError(
      'extension manifest: net.egress declared but netAllowedHosts is empty — declared targets must be an explicit allowlist',
      'net_egress_no_hosts',
    );
  }
  return Object.freeze({
    ...base,
    verification,
    netAllowedHosts: Object.freeze(netAllowedHosts.slice()),
  });
}

// Biconditional admission gate.
//
//   admitExtension({ manifest, flavor }) →
//     { allowed: true, manifest, signerKeyId, warnings }
//   | throws ExtensionAdmissionError
//
// Admission contract:
//   - If `manifest` is null/undefined: rejected outright in enclaved flavor;
//     in open flavor the caller may admit the extension as
//     verification=unverified with capabilities=[] (no net access). The
//     caller is responsible for that fall-back synthesis; this function
//     only handles the case where a manifest was actually provided.
//   - In enclaved flavor: signature must verify against the trust root.
//     If the manifest declares net.egress, verification must be ≥ tested.
//   - In open flavor: unsigned manifests admitted as warnings; declared
//     net.egress at unverified is admitted with a warning so the operator
//     can decide.
export function admitExtension({ manifest, flavor }) {
  const f = flavor ?? getFlavor();
  const declaresNet = manifest.capabilities.includes(CAPABILITY.NET_EGRESS);

  if (f === 'enclaved') {
    if (!manifest.signerKeyId || !manifest.signature) {
      throw new ExtensionAdmissionError(
        `extension "${manifest.id}" rejected: enclaved flavor requires a signed manifest`,
        'unsigned_in_enclaved',
      );
    }
    const signer = findSigner(manifest.signerKeyId);
    if (!signer) {
      throw new ExtensionAdmissionError(
        `extension "${manifest.id}" rejected: signer "${manifest.signerKeyId}" not in trust root`,
        'unknown_signer',
      );
    }
    if (signer.notAfter && Date.parse(signer.notAfter) < Date.now()) {
      throw new ExtensionAdmissionError(
        `extension "${manifest.id}" rejected: signer "${signer.keyId}" expired (${signer.notAfter})`,
        'signer_expired',
      );
    }
    if (!signer.approvedClearance.includes(manifest.clearance)) {
      throw new ExtensionAdmissionError(
        `extension "${manifest.id}" rejected: signer "${signer.keyId}" not approved for clearance "${manifest.clearance}"`,
        'clearance_not_approved',
      );
    }
    if (!verifyManifestSignature(canonicalExtensionManifestBytes(manifest), manifest.signature, signer.publicKeyPem)) {
      throw new ExtensionAdmissionError(
        `extension "${manifest.id}" rejected: signature verification failed`,
        'signature_invalid',
      );
    }
    if (declaresNet && rank(manifest.verification) < rank(VERIFICATION.TESTED)) {
      throw new ExtensionAdmissionError(
        `extension "${manifest.id}" rejected: net.egress requires verification ≥ tested in enclaved flavor (got "${manifest.verification}")`,
        'net_requires_tested',
      );
    }
    return Object.freeze({ allowed: true, manifest, signerKeyId: signer.keyId, flavor: f, warnings: Object.freeze([]) });
  }

  // open flavor
  const warnings = [];
  let signerKeyId = null;
  if (manifest.signerKeyId && manifest.signature) {
    const signer = findSigner(manifest.signerKeyId);
    if (!signer) {
      warnings.push(`signer "${manifest.signerKeyId}" not in trust root (open mode: warn-only)`);
    } else if (!verifyManifestSignature(canonicalExtensionManifestBytes(manifest), manifest.signature, signer.publicKeyPem)) {
      warnings.push('signature verification failed (open mode: warn-only)');
    } else {
      signerKeyId = signer.keyId;
    }
  } else {
    warnings.push('module is unsigned (open mode: warn-only)');
  }
  if (declaresNet && rank(manifest.verification) < rank(VERIFICATION.TESTED)) {
    warnings.push(`net.egress declared at verification "${manifest.verification}" — operator should promote to ≥ tested`);
  }
  return Object.freeze({ allowed: true, manifest, signerKeyId, flavor: f, warnings: Object.freeze(warnings) });
}

// Per-extension Socket-egress guard. Admits only the hosts the manifest
// declared in net.egress (D), audits every connect attempt (S), and emits
// a biconditional.violation record whenever S is not a subset of D — i.e.,
// the extension tried to reach a host it never declared.
//
// Returns { uninstall(), isAllowed, observedHosts } so callers can both
// uninstall the patch and inspect the observed-host set after the fact for
// post-hoc biconditional checks.
export function installPerExtensionEgressGuard({ manifest, audit, extraAllowedHosts = [] }) {
  if (!manifest) throw new TypeError('installPerExtensionEgressGuard: manifest required');
  const declaredHosts = new Set([...manifest.netAllowedHosts, ...extraAllowedHosts].map(String));
  const observedHosts = new Set();
  const violations = [];

  const handle = installRawSocketGuard({
    allowedHosts: [...declaredHosts],
    onDeny: (info) => {
      violations.push(info);
      if (audit && typeof audit.append === 'function') {
        // Fire-and-forget; the caller's audit logger is hash-chained and
        // serialized, so out-of-order completion is fine.
        Promise.resolve(audit.append({
          type: 'biconditional.violation',
          actor: manifest.id,
          level: null,
          payload: {
            kind: 'extension.net.egress',
            extensionId: manifest.id,
            host: info.host,
            port: info.port,
            declaredHosts: [...declaredHosts],
            reason: 'observed egress target outside declared net.egress allowlist (S \\ D ≠ ∅)',
          },
        })).catch(() => undefined);
      }
    },
  });

  // Wrap isAllowed to record observed hosts for the post-hoc check.
  const observingIsAllowed = (host, port) => {
    const ok = handle.isAllowed(host, port);
    if (ok) observedHosts.add(String(host));
    return ok;
  };

  return Object.freeze({
    uninstall: () => handle.uninstall(),
    isAllowed: observingIsAllowed,
    observedHosts,
    violations,
    declaredHosts,
  });
}

// Post-hoc biconditional check: declared net.egress hosts (D) must equal
// the set the extension actually used (S). Returns { ok, undeclared, unused }.
//
//   undeclared = S \ D (the dangerous direction — observed without
//                       declaration; should be empty after the per-extension
//                       guard runs because such attempts are denied at
//                       admission time, but the audit log persists them).
//   unused     = D \ S (over-declaration; allowed but useful to surface so
//                       operators can tighten the manifest).
export function biconditionalNetCheck({ declaredHosts, observedHosts }) {
  const D = new Set(declaredHosts);
  const S = new Set(observedHosts);
  const undeclared = [...S].filter((h) => !D.has(h));
  const unused = [...D].filter((h) => !S.has(h));
  return Object.freeze({
    ok: undeclared.length === 0,
    undeclared: Object.freeze(undeclared),
    unused: Object.freeze(unused),
  });
}

export { EgressDeniedError };
