// enclawed adapter kit: MCP admission and definition drift.
//
//   - Admission (at launch): only a server whose identity (its definition:
//     transport, command, arguments, environment, URL, headers; the digest of
//     its executable) matches a verified admission record may start, and the
//     record pins the hash of each of its tool definitions. Two servers whose
//     names the host turns into the same tool prefix, a tool offered by two
//     servers, and a tool named like a host built-in are refused (no
//     shadowing).
//   - Definition inspection (when pinning): every string of a tool
//     definition goes through the input cleaner and a check for instructions
//     aimed at the model (tool poisoning); a flagged definition cannot be
//     pinned.
//   - Drift (during the session): every tools/list answer is checked against
//     the pins with the framework's checkMcpToolDefinitions (../mcp-tool-pins.ts). A
//     changed, withdrawn or never-pinned tool is revoked for the rest of the
//     admission.
//   - The per-call rule: an MCP call must name a pinned, unrevoked tool of an
//     admitted server.
//
// Where the records come from (pinning after two-factor authentication, or
// import of a record signed by a trusted signer) is the AdmissionRecordSource
// seam; the kit's implementation is the signed pin store in ./trust.ts
// (signedMcpPinStore), which returns only records whose signature verifies
// against the trust list.
//
// Ported from codenclawed's mcp.mjs and mcp-proxy.mjs.

import { createHash } from "node:crypto";
import type { McpContainmentRecord } from "../containment/mcp.js";
import {
  canonicalJson,
  describeMcpToolDrift,
  mcpToolDefinitionDigest,
  McpToolPinSet,
  type McpToolDrift,
} from "../mcp-tool-pins.js";
import { localCodeOf, localCodeProblem } from "./code-pins.js";
import type { McpArgumentRole, McpArgumentRoles, McpServerDefinition } from "./contracts.js";
import type { McpProgramImage } from "./mcp-effects.js";
import { codePinProblem, codeResolution, type McpCodePin } from "./mcp-package-pins.js";
import { cleanToolResult } from "./output-cleaner.js";
import type { McpRemoteRecord } from "./remote-launch.js";

export { canonicalJson, mcpToolDefinitionDigest };

/** A host's form of a server or tool name inside its tool prefix. The default: [^a-zA-Z0-9_-] -> "_". */
export type McpNameNormalizer = (name: string) => string;
export const defaultMcpNormalizer: McpNameNormalizer = (n) => n.replace(/[^a-zA-Z0-9_-]/g, "_");

export type { McpServerDefinition } from "./contracts.js";

/** The digest of a definition: transport, command, arguments, environment, URL and headers. */
export function mcpDefinitionDigest(def: McpServerDefinition): string {
  const type = def.type ?? (typeof def.url === "string" ? "http" : "stdio");
  const definition = {
    type,
    command: def.command ?? null,
    args: Array.isArray(def.args) ? def.args.map(String) : [],
    env: def.env && typeof def.env === "object" ? def.env : {},
    url: def.url ?? null,
    headers: def.headers && typeof def.headers === "object" ? def.headers : {},
  };
  return createHash("sha256").update(canonicalJson(definition)).digest("hex");
}

/** A server definition the host would start, with what the launcher measured about it. */
export type McpCandidate = Readonly<{
  name: string;
  /** Where it was defined (user, project, a config flag, ...), for the message. */
  scope: string;
  source: string;
  definitionDigest: string;
  /** SHA-256 of the executable a stdio definition runs, as resolved by the launcher; null when none. */
  executableSha256: string | null;
  /** The definition itself: whether it resolves its code at launch is decided from it. */
  definition: McpServerDefinition;
  /** The code the launcher measured: a package runner's package (./mcp-package-pins.ts), or local code (./code-pins.ts measureLocalCode). */
  code?: McpCodePin | null;
  /** The server's working directory and PATH, to find the local code it runs (default: this process's). */
  cwd?: string;
  pathVar?: string;
}>;

/** A verified admission record: what was pinned for a server. */
export type McpAdmissionRecord = Readonly<{
  name: string;
  identity: Readonly<{
    /** "stdio", or the remote transport ("streamable-http" / "sse"; "http" in older records). */
    type?: string | null;
    definitionDigest: string;
    executableSha256?: string | null;
    serverInfo?: Readonly<{ name: string | null; version: string | null }> | null;
  }>;
  /** tool name -> pinned definition digest. */
  tools: Readonly<Record<string, string>>;
  /** The server's code, pinned by content (package runners). */
  code?: McpCodePin | null;
  /** Declared argument roles per tool (./mcp-roles.ts), signed with the record. */
  args?: McpArgumentRoles | null;
  /** What the server may use inside its containment (folders, programs, package tree, env, secrets, destinations), signed with the record. */
  containment?: McpContainmentRecord | null;
  /** A remote server (type http / sse): its URL, transport and the authorization origins it may name, signed with the record. */
  remote?: McpRemoteRecord | null;
  signerKeyId?: string | null;
}>;

/**
 * Where verified admission records come from. The kit's implementation is
 * signedMcpPinStore (./trust.ts). A record that does not verify must not be
 * returned (report it in `broken`).
 */
export type AdmissionRecordSource = Readonly<{
  load(): {
    records: readonly McpAdmissionRecord[];
    broken: readonly { name: string; reason: string }[];
  };
}>;

export type McpAdmissionOptions = Readonly<{
  /** The host's built-in tool names (compared case-insensitively): an MCP tool named like one shadows it. */
  builtinToolNames: readonly string[];
  normalize?: McpNameNormalizer;
  /** The host's tool-name prefix for a server's tools, from its normalized name (default: mcp__<server>__). */
  prefixOf?: (normalizedServer: string) => string;
  /** Prefixes no admitted server may take (host data: for example the prefix of the host's account connectors). */
  reservedPrefixes?: readonly string[];
}>;

export type McpAdmitted = Readonly<{
  name: string;
  scope: string;
  record: McpAdmissionRecord;
  normalized: string;
  /**
   * The stdio server's program as it started (./mcp-effects.ts
   * loadMcpProgram, captured by the launcher when it starts the server):
   * each call is then decided by the effects the server's code verifiably
   * has for that call. Absent: calls keep the record-based rule.
   */
  program?: McpProgramImage | null;
}>;

export type McpAdmission =
  | Readonly<{
      ok: true;
      admitted: readonly McpAdmitted[];
      skipped: readonly { name: string; scope: string; why: string }[];
    }>
  | Readonly<{ ok: false; message: string }>;

/** Decide which candidate servers may start in this session. Pure. */
export function admitMcpServers(
  candidates: readonly McpCandidate[],
  records: readonly McpAdmissionRecord[],
  opts: McpAdmissionOptions,
  broken: readonly { name: string; reason: string }[] = [],
): McpAdmission {
  const normalize = opts.normalize ?? defaultMcpNormalizer;
  const prefixOf = opts.prefixOf ?? ((s: string) => `mcp__${s}__`);
  const builtin = new Set(opts.builtinToolNames.map((n) => n.toLowerCase()));
  const pins = new Map<string, McpAdmissionRecord>();
  for (const r of records) {
    pins.set(r.name, r);
  }
  const skipped: { name: string; scope: string; why: string }[] = broken.map((b) => ({
    name: b.name,
    scope: "store",
    why: `its admission record is not valid: ${b.reason}`,
  }));
  const admitted: McpAdmitted[] = [];
  const taken = new Set<string>();
  for (const c of candidates) {
    const rec = pins.get(c.name);
    if (!rec) {
      skipped.push({ name: c.name, scope: c.scope, why: "not pinned or attested" });
      continue;
    }
    if (taken.has(c.name)) {
      skipped.push({ name: c.name, scope: c.scope, why: "already admitted from another source" });
      continue;
    }
    if (c.definitionDigest !== rec.identity.definitionDigest) {
      skipped.push({
        name: c.name,
        scope: c.scope,
        why: `its definition in ${c.source} differs from the pinned one (command, arguments, environment or URL changed)`,
      });
      continue;
    }
    if (rec.identity.executableSha256 && c.executableSha256 !== rec.identity.executableSha256) {
      skipped.push({
        name: c.name,
        scope: c.scope,
        why: "its executable differs from the pinned one",
      });
      continue;
    }
    // The server's code, not only the runner that fetches it (mcp-server-unpinned-code).
    const code = codePinProblem(c.definition, rec.code, c.code);
    if (code) {
      skipped.push({ name: c.name, scope: c.scope, why: `mcp-server-unpinned-code: ${code}` });
      continue;
    }
    // Local code (a script, a Python module, an installed script), pinned by its tree.
    let local: string | null = null;
    try {
      // A pinned package runner's code is the package (its content pin above),
      // not the runner's own script (npx is itself a Node script).
      if (codeResolution(c.definition).kind !== "pinned-form") {
        local = localCodeProblem(
          localCodeOf(c.definition, {
            cwd: c.cwd ?? process.cwd(),
            pathVar: c.pathVar ?? process.env.PATH ?? "",
          }),
          rec.code,
          c.code,
        );
      }
    } catch (err) {
      local = `its local code could not be located (${(err as Error).message})`;
    }
    if (local) {
      skipped.push({ name: c.name, scope: c.scope, why: `mcp-server-unpinned-code: ${local}` });
      continue;
    }
    taken.add(c.name);
    admitted.push({ name: c.name, scope: c.scope, record: rec, normalized: normalize(c.name) });
  }
  const prefixes = new Map<string, string>();
  const toolOwners = new Map<string, string>();
  for (const a of admitted) {
    const pre = prefixOf(a.normalized);
    const reserved = (opts.reservedPrefixes ?? []).find((r) => pre.startsWith(r));
    if (reserved) {
      return {
        ok: false,
        message: `the MCP server ${JSON.stringify(a.name)} would use the reserved tool prefix ${reserved}; not starting`,
      };
    }
    const owner = prefixes.get(pre);
    if (owner !== undefined) {
      return {
        ok: false,
        message: `the MCP servers ${JSON.stringify(owner)} and ${JSON.stringify(a.name)} would share the tool prefix ${pre}; a session with servers that shadow each other does not start`,
      };
    }
    prefixes.set(pre, a.name);
    for (const t of Object.keys(a.record.tools)) {
      const key = t.toLowerCase();
      if (builtin.has(key)) {
        return {
          ok: false,
          message: `the MCP server ${JSON.stringify(a.name)} has a tool named ${JSON.stringify(t)}, like a built-in tool (shadowing); not starting`,
        };
      }
      const other = toolOwners.get(key);
      if (other !== undefined) {
        return {
          ok: false,
          message: `the tool name ${JSON.stringify(t)} is offered by both MCP servers ${JSON.stringify(other)} and ${JSON.stringify(a.name)}; a same-named tool shadows another, so the session does not start`,
        };
      }
      toolOwners.set(key, a.name);
    }
  }
  return { ok: true, admitted, skipped };
}

// Instructions aimed at the model inside a tool definition (tool poisoning).
const INSTRUCTION_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/<\s*(important|system|instructions?|secret|hidden)\b[^>]*>/i, "instruction-tag"],
  [
    /\b(ignore|disregard|override|forget)\s+(?:(?:all|any|the|your|previous|prior|above|earlier)\s+){0,3}(instructions?|rules?|guidelines?|prompts?|policies|context)\b/i,
    "override-instruction",
  ],
  [
    /\b(do\s+not|don['’]?t|never)\s+(tell|mention|inform|reveal\s+to|show|alert|notify)\s+(the\s+)?(user|human|operator|person)\b/i,
    "conceal-from-user",
  ],
  [
    /\b(before|prior\s+to|instead\s+of)\s+(using|calling|running|invoking)\s+(this|any|the|other)\b[^.]{0,80}\b(read|cat|open|send|fetch|include|call)\b/i,
    "precondition-instruction",
  ],
  [
    /(~|\$HOME|\/home\/[^/\s]+|\/root)\/\.(ssh|aws|gnupg|config\/gh|netrc|docker|kube|claude|codex|gemini|enclawed)\b|\bid_(rsa|ed25519|ecdsa)\b|\.env\b|credentials?\.json|mcp\.json/i,
    "credential-path",
  ],
  [
    /\b(system\s+prompt|your\s+instructions|as\s+an?\s+ai\b|you\s+must\s+(always|first|now))/i,
    "model-directive",
  ],
  [
    /\b(exfiltrat|send\s+(it|them|this|the\s+(contents?|data|file|key|token))\s+to)\b/i,
    "exfiltration",
  ],
];

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") {
    out.push(v);
  } else if (Array.isArray(v)) {
    for (const x of v) {
      strings(x, out);
    }
  } else if (v && typeof v === "object") {
    for (const x of Object.values(v)) {
      strings(x, out);
    }
  }
  return out;
}

/** Inspect one tool definition: hidden characters, hidden HTML, notice imitations, instructions to the model. Empty when clean. */
export function inspectMcpToolDefinition(server: string, tool: unknown): string[] {
  const findings: string[] = [];
  const name = (tool as { name?: unknown } | null)?.name;
  const c = cleanToolResult(`mcp:${server}/${typeof name === "string" ? name : ""}`, tool, "audit");
  for (const k of c.audit?.kinds ?? []) {
    findings.push(`hidden-characters:${k}`);
  }
  for (const h of c.audit?.hiddenHtml ?? []) {
    findings.push(`hidden-html:${h}`);
  }
  for (const s of strings(tool)) {
    for (const [re, code] of INSTRUCTION_PATTERNS) {
      if (re.test(s) && !findings.includes(code)) {
        findings.push(code);
      }
    }
  }
  return findings;
}

/** Problems that keep a probed tool set from being pinned: no name, duplicates, shadowing, flagged definitions. */
export function mcpToolSetProblems(
  server: string,
  tools: readonly unknown[],
  builtinToolNames: readonly string[],
  normalize: McpNameNormalizer = defaultMcpNormalizer,
): string[] {
  const builtin = new Set(builtinToolNames.map((n) => n.toLowerCase()));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const t of tools) {
    const n =
      typeof (t as { name?: unknown } | null)?.name === "string"
        ? (t as { name: string }).name
        : "";
    if (!n) {
      problems.push("a tool has no name");
      continue;
    }
    if (seen.has(normalize(n))) {
      problems.push(`the tool name ${JSON.stringify(n)} appears twice`);
    }
    seen.add(normalize(n));
    if (builtin.has(n.toLowerCase())) {
      problems.push(`the tool ${JSON.stringify(n)} has the name of a built-in tool (shadowing)`);
    }
    const f = inspectMcpToolDefinition(server, t);
    if (f.length) {
      problems.push(
        `the definition of ${JSON.stringify(n)} is flagged (${f.join(", ")}): hidden content or instructions aimed at the model`,
      );
    }
  }
  return problems;
}

/** What keeps a verified admission record from starting its server now (a record made before containment or remote admission). */
export type McpRecordProblem = Readonly<{
  name: string;
  code: "mcp-server-not-contained" | "mcp-remote-not-admitted";
  why: string;
}>;

/**
 * Records that verify but can no longer start their server: a local (stdio)
 * server with no signed containment part never starts
 * (mcp-server-not-contained), and a remote one with no signed remote part
 * never connects (mcp-remote-not-admitted). Each must be pinned again. Used
 * by an adapter's migration check; admission and launch refuse them anyway.
 */
export function mcpRecordProblems(records: readonly McpAdmissionRecord[]): McpRecordProblem[] {
  const out: McpRecordProblem[] = [];
  for (const r of records) {
    const t = (r.identity.type ?? "stdio").toLowerCase();
    const remote = Boolean(r.remote) || t === "http" || t === "sse" || t === "streamable-http";
    if (remote && !r.remote) {
      out.push({
        name: r.name,
        code: "mcp-remote-not-admitted",
        why: "it is a remote server, and its record names no signed URL and transport",
      });
    } else if (!remote && !r.containment) {
      out.push({
        name: r.name,
        code: "mcp-server-not-contained",
        why: "its record has no signed containment (the folders, programs and hosts it may use)",
      });
    }
  }
  return out.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Why a server's reported serverInfo is not its pinned one, or null (see McpSession.identityProblem). */
export function mcpServerInfoProblem(
  record: Pick<McpAdmissionRecord, "identity">,
  info: unknown,
): string | null {
  const got = info && typeof info === "object" ? (info as Record<string, unknown>) : {};
  const want = record.identity.serverInfo ?? { name: null, version: null };
  // Absent is null; any other non-string value never matches a pin.
  const name = got.name ?? null;
  const version = got.version ?? null;
  if ((want.name ?? null) === name && (want.version ?? null) === version) {
    return null;
  }
  return `the server reports itself as ${JSON.stringify(name)} ${JSON.stringify(version)}, not the pinned ${JSON.stringify(want.name ?? null)} ${JSON.stringify(want.version ?? null)}`;
}

export type McpCallVerdict = null | Readonly<{
  code:
    | "mcp-server-not-admitted"
    | "mcp-tool-not-pinned"
    | "mcp-tool-revoked"
    | "mcp-connector-not-allowed";
  reason: string;
}>;

/**
 * The session's MCP state: the admitted servers and the tools revoked by
 * drift. Each admitted server is the framework's McpToolPinSet, built from
 * the digests its admission record pinned (McpToolPinSet.fromDigests): a
 * drifted tool stays revoked for the rest of the admission, even if it
 * changes back. Throws when a record's pins are malformed (the session must
 * not start).
 */
export class McpSession {
  private readonly servers = new Map<string, { admitted: McpAdmitted; pins: McpToolPinSet }>();

  private readonly connectors: Readonly<{ server: string; tools: ReadonlySet<string> }>[];
  private readonly isConnector: (normalized: string) => boolean;

  /**
   * `connectors`: the host's account connectors (no server to pin, reached
   * through the host's own account) that the operator's policy lists, by
   * normalized server and tool name ("*" for every tool of that connector).
   * Any other connector tool is refused (mcp-connector-not-allowed).
   */
  constructor(
    admitted: readonly McpAdmitted[],
    o: Readonly<{
      connectors?: readonly Readonly<{ server: string; tools: readonly string[] }>[];
      connectorServer?: (normalized: string) => boolean;
    }> = {},
  ) {
    this.connectors = (o.connectors ?? []).map((c) => ({
      server: c.server,
      tools: new Set(c.tools),
    }));
    this.isConnector = o.connectorServer ?? (() => false);
    for (const a of admitted) {
      this.servers.set(a.normalized, {
        admitted: a,
        pins: McpToolPinSet.fromDigests(a.name, a.record.tools),
      });
    }
  }

  /** The admitted server for a normalized name, if any. */
  server(normalized: string): McpAdmitted | null {
    return this.servers.get(normalized)?.admitted ?? null;
  }

  /** The argument roles the record declared for a tool (both names normalized), or null. */
  roles(
    server: string,
    tool: string,
    normalize: McpNameNormalizer = defaultMcpNormalizer,
  ): Readonly<Record<string, McpArgumentRole>> | null {
    const args = this.servers.get(server)?.admitted.record.args;
    if (!args) {
      return null;
    }
    const real = Object.keys(args).find((x) => normalize(x) === tool);
    return real === undefined ? null : args[real];
  }

  /**
   * A tools/list answer from `server` (normalized name). Returns the drifts
   * that are new; every drifted tool is revoked for the rest of the session.
   * An unknown server's listing revokes nothing (it was never admitted).
   */
  observe(server: string, tools: readonly unknown[]): McpToolDrift[] {
    return this.servers.get(server)?.pins.observe(tools) ?? [];
  }

  /**
   * The server's `initialize` answer (its serverInfo) against its admission
   * record: a server that reports another name or version than the one
   * pinned is not the server that was admitted. Null when it matches (or the
   * server was never admitted: verdict refuses its calls).
   */
  identityProblem(server: string, info: unknown): string | null {
    const s = this.servers.get(server);
    return s ? mcpServerInfoProblem(s.admitted.record, info) : null;
  }

  /** Revoke every tool of a server (a listing that failed or could not be checked). */
  revokeAll(server: string): McpToolDrift[] {
    return this.servers.get(server)?.pins.revokeAll("definition-changed") ?? [];
  }

  /** May `tool` of `server` (both normalized, as the host spells them) run? null when it may. */
  verdict(
    server: string,
    tool: string,
    normalize: McpNameNormalizer = defaultMcpNormalizer,
  ): McpCallVerdict {
    if (this.isConnector(server)) {
      const c = this.connectors.find((x) => x.server === server);
      return c && (c.tools.has("*") || c.tools.has(tool))
        ? null
        : {
            code: "mcp-connector-not-allowed",
            reason:
              "this account connector's tool is not one the operator's policy lists for this session",
          };
    }
    const s = this.servers.get(server);
    if (!s) {
      return {
        code: "mcp-server-not-admitted",
        reason:
          "this MCP tool's server was not admitted for this session (only pinned or attested servers may start)",
      };
    }
    const real = Object.keys(s.pins.pins).find((x) => normalize(x) === tool);
    if (real === undefined) {
      return {
        code: "mcp-tool-not-pinned",
        reason: `the MCP server ${JSON.stringify(s.admitted.name)} has no pinned tool ${JSON.stringify(tool)}; only tools pinned at admission may run`,
      };
    }
    const c = s.pins.check(real);
    return c.ok ? null : { code: "mcp-tool-revoked", reason: c.reason };
  }
}

export { describeMcpToolDrift };
export type { McpToolDrift };
