import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { commandReachesCredential, readReachesCredential } from "./credentials.js";
import { decidePreAction } from "./engine.js";
import { nodeFsProbe, realpathNearestSync, windowsSemanticsFs } from "./fs-probe.js";
import {
  EXEC_CONFIG_NAMES,
  execConfigParts,
  isExecConfigDir,
  isExecConfigPath,
  isExecConfigTarget,
} from "./rule-decisions.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) {
    fs.rmSync(r, { recursive: true, force: true });
  }
});

function makeEnv() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "exec-config-")));
  roots.push(root);
  const proj = path.join(root, "proj");
  const home = path.join(root, "home");
  fs.mkdirSync(proj, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return { root, proj, home };
}

const policy = () =>
  createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });

function opts(env: ReturnType<typeof makeEnv>, p = policy()) {
  return {
    host: "test-host",
    shellDefinitions: NO_SHELL_DEFINITIONS,
    policy: p,
    projectDir: env.proj,
    home: env.home,
    hardware: () => ({ allowed: true }),
    history: { store: new HistoryStore({ dir: path.join(env.root, "h"), limits: p.history }) },
    fs: nodeFsProbe(),
    containScripts: async (r: { command: string }) => ({ ok: true, command: r.command }),
  } as never;
}

async function decideWrite(env: ReturnType<typeof makeEnv>, rel: string) {
  const abs = path.isAbsolute(rel) ? rel : path.join(env.proj, rel);
  return decidePreAction(
    {
      type: "pre-action",
      actor: { sessionId: "s", subagentId: null },
      callId: "c1",
      tool: "Write",
      policyIds: ["write"],
      kind: "fs-write",
      params: { file_path: abs, content: "x" },
      cwd: env.proj,
      writes: [{ path: abs, op: "write" }],
      approvalRoute: "no-person",
    } as never,
    opts(env),
  );
}

async function decideRead(env: ReturnType<typeof makeEnv>, rel: string, recursive = false) {
  const abs = path.isAbsolute(rel) ? rel : path.join(env.proj, rel);
  return decidePreAction(
    {
      type: "pre-action",
      actor: { sessionId: "s", subagentId: null },
      callId: "c1",
      tool: recursive ? "Grep" : "Read",
      policyIds: [recursive ? "grep" : "read"],
      kind: "read",
      params: recursive ? { pattern: "x", path: abs } : { file_path: abs },
      cwd: env.proj,
      reads: [{ path: abs, ...(recursive ? { recursive: true } : {}) }],
      approvalRoute: "no-person",
    } as never,
    opts(env),
  );
}

// Files that make an agent host, an IDE, a shell hook or a git event start
// programs on their own: each write waits for a person.
const NEWLY_COVERED = [
  ".vscode/mcp.json",
  ".vscode/extensions.json",
  ".roo/mcp.json",
  ".roo/rules/x.md",
  ".windsurf/mcp.json",
  ".amazonq/mcp.json",
  ".continue/config.json",
  ".continue/config.yaml",
  ".kilocode/mcp.json",
  ".junie/mcp/mcp.json",
  ".qwen/settings.json",
  ".crush/x.json",
  "crush.json",
  "opencode.json",
  ".aider.conf.yml",
  "sub/mcp.json",
  "tools/mcp_config.json",
  "servers.mcp.json",
  "proj.code-workspace",
  ".idea/workspace.xml",
  ".idea/runConfigurations/x.xml",
  ".fleet/run.json",
  ".zed/settings.json",
  ".zed/tasks.json",
  ".theia/tasks.json",
  ".devcontainer.json",
  ".gitpod.yml",
  ".replit",
  "replit.nix",
  ".idx/dev.nix",
  "mise.toml",
  ".mise.toml",
  "mise.local.toml",
  "mise.dev.toml",
  ".mise/config.toml",
  ".config/mise/config.toml",
  ".config/mise.toml",
  ".rtx.toml",
  ".autoenv.zsh",
  ".env.leave",
  "bunfig.toml",
  ".hg/hgrc",
  ".sl/config",
  ".jj/repo/config.toml",
  ".nvim.lua",
  ".nvimrc",
  ".exrc",
  ".vimrc",
  ".lvimrc",
  ".lazy.lua",
  "lefthook.yml",
  ".lefthook.yml",
  "lefthook-local.yaml",
  ".lefthook/pre-commit/x.sh",
  ".lintstagedrc",
  "lint-staged.config.mjs",
  ".overcommit.yml",
  ".github/workflows/ci.yml",
  ".github/actions/setup/action.yml",
  ".github/agents/x.agent.md",
  ".git/info/attributes",
  ".gitattributes",
  "sitecustomize.py",
  "usercustomize.py",
  ".venv/lib/python3.12/site-packages/evil.pth",
  // Toolchain selection: a version manager's proxy starts what these name.
  ".nvmrc",
  ".node-version",
  ".tool-versions",
  ".python-version",
  "rust-toolchain.toml",
  "sub/rust-toolchain",
  // zz-w3: read and acted on at every invocation, or naming code the tool runs.
  "pnpm-workspace.yaml",
  ".pnp.js",
  "gradle.properties",
  ".sbtopts",
  ".jvmopts",
  "global.json",
  "Directory.Build.props",
  "src/Directory.Build.targets",
  "Directory.Packages.props",
  "NuGet.Config",
  "go.work",
  ".irbrc",
  ".pryrc",
  ".pdbrc",
  "web/.user.ini",
];

const STILL_ALLOWED = [
  "src/math.js",
  "notes.txt",
  "CLAUDE.md",
  "AGENTS.md",
  "README.md",
  "conftest.py",
  "tests/test_x.py",
  "model.pth",
  ".env",
  "shell.nix",
  "docs/mcp.md",
  "Makefile",
];

describe("exec-config names", () => {
  it.each(NEWLY_COVERED)("%s is exec-config, in any case", (rel) => {
    expect(isExecConfigPath(`/p/${rel}`)).toBe(true);
    expect(isExecConfigPath(`/p/${rel}`.toUpperCase())).toBe(true);
  });

  it.each(STILL_ALLOWED)("%s is not exec-config", (rel) => {
    expect(isExecConfigPath(`/p/${rel}`)).toBe(false);
  });

  it("directories on the way to a sequence are exec-config directories", () => {
    expect(isExecConfigDir("/p/.config")).toBe(true);
    expect(isExecConfigDir("/p/.cargo")).toBe(true);
    expect(isExecConfigDir("/p/.vscode")).toBe(true);
    expect(isExecConfigDir("/p/.github")).toBe(true);
    expect(isExecConfigDir("/p/src")).toBe(false);
  });

  it("is exported as plain data a generator can emit", () => {
    const text = JSON.parse(JSON.stringify(EXEC_CONFIG_NAMES)) as Record<string, unknown[]>;
    expect(Object.keys(text).toSorted()).toEqual(
      ["affixes", "files", "segments", "sequences", "suffixes", "suffixesBelow"].toSorted(),
    );
    for (const list of Object.values(text)) {
      for (const v of list.flat()) {
        expect(v).toBe(String(v).normalize("NFC").toLowerCase());
      }
    }
  });
});

describe("Windows path canonicalization", () => {
  const win = { platform: "win32" } as const;

  it("strips trailing dots and spaces from every component", () => {
    expect(isExecConfigPath("C:\\p\\.mcp.json.", {}, win)).toBe(true);
    expect(isExecConfigPath("C:\\p\\.mcp.json . .", {}, win)).toBe(true);
    expect(isExecConfigPath("C:\\p\\.claude.\\settings.json", {}, win)).toBe(true);
    expect(isExecConfigPath("C:\\p\\.claude \\settings.json", {}, win)).toBe(true);
    expect(isExecConfigPath("C:\\p\\.envrc...", {}, win)).toBe(true);
  });

  it("matches without trailing dots and spaces on every platform (WSL's /mnt/c is a Windows file system)", () => {
    for (const p of [
      "/p/.mcp.json.",
      "/p/.github./workflows/x.yml",
      "/p/.GitHub . /workflows/x.yml",
      "/p/.claude /settings.json",
      "/p/.vscode./tasks.json",
      "/p/mise.toml ",
      "/p/x.code-workspace.",
      "/p/.git./hooks/pre-commit",
      "/p/.../x",
      "/p/.mcp.json:x",
      "/p/.claude:s/settings.json",
    ]) {
      expect({ p, exec: isExecConfigPath(p, {}, { platform: "posix" }) }).toEqual({
        p,
        exec: true,
      });
    }
    for (const p of ["/p/src/a.ts.", "/p/logs/12:00.log", "/p/src/", "/p/./a/../b.ts"]) {
      expect({ p, exec: isExecConfigPath(p, {}, { platform: "posix" }) }).toEqual({
        p,
        exec: false,
      });
    }
    // Short names are Windows names: on Linux only for a Windows file system.
    expect(isExecConfigPath("/p/NOTES~1.TXT", {}, { platform: "posix" })).toBe(false);
    expect(
      isExecConfigTarget("/mnt/c/p/NOTES~1.TXT", "/mnt/c/p/NOTES~1.TXT", {}, "posix", true),
    ).toBe(true);
    expect(isExecConfigTarget("/mnt/c/p/src/a.ts", "/mnt/c/p/src/a.ts", {}, "posix", true)).toBe(
      false,
    );
  });

  it("recognizes Windows file systems mounted on Linux by their type", () => {
    const types: Record<string, number | bigint> = { "/mnt/c": 0x01021997, "/smb": 0xfe534d42n };
    const typeOf = (q: string) => {
      const t = Object.entries(types).find(([m]) => q === m || q.startsWith(`${m}/`));
      if (t) {
        return t[1];
      }
      if (q === "/") {
        return 0xef53; // ext4
      }
      throw new Error("ENOENT");
    };
    expect(windowsSemanticsFs("/mnt/c/Users/x/proj/new/.github.", "linux", typeOf)).toBe(true);
    expect(windowsSemanticsFs("/smb/share/x", "linux", typeOf)).toBe(true);
    expect(windowsSemanticsFs("/home/u/proj/.github.", "linux", typeOf)).toBe(false);
    expect(windowsSemanticsFs("C:\\p", "win32", typeOf)).toBe(true);
    expect(windowsSemanticsFs("/Users/u/p", "darwin", typeOf)).toBe(false);
    // This machine's temporary directory: an ordinary Linux file system (on Linux).
    if (process.platform === "linux") {
      expect(windowsSemanticsFs(os.tmpdir())).toBe(false);
    }
  });

  it("refuses alternate data streams", () => {
    expect(execConfigParts("C:\\p\\.mcp.json::$DATA", win)).toBeNull();
    expect(isExecConfigPath("C:\\p\\.mcp.json::$DATA", {}, win)).toBe(true);
    expect(isExecConfigPath("C:\\p\\notes.txt:hidden", {}, win)).toBe(true);
    expect(isExecConfigPath("\\\\?\\C:\\p\\src\\a.ts", {}, win)).toBe(false);
    expect(isExecConfigPath("C:\\p\\src\\a.ts", {}, win)).toBe(false);
  });

  it("refuses an unresolved short name, accepts a resolved one", () => {
    expect(isExecConfigPath("C:\\p\\CLAUDE~1\\settings.json", {}, win)).toBe(true);
    expect(isExecConfigPath("C:\\p\\MCPJSO~1.JSO", {}, win)).toBe(true);
    expect(isExecConfigPath("C:\\p\\NOTES~1.TXT", {}, { ...win, resolved: true })).toBe(false);
    // The target with its final path: a short name in the agent's form is left to it.
    expect(
      isExecConfigTarget("C:\\RUNNER~1\\p\\a.ts", "C:\\runneradmin\\p\\a.ts", {}, "win32"),
    ).toBe(false);
    expect(
      isExecConfigTarget(
        "C:\\p\\CLAUDE~1\\settings.json",
        "C:\\p\\.claude\\settings.json",
        {},
        "win32",
      ),
    ).toBe(true);
  });

  it("refuses a component made only of dots and spaces", () => {
    expect(execConfigParts("C:\\p\\...\\x", win)).toBeNull();
    expect(execConfigParts("C:\\p\\..\\x", win)).not.toBeNull();
  });

  it("realpathNearest drops trailing dots and spaces of new components on Windows", () => {
    const env = makeEnv();
    expect(realpathNearestSync(path.join(env.proj, "new", ".mcp.json. "), "posix")).toBe(
      path.join(env.proj, "new", ".mcp.json. "),
    );
    // (realpathSync.native on Linux resolves like realpathSync.)
    expect(realpathNearestSync(path.join(env.proj, "new.", ".mcp.json. "), "win32")).toBe(
      path.join(env.proj, "new", ".mcp.json"),
    );
  });
});

describe("exec-config writes (decision level)", () => {
  it("each newly covered file waits for a person", async () => {
    const env = makeEnv();
    for (const rel of NEWLY_COVERED) {
      const d = await decideWrite(env, rel);
      expect({ rel, outcome: d.outcome, exec: d.codes.includes("exec-config-path") }).toEqual({
        rel,
        outcome: "deny",
        exec: true,
      });
    }
  }, 60_000);

  it("a protected name with trailing dots or spaces waits for a person", async () => {
    const env = makeEnv();
    for (const rel of [
      ".github./workflows/x.yml",
      ".mcp.json.",
      ".claude /settings.json",
      ".envrc. ",
    ]) {
      const d = await decideWrite(env, rel);
      expect({ rel, outcome: d.outcome, exec: d.codes.includes("exec-config-path") }).toEqual({
        rel,
        outcome: "deny",
        exec: true,
      });
    }
  }, 60_000);

  it("ordinary source writes stay reversible writes", async () => {
    const env = makeEnv();
    for (const rel of STILL_ALLOWED) {
      const d = await decideWrite(env, rel);
      expect({ rel, outcome: d.outcome }).toEqual({ rel, outcome: "allow" });
    }
  }, 60_000);

  it("a symbolic or hard link to a newly covered file is that file", async () => {
    const env = makeEnv();
    fs.mkdirSync(path.join(env.proj, ".vscode"));
    fs.writeFileSync(path.join(env.proj, ".vscode", "mcp.json"), "{}");
    fs.writeFileSync(path.join(env.proj, "mise.toml"), "");
    fs.symlinkSync(".vscode", path.join(env.proj, "vs"));
    fs.symlinkSync("mise.toml", path.join(env.proj, "m-link"));
    fs.linkSync(path.join(env.proj, "mise.toml"), path.join(env.proj, "m-hard"));
    for (const rel of ["vs/mcp.json", "m-link", "m-hard"]) {
      const d = await decideWrite(env, rel);
      expect({ rel, outcome: d.outcome, exec: d.codes.includes("exec-config-path") }).toEqual({
        rel,
        outcome: "deny",
        exec: true,
      });
    }
  }, 60_000);

  it("an environment or Nix file next to an .envrc waits for a person", async () => {
    const env = makeEnv();
    fs.mkdirSync(path.join(env.proj, "svc"));
    expect((await decideWrite(env, "svc/.env")).outcome).toBe("allow");
    fs.writeFileSync(path.join(env.proj, ".envrc"), "dotenv\n");
    for (const rel of [".env", ".env.local", "shell.nix", "flake.nix", "flake.lock", "svc/.env"]) {
      const d = await decideWrite(env, rel);
      expect({ rel, outcome: d.outcome, exec: d.codes.includes("exec-config-path") }).toEqual({
        rel,
        outcome: "deny",
        exec: true,
      });
    }
    expect((await decideWrite(env, "src/math.js")).outcome).toBe("allow");
  }, 60_000);
});

describe("credential files under other names", () => {
  const STORES: Record<string, string> = {
    ".aws/credentials": "[default]\nkey=k\n",
    ".netrc": "machine example.invalid login u password p\n",
    ".docker/config.json": "{}\n",
    ".pgpass": "h:5432:d:u:p\n",
    ".kube/config": "apiVersion: v1\n",
    ".npmrc": "//r/:_authToken=k\n",
    ".git-credentials": "https://u:p@example.invalid\n",
  };

  function withStores() {
    const env = makeEnv();
    for (const [rel, body] of Object.entries(STORES)) {
      fs.mkdirSync(path.dirname(path.join(env.home, rel)), { recursive: true });
      fs.writeFileSync(path.join(env.home, rel), body);
    }
    return env;
  }

  it("a read of a project hard link to a credential file asks", async () => {
    const env = withStores();
    for (const rel of Object.keys(STORES)) {
      const link = path.join(env.proj, `hard-${rel.replace(/[/.]/g, "_")}`);
      fs.linkSync(path.join(env.home, rel), link);
      const d = await decideRead(env, link);
      expect({ rel, outcome: d.outcome, codes: d.codes }).toEqual({
        rel,
        outcome: "deny",
        codes: ["credential-path", "no-person:headless"],
      });
    }
  }, 60_000);

  it("a recursive read of a directory holding such a hard link asks", async () => {
    const env = withStores();
    fs.mkdirSync(path.join(env.proj, "d"));
    fs.writeFileSync(path.join(env.proj, "d", "a.txt"), "a\n");
    expect((await decideRead(env, env.proj, true)).outcome).toBe("allow");
    fs.linkSync(path.join(env.home, ".netrc"), path.join(env.proj, "d", "n"));
    const d = await decideRead(env, env.proj, true);
    expect(d.outcome).toBe("deny");
    expect(d.codes).toContain("credential-path");
  }, 60_000);

  it("a recursive read of a directory with a symbolic link into a credential store asks", async () => {
    for (const [name, target] of [
      ["x", ".aws"],
      ["c", ".aws/credentials"],
    ] as const) {
      const env = withStores();
      fs.mkdirSync(path.join(env.proj, "d"));
      fs.symlinkSync(path.join(env.home, target), path.join(env.proj, "d", name));
      const d = await decideRead(env, path.join(env.proj, "d"), true);
      expect({ target, outcome: d.outcome, cred: d.codes.includes("credential-path") }).toEqual({
        target,
        outcome: "deny",
        cred: true,
      });
    }
  }, 60_000);

  it("a link through a directory elsewhere is followed", () => {
    const env = withStores();
    const elsewhere = path.join(env.root, "elsewhere");
    fs.mkdirSync(elsewhere);
    fs.symlinkSync(path.join(env.home, ".aws"), path.join(elsewhere, "creds"));
    fs.symlinkSync(elsewhere, path.join(env.proj, "e"));
    const hit = readReachesCredential(nodeFsProbe(), env.proj, env.home, true);
    expect(hit?.path).toBe(path.join(env.home, ".aws"));
  });

  it("a shell command that reads such a link reaches the credential", () => {
    const env = withStores();
    fs.linkSync(path.join(env.home, ".netrc"), path.join(env.proj, "n"));
    fs.mkdirSync(path.join(env.proj, "d"));
    fs.symlinkSync(path.join(env.home, ".docker"), path.join(env.proj, "d", "x"));
    expect(commandReachesCredential(nodeFsProbe(), "cat n", env.proj, env.home)).not.toBeNull();
    expect(
      commandReachesCredential(nodeFsProbe(), "grep -r x d", env.proj, env.home),
    ).not.toBeNull();
    expect(commandReachesCredential(nodeFsProbe(), "cat a.txt", env.proj, env.home)).toBeNull();
  });

  it("ordinary hard and symbolic links in the project stay readable", async () => {
    const env = withStores();
    fs.writeFileSync(path.join(env.proj, "a.txt"), "a\n");
    fs.linkSync(path.join(env.proj, "a.txt"), path.join(env.proj, "b.txt"));
    fs.symlinkSync("a.txt", path.join(env.proj, "c.txt"));
    fs.mkdirSync(path.join(env.root, "lib"));
    fs.symlinkSync(path.join(env.root, "lib"), path.join(env.proj, "lib"));
    expect((await decideRead(env, "b.txt")).outcome).toBe("allow");
    expect((await decideRead(env, env.proj, true)).outcome).toBe("allow");
  }, 60_000);
});
