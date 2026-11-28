// Contained builds (./contained-build.ts): a build tool's command line runs
// contained with no person (contained-build) when it is a build form whose
// outputs stay in the project; its build scripts are not read. What the
// containment enforces for such a run is proved live in
// ../containment/containment.build.test.ts.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { projectSecretMasks, readBuildCommand, systemBuildProgram } from "./contained-build.js";
import { projectSnapshotPlan } from "./contained-exec.js";
import { decidePreAction, type EngineOptions } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import type { PreActionEvent } from "./types.js";

let root: string;
let proj: string;
const haveCmake = systemBuildProgram("cmake") !== null;
const haveMake = systemBuildProgram("make") !== null;

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
    { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: cwd, GIT_CONFIG_NOSYSTEM: "1" } },
  );
  expect(r.status, r.stderr).toBe(0);
}
const put = (rel: string, s: string) => {
  fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
  fs.writeFileSync(path.join(proj, rel), s);
};

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-contained-build-")));
  proj = path.join(root, "proj");
  put(
    "CMakeLists.txt",
    "cmake_minimum_required(VERSION 3.10)\nproject(h C)\nadd_executable(h h.c)\n",
  );
  put("h.c", '#include <stdio.h>\nint main(void){puts("hi");return 0;}\n');
  put("Makefile", "all:\n\techo built\n");
  put(".gitignore", "build/\nbuild-cpu/\n");
  git(proj, "init", "-q");
  git(proj, "add", "-A");
  git(proj, "commit", "-q", "-m", "initial");
  // After the commit: an existing build tree (git ignores it) and untracked user data.
  put("build/CMakeCache.txt", "# cache\n");
  put("build/obj.o", "object\n");
  put("notes.txt", "untracked notes\n");
  put("config/.env", "API_TOKEN=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH\n");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

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
    projectDir: proj,
    home: path.join(root, "home"),
    hardware: () => ({ allowed: true }),
    history: {
      store: new HistoryStore({ dir: path.join(root, `h${n++}`), limits: policy.history }),
    },
    fs: nodeFsProbe(),
    containScripts: async (req) => ({ ok: true, command: `ENCLAWED_CONTAIN=test ${req.command}` }),
    ...extra,
  };
}
const sh = (text: string): PreActionEvent => ({
  type: "pre-action",
  actor: { sessionId: "s", subagentId: null },
  callId: `c${n++}`,
  tool: "Bash",
  policyIds: ["bash", "exec"],
  kind: "shell",
  params: { command: text },
  cwd: proj,
  command: { text, dialect: "posix" },
  approvalRoute: "no-person",
  hostMode: "bypassPermissions",
});
const decide = (text: string, o = opts()) => decidePreAction(sh(text), o);
const ctx = () => ({ cwd: proj, projectDir: proj, realpathNearest: (p: string) => p });

describe("contained build: the build tool's command line", () => {
  it.skipIf(!haveCmake)("reads configure, build and test forms with outputs in the project", () => {
    for (const argv of [
      [
        "cmake",
        "-S",
        ".",
        "-B",
        "build-cpu",
        "-DCMAKE_BUILD_TYPE=RelWithDebInfo",
        "-DOPENMC_BUILD_TESTS=ON",
      ],
      ["cmake", "-B", "build", "-G", "Unix Makefiles"],
      ["cmake", "--build", "build", "-j", "8"],
      ["cmake", "--build", "build", "--target", "h", "--", "-j4"],
      ["ctest", "--test-dir", "build", "--output-on-failure", "-j", "4", "-R", "unit"],
    ]) {
      const r = readBuildCommand(argv[0], argv.slice(1), ctx());
      expect(r.ok, `${argv.join(" ")}: ${r.ok ? "" : r.why}`).toBe(true);
    }
  });

  it.skipIf(!haveCmake)(
    "does not read installers, publishers, network forms or outputs outside the project",
    () => {
      for (const argv of [
        ["cmake", "--install", "build"],
        ["cmake", "-P", "fetch.cmake"],
        ["cmake", "-E", "rm", "-rf", "x"],
        ["cmake", "-S", ".", "-B", "/var/tmp/elsewhere"],
        ["cmake", "-S", ".", "-B", "build", "-DURL=https://evil.example/x.tgz"],
        ["cmake", "--build", "build", "--target", "install"],
        ["ctest", "-D", "Experimental"],
        ["ctest", "-S", "dash.cmake"],
      ]) {
        expect(readBuildCommand(argv[0], argv.slice(1), ctx()).ok, argv.join(" ")).toBe(false);
      }
    },
  );

  it.skipIf(!haveMake)(
    "reads make with targets and variables, never install or publish targets",
    () => {
      for (const argv of [
        ["make"],
        ["make", "-j8", "all"],
        ["make", "-C", "sub", "CC=gcc", "test"],
        ["gmake", "-k"],
      ]) {
        if (argv[0] === "gmake" && !systemBuildProgram("gmake")) {
          continue;
        }
        expect(readBuildCommand(argv[0], argv.slice(1), ctx()).ok, argv.join(" ")).toBe(true);
      }
      for (const argv of [
        ["make", "install"],
        ["make", "deploy"],
        ["make", "publish"],
        ["make", "-C", "/etc"],
        ["make", "-f", "/var/tmp/x.mk"],
        ["make", "--eval=x"],
      ]) {
        expect(readBuildCommand(argv[0], argv.slice(1), ctx()).ok, argv.join(" ")).toBe(false);
      }
    },
  );

  it("reads cargo and go build forms only, offline; installers and fetchers are not builds", () => {
    const fake = (p: string, a: string[]) => readBuildCommand(p, a, ctx());
    // Whether the tool exists here or not, these are never builds.
    for (const [p, ...a] of [
      ["cargo", "install", "ripgrep"],
      ["cargo", "publish"],
      ["cargo", "update"],
      ["cargo", "fetch"],
      ["cargo", "build", "--config", "net.offline=false"],
      ["cargo", "build", "-Zunstable-options"],
      ["cargo", "fmt"],
      ["cargo", "run"],
      ["go", "get", "example.com/x"],
      ["go", "install", "./..."],
      ["go", "mod", "download"],
      ["go", "generate", "./..."],
      ["go", "build", "-mod=mod", "./..."],
      ["go", "test", "-exec", "sudo", "./..."],
      ["ninja", "-t", "commands"],
      ["meson", "install"],
      ["meson", "subprojects", "download"],
      ["meson", "setup", "build", "--wrap-mode=forcefallback"],
    ]) {
      expect(fake(p, a).ok, [p, ...a].join(" ")).toBe(false);
    }
    if (systemBuildProgram("cargo")) {
      expect(fake("cargo", ["build", "--release", "--target-dir", "target"]).ok).toBe(true);
      expect(fake("cargo", ["fmt", "--check"]).ok).toBe(true);
    } else {
      // A cargo of a home directory (rustup) is not one the containment runs.
      expect(fake("cargo", ["build"]).ok).toBe(false);
    }
  });
});

describe("contained build: the decision", () => {
  it.skipIf(!haveCmake)(
    "the owner's prompt: grep .gitignore, then cmake configure, runs contained with no person",
    async () => {
      const d = await decide(
        'grep -n "^build\\|^/build" .gitignore | head -3; cmake -S . -B build-cpu -DCMAKE_BUILD_TYPE=RelWithDebInfo -DOPENMC_BUILD_TESTS=ON 2>&1 | tail -25',
      );
      expect(d.outcome, d.reason).toBe("allow");
      expect(d.codes).toContain("contained-build");
      expect(d.reversible).toBe(true);
      expect(d.contain?.kind).toBe("project-script");
      expect(d.contain?.code).toBeUndefined();
      expect(d.contain?.build?.tools).toEqual(["cmake"]);
      // The project's secret file is masked in the build's view.
      expect(d.contain?.build?.masks).toEqual([path.join(proj, "config/.env")]);
      expect(d.reason).toMatch(/contained build/);
    },
  );

  it.skipIf(!haveCmake || !haveMake)(
    "build, test and make lines run contained; the existing build tree is regenerable, other untracked files are kept",
    async () => {
      for (const text of [
        "cmake --build build -j 4",
        "cd build && make -j4",
        "make && ctest --test-dir build --output-on-failure",
      ]) {
        const d = await decide(text);
        expect(d.outcome, `${text}: ${d.reason}`).toBe("allow");
        expect(d.codes, text).toContain("contained-build");
      }
      const tree = nodeFsProbe().committedTree?.(proj);
      const plan = projectSnapshotPlan(proj, tree?.blobs ?? null, {
        maxFiles: 100,
        maxBytes: 1e6,
        maxFileBytes: 1e6,
        regenerable: [{ dir: path.join(proj, "build"), marker: ["CMakeCache.txt"] }],
      });
      expect(plan.ok).toBe(true);
      if (plan.ok) {
        expect(plan.files).toContain(path.join(proj, "notes.txt"));
        expect(plan.files.some((f) => f.startsWith(path.join(proj, "build")))).toBe(false);
      }
    },
  );

  it.skipIf(!haveCmake)(
    "still asks for a build line that also commits, installs, or names a network address",
    async () => {
      for (const text of [
        "cmake --build build && git add -A",
        "cmake --build build && git commit -m x",
        "make install",
        "cmake -S . -B build -DFETCH=https://evil.example/dep.tgz",
        "cmake -S . -B /var/tmp/outside-build",
      ]) {
        const d = await decide(text);
        expect(d.codes, `${text}: ${d.reason}`).not.toContain("contained-build");
        expect(d.outcome, text).not.toBe("allow");
      }
    },
  );

  it.skipIf(!haveCmake)("asks when Enclawed's own state lies in the project", async () => {
    const d = await decide(
      "cmake --build build",
      opts({ protected: { paths: [path.join(proj, ".enclawed-state")], prefixes: [] } }),
    );
    expect(d.codes).not.toContain("contained-build");
  });
});

describe("contained build: the project's secret files", () => {
  it("finds secret files by name, by content, and hard links of credential files", () => {
    const home = path.join(root, "home2");
    fs.mkdirSync(path.join(home, ".ssh"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".ssh", "id_ed25519"),
      "-----BEGIN OPENSSH PRIVATE KEY-----\nx\n",
    );
    const p = path.join(root, "secrets-proj");
    fs.mkdirSync(path.join(p, "src"), { recursive: true });
    fs.writeFileSync(path.join(p, "src", "a.c"), "int x;\n");
    fs.writeFileSync(path.join(p, ".env"), "A=1\n");
    fs.writeFileSync(
      path.join(p, "src", "notes.txt"),
      "token ghp_0123456789abcdefghijklmnopqrstuvwxyz01\n",
    );
    let linked = false;
    try {
      fs.linkSync(path.join(home, ".ssh", "id_ed25519"), path.join(p, "src", "key-copy"));
      linked = true;
    } catch {
      /* another file system */
    }
    const r = projectSecretMasks(p, home, nodeFsProbe());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.masks).toContain(path.join(p, ".env"));
      expect(r.masks).toContain(path.join(p, "src", "notes.txt"));
      if (linked) {
        expect(r.masks).toContain(path.join(p, "src", "key-copy"));
      }
      expect(r.masks).not.toContain(path.join(p, "src", "a.c"));
    }
    expect(projectSecretMasks(p, home, nodeFsProbe(), { maxEntries: 2 }).ok).toBe(false);
  });
});

describe("contained runs never answer for a system path they cannot see", () => {
  it("a pinned line that lists a header outside the project is not contained; a build line sees the toolchain", async () => {
    const pinned = await decide("ls /usr/include/stdio.h && node --test");
    expect(pinned.codes).not.toContain("contained-execution");
    expect(pinned.reason).toMatch(/does not see as the host does/);
    if (haveCmake) {
      const build = await decide("ls /usr/include/stdio.h; cmake --build build");
      expect(build.codes, build.reason).toContain("contained-build");
      const etc = await decide("cat /etc/hostname; cmake --build build");
      expect(etc.codes).not.toContain("contained-build");
    }
  });
});
