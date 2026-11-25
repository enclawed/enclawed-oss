// The mandatory second factor. Every gated operation (starting a session,
// policy changes, recovery and re-baselining, disabling a protection,
// restoring protected history, operator and admin commands) calls
// `assertSecondFactor` and proceeds only when it returns.
//
// Accepted factors:
//   - software-only (no Enclaweder): a roaming FIDO2 authenticator (a
//     hardware security key) with user verification (PIN or on-key
//     biometric) and user presence on every assertion; or a DEVICE-BOUND
//     platform passkey whose key never leaves the device's secure hardware
//     (Windows Hello on a TPM, Apple's or Android's secure hardware),
//     proven at enrollment by the vendor's attestation chained to its
//     pinned root, with the same UP, UV and counter rules, run through a
//     one-time loopback page in the person's browser (passkey.ts). The host
//     holds only the credential's public key and id. Nothing else
//     qualifies: not a synced passkey (backup-eligible: its key is copied to
//     a vendor cloud), not a platform credential without a hardware
//     attestation, not TOTP (its shared secret would live on this
//     computer), not a sudo/OS password or a passphrase;
//   - with an Enclaweder bound (enclawed-enclaved only): additionally a TOTP
//     code that the DEVICE verifies against a secret only the device holds,
//     supplied as `deviceFactor`. The open core never constructs one.
//
// There is no bypass: no environment variable, flag, config key, dev mode or
// grace period skips the check, and an install with nothing enrolled is
// refused with enrollment instructions. A headless start (no terminal) is
// admitted only for `session-start`, and only by an unlock ticket issued by
// an interactive assertion (ticket.ts). Every success and every failure is
// appended to the hash-chained audit log, never with a secret; when the audit
// log cannot be written the operation is refused.

import { randomBytes } from "node:crypto";
import { CLOCK_DISAGREES_TEXT } from "../hardware-root/clock-disagrees-text.js";
import { getRuntime } from "../runtime.js";
import { CborError, unwrapCborByteString } from "./cbor.js";
import { type AuthConfig, AuthConfigError, loadAuthConfig } from "./config.js";
import {
  type Fido2DeviceInfo,
  type Fido2Transport,
  INSTALL_HINT,
  TransportError,
  createLibfido2Transport,
  deviceRefusal,
} from "./libfido2.js";
import {
  CeremonyError,
  type LoopbackCeremonyResult,
  PASSKEY_RP_ID,
  isLoopbackOrigin,
} from "./loopback-ceremony.js";
import {
  type PasskeyCeremony,
  PasskeyUnavailableError,
  loopbackPasskeyCeremony,
} from "./passkey.js";
import {
  AuthLockError,
  type AuthStore,
  type EnrolledCredential,
  authStateDir,
  credentialKind,
  readAuthStore,
  withAuthLock,
  writeAuthStore,
} from "./store.js";
import {
  TICKET_MAX_USES,
  type TicketBody,
  type UnlockTicket,
  consumeTicket,
  currentBinding,
  newTicketBody,
  readTicket,
  revokeTicket,
  ticketChallenge,
  ticketDigest,
  ticketMinutes,
  ticketSignatureValid,
  writeSignedTicket,
} from "./ticket.js";
import { readLineFromTty } from "./tty.js";
import {
  WebAuthnError,
  b64url,
  decodeAttestationObject,
  fromB64url,
  sha256,
  tpmCounterExemptionHolds,
  verifyAssertion,
  verifyClientData,
  verifyRegistration,
} from "./webauthn.js";

export const DEFAULT_RP_ID = "enclawed.local";
export const CHALLENGE_TTL_MS = 120_000;
const FREE_FAILURES = 5;
const MAX_LOCKOUT_MS = 3_600_000;

export type AuthPurpose =
  | "session-start"
  | "policy-change"
  | "recovery"
  | "disable-protection"
  | "history-restore"
  | "admin"
  | "auth-change"
  | "auth-test"
  | "unlock";

export type SecondFactorErrorCode =
  | "not-enrolled"
  | "headless"
  | "no-ticket"
  | "backoff"
  | "no-device"
  | "device-refused"
  | "unknown-key"
  | "verification-failed"
  | "challenge-expired"
  | "tools-missing"
  | "config-invalid"
  | "store-invalid"
  | "audit-unavailable"
  | "last-factor"
  | "no-such-factor"
  | "ambiguous-device"
  | "unbindable-platform"
  | "busy"
  | "internal-error";

export class SecondFactorError extends Error {
  constructor(
    readonly code: SecondFactorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SecondFactorError";
  }
}

export type AuthAuditEvent = { type: string; payload: Record<string, unknown> };
export type AuthAuditSink = (event: AuthAuditEvent) => Promise<void>;

/**
 * A second factor verified by a bound Enclaweder (enclawed-enclaved): the
 * device, not this host, checks the code against a secret only it holds.
 */
export type DeviceSecondFactor = {
  kind: "device-totp";
  label: string;
  enrolled(): Promise<boolean>;
  verify(params: {
    purpose: AuthPurpose;
    code: string;
  }): Promise<{ ok: true } | { ok: false; code: string }>;
};

export type AuthContext = {
  env?: NodeJS.ProcessEnv;
  /** Root state dir; the factor store lives in <stateDir>/auth. */
  stateDir?: string;
  rpId?: string;
  transport?: Fido2Transport;
  /** Runs a platform passkey ceremony (default: the one-time loopback page in the browser). */
  passkey?: PasskeyCeremony;
  audit?: AuthAuditSink;
  now?: () => number;
  interactive?: boolean;
  config?: AuthConfig;
  deviceFactor?: DeviceSecondFactor | null;
  /** Prompt for a device-verified code (TOTP); interactive only. */
  readCode?: (prompt: string) => Promise<string>;
  /** Progress lines for the person at the terminal (stderr by default). */
  say?: (line: string) => void;
  /** How long to wait for another check's lock before refusing (default 120 s). */
  lockWaitMs?: number;
};

export type SecondFactorResult = {
  via: "fido2" | "passkey" | "ticket" | "device-totp";
  credential: string | null;
  /** For a headless start: the ticket that was presented (its body digest and its credential id). */
  ticket?: { digest: string; credentialId: string };
};

export const ENROLL_INSTRUCTIONS = [
  "Enclawed requires two-factor authentication, and no second factor is enrolled on this install.",
  "Enroll a FIDO2 security key with a PIN (for example a YubiKey 5 or a Google Titan key):",
  "  1. install libfido2's tools (" + INSTALL_HINT + ")",
  "  2. set a PIN on the key if it has none: fido2-token -S <device from fido2-token -L>",
  "  3. enclawed auth enroll --label primary",
  "  4. enroll a second key as a backup: enclawed auth enroll --label backup",
  "Or enroll this computer's device-bound passkey (Windows Hello with a TPM, or Apple's or Android's secure hardware):",
  "  enclawed auth enroll --passkey --label laptop",
  "See docs/security/two-factor.md.",
].join("\n");

function isInteractiveDefault(): boolean {
  return process.stdin.isTTY && process.stderr.isTTY;
}

function defaultAudit(): AuthAuditSink {
  return async (event) => {
    const runtime = getRuntime();
    if (!runtime) {
      throw new SecondFactorError("audit-unavailable", "the enclawed audit log is not open");
    }
    await runtime.audit.append({
      type: event.type,
      actor: "operator",
      level: null,
      payload: event.payload,
    });
  };
}

type Resolved = {
  env: NodeJS.ProcessEnv;
  dir: string;
  rpId: string;
  origin: string;
  transport: Fido2Transport;
  passkey: PasskeyCeremony;
  audit: AuthAuditSink;
  now: () => number;
  interactive: boolean;
  deviceFactor: DeviceSecondFactor | null;
  readCode?: (prompt: string) => Promise<string>;
  say: (line: string) => void;
  lockWaitMs: number | undefined;
  config: () => AuthConfig;
};

function resolve(ctx: AuthContext): Resolved {
  const env = ctx.env ?? process.env;
  const rpId = ctx.rpId ?? DEFAULT_RP_ID;
  return {
    env,
    dir: authStateDir(env, ctx.stateDir),
    rpId,
    origin: `enclawed-cli://${rpId}`,
    transport: ctx.transport ?? createLibfido2Transport({ env }),
    passkey: ctx.passkey ?? loopbackPasskeyCeremony({ timeoutMs: CHALLENGE_TTL_MS }),
    audit: ctx.audit ?? defaultAudit(),
    now: ctx.now ?? Date.now,
    interactive: ctx.interactive ?? isInteractiveDefault(),
    deviceFactor: ctx.deviceFactor ?? null,
    readCode: ctx.readCode ?? readLineFromTty,
    say: ctx.say ?? ((line) => process.stderr.write(`${line}\n`)),
    lockWaitMs: ctx.lockWaitMs,
    config: () => {
      try {
        return ctx.config ?? loadAuthConfig(env);
      } catch (err) {
        throw new SecondFactorError(
          "config-invalid",
          `enclawed.auth is invalid (${err instanceof AuthConfigError ? err.message : String(err)}); fix it before anything gated can run`,
        );
      }
    },
  };
}

function credentialRef(c: EnrolledCredential): Record<string, unknown> {
  return { credential: c.id, label: c.label, aaguid: c.aaguid, kind: credentialKind(c) };
}

const securityKeys = (s: AuthStore) =>
  s.credentials.filter((c) => credentialKind(c) === "security-key");
const passkeys = (s: AuthStore) => s.credentials.filter((c) => credentialKind(c) === "passkey");

async function record(r: Resolved, type: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await r.audit({ type, payload });
  } catch (err) {
    if (err instanceof SecondFactorError) {
      throw err;
    }
    throw new SecondFactorError("audit-unavailable", `cannot write the audit log: ${String(err)}`);
  }
}

// Errors whose refusal is already in the audit log. Every public operation
// runs inside `guarded`, which audits any failure not yet recorded (a lock
// that cannot be taken, a store that cannot be read or written, an
// unexpected exception) before rethrowing it: no failed attempt goes
// unlogged, and every failure refuses.
const AUDITED = new WeakSet<object>();

function markAudited<E extends object>(err: E): E {
  AUDITED.add(err);
  return err;
}

async function guarded<T>(
  r: Resolved,
  type: string,
  base: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err && typeof err === "object" && AUDITED.has(err)) {
      throw err;
    }
    if (err instanceof SecondFactorError && err.code === "audit-unavailable") {
      throw err;
    }
    const sfe =
      err instanceof SecondFactorError
        ? err
        : new SecondFactorError(
            err instanceof AuthLockError ? "busy" : "internal-error",
            `second-factor check refused: ${err instanceof Error ? err.message : String(err)}`,
          );
    await record(r, type, {
      ...base,
      outcome: "refused",
      code: failureCode(err) === "error" ? sfe.code : failureCode(err),
    });
    throw markAudited(sfe);
  }
}

/** Count a failure toward the lockout; never throws (a store that cannot be written reports null). */
async function countFailure(r: Resolved): Promise<{ failures: number | null }> {
  try {
    const next = await bumpFailures(r, loadStore(r));
    return { failures: next.failures };
  } catch {
    return { failures: null };
  }
}

function loadStore(r: Resolved): AuthStore {
  try {
    return readAuthStore(r.dir, r.rpId);
  } catch (err) {
    throw new SecondFactorError(
      "store-invalid",
      `the second-factor store is unreadable: ${String(err)}`,
    );
  }
}

type Located = { device: Fido2DeviceInfo; credential: EnrolledCredential };

/** Find a plugged-in, acceptable authenticator that holds one of the enrolled credentials. */
function locateEnrolledKey(r: Resolved, store: AuthStore): Located | SecondFactorError {
  let devices: Fido2DeviceInfo[];
  try {
    devices = r.transport.listDevices();
  } catch (err) {
    return new SecondFactorError(
      err instanceof TransportError && err.code === "tools-missing" ? "tools-missing" : "no-device",
      String(err instanceof Error ? err.message : err),
    );
  }
  const refusals: string[] = [];
  const usable = devices.filter((d) => {
    const why = deviceRefusal(d);
    if (why) {
      refusals.push(why.message);
    }
    return !why;
  });
  if (usable.length === 0) {
    return new SecondFactorError(
      refusals.length > 0 ? "device-refused" : "no-device",
      refusals.length > 0
        ? `no acceptable security key: ${refusals.join("; ")}`
        : "no FIDO2 security key is plugged in; insert an enrolled key",
    );
  }
  for (const device of usable) {
    for (const credential of securityKeys(store)) {
      if (
        r.transport.hasCredential({
          device,
          rpId: r.rpId,
          credentialId: fromB64url(credential.credentialId),
        })
      ) {
        return { device, credential };
      }
    }
  }
  return new SecondFactorError(
    "unknown-key",
    "the security key plugged in is not enrolled on this install",
  );
}

function failureCode(err: unknown): string {
  if (
    err instanceof WebAuthnError ||
    err instanceof TransportError ||
    err instanceof SecondFactorError ||
    err instanceof AuthLockError ||
    err instanceof CeremonyError ||
    err instanceof PasskeyUnavailableError
  ) {
    return err.code;
  }
  if (err instanceof CborError) {
    return "bad-authdata";
  }
  return "error";
}

type CeremonyResult = {
  signCount: number;
  clientDataJSON: Uint8Array;
  authDataRaw: Uint8Array;
  signature: Uint8Array;
};

/**
 * One interactive FIDO2 assertion against an enrolled credential. The
 * challenge is fresh random bytes, or (for an unlock ticket) the hash of the
 * ticket body the key is asked to sign.
 */
function fido2Ceremony(
  r: Resolved,
  located: Located,
  challenge: Uint8Array = randomBytes(32),
): CeremonyResult {
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge: b64url(challenge),
      origin: r.origin,
      crossOrigin: false,
    }),
  );
  const clientDataHash = verifyClientData(clientDataJSON, {
    type: "webauthn.get",
    challenge,
    origin: r.origin,
  });
  const issuedAt = performance.now();
  r.say(`Touch your security key (${located.credential.label}) and enter its PIN when asked.`);
  const got = r.transport.getAssertion({
    device: located.device,
    clientDataHash,
    rpId: r.rpId,
    credentialId: fromB64url(located.credential.credentialId),
  });
  if (performance.now() - issuedAt > CHALLENGE_TTL_MS) {
    throw new SecondFactorError(
      "challenge-expired",
      "the challenge expired before the key answered",
    );
  }
  if (
    got.rpId !== r.rpId ||
    Buffer.compare(Buffer.from(got.clientDataHash), Buffer.from(clientDataHash)) !== 0
  ) {
    throw new WebAuthnError(
      "client-data-hash-mismatch",
      "the authenticator answered a different challenge",
    );
  }
  const authDataRaw = unwrapCborByteString(got.authDataCbor);
  // The signature is checked over OUR client data hash, never the echoed one.
  const result = verifyAssertion({
    rpId: r.rpId,
    clientDataHash,
    authDataRaw,
    signature: got.sig,
    credentialPublicKey: fromB64url(located.credential.publicKeyCose),
    storedSignCount: located.credential.signCount,
  });
  return { signCount: result.signCount, clientDataJSON, authDataRaw, signature: got.sig };
}

/** The passkey a ticket is signed with: the most recently used (or enrolled) one. */
function ticketPasskey(store: AuthStore): EnrolledCredential | null {
  const list = passkeys(store);
  if (list.length === 0) {
    return null;
  }
  return list.reduce((a, b) =>
    (b.lastUsedAt ?? b.enrolledAt) > (a.lastUsedAt ?? a.enrolledAt) ? b : a,
  );
}

/**
 * The counter rule for a stored passkey: the TPM exemption only when its stored registration
 * still proves a non-exportable TPM key for this very credential; a store that claims the
 * exemption without that proof is refused outright (tampering).
 */
export function storedCounterPolicy(c: EnrolledCredential): "strict" | "tpm-non-exportable" {
  if (c.counterPolicy === undefined) {
    return "strict";
  }
  if (
    c.counterPolicy === "tpm-non-exportable" &&
    tpmCounterExemptionHolds({
      rpId: PASSKEY_RP_ID,
      credentialId: fromB64url(c.credentialId),
      publicKeyCose: fromB64url(c.publicKeyCose),
      evidence: c.tpmCounterEvidence,
      enrolledAt: c.enrolledAt,
    })
  ) {
    return "tpm-non-exportable";
  }
  throw new WebAuthnError(
    "attestation-invalid",
    "the stored counter exemption is not backed by a verified TPM attestation of this passkey",
  );
}

/** Accept a loopback ceremony's answer only from a loopback page, for the ceremony asked. */
function checkCeremonyAnswer(res: LoopbackCeremonyResult, kind: "create" | "get"): void {
  if (res.kind !== kind || !isLoopbackOrigin(res.origin)) {
    throw new WebAuthnError(
      "origin-mismatch",
      "the passkey answer did not come from a loopback page",
    );
  }
}

/**
 * One passkey assertion through the loopback page: a fresh challenge (or a
 * ticket body's hash), verified exactly like a security key's assertion
 * (UP, UV, not backup-eligible, signature, strictly increasing counter)
 * under the RP ID "localhost" and the page's exact origin.
 */
async function passkeyCeremony(
  r: Resolved,
  candidates: EnrolledCredential[],
  purpose: string,
  challenge: Uint8Array = randomBytes(32),
): Promise<{ credential: EnrolledCredential; ceremony: CeremonyResult }> {
  const issuedAt = performance.now();
  const res = await r.passkey(
    {
      kind: "get",
      challenge,
      allowCredentialIds: candidates.map((c) => fromB64url(c.credentialId)),
      title: `Confirm: ${purpose}`,
    },
    r.say,
  );
  if (performance.now() - issuedAt > CHALLENGE_TTL_MS) {
    throw new SecondFactorError(
      "challenge-expired",
      "the challenge expired before the passkey answered",
    );
  }
  checkCeremonyAnswer(res, "get");
  const credential = candidates.find(
    (c) =>
      Buffer.compare(Buffer.from(fromB64url(c.credentialId)), Buffer.from(res.credentialId)) === 0,
  );
  if (!credential) {
    throw new SecondFactorError("unknown-key", "the passkey used is not enrolled on this install");
  }
  if (!res.authenticatorData || !res.signature) {
    throw new WebAuthnError(
      "bad-authdata",
      "the passkey answer lacks authenticator data or a signature",
    );
  }
  const clientDataHash = verifyClientData(res.clientDataJSON, {
    type: "webauthn.get",
    challenge,
    origin: res.origin,
  });
  const result = verifyAssertion({
    rpId: PASSKEY_RP_ID,
    clientDataHash,
    authDataRaw: res.authenticatorData,
    signature: res.signature,
    credentialPublicKey: fromB64url(credential.publicKeyCose),
    storedSignCount: credential.signCount,
    counterPolicy: storedCounterPolicy(credential),
  });
  return {
    credential,
    ceremony: {
      signCount: result.signCount,
      clientDataJSON: res.clientDataJSON,
      authDataRaw: res.authenticatorData,
      signature: res.signature,
    },
  };
}

async function bumpFailures(r: Resolved, store: AuthStore): Promise<AuthStore> {
  const failures = store.failures + 1;
  const lockedUntil =
    failures >= FREE_FAILURES
      ? r.now() + Math.min(MAX_LOCKOUT_MS, 30_000 * 2 ** (failures - FREE_FAILURES))
      : store.lockedUntil;
  const next = { ...store, failures, lockedUntil };
  writeAuthStore(r.dir, next);
  return next;
}

/**
 * The gate. Resolves when the person proved both factors (or, for a
 * headless session start, presented a valid unlock ticket); throws
 * SecondFactorError otherwise. Audits every outcome.
 */
export async function assertSecondFactor(
  ctx: AuthContext,
  op: { purpose: AuthPurpose; detail?: string; allowTicket?: boolean },
): Promise<SecondFactorResult> {
  const { via, credential, ticket } = await runGate(ctx, op, null);
  return { via, credential, ...(ticket ? { ticket } : {}) };
}

type TicketSigning = {
  /** Build the ticket body for the located credential; its hash becomes the challenge. */
  body: (credential: EnrolledCredential) => TicketBody;
};

type GateOutcome = SecondFactorResult & {
  signedTicket?: { body: TicketBody; ceremony: CeremonyResult };
};

async function runGate(
  ctx: AuthContext,
  op: { purpose: AuthPurpose; detail?: string; allowTicket?: boolean },
  signing: TicketSigning | null,
): Promise<GateOutcome> {
  const r = resolve(ctx);
  const base = { purpose: op.purpose, ...(op.detail ? { detail: op.detail } : {}) };
  return guarded(r, "auth.second-factor", base, () => runGateChecked(r, base, op, signing));
}

async function runGateChecked(
  r: Resolved,
  base: Record<string, unknown>,
  op: { purpose: AuthPurpose; detail?: string; allowTicket?: boolean },
  signing: TicketSigning | null,
): Promise<GateOutcome> {
  const refuse = async (
    err: SecondFactorError,
    extra: Record<string, unknown> = {},
  ): Promise<never> => {
    await record(r, "auth.second-factor", {
      ...base,
      outcome: "refused",
      code: err.code,
      ...extra,
    });
    throw markAudited(err);
  };
  // A broken `enclawed.auth` block never fails open: validate it first.
  try {
    r.config();
  } catch (err) {
    return refuse(err as SecondFactorError);
  }
  return withAuthLock(r.dir, r.lockWaitMs, async () => {
    let store: AuthStore;
    try {
      store = loadStore(r);
    } catch (err) {
      return refuse(err as SecondFactorError);
    }
    const deviceEnrolled = r.deviceFactor
      ? await r.deviceFactor.enrolled().catch(() => false)
      : false;
    if (store.credentials.length === 0 && !deviceEnrolled) {
      return refuse(new SecondFactorError("not-enrolled", ENROLL_INSTRUCTIONS));
    }
    if (store.lockedUntil !== null && r.now() < store.lockedUntil) {
      return refuse(
        new SecondFactorError(
          "backoff",
          `too many failed second-factor attempts; try again after ${new Date(store.lockedUntil).toISOString()}`,
        ),
        { failures: store.failures },
      );
    }

    if (!r.interactive) {
      if (op.purpose !== "session-start" || op.allowTicket === false) {
        return refuse(
          new SecondFactorError(
            "headless",
            `${op.purpose} needs a person at a terminal with an enrolled security key; unlock tickets cover session starts only`,
          ),
        );
      }
      const binding = currentBinding();
      const spent = consumeTicket({
        dir: r.dir,
        binding,
        now: r.now(),
        rpId: r.rpId,
        origin: r.origin,
        credentials: store.credentials,
      });
      if (!spent.ok) {
        return refuse(
          new SecondFactorError(
            spent.reason === "unbindable-platform" ? "unbindable-platform" : "no-ticket",
            spent.reason === "unbindable-platform"
              ? "this platform exposes no boot id, so a headless start cannot be bound to this boot; start interactively"
              : `no valid unlock ticket (${spent.reason}); a person must run: enclawed auth unlock`,
          ),
          { ticket: spent.reason },
        );
      }
      await record(r, "auth.second-factor", {
        ...base,
        outcome: "verified",
        via: "ticket",
        credential: spent.ticket.credential,
        ticketExpiresAt: spent.ticket.expiresAt,
        ticketUsesLeft: spent.ticket.usesLeft,
      });
      return {
        via: "ticket",
        credential: spent.ticket.credential,
        ticket: { digest: ticketDigest(spent.ticket), credentialId: spent.ticket.credentialId },
      };
    }

    // Interactive: a FIDO2 key that is plugged in, else an enrolled passkey,
    // else the device-verified code.
    const located = securityKeys(store).length > 0 ? locateEnrolledKey(r, store) : null;
    if (located && !(located instanceof SecondFactorError)) {
      try {
        const ticketBody = signing ? signing.body(located.credential) : null;
        const ceremony = fido2Ceremony(
          r,
          located,
          ticketBody ? ticketChallenge(ticketBody) : undefined,
        );
        const signCount = ceremony.signCount;
        const fresh = loadStore(r);
        const credentials = fresh.credentials.map((c) =>
          c.id === located.credential.id ? { ...c, signCount, lastUsedAt: r.now() } : c,
        );
        writeAuthStore(r.dir, { ...fresh, credentials, failures: 0, lockedUntil: null });
        await record(r, "auth.second-factor", {
          ...base,
          outcome: "verified",
          via: "fido2",
          ...credentialRef(located.credential),
          signCount,
        });
        return {
          via: "fido2",
          credential: located.credential.id,
          ...(ticketBody ? { signedTicket: { body: ticketBody, ceremony } } : {}),
        };
      } catch (err) {
        if (err instanceof SecondFactorError && err.code === "audit-unavailable") {
          throw err;
        }
        const { failures } = await countFailure(r);
        await record(r, "auth.second-factor", {
          ...base,
          outcome: "refused",
          via: "fido2",
          code: failureCode(err),
          ...credentialRef(located.credential),
          failures,
        });
        throw markAudited(
          new SecondFactorError(
            "verification-failed",
            `second-factor verification failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    }
    let passkeyUnavailable: SecondFactorError | null = null;
    if (passkeys(store).length > 0) {
      const signer = signing ? ticketPasskey(store) : null;
      const ticketBody = signing && signer ? signing.body(signer) : null;
      try {
        const done = await passkeyCeremony(
          r,
          signer ? [signer] : passkeys(store),
          op.detail ? `${op.purpose} (${op.detail})` : op.purpose,
          ticketBody ? ticketChallenge(ticketBody) : undefined,
        );
        const signCount = done.ceremony.signCount;
        const fresh = loadStore(r);
        const credentials = fresh.credentials.map((c) =>
          c.id === done.credential.id ? { ...c, signCount, lastUsedAt: r.now() } : c,
        );
        writeAuthStore(r.dir, { ...fresh, credentials, failures: 0, lockedUntil: null });
        await record(r, "auth.second-factor", {
          ...base,
          outcome: "verified",
          via: "passkey",
          ...credentialRef(done.credential),
          signCount,
        });
        return {
          via: "passkey",
          credential: done.credential.id,
          ...(ticketBody ? { signedTicket: { body: ticketBody, ceremony: done.ceremony } } : {}),
        };
      } catch (err) {
        if (err instanceof SecondFactorError && err.code === "audit-unavailable") {
          throw err;
        }
        if (err instanceof PasskeyUnavailableError) {
          // No browser can reach the page: not an attempt. The device code may still be used.
          passkeyUnavailable = new SecondFactorError("no-device", err.message);
        } else {
          const { failures } = await countFailure(r);
          await record(r, "auth.second-factor", {
            ...base,
            outcome: "refused",
            via: "passkey",
            code: failureCode(err),
            failures,
          });
          throw markAudited(
            new SecondFactorError(
              "verification-failed",
              `second-factor verification failed: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        }
      }
    }
    if (signing) {
      // A ticket must be signed by an enrolled security key or passkey; a code cannot sign it.
      return refuse(
        located instanceof SecondFactorError
          ? located
          : (passkeyUnavailable ??
              new SecondFactorError(
                "no-device",
                "an unlock ticket must be signed by an enrolled FIDO2 security key or passkey",
              )),
      );
    }
    if (deviceEnrolled && r.deviceFactor && r.readCode) {
      // A cancelled prompt or a device that errors is a failed attempt like a wrong code.
      let verdict: { ok: true } | { ok: false; code: string };
      try {
        const code = (await r.readCode(`${r.deviceFactor.label}: `)).trim();
        try {
          verdict = await r.deviceFactor.verify({ purpose: op.purpose, code });
        } catch {
          verdict = { ok: false, code: "device-error" };
        }
      } catch {
        verdict = { ok: false, code: "cancelled" };
      }
      if (verdict.ok) {
        writeAuthStore(r.dir, { ...loadStore(r), failures: 0, lockedUntil: null });
        await record(r, "auth.second-factor", { ...base, outcome: "verified", via: "device-totp" });
        return { via: "device-totp", credential: null };
      }
      const { failures } = await countFailure(r);
      await record(r, "auth.second-factor", {
        ...base,
        outcome: "refused",
        via: "device-totp",
        code: verdict.code,
        failures,
      });
      throw markAudited(
        new SecondFactorError(
          "verification-failed",
          verdict.code === "clock-disagrees"
            ? // Enclaweder command set 0.6 (ERR_TIME): the code may well be right; the clocks are not.
              CLOCK_DISAGREES_TEXT
            : "the device refused the code",
        ),
      );
    }
    return refuse(
      passkeyUnavailable ??
        (located instanceof SecondFactorError
          ? located
          : new SecondFactorError("no-device", "no enrolled second factor is available")),
    );
  });
}

// ─── Enrollment, removal, unlock, status ─────────────────────────────────

export type EnrollResult = { credential: EnrolledCredential; total: number };

export async function enrollSecurityKey(
  ctx: AuthContext,
  opts: { label: string; alg?: "es256" | "eddsa" },
): Promise<EnrollResult> {
  const r = resolve(ctx);
  return guarded(r, "auth.enroll", { label: opts.label }, async () => {
    const label = opts.label.trim();
    if (!/^[\w .@-]{1,64}$/.test(label)) {
      throw new SecondFactorError(
        "no-such-factor",
        "a label is 1-64 letters, digits, spaces or . _ @ -",
      );
    }
    const fail = async (code: string, err: SecondFactorError | Error): Promise<never> => {
      await record(r, "auth.enroll", { outcome: "refused", code, label });
      throw markAudited(
        err instanceof SecondFactorError
          ? err
          : new SecondFactorError("verification-failed", `enrollment refused: ${err.message}`),
      );
    };
    if (!r.interactive) {
      return fail(
        "headless",
        new SecondFactorError(
          "headless",
          "enrolling a security key needs a person at the terminal",
        ),
      );
    }
    const config = r.config();
    await proveExistingFactor(ctx, r, label);
    return withAuthLock(r.dir, r.lockWaitMs, async () => {
      const store = loadStore(r);
      let devices: Fido2DeviceInfo[];
      try {
        devices = r.transport.listDevices();
      } catch (err) {
        return fail("tools-missing", err as Error);
      }
      const usable: Fido2DeviceInfo[] = [];
      const refusals: string[] = [];
      for (const d of devices) {
        const why = deviceRefusal(d);
        if (why) {
          refusals.push(why.message);
          continue;
        }
        const holdsEnrolled = securityKeys(store).some((c) =>
          r.transport.hasCredential({
            device: d,
            rpId: r.rpId,
            credentialId: fromB64url(c.credentialId),
          }),
        );
        if (!holdsEnrolled) {
          usable.push(d);
        }
      }
      if (usable.length !== 1) {
        const msg =
          usable.length === 0
            ? refusals.length > 0
              ? `no acceptable new security key: ${refusals.join("; ")}`
              : "plug in the new security key (keys already enrolled here are not enrolled twice)"
            : "more than one new security key is plugged in; plug in only the one to enroll";
        return fail(
          usable.length === 0 ? "no-device" : "ambiguous-device",
          new SecondFactorError(usable.length === 0 ? "no-device" : "ambiguous-device", msg),
        );
      }
      const device = usable[0];
      const alg = opts.alg ?? (device.algorithms.includes("es256") ? "es256" : "eddsa");
      const challenge = randomBytes(32);
      const clientDataJSON = Buffer.from(
        JSON.stringify({
          type: "webauthn.create",
          challenge: b64url(challenge),
          origin: r.origin,
          crossOrigin: false,
        }),
      );
      const clientDataHash = verifyClientData(clientDataJSON, {
        type: "webauthn.create",
        challenge,
        origin: r.origin,
      });
      r.say(
        `Enrolling ${device.description || device.path}: touch the key and enter its PIN when asked.`,
      );
      try {
        const issuedAt = performance.now();
        const made = r.transport.makeCredential({
          device,
          clientDataHash,
          rpId: r.rpId,
          userName: `enclawed@${r.rpId}`,
          userId: randomBytes(32),
          alg,
        });
        if (performance.now() - issuedAt > CHALLENGE_TTL_MS) {
          throw new SecondFactorError(
            "challenge-expired",
            "the challenge expired before the key answered",
          );
        }
        if (
          made.rpId !== r.rpId ||
          Buffer.compare(Buffer.from(made.clientDataHash), Buffer.from(clientDataHash)) !== 0
        ) {
          throw new WebAuthnError(
            "client-data-hash-mismatch",
            "the authenticator answered a different challenge",
          );
        }
        const reg = verifyRegistration({
          rpId: r.rpId,
          clientDataHash,
          fmt: made.fmt,
          authDataRaw: unwrapCborByteString(made.authDataCbor),
          stmt: { sig: made.sig, x5c: made.x5c },
          credentialId: made.credentialId,
          policy: { allowedAuthenticators: config.allowedAuthenticators, now: r.now() },
        });
        if (device.aaguid && device.aaguid.replace(/-/g, "") !== reg.aaguid.replace(/-/g, "")) {
          throw new WebAuthnError(
            "attestation-invalid",
            "the attested AAGUID differs from the key's own report",
          );
        }
        const credential: EnrolledCredential = {
          id: randomBytes(4).toString("hex"),
          label,
          credentialId: b64url(reg.credentialId),
          alg: reg.publicKey.alg,
          publicKeyCose: b64url(reg.publicKey.cose),
          signCount: reg.signCount,
          aaguid: reg.aaguid,
          attestation: reg.attestation,
          enrolledAt: r.now(),
          lastUsedAt: null,
        };
        const next = { ...loadStore(r), credentials: [...store.credentials, credential] };
        writeAuthStore(r.dir, next);
        await record(r, "auth.enroll", {
          outcome: "enrolled",
          ...credentialRef(credential),
          alg: credential.alg,
          publicKeySha256: Buffer.from(sha256(reg.publicKey.cose)).toString("hex"),
          attestationCertSha256: reg.attestation.certSha256,
          attestationSubject: reg.attestation.certSubject,
          allowedAs: reg.attestation.allowedAs,
          total: next.credentials.length,
          firstFactor: store.credentials.length === 0,
        });
        return { credential, total: next.credentials.length };
      } catch (err) {
        if (err instanceof SecondFactorError && err.code === "audit-unavailable") {
          throw err;
        }
        return fail(failureCode(err), err as Error);
      }
    });
  });
}

/**
 * Adding a factor changes who can pass the gate: when any factor is
 * enrolled (a key, a passkey or the device-verified code), prove one first.
 */
async function proveExistingFactor(ctx: AuthContext, r: Resolved, label: string): Promise<void> {
  const before = loadStore(r);
  const deviceEnrolled = r.deviceFactor
    ? await r.deviceFactor.enrolled().catch(() => false)
    : false;
  if (before.credentials.length > 0 || deviceEnrolled) {
    await assertSecondFactor(ctx, {
      purpose: "auth-change",
      detail: `enroll ${label}`,
      allowTicket: false,
    });
  }
}

/**
 * Enroll this computer's device-bound platform passkey through the loopback
 * page: a fresh challenge and user id, a "tpm", "apple" or "android-key"
 * attestation (or a security key's "packed" one, when the person used a key
 * through the browser) verified against its pinned vendor root, UP and UV
 * set, not backup-eligible. The credential is kept with kind "passkey".
 */
export async function enrollPasskey(
  ctx: AuthContext,
  opts: { label: string },
): Promise<EnrollResult> {
  const r = resolve(ctx);
  return guarded(r, "auth.enroll", { label: opts.label, kind: "passkey" }, async () => {
    const label = opts.label.trim();
    if (!/^[\w .@-]{1,64}$/.test(label)) {
      throw new SecondFactorError(
        "no-such-factor",
        "a label is 1-64 letters, digits, spaces or . _ @ -",
      );
    }
    const fail = async (code: string, err: SecondFactorError | Error): Promise<never> => {
      await record(r, "auth.enroll", { outcome: "refused", code, label, kind: "passkey" });
      throw markAudited(
        err instanceof SecondFactorError
          ? err
          : new SecondFactorError(
              err instanceof PasskeyUnavailableError ? "no-device" : "verification-failed",
              `enrollment refused: ${err.message}`,
            ),
      );
    };
    if (!r.interactive) {
      return fail(
        "headless",
        new SecondFactorError("headless", "enrolling a passkey needs a person at the terminal"),
      );
    }
    const config = r.config();
    await proveExistingFactor(ctx, r, label);
    return withAuthLock(r.dir, r.lockWaitMs, async () => {
      const store = loadStore(r);
      const challenge = randomBytes(32);
      try {
        const issuedAt = performance.now();
        const res = await r.passkey(
          {
            kind: "create",
            challenge,
            userId: randomBytes(32),
            userName: `enclawed ${label}`,
            excludeCredentialIds: passkeys(store).map((c) => fromB64url(c.credentialId)),
            title: `Enroll this device's passkey as "${label}"`,
          },
          r.say,
        );
        if (performance.now() - issuedAt > CHALLENGE_TTL_MS) {
          throw new SecondFactorError(
            "challenge-expired",
            "the challenge expired before the passkey answered",
          );
        }
        checkCeremonyAnswer(res, "create");
        if (!res.attestationObject) {
          throw new WebAuthnError("attestation-format", "the passkey answer lacks an attestation");
        }
        const clientDataHash = verifyClientData(res.clientDataJSON, {
          type: "webauthn.create",
          challenge,
          origin: res.origin,
        });
        const att = decodeAttestationObject(res.attestationObject);
        const reg = verifyRegistration({
          rpId: PASSKEY_RP_ID,
          clientDataHash,
          fmt: att.fmt,
          authDataRaw: att.authDataRaw,
          stmt: att.stmt,
          credentialId: res.credentialId,
          policy: { allowedAuthenticators: config.allowedAuthenticators, now: r.now() },
        });
        const id = b64url(reg.credentialId);
        if (store.credentials.some((c) => c.credentialId === id)) {
          throw new WebAuthnError("credential-id-mismatch", "this passkey is already enrolled");
        }
        const credential: EnrolledCredential = {
          id: randomBytes(4).toString("hex"),
          label,
          credentialId: id,
          kind: "passkey",
          // A verified TPM statement proves a key the TPM made and cannot export: no clone to
          // detect, so its counter may stay at 0. Kept with the statement that proves it.
          ...(reg.attestation.fmt === "tpm"
            ? {
                counterPolicy: "tpm-non-exportable" as const,
                tpmCounterEvidence: {
                  attestationObject: b64url(res.attestationObject),
                  clientDataHash: b64url(clientDataHash),
                },
              }
            : {}),
          alg: reg.publicKey.alg,
          publicKeyCose: b64url(reg.publicKey.cose),
          signCount: reg.signCount,
          aaguid: reg.aaguid,
          attestation: reg.attestation,
          enrolledAt: r.now(),
          lastUsedAt: null,
        };
        const next = { ...loadStore(r), credentials: [...store.credentials, credential] };
        writeAuthStore(r.dir, next);
        await record(r, "auth.enroll", {
          outcome: "enrolled",
          ...credentialRef(credential),
          alg: credential.alg,
          fmt: reg.attestation.fmt,
          attestationAlg: reg.attestation.alg ?? null,
          publicKeySha256: Buffer.from(sha256(reg.publicKey.cose)).toString("hex"),
          attestationCertSha256: reg.attestation.certSha256,
          attestationSubject: reg.attestation.certSubject,
          allowedAs: reg.attestation.allowedAs,
          total: next.credentials.length,
          firstFactor: store.credentials.length === 0,
        });
        return { credential, total: next.credentials.length };
      } catch (err) {
        if (err instanceof SecondFactorError && err.code === "audit-unavailable") {
          throw err;
        }
        return fail(failureCode(err), err as Error);
      }
    });
  });
}

export async function removeSecurityKey(
  ctx: AuthContext,
  opts: { id: string },
): Promise<{ remaining: number }> {
  const r = resolve(ctx);
  return guarded(r, "auth.remove", { credential: opts.id }, async () => {
    const store = loadStore(r);
    const target = store.credentials.find((c) => c.id === opts.id);
    if (!target) {
      await record(r, "auth.remove", {
        outcome: "refused",
        code: "no-such-factor",
        credential: opts.id,
      });
      throw markAudited(
        new SecondFactorError(
          "no-such-factor",
          `no enrolled key has id ${opts.id} (see: enclawed auth status)`,
        ),
      );
    }
    const deviceEnrolled = r.deviceFactor
      ? await r.deviceFactor.enrolled().catch(() => false)
      : false;
    if (store.credentials.length + (deviceEnrolled ? 1 : 0) <= 1) {
      await record(r, "auth.remove", {
        outcome: "refused",
        code: "last-factor",
        ...credentialRef(target),
      });
      throw new SecondFactorError(
        "last-factor",
        "refusing to remove the last enrolled second factor; enroll a replacement first (enclawed auth enroll)",
      );
    }
    await assertSecondFactor(ctx, {
      purpose: "auth-change",
      detail: `remove ${target.id}`,
      allowTicket: false,
    });
    return withAuthLock(r.dir, r.lockWaitMs, async () => {
      const fresh = loadStore(r);
      const credentials = fresh.credentials.filter((c) => c.id !== target.id);
      if (credentials.length + (deviceEnrolled ? 1 : 0) < 1) {
        throw new SecondFactorError(
          "last-factor",
          "refusing to remove the last enrolled second factor",
        );
      }
      writeAuthStore(r.dir, { ...fresh, credentials });
      // A ticket issued before the change does not outlive it.
      revokeTicket(r.dir);
      await record(r, "auth.remove", {
        outcome: "removed",
        ...credentialRef(target),
        remaining: credentials.length,
      });
      return { remaining: credentials.length };
    });
  });
}

export async function unlockForHeadlessStart(
  ctx: AuthContext,
  opts: { minutes?: number; uses?: number },
): Promise<UnlockTicket> {
  const r = resolve(ctx);
  return guarded(r, "auth.ticket", { scope: "session-start" }, async () => {
    const config = r.config();
    const binding = currentBinding();
    if (!binding) {
      await record(r, "auth.ticket", { outcome: "refused", code: "unbindable-platform" });
      throw new SecondFactorError(
        "unbindable-platform",
        "this platform exposes no boot id; unlock tickets are unavailable",
      );
    }
    let minutes: number;
    try {
      minutes = ticketMinutes({
        requested: opts.minutes,
        configuredDefault: config.unlockMinutes,
        configuredMax: config.maxUnlockMinutes,
      });
    } catch (err) {
      await record(r, "auth.ticket", { outcome: "refused", code: "config-invalid" });
      throw markAudited(new SecondFactorError("config-invalid", (err as Error).message));
    }
    const uses = opts.uses ?? 1;
    if (!Number.isInteger(uses) || uses < 1 || uses > TICKET_MAX_USES) {
      await record(r, "auth.ticket", { outcome: "refused", code: "config-invalid" });
      throw markAudited(
        new SecondFactorError("config-invalid", `--uses must be between 1 and ${TICKET_MAX_USES}`),
      );
    }
    // The security key signs the ticket body itself (its hash is the challenge).
    const proof = await runGate(
      ctx,
      { purpose: "unlock", allowTicket: false },
      {
        body: (credential) =>
          newTicketBody({ rpId: r.rpId, binding, minutes, uses, credential, now: r.now() }),
      },
    );
    const signed = proof.signedTicket;
    if (!signed) {
      throw new SecondFactorError(
        "no-device",
        "an unlock ticket must be signed by an enrolled FIDO2 security key or passkey",
      );
    }
    return withAuthLock(r.dir, r.lockWaitMs, async () => {
      writeSignedTicket(r.dir, {
        body: signed.body,
        clientDataJSON: signed.ceremony.clientDataJSON,
        authDataRaw: signed.ceremony.authDataRaw,
        signature: signed.ceremony.signature,
      });
      await record(r, "auth.ticket", {
        outcome: "issued",
        scope: signed.body.scope,
        credential: signed.body.credential,
        expiresAt: signed.body.expiresAt,
        uses: signed.body.uses,
        signCount: signed.ceremony.signCount,
      });
      return { ...signed.body, usesLeft: signed.body.uses };
    });
  });
}

export async function revokeUnlockTicket(ctx: AuthContext): Promise<boolean> {
  const r = resolve(ctx);
  return guarded(r, "auth.ticket", { action: "revoke" }, async () => {
    const had = await withAuthLock(r.dir, r.lockWaitMs, async () => revokeTicket(r.dir));
    await record(r, "auth.ticket", { outcome: "revoked", existed: had });
    return had;
  });
}

export type AuthStatus = {
  rpId: string;
  dir: string;
  credentials: Array<Omit<EnrolledCredential, "publicKeyCose" | "credentialId">>;
  deviceFactor: { label: string; enrolled: boolean } | null;
  failures: number;
  lockedUntil: number | null;
  ticket: { expiresAt: number; usesLeft: number; valid: boolean } | null;
  config:
    | { unlockMinutes: number; maxUnlockMinutes: number; allowlist: string[] }
    | { error: string };
  warnings: string[];
};

export async function secondFactorStatus(ctx: AuthContext): Promise<AuthStatus> {
  const r = resolve(ctx);
  const store = loadStore(r);
  let config: AuthStatus["config"];
  try {
    const c = r.config();
    config = {
      unlockMinutes: c.unlockMinutes,
      maxUnlockMinutes: c.maxUnlockMinutes,
      allowlist: c.allowedAuthenticators.map((a) => a.description ?? a.aaguid),
    };
  } catch (err) {
    config = { error: (err as Error).message };
  }
  const deviceEnrolled = r.deviceFactor
    ? await r.deviceFactor.enrolled().catch(() => false)
    : false;
  const t = readTicket(r.dir);
  const binding = currentBinding();
  const warnings: string[] = [];
  const total = store.credentials.length + (deviceEnrolled ? 1 : 0);
  if (total === 0) {
    warnings.push(
      "no second factor is enrolled: every gated command is refused until you run `enclawed auth enroll`",
    );
  } else if (store.credentials.length === 1 && !deviceEnrolled) {
    warnings.push(
      "only one security key is enrolled: enroll a backup key (enclawed auth enroll --label backup)",
    );
  }
  return {
    rpId: r.rpId,
    dir: r.dir,
    credentials: store.credentials.map(({ publicKeyCose: _p, credentialId: _c, ...rest }) => rest),
    deviceFactor: r.deviceFactor ? { label: r.deviceFactor.label, enrolled: deviceEnrolled } : null,
    failures: store.failures,
    lockedUntil: store.lockedUntil,
    ticket: t
      ? {
          expiresAt: t.expiresAt,
          usesLeft: t.usesLeft,
          valid:
            ticketSignatureValid(r.dir, {
              rpId: r.rpId,
              origin: r.origin,
              credentials: store.credentials,
            }) &&
            binding !== null &&
            t.bootId === binding.bootId &&
            t.uid === binding.uid &&
            r.now() < t.expiresAt &&
            t.usesLeft > 0,
        }
      : null,
    config,
    warnings,
  };
}
