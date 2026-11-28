// enclawed adapter kit: the command-set pin (the downgrade an owner would fake).
//
// Firmware before command set 0.5 leaves three things open that 0.5 closes: an UNLOCK_USE relayed
// by the hardware root's owner is in the clear (its nonce is the launch's activation), the
// credential key is derived from a CHALLENGE signature any process of this user can obtain, and
// the audit anchor opens unbound. An owner that relays for this process (or anything else between
// it and the device) could claim the older firmware to get all three back. So with the hardware
// root REQUIRED, a launch starts only on the DEVICE's own proof of command set 0.5: a fresh
// ANCHOR_READ signed by the certified key over a nonce of this process (hardware-root
// proveCommandSet05). IDENTIFY's version is unsigned and is never asked. An older answer, or no
// proof, refuses the launch before anything is spent on the device, naming the firmware update.
//
// Without the root required, an older device runs as before and the launch records what that
// leaves open (the residual).

import {
  type CommandSetProof,
  CS05_REFLASH_RUNBOOK,
  hardwareRootCommandSet,
  KEY_DERIVE_RESIDUAL,
} from "../hardware-root/index.js";

export type CommandSetPinRefusal = "firmware-too-old" | "firmware-unproven";

export type CommandSetPinDecision =
  | Readonly<{
      ok: true;
      /** What the device proved (null: no device bound to this launch). */
      proof: CommandSetProof | null;
      /** What an older or unproven command set leaves open, for the launch's audit record. */
      residual: string | null;
    }>
  | Readonly<{ ok: false; code: CommandSetPinRefusal; message: string; proof: CommandSetProof }>;

const UPDATE = `update the Enclaweder to firmware 0.3.3 (command set 0.5) with ${CS05_REFLASH_RUNBOOK}`;

/** The decision, from the device's proof. Pure. */
export function decideCommandSetPin(
  o: Readonly<{ rootRequired: boolean; deviceBound: boolean; proof: CommandSetProof | null }>,
): CommandSetPinDecision {
  if (!o.deviceBound) {
    return { ok: true, proof: null, residual: null };
  }
  const proof: CommandSetProof = o.proof ?? {
    status: "unproven",
    reason: "the device's command set was not asked",
  };
  if (proof.status === "proven") {
    return { ok: true, proof, residual: null };
  }
  if (!o.rootRequired) {
    return {
      ok: true,
      proof,
      residual:
        proof.status === "older"
          ? KEY_DERIVE_RESIDUAL
          : `the Enclaweder's command set is not proven (${proof.reason}); its command set 0.5 protections are not in force`,
    };
  }
  return proof.status === "older"
    ? {
        ok: false,
        code: "firmware-too-old",
        proof,
        message:
          `the hardware root is required, and the Enclaweder answers as firmware before command set 0.5 (${proof.reason}): ` +
          "with it a relayed unlock would cross the owner in the clear, the credential key could be had by any process of this user, " +
          `and the audit anchor would open unbound. Not starting; ${UPDATE}`,
      }
    : {
        ok: false,
        code: "firmware-unproven",
        proof,
        message:
          `the hardware root is required, and the Enclaweder did not prove command set 0.5 (${proof.reason}); ` +
          `a version only something in between asserts is never taken. Not starting; check the device, or ${UPDATE}`,
      };
}

/**
 * The pin for a launch: asks the device (`prove`, default the framework's hardwareRootCommandSet)
 * when a device is bound, and decides. Run it before the launch's activation, so nothing is spent
 * on a device that cannot keep the activation sealed.
 */
export async function commandSetPin(
  o: Readonly<{
    rootRequired: boolean;
    deviceBound: boolean;
    prove?: () => Promise<CommandSetProof>;
  }>,
): Promise<CommandSetPinDecision> {
  if (!o.deviceBound) {
    return decideCommandSetPin({ ...o, proof: null });
  }
  const proof = await (o.prove ?? hardwareRootCommandSet)().catch(
    (err: unknown): CommandSetProof => ({
      status: "unproven",
      reason: (err as Error)?.message ?? String(err),
    }),
  );
  return decideCommandSetPin({ ...o, proof });
}
