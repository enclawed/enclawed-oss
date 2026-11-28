// A commit is the person's approval point: no git command that makes a
// commit (commit, amend, revert, stash) runs contained, and a contained run
// sees git's history (HEAD, refs, logs) read-only unless the line's own git
// commands write refs. An index change that would lose a staged change no
// commit and no working file holds (git add, git restore --staged) asks too.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { containmentSupport } from "../containment/host.js";
import { fakeHome } from "../containment/test-helpers.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { scriptContainer } from "./contained-launch.js";
import { decidePreAction } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { stagedOnlyRefusal } from "./git-writes.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import type { ContainedCode } from "./types.js";

const live = containmentSupport().ok;
let root: string;
let n = 0;

const GIT_ENV = { PATH: "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
function git(cwd: string, ...args: string[]) {
  return spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...GIT_ENV, HOME: cwd },
  });
}

/** A project repository with a.txt committed and an identity in .git/config (git commit would succeed). */
function project(): { proj: string; home: string; state: string } {
  const base = path.join(root, `p${n++}`);
  const proj = path.join(base, "proj");
  fs.mkdirSync(proj, { recursive: true });
  const home = fakeHome(base);
  git(proj, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(proj, "a.txt"), "v1\n");
  git(proj, "add", "a.txt");
  git(proj, "commit", "-q", "-m", "initial");
  git(proj, "config", "user.email", "t@example.invalid");
  git(proj, "config", "user.name", "t");
  return { proj, home, state: path.join(base, "state") };
}

async function decide(p: { proj: string; home: string; state: string }, line: string) {
  const policy = createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
  return decidePreAction(
    {
      type: "pre-action",
      actor: { sessionId: "s", subagentId: null },
      callId: "c1",
      tool: "Bash",
      policyIds: ["bash", "exec"],
      kind: "shell",
      params: { command: line },
      cwd: p.proj,
      command: { text: line, dialect: "posix" },
      approvalRoute: "no-person",
    },
    {
      host: "test-host",
      shellDefinitions: NO_SHELL_DEFINITIONS,
      policy,
      projectDir: p.proj,
      home: p.home,
      environment: { PATH: "/usr/bin:/bin", HOME: p.home, GIT_CONFIG_NOSYSTEM: "1" },
      hardware: () => ({ allowed: true }),
      history: {
        store: new HistoryStore({ dir: path.join(p.state, "h"), limits: policy.history }),
      },
      fs: nodeFsProbe(),
      containScripts: async (req: { command: string }) => ({ ok: true, command: req.command }),
    } as never,
  );
}

/** Run a line contained, as the engine's verdict would. */
async function runContained(p: { proj: string; state: string }, line: string, code: ContainedCode) {
  const sc = scriptContainer({ stateDir: p.state });
  try {
    const r = await sc.contain({
      kind: "project-script",
      label: line,
      command: line,
      dialect: "posix",
      cwd: p.proj,
      projectDir: p.proj,
      code,
    });
    if (!r.ok) {
      return { status: -1, out: `${r.code}: ${r.message}` };
    }
    const s = spawnSync("/bin/sh", ["-c", r.command], { encoding: "utf8", timeout: 60_000 });
    return { status: s.status, out: `${s.stdout}\n${s.stderr}` };
  } finally {
    await sc.close();
  }
}

const commits = (proj: string) => git(proj, "rev-list", "--all", "--count").stdout.trim();

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "git-commit-approval-")));
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("a commit is the person's approval point", () => {
  it("no form of git commit, revert or stash runs contained (identity configured, so each would succeed)", async () => {
    const p = project();
    git(p.proj, "branch", "other");
    fs.writeFileSync(path.join(p.proj, "a.txt"), "v2\n");
    for (const line of [
      "git commit -qam msg",
      "git commit -q --amend -m rewritten",
      "git add a.txt && git commit -m x",
      "git commit --allow-empty -m x",
      "git revert --no-edit HEAD",
      "git stash",
      "git stash push -m wip",
      "git stash save",
      "git merge other",
      "git cherry-pick other",
      "git rebase other",
      "git am x.patch",
      "git pull",
      "git notes add -m x",
      "git tag -a v1 -m x",
      "git commit-tree HEAD^{tree} -m x",
      "git update-ref refs/heads/main HEAD",
    ]) {
      const d = await decide(p, line);
      expect(d.outcome, `${line}: ${d.codes.join(",")}`).not.toBe("allow");
    }
    expect(commits(p.proj)).toBe("1");
  });

  it.runIf(live)(
    "contained, git's history is read-only: git add and status work, a commit by a program the line runs fails (live)",
    async () => {
      const p = project();
      fs.writeFileSync(path.join(p.proj, "a.txt"), "v2\n");
      const add = "git add a.txt && git status --short";
      const d = await decide(p, add);
      expect(d.outcome, d.reason).toBe("allow");
      expect(d.codes).toContain("contained-execution");
      const code = d.contain?.code as ContainedCode;
      expect(code.gitRefsWritable).toBeUndefined();
      const r = await runContained(p, add, code);
      expect(r.status, r.out).toBe(0);
      expect(git(p.proj, "diff", "--cached", "--name-only").stdout.trim()).toBe("a.txt");
      // A commit the decision cannot see (the line's code makes it): the bound history refuses it.
      const head = fs.readFileSync(path.join(p.proj, ".git", "refs", "heads", "main"), "utf8");
      const c = await runContained(p, "git commit -qm sneaky", code);
      expect(c.status, c.out).not.toBe(0);
      expect(commits(p.proj)).toBe("1");
      expect(fs.readFileSync(path.join(p.proj, ".git", "refs", "heads", "main"), "utf8")).toBe(
        head,
      );
    },
  );

  it.runIf(live)(
    "a line that switches branches keeps refs writable, and the switch works (live)",
    async () => {
      const p = project();
      const line = "git switch -c feature";
      const d = await decide(p, line);
      expect(d.outcome, d.reason).toBe("allow");
      const code = d.contain?.code as ContainedCode;
      expect(code.gitRefsWritable).toBe(true);
      const r = await runContained(p, line, code);
      expect(r.status, r.out).toBe(0);
      expect(git(p.proj, "branch", "--show-current").stdout.trim()).toBe("feature");
    },
  );
});

describe("an index change that would lose a staged change no commit holds asks", () => {
  it("git add over a staged-only blob asks; over a staged blob the working file holds, or a clean index, it runs contained", async () => {
    const p = project();
    fs.writeFileSync(path.join(p.proj, "a.txt"), "v2 staged only\n");
    git(p.proj, "add", "a.txt");
    fs.writeFileSync(path.join(p.proj, "a.txt"), "v3\n");
    for (const line of ["git add a.txt", "git add .", "git add -A", "git add -u"]) {
      const d = await decide(p, line);
      expect(d.outcome, line).not.toBe("allow");
      expect(d.reason, line).toMatch(/staged content/);
    }
    expect(stagedOnlyRefusal(p.proj, ["a.txt"], null)).toMatch(/a\.txt/);
    // The working file holds what is staged: nothing is lost.
    fs.writeFileSync(path.join(p.proj, "a.txt"), "v2 staged only\n");
    expect(stagedOnlyRefusal(p.proj, ["a.txt"], null)).toBeNull();
    expect((await decide(p, "git add a.txt")).codes).toContain("contained-execution");
    // ... unless the line rewrites the file first.
    expect((await decide(p, "echo v4 > a.txt && git add a.txt")).outcome).not.toBe("allow");
    const q = project();
    fs.writeFileSync(path.join(q.proj, "a.txt"), "v2\n");
    expect((await decide(q, "git add a.txt")).codes).toContain("contained-execution");
  });

  it("git restore --staged over a staged-only blob asks; over one the working file holds it runs contained", async () => {
    const p = project();
    fs.writeFileSync(path.join(p.proj, "a.txt"), "v2 staged only\n");
    git(p.proj, "add", "a.txt");
    fs.writeFileSync(path.join(p.proj, "a.txt"), "v3\n");
    const d = await decide(p, "git restore --staged a.txt");
    expect(d.outcome).not.toBe("allow");
    expect(d.reason).toMatch(/staged content/);
    fs.writeFileSync(path.join(p.proj, "a.txt"), "v2 staged only\n");
    expect((await decide(p, "git restore --staged a.txt")).codes).toContain("contained-execution");
  });

  it("a staged file the working tree no longer has, and a conflicted entry, count as lost", () => {
    const p = project();
    fs.writeFileSync(path.join(p.proj, "b.txt"), "new\n");
    git(p.proj, "add", "b.txt");
    fs.rmSync(path.join(p.proj, "b.txt"));
    expect(stagedOnlyRefusal(p.proj, [], null)).toMatch(/b\.txt/);
  });
});
