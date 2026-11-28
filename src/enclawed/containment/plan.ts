// Containment plans (M1): what a contained process sees, may run, inherits
// and may reach, decided from a declaration before anything starts.
//
// A declaration names the folders (roots) the process may use, the
// programs it may run, its environment, the secrets it may use by handle
// and the destinations it may reach. The plan turns it into an exact
// filesystem view built from an EMPTY root:
//
//   - each declared root bound at its own path, read-only or read-write;
//   - inside every read-write root, the files that configure what runs
//     later (agent CLI config dirs, .mcp.json, .vscode, .github/workflows,
//     git hooks and git config, ...) bound again read-only, and the missing
//     ones at the top of the root (directories AND files) made to exist as
//     read-only placeholders, so a worm cannot plant `.claude/settings.json`
//     or `.mcp.json` through a contained process. Every directory between
//     the root and a protected path is bound onto itself, which makes it a
//     mount point in the sandbox: renaming or removing it there fails
//     (EBUSY), so a protected path cannot be moved aside and recreated;
//   - for a package install, every existing top-level entry of the project
//     read-only except the install's outputs (node_modules, a virtualenv,
//     generated build directories the project ignores), its lockfiles and
//     the manifest (whose non-dependency fields are checked afterwards), so
//     a malicious lifecycle script cannot rewrite the project's source;
//   - credential stores of the user inside any root masked (empty, read-only);
//   - the declared programs, their interpreters and shared libraries bound
//     read-only (the exec allowlist: nothing else executable exists);
//   - a private /tmp and HOME (tmpfs), generated /etc files, a few devices;
//   - nothing else: $HOME, /etc, /run and every undeclared path do not exist.
//
// Strict-exec plans (MCP servers) also mount every writable place noexec
// and refuse anonymous executable memory (./seccomp.ts), so the program
// allowlist is exhaustive. Project scripts and package installs run project
// code by definition; for them the allowlist covers system programs.
//
// The environment is built from nothing: no variable of the launching
// process is inherited. Secrets are never placed in the view or the
// environment; the process gets a handle that the relay (./relay.ts)
// replaces with the value only in a request to that secret's declared
// destinations.
//
// This module decides; ./contain-init.ts carries out the mounts inside the
// namespaces and ./host.ts starts it. Every refusal names its reason.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { scan as dlpScan } from "../dlp-scanner.js";
import { GPU_DEVICE, GPU_DRIVER_DIRS } from "./build-mode.js";
import {
  CODE_GUARD_DIR,
  NODE_GUARD_PATH,
  PY_CACHE_PREFIX,
  PY_GUARD_PATH,
  UNGUARDED_INTERPRETERS,
  guardedInterpreter,
  guardedShell,
  guardedAwk,
  SHELL_COPY_DIR,
  NODE_GUARD_OPTIONS,
  WRAPPERS_CONF_PATH,
  nodeGuardSource,
  pythonGuardSource,
  type CodePin,
} from "./code-guard.js";
import { realCopiesDir, realProgramCopy } from "./real-copies.js";

const realCopiesDirReal = () => {
  try {
    return fs.realpathSync(realCopiesDir());
  } catch {
    return realCopiesDir();
  }
};
import {
  GENERIC_SHAPE,
  resolveRequestShape,
  type RequestShapeDeclaration,
  type ResolvedShape,
} from "./request-shape.js";
import { resolveProfiles, type EgressProfile } from "./routing.js";

export type ContainmentKind = "mcp-server" | "project-script" | "package-install";

export type ContainmentRoot = Readonly<{
  path: string;
  access: "ro" | "rw";
  /** May files under this root be executed? Default: false for MCP servers, true for project roots of scripts/installs. */
  exec?: boolean;
}>;

export type ContainmentDestination = Readonly<{
  host: string;
  port: number;
  /**
   * inspect: TLS terminated with the container CA, every request checked.
   * http: plain HTTP, every request checked.
   * opaque: bytes passed through unread (host and port allowlist only); the
   * record says the payload is not inspected.
   */
  mode: "inspect" | "http" | "opaque";
  /** Requests with no tool call in flight are refused unless this is set. */
  background?: boolean;
  /** Egress profiles (shipped ids or inline) that name this API's routing fields. */
  profiles?: readonly (string | EgressProfile)[];
  /** Routing values the operator declared (the configured sender, a fixed audit copy). */
  constants?: readonly string[];
  /**
   * The one request grammar this destination takes (./request-shape.ts): a
   * built-in profile id ("npm-registry", "pypi") or { profile, pathPrefix,
   * pins, requirePins }. None: any request that passes the relay's other
   * checks. Not for opaque destinations (their requests are not read).
   */
  shape?: RequestShapeDeclaration;
}>;

export type ContainmentSecret = Readonly<{
  /** Environment variable that receives the handle. */
  variable: string;
  /** Id of the secret in the host's credential store (the value never enters the container). */
  id: string;
  /** "host:port" destinations where the handle is replaced by the value. */
  destinations: readonly string[];
}>;

export type ContainmentDeclaration = Readonly<{
  kind: ContainmentKind;
  /** Server name or script label, for messages and audit. */
  label: string;
  command: string;
  args: readonly string[];
  cwd: string;
  roots: readonly ContainmentRoot[];
  /** Programs that may be executed: absolute paths, or names looked up in the system directories. */
  programs: readonly string[];
  env?: Readonly<Record<string, string>>;
  secrets?: readonly ContainmentSecret[];
  destinations?: readonly ContainmentDestination[];
  /** Execution-configuration paths inside read-write roots the operator declared writable. */
  execConfigWritable?: readonly string[];
  /**
   * Code pins (./code-guard.ts): the only code this run may load or execute
   * from a writable place, by real path and SHA-256 (what Enclawed read
   * before offering containment). Given: every writable mount is noexec,
   * anonymous executable memory is refused, node and python start under
   * their guards, and an interpreter without a guard is refused.
   */
  codePins?: readonly CodePin[];
  /**
   * Bind git's history (HEAD, refs, logs, packed-refs, reftable of each
   * read-write root's .git directory) read-only: nothing the run starts can
   * make or move a commit that the line's own git commands do not. The
   * index and objects stay writable (git add, status, diff).
   */
  gitHistoryReadOnly?: boolean;
  /**
   * With code pins: SHA-256 (hex) of the programs the python guard may run
   * from standard input (`python3 -`), the here-documents Enclawed read.
   */
  stdinCodePins?: readonly string[];
  /**
   * With code pins: the only text a shell of the run may run with -c (the line
   * itself and the -c text Enclawed read in it). Absent: none.
   */
  shellTexts?: readonly string[];
  /**
   * With code pins: the files (real path, SHA-256) a real shell of the run may
   * read from a writable place; the supervisor hands over any other such file
   * not at all (./name-guard.c read pins).
   */
  readPins?: readonly Readonly<{ path: string; sha256: string }>[];
  /**
   * Files (real paths) that existed before the run whose mode the line
   * changes: the name guard lets their mode change (never to set-ID, sticky,
   * group or other write); every other existing file keeps its mode.
   */
  modeChanges?: readonly string[];
  /**
   * With code pins: the project virtual environment (real paths) the run's
   * Python runs as. The environment is read-only in the view (its
   * site-packages also executable, for its extension modules), and its
   * site-packages are the guard's toolchain and on its path in place of the
   * system's (as that environment's python has them).
   */
  pythonVenv?: Readonly<{ dir: string; site: string; systemSite: boolean }>;
  /**
   * A contained build (./build-mode.ts): code nobody read runs (build
   * scripts, compilers, what they generate), so no code pin; the name guard
   * also refuses every write inside a .git directory, package.json and .pth
   * files, and exempts no dependency tree; `masks` (regular files inside a
   * read-write root: the project's secret files) are shown empty and
   * read-only. Only for a project script with no destination.
   */
  build?: Readonly<{
    masks: readonly string[];
    /** Program directories of the vendor toolchain roots (/usr/local/cuda/bin), appended to PATH. */
    path?: readonly string[];
    /**
     * GPU use the person granted for this project (./build-mode.ts): these
     * device nodes (GPU_DEVICE only) and driver directories (GPU_DRIVER_DIRS
     * only, read-only) are shown. Never without `build`.
     */
    gpu?: Readonly<{ devices: readonly string[]; dirs: readonly string[] }>;
    /** Printed to the run's standard error when it ends with a failure. */
    failureNotice?: string;
  }>;
}>;

export type MountOp =
  | Readonly<{ op: "dir"; path: string }>
  | Readonly<{ op: "symlink"; path: string; target: string }>
  | Readonly<{ op: "bind"; src: string; path: string; file: boolean; ro: boolean; exec: boolean }>
  | Readonly<{ op: "tmpfs"; path: string; exec: boolean }>
  | Readonly<{
      op: "file";
      path: string;
      /** The file's text (UTF-8), or its bytes in base64 when `base64`. */
      content: string;
      mode?: 0o644 | 0o755;
      base64?: true;
    }>
  | Readonly<{ op: "mask"; path: string; file: boolean }>
  | Readonly<{ op: "device"; path: string; src: string }>;

export type ResolvedDestination = Readonly<{
  host: string;
  port: number;
  mode: ContainmentDestination["mode"];
  background: boolean;
  profiles: readonly EgressProfile[];
  constants: readonly string[];
  /** The destination's request shape (the generic profile when none was declared); null only for opaque. */
  shape: ResolvedShape | null;
}>;

export type ContainmentPlan = Readonly<{
  kind: ContainmentKind;
  label: string;
  command: string;
  args: readonly string[];
  cwd: string;
  ops: readonly MountOp[];
  env: Readonly<Record<string, string>>;
  strictExec: boolean;
  uid: number;
  gid: number;
  destinations: readonly ResolvedDestination[];
  secrets: readonly ContainmentSecret[];
  /** Placeholders to create on the host before start (removed after when unchanged). */
  placeholders: readonly Placeholder[];
  /** Read-only paths inside read-write roots (for audit and tests). */
  execConfigReadOnly: readonly string[];
  /** Everything the host watches while the process runs: protected paths and the directories above them. */
  protect: readonly ProtectedPath[];
  /** Directories bound onto themselves (no rename or removal inside). */
  anchored: readonly string[];
  /** Package installs: the cage of each read-write root. */
  installGuards: readonly InstallGuard[];
  /** The name guard binary the command starts under (null: planned without one; not startable). */
  nameGuard: string | null;
  /** Real paths of the read-write roots, and the exec-config paths the operator declared writable. */
  rwRoots: readonly string[];
  execConfigWritable: readonly string[];
  programs: readonly string[];
  /** Guarded programs: each one's path in the view and its execute-only copy on the host (./name-guard.c). */
  realPrograms: readonly Readonly<{ view: string; host: string }>[];
  /** What a real shell of the run may read from a writable place (ContainmentDeclaration.readPins). */
  readPins: readonly Readonly<{ path: string; sha256: string }>[];
  /** git may move refs (no decl.gitHistoryReadOnly): the name guard admits writes to them. */
  gitRefsWritable: boolean;
  /** Files whose mode the line may change (ContainmentDeclaration.modeChanges), inside a read-write root. */
  modeChanges: readonly string[];
  /** Code pins the line runs directly (bound executable): the name guard refuses every write to them. */
  execPins: readonly string[];
  /** A contained build (ContainmentDeclaration.build): the name guard's build names apply. */
  build: boolean;
  /** A contained build's notice for a failed run (ContainmentDeclaration.build.failureNotice). */
  failureNotice: string | null;
}>;

export type PlanRefusalCode =
  | "containment-declaration-invalid"
  | "containment-root-missing"
  | "containment-root-too-broad"
  | "containment-root-is-credential-store"
  | "containment-program-missing"
  | "containment-program-writable"
  | "containment-command-not-allowed"
  | "containment-cwd-outside-roots"
  | "containment-env-inline-secret"
  | "containment-env-reserved"
  | "containment-tree-too-large"
  | "containment-libraries-unresolved"
  | "containment-real-copy-failed";

export type PlanResult =
  | Readonly<{ ok: true; plan: ContainmentPlan }>
  | Readonly<{ ok: false; code: PlanRefusalCode; message: string }>;

// ─── Fixed tables ───────────────────────────────────────────────────────

/** Directories programs are looked up in by name (never the caller's PATH). */
export const PROGRAM_DIRS = ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

type WrappedKind = "awk" | "shell" | "node" | "python";
const hex = (s: string) => Buffer.from(s, "utf8").toString("hex");

/**
 * Read-only data a runtime loads besides its libraries (Debian's node
 * loads externalized builtins from /usr/share/nodejs; git its templates
 * and helpers). Mounted only when the runtime is an allowed program.
 */
export const RUNTIME_DATA: Readonly<
  Record<string, ReadonlyArray<{ path: string; exec: boolean }>>
> = {
  node: [
    { path: "/usr/share/nodejs", exec: false },
    { path: "/usr/lib/nodejs", exec: false },
  ],
  git: [
    { path: "/usr/share/git-core", exec: false },
    { path: "/usr/lib/git-core", exec: true },
  ],
};

/** Roots that would hand over the system or every user's files. */
const TOO_BROAD = new Set([
  "/",
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/home",
  "/lib",
  "/lib32",
  "/lib64",
  "/libx32",
  "/proc",
  "/root",
  "/run",
  "/sbin",
  "/sys",
  "/usr",
  "/var",
  "/Users",
]);

/** Directory names (any depth inside a read-write root) that configure what runs later. */
export const EXEC_CONFIG_DIRS = [
  ".claude",
  ".codex",
  ".gemini",
  ".cursor",
  ".kiro",
  ".opencode",
  ".amp",
  ".clinerules",
  ".vscode",
  ".husky",
  ".githooks",
  ".devcontainer",
  ".direnv",
];
/** The entries of a .git directory that hold its history: bound read-only with decl.gitHistoryReadOnly. */
const GIT_HISTORY_ENTRIES = ["HEAD", "refs", "packed-refs", "logs", "reftable", "ORIG_HEAD"];
/** [parent, child] pairs. */
export const EXEC_CONFIG_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [".github", "workflows"],
  [".github", "hooks"],
  [".git", "hooks"],
  [".git", "config"],
  // .git/info/attributes: as .gitattributes, for the whole repository.
  [".git", "info"],
];
/**
 * File names that configure what runs later. Each one, when missing at the
 * top of a read-write root, is made to exist as a read-only placeholder
 * whose content means "nothing configured" to its reader (PLACEHOLDER_FILE_CONTENT).
 *
 * Deliberately absent here (no placeholder is made for them): version pins
 * (.nvmrc, .node-version, .python-version, .ruby-version, rust-toolchain):
 * a placeholder would select no toolchain at all. They are still refused by
 * name (EXEC_CONFIG_NAMES: a version manager's proxy starts what they
 * name); .gitmodules (a submodule's `update = !command` is honored only
 * from .git/config, which is protected); and project
 * manifests (package.json, pyproject.toml, Makefile), which are the
 * project's content rather than configuration a tool picks up unasked.
 */
export const EXEC_CONFIG_FILES = [
  ".mcp.json",
  ".envrc",
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",
  ".pnpmfile.cjs",
  ".pre-commit-config.yaml",
  ".pre-commit-config.yml",
  // asdf / mise: which tool versions (and, for mise, plugins, env and tasks) run.
  ".tool-versions",
  "mise.toml",
  ".mise.toml",
  "mise.local.toml",
  ".mise.local.toml",
  // bun: preload scripts run before every `bun run`.
  "bunfig.toml",
  ".bunfig.toml",
  // Agent CLIs whose project config names commands or MCP servers.
  "opencode.json",
  "opencode.jsonc",
  ".aider.conf.yml",
  // git's per-worktree config (read when extensions.worktreeConfig is set).
  "config.worktree",
  // git attributes: which filter, diff or merge driver (configured globally,
  // such as git-lfs's) runs on which file.
  ".gitattributes",
];

/** Placeholder content that each file's reader takes as "nothing configured" (default: empty). */
export const PLACEHOLDER_FILE_CONTENT: Readonly<Record<string, string>> = {
  ".mcp.json": '{"mcpServers":{}}\n',
  ".yarnrc.yml": "{}\n",
  ".pre-commit-config.yaml": "repos: []\n",
  ".pre-commit-config.yml": "repos: []\n",
  "opencode.json": "{}\n",
  "opencode.jsonc": "{}\n",
  ".aider.conf.yml": "{}\n",
};

/** A path the launcher makes exist (read-only inside) for the run, and removes afterwards if unchanged. */
export type Placeholder = Readonly<
  { path: string; kind: "dir" } | { path: string; kind: "file"; content: string }
>;

/** A path the containment keeps read-only inside, watched on the host while the process runs. */
export type ProtectedPath = Readonly<{
  path: string;
  /** "original": existed when planned; "placeholder": made for the run. */
  origin: "original" | "placeholder";
  file: boolean;
}>;

/** Top-level outputs a package install writes (its dependency trees and environments). */
export const INSTALL_OUTPUTS = [
  "node_modules",
  ".venv",
  "venv",
  "__pypackages__",
  ".yarn",
  ".pnp.cjs",
  ".pnp.loader.mjs",
  ".pnp.data.json",
  // pip's in-tree builds (`pip install .`, `pip install -e .`).
  "build",
  "__pycache__",
];
/** Build metadata pip writes beside the project (`<name>.egg-info`). */
export const isInstallMetadata = (name: string) => /^[^./][^/]*\.egg-info$/.test(name);
/** Lockfiles a package install writes. */
export const INSTALL_LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "pdm.lock",
];
/** Manifests an install may update; only their dependency fields may change (checked after the run). */
export const INSTALL_MANIFESTS = ["package.json", "pyproject.toml"];

/** The install cage of one read-write root (carried out by ./contain-init.ts). */
export type InstallGuard = Readonly<{
  root: string;
  /** Top-level names the install may create or change. */
  writable: readonly string[];
  /** Top-level entries that existed at plan time. */
  existing: readonly string[];
  manifests: readonly string[];
  /** Top-level names of this run's placeholders (removed by the launcher afterwards). */
  ours: readonly string[];
}>;
/**
 * Made to exist (as empty read-only directories) at the top of every
 * read-write root when missing, so they cannot be created from inside.
 * The host sees an empty directory while the process runs; it is removed
 * afterwards if it is still empty.
 */
export const PLACEHOLDER_DIRS = [
  ".claude",
  ".codex",
  ".gemini",
  ".cursor",
  ".kiro",
  ".opencode",
  ".amp",
  ".vscode",
  ".github/workflows",
  ".github/hooks",
];

/** The user's credential stores, relative to HOME; masked when inside a root. */
export const CREDENTIAL_PATHS = [
  ".ssh",
  ".aws",
  ".azure",
  ".config/gcloud",
  ".kube",
  ".docker",
  ".gnupg",
  ".netrc",
  ".git-credentials",
  ".config/gh",
  ".config/hub",
  ".npmrc",
  ".pypirc",
  ".cargo/credentials",
  ".cargo/credentials.toml",
  ".claude",
  ".claude.json",
  ".codex",
  ".gemini",
  ".config/enclawed",
  ".enclawed",
  ".password-store",
  ".local/share/keyrings",
  ".bash_history",
  ".zsh_history",
  ".python_history",
  ".node_repl_history",
];

/** Credential-format DLP findings (structured formats only: no prose patterns). */
export const CREDENTIAL_DLP_IDS = new Set([
  "aws-access-key-id",
  "gcp-service-account",
  "azure-storage-key",
  "github-token",
  "gitlab-token",
  "openai-key",
  "anthropic-key",
  "slack-bot-token",
  "stripe-key",
  "jwt",
  "pem-private-key",
]);

export function credentialFindings(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += 512 * 1024) {
    // Overlapping chunks so a token on a chunk edge is still seen.
    const chunk = text.slice(Math.max(0, i - 4096), i + 512 * 1024);
    for (const f of dlpScan(chunk, { onOversize: "truncate" })) {
      if (CREDENTIAL_DLP_IDS.has(f.id)) {
        out.push(f.id);
      }
    }
  }
  return [...new Set(out)];
}

/** Variables the containment sets itself; a declaration may not override them. */
const RESERVED_ENV =
  /^(ENCLAWED_.*|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE|GIT_SSL_CAINFO|GIT_CONFIG_NOSYSTEM|GIT_CONFIG_GLOBAL|GIT_CONFIG_SYSTEM|HTTPS?_PROXY|https?_proxy|ALL_PROXY|all_proxy|NO_PROXY|no_proxy)$/;

export const SANDBOX_HOME = "/sandbox/home";
/** Where the name guard (./name-guard.c) is inside every view. */
export const NAME_GUARD_VIEW_PATH = "/.enclawed/name-guard";
export const CA_BUNDLE_PATHS = [
  "/etc/ssl/certs/ca-certificates.crt",
  "/etc/pki/tls/certs/ca-bundle.crt",
  "/etc/ssl/cert.pem",
];
export const DNS_SERVER = "198.18.0.1";

// ─── Helpers ────────────────────────────────────────────────────────────

const isInside = (child: string, parent: string) =>
  child === parent || child.startsWith(parent.endsWith("/") ? parent : `${parent}/`);

function refuse(code: PlanRefusalCode, message: string): PlanResult {
  return { ok: false, code, message };
}

export type PlanContext = Readonly<{
  /** The user's home directory (credential masks). */
  home: string;
  /** Uid/gid the process runs as inside the container. */
  uid: number;
  gid: number;
  /** Library resolver: shared libraries an ELF program loads (default: ldd). */
  libraries?: (realPath: string) => string[] | null;
  /** The name guard binary (./name-guard.ts): bound read-only into the view to start the command. */
  nameGuard?: string | null;
}>;

/** Shared libraries of an ELF file, via the system's ldd (null: could not resolve). */
export function lddLibraries(realPath: string): string[] | null {
  const ldd = ["/usr/bin/ldd", "/bin/ldd"].find((p) => fs.existsSync(p));
  if (!ldd) {
    return null;
  }
  let out: string;
  try {
    out = execFileSync(ldd, [realPath], {
      encoding: "utf8",
      env: { LC_ALL: "C", PATH: "/usr/bin:/bin" },
      timeout: 10_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    const text = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    // A static program has no libraries.
    return /not a dynamic executable|statically linked/.test(text) ? [] : null;
  }
  const libs: string[] = [];
  for (const line of out.split("\n")) {
    if (/not found/.test(line)) {
      return null;
    }
    const m = /=>\s+(\/\S+)/.exec(line) ?? /^\s*(\/\S+)\s+\(/.exec(line);
    if (m) {
      libs.push(m[1]);
    }
  }
  return libs;
}

function isElf(p: string): boolean {
  try {
    const fd = fs.openSync(p, "r");
    try {
      const b = Buffer.alloc(4);
      fs.readSync(fd, b, 0, 4, 0);
      return b.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function shebang(p: string): string[] | null {
  try {
    const fd = fs.openSync(p, "r");
    try {
      const b = Buffer.alloc(256);
      const n = fs.readSync(fd, b, 0, 256, 0);
      const head = b.subarray(0, n).toString("latin1");
      if (!head.startsWith("#!")) {
        return null;
      }
      const line = head.slice(2).split("\n")[0].trim();
      return line.split(/\s+/).filter(Boolean);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

export function lookupProgram(name: string): string | null {
  if (path.isAbsolute(name)) {
    return fs.existsSync(name) ? name : null;
  }
  if (name.includes("/")) {
    return null;
  }
  for (const dir of PROGRAM_DIRS) {
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (st.isFile() && st.mode & 0o111) {
        return p;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

/** View builder: tracks what exists in the view so paths and their symlink chains are added once. */
class ViewBuilder {
  readonly ops: MountOp[] = [];
  private readonly made = new Set<string>(["/"]);

  dir(p: string) {
    const parts = p.split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur += `/${part}`;
      if (!this.made.has(cur)) {
        this.made.add(cur);
        this.ops.push({ op: "dir", path: cur });
      }
    }
  }

  /**
   * Make `hostPath` exist in the view at the same path, replicating each
   * symlink on the way, and bind the final file or directory. Returns the
   * real path that was bound.
   */
  bindPath(hostPath: string, opts: { ro: boolean; exec: boolean }, depth = 0): string {
    if (depth > 16) {
      throw new Error(`too many symbolic links resolving ${hostPath}`);
    }
    const parts = path.resolve(hostPath).split("/").filter(Boolean);
    let cur = "";
    for (let i = 0; i < parts.length; i++) {
      const next = `${cur}/${parts[i]}`;
      const st = fs.lstatSync(next);
      if (st.isSymbolicLink()) {
        const target = fs.readlinkSync(next);
        if (!this.made.has(next)) {
          this.dir(cur || "/");
          this.made.add(next);
          this.ops.push({ op: "symlink", path: next, target });
        }
        const resolved = path.resolve(cur || "/", target, ...parts.slice(i + 1));
        return this.bindPath(resolved, opts, depth + 1);
      }
      cur = next;
    }
    if (!this.made.has(`bind:${cur}`)) {
      const st = fs.statSync(cur);
      this.dir(path.dirname(cur));
      this.made.add(`bind:${cur}`);
      this.made.add(cur);
      this.ops.push({
        op: "bind",
        src: cur,
        path: cur,
        file: !st.isDirectory(),
        ro: opts.ro,
        exec: opts.exec,
      });
    }
    return cur;
  }

  file(p: string, content: string, mode: 0o644 | 0o755 = 0o644, base64 = false) {
    this.dir(path.dirname(p));
    this.made.add(p);
    this.ops.push({
      op: "file",
      path: p,
      content,
      ...(mode === 0o755 ? { mode } : {}),
      ...(base64 ? { base64: true as const } : {}),
    });
  }

  /**
   * Show a wrapper at a bound program's path and the real program beside it
   * at `hidden` (the same directory, so its own prefix logic still holds).
   */
  wrapProgram(bound: string, hidden: string, wrapper: string) {
    const i = this.ops.findIndex((o) => o.op === "bind" && o.path === bound);
    if (i < 0) {
      throw new Error(`${bound} is not bound in the view`);
    }
    const o = this.ops[i] as Extract<MountOp, { op: "bind" }>;
    // The wrapper takes the program's place; the real binary is bound elsewhere
    // (its directory made first, so the bind has somewhere to land).
    this.ops[i] = { op: "file", path: bound, content: wrapper, mode: 0o755 };
    this.dir(path.dirname(hidden));
    this.made.add(hidden);
    this.ops.push({ ...o, path: hidden, ro: true, exec: true });
  }

  /** Show `binary` (the name guard) at a bound program's path, in place of the program. */
  wrapWith(bound: string, binary: string) {
    const i = this.ops.findIndex((o) => o.op === "bind" && o.path === bound);
    if (i < 0) {
      throw new Error(`${bound} is not bound in the view`);
    }
    const o = this.ops[i] as Extract<MountOp, { op: "bind" }>;
    this.ops[i] = { ...o, src: binary, file: true, ro: true, exec: true };
  }

  push(op: MountOp) {
    if (op.op === "tmpfs" || op.op === "device" || op.op === "symlink") {
      this.dir(path.dirname(op.path));
    }
    this.made.add(op.path);
    this.ops.push(op);
  }
}

const MAX_WALK_ENTRIES = 400_000;
const MAX_INSTALL_TOP_LEVEL = 10_000;

/**
 * Top-level names of `root` that git ignores (generated output: dist, build,
 * coverage, *.egg-info), when `root` is a git work tree. Read with git's own
 * matcher, with every configurable program off (no fsmonitor, no hooks).
 */
export function ignoredTopLevel(root: string): Set<string> {
  const git = ["/usr/bin/git", "/bin/git"].find((p) => fs.existsSync(p));
  if (!git || !fs.existsSync(path.join(root, ".git"))) {
    return new Set();
  }
  try {
    const out = execFileSync(
      git,
      [
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=/dev/null",
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-standard",
        "--directory",
        "-z",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          PATH: "/usr/bin:/bin",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
          LC_ALL: "C",
        },
        timeout: 20_000,
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    return new Set(
      out
        .split("\0")
        .filter(Boolean)
        .map((p) => p.split("/")[0]),
    );
  } catch {
    return new Set();
  }
}
const MAX_WALK_DEPTH = 24;

/** Execution-configuration paths that exist inside `root` (bounded walk; node_modules skipped). */
export function findExecConfig(root: string): { paths: string[]; truncated: boolean } {
  const found: string[] = [];
  let seen = 0;
  const dirSet = new Set(EXEC_CONFIG_DIRS);
  const fileSet = new Set(EXEC_CONFIG_FILES);
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (stack.length > 0) {
    const { dir, depth } = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const base = path.basename(dir);
    for (const e of entries) {
      if (++seen > MAX_WALK_ENTRIES) {
        return { paths: found, truncated: true };
      }
      const p = path.join(dir, e.name);
      const lower = e.name.toLowerCase();
      if (
        EXEC_CONFIG_PAIRS.some(
          ([parent, child]) => parent === base.toLowerCase() && child === lower,
        )
      ) {
        found.push(p);
        continue;
      }
      if (dirSet.has(lower) || fileSet.has(lower)) {
        found.push(p);
        continue;
      }
      if (!e.isDirectory() || e.isSymbolicLink() || depth >= MAX_WALK_DEPTH) {
        continue;
      }
      if (lower === "node_modules") {
        continue;
      }
      if (lower === ".git") {
        // Only hooks and config matter inside a repository's git dir.
        stack.push({ dir: p, depth: MAX_WALK_DEPTH });
        continue;
      }
      stack.push({ dir: p, depth: depth + 1 });
    }
  }
  return { paths: found, truncated: false };
}

// ─── The planner ────────────────────────────────────────────────────────

/** Decide the containment for a declaration. Reads the filesystem; starts nothing. */
export function planContainment(decl: ContainmentDeclaration, ctx: PlanContext): PlanResult {
  const pins = decl.codePins;
  const readPins = (decl.readPins ?? []).filter(
    (r) =>
      typeof r?.path === "string" &&
      path.isAbsolute(r.path) &&
      !/[\n\r]/.test(r.path) &&
      typeof r?.sha256 === "string" &&
      /^[0-9a-f]{64}$/.test(r.sha256),
  );
  if (readPins.length !== (decl.readPins ?? []).length || readPins.length > 4096) {
    return refuse(
      "containment-declaration-invalid",
      "the files a shell may read are not well formed",
    );
  }
  if (pins !== undefined) {
    if (
      !Array.isArray(pins) ||
      pins.length > 4096 ||
      pins.some(
        (p) =>
          !p ||
          typeof p.path !== "string" ||
          !path.isAbsolute(p.path) ||
          typeof p.sha256 !== "string" ||
          !/^[0-9a-f]{64}$/.test(p.sha256) ||
          typeof p.exec !== "boolean" ||
          (p.shell !== undefined &&
            (p.shell !== true ||
              typeof p.contentBase64 !== "string" ||
              p.contentBase64.length > 1024 * 1024 ||
              createHash("sha256").update(Buffer.from(p.contentBase64, "base64")).digest("hex") !==
                p.sha256)),
      )
    ) {
      return refuse(
        "containment-declaration-invalid",
        "code pins must be { path (absolute), sha256 (hex), exec } entries (a shell pin with the content whose SHA-256 it is)",
      );
    }
  }
  const stdinPins = decl.stdinCodePins;
  if (
    stdinPins !== undefined &&
    (pins === undefined ||
      !Array.isArray(stdinPins) ||
      stdinPins.length > 256 ||
      stdinPins.some((h) => typeof h !== "string" || !/^[0-9a-f]{64}$/.test(h)))
  ) {
    return refuse(
      "containment-declaration-invalid",
      "standard-input code pins must be SHA-256 digests (hex), given with code pins",
    );
  }
  // The run's own command line (`sh -c LINE`, as declared) is always one of them.
  const ownLine =
    typeof decl.command === "string" &&
    /^(?:sh|bash|dash)$/.test(path.basename(decl.command)) &&
    Array.isArray(decl.args) &&
    decl.args[0] === "-c" &&
    typeof decl.args[1] === "string"
      ? [decl.args[1]]
      : [];
  const shellTexts = Array.isArray(decl.shellTexts)
    ? [...decl.shellTexts, ...ownLine]
    : decl.shellTexts === undefined
      ? ownLine
      : null;
  if (
    !Array.isArray(shellTexts) ||
    shellTexts.length > 1024 ||
    shellTexts.some((t) => typeof t !== "string") ||
    shellTexts.reduce((n, t) => n + t.length, 0) > 4 * 1024 * 1024
  ) {
    return refuse("containment-declaration-invalid", "shell -c texts must be a list of strings");
  }
  const pinned = pins !== undefined;
  if (decl.build !== undefined) {
    if (
      decl.kind !== "project-script" ||
      pinned ||
      (decl.destinations ?? []).length > 0 ||
      (decl.secrets ?? []).length > 0 ||
      (decl.execConfigWritable ?? []).length > 0 ||
      !Array.isArray(decl.build?.masks) ||
      decl.build.masks.length > 4096 ||
      decl.build.masks.some(
        (m) => typeof m !== "string" || !path.isAbsolute(m) || /[\n\r]/.test(m),
      ) ||
      (decl.build.gpu !== undefined &&
        (!Array.isArray(decl.build.gpu.devices) ||
          !Array.isArray(decl.build.gpu.dirs) ||
          decl.build.gpu.devices.some((d) => typeof d !== "string" || !GPU_DEVICE.test(d)) ||
          decl.build.gpu.dirs.some((d) => !GPU_DRIVER_DIRS.includes(d)))) ||
      (decl.build.failureNotice !== undefined &&
        (typeof decl.build.failureNotice !== "string" || decl.build.failureNotice.length > 500))
    ) {
      return refuse(
        "containment-declaration-invalid",
        "a contained build is a project script with no code pins, no destination, no secret and no writable configuration; its masks are absolute paths",
      );
    }
  }
  const strictExec = decl.kind === "mcp-server" || pinned;
  if (!decl.label || typeof decl.command !== "string" || !Array.isArray(decl.args)) {
    return refuse(
      "containment-declaration-invalid",
      "a containment declaration needs a label, a command and arguments",
    );
  }
  if (!path.isAbsolute(decl.cwd)) {
    return refuse(
      "containment-declaration-invalid",
      `working directory must be absolute: ${decl.cwd}`,
    );
  }

  // Roots.
  type R = { declared: string; real: string; access: "ro" | "rw"; exec: boolean };
  const roots: R[] = [];
  for (const r of decl.roots) {
    if (!path.isAbsolute(r.path) || (r.access !== "ro" && r.access !== "rw")) {
      return refuse(
        "containment-declaration-invalid",
        `root must be an absolute path with access ro or rw: ${r.path}`,
      );
    }
    let real: string;
    try {
      real = fs.realpathSync(r.path);
    } catch {
      return refuse("containment-root-missing", `declared root does not exist: ${r.path}`);
    }
    if (!fs.statSync(real).isDirectory()) {
      return refuse(
        "containment-declaration-invalid",
        `declared root is not a directory: ${r.path}`,
      );
    }
    for (const p of [path.resolve(r.path), real]) {
      if (TOO_BROAD.has(p)) {
        return refuse(
          "containment-root-too-broad",
          `declared root ${p} would expose the system or every user's files`,
        );
      }
    }
    for (const c of CREDENTIAL_PATHS) {
      const cred = path.join(ctx.home, c);
      if (isInside(real, cred) || isInside(path.resolve(r.path), cred)) {
        return refuse(
          "containment-root-is-credential-store",
          `declared root ${r.path} is inside the credential store ${cred}`,
        );
      }
    }
    // With code pins nothing writable is executable (a file the line runs
    // directly is bound executable on its own, below).
    const exec =
      pinned && r.access === "rw" ? false : (r.exec ?? (strictExec ? false : r.access === "rw"));
    roots.push({ declared: path.resolve(r.path), real, access: r.access, exec });
  }
  const cwdReal = (() => {
    try {
      return fs.realpathSync(decl.cwd);
    } catch {
      return path.resolve(decl.cwd);
    }
  })();
  if (!roots.some((r) => isInside(cwdReal, r.real))) {
    return refuse(
      "containment-cwd-outside-roots",
      `working directory ${decl.cwd} is not inside a declared root`,
    );
  }

  const view = new ViewBuilder();

  // Programs (the exec allowlist), with interpreters and libraries.
  const libs = ctx.libraries ?? lddLibraries;
  const programReals = new Map<string, string>(); // requested path -> real path
  const programBound = new Map<string, string>(); // requested path -> the path bound in the view
  const pending = [...decl.programs];
  const seenProgram = new Set<string>();
  while (pending.length > 0) {
    const name = pending.shift()!;
    if (seenProgram.has(name)) {
      continue;
    }
    seenProgram.add(name);
    const found = lookupProgram(name);
    if (!found) {
      return refuse(
        "containment-program-missing",
        `program "${name}" was not found in ${PROGRAM_DIRS.join(":")}`,
      );
    }
    const real = fs.realpathSync(found);
    // The execute-only copies of the real programs are never shown in a view.
    if (isInside(real, realCopiesDirReal())) {
      return refuse("containment-program-missing", `program "${name}" is not one a run may name`);
    }
    for (const r of roots) {
      if (r.access === "rw" && isInside(real, r.real)) {
        return refuse(
          "containment-program-writable",
          `program ${found} is inside the writable root ${r.declared}`,
        );
      }
    }
    if (
      pinned &&
      (UNGUARDED_INTERPRETERS.test(path.basename(real)) ||
        UNGUARDED_INTERPRETERS.test(path.basename(found)))
    ) {
      return refuse(
        "containment-command-not-allowed",
        `program ${found} loads code from files and has no code guard, so a run with code pins cannot include it`,
      );
    }
    programReals.set(found, real);
    programBound.set(found, view.bindPath(found, { ro: true, exec: true }));
    // CPython: its standard library (with compiled extension modules).
    const py = /^python(\d+\.\d+)$/.exec(path.basename(real));
    if (py && fs.existsSync(`/usr/lib/python${py[1]}`)) {
      view.bindPath(`/usr/lib/python${py[1]}`, { ro: true, exec: true });
    }
    for (const data of RUNTIME_DATA[path.basename(found)] ?? []) {
      if (fs.existsSync(data.path)) {
        view.bindPath(data.path, { ro: true, exec: data.exec });
      }
    }
    if (isElf(real)) {
      const l = libs(real);
      if (l === null) {
        return refuse(
          "containment-libraries-unresolved",
          `the shared libraries of ${found} cannot be resolved`,
        );
      }
      for (const lib of l) {
        view.bindPath(lib, { ro: true, exec: true });
      }
    } else {
      const sb = shebang(real);
      if (sb && sb.length > 0) {
        // "#!/usr/bin/env node": both env and node must be runnable.
        pending.push(sb[0]);
        if (path.basename(sb[0]) === "env") {
          const interp = sb.slice(1).find((a) => !a.startsWith("-"));
          if (interp) {
            pending.push(interp);
          }
        }
      }
    }
  }

  // The name guard: read-only and executable, with its libraries; not on PATH.
  if (ctx.nameGuard) {
    // At a fixed path of its own: its host path may lie under /tmp, which the
    // scratch tmpfs covers.
    view.file(NAME_GUARD_VIEW_PATH, "");
    view.push({
      op: "bind",
      src: fs.realpathSync(ctx.nameGuard),
      path: NAME_GUARD_VIEW_PATH,
      file: true,
      ro: true,
      exec: true,
    });
    const l = libs(fs.realpathSync(ctx.nameGuard));
    if (l === null) {
      return refuse(
        "containment-libraries-unresolved",
        "the shared libraries of the name guard cannot be resolved",
      );
    }
    for (const lib of l) {
      view.bindPath(lib, { ro: true, exec: true });
    }
  }

  // Code pins: node and python start under their guards, and every shell under
  // the shell guard, which runs the copy of each script Enclawed read
  // (./code-guard.ts).
  const shellCopies = (pins ?? [])
    .filter((p) => p.shell)
    .map((p, i) => ({
      real: p.path,
      copy: `${SHELL_COPY_DIR}/${i}`,
      content: p.contentBase64 ?? "",
    }));
  // The places the run can write (its read-write roots, /tmp, its home, /dev/shm).
  const writablePlaces = [
    ...new Set([
      ...decl.roots
        .filter((r) => r.access === "rw")
        .flatMap((r) => {
          try {
            return [r.path, fs.realpathSync(r.path)];
          } catch {
            return [r.path];
          }
        }),
      "/tmp",
      SANDBOX_HOME,
      "/dev/shm",
    ]),
  ];
  const realPrograms: { view: string; host: string }[] = [];
  const wrapperLines: string[] = [];
  if (pinned) {
    for (const c of shellCopies) {
      view.file(c.copy, c.content, 0o644, true);
    }
    // Each guarded program's path shows the name guard in its wrapper mode
    // (./name-guard.c); the real program is in no place of the view. The
    // supervisor holds an execute-only copy of it (made here, on the host) and
    // hands it only to the wrapper, which checks what the run asks for first.
    const guardReal = ctx.nameGuard ? fs.realpathSync(ctx.nameGuard) : null;
    for (const bound of new Set(programBound.values())) {
      const base = path.basename(bound);
      const kind: WrappedKind | null = guardedAwk(base)
        ? "awk"
        : guardedShell(base)
          ? "shell"
          : guardedInterpreter(base);
      if (!kind || !guardReal) {
        continue;
      }
      const prefix = path.dirname(path.dirname(bound));
      // Its prefix (lib, share: where node and python load their own code from)
      // must be no place the run can write.
      if (
        ["/tmp", SANDBOX_HOME, "/dev/shm", ...writablePlaces].some((w) =>
          isInside(prefix, w.replace(/\/$/, "") || "/"),
        )
      ) {
        return refuse(
          "containment-program-writable",
          `${bound} loads its own code from ${prefix}, a place the run can write`,
        );
      }
      let copy: string;
      try {
        copy = realProgramCopy(bound, prefix);
      } catch (err) {
        return refuse(
          "containment-real-copy-failed",
          `an execute-only copy of ${bound} could not be made (${(err as Error).message})`,
        );
      }
      const cacheTop = path.dirname(path.dirname(copy));
      if (
        ["/tmp", SANDBOX_HOME, "/dev/shm", ...writablePlaces].some(
          (w) => cacheTop === w || cacheTop.startsWith(`${w.replace(/\/$/, "")}/`),
        )
      ) {
        return refuse(
          "containment-real-copy-failed",
          `the copies of the real programs (${cacheTop}) lie in a place the run can write`,
        );
      }
      // The real program's own prefix (lib, share, libexec) beside the copy's
      // path, which is where node and python look for theirs.
      for (const d of ["lib", "lib64", "share", "libexec"]) {
        view.push({ op: "symlink", path: `${cacheTop}/${d}`, target: `${prefix}/${d}` });
      }
      view.wrapWith(bound, guardReal);
      realPrograms.push({ view: bound, host: copy });
      wrapperLines.push(`bin ${hex(bound)} ${hex(kind)}`);
    }
    for (const t of shellTexts) {
      wrapperLines.push(`text ${hex(t)}`);
    }
    for (const c of shellCopies) {
      wrapperLines.push(`copy ${hex(c.real)} ${hex(c.copy)}`);
    }
    for (const w of writablePlaces) {
      wrapperLines.push(`place ${hex(w)}`);
    }
    for (const f of ["-E", "-s", "-B", "-X", `pycache_prefix=${PY_CACHE_PREFIX}`]) {
      wrapperLines.push(`pyflag ${hex(f)}`);
    }
    wrapperLines.push(`pyguard ${hex(PY_GUARD_PATH)}`);
    wrapperLines.push(`nodeopts ${hex(NODE_GUARD_OPTIONS)}`);
    view.file(WRAPPERS_CONF_PATH, `${wrapperLines.join("\n")}\n`);
  }

  // The command must be one of the programs.
  let command: string | null = null;
  if (path.isAbsolute(decl.command)) {
    const want = (() => {
      try {
        return fs.realpathSync(decl.command);
      } catch {
        return decl.command;
      }
    })();
    for (const [req, real] of programReals) {
      if (req === decl.command || real === want) {
        command = decl.command;
      }
    }
  } else {
    const found = lookupProgram(decl.command);
    if (found && programReals.has(found)) {
      command = found;
    }
  }
  if (!command) {
    return refuse(
      "containment-command-not-allowed",
      `command ${decl.command} is not one of the declared programs`,
    );
  }

  // Generated system files.
  const hostLdCache = "/etc/ld.so.cache";
  if (fs.existsSync(hostLdCache)) {
    view.bindPath(hostLdCache, { ro: true, exec: false });
  }
  view.file(
    "/etc/passwd",
    `root:x:0:0:root:/root:/usr/sbin/nologin\nsandbox:x:${ctx.uid}:${ctx.gid}:sandbox:${SANDBOX_HOME}:/usr/sbin/nologin\n`,
  );
  view.file("/etc/group", `root:x:0:\nsandbox:x:${ctx.gid}:\n`);
  view.file("/etc/hosts", "127.0.0.1 localhost\n::1 localhost\n");
  view.file("/etc/resolv.conf", `nameserver ${DNS_SERVER}\noptions attempts:2 timeout:2\n`);
  view.file("/etc/nsswitch.conf", "passwd: files\ngroup: files\nhosts: files dns\n");

  // Private scratch space, mounted before the roots: a declared root that lives
  // under /tmp (or the sandbox home) must land on top of the scratch tmpfs, not
  // be hidden beneath it.
  view.push({ op: "tmpfs", path: "/tmp", exec: !strictExec });
  view.push({ op: "tmpfs", path: SANDBOX_HOME, exec: !strictExec });
  view.push({ op: "tmpfs", path: "/dev/shm", exec: false });

  // Roots, shallow first so a nested root overrides its parent.
  const ordered = [...roots].toSorted(
    (a, b) => a.real.split("/").length - b.real.split("/").length,
  );
  for (const r of ordered) {
    if (r.declared !== r.real) {
      // The declared path is what the process is told; make it resolve.
      view.bindPath(r.declared, { ro: r.access === "ro", exec: r.exec });
    } else {
      view.bindPath(r.real, { ro: r.access === "ro", exec: r.exec });
    }
  }

  // Execution configuration inside read-write roots: read-only (and never
  // executable), missing ones at the top made to exist as placeholders, and
  // every directory in between anchored (bound onto itself) so it cannot be
  // renamed or removed from inside.
  const writableExceptions = new Set((decl.execConfigWritable ?? []).map((p) => path.resolve(p)));
  const rwRoots = ordered.filter((x) => x.access === "rw");
  const rootOf = (p: string) =>
    rwRoots.filter((x) => isInside(p, x.real)).toSorted((a, b) => b.real.length - a.real.length)[0];
  const execConfigReadOnly: string[] = [];
  const placeholders: Placeholder[] = [];
  const protect: ProtectedPath[] = [];
  for (const r of rwRoots) {
    const found = findExecConfig(r.real);
    if (found.truncated) {
      return refuse(
        "containment-tree-too-large",
        `root ${r.declared} has more than ${MAX_WALK_ENTRIES} entries outside node_modules; declare narrower roots`,
      );
    }
    for (const p of found.paths) {
      if (writableExceptions.has(p)) {
        continue;
      }
      let real: string;
      try {
        real = fs.realpathSync(p);
      } catch {
        continue; // a dangling link: its target is not in the view either
      }
      // A link to somewhere outside every writable root needs nothing: the
      // target is either absent from the view or read-only already.
      if (!rootOf(real)) {
        continue;
      }
      if (protect.some((x) => x.path === real)) {
        continue;
      }
      const st = fs.statSync(real);
      execConfigReadOnly.push(real);
      protect.push({ path: real, origin: "original", file: !st.isDirectory() });
    }
    // Missing exec-config names are not made to exist: the name guard
    // (./name-guard.c) refuses them anywhere in the root, and lets the
    // contained git check tracked ones out (verified against the index).
  }
  for (const ph of placeholders) {
    execConfigReadOnly.push(ph.path);
    protect.push({ path: ph.path, origin: "placeholder", file: ph.kind === "file" });
  }
  // Anchors: each directory strictly between a protected path and its root.
  const anchorSet = new Set<string>();
  for (const pr of protect) {
    const r = rootOf(pr.path);
    if (!r) {
      continue;
    }
    for (let d = path.dirname(pr.path); d !== r.real && isInside(d, r.real); d = path.dirname(d)) {
      anchorSet.add(d);
    }
  }
  const anchored = [...anchorSet].toSorted((a, b) => a.split("/").length - b.split("/").length);
  for (const d of anchored) {
    // Shallow first, and before the protected binds: a bind of a directory
    // hides the mounts below it, so they must come after.
    view.push({ op: "bind", src: d, path: d, file: false, ro: false, exec: rootOf(d).exec });
  }
  // Read-only mounts only for git's hooks (never tracked content, never
  // written by git). Every other exec-config path is guarded by name, so the
  // contained git can still check out a branch that changes or adds one,
  // or save its config (each change is verified and reported).
  for (const pr of protect) {
    if (/\/\.git\/hooks(\/|$)/i.test(pr.path)) {
      view.push({ op: "bind", src: pr.path, path: pr.path, file: pr.file, ro: true, exec: false });
    }
  }
  // git's history read-only (decl.gitHistoryReadOnly): a bound file or
  // directory cannot be replaced or written, so no ref moves and no commit is made.
  if (decl.gitHistoryReadOnly) {
    for (const r of rwRoots) {
      const gitDir = path.join(r.real, ".git");
      let isDir = false;
      try {
        isDir = fs.lstatSync(gitDir).isDirectory();
      } catch {
        /* no repository at this root */
      }
      if (!isDir) {
        continue;
      }
      for (const name of GIT_HISTORY_ENTRIES) {
        const p = path.join(gitDir, name);
        let st: fs.Stats;
        try {
          st = fs.lstatSync(p);
        } catch {
          continue;
        }
        if (!st.isSymbolicLink()) {
          view.push({
            op: "bind",
            src: p,
            path: p,
            file: !st.isDirectory(),
            ro: true,
            exec: false,
          });
        }
      }
    }
  }

  // Package installs: every existing top-level entry read-only except the
  // install's outputs, lockfiles and manifests, and the generated (ignored,
  // not hidden) directories of the project.
  const installGuards: InstallGuard[] = [];
  if (decl.kind === "package-install") {
    for (const r of rwRoots) {
      let entries: string[];
      try {
        entries = fs.readdirSync(r.real);
      } catch {
        return refuse("containment-root-missing", `cannot read ${r.declared}`);
      }
      if (entries.length > MAX_INSTALL_TOP_LEVEL) {
        return refuse(
          "containment-tree-too-large",
          `${r.declared} has more than ${MAX_INSTALL_TOP_LEVEL} top-level entries; an install cannot be caged there`,
        );
      }
      const ignored = ignoredTopLevel(r.real);
      const writable = [
        ...INSTALL_OUTPUTS,
        ...INSTALL_LOCKFILES,
        ...INSTALL_MANIFESTS,
        ...entries.filter((e) => (ignored.has(e) && !e.startsWith(".")) || isInstallMetadata(e)),
      ];
      const alreadyProtected = new Set(protect.map((x) => x.path));
      for (const e of entries) {
        const p = path.join(r.real, e);
        if (writable.includes(e) || alreadyProtected.has(p)) {
          continue;
        }
        const st = fs.lstatSync(p);
        if (st.isSymbolicLink()) {
          continue; // a link cannot be bound; checked after the run instead
        }
        view.push({ op: "bind", src: p, path: p, file: !st.isDirectory(), ro: true, exec: r.exec });
      }
      // Directories made for this run's placeholders (".github" for
      // ".github/workflows"): read-only too, so nothing is put beside them.
      for (const top of new Set(
        placeholders
          .filter((ph) => isInside(ph.path, r.real) && ph.path !== r.real)
          .map((ph) => path.relative(r.real, ph.path).split("/")[0]),
      )) {
        const p = path.join(r.real, top);
        if (!entries.includes(top) && !alreadyProtected.has(p)) {
          view.push({ op: "bind", src: p, path: p, file: false, ro: true, exec: false });
        }
      }
      installGuards.push({
        root: r.real,
        writable: [...new Set(writable)],
        existing: entries,
        manifests: INSTALL_MANIFESTS.filter((m) => entries.includes(m)),
        ours: [
          ...new Set(
            placeholders
              .filter((ph) => isInside(ph.path, r.real) && ph.path !== r.real)
              .map((ph) => path.relative(r.real, ph.path).split("/")[0]),
          ),
        ],
      });
    }
  }

  // A contained build of a project granted GPU use: the GPU's device nodes,
  // and the driver's own directories read-only (each a mount point of the
  // host on WSL, bound itself, never its parent).
  for (const d of decl.build?.gpu?.devices ?? []) {
    let st: fs.Stats;
    try {
      st = fs.statSync(d);
    } catch {
      continue; // gone since it was found
    }
    if (!st.isCharacterDevice()) {
      return refuse("containment-declaration-invalid", `${d} is not a device node`);
    }
    view.push({ op: "device", path: d, src: d });
  }
  for (const d of decl.build?.gpu?.dirs ?? []) {
    try {
      if (fs.statSync(d).isDirectory()) {
        view.bindPath(d, { ro: true, exec: true });
      }
    } catch {
      /* gone */
    }
  }

  // A contained build: the project's secret files shown empty and read-only.
  for (const m of decl.build?.masks ?? []) {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(m);
    } catch {
      continue; // gone since it was found: nothing to read there
    }
    if (!st.isFile() || !rwRoots.some((r) => isInside(m, r.real))) {
      return refuse(
        "containment-declaration-invalid",
        `the secret file to mask ${m} is not a regular file inside a read-write root`,
      );
    }
    view.push({ op: "mask", path: m, file: true });
  }

  // Credential stores inside any root: masked.
  for (const r of ordered) {
    for (const c of CREDENTIAL_PATHS) {
      const cred = path.join(ctx.home, c);
      if (!isInside(cred, r.real) && !isInside(cred, r.declared)) {
        continue;
      }
      try {
        const st = fs.lstatSync(cred);
        const real = st.isSymbolicLink() ? fs.realpathSync(cred) : cred;
        view.push({ op: "mask", path: cred, file: !fs.statSync(real).isDirectory() });
      } catch {
        /* absent */
      }
    }
  }

  // Devices, /proc mount point.
  for (const d of ["null", "zero", "full", "random", "urandom"]) {
    view.push({ op: "device", path: `/dev/${d}`, src: `/dev/${d}` });
  }
  view.push({ op: "symlink", path: "/dev/fd", target: "/proc/self/fd" });
  view.push({ op: "symlink", path: "/dev/stdin", target: "/proc/self/fd/0" });
  view.push({ op: "symlink", path: "/dev/stdout", target: "/proc/self/fd/1" });
  view.push({ op: "symlink", path: "/dev/stderr", target: "/proc/self/fd/2" });
  view.dir("/proc");

  // Environment: built from nothing.
  const env: Record<string, string> = {};
  const binDirs = [...new Set([...programReals.keys()].map((p) => path.dirname(p)))];
  env.PATH = [
    ...binDirs,
    // A contained build: its vendor toolchains' bin (inside its read-only roots).
    ...(decl.build?.path ?? []).filter(
      (d) =>
        typeof d === "string" &&
        path.isAbsolute(d) &&
        !d.includes(":") &&
        roots.some((r) => r.access === "ro" && (isInside(d, r.declared) || isInside(d, r.real))),
    ),
  ].join(":");
  env.HOME = SANDBOX_HOME;
  env.TMPDIR = "/tmp";
  env.USER = "sandbox";
  env.LOGNAME = "sandbox";
  env.LANG = "C.UTF-8";
  env.ENCLAWED_CONTAINED = decl.kind;
  if ([...programReals.keys()].some((p) => path.basename(p) === "git")) {
    // git's own configuration-driven execution (fsmonitor, sshCommand,
    // pager, aliases) comes only from the repository's config, which is
    // read-only; no system or user config exists in the view.
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_CONFIG_GLOBAL = "/dev/null";
    env.GIT_TERMINAL_PROMPT = "0";
  }
  for (const [k, v] of Object.entries(decl.env ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== "string") {
      return refuse("containment-declaration-invalid", `invalid environment variable ${k}`);
    }
    if (RESERVED_ENV.test(k)) {
      return refuse(
        "containment-env-reserved",
        `environment variable ${k} is set by the containment and cannot be declared`,
      );
    }
    const findings = credentialFindings(v);
    if (findings.length > 0) {
      return refuse(
        "containment-env-inline-secret",
        `environment variable ${k} carries a credential (${findings.join(", ")}); declare it as a secret so the process gets a handle`,
      );
    }
    env[k] = v;
  }

  // Destinations.
  const destinations: ResolvedDestination[] = [];
  for (const d of decl.destinations ?? []) {
    const host = (typeof d.host === "string" ? d.host : "").toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) {
      return refuse(
        "containment-declaration-invalid",
        `destination host must be a DNS name: ${d.host}`,
      );
    }
    if (!Number.isInteger(d.port) || d.port < 1 || d.port > 65535) {
      return refuse("containment-declaration-invalid", `destination port out of range: ${d.port}`);
    }
    if (!["inspect", "http", "opaque"].includes(d.mode)) {
      return refuse(
        "containment-declaration-invalid",
        `destination mode must be inspect, http or opaque: ${d.mode}`,
      );
    }
    const profiles = resolveProfiles(d.profiles ?? []);
    if (!profiles.ok) {
      return refuse("containment-declaration-invalid", profiles.message);
    }
    const shape = resolveRequestShape(d.shape);
    if (!shape.ok) {
      return refuse("containment-declaration-invalid", `${host}:${d.port}: ${shape.message}`);
    }
    if (shape.shape && d.mode === "opaque") {
      return refuse(
        "containment-declaration-invalid",
        `${host}:${d.port}: a request shape needs requests that can be read (mode inspect or http), not opaque`,
      );
    }
    // No free-form egress: a destination with no shape takes the generic
    // profile. More (an API profile, or bytes passed unread) only in a
    // declaration the person authorized: a signed admission record, whose
    // signing asks for the person's second factor and is audited.
    const authorized = decl.kind === "mcp-server";
    if (!authorized && (shape.shape?.profile === "api" || d.mode === "opaque")) {
      return refuse(
        "containment-declaration-invalid",
        `${host}:${d.port}: ${d.mode === "opaque" ? "an opaque destination" : "an api profile"} is declared only in a signed admission record (a ${decl.kind} reaches its destinations with the generic or a registry profile)`,
      );
    }
    destinations.push({
      host,
      port: d.port,
      mode: d.mode,
      background: d.background === true,
      profiles: profiles.profiles,
      constants: [...(d.constants ?? [])],
      shape: d.mode === "opaque" ? null : (shape.shape ?? { ...GENERIC_SHAPE }),
    });
  }
  for (const s of decl.secrets ?? []) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s.variable) || RESERVED_ENV.test(s.variable)) {
      return refuse("containment-declaration-invalid", `invalid secret variable ${s.variable}`);
    }
    if (s.variable in env) {
      return refuse(
        "containment-declaration-invalid",
        `secret variable ${s.variable} is also declared as a plain variable`,
      );
    }
    for (const dest of s.destinations) {
      const d = destinations.find((x) => `${x.host}:${x.port}` === dest.toLowerCase());
      if (!d || d.mode === "opaque") {
        return refuse(
          "containment-declaration-invalid",
          `secret ${s.id} names destination ${dest}, which is not a declared inspected destination`,
        );
      }
    }
  }

  // Code pins: the files read, executable only when the line runs them
  // directly; the guards with the pins and the toolchain they trust.
  if (pins) {
    // The project virtual environment: read-only for the run, its packages toolchain.
    const venv = decl.pythonVenv;
    if (venv) {
      const ok =
        typeof venv.dir === "string" &&
        typeof venv.site === "string" &&
        path.isAbsolute(venv.dir) &&
        isInside(venv.site, venv.dir) &&
        venv.site !== venv.dir &&
        rwRoots.some((r) => isInside(venv.dir, r.real)) &&
        fs.existsSync(path.join(venv.dir, "pyvenv.cfg")) &&
        fs.existsSync(venv.site) &&
        fs.realpathSync(venv.dir) === venv.dir &&
        fs.realpathSync(venv.site) === venv.site &&
        fs.statSync(venv.site).isDirectory();
      if (!ok) {
        return refuse(
          "containment-declaration-invalid",
          `the Python environment ${String(venv.dir)} is not a virtual environment inside a read-write root`,
        );
      }
      view.push({ op: "bind", src: venv.dir, path: venv.dir, file: false, ro: true, exec: false });
      view.push({ op: "bind", src: venv.site, path: venv.site, file: false, ro: true, exec: true });
    }
    for (const p of pins) {
      if (!rwRoots.some((r) => isInside(p.path, r.real))) {
        return refuse(
          "containment-declaration-invalid",
          `code pin ${p.path} is not inside a read-write root`,
        );
      }
      if (p.exec && fs.existsSync(p.path) && fs.statSync(p.path).isFile()) {
        view.push({ op: "bind", src: p.path, path: p.path, file: true, ro: false, exec: true });
      }
    }
    const toolchain = [
      ...new Set([
        CODE_GUARD_DIR,
        ...(venv ? [venv.site] : []),
        ...view.ops.flatMap((o) =>
          o.op === "bind" &&
          o.ro &&
          !rwRoots.some((r) => isInside(o.path, r.real) || isInside(o.path, r.declared))
            ? [o.path]
            : [],
        ),
      ]),
    ].toSorted();
    view.file(
      NODE_GUARD_PATH,
      nodeGuardSource(
        pins,
        toolchain,
        realPrograms.filter((r) => guardedInterpreter(path.basename(r.view)) === "node"),
      ),
    );
    view.file(
      PY_GUARD_PATH,
      pythonGuardSource(
        pins,
        toolchain,
        stdinPins ?? [],
        venv ? { site: venv.site, systemSite: venv.systemSite === true } : null,
      ),
    );
    view.dir(PY_CACHE_PREFIX);
  }

  return {
    ok: true,
    plan: {
      kind: decl.kind,
      label: decl.label,
      command,
      args: [...decl.args],
      cwd: decl.cwd,
      ops: view.ops,
      env,
      strictExec,
      uid: ctx.uid,
      gid: ctx.gid,
      destinations,
      secrets: [...(decl.secrets ?? [])],
      placeholders,
      execConfigReadOnly,
      protect,
      anchored,
      installGuards,
      nameGuard: ctx.nameGuard ?? null,
      rwRoots: rwRoots.map((r) => r.real),
      execConfigWritable: [...writableExceptions],
      programs: [...programReals.keys()],
      realPrograms,
      readPins,
      gitRefsWritable: !decl.gitHistoryReadOnly,
      execPins: (pins ?? []).filter((p) => p.exec).map((p) => p.path),
      modeChanges: (decl.modeChanges ?? []).filter(
        (m) => path.isAbsolute(m) && !m.includes("\n") && rwRoots.some((r) => isInside(m, r.real)),
      ),
      build: decl.build !== undefined,
      failureNotice: decl.build?.failureNotice ?? null,
    },
  };
}

/** The node toolchain a project script or package install needs: node, sh, env, npm's tree. */
export function nodeToolchain(): { programs: string[]; roots: ContainmentRoot[] } {
  const programs = ["node", "sh", "env", ...(lookupProgram("npm") ? ["npm"] : [])];
  const roots: ContainmentRoot[] = [];
  const npm = lookupProgram("npm");
  if (npm) {
    const real = fs.realpathSync(npm);
    // .../<modules>/npm/bin/npm-cli.js: npm resolves its dependencies from
    // its own tree and, on distributions that unbundle it, from <modules>.
    let dir = path.dirname(real);
    while (dir !== "/" && path.basename(dir) !== "npm") {
      dir = path.dirname(dir);
    }
    if (dir !== "/") {
      roots.push({ path: path.dirname(dir), access: "ro", exec: true });
    }
  }
  return { programs, roots };
}
