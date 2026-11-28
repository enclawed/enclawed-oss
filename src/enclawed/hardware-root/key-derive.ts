// Command set 0.5, host side of KEY_DERIVE (0x39): a key the Enclaweder derives for this launch.
//
// Why. A key derived from a device SIGNATURE over a fixed message (the adapter kit's credential
// key did this through CHALLENGE) is available to any same-user process that can have the device
// sign that message, and CHALLENGE signs any 32 bytes for anyone, through the broker too. KEY_DERIVE
// instead answers only:
//   - inside SEALED, encrypted to this process's seal (the owner relaying it, and every other
//     reader of the device's reports, sees ciphertext);
//   - on presenting the nonce of a fresh, unspent ACTIVATION of this launch (activation.ts: an
//     UNLOCK_USE or session-start TOTP_VERIFY this process made), one derivation per activation;
//   - under its own signing tag ("enclaweder.key-derive.v1" | uid | label), which CHALLENGE ("ECW-
//     CHALLENGE-01" | nonce | uid) can never produce.
// The key is SHA3-256 of the device's deterministic Ed25519 signature over that message: the same
// for the same label on the same device, every time, and never on the host's disk.
//
// What remains: a same-user process that spends a use of the person's live grant itself holds an
// activation of its own, and can derive the key with it. It needs one of the person's
// authorisations, spent and counted on the device, to do so; it no longer needs nothing.

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type ActivationFacts,
  bindingNames,
  CS05,
  type HeldActivation,
  peekActivation,
  spendActivation,
} from "./activation.js";
import { CS04, openSeal, type SealRelay, sealFrame } from "./device-factors.js";

export type KeyDeriveFailure =
  | "unsupported" // firmware before command set 0.5
  | "no-activation" // this process holds no fresh activation of the launch
  | "refused" // the device holds no such activation (expired, spent, or forgotten at a reset)
  | "zeroized"
  | "locked" // the device-held latch is set
  | "bad-response"; // the answer does not verify under this seal

export type KeyDeriveResult =
  | Readonly<{ ok: true; key: Buffer; binding: Buffer; facts: ActivationFacts }>
  | Readonly<{ ok: false; code: KeyDeriveFailure }>;

const T = (s: string) => Buffer.from(s, "latin1");
const le64 = (v: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
};

/**
 * KEY_DERIVE for `label32` (what the key is for, e.g. SHA3-256 of a purpose string and the uid).
 * `relay` carries SEAL_OPEN / SEALED to the device (directly, or through the owner); `devicePubRaw`
 * is the CERTIFIED device key and `uid` its uid. Uses the newest activation this process holds for
 * the device unless one is given, and spends it for key derivation only when the device answered.
 */
export async function deriveDeviceKey(
  relay: SealRelay,
  devicePubRaw: Buffer,
  uid: Buffer,
  label32: Buffer,
  activation: HeldActivation | null = null,
): Promise<KeyDeriveResult> {
  if (label32.length !== 32) {
    throw new Error("a key-derivation label is 32 bytes");
  }
  const pubHex = devicePubRaw.toString("hex");
  const act = activation ?? peekActivation(pubHex, "key");
  if (!act) {
    return { ok: false, code: "no-activation" };
  }
  const seal = await openSeal(relay, devicePubRaw, uid);
  // sealFrame wipes the seal's keys; the response is decrypted and checked under copies.
  const kEnc = Buffer.from(seal.kEnc);
  const kMac = Buffer.from(seal.kMac);
  const id = seal.id;
  try {
    const inner = Buffer.concat([act.nonce, label32]);
    const ans = await relay(CS04.SEALED, sealFrame(seal, CS05.KEY_DERIVE, inner));
    inner.fill(0);
    if (ans.length === 1) {
      switch (ans[0]) {
        case 1:
          return { ok: false, code: "unsupported" }; // a 0.4 device refuses the sealed op
        case 5:
          spendActivation(pubHex, act, "key"); // the device does not hold it: never present it again
          return { ok: false, code: "refused" };
        case 6:
          return { ok: false, code: "zeroized" };
        case 9:
          return { ok: false, code: "locked" };
        default:
          return { ok: false, code: "bad-response" };
      }
    }
    const opened = openKeyDeriveAnswer(kEnc, kMac, uid, id, ans);
    if (!opened) {
      return { ok: false, code: "bad-response" };
    }
    spendActivation(pubHex, act, "key");
    const { key, binding } = opened;
    if (!bindingNames(binding, act.facts)) {
      key.fill(0);
      return { ok: false, code: "bad-response" };
    }
    return { ok: true, key, binding, facts: act.facts };
  } finally {
    kEnc.fill(0);
    kMac.fill(0);
    if (!activation) {
      act.nonce.fill(0);
    }
  }
}

/**
 * Opens a KEY_DERIVE answer `status(1) bind(32) ct(32) tag(32)` under the request's seal keys:
 * the tag HMAC-SHA3-256(K_mac, "ECW-SEAL-RMAC-01" | uid | seal_id | 0x39 | bind | ct) must verify
 * (constant time), then key = ct XOR HMAC-SHA3-256(K_enc, "ECW-SEAL-RSTR-01" | 0x00). Null when the
 * answer is not one, or does not verify under these keys.
 */
export function openKeyDeriveAnswer(
  kEnc: Buffer,
  kMac: Buffer,
  uid: Buffer,
  sealId: bigint,
  ans: Buffer,
): { key: Buffer; binding: Buffer } | null {
  if (ans.length !== 97 || ans[0] !== 0) {
    return null;
  }
  const binding = Buffer.from(ans.subarray(1, 33));
  const ct = ans.subarray(33, 65);
  const tag = createHmac("sha3-256", kMac)
    .update(
      Buffer.concat([
        T("ECW-SEAL-RMAC-01"),
        uid,
        le64(sealId),
        Buffer.from([CS05.KEY_DERIVE]),
        binding,
        ct,
      ]),
    )
    .digest();
  if (!timingSafeEqual(tag, ans.subarray(65, 97))) {
    return null;
  }
  const ks = createHmac("sha3-256", kEnc)
    .update(Buffer.concat([T("ECW-SEAL-RSTR-01"), Buffer.from([0])]))
    .digest();
  const key = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    key[i] = ct[i] ^ ks[i];
  }
  ks.fill(0);
  return { key, binding };
}

/**
 * What a kit says when the bound device predates command set 0.5 and it keeps deriving its
 * credential key from a CHALLENGE signature: the residual this closes on newer firmware.
 */
export const KEY_DERIVE_RESIDUAL =
  "the bound Enclaweder's firmware predates command set 0.5: the credential key is derived from a " +
  "device signature that any process of this user able to reach the device (directly or through " +
  "the hardware root's owner) can also obtain; update the Enclaweder firmware to bind it to a " +
  "device-verified launch activation";
