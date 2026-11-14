// The journal of every request made to a machine's Enclaweders.
//
// The owner's scheduler records each request and its outcome in an Enclawed
// audit log: append-only, every record chained to the one before by its hash,
// the head kept beside the log so a truncation is seen. A record removed,
// altered or inserted breaks the chain from that point on.
//
// On top of the chain, the device itself signs it as it grows: once a second,
// when anything new was recorded, the owner has the device sign the current
// head, and appends that signature as a checkpoint. Rewriting the journal up
// to a checkpoint would need a signature only the device can make, so the
// journal up to its last checkpoint is the device's own account of what it
// was asked and what it signed. Records after the last checkpoint (at most
// about a second's worth) are covered by the chain and the head anchor only.
//
// Every request is recorded before it is queued, and every signature before it
// is handed back, so nothing reaches the device, or leaves it, unrecorded.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  AuditLogger,
  fileHeadAnchor,
  verifyChain,
  type AuditRecord,
  type ChainVerifyResult,
} from "../audit-log.js";
import { verifyChallenge } from "./enclaweder-hid.js";

export const QUEUE_REQUEST = "device.request";
export const QUEUE_SIGNED = "device.signed";
export const QUEUE_REFUSED = "device.refused";
export const QUEUE_CHECKPOINT = "device.checkpoint";

const CHECKPOINT_TAG = Buffer.from("ENCLAWED-ROOT-QUEUE-CHECKPOINT-01");

/** What the device signs at a checkpoint: the journal's head at that moment. */
export function checkpointDigest(head: string): Buffer {
  return createHash("sha256")
    .update(CHECKPOINT_TAG)
    .update(Buffer.from([0]))
    .update(head)
    .digest();
}

/** Where the journal of a machine's device requests lives, beside its guard state. */
export function queueJournalPath(statePath: string): string {
  return process.env.ENCLAWEDER_QUEUE_LOG ?? `${statePath}.queue.jsonl`;
}

export class QueueJournal {
  private readonly log: AuditLogger;
  private head: string | null = null;
  /** Who owns the devices while these records are written. */
  private readonly owner = { pid: process.pid, since: Date.now() };

  constructor(readonly filePath: string) {
    this.log = new AuditLogger({ filePath, headAnchor: fileHeadAnchor(filePath) });
  }

  private async append(type: string, payload: Record<string, unknown>): Promise<AuditRecord> {
    const rec = await this.log.append({
      type,
      actor: `hardware-root:${this.owner.pid}`,
      level: null,
      payload: { ...payload, owner: this.owner },
    });
    this.head = rec.recordHash;
    return rec;
  }

  request(client: number, seq: number, digest: Buffer, until: number): Promise<AuditRecord> {
    return this.append(QUEUE_REQUEST, { client, seq, digest: digest.toString("hex"), until });
  }

  signed(client: number, seq: number, uid: Buffer, sig: Buffer): Promise<AuditRecord> {
    return this.append(QUEUE_SIGNED, {
      client,
      seq,
      uid: uid.toString("hex"),
      sig: sig.toString("hex"),
    });
  }

  refused(client: number, seq: number | null, reason: string): Promise<AuditRecord> {
    return this.append(QUEUE_REFUSED, { client, seq, reason });
  }

  checkpoint(covers: string, uid: Buffer, sig: Buffer): Promise<AuditRecord> {
    return this.append(QUEUE_CHECKPOINT, {
      covers,
      uid: uid.toString("hex"),
      sig: sig.toString("hex"),
    });
  }

  /** The hash of the last record written, or null before the first. */
  currentHead(): string | null {
    return this.head;
  }

  close(): Promise<void> {
    return this.log.close();
  }
}

export type QueueJournalReport = {
  chain: ChainVerifyResult;
  records: number;
  requests: number;
  signed: number;
  refused: number;
  checkpoints: number;
  /** Checkpoints whose signature is not a device's over a head that is in the chain. */
  badCheckpoints: number;
  /** Signatures recorded with no request before them. */
  orphanSignatures: number;
  /** Records after the last valid checkpoint: covered by the chain only. */
  uncovered: number;
  ok: boolean;
};

/**
 * Verifies a journal: the chain and its head anchor, every checkpoint's
 * signature against the devices' keys over a head that really is in the
 * chain, and that no signature was handed out without a request before it.
 */
export async function verifyQueueJournal(
  filePath: string,
  devices: readonly { uid: string; pubkey: string }[],
): Promise<QueueJournalReport> {
  const chain = await verifyChain(filePath, fileHeadAnchor(filePath));
  const seen = new Set<string>();
  const requested = new Set<string>();
  let records = 0;
  let requests = 0;
  let signed = 0;
  let refused = 0;
  let checkpoints = 0;
  let badCheckpoints = 0;
  let orphanSignatures = 0;
  let lastCovered = -1;
  const lines = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }) });
  for await (const line of lines) {
    if (!line) {
      continue;
    }
    const rec = JSON.parse(line) as AuditRecord;
    const p = rec.payload as Record<string, unknown>;
    const key = (o: Record<string, unknown>) =>
      `${JSON.stringify(o.owner)}/${String(o.client)}/${String(o.seq)}`;
    if (rec.type === QUEUE_REQUEST) {
      requests++;
      requested.add(key(p));
    } else if (rec.type === QUEUE_SIGNED) {
      signed++;
      if (!requested.has(key(p))) {
        orphanSignatures++;
      }
    } else if (rec.type === QUEUE_REFUSED) {
      refused++;
    } else if (rec.type === QUEUE_CHECKPOINT) {
      checkpoints++;
      const dev = devices.find((d) => d.uid === p.uid);
      const covers = typeof p.covers === "string" ? p.covers : "";
      const valid =
        !!dev &&
        seen.has(covers) &&
        verifyChallenge(
          Buffer.from(dev.pubkey, "hex"),
          checkpointDigest(covers),
          Buffer.from(String(p.uid), "hex"),
          Buffer.from(String(p.sig), "hex"),
        );
      if (valid) {
        lastCovered = records;
      } else {
        badCheckpoints++;
      }
    }
    seen.add(rec.recordHash);
    records++;
  }
  const uncovered = records - 1 - lastCovered;
  return {
    chain,
    records,
    requests,
    signed,
    refused,
    checkpoints,
    badCheckpoints,
    orphanSignatures,
    uncovered,
    ok: chain.ok && badCheckpoints === 0 && orphanSignatures === 0,
  };
}
