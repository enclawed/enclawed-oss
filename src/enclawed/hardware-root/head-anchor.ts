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
// What this still does NOT stop, stated here because it belongs next to the code:
// an attacker with the device physically present. ANCHOR_SET is unauthenticated,
// so anything on the host can advance the counter over a head of its choosing.
// This defeats remote compromise and malware, not someone at the keyboard with
// the enclaweder plugged in.

import { readFile, writeFile } from "node:fs/promises";
import type { HeadAnchorSink } from "../audit-log.js";
import { type AnchorResponse, verifyAnchor } from "./enclaweder-hid.js";

/** The slice of the device this needs. */
export type AnchorCapableDevice = {
  anchorSet(head32: Buffer): Promise<AnchorResponse>;
  anchorGet(): Promise<AnchorResponse | null>;
};

/**
 * An anchor that is present but does not verify.
 *
 * Distinct from an absent anchor on purpose. "Missing" means we cannot prove
 * completeness; "present and wrong" means someone edited it, which is a finding
 * in its own right and must never be reported as a clean absence.
 */
export class HeadAnchorTampered extends Error {
  constructor(reason: string) {
    super(`head anchor failed verification: ${reason}`);
    this.name = "HeadAnchorTampered";
  }
}

/**
 * The stored copy, kept so the log stays checkable when the device is away.
 * It is a convenience, never the authority: everything in it is under the
 * attacker's control, which is exactly why `read()` prefers the device.
 */
type StoredAnchor = {
  head: string;
  counter: string; // decimal; JSON has no 64-bit integer
  uid: string;
  sig: string;
  /** Device serial, for the operator; never trusted for verification. */
  serial?: string;
};

const HEX64 = /^[0-9a-f]{64}$/;

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
  if (typeof stored.counter !== "string" || !/^\d{1,20}$/.test(stored.counter)) {
    throw new HeadAnchorTampered("counter is missing or not a decimal integer");
  }
  return stored;
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
  const verify = (a: AnchorResponse): boolean =>
    verifyAnchor(opts.devicePublicKey, a.counter, a.head, a.uid, a.sig);

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
    if (
      !verifyAnchor(
        opts.devicePublicKey,
        BigInt(stored.counter),
        Buffer.from(stored.head, "hex"),
        uid,
        sig,
      )
    ) {
      throw new HeadAnchorTampered(
        "stored signature does not cover this head and counter, or is from another device",
      );
    }
    return stored;
  }

  async function readAttested(): Promise<{
    head: string | null;
    attested: "device" | "offline" | "none";
  }> {
    let live: AnchorResponse | null;
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

    if (!verify(live)) {
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

    return { head: live.head.toString("hex"), attested: "device" };
  }

  return {
    id: "enclaweder",

    async write(head: string): Promise<void> {
      if (!HEX64.test(head)) {
        throw new Error(`head anchor: expected a 64-char hex hash, got ${head.length} chars`);
      }
      const a = await opts.device.anchorSet(Buffer.from(head, "hex"));
      if (!verify(a)) {
        // The device answered with something its own key does not cover. Either
        // it is not the device we verified, or the response was tampered with in
        // transit; both mean this anchor is worthless.
        throw new HeadAnchorTampered("device response failed signature verification");
      }
      const stored: StoredAnchor = {
        head,
        counter: a.counter.toString(),
        uid: a.uid.toString("hex"),
        sig: a.sig.toString("base64"),
        ...(opts.serial ? { serial: opts.serial } : {}),
      };
      await writeFile(opts.path, `${JSON.stringify(stored)}\n`, "utf8");
    },

    async read(): Promise<string | null> {
      return (await readAttested()).head;
    },

    readAttested,
  };
}
