// Unlock tickets: how a headless start (systemd, launchd, CI) passes the
// second-factor gate. `enclawed auth unlock` builds the ticket body first and
// then has the enrolled FIDO2 security key SIGN it: the WebAuthn challenge
// of that interactive assertion (touch + PIN) is SHA-256 of the canonical
// ticket body. The ticket file holds the body, the clientDataJSON, the
// authenticator data and the signature, so checking a ticket needs only the
// credential's public key. No ticket key exists on this host: software
// running here cannot mint or alter a ticket (uid, host, boot, expiry,
// scope, use limit) without the authenticator's private key, which never
// leaves the key.
//
// A ticket:
//   - covers session starts only (never policy changes, recovery, restores
//     or admin commands, which always need a person and a touch);
//   - is bound to this uid, this host (hostname + machine id) and this boot
//     (kernel boot id), so it dies with a reboot and does not travel;
//   - expires after `unlock minutes` (default 10, hard maximum 8 hours, an
//     administrator may only lower the maximum);
//   - admits at most its signed use count (default 1); the local count of
//     uses already made is kept beside it;
//   - is never renewed or extended: a new one needs a new touch and PIN.
//
// Each issue, use and refusal is audited by the caller (gate.ts).

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PASSKEY_RP_ID, isLoopbackOrigin } from "./loopback-ceremony.js";
import type { EnrolledCredential } from "./store.js";
import { credentialKind, writePrivateJson } from "./store.js";
import {
  WebAuthnError,
  b64url,
  fromB64url,
  sha256,
  verifyClientData,
  verifySignedAssertion,
} from "./webauthn.js";

/**
 * The longest a ticket may last, and the most uses it may carry: one person's
 * authorization covers up to 36 h and 65535 launches (the device unlock
 * grant's own limits, a 16-bit use count; with an Enclaweder bound the grant
 * is bound to this ticket and the DEVICE counts the uses). An administrator
 * may lower them (auth config); the defaults stay 10 minutes and 1 use.
 */
export const TICKET_HARD_MAX_MINUTES = 36 * 60;
/**
 * How far this host's wall clock may step back between issuing and using a
 * ticket before the ticket reads as "not yet valid". A ticket's lifetime is
 * enforced on the system-wide monotonic clock (it cannot be lengthened by
 * setting the wall clock back, and a clock that steps does not break it); the
 * wall-clock window is checked too and can only shorten it.
 */
export const WALL_CLOCK_STEP_TOLERANCE_MS = 60_000;

/** Nanoseconds on the system-wide monotonic clock (Linux CLOCK_MONOTONIC, macOS mach time). */
export function monotonicNow(): bigint {
  return process.hrtime.bigint();
}
export const TICKET_DEFAULT_MINUTES = 10;
export const TICKET_MAX_USES = 65_535;

export type TicketBinding = {
  uid: number | null;
  hostname: string;
  machineId: string | null;
  bootId: string;
};

/** The signed part of a ticket. */
export type TicketBody = TicketBinding & {
  v: 2;
  rpId: string;
  scope: "session-start";
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  /** The same window on the monotonic clock of this boot (decimal nanoseconds). */
  issuedAtMono: string;
  expiresAtMono: string;
  uses: number;
  /** Local id and credential id of the enrolled key that signed this ticket. */
  credential: string;
  credentialId: string;
};

export type SignedTicket = {
  body: TicketBody;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
};

/** Ticket view for callers (status, audit). */
export type UnlockTicket = TicketBody & { usesLeft: number };

function readTrim(file: string): string | null {
  try {
    const v = fs.readFileSync(file, "utf8").trim();
    return v || null;
  } catch {
    return null;
  }
}

function run(cmd: string, args: string[]): string | null {
  try {
    return (
      execFileSync(cmd, args, {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

/** This boot's identity, or null when the platform offers none (then no ticket can be bound). */
export function currentBootId(platform = process.platform): string | null {
  if (platform === "linux") {
    return readTrim("/proc/sys/kernel/random/boot_id");
  }
  if (platform === "darwin") {
    return run("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"]);
  }
  return null;
}

export function currentMachineId(platform = process.platform): string | null {
  if (platform === "linux") {
    return readTrim("/etc/machine-id") ?? readTrim("/var/lib/dbus/machine-id");
  }
  if (platform === "darwin") {
    const out = run("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
    const m = out ? /"IOPlatformUUID" = "([^"]+)"/.exec(out) : null;
    return m ? m[1] : null;
  }
  return null;
}

export function currentBinding(): TicketBinding | null {
  const bootId = currentBootId();
  if (!bootId) {
    return null;
  }
  return {
    uid: typeof process.getuid === "function" ? process.getuid() : null,
    hostname: os.hostname(),
    machineId: currentMachineId(),
    bootId,
  };
}

export function ticketFile(dir: string): string {
  return path.join(dir, "unlock-ticket.json");
}

function usesFile(dir: string): string {
  return path.join(dir, "unlock-ticket.used");
}

/** Resolve the lifetime: requested (or the configured default) within the configured maximum. */
export function ticketMinutes(params: {
  requested?: number;
  configuredDefault: number;
  configuredMax: number;
}): number {
  const minutes = params.requested ?? params.configuredDefault;
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new Error("unlock minutes must be a whole number of at least 1");
  }
  if (minutes > params.configuredMax || minutes > TICKET_HARD_MAX_MINUTES) {
    throw new Error(
      `unlock minutes may not exceed ${Math.min(params.configuredMax, TICKET_HARD_MAX_MINUTES)} on this deployment`,
    );
  }
  return minutes;
}

/** Canonical bytes of a ticket body (fixed key order), whose SHA-256 is the WebAuthn challenge. */
export function canonicalTicketBody(b: TicketBody): Uint8Array {
  const ordered = {
    v: b.v,
    rpId: b.rpId,
    scope: b.scope,
    nonce: b.nonce,
    uid: b.uid,
    hostname: b.hostname,
    machineId: b.machineId,
    bootId: b.bootId,
    issuedAt: b.issuedAt,
    expiresAt: b.expiresAt,
    issuedAtMono: b.issuedAtMono,
    expiresAtMono: b.expiresAtMono,
    uses: b.uses,
    credential: b.credential,
    credentialId: b.credentialId,
  };
  return new TextEncoder().encode(JSON.stringify(ordered));
}

/** SHA-256 (hex) of a ticket body's canonical bytes: what a device unlock grant is bound to. */
export function ticketDigest(b: TicketBody): string {
  return Buffer.from(sha256(canonicalTicketBody(b))).toString("hex");
}

export function ticketChallenge(b: TicketBody): Uint8Array {
  return sha256(canonicalTicketBody(b));
}

export function newTicketBody(params: {
  rpId: string;
  binding: TicketBinding;
  minutes: number;
  uses: number;
  credential: EnrolledCredential;
  now: number;
  mono?: bigint;
}): TicketBody {
  if (params.minutes > TICKET_HARD_MAX_MINUTES) {
    throw new Error(`a ticket may not outlive ${TICKET_HARD_MAX_MINUTES} minutes`);
  }
  if (!Number.isInteger(params.uses) || params.uses < 1 || params.uses > TICKET_MAX_USES) {
    throw new Error(`ticket uses must be between 1 and ${TICKET_MAX_USES}`);
  }
  return {
    v: 2,
    rpId: params.rpId,
    scope: "session-start",
    nonce: randomBytes(16).toString("hex"),
    ...params.binding,
    issuedAt: params.now,
    expiresAt: params.now + params.minutes * 60_000,
    issuedAtMono: (params.mono ?? monotonicNow()).toString(),
    expiresAtMono: (
      (params.mono ?? monotonicNow()) +
      BigInt(params.minutes) * 60_000_000_000n
    ).toString(),
    uses: params.uses,
    credential: params.credential.id,
    credentialId: params.credential.credentialId,
  };
}

export function writeSignedTicket(
  dir: string,
  t: {
    body: TicketBody;
    clientDataJSON: Uint8Array;
    authDataRaw: Uint8Array;
    signature: Uint8Array;
  },
): void {
  const file: SignedTicket = {
    body: t.body,
    clientDataJSON: b64url(t.clientDataJSON),
    authenticatorData: b64url(t.authDataRaw),
    signature: b64url(t.signature),
  };
  fs.rmSync(usesFile(dir), { force: true });
  writePrivateJson(ticketFile(dir), file);
}

export type TicketRefusal =
  | "no-ticket"
  | "malformed"
  | "bad-signature"
  | "unknown-key"
  | "expired"
  | "not-yet-valid"
  | "spent"
  | "wrong-uid"
  | "wrong-host"
  | "wrong-boot"
  | "unbindable-platform";

function readUsed(dir: string): number {
  const v = Number.parseInt(readTrim(usesFile(dir)) ?? "0", 10);
  return Number.isInteger(v) && v >= 0 ? v : Number.MAX_SAFE_INTEGER;
}

/** The origin a passkey's client data names, when it is a loopback page's; otherwise a refusal. */
function loopbackOriginOf(clientDataJSON: Uint8Array): string {
  let origin: unknown;
  try {
    origin = (JSON.parse(Buffer.from(clientDataJSON).toString("utf8")) as { origin?: unknown })
      .origin;
  } catch {
    throw new WebAuthnError("bad-client-data", "clientDataJSON is not JSON");
  }
  if (typeof origin !== "string" || !isLoopbackOrigin(origin)) {
    throw new WebAuthnError("origin-mismatch", "a passkey ticket must come from a loopback page");
  }
  return origin;
}

/** Verify a ticket's signature with the enrolled key it names. Throws WebAuthnError / Error. */
export function verifyTicketSignature(
  t: SignedTicket,
  params: { rpId: string; origin: string; credentials: EnrolledCredential[] },
): EnrolledCredential {
  const b = t.body;
  if (b?.v !== 2 || b.scope !== "session-start" || b.rpId !== params.rpId) {
    throw new WebAuthnError("bad-client-data", "not a session-start ticket for this relying party");
  }
  const cred = params.credentials.find(
    (c) => c.id === b.credential && c.credentialId === b.credentialId,
  );
  if (!cred) {
    throw new Error("unknown-key");
  }
  // A passkey signs on the loopback page, whose port changes per ceremony:
  // its origin must be exactly http://localhost:<port>, and its RP ID is
  // "localhost". A security key signs under the deployment's own origin.
  const passkey = credentialKind(cred) === "passkey";
  const clientDataJSON = fromB64url(t.clientDataJSON);
  const clientDataHash = verifyClientData(clientDataJSON, {
    type: "webauthn.get",
    challenge: ticketChallenge(b),
    origin: passkey ? loopbackOriginOf(clientDataJSON) : params.origin,
  });
  verifySignedAssertion({
    rpId: passkey ? PASSKEY_RP_ID : params.rpId,
    clientDataHash,
    authDataRaw: fromB64url(t.authenticatorData),
    signature: fromB64url(t.signature),
    credentialPublicKey: fromB64url(cred.publicKeyCose),
  });
  return cred;
}

/**
 * Check the ticket and spend one use. Must run under the auth lock. Returns
 * the ticket, or the refusal reason. An expired, spent, forged or
 * wrong-boot ticket is deleted.
 */
export function consumeTicket(params: {
  dir: string;
  binding: TicketBinding | null;
  now: number;
  mono?: bigint;
  rpId: string;
  origin: string;
  credentials: EnrolledCredential[];
}): { ok: true; ticket: UnlockTicket } | { ok: false; reason: TicketRefusal } {
  const file = ticketFile(params.dir);
  const drop = (reason: TicketRefusal) => {
    fs.rmSync(file, { force: true });
    fs.rmSync(usesFile(params.dir), { force: true });
    return { ok: false as const, reason };
  };
  let t: SignedTicket;
  try {
    t = JSON.parse(fs.readFileSync(file, "utf8")) as SignedTicket;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT"
      ? { ok: false, reason: "no-ticket" }
      : drop("malformed");
  }
  if (!params.binding) {
    return { ok: false, reason: "unbindable-platform" };
  }
  // Signature first: nothing in an unsigned or altered body is trusted.
  try {
    verifyTicketSignature(t, params);
  } catch (err) {
    return drop(
      err instanceof Error && err.message === "unknown-key" ? "unknown-key" : "bad-signature",
    );
  }
  const b = t.body;
  let issuedMono: bigint;
  let expiresMono: bigint;
  try {
    issuedMono = BigInt(b.issuedAtMono);
    expiresMono = BigInt(b.expiresAtMono);
  } catch {
    return drop("malformed");
  }
  if (
    typeof b.expiresAt !== "number" ||
    typeof b.issuedAt !== "number" ||
    !Number.isInteger(b.uses) ||
    b.uses < 1 ||
    b.uses > TICKET_MAX_USES ||
    b.expiresAt - b.issuedAt > TICKET_HARD_MAX_MINUTES * 60_000 ||
    expiresMono - issuedMono > BigInt(TICKET_HARD_MAX_MINUTES) * 60_000_000_000n
  ) {
    return drop("malformed");
  }
  // The boot first: monotonic time only means something within one boot.
  if (b.bootId !== params.binding.bootId) {
    return drop("wrong-boot");
  }
  const mono = params.mono ?? monotonicNow();
  // Expired by EITHER clock. Monotonic: the true elapsed time this boot.
  // Wall: can only shorten the window (a clock set forward ends it early).
  if (!(mono < expiresMono) || !(params.now < b.expiresAt)) {
    return drop("expired");
  }
  if (mono < issuedMono || params.now < b.issuedAt - WALL_CLOCK_STEP_TOLERANCE_MS) {
    return drop("not-yet-valid");
  }
  if (b.uid !== params.binding.uid) {
    return { ok: false, reason: "wrong-uid" };
  }
  if (b.hostname !== params.binding.hostname || b.machineId !== params.binding.machineId) {
    return { ok: false, reason: "wrong-host" };
  }
  const used = readUsed(params.dir);
  if (used >= b.uses) {
    return drop("spent");
  }
  if (used + 1 >= b.uses) {
    drop("spent");
  } else {
    fs.writeFileSync(usesFile(params.dir), `${used + 1}\n`, { mode: 0o600 });
  }
  return { ok: true, ticket: { ...b, usesLeft: b.uses - used - 1 } };
}

export function readTicket(dir: string): UnlockTicket | null {
  try {
    const t = JSON.parse(fs.readFileSync(ticketFile(dir), "utf8")) as SignedTicket;
    return { ...t.body, usesLeft: Math.max(0, t.body.uses - readUsed(dir)) };
  } catch {
    return null;
  }
}

/** Does the ticket on disk carry a valid signature by an enrolled key? */
export function ticketSignatureValid(
  dir: string,
  params: { rpId: string; origin: string; credentials: EnrolledCredential[] },
): boolean {
  try {
    verifyTicketSignature(
      JSON.parse(fs.readFileSync(ticketFile(dir), "utf8")) as SignedTicket,
      params,
    );
    return true;
  } catch {
    return false;
  }
}

export function revokeTicket(dir: string): boolean {
  const file = ticketFile(dir);
  const had = fs.existsSync(file);
  fs.rmSync(file, { force: true });
  fs.rmSync(usesFile(dir), { force: true });
  return had;
}
