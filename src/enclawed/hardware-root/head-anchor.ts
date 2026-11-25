// Anchor the audit log's head with the hardware root, against a counter the
// host cannot set.
//
// A hash chain proves nothing was altered or inserted, but not that nothing was
// REMOVED: truncating the trailing records leaves a shorter chain that verifies
// perfectly. The defence is to remember the head outside the log -- and the only
// version worth having is one an attacker with the disk cannot rewrite.
//
// Why a signature and not encryption. The head hash is the `recordHash` of the
// last record, sitting in plaintext inside the very file being protected, so it
// cannot be a secret and hiding it buys nothing. What is needed is AUTHENTICITY.
//
// Why the counter is the load-bearing part. A signature alone stops forgery but
// not REPLAY: an older {head, signature} pair is genuinely signed and matches an
// older, truncated log, so an attacker restores yesterday's anchor beside
// yesterday's log and everything verifies. Nothing stored on disk can detect
// that, because every byte of it is under the attacker's control. The device's
// monotonic counter can: it only ever increases, the host has no opcode to set
// it, and asking the device directly is therefore the one reading an attacker
// with root cannot influence.
//
// Who may advance it. Since record v2 the device only accepts ANCHOR_SET under the one
// authenticated anchor session (an X25519 exchange signed by the certified device key; the
// session key never crosses the wire), and it refuses a second open instead of superseding the
// first. This sink opens that session lazily, once per process, and closes it at exit. So other
// software on the host can no longer anchor a fabricated log while the logger holds the session;
// it can only try to open the channel first, which the logger sees as ERR_BUSY on its own open
// (an alarm), or after a replug, which shows as a session id that skipped the logger's own.
// Every record names the session that set it, and verification rejects a head set under a
// session this logger never held.
//
// The lease (command set 0.2). A session ends by itself 120 s after its last accepted SET or
// KEEPALIVE; this sink renews it every 30 s while the process lives (an unref'd timer). A
// logger that crashed without closing therefore frees the channel one lease later, with no
// replug, and the next run opens the following session. If the renewal is refused (the lease
// ran out while the process was suspended, or an operator quorum took the channel over), the
// next write reopens, and the same sid+1 rule tells an honest expiry from another holder.
//
// Command set 0.5 (activation.ts). The open is BOUND when this process holds a fresh activation
// of its launch (the UNLOCK_USE or session-start TOTP_VERIFY it just made): ANCHOR_OPEN_BOUND
// presents the activation's nonce, the device replaces a plain (unauthorised) session if one sits
// on the channel, and every record of the session is v3, carrying the activation's binding, which
// `audit verify` checks against the log's own auth.device-factor record. Reads are fresh
// (ANCHOR_READ, signed over this process's nonce), so a relayed read is "device", not "offline".
// Older firmware answers "unsupported" and both fall back to the 0.2 behaviour below.
//
// What this still does NOT stop, stated here because it belongs next to the code: something on
// the host that opens the channel before the logger ever does, and then anchors heads of its
// choosing (with command set 0.5 such a head is unbound, or bound to an activation the log does
// not record, and verification refuses it). The logger then fails to open (the BUSY alarm) rather than silently losing, but the
// device cannot tell which process is the genuine logger. Someone at the keyboard with the
// enclaweder plugged in is likewise out of scope.

import { randomBytes } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import type { AnchorAttestation, HeadAnchorSink } from "../audit-log.js";
import {
  bindingNames,
  type FreshAnchorRead,
  peekActivation,
  spendActivation,
  verifyAnchorRead,
} from "./activation.js";
import {
  ANCHOR_KEEPALIVE_INTERVAL_MS,
  AnchorAuthError,
  type AnchorResponse,
  verifyAnchorRecord,
} from "./enclaweder-hid.js";

/** An open anchor session, as AnchorSession provides it. */
export type AnchorSessionHandle = {
  readonly sid: bigint;
  /** Command set 0.5: the activation binding of a bound session (null or absent: unbound). */
  readonly binding?: Buffer | null;
  set(head32: Buffer): Promise<AnchorResponse>;
  close(): Promise<void>;
  /** Best-effort close that cannot be awaited, for process exit. */
  closeSync?(): void;
  /** Lease renewal (command set 0.2); see AnchorSession.startKeepalive. */
  startKeepalive?(intervalMs: number, onLost: (err: Error) => void): void;
  stopKeepalive?(): void;
};

/** The slice of the device this needs (Enclaweder provides it). */
export type AnchorCapableDevice = {
  anchorOpen(devicePublicKey: Buffer): Promise<AnchorSessionHandle>;
  anchorGet(): Promise<AnchorResponse | null>;
  /** Command set 0.5: ANCHOR_OPEN_BOUND with a held activation's nonce (AnchorSession.openBound). */
  anchorOpenBound?(devicePublicKey: Buffer, activationNonce: Buffer): Promise<AnchorSessionHandle>;
  /** Command set 0.5: ANCHOR_READ over `nonce32`, the raw answer (one byte 8 = unsupported). */
  anchorRead?(nonce32: Buffer): Promise<Buffer>;
};

/**
 * Something other than this logger holds or held the anchor channel. Distinct from
 * HeadAnchorTampered (a record that does not verify): this is raised while WRITING, and must
 * reach an operator rather than be retried.
 *
 *   ANCHOR_SESSION_BUSY      ANCHOR_OPEN answered ERR_BUSY: another session is open on the
 *                            device. Something on this host opened it first, or this logger's
 *                            previous process crashed without closing. `waitMs` (command set
 *                            0.2) is that holder's lease left if it stops renewing; a crashed
 *                            logger's session is gone then. To recover sooner: an operator-quorum
 *                            takeover. Firmware 0.1 has no lease (waitMs null): only a replug.
 *   ANCHOR_SESSION_HIJACKED  the device dropped this logger's session (ERR_AUTH mid-session, or
 *                            a refused lease renewal) and the reopen did not get the next session
 *                            id, so another session was opened in between (another process, or
 *                            an operator takeover). The head is still anchored under the new
 *                            session before this is thrown.
 */
export type HeadAnchorAlarmCode = "ANCHOR_SESSION_BUSY" | "ANCHOR_SESSION_HIJACKED";

export class HeadAnchorAlarm extends Error {
  readonly code: HeadAnchorAlarmCode;
  /** ANCHOR_SESSION_BUSY on command set 0.2: the holder's lease left, ms (a lower bound). */
  readonly waitMs: number | null;
  constructor(code: HeadAnchorAlarmCode, detail: string, waitMs: number | null = null) {
    super(
      `audit anchor alarm (${code === "ANCHOR_SESSION_BUSY" ? "session busy" : "session hijacked"}): ${detail}`,
    );
    this.name = "HeadAnchorAlarm";
    this.code = code;
    this.waitMs = waitMs;
  }
}

function busyAlarm(waitMs: number | null): HeadAnchorAlarm {
  const recovery =
    waitMs === null
      ? "this firmware has no session lease: replug the device to clear a crashed holder"
      : `its lease ends in ${Math.ceil(waitMs / 1000)} s if the holder stops renewing (a crashed ` +
        "logger is cleared then, no replug); to recover now, an operator quorum can take the " +
        "channel over";
  return new HeadAnchorAlarm(
    "ANCHOR_SESSION_BUSY",
    `the device already has an anchor session open: something else on this host holds the ` +
      `audit anchor, or a previous run crashed without closing; ${recovery}`,
    waitMs,
  );
}

/**
 * An anchor that is present but does not verify.
 *
 * Distinct from an absent anchor on purpose. "Missing" means we cannot prove
 * completeness; "present and wrong" means someone edited it, which is a finding
 * in its own right and must never be reported as a clean absence.
 */
/**
 * Why a stored or live anchor was rejected.
 *   invalid          does not verify, is malformed, or is inconsistent with the counter.
 *   foreign-session  the device's head was set under an anchor session this logger never held:
 *                    something else anchored the device (another logger, or malware).
 *   downgrade        a record format older than one this logger already stored.
 */
export type HeadAnchorTamperCode = "invalid" | "foreign-session" | "downgrade";

export class HeadAnchorTampered extends Error {
  readonly code: HeadAnchorTamperCode;
  constructor(reason: string, code: HeadAnchorTamperCode = "invalid") {
    super(`head anchor failed verification: ${reason}`);
    this.name = "HeadAnchorTampered";
    this.code = code;
  }
}

/**
 * The stored copy, kept so the log stays checkable when the device is away.
 * It is a convenience, never the authority: everything in it is under the
 * attacker's control, which is exactly why `read()` prefers the device.
 */
type StoredAnchor = {
  /** Record format; absent in files written before record v2, which are v1. 3: a bound session. */
  version?: 1 | 2 | 3;
  head: string;
  counter: string; // decimal; JSON has no 64-bit integer
  uid: string;
  sig: string;
  /** v2: the session that set this head, and the device's open count (decimal). */
  sess?: string;
  opens?: string;
  /** v3: the activation binding the device signed into the record (hex, 32 bytes). */
  bind?: string;
  /**
   * v2: the anchor sessions this logger has held (decimal sids, most recent last). Informational
   * only, never evidence (finding H12): no device signature covers it.
   */
  sessions?: string[];
  /** Device serial, for the operator; never trusted for verification. */
  serial?: string;
};

const HEX64 = /^[0-9a-f]{64}$/;
const DEC = /^\d{1,20}$/;

function decode(raw: string): StoredAnchor {
  let stored: StoredAnchor;
  try {
    stored = JSON.parse(raw) as StoredAnchor;
  } catch {
    throw new HeadAnchorTampered("not valid JSON");
  }
  if (typeof stored.head !== "string" || !HEX64.test(stored.head)) {
    throw new HeadAnchorTampered("head is not a 64-char hex hash");
  }
  if (typeof stored.counter !== "string" || !DEC.test(stored.counter)) {
    throw new HeadAnchorTampered("counter is missing or not a decimal integer");
  }
  if (
    stored.version !== undefined &&
    stored.version !== 1 &&
    stored.version !== 2 &&
    stored.version !== 3
  ) {
    throw new HeadAnchorTampered("unknown record version");
  }
  if (stored.version === 3 && (typeof stored.bind !== "string" || !HEX64.test(stored.bind))) {
    throw new HeadAnchorTampered("v3 record is missing its binding");
  }
  if (stored.version === 2 || stored.version === 3) {
    if (
      typeof stored.sess !== "string" ||
      !DEC.test(stored.sess) ||
      typeof stored.opens !== "string" ||
      !DEC.test(stored.opens)
    ) {
      throw new HeadAnchorTampered("v2 record is missing its session or open count");
    }
  }
  if (
    stored.sessions !== undefined &&
    (!Array.isArray(stored.sessions) ||
      !stored.sessions.every((x) => typeof x === "string" && DEC.test(x)))
  ) {
    throw new HeadAnchorTampered("session list is malformed");
  }
  return stored;
}

/** How many of this logger's session ids the stored copy remembers. */
const MAX_REMEMBERED_SESSIONS = 64;

/**
 * One anchor session per device per process, shared by every sink on that device: the device
 * admits one session at a time, so two sinks opening their own would raise the BUSY alarm on
 * each other.
 */
type SessionSlot = {
  device: AnchorCapableDevice;
  session: AnchorSessionHandle | null;
  opening: Promise<AnchorSessionHandle> | null;
  /** Every sid this process has held on this device, in order. */
  sids: bigint[];
  /** A session the device dropped (ERR_AUTH, refused renewal) and not yet replaced: the next
   *  open must be exactly this + 1, or someone else held the channel in between. */
  dropped: bigint | null;
};
const slots = new WeakMap<AnchorCapableDevice, SessionSlot>();
const openSlots = new Set<SessionSlot>();
let exitHookInstalled = false;

function slotFor(device: AnchorCapableDevice): SessionSlot {
  let slot = slots.get(device);
  if (!slot) {
    slot = { device, session: null, opening: null, sids: [], dropped: null };
    slots.set(device, slot);
  }
  return slot;
}

function installExitHook(): void {
  if (exitHookInstalled) {
    return;
  }
  exitHookInstalled = true;
  // Nothing can be awaited on "exit", so this writes the authenticated close and does not wait.
  // Applications that shut down gracefully should await closeHeadAnchorSessions() instead.
  process.once("exit", () => {
    for (const slot of openSlots) {
      try {
        slot.session?.closeSync?.();
      } catch {
        // exiting; the lease (or, on firmware 0.1, a replug) recovers a missed close
      }
      slot.session = null;
    }
    openSlots.clear();
  });
}

function isAnchorError(err: unknown, code: AnchorAuthError["code"]): boolean {
  return err instanceof AnchorAuthError && err.code === code;
}

/** Mark `s` as dropped by the device, so the next open is held to the sid+1 rule. */
function drop(slot: SessionSlot, s: AnchorSessionHandle): void {
  s.stopKeepalive?.();
  if (slot.session === s) {
    slot.session = null;
    slot.dropped = s.sid;
  }
}

/**
 * Renew the lease while the process lives. A refused renewal (ERR_AUTH: the lease ran out, or
 * an operator takeover) drops the session so the next write reopens under the sid+1 rule. Any
 * other failure (no answer, the limiter's cooldown) leaves it in place: the session may well
 * still be live, and reopening over it would raise a false BUSY alarm; the next write's SET
 * settles it and restarts the renewal. Firmware 0.1 answers "unsupported" and the renewal
 * stops silently there (no lease).
 */
function keepAlive(slot: SessionSlot, s: AnchorSessionHandle): void {
  s.startKeepalive?.(ANCHOR_KEEPALIVE_INTERVAL_MS, (err) => {
    if (isAnchorError(err, "auth") || isAnchorError(err, "closed")) {
      drop(slot, s);
    }
  });
}

/** After an open: if a dropped session is being replaced, the new sid must be the next one. */
function reopenCheck(slot: SessionSlot, s: AnchorSessionHandle): HeadAnchorAlarm | null {
  const old = slot.dropped;
  if (old === null || slot.session !== s) {
    return null;
  }
  slot.dropped = null;
  if (s.sid === old + 1n) {
    return null;
  }
  return new HeadAnchorAlarm(
    "ANCHOR_SESSION_HIJACKED",
    `the device dropped anchor session ${old} and the reopen got session ${s.sid}, not ` +
      `${old + 1n}: another session was opened in between`,
  );
}

/**
 * Command set 0.5: open bound to this launch's activation when one is held and the device can.
 * Null = open plainly (no activation held, firmware before 0.5, or the device no longer holds the
 * activation: it expired or a reset forgot it). A bound session whose binding does not name the
 * activation presented is not this launch's and is refused.
 */
async function openBound(
  slot: SessionSlot,
  devicePublicKey: Buffer,
): Promise<AnchorSessionHandle | null> {
  const pubHex = devicePublicKey.toString("hex");
  const act = slot.device.anchorOpenBound ? peekActivation(pubHex, "anchor") : null;
  if (!act || !slot.device.anchorOpenBound) {
    return null;
  }
  let s: AnchorSessionHandle;
  try {
    s = await slot.device.anchorOpenBound(devicePublicKey, act.nonce);
  } catch (err) {
    if (isAnchorError(err, "unsupported") || isAnchorError(err, "auth")) {
      spendActivation(pubHex, act, "anchor"); // never present it again
      return null;
    }
    throw err;
  } finally {
    act.nonce.fill(0);
  }
  spendActivation(pubHex, act, "anchor");
  if (!bindingNames(s.binding, act.facts)) {
    await s.close().catch(() => undefined);
    throw new HeadAnchorTampered(
      "the device bound the anchor session to another activation than the one this launch presented",
    );
  }
  return s;
}

async function openSession(
  slot: SessionSlot,
  devicePublicKey: Buffer,
): Promise<AnchorSessionHandle> {
  if (slot.session && !slot.session.binding && !slot.opening && slot.device.anchorOpenBound) {
    // Command set 0.5: the logger opened plainly before the launch was activated (records written
    // before the activation). Once an activation is held, re-open bound: the device replaces this
    // logger's own plain session, so every later record names the launch.
    const held = slot.session;
    if (peekActivation(devicePublicKey.toString("hex"), "anchor")) {
      slot.opening = (async () => {
        try {
          const s = await openBound(slot, devicePublicKey);
          if (!s) {
            return held;
          }
          held.stopKeepalive?.(); // the device ended it; its key no longer counts for anything
          slot.session = s;
          slot.sids.push(s.sid);
          keepAlive(slot, s);
          return s;
        } finally {
          slot.opening = null;
        }
      })();
      return slot.opening;
    }
  }
  if (slot.session) {
    return slot.session;
  }
  if (!slot.opening) {
    slot.opening = (async () => {
      try {
        const s =
          (await openBound(slot, devicePublicKey)) ??
          (await slot.device.anchorOpen(devicePublicKey));
        slot.session = s;
        slot.sids.push(s.sid);
        openSlots.add(slot);
        installExitHook();
        keepAlive(slot, s);
        return s;
      } catch (err) {
        if (err instanceof AnchorAuthError && err.code === "busy") {
          throw busyAlarm(err.waitMs);
        }
        throw err;
      } finally {
        slot.opening = null;
      }
    })();
  }
  return slot.opening;
}

/**
 * Close every anchor session this process holds (authenticated ANCHOR_CLOSE). Call at a
 * graceful shutdown; process exit falls back to a best-effort close that is not awaited.
 */
export async function closeHeadAnchorSessions(): Promise<void> {
  const pending = [...openSlots];
  openSlots.clear();
  await Promise.all(
    pending.map(async (slot) => {
      const s = slot.session;
      slot.session = null;
      await s?.close().catch(() => undefined);
    }),
  );
}

/**
 * Head anchor attested by the enclaweder's monotonic counter.
 *
 * @param devicePublicKey raw Ed25519 public key from the device's identity,
 *   which the guard has already checked against the signed birth certificate.
 *   Verification is against THAT key, not one read back from the anchor file,
 *   or an attacker would simply supply their own key alongside their own
 *   signature.
 */
export function enclawederHeadAnchor(opts: {
  device: AnchorCapableDevice;
  devicePublicKey: Buffer;
  /** Where the offline copy is kept. */
  path: string;
  serial?: string;
}): HeadAnchorSink {
  const slot = slotFor(opts.device);
  /** sids this sink has already recorded in its stored copy. */
  const registered = new Set<bigint>();

  async function readStored(): Promise<StoredAnchor | null> {
    let raw: string;
    try {
      raw = await readFile(opts.path, "utf8");
    } catch {
      return null; // no offline copy; the device is still the authority
    }
    const stored = decode(raw);
    let uid: Buffer;
    let sig: Buffer;
    try {
      uid = Buffer.from(stored.uid, "hex");
      sig = Buffer.from(stored.sig, "base64");
    } catch {
      throw new HeadAnchorTampered("uid or signature is not decodable");
    }
    const ok = verifyAnchorRecord(opts.devicePublicKey, {
      version: stored.version === 2 || stored.version === 3 ? stored.version : 1,
      counter: BigInt(stored.counter),
      head: Buffer.from(stored.head, "hex"),
      uid,
      sig,
      sess: stored.sess === undefined ? undefined : BigInt(stored.sess),
      opens: stored.opens === undefined ? undefined : BigInt(stored.opens),
      bind: stored.bind === undefined ? undefined : Buffer.from(stored.bind, "hex"),
    });
    if (!ok) {
      throw new HeadAnchorTampered(
        "stored signature does not cover this head and counter, or is from another device",
      );
    }
    return stored;
  }

  /**
   * The sessions this logger can PROVE it held (finding H12): the ones this process opened
   * itself, and the session in the stored copy's device-SIGNED record (readStored verified its
   * signature over counter|head|uid|sess|opens). The stored `sessions` list is not evidence:
   * no device signature covers it, so any same-user process can append its own sid to it.
   * The cost is honest and fail-closed: a crash after ANCHOR_SET under a NEW session but before
   * the file write reads as foreign-session until an operator accepts it.
   */
  function knownSessions(stored: StoredAnchor | null): Set<bigint> {
    const known = new Set<bigint>(slot.sids);
    if ((stored?.version === 2 || stored?.version === 3) && stored.sess !== undefined) {
      known.add(BigInt(stored.sess));
    }
    return known;
  }

  /** The informational (untrusted) session list kept in the stored copy. */
  function mergedSessions(stored: StoredAnchor | null): string[] {
    const all = [
      ...new Set([...knownSessions(stored), ...(stored?.sessions ?? []).map((x) => BigInt(x))]),
    ]
      .filter((x) => x !== 0n)
      .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return all.slice(-MAX_REMEMBERED_SESSIONS).map((x) => x.toString());
  }

  async function persist(stored: StoredAnchor): Promise<void> {
    // Write-then-rename, so a crash cannot leave a half-written copy that reads as tampering.
    const tmp = `${opts.path}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(stored)}\n`, "utf8");
    await rename(tmp, opts.path);
  }

  async function storedOrNull(): Promise<StoredAnchor | null> {
    try {
      return await readStored();
    } catch {
      return null; // an unverifiable copy is replaced; the device stays the authority
    }
  }

  /**
   * Record a newly opened session in the stored copy BEFORE anchoring under it, so a crash
   * between the device's ANCHOR_SET and the file write cannot leave a live head whose session
   * the stored copy does not know.
   */
  async function register(sid: bigint): Promise<void> {
    if (registered.has(sid)) {
      return;
    }
    const stored = await storedOrNull();
    if (stored !== null) {
      await persist({ ...stored, sessions: mergedSessions(stored) });
    }
    registered.add(sid);
  }

  /**
   * Command set 0.5: ANCHOR_READ over a nonce of this process. Null when the device cannot (older
   * firmware answers ERR_UNSUPPORTED) or has no anchor yet (`anchored: false`); throws when it
   * cannot be reached, and HeadAnchorTampered when the answer does not verify for our nonce.
   */
  async function freshRead(): Promise<FreshAnchorRead | "unsupported"> {
    if (!opts.device.anchorRead) {
      return "unsupported";
    }
    const nonce = randomBytes(32);
    const p = await opts.device.anchorRead(nonce);
    if (p.length === 1 && p[0] === 8) {
      return "unsupported";
    }
    const r = verifyAnchorRead(opts.devicePublicKey, nonce, p);
    if (!r) {
      throw new HeadAnchorTampered(
        "the device's anchor read is not signed over this process's nonce by the certified key " +
          "(a replayed or relayed-and-altered read, or another device)",
      );
    }
    return r;
  }

  /** The binding of the record that set the device's current head, from a fresh read. */
  function headBinding(
    fresh: FreshAnchorRead,
    stored: StoredAnchor | null,
  ): Pick<AnchorAttestation, "version" | "bind"> {
    if (
      stored !== null &&
      (stored.version === 2 || stored.version === 3) &&
      BigInt(stored.counter) === fresh.counter &&
      stored.sess === fresh.sess.toString() &&
      stored.head === fresh.head.toString("hex")
    ) {
      // readStored verified the device's signature over this record, binding included.
      return { version: stored.version, bind: stored.version === 3 ? (stored.bind ?? null) : null };
    }
    if (fresh.headByLive) {
      return { version: fresh.liveBind ? 3 : 2, bind: fresh.liveBind?.toString("hex") ?? null };
    }
    return { version: null, bind: null };
  }

  async function readAttested(): Promise<{
    head: string | null;
    attested: "device" | "offline" | "none";
    anchor?: AnchorAttestation;
  }> {
    let live: AnchorResponse | null;
    let fresh: FreshAnchorRead | "unsupported" = "unsupported";
    try {
      fresh = await freshRead();
    } catch (err) {
      if (err instanceof HeadAnchorTampered) {
        throw err;
      }
      fresh = "unsupported"; // unreachable now: the path below decides (offline copy)
    }
    if (fresh !== "unsupported") {
      return readFresh(fresh);
    }
    try {
      live = await opts.device.anchorGet();
    } catch {
      // The device is unreachable. Fall back to the offline copy, but say so:
      // without the counter we cannot rule out that an older signed anchor was
      // restored, and reporting that as a full match would claim a guarantee we
      // did not check.
      const stored = await readStored();
      return stored === null
        ? { head: null, attested: "none" }
        : { head: stored.head, attested: "offline" };
    }

    const stored = await readStored();

    if (live === null) {
      // The device has never anchored. A stored anchor that claims otherwise was
      // not produced by this device in its current life -- a copied file, or a
      // different part.
      if (stored !== null) {
        throw new HeadAnchorTampered("an anchor file exists but the device has never anchored");
      }
      return { head: null, attested: "none" };
    }

    if (!verifyAnchorRecord(opts.devicePublicKey, live)) {
      throw new HeadAnchorTampered(
        "device response failed signature verification (wrong device, or altered in transit)",
      );
    }

    if (stored !== null) {
      const s = BigInt(stored.counter);
      if (s > live.counter) {
        // Cannot happen honestly: the counter never decreases. A file ahead of
        // the device means the device was swapped, reset, or the file was
        // written by a different part.
        throw new HeadAnchorTampered(
          `anchor file is ahead of the device (file ${s}, device ${live.counter}): ` +
            "the device has been replaced or rolled back",
        );
      }
      // stored < live is NOT tampering on its own: the device advances before the
      // file is rewritten, so a crash in between leaves the file behind by one.
      // The device is authoritative either way, which is what makes a restored
      // older file useless to an attacker.
    }

    if (live.version === 1) {
      // Firmware before record v2. Anything this logger stored as v2 cannot come back as v1.
      if (stored?.version === 2) {
        throw new HeadAnchorTampered(
          "the device answers with a v1 record after this log was anchored under record v2",
          "downgrade",
        );
      }
    } else if (live.sess === 0n) {
      // A head set before authenticated anchoring, carried over by a firmware upgrade. Only
      // plausible while this logger has never anchored under a session itself.
      if (stored?.version === 2 || slot.sids.length > 0) {
        throw new HeadAnchorTampered(
          "the device's head predates authenticated anchoring, but this log was anchored since",
          "downgrade",
        );
      }
    } else if (!knownSessions(stored).has(live.sess)) {
      throw new HeadAnchorTampered(
        `the device's head was set under anchor session ${live.sess}, which this logger never ` +
          "held: something else anchored the device",
        "foreign-session",
      );
    }

    return { head: live.head.toString("hex"), attested: "device" };
  }

  /** readAttested over a fresh read (command set 0.5): the same rules, provably not a replay. */
  async function readFresh(fresh: FreshAnchorRead): Promise<{
    head: string | null;
    attested: "device" | "offline" | "none";
    anchor?: AnchorAttestation;
  }> {
    const stored = await readStored();
    if (!fresh.anchored) {
      if (stored !== null) {
        throw new HeadAnchorTampered("an anchor file exists but the device has never anchored");
      }
      return { head: null, attested: "none" };
    }
    if (stored !== null && BigInt(stored.counter) > fresh.counter) {
      throw new HeadAnchorTampered(
        `anchor file is ahead of the device (file ${stored.counter}, device ${fresh.counter}): ` +
          "the device has been replaced or rolled back",
      );
    }
    if (fresh.sess === 0n) {
      if (stored?.version === 2 || stored?.version === 3 || slot.sids.length > 0) {
        throw new HeadAnchorTampered(
          "the device's head predates authenticated anchoring, but this log was anchored since",
          "downgrade",
        );
      }
    } else if (!knownSessions(stored).has(fresh.sess)) {
      throw new HeadAnchorTampered(
        `the device's head was set under anchor session ${fresh.sess}, which this logger never ` +
          "held: something else anchored the device",
        "foreign-session",
      );
    }
    return {
      head: fresh.head.toString("hex"),
      attested: "device",
      anchor: {
        fresh: true,
        counter: fresh.counter.toString(),
        sess: fresh.sess.toString(),
        ...headBinding(fresh, stored),
      },
    };
  }

  async function anchorUnder(s: AnchorSessionHandle, head: Buffer): Promise<AnchorResponse> {
    await register(s.sid);
    return s.set(head);
  }

  return {
    id: "enclaweder",

    async write(head: string): Promise<void> {
      if (!HEX64.test(head)) {
        throw new Error(`head anchor: expected a 64-char hex hash, got ${head.length} chars`);
      }
      const h = Buffer.from(head, "hex");
      let s = await openSession(slot, opts.devicePublicKey);
      // A session dropped earlier (a refused lease renewal) is being replaced by this open.
      let alarm = reopenCheck(slot, s);
      let a: AnchorResponse;
      try {
        a = await anchorUnder(s, h);
      } catch (err) {
        if (!isAnchorError(err, "auth")) {
          throw err;
        }
        // The device no longer holds our session: a replug or port reset, its tamper response,
        // the lease running out, or an operator takeover. Reopen exactly once. Honestly nothing
        // else opened in between, so the new sid is ours + 1 (every open is counted on the
        // device); anything else means another session was opened while ours was down.
        drop(slot, s);
        s = await openSession(slot, opts.devicePublicKey);
        alarm = reopenCheck(slot, s) ?? alarm;
        a = await anchorUnder(s, h);
      }
      keepAlive(slot, s); // restarts a renewal that stopped on a transient failure
      if (!verifyAnchorRecord(opts.devicePublicKey, a)) {
        // The device answered with something its own key does not cover. Either
        // it is not the device we verified, or the response was tampered with in
        // transit; both mean this anchor is worthless.
        throw new HeadAnchorTampered("device response failed signature verification");
      }
      const prev = await storedOrNull();
      const stored: StoredAnchor = {
        version: a.version,
        head,
        counter: a.counter.toString(),
        uid: a.uid.toString("hex"),
        sig: a.sig.toString("base64"),
        ...(a.version === 2 || a.version === 3
          ? { sess: a.sess.toString(), opens: a.opens.toString(), sessions: mergedSessions(prev) }
          : {}),
        ...(a.version === 3 && a.bind ? { bind: a.bind.toString("hex") } : {}),
        ...(opts.serial ? { serial: opts.serial } : {}),
      };
      await persist(stored);
      if (alarm) {
        throw alarm;
      }
    },

    async read(): Promise<string | null> {
      return (await readAttested()).head;
    },

    readAttested,
  };
}
