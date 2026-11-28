// enclawed adapter kit: the host's login, sealed at rest under the device.
//
// A host keeps its account login (an OAuth token) in a plaintext file. Erasing
// that file on a halt does not stop a copy taken earlier. With an Enclaweder
// bound, the login is therefore kept SEALED: AES-256-GCM under the key the
// device derives (credential-keys.ts, source "device"), which exists only while
// the device answers and is never on disk. A copy of the sealed file is
// ciphertext.
//
//   seal        the plaintext login file is sealed and then erased (a one-time
//               step a person runs, or the end of a session).
//   unseal      at launch, the login is opened into a directory private to the
//               session (made fresh, 0700; the file 0600, created exclusively),
//               and the host is pointed there by its adapter.
//   reseal      at the end of the session, whatever the host left there (it
//               rewrites the login when it refreshes its token) is sealed again
//               and every file of that directory is erased. A host that logged
//               out (no login left) removes the sealed login too.
//   erase       on a halt, the session's plaintext is erased (with the sealed
//               login, by the adapter's choice).
//
// With a device bound, only the device key seals and only a record the device
// key sealed is opened: a record sealed with a keyring or file key (which a
// process of this user can read) could carry a login someone else planted.
//
// A record names the key that sealed it, is bound to its label as associated
// data, and is refused by name when that key is not available here. The
// adapter maps where its host keeps the login; every decision is made here.
//
//   migrate     command set 0.5: a login sealed under the CHALLENGE-derived
//               device key of earlier versions is opened ONCE with that key,
//               sealed again under the KEY_DERIVE key, and the old record is
//               overwritten in place and replaced; audited. The CHALLENGE key
//               is never a sealing key on 0.5 (credential-keys.ts).
//
//   box         command set 0.5 (record v2): with the launch's login box given (credential-keys.ts
//               DeviceKeyState.boxes.login, sealed-box.ts), the login is sealed to the box's
//               public key. The box opens only while the launch holds its private key (the start
//               of the launch); after that the launcher keeps the public key alone, which seals a
//               refreshed login and opens nothing. Every replaced record's bytes are overwritten.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { type CredentialKeys, deviceKeyIdForm } from "./credential-keys.js";
import { type BoxRecord, isBoxRecord, type SealBox, sealToBox } from "./sealed-box.js";

const KIND = "enclawed.adapter.login-seal.v1";
/** A login file larger than this is not a login (a fixed bound, not a setting). */
export const LOGIN_MAX_BYTES = 1024 * 1024;

export type LoginSealCode =
  | "device-key-required"
  | "not-device-sealed"
  | "key-unavailable"
  | "sealed-unreadable"
  | "sealed-does-not-open"
  | "no-login"
  | "login-not-a-file"
  | "login-too-large"
  | "session-dir-exists"
  | "session-write-failed"
  | "audit-failed";

export type LoginSealFailure = Readonly<{ ok: false; code: LoginSealCode; message: string }>;

type SealedLoginV1 = {
  v: 1;
  kind: typeof KIND;
  label: string;
  key: string;
  iv: string;
  tag: string;
  data: string;
};
type SealedLoginV2 = BoxRecord & { v: 2; kind: typeof KIND; label: string };
type SealedLogin = SealedLoginV1 | SealedLoginV2;

const fail = (code: LoginSealCode, message: string): LoginSealFailure => ({
  ok: false,
  code,
  message,
});

const aad = (label: string, key: string) => Buffer.from(`${KIND}\0${label}\0${key}`, "utf8");

/** A key wiped by forgetLaunchCredentialKeys (all zeros). */
const forgotten = (k: Buffer) => k.every((b) => b === 0);

/** With a device bound, only the device key seals (a launch's box is the device's by construction). */
function sealingKeyProblem(
  keys: CredentialKeys,
  deviceBound: boolean,
  box: SealBox | null = null,
): LoginSealFailure | null {
  if (box) {
    return box.publicKey?.length === 32 && box.id.startsWith("device:")
      ? null
      : fail("key-unavailable", "the login box is not a device box");
  }
  if (!keys?.write?.key || keys.write.key.length !== 32 || forgotten(keys.write.key)) {
    // A forgotten launch key is all zeros (forgetLaunchCredentialKeys): it never seals.
    return fail("key-unavailable", "no key to seal the login with");
  }
  if (deviceBound && keys.write.source !== "device") {
    return fail(
      "device-key-required",
      `an Enclaweder is bound, but its key could not be derived (the best key here is the ${keys.write.source} key); the login is sealed only under the device`,
    );
  }
  return null;
}

/** Overwrite once, then remove; never follows a link. True when nothing is left at `file`. */
function eraseFile(file: string): boolean {
  let st: fs.Stats | null = null;
  try {
    st = fs.lstatSync(file);
  } catch {
    return true;
  }
  if (st.isFile()) {
    try {
      const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
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
  try {
    fs.rmSync(file, { force: true, recursive: st.isDirectory() });
  } catch {
    /* reported below */
  }
  try {
    fs.lstatSync(file);
    return false;
  } catch {
    return true;
  }
}

/** The login file's bytes: a regular file (never a link), not empty, within the bound. */
function readLogin(file: string): Buffer | LoginSealFailure {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(file);
  } catch {
    return fail("no-login", `there is no login at ${file}`);
  }
  if (!st.isFile()) {
    return fail(
      "login-not-a-file",
      `${file} is not a regular file (a link or a directory is not read)`,
    );
  }
  if (st.size === 0 || st.size > LOGIN_MAX_BYTES) {
    return fail("login-too-large", `${file} is ${st.size === 0 ? "empty" : "larger than a login"}`);
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function sealBytes(
  plain: Buffer,
  label: string,
  keys: CredentialKeys,
  box: SealBox | null = null,
): SealedLogin {
  if (box) {
    return { v: 2, kind: KIND, label, ...sealToBox(box, plain, aad(label, box.id)) };
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keys.write.key, iv);
  c.setAAD(aad(label, keys.write.id));
  const data = Buffer.concat([c.update(plain), c.final()]);
  return {
    v: 1,
    kind: KIND,
    label,
    key: keys.write.id,
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

/**
 * Written atomically (a temp file renamed in), 0600, in a 0700 directory; the record it replaces
 * is overwritten through a descriptor held on it, so no earlier record is left in its file.
 */
function writeSealed(file: string, rec: SealedLogin): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  let old: number | null = null;
  try {
    old = fs.lstatSync(file).isFile()
      ? fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW)
      : null;
  } catch {
    old = null;
  }
  try {
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rec), { mode: 0o600, flag: "wx" });
    fs.renameSync(tmp, file);
    if (old !== null) {
      const n = Math.max(fs.fstatSync(old).size, 1);
      fs.writeSync(old, randomBytes(n), 0, n, 0);
      fs.fsyncSync(old);
    }
  } finally {
    if (old !== null) {
      fs.closeSync(old);
    }
  }
}

function readSealed(file: string): SealedLogin | null | LoginSealFailure {
  let text: string;
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) {
      return fail("sealed-unreadable", `${file} is not a regular file`);
    }
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let raw: Partial<SealedLoginV1>;
  try {
    raw = JSON.parse(text) as Partial<SealedLoginV1>;
  } catch {
    return fail("sealed-unreadable", `${file} is not a sealed login`);
  }
  if (
    (raw as { v?: unknown })?.v === 2 &&
    raw.kind === KIND &&
    typeof raw.label === "string" &&
    isBoxRecord(raw)
  ) {
    return raw as unknown as SealedLoginV2;
  }
  if (
    raw?.v !== 1 ||
    raw.kind !== KIND ||
    typeof raw.label !== "string" ||
    typeof raw.key !== "string" ||
    typeof raw.iv !== "string" ||
    typeof raw.tag !== "string" ||
    typeof raw.data !== "string"
  ) {
    return fail("sealed-unreadable", `${file} is not a sealed login`);
  }
  return raw as SealedLoginV1;
}

const isFailure = (x: unknown): x is LoginSealFailure =>
  typeof x === "object" && x !== null && (x as { ok?: unknown }).ok === false;

/** Open a sealed record: the key it names, its label, and (device bound) a device key only. */
function openSealed(
  rec: SealedLogin,
  o: Readonly<{ keys: CredentialKeys; label: string; deviceBound: boolean; box?: SealBox | null }>,
): Buffer | LoginSealFailure {
  if (rec.label !== o.label) {
    return fail("sealed-does-not-open", `the sealed login is for "${rec.label}", not "${o.label}"`);
  }
  if (rec.v === 2) {
    if (!o.box || o.box.id !== rec.key || !o.box.canOpen()) {
      return fail(
        "key-unavailable",
        "the login is sealed to the Enclaweder's login box, which opens only at the start of a launch with a device-verified activation",
      );
    }
    const out = o.box.open(rec, aad(rec.label, rec.key));
    return (
      out ??
      fail(
        "sealed-does-not-open",
        "the sealed login does not open with its box (changed after it was sealed)",
      )
    );
  }
  if (o.deviceBound && !rec.key.startsWith("device:")) {
    return fail(
      "not-device-sealed",
      `an Enclaweder is bound, and this login was sealed with a ${rec.key.split(":")[0]} key, which a process of this user can read; it is not used`,
    );
  }
  const key = o.keys.read(rec.key);
  if (!key) {
    return fail(
      "key-unavailable",
      `the login is sealed with a key that is not available here (${rec.key.split(":")[0]}); bind that key's device`,
    );
  }
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(rec.iv, "base64"));
    d.setAAD(aad(rec.label, rec.key));
    d.setAuthTag(Buffer.from(rec.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(rec.data, "base64")), d.final()]);
  } catch {
    return fail(
      "sealed-does-not-open",
      "the sealed login does not open with its key (changed after it was sealed)",
    );
  }
}

export type LoginSealOptions = Readonly<{
  keys: CredentialKeys;
  /** An Enclaweder is bound: only the device key seals and opens. */
  deviceBound: boolean;
  /** What the record is for (bound as associated data); default "login". */
  label?: string;
  /**
   * Command set 0.5: the launch's login box (credential-keys.ts DeviceKeyState.boxes.login). Given,
   * a login is sealed to it (record v2), and a v2 record opens only while it can open.
   */
  box?: SealBox | null;
}>;

/**
 * A fresh record opens to `plain`: checked with the record's own key, or, for a box that no longer
 * opens (the launch closed it), taken as sealed (the box's construction is checked by its tests).
 */
function verifyOpen(
  rec: SealedLogin,
  o: Readonly<{ keys: CredentialKeys; label: string; deviceBound: boolean; box: SealBox | null }>,
  plain: Buffer,
): boolean {
  if (rec.v === 2 && !o.box?.canOpen()) {
    return true;
  }
  const back = openSealed(rec, o);
  if (isFailure(back)) {
    return false;
  }
  const same = back.equals(plain);
  back.fill(0);
  return same;
}

/**
 * Seal the plaintext login at `plainFile` into `sealedFile`, check that it
 * opens to the same bytes, then erase the plaintext. A failure leaves the
 * plaintext and any earlier sealed login as they were.
 */
export function sealLoginFile(
  o: LoginSealOptions & Readonly<{ plainFile: string; sealedFile: string }>,
): { ok: true; keyId: string; plaintextErased: boolean } | LoginSealFailure {
  const label = o.label ?? "login";
  const box = o.box ?? null;
  const problem = sealingKeyProblem(o.keys, o.deviceBound, box);
  if (problem) {
    return problem;
  }
  const plain = readLogin(o.plainFile);
  if (isFailure(plain)) {
    return plain;
  }
  const rec = sealBytes(plain, label, o.keys, box);
  const back = verifyOpen(rec, { keys: o.keys, label, deviceBound: o.deviceBound, box }, plain);
  if (!back) {
    return fail(
      "sealed-does-not-open",
      "the login did not open again after sealing; nothing was changed",
    );
  }
  writeSealed(o.sealedFile, rec);
  return { ok: true, keyId: rec.key, plaintextErased: eraseFile(o.plainFile) };
}

/**
 * Open the sealed login into `sessionFile`, whose directory is made fresh for
 * it (0700; it must not exist yet) and dedicated to it: the file is created
 * exclusively, 0600. No sealed login: only the directory is made (the host
 * logs in there, and the end of the session seals what it wrote).
 */
export function unsealLoginInto(
  o: LoginSealOptions & Readonly<{ sealedFile: string; sessionFile: string }>,
): { ok: true; unsealed: boolean; keyId: string | null } | LoginSealFailure {
  const label = o.label ?? "login";
  const rec = readSealed(o.sealedFile);
  if (isFailure(rec)) {
    return rec;
  }
  let plain: Buffer | null = null;
  if (rec) {
    const opened = openSealed(rec, { keys: o.keys, label, deviceBound: o.deviceBound, box: o.box });
    if (isFailure(opened)) {
      return opened;
    }
    plain = opened;
  }
  const dir = path.dirname(o.sessionFile);
  try {
    // Not recursive: the session's own private directory must already be
    // there, and this one must be new (nothing else may have prepared it).
    fs.mkdirSync(dir, { mode: 0o700 });
  } catch {
    return fail(
      "session-dir-exists",
      `${dir} already exists or cannot be made; the login is not opened there`,
    );
  }
  fs.chmodSync(dir, 0o700);
  if (!plain) {
    return { ok: true, unsealed: false, keyId: null };
  }
  let fd: number | null = null;
  try {
    fd = fs.openSync(
      o.sessionFile,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
      0o600,
    );
    fs.writeSync(fd, plain);
    fs.fsyncSync(fd);
  } catch (err) {
    eraseSessionLogin({ sessionFile: o.sessionFile });
    return fail(
      "session-write-failed",
      `the login could not be opened into ${o.sessionFile} (${(err as Error).message})`,
    );
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
    plain.fill(0);
  }
  return { ok: true, unsealed: true, keyId: rec!.key };
}

/**
 * Erase the session's plaintext: every regular file of `sessionFile`'s
 * (dedicated) directory is overwritten and removed (a host's half-written
 * temp file holds the login too), then the directory.
 */
export function eraseSessionLogin(o: Readonly<{ sessionFile: string }>): {
  erased: string[];
  remaining: string[];
} {
  const dir = path.dirname(o.sessionFile);
  const erased: string[] = [];
  const remaining: string[] = [];
  let names: string[] = [];
  try {
    if (fs.lstatSync(dir).isDirectory()) {
      names = fs.readdirSync(dir);
    }
  } catch {
    names = [];
  }
  const files = new Set([o.sessionFile, ...names.map((n) => path.join(dir, n))]);
  for (const f of [...files].toSorted()) {
    let present = false;
    try {
      fs.lstatSync(f);
      present = true;
    } catch {
      present = false;
    }
    if (!present) {
      continue;
    }
    (eraseFile(f) ? erased : remaining).push(f);
  }
  try {
    fs.rmdirSync(dir);
  } catch {
    /* already gone, or something is left (reported above) */
  }
  return { erased, remaining };
}

/**
 * The end of a session: seal what the host left in `sessionFile` (a token it
 * refreshed during the session) into `sealedFile`, then erase the session's
 * plaintext. No login left (the host logged out): the sealed login is erased
 * too. A login that cannot be sealed is erased all the same, and the earlier
 * sealed login is kept.
 */
export function resealFromSession(
  o: LoginSealOptions & Readonly<{ sessionFile: string; sealedFile: string }>,
):
  | {
      ok: true;
      action: "resealed" | "removed";
      keyId: string | null;
      erased: string[];
      remaining: string[];
    }
  | (LoginSealFailure & { erased: string[]; remaining: string[] }) {
  const label = o.label ?? "login";
  const plain = readLogin(o.sessionFile);
  let out: { ok: true; action: "resealed" | "removed"; keyId: string | null } | LoginSealFailure;
  if (isFailure(plain)) {
    if (plain.code === "no-login") {
      eraseFile(o.sealedFile);
      out = { ok: true, action: "removed", keyId: null };
    } else {
      out = plain;
    }
  } else {
    const box = o.box ?? null;
    const problem = sealingKeyProblem(o.keys, o.deviceBound, box);
    if (problem) {
      out = problem;
    } else {
      const rec = sealBytes(plain, label, o.keys, box);
      if (!verifyOpen(rec, { keys: o.keys, label, deviceBound: o.deviceBound, box }, plain)) {
        out = fail(
          "sealed-does-not-open",
          "the session's login did not open again after sealing; the earlier sealed login is kept",
        );
      } else {
        writeSealed(o.sealedFile, rec);
        out = { ok: true, action: "resealed", keyId: rec.key };
      }
    }
    plain.fill(0);
  }
  return { ...out, ...eraseSessionLogin({ sessionFile: o.sessionFile }) };
}

/**
 * Open the sealed login into memory only (the caller holds it, never writes
 * it): the same checks as unsealLoginInto. No sealed login: "no-login".
 */
export function unsealLoginToMemory(
  o: LoginSealOptions & Readonly<{ sealedFile: string }>,
): { ok: true; plain: Buffer; keyId: string } | LoginSealFailure {
  const label = o.label ?? "login";
  const rec = readSealed(o.sealedFile);
  if (isFailure(rec)) {
    return rec;
  }
  if (!rec) {
    return fail("no-login", `there is no sealed login at ${o.sealedFile}`);
  }
  const opened = openSealed(rec, { keys: o.keys, label, deviceBound: o.deviceBound, box: o.box });
  return isFailure(opened) ? opened : { ok: true, plain: opened, keyId: rec.key };
}

/**
 * Seal a login held in memory (a token renewed during the session) into
 * `sealedFile`, after checking that it opens to the same bytes.
 */
export function sealLoginBytes(
  o: LoginSealOptions & Readonly<{ plain: Buffer; sealedFile: string }>,
): { ok: true; keyId: string } | LoginSealFailure {
  const label = o.label ?? "login";
  const box = o.box ?? null;
  const problem = sealingKeyProblem(o.keys, o.deviceBound, box);
  if (problem) {
    return problem;
  }
  if (o.plain.length === 0 || o.plain.length > LOGIN_MAX_BYTES) {
    return fail("login-too-large", "the login is empty or larger than a login");
  }
  const rec = sealBytes(o.plain, label, o.keys, box);
  if (!verifyOpen(rec, { keys: o.keys, label, deviceBound: o.deviceBound, box }, o.plain)) {
    return fail(
      "sealed-does-not-open",
      "the login did not open again after sealing; the earlier sealed login is kept",
    );
  }
  writeSealed(o.sealedFile, rec);
  return { ok: true, keyId: rec.key };
}

/** Erase the sealed login (a halt whose adapter asks for a fresh login). */
export function eraseSealedLogin(o: Readonly<{ sealedFile: string }>): boolean {
  return eraseFile(o.sealedFile);
}

export type LoginSealStatus = Readonly<{
  sealed: Readonly<{
    present: boolean;
    keyId: string | null;
    keySource: string | null;
    readable: boolean;
  }>;
  /** Plaintext login files present among those named. */
  plaintext: readonly string[];
}>;

/** What is there: the sealed login (never opened) and any plaintext login files. Never returns secret values. */
export function loginSealStatus(
  o: Readonly<{ sealedFile: string; plainFiles: readonly string[] }>,
): LoginSealStatus {
  const rec = readSealed(o.sealedFile);
  const present = rec !== null;
  const ok = rec !== null && !isFailure(rec);
  const plaintext = [...new Set(o.plainFiles.map((f) => path.resolve(f)))].filter((f) => {
    try {
      fs.lstatSync(f);
      return true;
    } catch {
      return false;
    }
  });
  return {
    sealed: {
      present,
      keyId: ok ? rec.key : null,
      keySource: ok ? rec.key.split(":")[0] : null,
      readable: ok,
    },
    plaintext: plaintext.toSorted(),
  };
}

export type LoginLaunchDecision =
  | Readonly<{ action: "pass" }>
  | Readonly<{ action: "unseal" }>
  | Readonly<{ action: "seal-then-unseal"; plainFile: string }>
  | Readonly<{
      action: "refuse";
      code: "plaintext-beside-seal" | "plaintext-unsealed" | "device-required";
      message: string;
    }>;

/**
 * What a launch does with the login. No device and no sealed login: the host
 * runs as it always did ("pass"). Device bound and no plaintext login: the
 * sealed login (or none: a fresh login) goes into the session ("unseal").
 * Device bound, no sealed login yet, and one plaintext login: the login the
 * host would have used anyway is sealed first, so no plaintext outlives a
 * launch with the device ("seal-then-unseal"). Refused: a plaintext login next
 * to a sealed one (a copy that bypasses the seal, or a login someone else put
 * there: never adopted silently; a person seals it in place of the sealed one,
 * or removes it), two plaintext logins (which one is the login is not
 * guessed), and a sealed login with no device to open it.
 */
export function loginLaunchDecision(
  o: Readonly<{ deviceBound: boolean; status: LoginSealStatus }>,
): LoginLaunchDecision {
  const plain = o.status.plaintext;
  if (!o.deviceBound) {
    return o.status.sealed.present
      ? {
          action: "refuse",
          code: "device-required",
          message:
            "the login is sealed under an Enclaweder, and none is bound to this launch; attach the device the login was sealed with",
        }
      : { action: "pass" };
  }
  if (plain.length > 0) {
    return o.status.sealed.present
      ? {
          action: "refuse",
          code: "plaintext-beside-seal",
          message: `a plaintext login (${plain.join(", ")}) is present next to the sealed one: it is a copy that bypasses the seal, or a login someone else put there, and it is not used. Remove it, or seal it in place of the sealed login`,
        }
      : plain.length === 1
        ? { action: "seal-then-unseal", plainFile: plain[0] }
        : {
            action: "refuse",
            code: "plaintext-unsealed",
            message: `an Enclaweder is bound and there are ${plain.length} plaintext logins (${plain.join(", ")}); seal the one in use under the device and remove the others`,
          };
  }
  return { action: "unseal" };
}

export type LoginSealAudit = (
  event: Readonly<{ type: string; payload: Record<string, unknown> }>,
) => Promise<void>;

/**
 * Command set 0.5: move a login sealed under the CHALLENGE-derived device key (earlier versions,
 * credential-keys.ts) to the KEY_DERIVE key `keys.write`. The old record is opened once with the
 * CHALLENGE key (computed now, only for this), the login sealed again and checked to open, the new
 * record renamed into place, and the old record's bytes overwritten in place (through a descriptor
 * held on it, so nothing of the old form is left at the path or in its file), then `audit`ed
 * ("auth.login-seal.migrated", key kinds and ids only, never a secret). Nothing to do ("migrated:
 * false"): no sealed login, one already under KEY_DERIVE, or no KEY_DERIVE key here. An audit that
 * fails is "audit-failed" (the migration stands; the adapter does not start the session).
 */
export async function migrateLegacyLoginSeal(
  o: LoginSealOptions & Readonly<{ sealedFile: string; audit?: LoginSealAudit }>,
): Promise<
  | { ok: true; migrated: false }
  | { ok: true; migrated: true; from: string; to: string }
  | LoginSealFailure
> {
  const label = o.label ?? "login";
  const rec = readSealed(o.sealedFile);
  if (isFailure(rec)) {
    return rec;
  }
  if (!rec || deviceKeyIdForm(rec.key) !== "challenge") {
    return { ok: true, migrated: false };
  }
  if (deviceKeyIdForm(o.keys?.write?.id ?? "") !== "key-derive" || !o.keys.device?.legacy) {
    // Firmware before command set 0.5 (the CHALLENGE key still seals) or no device key: not here.
    return { ok: true, migrated: false };
  }
  const old = await o.keys.device.legacy().catch(() => null);
  if (!old || old.id !== rec.key) {
    old?.key.fill(0);
    return fail(
      "key-unavailable",
      "the login is sealed under the Enclaweder's earlier key, which this device does not give (another device, or the signature failed); it is not moved",
    );
  }
  const opened = openSealed(rec, {
    keys: { write: old, read: (id) => (id === old.id ? old.key : null), keyFile: o.keys.keyFile },
    label,
    deviceBound: true,
  });
  old.key.fill(0);
  if (isFailure(opened)) {
    return opened;
  }
  const next = sealBytes(opened, label, o.keys, o.box ?? null);
  const same = verifyOpen(
    next,
    { keys: o.keys, label, deviceBound: true, box: o.box ?? null },
    opened,
  );
  opened.fill(0);
  if (!same) {
    return fail(
      "sealed-does-not-open",
      "the login did not open again after sealing under the new key; the earlier sealed login is kept",
    );
  }
  // Hold the old record's file open, replace the path, then overwrite the old bytes through it.
  let fd: number | null = null;
  try {
    fd = fs.openSync(o.sealedFile, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
  } catch {
    fd = null;
  }
  try {
    writeSealed(o.sealedFile, next);
    if (fd !== null) {
      const n = Math.max(fs.fstatSync(fd).size, 1);
      fs.writeSync(fd, randomBytes(n), 0, n, 0);
      fs.fsyncSync(fd);
    }
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
  }
  const out = { ok: true as const, migrated: true as const, from: rec.key, to: next.key };
  if (o.audit) {
    try {
      await o.audit({
        type: "auth.login-seal.migrated",
        payload: {
          label,
          from: "device-challenge",
          to: "device-key-derive",
          fromKey: rec.key,
          toKey: next.key,
        },
      });
    } catch (err) {
      return fail(
        "audit-failed",
        `the login was moved to the Enclaweder's derived key, but the move could not be audited (${(err as Error)?.message ?? String(err)})`,
      );
    }
  }
  return out;
}
