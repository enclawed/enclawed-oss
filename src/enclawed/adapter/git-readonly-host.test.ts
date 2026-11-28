// A read-only git line runs on the host as the person: nothing git reads
// (the repository's configuration and hooks, the person's global and system
// configuration, the session's GIT_* variables) may make it start a program
// the line does not name. Each route is planted for real and, where git runs
// it, run live with a harmless marker under a throwaway HOME.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { decidePreAction } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { gitCommandStarts, gitProgramsOf, indexGitlinks } from "./git-programs.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import { strictShellClassifier } from "./shell-readonly.js";

let root: string;
let home: string;

/** The session's environment for the host run and the decision: a throwaway HOME, no system config. */
function sessionEnv(extra: Record<string, string> = {}): Record<string, string> {
  return { PATH: "/usr/bin:/bin", HOME: home, GIT_CONFIG_NOSYSTEM: "1", ...extra };
}

function git(cwd: string, ...args: string[]) {
  const r = spawnSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.invalid",
      "-c",
      "init.defaultBranch=main",
      ...args,
    ],
    { cwd, encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: cwd, GIT_CONFIG_NOSYSTEM: "1" } },
  );
  expect(r.status, r.stderr).toBe(0);
}

function put(file: string, content: string, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode });
}

/** A project holding a repository with a commit; `name` is its directory. */
function project(name: string): string {
  const proj = path.join(root, name);
  fs.mkdirSync(proj, { recursive: true });
  git(proj, "init", "-q");
  put(path.join(proj, "a.txt"), "a\n");
  git(proj, "add", "a.txt");
  git(proj, "commit", "-q", "-m", "one");
  return proj;
}

/** A work-tree file newer than the index: git refreshes and rewrites the index on a read. */
function stale(file: string) {
  const t = new Date(Date.now() + 60_000);
  fs.utimesSync(file, t, t);
}

function hookScript(marker: string): string {
  return `#!/bin/sh\necho ran > '${marker}'\n`;
}

async function decide(proj: string, line: string, environment = sessionEnv()) {
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
      cwd: proj,
      command: { text: line, dialect: "posix" },
      approvalRoute: "no-person",
    },
    {
      host: "test-host",
      shellDefinitions: NO_SHELL_DEFINITIONS,
      policy,
      projectDir: proj,
      home,
      environment,
      hardware: () => ({ allowed: true }),
      history: {
        store: new HistoryStore({
          dir: path.join(root, `h-${path.basename(proj)}`),
          limits: policy.history,
        }),
      },
      fs: nodeFsProbe(),
      containScripts: async (req: { command: string }) => ({ ok: true, command: req.command }),
    } as never,
  );
}

/** Run the line on the host as the engine's read-only verdict would (the session's environment). */
function hostRun(proj: string, line: string, environment = sessionEnv()) {
  return spawnSync("/bin/sh", ["-c", line], { cwd: proj, env: environment, encoding: "utf8" });
}

const readOnly = (d: { outcome: string; codes: readonly string[] }) =>
  d.outcome === "allow" && d.codes.includes("read-only-command");

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "git-ro-host-")));
  home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("read-only git on the host: hooks", () => {
  it("repro: a bare-style repository with core.worktree and post-index-change, `git -C fake diff` on a stale index", async () => {
    const proj = project("repro");
    const fake = path.join(proj, "fake");
    const sub = path.join(proj, "sub");
    const marker = path.join(proj, "hook-ran");
    put(path.join(sub, "a.txt"), "a\n");
    git(proj, "init", "-q", "--bare", fake);
    fs.appendFileSync(path.join(fake, "config"), "[core]\n\tbare = false\n\tworktree = ../sub\n");
    git(proj, "--git-dir", fake, "--work-tree", sub, "add", "a.txt");
    git(proj, "--git-dir", fake, "--work-tree", sub, "commit", "-qm", "x");
    put(path.join(fake, "hooks", "post-index-change"), hookScript(marker), 0o755);
    stale(path.join(sub, "a.txt"));
    const line = "git -C fake diff";
    const d = await decide(proj, line);
    expect(readOnly(d)).toBe(false);
    expect(d.outcome).not.toBe("allow");
    // The route is real: run anyway, git fires the hook.
    hostRun(proj, line);
    expect(fs.existsSync(marker)).toBe(true);
  });

  it("post-index-change in .git/hooks: every read-only command counts, not only status (diff fires it live)", async () => {
    const proj = project("pic");
    const marker = path.join(root, "pic-ran");
    put(path.join(proj, ".git", "hooks", "post-index-change"), hookScript(marker), 0o755);
    for (const line of [
      "git diff",
      "git blame a.txt",
      "git grep a",
      "git ls-files",
      "git log -1",
      "git show HEAD",
      "git rev-parse HEAD",
      "git status",
    ]) {
      const d = await decide(proj, line);
      expect(readOnly(d), line).toBe(false);
    }
    stale(path.join(proj, "a.txt"));
    hostRun(proj, "git diff");
    expect(fs.existsSync(marker)).toBe(true);
  });

  it("any hook git may run for a read-only command counts (reference-transaction, an unknown name); write-only hooks do not", async () => {
    const proj = project("hooknames");
    put(path.join(proj, ".git", "hooks", "reference-transaction"), "#!/bin/sh\n", 0o755);
    expect(readOnly(await decide(proj, "git status"))).toBe(false);
    fs.rmSync(path.join(proj, ".git", "hooks", "reference-transaction"));
    put(path.join(proj, ".git", "hooks", "some-future-hook"), "#!/bin/sh\n", 0o755);
    expect(readOnly(await decide(proj, "git log -1"))).toBe(false);
    fs.rmSync(path.join(proj, ".git", "hooks", "some-future-hook"));
    put(path.join(proj, ".git", "hooks", "pre-commit"), "#!/bin/sh\n", 0o755);
    put(path.join(proj, ".git", "hooks", "post-checkout"), "#!/bin/sh\n", 0o755);
    expect(readOnly(await decide(proj, "git status"))).toBe(true);
  });

  it("core.hooksPath in the repository's config: its directory is read (a husky-like directory of commit hooks stays read-only)", async () => {
    const proj = project("hookspath");
    git(proj, "config", "core.hooksPath", ".hooks");
    put(path.join(proj, ".hooks", "pre-commit"), "#!/bin/sh\n", 0o755);
    expect(readOnly(await decide(proj, "git status"))).toBe(true);
    const marker = path.join(root, "hookspath-ran");
    put(path.join(proj, ".hooks", "post-index-change"), hookScript(marker), 0o755);
    expect(readOnly(await decide(proj, "git diff"))).toBe(false);
    expect(readOnly(await decide(proj, "git log -1"))).toBe(false);
    stale(path.join(proj, "a.txt"));
    hostRun(proj, "git diff");
    expect(fs.existsSync(marker)).toBe(true);
  });

  it("a configured hook (hook.<name>.command) counts", () => {
    const proj = project("cfghook");
    git(proj, "config", "hook.x.command", "touch ran");
    git(proj, "config", "hook.x.event", "post-index-change");
    const programs = gitProgramsOf(proj, { env: sessionEnv() }) ?? [];
    expect(gitCommandStarts({ sub: "diff", args: [] }, programs)?.kind).toBe("hook");
  });
});

describe("read-only git on the host: the person's global and system configuration", () => {
  const gitconfig = () => path.join(home, ".gitconfig");
  afterAll(() => fs.rmSync(gitconfig(), { force: true }));

  it("a global core.fsmonitor program: status asks (and fires it live); log stays read-only", async () => {
    const proj = project("gfsm");
    const marker = path.join(root, "gfsm-ran");
    put(path.join(root, "fsm.sh"), `#!/bin/sh\necho ran > '${marker}'\nexit 1\n`, 0o755);
    put(gitconfig(), `[core]\n\tfsmonitor = ${path.join(root, "fsm.sh")}\n`);
    expect(readOnly(await decide(proj, "git status"))).toBe(false);
    expect(readOnly(await decide(proj, "git ls-files"))).toBe(false);
    expect(readOnly(await decide(proj, "git log -1 --oneline"))).toBe(true);
    hostRun(proj, "git status");
    expect(fs.existsSync(marker)).toBe(true);
    fs.rmSync(gitconfig());
  });

  it("a global core.hooksPath (~/hooks) with post-index-change: every command asks; the hook fires live", async () => {
    const proj = project("ghooks");
    const marker = path.join(root, "ghooks-ran");
    put(path.join(home, "hooks", "post-index-change"), hookScript(marker), 0o755);
    put(gitconfig(), "[core]\n\thooksPath = ~/hooks\n");
    expect(readOnly(await decide(proj, "git log -1"))).toBe(false);
    expect(readOnly(await decide(proj, "git diff"))).toBe(false);
    stale(path.join(proj, "a.txt"));
    hostRun(proj, "git diff");
    expect(fs.existsSync(marker)).toBe(true);
    fs.rmSync(gitconfig());
    fs.rmSync(path.join(home, "hooks"), { recursive: true });
  });

  it("global diff.external, core.pager, textconv; XDG and GIT_CONFIG_GLOBAL places; an includeIf that matches this repository", async () => {
    const proj = project("gdiff");
    put(gitconfig(), "[diff]\n\texternal = /bin/true\n");
    expect(readOnly(await decide(proj, "git diff"))).toBe(false);
    expect(readOnly(await decide(proj, "git diff --no-ext-diff"))).toBe(true);
    put(gitconfig(), "[core]\n\tpager = less\n");
    expect(readOnly(await decide(proj, "git log -1"))).toBe(false);
    expect(readOnly(await decide(proj, "git --no-pager log -1"))).toBe(true);
    fs.rmSync(gitconfig());
    const xdg = path.join(root, "xdg");
    put(path.join(xdg, "git", "config"), "[diff]\n\texternal = /bin/true\n");
    expect(readOnly(await decide(proj, "git diff", sessionEnv({ XDG_CONFIG_HOME: xdg })))).toBe(
      false,
    );
    const g = path.join(root, "session.gitconfig");
    put(g, "[diff]\n\texternal = /bin/true\n");
    expect(readOnly(await decide(proj, "git diff", sessionEnv({ GIT_CONFIG_GLOBAL: g })))).toBe(
      false,
    );
    // An include the listing follows: only for repositories its condition names.
    const inc = path.join(root, "work.inc");
    put(inc, "[diff]\n\texternal = /bin/true\n");
    put(g, `[includeIf "gitdir:${proj}/"]\n\tpath = ${inc}\n`);
    expect(readOnly(await decide(proj, "git diff", sessionEnv({ GIT_CONFIG_GLOBAL: g })))).toBe(
      false,
    );
    const other = project("gdiff-other");
    expect(readOnly(await decide(other, "git diff", sessionEnv({ GIT_CONFIG_GLOBAL: g })))).toBe(
      true,
    );
    // The system configuration, when the session reads it.
    const sys = path.join(root, "system.gitconfig");
    put(sys, "[diff]\n\texternal = /bin/true\n");
    const sysEnv = { PATH: "/usr/bin:/bin", HOME: home, GIT_CONFIG_SYSTEM: sys };
    expect(readOnly(await decide(other, "git diff", sysEnv))).toBe(false);
  });

  it("an ordinary global configuration (identity, credential helpers, ssh signing, safe.directory) keeps read-only git read-only", async () => {
    const proj = project("ginert");
    put(
      gitconfig(),
      [
        "[user]\n\tname = t\n\temail = t@example.invalid\n\tsigningkey = ~/.ssh/id.pub",
        "[init]\n\tdefaultBranch = main",
        '[credential "https://github.com"]\n\thelper =\n\thelper = !/usr/bin/gh auth git-credential',
        '[gpg "ssh"]\n\tallowedSignersFile = ~/.ssh/allowed',
        "[gpg]\n\tformat = ssh",
        "[commit]\n\tgpgsign = true",
        "[safe]\n\tdirectory = /tmp/x",
        "[pull]\n\trebase = true",
        "[core]\n\teditor = vim\n\tautocrlf = input",
        "",
      ].join("\n"),
    );
    for (const line of [
      "git status",
      "git diff",
      "git log -1 --oneline",
      "git show HEAD",
      "git blame a.txt",
    ]) {
      expect(readOnly(await decide(proj, line)), line).toBe(true);
    }
    fs.rmSync(gitconfig());
  });

  it("signatures: gpg.program in the global config asks for log; --show-signature and %G placeholders are not read-only", async () => {
    const proj = project("gsig");
    put(gitconfig(), "[gpg]\n\tprogram = /bin/true\n");
    expect(readOnly(await decide(proj, "git log -1"))).toBe(false);
    fs.rmSync(gitconfig());
    for (const line of [
      "git log --show-signature -1",
      "git show --show-signature HEAD",
      "git log --format=%G? -1",
      "git log --pretty=format:%GS -1",
      "git log --format '%h %G?'",
      "git rev-list --format=%GK HEAD",
      "git rev-list --show-signature HEAD",
      "git shortlog --format=%G? HEAD",
    ]) {
      expect(
        strictShellClassifier.classify(line, "posix", { cwd: proj, home }).readOnly,
        line,
      ).toBe(false);
    }
    // A pretty alias with a placeholder, in the repository's config.
    git(proj, "config", "pretty.sig", "%h %G?");
    expect(readOnly(await decide(proj, "git log --pretty=sig -1"))).toBe(false);
  });
});

describe("read-only git on the host: the session's environment and other routes", () => {
  it("a GIT_* variable that changes what git reads or runs asks; inert ones do not", async () => {
    const proj = project("env");
    const asks: Record<string, string>[] = [
      { GIT_DIR: path.join(proj, ".git") },
      { GIT_EXTERNAL_DIFF: "/bin/true" },
      { GIT_CONFIG_PARAMETERS: "'core.pager'='less'" },
      { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "diff.external", GIT_CONFIG_VALUE_0: "/bin/true" },
      { GIT_EXEC_PATH: root },
      { GIT_TRACE: path.join(root, "trace") },
      { GIT_PAGER: "less" },
    ];
    for (const extra of asks) {
      expect(
        readOnly(await decide(proj, "git diff", sessionEnv(extra))),
        JSON.stringify(extra),
      ).toBe(false);
    }
    const inert: Record<string, string>[] = [
      { GIT_PAGER: "cat" },
      { GIT_EDITOR: "true" },
      { GIT_TERMINAL_PROMPT: "0" },
      { GIT_PS1_SHOWDIRTYSTATE: "1" },
    ];
    for (const extra of inert) {
      expect(
        readOnly(await decide(proj, "git diff", sessionEnv(extra))),
        JSON.stringify(extra),
      ).toBe(true);
    }
  });

  it("a partial clone (objects fetched lazily over the network) and core.worktree are not read-only", async () => {
    const proj = project("promisor");
    git(proj, "config", "remote.origin.url", "https://example.invalid/r.git");
    git(proj, "config", "remote.origin.promisor", "true");
    expect(readOnly(await decide(proj, "git log -1"))).toBe(false);
    const wt = project("worktree");
    git(wt, "config", "core.worktree", home);
    expect(readOnly(await decide(wt, "git diff"))).toBe(false);
  });

  it("commands that start programs or reach the network are not on the read-only list", () => {
    const proj = project("list");
    for (const line of [
      "git grep -O a",
      "git grep --open-files-in-pager a",
      "git archive --remote=x HEAD",
      "git archive --exec=/bin/sh HEAD",
      "git ls-remote origin",
      "git fetch --dry-run",
      "git help log",
      "git var GIT_EDITOR",
      "git format-patch -1",
      "git bundle create x HEAD",
      "git verify-commit HEAD",
      "git diff --ext-diff",
      "git blame --textconv a.txt",
      "git log -p --textconv",
      "git -c core.pager=less log",
      "git -p log",
    ]) {
      expect(
        strictShellClassifier.classify(line, "posix", { cwd: proj, home }).readOnly,
        line,
      ).toBe(false);
    }
  });

  it("a plain repository (only .sample hooks) keeps status, diff, log and friends read-only", async () => {
    const proj = project("plain");
    expect(
      fs.readdirSync(path.join(proj, ".git", "hooks")).every((h) => h.endsWith(".sample")),
    ).toBe(true);
    put(path.join(proj, "a.txt"), "b\n");
    for (const line of [
      "git status",
      "git status --short",
      "git diff",
      "git diff --cached",
      "git log -1 --oneline",
      "git log -p -1",
      "git show HEAD",
      "git blame a.txt",
      "git grep b",
      "git ls-files",
      "git branch -a",
      "git rev-parse HEAD",
    ]) {
      expect(readOnly(await decide(proj, line)), line).toBe(true);
    }
  });
});

describe("read-only git on the host: submodules git runs in", () => {
  // git with file:// clones allowed, for the test's own local submodules.
  const gitf = (cwd: string, ...args: string[]) =>
    git(cwd, "-c", "protocol.file.allow=always", ...args);

  /** A source repository to clone as a submodule. */
  function source(name: string): string {
    const src = path.join(root, `${name}-src`);
    fs.mkdirSync(src, { recursive: true });
    git(src, "init", "-q");
    put(path.join(src, "f.txt"), "f\n");
    git(src, "add", "f.txt");
    git(src, "commit", "-q", "-m", "s");
    return src;
  }

  it("repro: a submodule cloned in the work tree (its own .git directory) with post-index-change: status and diff ask; the hook fires live", async () => {
    const proj = project("sm-intree");
    const src = source("sm-intree");
    gitf(proj, "clone", "-q", src, "sm");
    put(path.join(proj, ".gitmodules"), `[submodule "sm"]\n\tpath = sm\n\turl = ${src}\n`);
    git(proj, "add", ".gitmodules", "sm");
    git(proj, "commit", "-q", "-m", "add sm");
    const marker = path.join(root, "sm-intree-ran");
    put(path.join(proj, "sm", ".git", "hooks", "post-index-change"), hookScript(marker), 0o755);
    stale(path.join(proj, "sm", "f.txt"));
    for (const line of [
      "git status",
      "git diff",
      "git status --ignore-submodules=none",
      "git log -1",
    ]) {
      expect(readOnly(await decide(proj, line)), line).toBe(false);
    }
    hostRun(proj, "git status");
    expect(fs.existsSync(marker)).toBe(true);
  });

  it("a gitlink in the index alone (no .gitmodules), a .git file naming a git directory elsewhere, an absorbed submodule, a nested one", async () => {
    // Gitlink only: the submodule's repository is in the work tree, .gitmodules names nothing.
    const a = project("sm-gitlink");
    gitf(a, "clone", "-q", source("sm-gitlink"), "sm");
    git(a, "add", "sm");
    git(a, "commit", "-q", "-m", "gitlink");
    expect(indexGitlinks(path.join(a, ".git"))).toEqual(["sm"]);
    expect(readOnly(await decide(a, "git status"))).toBe(true);
    put(path.join(a, "sm", ".git", "hooks", "post-index-change"), "#!/bin/sh\n", 0o755);
    expect(readOnly(await decide(a, "git status"))).toBe(false);
    // A .git file naming a git directory outside .git/modules.
    const b = project("sm-gitfile");
    gitf(b, "clone", "-q", source("sm-gitfile"), "sm");
    git(b, "add", "sm");
    git(b, "commit", "-q", "-m", "gitlink");
    const elsewhere = path.join(root, "sm-gitfile-gitdir");
    fs.renameSync(path.join(b, "sm", ".git"), elsewhere);
    put(path.join(b, "sm", ".git"), `gitdir: ${elsewhere}\n`);
    expect(readOnly(await decide(b, "git status"))).toBe(true);
    git(elsewhere, "config", "core.fsmonitor", "/bin/true");
    expect(readOnly(await decide(b, "git status"))).toBe(false);
    // Absorbed (git submodule add) and nested (a submodule of the submodule, in its work tree).
    const c = project("sm-nested");
    const inner = source("sm-nested-inner");
    const outer = source("sm-nested-outer");
    gitf(outer, "submodule", "add", "-q", inner, "deep");
    git(outer, "commit", "-q", "-m", "deep");
    gitf(c, "submodule", "add", "-q", outer, "sm");
    git(c, "commit", "-q", "-m", "sm");
    gitf(c, "submodule", "update", "--init", "--recursive", "-q");
    expect(fs.statSync(path.join(c, "sm", ".git")).isFile()).toBe(true);
    expect(readOnly(await decide(c, "git status"))).toBe(true);
    const deepGit = path.join(c, ".git", "modules", "sm", "modules", "deep");
    expect(fs.existsSync(deepGit)).toBe(true);
    put(path.join(deepGit, "hooks", "post-index-change"), "#!/bin/sh\n", 0o755);
    expect(readOnly(await decide(c, "git status"))).toBe(false);
    fs.rmSync(path.join(deepGit, "hooks", "post-index-change"));
    // The nested submodule's git directory moved into its work tree (not absorbed): still read.
    fs.rmSync(path.join(c, "sm", "deep", ".git"));
    fs.renameSync(deepGit, path.join(c, "sm", "deep", ".git"));
    git(
      root,
      "config",
      "-f",
      path.join(c, "sm", "deep", ".git", "config"),
      "--unset",
      "core.worktree",
    );
    expect(readOnly(await decide(c, "git status"))).toBe(true);
    put(path.join(c, "sm", "deep", ".git", "hooks", "post-index-change"), "#!/bin/sh\n", 0o755);
    expect(readOnly(await decide(c, "git status"))).toBe(false);
  });

  it("a submodule whose git directory cannot be resolved as git does asks; the index is read in every format git writes", async () => {
    const d = project("sm-unresolved");
    gitf(d, "clone", "-q", source("sm-unresolved"), "sm");
    git(d, "add", "sm");
    git(d, "commit", "-q", "-m", "gitlink");
    fs.rmSync(path.join(d, "sm", ".git"), { recursive: true });
    put(path.join(d, "sm", ".git"), "not a gitdir line\n");
    expect(readOnly(await decide(d, "git status"))).toBe(false);
    const e = project("sm-index");
    gitf(e, "clone", "-q", source("sm-index"), "sub/dir/sm");
    git(e, "add", "sub/dir/sm");
    put(path.join(e, "sub", "dir", "z.txt"), "z\n");
    put(path.join(e, "sub", "a.txt"), "a\n");
    git(e, "add", "-A");
    git(e, "commit", "-q", "-m", "x");
    for (const v of ["2", "3", "4"]) {
      git(e, "update-index", "--index-version", v);
      expect(indexGitlinks(path.join(e, ".git")), `index v${v}`).toEqual(["sub/dir/sm"]);
    }
  });

  it("a repository with clean submodules (only .sample hooks) keeps status, diff and log read-only", async () => {
    const p = project("sm-clean");
    gitf(p, "submodule", "add", "-q", source("sm-clean"), "sm");
    git(p, "commit", "-q", "-m", "sm");
    for (const line of [
      "git status",
      "git diff",
      "git log -1 --oneline",
      "git status --ignore-submodules=none",
    ]) {
      expect(readOnly(await decide(p, line)), line).toBe(true);
    }
  });
});
