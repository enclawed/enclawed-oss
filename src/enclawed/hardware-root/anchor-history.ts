// The audit anchor's history and the device comparison of a log: the kit's, never an adapter's.
//
// The device holds one anchor slot and the logger's anchor file one copy of it, so an older,
// genuinely signed copy restored over the file looked like "the device was anchored again by
// someone else". The logger therefore also appends every anchor it makes to a history beside the
// log: one line per anchor, carrying exactly the fields the device signed for that record's
// version, so every line verifies on its own against the device's certified key:
//
//   record v1 (firmware before authenticated anchoring)  { head, counter, uid, sig }
//   record v2 (an unbound anchor session)                 { version: 2, head, counter, uid, sig, sess, opens }
//   record v3 (a session bound to a launch activation)    { version: 3, head, counter, uid, sig, sess, opens, bind }
//
// plus an informational `ts`. A line is read strictly: its version decides the one signature
// domain it is checked under (the three tags differ, so no record verifies as another version),
// a field its version signs that is missing, malformed or extra fails the line, and an unknown
// version fails it. The comparison (compareAnchoredLog) is what `audit verify` and a launcher's
// anchor gate run on a log as found: the device's own head and counter against the log, its
// anchor file and this history; with the log's launch activations, every bound (v3) line must
// also name one of them (a session bound to an activation the log does not record is not one of
// the log's own launches).

import fs from "node:fs";
import { type ActivationFacts, bindingNames } from "./activation.js";
import { type AnchorResponse, verifyAnchorRecord } from "./enclaweder-hid.js";
import { type AnchorCapableDevice, enclawederHeadAnchor } from "./head-anchor.js";

/** The logger's signed copy of the device's anchor, beside the log. */
export function anchorFilePath(auditLog: string): string {
  return `${auditLog}.enclaweder-anchor.json`;
}

/** The anchor history (one device-signed line per anchor), beside the log. */
export function anchorHistoryPath(auditLog: string): string {
  return `${auditLog}.enclaweder-anchors.jsonl`;
}

/** One anchor record, verified against the device's key. Decimal fields are bigints. */
export type VerifiedAnchorRecord = Readonly<{
  version: 1 | 2 | 3;
  head: string;
  counter: bigint;
  uid: string;
  /** The device's Ed25519 signature (base64). */
  sig: string;
  /** v2/v3: the session that set the head and the device's open count; null for v1. */
  sess: bigint | null;
  opens: bigint | null;
  /** v3: the activation binding the device signed into the record (hex); null otherwise. */
  bind: string | null;
}>;

const HEX64 = /^[0-9a-f]{64}$/;
const HEX24 = /^[0-9a-f]{24}$/;
const DEC = /^(0|[1-9]\d{0,19})$/;
const B64_SIG = /^[A-Za-z0-9+/]{86}==$/;

/** The fields each record version signs (besides head, counter, uid, sig). */
const SIGNED_EXTRA: Readonly<Record<1 | 2 | 3, readonly string[]>> = {
  1: [],
  2: ["version", "sess", "opens"],
  3: ["version", "sess", "opens", "bind"],
};
const BASE = ["head", "counter", "uid", "sig"] as const;
/** Unsigned fields a history line may carry. */
const HISTORY_UNSIGNED = new Set(["ts"]);
/** Unsigned fields the anchor file may carry (head-anchor.ts StoredAnchor). */
const FILE_UNSIGNED = new Set(["sessions", "serial"]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse and verify one stored record against `devicePublicKey`, strictly: the version (absent: a
 * v1 record written before record v2; otherwise exactly the number 1, 2 or 3) decides which
 * fields must be present and the one signature domain they are checked under. Null when any
 * signed field is missing, malformed or does not belong to that version, when an unsigned field
 * is not one `unsigned` allows, or when the signature does not verify.
 */
export function verifySignedAnchorRecord(
  o: unknown,
  devicePublicKey: Buffer,
  unsigned: ReadonlySet<string> = HISTORY_UNSIGNED,
): VerifiedAnchorRecord | null {
  if (!isObject(o) || devicePublicKey.length !== 32) {
    return null;
  }
  const v = o.version;
  if (v !== undefined && v !== 1 && v !== 2 && v !== 3) {
    return null;
  }
  const version: 1 | 2 | 3 = v === undefined ? 1 : v;
  const allowed = new Set<string>([...BASE, ...SIGNED_EXTRA[version], ...unsigned]);
  if (version === 1) {
    allowed.add("version"); // a v1 record may name its version
  }
  for (const k of Object.keys(o)) {
    if (!allowed.has(k)) {
      return null; // a field this version does not sign (or an unknown one): not this record
    }
  }
  if (unsigned.has("ts") && o.ts !== undefined && typeof o.ts !== "number") {
    return null;
  }
  const { head, counter, uid, sig } = o;
  if (
    typeof head !== "string" ||
    !HEX64.test(head) ||
    typeof counter !== "string" ||
    !DEC.test(counter) ||
    typeof uid !== "string" ||
    !HEX24.test(uid) ||
    typeof sig !== "string" ||
    !B64_SIG.test(sig)
  ) {
    return null;
  }
  let sess: bigint | null = null;
  let opens: bigint | null = null;
  let bind: string | null = null;
  if (version >= 2) {
    if (typeof o.sess !== "string" || !DEC.test(o.sess)) {
      return null;
    }
    if (typeof o.opens !== "string" || !DEC.test(o.opens)) {
      return null;
    }
    sess = BigInt(o.sess);
    opens = BigInt(o.opens);
  }
  if (version === 3) {
    if (typeof o.bind !== "string" || !HEX64.test(o.bind)) {
      return null;
    }
    bind = o.bind;
  }
  const sigBuf = Buffer.from(sig, "base64");
  if (sigBuf.length !== 64) {
    return null;
  }
  const rec: Pick<AnchorResponse, "version" | "counter" | "head" | "uid" | "sig"> &
    Partial<Pick<AnchorResponse, "sess" | "opens" | "bind">> = {
    version,
    counter: BigInt(counter),
    head: Buffer.from(head, "hex"),
    uid: Buffer.from(uid, "hex"),
    sig: sigBuf,
    ...(version >= 2 ? { sess: sess as bigint, opens: opens as bigint } : {}),
    ...(version === 3 ? { bind: Buffer.from(bind as string, "hex") } : {}),
  };
  if (!verifyAnchorRecord(devicePublicKey, rec)) {
    return null;
  }
  return { version, head, counter: BigInt(counter), uid, sig, sess, opens, bind };
}

/** The logger's anchor file (head-anchor.ts), verified against the device's key; null when it is not. */
export function verifyAnchorFileRecord(
  stored: unknown,
  devicePublicKey: Buffer,
): VerifiedAnchorRecord | null {
  return verifySignedAnchorRecord(stored, devicePublicKey, FILE_UNSIGNED);
}

/** The history line for a verified record: exactly the fields its version signs, and `ts`. */
export function anchorHistoryLine(r: VerifiedAnchorRecord, ts: number): string {
  return JSON.stringify({
    ...(r.version >= 2 ? { version: r.version } : {}),
    head: r.head,
    counter: r.counter.toString(),
    uid: r.uid,
    sig: r.sig,
    ...(r.version >= 2 ? { sess: String(r.sess), opens: String(r.opens) } : {}),
    ...(r.version === 3 ? { bind: r.bind } : {}),
    ts,
  });
}

/**
 * Append the anchor the logger just wrote (its anchor file) to the history. The record is
 * verified against the device's key first and the line carries exactly what that record's version
 * signs, so it verifies on its own later; an anchor file that does not verify is not recorded
 * (throws: the caller reports it, and the next comparison fails on the missing line).
 */
export function appendAnchorHistory(o: {
  anchorPath: string;
  historyPath: string;
  devicePublicKey: Buffer;
  now?: number;
}): VerifiedAnchorRecord {
  let stored: unknown;
  try {
    stored = JSON.parse(fs.readFileSync(o.anchorPath, "utf8"));
  } catch (err) {
    throw new Error(`the anchor file cannot be read: ${(err as Error).message}`, { cause: err });
  }
  const r = verifyAnchorFileRecord(stored, o.devicePublicKey);
  if (!r) {
    throw new Error("the anchor file is not a record signed by this device; not recording it");
  }
  const line = anchorHistoryLine(r, o.now ?? Date.now());
  // The line must read back as the same record (it is exactly what the device signed).
  const back = verifySignedAnchorRecord(JSON.parse(line), o.devicePublicKey);
  if (!back || back.version !== r.version || back.counter !== r.counter || back.head !== r.head) {
    throw new Error("the anchor history line does not verify as the record it records");
  }
  fs.appendFileSync(o.historyPath, `${line}\n`, { mode: 0o600 });
  return r;
}

export type AnchorHistory = Readonly<{ entries: VerifiedAnchorRecord[]; bad: number }>;

/** The history's lines, each verified on its own (`bad`: lines that are not records of this device). */
export function parseAnchorHistory(text: string, devicePublicKey: Buffer): AnchorHistory {
  const entries: VerifiedAnchorRecord[] = [];
  let bad = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    let o: unknown;
    try {
      o = JSON.parse(line);
    } catch {
      bad++;
      continue;
    }
    const r = verifySignedAnchorRecord(o, devicePublicKey);
    if (r) {
      entries.push(r);
    } else {
      bad++;
    }
  }
  return { entries, bad };
}

/** The history file (absent: no entries). */
export function readAnchorHistory(historyPath: string, devicePublicKey: Buffer): AnchorHistory {
  let text: string;
  try {
    text = fs.readFileSync(historyPath, "utf8");
  } catch {
    return { entries: [], bad: 0 };
  }
  return parseAnchorHistory(text, devicePublicKey);
}

/** Why a bound record does not name one of `activations`, or null when it does (or is not bound). */
export function unboundHistoryRecord(
  r: VerifiedAnchorRecord,
  activations: readonly ActivationFacts[],
): string | null {
  if (r.version !== 3) {
    return null;
  }
  const bind = Buffer.from(r.bind as string, "hex");
  if (activations.some((f) => bindingNames(bind, f))) {
    return null;
  }
  return (
    `the anchor at counter ${r.counter} was set by anchor session ${r.sess}, bound to a device ` +
    "activation that none of this log's own auth.device-factor records names: it is not one of " +
    "this log's launches"
  );
}

// ─── The device comparison of a log ─────────────────────────────────────

/** Firmware without the anchor commands answers ST_UNSUPPORTED (status 8). */
const UNSUPPORTED = /status 8\b/;
/** decideAnchorGate (adapter launch-gates.ts) recognizes this wording. */
export const FIRMWARE_NO_ANCHOR =
  "the attached Enclaweder's firmware does not support audit anchoring (ANCHOR_SET/ANCHOR_GET answer ST_UNSUPPORTED); the log is anchored on the host only";

export type AnchorComparisonStatus = "matched" | "MISMATCH" | "superseded" | "unavailable";

export type AnchorComparison = Readonly<{
  status: AnchorComparisonStatus;
  code?: string;
  counter?: string | null;
  detail: string;
  /** matched: records after the anchored head, not anchored yet. */
  unanchoredTail?: number;
  /** matched: the fresh read's attestation (command set 0.5), for decideAuditAnchorVerdict. */
  attestation?: import("../audit-log.js").AnchorAttestation | null;
  /** The device holds an anchor of some log (from its counter); null when it could not be read. */
  deviceHasAnchors: boolean | null;
}>;

/**
 * Compare the device's anchor with a log as found: the device's head (a fresh read over this
 * process's nonce on command set 0.5), its counter and open count, the logger's anchor file and
 * the anchor history, against the log's record hashes (sealed segments first). `activations`
 * (the log's own launch activations, deviceFactorActivations) is optional: given, every bound
 * history line, and a bound anchor file, must name one of them. "MISMATCH" and "superseded" fail.
 */
export async function compareAnchoredLog(o: {
  device: AnchorCapableDevice;
  devicePublicKey: Buffer;
  auditLog: string;
  recordHashes: readonly (string | null)[];
  activations?: readonly ActivationFacts[] | null;
  /** The device's name for messages (its serial, or uid). */
  label?: string;
}): Promise<AnchorComparison> {
  const r = await compareOnce(o);
  if (r.deviceHasAnchors !== undefined) {
    return r as AnchorComparison;
  }
  let has: boolean | null = null;
  try {
    const live = await o.device.anchorGet();
    has = live ? live.counter > 0n : false;
  } catch {
    has = null;
  }
  return { ...r, deviceHasAnchors: has };
}

type Partial0 = Omit<AnchorComparison, "deviceHasAnchors"> & { deviceHasAnchors?: boolean | null };

async function compareOnce(o: {
  device: AnchorCapableDevice;
  devicePublicKey: Buffer;
  auditLog: string;
  recordHashes: readonly (string | null)[];
  activations?: readonly ActivationFacts[] | null;
  label?: string;
}): Promise<Partial0> {
  const anchorPath = anchorFilePath(o.auditLog);
  const historyPath = anchorHistoryPath(o.auditLog);
  const pub = o.devicePublicKey;
  const hashes = o.recordHashes;
  try {
    await o.device.anchorGet();
  } catch (err) {
    if (UNSUPPORTED.test((err as Error)?.message ?? "")) {
      return { status: "unavailable", detail: FIRMWARE_NO_ANCHOR };
    }
  }
  const sink = enclawederHeadAnchor({ device: o.device, devicePublicKey: pub, path: anchorPath });
  if (!sink.readAttested) {
    return {
      status: "unavailable",
      detail: "this head-anchor sink cannot read the device's attested head",
    };
  }
  let r: Awaited<ReturnType<NonNullable<typeof sink.readAttested>>>;
  try {
    r = await sink.readAttested();
  } catch (err) {
    const e = err as { code?: string; message?: string };
    // Record v2+: a head set under a session this logger never held, or a record older than one
    // it stored. Both fail.
    if (e?.code === "foreign-session") {
      return {
        status: "MISMATCH",
        code: "foreign-session",
        detail: `${e.message}. The device's head was anchored by another process or another log, not by this logger's sessions: the log cannot be proven complete, and a forged log may have been anchored`,
      };
    }
    if (e?.code === "downgrade") {
      return {
        status: "MISMATCH",
        code: "downgrade",
        detail: `${e.message}. The device answers with an older anchor record format than this log was anchored with: the firmware or the device was rolled back or replaced`,
      };
    }
    return { status: "MISMATCH", code: e?.code ?? "invalid", detail: String(e?.message ?? err) };
  }
  if (r.attested !== "device" || r.head === null) {
    return {
      status: "unavailable",
      detail:
        r.attested === "offline"
          ? "only the offline copy could be read"
          : "the device has never anchored this log",
    };
  }
  const live = await o.device.anchorGet().catch(() => null);
  if (live && !verifyAnchorRecord(pub, live)) {
    return {
      status: "MISMATCH",
      code: "invalid",
      detail: "the device's anchor record does not verify under its certified key",
    };
  }
  const counter = live ? live.counter.toString() : null;
  // The anchored-counter history: every line a record this device signed, exactly as signed.
  const hist = readAnchorHistory(historyPath, pub);
  if (hist.bad > 0) {
    return {
      status: "MISMATCH",
      code: "history-invalid",
      counter,
      detail: `${hist.bad} line(s) of the anchor history (${historyPath}) are not anchors signed by this device: the history was altered`,
    };
  }
  let storedRaw: unknown = null;
  try {
    storedRaw = JSON.parse(fs.readFileSync(anchorPath, "utf8"));
  } catch {
    storedRaw = null;
  }
  // readAttested verified the anchor file already (it throws on one that does not verify).
  const stored = storedRaw === null ? null : verifyAnchorFileRecord(storedRaw, pub);
  if (o.activations) {
    for (const e of [...hist.entries, ...(stored ? [stored] : [])]) {
      const why = unboundHistoryRecord(e, o.activations);
      if (why) {
        return { status: "MISMATCH", code: "history-unbound", counter, detail: why };
      }
    }
  }
  const newest = hist.entries.reduce<VerifiedAnchorRecord | null>(
    (m, e) => (m === null || e.counter > m.counter ? e : m),
    null,
  );
  if (newest && live && newest.counter > live.counter) {
    return {
      status: "MISMATCH",
      code: "history-ahead",
      counter,
      detail: `the anchor history has counter ${newest.counter}, ahead of the device's ${live.counter}: the device was replaced or rolled back`,
    };
  }
  if (newest && storedRaw !== null && stored && stored.counter < newest.counter) {
    return {
      status: "MISMATCH",
      code: "anchor-file-older",
      counter,
      detail: `the anchor file holds counter ${stored.counter}, older than this log's newest anchor (counter ${newest.counter}): an older anchor copy was restored`,
    };
  }
  // Record v2 and v3: the device counts every ANCHOR_OPEN, and `opens` is that count. Opens past
  // the newest session this logger held mean something else opened the anchor channel since.
  // Only DEVICE-SIGNED sessions count as this logger's: the history's verified records and the
  // anchor file's own verified record (its `sessions` list is covered by no signature).
  const known = new Set<bigint>(
    [...hist.entries, ...(stored ? [stored] : [])]
      .filter((e) => e.version >= 2 && e.sess !== null)
      .map((e) => e.sess as bigint),
  );
  known.delete(0n);
  if (live && live.version >= 2 && known.size > 0) {
    const mine = [...known].reduce((a, b) => (b > a ? b : a));
    if (live.opens > mine) {
      return {
        status: "MISMATCH",
        code: "foreign-open",
        counter,
        detail: `the device's anchor channel was opened ${live.opens - mine} more time(s) after this logger's newest session (${mine}; device opens ${live.opens}): another process or log held it since`,
      };
    }
  }
  const lost = hist.entries.find((e) => !hashes.includes(e.head));
  if (lost) {
    return {
      status: "MISMATCH",
      code: "records-removed",
      counter,
      detail: `the record anchored at counter ${lost.counter} (head ${lost.head.slice(0, 16)}…) is no longer in the log: records were removed`,
    };
  }
  const at = hashes.lastIndexOf(r.head);
  if (at < 0) {
    // The device holds one anchor. If this log's own (signature-checked) anchor file names an
    // earlier counter and a head that IS in the chain, the device was anchored again since, by
    // another writer: that proves nothing either way about the records after that copy, and it
    // is exactly what truncating the log behind a saved anchor copy and advancing the device
    // once looks like. A failure.
    if (stored && counter && stored.counter < BigInt(counter) && hashes.includes(stored.head)) {
      return {
        status: "superseded",
        counter,
        detail: `the device was anchored again since this log's last anchor (counter ${stored.counter} -> ${counter}), by another log on this device or after records were removed; records after record ${hashes.lastIndexOf(stored.head) + 1} are not proven complete`,
      };
    }
    return {
      status: "MISMATCH",
      code: "head-not-in-log",
      counter,
      detail: `the device's anchored head ${r.head.slice(0, 16)}… (counter ${counter}) is not a record of this log: records were removed, or the log was replaced`,
    };
  }
  // The history must extend the device-signed chain up to the device's head: a log is "matched"
  // only when its own anchor history, every line signed by this device, ends at exactly the
  // record the device holds, and its anchored heads appear in the log in counter order. A deleted
  // history, or a head the device holds that the history never recorded, means the log cannot be
  // shown to be the one that was anchored.
  if (!newest) {
    return {
      status: "MISMATCH",
      code: "no-history",
      counter,
      detail: `the device anchors record ${at + 1} of this log, but the anchor history (${historyPath}) is missing or empty: the log cannot be shown to extend the device-signed chain (a deleted history is how a replaced log is laundered)`,
    };
  }
  if (newest.head !== r.head || (live && newest.counter !== live.counter)) {
    return {
      status: "MISMATCH",
      code: "history-behind",
      counter,
      detail: `the anchor history ends at counter ${newest.counter} (head ${newest.head.slice(0, 16)}…), not at the device's anchor (counter ${counter}, head ${r.head.slice(0, 16)}…): the device's head was set outside this log's history`,
    };
  }
  const ordered = [...hist.entries].toSorted((x, y) =>
    x.counter < y.counter ? -1 : x.counter > y.counter ? 1 : 0,
  );
  for (let k = 1; k < ordered.length; k++) {
    if (hashes.indexOf(ordered[k].head) < hashes.indexOf(ordered[k - 1].head)) {
      return {
        status: "MISMATCH",
        code: "history-order",
        counter,
        detail: `the anchor at counter ${ordered[k].counter} names an earlier record than the anchor at counter ${ordered[k - 1].counter}: the anchored heads do not follow the log`,
      };
    }
  }
  return {
    status: "matched",
    counter,
    detail: `device ${o.label ?? "Enclaweder"} anchors record ${at + 1} of ${hashes.length} (counter ${counter})`,
    unanchoredTail: hashes.length - 1 - at,
    // The fresh read's attestation (command set 0.5: signed over this comparison's nonce, with the
    // binding of the session that set the head); absent on older firmware or a read not fresh.
    attestation: r.anchor ?? null,
  };
}
