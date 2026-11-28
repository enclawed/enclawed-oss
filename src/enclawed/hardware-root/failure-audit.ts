// Every failed authentication attempt is logged, at both layers ("any failed authentication
// attempt must be logged").
//
// The DEVICE's log is the authority (signed export over a fresh nonce, a total that never
// resets). This is the host half: each failure the host sees is appended to the hash-chained
// audit log (when this process has one) and to the forensic log, with the operation, the reason,
// counters and the device's sequence numbers -- never a code, PIN, signature or secret. After a
// failure the host pulls the device's signed log and RECONCILES: a device entry the host never
// recorded is itself recorded, flagged, as evidence of an attempt made outside this host's
// tooling (or by tooling that hides it).
import fs from "node:fs";
import { getRuntime } from "../runtime.js";
import { readFailLog, type DeviceFailure, type LatchFrameDevice } from "./device-latch.js";
import { captureAndRecordTamper } from "./forensics.js";
import { realStateWriteRefusal } from "./test-guard.js";

export interface HostAuthFailure {
  /** Closed: what was attempted. */
  op:
    | "latch-clear-two-factor"
    | "latch-clear-operator"
    | "recover-anchor"
    | "anchor-session"
    | "latch-session"
    | "audit-accept"
    | "activation-auth"
    | "operator-tool";
  /** Closed-ish reason code (never free text containing input). */
  reason: string;
  serial?: string;
  deviceTotal?: string;
}

const SECRETISH = /\b[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-|\b\d{6}\b|[0-9a-f]{64,}/i;

/** Where the host keeps which device failure entries it has seen (beside the latch cache). */
export function failureMirrorPath(statePath: string): string {
  return `${statePath}.failures.jsonl`;
}

/** Record one host-observed failure (audit log + forensic log). Best effort; never throws. */
export async function recordHostAuthFailure(f: HostAuthFailure): Promise<void> {
  const payload = {
    op: f.op,
    reason: f.reason.replace(SECRETISH, "[redacted]").slice(0, 120),
    serial: f.serial ?? null,
    deviceTotal: f.deviceTotal ?? null,
  };
  try {
    await getRuntime()?.audit.append({
      type: "hardware.auth-failure",
      actor: "enclawed",
      level: null,
      payload,
    });
  } catch {
    /* no runtime audit log in this process */
  }
  await captureAndRecordTamper(`auth-failure:${f.op}:${payload.reason}`, null).catch(
    () => undefined,
  );
}

/**
 * Pull the device's signed failure log and reconcile it with what this host has recorded.
 * Returns the device entries this host had NOT recorded (each now recorded, flagged).
 */
export async function reconcileDeviceFailures(
  dev: LatchFrameDevice,
  devicePubRaw: Buffer,
  uid: Buffer,
  statePath: string,
  serial?: string,
  /** Failures this host just caused itself and has recorded: the newest that many are its own. */
  ownRecent = 0,
): Promise<{ total: bigint; unlogged: DeviceFailure[] }> {
  const log = await readFailLog(dev, devicePubRaw, uid);
  const mirror = failureMirrorPath(statePath);
  const seen = new Set<string>();
  try {
    for (const line of fs.readFileSync(mirror, "utf8").split("\n")) {
      if (line) {
        seen.add((JSON.parse(line) as { seq: string }).seq);
      }
    }
  } catch {
    /* first reconciliation */
  }
  const unseen = log.entries.filter((e) => !seen.has(String(e.seq)));
  // Newest first: the newest `ownRecent` unseen entries are the ones this host just recorded.
  const mine = new Set(unseen.slice(0, ownRecent));
  const unlogged = unseen.slice(ownRecent);
  for (const e of unseen.toReversed()) {
    try {
      const refusal = realStateWriteRefusal(mirror);
      if (refusal) {
        throw new Error(refusal);
      }
      fs.appendFileSync(
        mirror,
        JSON.stringify({
          seq: String(e.seq),
          total: String(e.total),
          op: e.op,
          reason: e.reason,
          count: e.count,
          at: Date.now(),
          host: mine.has(e) ? "recorded" : "UNLOGGED",
        }) + "\n",
      );
    } catch {
      /* the device keeps its own */
    }
  }
  if (unlogged.length) {
    await recordHostAuthFailure({
      op: "operator-tool",
      reason: `device failure log has ${unlogged.length} entr${unlogged.length === 1 ? "y" : "ies"} not recorded on this host (device total ${log.total})`,
      serial,
      deviceTotal: String(log.total),
    });
  }
  return { total: log.total, unlogged };
}
