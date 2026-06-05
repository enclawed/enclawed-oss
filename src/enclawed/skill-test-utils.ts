// Test utilities for the skill trust schema. Not exported from index.ts.
// These helpers create real Ed25519 keys and signed skill bundles so tests
// can exercise the full 7-step verification path without touching the
// process-wide trust root.

import {
  generateEd25519KeyPair,
  signManifest,
} from "./module-signing.js";
import {
  type SkillManifestJson,
  type VerificationLevel,
  canonicalSkillBytes,
  contentSha256,
  parseSkillManifest,
} from "./skill-manifest.js";
import type { TrustedSigner } from "./trust-root.js";

export type TestBundle = Readonly<{
  manifestJson: SkillManifestJson;
  content: string;
  signature: string;
  signer: TrustedSigner;
}>;

export function buildSignedSkill(input: {
  id: string;
  caps: ReadonlyArray<string>;
  verification?: VerificationLevel;
  level?: number;
  version?: number;
  signerKeyId?: string;
  approvedClearance?: ReadonlyArray<string>;
  content?: string;
}): TestBundle {
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const signerKeyId = input.signerKeyId ?? "test-signer";
  const approvedClearance = input.approvedClearance ?? [
    "public",
    "internal",
    "confidential",
    "restricted",
    "restricted-plus",
  ];
  const signer: TrustedSigner = Object.freeze({
    keyId: signerKeyId,
    publicKeyPem: publicKey,
    approvedClearance: Object.freeze(approvedClearance.slice()),
    description: "test signer",
  });
  const content = input.content ?? `# ${input.id}\nbody`;
  const manifestJson: SkillManifestJson = Object.freeze({
    v: 1 as const,
    id: input.id,
    label: Object.freeze({
      level: input.level ?? 0,
      compartments: Object.freeze([]),
      releasability: Object.freeze([]),
    }),
    caps: Object.freeze(input.caps.slice() as never),
    signer: signerKeyId,
    version: input.version ?? 1,
    verification: input.verification ?? ("declared" as VerificationLevel),
  });
  const parsed = parseSkillManifest(manifestJson);
  const hash = contentSha256(content);
  const signature = signManifest(canonicalSkillBytes(parsed, hash), privateKey);
  return Object.freeze({ manifestJson, content, signature, signer });
}
