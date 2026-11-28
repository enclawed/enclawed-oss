// enclawed adapter kit: the decision helpers and the exec-config path rules,
// a leaf module (types and helpers only, no adapter module above it) so rule
// modules such as ./file-integrity.ts use them without importing ./rule-kit.ts,
// which re-exports everything here.

import type { Policy } from "../policy.js";
import type { CapabilityToken } from "../skill-capabilities.js";
import { REASON_PREFIX, type Decision, type PreActionEvent, type ReasonCode } from "./types.js";
import { quoteUntrusted as q } from "./untrusted.js";

/** Extra exec-config names an operator adds (EngineOptions.execConfig). */
export type ExecConfigOption =
  | Readonly<{ segments?: readonly string[]; files?: readonly string[] }>
  | undefined;

// ─── Files that configure what runs later ───────────────────────────────

// The rule: a file is exec-config when some common tool runs code from it, or
// starts a program it names, WITHOUT a command Enclawed decides: when a folder
// is opened (IDE, dev container, cloud workspace), on `cd` or at a shell
// prompt (direnv, mise, autoenv), when an agent host starts a session (MCP
// servers, hooks), at a commit or another git event (hooks and hook
// managers), while an IDE indexes or runs its own probes (tasks, run
// configurations, interpreter start-up files), or when an editor opens the
// folder (exrc). Their old content is kept, but undoing the file does not
// undo what already ran because of it, so writes to them wait for a person.
// Agent-CLI config directories of every known host are listed: a write to
// any of them changes what runs later, whichever host is active. Names
// compare case-insensitively after NFC (on macOS and Windows `.GIT/config` is
// `.git/config`), and on Windows after the per-component canonicalization of
// execConfigParts (trailing dots and spaces, streams, short names).
//
// Deliberately absent, because they run only through a command Enclawed
// decides (or a person runs outside it): build files (BUILD_FILES below),
// Procfile, test modules and conftest.py (test discovery imports project
// source in general; listing one module of it would not make the rest safe),
// version pins that select an installed runtime (.nvmrc, .node-version,
// .python-version, .tool-versions), instruction files read by agents
// (CLAUDE.md, AGENTS.md, .cursorrules, .windsurfrules: text, reversible from
// history) and .vscode-style editor recommendations outside a listed
// directory. An environment file (.env, .env.*) and the Nix or devbox files a
// direnv `.envrc` loads are exec-config only next to (or below) an `.envrc`,
// which is decided with the file system (path-rules.ts, loadedByEnvrc).
//
// One source of truth: EXEC_CONFIG_NAMES is the whole list in data form
// (segments, files, suffixes, suffixes below a directory, prefix+suffix
// pairs, component sequences), so
// a generator can emit it for the native name guard; isExecConfigPath only
// interprets it.

const LEFTHOOK_FILES = ["", "."].flatMap((dot) =>
  ["lefthook", "lefthook-local"].flatMap((n) =>
    ["yml", "yaml", "toml", "json", "jsonc"].map((ext) => `${dot}${n}.${ext}`),
  ),
);

/** Every exec-config name, as data (lower case, NFC). */
export const EXEC_CONFIG_NAMES = {
  /** A directory of this name anywhere on the path: everything below it. */
  segments: [
    // Version control: hooks, config, filters, attributes (.git/info/attributes).
    ".git",
    ".hg",
    ".sl",
    ".jj",
    // GitHub: workflows and actions (they run on push with the repository's
    // secrets), repository hooks, custom agents with their MCP servers.
    ".github",
    // Hook managers.
    ".husky",
    ".githooks",
    ".lefthook",
    ".lefthook-local",
    // Dev containers and cloud workspaces: commands run when the folder opens.
    ".devcontainer",
    ".idx",
    // Directory-entry hooks.
    ".direnv",
    ".mise",
    // Agent hosts: hooks, MCP servers, commands.
    ".claude",
    ".codex",
    ".gemini",
    ".cursor",
    ".kiro",
    ".opencode",
    ".amp",
    ".clinerules",
    ".roo",
    ".windsurf",
    ".amazonq",
    ".continue",
    ".kilocode",
    ".junie",
    ".trae",
    ".qwen",
    ".crush",
    ".factory",
    ".augment",
    // IDEs: tasks, launch and run configurations, settings that name programs.
    ".vscode",
    ".idea",
    ".fleet",
    ".zed",
    ".theia",
  ],
  /** A file of this name, anywhere. */
  files: [
    // MCP server lists of any host.
    ".mcp.json",
    "mcp.json",
    "mcp_config.json",
    "mcp_settings.json",
    "cline_mcp_settings.json",
    // Agent hosts' project config files.
    "opencode.json",
    "opencode.jsonc",
    "crush.json",
    ".crush.json",
    ".aider.conf.yml",
    ".aider.conf.yaml",
    // Directory-entry hooks.
    ".envrc",
    ".autoenv.zsh",
    ".autoenv_leave.zsh",
    ".env.leave",
    "mise.toml",
    ".mise.toml",
    "rtx.toml",
    ".rtx.toml",
    // Git.
    ".gitmodules",
    ".gitattributes",
    // Package managers: settings that pick the shell or preload code; install scripts.
    ".npmrc",
    ".yarnrc",
    ".yarnrc.yml",
    ".pnpmfile.cjs",
    "package.json",
    "bunfig.toml",
    ".bunfig.toml",
    // Hooks run at a commit.
    ".pre-commit-config.yaml",
    ".pre-commit-config.yml",
    ".overcommit.yml",
    ...LEFTHOOK_FILES,
    ".lintstagedrc",
    ".lintstagedrc.json",
    ".lintstagedrc.yaml",
    ".lintstagedrc.yml",
    ".lintstagedrc.js",
    ".lintstagedrc.mjs",
    ".lintstagedrc.cjs",
    "lint-staged.config.js",
    "lint-staged.config.mjs",
    "lint-staged.config.cjs",
    // Dev containers and cloud workspaces.
    ".devcontainer.json",
    ".gitpod.yml",
    ".gitpod.yaml",
    ".replit",
    "replit.nix",
    // Editors that run a project's rc file when they open the folder.
    ".exrc",
    ".nvimrc",
    ".nvim.lua",
    ".vimrc",
    ".gvimrc",
    ".lvimrc",
    ".lazy.lua",
    // Python runs these at every interpreter start (an IDE's probes included).
    "sitecustomize.py",
    "usercustomize.py",
    // Toolchain selection: a version manager's proxy (rustup, pyenv, asdf,
    // mise, nvm, fnm, volta, sdkman, jenv, rbenv) starts the toolchain these
    // name, a path into the project included (rust-toolchain's path, asdf's
    // path:), or downloads one.
    "rust-toolchain",
    "rust-toolchain.toml",
    ".tool-versions",
    ".python-version",
    ".ruby-version",
    ".node-version",
    ".nvmrc",
    ".java-version",
    ".sdkmanrc",
    // A file a tool reads and acts on at every invocation (a version query
    // included), or that names code the tool runs: pnpm's workspace settings
    // (pnpmfile: a hook file pnpm runs each time), yarn 2's PnP loader, the JVM
    // build tools' option files (Gradle's gradle.properties: org.gradle.jvmargs
    // -javaagent; sbt's .sbtopts and .jvmopts), .NET's SDK selection and the
    // MSBuild files every build imports (global.json, Directory.Build.props,
    // Directory.Build.targets, Directory.Packages.props, NuGet.Config; names
    // are matched in any case), Go's
    // workspace (go.work: which modules and toolchain), and the rc files
    // irb, pry and pdb run when they start in the project (.irbrc, .pryrc,
    // .pdbrc), PHP's per-directory ini (.user.ini: auto_prepend_file).
    // Maven's .mvn, Gradle's wrapper, yarn's cache and unplugged packages and
    // Bundler's .bundle are package-manager state (../containment/exec-caches.ts
    // PACKAGE_STATE): installs write them, so they are not names here.
    "pnpm-workspace.yaml",
    ".pnp.js",
    "gradle.properties",
    ".sbtopts",
    ".jvmopts",
    "global.json",
    "directory.build.props",
    "directory.build.targets",
    "directory.packages.props",
    "nuget.config",
    "go.work",
    ".irbrc",
    ".pryrc",
    ".pdbrc",
    ".user.ini",
  ],
  /** A file whose name ends with this (and is longer than it). */
  suffixes: [".mcp.json", ".code-workspace", ".theia-workspace"],
  /**
   * A file ending with the second, below a directory named the first: Python
   * runs the import lines of every .pth file in a site directory at each
   * interpreter start (a project's virtual environment included). Elsewhere
   * .pth is also a model-weights file, which runs nothing.
   */
  suffixesBelow: [
    ["site-packages", ".pth"],
    ["dist-packages", ".pth"],
  ] as ReadonlyArray<readonly [string, string]>,
  /** A file whose name starts with the first and ends with the second (mise.<env>.toml). */
  affixes: [
    ["mise.", ".toml"],
    [".mise.", ".toml"],
    ["rtx.", ".toml"],
    [".rtx.", ".toml"],
  ] as ReadonlyArray<readonly [string, string]>,
  /** Adjacent path components, anywhere on the path (the last may be the file). */
  sequences: [
    [".cargo", "config"],
    [".cargo", "config.toml"],
    // mise's other config locations inside a project.
    [".config", "mise"],
    [".config", "mise.toml"],
    ["mise", "config.toml"],
    // The GitHub CLI's config directory (.config/gh, the GH_CONFIG_DIR of a
    // session home included: config.yml `pager:` runs a program when stdout is
    // a terminal, and it holds aliases), its data directory (.local/share/gh:
    // extensions) and its Windows config directory (%AppData%\GitHub CLI).
    [".config", "gh"],
    [".local", "share", "gh"],
    ["github cli"],
  ] as ReadonlyArray<readonly string[]>,
} as const;

/** The plain names of EXEC_CONFIG_NAMES (kept for callers of the older lists). */
const EXEC_CONFIG_SEGMENTS: readonly string[] = EXEC_CONFIG_NAMES.segments;
const EXEC_CONFIG_FILES: readonly string[] = EXEC_CONFIG_NAMES.files;

/** The platform whose path rules apply (injectable so the Windows rules are tested anywhere). */
export type PathPlatform = "posix" | "win32";
const HOST_PLATFORM: PathPlatform = process.platform === "win32" ? "win32" : "posix";

/** How a path was obtained, for isExecConfigPath. */
export type ExecConfigHow = Readonly<{
  platform?: PathPlatform;
  /**
   * The path is a final path (the real path of its existing part, as the
   * file system resolves it, with the new part appended): its short names,
   * if any, are literal names, not aliases.
   */
  resolved?: boolean;
}>;

// A Windows 8.3 short name (PROGRA~1, CLAUDE~1, MCPJSO~1.JSO): it may alias
// any long name, so an unresolved one is never matched by guessing.
const SHORT_NAME = /~\d/;
// A drive (c:) or device-path marker (\\?\, \\.\) at the start of a Windows path.
const DRIVE = /^[a-z]:$/;

/**
 * The components of `absPath` as the names a file system compares (lower
 * case, NFC), or null when a component cannot be named with certainty (the
 * caller then treats the path as exec-config). On every platform each
 * component is matched without its trailing dots and spaces: Windows, and a
 * Windows file system mounted elsewhere (WSL's /mnt/c, SMB, vfat, exFAT,
 * NTFS), opens `.mcp.json.` and `.github ` as `.mcp.json` and `.github`; on
 * another file system such a name is only an odd name, and asking for it
 * costs nothing. A name made only of dots and spaces (not `.` or `..`)
 * refuses. A `:` after the drive (an alternate data stream such as
 * `.mcp.json::$DATA`) refuses on Windows; elsewhere the name is matched as
 * what comes before its first `:` too. With Windows rules (`platform:
 * "win32"`, also for a path on a Windows file system), an unresolved short
 * name (`CLAUDE~1`) refuses.
 */
export function execConfigParts(absPath: string, how: ExecConfigHow = {}): string[] | null {
  const parts = absPath
    .normalize("NFC")
    .toLowerCase()
    .split(/[\\/]+/);
  const win = (how.platform ?? HOST_PLATFORM) === "win32";
  const out: string[] = [];
  let prefix = true;
  for (const raw of parts) {
    // The leading run: empty (the root, UNC, device paths), ? or . (\\?\, \\.\), then one drive.
    if (prefix && (raw === "" || (win && (raw === "?" || raw === ".")))) {
      out.push(raw);
      continue;
    }
    if (prefix && win && DRIVE.test(raw)) {
      prefix = false;
      out.push(raw);
      continue;
    }
    prefix = false;
    if (raw === "" || raw === "." || raw === "..") {
      out.push(raw); // a trailing separator; . and .. as given
      continue;
    }
    if (win && raw.includes(":")) {
      return null;
    }
    const name = raw.replace(/[. ]+$/, "");
    if (name === "") {
      return null;
    }
    if (win && !how.resolved && SHORT_NAME.test(name)) {
      return null;
    }
    const colon = name.indexOf(":");
    if (colon >= 0) {
      const stem = name.slice(0, colon).replace(/[. ]+$/, "");
      if (stem === "") {
        return null;
      }
      out.push(stem);
    }
    out.push(name);
  }
  return out;
}

function nameIsExecConfig(base: string, extraFiles: readonly string[]): boolean {
  return (
    EXEC_CONFIG_FILES.includes(base) ||
    extraFiles.includes(base) ||
    EXEC_CONFIG_NAMES.suffixes.some((x) => base.endsWith(x) && base !== x) ||
    EXEC_CONFIG_NAMES.affixes.some(
      ([a, z]) => base.startsWith(a) && base.endsWith(z) && base.length >= a.length + z.length,
    )
  );
}

export function isExecConfigPath(
  absPath: string,
  extra: ExecConfigOption = {},
  how: ExecConfigHow = {},
): boolean {
  const parts = execConfigParts(absPath, how);
  if (parts === null) {
    return true; // not nameable with certainty: refused rather than guessed
  }
  const segs = new Set([
    ...EXEC_CONFIG_SEGMENTS,
    ...(extra?.segments ?? []).map((s) => s.toLowerCase()),
  ]);
  if (parts.some((p) => segs.has(p))) {
    return true;
  }
  if (
    EXEC_CONFIG_NAMES.sequences.some((seq) =>
      parts.some((_, i) => seq.every((s, k) => parts[i + k] === s)),
    )
  ) {
    return true;
  }
  const last = parts.findLast(Boolean) ?? "";
  // The file's name, and what comes before a colon in it (execConfigParts).
  const colon = last.indexOf(":");
  const bases = colon < 0 ? [last] : [last, last.slice(0, colon).replace(/[. ]+$/, "")];
  const extraFiles = (extra?.files ?? []).map((s) => s.toLowerCase());
  return bases.some(
    (base) =>
      EXEC_CONFIG_NAMES.suffixesBelow.some(
        ([d, x]) => base.endsWith(x) && base !== x && parts.slice(0, -1).includes(d),
      ) || nameIsExecConfig(base, extraFiles),
  );
}

/**
 * A write target given as the agent named it (`abs`) and as the file system
 * resolves it (`real`, realpathNearest: the final path of its existing part).
 * Either form naming exec-config makes it exec-config. A short name in `abs`
 * is left to `real`, which resolved it when it names an existing file (a new
 * component is created under its literal name).
 */
export function isExecConfigTarget(
  abs: string,
  real: string | null,
  extra: ExecConfigOption = {},
  platform?: PathPlatform,
  /**
   * The target is on a Windows file system mounted on another platform
   * (fs-probe.ts, windowsSemanticsFs): Windows name rules apply, and its
   * real path does not resolve short names (the mount reports names as
   * given), so a short name in either form refuses.
   */
  windowsFs = false,
): boolean {
  if (windowsFs) {
    return (
      isExecConfigPath(abs, extra, { platform: "win32" }) ||
      (real !== null && real !== "" && isExecConfigPath(real, extra, { platform: "win32" }))
    );
  }
  const resolved = real !== null && real !== "";
  return (
    isExecConfigPath(abs, extra, { platform, resolved }) ||
    (resolved && isExecConfigPath(real, extra, { platform, resolved: true }))
  );
}

/**
 * A directory whose files configure what runs later: one named by an
 * exec-config segment (.git, .claude, ...), one inside it, or a directory on
 * the way to an exec-config sequence (.cargo, .config). Removing it removes
 * that configuration.
 */
export function isExecConfigDir(absDir: string, extra: ExecConfigOption = {}): boolean {
  const parts = execConfigParts(absDir);
  if (parts === null) {
    return true;
  }
  const base = parts.findLast(Boolean) ?? "";
  return (
    isExecConfigPath(absDir, extra) ||
    isExecConfigPath(`${absDir}/x`, extra) ||
    EXEC_CONFIG_NAMES.sequences.some((seq) => seq.length > 1 && seq[0] === base)
  );
}

// Build files (the owner's rule, 2026-11-27): they run only when a person or
// the agent builds, not by themselves. An agent's edit of one is a reversible
// write (history kept) that the file-integrity record flags as a build file
// the agent changed; a git commit's question names them, so the person
// reviews them before building outside Enclawed; the agent's own builds run
// contained. Files something runs on its own (git hooks, .envrc, .husky,
// agent-CLI config, .mcp.json, editor tasks, CI workflows, package.json with
// its install scripts) stay exec-config: always asked.
const BUILD_FILES = new Set([
  "makefile",
  "gnumakefile",
  "makefile.am",
  "makefile.in",
  "cmakelists.txt",
  "cmakepresets.json",
  "cmakeuserpresets.json",
  "meson.build",
  "meson_options.txt",
  "meson.options",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "pom.xml",
  "setup.py",
  "setup.cfg",
  "pyproject.toml",
  "build.rs",
  "cargo.toml",
  "configure.ac",
  "configure.in",
  "sconstruct",
  "sconscript",
  "build",
  "build.bazel",
  "workspace",
  "workspace.bazel",
  "module.bazel",
  "justfile",
  ".justfile",
  "taskfile.yml",
  "taskfile.yaml",
]);
const BUILD_EXTENSIONS = [".mk", ".cmake"];

/** A build file: what a build reads to know what to run (Makefile, CMakeLists.txt, pyproject.toml, ...). */
export function isBuildFilePath(p: string): boolean {
  const base =
    p
      .normalize("NFC")
      .toLowerCase()
      .split(/[\\/]+/)
      .findLast(Boolean) ?? "";
  return BUILD_FILES.has(base) || BUILD_EXTENSIONS.some((x) => base.endsWith(x) && base !== x);
}
// ─── Decision helpers ───────────────────────────────────────────────────

export function allow(
  codes: ReasonCode[],
  why: string,
  capability: CapabilityToken | null,
): Decision {
  return {
    outcome: "allow",
    reason: `${REASON_PREFIX}reversible (${why})`,
    codes,
    capability,
    reversible: true,
  };
}

export function deny(
  codes: ReasonCode[],
  why: string,
  capability: CapabilityToken | null,
): Decision {
  return { outcome: "deny", reason: `${REASON_PREFIX}${why}`, codes, capability, reversible: null };
}

export const upperFirst = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/**
 * An irreversible action: pre-approved by the operator, refused where no
 * person can be asked, otherwise asked.
 */
export function irreversible(
  codes: ReasonCode[],
  why: string,
  capability: CapabilityToken | null,
  event: PreActionEvent,
  policy: Policy,
): Decision {
  if (event.policyIds.some((id) => policy.preApprovedIrreversibleTools.has(id))) {
    return {
      outcome: "allow",
      reason: `${REASON_PREFIX}irreversible, pre-approved by enclawed.policy.preApprovedIrreversibleTools: ${why}`,
      codes: [...codes, "pre-approved"],
      capability,
      reversible: false,
    };
  }
  if (event.approvalRoute === "no-person") {
    const mode = event.hostMode ?? "headless";
    return {
      outcome: "deny",
      reason: `${REASON_PREFIX}irreversible action needs a person, and this session (${q(mode, { max: 40 })}) cannot ask one: ${why}`,
      codes: [...codes, `no-person:${mode}`],
      capability,
      reversible: false,
    };
  }
  return {
    outcome: "ask",
    reason: `${REASON_PREFIX}irreversible action, approve only if intended. ${upperFirst(why)}`,
    codes,
    capability,
    reversible: false,
  };
}

/**
 * An action only a person may approve, each time: never pre-approved by
 * policy, refused where no person can be asked, otherwise asked.
 */
export function personOnly(
  codes: ReasonCode[],
  why: string,
  capability: CapabilityToken | null,
  event: PreActionEvent,
): Decision {
  if (event.approvalRoute === "no-person") {
    const mode = event.hostMode ?? "headless";
    return {
      outcome: "deny",
      reason: `${REASON_PREFIX}this needs a person, and this session (${q(mode, { max: 40 })}) cannot ask one: ${why}`,
      codes: [...codes, `no-person:${mode}`],
      capability,
      reversible: false,
    };
  }
  return {
    outcome: "ask",
    reason: `${REASON_PREFIX}approve only if you asked for this. ${upperFirst(why)}`,
    codes,
    capability,
    reversible: false,
  };
}
