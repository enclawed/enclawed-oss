// Live: a project's virtual environment (.venv made by `python3 -m venv`). A
// Python runner of the line that is the environment's (its bin/python, its
// pytest console script, or python3 with the environment activated on the
// session's PATH) runs contained as that environment: the toolchain's
// interpreter, the environment's site-packages on the guard's path and
// trusted as toolchain, the environment read-only. Anything else of it asks.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { markVenvTaint, VENV_TAINT_MARK } from "../containment/dependency-changes.js";
import { containmentSupport, lookupProgram } from "../containment/index.js";
import { fakeHome } from "../containment/test-helpers.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { scriptContainer } from "./contained-launch.js";
import { decidePreAction, DecisionEngine } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { setPythonVersionProbeForTests } from "./python-reader.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import type { ContainedCode, PreActionEvent } from "./types.js";
import { memoryVenvTrustStore, venvFingerprint, type VenvTrustStore } from "./venv-trust.js";

const live = containmentSupport().ok && lookupProgram("python3") !== null;
const PYVER = (() => {
  const r = spawnSync("python3", ["-c", "import sys;print('%d.%d' % sys.version_info[:2])"], {
    encoding: "utf8",
  });
  return r.stdout.trim();
})();

let root: string;
let proj: string;
// The virtual environments a person or a decided install trusted (Enclawed's state).
let store: VenvTrustStore = memoryVenvTrustStore();
/** Trust the project's .venv as it is now (what an approval at Enclawed's prompt records). */
function trustVenv(s: VenvTrustStore = store): void {
  const v = fs.realpathSync(path.join(proj, ".venv"));
  s.trust(v, venvFingerprint(v) ?? "");
}

// A stand-in for pytest installed in the environment (pure Python): it runs
// the test_*.py functions of tests/ and reports what the run sees.
const FAKE_PYTEST_INIT = `import sys

def console_main():
    from pytest.__main__ import main
    return main()


def raises(exc):
    class _R:
        def __enter__(self):
            return self

        def __exit__(self, t, v, tb):
            return t is not None and issubclass(t, exc)

    return _R()
`;
const FAKE_PYTEST_MAIN = `import importlib.util
import os
import sys


def main():
    print("ARGV", sys.argv[1:])
    here = os.path.dirname(os.path.abspath(__file__))
    try:
        open(os.path.join(here, "planted.py"), "w").write("x = 1")
        print("SITE WRITABLE")
    except OSError:
        print("SITE READ-ONLY")
    passed = failed = 0
    for name in sorted(os.listdir("tests")):
        if not (name.startswith("test_") and name.endswith(".py")):
            continue
        spec = importlib.util.spec_from_file_location(name[:-3], os.path.join("tests", name))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for k in sorted(dir(mod)):
            if k.startswith("test_"):
                try:
                    getattr(mod, k)()
                    passed += 1
                except AssertionError:
                    failed += 1
    print("RESULT %d passed %d failed" % (passed, failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
`;

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-pyvenv-")));
  proj = path.join(root, "proj");
  fs.mkdirSync(path.join(proj, "tests"), { recursive: true });
  fakeHome(root);
  fs.writeFileSync(
    path.join(proj, "tests", "test_a.py"),
    "import pytest\n\ndef test_ok():\n    assert 1 == 1\n\ndef test_raises():\n    with pytest.raises(KeyError):\n        {}['k']\n\ndef test_fail():\n    assert 1 == 2\n",
  );
  if (live) {
    const venv = path.join(proj, ".venv");
    expect(spawnSync("python3", ["-m", "venv", "--without-pip", venv]).status).toBe(0);
    const site = path.join(venv, "lib", `python${PYVER}`, "site-packages");
    fs.mkdirSync(path.join(site, "pytest"), { recursive: true });
    fs.writeFileSync(path.join(site, "pytest", "__init__.py"), FAKE_PYTEST_INIT);
    fs.writeFileSync(path.join(site, "pytest", "__main__.py"), FAKE_PYTEST_MAIN);
    fs.writeFileSync(
      path.join(venv, "bin", "pytest"),
      `#!${venv}/bin/python\nimport sys\nfrom pytest import console_main\nif __name__ == "__main__":\n    sys.exit(console_main())\n`,
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(venv, "bin", "tool"),
      `#!${venv}/bin/python\nimport sys\nfrom pytest import console_main\nif __name__ == "__main__":\n    sys.exit(console_main())\n`,
      { mode: 0o755 },
    );
  }
  const git = (...args: string[]) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], {
      cwd: proj,
      env: { PATH: "/usr/bin:/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1" },
    });
  fs.writeFileSync(path.join(proj, ".gitignore"), ".venv/\n");
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "initial");
  if (live) {
    trustVenv();
  }
});

afterAll(() => {
  setPythonVersionProbeForTests(null);
  fs.rmSync(root, { recursive: true, force: true });
});

function engineOptions(environment?: Record<string, string>, venvTrust: VenvTrustStore = store) {
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
    history: { store: new HistoryStore({ dir: path.join(root, "h"), limits: policy.history }) },
    fs: nodeFsProbe(),
    containScripts: async (req: { command: string }) => ({
      ok: true as const,
      command: req.command,
    }),
    venvTrust,
    ...(environment ? { environment } : {}),
  };
}

const shellEvent = (
  line: string,
  route: PreActionEvent["approvalRoute"] = "no-person",
): PreActionEvent => ({
  type: "pre-action",
  actor: { sessionId: "s", subagentId: null },
  callId: `c-${Math.random()}`,
  tool: "Bash",
  policyIds: ["bash", "exec"],
  kind: "shell",
  params: { command: line },
  cwd: proj,
  command: { text: line, dialect: "posix" },
  approvalRoute: route,
});

async function decideWrite(rel: string) {
  return decidePreAction(
    {
      type: "pre-action",
      actor: { sessionId: "s", subagentId: null },
      callId: "w1",
      tool: "Write",
      policyIds: ["write"],
      kind: "fs-write",
      params: { file_path: path.join(proj, rel), content: "x = 1\n" },
      writes: [{ path: path.join(proj, rel), op: "write" }],
      cwd: proj,
      approvalRoute: "no-person",
    },
    engineOptions() as never,
  );
}

async function decide(line: string, environment?: Record<string, string>) {
  return decidePreAction(shellEvent(line), engineOptions(environment) as never);
}

async function runContained(
  line: string,
  code: ContainedCode | undefined,
  build?: unknown,
): Promise<string> {
  const sc = scriptContainer({ stateDir: path.join(root, "state") });
  try {
    const r = await sc.contain({
      kind: "project-script",
      label: line,
      command: line,
      dialect: "posix",
      cwd: proj,
      projectDir: proj,
      ...(code ? { code } : {}),
      ...(build ? { build } : {}),
    } as never);
    expect(r.ok ? "ok" : r.message).toBe("ok");
    if (!r.ok) {
      return "";
    }
    const p = spawnSync("/bin/sh", ["-c", r.command], { encoding: "utf8", timeout: 60_000 });
    return `${p.stdout}\n${p.stderr}`;
  } finally {
    await sc.close();
  }
}

describe.skipIf(!live)("contained python: a project's virtual environment", () => {
  const activated = () => ({
    PATH: `${proj}/.venv/bin:/usr/local/bin:/usr/bin:/bin`,
    VIRTUAL_ENV: `${proj}/.venv`,
  });

  it.each([
    [".venv/bin/python -m pytest -q", false],
    [".venv/bin/python3 -m pytest -q", false],
    [".venv/bin/pytest -q", false],
    ["python3 -m pytest -q", true],
  ] as const)(
    "%s (activated: %s) runs as the environment, read-only, pytest's assertions plain",
    async (line, act) => {
      const d = await decide(line, act ? activated() : undefined);
      expect([
        line,
        d.outcome,
        d.outcome === "allow" ? "" : String((d as { reason?: string }).reason),
      ]).toEqual([line, "allow", ""]);
      const code = d.contain?.code as ContainedCode;
      expect(code.pythonVenv?.dir).toBe(fs.realpathSync(path.join(proj, ".venv")));
      const out = await runContained(line, code);
      expect(out).toContain("RESULT 2 passed 1 failed");
      expect(out).toContain("SITE READ-ONLY");
      expect(out).toContain("'-p', 'no:cacheprovider', '--assert=plain'");
    },
  );

  it("without the environment activated, python3 is the toolchain's (as on the host)", async () => {
    const d = await decide("python3 -m pytest -q");
    expect(d.outcome).toBe("allow");
    expect((d.contain?.code as ContainedCode).pythonVenv).toBeUndefined();
  });

  it.each([
    // Programs of the environment other than pytest are code nobody read.
    [".venv/bin/tool -q", undefined],
    // A program of the activated environment by its bare name: not on the containment's PATH.
    ["pytest -q", "act"],
    // One line, two Pythons.
    ["python3 -c 'print(1)' && .venv/bin/python -m pytest -q", undefined],
  ] as const)("%s is not run contained", async (line, act) => {
    const d = await decide(line, act ? activated() : undefined);
    expect([line, d.outcome]).not.toEqual([line, "allow"]);
  });

  it("an environment whose Python is older than the guard is verified on is not run contained", async () => {
    setPythonVersionProbeForTests(() => [3, 13]);
    try {
      const d = await decide(".venv/bin/python -m pytest -q");
      expect(d.outcome).not.toBe("allow");
      expect(String((d as { reason?: string }).reason)).toMatch(/3\.14 or newer/);
    } finally {
      setPythonVersionProbeForTests(null);
    }
  });

  it("no contained run writes the environment's packages (a run of it trusts them as toolchain)", async () => {
    const target = `.venv/lib/python${PYVER}/site-packages/pytest/__init__.py`;
    const before = fs.readFileSync(path.join(proj, target), "utf8");
    const line = `python3 -c 'open("${target}", "w").write("planted")'`;
    const d = await decide(line);
    if (d.outcome === "allow" && d.contain?.code) {
      await runContained(line, d.contain.code as ContainedCode);
    }
    expect(fs.readFileSync(path.join(proj, target), "utf8")).toBe(before);
  });

  it.skipIf(lookupProgram("make") === null)(
    "a contained build cannot change the environment's packages; pytest of it still runs what was installed",
    async () => {
      const init = `.venv/lib/python${PYVER}/site-packages/pytest/__init__.py`;
      const before = fs.readFileSync(path.join(proj, init), "utf8");
      fs.writeFileSync(path.join(proj, "pay.py"), "\nopen('pwned', 'w').write('uid=planted')\n");
      fs.writeFileSync(path.join(proj, "Makefile"), `all:\n\tcat pay.py >> ${init}\n`);
      try {
        const b = await decide("make");
        if (b.outcome === "allow" && b.contain) {
          await runContained("make", b.contain.code as ContainedCode | undefined, b.contain.build);
        }
        expect(fs.readFileSync(path.join(proj, init), "utf8")).toBe(before);
        const d = await decide(".venv/bin/pytest -q");
        expect(d.outcome).toBe("allow");
        const out = await runContained(".venv/bin/pytest -q", d.contain?.code as ContainedCode);
        expect(out).toContain("RESULT 2 passed 1 failed");
        expect(fs.existsSync(path.join(proj, "pwned"))).toBe(false);
      } finally {
        fs.rmSync(path.join(proj, "pay.py"), { force: true });
        fs.rmSync(path.join(proj, "Makefile"), { force: true });
      }
    },
  );

  it("an environment a contained run changed anyway (its taint mark) is not trusted until reinstalled", async () => {
    const venv = fs.realpathSync(path.join(proj, ".venv"));
    const site = path.join(venv, "lib", `python${PYVER}`, "site-packages");
    expect(
      markVenvTaint([path.join(site, "pytest", "__init__.py")], [fs.realpathSync(proj)]),
    ).toEqual([venv]);
    try {
      const d = await decide(".venv/bin/python -m pytest -q");
      expect(d.outcome).not.toBe("allow");
      expect(String((d as { reason?: string }).reason)).toMatch(/changed the installed packages/);
    } finally {
      fs.rmSync(path.join(venv, VENV_TAINT_MARK), { force: true });
    }
    expect((await decide(".venv/bin/python -m pytest -q")).outcome).toBe("allow");
  });

  it("an environment named other than .venv or venv is not run contained as an environment", async () => {
    fs.renameSync(path.join(proj, ".venv"), path.join(proj, "env"));
    try {
      const d = await decide("env/bin/python -m pytest -q");
      expect(d.outcome).not.toBe("allow");
      expect(String((d as { reason?: string }).reason)).toMatch(/not named \.venv or venv/);
    } finally {
      fs.renameSync(path.join(proj, "env"), path.join(proj, ".venv"));
    }
  });

  it("a test file importing a package of the environment other than pytest is not read as the project's", async () => {
    const site = path.join(proj, ".venv", "lib", `python${PYVER}`, "site-packages");
    fs.writeFileSync(path.join(site, "thirdparty.py"), "X = 1\n");
    trustVenv();
    fs.writeFileSync(
      path.join(proj, "tests", "test_b.py"),
      "import thirdparty\n\ndef test_x():\n    assert thirdparty.X\n",
    );
    try {
      const d = await decide(".venv/bin/python -m pytest -q");
      expect(d.outcome).not.toBe("allow");
      expect(String((d as { reason?: string }).reason)).toMatch(/thirdparty/);
    } finally {
      fs.rmSync(path.join(proj, "tests", "test_b.py"));
      fs.rmSync(path.join(site, "thirdparty.py"));
      trustVenv();
    }
  });

  // Trust by content (./venv-trust.ts): whatever made the environment.
  it("an environment nobody trusted yet asks; approving at Enclawed's prompt trusts it as it is", async () => {
    const fresh = memoryVenvTrustStore();
    const d = await decidePreAction(
      shellEvent(".venv/bin/python -m pytest -q"),
      engineOptions(undefined, fresh) as never,
    );
    expect(d.outcome).not.toBe("allow");
    expect(String((d as { reason?: string }).reason)).toMatch(/has not been trusted yet/);
    const engine = new DecisionEngine(engineOptions(undefined, fresh) as never);
    const asked = await engine.preAction(
      shellEvent(".venv/bin/python -m pytest -q", "person"),
      async (req) => req.code,
    );
    expect(asked.answer).toBe("allow");
    const again = await decidePreAction(
      shellEvent(".venv/bin/python -m pytest -q"),
      engineOptions(undefined, fresh) as never,
    );
    expect(again.outcome).toBe("allow");
  });

  it("a committed environment (it came with the repository) is not trusted until a person approves it", async () => {
    const git = (...args: string[]) =>
      spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], {
        cwd: proj,
        env: { PATH: "/usr/bin:/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1" },
      });
    git("add", "-f", ".venv");
    git("commit", "-q", "-m", "commit the environment");
    try {
      const d = await decidePreAction(
        shellEvent(".venv/bin/python3 -m pytest -q"),
        engineOptions(undefined, memoryVenvTrustStore()) as never,
      );
      expect(d.outcome).not.toBe("allow");
      expect(String((d as { reason?: string }).reason)).toMatch(/git tracks it/);
    } finally {
      git("rm", "-r", "-q", "--cached", ".venv");
      git("commit", "-q", "-m", "untrack");
    }
  });

  it("installed packages changed since they were trusted (an edit outside a containment) ask", async () => {
    const init = path.join(
      proj,
      ".venv",
      "lib",
      `python${PYVER}`,
      "site-packages",
      "pytest",
      "__init__.py",
    );
    const before = fs.readFileSync(init, "utf8");
    fs.appendFileSync(init, "\nopen('pwned', 'w').write('uid=planted')\n");
    try {
      const d = await decide(".venv/bin/python -m pytest -q");
      expect(d.outcome).not.toBe("allow");
      expect(String((d as { reason?: string }).reason)).toMatch(
        /changed since they were last trusted/,
      );
      // A new plugin in the environment (a pytest11 entry point) changes it too.
      fs.writeFileSync(init, before);
      trustVenv();
      const dist = path.join(
        proj,
        ".venv",
        "lib",
        `python${PYVER}`,
        "site-packages",
        "evil-1.0.dist-info",
      );
      fs.mkdirSync(dist);
      fs.writeFileSync(path.join(dist, "entry_points.txt"), "[pytest11]\nevil = evil\n");
      try {
        const e = await decide(".venv/bin/python -m pytest -q");
        expect(e.outcome).not.toBe("allow");
      } finally {
        fs.rmSync(dist, { recursive: true, force: true });
      }
    } finally {
      fs.writeFileSync(init, before);
      trustVenv();
    }
    expect((await decide(".venv/bin/python -m pytest -q")).outcome).toBe("allow");
  });

  // Host-side writes: what a later tool runs, or a contained run trusts, waits for a person.
  it.each([
    [`.venv/lib/python${PYVER}/site-packages/pytest/zz.py`],
    [`.venv/lib/python${PYVER}/site-packages/evil-1.0.dist-info/entry_points.txt`],
    [`.venv/lib/python${PYVER}/site-packages/_pytest/__init__.py`],
    [".venv/pyvenv.cfg"],
    ["__pycache__/m.cpython-314.pyc"],
    ["node_modules/.bin/x"],
  ])("a Write of %s waits for a person", async (rel) => {
    const d = await decideWrite(rel);
    expect([rel, d.outcome]).not.toEqual([rel, "allow"]);
  });

  it("an ordinary Write in the project is still a reversible write", async () => {
    const d = await decideWrite("src/ok.py");
    expect(d.outcome).toBe("allow");
  });

  it("a host redirect or copy into the environment's packages waits for a person; removing a cache does not", async () => {
    fs.writeFileSync(path.join(proj, "evil.py"), "open('pwned', 'w').write('uid=x')\n");
    try {
      for (const line of [
        `cat evil.py > .venv/lib/python${PYVER}/site-packages/pytest/zz2.py`,
        `cp evil.py .venv/lib/python${PYVER}/site-packages/pytest/zz3.py`,
      ]) {
        const d = await decide(line);
        expect([line, d.outcome]).not.toEqual([line, "allow"]);
      }
      fs.mkdirSync(path.join(proj, "__pycache__"), { recursive: true });
      fs.writeFileSync(path.join(proj, "__pycache__", "m.cpython-314.pyc"), "x");
      const rm = await decide("rm -rf __pycache__");
      expect(String((rm as { reason?: string }).reason ?? "")).not.toMatch(
        /configures what runs later/,
      );
    } finally {
      fs.rmSync(path.join(proj, "evil.py"), { force: true });
      fs.rmSync(path.join(proj, "__pycache__"), { recursive: true, force: true });
    }
  });

  it("a contained run (approved, unpinned) copies nothing into the environment; deleting its mark trusts nothing", async () => {
    const venv = fs.realpathSync(path.join(proj, ".venv"));
    fs.writeFileSync(path.join(proj, "evil.py"), "open('pwned', 'w').write('uid=x')\n");
    fs.writeFileSync(path.join(venv, ".enclawed-tainted"), "mark\n");
    const target = `.venv/lib/python${PYVER}/site-packages/pytest/zz.py`;
    try {
      fs.writeFileSync(
        path.join(proj, "x.sh"),
        `(cp evil.py ${target}) 2>/dev/null && echo COPIED || echo NOCOPY\n(rm .venv/.enclawed-tainted) 2>/dev/null && echo REMOVED || echo KEPT\n`,
      );
      const out = await runContained("sh x.sh", undefined);
      expect(out).toContain("NOCOPY");
      expect(fs.existsSync(path.join(proj, target))).toBe(false);
      // The mark only tells the person: trust is the record in Enclawed's state,
      // which the containment revokes when a run changed the packages anyway.
      const revoked = memoryVenvTrustStore();
      const d = await decidePreAction(
        shellEvent(".venv/bin/python -m pytest -q"),
        engineOptions(undefined, revoked) as never,
      );
      expect(d.outcome).not.toBe("allow");
    } finally {
      fs.rmSync(path.join(proj, "evil.py"), { force: true });
      fs.rmSync(path.join(proj, "x.sh"), { force: true });
      fs.rmSync(path.join(venv, ".enclawed-tainted"), { force: true });
    }
  });

  // Review: fingerprint blind spots and pytest's plugin settings.
  const siteDir = () => path.join(proj, ".venv", "lib", `python${PYVER}`, "site-packages");

  it("a sourceless .pyc planted in the packages changes the fingerprint", async () => {
    const pyc = path.join(siteDir(), "helperx.pyc");
    fs.writeFileSync(pyc, "not really bytecode");
    try {
      const d = await decide(".venv/bin/python -m pytest -q");
      expect(String((d as { reason?: string }).reason)).toMatch(
        /changed since they were last trusted/,
      );
    } finally {
      fs.rmSync(pyc, { force: true });
    }
    expect((await decide(".venv/bin/python -m pytest -q")).outcome).toBe("allow");
  });

  it("a change only of a file's change time asks; so does retargeting the environment's python", async () => {
    const init = path.join(siteDir(), "pytest", "__init__.py");
    const st = fs.statSync(init);
    fs.chmodSync(init, st.mode & 0o7777);
    fs.utimesSync(init, st.atime, st.mtime);
    try {
      expect(
        String(((await decide(".venv/bin/python -m pytest -q")) as { reason?: string }).reason),
      ).toMatch(/changed since they were last trusted/);
    } finally {
      trustVenv();
    }
    const link = path.join(proj, ".venv", "bin", "python3");
    const target = fs.readlinkSync(link);
    fs.rmSync(link);
    fs.symlinkSync(
      fs.realpathSync(target.startsWith("/") ? target : path.join(path.dirname(link), target)),
      link,
    );
    try {
      expect((await decide(".venv/bin/python -m pytest -q")).outcome).not.toBe("allow");
    } finally {
      fs.rmSync(link);
      fs.symlinkSync(target, link);
      trustVenv();
    }
  });

  it("the guard loads no sourceless bytecode from the environment, even trusted", async () => {
    const h = path.join(root, "helperx.py");
    fs.writeFileSync(h, "open('pwned', 'w').write('uid=sourceless')\n");
    const pyc = path.join(siteDir(), "helperx.pyc");
    expect(
      spawnSync("python3", [
        "-c",
        `import py_compile; py_compile.compile(${JSON.stringify(h)}, cfile=${JSON.stringify(pyc)})`,
      ]).status,
    ).toBe(0);
    fs.writeFileSync(path.join(proj, "s.py"), "import helperx\n");
    try {
      const venv = fs.realpathSync(path.join(proj, ".venv"));
      const sp = fs.realpathSync(siteDir());
      const code = {
        files: [
          {
            path: fs.realpathSync(path.join(proj, "s.py")),
            sha256: createHash("sha256")
              .update(fs.readFileSync(path.join(proj, "s.py")))
              .digest("hex"),
            exec: false,
          },
        ],
        pythonVenv: { dir: venv, site: sp, systemSite: false },
      } as ContainedCode;
      const out = await runContained(".venv/bin/python s.py", code);
      expect(out).toMatch(/bytecode is read only from the toolchain's own cached files/);
      expect(fs.existsSync(path.join(proj, "pwned"))).toBe(false);
    } finally {
      fs.rmSync(pyc, { force: true });
      fs.rmSync(path.join(proj, "s.py"), { force: true });
      fs.rmSync(path.join(proj, "pwned"), { force: true });
    }
  });

  it.each([
    ["conftest.py", "pytest_plugins = ['helper' + 'x']\n", /pytest_plugins/],
    ["conftest.py", "pytest_plugins = ['thirdx']\n", /thirdx/],
    ["conftest.py", "pytest_plugins = []\npytest_plugins.append('thirdx')\n", /pytest_plugins/],
    ["pytest.ini", "[pytest]\naddopts = -q -p thirdx\n", /addopts/],
    ["pyproject.toml", '[tool.pytest.ini_options]\naddopts = ["-p", "thirdx"]\n', /addopts/],
  ] as const)("%s %j: pytest's plugins are read like imports", async (file, text, why) => {
    fs.writeFileSync(path.join(siteDir(), "thirdx.py"), "X = 1\n");
    trustVenv();
    fs.writeFileSync(path.join(proj, file), text);
    try {
      const d = await decide(".venv/bin/python -m pytest -q");
      expect(d.outcome).not.toBe("allow");
      expect(String((d as { reason?: string }).reason)).toMatch(why);
    } finally {
      fs.rmSync(path.join(proj, file), { force: true });
      fs.rmSync(path.join(siteDir(), "thirdx.py"), { force: true });
      trustVenv();
    }
  });

  it("pytest's plugins from the line's environment are not run contained", async () => {
    const d = await decide("PYTEST_PLUGINS=thirdx .venv/bin/python -m pytest -q");
    expect(d.outcome).not.toBe("allow");
    expect((await decide(".venv/bin/python -m pytest -q")).outcome).toBe("allow");
  });
});
