// enclawed adapter kit: settings that make the host run a command, and the
// type check of a settings document the adapter merges.
//
// A repository's command-valued setting (a credential helper, a status line
// command, a telemetry headers helper, ...) or an enabled server of its
// project MCP configuration runs the repository's code inside the
// session, outside Enclawed's checks, like a hook does. Each one starts only
// when the administrator grants that exact entry, for that exact repository,
// by digest (the digest covers the file, the key, the full value and every
// project file the command names), so editing it needs a new grant.
//
// Which settings run a command is derived from the host's settings schema
// (commandPathsOf): keys named like a helper program and every object that
// has a `command` field. The adapter turns its host's schema into
// SettingsSchemaNode trees (host data); the derivation and the checks are
// here.
//
// The type check (checkSettingsDocument): a host that drops a whole settings
// file when one value fails its schema would drop Enclawed's own hooks with
// it. So a document the adapter merges into the file that carries Enclawed's
// hooks is checked key by key, strictly: a key the schema does not define, or
// a value the schema cannot vouch for, is refused.
//
// The adapter parses its host's schema; the checker is here.

import { createHash } from "node:crypto";
import path from "node:path";
import type { RepoGrant } from "./admin-grants.js";
import { canonicalOf, referencedFilesIn } from "./env-trust.js";
import { realpathNearestSync } from "./fs-probe.js";

// ─── Repository command settings ────────────────────────────────────────

export type SettingsScope = "managed" | "user" | "project" | "local" | "settings-flag";

/** One settings document the host reads, as the adapter found it. */
export type SettingsSource = Readonly<{ scope: SettingsScope; file: string; doc: unknown }>;

export type CommandSetting = Readonly<{
  scope: "project" | "local";
  file: string;
  /** The dotted settings path, or `mcpServers.<name>` for a project MCP server. */
  key: string;
  /** The command line, shortened, for the message. */
  command: string;
  /** The full value as the host reads it (what the digest covers). */
  value: unknown;
  /** For a project MCP server: what enables it. */
  enabledBy?: "enableAllProjectMcpServers" | "enabledMcpjsonServers" | "non-interactive" | "bypass";
}>;

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const getPath = (doc: unknown, dotted: string): unknown =>
  dotted.split(".").reduce((v: unknown, k) => (isObject(v) ? v[k] : undefined), doc);

function commandText(v: unknown): string {
  if (typeof v === "string") {
    return v;
  }
  if (isObject(v) && typeof v.command === "string") {
    return v.command;
  }
  return JSON.stringify(v) ?? "";
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Every repository setting that runs a command, and every repository MCP
 * server that will start: approved by `enableAllProjectMcpServers` or
 * `enabledMcpjsonServers` in any settings scope, or (as a host may do on
 * its own) every server not disabled in a non-interactive or
 * bypass-permissions session.
 */
export function repositoryCommandSettings(o: {
  settings: readonly SettingsSource[];
  /** The repository's MCP file (`.mcp.json`), if any. */
  mcpJson?: Readonly<{ file: string; doc: unknown }> | null;
  /** commandPathsOf(the host's schema). */
  commandPaths: readonly string[];
  session: Readonly<{ nonInteractive: boolean; bypass: boolean }>;
}): CommandSetting[] {
  const out: CommandSetting[] = [];
  const docs: Record<string, unknown>[] = [];
  for (const s of o.settings) {
    if (!isObject(s.doc)) {
      continue;
    }
    docs.push(s.doc);
    if (s.scope !== "project" && s.scope !== "local") {
      continue;
    }
    for (const key of o.commandPaths) {
      const v = getPath(s.doc, key);
      if (v !== undefined && v !== null && v !== "") {
        out.push({
          scope: s.scope,
          file: s.file,
          key,
          command: commandText(v).slice(0, 200),
          value: v,
        });
      }
    }
  }
  const servers = isObject(o.mcpJson?.doc) ? o.mcpJson.doc.mcpServers : undefined;
  if (o.mcpJson && isObject(servers)) {
    const all = docs.some((d) => d.enableAllProjectMcpServers === true);
    const enabled = new Set(docs.flatMap((d) => stringList(d.enabledMcpjsonServers)));
    const disabled = new Set(docs.flatMap((d) => stringList(d.disabledMcpjsonServers)));
    for (const [name, def] of Object.entries(servers)) {
      if (disabled.has(name)) {
        continue;
      }
      const why: CommandSetting["enabledBy"] | null = all
        ? "enableAllProjectMcpServers"
        : enabled.has(name)
          ? "enabledMcpjsonServers"
          : o.session.nonInteractive
            ? "non-interactive"
            : o.session.bypass
              ? "bypass"
              : null;
      if (!why) {
        continue;
      }
      const cmd =
        isObject(def) && typeof def.command === "string"
          ? [def.command, ...stringList(def.args)].join(" ")
          : isObject(def) && typeof def.url === "string"
            ? def.url
            : (JSON.stringify(def) ?? "");
      out.push({
        scope: "project",
        file: o.mcpJson.file,
        key: `mcpServers.${name}`,
        command: cmd.slice(0, 200),
        value: def ?? null,
        enabledBy: why,
      });
    }
  }
  return out;
}

/** The grant digest of one repository command entry (the same form as a repository hook's). */
export function commandSettingDigest(
  e: Pick<CommandSetting, "file" | "key" | "value">,
  o: { projectDir: string; projectVars?: readonly string[] },
): string {
  const root = realpathNearestSync(path.resolve(o.projectDir));
  const file = path.relative(root, realpathNearestSync(path.resolve(e.file)));
  const doc = {
    v: 1,
    kind: "command",
    file,
    key: e.key,
    value: e.value ?? null,
    files: referencedFilesIn(e.value, root, [...(o.projectVars ?? []), "ENCLAWED_PROJECT_DIR"]),
  };
  return createHash("sha256").update(canonicalOf(doc)).digest("hex");
}

export type CommandRefusal = Readonly<{
  entry: CommandSetting;
  digest: string | null;
  why: string;
  /** The grant an administrator adds (projectCommands) to allow exactly this entry. */
  grant: RepoGrant | null;
}>;

/**
 * The launch decision over the repository's command settings: each must be
 * granted for this repository by digest, or the launch does not start.
 */
export function decideRepositoryCommands(
  entries: readonly CommandSetting[],
  grants: readonly RepoGrant[],
  o: { projectDir: string; projectVars?: readonly string[] },
): { ok: boolean; refusals: CommandRefusal[]; granted: RepoGrant[] } {
  const repo = realpathNearestSync(path.resolve(o.projectDir));
  const refusals: CommandRefusal[] = [];
  const granted: RepoGrant[] = [];
  for (const e of entries) {
    let digest: string;
    try {
      digest = commandSettingDigest(e, o);
    } catch (err) {
      refusals.push({ entry: e, digest: null, why: (err as Error).message, grant: null });
      continue;
    }
    const grant = { repo, digest };
    if (grants.some((g) => g.repo === repo && g.digest === digest)) {
      granted.push(grant);
      continue;
    }
    refusals.push({
      entry: e,
      digest,
      why: e.key.startsWith("mcpServers.")
        ? `the repository's MCP server ${JSON.stringify(e.key.slice("mcpServers.".length))} would start (${e.enabledBy ?? "enabled"}) and run the repository's code outside Enclawed's checks`
        : `the repository sets ${e.key}, which makes the agent CLI run a command outside Enclawed's checks`,
      grant,
    });
  }
  return { ok: refusals.length === 0, refusals, granted };
}

/** The refusals in plain words, with the grant to add for each. */
export function repositoryCommandsMessage(refusals: readonly CommandRefusal[]): string {
  return [
    "Not starting: the repository makes the agent CLI run commands that are not granted.",
    ...refusals.map(
      (r) =>
        `  - ${r.entry.file} ${r.entry.key}: ${r.why}${r.grant ? `. Review it; to start anyway, an administrator adds exactly this entry to projectCommands: ${JSON.stringify(r.grant)} (a changed entry needs a new grant)` : ""}`,
    ),
  ].join("\n");
}

// ─── The settings schema ────────────────────────────────────────────────

type NodeFlags = Readonly<{
  optional?: boolean;
  /** The host replaces a failing value instead of dropping the file. */
  caught?: boolean;
}>;

export type NumberCheck =
  | "int"
  | "positive"
  | "nonnegative"
  | "min"
  | "gte"
  | "max"
  | "lte"
  | "gt"
  | "lt";
export type StringCheck = "min" | "max" | "startsWith";

/** A host settings schema, as a tree the adapter builds from its host's definitions. */
export type SettingsSchemaNode = NodeFlags &
  (
    | Readonly<{ t: "string"; checks?: readonly (readonly [StringCheck, unknown])[] }>
    | Readonly<{ t: "number"; checks?: readonly (readonly [NumberCheck, unknown])[] }>
    | Readonly<{ t: "boolean" }>
    | Readonly<{ t: "literal"; v: unknown }>
    | Readonly<{ t: "enum"; values: readonly unknown[] }>
    | Readonly<{ t: "array"; of: SettingsSchemaNode }>
    | Readonly<{ t: "object"; shape: Readonly<Record<string, SettingsSchemaNode>> }>
    | Readonly<{ t: "record"; key: SettingsSchemaNode; value: SettingsSchemaNode }>
    | Readonly<{ t: "union"; of: readonly SettingsSchemaNode[] }>
    | Readonly<{ t: "unchecked"; why?: string }>
  );

const show = (v: unknown) => (JSON.stringify(v) ?? typeof v).slice(0, 40);

function numberProblem(
  v: unknown,
  checks: readonly (readonly [NumberCheck, unknown])[],
): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return checks.some(([m]) => m === "int") ? "an integer" : "a finite number";
  }
  for (const [m, a] of checks) {
    const n = typeof a === "number" ? a : Number.NaN;
    const ok =
      m === "int"
        ? Number.isSafeInteger(v)
        : m === "positive"
          ? v > 0
          : m === "nonnegative"
            ? v >= 0
            : m === "min" || m === "gte"
              ? v >= n
              : m === "max" || m === "lte"
                ? v <= n
                : m === "gt"
                  ? v > n
                  : v < n;
    if (!ok) {
      return m === "int"
        ? "an integer"
        : m === "positive"
          ? "a number above 0"
          : m === "nonnegative"
            ? "a number of at least 0"
            : `a number with ${m}(${show(a)})`;
    }
  }
  return null;
}

function stringProblem(
  v: unknown,
  checks: readonly (readonly [StringCheck, unknown])[],
): string | null {
  if (typeof v !== "string") {
    return "a string";
  }
  for (const [m, a] of checks) {
    const ok =
      m === "min"
        ? typeof a === "number" && v.length >= a
        : m === "max"
          ? typeof a === "number" && v.length <= a
          : typeof a === "string" && v.startsWith(a);
    if (!ok) {
      return `a string with ${m}(${show(a)})`;
    }
  }
  return null;
}

/** Problems with `value` at `at` against `node`; empty when the host loads it. */
export function checkSettingsValue(
  node: SettingsSchemaNode,
  value: unknown,
  at: string,
  host: string,
  problems: string[] = [],
): string[] {
  if (node.caught) {
    return problems;
  }
  const bad = (want: string) =>
    problems.push(
      `${at} must be ${want} (${host} drops the whole file otherwise), not ${show(value)}`,
    );
  switch (node.t) {
    case "string": {
      const w = stringProblem(value, node.checks ?? []);
      if (w) {
        bad(w);
      }
      break;
    }
    case "number": {
      const w = numberProblem(value, node.checks ?? []);
      if (w) {
        bad(w);
      }
      break;
    }
    case "boolean":
      if (typeof value !== "boolean") {
        bad("true or false");
      }
      break;
    case "literal":
      if (value !== node.v) {
        bad(show(node.v));
      }
      break;
    case "enum":
      if (!node.values.includes(value)) {
        bad(`one of ${node.values.map(show).join(", ")}`);
      }
      break;
    case "array":
      if (!Array.isArray(value)) {
        bad("an array");
      } else {
        value.forEach((x: unknown, i) =>
          checkSettingsValue(node.of, x, `${at}[${i}]`, host, problems),
        );
      }
      break;
    case "object": {
      if (!isObject(value)) {
        bad("an object");
        break;
      }
      for (const [k, x] of Object.entries(value)) {
        const sub = Object.hasOwn(node.shape, k) ? node.shape[k] : null;
        if (!sub) {
          problems.push(
            `${at}.${k} is not a key ${host} defines here, so it cannot be checked before merging`,
          );
        } else {
          checkSettingsValue(sub, x, `${at}.${k}`, host, problems);
        }
      }
      for (const [k, sub] of Object.entries(node.shape)) {
        if (value[k] === undefined && !sub.optional && !sub.caught && sub.t !== "unchecked") {
          problems.push(`${at}.${k} is required`);
        }
      }
      break;
    }
    case "record":
      if (!isObject(value)) {
        bad("an object");
        break;
      }
      for (const [k, x] of Object.entries(value)) {
        checkSettingsValue(node.key, k, `${at} key ${JSON.stringify(k)}`, host, problems);
        checkSettingsValue(node.value, x, `${at}.${k}`, host, problems);
      }
      break;
    case "union":
      if (!node.of.some((b) => checkSettingsValue(b, value, at, host, []).length === 0)) {
        bad("a value of one of the accepted forms");
      }
      break;
    default:
      problems.push(
        `${at}: this value cannot be checked against ${host}'s schema (${node.why ?? "unchecked"}), so it is not merged`,
      );
  }
  return problems;
}

/**
 * Check a whole settings document the adapter merges into the file that
 * carries Enclawed's hooks: every key must be one the schema defines and
 * every value must pass it. An empty list: the host loads it.
 */
export function checkSettingsDocument(
  doc: unknown,
  keys: ReadonlyMap<string, SettingsSchemaNode>,
  host: string,
): string[] {
  if (!isObject(doc)) {
    return ["the settings document must be an object"];
  }
  const problems: string[] = [];
  for (const [k, v] of Object.entries(doc)) {
    const node = keys.get(k);
    if (!node) {
      problems.push(
        `${k} is not a key that can be checked against ${host}'s schema before merging`,
      );
      continue;
    }
    checkSettingsValue(node, v, k, host, problems);
  }
  return problems;
}

/** A key named like a program to run (apiKeyHelper, awsAuthRefresh, awsCredentialExport, processWrapper, ...). */
const COMMAND_NAME = /(Helpers?|Refresh|Export|Wrapper|Commands?)$/;

/**
 * Every settings path whose value makes the host run a command: keys named
 * like a helper program (unless their value cannot hold a command line), and
 * every object in a definition that has a `command` field. `hooks` is decided
 * on its own (decideHooks). Keys the adapter could not turn into a node are
 * passed as `unparsed` with their definition text and counted when they look
 * like either.
 */
export function commandPathsOf(
  keys: ReadonlyMap<string, SettingsSchemaNode>,
  unparsed: Readonly<Record<string, string>> = {},
): string[] {
  const out = new Set<string>();
  const walk = (node: SettingsSchemaNode, at: string) => {
    if (node.t === "object") {
      if (Object.hasOwn(node.shape, "command")) {
        out.add(at);
      }
      for (const [k, sub] of Object.entries(node.shape)) {
        walk(sub, `${at}.${k}`);
      }
    } else if (node.t === "union") {
      for (const b of node.of) {
        walk(b, at);
      }
    } else if (node.t === "array") {
      walk(node.of, at);
    } else if (node.t === "record") {
      walk(node.value, at);
    }
  };
  for (const [k, node] of keys) {
    if (k === "hooks") {
      continue;
    }
    if (COMMAND_NAME.test(k) && !["boolean", "number", "enum", "literal"].includes(node.t)) {
      out.add(k);
    }
    walk(node, k);
  }
  for (const [k, text] of Object.entries(unparsed)) {
    if (k !== "hooks" && (COMMAND_NAME.test(k) || /[{,]command:/.test(text))) {
      out.add(k);
    }
  }
  return [...out].toSorted();
}
