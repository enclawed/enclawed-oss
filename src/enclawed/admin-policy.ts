// Admin policy: the only place a deployment's security posture may be
// loosened from.
//
// Premise: the host is already compromised at the uid that runs enclawed.
// Anything that uid can write (environment variables, ~/.enclawed/*, CLI
// flags) is an attacker-reachable knob, so in the enclaved flavor those
// sources may only TIGHTEN the posture. Loosening (allowlist entries, the
// flavor, the FIPS requirement, trust-root signers, the audit-log location,
// escape-hatch flags) is accepted only from an admin policy document that
// comes from one of:
//
//   1. a root-owned file, /etc/enclawed/policy.json: owned by root, mode no
//      wider than 0644, not a symlink, and every ancestor directory owned by
//      root and not writable by group or other (sticky world-writable
//      directories such as /tmp do not qualify for the file's own directory);
//   2. a signed document, policy.signed.json (in /etc/enclawed or the state
//      directory), whose payload is signed by an org key listed in the
//      root-owned /etc/enclawed/org-keys.json. A signed payload must carry
//      `expiresAt`, so an old, looser document cannot be replayed forever.
//   3. a device-attested document, policy.device.json (same locations), signed
//      by an Enclaweder with SIGN_ATTESTED: the device signs the document's
//      digest only in the same request as a fresh TOTP code it verified itself
//      (each 30 s step once), so the compromised uid cannot get it signed
//      without a person typing a current code. Accepted only when the device is
//      listed in the root-owned org-keys.json ("enclaweders"), its birth
//      certificate chains to a pinned manufacturer root (genuine), the summary
//      bound into the signature is the one recomputed from the document, and
//      the signature is fresh: made no later than now (+5 min skew), with
//      `expiresAt` at most DEVICE_POLICY_MAX_TTL_S after the device-attested
//      time. CHALLENGE signatures are never accepted: CHALLENGE signs any
//      nonce with no person involved.
//      Honest limit: the device has no display. A compromised host can show
//      the person one document and send another; the bound summary and the
//      device's signed history (LATCH_LOG event 11 with the digest
//      fingerprint) make that detectable afterwards, not impossible. Compare
//      the summary on an independent machine before typing the code.
//
// A valid signed document takes precedence over a device-attested one, and
// both over the plain root-owned file.
// A file that fails the ownership/mode checks, or a signed document that does
// not verify, is ignored and reported; it never loosens anything.
//
// Schema (v1; unknown top-level keys are refused so a typo is not silently
// ignored):
//
//   {
//     "v": 1,
//     "flavor": "enclaved" | "open",
//     "fipsRequired": true | false,
//     "classificationScheme": "<built-in scheme id>",
//     "policy": { ...same shape as enclawed.policy... },
//     "audit": { "path": "/abs/audit.jsonl", "allowUserFallback": false },
//     "trustRoot": { "signers": [ { keyId, publicKeyPem, approvedClearance, ... } ] },
//     "allow": {
//       "dangerousConfigFlags": ["gateway.controlUi.allowInsecureAuth", ...],
//       "gatewayAuthNone": false
//     },
//     "expiresAt": "2027-01-01T00:00:00Z"   // required in signed payloads
//   }
//
// Windows has no root-owned path check here; there, no admin policy is ever
// found and the enclaved flavor runs at its deny-by-default posture.
//
// Programmatic bootstrap options (code that calls bootstrapEnclawed()) are
// part of the trusted computing base and are not restricted by this module:
// code running in the process can already do anything the process can.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse as parsePath, resolve as resolvePath } from "node:path";
import { resolveWorkspaceDirInfo } from "../infra/workspace-dir.js";
import { verifyCert } from "./hardware-root/enclaweder-hid.js";
import {
  type AttestedRecord,
  type DeviceTotpAccess,
  type DeviceTotpFailure,
  deviceSignAttested,
  verifyAttestedRecord,
} from "./hardware-root/totp-verify.js";

export const SYSTEM_POLICY_DIR = "/etc/enclawed";
export const ADMIN_POLICY_FILENAME = "policy.json";
export const SIGNED_POLICY_FILENAME = "policy.signed.json";
export const ORG_KEYS_FILENAME = "org-keys.json";
export const DEVICE_POLICY_FILENAME = "policy.device.json";
/** Longest a device-attested policy may stay valid after the device signed it. */
export const DEVICE_POLICY_MAX_TTL_S = 90 * 24 * 3600;
/** Clock skew tolerated between the device-attested time and this host. */
export const DEVICE_POLICY_SKEW_S = 300;

/** Domain separator for admin-policy signatures. */
export const ADMIN_POLICY_SIGNING_DOMAIN = "enclawed-admin-policy-v1\0";

export type AdminPolicyDoc = Readonly<{
  v: 1;
  flavor?: "enclaved" | "open";
  fipsRequired?: boolean;
  classificationScheme?: string;
  policy?: unknown;
  audit?: Readonly<{ path?: string; allowUserFallback?: boolean }>;
  trustRoot?: Readonly<{ signers: ReadonlyArray<unknown> }>;
  allow?: Readonly<{
    dangerousConfigFlags?: ReadonlyArray<string>;
    gatewayAuthNone?: boolean;
    /**
     * Device retirement: allows ENCLAWEDER_ROOT=optional in the enclaved
     * flavor (start software-only after a session a now-absent Enclaweder
     * accredited). Refused from the user environment otherwise.
     */
    hardwareRootOptional?: boolean;
    /**
     * Absolute path the enclaved flavor accepts for ENCLAWED_BUNDLED_PLUGINS_DIR
     * (a relocated bundled plugin tree). Any other value of the variable is
     * refused at startup.
     */
    bundledPluginsDir?: string;
  }>;
  expiresAt?: string;
}>;

export type AdminPolicySource =
  | Readonly<{ kind: "root-file"; path: string }>
  | Readonly<{ kind: "signed"; path: string; keyId: string }>
  | Readonly<{ kind: "device-attested"; path: string; device: string }>;

export type AdminPolicy = Readonly<{ source: AdminPolicySource; doc: AdminPolicyDoc }>;

export type AdminPolicyLoad = Readonly<{
  admin: AdminPolicy | null;
  /** Documents that were found but ignored (insecure ownership, bad signature, ...). */
  ignored: ReadonlyArray<string>;
  /**
   * Set when a document that passed the ownership/signature checks does not
   * parse: the admin wrote something broken. The enclaved flavor refuses to
   * start on it rather than guess.
   */
  invalid: string | null;
}>;

export type AdminPolicyLoadOptions = {
  /** Directory holding policy.json / org-keys.json. Default /etc/enclawed. */
  systemDir?: string;
  /** Extra directory searched for policy.signed.json (the state dir). */
  stateDir?: string;
  /**
   * uids accepted as "root" for the ownership checks. Default [0]. Tests pass
   * their own uid; production code never sets this from the environment.
   */
  trustedUids?: ReadonlyArray<number>;
  /**
   * The uid map the root-ownership checks treat as this process's (default: read
   * /proc/self/uid_map). Tests that must run inside `unshare -r` pass the
   * initial-namespace map; production code never sets this.
   */
  uidMap?: string | null;
  /** Demand this manufacturer root for device certificates instead of the pinned ones (tests). */
  deviceRootPubkey?: Buffer;
  now?: () => Date;
  platform?: NodeJS.Platform;
};

const TOP_KEYS = new Set([
  "v",
  "flavor",
  "fipsRequired",
  "classificationScheme",
  "policy",
  "audit",
  "trustRoot",
  "allow",
  "expiresAt",
  "description",
  "issuedAt",
]);

export type SecureFileCheck = Readonly<{ ok: true }> | Readonly<{ ok: false; reason: string }>;

/**
 * Check that `path` is a regular file owned by a trusted uid with mode no
 * wider than 0644, that it is not a symlink, and that no ancestor directory is
 * a symlink, owned by an untrusted uid, or writable by group/other. ENOENT is
 * reported as `{ ok: false, reason: "ENOENT" }`.
 */
export function checkRootOwnedFile(
  path: string,
  trustedUids: ReadonlyArray<number> = [0],
  opts: { uidMap?: string | null } = {},
): SecureFileCheck {
  const abs = resolvePath(path);
  let st;
  try {
    st = lstatSync(abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "UNKNOWN";
    return { ok: false, reason: code };
  }
  // Checked once the file exists (an absent policy is not an error).
  // Inside a non-initial user namespace (`unshare -r -m`), an unprivileged
  // user appears as uid 0 and can bind-mount their own directory over
  // /etc/enclawed, so ownership checks prove nothing. Refuse unless this
  // process sees the identity uid map of the initial namespace.
  const uidMap = opts.uidMap === undefined ? readUidMap() : opts.uidMap;
  if (uidMap !== null && !isInitialUidMap(uidMap)) {
    return { ok: false, reason: "this process runs in a non-initial user namespace" };
  }
  if (st.isSymbolicLink()) {
    return { ok: false, reason: `${abs} is a symlink` };
  }
  if (!st.isFile()) {
    return { ok: false, reason: `${abs} is not a regular file` };
  }
  if (!trustedUids.includes(st.uid)) {
    return { ok: false, reason: `${abs} is owned by uid ${st.uid}, not root` };
  }
  if ((st.mode & 0o7777 & ~0o644) !== 0) {
    return {
      ok: false,
      reason: `${abs} has mode ${(st.mode & 0o7777).toString(8)}, wider than 0644`,
    };
  }
  // Walk the ancestors up to the filesystem root.
  const root = parsePath(abs).root;
  let dir = dirname(abs);
  let first = true;
  for (;;) {
    let ds;
    try {
      ds = lstatSync(dir);
    } catch (err) {
      return { ok: false, reason: `${dir}: ${(err as NodeJS.ErrnoException).code ?? "UNKNOWN"}` };
    }
    if (ds.isSymbolicLink()) {
      return { ok: false, reason: `${dir} is a symlink` };
    }
    if (!ds.isDirectory()) {
      return { ok: false, reason: `${dir} is not a directory` };
    }
    if (!trustedUids.includes(ds.uid) && ds.uid !== 0) {
      return { ok: false, reason: `${dir} is owned by uid ${ds.uid}, not root` };
    }
    const groupOtherWritable = (ds.mode & 0o022) !== 0;
    const sticky = (ds.mode & 0o1000) !== 0;
    // The file's own directory must not be writable by anyone else at all; a
    // sticky world-writable ancestor (like /tmp) only protects existing
    // entries, which is enough for ancestors but not for the policy directory.
    if (groupOtherWritable && (first || !sticky)) {
      return { ok: false, reason: `${dir} is writable by group or other` };
    }
    if (dir === root) {
      break;
    }
    dir = dirname(dir);
    first = false;
  }
  return { ok: true };
}

/** /proc/self/uid_map, or null where it does not exist (non-Linux). */
function readUidMap(): string | null {
  if (process.platform !== "linux") {
    return null;
  }
  try {
    return readFileSync("/proc/self/uid_map", "utf8");
  } catch {
    // Linux without a readable uid_map: cannot prove the initial namespace.
    return "";
  }
}

export function isInitialUidMap(map: string): boolean {
  const lines = map.trim().split("\n").filter(Boolean);
  return lines.length === 1 && /^\s*0\s+0\s+4294967295\s*$/.test(lines[0]);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Validate an admin-policy document's shape. Throws TypeError on any problem. */
export function parseAdminPolicyDoc(raw: unknown, opts: { signed?: boolean } = {}): AdminPolicyDoc {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("admin policy must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) {
    throw new TypeError('admin policy "v" must be 1');
  }
  for (const key of Object.keys(o)) {
    if (!TOP_KEYS.has(key)) {
      throw new TypeError(`admin policy key "${key}" is not a known setting`);
    }
  }
  if (o.flavor !== undefined && o.flavor !== "enclaved" && o.flavor !== "open") {
    throw new TypeError('admin policy "flavor" must be "enclaved" or "open"');
  }
  if (o.fipsRequired !== undefined && typeof o.fipsRequired !== "boolean") {
    throw new TypeError('admin policy "fipsRequired" must be a boolean');
  }
  if (o.classificationScheme !== undefined && typeof o.classificationScheme !== "string") {
    throw new TypeError('admin policy "classificationScheme" must be a string');
  }
  if (o.audit !== undefined) {
    const a = o.audit as Record<string, unknown>;
    if (!a || typeof a !== "object" || Array.isArray(a)) {
      throw new TypeError('admin policy "audit" must be an object');
    }
    if (a.path !== undefined && (typeof a.path !== "string" || !isAbsolute(a.path))) {
      throw new TypeError('admin policy "audit.path" must be an absolute path');
    }
    if (a.allowUserFallback !== undefined && typeof a.allowUserFallback !== "boolean") {
      throw new TypeError('admin policy "audit.allowUserFallback" must be a boolean');
    }
  }
  if (o.trustRoot !== undefined) {
    const t = o.trustRoot as Record<string, unknown>;
    if (!t || typeof t !== "object" || !Array.isArray(t.signers)) {
      throw new TypeError('admin policy "trustRoot.signers" must be an array');
    }
  }
  if (o.allow !== undefined) {
    const a = o.allow as Record<string, unknown>;
    if (!a || typeof a !== "object" || Array.isArray(a)) {
      throw new TypeError('admin policy "allow" must be an object');
    }
    if (a.dangerousConfigFlags !== undefined && !isStringArray(a.dangerousConfigFlags)) {
      throw new TypeError('admin policy "allow.dangerousConfigFlags" must be a string array');
    }
    if (a.gatewayAuthNone !== undefined && typeof a.gatewayAuthNone !== "boolean") {
      throw new TypeError('admin policy "allow.gatewayAuthNone" must be a boolean');
    }
    if (a.hardwareRootOptional !== undefined && typeof a.hardwareRootOptional !== "boolean") {
      throw new TypeError('admin policy "allow.hardwareRootOptional" must be a boolean');
    }
    if (
      a.bundledPluginsDir !== undefined &&
      (typeof a.bundledPluginsDir !== "string" || !a.bundledPluginsDir.startsWith("/"))
    ) {
      throw new TypeError('admin policy "allow.bundledPluginsDir" must be an absolute path');
    }
  }
  if (
    o.expiresAt !== undefined &&
    (typeof o.expiresAt !== "string" || Number.isNaN(Date.parse(o.expiresAt)))
  ) {
    throw new TypeError('admin policy "expiresAt" must be an ISO date');
  }
  if (opts.signed && o.expiresAt === undefined) {
    throw new TypeError('a signed admin policy must carry "expiresAt"');
  }
  return Object.freeze({ ...(o as AdminPolicyDoc) });
}

type OrgKey = { keyId: string; publicKeyPem: string };

type OrgDevice = { uid: Buffer; pubkey: Buffer; label: string };

function readOrgKeys(
  path: string,
  trustedUids: ReadonlyArray<number>,
  uidMap?: string | null,
): { keys: OrgKey[]; devices: OrgDevice[] } | string {
  const check = checkRootOwnedFile(path, trustedUids, uidMap === undefined ? {} : { uidMap });
  if (!check.ok) {
    return check.reason === "ENOENT"
      ? { keys: [], devices: [] }
      : `org keys ignored: ${check.reason}`;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return `org keys ignored: ${path} is not valid JSON (${(err as Error).message})`;
  }
  const keys = (parsed as { keys?: unknown })?.keys;
  if (!Array.isArray(keys)) {
    return `org keys ignored: ${path} has no "keys" array`;
  }
  const out: OrgKey[] = [];
  for (const k of keys as Array<Record<string, unknown>>) {
    if (typeof k?.keyId !== "string") {
      continue;
    }
    if (typeof k.publicKeyPem === "string") {
      out.push({ keyId: k.keyId, publicKeyPem: k.publicKeyPem });
    }
  }
  // Enclaweders allowed to approve a policy with SIGN_ATTESTED (uid 12 B, identity key 32 B, hex).
  // Any genuine device could otherwise sign: an attacker can own a genuine Enclaweder too.
  const devices: OrgDevice[] = [];
  const devs = (parsed as { enclaweders?: unknown })?.enclaweders;
  for (const d of Array.isArray(devs) ? (devs as Array<Record<string, unknown>>) : []) {
    if (
      typeof d?.uid === "string" &&
      /^[0-9a-f]{24}$/.test(d.uid) &&
      typeof d.pubkey === "string" &&
      /^[0-9a-f]{64}$/.test(d.pubkey)
    ) {
      devices.push({
        uid: Buffer.from(d.uid, "hex"),
        pubkey: Buffer.from(d.pubkey, "hex"),
        label: typeof d.label === "string" ? d.label : d.uid,
      });
    }
  }
  return { keys: out, devices };
}

function verifySignature(key: OrgKey, payload: Buffer, sig: Buffer): boolean {
  try {
    const msg = Buffer.concat([Buffer.from(ADMIN_POLICY_SIGNING_DOMAIN, "utf8"), payload]);
    return edVerify(null, msg, createPublicKey(key.publicKeyPem), sig);
  } catch {
    return false;
  }
}

/** Sign an admin-policy document with an org Ed25519 private key (offline tooling, tests). */
export function signAdminPolicy(
  doc: AdminPolicyDoc,
  keyId: string,
  privateKeyPem: string,
): { v: 1; payload: string; keyId: string; sig: string } {
  parseAdminPolicyDoc(doc, { signed: true });
  const payload = Buffer.from(JSON.stringify(doc), "utf8");
  const msg = Buffer.concat([Buffer.from(ADMIN_POLICY_SIGNING_DOMAIN, "utf8"), payload]);
  const sig = edSign(null, msg, createPrivateKey(privateKeyPem)).toString("base64");
  return { v: 1, payload: payload.toString("base64"), keyId, sig };
}

type SignedEnvelope = { v: 1; payload: string; keyId: string; sig: string };

function readSigned(
  path: string,
  orgKeys: OrgKey[],
  now: Date,
): { ok: true; doc: AdminPolicyDoc; keyId: string } | { ok: false; reason: string } | null {
  let raw: string;
  try {
    // Reject a symlinked signed document too: it must be a plain file.
    if (lstatSync(path).isSymbolicLink()) {
      return { ok: false, reason: `${path} is a symlink` };
    }
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    return { ok: false, reason: `${path}: ${(err as Error).message}` };
  }
  let env: SignedEnvelope;
  try {
    env = JSON.parse(raw) as SignedEnvelope;
  } catch {
    return { ok: false, reason: `${path} is not valid JSON` };
  }
  if (
    env?.v !== 1 ||
    typeof env.payload !== "string" ||
    typeof env.keyId !== "string" ||
    typeof env.sig !== "string"
  ) {
    return { ok: false, reason: `${path} is not a signed admin-policy envelope` };
  }
  const key = orgKeys.find((k) => k.keyId === env.keyId);
  if (!key) {
    return { ok: false, reason: `${path} is signed by "${env.keyId}", which is not an org key` };
  }
  const payload = Buffer.from(env.payload, "base64");
  if (!verifySignature(key, payload, Buffer.from(env.sig, "base64"))) {
    return { ok: false, reason: `${path}: signature does not verify` };
  }
  let doc: AdminPolicyDoc;
  try {
    doc = parseAdminPolicyDoc(JSON.parse(payload.toString("utf8")), { signed: true });
  } catch (err) {
    return { ok: false, reason: `${path}: ${(err as Error).message}` };
  }
  if (Date.parse(doc.expiresAt as string) <= now.getTime()) {
    return { ok: false, reason: `${path} expired at ${doc.expiresAt}` };
  }
  return { ok: true, doc, keyId: env.keyId };
}

// ─── Device-attested documents (Enclaweder SIGN_ATTESTED) ────────────────

/**
 * The short, human-readable summary of a document that the person is shown before typing the
 * code, and that the device binds (as SHA3-256) into its signature. Deterministic: a verifier
 * recomputes it from the document, so a summary that does not describe the document is refused.
 */
export function adminPolicySummary(payload: Buffer): string {
  const digest = createHash("sha3-256").update(payload).digest("hex");
  const doc = parseAdminPolicyDoc(JSON.parse(payload.toString("utf8")), { signed: true });
  const parts = [`Enclawed admin policy ${digest.slice(0, 16)}`];
  if (doc.flavor !== undefined) {
    parts.push(`flavor=${doc.flavor}`);
  }
  if (doc.fipsRequired !== undefined) {
    parts.push(`fipsRequired=${String(doc.fipsRequired)}`);
  }
  if (doc.classificationScheme !== undefined) {
    parts.push(`classificationScheme=${doc.classificationScheme}`);
  }
  if (doc.policy !== undefined) {
    parts.push("policy=replaced");
  }
  if (doc.audit !== undefined) {
    parts.push(
      `audit.path=${doc.audit.path ?? "-"} allowUserFallback=${String(doc.audit.allowUserFallback ?? false)}`,
    );
  }
  if (doc.trustRoot !== undefined) {
    parts.push(`trustRoot.signers=${doc.trustRoot.signers.length}`);
  }
  if (doc.allow?.dangerousConfigFlags?.length) {
    parts.push(
      `allow.dangerousConfigFlags=${[...doc.allow.dangerousConfigFlags].toSorted().join(",")}`,
    );
  }
  if (doc.allow?.gatewayAuthNone !== undefined) {
    parts.push(`allow.gatewayAuthNone=${String(doc.allow.gatewayAuthNone)}`);
  }
  if (doc.allow?.hardwareRootOptional !== undefined) {
    parts.push(`allow.hardwareRootOptional=${String(doc.allow.hardwareRootOptional)}`);
  }
  if (doc.allow?.bundledPluginsDir !== undefined) {
    parts.push(`allow.bundledPluginsDir=${doc.allow.bundledPluginsDir}`);
  }
  parts.push(`expires ${doc.expiresAt}`);
  return parts.join("; ");
}

export type DeviceAttestedEnvelope = {
  v: 1;
  kind: "enclaweder-attested";
  payload: string; // base64 of the exact document bytes
  summary: string;
  device: { uid: string; pubkey: string; cert: string };
  attestation: AttestedRecord;
};

/**
 * Has the bound Enclaweder approve a policy document: the person was shown `adminPolicySummary`
 * and typed a current code; the device verifies the code and, in the same request, signs the
 * document digest. Refused unless the device's certificate proves it genuine and the signature
 * verifies over a fresh nonce with a step near this host's clock. Returns the envelope to write
 * as policy.device.json (the loader still requires the device in the root-owned org-keys.json).
 */
export async function attestAdminPolicyWithDevice(
  access: DeviceTotpAccess & { cert: Buffer },
  p: { doc: AdminPolicyDoc; code: string; nowS?: number; rootPubkey?: Buffer },
): Promise<
  | { ok: true; envelope: DeviceAttestedEnvelope; summary: string }
  | { ok: false; code: DeviceTotpFailure | "not-genuine" | "invalid-document"; reason?: string }
> {
  if (!verifyCert(access.cert, access.uid, access.pubkeyRaw, p.rootPubkey ?? null)) {
    return { ok: false, code: "not-genuine" };
  }
  let payload: Buffer;
  let summary: string;
  try {
    parseAdminPolicyDoc(p.doc, { signed: true });
    payload = Buffer.from(JSON.stringify(p.doc), "utf8");
    summary = adminPolicySummary(payload);
  } catch (err) {
    return { ok: false, code: "invalid-document", reason: (err as Error).message };
  }
  const digest = createHash("sha3-256").update(payload).digest();
  const r = await deviceSignAttested(access, {
    code: p.code,
    purpose: "admin-policy",
    digest,
    summaryText: summary,
    ...(p.nowS !== undefined ? { nowS: p.nowS } : {}),
  });
  if (!r.ok) {
    return r;
  }
  return {
    ok: true,
    summary,
    envelope: {
      v: 1,
      kind: "enclaweder-attested",
      payload: payload.toString("base64"),
      summary,
      device: {
        uid: access.uid.toString("hex"),
        pubkey: access.pubkeyRaw.toString("hex"),
        cert: access.cert.toString("hex"),
      },
      attestation: r.record,
    },
  };
}

function readDeviceAttested(
  path: string,
  devices: OrgDevice[],
  now: Date,
  rootPubkey: Buffer | null,
): { ok: true; doc: AdminPolicyDoc; device: string } | { ok: false; reason: string } | null {
  let raw: string;
  try {
    if (lstatSync(path).isSymbolicLink()) {
      return { ok: false, reason: `${path} is a symlink` };
    }
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    return { ok: false, reason: `${path}: ${(err as Error).message}` };
  }
  let env: DeviceAttestedEnvelope;
  try {
    env = JSON.parse(raw) as DeviceAttestedEnvelope;
  } catch {
    return { ok: false, reason: `${path} is not valid JSON` };
  }
  const hex = (v: unknown, n: number) =>
    typeof v === "string" && v.length === n * 2 && /^[0-9a-f]+$/.test(v)
      ? Buffer.from(v, "hex")
      : null;
  const uid = hex(env?.device?.uid, 12);
  const pub = hex(env?.device?.pubkey, 32);
  const cert = hex(env?.device?.cert, 119);
  if (
    env?.v !== 1 ||
    env.kind !== "enclaweder-attested" ||
    typeof env.payload !== "string" ||
    typeof env.summary !== "string" ||
    !uid ||
    !pub ||
    !cert
  ) {
    return { ok: false, reason: `${path} is not a device-attested admin-policy envelope` };
  }
  const listed = devices.find((d) => d.uid.equals(uid) && d.pubkey.equals(pub));
  if (!listed) {
    return {
      ok: false,
      reason: `${path} is attested by Enclaweder ${uid.toString("hex")}, which is not listed in org-keys.json`,
    };
  }
  if (!verifyCert(cert, uid, pub, rootPubkey)) {
    return {
      ok: false,
      reason: `${path}: the attesting device is not genuine (certificate does not verify)`,
    };
  }
  const payload = Buffer.from(env.payload, "base64");
  let doc: AdminPolicyDoc;
  let summary: string;
  try {
    doc = parseAdminPolicyDoc(JSON.parse(payload.toString("utf8")), { signed: true });
    summary = adminPolicySummary(payload);
  } catch (err) {
    return { ok: false, reason: `${path}: ${(err as Error).message}` };
  }
  if (env.summary !== summary) {
    return { ok: false, reason: `${path}: the summary does not describe the document` };
  }
  const v = verifyAttestedRecord(env.attestation, {
    purpose: "admin-policy",
    digest: createHash("sha3-256").update(payload).digest(),
    summaryText: summary,
    pubkeyRaw: pub,
    uid,
  });
  if (!v.ok) {
    return { ok: false, reason: `${path}: ${v.reason}` };
  }
  const nowS = Math.floor(now.getTime() / 1000);
  const expS = Math.floor(Date.parse(doc.expiresAt as string) / 1000);
  if (v.stepTimeS > nowS + DEVICE_POLICY_SKEW_S) {
    return { ok: false, reason: `${path}: the device-attested time is in the future` };
  }
  if (expS > v.stepTimeS + DEVICE_POLICY_MAX_TTL_S) {
    return {
      ok: false,
      reason: `${path}: expiresAt is more than ${DEVICE_POLICY_MAX_TTL_S / 86400} days after the device approved it`,
    };
  }
  if (expS <= nowS) {
    return { ok: false, reason: `${path} expired at ${doc.expiresAt}` };
  }
  return { ok: true, doc, device: listed.label };
}

/** Load the admin policy from the root-owned and signed locations. Never throws. */
export function loadAdminPolicy(opts: AdminPolicyLoadOptions = {}): AdminPolicyLoad {
  const platform = opts.platform ?? process.platform;
  if (platform === "win32") {
    return { admin: null, ignored: [], invalid: null };
  }
  const systemDir = opts.systemDir ?? SYSTEM_POLICY_DIR;
  const trustedUids = opts.trustedUids ?? [0];
  const now = (opts.now ?? (() => new Date()))();
  const ignored: string[] = [];

  const orgKeysRes = readOrgKeys(join(systemDir, ORG_KEYS_FILENAME), trustedUids, opts.uidMap);
  const orgKeys = typeof orgKeysRes === "string" ? [] : orgKeysRes.keys;
  const orgDevices = typeof orgKeysRes === "string" ? [] : orgKeysRes.devices;
  if (typeof orgKeysRes === "string") {
    ignored.push(orgKeysRes);
  }

  const signedPaths = [join(systemDir, SIGNED_POLICY_FILENAME)];
  if (opts.stateDir) {
    signedPaths.push(join(opts.stateDir, SIGNED_POLICY_FILENAME));
  }
  for (const p of signedPaths) {
    const res = readSigned(p, orgKeys, now);
    if (res === null) {
      continue;
    }
    if (res.ok) {
      return {
        admin: Object.freeze({
          source: Object.freeze({ kind: "signed", path: p, keyId: res.keyId }),
          doc: res.doc,
        }),
        ignored,
        invalid: null,
      };
    }
    ignored.push(`signed admin policy ignored: ${res.reason}`);
  }

  const devicePaths = [join(systemDir, DEVICE_POLICY_FILENAME)];
  if (opts.stateDir) {
    devicePaths.push(join(opts.stateDir, DEVICE_POLICY_FILENAME));
  }
  for (const p of devicePaths) {
    const res = readDeviceAttested(p, orgDevices, now, opts.deviceRootPubkey ?? null);
    if (res === null) {
      continue;
    }
    if (res.ok) {
      return {
        admin: Object.freeze({
          source: Object.freeze({ kind: "device-attested", path: p, device: res.device }),
          doc: res.doc,
        }),
        ignored,
        invalid: null,
      };
    }
    ignored.push(`device-attested admin policy ignored: ${res.reason}`);
  }

  const filePath = join(systemDir, ADMIN_POLICY_FILENAME);
  const check = checkRootOwnedFile(
    filePath,
    trustedUids,
    opts.uidMap === undefined ? {} : { uidMap: opts.uidMap },
  );
  if (!check.ok) {
    if (check.reason !== "ENOENT") {
      ignored.push(`admin policy ${filePath} ignored: ${check.reason}`);
    }
    return { admin: null, ignored, invalid: null };
  }
  try {
    const doc = parseAdminPolicyDoc(JSON.parse(readFileSync(filePath, "utf8")));
    return {
      admin: Object.freeze({ source: Object.freeze({ kind: "root-file", path: filePath }), doc }),
      ignored,
      invalid: null,
    };
  } catch (err) {
    return { admin: null, ignored, invalid: `${filePath}: ${(err as Error).message}` };
  }
}

// Process-wide cache: the admin policy is read once and then fixed, like the
// flavor. bootstrapEnclawed() sets it explicitly (so tests can inject one);
// other readers (pre-bootstrap flavor resolution, CLI commands, the gateway's
// escape-hatch checks) fall back to loading from the default locations.
const ADMIN_KEY = Symbol.for("enclawed.admin-policy");
type GlobalWithAdmin = typeof globalThis & { [ADMIN_KEY]?: AdminPolicyLoad };

export function setActiveAdminPolicy(load: AdminPolicyLoad): void {
  (globalThis as GlobalWithAdmin)[ADMIN_KEY] = Object.freeze(load);
}

export function clearActiveAdminPolicy(): void {
  delete (globalThis as GlobalWithAdmin)[ADMIN_KEY];
}

export function getActiveAdminPolicyLoad(): AdminPolicyLoad {
  const g = globalThis as GlobalWithAdmin;
  if (!g[ADMIN_KEY]) {
    g[ADMIN_KEY] = Object.freeze(loadAdminPolicy({ stateDir: defaultStateDir() }));
  }
  return g[ADMIN_KEY];
}

function defaultStateDir(): string | undefined {
  try {
    return resolveWorkspaceDirInfo({ env: process.env }).path;
  } catch {
    return undefined;
  }
}

export function getActiveAdminPolicy(): AdminPolicy | null {
  return getActiveAdminPolicyLoad().admin;
}

/** True when the admin policy explicitly allows the named dangerous config flag. */
export function adminAllowsDangerousFlag(flag: string): boolean {
  return getActiveAdminPolicy()?.doc.allow?.dangerousConfigFlags?.includes(flag) === true;
}

/** True when the admin policy explicitly allows gateway.auth.mode "none". */
export function adminAllowsGatewayAuthNone(): boolean {
  return getActiveAdminPolicy()?.doc.allow?.gatewayAuthNone === true;
}

/** True when the admin policy explicitly allows ENCLAWEDER_ROOT=optional (device retirement). */
export function adminAllowsHardwareRootOptional(): boolean {
  return getActiveAdminPolicy()?.doc.allow?.hardwareRootOptional === true;
}

/** Human-readable source of the admin policy, for the boot record and `policy show`. */
export function describeAdminSource(admin: AdminPolicy | null): string {
  if (!admin) {
    return "none";
  }
  if (admin.source.kind === "signed") {
    return `signed:${admin.source.keyId}:${admin.source.path}`;
  }
  if (admin.source.kind === "device-attested") {
    return `device-attested:${admin.source.device}:${admin.source.path}`;
  }
  return `root-file:${admin.source.path}`;
}
