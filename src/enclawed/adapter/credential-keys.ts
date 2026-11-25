// enclawed adapter kit: the key that seals Enclawed's credential store (the
// OAuth tokens and secret header values of remote MCP servers) and the host's
// login (login-seal.ts) at rest.
//
// Where the key lives, best first:
//
//   device    with an Enclaweder bound: a key the device derives, which
//             exists only while the device answers, never on disk.
//               command set 0.5 (proven by the device itself, never by a
//               version anyone relays): KEY_DERIVE, answered sealed and only
//               on an unspent activation of THIS launch (a device-counted
//               unlock use or a device-verified session-start code), once
//               per launch; kept in this process's memory for the launch.
//               Never CHALLENGE: CHALLENGE signs any 32 bytes for any process
//               of this user, so a key derived from it is theirs too. The
//               CHALLENGE key is computed only to open, once, a record sealed
//               under it before (login-seal.ts migrates it and erases it).
//               firmware before 0.5: the CHALLENGE-derived key (signed twice;
//               a device whose answer varies is not used), with
//               KEY_DERIVE_RESIDUAL reported. With the root required, never.
//   keyring   without a device: a random key in the OS keyring (libsecret
//             through secret-tool on Linux, the login Keychain on macOS),
//             when one is reachable.
//   file      else: a random key in a 0600 file of the adapter's protected
//             state, kept apart from the sealed records.
//
// A record names the key that sealed it (its source and a fingerprint), so a
// record sealed with a key that is not available here is refused by name,
// never decrypted with another key; records are AES-256-GCM with the server's
// URL and origin as associated data.

import { spawnSync } from "node:child_process";
import { createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type CommandSetProof,
  hardwareRootCommandSet,
  hardwareRootKeyDerivation,
  hardwareRootSigning,
  KEY_DERIVE_RESIDUAL,
  type KeyDeriveResult,
} from "../hardware-root/index.js";
import { type SealBox, sealBoxFromSeed } from "./sealed-box.js";

export type CredentialKeySource = "device" | "keyring" | "file";

/** Command set 0.5 on the bound device: its proof and KEY_DERIVE (the framework's seam, or a stand-in). */
export type CredentialKeyDerivation = Readonly<{
  /** The certified device key (hex): what the launch key is cached under. */
  pubkey: string;
  /** The device's own proof of its command set (activation.ts proveCommandSet05). */
  commandSet(): Promise<CommandSetProof>;
  /** KEY_DERIVE for a 32-byte label, on this launch's activation (key-derive.ts). */
  derive(label32: Buffer): Promise<KeyDeriveResult>;
}>;

/** A bound device (the framework's hardware-root seam, or a stand-in). */
export type CredentialKeyDevice = Readonly<{
  uid: string;
  /** CHALLENGE: the key of firmware before command set 0.5, and the one-time migration from it. */
  sign(message32: Buffer): Promise<Buffer>;
  /** Command set 0.5 (absent: a seam that predates it, treated as firmware before 0.5). */
  keyDerivation?: CredentialKeyDerivation | null;
}>;

/** The OS keyring, as the adapter reaches it (or a stand-in). */
export type CredentialKeyring = Readonly<{
  get(account: string): string | null;
  set(account: string, secret: string): boolean;
}>;

export type CredentialKey = Readonly<{ id: string; source: CredentialKeySource; key: Buffer }>;

/** How the device key was had, what it leaves open, and why there is none. */
export type DeviceKeyState = Readonly<{
  /** "key-derive": command set 0.5; "challenge": firmware before 0.5; null: no device key. */
  derivation: "key-derive" | "challenge" | null;
  /** What the key leaves open (KEY_DERIVE_RESIDUAL on firmware before 0.5), for the launch audit. */
  residual: string | null;
  /** Why the device gave no key (a bound device only), else null. */
  problem: string | null;
  /**
   * Command set 0.5 only: the CHALLENGE-derived key of earlier versions, computed on demand to open
   * a record sealed under it ONCE (login-seal.ts migrateLegacyLoginSeal); never a sealing key.
   */
  legacy: (() => Promise<CredentialKey | null>) | null;
  /**
   * Command set 0.5 only: the launch's sealed boxes (sealed-box.ts), each an X25519 key pair derived
   * from the same KEY_DERIVE answer under its own purpose: `login` (the host's login, login-seal.ts)
   * `context` (the session's context, context-seal.ts) and `tools` (credentials the session's tools
   * made, tool-credentials.ts). The adapter opens what it needs at the
   * start and closes them (and forgetLaunchCredentialKeys): their public keys still seal.
   */
  boxes?: LaunchBoxes | null;
}>;

/** The sealed boxes of one launch (command set 0.5). */
export type LaunchBoxes = Readonly<{ login: SealBox; context: SealBox; tools: SealBox }>;

/** The keys a store seals with (`write`) and opens with (`read`, by the id a record names). */
export type CredentialKeys = Readonly<{
  write: CredentialKey;
  read(id: string): Buffer | null;
  /** The key file (the store refuses to keep records next to it). */
  keyFile: string;
  /** The device key's state (absent: no device was offered). */
  device?: DeviceKeyState;
}>;

const KEY_TAG = "enclawed.adapter.credential-key.v1";
const fingerprint = (key: Buffer) =>
  createHash("sha256").update(KEY_TAG).update(key).digest("hex").slice(0, 16);

/** A device key id: `device:<uid>:<fingerprint>` (CHALLENGE) or `device:<uid>:kd:<fingerprint>` (KEY_DERIVE). */
export function deviceKeyIdForm(id: string): "challenge" | "key-derive" | null {
  if (/^device:[^:]+:kd:[0-9a-f]{16}$/.test(id)) {
    return "key-derive";
  }
  return /^device:[^:]+:[0-9a-f]{16}$/.test(id) ? "challenge" : null;
}

/** The KEY_DERIVE label of the credential key: SHA3-256 of its purpose and the device's uid. */
export function credentialKeyLabel(uid: string): Buffer {
  return createHash("sha3-256").update(`${KEY_TAG_V2}\0${uid}`).digest();
}

const KEY_TAG_V2 = "enclawed.adapter.credential-key.v2";

/**
 * The launch's derived keys, by certified device key: KEY_DERIVE answers once per activation, and
 * the login seal and the credential store share one key, so it is derived once and held in this
 * process's memory (never on disk) for the launch.
 */
const launchKeys = new Map<string, Buffer>();
/** The launch's sealed boxes, by certified device key, derived with the key (never on disk). */
const launchBoxes = new Map<string, LaunchBoxes>();

/** The purposes of the boxes: an HKDF info each, so no box's key follows from another's or the key's. */
const BOX_INFO = Object.freeze({
  login: "enclawed.adapter.login-box.v1",
  context: "enclawed.adapter.session-context-box.v1",
  tools: "enclawed.adapter.session-tool-credentials-box.v1",
} as const);

/**
 * Forget the launch's derived keys and close its boxes (the end of a launch's start, once what it
 * needs is open; tests). A key derived again needs a new activation of the launch.
 */
export function forgetLaunchCredentialKeys(): void {
  for (const k of launchKeys.values()) {
    k.fill(0);
  }
  launchKeys.clear();
  for (const b of launchBoxes.values()) {
    b.login.close();
    b.context.close();
    b.tools.close();
  }
  launchBoxes.clear();
}

function boxesOf(raw: Buffer, uid: string): LaunchBoxes {
  const make = (purpose: keyof typeof BOX_INFO) => {
    const seed = Buffer.from(
      hkdfSync("sha256", raw, Buffer.from(uid, "utf8"), BOX_INFO[purpose], 32),
    );
    try {
      return sealBoxFromSeed(seed, `device:${uid}:box:${purpose}`);
    } finally {
      seed.fill(0);
    }
  };
  return { login: make("login"), context: make("context"), tools: make("tools") };
}

const KEY_DERIVE_TEXT: Record<string, string> = {
  "no-activation":
    "this launch holds no fresh device-verified activation (an unlock use or a session-start code verified by the device in the last 120 s), and the key is derived only on one",
  refused:
    "the Enclaweder holds no such activation (it expired, was spent, or the device restarted)",
  unsupported:
    "the Enclaweder refused KEY_DERIVE although it proved command set 0.5 (something between this process and the device altered the request)",
  zeroized: "the Enclaweder was zeroized and must be recovered first",
  locked: "the Enclaweder's halt latch is set",
  "bad-response": "the Enclaweder's KEY_DERIVE answer did not verify under this request's seal",
};

type DeviceKeyOutcome = Readonly<{ key: CredentialKey | null; state: DeviceKeyState }>;

/**
 * The device key: KEY_DERIVE on command set 0.5 (proven by the device), else the CHALLENGE key of
 * older firmware (never when the root is required, and never when the command set is unproven).
 */
async function deviceKeyFor(
  device: CredentialKeyDevice,
  rootRequired: boolean,
): Promise<DeviceKeyOutcome> {
  const none = (problem: string): DeviceKeyOutcome => ({
    key: null,
    state: { derivation: null, residual: null, problem, legacy: null },
  });
  const kd = device.keyDerivation ?? null;
  const proof: CommandSetProof = kd
    ? await kd.commandSet().catch((err: unknown) => ({
        status: "unproven" as const,
        reason: (err as Error)?.message ?? String(err),
      }))
    : { status: "older", reason: "the device seam offers no command set 0.5" };
  if (proof.status === "proven" && kd) {
    let key = launchKeys.get(kd.pubkey) ?? null;
    if (!key) {
      const r = await kd
        .derive(credentialKeyLabel(device.uid))
        .catch(() => ({ ok: false as const, code: "bad-response" as const }));
      if (!r.ok) {
        return none(
          `the device key is not derived: ${KEY_DERIVE_TEXT[r.code] ?? r.code} (KEY_DERIVE ${r.code})`,
        );
      }
      key = Buffer.from(hkdfSync("sha256", r.key, Buffer.from(device.uid, "utf8"), KEY_TAG_V2, 32));
      launchBoxes.set(kd.pubkey, boxesOf(r.key, device.uid));
      r.key.fill(0);
      launchKeys.set(kd.pubkey, key);
    }
    return {
      key: { id: `device:${device.uid}:kd:${fingerprint(key)}`, source: "device", key },
      state: {
        derivation: "key-derive",
        residual: null,
        problem: null,
        legacy: () => challengeKey(device),
        boxes: launchBoxes.get(kd.pubkey) ?? null,
      },
    };
  }
  if (proof.status === "unproven") {
    return none(`the Enclaweder's command set is not proven (${proof.reason})`);
  }
  if (rootRequired) {
    const why = "reason" in proof ? proof.reason : "no KEY_DERIVE seam";
    return none(
      `the hardware root is required and the Enclaweder does not prove command set 0.5 (${why}); its key is derived only by KEY_DERIVE`,
    );
  }
  const key = await challengeKey(device);
  return key
    ? {
        key,
        state: {
          derivation: "challenge",
          residual: KEY_DERIVE_RESIDUAL,
          problem: null,
          legacy: null,
        },
      }
    : none("the Enclaweder's signature over the key message varies or failed");
}

/** The key a device derives: it signs a fixed, purpose-bound message twice; differing answers are not a key. */
async function challengeKey(device: CredentialKeyDevice): Promise<CredentialKey | null> {
  const message = createHash("sha256").update(`${KEY_TAG}\0${device.uid}`).digest();
  let a: Buffer;
  let b: Buffer;
  try {
    a = await device.sign(message);
    b = await device.sign(message);
  } catch {
    return null;
  }
  if (a.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  const key = Buffer.from(hkdfSync("sha256", a, Buffer.from(device.uid, "utf8"), KEY_TAG, 32));
  return { id: `device:${device.uid}:${fingerprint(key)}`, source: "device", key };
}

function readKeyFile(file: string): Buffer | null {
  let text: string;
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || (process.platform !== "win32" && (st.mode & 0o077) !== 0)) {
      // A key file others can read is not a protected key: not used.
      return null;
    }
    text = fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
  return /^[0-9a-f]{64}$/.test(text) ? Buffer.from(text, "hex") : null;
}

function createKeyFile(file: string): Buffer {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const key = randomBytes(32);
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, `${key.toString("hex")}\n`, { mode: 0o600 });
  try {
    // A key file that appeared meanwhile is kept (another process made it first).
    fs.linkSync(tmp, file);
  } catch {
    // linkSync fails when the file exists; that key is the one.
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  const k = readKeyFile(file);
  if (!k) {
    throw new Error(`the credential key file ${file} is not a protected key file`);
  }
  return k;
}

/**
 * The credential store's keys. `device`: the bound Enclaweder (null without
 * one); `keyring`: the OS keyring (null when none is reachable); `keyFile`:
 * the key file in the adapter's protected state (used, and made, only when
 * neither of the others seals).
 */
export async function credentialStoreKeys(
  o: Readonly<{
    keyFile: string;
    device?: CredentialKeyDevice | null;
    keyring?: CredentialKeyring | null;
    /** The hardware root is required: the device key is KEY_DERIVE's or none. */
    rootRequired?: boolean;
  }>,
): Promise<CredentialKeys> {
  const keys: CredentialKey[] = [];
  const outcome = o.device ? await deviceKeyFor(o.device, o.rootRequired === true) : null;
  const dev = outcome?.key ?? null;
  if (dev) {
    keys.push(dev);
  }
  const account = `credential-key:${createHash("sha256").update(path.resolve(o.keyFile)).digest("hex").slice(0, 16)}`;
  const fromRing = (hex: string | null): CredentialKey | null =>
    typeof hex === "string" && /^[0-9a-f]{64}$/.test(hex)
      ? (() => {
          const key = Buffer.from(hex, "hex");
          return { id: `keyring:${fingerprint(key)}`, source: "keyring" as const, key };
        })()
      : null;
  let ring: CredentialKey | null = null;
  try {
    ring = o.keyring ? fromRing(o.keyring.get(account)) : null;
  } catch {
    ring = null;
  }
  if (!dev && !ring && o.keyring) {
    const hex = randomBytes(32).toString("hex");
    try {
      // Only a key the keyring hands back again is used.
      ring = o.keyring.set(account, hex) ? fromRing(o.keyring.get(account)) : null;
    } catch {
      ring = null;
    }
  }
  if (ring) {
    keys.push(ring);
  }
  let fileKey = readKeyFile(o.keyFile);
  if (!fileKey && keys.length === 0) {
    fileKey = createKeyFile(o.keyFile);
  }
  if (fileKey) {
    keys.push({ id: `file:${fingerprint(fileKey)}`, source: "file", key: fileKey });
  }
  return {
    write: keys[0],
    read: (id) => keys.find((k) => k.id === id)?.key ?? null,
    keyFile: path.resolve(o.keyFile),
    ...(outcome ? { device: outcome.state } : {}),
  };
}

/**
 * The bound Enclaweder as a key device (the framework's hardware-root signing seam, its command-set
 * proof and KEY_DERIVE on the primary member), or null.
 */
export function frameworkCredentialKeyDevice(): CredentialKeyDevice | null {
  const signing = hardwareRootSigning();
  const member = signing?.members[0];
  if (!signing || !member) {
    return null;
  }
  const kd = hardwareRootKeyDerivation();
  return {
    uid: member.uid,
    sign: (message32) => signing.run(async (dev) => (await dev.challenge(message32)).sig),
    // A framework device always answers for its command set: with no KEY_DERIVE seam here (the
    // root is not CLEAN, or the members disagree) it is unproven, never "older".
    keyDerivation:
      kd && kd.uid === member.uid
        ? { pubkey: kd.pubkey, commandSet: hardwareRootCommandSet, derive: (l) => kd.derive(l) }
        : {
            pubkey: member.pubkey,
            commandSet: async () => ({
              status: "unproven",
              reason: "the hardware root offers no key derivation here (it is not CLEAN)",
            }),
            derive: async () => ({ ok: false, code: "no-activation" }),
          },
  };
}

const SERVICE = "enclawed";

/** The OS keyring through its command-line tool (secret-tool, security), or null when none is reachable. */
export function osKeyring(
  env: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
): CredentialKeyring | null {
  const run = (cmd: string, args: string[], input?: string) =>
    spawnSync(cmd, args, {
      input,
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, ...env } as NodeJS.ProcessEnv,
      windowsHide: true,
    });
  if (platform === "linux") {
    // libsecret needs the session bus; without it there is no keyring.
    if (!env.DBUS_SESSION_BUS_ADDRESS || run("secret-tool", ["--version"]).error) {
      return null;
    }
    return {
      get: (account) => {
        const r = run("secret-tool", ["lookup", "service", SERVICE, "account", account]);
        return r.status === 0 && r.stdout ? r.stdout.trim() : null;
      },
      set: (account, secret) =>
        run(
          "secret-tool",
          ["store", "--label=Enclawed credential key", "service", SERVICE, "account", account],
          secret,
        ).status === 0,
    };
  }
  if (platform === "darwin") {
    if (run("security", ["list-keychains"]).status !== 0) {
      return null;
    }
    return {
      get: (account) => {
        const r = run("security", ["find-generic-password", "-s", SERVICE, "-a", account, "-w"]);
        return r.status === 0 && r.stdout ? r.stdout.trim() : null;
      },
      // `security` takes the secret as an argument (it prompts on a terminal
      // otherwise); it is a random key, shown to no other user.
      set: (account, secret) =>
        run("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", account, "-w", secret])
          .status === 0,
    };
  }
  return null;
}
