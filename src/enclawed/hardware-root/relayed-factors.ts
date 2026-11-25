// The device-verified second factor for a CLIENT of the machine's device owner (the broker).
//
// A client drives no device: the owner relays for it. The owner is untrusted transport, so this
// gives the client the same DeviceTotpAccess a local owner has, with every answer checked HERE
// against the primary member's certified key (verified at connectRoot, finding H15):
//
//   TOTP_VERIFY, SIGN_ATTESTED, UNLOCK_GRANT   sealed to the device (SEAL_OPEN / SEALED): the owner
//                                              sees ciphertext only, the device's seal-open answer is
//                                              signed under the certified key (an owner relaying to
//                                              another device fails there), each seal is one-use,
//                                              and the device's answer is signed over the nonce
//                                              inside the sealed request, chosen here.
//   UNLOCK_USE                                 sealed too (command set 0.5): its nonce is the launch's
//                                              activation (activation.ts), which the owner must not
//                                              see; a device before 0.5 refuses the sealed op and the
//                                              use is relayed as is (the receipt is signed over this
//                                              client's own nonce either way). An owner that fakes
//                                              that refusal would learn the nonce, so with the
//                                              hardware root REQUIRED the clear relay is never used:
//                                              the use is refused instead (the launch pins command
//                                              set 0.5 on the device's own proof beforehand).
//   LATCH_GET (enrolled?)                      the owner's attestation round, verified for this
//                                              client's nonce (verifyRootAttestation).
//
// Nothing else is relayed. Every use re-checks that this client's view of the root is CLEAN, before
// and after the device answers: a DIRTY or lost root refuses.
import type { RemoteRoot, RootHealth } from "./broker.js";
import { attestDigest } from "./broker.js";
import { CS04, FactorError, openSeal, sealFrame } from "./device-factors.js";
import type { LatchFrameDevice } from "./device-latch.js";
import { hardwareRootMode } from "./root-mode.js";
import type { DeviceTotpAccess } from "./totp-verify.js";

/** The commands the sealed channel carries (the device refuses any other inside SEALED). */
const SEALED_OPS: ReadonlySet<number> = new Set([
  0x2d, // TOTP_VERIFY
  0x2e, // SIGN_ATTESTED
  CS04.UNLOCK_GRANT,
]);
const ERR_AUTH = 5;
const ERR_BAD_ARG = 1;

/** What the relay needs from the client's connection to the owner. */
export type FactorRelayRoot = Pick<
  RemoteRoot,
  "members" | "attest" | "relaySealed" | "relayUnlockUse"
>;

/**
 * The client's DeviceTotpAccess through the owner. `health` is this process's view of the root
 * (it must turn non-CLEAN when the owner is lost or replaced). Null when the root is not CLEAN.
 */
export function relayedTotpAccess(
  root: FactorRelayRoot,
  health: () => RootHealth,
  o: Readonly<{
    /**
     * Whether a device that refuses the sealed UNLOCK_USE (firmware before command set 0.5, or an
     * owner saying so) may get it in the clear. Default: only when the hardware root is not required.
     */
    clearUnlockUse?: () => boolean;
  }> = {},
): (DeviceTotpAccess & { cert: Buffer }) | null {
  const clearUnlockUse = o.clearUnlockUse ?? (() => hardwareRootMode() !== "required");
  const primary = root.members[0];
  if (!primary || health().status !== "CLEAN") {
    return null;
  }
  const pubkeyRaw = Buffer.from(primary.pubkey, "hex");
  const uid = Buffer.from(primary.uid, "hex");
  const assertClean = () => {
    const h = health();
    if (h.status !== "CLEAN") {
      throw new Error(`hardware root ${h.status}: ${h.reason}`);
    }
  };
  const dev: LatchFrameDevice = {
    async request(type, _id, payload = Buffer.alloc(0)) {
      if (SEALED_OPS.has(type)) {
        const seal = await openSeal(root.relaySealed, pubkeyRaw, uid);
        const ans = await root.relaySealed(CS04.SEALED, sealFrame(seal, type, payload));
        // The seal is spent whatever the answer; a lone ERR_AUTH is the device refusing the seal.
        if (ans.length === 1 && ans[0] === ERR_AUTH) {
          throw new FactorError("SEALED", "seal-refused");
        }
        return { payload: ans };
      }
      if (type === CS04.UNLOCK_USE) {
        const seal = await openSeal(root.relaySealed, pubkeyRaw, uid);
        const ans = await root.relaySealed(CS04.SEALED, sealFrame(seal, type, payload));
        // A lone ERR_AUTH: the device refused the seal, OR the inner use (its grant id, scope or host
        // time do not match the live grant: another job, ticket or credential), whose own refusal is
        // that same byte sent as the SEALED answer. Either way nothing was spent; neither is claimed.
        if (ans.length === 1 && ans[0] === ERR_AUTH) {
          throw new FactorError("UNLOCK_USE", "use-refused");
        }
        if (!(ans.length === 1 && ans[0] === ERR_BAD_ARG)) {
          return { payload: ans };
        }
        // Firmware before command set 0.5 does not carry UNLOCK_USE sealed. Its nonce is the launch's
        // activation; with the root required it never crosses the owner in the clear (fail closed).
        if (!clearUnlockUse()) {
          throw new FactorError("UNLOCK_USE", "sealed-required");
        }
        return { payload: await root.relayUnlockUse(payload) };
      }
      throw new Error(
        `command 0x${type.toString(16)} is not relayed through the hardware root's owner`,
      );
    },
  };
  return {
    pubkeyRaw,
    uid,
    cert: Buffer.from(primary.cert, "hex"),
    run: async (fn) => {
      assertClean();
      const out = await fn(dev);
      // A root that went DIRTY (or was lost) while the device answered refuses the answer too.
      assertClean();
      return out;
    },
    latch: async (nonce32) => {
      assertClean();
      // remote.attest verifies every member's latch read over a batch digest that covers nonce32.
      const a = await root.attest(nonce32);
      const m = a.members.find((x) => x.uid === primary.uid);
      if (!m || a.nonce !== nonce32.toString("hex") || !a.nonces.includes(a.nonce)) {
        throw new Error("the owner's attestation does not cover this process's nonce");
      }
      assertClean();
      return {
        signedOver: attestDigest(a.nonces.map((n) => Buffer.from(n, "hex"))),
        payload: Buffer.from(m.latch, "hex"),
      };
    },
  };
}
