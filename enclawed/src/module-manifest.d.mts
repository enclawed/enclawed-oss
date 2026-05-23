export type ModuleManifest = Readonly<{
  v: 1;
  id: string;
  publisher: string;
  version: string;
  clearance: string;
  capabilities: ReadonlyArray<string>;
  signerKeyId?: string;
  signature?: string;
  verification?: string;
  netAllowedHosts?: ReadonlyArray<string>;
}>;

export const LEGACY_CLEARANCE_ORDER: Record<string, number>;
export const CLEARANCE_ORDER: Record<string, number>;

export function clearanceToRank(name: string): number | undefined;
export function parseManifest(raw: unknown): ModuleManifest;
export function canonicalManifestBytes(manifest: ModuleManifest): Uint8Array;
export function canonicalManifestHash(manifest: ModuleManifest): string;
export function meetsClearance(actual: string, required: string): boolean;
