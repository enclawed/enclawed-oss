// Types for skill-formal-bundle.mjs (proof-carrying skill bundle producer and
// bootstrap re-checker). Declared by hand, like module-signing.d.mts, so
// TypeScript callers load the one verified implementation instead of a copy.

export type FormalManifest = Readonly<{
  id?: string;
  version?: number;
  caps: ReadonlyArray<string>;
  [key: string]: unknown;
}>;

export type FormalBundle = Readonly<{
  schemaVersion: number;
  evidence: Readonly<{ static: unknown; types: unknown; smt_unsat: unknown }>;
  attestation: Readonly<{
    contained: boolean;
    verificationLevel: "formal";
    producedAt: string;
    signerKeyId: string | null;
    [key: string]: unknown;
  }>;
}>;

export type FormalVerdict = Readonly<{
  admit: boolean;
  verificationLevel: "formal" | "declared";
  reasons: string[];
  evidence: unknown;
  freshlyComputed: unknown;
}>;

export function produceFormalBundle(args: {
  skillDir: string;
  manifest: FormalManifest;
  signerKeyId?: string;
  privateKeyPem?: string;
  bound?: number;
}): FormalBundle;

export function writeFormalBundle(bundle: FormalBundle, bundleDir: string): void;

export function readFormalBundle(bundleDir: string): FormalBundle;

export function verifyFormalBundle(args: {
  skillDir: string;
  manifest: FormalManifest;
  bundle: FormalBundle;
  signerPublicKeyPem?: string;
  authorisedFormalSigners?: ReadonlySet<string> | ReadonlyArray<string>;
}): FormalVerdict;
