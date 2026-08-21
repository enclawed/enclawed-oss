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
import fs from "node:fs";
import os from "node:os";

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
  return (
    process.env.ENCLAWEDER_FORENSIC_LOG ??
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

/** Persist a snapshot: append-only local log (survives the device wipe) + optional off-box webhook. */
export async function recordForensics(snap: ForensicSnapshot): Promise<void> {
  try {
    fs.appendFileSync(forensicLogPath(), JSON.stringify(snap) + "\n");
  } catch (e) {
    try {
      console.error("[forensics] local write failed:", (e as Error).message);
    } catch {
      /* logging best-effort */
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
