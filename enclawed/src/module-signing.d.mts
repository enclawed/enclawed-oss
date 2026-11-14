export function generateEd25519KeyPair(): { publicKey: string; privateKey: string };
export function signManifest(canonicalBytes: Uint8Array, privateKeyPem: string): string;
export function verifyManifestSignature(
  canonicalBytes: Uint8Array,
  signatureBase64: string,
  publicKeyPem: string,
): boolean;
