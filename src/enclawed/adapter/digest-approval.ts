// enclawed adapter kit: device-approved digests (measured launch, approved
// policy, enrolled credentials).
//
// With a hardware root required, what decides a session's calls must be
// approved by a person through the device, not by a file on this host:
//
//   measurement   the code that decides (the adapter's hook, its own code,
//                 the framework bundle), measured by the launcher before the
//                 agent starts;
//   policy        the effective policy (when a policy file the user can write
//                 contributes to it; a root-owned managed policy needs none);
//   credential    a second-factor credential bound into device unlock grants.
//
// An approval is the device's TOTP verdict (TOTP_VERIFY: the device checks
// an authenticator code against a secret only it holds and signs its verdict
// over a nonce of the caller's) over
//
//   H("enclawed.<kind>.v1" ‖ 0x00 ‖ digest)
//
// for the kind's purpose byte. The nonce carries the digest, so a verdict
// approves exactly one digest of one kind, and the kinds cannot stand in for
// each other (different domains, and different purposes). No firmware change:
// the purposes are ones the device already knows (policy-change, admin,
// auth-change); the domain in the nonce is what separates measurement from
// other admin verdicts.
//
// Approvals are kept in a host file, which is tamper-evident (a forged or
// edited approval does not verify) but not rollback-proof: a person's older
// approval for an older digest stays valid for that digest. Removing a file
// only refuses launches.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CLOCK_DISAGREES_TEXT,
  type TotpPurpose,
  type VerdictRecord,
} from "../hardware-root/totp-verify.js";
import { type DeviceTotpSeam, frameworkDeviceTotp } from "./session.js";

export type ApprovalKind = "measurement" | "policy" | "credential";

const DOMAIN: Readonly<Record<ApprovalKind, string>> = Object.freeze({
  measurement: "enclawed.measurement.v1",
  policy: "enclawed.policy.v1",
  credential: "enclawed.credential.v1",
});

const PURPOSE: Readonly<Record<ApprovalKind, TotpPurpose>> = Object.freeze({
  measurement: "admin",
  policy: "policy-change",
  credential: "auth-change",
});

const HEX32 = /^[0-9a-f]{64}$/;

/** The 32-byte nonce the device signs its verdict over, for `kind` and `digest`. */
export function approvalNonce(kind: ApprovalKind, digest: string): Buffer {
  if (!Object.hasOwn(DOMAIN, kind)) {
    throw new Error(`unknown approval kind ${JSON.stringify(kind)}`);
  }
  return createHash("sha256")
    .update(DOMAIN[kind])
    .update("\0")
    .update(digestBytes(digest))
    .digest();
}

function digestBytes(d: string): Buffer {
  if (typeof d !== "string" || !HEX32.test(d)) {
    throw new Error("an approved digest is 64 lowercase hex digits");
  }
  return Buffer.from(d, "hex");
}

/** A stored approval: the kind, the digest, and the device's verdict over its nonce. */
export type DigestApproval = Readonly<{
  v: 1;
  kind: ApprovalKind;
  digest: string;
  verdict: VerdictRecord;
  /** What was approved, in words (not checked; for the person reading the file). */
  note: string | null;
}>;

export type ApprovalOutcome =
  | Readonly<{ ok: true; approval: DigestApproval }>
  | Readonly<{ ok: false; code: string; message: string }>;

/**
 * Ask the bound device to approve `digest` for `kind` with the authenticator
 * code the person typed. Only a passing verdict, signed by the bound device
 * over this digest's nonce for the kind's purpose, is returned.
 */
export async function approveDigest(o: {
  kind: ApprovalKind;
  digest: string;
  code: string;
  note?: string | null;
  device?: DeviceTotpSeam;
}): Promise<ApprovalOutcome> {
  const seam = o.device ?? frameworkDeviceTotp;
  const access = seam.access();
  if (!access) {
    return {
      ok: false,
      code: "no-device",
      message: "no Enclaweder that this process can use is bound and CLEAN",
    };
  }
  let nonce: Buffer;
  try {
    nonce = approvalNonce(o.kind, o.digest);
  } catch (err) {
    return { ok: false, code: "malformed", message: (err as Error).message };
  }
  const purpose = PURPOSE[o.kind];
  let r: Awaited<ReturnType<DeviceTotpSeam["verdict"]>>;
  try {
    r = await seam.verdict(access, { code: o.code.trim(), purpose, nonce });
  } catch (err) {
    return {
      ok: false,
      code: "device-error",
      message: `the Enclaweder did not answer (${(err as Error).message})`,
    };
  }
  if (!r.ok) {
    return {
      ok: false,
      code: r.code,
      message:
        r.code === "rejected"
          ? "the Enclaweder did not accept the authenticator code"
          : r.code === "clock-disagrees"
            ? CLOCK_DISAGREES_TEXT
            : `the Enclaweder refused (${r.code})`,
    };
  }
  const v = seam.verifyRecord(r.record, {
    purpose,
    nonce,
    pubkeyRaw: access.pubkeyRaw,
    uid: access.uid,
  });
  if (!v.ok) {
    return {
      ok: false,
      code: "bad-record",
      message: `the Enclaweder's verdict does not verify (${v.reason})`,
    };
  }
  return {
    ok: true,
    approval: { v: 1, kind: o.kind, digest: o.digest, verdict: r.record, note: o.note ?? null },
  };
}

/** A device whose approvals count: its certified key and uid (hex), as the launch bound them. */
export type ApprovingDevice = Readonly<{ pub: string; uid: string }>;

/**
 * Check a stored approval offline: for this kind and digest, a passing
 * verdict for the kind's purpose over the digest's nonce, signed by one of
 * `devices`. null when it approves, else why not.
 */
export function checkDigestApproval(
  approval: unknown,
  expect: { kind: ApprovalKind; digest: string; devices: readonly ApprovingDevice[] },
  verifyRecord: DeviceTotpSeam["verifyRecord"] = frameworkDeviceTotp.verifyRecord,
): string | null {
  const a = approval as Partial<DigestApproval> | null;
  if (!a || typeof a !== "object" || a.v !== 1) {
    return "no approval";
  }
  if (a.kind !== expect.kind || a.digest !== expect.digest) {
    return `the approval is for another ${a.kind === expect.kind ? "digest" : "kind"}`;
  }
  let nonce: Buffer;
  try {
    nonce = approvalNonce(expect.kind, expect.digest);
  } catch (err) {
    return (err as Error).message;
  }
  const reasons: string[] = [];
  for (const d of expect.devices) {
    if (!HEX32.test(d.pub) || !/^[0-9a-f]{24}$/.test(d.uid)) {
      continue;
    }
    const v = verifyRecord(a.verdict, {
      purpose: PURPOSE[expect.kind],
      nonce,
      pubkeyRaw: Buffer.from(d.pub, "hex"),
      uid: Buffer.from(d.uid, "hex"),
    });
    if (v.ok) {
      return null;
    }
    reasons.push(v.reason);
  }
  return reasons.length
    ? `the approval does not verify (${reasons[0]})`
    : "no device to check the approval against";
}

// ─── The approvals file ─────────────────────────────────────────────────

const MAX_KEPT = 32;

/** Read the approvals file (missing or unreadable: none). */
export function readApprovals(file: string): DigestApproval[] {
  try {
    const doc = JSON.parse(fs.readFileSync(file, "utf8")) as { v?: unknown; approvals?: unknown };
    return doc?.v === 1 && Array.isArray(doc.approvals) ? (doc.approvals as DigestApproval[]) : [];
  } catch {
    return [];
  }
}

/** Add an approval (newest first, at most 32 kept; the same kind and digest replaced). Atomic, 0600. */
export function storeApproval(file: string, approval: DigestApproval): void {
  const rest = readApprovals(file).filter(
    (a) => !(a.kind === approval.kind && a.digest === approval.digest),
  );
  const doc = { v: 1, approvals: [approval, ...rest].slice(0, MAX_KEPT) };
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** The approval in `file` that approves `kind`/`digest` for one of `devices`, or why none does. */
export function findApproval(
  file: string,
  expect: { kind: ApprovalKind; digest: string; devices: readonly ApprovingDevice[] },
  verifyRecord?: DeviceTotpSeam["verifyRecord"],
): Readonly<{ ok: true; approval: DigestApproval }> | Readonly<{ ok: false; reason: string }> {
  const candidates = readApprovals(file).filter(
    (a) => a?.kind === expect.kind && a?.digest === expect.digest,
  );
  if (!candidates.length) {
    return { ok: false, reason: `no device-signed approval for this ${expect.kind}` };
  }
  let last = "";
  for (const a of candidates) {
    const why = checkDigestApproval(a, expect, verifyRecord);
    if (!why) {
      return { ok: true, approval: a };
    }
    last = why;
  }
  return { ok: false, reason: last };
}

// ─── Measured launch ────────────────────────────────────────────────────

export type MeasuredFile = Readonly<{ name: string; path: string; sha256: string }>;

/** The stat identity of a measured file: any write (or a write and a restore) changes ctime. */
export type FileStamp = Readonly<{
  path: string;
  dev: number;
  ino: number;
  size: number;
  ctimeNs: string;
}>;

export type Measurement = Readonly<{
  /** sha256 over the sorted (name, sha256) list: what is approved and committed per call. */
  digest: string;
  files: readonly MeasuredFile[];
  stamps: readonly FileStamp[];
}>;

function stampOf(p: string): FileStamp {
  const st = fs.statSync(p, { bigint: true });
  return {
    path: p,
    dev: Number(st.dev),
    ino: Number(st.ino),
    size: Number(st.size),
    ctimeNs: st.ctimeNs.toString(),
  };
}

/**
 * Measure the files that decide a session (`entries`: a stable name for each,
 * and its path). Throws if one cannot be read: a launch whose code cannot be
 * measured is refused by the caller.
 */
export function measureFiles(entries: readonly { name: string; path: string }[]): Measurement {
  const names = new Set<string>();
  const files = entries
    .map((e) => {
      if (names.has(e.name)) {
        throw new Error(`measured twice: ${e.name}`);
      }
      names.add(e.name);
      return {
        name: e.name,
        path: e.path,
        sha256: createHash("sha256").update(fs.readFileSync(e.path)).digest("hex"),
      };
    })
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const h = createHash("sha256").update("enclawed.measurement.v1\0");
  for (const f of files) {
    h.update(`${f.name}\0${f.sha256}\n`);
  }
  return { digest: h.digest("hex"), files, stamps: entries.map((e) => stampOf(e.path)) };
}

/**
 * Whether the measured files are still the ones measured, by their stat
 * identity (cheap enough to check before every committed call): null when
 * unchanged, else the first changed path. A file written and restored
 * reads as changed (its change time moved).
 */
export function measurementChanged(stamps: readonly FileStamp[]): string | null {
  for (const s of stamps) {
    let now: FileStamp;
    try {
      now = stampOf(s.path);
    } catch {
      return s.path;
    }
    if (
      now.dev !== s.dev ||
      now.ino !== s.ino ||
      now.size !== s.size ||
      now.ctimeNs !== s.ctimeNs
    ) {
      return s.path;
    }
  }
  return null;
}

// ─── The launch gate ────────────────────────────────────────────────────

export type ApprovalGateRefusal = "measurement-not-approved" | "policy-not-approved";

export type ApprovalGate =
  | Readonly<{ ok: true; measurement: DigestApproval | null; policy: DigestApproval | null }>
  | Readonly<{ ok: false; code: ApprovalGateRefusal; reason: string; digest: string }>;

/**
 * With the hardware root required, a launch needs a device-signed approval
 * of its measurement, and of its effective policy unless that policy is the
 * managed (root-owned) one or the built-in default (`policyNeedsApproval`
 * false). Without the root required, nothing is asked.
 */
export function decideApprovalGate(o: {
  rootRequired: boolean;
  approvalsFile: string;
  devices: readonly ApprovingDevice[];
  measurementDigest: string;
  policyDigest: string;
  policyNeedsApproval: boolean;
  verifyRecord?: DeviceTotpSeam["verifyRecord"];
}): ApprovalGate {
  if (!o.rootRequired) {
    return { ok: true, measurement: null, policy: null };
  }
  const m = findApproval(
    o.approvalsFile,
    { kind: "measurement", digest: o.measurementDigest, devices: o.devices },
    o.verifyRecord,
  );
  if (!m.ok) {
    return {
      ok: false,
      code: "measurement-not-approved",
      reason: m.reason,
      digest: o.measurementDigest,
    };
  }
  if (!o.policyNeedsApproval) {
    return { ok: true, measurement: m.approval, policy: null };
  }
  const p = findApproval(
    o.approvalsFile,
    { kind: "policy", digest: o.policyDigest, devices: o.devices },
    o.verifyRecord,
  );
  if (!p.ok) {
    return { ok: false, code: "policy-not-approved", reason: p.reason, digest: o.policyDigest };
  }
  return { ok: true, measurement: m.approval, policy: p.approval };
}

/**
 * Whether an effective policy (policy-layers.ts layerPolicies) needs a
 * person's device approval: when a policy file the user can write was read
 * into it. The managed (root-owned) policy and the built-in defaults need
 * none, and neither does a user file that was not read (`note`).
 */
export function policyNeedsApproval(
  layered: Readonly<{ kind: string | null; note: string | null }>,
): boolean {
  return layered.kind !== null && layered.kind !== "managed" && layered.note === null;
}
