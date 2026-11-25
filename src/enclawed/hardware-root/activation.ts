// Command set 0.5, host side: a launch's device-verified ACTIVATION, the binding the device writes
// for it, and the fresh anchor read.
//
// A launch is activated by something only the person can produce: one use of a device-counted
// unlock grant (UNLOCK_USE) or a device-verified TOTP code for "session-start" (TOTP_VERIFY
// purpose 0x01). The device keeps, for a short while (120 s), the request nonce of each such
// success. This process keeps the same nonce here (it chose it; no device answer carries it), and
// presents it to the device:
//
//   ANCHOR_OPEN_BOUND (0x37)  the audit-anchor session opens only on an unspent activation, and the
//                             device writes the activation's BINDING into every record of that
//                             session (record v3), so `audit verify` checks the anchored session
//                             against the log's own record of the launch (auth.device-factor);
//   KEY_DERIVE (0x39)         a key the device derives under its own signing tag, answered only
//                             inside a seal and only on an unspent activation (key-derive.ts).
//
// The device enforces: one bound session and one derivation per activation, 120 s, forgotten at
// a reset, a USB re-enumeration, a latch trip and every zeroize. This registry only remembers what
// this process may present; it is not a security boundary (the device is).
//
// ANCHOR_READ (0x38) is the fresh read: the current record signed over THIS process's nonce, so
// a read relayed by the device's owner is provably not a replay.
//
// Binding (32 bytes): kind(1: 1 unlock use, 2 TOTP) rsv(1) use_index(2 LE) step(4 LE) gid(8 LE)
// boot(8 LE) counter(8 LE). An unlock use binds (gid, use_index) (and its boot and grant step); a
// TOTP verdict binds (step, counter), counter being the latch sequence number of the verdict.

import { createPublicKey, randomBytes, verify as edVerify } from "node:crypto";
import { rawEd25519ToPem } from "./enclaweder-hid.js";

export const CS05 = Object.freeze({
  ANCHOR_OPEN_BOUND: 0x37,
  ANCHOR_READ: 0x38,
  KEY_DERIVE: 0x39,
} as const);

export const TAG_ANCHOR_READ = Buffer.from("enclaweder.anchor-read.v1", "latin1");
/** How long the device keeps an activation (and so how long this process offers one). */
export const ACTIVATION_TTL_MS = 120_000;
/** The TOTP verdict purpose that activates a launch. */
export const SESSION_START_PURPOSE = 0x01;

export type ActivationKind = "unlock-use" | "totp";

/** What the device must bind for an activation: the fields a verifier finds in the log. */
export type ActivationFacts =
  | Readonly<{ kind: "unlock-use"; gid: bigint; useIndex: number; boot?: bigint }>
  | Readonly<{ kind: "totp"; step: number; counter: bigint }>;

export type Binding = Readonly<{
  kind: ActivationKind | "unknown";
  useIndex: number;
  step: number;
  gid: bigint;
  boot: bigint;
  counter: bigint;
}>;

/** A 32-byte binding as the device writes it; null when it is not one. */
export function parseBinding(b: Buffer | null | undefined): Binding | null {
  if (!b || b.length !== 32) {
    return null;
  }
  return {
    kind: b[0] === 1 ? "unlock-use" : b[0] === 2 ? "totp" : "unknown",
    useIndex: b.readUInt16LE(2),
    step: b.readUInt32LE(4),
    gid: b.readBigUInt64LE(8),
    boot: b.readBigUInt64LE(16),
    counter: b.readBigUInt64LE(24),
  };
}

/** Whether a device-written binding names exactly this activation. */
export function bindingNames(binding: Buffer | null | undefined, f: ActivationFacts): boolean {
  const b = parseBinding(binding);
  if (!b || b.kind !== f.kind) {
    return false;
  }
  if (f.kind === "unlock-use") {
    return (
      b.gid === f.gid &&
      b.useIndex === f.useIndex &&
      (f.boot === undefined || b.boot === f.boot) &&
      b.counter === 0n
    );
  }
  return b.step === f.step && b.counter === f.counter && b.gid === 0n && b.useIndex === 0;
}

// ---- the activations this process may present ------------------------------------------------

type Held = {
  facts: ActivationFacts;
  nonce: Buffer;
  at: number;
  anchor: boolean; // spent for the anchor session
  key: boolean; // spent for a key derivation
};
const held = new Map<string, Held[]>();
const HELD_MAX = 4;

/**
 * Remember an activation this process just made on device `devicePubHex`: `nonce` is the request
 * nonce it sent (UNLOCK_USE / TOTP_VERIFY), `facts` what the device's signed answer said.
 */
export function noteActivation(
  devicePubHex: string,
  nonce: Buffer,
  facts: ActivationFacts,
  now = Date.now(),
): void {
  if (nonce.length !== 32) {
    return;
  }
  const list = (held.get(devicePubHex) ?? []).filter((h) => now - h.at < ACTIVATION_TTL_MS);
  list.push({ facts, nonce: Buffer.from(nonce), at: now, anchor: false, key: false });
  while (list.length > HELD_MAX) {
    list.shift()?.nonce.fill(0);
  }
  held.set(devicePubHex, list);
}

export type HeldActivation = Readonly<{ facts: ActivationFacts; nonce: Buffer; at: number }>;

/** The newest fresh activation not yet spent for `use`, or null. Does not spend it. */
export function peekActivation(
  devicePubHex: string,
  use: "anchor" | "key",
  now = Date.now(),
): HeldActivation | null {
  const list = held.get(devicePubHex) ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    if (now - h.at < ACTIVATION_TTL_MS && !h[use]) {
      return { facts: h.facts, nonce: Buffer.from(h.nonce), at: h.at };
    }
  }
  return null;
}

/** Mark an activation spent for `use` (the device spent it: never present it again for that). */
export function spendActivation(
  devicePubHex: string,
  a: HeldActivation,
  use: "anchor" | "key",
): void {
  for (const h of held.get(devicePubHex) ?? []) {
    if (h.nonce.equals(a.nonce)) {
      h[use] = true;
    }
  }
}

/** Forget every activation (tests; and a process that lost its device). */
export function clearActivations(): void {
  for (const list of held.values()) {
    for (const h of list) {
      h.nonce.fill(0);
    }
  }
  held.clear();
}

// ---- ANCHOR_READ ------------------------------------------------------------------------------

/** A fresh anchor read: the device's current record, signed over this process's nonce. */
export type FreshAnchorRead = Readonly<{
  /** The device has anchored at least once (counter > 0). */
  anchored: boolean;
  counter: bigint;
  head: Buffer;
  uid: Buffer;
  sess: bigint;
  opens: bigint;
  /** A session is live now, and its id (0n when none). */
  live: boolean;
  liveSid: bigint;
  /** The live session is bound; `liveBind` is its binding (else null). */
  liveBind: Buffer | null;
  /** The current head was set by the live session. */
  headByLive: boolean;
}>;

/**
 * Verifies an ANCHOR_READ answer: `status(1) body(112) sig(64)`, signed by the certified key over
 * "enclaweder.anchor-read.v1" | nonce | body, for `uid` when given. Null when it does not verify
 * (a replayed read, another device's, or an altered one).
 */
export function verifyAnchorRead(
  devicePubRaw: Buffer,
  nonce: Buffer,
  payload: Buffer,
  uid: Buffer | null = null,
): FreshAnchorRead | null {
  if (payload.length !== 177 || payload[0] !== 0 || nonce.length !== 32) {
    return null;
  }
  const body = payload.subarray(1, 113);
  let ok = false;
  try {
    ok = edVerify(
      null,
      Buffer.concat([TAG_ANCHOR_READ, nonce, body]),
      createPublicKey(rawEd25519ToPem(devicePubRaw)),
      payload.subarray(113, 177),
    );
  } catch {
    ok = false;
  }
  if (!ok || body[0] !== 1) {
    return null;
  }
  const rUid = Buffer.from(body.subarray(44, 56));
  if (uid && !rUid.equals(uid)) {
    return null;
  }
  const flags = body[1];
  const counter = body.readBigUInt64LE(4);
  // The flags are signed with the fields they describe; a body whose flags contradict them is malformed.
  if (((flags & 0x01) !== 0) !== counter > 0n) {
    return null;
  }
  return {
    anchored: (flags & 0x01) !== 0,
    counter,
    head: Buffer.from(body.subarray(12, 44)),
    uid: rUid,
    sess: body.readBigUInt64LE(56),
    opens: body.readBigUInt64LE(64),
    live: (flags & 0x02) !== 0,
    liveSid: body.readBigUInt64LE(72),
    liveBind: (flags & 0x04) !== 0 ? Buffer.from(body.subarray(80, 112)) : null,
    headByLive: (flags & 0x08) !== 0,
  };
}

// ---- what a log says about its launches ------------------------------------------------------

const DEC = /^\d{1,20}$/;
const asBig = (v: unknown): bigint | null =>
  typeof v === "string" && DEC.test(v)
    ? BigInt(v)
    : typeof v === "number" && Number.isSafeInteger(v) && v >= 0
      ? BigInt(v)
      : null;

/**
 * The launch activations a log records: every `auth.device-factor` record (any adapter's prefix)
 * whose outcome is "verified". A device unlock names its grant and use (gid, useIndex); a device
 * TOTP code names its step and counter when the adapter records them (records without them name
 * nothing, so a bound anchor cannot be matched to them).
 */
export function deviceFactorActivations(records: Iterable<unknown>): ActivationFacts[] {
  const out: ActivationFacts[] = [];
  for (const r of records) {
    if (!r || typeof r !== "object") {
      continue;
    }
    const rec = r as { type?: unknown; payload?: unknown };
    if (
      typeof rec.type !== "string" ||
      !(rec.type === "auth.device-factor" || rec.type.endsWith(".auth.device-factor")) ||
      !rec.payload ||
      typeof rec.payload !== "object"
    ) {
      continue;
    }
    const p = rec.payload as Record<string, unknown>;
    if (p.outcome !== "verified") {
      continue;
    }
    if (p.via === "device-unlock") {
      const gid = asBig(p.gid);
      const useIndex = typeof p.useIndex === "number" ? p.useIndex : null;
      if (gid !== null && useIndex !== null && Number.isInteger(useIndex) && useIndex > 0) {
        const boot = asBig(p.boot);
        out.push({ kind: "unlock-use", gid, useIndex, ...(boot === null ? {} : { boot }) });
      }
    } else if (p.via === "device-totp") {
      const step = typeof p.step === "number" && Number.isInteger(p.step) ? p.step : null;
      const counter = asBig(p.counter);
      if (step !== null && counter !== null) {
        out.push({ kind: "totp", step, counter });
      }
    }
  }
  return out;
}

// ---- the command-set pin ---------------------------------------------------------------------

/**
 * What the device has PROVEN about its command set. IDENTIFY's `fw_major.fw_minor` is unsigned and,
 * through the hardware root's owner, only the owner's word; an older version is exactly what an
 * owner would claim to have UNLOCK_USE relayed in the clear (its nonce is the launch's activation).
 * The proof is a fresh ANCHOR_READ (0x38): only command set 0.5 answers it, signed by the certified
 * key over a nonce chosen here, so nothing that relays can produce it.
 *
 *   proven     a verifying ANCHOR_READ over this process's nonce: command set 0.5 or later;
 *   older      the answer was "unsupported" (ERR_UNSUPPORTED, or a lone ERR_BAD_ARG): an older
 *              command set, or something in between that says so (indistinguishable, never proof);
 *   unproven   no answer, or one that does not verify over this nonce for this device.
 */
export type CommandSetProof =
  | Readonly<{ status: "proven"; commandSet: "0.5" }>
  | Readonly<{ status: "older"; reason: string }>
  | Readonly<{ status: "unproven"; reason: string }>;

/** The firmware update a refusal names (the Enclaweder firmware 0.3.3, command set 0.5). */
export const CS05_REFLASH_RUNBOOK = "the Enclaweder firmware 0.3.3 update from Enclawed, Inc.";

/**
 * Ask the device to prove command set 0.5: `read(nonce32)` carries ANCHOR_READ to it (directly, or
 * relayed) and returns the raw answer. `devicePubRaw` / `uid` are the CERTIFIED key and uid.
 */
export async function proveCommandSet05(
  read: ((nonce32: Buffer) => Promise<Buffer>) | null | undefined,
  devicePubRaw: Buffer,
  uid: Buffer,
): Promise<CommandSetProof> {
  if (!read) {
    return { status: "unproven", reason: "nothing carries ANCHOR_READ to the device" };
  }
  const nonce = randomBytes(32);
  let ans: Buffer;
  try {
    ans = await read(nonce);
  } catch (err) {
    return {
      status: "unproven",
      reason: `the device did not answer ANCHOR_READ (${(err as Error)?.message ?? String(err)})`,
    };
  }
  if (ans.length === 1 && (ans[0] === 8 || ans[0] === 1)) {
    return {
      status: "older",
      reason: "the device answered ANCHOR_READ as unsupported (firmware before command set 0.5)",
    };
  }
  return verifyAnchorRead(devicePubRaw, nonce, ans, uid)
    ? { status: "proven", commandSet: "0.5" }
    : {
        status: "unproven",
        reason:
          "the ANCHOR_READ answer is not signed over this process's nonce by the certified key " +
          "(a replayed or altered answer, or another device)",
      };
}
