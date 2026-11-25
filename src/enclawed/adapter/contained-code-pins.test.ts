// Code pins, live (../containment/code-guard.ts through ./contained-launch.ts
// scriptContainer, the seam an adapter uses): a command offered containment
// because Enclawed read what it runs loads and executes no other code from
// the project or a writable place, even when the reading missed something.
//
// The legitimate test suites (node --test, npm test, python -m unittest, a
// python script) pass with the pins the kit computes from its own reading
// (containedExecution + codePinsOf). For the attacks the reader is bypassed
// on purpose (a reader miss is the premise): the pins hold what a reader that
// missed the computed load would have read, and the run must still fail to
// load what was not read.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { containmentSupport, lookupProgram, planContainment } from "../containment/index.js";
import { projectScriptDeclaration } from "../containment/mcp.js";
import { fakeHome, planContext } from "../containment/test-helpers.js";
import { containedExecution } from "./contained-exec.js";
import { scriptContainer } from "./contained-launch.js";
import { codePinsOf } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { parseCompound } from "./shell-compound.js";
import type { ContainedCode } from "./types.js";

const live = containmentSupport().ok;
const python = lookupProgram("python3") !== null;

let root: string;
let proj: string;
let stateDir: string;

const put = (rel: string, s: string) => {
  fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
  fs.writeFileSync(path.join(proj, rel), s);
};
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** The pins the kit computes from its own reading of `line`. */
function readPins(line: string): ContainedCode {
  const parsed = parseCompound(line, { cwd: proj, home: null });
  if (!parsed.ok) {
    throw new Error(`unparsed: ${line}`);
  }
  const v = containedExecution(
    {
      projectDir: proj,
      home: null,
      fs: nodeFsProbe(),
      repositoryEnv: [],
      equalsCommitted: () => true,
    },
    parsed.commands,
  );
  if (!v.ok) {
    throw new Error(`not offered containment: ${v.why}`);
  }
  return codePinsOf(v.files, v.executed, null);
}

/** Pins naming exactly these project files (what a reader that missed something would have read). */
function pinsOf(...rels: string[]): ContainedCode {
  return {
    files: rels.map((r) => {
      const p = fs.realpathSync(path.join(proj, r));
      return { path: p, sha256: sha(fs.readFileSync(p)), exec: false };
    }),
  };
}

/** Run `line` contained, the way an adapter does (scriptContainer), with these pins. */
async function run(
  line: string,
  code: ContainedCode | undefined,
): Promise<{ status: number | null; out: string }> {
  const sc = scriptContainer({ stateDir });
  try {
    const r = await sc.contain({
      kind: "project-script",
      label: line,
      command: line,
      dialect: "posix",
      cwd: proj,
      projectDir: proj,
      ...(code ? { code } : {}),
    });
    if (!r.ok) {
      return { status: -1, out: `${r.code}: ${r.message}` };
    }
    const p = spawnSync("/bin/sh", ["-c", r.command], { encoding: "utf8", timeout: 60_000 });
    return { status: p.status, out: `${p.stdout}\n${p.stderr}` };
  } finally {
    await sc.close();
  }
}

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-code-pins-")));
  proj = path.join(root, "proj");
  stateDir = path.join(root, "state");
  fakeHome(root);
  put(
    "package.json",
    '{\n  "name": "tiny",\n  "type": "module",\n  "scripts": { "test": "node --test" }\n}\n',
  );
  put("src/math.js", "export function add(a, b) {\n  return a + b;\n}\n");
  put(
    "test/math.test.js",
    'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { add } from "../src/math.js";\ntest("add", () => assert.equal(add(2, 3), 5));\n',
  );
  // Not read by anyone: what an attack loads by a name it computes.
  put("lib/evil.cjs", 'require("node:fs").writeFileSync("pwned", "x");\nmodule.exports = 1;\n');
  put("lib/evil.mjs", 'import fs from "node:fs";\nfs.writeFileSync("pwned", "x");\n');
  put("lib/evil_mod.py", 'open("pwned", "w").write("x")\n');
  put(
    "attack/require.cjs",
    'const path = require("node:path");\nconst name = ["..", "lib", "evil" + ".cjs"].join("/");\nrequire(path.join(__dirname, name));\nconsole.log("loaded");\n',
  );
  put(
    "attack/import.mjs",
    'const name = "../lib/" + "evil" + ".mjs";\nawait import(new URL(name, import.meta.url).href);\nconsole.log("loaded");\n',
  );
  put(
    "attack/data-url.mjs",
    'await import("data:text/javascript," + encodeURIComponent("console.log(1)"));\nconsole.log("loaded");\n',
  );
  put("attack/function.cjs", 'new Function("return 1")();\nconsole.log("loaded");\n');
  put(
    "attack/written.cjs",
    'const fs = require("node:fs");\nfs.writeFileSync(__dirname + "/gen.cjs", "module.exports = 2");\nrequire("./gen" + ".cjs");\nconsole.log("loaded");\n',
  );
  put(
    "attack/tmp-exec.sh",
    '#!/bin/sh\nprintf "#!/bin/sh\\necho ran\\n" > /tmp/x.sh\nchmod +x /tmp/x.sh\n/tmp/x.sh && echo loaded\n',
  );
  put(
    "attack/import_mod.py",
    'import importlib, sys, os\nsys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))\nimportlib.import_module("evil" + "_mod")\nprint("loaded")\n',
  );
  put("attack/exec.py", 'exec("print(1)")\nprint("loaded")\n');
  put("py/calc.py", "def double(x):\n    return 2 * x\n");
  put(
    "py/test_calc.py",
    "import unittest\nfrom calc import double\n\nclass T(unittest.TestCase):\n    def test_double(self):\n        self.assertEqual(double(2), 4)\n\nif __name__ == '__main__':\n    unittest.main()\n",
  );
  put(
    "py/dc.py",
    "from dataclasses import dataclass\nfrom collections import namedtuple\nfrom calc import double\n\n@dataclass\nclass A:\n    x: int\n\nP = namedtuple('P', 'a b')\nprint('ok', A(double(1)).x, P(1, 2).a)\n",
  );
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!live)("code pins: legitimate runs pass with the kit's own pins", () => {
  it("node --test and npm test", async () => {
    for (const line of ["node --test", "npm test"]) {
      const code = readPins(line);
      expect(code.files.map((f) => path.relative(proj, f.path)).toSorted()).toEqual(
        expect.arrayContaining(["src/math.js", "test/math.test.js"]),
      );
      const r = await run(line, code);
      expect([line, r.status, r.out]).toEqual([line, 0, expect.stringContaining("pass 1")]);
    }
  });

  it.skipIf(!python)(
    "python -m unittest and a python script using dataclasses and namedtuple",
    async () => {
      for (const [line, want] of [
        ["cd py && python3 -m unittest test_calc", "OK"],
        ["cd py && python3 dc.py", "ok 2 1"],
      ] as const) {
        const r = await run(line, readPins(line));
        expect([line, r.status, r.out]).toEqual([line, 0, expect.stringContaining(want)]);
      }
    },
  );
});

describe.skipIf(!live)("code pins: inline code the line carries", () => {
  it("node -e and node -p run their (read) inline code", async () => {
    const code = readPins(`node -e 'console.log("E" + (40 + 2))'`);
    const r = await run(`node -e 'console.log("E" + (40 + 2))'`, code);
    expect([r.status, r.out]).toEqual([0, expect.stringContaining("E42")]);
    const p = await run("node -p '6 * 7'", readPins("node -p '6 * 7'"));
    expect([p.status, p.out]).toEqual([0, expect.stringContaining("42")]);
  });
});

describe.skipIf(!live)("code pins: what the reading missed does not load", () => {
  const notLoaded = (r: { status: number | null; out: string }) => {
    expect(r.out).not.toContain("loaded\n");
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(proj, "pwned"))).toBe(false);
    expect(fs.existsSync(path.join(proj, "attack", "pwned"))).toBe(false);
  };

  it("a require() of a path built at run time, of a file not in the read set, fails", async () => {
    const r = await run("node attack/require.cjs", pinsOf("attack/require.cjs"));
    notLoaded(r);
    expect(r.out).toContain("ERR_ENCLAWED_CODE_NOT_READ");
    // The same run with the file pinned (read) loads it: the guard refuses only what was not read.
    const ok = await run("node attack/require.cjs", pinsOf("attack/require.cjs", "lib/evil.cjs"));
    expect(ok.out).toContain("loaded");
    fs.rmSync(path.join(proj, "pwned"), { force: true });
  });

  it("a computed dynamic import, a data: URL, new Function, and a file the run writes itself fail", async () => {
    for (const [f, why] of [
      ["attack/import.mjs", /ERR_ENCLAWED_CODE_NOT_READ/],
      ["attack/data-url.mjs", /a data: URL was not loaded/],
      ["attack/function.cjs", /Code generation from strings disallowed/],
      ["attack/written.cjs", /ERR_ENCLAWED_CODE_NOT_READ/],
    ] as const) {
      const r = await run(`node ${f}`, pinsOf(f));
      notLoaded(r);
      expect([f, r.out]).toEqual([f, expect.stringMatching(why)]);
    }
  });

  it("a pinned file whose content changed after it was read does not load", async () => {
    const pins = pinsOf("attack/require.cjs", "lib/evil.cjs");
    fs.appendFileSync(path.join(proj, "lib/evil.cjs"), "// changed\n");
    notLoaded(await run("node attack/require.cjs", pins));
  });

  it("an ES module whose content changed after it was read does not load", async () => {
    put("esm/main.mjs", 'await import("./dep.mjs");\nconsole.log("loaded");\n');
    put("esm/dep.mjs", "export const x = 1;\n");
    const pins = pinsOf("esm/main.mjs", "esm/dep.mjs");
    const ok = await run("node esm/main.mjs", pins);
    expect(ok.out).toContain("loaded");
    fs.appendFileSync(
      path.join(proj, "esm/dep.mjs"),
      'import fs from "node:fs";\nfs.writeFileSync("pwned", "x");\n',
    );
    const r = await run("node esm/main.mjs", pins);
    notLoaded(r);
    expect(r.out).toContain("its content is not what Enclawed read");
  });

  it("node options that load other code first are refused; NODE_OPTIONS from the line is replaced", async () => {
    const pins = pinsOf("attack/require.cjs");
    for (const line of [
      "node -r ./lib/evil.cjs attack/require.cjs",
      "node --import ./lib/evil.mjs attack/require.cjs",
      "node --experimental-loader ./lib/evil.mjs attack/require.cjs",
      "NODE_OPTIONS=--require=./lib/evil.cjs node attack/require.cjs",
      "env -i NODE_OPTIONS=--require=./lib/evil.cjs node attack/require.cjs",
    ]) {
      const r = await run(line, pins);
      notLoaded(r);
      expect([line, r.out]).toEqual([
        line,
        expect.stringMatching(
          /is not an option this contained run takes|ERR_ENCLAWED_CODE_NOT_READ/,
        ),
      ]);
    }
  });

  it("a program written to a writable place at run time is not executed (noexec)", async () => {
    const r = await run("sh attack/tmp-exec.sh", pinsOf("attack/tmp-exec.sh"));
    expect(r.out).not.toContain("loaded");
    expect(r.out).toMatch(/Permission denied|not permitted/);
  });

  it.skipIf(!python)(
    "python: a computed import of an unread module and exec of a string fail",
    async () => {
      const i = await run("python3 attack/import_mod.py", pinsOf("attack/import_mod.py"));
      notLoaded(i);
      expect(i.out).toContain("is not one of the files Enclawed read");
      const e = await run("python3 attack/exec.py", pinsOf("attack/exec.py"));
      notLoaded(e);
      expect(e.out).toContain("code built at run time");
      // A form the guard does not take (code from the input) runs nothing.
      const stdin = await run("echo 'print(1)' | python3", pinsOf("attack/exec.py"));
      expect(stdin.status).not.toBe(0);
    },
  );
});

describe("code pins: the plan", () => {
  it("is refused when the run includes an interpreter the guard does not cover", () => {
    const perl = lookupProgram("perl");
    if (!perl) {
      return;
    }
    const home = fakeHome(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-code-pins-plan-")));
    const p = planContainment(
      projectScriptDeclaration({
        label: "t",
        projectDir: proj,
        command: "sh",
        args: ["-c", "perl x.pl"],
        programs: ["perl"],
        codePins: [],
      }),
      planContext(home),
    );
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.code).toBe("containment-command-not-allowed");
    }
  });

  it("makes every writable place noexec and wraps node and python", () => {
    const home = fakeHome(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-code-pins-plan-")));
    const p = planContainment(
      projectScriptDeclaration({
        label: "t",
        projectDir: proj,
        command: "sh",
        args: ["-c", "node --test"],
        programs: python ? ["python3"] : [],
        codePins: pinsOf("src/math.js").files,
      }),
      planContext(home),
    );
    expect(p.ok).toBe(true);
    if (!p.ok) {
      return;
    }
    expect(p.plan.strictExec).toBe(true);
    const writable = p.plan.ops.filter((o) => (o.op === "bind" && !o.ro) || o.op === "tmpfs");
    expect(writable.length).toBeGreaterThan(0);
    for (const o of writable) {
      expect([o.path, (o as { exec: boolean }).exec]).toEqual([o.path, false]);
    }
    const node = fs.realpathSync(lookupProgram("node")!);
    expect(p.plan.ops).toContainEqual(
      expect.objectContaining({ op: "file", path: node, mode: 0o755 }),
    );
    expect(p.plan.ops).toContainEqual(
      expect.objectContaining({ op: "file", path: "/.enclawed/code/node-guard.cjs" }),
    );
  });
});
