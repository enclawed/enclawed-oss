// The enrolled second factors, kept in the protected state dir
// (<state dir>/auth/factors.json, mode 0600 in a 0700 directory). Only
// public material lives here: each credential's id, its COSE public key, its
// last accepted signature counter, and what its attestation said. The
// private key never leaves the authenticator.
//
// Writes are atomic (temp file + rename) and every read-modify-write runs
// under an exclusive lock file, so a counter update or a failure count is
// never lost to a concurrent verification.

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import type { AttestationResult, CoseAlg, TpmCounterEvidence } from "./webauthn.js";

export const AUTH_STORE_VERSION = 1;

export type CredentialKind = "security-key" | "passkey";

export function credentialKind(c: { kind?: CredentialKind }): CredentialKind {
  return c.kind ?? "security-key";
}

export type EnrolledCredential = {
  /** Short local id (8 hex), used by `enclawed auth remove <id>`. */
  id: string;
  label: string;
  /** base64url credential id. */
  credentialId: string;
  /**
   * How the credential is reached: a security key over libfido2 (absent or
   * "security-key", RP ID the deployment's), or a device-bound platform
   * passkey through the loopback page ("passkey", RP ID "localhost").
   */
  kind?: CredentialKind;
  /**
   * Set only at enrollment from a verified "tpm" attestation of a non-exportable TPM key: a
   * counter that stays at 0 is accepted. Never trusted by itself: every use re-verifies
   * `tpmCounterEvidence` (tpmCounterExemptionHolds) and refuses when it does not hold.
   */
  counterPolicy?: "tpm-non-exportable";
  tpmCounterEvidence?: TpmCounterEvidence;
  alg: CoseAlg;
  /** base64url COSE_Key. */
  publicKeyCose: string;
  signCount: number;
  aaguid: string;
  attestation: AttestationResult;
  enrolledAt: number;
  lastUsedAt: number | null;
};

export type AuthStore = {
  v: typeof AUTH_STORE_VERSION;
  rpId: string;
  credentials: EnrolledCredential[];
  failures: number;
  lockedUntil: number | null;
};

export function authStateDir(env: NodeJS.ProcessEnv = process.env, stateDir?: string): string {
  return path.join(stateDir ?? resolveStateDir(env), "auth");
}

export function emptyStore(rpId: string): AuthStore {
  return { v: AUTH_STORE_VERSION, rpId, credentials: [], failures: 0, lockedUntil: null };
}

function factorsFile(dir: string): string {
  return path.join(dir, "factors.json");
}

function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    const st = fs.lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) {
      throw new Error(`auth state dir ${dir} is not a plain directory`);
    }
    if (typeof process.getuid === "function" && st.uid !== process.getuid()) {
      throw new Error(`auth state dir ${dir} is not owned by this user`);
    }
    if ((st.mode & 0o077) !== 0) {
      fs.chmodSync(dir, 0o700);
    }
  }
}

export function writePrivateJson(file: string, value: unknown): void {
  ensurePrivateDir(path.dirname(file));
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.renameSync(tmp, file);
}

function isCredential(c: unknown): c is EnrolledCredential {
  if (!c || typeof c !== "object") {
    return false;
  }
  const r = c as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.credentialId === "string" &&
    (r.alg === -7 || r.alg === -8 || r.alg === -257) &&
    (r.kind === undefined || r.kind === "security-key" || r.kind === "passkey") &&
    (r.counterPolicy === undefined || r.counterPolicy === "tpm-non-exportable") &&
    typeof r.publicKeyCose === "string" &&
    typeof r.signCount === "number" &&
    Number.isInteger(r.signCount) &&
    r.signCount >= 0 &&
    typeof r.aaguid === "string"
  );
}

/**
 * Read the store. A missing file is an empty store; a file that exists but
 * does not parse, or carries a different relying party id, is an error (it is
 * never silently treated as "nothing enrolled", which would read the same as
 * a fresh install).
 */
export function readAuthStore(dir: string, rpId: string): AuthStore {
  let raw: string;
  try {
    raw = fs.readFileSync(factorsFile(dir), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyStore(rpId);
    }
    throw err;
  }
  const parsed = JSON.parse(raw) as Partial<AuthStore>;
  if (parsed.v !== AUTH_STORE_VERSION || !Array.isArray(parsed.credentials)) {
    throw new Error(`${factorsFile(dir)} is not a version-${AUTH_STORE_VERSION} factor store`);
  }
  if (parsed.rpId !== rpId) {
    throw new Error(
      `${factorsFile(dir)} belongs to relying party ${String(parsed.rpId)}, not ${rpId}`,
    );
  }
  if (!parsed.credentials.every(isCredential)) {
    throw new Error(`${factorsFile(dir)} holds a malformed credential record`);
  }
  return {
    v: AUTH_STORE_VERSION,
    rpId,
    credentials: parsed.credentials,
    failures: typeof parsed.failures === "number" ? parsed.failures : 0,
    lockedUntil: typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : null,
  };
}

export function writeAuthStore(dir: string, store: AuthStore): void {
  writePrivateJson(factorsFile(dir), store);
}

/** The store's lock could not be taken (another check in progress, or a lock that is not a file). */
export class AuthLockError extends Error {
  readonly code = "busy";
  constructor(message: string) {
    super(message);
    this.name = "AuthLockError";
  }
}

const LOCK_WAIT_MS = 120_000;
const LOCK_STALE_MS = 15 * 60_000;

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Exclusive lock beside the store. A holder that died, or one older than 15 minutes, is broken. */
export async function withAuthLock<T>(
  dir: string,
  waitMs: number | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  waitMs ??= LOCK_WAIT_MS;
  ensurePrivateDir(dir);
  const lock = path.join(dir, "factors.lock");
  // Monotonic: a wall clock that steps must not stretch (or skip) the wait.
  const deadline = performance.now() + waitMs;
  for (;;) {
    try {
      const fd = fs.openSync(lock, "wx", 0o600);
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
        throw err;
      }
    }
    let st: fs.Stats | null = null;
    let holder = Number.NaN;
    try {
      st = fs.lstatSync(lock);
      holder = Number.parseInt(fs.readFileSync(lock, "utf8"), 10);
    } catch {
      /* released meanwhile */
    }
    if (st && !st.isFile()) {
      throw new AuthLockError(`auth lock ${lock} is not a regular file`);
    }
    if (
      st &&
      ((Number.isInteger(holder) && !pidAlive(holder)) || Date.now() - st.mtimeMs > LOCK_STALE_MS)
    ) {
      try {
        if (fs.lstatSync(lock).ino === st.ino) {
          fs.rmSync(lock, { force: true });
        }
      } catch {
        /* gone */
      }
      continue;
    }
    if (performance.now() > deadline) {
      throw new AuthLockError("another enclawed second-factor check is in progress; try again");
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}
