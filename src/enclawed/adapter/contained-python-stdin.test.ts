// Live: Python read from a here-document (`python3 - <<'EOF'`) runs contained
// only with the digest Enclawed read (the python guard's standard-input pins,
// ../containment/code-guard.ts), and what the reader allowed actually runs.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { containmentSupport, lookupProgram } from "../containment/index.js";
import { fakeHome } from "../containment/test-helpers.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { containedExecution } from "./contained-exec.js";
import { scriptContainer } from "./contained-launch.js";
import { codePinsOf, decidePreAction } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { parseCompound } from "./shell-compound.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import type { ContainedCode } from "./types.js";

const live = containmentSupport().ok && lookupProgram("python3") !== null;

let root: string;
let proj: string;
let stateDir: string;

const put = (rel: string, s: string) => {
  fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
  fs.writeFileSync(path.join(proj, rel), s);
};
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** The pins the kit computes from its own reading of `line` (as the engine does). */
function readPins(line: string): ContainedCode {
  const parsed = parseCompound(line, { cwd: proj, home: null }, { fileRedirects: true });
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
  return {
    ...codePinsOf(v.files, v.executed, null),
    ...(v.stdin.length ? { stdin: v.stdin } : {}),
    ...(v.shellText.length ? { shellText: v.shellText } : {}),
  };
}

async function run(
  line: string,
  code: ContainedCode,
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
      code,
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
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-py-stdin-")));
  proj = path.join(root, "proj");
  stateDir = path.join(root, "state");
  fakeHome(root);
  put("helpers.py", "def double(x):\n    return 2 * x\n");
  put("data.json", '{"n": 21}\n');
  put("unread.py", 'open("pwned", "w").write("x")\n');
  const git = (...args: string[]) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], {
      cwd: proj,
      env: { PATH: "/usr/bin:/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1" },
    });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "initial");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!live)("python from a here-document, contained", () => {
  it("the engine offers it containment with the here-document's digest pinned, and it runs", async () => {
    const policy = createPolicy({
      enforceAllowlists: false,
      maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    });
    const line =
      "python3 - <<'EOF'\nimport json\nprint('n', json.load(open('data.json'))['n'] * 2)\nEOF";
    const d = await decidePreAction(
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
        home: path.join(root, "home"),
        hardware: () => ({ allowed: true }),
        history: { store: new HistoryStore({ dir: path.join(root, "h"), limits: policy.history }) },
        fs: nodeFsProbe(),
        containScripts: async (req) => ({ ok: true, command: req.command }),
      },
    );
    expect([d.outcome, d.codes]).toEqual(["allow", ["contained-execution"]]);
    expect(d.contain?.code?.stdin).toEqual([
      sha("import json\nprint('n', json.load(open('data.json'))['n'] * 2)\n"),
    ]);
    const r = await run(line, d.contain?.code as ContainedCode);
    expect([r.status, r.out]).toEqual([0, expect.stringContaining("n 42")]);
  });

  it("runs the code Enclawed read, with a project module it imports, and writes in the project", async () => {
    const line =
      "python3 - data.json <<'EOF'\nimport json, sys\nfrom helpers import double\nn = json.load(open(sys.argv[1]))['n']\nopen('out.txt', 'w').write(str(double(n)))\nprint('result', double(n), sys.argv[0])\nEOF";
    const r = await run(line, readPins(line));
    expect([r.status, r.out]).toEqual([0, expect.stringContaining("result 42 -")]);
    expect(fs.readFileSync(path.join(proj, "out.txt"), "utf8")).toBe("42");
  });

  it("a write the reader cannot see (a computed name) into .git/hooks is refused by the containment", async () => {
    const line =
      "python3 - <<'EOF'\nimport os\np = os.path.join('.g' + 'it', 'ho' + 'oks', 'pre-commit')\ntry:\n    open(p, 'w').write('#!/bin/sh\\nid\\n')\n    print('wrote')\nexcept OSError as e:\n    print('refused', e.errno)\nEOF";
    const r = await run(line, readPins(line));
    expect(r.out).toContain("refused");
    expect(fs.existsSync(path.join(proj, ".git", "hooks", "pre-commit"))).toBe(false);
  });

  it("code python3 cannot parse is offered containment and runs none of it", async () => {
    const line = "python3 - <<'EOF'\nopen('pwned', 'w').write('x')\nprint(1\nEOF";
    const r = await run(line, readPins(line));
    expect(r.out).toContain("SyntaxError");
    expect(fs.existsSync(path.join(proj, "pwned"))).toBe(false);
  });

  it("standard-input code whose digest was not read does not run", async () => {
    const line = "python3 - <<'EOF'\nopen('pwned', 'w').write('x')\nEOF";
    const r = await run(line, { files: [], stdin: [sha("print(1)\n")] });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("not one Enclawed read");
    expect(fs.existsSync(path.join(proj, "pwned"))).toBe(false);
    // No standard-input pin at all: nothing from standard input runs either.
    const none = await run(line, { files: [] });
    expect(none.status).not.toBe(0);
    expect(fs.existsSync(path.join(proj, "pwned"))).toBe(false);
  });

  it("a pipe into python3 with the pins of a here-document runs nothing", async () => {
    const r = await run("cat unread.py | python3 -", { files: [], stdin: [sha("print(1)\n")] });
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(proj, "pwned"))).toBe(false);
  });

  it("a module the reading did not pin does not load from standard-input code", async () => {
    const line = "python3 - <<'EOF'\nimport helpers\nprint('ok')\nEOF";
    const pins = readPins(line);
    const r = await run("python3 - <<'EOF'\nimport helpers\nimport unread\nprint('ok')\nEOF", {
      files: pins.files,
      stdin: [sha("import helpers\nimport unread\nprint('ok')\n")],
    });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("is not one of the files Enclawed read");
    expect(fs.existsSync(path.join(proj, "pwned"))).toBe(false);
  });
});
