// Local git writes run contained, git fetch from a configured https remote,
// and the 2.0.3 false positives from a real session (a hard fork of a CMake
// project): each allowed form and its refused neighbors, decided end to end
// through the engine.

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
import { gitProgramsOf } from "./git-programs.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import type { PreActionEvent } from "./types.js";

let root: string;
let home: string;
const shared: string[] = [];
const GIT_ENV = () => ({
  PATH: process.env.PATH ?? "",
  HOME: home,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
});
function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    encoding: "utf8",
    env: GIT_ENV(),
  });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}
const put = (base: string, rel: string, s: string) => {
  fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
  fs.writeFileSync(path.join(base, rel), s);
};

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-git-writes-")));
  home = path.join(root, "home");
  fs.mkdirSync(home);
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  for (const d of shared) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

let n = 0;
/** A repository like the session's: CMake sources, a remote, a remote-tracking branch, a second local branch. */
function repo(): string {
  const r = path.join(root, `r${n++}`);
  put(r, "CMakeLists.txt", "find_package(OpenMP)\n");
  put(r, "include/openmc/openmp_interface.h", "#pragma once\n");
  put(r, "src/simulation.cpp", "int a;\n");
  put(r, "src/event.cpp", "int b;\n");
  git(r, "init", "-q", "-b", "develop");
  git(r, "add", "-A");
  git(r, "commit", "-q", "-m", "i");
  git(r, "branch", "other");
  git(r, "remote", "add", "origin", "https://github.com/openmc-dev/openmc.git");
  git(r, "update-ref", "refs/remotes/origin/develop", "HEAD");
  return r;
}

function opts(r: string, extra: Partial<EngineOptions> = {}): EngineOptions {
  const policy = createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
  return {
    host: "test-host",
    shellDefinitions: NO_SHELL_DEFINITIONS,
    policy,
    projectDir: r,
    home,
    hardware: () => ({ allowed: true }),
    history: {
      store: new HistoryStore({ dir: path.join(root, `h${n++}`), limits: policy.history }),
    },
    fs: nodeFsProbe(),
    environment: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home },
    containScripts: async (req) => ({ ok: true, command: req.command }),
    ...extra,
  };
}
const sh = (r: string, text: string): PreActionEvent => ({
  type: "pre-action",
  actor: { sessionId: "s", subagentId: null },
  callId: `c${n++}`,
  tool: "Bash",
  policyIds: ["bash", "exec"],
  kind: "shell",
  params: { command: text },
  cwd: r,
  command: { text, dialect: "posix" },
  approvalRoute: "person",
  hostMode: "default",
});
const decide = (r: string, text: string, o: EngineOptions = opts(r)) =>
  decidePreAction(sh(r, text), o);
const hook = (r: string, name: string, dir = ".git/hooks") => {
  put(r, `${dir}/${name}`, "#!/bin/sh\ntouch /tmp/hook-ran\n");
  fs.chmodSync(path.join(r, dir, name), 0o755);
};

describe("local git writes run contained", () => {
  it("the session's lines and the other reversible forms", async () => {
    const r = repo();
    for (const text of [
      'git switch -c remove-openmp && grep -n -i "fetchcontent\\|find_package" CMakeLists.txt | head',
      "git rm -q include/openmc/openmp_interface.h && git status --short | head -60",
      "git checkout -b fork-1",
      "git switch other",
      "git checkout other",
      "git switch -c x --no-track origin/develop",
      "git switch -c y other",
      "git switch -d HEAD~0",
      "git branch fork-2",
      "git branch fork-3 develop",
      "git mv src/event.cpp src/events.cpp",
      "git restore --staged src/event.cpp",
    ]) {
      const d = await decide(r, text);
      expect(d.outcome, `${text}: ${d.reason}`).toBe("allow");
      expect(d.codes, text).toContain("contained-execution");
    }
    // A commit (stash makes them too) is the person's approval point: it asks.
    for (const text of [
      "git stash",
      "git stash push -m wip",
      "git add src && git commit -m 'drop openmp'",
    ]) {
      expect((await decide(r, text)).outcome, text).toBe("ask");
    }
  });

  it("a hook the command may run, core.hooksPath, or a program in the configuration asks", async () => {
    const pc = repo();
    hook(pc, "post-checkout");
    expect((await decide(pc, "git switch -c a")).outcome).toBe("ask");
    expect((await decide(pc, "git checkout other")).reason).toMatch(/hook post-checkout/);
    const rt = repo();
    hook(rt, "reference-transaction");
    expect((await decide(rt, "git branch b")).outcome).toBe("ask");
    const pic = repo();
    hook(pic, "post-index-change");
    expect((await decide(pic, "git rm -q src/event.cpp")).outcome).toBe("ask");
    expect((await decide(pic, "git add src")).outcome).toBe("ask");
    // A hook only push runs does not stop a local switch; it still stops a commit.
    const pp = repo();
    hook(pp, "pre-push");
    expect((await decide(pp, "git switch -c c")).outcome).toBe("allow");
    hook(pp, "pre-commit");
    expect((await decide(pp, "git commit -am x")).outcome).toBe("ask");
    expect((await decide(pp, "git switch -c d")).outcome).toBe("allow");
    const hp = repo();
    git(hp, "config", "core.hooksPath", ".githooks");
    expect((await decide(hp, "git switch -c e")).reason).toMatch(/core\.hookspath/);
    const fm = repo();
    git(fm, "config", "core.fsmonitor", "./watch.sh");
    expect((await decide(fm, "git switch other")).outcome).toBe("ask");
    const fl = repo();
    git(fl, "config", "filter.x.smudge", "./smudge.sh");
    expect((await decide(fl, "git switch other")).outcome).toBe("ask");
  });

  it("forms that lose data, write configuration or name files to overwrite ask", async () => {
    const r = repo();
    put(r, ".envrc", "export X=1\n");
    git(r, "add", ".envrc");
    git(r, "commit", "-q", "-m", "envrc");
    for (const text of [
      "git switch -C develop",
      "git switch --force other",
      "git switch --discard-changes other",
      "git switch -m other",
      "git switch --orphan o",
      "git switch nosuch",
      "git switch -c t origin/develop",
      "git switch -c t -t origin/develop",
      "git checkout -B other",
      "git checkout -f other",
      "git checkout src/event.cpp",
      "git checkout -- src/event.cpp",
      "git checkout other -- src/event.cpp",
      "git branch -D other",
      "git branch -m other renamed",
      "git branch -f other HEAD",
      "git branch --set-upstream-to=origin/develop",
      "git branch t origin/develop",
      "git rm -f src/event.cpp",
      "git rm --cached src/event.cpp",
      "git rm -r .git/hooks",
      "git rm .envrc",
      "git rm '*.cpp'",
      "git rm ../outside.txt",
      "git mv -f src/event.cpp src/simulation.cpp",
      "git mv src/event.cpp .envrc2/../.envrc",
      "git mv src/event.cpp .mcp.json",
      "git mv .envrc envrc",
      "git restore src/event.cpp",
      "git restore --worktree --staged src/event.cpp",
      "git restore --source=HEAD~1 --staged src/event.cpp",
      "git stash pop",
      "git stash drop",
      "git stash -a",
      "git stash push -a",
      "git reset --hard",
      "git clean -fd",
      "git push",
      "git remote add evil https://evil.example/x",
      "git config core.fsmonitor ./w.sh",
    ]) {
      const d = await decide(r, text);
      expect(d.outcome, `${text}: ${d.reason}`).not.toBe("allow");
    }
  });

  it("a submodule's configuration and hooks count as the repository's (measured: a switch, add, status and diff run them)", async () => {
    const sub = path.join(root, `sub${n++}`);
    put(sub, "a", "a\n");
    git(sub, "init", "-q", "-b", "main");
    git(sub, "add", "-A");
    git(sub, "commit", "-q", "-m", "s");
    const r = repo();
    git(r, "-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "vendor/sub");
    git(r, "commit", "-q", "-m", "sm");
    // A plain submodule (core.worktree, remote, branch): the superproject's writes still run contained.
    expect((await decide(r, "git switch -c with-sub")).outcome).toBe("allow");
    expect((await decide(r, "git status --short")).outcome).toBe("allow");
    // A submodule path itself is not removed or moved this way.
    expect((await decide(r, "git rm -r vendor/sub")).outcome).toBe("ask");
    // A program in the submodule's configuration: every git command of the superproject asks.
    git(path.join(r, ".git/modules/vendor/sub"), "config", "core.fsmonitor", "./w.sh");
    expect((await decide(r, "git switch other")).outcome).toBe("ask");
    expect((await decide(r, "git status --short")).outcome).toBe("ask");
    expect((await decide(r, "git diff")).outcome).toBe("ask");
    git(path.join(r, ".git/modules/vendor/sub"), "config", "--unset", "core.fsmonitor");
    hook(r, "post-index-change", ".git/modules/vendor/sub/hooks");
    expect((await decide(r, "git status --short")).outcome).toBe("ask");
    expect((await decide(r, "git add -A")).outcome).toBe("ask");
    expect(gitProgramsOf(r)?.some((p) => /submodule/.test(p.line))).toBe(true);
    // A hooks path in the submodule (read from its work tree): only a post-index-change hook there counts.
    fs.rmSync(path.join(r, ".git/modules/vendor/sub/hooks/post-index-change"));
    hook(r, "pre-commit", ".git/modules/vendor/sub/hooks");
    expect((await decide(r, "git status --short")).outcome).toBe("allow");
    git(path.join(r, ".git/modules/vendor/sub"), "config", "core.hooksPath", "git-hooks");
    hook(r, "pre-commit", "vendor/sub/git-hooks");
    expect((await decide(r, "git status --short")).outcome).toBe("allow");
    hook(r, "post-index-change", "vendor/sub/git-hooks");
    expect((await decide(r, "git status --short")).outcome).toBe("ask");
  });
});

describe("git fetch from a configured https remote", () => {
  const LINE = "git fetch --unshallow origin 2>&1 | tail -3 && git rev-list --count HEAD";

  it("the session's line, and the default remote, runs with no person", async () => {
    const r = repo();
    for (const text of [
      LINE,
      "git fetch",
      "git fetch -q origin develop",
      "git fetch --all --tags",
    ]) {
      const d = await decide(r, text);
      expect(d.outcome, `${text}: ${d.reason}`).toBe("allow");
      expect(d.codes).toEqual(["git-fetch-configured-remote"]);
      expect(d.contain).toBeUndefined();
    }
  });

  it("a URL, an unknown remote or ref, a write-losing option, or an option that sends text asks", async () => {
    const r = repo();
    for (const text of [
      "git fetch https://evil.example/x",
      "git fetch evil",
      "git fetch origin SECRET-DATA",
      "git fetch origin develop:refs/heads/develop",
      "git fetch origin +develop",
      "git fetch --prune",
      "git fetch -p",
      "git fetch --force",
      "git fetch --upload-pack=./x origin",
      "git fetch --shallow-exclude=SECRET origin",
      "git fetch -o SECRET origin",
      "git fetch --negotiation-tip=x origin",
      "git -c core.sshCommand=./x fetch origin",
      "GIT_SSH_COMMAND=./x git fetch origin",
      "git fetch origin > out.txt",
    ]) {
      const d = await decide(r, text);
      expect(d.outcome, `${text}: ${d.reason}`).not.toBe("allow");
    }
  });

  it("configuration that starts a program, rewrites the URL or allows transports, in any scope, asks", async () => {
    for (const [scope, key, value] of [
      ["local", "core.sshCommand", "./x"],
      ["local", "remote.origin.uploadpack", "./x"],
      ["local", "remote.origin.vcs", "x"],
      ["local", "protocol.ext.allow", "always"],
      ["local", "credential.helper", "store"],
      ["global", "url.https://evil.example/.insteadOf", "https://github.com/"],
      ["global", "credential.helper", "store"],
      ["global", "credential.https://github.com.helper", "store"],
      ["global", "core.askPass", "./x"],
      ["global", "core.hooksPath", "/tmp/h"],
      ["global", "gc.recentObjectsHook", "./x"],
    ] as const) {
      const r = repo();
      const h = path.join(root, `gh${n++}`);
      fs.mkdirSync(h);
      if (scope === "local") {
        git(r, "config", key, value);
      } else {
        spawnSync("git", ["config", "--global", key, value], { env: { ...GIT_ENV(), HOME: h } });
      }
      const o = opts(r, { environment: { PATH: process.env.PATH ?? "", HOME: h } });
      const d = await decide(r, LINE, o);
      expect(d.outcome, `${scope} ${key}: ${d.reason}`).not.toBe("allow");
    }
  });

  it("a non-https remote, a hook, an unknown environment, GIT_* in it, or a host off the allowlist asks", async () => {
    const http = repo();
    git(http, "remote", "set-url", "origin", "http://github.com/openmc-dev/openmc.git");
    expect((await decide(http, LINE)).outcome).toBe("ask");
    const ssh = repo();
    git(ssh, "remote", "set-url", "origin", "git@github.com:openmc-dev/openmc.git");
    expect((await decide(ssh, LINE)).outcome).toBe("ask");
    const cred = repo();
    git(cred, "remote", "set-url", "origin", "https://u:p@github.com/openmc-dev/openmc.git");
    expect((await decide(cred, LINE)).outcome).toBe("ask");
    const rt = repo();
    hook(rt, "reference-transaction");
    expect((await decide(rt, LINE)).outcome).toBe("ask");
    const r = repo();
    expect((await decide(r, LINE, opts(r, { environment: null }))).outcome).toBe("ask");
    for (const v of ["GIT_SSH_COMMAND", "GIT_CONFIG_GLOBAL", "GIT_ASKPASS", "GIT_CONFIG_COUNT"]) {
      const o = opts(r, { environment: { PATH: process.env.PATH ?? "", HOME: home, [v]: "x" } });
      expect((await decide(r, LINE, o)).outcome, v).toBe("ask");
    }
    const strict = createPolicy({
      enforceAllowlists: true,
      allowedHosts: ["example.org"],
      allowedTools: ["bash", "exec", "Bash"],
      maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    });
    expect((await decide(r, LINE, opts(r, { policy: strict }))).outcome).not.toBe("allow");
    const listed = createPolicy({
      enforceAllowlists: true,
      allowedHosts: ["github.com"],
      allowedTools: ["bash", "exec", "Bash"],
      maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    });
    const li = await decide(r, LINE, opts(r, { policy: listed }));
    expect(li.outcome, li.reason).toBe("allow");
  });
});

describe("redirections and tee are decided as the equivalent Write", () => {
  it("a new file is recorded, an existing one snapshotted (> and >>); .git, an exec-config file or a link outside asks", async () => {
    const r = repo();
    const o = opts(r);
    const store = o.history.store;
    for (const text of [
      "grep -rn x src > notes.txt",
      "grep -n find CMakeLists.txt >> src/event.cpp",
      "grep -n x src/event.cpp > src/simulation.cpp",
      "grep -rn x src 2>/dev/null | tee found.txt",
      "grep -rn x src | tee -a found.txt",
    ]) {
      const d = await decide(r, text, o);
      expect(d.outcome, `${text}: ${d.reason}`).toBe("allow");
      expect(d.codes, text).toContain("redirect-write");
    }
    const recorded = (await store.list()).map((e) => path.relative(r, e.realPath));
    expect(recorded).toEqual(
      expect.arrayContaining(["notes.txt", "src/event.cpp", "src/simulation.cpp", "found.txt"]),
    );
    const prior = (await store.list(path.join(r, "src/event.cpp")))[0];
    expect(prior?.hash).not.toBeNull(); // the existing file's content was kept
    fs.symlinkSync(path.join(root, "outside.txt"), path.join(r, "link.txt"));
    for (const text of [
      "echo x > .git/hooks/post-commit",
      "echo x > .mcp.json",
      "grep x src/event.cpp > link.txt",
      "echo x | tee .git/config",
      "echo x | tee .mcp.json",
      "ls | tee -",
      "echo x | tee -i out.txt",
    ]) {
      const d = await decide(r, text, o);
      expect(d.outcome, `${text}: ${d.reason}`).not.toBe("allow");
    }
  });
});

describe("the line's own variables, as arguments of read-only commands", () => {
  it("a literal list split into arguments is read-only; behavior-changing names, the command word, a redirect target and a glob ask", async () => {
    const r = repo();
    const ok = await decide(
      r,
      'F="src/simulation.cpp src/event.cpp" && grep -n -i "openmp\\|omp_" $F | head -20',
    );
    expect(ok.outcome, ok.reason).toBe("allow");
    expect(ok.codes).toEqual(["read-only-command"]);
    for (const text of [
      "PATH=/tmp && ls",
      "GIT_DIR=/tmp/x && git status",
      "GH_TOKEN=x && gh api user",
      "LD_PRELOAD=/tmp/x.so && ls",
      "PAGER=./x && git log",
      "EDITOR=./x && ls",
      "IFS=/ && ls",
      "BASH_ENV=./x && ls",
      "PS4='$(./x)' && ls",
      "PROMPT_COMMAND=./x && ls",
      "FOO_COMMAND=./x && ls",
      "MY_PROGRAM=./x && ls",
      "NODE_OPTIONS=--require=./x && ls",
      "PYTHONPATH=. && ls",
      "path=/tmp && ls",
      "F=src/event.cpp grep x $F",
      'F="ls -la" && $F',
      "F=src && ${F}/x",
      "F=notes.txt && grep x src/event.cpp > $F",
      'F="src/*.cpp" && grep x $F',
    ]) {
      const d = await decide(r, text);
      expect(d.outcome, `${text}: ${d.reason}`).not.toBe("allow");
    }
  });
});

describe("the host application's own read-only CLI forms (hostReadOnlyCommands)", () => {
  it("an exact argument vector is read-only; anything more, or without the option, asks", async () => {
    const r = repo();
    // A directory the agent cannot write (not the project, not a temporary directory).
    const bin = fs.mkdtempSync(path.join(import.meta.dirname, ".git-writes-bin-"));
    shared.push(bin);
    // What the tool does for other arguments is not read-only (a deletion outside the project).
    put(bin, "mytool", '#!/bin/sh\nrm -f "$HOME/state"\n');
    fs.chmodSync(path.join(bin, "mytool"), 0o755);
    const env = { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: home };
    const o = opts(r, {
      environment: env,
      hostReadOnlyCommands: [
        ["mytool", "files"],
        ["mytool", "files", "--json"],
        ["mytool", "--version"],
      ],
      // Without containment, so a form that is not read-only asks rather than running contained.
      containScripts: null,
    });
    for (const text of [
      "mytool files",
      "mytool files --json | head",
      "cd src && mytool --version",
    ]) {
      const d = await decide(r, text, o);
      expect(d.outcome, `${text}: ${d.reason}`).toBe("allow");
    }
    for (const text of ["mytool files --fix", "mytool file", "mytool", "X=1 mytool files"]) {
      {
        const d = await decide(r, text, o);
        expect(d.outcome, `${text}: ${d.reason}`).not.toBe("allow");
      }
    }
    expect(
      (await decide(r, "mytool files", opts(r, { environment: env, containScripts: null })))
        .outcome,
    ).toBe("ask");
    // A program of that name the agent could have planted (in the project) is not the host's.
    put(r, "bin/mytool", "#!/bin/sh\necho planted\n");
    fs.chmodSync(path.join(r, "bin/mytool"), 0o755);
    const planted = opts(r, {
      environment: { PATH: `${path.join(r, "bin")}:${env.PATH}`, HOME: home },
      hostReadOnlyCommands: [["mytool", "files"]],
      containScripts: null,
    });
    expect((await decide(r, "mytool files", planted)).outcome).toBe("ask");
  });
});

describe("a line that is not read-only names the segment that made it so", () => {
  it("reports the simple command, as the shell runs it", async () => {
    const r = repo();
    const d = await decide(r, "ls src && git push origin develop && echo done");
    expect(d.outcome).toBe("ask");
    expect(d.segment).toBe("git push origin develop");
    expect(d.reason).toMatch(/Because of .*git push origin develop/);
  });
});
