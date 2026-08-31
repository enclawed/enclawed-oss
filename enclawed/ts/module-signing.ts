// TypeScript shim over ../src/module-signing.mjs.

// eslint-disable-next-line import/no-relative-packages
import * as impl from "../src/module-signing.mjs";

export function generateEd25519KeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  return impl.generateEd25519KeyPair();
}

export function signManifest(canonicalBytes: Uint8Array, privateKeyPem: string): string {
  return impl.signManifest(canonicalBytes, privateKeyPem);
}

export function verifyManifestSignature(
  canonicalBytes: Uint8Array,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  return impl.verifyManifestSignature(canonicalBytes, signatureBase64, publicKeyPem);
}
