// TypeScript shim over the canonical .mjs implementation. The canonical
// shape (incl. `verification` and `netAllowedHosts` in the signed body)
// lives in ../src/module-manifest.mjs; this wrapper re-exports it with
// TypeScript types so callers under tsdown / vitest can import the same
// runtime functions without a second source of truth.

// Use a relative path with explicit extension; vitest resolves .mjs natively.
// eslint-disable-next-line import/no-relative-packages
import * as impl from "../src/module-manifest.mjs";

export type ClearanceLevel = string;

export type ModuleManifest = Readonly<{
  v: 1;
  id: string;
  publisher: string;
  version: string;
  clearance: ClearanceLevel;
  capabilities: ReadonlyArray<string>;
  signerKeyId?: string;
  signature?: string;
  // Admission-relevant fields that participate in the canonical signed
  // body. See ../src/module-manifest.mjs for the canonicalize() shape.
  verification?: string;
  netAllowedHosts?: ReadonlyArray<string>;
}>;

export const LEGACY_CLEARANCE_ORDER: Record<string, number> = impl.LEGACY_CLEARANCE_ORDER as Record<
  string,
  number
>;
export const CLEARANCE_ORDER: Record<string, number> = impl.CLEARANCE_ORDER as Record<
  string,
  number
>;

export function clearanceToRank(name: string): number | undefined {
  return impl.clearanceToRank(name);
}

export function parseManifest(raw: unknown): ModuleManifest {
  return impl.parseManifest(raw) as ModuleManifest;
}

export function canonicalManifestBytes(manifest: ModuleManifest): Uint8Array {
  return impl.canonicalManifestBytes(manifest);
}

export function canonicalManifestHash(manifest: ModuleManifest): string {
  return impl.canonicalManifestHash(manifest);
}

export function meetsClearance(actual: ClearanceLevel, required: ClearanceLevel): boolean {
  return impl.meetsClearance(actual, required);
}
