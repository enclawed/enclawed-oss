// The seam adapters use: start an admitted MCP server, a project script or
// a package install only inside a containment, or refuse.
//
// For an MCP server the admission record (signed, verified by the kit)
// carries a `containment` part (McpContainmentRecord): the folders the
// server may use, the programs it may start, its pinned package tree, its
// environment, its secrets and its destinations. The adapter passes the
// server's definition (command, args, env) and that part; it gets back an
// argv to spawn, or a refusal with a message. Every decision is made here.

import os from "node:os";
import path from "node:path";
import { hostUid } from "../hardware-root/userns.js";
import type { CodePin } from "./code-guard.js";
import {
  ContainmentUnavailableError,
  containmentSupport,
  openContainment,
  uncontainedRefusal,
  type Containment,
  type OpenContainmentOptions,
} from "./host.js";
import { ensureNameGuard } from "./name-guard.js";
import {
  lookupProgram,
  nodeToolchain,
  planContainment,
  type ContainmentDeclaration,
  type ContainmentDestination,
  type ContainmentPlan,
  type ContainmentRoot,
  type ContainmentSecret,
  type PlanContext,
} from "./plan.js";
import type { RequestShapeProfileId } from "./request-shape.js";

export type McpContainmentRecord = Readonly<{
  /** Folders the server may use (a filesystem server's allowed directories, a git server's repositories). */
  roots: readonly ContainmentRoot[];
  /** The server's pinned package tree (M2 store), mounted read-only and executable. */
  packageRoot?: string | null;
  /** Programs the server may start besides its own command (a git server: "git"). Default: none. */
  programs?: readonly string[];
  /** Working directory; default: the package root, else the first root. */
  cwd?: string | null;
  /** Non-secret variables of the definition's environment that the server receives. */
  env?: readonly string[];
  /** Variables of the definition's environment that are secrets: the server gets a handle. */
  secrets?: readonly ContainmentSecret[];
  destinations?: readonly ContainmentDestination[];
  execConfigWritable?: readonly string[];
}>;

export type McpServerDefinitionInput = Readonly<{
  name: string;
  command: string;
  args: readonly string[];
  env?: Readonly<Record<string, string>>;
  /**
   * The definition's working directory (`uv run --directory`, a server that
   * starts in its project). It must lie inside a declared root or the
   * package root; otherwise the plan refuses (containment-cwd-outside-roots).
   * Default: the record's cwd, else the package root, else the first root.
   */
  cwd?: string | null;
}>;

export type ContainOutcome =
  | Readonly<{ ok: true; containment: Containment; plan: ContainmentPlan }>
  | Readonly<{ ok: false; code: string; message: string }>;

function defaultContext(): PlanContext {
  const uid = hostUid() ?? process.getuid?.() ?? 65534;
  const gid = process.getgid?.() ?? 65534;
  // Never root inside: a uid 0 would keep capabilities in the sandbox's namespace.
  return { home: os.homedir(), uid: uid === 0 ? 65534 : uid, gid: gid === 0 ? 65534 : gid };
}

/** The declaration for an admitted MCP server. Values of secret variables are returned separately. */
export function mcpContainmentDeclaration(
  def: McpServerDefinitionInput,
  rec: McpContainmentRecord,
): { declaration: ContainmentDeclaration; secretValues: Map<string, string>; missing: string[] } {
  const defEnv = def.env ?? {};
  const env: Record<string, string> = {};
  for (const k of rec.env ?? []) {
    if (k in defEnv) {
      env[k] = defEnv[k];
    }
  }
  const secretValues = new Map<string, string>();
  const missing: string[] = [];
  for (const s of rec.secrets ?? []) {
    const v = defEnv[s.variable];
    if (v === undefined) {
      missing.push(s.variable);
    } else {
      secretValues.set(s.id, v);
    }
  }
  const roots: ContainmentRoot[] = [...rec.roots];
  if (rec.packageRoot) {
    roots.push({ path: rec.packageRoot, access: "ro", exec: true });
  }
  const cwd = def.cwd ?? rec.cwd ?? rec.packageRoot ?? rec.roots[0]?.path ?? "/";
  return {
    declaration: {
      kind: "mcp-server",
      label: def.name,
      command: def.command,
      args: [...def.args],
      cwd,
      roots,
      programs: [def.command, ...(rec.programs ?? [])],
      env,
      secrets: rec.secrets ?? [],
      destinations: rec.destinations ?? [],
      execConfigWritable: rec.execConfigWritable ?? [],
    },
    secretValues,
    missing,
  };
}

async function contain(
  declaration: ContainmentDeclaration,
  secretValues: ReadonlyMap<string, string>,
  opts: Omit<OpenContainmentOptions, "secretValues">,
  ctx: PlanContext,
): Promise<ContainOutcome> {
  const sup = containmentSupport();
  if (!sup.ok) {
    return {
      ok: false,
      code: "containment-unavailable",
      message: uncontainedRefusal(declaration.label, declaration.kind, sup.reason),
    };
  }
  // Every contained process starts under the name guard; without it, nothing starts.
  const guard = ensureNameGuard(opts.stateDir);
  if (!guard.ok) {
    return {
      ok: false,
      code: "containment-unavailable",
      message: uncontainedRefusal(declaration.label, declaration.kind, guard.reason),
    };
  }
  const planned = planContainment(declaration, { ...ctx, nameGuard: guard.binary });
  if (!planned.ok) {
    return {
      ok: false,
      code: planned.code,
      message: `Enclawed: ${declaration.label} was not started: ${planned.message}`,
    };
  }
  try {
    const containment = await openContainment(planned.plan, { ...opts, secretValues });
    return { ok: true, containment, plan: planned.plan };
  } catch (err) {
    if (err instanceof ContainmentUnavailableError) {
      return {
        ok: false,
        code: err.code,
        message: uncontainedRefusal(declaration.label, declaration.kind, err.reason),
      };
    }
    return {
      ok: false,
      code: "containment-setup-failed",
      message: `Enclawed: ${declaration.label} was not started: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Start an admitted MCP server contained, or refuse (`mcp-server-not-contained` family). */
export async function containMcpServer(
  def: McpServerDefinitionInput,
  rec: McpContainmentRecord | null | undefined,
  opts: Omit<OpenContainmentOptions, "secretValues">,
  ctx: PlanContext = defaultContext(),
): Promise<ContainOutcome> {
  if (!rec) {
    return {
      ok: false,
      code: "mcp-server-not-contained",
      message: `Enclawed: MCP server "${def.name}" was not started: its admission record declares no containment (folders, programs, destinations). Re-admit it with a containment declaration.`,
    };
  }
  const { declaration, secretValues, missing } = mcpContainmentDeclaration(def, rec);
  if (missing.length > 0) {
    return {
      ok: false,
      code: "containment-declaration-invalid",
      message: `Enclawed: MCP server "${def.name}" was not started: its definition has no value for the declared secret variable(s) ${missing.join(", ")}`,
    };
  }
  return contain(declaration, secretValues, opts, ctx);
}

export type ProjectScriptInput = Readonly<{
  label: string;
  projectDir: string;
  command: string;
  args: readonly string[];
  cwd?: string;
  /** Programs beyond the node toolchain (node, sh, env, npm). */
  programs?: readonly string[];
  /** Hosts the project policy declares (e.g. the package registry for an install). */
  destinations?: readonly ContainmentDestination[];
  env?: Readonly<Record<string, string>>;
  kind?: "project-script" | "package-install";
  /** The code Enclawed read before offering containment: nothing else loads (./code-guard.ts). */
  codePins?: readonly CodePin[];
}>;

/**
 * What project scripts and installs run besides the node toolchain: npm,
 * yarn, pnpm and make hand every script to `sh -c`, and scripts call the
 * standard POSIX tools. Each is resolved to its real binary with its
 * interpreter and shared libraries (the program allowlist of ./plan.ts);
 * a tool this host does not have is left out. The security of a contained
 * script comes from its view, the name guard, the network relay and the
 * absence of credentials, not from the absence of a shell.
 */
export const PROJECT_SCRIPT_PROGRAMS = [
  "/bin/sh",
  "sh",
  "bash",
  "make",
  "env",
  "awk",
  "sed",
  "grep",
  "find",
  "xargs",
  "mkdir",
  "rm",
  "rmdir",
  "cp",
  "mv",
  "ln",
  "cat",
  "test",
  "[",
  "printf",
  "echo",
  "tee",
  "sort",
  "uniq",
  "head",
  "tail",
  "tr",
  "cut",
  "basename",
  "dirname",
  "which",
  "uname",
  "date",
  "sleep",
  "true",
  "false",
  "chmod",
  "touch",
  "wc",
  "diff",
  "tar",
  "gzip",
  "ls",
  "pwd",
  "expr",
  "id",
  "readlink",
  "realpath",
  "mktemp",
];

/** The project-script tools this host has (each name or path that resolves). */
export function projectScriptPrograms(): string[] {
  return PROJECT_SCRIPT_PROGRAMS.filter((p) => lookupProgram(p) !== null);
}

/** The declaration for a project script or package install: project read-write, toolchain read-only. */
export function projectScriptDeclaration(input: ProjectScriptInput): ContainmentDeclaration {
  const tc = nodeToolchain();
  return {
    kind: input.kind ?? "project-script",
    label: input.label,
    command: input.command,
    args: [...input.args],
    cwd: input.cwd ?? input.projectDir,
    roots: [{ path: input.projectDir, access: "rw", exec: true }, ...tc.roots],
    programs: [...new Set([...tc.programs, ...projectScriptPrograms(), ...(input.programs ?? [])])],
    env: input.env ?? {},
    destinations: input.destinations ?? [],
    ...(input.codePins ? { codePins: input.codePins } : {}),
  };
}

/**
 * The package registries an install may reach, by package manager. The
 * containment's own table: an install reaches its registry and nothing
 * else unless the operator declares a mirror.
 */
export const PACKAGE_REGISTRIES: Readonly<Record<string, readonly string[]>> = {
  npm: ["registry.npmjs.org"],
  pnpm: ["registry.npmjs.org"],
  yarn: ["registry.yarnpkg.com", "registry.npmjs.org"],
  bun: ["registry.npmjs.org"],
  pip: ["pypi.org", "files.pythonhosted.org"],
  pip3: ["pypi.org", "files.pythonhosted.org"],
  uv: ["pypi.org", "files.pythonhosted.org"],
  poetry: ["pypi.org", "files.pythonhosted.org"],
  // Package runners (./adapter/runner-pins.ts): what they fetch at pin time.
  npx: ["registry.npmjs.org"],
  pnpx: ["registry.npmjs.org"],
  bunx: ["registry.npmjs.org"],
  uvx: ["pypi.org", "files.pythonhosted.org"],
  pipx: ["pypi.org", "files.pythonhosted.org"],
};

/** The request shape of each package manager's registry (./request-shape.ts). */
export const PACKAGE_REGISTRY_PROFILES: Readonly<Record<string, RequestShapeProfileId>> = {
  npm: "npm-registry",
  pnpm: "npm-registry",
  yarn: "npm-registry",
  bun: "npm-registry",
  pip: "pypi",
  pip3: "pypi",
  uv: "pypi",
  poetry: "pypi",
  npx: "npm-registry",
  pnpx: "npm-registry",
  bunx: "npm-registry",
  uvx: "pypi",
  pipx: "pypi",
};

/**
 * The destinations an install reaches: each registry (the tool's public one,
 * or the operator's mirrors) as an inspected background destination WITH the
 * registry's request shape, so only package metadata and artifact fetches
 * reach it. A mirror is a host ("npm.mirror.example"), or a URL whose path is
 * where the registry protocol is served
 * ("https://artifacts.example/artifactory/api/npm/npm-remote"): the path
 * becomes the shape's prefix and nothing outside it is reachable. A Python
 * index URL as pip and uv name it (".../simple/", what pythonIndexUrls
 * returns for a runner) is served from the part before /simple; PyPI's own
 * index adds its files host.
 */
export function registryDestinations(
  tool: string,
  o: Readonly<{
    registries?: readonly string[];
    pins?: Readonly<Record<string, string>>;
    requirePins?: boolean;
  }> = {},
): ContainmentDestination[] | { error: string } {
  const profile = PACKAGE_REGISTRY_PROFILES[tool];
  const registries = o.registries ?? PACKAGE_REGISTRIES[tool];
  if (!profile || !registries || registries.length === 0) {
    return { error: `no package registry is known for "${tool}"` };
  }
  const out: ContainmentDestination[] = [];
  for (const r of registries) {
    let host: string;
    let port = 443;
    let mode: "inspect" | "http" = "inspect";
    let pathPrefix = "";
    if (r.includes("://")) {
      let u: URL;
      try {
        u = new URL(r);
      } catch {
        return { error: `registry ${JSON.stringify(r)} is not a URL` };
      }
      if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) {
        return {
          error: `registry ${JSON.stringify(r)} must be an https or http URL without credentials`,
        };
      }
      if (u.search || u.hash) {
        return { error: `registry ${JSON.stringify(r)} carries a query or fragment` };
      }
      host = u.hostname.toLowerCase();
      mode = u.protocol === "https:" ? "inspect" : "http";
      port = u.port ? Number(u.port) : mode === "inspect" ? 443 : 80;
      // The path as written (a URL parser would have resolved dot segments away).
      const raw = /^[a-z]+:\/\/[^/?#]*([^?#]*)/i.exec(r)?.[1] ?? "";
      pathPrefix = raw === "/" ? "" : raw.replace(/\/$/, "");
      if (profile === "pypi") {
        pathPrefix = pathPrefix.replace(/\/simple$/, "");
      }
    } else {
      host = r.toLowerCase();
    }
    out.push({
      host,
      port,
      mode,
      background: true,
      shape: {
        profile,
        pathPrefix,
        ...(o.pins ? { pins: o.pins } : {}),
        ...(o.requirePins ? { requirePins: true } : {}),
      },
    });
  }
  if (
    profile === "pypi" &&
    out.some((d) => d.host === "pypi.org" && d.port === 443) &&
    !out.some((d) => d.host === "files.pythonhosted.org")
  ) {
    const pypi = out.find((d) => d.host === "pypi.org")!;
    out.push({ ...pypi, host: "files.pythonhosted.org" });
  }
  return out;
}

export type PackageInstallInput = Readonly<{
  label: string;
  /** The package manager (npm, pnpm, yarn, bun, pip, pip3, uv, poetry). */
  tool: string;
  projectDir: string;
  command: string;
  args: readonly string[];
  cwd?: string;
  /** Programs beyond the toolchain (pip needs python3). */
  programs?: readonly string[];
  env?: Readonly<Record<string, string>>;
  /** Registry mirrors the operator declared, instead of the tool's public registry (hosts, or URLs with the registry's path prefix). */
  registries?: readonly string[];
  /** Artifact pins (path below the registry prefix -> npm SRI or "sha256:<hex>"), verified by the relay. */
  pins?: Readonly<Record<string, string>>;
  /** Refuse an artifact that has no pin. */
  requirePins?: boolean;
}>;

/**
 * The declaration for a package install (M5): lifecycle scripts run, the
 * project is read-only except the install's outputs, lockfiles and manifest
 * (./plan.ts, ./install-guard.ts), and the network reaches only the
 * registry (inspected, through the relay; no call is in flight during an
 * install, so the registry is a background destination), and only with the
 * registry protocol's requests (registryDestinations: package metadata and
 * artifact fetches; pinned artifacts verified before the install sees them).
 */
export function packageInstallDeclaration(
  input: PackageInstallInput,
): ContainmentDeclaration | { error: string } {
  const destinations = registryDestinations(input.tool, {
    registries: input.registries,
    pins: input.pins,
    requirePins: input.requirePins,
  });
  if ("error" in destinations) {
    return destinations;
  }
  return projectScriptDeclaration({
    label: input.label,
    kind: "package-install",
    projectDir: input.projectDir,
    command: input.command,
    args: input.args,
    cwd: input.cwd,
    programs: input.programs,
    env: input.env,
    destinations,
  });
}

/** Run a package install caged (M5), or refuse. */
export async function containPackageInstall(
  input: PackageInstallInput,
  opts: Omit<OpenContainmentOptions, "secretValues">,
  ctx: PlanContext = defaultContext(),
): Promise<ContainOutcome> {
  const declaration = packageInstallDeclaration(input);
  if ("error" in declaration) {
    return {
      ok: false,
      code: "containment-declaration-invalid",
      message: `Enclawed: ${input.label} was not started: ${declaration.error}`,
    };
  }
  return contain(declaration, new Map(), opts, ctx);
}

/** Run a project script (npm test, make, ...) or package install contained, or refuse. */
export async function containProjectScript(
  input: ProjectScriptInput,
  opts: Omit<OpenContainmentOptions, "secretValues">,
  ctx: PlanContext = defaultContext(),
): Promise<ContainOutcome> {
  return contain(projectScriptDeclaration(input), new Map(), opts, ctx);
}

// ─── Calls made under a verified skill ──────────────────────────────────

/**
 * POSIX tools a shell skill without spawn.proc still has: the shell's own
 * text and file utilities. Never another interpreter, package manager,
 * build tool or a program that starts programs (env, xargs, find, awk, sed,
 * tar, make). Their effects are bounded by the view and the relay like the
 * script's own.
 */
const SHELL_SKILL_UTILITIES = PROJECT_SCRIPT_PROGRAMS.filter(
  (p) =>
    !["/bin/sh", "sh", "bash", "make", "env", "xargs", "find", "awk", "sed", "tar"].includes(p),
);
const SHELLS = new Set(["sh", "bash", "dash"]);

export type SkillRunInput = Readonly<{
  /** "skill <name>", for messages and audit. */
  label: string;
  /** The private, digest-checked copy of the skill the file runs from. */
  skillDir: string;
  projectDir: string;
  cwd: string;
  /** The script's interpreter (a program name looked up in the system directories). */
  interpreter: string;
  /** The script, absolute, inside skillDir. */
  file: string;
  args: readonly string[];
  /** The skill's admitted capabilities. */
  caps: readonly string[];
  /** Its declared net.egress targets as destinations (with their request shapes). */
  destinations: readonly ContainmentDestination[];
}>;

/**
 * The containment of a call made under a verified skill: exactly the
 * skill's admitted capabilities. The skill's copy read-only; the project
 * read-only with fs.read, read-write with fs.write.rev / fs.write.irrev
 * (the files that configure what runs later stay read-only), absent
 * otherwise; programs: the interpreter (and, for a shell script, the
 * shell's utilities), the project-script toolchain only with spawn.proc;
 * the network only with net.egress, only to the declared targets, through
 * the relay with each target's request shape. No credential, no inherited
 * environment.
 */
export function skillRunDeclaration(input: SkillRunInput): ContainmentDeclaration {
  const has = (c: string) => input.caps.includes(c);
  const write = has("fs.write.rev") || has("fs.write.irrev");
  const read = write || has("fs.read");
  const spawn = has("spawn.proc");
  const tc = spawn ? nodeToolchain() : { programs: [], roots: [] };
  const inProject = (p: string) => {
    const rel = path.relative(input.projectDir, p);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  const programs = spawn
    ? [...tc.programs, ...projectScriptPrograms(), input.interpreter]
    : SHELLS.has(input.interpreter)
      ? [input.interpreter, ...SHELL_SKILL_UTILITIES.filter((p) => lookupProgram(p) !== null)]
      : [input.interpreter];
  return {
    kind: "project-script",
    label: input.label,
    command: input.interpreter,
    args: [input.file, ...input.args],
    cwd: read && inProject(input.cwd) ? input.cwd : input.skillDir,
    roots: [
      { path: input.skillDir, access: "ro", exec: false },
      ...(read
        ? [
            {
              path: input.projectDir,
              access: write ? ("rw" as const) : ("ro" as const),
              exec: spawn,
            },
          ]
        : []),
      ...tc.roots,
    ],
    programs: [...new Set(programs)],
    env: {},
    destinations: has("net.egress")
      ? input.destinations.map((d) => ({ ...d, background: true }))
      : [],
  };
}

/** Run one call of a verified skill contained with its admitted capabilities, or refuse. */
export async function containSkillRun(
  input: SkillRunInput,
  opts: Omit<OpenContainmentOptions, "secretValues">,
  ctx: PlanContext = defaultContext(),
): Promise<ContainOutcome> {
  return contain(skillRunDeclaration(input), new Map(), opts, ctx);
}
