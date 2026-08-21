// Ed25519 sign + verify utilities for module manifests.
//
// Why Ed25519: deterministic signatures, constant-time verify, no parameter
// choices to get wrong, FIPS 186-5 approved. node:crypto exposes Ed25519
// via the generic sign/verify (algorithm = null) on KeyObjects.
//
// LIMITATION: a real classified deployment must hold private keys in an
// HSM (PKCS#11) and never let them touch a software-resident KeyObject.
// The signing helpers below are useful for offline manifest signing during
// module build; runtime verification is the only operation that should
// occur on the deployed gateway.

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";

export type Ed25519KeyPair = { publicKey: string; privateKey: string };

export function generateEd25519KeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

function loadPublicKey(pem: string): KeyObject {
  return createPublicKey({ key: pem, format: "pem" });
}

function loadPrivateKey(pem: string): KeyObject {
  return createPrivateKey({ key: pem, format: "pem" });
}

// `data` is the canonical manifest bytes (NOT the hex hash) so the signature
// commits to the full canonical encoding. Returns base64.
export function signManifest(canonicalBytes: Buffer, privateKeyPem: string): string {
  const key = loadPrivateKey(privateKeyPem);
  return cryptoSign(null, canonicalBytes, key).toString("base64");
}

export function verifyManifestSignature(
  canonicalBytes: Buffer,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  const key = loadPublicKey(publicKeyPem);
  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(signatureBase64, "base64");
  } catch {
    return false;
  }
  if (sigBuf.length !== 64) return false;
  try {
    return cryptoVerify(null, canonicalBytes, key, sigBuf);
  } catch {
    return false;
  }
}
