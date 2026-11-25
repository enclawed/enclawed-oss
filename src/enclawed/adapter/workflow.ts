// enclawed adapter kit: workflow profiles, a named allowlist that narrows
// what one session may do.
//
// A profile lists the tool classes and tool names, the path scopes, the shell
// command patterns, the MCP tools and the skills a workflow needs; anything
// outside it is DENIED (not asked) with a reason naming the profile. The
// purpose is to make a hallucinated but technically permitted destructive
// action impossible for the workflow at hand: under `review`, `rm
// data/dummy_1.txt` is denied whatever the host's permission mode.
//
// A profile can only narrow, never widen: the engine checks the profile
// first and, when the profile admits the call, every other rule (allowlists,
// protected paths, reversibility, pre-approval) still runs and still decides.
// A profile never turns a deny or an ask into an allow.
//
// Profiles come from the built-in ones below and from the operator's policy
// (a policy profile with a built-in name replaces it). A launch selects one,
// or the policy binds one to a project directory; a bound project cannot be
// started under another profile (selectWorkflow).
//
//   "<name>": {
//     "description": "...",
//     "tools":    ["read", "session", "shell", "<host tool name>", ...],  classes or exact names
//     "paths":    { "read": ["**"], "write": ["docs/**"] },              globs, project-relative or absolute
//     "commands": ["@read-only", "npm test", "make *"],                  shell command patterns
//     "mcpTools": ["github/get_issue", "github/*", "mcp__github__*"],   MCP tools
//     "skills":   ["*"] | ["name", ...]
//   }
//
// Tool classes are the kit's action kinds, so a profile means the same on
// every host. Ported from codenclawed's workflow.mjs.

import { createHash } from "node:crypto";
import path from "node:path";
import type { ShellClassifier } from "./contracts.js";
import { comparablePath, isInside, type FsProbe } from "./fs-probe.js";
import { strictShellClassifier } from "./shell-readonly.js";
import type { ActionKind, PreActionEvent } from "./types.js";
import { quoteUntrusted as q } from "./untrusted.js";

/** The tool classes a profile may name, and the action kinds in each. */
export const TOOL_CLASSES: Readonly<Record<string, readonly ActionKind[]>> = Object.freeze({
  read: ["read"],
  web: ["fetch", "search"],
  write: ["fs-write"],
  shell: ["shell"],
  agent: ["agent"],
  session: ["session"],
  skill: ["skill"],
  mcp: ["mcp"],
});

/** The shell commands the read-only classifier accepts. */
export const READ_ONLY = "@read-only";

const BUILD_COMMANDS = [
  "npm ci",
  "npm run build",
  "npm run build *",
  "npm test",
  "npm test *",
  "npm run test",
  "npm run test *",
  "npm run lint",
  "npm run lint *",
  "pnpm build",
  "pnpm test",
  "pnpm test *",
  "pnpm run build",
  "pnpm run test",
  "yarn build",
  "yarn test",
  "make",
  "make *",
  "cmake *",
  "ninja",
  "ninja *",
  "cargo build",
  "cargo build *",
  "cargo test",
  "cargo test *",
  "cargo check",
  "cargo check *",
  "go build",
  "go build *",
  "go test",
  "go test *",
  "go vet *",
  "tsc",
  "tsc *",
  "pytest",
  "pytest *",
  "python -m pytest",
  "python -m pytest *",
  "python3 -m pytest",
  "python3 -m pytest *",
  "mvn package",
  "mvn test",
  "gradle build",
  "gradle test",
  "./gradlew build",
  "./gradlew test",
];

export type WorkflowDefinition = Readonly<{
  description?: string;
  tools?: readonly string[];
  paths?: Readonly<{ read?: readonly string[]; write?: readonly string[] }>;
  commands?: readonly string[];
  mcpTools?: readonly string[];
  skills?: readonly string[];
}>;

export type WorkflowProfile = Readonly<{
  name: string;
  description: string;
  tools: readonly string[];
  paths: Readonly<{ read: readonly string[]; write: readonly string[] }>;
  commands: readonly string[];
  mcpTools: readonly string[];
  skills: readonly string[];
  origin?: "built-in" | "policy";
}>;

/** The built-in profiles. A policy profile with the same name replaces one. */
export const BUILTIN_WORKFLOWS: Readonly<Record<string, WorkflowDefinition>> = Object.freeze({
  review: {
    description:
      "read-only review: read and search the project, read-only shell commands; no writes, no network, no MCP tools, no skills",
    tools: ["read", "session", "agent", "shell"],
    paths: { read: ["**"], write: [] },
    commands: [READ_ONLY],
    mcpTools: [],
    skills: [],
  },
  docs: {
    description:
      "documentation: read the project, write only under docs/; read-only shell commands; no network",
    tools: ["read", "session", "agent", "write", "shell"],
    paths: { read: ["**"], write: ["docs/**"] },
    commands: [READ_ONLY],
    mcpTools: [],
    skills: [],
  },
  build: {
    description:
      "build and test: read and write the project, read-only shell commands and allowlisted build commands; no network",
    tools: ["read", "session", "agent", "write", "shell"],
    paths: { read: ["**"], write: ["**"] },
    commands: [READ_ONLY, ...BUILD_COMMANDS],
    mcpTools: [],
    skills: [],
  },
  ops: {
    description:
      "operations: read the project and run only the commands the policy lists explicitly (none built in); no writes, no network",
    tools: ["read", "session", "shell"],
    paths: { read: ["**"], write: [] },
    commands: [],
    mcpTools: [],
    skills: [],
  },
});

const NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const PROFILE_KEYS = new Set(["description", "tools", "paths", "commands", "mcpTools", "skills"]);
const CLASS_NAMES = new Set(Object.keys(TOOL_CLASSES));
// A host tool name (any host: Bash, shell, run_shell_command, ...).
const TOOL_NAME_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
// mcp__<server>__<tool|*> (the host's spelling) or <server>/<tool|*> (the kit's).
const MCP_PATTERN_RE = /^(mcp__[^*]+__(\*|[^*]+)|[^/*\s]+\/(\*|[^/*\s]+))$/;

function stringList(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || x.trim() === "")) {
    throw new Error(`${where} must be a list of non-empty strings`);
  }
  return (v as string[]).map((x) => x.trim());
}

/** Validate one profile definition; returns a normalized copy. Throws on anything unknown. */
export function parseProfile(name: string, def: unknown, where0 = "workflows"): WorkflowProfile {
  const where = `${where0}.${name}`;
  if (!NAME_RE.test(name)) {
    throw new Error(
      `workflow name ${JSON.stringify(name)} must be lowercase letters, digits, "-" or "_" (at most 64)`,
    );
  }
  if (!def || typeof def !== "object" || Array.isArray(def)) {
    throw new Error(`${where} must be an object`);
  }
  const d = def as Record<string, unknown>;
  for (const k of Object.keys(d)) {
    if (!PROFILE_KEYS.has(k)) {
      throw new Error(`unknown key ${where}.${k}`);
    }
  }
  if (d.description !== undefined && typeof d.description !== "string") {
    throw new Error(`${where}.description must be a string`);
  }
  const tools = stringList(d.tools ?? [], `${where}.tools`);
  for (const t of tools) {
    if (!CLASS_NAMES.has(t) && !TOOL_NAME_RE.test(t) && !t.startsWith("mcp__")) {
      throw new Error(
        `${where}.tools: ${JSON.stringify(t)} is neither a tool class (${[...CLASS_NAMES].join(", ")}) nor a tool name`,
      );
    }
  }
  const paths = (d.paths ?? {}) as Record<string, unknown>;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    throw new Error(`${where}.paths must be an object`);
  }
  for (const k of Object.keys(paths)) {
    if (k !== "read" && k !== "write") {
      throw new Error(`unknown key ${where}.paths.${k}`);
    }
  }
  const commands = stringList(d.commands ?? [], `${where}.commands`);
  for (const c of commands) {
    if (c !== READ_ONLY && /[;&|`$<>()\n\r]/.test(c)) {
      throw new Error(
        `${where}.commands: ${JSON.stringify(c)} contains a shell operator; a pattern names one simple command`,
      );
    }
  }
  const mcpTools = stringList(d.mcpTools ?? [], `${where}.mcpTools`);
  for (const t of mcpTools) {
    if (!MCP_PATTERN_RE.test(t)) {
      throw new Error(
        `${where}.mcpTools: ${JSON.stringify(t)} must be <server>/<tool>, <server>/*, mcp__<server>__<tool> or mcp__<server>__*`,
      );
    }
  }
  const skills = stringList(d.skills ?? [], `${where}.skills`);
  return {
    name,
    description: typeof d.description === "string" ? d.description : "",
    tools,
    paths: {
      read: stringList(paths.read ?? ["**"], `${where}.paths.read`),
      write: stringList(paths.write ?? [], `${where}.paths.write`),
    },
    commands,
    mcpTools,
    skills,
  };
}

/** Every profile available: built-in, then the policy's (which replace by name). */
export function allProfiles(
  workflowsBlock: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, WorkflowProfile> {
  const out: Record<string, WorkflowProfile> = {};
  for (const [n, d] of Object.entries(BUILTIN_WORKFLOWS)) {
    out[n] = { ...parseProfile(n, d), origin: "built-in" };
  }
  for (const [n, d] of Object.entries(workflowsBlock ?? {})) {
    out[n] = { ...parseProfile(n, d), origin: "policy" };
  }
  return out;
}

export type WorkflowOptions = Readonly<{
  workflows: Readonly<Record<string, unknown>>;
  /** Absolute project directory -> profile name. */
  projectWorkflows: Readonly<Record<string, string>>;
}>;

/** Parse an operator's `workflows` and `projectWorkflows` blocks; throws on error. */
export function parseWorkflowOptions(block: unknown): WorkflowOptions {
  const b = (block ?? {}) as Record<string, unknown>;
  const workflows = b.workflows;
  if (
    workflows !== undefined &&
    (!workflows || typeof workflows !== "object" || Array.isArray(workflows))
  ) {
    throw new Error("workflows must be an object of named profiles");
  }
  const profiles = allProfiles(workflows as Record<string, unknown> | undefined);
  const pw = b.projectWorkflows;
  if (pw !== undefined && (!pw || typeof pw !== "object" || Array.isArray(pw))) {
    throw new Error(
      "projectWorkflows must be an object mapping project directories to profile names",
    );
  }
  const bindings: Record<string, string> = {};
  for (const [dir, name] of Object.entries((pw ?? {}) as Record<string, unknown>)) {
    if (!path.isAbsolute(dir)) {
      throw new Error(`projectWorkflows: ${JSON.stringify(dir)} must be an absolute directory`);
    }
    if (typeof name !== "string" || !Object.hasOwn(profiles, name)) {
      throw new Error(
        `projectWorkflows[${JSON.stringify(dir)}]: unknown workflow ${JSON.stringify(name)} (known: ${Object.keys(profiles).join(", ")})`,
      );
    }
    bindings[path.resolve(dir)] = name;
  }
  return { workflows: (workflows ?? {}) as Record<string, unknown>, projectWorkflows: bindings };
}

function canon(v: unknown): string {
  if (v === null || typeof v !== "object") {
    return JSON.stringify(v) ?? "null";
  }
  if (Array.isArray(v)) {
    return `[${v.map(canon).join(",")}]`;
  }
  const r = v as Record<string, unknown>;
  return `{${Object.keys(r)
    .filter((k) => r[k] !== undefined && k !== "origin")
    .toSorted()
    .map((k) => `${JSON.stringify(k)}:${canon(r[k])}`)
    .join(",")}}`;
}

/** The canonical digest of a resolved profile (for the audit record). Its origin is not part of it. */
export function profileDigest(profile: WorkflowProfile | null): string {
  return createHash("sha256")
    .update(canon(profile ?? null))
    .digest("hex");
}

/** The project binding that covers `projectDir` (the nearest bound ancestor), or null. */
export function boundWorkflow(
  bindings: Readonly<Record<string, string>> | null | undefined,
  projectDir: string,
  realpathNearest: (p: string) => string,
): { dir: string; name: string } | null {
  let best: { dir: string; name: string } | null = null;
  for (const [dir, name] of Object.entries(bindings ?? {})) {
    const real = realpathNearest(dir);
    if (isInside(real, projectDir) && (!best || real.length > best.dir.length)) {
      best = { dir: real, name };
    }
  }
  return best;
}

export type WorkflowSelection =
  | Readonly<{
      ok: true;
      profile: WorkflowProfile | null;
      source: "flag" | "project-binding" | null;
      boundTo?: string;
    }>
  | Readonly<{ ok: false; message: string }>;

/** Which profile a launch runs under. A project bound to a profile cannot run under another. */
export function selectWorkflow(o: {
  requested: string | null | undefined;
  options: WorkflowOptions | null | undefined;
  projectDir: string;
  realpathNearest: (p: string) => string;
}): WorkflowSelection {
  const profiles = allProfiles(o.options?.workflows);
  const bound = boundWorkflow(o.options?.projectWorkflows, o.projectDir, o.realpathNearest);
  if (o.requested !== null && o.requested !== undefined) {
    if (!Object.hasOwn(profiles, o.requested)) {
      return {
        ok: false,
        message: `unknown workflow ${JSON.stringify(o.requested)}; known: ${Object.keys(profiles).toSorted().join(", ")}`,
      };
    }
    if (bound && bound.name !== o.requested) {
      return {
        ok: false,
        message: `the policy binds ${bound.dir} to the workflow "${bound.name}"; it cannot be started under "${o.requested}"`,
      };
    }
    return {
      ok: true,
      profile: profiles[o.requested],
      source: bound ? "project-binding" : "flag",
      ...(bound ? { boundTo: bound.dir } : {}),
    };
  }
  if (bound) {
    return {
      ok: true,
      profile: profiles[bound.name],
      source: "project-binding",
      boundTo: bound.dir,
    };
  }
  return { ok: true, profile: null, source: null };
}

// ─── Matching ───────────────────────────────────────────────────────────

const caseFolding = process.platform === "darwin" || process.platform === "win32";

/** A path glob as an anchored RegExp over absolute paths ("**" crosses "/", "*" does not). */
export function pathGlobRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      // "**/" matches zero or more directories; a trailing "**" anything below.
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`, caseFolding ? "i" : "");
}

function absGlob(glob: string, projectDir: string, home: string | null): string {
  let g = glob;
  if (home && /^~(?=$|\/)/.test(g)) {
    g = home + g.slice(1);
  }
  if (!path.isAbsolute(g)) {
    g = path.join(projectDir, g);
  }
  return g;
}

/** Does any glob cover the absolute (real) path `p`? A directory glob "x/**" also covers "x". */
export function pathAllowed(
  globs: readonly string[],
  p: string,
  ctx: { projectDir: string; home: string | null },
): boolean {
  const target = comparablePath(p);
  for (const g of globs) {
    const abs = absGlob(g, ctx.projectDir, ctx.home);
    if (pathGlobRegExp(comparablePath(abs)).test(target)) {
      return true;
    }
    if (abs.endsWith("/**") && comparablePath(abs.slice(0, -3)) === target) {
      return true;
    }
  }
  return false;
}

/** Split one simple command into words (single and double quotes; no expansions). Null when it is not simple. */
export function simpleWords(command: unknown): string[] | null {
  if (typeof command !== "string" || /[;&|`$<>()\n\r\\]/.test(command)) {
    return null;
  }
  const out: string[] = [];
  let cur = "";
  let inWord = false;
  let quote: string | null = null;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) {
        out.push(cur);
        cur = "";
        inWord = false;
      }
    } else {
      cur += ch;
      inWord = true;
    }
  }
  if (quote) {
    return null;
  }
  if (inWord) {
    out.push(cur);
  }
  return out;
}

function wordMatches(pattern: string, word: string): boolean {
  if (!pattern.includes("*")) {
    return pattern === word;
  }
  const re = new RegExp(
    `^${pattern
      .split("*")
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]*")}$`,
  );
  return re.test(word);
}

/** Does the simple command `cmdWords` match the pattern ("make *": make with any further arguments)? */
export function commandMatches(pattern: string, cmdWords: readonly string[]): boolean {
  const p = pattern.trim().split(/\s+/);
  const rest = p[p.length - 1] === "*";
  const fixed = rest ? p.slice(0, -1) : p;
  if (rest ? cmdWords.length < fixed.length : cmdWords.length !== fixed.length) {
    return false;
  }
  return fixed.every((pw, i) => wordMatches(pw, cmdWords[i]));
}

function toolInProfile(profile: WorkflowProfile, event: PreActionEvent): boolean {
  for (const t of profile.tools) {
    if (Object.hasOwn(TOOL_CLASSES, t)) {
      if (TOOL_CLASSES[t].includes(event.kind)) {
        return true;
      }
      continue;
    }
    if (t === event.tool || event.policyIds.includes(t)) {
      return true;
    }
  }
  return false;
}

function mcpListed(profile: WorkflowProfile, event: PreActionEvent): boolean {
  return profile.mcpTools.some((p) => {
    if (p.startsWith("mcp__")) {
      // The host's own spelling of the tool name.
      return p.endsWith("__*") ? event.tool.startsWith(p.slice(0, -1)) : p === event.tool;
    }
    if (!event.mcp) {
      return false;
    }
    const [server, tool] = p.split("/");
    return server === event.mcp.server && (tool === "*" || tool === event.mcp.tool);
  });
}

export type WorkflowVerdict = null | Readonly<{ code: `workflow:${string}`; reason: string }>;

function refuse(profile: WorkflowProfile, code: string, why: string): WorkflowVerdict {
  return {
    code: `workflow:${code}`,
    reason: `workflow "${profile.name}" does not allow this: ${why}. Every request outside the profile is denied, whatever the agent CLI's permission mode`,
  };
}

/**
 * The profile's verdict on one call: null when the profile admits it (the
 * other rules then still apply), else { code, reason } to deny.
 */
export function workflowVerdict(
  profile: WorkflowProfile | null | undefined,
  event: PreActionEvent,
  ctx: {
    cwd: string;
    projectDir: string;
    home: string | null;
    fs: Pick<FsProbe, "realpathNearest">;
    shell?: ShellClassifier;
  },
): WorkflowVerdict {
  if (!profile) {
    return null;
  }
  if (event.kind === "mcp") {
    return mcpListed(profile, event)
      ? null
      : refuse(
          profile,
          "mcp-tool-not-allowed",
          `the MCP tool ${q(event.tool, { max: 120 })} is not on its mcpTools list`,
        );
  }
  if (!toolInProfile(profile, event)) {
    return refuse(
      profile,
      "tool-not-allowed",
      `the tool ${q(event.tool, { max: 120 })} is not in its tools (${profile.tools.join(", ") || "none"})`,
    );
  }
  const real = (p: string) => ctx.fs.realpathNearest(p);
  const resolve = (v: string) =>
    path.resolve(ctx.cwd, ctx.home && /^~(?=$|\/)/.test(v) ? ctx.home + v.slice(1) : v);
  switch (event.kind) {
    case "skill": {
      const name = event.skill ?? "";
      return profile.skills.includes("*") || profile.skills.includes(name)
        ? null
        : refuse(
            profile,
            "skill-not-allowed",
            `the skill ${q(name, { max: 120 })} is not on its skills list`,
          );
    }
    case "read": {
      for (const r of event.reads ?? []) {
        if (typeof r.path !== "string" || r.path === "") {
          continue;
        }
        const t = resolve(r.path);
        if (!pathAllowed(profile.paths.read, real(t), ctx)) {
          return refuse(
            profile,
            "path-not-allowed",
            `reading ${q(t)} is outside its read scope (${profile.paths.read.join(", ") || "none"})`,
          );
        }
      }
      return null;
    }
    case "fs-write": {
      const writes = (event.writes ?? []).filter((w) => typeof w.path === "string" && w.path);
      if (writes.length === 0) {
        return refuse(profile, "path-not-allowed", "the write names no target");
      }
      for (const w of writes) {
        const abs = path.resolve(ctx.cwd, w.path);
        for (const t of new Set([abs, real(abs)])) {
          if (!pathAllowed(profile.paths.write, t, ctx)) {
            return refuse(
              profile,
              "path-not-allowed",
              `writing ${q(w.path)} (resolves to ${q(real(abs))}) is outside its write scope (${profile.paths.write.join(", ") || "no writes"})`,
            );
          }
        }
      }
      return null;
    }
    case "shell": {
      const command = event.command?.text ?? "";
      const dialect = event.command?.dialect ?? "posix";
      if (profile.commands.includes(READ_ONLY)) {
        if ((ctx.shell ?? strictShellClassifier).classify(command, dialect).readOnly) {
          return null;
        }
      }
      const cmdWords = dialect === "posix" ? simpleWords(command.trim()) : null;
      const explicit = profile.commands.filter((c) => c !== READ_ONLY);
      if (cmdWords && cmdWords.length > 0 && explicit.some((p) => commandMatches(p, cmdWords))) {
        return null;
      }
      const allowed = profile.commands.length
        ? profile.commands.map((c) => JSON.stringify(c)).join(", ")
        : "no commands";
      return refuse(
        profile,
        "command-not-allowed",
        `the command ${q(command, { max: 300 })} is not one it allows (${allowed.length > 300 ? `${allowed.slice(0, 300)}...` : allowed})${cmdWords === null && explicit.length ? "; a compound, redirected or expanded command never matches an explicit pattern" : ""}`,
      );
    }
    default:
      // web, agent, session tools: the class decides.
      return null;
  }
}

/** A profile as one line per field, for a launcher's `workflow show` and doctor output. */
export function describeProfile(p: WorkflowProfile): string {
  return [
    `${p.name} (${p.origin ?? "policy"}): ${p.description || "(no description)"}`,
    `  tools: ${p.tools.join(", ") || "none"}`,
    `  read paths: ${p.paths.read.join(", ") || "none"}`,
    `  write paths: ${p.paths.write.join(", ") || "none"}`,
    `  commands: ${p.commands.join(", ") || "none"}`,
    `  MCP tools: ${p.mcpTools.join(", ") || "none"}`,
    `  skills: ${p.skills.join(", ") || "none"}`,
  ].join("\n");
}
