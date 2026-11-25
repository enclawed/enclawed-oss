// The GitHub CLI with no credentials (./gh-cli.ts): its read verbs stop before
// any request, so they are read-only; any credential, config, alias, extension,
// write verb, browser or gh inside the project keeps the ordinary rule.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { decidePreAction, type EngineOptions } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { ghInert } from "./gh-cli.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import type { PreActionEvent } from "./types.js";

let root: string;
let repo: string;
let home: string;
let sysBin: string;

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-gh-cli-")));
  repo = path.join(root, "proj");
  home = path.join(root, "home");
  // The stand-in system directory lies outside the project AND outside the
  // temporary directories: a program in a temporary directory is one the agent
  // could have planted (./program-path.ts), so it is never the system's.
  sysBin = fs.realpathSync(fs.mkdtempSync(path.join(import.meta.dirname, ".gh-cli-sysbin-")));
  for (const d of [repo, home, sysBin, path.join(repo, "bin")]) {
    fs.mkdirSync(d, { recursive: true });
  }
  // A stand-in gh outside the project and home (the decision only checks where it resolves).
  fs.writeFileSync(path.join(sysBin, "gh"), "#!/bin/sh\nexit 4\n", { mode: 0o755 });
  fs.writeFileSync(path.join(repo, "bin", "gh"), "#!/bin/sh\nexit 4\n", { mode: 0o755 });
  fs.writeFileSync(path.join(repo, "README.md"), "# x\n");
  expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(sysBin, { recursive: true, force: true });
});

const env = (extra: Record<string, string> = {}) => ({
  PATH: `${sysBin}:/usr/bin:/bin`,
  HOME: home,
  ...extra,
});
const inert = (cmd: string, e: Record<string, string> | null = env()) =>
  ghInert(cmd.split(" "), { environment: e, projectDir: repo, home }).ok;

let n = 0;
function opts(extra: Partial<EngineOptions> = {}): EngineOptions {
  const policy = createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
  return {
    host: "test-host",
    shellDefinitions: NO_SHELL_DEFINITIONS,
    policy,
    projectDir: repo,
    home,
    hardware: () => ({ allowed: true }),
    history: {
      store: new HistoryStore({ dir: path.join(root, `hist-${n++}`), limits: policy.history }),
    },
    protected: { paths: [path.join(root, "state")], prefixes: [] },
    secretPaths: [path.join(root, "state", "session")],
    fs: nodeFsProbe(),
    environment: env(),
    ...extra,
  };
}
const sh = (text: string): PreActionEvent => ({
  type: "pre-action",
  actor: { sessionId: "s", subagentId: null },
  callId: `c-${n++}`,
  tool: "Bash",
  policyIds: ["bash", "exec"],
  kind: "shell",
  params: { command: text },
  cwd: repo,
  command: { text, dialect: "posix" },
  approvalRoute: "person",
});
const answer = async (text: string, o = opts()) => (await decidePreAction(sh(text), o)).outcome;

describe("gh with no credentials", () => {
  it("its read verbs are inert", () => {
    for (const c of [
      "gh auth status",
      "gh issue list -R acme/public-site",
      "gh issue view 1",
      "gh pr view 7 --json title,body,files",
      "gh pr diff 7",
      "gh pr list",
      "gh pr checks 7",
      "gh repo view acme/x",
    ]) {
      expect(inert(c), c).toBe(true);
    }
  });

  it("keeps the ordinary rule with any credential variable or an unknown environment", () => {
    for (const k of [
      "GH_TOKEN",
      "GITHUB_TOKEN",
      "GH_ENTERPRISE_TOKEN",
      "GITHUB_ENTERPRISE_TOKEN",
      "GH_HOST",
      "GH_CONFIG_DIR",
    ]) {
      expect(inert("gh issue list", env({ [k]: "x" })), k).toBe(false);
    }
    expect(inert("gh issue list", null)).toBe(false);
    expect(inert("gh issue list", { PATH: `${sysBin}:/usr/bin` })).toBe(false);
  });

  it("keeps the ordinary rule when gh's config or data directory exists", () => {
    const cfg = path.join(home, ".config", "gh");
    fs.mkdirSync(cfg, { recursive: true });
    expect(inert("gh auth status")).toBe(false);
    fs.rmSync(path.join(home, ".config"), { recursive: true, force: true });
    const xdg = path.join(root, "xdg");
    fs.mkdirSync(path.join(xdg, "gh"), { recursive: true });
    expect(inert("gh auth status", env({ XDG_CONFIG_HOME: xdg }))).toBe(false);
    expect(inert("gh auth status", env({ XDG_CONFIG_HOME: path.join(root, "none") }))).toBe(true);
    const ext = path.join(home, ".local", "share", "gh", "extensions");
    fs.mkdirSync(ext, { recursive: true });
    expect(inert("gh pr list")).toBe(false);
    fs.rmSync(path.join(home, ".local"), { recursive: true, force: true });
    expect(inert("gh pr list")).toBe(true);
  });

  it("keeps the ordinary rule for other verbs, api, writes and the browser", () => {
    for (const c of [
      "gh api /user",
      "gh issue create -t x",
      "gh pr merge 7",
      "gh repo clone acme/x",
      "gh auth login",
      "gh auth token",
      "gh issue list --web",
      "gh pr view 7 -w",
      "gh",
      "gh pr",
    ]) {
      expect(inert(c), c).toBe(false);
    }
  });

  it("keeps the ordinary rule when gh resolves inside the project, or not at all", () => {
    expect(inert("gh auth status", env({ PATH: `${path.join(repo, "bin")}:${sysBin}` }))).toBe(
      false,
    );
    expect(inert("gh auth status", env({ PATH: `:${sysBin}` }))).toBe(false);
    expect(inert("gh auth status", env({ PATH: "/nonexistent-bin" }))).toBe(false);
  });

  it("a line of inert gh and read-only commands needs no person; anything else asks", async () => {
    expect(await answer("gh issue list -R acme/public-site")).toBe("allow");
    expect(await answer("ls -la && git remote -v && (gh auth status 2>&1 | head -5 || true)")).toBe(
      "allow",
    );
    expect(
      await answer(
        "gh pr view 7 --json title,body,files 2>&1 | head -50; gh pr diff 7 2>&1 | head -300",
      ),
    ).toBe("allow");
    expect(await answer("gh api /user")).not.toBe("allow");
    expect(await answer("gh auth status > out.txt")).not.toBe("allow");
    expect(await answer("GH_TOKEN=x gh issue list")).not.toBe("allow");
    expect(await answer("gh issue list && rm -rf src")).not.toBe("allow");
    expect(await answer("gh issue list", opts({ environment: null }))).not.toBe("allow");
    expect(await answer("gh issue list", opts({ environment: env({ GH_TOKEN: "x" }) }))).not.toBe(
      "allow",
    );
    // A repository git config that runs a program keeps the git part asking.
    fs.writeFileSync(path.join(repo, ".git", "config"), "[core]\n\tfsmonitor = ./x.sh\n");
    expect(await answer("git status && gh auth status")).not.toBe("allow");
    expect(spawnSync("git", ["config", "--unset", "core.fsmonitor"], { cwd: repo }).status).toBe(0);
  });
});
