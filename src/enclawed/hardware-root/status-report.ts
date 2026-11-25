// `enclawed hardware-root status`: the user's diagnosis of the Enclaweder, in user terms.
//
// hardwareRootStatusStandalone() reads the devices (signed answers over fresh nonces); this file
// only decides and renders. It answers, for each device: is it present, genuine, operational,
// zeroized or a different unit, CLEAN or DIRTY, ready for recovery -- and, for anything that is
// not OK, what to do. Nothing here talks to a device, so it is tested with plain fixtures.
//
// Exit codes: 0 operational and CLEAN, 2 DIRTY, 3 not operational, zeroized, not genuine, a
// different unit, or no device (1, an error, is the caller's).
import type { RootHealth } from "./broker.js";
import type { DeviceFailure, DeviceLatchState, LatchErrorCode } from "./device-latch.js";
import type { EnclawederSku } from "./enclaweder-hid.js";
import { FAILURE_WARN_THRESHOLD } from "./guard.js";
import type { Latch } from "./latches.js";

/** At or below this many recovery codes left, ask for a new set. */
export const FEW_CODES_LEFT = 2;

/** The device fields this needs (a DeviceRootReport satisfies it). */
export interface StatusDeviceInput {
  path: string;
  serial: string;
  uid: string;
  pubkey: string;
  state: number | null;
  cert: "valid" | "missing" | "invalid" | null;
  sku: EnclawederSku | null;
  keyProof: boolean | null;
  latch: DeviceLatchState | null;
  latchError: string | null;
  latchErrorCode: LatchErrorCode | null;
  failures: { total: bigint; pending: number; entries: DeviceFailure[] } | null;
  custody: { counter: number; m: number; keys: string[] } | null;
}

export interface StatusInput {
  hostLatches: Latch[];
  owner: RootHealth | null;
  devices: StatusDeviceInput[];
}

export type Verdict = "ok" | "dirty" | "not-operational" | "no-device";

export interface DeviceDiagnosis {
  serial: string;
  path: string;
  genuine: { status: "genuine" | "not-genuine" | "unprovisioned" | "unknown"; detail: string };
  operational: { status: "operational" | "not-operational"; detail: string };
  zeroization: {
    status: "not-zeroized" | "zeroized" | "different-unit" | "unknown";
    detail: string;
  };
  halt: { status: "CLEAN" | "DIRTY" | "unknown"; reason: string | null };
  recovery: {
    authenticator: "authenticator-app" | "security-key" | "none";
    codesLeft: number;
    failedAttemptsSinceClean: number;
    failedAttemptsLifetime: string | null;
    recentFailures: string[];
    locked: boolean;
    retryInSeconds: number | null;
    operators: string;
  } | null;
  verdict: Exclude<Verdict, "no-device">;
  todo: string[];
}

export interface HardwareRootDiagnosis {
  verdict: Verdict;
  exitCode: 0 | 2 | 3;
  /** Set when another Enclawed process on this machine owns the device(s). */
  owner: { status: "CLEAN" | "DIRTY" | "UNAVAILABLE"; reason: string | null } | null;
  devices: DeviceDiagnosis[];
  /** DIRTY records this computer keeps for a unit that is not plugged in. */
  hostRecords: Array<{ serial: string | null; reason: string | null }>;
  todo: string[];
}

// The device's own states (see ACC_STATE in enclaweder-hid.ts).
const STATE = { BOOT: 0, SELFTEST: 1, PROVISION: 2, READY: 3, ATTESTED: 4, ZEROIZED: 5, FAULT: 6 };
const USABLE = new Set([STATE.PROVISION, STATE.READY, STATE.ATTESTED]);

/** Why the device halted, in plain words. */
const HALT_REASON: Record<number, string> = {
  1: "halted by this computer",
  2: "halted by this computer (audit log protection)",
  3: "halted by this computer",
  4: "this computer's session ended without a clean close (crash, kill or suspend)",
  5: "the device was reset or re-plugged during a session",
  6: "unplugged or lost power during a session",
  7: "tamper detected",
  8: "the device detected an environmental fault",
  9: "attestation quorum failure",
  10: "the device's random-number health check failed",
  11: "zeroized by an operator",
  12: "the device failed a self-test",
};

const TODO = {
  recover:
    "Run `enclawed hardware-root recover` with the unit plugged in: you need your authenticator (app code, or security key with --fido) plus one recovery code.",
  notEnrolled:
    "Two-factor recovery is not set up on this device: contact your operators to recover it.",
  locked:
    "Two-factor recovery is locked after repeated failed attempts: contact your operators (only they can recover it now).",
  zeroized:
    "Do not use this unit: its keys are destroyed. Contact Enclawed or your operators to re-provision it.",
  counterfeit:
    "Stop: this device may be counterfeit. Do not use it, and report it to Enclawed or your operators.",
  firmware: "Update the Enclaweder firmware.",
  noDevice:
    "Plug the Enclaweder in. On WSL, attach it from an elevated Windows prompt first: `usbipd list`, then `usbipd attach --wsl --busid <BUSID>`.",
  unreadable:
    "The device did not give a verifiable answer: unplug it, plug it back in and run `enclawed hardware-root status` again. If it persists, contact your operators.",
  starting: "The device is still starting up: wait a few seconds and run status again.",
  fault:
    "The device reports a fault: unplug it and plug it back in. If it stays in fault, contact Enclawed or your operators.",
  reprovisioned:
    "This unit was re-provisioned (same serial, new keys) since this computer bound it: run `enclawed hardware-root recover` to adopt it; the device verifies the recovery.",
  ownerDirty:
    "Stop the Enclawed processes on this machine, then run `enclawed hardware-root recover`.",
  ownerUnavailable:
    "The Enclawed process that owns the device is not answering: stop it and run status again.",
};

function haltReason(l: DeviceLatchState): string {
  const why = HALT_REASON[l.reason] ?? l.reasonText;
  const when =
    l.sinceMs !== null ? `, ${Math.round(l.sinceMs / 1000)} s ago` : " (before this power-on)";
  return `${why}${when}`;
}

function serialOf(uid: string | undefined, fallback?: string | null): string | null {
  return fallback ?? (uid ? `ENCLW-${uid.toUpperCase()}` : null);
}

function fmtFailure(e: DeviceFailure): string {
  const when = e.hostTimeUntrusted
    ? `${new Date(e.hostTimeUntrusted * 1000).toISOString()} (computer clock)`
    : "time unknown";
  return `${e.opText}: ${e.reasonText}${e.count > 1 ? ` x${e.count}` : ""}, ${when}`;
}

function diagnoseDevice(d: StatusDeviceInput, hostLatches: Latch[]): DeviceDiagnosis {
  const todo: string[] = [];
  const answered = d.state !== null;
  const firmwareOld = d.latchErrorCode === "unsupported";

  // Zeroization, and whether this is the unit this computer is bound to.
  const bound = hostLatches.filter((l) => l.bound?.uid);
  const mine = bound.filter((l) => l.bound?.uid?.toLowerCase() === d.uid.toLowerCase());
  let zeroization: DeviceDiagnosis["zeroization"];
  if (d.state === STATE.ZEROIZED || d.cert === "missing") {
    zeroization = {
      status: "zeroized",
      detail: "keys destroyed: the unit is unprovisioned and needs re-provisioning",
    };
    todo.push(TODO.zeroized);
  } else if (bound.length > 0 && mine.length === 0) {
    const others = [...new Set(bound.map((l) => serialOf(l.bound?.uid, l.bound?.serial)))];
    zeroization = {
      status: "different-unit",
      detail: `this computer is bound to ${others.join(", ")}, not to this unit`,
    };
    todo.push(
      `Plug in the unit this computer is bound to (${others.join(", ")}). Moving this computer to a different unit is an operator action: if you did not swap the device on purpose, treat it as tampering and contact your operators.`,
    );
  } else if (mine.some((l) => l.bound?.pubkey && l.bound.pubkey.toLowerCase() !== d.pubkey)) {
    zeroization = {
      status: "different-unit",
      detail: "same serial, new keys: re-provisioned since this computer bound it",
    };
    todo.push(TODO.reprovisioned);
  } else if (!answered) {
    zeroization = { status: "unknown", detail: "the device did not report its state" };
  } else {
    zeroization = { status: "not-zeroized", detail: "keys present" };
  }

  // Genuine: a certificate from a pinned Enclawed root for this key, and proof it holds the key.
  let genuine: DeviceDiagnosis["genuine"];
  if (d.cert === "invalid" || d.keyProof === false) {
    genuine = {
      status: "not-genuine",
      detail:
        d.cert === "invalid"
          ? "its certificate does not verify against the Enclawed root"
          : "it could not prove it holds the key it reports",
    };
    todo.push(TODO.counterfeit);
  } else if (d.cert === "missing") {
    genuine = { status: "unprovisioned", detail: "it carries no certificate" };
  } else if (d.cert === "valid" && d.keyProof === true) {
    genuine = {
      status: "genuine",
      detail: `certificate verified against the Enclawed ${d.sku === "pro" ? "Pro" : "Base"} root; it proved it holds its key`,
    };
  } else {
    genuine = {
      status: "unknown",
      detail:
        d.cert === "valid"
          ? "certificate verified, but the device did not answer the key check"
          : "the device did not answer",
    };
  }

  // Operational: it answers, its self-tests and state are OK, and its firmware is new enough.
  let operational: DeviceDiagnosis["operational"];
  if (!answered) {
    operational = { status: "not-operational", detail: "it does not answer" };
    todo.push(TODO.unreadable);
  } else if (d.state === STATE.FAULT) {
    operational = { status: "not-operational", detail: "it reports a fault" };
    todo.push(TODO.fault);
  } else if (d.state === STATE.BOOT || d.state === STATE.SELFTEST) {
    operational = { status: "not-operational", detail: "it is still starting up" };
    todo.push(TODO.starting);
  } else if (d.state === STATE.ZEROIZED) {
    operational = { status: "not-operational", detail: "it is zeroized" };
  } else if (!USABLE.has(d.state as number)) {
    operational = { status: "not-operational", detail: "it reports an unknown state" };
    todo.push(TODO.fault);
  } else if (firmwareOld) {
    operational = { status: "not-operational", detail: "its firmware is too old" };
    todo.push(TODO.firmware);
  } else if (!d.latch) {
    operational = { status: "not-operational", detail: "its halt state could not be verified" };
    if (genuine.status !== "not-genuine" && zeroization.status !== "zeroized") {
      todo.push(TODO.unreadable);
    }
  } else {
    operational = {
      status: "operational",
      detail: "it answers, its self-tests passed and its firmware is current",
    };
  }

  // Halt state: the device's signed word, else what this computer recorded for it.
  const hostDirty = mine.find((l) => l.status === "DIRTY");
  let halt: DeviceDiagnosis["halt"];
  if (d.latch?.state === "SET") {
    halt = { status: "DIRTY", reason: haltReason(d.latch) };
  } else if (hostDirty) {
    halt = {
      status: "DIRTY",
      reason: `recorded by this computer: ${hostDirty.dirty?.reason ?? "no reason recorded"}`,
    };
  } else if (d.latch) {
    halt = { status: "CLEAN", reason: null };
  } else {
    halt = { status: "unknown", reason: null };
  }

  // Recovery readiness.
  let recovery: DeviceDiagnosis["recovery"] = null;
  const l = d.latch;
  if (l) {
    const authenticator = l.factorsValid ? l.factorKind : "none";
    recovery = {
      authenticator,
      codesLeft: l.factorsValid ? l.codesLeft : 0,
      failedAttemptsSinceClean: l.failedAttempts,
      failedAttemptsLifetime: d.failures ? String(d.failures.total) : null,
      recentFailures: (d.failures?.entries ?? []).slice(0, 5).map(fmtFailure),
      locked: l.twoFactorLocked,
      retryInSeconds: l.codeWaitMs ? Math.ceil(l.codeWaitMs / 1000) : null,
      operators: l.custodyHandedOver
        ? `your organization's operators${d.custody ? ` (${d.custody.m} of ${d.custody.keys.length})` : ""}`
        : "Enclawed, Inc.",
    };
  }
  if (halt.status === "DIRTY" && zeroization.status !== "zeroized") {
    if (recovery?.locked) {
      todo.push(TODO.locked);
    } else if (recovery && recovery.authenticator === "none") {
      todo.push(TODO.notEnrolled);
    } else if (!todo.includes(TODO.reprovisioned)) {
      todo.push(TODO.recover);
    }
  } else if (recovery?.locked) {
    todo.push(TODO.locked);
  }
  if (recovery && recovery.authenticator === "none" && halt.status !== "DIRTY") {
    todo.push(
      "Two-factor recovery is not set up on this device: ask your operators to set it up before you need it.",
    );
  }
  if (recovery && recovery.authenticator !== "none" && recovery.codesLeft <= FEW_CODES_LEFT) {
    todo.push(
      `Only ${recovery.codesLeft} recovery code(s) left: ask your operators to reissue a new set.`,
    );
  }
  if (recovery && recovery.failedAttemptsSinceClean >= FAILURE_WARN_THRESHOLD) {
    todo.push(
      `${recovery.failedAttemptsSinceClean} failed recovery attempts since the last clean session: someone may be guessing codes. Investigate before continuing.`,
    );
  }

  const broken =
    genuine.status === "not-genuine" ||
    zeroization.status !== "not-zeroized" ||
    operational.status !== "operational";
  const verdict = broken ? "not-operational" : halt.status === "DIRTY" ? "dirty" : "ok";
  return {
    serial: d.serial,
    path: d.path,
    genuine,
    operational,
    zeroization,
    halt,
    recovery,
    verdict,
    todo,
  };
}

const EXIT: Record<Verdict, 0 | 2 | 3> = { ok: 0, dirty: 2, "not-operational": 3, "no-device": 3 };
const RANK: Record<Verdict, number> = { ok: 0, dirty: 1, "not-operational": 2, "no-device": 2 };

/** Decide every device's state and what to do. Pure: no device or file access. */
export function diagnoseHardwareRoot(r: StatusInput): HardwareRootDiagnosis {
  if (r.owner) {
    const status = r.owner.status;
    const reason = "reason" in r.owner && r.owner.reason ? r.owner.reason : null;
    const verdict: Verdict =
      status === "CLEAN" ? "ok" : status === "DIRTY" ? "dirty" : "not-operational";
    return {
      verdict,
      exitCode: EXIT[verdict],
      owner: { status, reason },
      devices: [],
      hostRecords: [],
      todo:
        status === "CLEAN" ? [] : [status === "DIRTY" ? TODO.ownerDirty : TODO.ownerUnavailable],
    };
  }
  const devices = r.devices.map((d) => diagnoseDevice(d, r.hostLatches));
  const present = new Set(r.devices.map((d) => d.uid.toLowerCase()));
  const hostRecords = r.hostLatches
    .filter((l) => l.status === "DIRTY" && !present.has(l.bound?.uid?.toLowerCase() ?? ""))
    .map((l) => ({
      serial: serialOf(l.bound?.uid, l.bound?.serial),
      reason: l.dirty?.reason ?? null,
    }));
  let verdict: Verdict = devices.length === 0 ? "no-device" : "ok";
  for (const d of devices) {
    if (RANK[d.verdict] > RANK[verdict]) {
      verdict = d.verdict;
    }
  }
  const todo: string[] = [];
  if (devices.length === 0) {
    todo.push(TODO.noDevice);
  }
  if (hostRecords.length > 0) {
    todo.push(
      `This computer holds a DIRTY record for ${hostRecords.map((h) => h.serial ?? "an unknown unit").join(", ")}: plug that unit in and run \`enclawed hardware-root recover\`.`,
    );
    if (verdict === "ok") {
      verdict = "dirty";
    }
  }
  return { verdict, exitCode: EXIT[verdict], owner: null, devices, hostRecords, todo };
}

const OVERALL: Record<Verdict, string> = {
  ok: "OK: operational and CLEAN",
  dirty: "DIRTY: accreditation is halted until recovery",
  "not-operational": "NOT OPERATIONAL",
  "no-device": "NO DEVICE",
};

function recoveryLine(r: NonNullable<DeviceDiagnosis["recovery"]>): string {
  const who =
    r.authenticator === "authenticator-app"
      ? "authenticator app enrolled"
      : r.authenticator === "security-key"
        ? "security key enrolled"
        : "two-factor recovery not set up";
  const parts = [who];
  if (r.authenticator !== "none") {
    parts.push(`${r.codesLeft} recovery code(s) left`);
  }
  parts.push(
    `${r.failedAttemptsSinceClean} failed attempt(s) since the last clean session${r.failedAttemptsLifetime !== null ? ` (${r.failedAttemptsLifetime} in the device's lifetime)` : ""}`,
  );
  if (r.locked) {
    parts.push("LOCKED after repeated failures (operators only)");
  } else if (r.retryInSeconds) {
    parts.push(`next attempt allowed in ${r.retryInSeconds} s`);
  }
  return parts.join("; ");
}

/** The human rendering of a diagnosis. */
export function renderHardwareRootDiagnosis(dx: HardwareRootDiagnosis): string {
  const out: string[] = [];
  if (dx.owner) {
    out.push(
      `The Enclaweder is in use by an Enclawed process on this machine: ${dx.owner.status}${dx.owner.reason ? ` (${dx.owner.reason})` : ""}`,
    );
  }
  if (!dx.owner && dx.devices.length === 0) {
    out.push("No Enclaweder detected.");
  }
  for (const d of dx.devices) {
    out.push(`Enclaweder ${d.serial}`);
    out.push(`  Present:      yes (${d.path})`);
    out.push(
      `  Genuine:      ${d.genuine.status === "genuine" ? "yes" : d.genuine.status === "not-genuine" ? "NO" : d.genuine.status === "unprovisioned" ? "unprovisioned" : "unknown"} -- ${d.genuine.detail}`,
    );
    out.push(
      `  Operational:  ${d.operational.status === "operational" ? "yes" : "NO"} -- ${d.operational.detail}`,
    );
    out.push(
      `  Zeroization:  ${d.zeroization.status === "not-zeroized" ? "not zeroized" : d.zeroization.status === "zeroized" ? "ZEROIZED" : d.zeroization.status === "different-unit" ? "DIFFERENT UNIT" : "unknown"} -- ${d.zeroization.detail}`,
    );
    out.push(`  Halt state:   ${d.halt.status}${d.halt.reason ? ` -- ${d.halt.reason}` : ""}`);
    if (d.recovery) {
      out.push(`  Recovery:     ${recoveryLine(d.recovery)}`);
      out.push(`  Operators:    ${d.recovery.operators}`);
      for (const f of d.recovery.recentFailures) {
        out.push(`    failed: ${f}`);
      }
    }
    if (d.todo.length > 0) {
      out.push("  What to do:");
      for (const t of d.todo) {
        out.push(`    - ${t}`);
      }
    }
  }
  for (const h of dx.hostRecords) {
    out.push(
      `This computer: DIRTY record for ${h.serial ?? "an unknown unit"}${h.reason ? ` -- ${h.reason}` : ""}`,
    );
  }
  if (dx.todo.length > 0) {
    out.push("What to do:");
    for (const t of dx.todo) {
      out.push(`  - ${t}`);
    }
  }
  out.push(`Overall: ${OVERALL[dx.verdict]} (exit ${dx.exitCode})`);
  return `${out.join("\n")}\n`;
}
