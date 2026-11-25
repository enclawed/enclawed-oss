// enclawed adapter kit: who may attest a skill bundle or an MCP server for
// this installation, and the signed MCP admission records.
//
//   - The trust list is <trust dir>/signers.json: Ed25519 public keys, each
//     with a key id. The adapter keeps the trust dir inside Enclawed's own
//     state, which no agent tool may write (list it in the engine's protected
//     paths), and every change to it is made after two-factor authentication
//     (the `authorize` callback: twoFactorAuthorizer below) and recorded.
//   - The local signer is this installation's own key, made on first use with
//     the framework's Ed25519 primitive. Its private key is kept 0600 next to
//     the list and is a SECRET path: the adapter lists trustPaths(dir).localKey
//     in the engine's secretPaths, so no read or command of the agent reaches it.
//   - Other signers (a publisher, an organization's review pipeline) are added
//     with addSigner; their attestations are accepted exactly like local ones.
//   - A signature only says "this signer attested this exact content"; the
//     launcher still re-runs every check itself.
//
// The MCP pin store implements the kit's AdmissionRecordSource: a record is
// returned only when its signature verifies against the trust list and it is
// an admission record of a known kind and version; anything else is reported
// as broken, and a broken record admits nothing.
//
// Ported from codenclawed's trust.mjs, mcp.mjs (pinRecord, writePin,
// readPins) and admission-cli.mjs (pin, import, unpin).

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertSecondFactor, type AuthContext } from "../auth/index.js";
import type { McpContainmentRecord } from "../containment/mcp.js";
import { canonicalJson } from "../mcp-tool-pins.js";
import {
  generateEd25519KeyPair,
  signManifest,
  verifyManifestSignature,
} from "../module-signing.js";
import type { McpCodePin } from "./mcp-package-pins.js";
import { isArgumentRoles, type McpArgumentRoles } from "./mcp-roles.js";
import {
  defaultMcpNormalizer,
  mcpToolSetProblems,
  mcpToolDefinitionDigest,
  type AdmissionRecordSource,
  type McpAdmissionRecord,
  type McpNameNormalizer,
} from "./mcp.js";
import { isRemoteRecord, type McpRemoteRecord } from "./remote-launch.js";

export const sha256Hex = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export type TrustPaths = Readonly<{ dir: string; signers: string; localKey: string }>;

/** The files of a trust directory. `localKey` is a secret path; the whole dir is a protected path. */
export function trustPaths(dir: string): TrustPaths {
  return {
    dir,
    signers: path.join(dir, "signers.json"),
    localKey: path.join(dir, "local-signer.key.pem"),
  };
}

export type Signer = Readonly<{
  keyId: string;
  publicKeyPem: string;
  label: string;
  origin: string;
  addedAt: number;
}>;

export type LocalSigner = Readonly<{
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
  created: boolean;
}>;

/** Write a file atomically (temporary file in the same directory, then rename), mode 0600. */
export function writeFileAtomic(file: string, text: string): void {
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, text, { mode: 0o600, flag: "wx" });
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export function keyIdOf(publicKeyPem: string): string {
  return `local-${sha256Hex(publicKeyPem.trim()).slice(0, 16)}`;
}

/** The trust list; a missing or unreadable list is empty (nobody is trusted). */
export function readSigners(dir: string): Signer[] {
  try {
    const d = JSON.parse(fs.readFileSync(trustPaths(dir).signers, "utf8")) as { signers?: unknown };
    return Array.isArray(d?.signers)
      ? (d.signers as Signer[]).filter(
          (s) => typeof s?.keyId === "string" && typeof s?.publicKeyPem === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export function findSigner(dir: string, keyId: string): Signer | null {
  return readSigners(dir).find((s) => s.keyId === keyId) ?? null;
}

function writeSigners(dir: string, list: readonly Signer[]): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileAtomic(trustPaths(dir).signers, `${JSON.stringify({ v: 1, signers: list }, null, 2)}\n`);
}

/**
 * A change to who may attest content (adding or removing a signer, pinning,
 * importing or removing an admission record). The kit calls it before every
 * such change; it throws when the person is not verified.
 */
export type TrustAuthorizer = (detail: string) => Promise<unknown>;

/**
 * The framework's two-factor gate for trust changes: purpose "policy-change",
 * at a terminal only (an unlock ticket never authorizes one).
 */
export function twoFactorAuthorizer(ctx: AuthContext): TrustAuthorizer {
  return (detail) =>
    assertSecondFactor(ctx, { purpose: "policy-change", detail, allowTicket: false });
}

/** Add (or replace) a trusted signer, after the person is verified. */
export async function addSigner(
  dir: string,
  s: { keyId: string; publicKeyPem: string; label?: string; origin?: string },
  authorize: TrustAuthorizer,
): Promise<void> {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(s.keyId)) {
    throw new Error(
      `signer key id ${JSON.stringify(s.keyId)} must be 1-80 letters, digits, ".", "_" or "-"`,
    );
  }
  if (!s.publicKeyPem.trim().startsWith("-----BEGIN PUBLIC KEY-----")) {
    throw new Error("the signer's public key must be a PEM (SPKI) Ed25519 public key");
  }
  await authorize(`trust add ${s.keyId}`);
  const list = readSigners(dir).filter((x) => x.keyId !== s.keyId);
  list.push({
    keyId: s.keyId,
    publicKeyPem: `${s.publicKeyPem.trim()}\n`,
    label: s.label ?? "",
    origin: s.origin ?? "imported",
    addedAt: Date.now(),
  });
  writeSigners(dir, list);
}

/** Remove a signer, after the person is verified. Returns whether it was there. */
export async function removeSigner(
  dir: string,
  keyId: string,
  authorize: TrustAuthorizer,
): Promise<boolean> {
  const list = readSigners(dir);
  const next = list.filter((s) => s.keyId !== keyId);
  if (next.length === list.length) {
    return false;
  }
  await authorize(`trust remove ${keyId}`);
  writeSigners(dir, next);
  return true;
}

/** The local signer, made with the framework's Ed25519 primitive on first use, after the person is verified. */
export async function ensureLocalSigner(
  dir: string,
  authorize: TrustAuthorizer,
): Promise<LocalSigner> {
  const t = trustPaths(dir);
  if (fs.existsSync(t.localKey)) {
    const privateKeyPem = fs.readFileSync(t.localKey, "utf8");
    const local = readSigners(dir).find((s) => s.origin === "local");
    if (local) {
      return {
        keyId: local.keyId,
        privateKeyPem,
        publicKeyPem: local.publicKeyPem,
        created: false,
      };
    }
  }
  const { publicKey, privateKey } = generateEd25519KeyPair();
  const keyId = keyIdOf(publicKey);
  await addSigner(
    dir,
    { keyId, publicKeyPem: publicKey, label: "this installation", origin: "local" },
    authorize,
  );
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.rmSync(t.localKey, { force: true });
  fs.writeFileSync(t.localKey, privateKey, { mode: 0o600, flag: "wx" });
  fs.chmodSync(t.localKey, 0o600);
  return { keyId, privateKeyPem: privateKey, publicKeyPem: publicKey, created: true };
}

/** Sign a record (every field but `signature`), naming the signer. */
export function signRecord<T extends Record<string, unknown>>(
  record: T,
  signer: Pick<LocalSigner, "keyId" | "privateKeyPem">,
): T & { signerKeyId: string; signature: string } {
  const body: Record<string, unknown> = { ...record, signerKeyId: signer.keyId };
  delete body.signature;
  return {
    ...(body as T & { signerKeyId: string }),
    signature: signManifest(Buffer.from(canonicalJson(body), "utf8"), signer.privateKeyPem),
  };
}

export type RecordVerdict =
  | Readonly<{ ok: true; signer: Signer }>
  | Readonly<{ ok: false; reason: string }>;

/** Verify a signed record against the trust list. */
export function verifyRecord(record: unknown, dir: string): RecordVerdict {
  const r = record as Record<string, unknown> | null;
  if (
    !r ||
    typeof r !== "object" ||
    typeof r.signature !== "string" ||
    typeof r.signerKeyId !== "string"
  ) {
    return { ok: false, reason: "unsigned" };
  }
  const signer = findSigner(dir, r.signerKeyId);
  if (!signer) {
    return {
      ok: false,
      reason: `signer ${JSON.stringify(r.signerKeyId)} is not on the trust list`,
    };
  }
  const body = { ...r };
  delete body.signature;
  let good = false;
  try {
    good = verifyManifestSignature(
      Buffer.from(canonicalJson(body), "utf8"),
      r.signature,
      signer.publicKeyPem,
    );
  } catch {
    good = false;
  }
  if (!good) {
    return {
      ok: false,
      reason: `the signature by ${signer.keyId} does not verify (the record was changed after it was signed)`,
    };
  }
  return { ok: true, signer };
}

// ─── Signed MCP admission records ───────────────────────────────────────

export const PIN_VERSION = 1;
export const MCP_ADMISSION_KIND = "enclawed-mcp-admission";

/** What a launcher measured about a server when pinning it. */
export type McpPinInput = Readonly<{
  name: string;
  scope: string;
  source: string;
  definitionDigest: string;
  executable: string | null;
  executableSha256: string | null;
  serverInfo: Readonly<{ name: string | null; version: string | null }>;
  /** The server's tools/list answer, as probed. */
  tools: readonly unknown[];
  /** The server's code pinned by content (package runners: ./mcp-package-pins.ts). */
  code?: McpCodePin | null;
  /** The argument roles the operator reviewed (./mcp-roles.ts). */
  args?: McpArgumentRoles | null;
  /** The containment the operator declared (folders, programs, package tree, env, secrets, destinations). */
  containment?: McpContainmentRecord | null;
  /** A remote server: its URL, transport and the authorization origins on another site it may name. */
  remote?: McpRemoteRecord | null;
}>;

/** The (unsigned) admission record for a probed server: identity, and one digest per tool. */
export function mcpPinRecord(
  p: McpPinInput,
  kind: string = MCP_ADMISSION_KIND,
): Record<string, unknown> {
  const tools = p.tools
    .map((t) => [String((t as { name?: unknown }).name), mcpToolDefinitionDigest(t)] as const)
    .toSorted((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    v: PIN_VERSION,
    kind,
    name: p.name,
    scope: p.scope,
    source: p.source,
    identity: {
      type: p.remote ? p.remote.transport : "stdio",
      definitionDigest: p.definitionDigest,
      executable: p.executable,
      executableSha256: p.executableSha256,
      serverInfo: p.serverInfo,
    },
    tools: Object.fromEntries(tools),
    ...(p.code ? { code: p.code } : {}),
    ...(p.args ? { args: p.args } : {}),
    ...(p.containment ? { containment: p.containment } : {}),
    ...(p.remote ? { remote: p.remote } : {}),
    pinnedAt: Date.now(),
  };
}

const HEX64 = /^[0-9a-f]{64}$/;

const strList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
const absPath = (v: unknown) => typeof v === "string" && v.startsWith("/") && !v.includes("\0");

/** The shape of a signed containment declaration (the planner checks what it means). */
export function isContainmentRecord(v: unknown): v is McpContainmentRecord {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return false;
  }
  const r = v as Record<string, unknown>;
  const known = new Set([
    "roots",
    "packageRoot",
    "programs",
    "cwd",
    "env",
    "secrets",
    "destinations",
    "execConfigWritable",
  ]);
  if (Object.keys(r).some((k) => !known.has(k))) {
    return false;
  }
  if (
    !Array.isArray(r.roots) ||
    !r.roots.every((x: unknown) => {
      const o = x as Record<string, unknown> | null;
      return (
        !!o &&
        absPath(o.path) &&
        (o.access === "ro" || o.access === "rw") &&
        (o.exec === undefined || typeof o.exec === "boolean")
      );
    })
  ) {
    return false;
  }
  if (r.packageRoot !== undefined && r.packageRoot !== null && !absPath(r.packageRoot)) {
    return false;
  }
  if (r.cwd !== undefined && r.cwd !== null && !absPath(r.cwd)) {
    return false;
  }
  for (const k of ["programs", "env", "execConfigWritable"]) {
    if (r[k] !== undefined && !strList(r[k])) {
      return false;
    }
  }
  if (
    r.secrets !== undefined &&
    !(
      Array.isArray(r.secrets) &&
      r.secrets.every((x: unknown) => {
        const o = x as Record<string, unknown> | null;
        return (
          !!o &&
          typeof o.variable === "string" &&
          typeof o.id === "string" &&
          strList(o.destinations)
        );
      })
    )
  ) {
    return false;
  }
  if (
    r.destinations !== undefined &&
    !(
      Array.isArray(r.destinations) &&
      r.destinations.every((x: unknown) => {
        const o = x as Record<string, unknown> | null;
        return (
          !!o &&
          typeof o.host === "string" &&
          typeof o.port === "number" &&
          Number.isInteger(o.port) &&
          o.port > 0 &&
          o.port < 65536 &&
          (o.mode === "inspect" || o.mode === "http" || o.mode === "opaque")
        );
      })
    )
  ) {
    return false;
  }
  return true;
}

/** The record as the kit's McpAdmissionRecord, or why it is not one. */
function asAdmissionRecord(
  r: Record<string, unknown>,
): { ok: true; record: McpAdmissionRecord } | { ok: false; reason: string } {
  const id = r.identity as Record<string, unknown> | null;
  const tools = r.tools as Record<string, unknown> | null;
  if (typeof r.name !== "string" || r.name === "") {
    return { ok: false, reason: "it names no server" };
  }
  if (!id || typeof id !== "object" || typeof id.definitionDigest !== "string") {
    return { ok: false, reason: "it has no server identity" };
  }
  if (
    id.executableSha256 !== undefined &&
    id.executableSha256 !== null &&
    !(typeof id.executableSha256 === "string" && HEX64.test(id.executableSha256))
  ) {
    return { ok: false, reason: "its executable digest is malformed" };
  }
  if (
    !tools ||
    typeof tools !== "object" ||
    Array.isArray(tools) ||
    Object.values(tools).some((d) => typeof d !== "string" || !HEX64.test(d))
  ) {
    return { ok: false, reason: "its tool pins are malformed" };
  }
  const code = r.code as Record<string, unknown> | null | undefined;
  if (
    code !== undefined &&
    code !== null &&
    !(
      ["npm", "pypi", "oci", "tree"].includes(code.kind as string) &&
      typeof code.name === "string" &&
      typeof code.version === "string" &&
      typeof code.integrity === "string" &&
      code.integrity.length > 0 &&
      // The installed-tree fields of an npm pin (measureNpxPackage), when present.
      ["lockDigest", "treeDigest", "bin"].every(
        (f) => code[f] === undefined || (typeof code[f] === "string" && code[f] !== ""),
      )
    )
  ) {
    return { ok: false, reason: "its code pin is malformed" };
  }
  if (r.args !== undefined && r.args !== null && !isArgumentRoles(r.args)) {
    return { ok: false, reason: "its argument roles are malformed" };
  }
  if (
    r.containment !== undefined &&
    r.containment !== null &&
    !isContainmentRecord(r.containment)
  ) {
    return { ok: false, reason: "its containment declaration is malformed" };
  }
  if (r.remote !== undefined && r.remote !== null && !isRemoteRecord(r.remote)) {
    return { ok: false, reason: "its remote server part is malformed" };
  }
  const info = id.serverInfo as { name?: unknown; version?: unknown } | null | undefined;
  return {
    ok: true,
    record: {
      name: r.name,
      identity: {
        type: typeof id.type === "string" ? id.type : null,
        definitionDigest: id.definitionDigest,
        executableSha256: id.executableSha256 ?? null,
        serverInfo: info
          ? {
              name: typeof info.name === "string" ? info.name : null,
              version: typeof info.version === "string" ? info.version : null,
            }
          : null,
      },
      tools: tools as Record<string, string>,
      code: (code as McpCodePin | null | undefined) ?? null,
      args: r.args ?? null,
      containment: r.containment ?? null,
      remote: r.remote ?? null,
      signerKeyId: typeof r.signerKeyId === "string" ? r.signerKeyId : null,
    },
  };
}

export type McpPinStoreOptions = Readonly<{
  /** Where the signed records are kept (Enclawed's own state: a protected path). */
  dir: string;
  /** The trust directory whose signers may attest records. */
  trustDir: string;
  /** Record kinds accepted (an adapter adds the kinds its older releases wrote). */
  kinds?: readonly string[];
  normalize?: McpNameNormalizer;
}>;

/** Every stored record with its verdict. */
export function readMcpPins(o: McpPinStoreOptions): Array<{
  file: string;
  ok: boolean;
  reason: string | null;
  record: McpAdmissionRecord | null;
  signer: string | null;
}> {
  const kinds = o.kinds ?? [MCP_ADMISSION_KIND];
  let names: string[] = [];
  try {
    names = fs.readdirSync(o.dir).filter((f) => f.endsWith(".json"));
  } catch {
    names = [];
  }
  return names.toSorted().map((f) => {
    const file = path.join(o.dir, f);
    let raw: Record<string, unknown> | null = null;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch {
      raw = null;
    }
    if (!raw || typeof raw !== "object") {
      return { file, ok: false, reason: "not valid JSON", record: null, signer: null };
    }
    const v = verifyRecord(raw, o.trustDir);
    if (!v.ok) {
      return { file, ok: false, reason: v.reason, record: null, signer: null };
    }
    if (typeof raw.kind !== "string" || !kinds.includes(raw.kind)) {
      return {
        file,
        ok: false,
        reason: "not an MCP admission record",
        record: null,
        signer: v.signer.keyId,
      };
    }
    if (raw.v !== PIN_VERSION) {
      return {
        file,
        ok: false,
        reason: "an unsupported record version",
        record: null,
        signer: v.signer.keyId,
      };
    }
    const a = asAdmissionRecord(raw);
    if (!a.ok) {
      return { file, ok: false, reason: a.reason, record: null, signer: v.signer.keyId };
    }
    return { file, ok: true, reason: null, record: a.record, signer: v.signer.keyId };
  });
}

/** The signed pin store as the kit's AdmissionRecordSource. */
export function signedMcpPinStore(o: McpPinStoreOptions): AdmissionRecordSource {
  return {
    load() {
      const records: McpAdmissionRecord[] = [];
      const broken: { name: string; reason: string }[] = [];
      for (const p of readMcpPins(o)) {
        if (p.ok && p.record) {
          records.push(p.record);
        } else {
          broken.push({ name: path.basename(p.file, ".json"), reason: p.reason ?? "invalid" });
        }
      }
      return { records, broken };
    },
  };
}

function pinFile(o: McpPinStoreOptions, name: string): string {
  return path.join(o.dir, `${(o.normalize ?? defaultMcpNormalizer)(name)}.json`);
}

function writeRecordFile(o: McpPinStoreOptions, name: string, rec: unknown): string {
  fs.mkdirSync(o.dir, { recursive: true, mode: 0o700 });
  const file = pinFile(o, name);
  writeFileAtomic(file, `${JSON.stringify(rec, null, 2)}\n`);
  return file;
}

export type PinOutcome =
  | Readonly<{ ok: true; file: string; record: Record<string, unknown> }>
  | Readonly<{ ok: false; problems: readonly string[] }>;

/**
 * Pin a probed server: refused when its tool set has problems (no names,
 * duplicates, shadowing, definitions with hidden content or instructions
 * aimed at the model); otherwise, after the person is verified, signed with
 * the local signer and stored.
 */
export async function pinMcpServer(
  o: McpPinStoreOptions & {
    builtinToolNames: readonly string[];
    authorize: TrustAuthorizer;
    kind?: string;
  },
  p: McpPinInput,
): Promise<PinOutcome> {
  const problems = mcpToolSetProblems(p.name, p.tools, o.builtinToolNames, o.normalize);
  if (p.tools.length === 0) {
    problems.push("it offers no tools");
  }
  if (problems.length) {
    return { ok: false, problems };
  }
  await o.authorize(`mcp pin ${p.name}`);
  const signer = await ensureLocalSigner(o.trustDir, async () => {});
  const signed = signRecord(mcpPinRecord(p, o.kind), signer);
  return { ok: true, file: writeRecordFile(o, p.name, signed), record: signed };
}

/** Import a record another trusted signer attested, after the person is verified. */
export async function importMcpRecord(
  o: McpPinStoreOptions & { authorize: TrustAuthorizer },
  record: unknown,
): Promise<PinOutcome> {
  const r = record as Record<string, unknown> | null;
  const v = verifyRecord(r, o.trustDir);
  if (!v.ok) {
    return { ok: false, problems: [v.reason] };
  }
  const kinds = o.kinds ?? [MCP_ADMISSION_KIND];
  if (typeof r?.kind !== "string" || !kinds.includes(r.kind) || r.v !== PIN_VERSION) {
    return { ok: false, problems: ["not an MCP admission record"] };
  }
  const a = asAdmissionRecord(r);
  if (!a.ok) {
    return { ok: false, problems: [a.reason] };
  }
  if (Object.keys(a.record.tools).length === 0) {
    return { ok: false, problems: ["it pins no tools"] };
  }
  await o.authorize(`mcp import ${a.record.name}`);
  return {
    ok: true,
    file: writeRecordFile(o, a.record.name, r),
    record: r,
  };
}

/** Remove a server's record (it no longer starts), after the person is verified. */
export async function unpinMcpServer(
  o: McpPinStoreOptions & { authorize: TrustAuthorizer },
  name: string,
): Promise<boolean> {
  const f = pinFile(o, name);
  if (!fs.existsSync(f)) {
    return false;
  }
  await o.authorize(`mcp unpin ${name}`);
  fs.rmSync(f, { force: true });
  return true;
}
