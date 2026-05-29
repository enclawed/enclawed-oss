// Skill manifest schema for the trust schema of paper §3.
//
// A skill artifact is the tuple Skill = (manifest M, content, signature σ).
// M has five mandatory fields:
//   - label:        Bell-LaPadula label (rank, compartments, releasability)
//   - caps:         finite set of capability tokens (skill-capabilities.ts)
//   - signer:       key id referencing an entry in the trust root
//   - version:      monotone integer; replays of older signed manifests are
//                   rejected if a newer one with the same identity has been
//                   observed
//   - verification: enum {unverified, declared, tested, formal} (default
//                   unverified) — the central new field of the paper.
//
// The manifest is canonicalized with sorted keys, hashed (SHA-256), and the
// detached signature in σ is verified by the loader (skill-loader.ts) over
// the canonical bytes of (M, content). The runtime never elevates
// verification at run time (paper §3.1).

import { createHash } from "node:crypto";

import {
  ALL_CAPABILITIES,
  type CapabilityToken,
  isCapabilityToken,
} from "./skill-capabilities.js";
import { type Label, makeLabel } from "./classification.js";

export const VERIFICATION = Object.freeze({
  UNVERIFIED: "unverified",
  DECLARED: "declared",
  TESTED: "tested",
  FORMAL: "formal",
} as const);

export type VerificationLevel = (typeof VERIFICATION)[keyof typeof VERIFICATION];

const VERIFICATION_RANK: Readonly<Record<VerificationLevel, number>> = Object.freeze({
  unverified: 0,
  declared: 1,
  tested: 2,
  formal: 3,
});

export function verificationRank(v: VerificationLevel): number {
  return VERIFICATION_RANK[v];
}

export function isVerificationLevel(value: unknown): value is VerificationLevel {
  return typeof value === "string" && value in VERIFICATION_RANK;
}

// At-rest manifest as it appears in the on-disk JSON.
export type SkillManifestJson = Readonly<{
  v: 1;
  id: string;
  label: Readonly<{
    level: number;
    compartments?: ReadonlyArray<string>;
    releasability?: ReadonlyArray<string>;
  }>;
  caps: ReadonlyArray<CapabilityToken>;
  signer: string;
  version: number;
  verification: VerificationLevel;
}>;

// Loaded manifest with the label resolved into the runtime BLP type.
export type SkillManifest = Readonly<{
  v: 1;
  id: string;
  label: Label;
  caps: ReadonlyArray<CapabilityToken>;
  signer: string;
  version: number;
  verification: VerificationLevel;
}>;

const PROTO_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function parseSkillManifest(raw: unknown): SkillManifest {
  if (raw === null || typeof raw !== "object") {
    throw new TypeError("skill manifest must be a JSON object");
  }
  const m = raw as Record<string, unknown>;
  for (const k of Object.keys(m)) {
    if (PROTO_KEYS.has(k)) {
      throw new Error(`skill manifest: forbidden key ${k}`);
    }
  }
  const allowed = new Set(["v", "id", "label", "caps", "signer", "version", "verification"]);
  for (const k of Object.keys(m)) {
    if (!allowed.has(k)) {
      throw new Error(`skill manifest: unknown field "${k}"`);
    }
  }
  if (m.v !== 1) {
    throw new Error(`skill manifest: unsupported version ${String(m.v)}`);
  }
  const id = typeof m.id === "string" ? m.id.trim() : "";
  if (!id) throw new Error("skill manifest: id is required");

  if (m.label === null || typeof m.label !== "object") {
    throw new Error("skill manifest: label must be an object");
  }
  const labelIn = m.label as Record<string, unknown>;
  if (typeof labelIn.level !== "number" || !Number.isInteger(labelIn.level)) {
    throw new Error("skill manifest: label.level must be an integer");
  }
  const compartments = Array.isArray(labelIn.compartments)
    ? labelIn.compartments.map((c) => {
        if (typeof c !== "string") {
          throw new Error("skill manifest: label.compartments must be string[]");
        }
        return c;
      })
    : undefined;
  const releasability = Array.isArray(labelIn.releasability)
    ? labelIn.releasability.map((c) => {
        if (typeof c !== "string") {
          throw new Error("skill manifest: label.releasability must be string[]");
        }
        return c;
      })
    : undefined;
  const label = makeLabel({ level: labelIn.level, compartments, releasability });

  if (!Array.isArray(m.caps)) {
    throw new Error("skill manifest: caps must be an array");
  }
  const seen = new Set<string>();
  const caps: CapabilityToken[] = [];
  for (const c of m.caps) {
    if (!isCapabilityToken(c)) {
      throw new Error(
        `skill manifest: unknown capability "${String(c)}" (allowed: ${ALL_CAPABILITIES.join(", ")})`,
      );
    }
    if (seen.has(c)) continue;
    seen.add(c);
    caps.push(c);
  }

  const signer = typeof m.signer === "string" ? m.signer.trim() : "";
  if (!signer) throw new Error("skill manifest: signer is required");

  if (typeof m.version !== "number" || !Number.isInteger(m.version) || m.version < 0) {
    throw new Error("skill manifest: version must be a non-negative integer");
  }

  const verification = isVerificationLevel(m.verification)
    ? m.verification
    : VERIFICATION.UNVERIFIED;

  return Object.freeze({
    v: 1 as const,
    id,
    label,
    caps: Object.freeze(caps),
    signer,
    version: m.version,
    verification,
  });
}

// Canonical bytes hashed and signed. Includes content hash so that mutating
// the body invalidates any signature without renegotiating the manifest.
// The signature itself is NEVER part of the canonical bytes.
export function canonicalSkillBytes(manifest: SkillManifest, contentSha256: string): Buffer {
  const body = {
    v: manifest.v,
    id: manifest.id,
    label: {
      level: manifest.label.level,
      compartments: [...manifest.label.compartments].sort(),
      releasability: [...manifest.label.releasability].sort(),
    },
    caps: [...manifest.caps].sort(),
    signer: manifest.signer,
    version: manifest.version,
    verification: manifest.verification,
    contentSha256,
  };
  return Buffer.from(canonicalize(body), "utf8");
}

export function contentSha256(content: Buffer | string): string {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return createHash("sha256").update(buf).digest("hex");
}

export function canonicalSkillHash(manifest: SkillManifest, contentHashHex: string): string {
  return createHash("sha256")
    .update(canonicalSkillBytes(manifest, contentHashHex))
    .digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => !PROTO_KEYS.has(k))
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}
