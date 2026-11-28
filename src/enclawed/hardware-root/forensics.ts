import { createHash } from "node:crypto";
// Forensic capture for hardware-root tamper / DIRTY events.
//
// When the enclaweder zeroizes, disconnects, is swapped, or trips a tamper, the guard fail-secures --
// and at that moment we grab the most identifying data available from EVERY layer (device, host,
// network, session, and the recent action timeline) into an append-only, hash-chained record. Two
// properties make it useful for tracking an adversary postmortem:
//   * it lives on the HOST, so it SURVIVES the device wipe (the enclaweder erases itself; this doesn't);
//   * it can be pushed OFF-BOX to a webhook, so an adversary who wipes the local host can't unsend it.
//
// The enclaweder itself can't know an IP or a user -- those are host facts -- so the richest data is
// gathered here. An app enriches the "who/where" via setForensicContext({ operator, sourceIp, ... }).
//
// The log's own hash chain is unkeyed, so on its own a same-user attacker can drop a snapshot and
// rehash the rest (finding H13). So every snapshot's hash is ALSO appended to the app's audit
// chain (setForensicAuditSink), whose head the Enclaweder anchors: removing or rewriting a
// snapshot then leaves an audit record naming a hash the log no longer has, and removing that
// record breaks the device-anchored audit chain. verifyForensicLog checks both directions.
import fs from "node:fs";
import os from "node:os";
import { verifyChain, type AuditRecord } from "../audit-log.js";
import { realStateWriteRefusal } from "./test-guard.js";

export interface DeviceForensics {
  serial: string | null;
  pubkey: string | null;
  status: string;
}

export interface ForensicSnapshot {
  schema: "enclaweder.forensics.v1";
  capturedAt: string; // host wall-clock ISO (the device only has ticks)
  trigger: string; // why the hardware root went DIRTY (disconnect / zeroized / key changed / tamper)
  device: DeviceForensics | null;
  session: Record<string, unknown> | null; // app-provided who/where (no secrets)
  host: Record<string, unknown>;
  network: { interfaces: unknown[] };
  timeline: unknown[]; // the last N audited actions leading up to the event
  prevHash: string | null; // hash-chain: tamper-evident append-only log
  hash: string;
}

function safe<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null;
  }
}

// App-registered session context: who the last legitimate operator was and where they came from. No
// secrets -- this is written to a plaintext forensic log and possibly exfiltrated.
let forensicContext: Record<string, unknown> = {};
export function setForensicContext(ctx: Record<string, unknown>): void {
  forensicContext = { ...forensicContext, ...ctx };
}
export function getForensicContext(): Record<string, unknown> {
  return { ...forensicContext };
}

// Non-secret, high-signal environment. SSH_CONNECTION / SSH_CLIENT carry the CLIENT IP if the operator
// came in over SSH -- often the single most useful field for tracking a remote adversary. SUDO_USER
// reveals who escalated. Never widen this to arbitrary env (it holds tokens/keys).
const FORENSIC_ENV = [
  "USER",
  "LOGNAME",
  "SUDO_USER",
  "HOSTNAME",
  "SSH_CONNECTION",
  "SSH_CLIENT",
  "SSH_TTY",
  "DISPLAY",
  "TERM",
  "LANG",
  "PWD",
];

function machineId(): string | null {
  for (const p of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    const v = safe(() => fs.readFileSync(p, "utf8").trim());
    if (v) {
      return v;
    }
  }
  return null;
}

export function forensicLogPath(): string {
  // Beside a redirected latch (ENCLAWEDER_STATE) rather than in HOME: a process told to keep its
  // hardware-root state elsewhere (a test, a benchmark) must not write the real HOME's log.
  return (
    process.env.ENCLAWEDER_FORENSIC_LOG ??
    (process.env.ENCLAWEDER_STATE
      ? `${process.env.ENCLAWEDER_STATE}.forensics.jsonl`
      : undefined) ??
    `${process.env.HOME ?? "/var/lib/enclawed"}/.enclawed-forensics.jsonl`
  );
}

function auditTail(n: number): unknown[] {
  const p = (forensicContext.auditPath as string | undefined) ?? process.env.ENCLAWEDER_AUDIT_PATH;
  if (!p) {
    return [];
  }
  const raw = safe(() => fs.readFileSync(p, "utf8"));
  if (!raw) {
    return [];
  }
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-n)
    .map((l) => safe(() => JSON.parse(l)) ?? l);
}

function lastForensicHash(): string | null {
  const raw = safe(() => fs.readFileSync(forensicLogPath(), "utf8"));
  if (!raw) {
    return null;
  }
  const lines = raw.trim().split("\n").filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) {
    return null;
  }
  return (safe(() => JSON.parse(last)) as { hash?: string } | null)?.hash ?? null;
}

/** Snapshot every identifying signal available at the moment of a tamper/DIRTY event. */
export function captureForensics(
  trigger: string,
  device: DeviceForensics | null,
): ForensicSnapshot {
  const interfaces: unknown[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      interfaces.push({
        name,
        mac: a.mac,
        address: a.address,
        family: a.family,
        internal: a.internal,
      });
    }
  }
  const env: Record<string, string> = {};
  for (const k of FORENSIC_ENV) {
    const v = process.env[k];
    if (v) {
      env[k] = v;
    }
  }
  const body = {
    schema: "enclaweder.forensics.v1" as const,
    capturedAt: new Date().toISOString(),
    trigger,
    device,
    session: Object.keys(forensicContext).length > 0 ? getForensicContext() : null,
    host: {
      hostname: os.hostname(),
      osUser: safe(() => os.userInfo().username),
      platform: process.platform,
      release: os.release(),
      arch: process.arch,
      machineId: machineId(),
      uptimeSec: Math.round(os.uptime()),
      pid: process.pid,
      ppid: process.ppid,
      execPath: process.execPath,
      argv: process.argv,
      cwd: safe(() => process.cwd()),
      nodeVersion: process.version,
      env,
    },
    network: { interfaces },
    timeline: auditTail(20),
    prevHash: lastForensicHash(),
  };
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, hash };
}

/** Where each snapshot's hash is chained: the app's audit log (finding H13). */
export type ForensicAuditSink = (rec: {
  type: string;
  actor: string;
  level: string | null;
  payload: unknown;
}) => Promise<unknown>;
let auditSink: ForensicAuditSink | null = null;
/** Registers (or, with null, removes) the audit chain every forensic snapshot is recorded in. */
export function setForensicAuditSink(sink: ForensicAuditSink | null): void {
  auditSink = sink;
}
/** The audit record type that carries a forensic snapshot's hash. */
export const FORENSIC_AUDIT_TYPE = "hardware-root.forensics";

/** Persist a snapshot: append-only local log (survives the device wipe) + optional off-box webhook. */
export async function recordForensics(snap: ForensicSnapshot): Promise<void> {
  try {
    const file = forensicLogPath();
    const refusal = realStateWriteRefusal(file);
    if (refusal) {
      throw new Error(refusal);
    }
    fs.appendFileSync(file, JSON.stringify(snap) + "\n");
  } catch (e) {
    try {
      console.error("[forensics] local write failed:", (e as Error).message);
    } catch {
      /* logging best-effort */
    }
  }
  // Into the device-anchored audit chain, so the snapshot cannot be dropped silently (H13).
  if (auditSink) {
    try {
      await auditSink({
        type: FORENSIC_AUDIT_TYPE,
        actor: "hardware-root",
        level: null,
        payload: {
          hash: snap.hash,
          prevHash: snap.prevHash,
          trigger: snap.trigger.slice(0, 300),
          capturedAt: snap.capturedAt,
        },
      });
    } catch (e) {
      try {
        console.error("[forensics] audit-chain record failed:", (e as Error).message);
      } catch {
        /* logging best-effort */
      }
    }
  }
  const hook = process.env.ENCLAWEDER_FORENSIC_WEBHOOK;
  if (hook) {
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snap),
      });
    } catch {
      /* best-effort exfil; the local copy still exists */
    }
  }
  try {
    const h = snap.host as { hostname?: string };
    console.error(
      `[forensics] tamper snapshot recorded (trigger="${snap.trigger}", host=${h.hostname}, ` +
        `session=${JSON.stringify(snap.session)}, hash=${snap.hash.slice(0, 12)}…)`,
    );
  } catch {
    /* logging best-effort */
  }
}

/** Capture + persist in one call. Fired by the guard when the hardware root goes DIRTY. */
export async function captureAndRecordTamper(
  trigger: string,
  device: DeviceForensics | null,
): Promise<ForensicSnapshot> {
  const snap = captureForensics(trigger, device);
  await recordForensics(snap);
  return snap;
}

export type ForensicVerifyResult = {
  ok: boolean;
  snapshots: number;
  /** Forensic records found in the audit chain. */
  audited: number;
  problems: string[];
};

/**
 * Checks the forensic log against the audit chain (finding H13): the log's own chain must be
 * consistent; every forensic hash the audit chain recorded must still be in the log (a removed
 * or rewritten snapshot is caught here); every snapshot in the log must be in the audit chain
 * (one added afterwards is caught here); and the audit chain itself must verify, against its
 * head anchor (the Enclaweder's, when the caller passes it).
 */
export async function verifyForensicLog(
  forensicPath: string,
  auditPath: string,
  headAnchor?: Parameters<typeof verifyChain>[1],
): Promise<ForensicVerifyResult> {
  const problems: string[] = [];
  let snaps: ForensicSnapshot[] = [];
  try {
    const raw = fs.readFileSync(forensicPath, "utf8");
    snaps = raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as ForensicSnapshot);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      problems.push(`forensic log unreadable: ${(e as Error).message}`);
    }
  }
  let prev: string | null = null;
  snaps.forEach((s, i) => {
    const { hash, ...body } = s;
    if (createHash("sha256").update(JSON.stringify(body)).digest("hex") !== hash) {
      problems.push(`snapshot ${i}: hash does not match its body`);
    }
    if (body.prevHash !== prev) {
      problems.push(`snapshot ${i}: prevHash does not link to the snapshot before it`);
    }
    prev = hash;
  });
  const chain = await verifyChain(auditPath, headAnchor).catch((e: unknown) => ({
    ok: false as const,
    count: 0,
    brokenAt: 0,
    reason: (e as Error).message,
  }));
  if (!chain.ok) {
    problems.push(`audit chain does not verify: ${chain.reason} (record ${chain.brokenAt})`);
  }
  const audited: string[] = [];
  try {
    for (const line of fs.readFileSync(auditPath, "utf8").split("\n")) {
      if (!line) {
        continue;
      }
      const r = JSON.parse(line) as AuditRecord;
      const h = (r.payload as { hash?: unknown } | null)?.hash;
      if (r.type === FORENSIC_AUDIT_TYPE && typeof h === "string") {
        audited.push(h);
      }
    }
  } catch (e) {
    problems.push(`audit log unreadable: ${(e as Error).message}`);
  }
  const inLog = new Set(snaps.map((s) => s.hash));
  const inAudit = new Set(audited);
  for (const h of audited) {
    if (!inLog.has(h)) {
      problems.push(
        `the audit chain records forensic snapshot ${h.slice(0, 16)}... that the log no longer holds (removed or rewritten)`,
      );
    }
  }
  for (const s of snaps) {
    if (!inAudit.has(s.hash)) {
      problems.push(`forensic snapshot ${s.hash.slice(0, 16)}... is not in the audit chain`);
    }
  }
  return { ok: problems.length === 0, snapshots: snaps.length, audited: audited.length, problems };
}
