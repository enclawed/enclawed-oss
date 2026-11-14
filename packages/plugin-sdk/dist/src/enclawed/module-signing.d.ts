export type Ed25519KeyPair = {
    publicKey: string;
    privateKey: string;
};
export declare function generateEd25519KeyPair(): Ed25519KeyPair;
export declare function signManifest(canonicalBytes: Buffer, privateKeyPem: string): string;
export declare function verifyManifestSignature(canonicalBytes: Buffer, signatureBase64: string, publicKeyPem: string): boolean;
