import { type ActivationFacts, type HeldActivation } from "./activation.js";
import { type SealRelay } from "./device-factors.js";
export type KeyDeriveFailure = "unsupported" | "no-activation" | "refused" | "zeroized" | "locked" | "bad-response";
export type KeyDeriveResult = Readonly<{
    ok: true;
    key: Buffer;
    binding: Buffer;
    facts: ActivationFacts;
}> | Readonly<{
    ok: false;
    code: KeyDeriveFailure;
}>;
/**
 * KEY_DERIVE for `label32` (what the key is for, e.g. SHA3-256 of a purpose string and the uid).
 * `relay` carries SEAL_OPEN / SEALED to the device (directly, or through the owner); `devicePubRaw`
 * is the CERTIFIED device key and `uid` its uid. Uses the newest activation this process holds for
 * the device unless one is given, and spends it for key derivation only when the device answered.
 */
export declare function deriveDeviceKey(relay: SealRelay, devicePubRaw: Buffer, uid: Buffer, label32: Buffer, activation?: HeldActivation | null): Promise<KeyDeriveResult>;
/**
 * Opens a KEY_DERIVE answer `status(1) bind(32) ct(32) tag(32)` under the request's seal keys:
 * the tag HMAC-SHA3-256(K_mac, "ECW-SEAL-RMAC-01" | uid | seal_id | 0x39 | bind | ct) must verify
 * (constant time), then key = ct XOR HMAC-SHA3-256(K_enc, "ECW-SEAL-RSTR-01" | 0x00). Null when the
 * answer is not one, or does not verify under these keys.
 */
export declare function openKeyDeriveAnswer(kEnc: Buffer, kMac: Buffer, uid: Buffer, sealId: bigint, ans: Buffer): {
    key: Buffer;
    binding: Buffer;
} | null;
/**
 * What a kit says when the bound device predates command set 0.5 and it keeps deriving its
 * credential key from a CHALLENGE signature: the residual this closes on newer firmware.
 */
export declare const KEY_DERIVE_RESIDUAL: string;
