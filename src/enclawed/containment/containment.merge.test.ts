// Conflicts git resolves with non-default merge options: strategy options
// (-X ours/theirs, diff algorithm), the union driver, renormalize, rerere.
// Host-side checks on real repositories (verifyTracked, as the containment
// runs it after the writing git exits) and live contained merges.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { containmentSupport, type ContainmentEvent } from "./host.js";
import { mergeOptions, rerereNormalize } from "./merge-check.js";
import { inodeKey } from "./name-guard.js";
import { verifyTracked } from "./repo-config.js";
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
const ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.test",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.test",
};
const git = (cwd: string, ...args: string[]) => {
  try {
    return execFileSync("git", args, {
      cwd,
      env: ENV,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    return (err as { stdout?: string }).stdout ?? "";
  }
};

/** main and theirs change .vscode/settings.json differently; `ours` may use CRLF. */
function conflictRepo(
  dir: string,
  o: { crlfOurs?: boolean; attrs?: string; rerere?: boolean } = {},
) {
  fs.mkdirSync(path.join(dir, ".vscode"), { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  if (o.rerere) {
    git(dir, "config", "rerere.enabled", "true");
  }
  const f = path.join(dir, ".vscode", "settings.json");
  fs.writeFileSync(f, '{\n  "a": 1,\n  "b": 1\n}\n');
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "checkout", "-q", "-b", "theirs");
  fs.writeFileSync(f, '{\n  "a": 2,\n  "b": 1\n}\n');
  git(dir, "commit", "-q", "-am", "theirs");
  git(dir, "checkout", "-q", "main");
  fs.writeFileSync(
    f,
    o.crlfOurs ? '{\r\n  "a": 3,\r\n  "b": 1\r\n}\r\n' : '{\n  "a": 3,\n  "b": 1\n}\n',
  );
  git(dir, "commit", "-q", "-am", "ours");
  if (o.attrs) {
    fs.writeFileSync(path.join(dir, ".gitattributes"), o.attrs);
    git(dir, "add", ".gitattributes");
    git(dir, "commit", "-q", "-m", "attrs");
  }
  return f;
}

let root: string;
beforeAll(() => {
  root = tempTree("contain-merge");
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("merge options and rerere (host side, real repositories)", () => {
  it("reads strategy options from the merging git's argv; a strategy that is not built in is refused", () => {
    expect(mergeOptions(["git", "merge", "-X", "theirs", "x"], false)).toMatchObject({
      favor: "theirs",
    });
    expect(
      mergeOptions(["git", "rebase", "--strategy-option=diff-algorithm=patience"], false),
    ).toMatchObject({
      algos: ["patience"],
    });
    expect(mergeOptions(["git", "merge", "-Xrenormalize", "x"], false)).toMatchObject({
      renormalize: true,
    });
    expect(mergeOptions(["git", "merge", "-X", "ignore-space-change", "x"], false)).toMatchObject({
      whitespace: ["ignore-space-change"],
      unsupported: [],
    });
    expect(mergeOptions(["git", "merge", "-s", "octopus", "x", "y"], false).unsupported).toEqual(
      [],
    );
    expect(mergeOptions(["git", "merge", "-s", "mystrategy", "x"], false).unsupported).toEqual([
      "strategy mystrategy",
    ]);
  });

  it("renormalize: a CRLF side merged with -X renormalize is accepted with that option, refused without it", () => {
    const dir = path.join(root, "renorm");
    const f = conflictRepo(dir, { crlfOurs: true, attrs: "* text=auto\n" });
    git(dir, "merge", "-X", "renormalize", "theirs");
    expect(fs.readFileSync(f, "utf8")).toMatch(/^<<<<<<< HEAD$/m);
    expect(
      verifyTracked(f, { argv: ["git", "merge", "-X", "renormalize", "theirs"] }),
    ).toMatchObject({
      ok: true,
      state: "conflicted",
    });
    expect(verifyTracked(f, { argv: ["git", "merge", "theirs"] })).toMatchObject({ ok: false });
  });

  it("diff algorithm: a merge made with -X diff-algorithm=histogram is rebuilt with it", () => {
    const dir = path.join(root, "algo");
    const f = conflictRepo(dir);
    git(dir, "merge", "-X", "diff-algorithm=histogram", "theirs");
    expect(
      verifyTracked(f, { argv: ["git", "merge", "-X", "diff-algorithm=histogram", "theirs"] }),
    ).toMatchObject({
      ok: true,
      state: "conflicted",
    });
  });

  it("rerere: a replayed resolution is accepted; one whose rr-cache entry the sandbox wrote is refused", () => {
    const dir = path.join(root, "rerere");
    const f = conflictRepo(dir, { rerere: true });
    git(dir, "merge", "theirs");
    fs.writeFileSync(f, '{\n  "a": 23,\n  "b": 1\n}\n');
    git(dir, "rerere");
    git(dir, "merge", "--abort");
    git(dir, "merge", "theirs"); // replays the recorded resolution
    expect(fs.readFileSync(f, "utf8")).toBe('{\n  "a": 23,\n  "b": 1\n}\n');
    expect(verifyTracked(f, { argv: ["git", "merge", "theirs"] })).toMatchObject({
      ok: true,
      state: "conflicted",
    });
    const id = fs.readdirSync(path.join(dir, ".git", "rr-cache"))[0];
    const post = path.join(dir, ".git", "rr-cache", id, "postimage");
    const written = new Set([inodeKey(fs.statSync(post, { bigint: true }))]);
    expect(verifyTracked(f, { argv: ["git", "merge", "theirs"], written })).toMatchObject({
      ok: false,
    });
    // rerere's normalized preimage is what the rebuilt conflict normalizes to.
    expect(fs.readFileSync(path.join(dir, ".git", "rr-cache", id, "preimage"), "utf8")).toBe(
      rerereNormalize(
        '{\n<<<<<<< HEAD\n  "a": 3,\n=======\n  "a": 2,\n>>>>>>> theirs\n  "b": 1\n}\n',
        7,
      ),
    );
  });
});

describe("whitespace options, octopus, custom drivers (host side, real repositories)", () => {
  const wsRepo = (dir: string) => {
    fs.mkdirSync(path.join(dir, ".vscode"), { recursive: true });
    git(dir, "init", "-q", "-b", "main");
    const f = path.join(dir, ".vscode", "settings.json");
    fs.writeFileSync(f, '{\n  "a": 1,\n  "b": 1\n}\n');
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "base");
    git(dir, "checkout", "-q", "-b", "theirs");
    fs.writeFileSync(f, '{\n    "a": 2,\n  "b": 1\n}\n');
    git(dir, "commit", "-q", "-am", "theirs");
    git(dir, "checkout", "-q", "main");
    fs.writeFileSync(f, '{\n  "a": 3,\n  "b":   1\n}\n');
    git(dir, "commit", "-q", "-am", "ours");
    return f;
  };

  for (const opt of [
    "ignore-space-change",
    "ignore-all-space",
    "ignore-space-at-eol",
    "ignore-cr-at-eol",
  ]) {
    it(`-X ${opt}: git's conflict is rebuilt with git merge-tree and accepted; an edited one is refused`, () => {
      const dir = path.join(root, `ws-${opt}`);
      const f = wsRepo(dir);
      git(dir, "merge", "-X", opt, "theirs");
      const argv = ["git", "merge", "-X", opt, "theirs"];
      expect(fs.readFileSync(f, "utf8")).toMatch(/^<<<<<<< HEAD$/m);
      expect(verifyTracked(f, { argv })).toMatchObject({ ok: true, state: "conflicted" });
      fs.writeFileSync(
        f,
        fs.readFileSync(f, "utf8").replace("=======", '  "x": "/tmp/evil",\n======='),
      );
      expect(verifyTracked(f, { argv })).toMatchObject({ ok: false });
    });
  }

  function octopusRepo(dir: string) {
    fs.mkdirSync(path.join(dir, ".vscode"), { recursive: true });
    git(dir, "init", "-q", "-b", "main");
    const f = path.join(dir, ".vscode", "settings.json");
    fs.writeFileSync(f, '{\n  "a": 1\n}\n');
    fs.writeFileSync(path.join(dir, "other"), "x\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "base");
    git(dir, "checkout", "-q", "-b", "b1");
    fs.writeFileSync(path.join(dir, "other"), "y\n");
    git(dir, "commit", "-q", "-am", "b1");
    git(dir, "checkout", "-q", "main");
    git(dir, "checkout", "-q", "-b", "b2");
    fs.writeFileSync(f, '{\n  "a": 2\n}\n');
    git(dir, "commit", "-q", "-am", "b2");
    git(dir, "checkout", "-q", "main");
    fs.writeFileSync(f, '{\n  "a": 3\n}\n');
    git(dir, "commit", "-q", "-am", "ours");
    return f;
  }

  it("octopus: the conflict left by the last pair is git-merge-one-file's output, accepted", () => {
    const dir = path.join(root, "octopus");
    const f = octopusRepo(dir);
    git(dir, "merge", "b1", "b2");
    expect(fs.readFileSync(f, "utf8")).toMatch(/^<<<<<<< \.merge_file_/m);
    expect(verifyTracked(f, { argv: ["git", "merge", "b1", "b2"] })).toMatchObject({
      ok: true,
      state: "conflicted",
    });
  });

  it("a custom merge driver, or a strategy that is not built in, on agent config is refused by name", () => {
    const dir = path.join(root, "driver");
    const f = conflictRepo(dir, { attrs: ".vscode/settings.json merge=mydriver\n" });
    git(dir, "merge", "theirs"); // the driver is not defined: git falls back to the text merge
    const v = verifyTracked(f, { argv: ["git", "merge", "theirs"] });
    expect(v).toMatchObject({ ok: false });
    expect((v as { reason: string }).reason).toMatch(
      /custom merge driver \("mydriver"\).*runs a command/,
    );
    const dir2 = path.join(root, "strategy");
    const f2 = conflictRepo(dir2);
    git(dir2, "merge", "theirs");
    const s = verifyTracked(f2, { argv: ["git", "merge", "-s", "mystrategy", "theirs"] });
    expect((s as { reason: string }).reason).toMatch(/strategy mystrategy.*not built in/);
  });
});

type Changed = { path: string; state: string };
const changedOf = (events: readonly ContainmentEvent[]) =>
  events
    .filter((e) => (e as { code?: unknown }).code === "containment-repo-config-changed")
    .flatMap((e) => (e as unknown as { paths: Changed[] }).paths);

describe.skipIf(!live)("merge options and rerere, live in the containment", () => {
  let home: string;
  let stateDir: string;
  beforeAll(() => {
    home = fakeHome(path.join(root, "live"));
    stateDir = path.join(root, "live", "state");
  });
  const start = (dir: string) =>
    startContainedServer(
      { name: "ops", command: "node", args: [path.join(FIXTURES, "ops-server.cjs")] },
      { roots: [{ path: dir, access: "rw" }], packageRoot: FIXTURES, programs: ["git"], cwd: dir },
      planContext(home),
      { stateDir },
    );
  const merge = async (srv: Awaited<ReturnType<typeof start>>, dir: string, ...args: string[]) =>
    JSON.parse(
      (
        await srv.call("exec", {
          cmd: "git",
          args: ["merge", ...args],
          cwd: dir,
          env: {
            GIT_AUTHOR_NAME: "c",
            GIT_AUTHOR_EMAIL: "c@e.test",
            GIT_COMMITTER_NAME: "c",
            GIT_COMMITTER_EMAIL: "c@e.test",
          },
        })
      ).text,
    ) as { status: number };
  const settle = async (srv: Awaited<ReturnType<typeof start>>) => {
    const end = Date.now() + 5000;
    while (
      changedOf(srv.events).length === 0 &&
      refusals(srv.events).length === 0 &&
      Date.now() < end
    ) {
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  it("-X theirs, the union driver, -X diff-algorithm, -X renormalize and a rerere replay are all accepted", async () => {
    for (const [name, attrs, args, state, crlfOurs] of [
      ["xtheirs", undefined, ["-X", "theirs", "theirs"], "checked-out", false],
      ["union", ".vscode/settings.json merge=union\n", ["theirs"], "checked-out", false],
      ["histogram", undefined, ["-X", "diff-algorithm=histogram", "theirs"], "conflicted", false],
      // Needs the merging git's own argv (journaled by the name guard).
      ["renormalize", "* text=auto\n", ["-X", "renormalize", "theirs"], "conflicted", true],
    ] as const) {
      const dir = path.join(root, `live-${name}`);
      conflictRepo(dir, { attrs, crlfOurs });
      const srv = await start(dir);
      try {
        await merge(srv, dir, ...args);
        await settle(srv);
        expect([name, srv.child.exitCode]).toEqual([name, null]);
      } finally {
        await srv.close();
      }
      expect([name, refusals(srv.events)]).toEqual([name, []]);
      expect([name, changedOf(srv.events).map((c) => c.state)]).toEqual([name, [state]]);
    }
    const dir = path.join(root, "live-rerere");
    const f = conflictRepo(dir, { rerere: true });
    git(dir, "merge", "theirs");
    fs.writeFileSync(f, '{\n  "a": 23,\n  "b": 1\n}\n');
    git(dir, "rerere");
    git(dir, "merge", "--abort");
    const srv = await start(dir);
    try {
      await merge(srv, dir, "theirs");
      await settle(srv);
    } finally {
      await srv.close();
    }
    expect(refusals(srv.events)).toEqual([]);
    expect(changedOf(srv.events).map((c) => c.state)).toEqual(["conflicted"]);
    expect(fs.readFileSync(f, "utf8")).toBe('{\n  "a": 23,\n  "b": 1\n}\n');
  }, 120_000);

  it("attack: a resolution the sandbox planted in rr-cache is replayed by git, and refused", async () => {
    const dir = path.join(root, "live-rerere-planted");
    const f = conflictRepo(dir, { rerere: true });
    git(dir, "merge", "theirs"); // records the preimage
    git(dir, "merge", "--abort");
    const id = fs.readdirSync(path.join(dir, ".git", "rr-cache"))[0];
    const srv = await start(dir);
    try {
      const w = JSON.parse(
        (
          await srv.call("fs_ops", {
            ops: [
              {
                op: "write",
                path: path.join(dir, ".git", "rr-cache", id, "postimage"),
                content: '{\n  "terminal.integrated.shell.linux": "/tmp/x"\n}\n',
              },
            ],
          })
        ).text,
      );
      expect(Object.values(w)).toEqual(["OK"]);
      await merge(srv, dir, "theirs");
      await settle(srv);
    } finally {
      await srv.close();
    }
    expect(refusals(srv.events).map((r) => r.code)).toEqual(["containment-repo-config-refused"]);
    expect(fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "").not.toContain("/tmp/x");
  }, 60_000);

  it("octopus inside the containment: git-merge-one-file writes the conflict, and it is accepted", async () => {
    const dir = path.join(root, "live-octopus");
    fs.mkdirSync(path.join(dir, ".vscode"), { recursive: true });
    git(dir, "init", "-q", "-b", "main");
    const f = path.join(dir, ".vscode", "settings.json");
    fs.writeFileSync(f, '{\n  "a": 1\n}\n');
    fs.writeFileSync(path.join(dir, "other"), "x\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "base");
    git(dir, "checkout", "-q", "-b", "b1");
    fs.writeFileSync(path.join(dir, "other"), "y\n");
    git(dir, "commit", "-q", "-am", "b1");
    git(dir, "checkout", "-q", "main");
    git(dir, "checkout", "-q", "-b", "b2");
    fs.writeFileSync(f, '{\n  "a": 2\n}\n');
    git(dir, "commit", "-q", "-am", "b2");
    git(dir, "checkout", "-q", "main");
    fs.writeFileSync(f, '{\n  "a": 3\n}\n');
    git(dir, "commit", "-q", "-am", "ours");
    const r = await runContainedScript(
      {
        label: "git merge",
        projectDir: dir,
        command: "git",
        args: ["merge", "b1", "b2"],
        // git runs octopus as a shell script (#!/bin/sh) with coreutils.
        programs: [
          "git",
          "/bin/sh",
          "cat",
          "sed",
          "rm",
          "mkdir",
          "chmod",
          "expr",
          "tr",
          "mv",
          "basename",
          "dirname",
        ],
        env: {
          GIT_AUTHOR_NAME: "c",
          GIT_AUTHOR_EMAIL: "c@e.test",
          GIT_COMMITTER_NAME: "c",
          GIT_COMMITTER_EMAIL: "c@e.test",
        },
      },
      planContext(home),
      { stateDir },
    );
    expect(r.code, `${r.stdout}\n${r.stderr}`).toBe(1); // git's own conflict status
    expect(fs.readFileSync(f, "utf8")).toMatch(/^<<<<<<< \.merge_file_/m);
    expect(refusals(r.events)).toEqual([]);
    expect(changedOf(r.events).map((c) => c.state)).toEqual(["conflicted"]);
  }, 60_000);
});
