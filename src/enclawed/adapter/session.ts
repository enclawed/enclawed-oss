// enclawed adapter kit: the launch-side services an adapter's launcher uses
// around the host process.
//
//   LaunchServices (interface) is what a launcher needs; the generic parts are
//   implemented here, the host-specific ones (spawning the host, where the
//   host keeps its login, the host's settings format) stay in the adapter:
//
//   framework environment  only allowlisted ENCLAWED_* / ENCLAWEDER_* variables reach the framework;
//                          the hardware-root mode is parsed strictly; the flavor can only tighten
//   activation             two-factor authentication through the framework's auth gate
//                          (FIDO2 assertion or unlock ticket), plus, with an Enclaweder bound, an
//                          authenticator code the DEVICE verifies (the framework's device TOTP)
//   hardware-root binding  the framework's bootHardwareRoot / checkHardwareRootForToolCall /
//                          closeHardwareRootSessionAsync, with the per-call gate for the engine
//   containment policy     which nets must hold the host's processes, and the halt order:
//                          nothing may be left running before the login is erased
//   credential erase       overwrite-and-remove of the host's login files, verified afterwards
//
// Ported from codenclawed's env-authority.mjs, device-activation.mjs,
// containment.mjs, credentials.mjs and launcher.mjs.

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { checkHardwareRootForToolCall, type HardwareGateDecision } from "../agent-tool-guard.js";
import { assertSessionStartForDeviceUnlock } from "../auth/gate.js";
import {
  assertSecondFactor,
  SecondFactorError,
  type AuthContext,
  type DeviceSecondFactor,
  type SecondFactorResult,
} from "../auth/index.js";
import { type TicketBody, ticketDigest } from "../auth/ticket.js";
import {
  FactorError,
  grantUnlock,
  spendUnlock,
  verifyUnlockReceipt,
  type UnlockBody,
  type UnlockRecord,
} from "../hardware-root/device-factors.js";
import {
  bootHardwareRoot,
  closeHardwareRootSessionAsync,
  hardwareRootInfo,
  hardwareRootTotpDevice,
} from "../hardware-root/index.js";
import { parseHardwareRootMode, type HardwareRootMode } from "../hardware-root/root-mode.js";
import {
  CLOCK_DISAGREES_TEXT,
  deviceTotpEnrolled,
  deviceTotpVerdict,
  verifyVerdictRecord,
  type TotpPurpose,
} from "../hardware-root/totp-verify.js";
import { scrubLoaderEnv } from "./env-trust.js";
import type { ContainedLaunch, ContainmentOutcome, LaunchContainment } from "./types.js";
import { textOf } from "./untrusted.js";

/** A thrown value as a refusal code: its message when it has one, else the value itself. */
function thrownCode(e: unknown): string {
  return textOf((e as { message?: unknown } | null | undefined)?.message ?? e);
}

// ─── Framework environment ──────────────────────────────────────────────

/**
 * The ENCLAWED_* / ENCLAWEDER_* variables that may reach the framework:
 * user-specific locations, the device path, and switches that can only
 * tighten. Every other one is dropped (for example a forensic webhook, an
 * audit path or a classification scheme from the shell: they move evidence
 * or change a guarantee, so they come only from an administrator).
 */
export const FRAMEWORK_ENV_ALLOW: ReadonlySet<string> = new Set([
  "ENCLAWED_STATE_DIR",
  "ENCLAWED_HOME",
  "ENCLAWED_HISTORY_DIR",
  "ENCLAWED_CONFIG_PATH",
  "ENCLAWED_FLAVOR",
  "ENCLAWED_FIPS_REQUIRED",
  "ENCLAWED_TEST_FAST",
  "ENCLAWEDER_ROOT",
  "ENCLAWEDER_HIDRAW",
  "ENCLAWEDER_STATE",
  "ENCLAWEDER_STATE_DIR",
  "ENCLAWEDER_BROKER",
  "ENCLAWEDER_DEVICE",
]);

const FRAMEWORK_PREFIX = /^(ENCLAWED_|ENCLAWEDER_)/;

export type Flavor = "open" | "enclaved";

/** The flavor a shell asks for: null when unset; anything but exactly "open" reads as "enclaved" (the strictest). */
export function shellFlavor(env: Readonly<Record<string, string | undefined>>): {
  flavor: Flavor | null;
  unknown: boolean;
} {
  const v = env.ENCLAWED_FLAVOR;
  if (v === undefined || v === "") {
    return { flavor: null, unknown: false };
  }
  if (v === "open" || v === "enclaved") {
    return { flavor: v, unknown: false };
  }
  return { flavor: "enclaved", unknown: true };
}

export function stricterFlavor(a: Flavor | null, b: Flavor | null): Flavor {
  return a === "enclaved" || b === "enclaved" ? "enclaved" : "open";
}

export type HardwareRootModeDecision =
  | Readonly<{ ok: true; mode: HardwareRootMode }>
  | Readonly<{ ok: false; reason: string }>;

/**
 * The hardware-root mode for a launch: the shell's ENCLAWEDER_ROOT (strict,
 * the framework's own parser), with "optional" (retiring a device) accepted
 * only as an administrator's grant, never from the shell. Strictest wins.
 */
export function resolveHardwareRootMode(
  env: Readonly<Record<string, string | undefined>>,
  opts: { adminGrantedOptional?: boolean } = {},
): HardwareRootModeDecision {
  let mode: HardwareRootMode;
  try {
    mode = parseHardwareRootMode(env.ENCLAWEDER_ROOT);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  if (mode === "optional") {
    return {
      ok: false,
      reason:
        "ENCLAWEDER_ROOT=optional is an administrator's decision (retiring a device), not a shell setting; an administrator grants it in the root-owned settings. Unset ENCLAWEDER_ROOT to run without requiring a device",
    };
  }
  if (mode === "required") {
    return { ok: true, mode };
  }
  return { ok: true, mode: opts.adminGrantedOptional ? "optional" : "auto" };
}

/**
 * A copy of `env` whose framework variables are only the allowlisted ones,
 * with the resolved hardware-root mode and flavor, and without the
 * loader-injection variables (unless an administrator granted them).
 */
export function frameworkEnv(
  env: Readonly<Record<string, string | undefined>>,
  o: {
    hardwareRoot: HardwareRootMode;
    flavor?: Flavor | null;
    forensicWebhook?: string | null;
    loaderGranted?: readonly string[];
  },
): { env: Record<string, string | undefined>; dropped: string[]; loaderRemoved: string[] } {
  const out: Record<string, string | undefined> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(env)) {
    if (FRAMEWORK_PREFIX.test(k) && !FRAMEWORK_ENV_ALLOW.has(k)) {
      dropped.push(k);
      continue;
    }
    out[k] = v;
  }
  delete out.ENCLAWEDER_ROOT;
  if (o.hardwareRoot === "required" || o.hardwareRoot === "optional") {
    out.ENCLAWEDER_ROOT = o.hardwareRoot;
  }
  if (o.flavor) {
    out.ENCLAWED_FLAVOR = o.flavor;
  }
  if (o.forensicWebhook) {
    out.ENCLAWEDER_FORENSIC_WEBHOOK = o.forensicWebhook;
  }
  const scrubbed = scrubLoaderEnv(out, o.loaderGranted ?? []);
  return { env: scrubbed.env, dropped: dropped.toSorted(), loaderRemoved: scrubbed.removed };
}

// ─── Activation (two factors, device-verified with an Enclaweder) ───────

/** The device-counted unlock calls (command set 0.4), as the framework exposes them. */
export type DeviceUnlockSeam = Readonly<{
  grant: typeof grantUnlock;
  spend: typeof spendUnlock;
  verifyReceipt: typeof verifyUnlockReceipt;
}>;

/** The device-verified TOTP and unlock calls, as the framework exposes them (a seam, so tests can stand in a device). */
export type DeviceTotpSeam = Readonly<{
  access(): ReturnType<typeof hardwareRootTotpDevice>;
  enrolled: typeof deviceTotpEnrolled;
  verdict: typeof deviceTotpVerdict;
  verifyRecord: typeof verifyVerdictRecord;
  /** Absent: this device seam cannot count unlocks, so a headless launch with a device is refused. */
  unlock?: DeviceUnlockSeam;
}>;

export const frameworkDeviceTotp: DeviceTotpSeam = {
  access: hardwareRootTotpDevice,
  enrolled: deviceTotpEnrolled,
  verdict: deviceTotpVerdict,
  verifyRecord: verifyVerdictRecord,
  unlock: { grant: grantUnlock, spend: spendUnlock, verifyReceipt: verifyUnlockReceipt },
};

const LAUNCH_TAG = "enclawed.adapter.device-launch.v1";
const isTotpPurpose = (p: string): p is TotpPurpose =>
  [
    "session-start",
    "policy-change",
    "recovery",
    "disable-protection",
    "history-restore",
    "admin",
    "auth-change",
    "auth-test",
    "unlock",
  ].includes(p);

/**
 * The bound Enclaweder as the auth gate's device second factor: the device
 * checks the code against a secret only it holds and signs its verdict over a
 * nonce chosen here, fresh per check; only a passing, correctly signed verdict
 * for the expected purpose and nonce, from the bound device, is accepted.
 * null when no CLEAN, certified device is bound (nothing is faked here).
 */
/** What a device-verified session-start code activated: the verdict's TOTP step and latch counter. */
export type DeviceTotpFacts = Readonly<{ step: number; counter: bigint }>;

/** The kit's device second factor: also hands over, once, what its last passing verdict was. */
export type KitDeviceSecondFactor = DeviceSecondFactor &
  Readonly<{
    /** The facts of the last passing verdict, once (then null): the launch's record names them. */
    takeVerified(): DeviceTotpFacts | null;
  }>;

export function deviceSecondFactor(
  seam: DeviceTotpSeam = frameworkDeviceTotp,
): KitDeviceSecondFactor | null {
  const access = seam.access();
  if (!access) {
    return null;
  }
  let verified: DeviceTotpFacts | null = null;
  return {
    takeVerified: () => {
      const v = verified;
      verified = null;
      return v;
    },
    kind: "device-totp",
    label: "Authenticator code (checked by the Enclaweder)",
    enrolled: () => seam.enrolled(access).catch(() => false),
    async verify({ purpose, code }) {
      if (!isTotpPurpose(purpose)) {
        return { ok: false, code: "unknown-purpose" };
      }
      const nonce = createHash("sha256").update(LAUNCH_TAG).update(randomBytes(32)).digest();
      const r = await seam
        .verdict(access, { code, purpose, nonce })
        .catch((e: unknown) => ({ ok: false as const, code: thrownCode(e) }));
      if (!r.ok) {
        return { ok: false, code: r.code };
      }
      const v = seam.verifyRecord(r.record, {
        purpose,
        nonce,
        pubkeyRaw: access.pubkeyRaw,
        uid: access.uid,
      });
      if (!v.ok) {
        return { ok: false, code: "bad-record" };
      }
      // The device-signed verdict's step and latch counter: what command set 0.5 binds into a
      // session-start activation (activation.ts), so audit verify can match the anchored head.
      // (a seam that does not report them names nothing: its record cannot match a bound head).
      verified =
        typeof v.stepTimeS === "number" &&
        Number.isSafeInteger(v.stepTimeS) &&
        v.stepTimeS >= 0 &&
        typeof v.counter === "bigint"
          ? { step: Math.floor(v.stepTimeS / 30), counter: v.counter }
          : null;
      return { ok: true };
    },
  };
}

// ─── Device-counted unlock (headless launches with an Enclaweder) ────────

/** The ticket a device unlock grant is bound to: its body digest and the credential that signed it. */
export type UnlockTicketBinding = Readonly<{ digest: string; credentialId: string }>;

/** The binding of an unlock ticket as issued (`auth unlock` returns its body): what its grant is bound to. */
export function unlockTicketBinding(ticket: TicketBody): UnlockTicketBinding {
  return { digest: ticketDigest(ticket), credentialId: ticket.credentialId };
}

/**
 * What an unlock grant may unlock: 32 bytes the device binds into the grant
 * (and so into its signed nonce and every receipt). Bound to the host
 * adapter, to session starts, and to ONE ticket: the digest of its body and
 * the id of the credential that signed it. Spending computes the scope from
 * the ticket PRESENTED, so a replayed or edited ticket, or a ticket signed by
 * another credential (one written into this host's factor store), names
 * another scope and the device refuses it.
 */
export function unlockScope(
  host: string,
  ticket: UnlockTicketBinding,
  job: UnlockJob | null = null,
): Buffer {
  if (
    !/^[0-9a-f]{64}$/.test(ticket.digest) ||
    typeof ticket.credentialId !== "string" ||
    !ticket.credentialId
  ) {
    throw new Error("an unlock is bound to a ticket digest and a credential id");
  }
  return createHash("sha256")
    .update("enclawed.adapter.unlock-scope.v3\0")
    .update(host)
    .update("\0session-start\0")
    .update(ticket.digest)
    .update("\0")
    .update(ticket.credentialId)
    .update("\0")
    .update(unlockJobDigest(job))
    .digest();
}

/**
 * The job an unlock is for. A large unlock (more than one use, or longer than
 * ten minutes) delegates many launches without a person, so it is bound to
 * exactly one job: its name, the approved measurement of the code that
 * decides, the approved policy, the project and the kind of launch. Spending
 * computes the job from the launch being started, so a launch of other code,
 * under another policy, in another project or of another kind names another
 * scope and the device refuses it, with uses left.
 */
export type UnlockJob = Readonly<{
  name: string;
  measurementDigest: string;
  policyDigest: string;
  /** sha256 (hex) of the project's real path (projectDigest). */
  projectDigest: string;
  /** The launch kind, as the adapter names it (for example headless print mode). */
  kind: string;
}>;

/** A one-use, ten-minute unlock may name no job; anything larger must. */
export const UNBOUND_UNLOCK_MAX_USES = 1;
export const UNBOUND_UNLOCK_MAX_LEASE_S = 600;

const HEX64 = /^[0-9a-f]{64}$/;

/** sha256 (hex) of a job's canonical encoding; the "no job" digest for null. */
export function unlockJobDigest(job: UnlockJob | null): string {
  const h = createHash("sha256").update("enclawed.adapter.unlock-job.v1\0");
  if (!job) {
    return h.update("none").digest("hex");
  }
  if (
    typeof job.name !== "string" ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(job.name) ||
    !HEX64.test(job.measurementDigest) ||
    !HEX64.test(job.policyDigest) ||
    !HEX64.test(job.projectDigest) ||
    typeof job.kind !== "string" ||
    !/^[a-z0-9:._-]{1,64}$/.test(job.kind)
  ) {
    throw new Error(
      "a job is a name (letters, digits, . _ -), three sha256 digests and a launch kind",
    );
  }
  for (const v of [
    job.name,
    job.measurementDigest,
    job.policyDigest,
    job.projectDigest,
    job.kind,
  ]) {
    h.update(v).update("\0");
  }
  return h.digest("hex");
}

/** sha256 (hex) of a project's real path, for UnlockJob.projectDigest. */
export function projectDigest(realPath: string): string {
  return createHash("sha256")
    .update("enclawed.adapter.project.v1\0")
    .update(realPath)
    .digest("hex");
}

/**
 * A device unlock grant, as the adapter keeps it (in Enclawed's own state).
 * Nothing in it is secret and nothing in it is trusted: the DEVICE holds the
 * grant, counts its uses and ends it; this host only names it.
 */
export type DeviceUnlockGrant = Readonly<{
  v: 2;
  /** The ticket the grant is bound to (only names it; the device holds the binding in its scope). */
  ticket: UnlockTicketBinding;
  /** The job it is bound to (null: a one-use, ten-minute unlock for no particular job). */
  job: UnlockJob | null;
  host: string;
  /** The device's grant id (decimal). */
  gid: string;
  boot: string;
  uses: number;
  leaseMs: number;
  devicePub: string;
  deviceUid: string;
  scope: string;
  record: UnlockRecord;
}>;

export type UnlockRefusal =
  | "no-device"
  | "no-unlock"
  | "not-enrolled"
  | "other-device"
  | "other-scope"
  | "malformed"
  | "rejected"
  | "clock-disagrees"
  | "no-grant"
  | "mismatch"
  | "bad-receipt"
  | "replayed"
  | "use-refused"
  | "device-error";

export type UnlockOutcome<T> =
  | Readonly<{ ok: true } & T>
  | Readonly<{ ok: false; code: UnlockRefusal; message: string }>;

const UNLOCK_TEXT: Record<UnlockRefusal, string> = {
  "no-device": "no Enclaweder that this process can use is bound and CLEAN",
  "no-unlock": "this build cannot ask the Enclaweder to count unlocks",
  "not-enrolled": "the Enclaweder has no authenticator enrolled",
  "other-device": "the unlock was made with another Enclaweder",
  "other-scope": "the unlock was made for another program",
  malformed: "the unlock request is out of bounds",
  rejected: "the Enclaweder did not accept the authenticator code",
  "clock-disagrees": CLOCK_DISAGREES_TEXT,
  "no-grant":
    "the Enclaweder holds no live unlock (its uses ran out, it expired, it was revoked, or the device restarted)",
  mismatch: "the Enclaweder holds another unlock than the one named here",
  "bad-receipt": "the Enclaweder's answer does not verify",
  replayed: "the Enclaweder's receipt was already used",
  "use-refused":
    "the Enclaweder refused this use: the launch does not match its live unlock (another job, project, launch kind, ticket or credential), or the sealed request did not verify; no use was spent",
  "device-error": "the Enclaweder did not answer as expected",
};

const refuseUnlock = (code: UnlockRefusal, detail?: string) =>
  ({
    ok: false,
    code,
    message: detail ? `${UNLOCK_TEXT[code]} (${detail})` : UNLOCK_TEXT[code],
  }) as const;

function unlockCode(c: string): UnlockRefusal {
  switch (c) {
    case "malformed":
    case "not-enrolled":
    case "rejected":
    case "clock-disagrees":
    case "no-grant":
    case "mismatch":
    case "use-refused":
      return c;
    case "bad-signature":
    case "bad-record":
      return "bad-receipt";
    default:
      return "device-error";
  }
}

/**
 * Issue a device unlock (interactive: the person typed `code`, the current
 * authenticator code). The device checks the code and keeps the grant: `uses`
 * headless launches (1..64) within `leaseS` seconds (30..43 200). The adapter
 * stores the returned grant; spending it needs the device every time.
 */
export async function issueDeviceUnlock(o: {
  host: string;
  /** The unlock ticket the person just signed: the grant is spendable only with it. */
  ticket: UnlockTicketBinding;
  /** The job: required for more than one use or more than ten minutes. */
  job?: UnlockJob | null;
  code: string;
  uses: number;
  leaseS: number;
  device?: DeviceTotpSeam;
}): Promise<UnlockOutcome<{ grant: DeviceUnlockGrant }>> {
  const seam = o.device ?? frameworkDeviceTotp;
  const access = seam.access();
  if (!access) {
    return refuseUnlock("no-device");
  }
  if (!seam.unlock) {
    return refuseUnlock("no-unlock");
  }
  const unlock = seam.unlock;
  const job = o.job ?? null;
  if (!job && (o.uses > UNBOUND_UNLOCK_MAX_USES || o.leaseS > UNBOUND_UNLOCK_MAX_LEASE_S)) {
    return refuseUnlock(
      "malformed",
      `an unlock for more than ${UNBOUND_UNLOCK_MAX_USES} launch or ${UNBOUND_UNLOCK_MAX_LEASE_S / 60} minutes must name the one job it delegates`,
    );
  }
  let scope: Buffer;
  try {
    scope = unlockScope(o.host, o.ticket, job);
  } catch (err) {
    return refuseUnlock("malformed", (err as Error).message);
  }
  let r: Awaited<ReturnType<typeof grantUnlock>>;
  try {
    r = await access.run((dev) =>
      unlock.grant({ kind: "direct", dev }, access.pubkeyRaw, access.uid, {
        code: o.code.trim(),
        uses: o.uses,
        leaseS: o.leaseS,
        scope,
      }),
    );
  } catch (err) {
    return refuseUnlock("device-error", (err as Error)?.message);
  }
  if (!r.ok) {
    return refuseUnlock(unlockCode(r.code));
  }
  return {
    ok: true,
    grant: {
      v: 2,
      ticket: { digest: o.ticket.digest, credentialId: o.ticket.credentialId },
      job,
      host: o.host,
      gid: r.grant.gid.toString(),
      boot: r.grant.boot.toString(),
      uses: r.grant.uses,
      leaseMs: r.grant.leaseMs,
      devicePub: access.pubkeyRaw.toString("hex"),
      deviceUid: access.uid.toString("hex"),
      scope: scope.toString("hex"),
      record: r.record,
    },
  };
}

// Receipts already acted on in this process: (boot, grant, use index).
const spentReceipts = new Set<string>();

/**
 * Spend ONE use of a device unlock: the device counts it and signs a receipt
 * over a fresh nonce chosen here. Only a verified receipt, for this device,
 * this grant and this scope, counts; no receipt means no launch.
 */
export async function spendDeviceUnlock(
  grant: DeviceUnlockGrant | null | undefined,
  o: {
    host: string;
    /** The ticket presented for this launch (the gate's result), never the one the grant names. */
    ticket: UnlockTicketBinding | null | undefined;
    /**
     * The job of THIS launch, computed by the launcher from what it is
     * starting (the grant's job only lends its name). Required when the
     * grant names a job.
     */
    job?: UnlockJob | null;
    device?: DeviceTotpSeam;
  },
): Promise<UnlockOutcome<{ receipt: UnlockBody; record: UnlockRecord }>> {
  const seam = o.device ?? frameworkDeviceTotp;
  const access = seam.access();
  if (!access) {
    return refuseUnlock("no-device");
  }
  if (!seam.unlock) {
    return refuseUnlock("no-unlock");
  }
  if (!grant || grant.v !== 2 || !/^\d{1,20}$/.test(grant.gid)) {
    return refuseUnlock(
      "no-grant",
      grant && (grant as { v?: unknown }).v === 1
        ? "the device unlock on record is not bound to an unlock ticket (made by an older version); a person issues a new one"
        : "no device unlock is on record for this launch",
    );
  }
  if (!o.ticket) {
    return refuseUnlock("no-grant", "no unlock ticket was presented for this launch");
  }
  if (
    grant.devicePub !== access.pubkeyRaw.toString("hex") ||
    grant.deviceUid !== access.uid.toString("hex")
  ) {
    return refuseUnlock("other-device");
  }
  if (grant.job && !o.job) {
    return refuseUnlock(
      "other-scope",
      `the unlock is for the job ${grant.job.name}, and this launch names none`,
    );
  }
  let scope: Buffer;
  try {
    scope = unlockScope(o.host, o.ticket, grant.job ? (o.job ?? null) : null);
  } catch (err) {
    return refuseUnlock("malformed", (err as Error).message);
  }
  // The scope is the PRESENTED ticket's: the device refuses it when it is not
  // the one the grant was made for (another ticket, another credential).
  if (grant.host !== o.host) {
    return refuseUnlock("other-scope");
  }
  const unlock = seam.unlock;
  const gid = BigInt(grant.gid);
  const nonce = randomBytes(32);
  let r: Awaited<ReturnType<typeof spendUnlock>>;
  try {
    r = await access.run((dev) =>
      unlock.spend(dev, access.pubkeyRaw, access.uid, { gid, scope, nonce }),
    );
  } catch (err) {
    // A relayed use that failed on the way (a seal whose opening does not verify under the
    // certified key, a use that must stay sealed) is refused by what it was.
    if (err instanceof FactorError) {
      const c = unlockCode(err.code);
      return refuseUnlock(c, c === "device-error" ? err.message : undefined);
    }
    return refuseUnlock("device-error", (err as Error)?.message);
  }
  if (!r.ok) {
    return refuseUnlock(unlockCode(r.code));
  }
  const body = unlock.verifyReceipt(r.record, {
    pubkeyRaw: access.pubkeyRaw,
    uid: access.uid,
    nonce,
    scope,
  });
  if (!body || body.gid !== gid) {
    return refuseUnlock("bad-receipt");
  }
  const key = `${grant.devicePub}:${body.boot}:${body.gid}:${body.useIndex}`;
  if (spentReceipts.has(key)) {
    return refuseUnlock("replayed");
  }
  spentReceipts.add(key);
  return { ok: true, receipt: body, record: r.record };
}

export type ActivationResult = SecondFactorResult &
  Readonly<{
    /** How the bound Enclaweder took part: a code it verified, a use it counted, or no device bound. */
    device: "device-totp" | "device-unlock" | null;
    /** For a device-counted unlock: the receipt the device signed. */
    unlockReceipt?: UnlockRecord;
  }>;

/** The step and counter a kit device factor verified (decimal counter), or nothing. */
function totpFacts(f: DeviceSecondFactor | null): { step?: number; counter?: string } {
  const v =
    f && typeof (f as Partial<KitDeviceSecondFactor>).takeVerified === "function"
      ? (f as KitDeviceSecondFactor).takeVerified()
      : null;
  return v ? { step: v.step, counter: v.counter.toString() } : {};
}

async function auditDevice(ctx: AuthContext, payload: Record<string, unknown>): Promise<void> {
  if (ctx.audit) {
    await ctx.audit({
      type: "auth.device-factor",
      payload: { purpose: "session-start", ...payload },
    });
  }
}

/**
 * Activation for one launch: the framework's two-factor gate for
 * "session-start" (FIDO2 assertion at a terminal, or an unlock ticket for a
 * headless start), and, with an Enclaweder bound, a factor this host cannot
 * produce:
 *
 *   interactive, FIDO2 passed   the person also types an authenticator code
 *                               the DEVICE verifies (three attempts);
 *   interactive, device code    the gate already took the device's verdict;
 *   headless (unlock ticket)    one use of a device unlock grant
 *                               (issueDeviceUnlock), counted BY THE DEVICE, with
 *                               its signed receipt. The ticket's own use count
 *                               lives on this host, so with a device it is not
 *                               the bound: the device's count is.
 *
 * Throws the framework's SecondFactorError on refusal: the launch must not start.
 */
export async function activateSession(
  ctx: AuthContext,
  o: {
    detail?: string;
    allowTicket?: boolean;
    device?: DeviceTotpSeam | null;
    /** The adapter's host id (the unlock scope). Default "agent-cli". */
    host?: string;
    /** The stored device unlock, for a headless launch with a device bound. */
    unlock?: DeviceUnlockGrant | null;
    /** The job of this launch (UnlockJob), for a grant bound to one. */
    job?: UnlockJob | null;
    /**
     * The adapter holds a bound Enclaweder for this launch. Then a device
     * that cannot be asked now refuses the launch (no-device) instead of
     * counting as "no device bound".
     */
    bound?: boolean;
  } = {},
): Promise<ActivationResult> {
  const seam = o.device === null ? null : (o.device ?? frameworkDeviceTotp);
  if (o.bound && seam && !seam.access()) {
    throw new SecondFactorError(
      "no-device",
      "the bound Enclaweder cannot verify an authenticator code here (it is not CLEAN, or another process owns it); not starting",
    );
  }
  const deviceFactor =
    ctx.deviceFactor !== undefined
      ? ctx.deviceFactor
      : seam === null
        ? null
        : deviceSecondFactor(seam);
  // A headless launch with a bound device and its stored unlock may present a ticket
  // signed by a device-unlock ticket signer (not a factor): deviceActivation below then
  // must spend the device-counted grant bound to that ticket, or the launch is refused.
  const deviceUnlockPath =
    o.bound === true &&
    seam !== null &&
    Boolean(seam.access()) &&
    Boolean(o.unlock) &&
    (o.allowTicket ?? true);
  const r = deviceUnlockPath
    ? await assertSessionStartForDeviceUnlock(
        { ...ctx, deviceFactor },
        o.detail ? { detail: o.detail } : {},
      )
    : await assertSecondFactor(
        { ...ctx, deviceFactor },
        { purpose: "session-start", detail: o.detail, allowTicket: o.allowTicket ?? true },
      );
  return deviceActivation(
    r,
    { ...ctx, deviceFactor },
    { seam, host: o.host, unlock: o.unlock, job: o.job ?? null },
  );
}

/**
 * The device's part of an activation, after the framework's gate passed with
 * result `r` (see activateSession). Exported for adapters that run the gate
 * themselves.
 */
export async function deviceActivation(
  r: SecondFactorResult,
  ctx: AuthContext,
  o: {
    seam: DeviceTotpSeam | null;
    host?: string;
    unlock?: DeviceUnlockGrant | null;
    /** The job of this launch (UnlockJob), for a grant bound to one. */
    job?: UnlockJob | null;
  },
): Promise<ActivationResult> {
  const seam = o.seam;
  const deviceFactor = ctx.deviceFactor ?? null;
  // A ticket signed by a device-unlock ticket signer is no factor: only the device-counted
  // grant bound to it (spent below, in the ticket branch) can start the launch.
  if (r.deviceUnlockSigner && (r.via !== "ticket" || !seam || !seam.access() || !o.unlock)) {
    await auditDevice(ctx, {
      outcome: "refused",
      via: "device-unlock",
      code: "signer-without-grant",
    });
    throw new SecondFactorError(
      "no-ticket",
      "this unlock ticket was signed by the device-unlock ticket signer, which is not a second factor; it starts a launch only with the bound Enclaweder's counted unlock grant",
    );
  }
  // No device bound (or no device seam): the gate's answer is the whole answer.
  if (!seam || !seam.access()) {
    return { ...r, device: null };
  }
  if (r.via === "device-totp") {
    // The gate took the device's verdict: the launch's record names it (step, counter).
    await auditDevice(ctx, { outcome: "verified", via: "device-totp", ...totpFacts(deviceFactor) });
    return { ...r, device: "device-totp" };
  }
  if (r.via === "ticket") {
    const spent = await spendDeviceUnlock(o.unlock, {
      host: o.host ?? "agent-cli",
      ticket: r.ticket ?? null,
      job: o.job ?? null,
      device: seam,
    });
    if (!spent.ok) {
      await auditDevice(ctx, { outcome: "refused", via: "device-unlock", code: spent.code });
      throw new SecondFactorError(
        "no-ticket",
        `a headless launch with an Enclaweder needs a device unlock, and ${spent.message}; a person issues one at a terminal with an authenticator code the device checks`,
      );
    }
    await auditDevice(ctx, {
      outcome: "verified",
      via: "device-unlock",
      gid: spent.receipt.gid.toString(),
      useIndex: spent.receipt.useIndex,
      boot: spent.receipt.boot.toString(),
      usesLeft: spent.receipt.uses - spent.receipt.used,
    });
    return { ...r, device: "device-unlock", unlockReceipt: spent.record };
  }
  // FIDO2 passed on this host; the device must verify a code as well.
  const factor = deviceFactor ?? deviceSecondFactor(seam);
  if (!factor || !(await factor.enrolled())) {
    await auditDevice(ctx, { outcome: "refused", via: "device-totp", code: "not-enrolled" });
    throw new SecondFactorError(
      "not-enrolled",
      "the bound Enclaweder has no authenticator enrolled; with an Enclaweder, every launch needs a code the device checks. Enroll the authenticator on the device first",
    );
  }
  if (!ctx.readCode) {
    throw new SecondFactorError(
      "no-device",
      "a launch with an Enclaweder needs an authenticator code the device checks, and this launch has no way to ask for one",
    );
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    let code = "";
    try {
      code = (await ctx.readCode(`${factor.label}: `)).trim();
    } catch {
      code = "";
    }
    const v = await factor
      .verify({ purpose: "session-start", code })
      .catch(() => ({ ok: false as const, code: "device-error" }));
    if (v.ok) {
      await auditDevice(ctx, { outcome: "verified", via: "device-totp", ...totpFacts(factor) });
      return { ...r, device: "device-totp" };
    }
    await auditDevice(ctx, { outcome: "refused", via: "device-totp", code: v.code, attempt });
  }
  throw new SecondFactorError(
    "verification-failed",
    "the Enclaweder did not accept the authenticator code; not starting",
  );
}

// ─── Hardware-root binding ──────────────────────────────────────────────

export type HardwareBinding = Readonly<{
  /** What is bound (serial and key, never secrets), for the session-start record. */
  info: ReturnType<typeof hardwareRootInfo>;
  /** The per-call gate the engine uses (cached state only, never the device). */
  gate: (tool: string, actor: string) => HardwareGateDecision;
  close(): Promise<void>;
}>;

/** Bind the machine's hardware root for a launch (the framework's own boot), and give the engine its gate. */
export async function bindHardwareRoot(): Promise<HardwareBinding> {
  await bootHardwareRoot();
  return {
    info: hardwareRootInfo(),
    gate: (tool, actor) => checkHardwareRootForToolCall(tool, { agentId: actor }),
    close: () => closeHardwareRootSessionAsync(),
  };
}

// ─── Containment policy ─────────────────────────────────────────────────

/**
 * The nets that keep every process the host session starts findable at a
 * halt. A process that double-forks with setsid leaves the host's process
 * tree, so the tree seen at the halt is not enough. The adapter (or a shared
 * launcher helper) implements them; this says which hold and what is lost.
 */
export type ContainmentNets = Readonly<{
  /** The host is its own child subreaper: every orphan in its subtree stays its descendant. */
  subreaper: boolean;
  /** The host runs in its own cgroup scope: membership is inherited and cannot be left without privilege. */
  scope: boolean;
  /** A random marker in the host's environment (and scope): a halt also kills every process of this user carrying it. */
  marker: boolean;
  /** The launcher kills its own children that started after the host. */
  launcherChildren: boolean;
}>;

export type ContainmentAssessment = Readonly<{
  /** What the person must be told at the start of the session, in plain words (empty when nothing is lost). */
  warnings: readonly string[];
  /** A process that clears its environment after leaving the tree can escape a halt. */
  envClearingEscapes: boolean;
}>;

export function assessContainment(n: ContainmentNets): ContainmentAssessment {
  const warnings: string[] = [];
  const envClearingEscapes = !n.subreaper && !n.scope;
  if (envClearingEscapes) {
    warnings.push(
      "this session runs without a subreaper or a cgroup scope: a program the agent starts that leaves the session's process tree and clears its environment would keep running after a halt",
    );
  }
  if (!n.marker) {
    warnings.push(
      "this session's processes carry no session marker; a halt finds only the process tree and the scope",
    );
  }
  return { warnings, envClearingEscapes };
}

export type HaltNetsDecision =
  | Readonly<{ action: "start" }>
  | Readonly<{ action: "start-reduced"; message: string }>
  | Readonly<{ action: "refuse"; code: "no-containment"; message: string }>;

/**
 * May a hardware-root session whose halt erases the host's login start with
 * the process nets it has? A halt kills every process of the session before it
 * erases the login; with none of a cgroup scope, a subreaper or process
 * tracking, a process that left the host's tree and cleared its environment is
 * not found, and could write the login back. Refused unless an administrator
 * accepted that (the root-owned reducedContainment grant); then it starts with
 * the warning. No hardware root, or no erase on a halt: nothing to decide.
 */
export function decideHaltNets(
  o: Readonly<{
    hardwareRoot: boolean;
    eraseOnHalt: boolean;
    nets: Readonly<{ scope: boolean; subreaper: boolean; tracked: boolean }>;
    reducedContainmentGranted: boolean;
  }>,
): HaltNetsDecision {
  if (!o.hardwareRoot || !o.eraseOnHalt || o.nets.scope || o.nets.subreaper || o.nets.tracked) {
    return { action: "start" };
  }
  const message =
    "neither a cgroup scope nor a subreaper nor process tracking is available: on a hardware halt, a process of the session that left the host's process tree and cleared its environment cannot be found and killed before the login is erased";
  return o.reducedContainmentGranted
    ? { action: "start-reduced", message }
    : { action: "refuse", code: "no-containment", message };
}

/** The halt order. Each step must finish before the next; the login is erased only after `verify` found nothing left. */
export const HALT_SEQUENCE = Object.freeze([
  "pause-host",
  "freeze-and-kill-subtree",
  "kill-scope",
  "kill-marked",
  "kill-late-launcher-children",
  "kill-host",
  "verify-nothing-left",
  "erase-credentials",
] as const);
export type HaltStep = (typeof HALT_SEQUENCE)[number];

/**
 * After the kill rounds: may the login be erased now? Only when nothing is
 * left (zombies cannot run). Otherwise the survivors are listed for the
 * record and the person is told the erase may be undone by one of them.
 */
export function haltOutcome(survivors: readonly { pid: number; zombie: boolean }[]): {
  eraseNow: boolean;
  survivors: number[];
  message: string | null;
} {
  const live = survivors
    .filter((s) => !s.zombie)
    .map((s) => s.pid)
    .toSorted((a, b) => a - b);
  if (live.length === 0) {
    return { eraseNow: true, survivors: [], message: null };
  }
  return {
    eraseNow: true,
    survivors: live,
    message: `${live.length} process${live.length === 1 ? "" : "es"} of the session could not be stopped (${live.slice(0, 10).join(", ")}); the login is erased anyway, but one of them could write it back`,
  };
}

// ─── Credential erase ───────────────────────────────────────────────────

/**
 * Where the host keeps its login (host specific: the adapter resolves it
 * from the LAUNCHER's environment, never from a settings file's env).
 */
export type CredentialLocations = Readonly<{
  files: readonly string[];
  /** Platform stores (a keychain item) the adapter erases itself. */
  platform?: Readonly<{ erase(): { erased: string[]; remaining: string[] } }>;
}>;

/**
 * Erase the host's login after a hardware halt, so only an authorized person
 * brings the session back, then verify. Limits, said plainly: an overwrite is
 * not guaranteed to reach old blocks on SSDs and copy-on-write filesystems,
 * and erasing the local copy does not revoke the token at the provider.
 */
export function eraseCredentials(loc: CredentialLocations): {
  erased: string[];
  remaining: string[];
} {
  const erased: string[] = [];
  const remaining: string[] = [];
  for (const file of loc.files) {
    let st: fs.Stats | null = null;
    try {
      st = fs.lstatSync(file);
    } catch {
      st = null;
    }
    if (st) {
      if (st.isFile()) {
        try {
          const fd = fs.openSync(file, "r+");
          try {
            const n = Math.max(st.size, 1);
            fs.writeSync(fd, randomBytes(n), 0, n, 0);
            fs.fsyncSync(fd);
          } finally {
            fs.closeSync(fd);
          }
        } catch {
          /* removal below still matters */
        }
      }
      fs.rmSync(file, { force: true });
      erased.push(`file ${file}`);
    }
    if (fs.existsSync(file)) {
      remaining.push(`file ${file}`);
    }
  }
  if (loc.platform) {
    const p = loc.platform.erase();
    erased.push(...p.erased);
    remaining.push(...p.remaining);
  }
  return { erased, remaining };
}

// ─── The interface a launcher implements ────────────────────────────────

/**
 * What an adapter's launcher does around the host process. The kit provides
 * every generic step above; the adapter fills in the host-specific ones.
 */
export interface LaunchServices {
  /** Host specific: write the host's settings/hook configuration for this one session (R3). */
  writeSessionSettings(sessionDir: string): Promise<{ files: string[] }>;
  /** Host specific: start the host with the scrubbed environment and the containment nets. */
  spawnHost(
    env: Readonly<Record<string, string | undefined>>,
  ): Promise<{ pid: number; nets: ContainmentNets }>;
  /** Host specific: run the halt steps in HALT_SEQUENCE order; returns what survived. */
  haltHost(): Promise<readonly { pid: number; zombie: boolean }[]>;
  /** Host specific: where the host keeps its login. */
  credentialLocations(): CredentialLocations;
}

// ─── Contained launches ─────────────────────────────────────────────────

/**
 * Launch an MCP server or a project script through the containment seam.
 * Absent containment (no seam, or the machine cannot contain): refused,
 * never started bare.
 */
export async function launchContained(
  containment: LaunchContainment | null | undefined,
  spec: ContainedLaunch,
): Promise<ContainmentOutcome> {
  if (!containment) {
    return {
      ok: false,
      code: "not-contained",
      reason: `${spec.label} is not started: this session has no containment for what it launches`,
    };
  }
  let a: { ok: boolean; reason: string | null };
  try {
    a = containment.available();
  } catch (err) {
    a = { ok: false, reason: (err as Error)?.message ?? String(err) };
  }
  if (!a.ok) {
    return {
      ok: false,
      code: "not-contained",
      reason: `${spec.label} is not started: this machine cannot contain it (${a.reason ?? "no reason given"})`,
    };
  }
  try {
    return await containment.launch(spec);
  } catch (err) {
    return {
      ok: false,
      code: "containment-failed",
      reason: `${spec.label} is not started: its containment could not be built (${(err as Error)?.message ?? err})`,
    };
  }
}
