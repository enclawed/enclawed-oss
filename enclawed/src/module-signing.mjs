import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

export function generateEd25519KeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
}

export function signManifest(canonicalBytes, privateKeyPem) {
  const key = createPrivateKey({ key: privateKeyPem, format: 'pem' });
  return cryptoSign(null, canonicalBytes, key).toString('base64');
}

export function verifyManifestSignature(canonicalBytes, signatureBase64, publicKeyPem) {
  const key = createPublicKey({ key: publicKeyPem, format: 'pem' });
  let sigBuf;
  try { sigBuf = Buffer.from(signatureBase64, 'base64'); } catch { return false; }
  if (sigBuf.length !== 64) return false;
  try { return cryptoVerify(null, canonicalBytes, key, sigBuf); } catch { return false; }
}
