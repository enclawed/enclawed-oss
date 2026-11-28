// Live regressions from the independent review of 2.0.5: each line was
// decided "allow, contained" and then ran a program in the real containment.
// Each must now either not be offered containment, or run without the
// injected program running (no `id` output in `pwned`).

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "../classification.js";
import { containedSeccompFilter, containmentSupport, lookupProgram } from "../containment/index.js";
import { realProgramCopy } from "../containment/real-copies.js";
import { fakeHome } from "../containment/test-helpers.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import { containedExecution, projectSnapshotPlan, resolveViewPath } from "./contained-exec.js";
import { scriptContainer } from "./contained-launch.js";
import { decidePreAction } from "./engine.js";
import { nodeFsProbe } from "./fs-probe.js";
import { parseCompound } from "./shell-compound.js";
import { NO_SHELL_DEFINITIONS } from "./shell-definitions.js";
import type { ContainedCode } from "./types.js";

const live = containmentSupport().ok && lookupProgram("python3") !== null;
const roots: string[] = [];
const PYVER = (() => {
  const r = spawnSync("python3", ["-c", "import sys;print('%d.%d' % sys.version_info[:2])"], {
    encoding: "utf8",
  });
  return r.stdout.trim() || "3";
})();

afterAll(() => {
  for (const r of roots) {
    fs.rmSync(r, { recursive: true, force: true });
  }
});

function project(
  files: Record<string, string | Buffer>,
  links: Record<string, string> = {},
): { root: string; proj: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-pyesc-")));
  roots.push(root);
  const proj = path.join(root, "proj");
  fs.mkdirSync(proj, { recursive: true });
  fakeHome(root);
  for (const [rel, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
    fs.writeFileSync(path.join(proj, rel), s);
  }
  for (const [rel, target] of Object.entries(links)) {
    fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
    fs.symlinkSync(target, path.join(proj, rel));
  }
  const git = (...args: string[]) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], {
      cwd: proj,
      env: { PATH: "/usr/bin:/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1" },
    });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "initial", "--allow-empty");
  return { root, proj };
}

/** Decide through the engine; when it is allowed contained, run it in the real containment. */
async function attempt(
  line: string,
  files: Record<string, string | Buffer> = {},
  links: Record<string, string> = {},
  prepare: ((proj: string) => void) | null = null,
  onOut: ((out: string) => void) | null = null,
): Promise<{ contained: boolean; ran: boolean }> {
  const { root, proj } = project(files, links);
  prepare?.(proj);
  const policy = createPolicy({
    enforceAllowlists: false,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
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
  if (d.outcome !== "allow" || !d.contain?.code) {
    return { contained: false, ran: false };
  }
  const sc = scriptContainer({ stateDir: path.join(root, "state") });
  try {
    const r = await sc.contain({
      kind: "project-script",
      label: line,
      command: line,
      dialect: "posix",
      cwd: proj,
      projectDir: proj,
      code: d.contain.code as ContainedCode,
    });
    if (r.ok) {
      const p = spawnSync("/bin/sh", ["-c", r.command], { encoding: "utf8", timeout: 60_000 });
      onOut?.(`${p.stdout}\n${p.stderr}`);
    }
  } finally {
    await sc.close();
  }
  const pwned = path.join(proj, "pwned");
  return {
    contained: true,
    ran: fs.existsSync(pwned) && fs.readFileSync(pwned, "utf8").includes("uid="),
  };
}

const H = (code: string, pre = "python3 -") => `${pre} <<'EOF'\n${code}\nEOF`;
// A zip holding zmod.pyc, compiled from `import os; os.system('id > pwned')`.
const ZIP_B64 =
  "UEsDBBQAAAAAAG4Oe11Uct/uuwAAALsAAAAIAAAAem1vZC5weWMrDg0KAAAAAAAAAAAAAAAA4wAAAAAAAAAAAAAAAAMAAAAAAAAA8zIAAACAAF4AUgFJAHQAXQBQAgAAAAAAAAAAAAAAAAAAAAAAACEAUgI0AQAAAAAAAB8AUgEjACkD6QAAAABOegppZCA+IHB3bmVkKQLaAm9z2gZzeXN0ZW2pAPMAAAAA2gM8ej7aCDxtb2R1bGU+cggAAAABAAAAcxQAAADwAwEBAdsACdgAAocJggmILNYAF3IGAAAAUEsBAhQDFAAAAAAAbg57XVRy3+67AAAAuwAAAAgAAAAAAAAAAAAAAIABAAAAAHptb2QucHljUEsFBgAAAAABAAEANgAAAOEAAAAAAA==";
// A codec the run registers, returning other source than the file's bytes.
const REG = `import codecs
EVIL = "import os\\nos.system('id > pwned')\\n"
def dec(b, errors='strict'):
    return (EVIL, len(b))
def enc(s, errors='strict'):
    return (s.encode('ascii'), len(s))
def search(name):
    if name == 'evilenc':
        return codecs.CodecInfo(enc, dec, name='evilenc')
    return None
codecs.register(search)
`;

// namedtuple steered through names the run put into collections (zz-a7 of the review).
const NT = `import collections
class Evil(str):
    def isidentifier(self):
        return True
def mytype(*a):
    if len(a) == 1 and isinstance(a[0], Evil):
        return str
    return type(*a)
def mymap(f, *its):
    if len(its) == 1:
        items = list(its[0])
        if any(isinstance(x, Evil) for x in items):
            return iter(items)
    return map(f, *its)
setattr(collections, "type", mytype)
setattr(collections, "map", mymap)
PAY = "a=[c for c in ().__class__.__base__.__subclasses__() if c.__name__ == '_wrap_close'][0].__init__.__globals__['sys' + 'tem']('id > pwned'):0#"
T = collections.namedtuple("T", [Evil(PAY)])
print("made", T)`;
// The same through argparse: parse_args(namespace=collections) sets collections.map.
const NT_ARGPARSE = `import argparse, collections
class Evil(str):
    def isidentifier(self):
        return True
def mymap(f, *its):
    if len(its) == 1:
        items = list(its[0])
        if any(isinstance(x, Evil) for x in items):
            return iter(items)
    return map(f, *its)
p = argparse.ArgumentParser()
p.add_argument("--m", dest="map", default=mymap)
p.add_argument("--t", dest="type", default=lambda *a: str if len(a) == 1 and isinstance(a[0], Evil) else type(*a))
p.parse_args([], namespace=collections)
PAY = "a=[c for c in ().__class__.__base__.__subclasses__() if c.__name__ == '_wrap_close'][0].__init__.__globals__['sys' + 'tem']('id > pwned'):0#"
collections.namedtuple("T", [Evil(PAY)])
print("made")`;

/** Run `line` contained with exactly these project files pinned (no engine: what the guard alone does). */
async function runPinned(
  files: Record<string, string | Buffer>,
  line: string,
  pinned: readonly string[],
  links: Record<string, string> = {},
): Promise<{ out: string; ran: boolean }> {
  const { root, proj } = project(files, links);
  const code: ContainedCode = {
    files: pinned.map((rel) => {
      const f = fs.realpathSync(path.join(proj, rel));
      return {
        path: f,
        sha256: createHash("sha256").update(fs.readFileSync(f)).digest("hex"),
        exec: false,
      };
    }),
  };
  const sc = scriptContainer({ stateDir: path.join(root, "state") });
  let out = "";
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
    expect(r.ok).toBe(true);
    if (r.ok) {
      const p = spawnSync("/bin/sh", ["-c", r.command], { encoding: "utf8", timeout: 60_000 });
      out = `${p.stdout}\n${p.stderr}`;
    }
  } finally {
    await sc.close();
  }
  const pwned = path.join(proj, "pwned");
  return { out, ran: fs.existsSync(pwned) && fs.readFileSync(pwned, "utf8").includes("uid=") };
}
// A field name dataclasses would paste into the source it executes.
const N = `"a=__import__('os').system('id > pwned')or '''):pass\\n x=\\"\\"\\""`;

describe.skipIf(!live)("review of 2.0.5: no injected program runs", () => {
  it.each([
    [
      "dataclasses: a field name pasted into generated source",
      H(
        `import dataclasses\nclass C:\n    __annotations__ = {${N}: int}\ndataclasses.dataclass(repr=False, eq=False)(C)\nprint("done")`,
      ),
      {},
    ],
    [
      "dataclasses through type()",
      H(
        `import dataclasses\nC = dataclasses.dataclass(repr=False, eq=False)(type("C", (), {"__annotations__": {${N}: int}}))`,
      ),
      {},
    ],
    [
      "dataclasses through __annotate__",
      H(
        `from dataclasses import dataclass\nclass C:\n    def __annotate__(format):\n        return {${N}: int}\ndataclass(repr=False, eq=False)(C)`,
      ),
      {},
    ],
    [
      "dataclasses from a script file",
      "python3 ok.py",
      {
        "ok.py": `import dataclasses\nN = ${N}\nC = dataclasses.dataclass(repr=False, eq=False)(type("C", (), {"__annotations__": {N: int}}))\n`,
      },
    ],
    [
      "PYTHONUSERBASE before python: a .pth there runs at start",
      `PYTHONUSERBASE=ub ${H("print('second')")}`,
      { [`ub/lib/python${PYVER}/site-packages/z.pth`]: "import os; os.system('id > pwned')\n" },
    ],
    [
      "export PYTHONUSERBASE",
      `export PYTHONUSERBASE=ub; ${H("print('second')")}`,
      { [`ub/lib/python${PYVER}/site-packages/z.pth`]: "import os; os.system('id > pwned')\n" },
    ],
    [
      "PYTHONUSERBASE usercustomize",
      `PYTHONUSERBASE=ub ${H("print('hi')")}`,
      {
        [`ub/lib/python${PYVER}/site-packages/usercustomize.py`]:
          "import os\nos.system('id > pwned')\n",
      },
    ],
    [
      "PYTHONUSERBASE with a script",
      "PYTHONUSERBASE=ub python3 ok.py",
      {
        "ok.py": "print('ok')\n",
        [`ub/lib/python${PYVER}/site-packages/z.pth`]: "import os; os.system('id > pwned')\n",
      },
    ],
    [
      "PYTHONHOME pointing at a fake standard library",
      `PYTHONHOME=ub ${H("print(1)")}`,
      {
        [`ub/lib/python${PYVER}/os.py`]: "",
        [`ub/lib/python${PYVER}/encodings/__init__.py`]:
          "import posix\nposix.system('id > pwned')\n",
      },
    ],
    [
      "a first python writes a user-site .pth, a second python on the line starts",
      `${H(
        `import os\nd = os.path.join(os.path.expanduser('~'), '.local', 'lib', 'python${PYVER}', 'site-packages')\nos.makedirs(d, exist_ok=True)\nopen(os.path.join(d, 'z' + '.pth'), 'w').write("import os; os.system('id > pwned')\\n")`,
      )}\n${H("print('second')")}`,
      {},
    ],
    [
      "PYTHONUSERBASE with -c",
      "PYTHONUSERBASE=ub python3 -c 'print(1)'",
      { [`ub/lib/python${PYVER}/site-packages/z.pth`]: "import os; os.system('id > pwned')\n" },
    ],
    [
      "PYTHONHOME with python -m unittest",
      "PYTHONHOME=ub python3 -m unittest test_x",
      {
        "test_x.py": "import unittest\n",
        [`ub/lib/python${PYVER}/os.py`]: "",
        [`ub/lib/python${PYVER}/encodings/__init__.py`]:
          "import posix\nposix.system('id > pwned')\n",
      },
    ],
    [
      "a zip on sys.path holding a .pyc (script)",
      "python3 ok.py",
      {
        "ok.py": "import sys\nsys.path.insert(0, 'vendor.zip')\nimport zmod\nprint('after')\n",
        "vendor.zip": Buffer.from(ZIP_B64, "base64"),
      },
    ],
    [
      "a zip the program writes, then puts on sys.path",
      H(
        `import base64, sys\nopen('lib.zip', 'wb').write(base64.b64decode('${ZIP_B64}'))\nsys.path.insert(0, 'lib.zip')\nimport zmod\nprint('after')`,
      ),
      {},
    ],
    [
      "a .pyc the program writes, then imports",
      H(
        `import base64, zipfile, io\nz = zipfile.ZipFile(io.BytesIO(base64.b64decode('${ZIP_B64}')))\nopen('zmod.pyc', 'wb').write(z.read('zmod.pyc'))\nimport zmod\nprint('after')`,
      ),
      {},
    ],
    [
      "a codec the program registers, named by a module's coding line (stdin)",
      H(`${REG}import mod\nprint('after')`),
      { "mod.py": "# coding: evilenc\nX = 1\n" },
    ],
    [
      "a codec the program registers, named by a module's coding line (script)",
      "python3 main.py",
      { "main.py": `${REG}import mod\nprint('after')\n`, "mod.py": "# coding: evilenc\nX = 1\n" },
    ],
    [
      "os.chdir, then a relative sys.path entry",
      H("import os, sys\nos.chdir('sub')\nsys.path.insert(0, 'lib')\nimport evil\nprint('after')"),
      { "sub/lib/evil.py": "import os\nos.system('id > ../pwned')\n" },
    ],
    ["namedtuple steered by names set on collections (stdin)", H(NT), {}],
    [
      "namedtuple steered by names set on collections (script)",
      "python3 s.py",
      { "s.py": `${NT}\n` },
    ],
    [
      "namedtuple steered by names set on collections (-c)",
      `python3 -c '${NT.replace(/'/g, "'\\''")}'`,
      {},
    ],
    ["namedtuple steered through argparse's namespace=collections", H(NT_ARGPARSE), {}],
  ] as const)("%s", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string | Buffer>);
    expect(r.ran).toBe(false);
  });

  it("the wrapper alone (no engine): PYTHONUSERBASE and PYTHONHOME set on the line load nothing", async () => {
    for (const [pre, files] of [
      [
        "PYTHONUSERBASE=ub",
        { [`ub/lib/python${PYVER}/site-packages/z.pth`]: "import os; os.system('id > pwned')\n" },
      ],
      [
        "PYTHONHOME=ub",
        {
          [`ub/lib/python${PYVER}/os.py`]: "",
          [`ub/lib/python${PYVER}/encodings/__init__.py`]:
            "import posix\nposix.system('id > pwned')\n",
        },
      ],
    ] as const) {
      const { root, proj } = project({ "ok.py": "print('ok')\n", ...files });
      const ok = fs.realpathSync(path.join(proj, "ok.py"));
      const code: ContainedCode = {
        files: [
          {
            path: ok,
            sha256: createHash("sha256").update(fs.readFileSync(ok)).digest("hex"),
            exec: false,
          },
        ],
      };
      const sc = scriptContainer({ stateDir: path.join(root, "state") });
      try {
        const line = `${pre} python3 ok.py`;
        const r = await sc.contain({
          kind: "project-script",
          label: line,
          command: line,
          dialect: "posix",
          cwd: proj,
          projectDir: proj,
          code,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
          const p = spawnSync("/bin/sh", ["-c", r.command], { encoding: "utf8", timeout: 60_000 });
          expect(p.stdout).toContain("ok");
        }
      } finally {
        await sc.close();
      }
      expect(fs.existsSync(path.join(proj, "pwned"))).toBe(false);
    }
  });

  it("the guard alone: a zip on sys.path, a written .pyc and a registered codec load nothing", async () => {
    const zip = await runPinned(
      {
        "ok.py": "import sys\nsys.path.insert(0, 'vendor.zip')\nimport zmod\nprint('after')\n",
        "vendor.zip": Buffer.from(ZIP_B64, "base64"),
      },
      "python3 ok.py",
      ["ok.py"],
    );
    expect(zip.ran).toBe(false);
    const pyc = await runPinned(
      {
        "ok.py": `import base64, zipfile, io\nz = zipfile.ZipFile(io.BytesIO(base64.b64decode('${ZIP_B64}')))\nopen('zmod.pyc', 'wb').write(z.read('zmod.pyc'))\nimport zmod\nprint('after')\n`,
      },
      "python3 ok.py",
      ["ok.py"],
    );
    expect(pyc.ran).toBe(false);
    // The refusal reads cleanly: frozen modules imported afterwards still load.
    expect(pyc.out).toContain("cached bytecode is not read from a writable place");
    expect(pyc.out).not.toContain("Frozen object");
    const codec = await runPinned(
      { "main.py": `${REG}import mod\nprint('after')\n`, "mod.py": "# coding: evilenc\nX = 1\n" },
      "python3 main.py",
      ["main.py", "mod.py"],
    );
    expect(codec.ran).toBe(false);
    // dataclasses called by the run's own code builds no source from its names.
    const dc = await runPinned(
      {
        "ok.py": `import dataclasses\nN = ${N}\nC = dataclasses.dataclass(repr=False, eq=False)(type("C", (), {"__annotations__": {N: int}}))\n`,
      },
      "python3 ok.py",
      ["ok.py"],
    );
    expect(dc.ran).toBe(false);
    // namedtuple steered through collections' own names: the template check refuses it.
    for (const prog of [NT, NT_ARGPARSE]) {
      const nt = await runPinned({ "s.py": `${prog}\n` }, "python3 s.py", ["s.py"]);
      expect(nt.ran).toBe(false);
    }
    // What these rules leave alone still runs: a pinned script with a utf-8 coding
    // line importing a pinned module, and a namedtuple.
    const ok = await runPinned(
      {
        "main.py":
          "# -*- coding: utf-8 -*-\nfrom collections import namedtuple\nimport typing, traceback, unittest, argparse\nimport helper\nP = namedtuple('P', 'a b')\nQ = namedtuple('Q', 'x')\nR = namedtuple('R', ['ok', 'def', 'ok'], rename=True)\nclass S(typing.NamedTuple):\n    u: int\n    v: str = 'w'\nprint('fine', helper.X, P(1, 2).b, Q(3).x, R(1, 2, 3)._1, S(4).v)\n",
        "helper.py": "# coding: latin-1\nX = 7\n",
      },
      "python3 main.py",
      ["main.py", "helper.py"],
    );
    expect(ok.out).toContain("fine 7 2 3 2 w");
  });

  // Review round 2: a script the line changes before the shell reads it.
  const W_PY = "n = 's' + '.sh'\nf = open(n, 'w')\nf.write('id > pwned\\n')\nf.close()\n";
  const ID = { "e.txt": "id > pwned\n", "s.sh": "echo hi\n" };
  it.each([
    [
      "python writes the script, then sh runs it",
      "python3 w.py && sh s.sh",
      { "w.py": W_PY, "s.sh": "echo hi\n" },
    ],
    [
      "python writes the script, then it runs directly",
      "python3 w.py && ./s.sh",
      { "w.py": W_PY, "s.sh": "#!/bin/sh\necho hi\n" },
    ],
    [
      "python writes the script, then bash runs it",
      "python3 w.py; bash s.sh",
      { "w.py": W_PY, "s.sh": "echo hi\n" },
    ],
    [
      "the script runs python, which rewrites the script",
      "sh s.sh",
      { "w.py": W_PY, "s.sh": "python3 w.py\necho end\n" },
    ],
    ["cp onto the script, then sh", "cp e.txt s.sh && sh s.sh", ID],
    [
      "node writes the script, then sh",
      "node w.js && sh s.sh",
      { "w.js": "require('fs').writeFileSync('s'+'.sh','id > pwned\\n')\n", "s.sh": "echo hi\n" },
    ],
    ["mv onto the script, then sh", "mv e.txt s.sh && sh s.sh", ID],
    ["cat into the script, then sh", "cat e.txt > s.sh && sh s.sh", ID],
    ["cp onto the script, then source it", "cp e.txt s.sh && . ./s.sh", ID],
    [
      "cp onto a python script, then python",
      "cp e.txt s.py && python3 s.py",
      { "e.txt": "import os\nos.system('id > pwned')\n", "s.py": "print(1)\n" },
    ],
    [
      "cp a directory's script over, then sh",
      "cp e/s.sh . && sh s.sh",
      { "e/s.sh": "id > pwned\n", "s.sh": "echo hi\n" },
    ],
    ["cp to a new script, then sh", "cp e.txt n.sh && sh n.sh", { "e.txt": "id > pwned\n" }],
    [
      "cp onto a sed script, then sed -f",
      "cp e.sed s.sed && sed -f s.sed x.txt",
      { "e.sed": "1e id > pwned\n", "s.sed": "s/a/b/\n", "x.txt": "a\n" },
    ],
    [
      "cp onto an awk script, then awk -f",
      "cp e.awk s.awk && awk -f s.awk x.txt",
      { "e.awk": '{ system("id > pwned") }\n', "s.awk": "{ print }\n", "x.txt": "a\n" },
    ],
    [
      "python writes a script missing when read, then sh",
      "python3 w.py && sh s.sh",
      { "w.py": W_PY },
    ],
    [
      "a python here-document writes the script, then sh",
      "python3 - <<'EOF'\nf = open('s' + '.sh', 'w')\nf.write('id > pwned')\nf.close()\nEOF\nsh s.sh",
      {},
    ],
  ] as const)("%s", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string>);
    expect(r.ran).toBe(false);
  });

  it("the shell guard alone: a replaced script runs as the copy read; an unread script is refused", async () => {
    const { root, proj } = project({
      "e.txt": "id > pwned\n",
      "s.sh": "echo copy-ran > out.txt\n",
    });
    const s = fs.realpathSync(path.join(proj, "s.sh"));
    const content = fs.readFileSync(s);
    const code: ContainedCode = {
      files: [
        {
          path: s,
          sha256: createHash("sha256").update(content).digest("hex"),
          exec: false,
          shell: true,
          contentBase64: content.toString("base64"),
        },
      ],
    };
    const sc = scriptContainer({ stateDir: path.join(root, "state") });
    try {
      for (const line of ["cp e.txt s.sh && sh s.sh", "cp e.txt t.sh && sh t.sh"]) {
        const r = await sc.contain({
          kind: "project-script",
          label: line,
          command: line,
          dialect: "posix",
          cwd: proj,
          projectDir: proj,
          code,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
          spawnSync("/bin/sh", ["-c", r.command], { encoding: "utf8", timeout: 60_000 });
        }
      }
    } finally {
      await sc.close();
    }
    expect(fs.existsSync(path.join(proj, "pwned"))).toBe(false);
    expect(fs.readFileSync(path.join(proj, "out.txt"), "utf8")).toBe("copy-ran\n");
  });

  it("the python guard alone: a syntax tree the run's own code compiles under a pinned name is refused", async () => {
    const main =
      "import ast\nsrc = open('test_x.py').read()\nco = compile(ast.parse(src, '<x>'), 'test_x.py', 'exec')\nexec(co, {})\n";
    const r = await runPinned(
      {
        "main.py": main,
        "test_x.py": "def test_ok():\n    assert 1\n",
        "e.txt": "import os\nos.system('id > pwned')\n",
      },
      "cp e.txt test_x.py && python3 main.py",
      ["main.py", "test_x.py"],
    );
    expect(r.ran).toBe(false);
  });

  // Review round 2b: node reaching child_process another way; gawk's indirect calls.
  it.each([
    [
      "node: process.getBuiltinModule('child_process')",
      "node a.js",
      { "a.js": "process.getBuiltinModule('child_process').execSync('id > pwned');\n" },
    ],
    [
      "node -e: process.getBuiltinModule('child_process')",
      `node -e "process.getBuiltinModule('child_process').execSync('id > pwned')"`,
      {},
    ],
    [
      "node: module.constructor._load",
      "node a.js",
      { "a.js": "module.constructor._load('child_process').execSync('id > pwned');\n" },
    ],
    [
      "node: require.main.constructor._load",
      "node a.js",
      {
        "a.js":
          "const m = require.main.constructor;\nconst cp = m._load('child_process');\ncp.execSync('id > pwned');\n",
      },
    ],
    [
      "node: process.mainModule.require",
      "node a.js",
      { "a.js": "process.mainModule.require('child' + '_process').execSync('id > pwned');\n" },
    ],
    [
      "gawk: a function called by a name it builds",
      `awk 'BEGIN { h = "sys" "tem"; @h("id > pwned") }'`,
      {},
    ],
    ["gawk: a function called by a -v name", `awk -v h=system 'BEGIN { @h("id > pwned") }'`, {}],
    [
      "gawk: indirect call with a file operand",
      `awk 'BEGIN { h = "sys" "tem"; @h("id > pwned") }' x.txt`,
      { "x.txt": "a\n" },
    ],
  ] as const)("%s", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string>);
    expect(r.ran).toBe(false);
  });

  it("the node guard alone: the run's own code starts no program, by any way to child_process", async () => {
    for (const code of [
      "process.getBuiltinModule('child_process').execSync('id > pwned');\n",
      "module.constructor._load('child_process').execSync('id > pwned');\n",
      "require('child_process').spawnSync('/bin/sh', ['-c', 'id > pwned']);\n",
      "const cp = require('child_process');\nconst c = new cp.ChildProcess();\nc.spawn({ file: '/bin/sh', args: ['sh', '-c', 'id > pwned'], stdio: 'inherit' });\n",
      "require('child_process').exec('id > pwned');\n",
      "Array.prototype.some = () => true;\nArray.prototype.includes = () => true;\nrequire('child_process').spawnSync(process.execPath, ['-e', \"require('fs').writeFileSync('pwned', 'uid=x')\"]);\n",
      "process.binding('spawn_sync');\n",
    ]) {
      const r = await runPinned({ "a.js": code }, "node a.js", ["a.js"]);
      expect([code, r.ran]).toEqual([code, false]);
    }
  });

  // Review round 1 on e003dd287: arguments that answer the check one way and the start another.
  const CHILD = "require('child_process').execSync('id > pwned')";
  const TOCTOU = (args: string, env: string, opts = "") =>
    `const cp = process.getBuiltinModule("child_process");\nconst GUARD = "/.enclawed/code/node-guard.cjs";\nlet n = 0;\nconst a = { toString() { n++; return n === 1 ? "--require=" + GUARD : "-e"; } };\nconst code = ${JSON.stringify(CHILD)};\nconst o = { env: ${env}, stdio: "inherit" ${opts} };\nsetImmediate(cp.spawn.bind(cp, process.execPath, ${args}, o));\n`;
  it("end to end: require used as a value, then a spawn from node's internals with a getter argument", async () => {
    const js = `const C = ["chi", "ld_", "pro", "cess"].join("");\nconst r = require;\nconst cp = r(C);\nconst a = { n: 0, toString() { this.n++; return this.n === 1 ? "--require=/.enclawed/code/node-guard.cjs" : "-e"; } };\nsetImmediate(cp.spawn.bind(cp, process.execPath, [a, String.fromCharCode(${[...CHILD].map((c) => c.charCodeAt(0)).join(",")})], { env: {}, stdio: "inherit" }));\n`;
    const r = await attempt("node e.js", { "e.js": js });
    expect(r.ran).toBe(false);
  });

  it("the node guard alone: getter, Symbol and accessor arguments, and an environment without NODE_OPTIONS, start nothing", async () => {
    for (const js of [
      TOCTOU("[a, code]", "{}"),
      TOCTOU("[a, code]", "{ PATH: process.env.PATH }"),
      TOCTOU("[code]", "{}"),
      TOCTOU("[Symbol('x'), code]", "{}"),
      TOCTOU("[a, code]", "{}", ', get argv0() { return "node"; }'),
      `const cp = process.getBuiltinModule("child_process");\nconst o = {};\nObject.defineProperty(o, "env", { get() { return { NODE_OPTIONS: "" }; } });\nsetImmediate(cp.spawnSync.bind(cp, process.execPath, ["-e", ${JSON.stringify(CHILD)}], o));\n`,
      `const cp = process.getBuiltinModule("child_process");\nsetImmediate(cp.spawn.bind(cp, process.execPath, ["--import", "data:text/javascript,${encodeURIComponent(CHILD)}"], { env: {} }));\n`,
    ]) {
      const r = await runPinned({ "a.js": js }, "node a.js; sleep 1", ["a.js"]);
      expect([js, r.ran]).toEqual([js, false]);
    }
  });

  // Review round 1 on de5b4161b: node:test run() with execArgv ['--run', 'x'] ran
  // a package.json script through sh before any guard loaded.
  const RUN_M =
    "const t = require('node:test');\nt.run({ files: ['a.test.js'], execArgv: ['--run', 'x'] }).on('data', () => {});\n";
  const RUN_T = "require('node:test').test('a', () => {});\n";
  it.each([
    [
      "node:test run() with execArgv --run",
      "node m.js",
      {
        "m.js": RUN_M,
        "a.test.js": RUN_T,
        "package.json": JSON.stringify({ scripts: { x: "id > pwned" } }),
      },
    ],
    [
      "node:test run() with execArgv --run, package.json written by a computed name",
      "node m.js",
      {
        "m.js": `const fs = require('fs');\nfs.writeFileSync('package' + '.json', JSON.stringify({ scripts: { x: 'id > pwned' } }));\n${RUN_M}`,
        "a.test.js": RUN_T,
      },
    ],
  ] as const)("%s", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string>);
    expect(r.ran).toBe(false);
  });

  it("the node guard alone: a child node of node's internals takes only the test runner's options and a file read", async () => {
    for (const opt of [
      "['--run', 'x']",
      "['--openssl-config=x.cnf']",
      "['--expose-internals']",
      "['--conditions=x']",
      "['--import', 'data:text/javascript,0']",
      "['--snapshot-blob', 'x.blob']",
      "['-C', 'x']",
      "['--env-file=x.env']",
      "['--title=x']",
      "['--build-snapshot', 'x.js']",
    ]) {
      const m = `const t = require('node:test');\nt.run({ files: ['a.test.js'], execArgv: ${opt} }).on('data', () => {});\n`;
      const r = await runPinned(
        {
          "m.js": m,
          "a.test.js": RUN_T,
          "package.json": JSON.stringify({ scripts: { x: "id > pwned" } }),
        },
        "node m.js; sleep 1",
        ["m.js", "a.test.js"],
      );
      expect([opt, r.ran]).toEqual([opt, false]);
    }
  });

  it("the shell guard alone: sh -c runs only text Enclawed read", async () => {
    const r = await runPinned({}, "sh -c 'id > pwned'", []);
    expect(r.ran).toBe(false);
    expect(r.out).toContain("a -c line Enclawed did not read");
  });

  // Review round 1 on 5307bb865: /proc/self/mem was writable, so a guarded
  // interpreter could rewrite its own machine code (here: execve of a shell).
  const libcSymbol = (name: string): { libc: string; offset: number } | null => {
    if (process.arch !== "x64") {
      return null;
    }
    const libc = /\S*libc\.so\.6/.exec(fs.readFileSync("/proc/self/maps", "utf8"))?.[0];
    if (!libc) {
      return null;
    }
    const r = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        "import struct,sys\nb=open(sys.argv[1],'rb').read()\nsh=struct.unpack_from('<Q',b,0x28)[0];es,n,_=struct.unpack_from('<HHH',b,0x3a)\nS=[struct.unpack_from('<IIQQQQIIQQ',b,sh+i*es) for i in range(n)]\nd=[s for s in S if s[1]==11][0];t=S[d[6]]\nfor i in range(d[5]//24):\n  a,_,_,_,v,_=struct.unpack_from('<IBBHQQ',b,d[4]+i*24)\n  if b[t[4]+a:b.index(b'\\0',t[4]+a)]==sys.argv[2].encode(): print(v)",
        libc,
        name,
      ],
      { encoding: "utf8" },
    );
    const offset = Number(r.stdout.trim());
    return Number.isFinite(offset) && offset > 0 ? { libc, offset } : null;
  };
  const SHELLCODE =
    "[0x48,0x8d,0x3d,30,0,0,0, 0x48,0x8d,0x05,47,0,0,0, 0x48,0x8d,0x0d,43,0,0,0, 0x31,0xd2, 0x52, 0x51, 0x50, 0x57, 0x48,0x89,0xe6, 0xb8,59,0,0,0, 0x0f,0x05]";
  it("native escape: python and node rewriting their own code through /proc/self/mem run nothing", async () => {
    const ppid = libcSymbol("getppid");
    const exit = libcSymbol("exit");
    if (!ppid || !exit) {
      return; // the shellcode is x86-64 only
    }
    const node = `const fs = require("fs");\nconst S = String.fromCharCode(47);\nconst j = (...a) => S + a.join(S);\nconst maps = fs.readFileSync(j("proc", "self", "maps"), "utf8").split("\\n");\nconst line = maps.find((l) => / 00000000 /.test(l) && /libc\\.so\\.6$/.test(l));\nconst base = parseInt(line.split("-")[0], 16);\nconst code = ${SHELLCODE};\nconst str = (s) => [...s].map((c) => c.charCodeAt(0)).concat([0]);\nconst bytes = code.concat(str(j("usr", "bin", ".enclawed-dash")), str("-c"), str("id > pwned"));\nconst fd = fs.openSync(j("proc", "self", "mem"), "r+");\nfs.writeSync(fd, Buffer.from(bytes), 0, bytes.length, base + ${ppid.offset});\nconsole.log(process.ppid);\n`;
    const py = `S = chr(47)\ndef j(*a):\n    return S + S.join(a)\nwith open(j("proc", "self", "maps")) as fh:\n    lines = fh.read().split(chr(10))\nline = [l for l in lines if " 00000000 " in l and l.endswith("libc.so.6")][0]\nbase = int(line.split("-")[0], 16)\ncode = ${SHELLCODE}\ndef st(s):\n    return [ord(c) for c in s] + [0]\ndata = bytes(code + st(j("usr", "bin", ".enclawed-dash")) + st("-c") + st("id > pwned"))\nwith open(j("proc", "self", "mem"), "r+b", buffering=0) as m:\n    m.seek(base + ${exit.offset})\n    m.write(data)\nprint("done")\n`;
    expect((await attempt("node t.js", { "t.js": node })).ran).toBe(false);
    expect((await attempt("python3 t.py", { "t.py": py })).ran).toBe(false);
  });

  it("containment: /proc is read-only (no /proc/<pid>/mem for writing, by any name)", async () => {
    const js = `const fs = require("fs");\nconst pid = process.pid;\nconst out = [];\nfor (const p of ["/proc/self/mem", "/proc/" + pid + "/mem", "/proc/" + pid + "/task/" + pid + "/mem", "/proc/thread-self/mem"]) {\n  try { fs.closeSync(fs.openSync(p, "r+")); out.push("OPENED " + p); } catch (e) { out.push(e.code + " " + p); }\n}\nlet ro = null;\ntry { ro = fs.openSync("/proc/self/mem", "r"); } catch (e) { out.push(e.code + " read"); }\nif (ro !== null) { try { fs.openSync("/proc/self/fd/" + ro, "r+"); out.push("OPENED alias"); } catch (e) { out.push(e.code + " alias"); } }\nconsole.log(out.join(";"));\n`;
    const r = await runPinned({ "a.js": js }, "node a.js", ["a.js"]);
    expect(r.out).not.toContain("OPENED");
    // Read-only /proc (EROFS); a program started from its execute-only copy is
    // not dumpable, so even its own memory file is closed to it (EACCES).
    expect(r.out.match(/(?:EROFS|EACCES) /g)?.length).toBe(5);
  });

  it("every contained run's seccomp filter refuses ptrace, process_vm_readv/writev and pidfd_getfd", () => {
    const f = containedSeccompFilter("x64", false);
    const ks = new Set<number>();
    for (let i = 0; f && i < f.length; i += 8) {
      if (f.readUInt16LE(i) === 0x15) {
        ks.add(f.readUInt32LE(i + 4));
      }
    }
    for (const nr of [101, 310, 311, 438]) {
      expect(ks.has(nr)).toBe(true);
    }
    expect(ks.has(319)).toBe(false); // memfd_create: strict mode only
    expect(containedSeccompFilter("arm64", true)).not.toBeNull();
  });

  it("native escape through a project symbolic link to /proc/self/mem (python, open for writing by a computed name)", async () => {
    const exit = libcSymbol("exit");
    if (!exit) {
      return;
    }
    for (const mode of ["wb", "ab", "r+b"]) {
      const py = `S = chr(47)\ndef j(*a):\n    return S + S.join(a)\nwith open(j("proc", "self", "maps")) as fh:\n    lines = fh.read().split(chr(10))\nline = [l for l in lines if " 00000000 " in l and l.endswith("libc.so.6")][0]\nbase = int(line.split("-")[0], 16)\ncode = ${SHELLCODE}\ndef st(s):\n    return [ord(c) for c in s] + [0]\ndata = bytes(code + st(j("usr", "bin", ".enclawed-dash")) + st("-c") + st("id > pwned"))\nwith open("l" + "nk", "${mode}", buffering=0) as m:\n    m.seek(base + ${exit.offset})\n    m.write(data)\nprint("done")\n`;
      const r = await attempt("python3 t.py", { "t.py": py }, { lnk: "/proc/self/mem" });
      expect([mode, r.ran]).toEqual([mode, false]);
    }
  });

  it("the name guard alone: no write open of a process's memory through a symbolic link, a chain or an fd alias", async () => {
    // node, no guard involvement: every open reaches the supervisor.
    const js = `const fs = require("fs");
const out = [];
// Not dumpable (started from an execute-only copy): its own memory file may be closed to it.
let ro = null;
try { ro = fs.openSync("/proc/self/mem", "r"); } catch { ro = fs.openSync("/proc/self/stat", "r"); }
fs.symlinkSync("/proc/self/mem", "l1");
fs.symlinkSync("/proc/thread-self/mem", "l2");
fs.symlinkSync("/dev/fd/" + ro, "l3");
fs.mkdirSync("sub");
fs.symlinkSync("../l1", "sub/l4");
fs.symlinkSync("l1", "chain");
fs.symlinkSync("/proc/" + process.pid + "/mem", "l5");
for (const name of ["l1", "l2", "l3", "sub/l4", "chain", "l5", "/dev/fd/" + ro, "/proc/self/fd/" + ro]) {
  for (const flag of ["w", "a", "r+", "wx", "as"]) {
    try { fs.closeSync(fs.openSync(name, flag)); out.push("OPENED " + name + " " + flag); } catch (e) { out.push(e.code); }
  }
}
console.log(out.join(";"));
`;
    const r = await runPinned({ "a.js": js }, "node a.js", ["a.js"]);
    expect(r.out).not.toContain("OPENED");
    expect(r.out.match(/E[A-Z]+/g)?.length).toBe(40);
  });

  // Review round 1 on 3deb1b8aa: the real programs the guards wrap were reachable by name.
  const F4 = { "t.js": "console.log(1)\n" };
  it.each([
    [".enclawed-dash bare", ".enclawed-dash -c 'id > pwned'", F4],
    ["/usr/bin/.enclawed-dash", "/usr/bin/.enclawed-dash -c 'id > pwned'", F4],
    ["after node", "node t.js; .enclawed-dash -c 'id > pwned'", F4],
    [
      "node, then the hidden gawk",
      `node t.js; .enclawed-gawk 'BEGIN { system("id > pwned") }'`,
      F4,
    ],
    [
      "node, then the hidden node",
      `node t.js; .enclawed-node -e 'require("child_process").execSync("id > pwned")'`,
      F4,
    ],
    ["timeout", "timeout 5 .enclawed-dash -c 'id > pwned'", F4],
    ["env", "node t.js; env .enclawed-dash -c 'id > pwned'", F4],
    ["command", "command .enclawed-dash -c 'id > pwned'", F4],
    ["sh -c with the hidden shell", `sh -c '/usr/bin/.enclawed-dash -c "id > pwned"'`, F4],
    ["bash -c with the hidden shell", `bash -c '/bin/.enclawed-dash -c "id > pwned"'`, F4],
    [
      "sh -c with the hidden shell on an unread file",
      "sh -c '.enclawed-dash payload.sh'",
      { "payload.sh": "id > pwned\n" },
    ],
    [
      "sh -c with the hidden node",
      "sh -c '.enclawed-node payload.js'",
      { "payload.js": "require('child_process').execSync('id > pwned')\n" },
    ],
    [
      "sh -c with the hidden gawk",
      "sh -c '.enclawed-gawk -f payload.awk'",
      { "payload.awk": 'BEGIN { system("id > pwned") }\n' },
    ],
    [
      "a script naming the hidden shell",
      "sh run.sh",
      { "run.sh": "/usr/bin/.enclawed-dash -c 'id > pwned'\n" },
    ],
    [
      "find -exec the hidden shell",
      "find . -name t.js -exec /usr/bin/.enclawed-dash -c 'id > pwned' \\;",
      F4,
    ],
    ["the real shell by its new path", "/.enclawed/real/0/bin/dash -c 'id > pwned'", F4],
    [
      "the real shell by a relative path",
      "../../../../../../../../.enclawed/real/0/bin/dash -c 'id > pwned'",
      F4,
    ],
    ["env with the real shell's path", "env /.enclawed/real/1/bin/dash -c 'id > pwned'", F4],
  ] as const)("the real programs are not reachable: %s", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string>);
    expect(r.ran).toBe(false);
  });

  it("the real programs are not reachable through a project link to them", async () => {
    for (const target of [
      "/.enclawed/real/0/bin/dash",
      "/.enclawed/real/1/bin/dash",
      "/usr/bin/.enclawed-dash",
    ]) {
      for (const line of ["./p -c 'id > pwned'", "sh -c './p -c \"id > pwned\"'"]) {
        const r = await attempt(line, {}, { p: target });
        expect([target, line, r.ran]).toEqual([target, line, false]);
      }
    }
  });

  it("the containment: no program's real binary on PATH or in a bin directory", async () => {
    const r = await runPinned(
      {
        "a.js":
          "const fs = require('fs');\nconst out = [];\nfor (const d of (process.env.PATH || '').split(':').concat(['/usr/bin', '/bin', '/usr/local/bin'])) {\n  try { for (const n of fs.readdirSync(d)) if (n.startsWith('.enclawed')) out.push(d + '/' + n); } catch {}\n}\nconsole.log('HIDDEN=' + out.join(','));\n",
      },
      "node a.js",
      ["a.js"],
    );
    expect(r.out).toContain("HIDDEN=\n");
  });

  // Review round 1 on 88f4dfc14: a name absent on this host was read as running
  // nothing, while the containment resolved it (a package's .bin, a pattern).
  const PKG = (t: string) => JSON.stringify({ name: "p", version: "1.0.0", scripts: { test: t } });
  const ESH = { "e.sh": "id > pwned\n" };
  it.each([
    [
      "npm test: a .bin link to env, then a pattern naming the real shell",
      "npm test",
      { "package.json": PKG("zzfoo /.e*/r*/*/bin/bash e.sh"), ...ESH },
      { "node_modules/.bin/zzfoo": "/usr/bin/env" },
    ],
    [
      "npm test: a .bin link to the real shell",
      "npm test",
      { "package.json": PKG("zzfoo e.sh"), ...ESH },
      { "node_modules/.bin/zzfoo": "/.enclawed/real/1/bin/dash" },
    ],
    [
      "npm test: a .bin link outside the project",
      "npm test",
      { "package.json": PKG("zzfoo e.sh"), ...ESH },
      { "node_modules/.bin/zzfoo": "/bin/sh" },
    ],
    ["env with a pattern", "env /.e*/r*/*/bin/da?h e.sh", ESH, {}],
    ["a pattern as the program", "/.e*/r*/*/bin/da?h e.sh", ESH, {}],
    ["timeout with a pattern", "timeout 5 /.e*/r*/*/bin/da?h e.sh", ESH, {}],
    ["nice with a pattern", "nice /.e*/r*/*/bin/da?h e.sh", ESH, {}],
    ["nohup with a pattern", "nohup /.e*/r*/*/bin/da?h e.sh", ESH, {}],
    ["xargs with a pattern", "find . -name e.sh | xargs /.e*/r*/*/bin/da?h", ESH, {}],
    ["find -exec with a pattern", "find . -name e.sh -exec /.e*/r*/*/bin/da?h {} \\;", ESH, {}],
    ["a variable as the program", "X=/.encl; ${X}awed/real/1/bin/dash e.sh", ESH, {}],
    ["a brace pattern as the program", "{/.encl,}awed/real/1/bin/dash e.sh", ESH, {}],
    ["sh -c with a pattern as the program", "sh -c '/.e*/r*/*/bin/da?h e.sh'", ESH, {}],
    [
      "a script with a pattern as the program",
      "sh run.sh",
      { "run.sh": "/.e*/r*/*/bin/da?h e.sh\n", ...ESH },
      {},
    ],
    ["a program in the containment's own /tmp", "/tmp/x e.sh", ESH, {}],
  ] as const)(
    "a name absent here is not taken to run nothing: %s",
    async (_name, line, files, links) => {
      const r = await attempt(
        line,
        files as Record<string, string>,
        links as Record<string, string>,
      );
      expect(r.ran).toBe(false);
    },
  );

  it("npm test: a .bin link into the project runs the file it leads to, read like any", async () => {
    const r = await attempt(
      "npm test",
      {
        "package.json": PKG("tool"),
        "node_modules/tool/cli.sh": "#!/bin/sh\necho tool-ran\n",
      },
      { "node_modules/.bin/tool": "../tool/cli.sh" },
    );
    expect(r.contained).toBe(true);
  });

  it("a program absent on this host and in the containment still runs nothing (no person)", async () => {
    for (const line of [
      "wallet-tracker balance 0x0",
      "../../../../../../nope/bin/terraform init",
      // /bin -> usr/bin on a merged-/usr host: a link into the read-only
      // toolchain, which the containment shows as a subset of this host's.
      "/bin/no-such-tool-zz --version",
    ]) {
      const r = await attempt(line, {});
      expect([line, r.contained]).toEqual([line, true]);
    }
  });

  // Review round 1 on be0104723: links in the middle of a path into the real programs.
  const LINKS = {
    l0: "/.enclawed/real/0/bin",
    l1: "/.enclawed/real/1/bin",
    l2: "/.enclawed/real/2/bin",
    l3: "/.enclawed/real/3/bin",
    r: "/proc/self/root/.enclawed/real/1/bin",
    p1: "/proc/1/root/.enclawed/real/1/bin",
    chain: "l1",
    d1: "/.enclawed/real/1/bin/dash",
  };
  const E = { "e.sh": "id > pwned\n" };
  it.each([
    ["a link to the real bin directory, then a program in it", "l1/dash -c 'id > pwned'", E],
    ["./link/program", "./l1/dash e.sh", E],
    ["every numbered directory", "l0/dash e.sh; l1/dash e.sh; l2/dash e.sh; l3/dash e.sh", E],
    ["sh -c through the link", `sh -c 'l1/dash -c "id > pwned"'`, E],
    [
      "a script through the link",
      "sh run.sh",
      { "run.sh": "l0/dash e.sh\nl1/dash e.sh\nl2/dash e.sh\nl3/dash e.sh\n", ...E },
    ],
    ["/proc/self/root through a script", "sh run.sh", { "run.sh": "r/dash e.sh\n", ...E }],
    ["/proc/1/root", "p1/dash e.sh", E],
    ["a chain of links", "chain/dash e.sh", E],
    ["a link to the real shell itself", "./d1 e.sh", E],
    ["cd into the link", "cd l1 && ./dash ../e.sh", E],
    [
      "the real node through the link",
      "l0/node payload.js; l1/node payload.js; l2/node payload.js; l3/node payload.js",
      { "payload.js": "require('child_process').execSync('id > pwned')\n" },
    ],
    [
      "the real gawk through the link",
      "l0/gawk -f x.awk; l1/gawk -f x.awk; l2/gawk -f x.awk; l3/gawk -f x.awk",
      { "x.awk": 'BEGIN { system("id > pwned") }\n' },
    ],
    [
      "a first line naming the real shell",
      "./s.sh",
      { "s.sh": "#!/.enclawed/real/1/bin/dash\nid > pwned\n" },
    ],
    [
      "a first line through /proc/self/root",
      "./s.sh",
      { "s.sh": "#!/proc/self/root/.enclawed/real/1/bin/dash\nid > pwned\n" },
    ],
    [
      ".npmrc script-shell",
      "npm test",
      {
        ".npmrc": "script-shell=/proc/self/root/.enclawed/real/1/bin/dash\n",
        "package.json": JSON.stringify({ name: "x", version: "1.0.0", scripts: { test: "true" } }),
      },
    ],
    [
      ".npmrc node-options",
      "npm test",
      {
        ".npmrc": "node-options=--require ./evil.js\n",
        "evil.js": "require('child_process').execSync('id > pwned')\n",
        "package.json": JSON.stringify({
          name: "x",
          version: "1.0.0",
          scripts: { test: "node -e 0" },
        }),
      },
    ],
  ] as const)(
    "no route through a link into the containment's own files: %s",
    async (_name, line, files) => {
      const r = await attempt(line, files as Record<string, string>, LINKS);
      expect(r.ran).toBe(false);
    },
  );

  // Review round 1 on 4da642e55: cd through a link into the real programs.
  const REAL = { l: "/.enclawed/real", pr: "/proc/self/root" };
  const NPM_PKG = (test: string) =>
    JSON.stringify({ name: "x", version: "1.0.0", scripts: { test } });
  it.each([
    ["cd into the link, then ./dash -c", `cd l/1/bin && ./dash -c 'id > "$OLDPWD/pwned"'`, {}],
    ["cd into the link, then ./bash -c", `cd l/2/bin && ./bash -c 'id > "$OLDPWD/pwned"'`, {}],
    [
      "cd into the link, then a script",
      `cd l/1/bin && ./dash "$OLDPWD/e.txt"`,
      { "e.txt": "id > pwned\n" },
    ],
    ["cd; then the next command", `cd l/1/bin; ./dash -c 'id > "$OLDPWD/pwned"'`, {}],
    ["pushd", `pushd l/1/bin && ./dash -c 'id > "$OLDPWD/pwned"'`, {}],
    [
      "cd through /proc/self/root",
      `cd /proc/self/root/.enclawed/real/1/bin && ./dash -c 'id > /tmp/x'`,
      {},
    ],
    [
      "cd through a link to /proc/self/root",
      `cd pr/.enclawed/real/1/bin && ./dash -c 'id > /tmp/x'`,
      {},
    ],
    [
      "cd inside a script",
      "sh run.sh",
      { "run.sh": "cd l/1/bin\n./dash ../../../../e.txt\n", "e.txt": "id > pwned\n" },
    ],
    [
      "cd inside an npm script line",
      "npm test",
      { "package.json": NPM_PKG(`cd l/1/bin && ./dash -c 'id > "$OLDPWD/pwned"'`) },
    ],
  ] as const)("no cd into the containment's own files: %s", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string>, REAL);
    expect(r.contained).toBe(false);
    expect(r.ran).toBe(false);
  });

  it("cd to a directory missing here and in the containment still fails there (the line runs as read)", async () => {
    const r = await attempt("cd no-such-dir && rm -rf / ; true", {});
    expect(r.contained).toBe(true);
  });

  // Review round 1 on e919ea260: a program find (or xargs) takes from the files it finds.
  const MAKE_LINK =
    "const fs = require('fs');\nconst t = String.fromCharCode(47) + '.encl' + 'awed' + String.fromCharCode(47) + 'real' + String.fromCharCode(47) + '1' + String.fromCharCode(47) + 'bin' + String.fromCharCode(47) + 'dash';\nfs.symlinkSync(t, 'zzd');\n";
  const PRINT_GZ = "perl -MCompress::Zlib -0777 -ne 'print uncompress($_)'";
  it.each([
    [
      "find -exec {} sh after a script makes a link",
      "node w.js; find . -name 'zz*' -exec {} sh ';'",
      { "w.js": MAKE_LINK, sh: "id > pwned\n" },
    ],
    [
      "find -exec {} cat after a script makes a link",
      "node w.js; find . -name 'zz*' -exec {} cat \;",
      { "w.js": MAKE_LINK, cat: "id > pwned\n" },
    ],
    [
      "find -exec {} with nothing created first",
      "find . -name 'zz*' -exec {} sh ';'",
      { zzd: "id > pwned\n", sh: "x\n" },
    ],
    [
      "find -exec ./{} (a word holding {})",
      "find . -name 'zz*' -exec ./{} \;",
      { zzd: "#!/bin/sh\nid > pwned\n" },
    ],
    [
      "find -exec after a command that may create files",
      "node w.js; find . -name 'zz*' -exec cat {} \;",
      { "w.js": MAKE_LINK },
    ],
    [
      "xargs after a command that may create files",
      "node w.js; find . -name 'zz*' | xargs cat",
      { "w.js": MAKE_LINK },
    ],
    ["a JS link to a computed target", "node w.js", { "w.js": MAKE_LINK }],
    [
      "a JS link through a computed fs member",
      "node w.js",
      { "w.js": "const fs = require('fs');\nfs['symlink' + 'Sync']('a', 'b');\n" },
    ],
    [
      "a JS copy keeping links as written",
      "node w.js",
      {
        "w.js":
          "const fs = require('fs');\nfs.cpSync('a', 'b', { recursive: true, verbatimSymlinks: true });\n",
      },
    ],
    [
      "a JS link with .. in its target",
      "node w.js",
      {
        "w.js":
          "const fs = require('fs');\nfs.symlinkSync('../../../.enclawed/real/1/bin/dash', 'zzd');\n",
      },
    ],
    [
      "a python link",
      "python3 w.py",
      { "w.py": "import os\nos.symlink('/.enclawed/real/1/bin/dash', 'zzd')\n" },
    ],
    ["a python hard link", "python3 w.py", { "w.py": "import os\nos.link('a', 'zzd')\n" }],
    [
      "a python copy of a link as a link",
      "python3 w.py",
      { "w.py": "import shutil\nshutil.copy('a', 'b', follow_symlinks=False)\n" },
    ],
    [
      "a python copytree keeping links",
      "python3 w.py",
      { "w.py": "import shutil\nshutil.copytree('a', 'b', symlinks=True)\n" },
    ],
    [
      "a python archive extracted fully trusted",
      "python3 w.py",
      { "w.py": "import tarfile\ntarfile.open('a.tar').extractall('x', filter='fully_trusted')\n" },
    ],
    [
      "a python archive filter changed",
      "python3 w.py",
      {
        "w.py":
          "import tarfile\nt = tarfile.open('a.tar')\nt.extraction_filter = None\nt.extractall('x')\n",
      },
    ],
    ["PERL5OPT", `PERL5OPT=-Mstrict ${PRINT_GZ} a.gz`, { "a.gz": "" }],
    ["PERLLIB", `PERLLIB=. ${PRINT_GZ} a.gz`, { "a.gz": "" }],
    ["perl over a pattern that names a pipe", `${PRINT_GZ} *.gz`, { "|id > pwned;x.gz": "" }],
    [
      "perl over a pattern after a command that may create files",
      `node w.js; ${PRINT_GZ} *.gz`,
      { "w.js": MAKE_LINK, "a.gz": "" },
    ],
  ] as const)("no program or link from data the line makes: %s", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string>);
    expect(r.contained).toBe(false);
    expect(r.ran).toBe(false);
  });

  it.each([
    [
      "find -exec with a literal program",
      "find . -name '*.txt' -exec cat {} \;",
      { "a.txt": "x\n" },
    ],
    [
      "a JS link with a plain relative target",
      "node w.js",
      { "w.js": "const fs = require('fs');\nfs.symlinkSync('a.txt', 'b.txt');\n", "a.txt": "x\n" },
    ],
    [
      "python copytree and a data-filtered archive",
      "python3 w.py",
      {
        "w.py": "import shutil\nshutil.copytree('a', 'b', dirs_exist_ok=True)\n",
        "a/x.txt": "x\n",
      },
    ],
  ] as const)("still contained: %s", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string>);
    expect(r.contained).toBe(true);
  });

  // Review round 1 on 9669418bd (G1): a test reporter loaded by path is code the run chose.
  const T = { "t.test.js": "require('node:test').test('x', () => {});\n" };
  const NPM_CLI = "/usr/share/nodejs/npm/bin/npm-cli.js";
  it.each([
    ["a toolchain reporter by path", `node --test --test-reporter=${NPM_CLI} t.test.js`, T],
    [
      "a toolchain reporter by path, value apart",
      `node --test --test-reporter ${NPM_CLI} t.test.js`,
      T,
    ],
    [
      "a toolchain reporter after a built-in one",
      `node --test --test-reporter=spec --test-reporter=${NPM_CLI} t.test.js`,
      T,
    ],
    ["a reporter package by name", "node --test --test-reporter=npm t.test.js", T],
    [
      "a reporter destination outside the project",
      "node --test --test-reporter=spec --test-reporter-destination=/tmp/zz-out t.test.js",
      T,
    ],
    [
      "a reporter destination in the toolchain",
      "node --test --test-reporter=spec --test-reporter-destination=/usr/share/x t.test.js",
      T,
    ],
    ["a test timeout that is not a number", "node --test --test-timeout=x t.test.js", T],
    [
      ".npmrc call",
      "npm test",
      {
        ".npmrc": "call=id > pwned\n",
        "package.json": JSON.stringify({ name: "x", version: "1.0.0", scripts: { test: "true" } }),
      },
    ],
  ] as const)(
    "no reporter or runner setting the run chooses as code: %s",
    async (_name, line, files) => {
      const r = await attempt(line, files as Record<string, string>);
      expect(r.contained).toBe(false);
      expect(r.ran).toBe(false);
    },
  );

  it.each([
    ["a built-in reporter", "node --test --test-reporter=spec t.test.js", T],
    [
      "a project reporter",
      "node --test --test-reporter=./rep.mjs t.test.js",
      {
        ...T,
        "rep.mjs":
          "export default async function* rep(source) { for await (const e of source) { if (e.type === 'test:pass') yield 'ok\\n'; } }\n",
      },
    ],
    [
      "a project destination",
      "node --test --test-reporter=spec --test-reporter-destination=out.txt t.test.js",
      T,
    ],
  ] as const)("still contained: %s", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string>);
    expect(r.contained).toBe(true);
  });

  it("the node guard alone: a toolchain reporter by path is refused before anything runs", async () => {
    const r = await runPinned(T, `node --test --test-reporter=${NPM_CLI} t.test.js`, ["t.test.js"]);
    expect(r.out).toMatch(/not a value this contained run takes/);
    expect(r.ran).toBe(false);
  });

  it("the node guard alone: toolchain code loaded by the run's own program starts no program", async () => {
    const spawnVia = `const fs = require("fs");\nrequire(${JSON.stringify("/usr/share/nodejs/@npmcli/promise-spawn")})("/usr/bin/id", []).then((r) => fs.writeFileSync("pwned", r.stdout), (e) => console.error("refused:", e && e.message));\n`;
    const r = await runPinned({ "w.js": spawnVia }, "node w.js", ["w.js"]);
    expect(r.ran).toBe(false);
  });

  // Review round 1 on 0bb29b910: a package's node_modules/.bin shadows a program Enclawed knows by name.
  const SPKG = (t: string) => JSON.stringify({ name: "p", version: "1.0.0", scripts: { test: t } });
  const SFILES = (t: string) => ({
    "package.json": SPKG(t),
    "s.sh": "echo hi\n",
    "e.txt": "id > pwned\n",
    "w.js": "1;\n",
  });
  it.each([
    [
      ".bin/sh to the real dash",
      "cp e.txt s.sh && npm test",
      SFILES("sh s.sh"),
      { "node_modules/.bin/sh": "/.enclawed/real/1/bin/dash" },
    ],
    [
      ".bin/sh through a relative link",
      "cp e.txt s.sh && npm test",
      SFILES("sh s.sh"),
      { l: "/.enclawed/real", "node_modules/.bin/sh": "../../l/1/bin/dash" },
    ],
    [
      ".bin/bash to the real bash",
      "cp e.txt s.sh && npm test",
      SFILES("bash s.sh"),
      { "node_modules/.bin/bash": "/.enclawed/real/2/bin/bash" },
    ],
    [
      ".bin/sh after node writes",
      "node w.js && npm test",
      SFILES("sh s.sh"),
      { "node_modules/.bin/sh": "/.enclawed/real/1/bin/dash" },
    ],
    [
      ".bin/node to the real node",
      "npm test",
      SFILES("node w.js"),
      { "node_modules/.bin/node": "/.enclawed/real/0/bin/node" },
    ],
    [
      ".bin/env outside the project",
      "npm test",
      SFILES("env true"),
      { "node_modules/.bin/env": "/usr/bin/env" },
    ],
    [
      ".bin/python3 outside the project",
      "npm test",
      SFILES("python3 -c 1"),
      { "node_modules/.bin/python3": "/usr/bin/python3" },
    ],
    [
      ".bin/declare (no builtin of the script shell)",
      "npm test",
      SFILES("declare x"),
      { "node_modules/.bin/declare": "/.enclawed/real/1/bin/dash" },
    ],
  ] as const)(
    "no package .bin entry in place of a program Enclawed knows: %s",
    async (_name, line, files, links) => {
      const r = await attempt(
        line,
        files as Record<string, string>,
        links as Record<string, string>,
      );
      expect(r.contained).toBe(false);
      expect(r.ran).toBe(false);
    },
  );

  it("a package .bin entry still does not shadow the script shell's own builtins", async () => {
    const r = await attempt("npm test", SFILES("true"), {
      "node_modules/.bin/true": "/.enclawed/real/1/bin/dash",
    });
    expect(r.ran).toBe(false);
  });

  // The real interpreters are in no place of the containment: a run started
  // inside it (its own line, pinned here, read by no reader) reaches none of them
  // by any path, while every wrapper still starts its program.
  it("containment: no process of a run executes a real interpreter, by any path; the wrappers still work", async () => {
    const dash = fs.realpathSync("/bin/sh");
    const copy = realProgramCopy(dash, path.dirname(path.dirname(dash)));
    // One line, paths through variables: the line's own programs are what the
    // containment binds, and none of these may be bound.
    const line = [
      `c=${copy}`,
      "e=/proc/$$/exe",
      "r=/.enclawed/real",
      "test -e $r && echo PRESENT=real",
      "test -e $c && echo PRESENT=copy",
      "$c -c 'id > pwned' 2>/dev/null; echo rc-copy=$?",
      "$e -c 'id > pwned' 2>/dev/null; echo rc-parent-exe=$?",
      "cat $e > copied 2>/dev/null; echo rc-read-exe=$?",
      "ln -s $e lnk; l=./lnk; $l -c 'id > pwned' 2>/dev/null; echo rc-link=$?",
      "mkdir -p node_modules/.bin; ln -s $e node_modules/.bin/zz; z=node_modules/.bin/zz; $z -c 'id > pwned' 2>/dev/null; echo rc-bin=$?",
      "d=$PWD; x=./exe; cd /proc/$$ 2>/dev/null && $x -c 'id > pwned' 2>/dev/null; echo rc-cd=$?; cd $d",
      "w=/proc/self/root/usr/bin/dash; $w -c 'id > pwned' 2>/dev/null; echo rc-root-wrapper=$?",
      "a=/.enclawed/exec-fd; true > $a 2>/dev/null; echo rc-ask=$?",
      "echo WRAPPER-OK",
      "node t.js",
      "echo 'x y' | awk '{ print $2 }'",
    ].join("; ");
    const r = await runPinned({ "t.js": "console.log('NODE-OK')\n" }, line, ["t.js"]);
    expect(r.out).not.toMatch(/PRESENT=/);
    for (const k of [
      "copy",
      "parent-exe",
      "read-exe",
      "link",
      "bin",
      "cd",
      "root-wrapper",
      "ask",
    ]) {
      expect(r.out).toMatch(new RegExp(`rc-${k}=[1-9]`));
    }
    expect(r.ran).toBe(false);
    expect(r.out).toContain("WRAPPER-OK");
    expect(r.out).toContain("NODE-OK");
    expect(r.out).toMatch(/^y$/m);
  });

  // Review round 1 on 845db2618: `..` after a link is the link target's parent
  // to the kernel; and a shell's script operand is any file it opens.
  const SWAP = {
    "x/e.sh": "echo benign\n",
    "y/e.sh": "id > pwned\n",
    "y/z/k": "k\n",
    "t.js": "1;\n",
  };
  const SWAP_LINKS = { "x/s": "../y/z" };
  const DEEP = { "e.sh": "id > pwned\n", "a/b/c/d/e/f/g/h/k.txt": "x\n" };
  const DEEP_LINKS = { "a/b/c/d/e/f/g/h/s2": "../../../../../../../.." };
  const DEEP_DEV = "a/b/c/d/e/f/g/h/s2/../../../../../../dev";
  it.each([
    ["sh", "sh x/s/../e.sh", SWAP, SWAP_LINKS],
    ["bash", "bash x/s/../e.sh", SWAP, SWAP_LINKS],
    [". (a builtin: no wrapper sees it)", ". x/s/../e.sh", SWAP, SWAP_LINKS],
    ["source", "source x/s/../e.sh", SWAP, SWAP_LINKS],
    ["sh -c", "sh -c '. x/s/../e.sh'", SWAP, SWAP_LINKS],
    ["bash -c", "bash -c '. x/s/../e.sh'", SWAP, SWAP_LINKS],
    ["node", "node x/s/../t.js", SWAP, SWAP_LINKS],
    ["find -exec", "find x/s/../ -maxdepth 1 -name e.sh -exec sh {} ';'", SWAP, SWAP_LINKS],
    [
      "find into /dev through a deep link",
      `find ${DEEP_DEV}/ -maxdepth 1 -name stdin -exec sh {} ';' < e.sh`,
      DEEP,
      DEEP_LINKS,
    ],
    ["sh on /dev/stdin through a deep link", `sh ${DEEP_DEV}/stdin < e.sh`, DEEP, DEEP_LINKS],
  ] as const)("no `..` back over a link: %s", async (_name, line, files, links) => {
    const r = await attempt(line, files as Record<string, string>, links as Record<string, string>);
    expect(r.contained).toBe(false);
    expect(r.ran).toBe(false);
  });

  it("`..` that steps back over no link still reads as written", async () => {
    const r = await attempt("sh x/../x/e.sh", SWAP, SWAP_LINKS);
    expect(r.contained).toBe(true);
  });

  // The shell wrapper alone (the line is pinned; no reader): what a shell opens as its program.
  async function runShellPins(
    files: Record<string, string>,
    line: string,
    scripts: readonly string[],
    prepare: ((proj: string) => void | Promise<void>) | null = null,
  ): Promise<{ out: string; ran: boolean }> {
    const { root, proj } = project(files);
    const code: ContainedCode = {
      files: scripts.map((rel) => {
        const f = fs.realpathSync(path.join(proj, rel));
        const b = fs.readFileSync(f);
        return {
          path: f,
          sha256: createHash("sha256").update(b).digest("hex"),
          exec: false,
          shell: true,
          contentBase64: b.toString("base64"),
        };
      }),
      shell: scripts.map((rel) => fs.realpathSync(path.join(proj, rel))),
    } as ContainedCode;
    // After Enclawed's reading: what another process does before the run.
    await prepare?.(proj);
    const sc = scriptContainer({ stateDir: path.join(root, "state") });
    let out = "";
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
      expect(r.ok).toBe(true);
      if (r.ok) {
        const p = spawnSync("/bin/sh", ["-c", r.command], { encoding: "utf8", timeout: 60_000 });
        out = `${p.stdout}\n${p.stderr}`;
      }
    } finally {
      await sc.close();
    }
    const pwned = path.join(proj, "pwned");
    return { out, ran: fs.existsSync(pwned) && fs.readFileSync(pwned, "utf8").includes("uid=") };
  }
  const W = { "e.sh": "id > pwned\n", "ok.sh": "echo SCRIPT-OK\n" };
  // (With read pins the shell may already fail to open the unread e.sh: Permission denied.)
  it.each([
    ["/dev/stdin", "sh /dev/stdin < e.sh", /nothing was run|Permission denied/],
    ["/proc/self/fd/0", "sh /proc/self/fd/0 < e.sh", /nothing was run|Permission denied/],
    ["a lone -", "sh - < e.sh", /from its input|Permission denied/],
    ["-l", "sh -l ok.sh", /login shell/],
    ["argv[0] starting with -", "env --argv0=-sh sh ok.sh", /login shell/],
    ["-O", "bash -O extglob ok.sh", /may read code/],
    ["-o with an option outside the list", "sh -o vi ok.sh", /may read code/],
    ["--rcfile", "bash --rcfile e.sh ok.sh", /may read code/],
    ["--login", "bash --login ok.sh", /may read code/],
  ] as const)("the shell wrapper alone refuses %s", async (_name, line, why) => {
    const r = await runShellPins(W, line, ["ok.sh"]);
    expect(r.ran).toBe(false);
    expect(r.out).toMatch(why);
  });

  it("the shell wrapper alone: a pinned script runs; variables that make a shell run other code are dropped", async () => {
    const r = await runShellPins(
      W,
      "sh -o errexit ok.sh; env BASH_ENV=$PWD/e.sh ENV=$PWD/e.sh 'BASH_FUNC_echo%%=() { id > pwned; }' bash ok.sh",
      ["ok.sh"],
    );
    expect(r.out.match(/SCRIPT-OK/g)?.length).toBe(2);
    expect(r.ran).toBe(false);
  });

  // Round 1 on ccac8d561: a real program re-executing itself (no reader in
  // front: a pinned script). The supervisor refuses every exec of a real
  // program's copy that is not a wrapper's.
  it("containment: a real program's copy starts only from its wrapper, by no name a run can make", async () => {
    const probe = [
      "s=/proc/self/exe",
      "$s -c 'id > pwned' 2>/dev/null; echo rc-self=$?",
      "ln -s /proc/self/exe zz; ./zz -c 'id > pwned' 2>/dev/null; echo rc-link=$?",
      "/proc/$$/exe -c 'id > pwned' 2>/dev/null; echo rc-own-pid=$?",
      "( /proc/$$/exe -c 'id > pwned' ) 2>/dev/null; echo rc-parent=$?",
      "( exec /proc/self/exe -c 'id > pwned' ) 2>/dev/null; echo rc-exec-self=$?",
      "f=/dev/fd/0; ( exec $f -c 'id > pwned' < /proc/self/exe ) 2>/dev/null; echo rc-fd=$?",
      "echo STILL-RUNNING",
      "sh ok.sh",
      "node t.js",
    ].join("\n");
    const r = await runShellPins(
      {
        "x.sh": `${probe}\n`,
        "ok.sh": "echo SCRIPT-OK\n",
        "t.js": "console.log('NODE-OK')\n",
        "e.sh": "id > pwned\n",
      },
      "sh x.sh",
      ["x.sh", "ok.sh"],
    );
    for (const k of ["self", "link", "own-pid", "parent", "exec-self", "fd"]) {
      expect(r.out).toMatch(new RegExp(`rc-${k}=[1-9]`));
    }
    expect(r.ran).toBe(false);
    expect(r.out).toContain("STILL-RUNNING");
    expect(r.out).toContain("SCRIPT-OK");
  });

  // F1 on ccac8d561: dash leaves braces literal, bash expands them.
  const BR = { "a.sh": "echo a\n", "b.sh": "echo b\n", "{a,b}.sh": "id > pwned\n" };
  const BR2 = { "x.sh": "echo x\n", "{x.sh,}": "id > pwned\n" };
  it.each([
    ["sh -c . with alternatives", "sh -c '. ./{a,b}.sh'", BR],
    ["the line itself", ". ./{a,b}.sh", BR],
    ["a script run by sh", "sh run.sh", { ...BR, "run.sh": ". ./{a,b}.sh\n" }],
    ["an empty alternative, sh -c", "sh -c '. ./{x.sh,}'", BR2],
    ["an empty alternative, a script", "sh run.sh", { ...BR2, "run.sh": ". ./{x.sh,}\n" }],
    [
      "a package script",
      "npm test",
      {
        ...BR,
        "package.json": JSON.stringify({
          name: "p",
          version: "1.0.0",
          scripts: { test: ". ./{a,b}.sh" },
        }),
      },
    ],
    ["a sequence in bash text", "bash -c 'cat ./{a..b}.sh'", BR],
    ["[^...] in a file pattern", "sed -i 's/a/b/' [^b]*.sh", BR],
    ["[:class:] in a file pattern", "sed -i 's/a/b/' [[:alpha:]].sh", BR],
  ] as const)("no word the contained shell reads differently: %s", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string>);
    expect(r.contained).toBe(false);
    expect(r.ran).toBe(false);
  });

  it("bash text still expands its alternatives as bash does", async () => {
    const r = await attempt("bash -c 'cat ./{a,b}.sh'", BR);
    expect(r.contained).toBe(true);
    expect(r.ran).toBe(false);
  });

  // Round 1 on 2e903605a: a word the shell expands as a file pattern; `..`
  // spliced after a mapped /proc/self in the supervisor.
  const GL = {
    "[e].sh": "echo benign\n",
    "e.sh": "id > pwned\n",
    "[d]/e.sh": "echo benign\n",
    "d/e.sh": "id > pwned\n",
  };
  it.each([
    [". a pattern", ". ./[e].sh"],
    ["sh -c . a pattern", "sh -c '. ./[e].sh'"],
    ["bash -c . a pattern", "bash -c '. ./[e].sh'"],
    ["bash -c source a pattern", "bash -c 'source ./[e].sh'"],
    [". a pattern in a directory", ". ./[d]/e.sh"],
    ["sh a pattern", "sh ./[e].sh"],
    [". a name looked up on PATH", ". e.sh"],
  ] as const)("a pattern word is read as the shell expands it: %s", async (_name, line) => {
    const r = await attempt(line, GL);
    expect(r.ran).toBe(false);
  });

  it("npm --prefix with a pattern is the directory the shell expands it to", async () => {
    const pkg = JSON.stringify({ name: "p", version: "1.0.0", scripts: { test: ". ./e.sh" } });
    const r = await attempt("npm --prefix [d] test", {
      "[d]/package.json": JSON.stringify({
        name: "p",
        version: "1.0.0",
        scripts: { test: "echo benign" },
      }),
      "d/package.json": pkg,
      "d/e.sh": "id > pwned\n",
    });
    expect(r.ran).toBe(false);
  });

  it("the supervisor alone: no `..` after a mapped /proc/self, for exec or for writing", async () => {
    const forms = [
      "/proc/self/../self/exe -c 'id > pwned'",
      "/proc/self/./exe -c 'id > pwned'",
      "/proc/thread-self/../../self/exe -c 'id > pwned'",
      "/proc//self/exe -c 'id > pwned'",
      "/./proc/self/exe -c 'id > pwned'",
    ];
    const probe = [
      ...forms.map((f, i) => `${f} 2>/dev/null; echo rc-${i}=$?`),
      "echo x > /proc/self/../self/cwd/zz-escape 2>/dev/null; echo rc-write=$?",
      "echo OK > ok.txt; cat ok.txt",
    ].join("\n");
    const r = await runShellPins({ "x.sh": `${probe}\n`, "e.sh": "id > pwned\n" }, "sh x.sh", [
      "x.sh",
    ]);
    for (let i = 0; i < forms.length; i++) {
      expect(r.out).toMatch(new RegExp(`rc-${i}=[1-9]`));
    }
    expect(r.out).toMatch(/rc-write=[1-9]/);
    expect(r.out).toMatch(/^OK$/m);
    expect(r.ran).toBe(false);
  });

  // Shell read pins: a real shell reads a file of a writable place only as Enclawed read it.
  it("containment: a shell's `.` of a project file Enclawed did not read fails; what it read still runs", async () => {
    const probe = [
      "( . ./unread.sh ) 2>/dev/null; echo rc-unread=$?",
      ". ./read.sh; echo rc-read=$?",
      "( read v < data.txt ) 2>/dev/null; echo rc-data-unread=$?",
      "cat data.txt",
      "echo changed > read2.sh; ( . ./read2.sh ) 2>/dev/null; echo rc-changed=$?",
      "echo 'id > pwned' > gen.sh; ( . ./gen.sh ) 2>/dev/null; echo rc-gen=$?",
      "bash ok.sh",
    ].join("\n");
    const r = await runShellPins(
      {
        "x.sh": `${probe}\n`,
        "read.sh": "echo READ-RAN\n",
        "read2.sh": "echo READ2\n",
        "unread.sh": "id > pwned\n",
        "data.txt": "DATA-LINE\n",
        "ok.sh": "cat <<EOF\nHEREDOC-OK\nEOF\n",
      },
      "sh x.sh",
      ["x.sh", "read.sh", "read2.sh", "ok.sh"],
    );
    expect(r.out).toMatch(/rc-unread=[1-9]/);
    expect(r.out).toContain("READ-RAN");
    expect(r.out).toMatch(/rc-read=0/);
    expect(r.out).toMatch(/rc-data-unread=[1-9]/);
    expect(r.out).toContain("DATA-LINE"); // cat (no shell) reads it unchanged
    expect(r.out).toMatch(/rc-changed=[1-9]/); // rewritten after it was read
    expect(r.out).toMatch(/rc-gen=[1-9]/); // written by the shell itself: still not read
    expect(r.out).toContain("HEREDOC-OK"); // a small here-document: a pipe
    expect(r.ran).toBe(false);
  });

  // The locale decides what patterns match ([a-f] takes in A-E under a UTF-8 collation).
  const LOC = { "a.sh": "echo a\n", "B.sh": "id > pwned\n", "x.sh": "echo x\n" };
  it.each([
    ["LC_ALL on the line", "LC_ALL=en_US.UTF-8 . ./[a-f].sh"],
    ["LANG exported", "export LANG=en_US.UTF-8; . ./x.sh"],
    ["LC_COLLATE through env", "env LC_COLLATE=en_US.UTF-8 sh x.sh"],
    ["GLOBIGNORE", "GLOBIGNORE=x bash -c 'cat ./*.sh'"],
  ] as const)("no locale or pattern setting on a contained line: %s", async (_name, line) => {
    const r = await attempt(line, LOC);
    expect(r.contained).toBe(false);
    expect(r.ran).toBe(false);
  });

  it("a pattern over names outside ASCII is refused (the shells match bytes)", async () => {
    const r = await attempt(". ./?.sh", { "é.sh": "id > pwned\n" });
    expect(r.contained).toBe(false);
  });

  it("the wrappers alone: shells and awk run in the C locale whatever the run sets", async () => {
    const r = await runShellPins(
      { "ok.sh": 'echo "LOCALE=$LC_ALL/$LANG/$LC_COLLATE"\n' },
      'env LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 LC_COLLATE=en_US.UTF-8 sh ok.sh; env LC_ALL=en_US.UTF-8 awk \'BEGIN { print "AWK=" ENVIRON["LC_ALL"] }\'',
      ["ok.sh"],
    );
    expect(r.out).toContain("LOCALE=C//");
    expect(r.out).toContain("AWK=C");
  });

  // Round 2 on c014a5189: what a shell opens is decided on the object itself.
  it("containment: a shell opens no FIFO, socket or device but the data devices; a hard link to a writable file is read only as read", async () => {
    const probe = [
      "( . ./s.sh ) 2>/dev/null; echo rc-fifo=$?",
      "( . ./nf ) 2>/dev/null; echo rc-nowriter=$?",
      "( . ./sock ) 2>/dev/null; echo rc-sock=$?",
      ". /dev/null; echo rc-null=$?",
      "head -c 1 /dev/zero > /dev/null; echo rc-zero=$?",
      "( . ./.git/hooks/h ) 2>/dev/null; echo rc-hook=$?",
      "echo 'id > pwned' > n.txt 2>/dev/null; echo rc-write-linked=$?",
      "ln n.txt n2.txt; echo 'id > pwned' > n.txt 2>/dev/null; echo rc-relinked=$?",
      "echo a > own.txt; ln own.txt own2.txt; echo b > own2.txt; echo rc-own-link=$?",
      "echo DONE",
    ].join("\n");
    const net = await import("node:net");
    const t0 = Date.now();
    const r = await runShellPins(
      {
        "x.sh": `${probe}\n`,
        "s.sh": "echo benign\n",
        "n.txt": "echo hook\n",
        ".git/hooks/.keep": "",
      },
      "sh x.sh",
      ["x.sh", "s.sh"],
      async (proj) => {
        // The script Enclawed read swapped for a FIFO another process writes.
        fs.rmSync(path.join(proj, "s.sh"));
        spawnSync("mkfifo", [path.join(proj, "s.sh"), path.join(proj, "nf")]);
        spawn("/bin/sh", ["-c", `printf 'id > pwned\\n' > '${path.join(proj, "s.sh")}'`], {
          detached: true,
          stdio: "ignore",
        }).unref();
        await new Promise<void>((res) => {
          const srv = net
            .createServer()
            .listen(path.join(proj, "sock"), () => srv.close(() => res()));
        }).catch(() => {});
        // A hook of the read-only .git that is a hard link to a project file,
        // which another process then rewrites.
        fs.linkSync(path.join(proj, "n.txt"), path.join(proj, ".git/hooks/h"));
        fs.writeFileSync(path.join(proj, "n.txt"), "id > pwned\n");
      },
    );
    expect(Date.now() - t0).toBeLessThan(60_000);
    expect(r.out).toMatch(/rc-own-link=0/); // a link the run made itself
    for (const k of ["fifo", "nowriter", "sock", "hook", "write-linked", "relinked"]) {
      expect(r.out).toMatch(new RegExp(`rc-${k}=[1-9]`));
    }
    expect(r.out).toMatch(/rc-null=0/);
    expect(r.out).toMatch(/rc-zero=0/);
    expect(r.out).toContain("DONE");
    expect(r.ran).toBe(false);
  });

  // zz-u1: a hook of the read-only .git hard-linked to a project file. The run
  // removes the project name (the hook is left with one name), then names the
  // inode again through a descriptor link it holds open, and writes it.
  it("containment: an inode known at the start is never named again or written through a descriptor link", async () => {
    // n: the project name of the hook; step: names the held inode again (or
    // writes it) through the descriptor link; its status is the probe's.
    const held = (n: string, step: string, k: string, w: string) =>
      `( tail -f ${n} > /dev/null & P=$!; sleep 1; for x in /proc/$P/fd/*; do [ "$(readlink $x)" = "$PWD/${n}" ] && F=$x; done; rm ${n}; ${step}; R=$?; echo 'id > pwned' > ${w}; kill $P; exit $R ) 2>/dev/null; echo rc-${k}=$?`;
    const probe = [
      held("a", "cp -lL $F b", "cp", "b"),
      held("c", "gnucp -lL $F d", "gnucp", "d"),
      held("e", "ln -s $F s; ln -L s f", "ln-L", "f"),
      held("g", "echo 'id > pwned' > $F", "reopen", "/dev/null"),
      held("h", `node -e "require('fs').linkSync(process.argv[1],'i')" $F`, "node", "i"),
      `if command -v python3 >/dev/null; then ${held("j", `python3 -c "import os,sys; os.link(sys.argv[1], 'k', follow_symlinks=True)" $F`, "python", "k")}; else echo rc-python=9; fi`,
      "ln .git/hooks/pre-commit l 2>/dev/null; echo rc-hook-source=$?",
      "echo a > own.txt; ln own.txt own2.txt; echo b > own2.txt; echo rc-own-link=$?",
      `node -e "const fs=require('fs'); const fd=fs.openSync('m','r'); fs.unlinkSync('m'); fs.linkSync('/proc/self/fd/'+fd,'n'); fs.writeFileSync('n','id > pwned')" 2>/dev/null; echo rc-node-self=$?`,
      "echo DONE",
    ].join("\n");
    const r = await runShellPins(
      { "x.sh": `${probe}\n`, ".git/hooks/.keep": "" },
      "sh x.sh",
      ["x.sh"],
      (proj) => {
        const hook = path.join(proj, ".git/hooks/pre-commit");
        fs.writeFileSync(hook, "#!/bin/sh\necho benign hook\n", { mode: 0o755 });
        for (const n of ["a", "c", "e", "g", "h", "j", "m"]) {
          fs.linkSync(hook, path.join(proj, n));
        }
        hookPath = hook;
      },
    );
    expect(fs.readFileSync(hookPath, "utf8")).toBe("#!/bin/sh\necho benign hook\n");
    for (const k of [
      "cp",
      "gnucp",
      "ln-L",
      "reopen",
      "node",
      "node-self",
      "python",
      "hook-source",
    ]) {
      expect(r.out).toMatch(new RegExp(`rc-${k}=[1-9]`));
    }
    expect(r.out).toMatch(/rc-own-link=0/); // a link the run made itself
    expect(r.out).toContain("DONE");
    expect(r.ran).toBe(false);
  });
  let hookPath = "";

  // zz-a36: a run's chmod, chown, utime and xattr calls, mediated as writes are.
  async function runUnread(
    files: Record<string, string>,
    line: string,
    pinned: readonly string[],
    prepare: ((proj: string) => void) | null = null,
    extra: Partial<ContainedCode> | null = {},
  ): Promise<{ out: string; proj: string }> {
    const { root, proj } = project(files);
    prepare?.(proj);
    const code = {
      ...extra,
      // "!name": a shell script the line runs directly (bound executable).
      files: pinned.map((rel) => {
        const f = fs.realpathSync(path.join(proj, rel.replace(/^!/, "")));
        const b = fs.readFileSync(f);
        return {
          path: f,
          sha256: createHash("sha256").update(b).digest("hex"),
          exec: rel.startsWith("!"),
          ...(rel.startsWith("!") ? { shell: true, contentBase64: b.toString("base64") } : {}),
        };
      }),
      ...(pinned.some((r) => r.startsWith("!"))
        ? {
            shell: pinned
              .filter((r) => r.startsWith("!"))
              .map((r) => fs.realpathSync(path.join(proj, r.slice(1)))),
          }
        : {}),
    } as ContainedCode;
    const sc = scriptContainer({ stateDir: path.join(root, "state") });
    let out = "";
    try {
      const r = await sc.contain({
        kind: "project-script",
        label: line,
        command: line,
        dialect: "posix",
        cwd: proj,
        projectDir: proj,
        // null: no pins, as a line a person approved runs.
        ...(extra === null ? {} : { code }),
      });
      expect(r.ok ? "ok" : r.message).toBe("ok");
      if (r.ok) {
        const p = spawnSync("/bin/sh", ["-c", r.command], { encoding: "utf8", timeout: 60_000 });
        out = `${p.stdout}\n${p.stderr}`;
      }
    } finally {
      await sc.close();
    }
    return { out, proj };
  }

  const PY_T = [
    "import errno, os",
    "def t(name, f):",
    "    try:",
    "        f()",
    "        print(name, 'ok')",
    "    except OSError as e:",
    "        print(name, 'refused', errno.errorcode.get(e.errno))",
  ].join("\n");

  it("containment: modes, ownership, times and extended attributes are mediated", async () => {
    const py = [
      PY_T,
      "t('cfg', lambda: os.chmod('.git/config', 0o666))",
      "t('envrc', lambda: os.chmod('.envrc', 0o600))",
      "t('gitdir', lambda: os.chmod('.git', 0o777))",
      "fd = os.open('.git/config', os.O_RDONLY)",
      "t('fchmod-cfg', lambda: os.fchmod(fd, 0o600))",
      "t('old-x', lambda: os.chmod('old.sh', 0o755))",
      "t('old-same', lambda: os.chmod('old.sh', os.stat('old.sh').st_mode & 0o7777))",
      "open('new.sh', 'w').write('x\\n')",
      "t('new-x', lambda: os.chmod('new.sh', 0o755))",
      "t('new-gw', lambda: os.chmod('new.sh', 0o775))",
      "t('new-suid', lambda: os.chmod('new.sh', 0o4755))",
      "os.makedirs('/tmp/t', exist_ok=True)",
      "t('tmp', lambda: os.chmod('/tmp/t', 0o700))",
      "t('tmp-ow', lambda: os.chmod('/tmp/t', 0o777))",
      "t('chown', lambda: os.chown('new.sh', os.getuid(), os.getgid()))",
      "t('xattr', lambda: os.setxattr('new.sh', 'user.x', b'1'))",
      "t('xattr-rm', lambda: os.removexattr('new.sh', 'user.x'))",
      "t('utime-cfg', lambda: os.utime('.git/config', (0, 0)))",
      "t('utime-envrc', lambda: os.utime('.envrc', None))",
      "t('utime-new', lambda: os.utime('new.sh', (5, 5)))",
      "t('utime-old', lambda: os.utime('old.sh', None))",
      "os.umask(0)",
      "os.close(os.open('made.txt', os.O_CREAT | os.O_WRONLY, 0o6777))",
      "os.mkdir('made.d', 0o777)",
      "print('made', oct(os.stat('made.txt').st_mode & 0o7777), oct(os.stat('made.d').st_mode & 0o7777))",
      "print('times', os.stat('new.sh').st_mtime)",
    ].join("\n");
    let before: Record<string, number> = {};
    const mode = (proj: string, f: string) => fs.statSync(path.join(proj, f)).mode & 0o7777;
    const r = await runUnread(
      { "s.py": `${py}\n`, ".envrc": "export X=1\n", "old.sh": "echo old\n" },
      "python3 s.py",
      ["s.py"],
      (proj) => {
        before = {
          cfg: mode(proj, ".git/config"),
          envrc: mode(proj, ".envrc"),
          git: mode(proj, ".git"),
          old: mode(proj, "old.sh"),
        };
      },
    );
    for (const k of [
      "cfg",
      "envrc",
      "gitdir",
      "fchmod-cfg",
      "old-x",
      "new-gw",
      "new-suid",
      "tmp-ow",
      "chown",
      "utime-cfg",
      "utime-envrc",
    ]) {
      expect(r.out).toMatch(new RegExp(`^${k} refused E(PERM|ROFS|ACCES)$`, "m"));
    }
    expect(r.out).toMatch(/^xattr refused E(OPNOTSUPP|NOTSUP)$/m);
    expect(r.out).toMatch(/^xattr-rm refused E(OPNOTSUPP|NOTSUP)$/m);
    for (const k of ["old-same", "new-x", "tmp", "utime-new", "utime-old"]) {
      expect(r.out).toMatch(new RegExp(`^${k} ok$`, "m"));
    }
    expect(r.out).toMatch(/^made 0o755 0o755$/m); // no set-ID, sticky, group or other write on a new file
    expect(r.out).toMatch(/^times 5\.0$/m);
    const after = {
      cfg: mode(r.proj, ".git/config"),
      envrc: mode(r.proj, ".envrc"),
      git: mode(r.proj, ".git"),
      old: mode(r.proj, "old.sh"),
    };
    expect(after).toEqual(before);
  });

  it("containment: the python wrapper refuses executable memory the run could have written", async () => {
    const py = [
      PY_T,
      "import mmap",
      "t('anon-rwx', lambda: mmap.mmap(-1, 4096, prot=mmap.PROT_READ | mmap.PROT_WRITE | mmap.PROT_EXEC))",
      "t('anon-rx', lambda: mmap.mmap(-1, 4096, prot=mmap.PROT_READ | mmap.PROT_EXEC))",
      "t('memfd', lambda: os.memfd_create('x'))",
      "t('anon-rw', lambda: mmap.mmap(-1, 4096))",
      "t('file-r', lambda: mmap.mmap(os.open('s.py', os.O_RDONLY), 0, prot=mmap.PROT_READ))",
    ].join("\n");
    const r = await runUnread({ "s.py": `${py}\n` }, "python3 s.py", ["s.py"]);
    for (const k of ["anon-rwx", "anon-rx", "memfd"]) {
      expect(r.out).toMatch(new RegExp(`^${k} refused EACCES$`, "m"));
    }
    expect(r.out).toMatch(/^anon-rw ok$/m);
    expect(r.out).toMatch(/^file-r ok$/m);
  });

  // zz-w1: a submodule's name may hold slashes and any word; its git directory
  // (.git/modules/a/objects/b) is a git directory like any other.
  const ODD_MODULES = ["a/objects/b", "x/refs/y", "z/logs/w", "hooks/q", "info/r", "sub"];
  it("containment: a submodule git directory whose name holds objects, refs, logs, hooks or info is a git directory", async () => {
    const probe = [
      ...ODD_MODULES.map(
        (m) =>
          `( printf '[core]\\n\\tfsmonitor = touch pwned_host; false\\n' >> .git/modules/${m}/config ) 2>/dev/null; echo "rc-${m}=$?"`,
      ),
      "( mkdir -p .git/modules/a/objects/c && echo x > .git/modules/a/objects/c/HEAD ) 2>/dev/null; echo rc-new-in-objects=$?",
      "( mkdir -p .git/objects/ab && echo blob > .git/objects/ab/cd ) 2>/dev/null; echo rc-loose-object=$?",
      "( echo x > .git/objects/info./alternates ) 2>/dev/null; echo rc-info-dot=$?",
      "echo DONE",
    ].join("\n");
    let before: string[] = [];
    const r = await runShellPins({ "x.sh": `${probe}\n` }, "sh x.sh", ["x.sh"], (proj) => {
      // a: a submodule itself, with a/objects/b a second one inside its object store.
      for (const m of ["a", ...ODD_MODULES]) {
        const d = path.join(proj, ".git/modules", m);
        fs.mkdirSync(path.join(d, "objects"), { recursive: true });
        fs.writeFileSync(path.join(d, "HEAD"), "ref: refs/heads/main\n");
        fs.writeFileSync(path.join(d, "config"), "[core]\n\tbare = false\n");
      }
      before = ODD_MODULES.map((m) =>
        fs.readFileSync(path.join(proj, ".git/modules", m, "config"), "utf8"),
      );
      projDir = proj;
    });
    for (const m of ODD_MODULES) {
      expect(r.out).toMatch(new RegExp(`rc-${m.replace(/\//g, "\\/")}=[1-9]`));
    }
    expect(r.out).toMatch(/rc-new-in-objects=[1-9]/);
    expect(r.out).toMatch(/rc-info-dot=[1-9]/);
    expect(r.out).toMatch(/rc-loose-object=0/);
    expect(r.out).toContain("DONE");
    expect(
      ODD_MODULES.map((m) =>
        fs.readFileSync(path.join(projDir, ".git/modules", m, "config"), "utf8"),
      ),
    ).toEqual(before);
  });

  it("the host's submodule list finds a git directory whose name holds objects, refs, logs, hooks or info", async () => {
    const { moduleDirsOf } = await import("./git-programs.js");
    const { proj } = project({ README: "r\n" });
    for (const m of ["a", ...ODD_MODULES]) {
      const d = path.join(proj, ".git/modules", m);
      fs.mkdirSync(path.join(d, "objects", "ab"), { recursive: true });
      fs.writeFileSync(path.join(d, "HEAD"), "ref: refs/heads/main\n");
      fs.writeFileSync(path.join(d, "config"), "[core]\n");
    }
    const found = (moduleDirsOf(path.join(proj, ".git")) ?? [])
      .map((d) => path.relative(path.join(proj, ".git/modules"), d))
      .toSorted();
    expect(found).toEqual(["a", ...ODD_MODULES].toSorted());
  });

  // zz-v1..v4: a git directory is written only where git writes for the run's
  // own operations; what the person's next host git reads from it is not.
  it("containment: inside a git directory only objects, the index and (with ref writes) refs are written", async () => {
    const probe = [
      'w() { ( printf \'%s\\n\' "$2" >> "$1" ) 2>/dev/null; echo "rc-$3=$?"; }',
      "mkdir -p ev/objects ev/refs; printf '[core]\\n\\tfsmonitor = touch pwned_host; false\\n' > ev/config; echo 'ref: refs/heads/main' > ev/HEAD",
      "w .git/commondir ../ev commondir",
      "w .git/modules/sub/config '[core]' module-config",
      "( mkdir -p .git/modules/sub/hooks/x ) 2>/dev/null; echo rc-module-hooks=$?",
      "w .git/objects/info/alternates /tmp/o alternates",
      "w .git/info/attributes '* filter=x' info-attributes",
      "w .git/worktrees/w/config.worktree '[core]' worktree-config",
      "w .git/worktrees/w/gitdir /x worktree-gitdir",
      "w .git/shallow 0000 shallow",
      "w .git/description x description",
      "w .git/rebase-merge/git-rebase-todo 'exec id' rebase-todo",
      "w .git/HEAD 'ref: refs/heads/x' head-readonly",
      "w nested/.git/config '[core]' nested-config",
      "w newrepo/.git x make-git-file",
      "( mkdir -p other/.git ) 2>/dev/null; echo rc-make-git-dir=$?",
      "w bare.git/config '[core]' linked-gitdir-config",
      "mkdir -p .git/objects/ab && echo blob > .git/objects/ab/obj; echo rc-objects=$?",
      "mkdir -p bare.git/objects/ab && echo blob > bare.git/objects/ab/obj; echo rc-linked-objects=$?",
      "echo DONE",
    ].join("\n");
    let before = "";
    const r = await runShellPins(
      { "x.sh": `${probe}\n`, "nested/README": "n\n", "bare.git/HEAD": "ref: refs/heads/main\n" },
      "sh x.sh",
      ["x.sh"],
      (proj) => {
        fs.mkdirSync(path.join(proj, ".git/modules/sub"), { recursive: true });
        fs.writeFileSync(path.join(proj, ".git/modules/sub/config"), "[core]\n\tbare = false\n");
        spawnSync("git", ["init", "-q", path.join(proj, "nested")]);
        fs.mkdirSync(path.join(proj, "wt"));
        fs.writeFileSync(path.join(proj, "wt/.git"), "gitdir: ../bare.git\n");
        before = fs.readFileSync(path.join(proj, ".git/modules/sub/config"), "utf8");
        projDir = proj;
      },
    );
    for (const k of [
      "commondir",
      "module-config",
      "module-hooks",
      "alternates",
      "info-attributes",
      "worktree-config",
      "worktree-gitdir",
      "shallow",
      "description",
      "rebase-todo",
      "head-readonly",
      "nested-config",
      "make-git-file",
      "make-git-dir",
      "linked-gitdir-config",
    ]) {
      expect(r.out).toMatch(new RegExp(`rc-${k}=[1-9]`));
    }
    expect(r.out).toMatch(/rc-objects=0/);
    expect(r.out).toMatch(/rc-linked-objects=0/);
    expect(r.out).toContain("DONE");
    expect(fs.existsSync(path.join(projDir, ".git/commondir"))).toBe(false);
    expect(fs.readFileSync(path.join(projDir, ".git/modules/sub/config"), "utf8")).toBe(before);
    // The person's next git runs nothing planted.
    spawnSync("git", ["status"], {
      cwd: projDir,
      env: { PATH: "/usr/bin:/bin", HOME: path.join(projDir, "..", "home") },
    });
    expect(fs.existsSync(path.join(projDir, "pwned_host"))).toBe(false);
  });
  let projDir = "";

  it("containment: contained git add, status, diff and (a ref-writing line) switch -c still work", async () => {
    const line =
      "git add a.txt && git status --short && git diff --cached --stat && git switch -q -c topic && git rev-parse --abbrev-ref HEAD";
    const r = await runUnread(
      { "a.txt": "one\n" },
      line,
      [],
      (proj) => {
        fs.writeFileSync(path.join(proj, "a.txt"), "two\n");
      },
      { gitRefsWritable: true },
    );
    expect(r.out).toMatch(/^M  a\.txt$/m);
    expect(r.out).toMatch(/1 file changed/);
    expect(r.out).toMatch(/^topic$/m);
  });

  // The build engineer's recipe, in the form a line a person approved runs
  // (no pins): nothing that runs later on the host is planted.
  it("containment: an approved (unpinned) project script plants nothing that runs later on the host", async () => {
    const targets = [
      ".git/hooks/post-checkout",
      ".git/config",
      ".git/info/attributes",
      ".git/modules/sub/hooks/post-checkout",
      ".git/modules/sub/config",
      ".git/refs/heads/evil",
      ".git/HEAD",
      ".git/commondir",
      ".github/workflows/x.yml",
      ".vscode/tasks.json",
      ".envrc",
      "sub/.envrc",
      "sitecustomize.py",
      "lib/usercustomize.py",
      ".venv/lib/python3.12/site-packages/evil.pth",
      ".venv/lib/python3.12/site-packages/sitecustomize.py",
      "lib/site-packages/x.pth",
      "package.json",
      "sub/package.json",
      ".npmrc",
      // zz-a37: implicit execution caches and a virtual environment's entry points.
      "__pycache__/m.cpython-314.pyc",
      "lib/m.pyc",
      "lib/m.pyo",
      "__pypackages__/3.14/lib/x.py",
      ".venv/bin/activate",
      ".venv/bin/pip",
      ".venv/Scripts/activate.bat",
      ".venv/pyvenv.cfg",
      "newenv/pyvenv.cfg",
      "conda-env/etc/conda/activate.d/x.sh",
      "conda-env/bin/python3",
      "node_modules/.cache/babel-loader/x.json",
      "node_modules/.vite/deps/x.js",
      ".parcel-cache/x",
      ".turbo/x",
      ".venv/lib/python3.12/site-packages/__pycache__/mod.cpython-312.pyc",
      // zz-a39: by name, whether or not the start found a virtual environment.
      "nocfg/.venv/bin/activate",
      "nocfg/venv/Scripts/activate.bat",
      "venv/bin/pip",
      "conda2/etc/conda/deactivate.d/y.sh",
      "node_modules/.bin/tsc",
      "node_modules/pkg/node_modules/.bin/x",
      "node_modules/@scope/pkg/.bin/x",
      ".clangd",
      "sub/.clangd",
      // zz-h3: yarn's own code in the project, its PnP loader, dev servers' caches,
      // and the file a protected configuration names to run (yarnPath).
      ".yarn/releases/yarn-9.cjs",
      ".yarn/plugins/x.cjs",
      ".yarn/sdks/eslint/bin/eslint.js",
      ".pnp.cjs",
      ".pnp.loader.mjs",
      ".angular/cache/x.js",
      ".next/cache/webpack/x.pack",
      "tools/yarn-runner.cjs",
      // zz-a41: package-manager state, structurally (not cache by cache).
      ".pnp.js",
      ".yarn/cache/pkg-npm-1.0.0.zip",
      ".yarn/unplugged/pkg/index.js",
      ".yarn/install-state.gz",
      "pnpmfile.js",
      ".pnpmfile.cjs",
      "node_modules/pkg/index.js",
      "node_modules/@scope/pkg/lib/x.js",
      "node_modules/.modules.yaml",
      "node_modules/.package-lock.json",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "bun.lockb",
      ".bundle/config",
      "vendor/bundle/ruby/3.3.0/gems/x/lib/x.rb",
      "php/vendor/composer/autoload_real.php",
      ".mvn/wrapper/maven-wrapper.jar",
      "gradle/wrapper/gradle-wrapper.jar",
      ".cargo/registry/x",
    ];
    const line = [
      ...targets.map(
        (t) =>
          `mkdir -p ${path.posix.dirname(t)} 2>/dev/null; (echo planted >> ${t}) 2>/dev/null && echo "PLANTED ${t}" || echo "REFUSED ${t}"`,
      ),
      'mkdir -p src && (echo ok >> src/normal.txt) && echo "PLANTED src/normal.txt"',
      // A virtual environment's packages: only an install writes them, even after a person's approval.
      '(echo x >> .venv/lib/python3.12/site-packages/mod.py) 2>/dev/null && echo "PLANTED venv-module" || echo "REFUSED venv-module"',
      // A native addon's build tree under node_modules (node-gyp, cmake-js): written.
      'mkdir -p node_modules/pkg/build && (echo x > node_modules/pkg/build/x.node) && echo "PLANTED addon-build"',
      '(echo "{}" > compile_commands.json) && echo "PLANTED compile-commands"',
    ].join("\n");
    let before: Record<string, string> = {};
    const sha = (f: string) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    const r = await runUnread(
      {
        "package.json": '{"name":"p","scripts":{}}\n',
        ".venv/lib/python3.12/site-packages/.keep": "",
        "x.sh": `${line}\n`,
      },
      "sh x.sh",
      [],
      (proj) => {
        fs.mkdirSync(path.join(proj, ".git/modules/sub"), { recursive: true });
        fs.writeFileSync(path.join(proj, ".git/modules/sub/config"), "[core]\n");
        fs.mkdirSync(path.join(proj, ".venv/bin"), { recursive: true });
        fs.writeFileSync(path.join(proj, ".venv/pyvenv.cfg"), "home = /usr/bin\n");
        fs.writeFileSync(path.join(proj, ".venv/bin/activate"), "# activate\n");
        fs.mkdirSync(path.join(proj, "conda-env/conda-meta"), { recursive: true });
        fs.writeFileSync(path.join(proj, ".yarnrc.yml"), "yarnPath: ./tools/yarn-runner.cjs\n");
        // A Composer project: its vendor directory holds the autoloader every php run loads.
        fs.mkdirSync(path.join(proj, "node_modules/pkg"), { recursive: true });
        fs.mkdirSync(path.join(proj, "php/vendor"), { recursive: true });
        fs.writeFileSync(path.join(proj, "php/vendor/autoload.php"), "<?php\n");
        before = {
          pkg: sha(path.join(proj, "package.json")),
          head: sha(path.join(proj, ".git/HEAD")),
        };
        projDir = proj;
      },
      null,
    );
    for (const t of targets) {
      expect(r.out, t).toContain(`REFUSED ${t}`);
    }
    expect(r.out).toContain("PLANTED src/normal.txt");
    expect(r.out).toContain("REFUSED venv-module");
    expect(r.out).toContain("PLANTED addon-build");
    expect(r.out).toContain("PLANTED compile-commands");
    expect(fs.readFileSync(path.join(projDir, ".venv/bin/activate"), "utf8")).toBe("# activate\n");
    expect(sha(path.join(projDir, "package.json"))).toBe(before.pkg);
    expect(sha(path.join(projDir, ".git/HEAD"))).toBe(before.head);
    expect(fs.existsSync(path.join(projDir, ".git/refs/heads/evil"))).toBe(false);
  });

  // A file the line runs directly is bound executable: nothing writes it while
  // the run lasts (no path is both writable and executable in the view).
  it("containment: a file the line runs directly is never written during the run", async () => {
    const script =
      "#!/bin/sh\n(echo 'echo pwned' >> run.sh) 2>/dev/null; echo rc-append=$?\n(: > run.sh) 2>/dev/null; echo rc-trunc=$?\n(cat /bin/true > run.sh) 2>/dev/null; echo rc-elf=$?\n(ln run.sh r2 && echo x >> r2) 2>/dev/null; echo rc-link=$?\necho DONE\n";
    const r = await runUnread(
      { "run.sh": script },
      "sh -c ./run.sh",
      ["!run.sh"],
      (proj) => {
        fs.chmodSync(path.join(proj, "run.sh"), 0o755);
        projDir = proj;
      },
      { shellText: ["./run.sh"] },
    );
    for (const k of ["append", "trunc", "elf", "link"]) {
      expect(r.out).toMatch(new RegExp(`rc-${k}=[1-9]`));
    }
    expect(r.out).toContain("DONE");
    expect(fs.readFileSync(path.join(projDir, "run.sh"), "utf8")).toBe(script);
  });

  // zz-y3: a run that rewrites installed dependency code (reversible: history
  // keeps it; loaded implicitly by editors and tools) is reported after it.
  it("containment: changed installed dependency code is reported after the run (a package's own build tree is not)", async () => {
    const { root, proj } = project({
      "x.sh":
        "echo 'module.exports = 2;' > node_modules/pkg/index.js\nmkdir -p node_modules/pkg/build && echo bin > node_modules/pkg/build/addon.node\necho 'x = 2' > pylib/site-packages/somepkg/__init__.py\necho 'x = 2' > .venv/lib/python3.14/site-packages/somepkg/__init__.py\necho ok > src.txt\n",
      "node_modules/pkg/index.js": "module.exports = 1;\n",
      "node_modules/other/index.js": "module.exports = 3;\n",
      "pylib/site-packages/somepkg/__init__.py": "x = 1\n",
      ".venv/pyvenv.cfg": "home = /usr/bin\n",
      ".venv/lib/python3.14/site-packages/somepkg/__init__.py": "x = 1\n",
    });
    const events: Record<string, unknown>[] = [];
    const sc = scriptContainer({
      stateDir: path.join(root, "state"),
      onEvent: (e) => events.push(e as Record<string, unknown>),
    });
    try {
      const r = await sc.contain({
        kind: "project-script",
        label: "sh x.sh",
        command: "sh x.sh",
        dialect: "posix",
        cwd: proj,
        projectDir: proj,
      });
      expect(r.ok ? "ok" : r.message).toBe("ok");
      if (r.ok) {
        spawnSync("/bin/sh", ["-c", r.command], { encoding: "utf8", timeout: 60_000 });
      }
    } finally {
      await sc.close();
    }
    const dep = events.find((e) => e.code === "dependency-code-changed");
    // node_modules is read-only to a run but an install (PACKAGE_STATE): only
    // what is left to report is reported.
    expect(dep?.files).toEqual([path.join(proj, "pylib/site-packages/somepkg/__init__.py")]);
    expect(fs.readFileSync(path.join(proj, "node_modules/pkg/index.js"), "utf8")).toBe(
      "module.exports = 1;\n",
    );
    expect(fs.existsSync(path.join(proj, "node_modules/pkg/build/addon.node"))).toBe(true);
    // A virtual environment's packages: never written by a run but an install.
    expect(
      fs.readFileSync(
        path.join(proj, ".venv/lib/python3.14/site-packages/somepkg/__init__.py"),
        "utf8",
      ),
    ).toBe("x = 1\n");
  });

  // An exec through a descriptor link is refused by how the name resolves (the
  // supervisor), and the shell's own descriptors are not reachable through
  // /proc anyway (the real shell is not dumpable). A plain exec still runs.
  it("containment: an exec through a descriptor link is refused; a plain one runs", async () => {
    const ld = fs.realpathSync(
      ["/lib64/ld-linux-x86-64.so.2", "/lib/ld-linux-aarch64.so.1"].find((f) => fs.existsSync(f)) ??
        "/bin/sh",
    );
    const probe = [
      `exec 3<${ld}`,
      "ln -s /proc/$$/fd/3 l; ./l --version > /dev/null 2>&1; echo rc-magic=$?",
      "ln -s /dev/fd/3 l2; ./l2 --version > /dev/null 2>&1; echo rc-devfd=$?",
      `${ld} --version > /dev/null; echo rc-plain=$?`,
      "echo DONE",
    ].join("\n");
    const r = await runShellPins({ "x.sh": `${probe}\n` }, "sh x.sh", ["x.sh"]);
    expect(r.out).toMatch(/rc-magic=[1-9]/);
    expect(r.out).toMatch(/rc-devfd=[1-9]/);
    expect(r.out).toMatch(/rc-plain=0/);
    expect(r.out).toContain("DONE");
  });

  // zz-a23: what history keeps of the project before a contained run.
  it("the snapshot keeps a nested node_modules of the project's own; a file with another name is not written at all", () => {
    const { root, proj } = project({
      "src/node_modules/mylib/index.js": "USER WIP\n",
      "package.json": "{}\n",
      "package-lock.json": "{}\n",
      "node_modules/dep/index.js": "installed\n",
    });
    const limits = { maxFiles: 1000, maxBytes: 1 << 24, maxFileBytes: 1 << 20 };
    const plan = projectSnapshotPlan(proj, new Map(), limits);
    expect(plan.ok).toBe(true);
    const files = plan.ok ? plan.files.map((f) => path.relative(proj, f)) : [];
    expect(files).toContain("src/node_modules/mylib/index.js"); // no lockfile beside it: the project's own
    expect(files).not.toContain("node_modules/dep/index.js"); // installed from package.json and its lockfile
    fs.writeFileSync(path.join(root, "outside.txt"), "OUTSIDE\n");
    fs.linkSync(path.join(root, "outside.txt"), path.join(proj, "h.txt"));
    // No write goes through it (the name guard refuses it), so it needs no snapshot.
    const linked = projectSnapshotPlan(proj, new Map(), limits);
    expect(linked.ok && linked.files.some((f) => f.endsWith("h.txt"))).toBe(false);
  });

  it("a contained write through a hard link to a file outside the project is not contained", async () => {
    const code = "p = ['h.txt']\nopen(chr(47).join(p), 'w').write('clobbered')\n";
    const r = await attempt(`python3 - <<'EOF'\n${code}EOF`, {}, {});
    expect(r.ran).toBe(false);
  });

  // zz-a26: a link under a protected name made where no protected name shows.
  it("no python archive extraction runs contained (its members, links among them, are not read)", async () => {
    const code = "import tarfile\nwith tarfile.open('a.tar') as t:\n    t.extractall('.')\n";
    const r = await attempt(`python3 - <<'EOF'\n${code}EOF`, { "a.tar": "x" });
    expect(r.contained).toBe(false);
  });

  it("the supervisor alone: no link named, or pointing at, a protected name; .gitattributes and .git/info are protected", async () => {
    const probe = [
      "mkdir -p q/workflows",
      "ln -s q .github 2>/dev/null; echo rc-sym-name=$?",
      "ln -s .github x 2>/dev/null; echo rc-sym-target=$?",
      "ln -s ../.vscode y 2>/dev/null; echo rc-sym-target2=$?",
      "echo a > f; ln f .github 2>/dev/null; echo rc-hard=$?",
      "mv q .github 2>/dev/null; echo rc-mv=$?",
      "echo '* filter=lfs' > .gitattributes 2>/dev/null; echo rc-attr=$?",
      "echo '* filter=lfs' > .git/info/attributes 2>/dev/null; echo rc-info=$?",
      "ln -s f ok-link; echo rc-plain=$?",
    ].join("\n");
    const r = await runShellPins({ "x.sh": `${probe}\n`, ".git/info/.keep": "" }, "sh x.sh", [
      "x.sh",
    ]);
    for (const k of ["sym-name", "sym-target", "sym-target2", "hard", "mv", "attr", "info"]) {
      expect(r.out).toMatch(new RegExp(`rc-${k}=[1-9]`));
    }
    expect(r.out).toMatch(/rc-plain=0/);
  });

  it("the supervisor alone: the engine's list of what configures what runs later is the guard's (generated from it)", async () => {
    const probe = [
      "mkdir .github 2>/dev/null; echo x > .github/x 2>/dev/null; echo rc-github=$?",
      "echo '{}' > a.code-workspace 2>/dev/null; echo rc-suffix=$?",
      "echo x > mise.dev.toml 2>/dev/null; echo rc-affix=$?",
      "mkdir -p .roo 2>/dev/null; echo x > .roo/x 2>/dev/null; echo rc-roo=$?",
      "echo ok > plain.txt; echo rc-plain=$?",
      "mkdir -p .git/objects/ab && echo o > .git/objects/ab/cd; echo rc-git-objects=$?",
      "echo '{}' > package.json 2>/dev/null; echo rc-package=$?",
    ].join("\n");
    const r = await runShellPins(
      { "x.sh": `${probe}\n`, ".git/HEAD": "ref: refs/heads/main\n" },
      "sh x.sh",
      ["x.sh"],
    );
    // A project script does not rewrite the manifest (a new script in it runs on the next npm run).
    for (const k of ["github", "suffix", "affix", "roo", "package"]) {
      expect(r.out).toMatch(new RegExp(`rc-${k}=[1-9]`));
    }
    for (const k of ["plain", "git-objects"]) {
      expect(r.out).toMatch(new RegExp(`rc-${k}=0`));
    }
  });

  it("a contained run that may replace an untracked link has the link itself in history first", async () => {
    // project() commits what it is given: the link is made after, so git does not keep it.
    let root = "";
    const r = await attempt(
      "node w.js",
      { "w.js": "require('fs').writeFileSync('o.txt', 'x');\n" },
      {},
      (proj) => {
        root = path.dirname(proj);
        fs.symlinkSync("../nowhere/settings.json", path.join(proj, "cfg"));
      },
    );
    expect(r.contained).toBe(true);
    const policy = createPolicy({
      enforceAllowlists: false,
      maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    });
    const entries = await new HistoryStore({
      dir: path.join(root, "h"),
      limits: policy.history,
    }).list();
    const link = entries.find((e) => e.kind === "symlink" && e.path.endsWith("/cfg"));
    expect(link).toBeDefined();
  });

  // Live corpus: npm runs the package the working directory is in (the nearest
  // package.json up), so `npm test` from test/ runs the project's test script.
  it.each([
    ["npm test from a subdirectory", "cd test && npm test"],
    ["npm run from a subdirectory", "cd test && npm run test"],
  ])("%s runs the project's script as read", async (_name, line) => {
    let out = "";
    const r = await attempt(
      line,
      {
        "package.json": JSON.stringify({
          name: "tiny-math",
          version: "1.0.0",
          scripts: { test: "node --test" },
        }),
        "test/math.test.js": "require('node:test').test('adds', () => {});\n",
      },
      {},
      null,
      (o) => {
        out = o;
      },
    );
    expect(r.contained).toBe(true);
    expect(out).not.toMatch(/did not read/);
    expect(out).toMatch(/# pass 1/);
  });

  // Each runner's package and configuration, as it finds them from the
  // working directory (npm 9 and pnpm 10 checked by hand: the nearest
  // package.json up, a directory with node_modules stops both; a workspace
  // member's own scripts run; npm reads the workspace root's .npmrc).
  it.each([
    ["the root's own script (refused: what it runs is not read)", "npm test", {}, /./],
    ["a workspace member's script", "cd pkgs/a/src && npm test", {}, null],
    ["pnpm in a workspace member", "cd pkgs/a/src && pnpm test", {}, null],
    ["yarn in a workspace member", "cd pkgs/a/src && yarn test", {}, null],
    [
      "the workspace root's .npmrc",
      "cd pkgs/a/src && npm test",
      { ".npmrc": "script-shell=./x\n" },
      /\.npmrc sets how npm/,
    ],
    [
      "the member's .npmrc",
      "cd pkgs/a/src && npm test",
      { "pkgs/a/.npmrc": "node-options=--require ./x\n" },
      /pkgs\/a\/\.npmrc sets how/,
    ],
    [
      "a .yarnrc.yml below the package",
      "cd pkgs/a/src && yarn test",
      { "pkgs/a/src/.yarnrc.yml": "yarnPath: ./x.cjs\n" },
      /src\/\.yarnrc\.yml sets how yarn/,
    ],
    [
      "pnpm-workspace.yaml at the root",
      "cd pkgs/a && pnpm test",
      { "pnpm-workspace.yaml": "packages: ['pkgs/*']\nshellEmulator: true\n" },
      /pnpm-workspace\.yaml sets how pnpm/,
    ],
    [
      "a package.yaml pnpm reads",
      "cd pkgs/b && pnpm test",
      { "pkgs/b/package.yaml": "scripts:\n  test: id > pwned\n" },
      /package\.yaml/,
    ],
    [
      "a yarn name the package does not define",
      "cd pkgs/a && yarn run build:all",
      {},
      /not a script of pkgs\/a\/package\.json/,
    ],
    ["a bun name the package does not define", "cd pkgs/a && bun run x.ts", {}, /not a script of/],
  ] as const)("runners: %s", (_name, line, extra, refused) => {
    const { proj } = project({
      "package.json": JSON.stringify({
        name: "root",
        workspaces: ["pkgs/*"],
        scripts: { test: 'sh -c "$(cat c)"' },
      }),
      "pkgs/a/package.json": JSON.stringify({ name: "a", scripts: { test: "node --test" } }),
      "pkgs/a/src/x.js": "1\n",
      "pkgs/b/.keep": "",
      ...extra,
    });
    const p = parseCompound(line, { cwd: proj, home: null });
    expect(p.ok).toBe(true);
    const v = containedExecution(
      {
        projectDir: proj,
        home: null,
        fs: nodeFsProbe(),
        repositoryEnv: [],
        equalsCommitted: () => true,
      },
      p.ok ? p.commands : [],
    );
    if (refused) {
      expect(v.ok ? "contained" : v.why).toMatch(refused);
    } else {
      // The member's script (node --test) is read, not the root's.
      expect(v.ok ? "contained" : v.why).toBe("contained");
    }
  });

  it("a link into a place that is fresh in the containment, missing here, is refused (it may exist there)", async () => {
    const r = await attempt(
      "t/run e.sh",
      { "e.sh": "id > pwned\n" },
      { t: "/tmp/zz-not-here-enclawed" },
    );
    expect(r.contained).toBe(false);
  });

  it("the resolver: links out to the read-only toolchain resolve there; links into the containment's own files refuse", () => {
    const { proj } = project(
      { "e.sh": "x\n" },
      {
        ub: "/usr/bin",
        up: "../../../../../../../../usr/bin",
        r: "/proc/self/root/.enclawed/real/1/bin",
        p1: "/proc/1/root/usr/bin",
        cw: "/proc/self/cwd",
        l1: "/.enclawed/real/1/bin",
        chain: "l1",
        t: "/tmp/zz-not-here-enclawed",
        loop: "loop",
      },
    );
    const real = (p: string) => resolveViewPath(proj, p);
    expect(real("ub/true")).toEqual({ kind: "found", real: fs.realpathSync("/usr/bin/true") });
    expect(real("up/true").kind).toBe("found");
    expect(real("e.sh")).toEqual({ kind: "found", real: path.join(proj, "e.sh") });
    expect(real("no-such-zz")).toEqual({ kind: "absent" });
    expect(real("/bin/no-such-tool-zz").kind).toBe("absent");
    for (const p of [
      "r/dash",
      "p1/true",
      "cw/e.sh",
      "l1/dash",
      "chain/dash",
      "./l1/../l1/dash",
      "t/x",
      "loop/x",
      "/.enclawed/real/1/bin/dash",
      "/proc/self/root/usr/bin/true",
      "/dev/shm/x",
      "/sys/x",
    ]) {
      expect(real(p).kind, p).toBe("refused");
    }
  });

  it("the python guard alone: a process's memory is not opened, even for reading", async () => {
    const r = await runPinned(
      { "t.py": "import os\nopen('/proc/self/mem', 'rb')\n" },
      "python3 t.py",
      ["t.py"],
    );
    expect(r.out).toContain("a process's memory is not opened");
  });

  it("the awk guard alone: gawk runs in its sandbox", async () => {
    const r = await runPinned(
      { "x.txt": "a\n" },
      `awk 'BEGIN { h = "sys" "tem"; @h("id > pwned") }' x.txt`,
      [],
    );
    expect(r.ran).toBe(false);
  });

  it("an inert PYTHON* setting (PYTHONUNBUFFERED) still runs contained", async () => {
    const r = await attempt(`PYTHONUNBUFFERED=1 ${H("open('out.txt', 'w').write('x')")}`);
    expect(r.contained).toBe(true);
  });

  // Review on c014a5189: `arguments` at module scope is the CommonJS wrapper's
  // (require, module, ...); a hook the run registers (module.registerHooks)
  // ran first and handed node source Enclawed never read.
  const HOOK = `m.registerHooks({ load(url, c, n) { if (url.endsWith("t.mjs")) return { format: "module", source: ${JSON.stringify("import fs from 'node:fs'; fs.writeFileSync('pwned', 'uid=hooked')")}, shortCircuit: true }; return n(url, c); } });\nimport("./t.mjs");\n`;
  const T_MJS = "export default 1;\n";
  it("end to end: module.registerHooks reached through arguments[1]", async () => {
    const js = `const MO = ["mod", "ule"].join("");\nconst r = arguments[1];\nconst m = r(MO);\n${HOOK}`;
    const r = await attempt("node e.js", { "e.js": js, "t.mjs": T_MJS });
    expect(r.ran).toBe(false);
  });

  it.each([
    ["arguments[1] (require)", 'const r = arguments[1];\nr("fs");\n'],
    ["arguments[2] (module)", "const m = arguments[2];\nm.require('fs');\n"],
    ["arguments in a function", "function f() { return arguments.length; }\nf();\n"],
    ["a function's caller", "function f() { return f.caller; }\nf();\n"],
    ["arguments.callee", "(function () { return 1; })();\nconst c = { callee: 1 }.callee;\n"],
    ["process.mainModule", "process.mainModule.require('fs');\n"],
    ["require.main", "require.main.require('fs');\n"],
    ["module.parent", "const p = module.parent;\n"],
    ["module.children", "const c = module.children;\n"],
    ["a registerHooks member", "const m = {};\nm.registerHooks({});\n"],
    ["a register member", "const m = {};\nm.register('x');\n"],
  ] as const)("the reader refuses %s", async (_name, js) => {
    const r = await attempt("node e.js", { "e.js": js });
    expect(r.contained).toBe(false);
  });

  it("the node guard alone: loader hooks and the compile cache stay closed, by any way to node:module", async () => {
    const MO = `["mod", "ule"].join("")`;
    for (const get of [
      `const m = arguments[1](${MO});\n`,
      "const m = arguments[2].constructor;\n",
      `const m = process.getBuiltinModule(${MO});\n`,
      `const m = process.mainModule.constructor;\n`,
    ]) {
      for (const js of [
        `${get}${HOOK}`,
        `${get}try { m.register("data:text/javascript,0"); } catch {}\n${HOOK}`,
        `${get}m.enableCompileCache("cc");\nrequire("fs").writeFileSync("pwned", "uid=cache");\n`,
        `${get}Object.defineProperty(m, "registerHooks", { value: () => 0 });\nrequire("fs").writeFileSync("pwned", "uid=redefined");\n`,
      ]) {
        const r = await runPinned({ "e.js": js, "t.mjs": T_MJS }, "node e.js", ["e.js", "t.mjs"]);
        expect([js, r.ran]).toEqual([js, false]);
      }
    }
    // The import namespace shows the same closed functions, also after syncBuiltinESMExports.
    const esm = `const ns = await import("node:module");\nns.default.syncBuiltinESMExports();\nconst m = { registerHooks: ns.registerHooks };\n${HOOK}`;
    const r = await runPinned({ "e.mjs": esm, "t.mjs": T_MJS }, "node e.mjs", ["e.mjs", "t.mjs"]);
    expect(r.ran).toBe(false);
    expect(r.out).toContain("module.registerHooks was not loaded");
  });

  it("the node guard alone: vm, the inspector, node's module wrapper, workers and _compile build no unread code", async () => {
    const W = "require('fs').writeFileSync('pwned', 'uid=x')";
    const R = "const r = arguments[1];\n";
    for (const js of [
      `${R}r("vm").createScript(${JSON.stringify(W)}).runInThisContext();\n`,
      `${R}const s = new (r("inspector").Session)();\ns.connect();\ns.post("Runtime.evaluate", { expression: ${JSON.stringify(W)} });\n`,
      `${R}r("module").wrapper[0] = ${JSON.stringify(`${W};(function (exports, require, module, __filename, __dirname) { `)};\nr("./t.js");\n`,
      `${R}r("module").wrap = (s) => ${JSON.stringify(`${W};(function (exports, require, module, __filename, __dirname) { `)} + s + "\\n});";\nr("./t.js");\n`,
      `${R}new (r("worker_threads").Worker)(__dirname + "/w.js", { execArgv: [] });\n`,
      `${R}new (r("worker_threads").Worker)(__dirname + "/w.js", { env: { NODE_OPTIONS: "" } });\n`,
      `${R}new (r("worker_threads").Worker)(new URL("data:text/javascript," + encodeURIComponent(${JSON.stringify(W)})));\n`,
      `arguments[2]._compile(${JSON.stringify(W)}, "[eval]-wrapper");\n`,
      `arguments[2]._compile(${JSON.stringify(W)}, "/usr/lib/os-release");\n`,
      `RegExp.prototype.exec = () => ["x"];\narguments[2]._compile(${JSON.stringify(W)}, "[eval]");\n`,
    ]) {
      const r = await runPinned(
        {
          "e.js": js,
          "t.js": "module.exports = 1;\n",
          // A worker that would run vm without the guard.
          "w.js": `arguments[1]("vm").runInThisContext(${JSON.stringify(W)});\n`,
        },
        "node e.js; sleep 1",
        ["e.js", "t.js", "w.js"],
      );
      expect([js, r.ran]).toEqual([js, false]);
    }
  });

  it("the node guard alone: checks that run after the run's code take nothing it can replace", async () => {
    const GEN = `fs.writeFileSync("gen.mjs", ${JSON.stringify("import fs from 'node:fs'; fs.writeFileSync('pwned', 'uid=proto');\n")});\nawait import("./gen.mjs");\n`;
    for (const patch of [
      'const o = "".startsWith;\nObject.getPrototypeOf("").startsWith = function (s, ...a) { return s === "file:" || s === "data:" ? false : o.call(this, s, ...a); };\n',
      "Object.getPrototypeOf([]).some = () => true;\nObject.getPrototypeOf([]).includes = () => true;\n",
      'const h = crypto.createHash("sha256").update(fs.readFileSync("gen.mjs")).digest("hex");\nObject.getPrototypeOf(new Map()).get = () => h;\nObject.getPrototypeOf(crypto.createHash("sha256")).digest = () => h;\n',
      'const d = Object.getOwnPropertyDescriptor(URL.prototype, "pathname");\nObject.defineProperty(URL.prototype, "pathname", { get() { const v = d.get.call(this); return v.endsWith("gen.mjs") ? "/usr/lib/os-release" : v; } });\n',
      'const o = fs.realpathSync;\nfs.realpathSync = (p, ...a) => (String(p).endsWith("gen.mjs") ? "/usr/lib/os-release" : o(p, ...a));\n',
    ]) {
      const js = `import fs from "node:fs";\nimport crypto from "node:crypto";\n${patch}${GEN}`;
      const r = await runPinned({ "e.mjs": js, "gen.mjs": "export default 1;\n" }, "node e.mjs", [
        "e.mjs",
        "gen.mjs",
      ]);
      expect([patch, r.ran]).toEqual([patch, false]);
    }
  });

  // Review round 3: a tracer made the guard's own frame (or the toolchain's) continue
  // at another line: the guard re-read its arguments and ran code nobody read; a
  // tarfile filter skipped its refusal.
  const JUMP = (
    payload: string,
    line = "args = tuple(sys.argv[1:])",
  ) => `import sys, threading, traceback
G = chr(47) + ".encl" + "awed" + chr(47) + "code" + chr(47) + "py-guard.py"
src = open(G).read().split(chr(10))
ARGS = [i + 1 for i, l in enumerate(src) if l.strip() == ${JSON.stringify(line)}][0]
sys.argv[:] = ["x", "-c", ${JSON.stringify(payload)}]
main = None
for f, n in traceback.walk_stack(None):
    s = traceback.StackSummary.extract([(f, n)], lookup_lines=False)[0]
    if s.name == "_enclawed_main":
        main = f
done = [False]
def tr(frame, ev, arg):
    if frame is main and ev == "line" and not done[0]:
        done[0] = True
        frame.f_lineno = ARGS
    return tr
main.f_trace = tr
threading.settrace_all_threads(tr)
`;
  const UNREAD = "open('pwned', 'w').write('uid=unread ran')";
  const TAR = (target: string) => `import threading, traceback, tarfile, io, os
S = chr(47)
TF = tarfile.__file__
src = open(TF).read().split(chr(10))
RAISE = [i + 1 for i, l in enumerate(src) if l.strip() == "raise AbsoluteLinkError(member)"][0]
RET = [i + 1 for i, l in enumerate(src) if l.strip() == "return new_attrs" and i + 1 > RAISE][0]
def tr(frame, ev, arg):
    if ev == "line" and frame.f_lineno == RAISE:
        if traceback.StackSummary.extract([(frame, frame.f_lineno)], lookup_lines=False)[0].name == "_get_filtered_attrs":
            frame.f_lineno = RET
    return tr
threading.settrace_all_threads(tr)
b = io.BytesIO()
with tarfile.open(fileobj=b, mode="w") as t:
    i = tarfile.TarInfo("lnk")
    i.type = tarfile.SYMTYPE
    i.linkname = ${JSON.stringify(target)}
    t.addfile(i)
b.seek(0)
with tarfile.open(fileobj=b) as t:
    t.extractall(".")
open("pwned", "w").write("uid=" + os.readlink("lnk"))
`;

  it.each([
    ["py-guard-jump-unread", H(JUMP(UNREAD)), {}],
    [
      "py-guard-jump-ctypes",
      H(JUMP(`${UNREAD}; import ctypes; ctypes.CDLL(None).system(b'id > pwned')`)),
      {},
    ],
    ["py-guard-jump-script", "python3 s.py", { "s.py": JUMP(UNREAD) }],
    ["tar-jump-abs-link", H(TAR("/etc")), {}],
    ["tar-jump-mem", H(TAR("/proc/self/mem")), {}],
  ] as const)("end to end: %s is not run contained", async (_name, line, files) => {
    const r = await attempt(line, files as Record<string, string>);
    expect(r).toEqual({ contained: false, ran: false });
  });

  it("the python guard alone: no tracer, profiler or monitor; the guard's frame jumped to its argument parsing runs nothing", async () => {
    for (const [name, text] of [
      ["jump.py", JUMP(UNREAD)],
      ["tar.py", TAR("/etc")],
      [
        "prof.py",
        "import sys\nsys.setprofile(lambda *a: None)\nopen('pwned', 'w').write('uid=profiled')\n",
      ],
      [
        "mon.py",
        "import sys\nm = sys.monitoring\nm.use_tool_id(3, 'x')\nm.register_callback(3, m.events.LINE, print)\nopen('pwned', 'w').write('uid=monitored')\n",
      ],
      [
        "thr.py",
        "import threading\nthreading.settrace(print)\nt = threading.Thread(target=lambda: open('pwned', 'w').write('uid=traced'))\nt.start()\nt.join()\n",
      ],
    ] as const) {
      const r = await runPinned({ [name]: text }, `python3 ${name}`, [name]);
      expect([name, r.ran]).toEqual([name, false]);
      expect(r.out).toContain("traces no code");
    }
  });

  it("the python guard alone: the guard's own code, called again by the run, compiles nothing", async () => {
    // No tracer: the guard's _enclawed_main through its frame's globals, with
    // arguments the run chose (-c code nobody read).
    const again = `import sys, traceback
main = [f for f, n in traceback.walk_stack(None) if f.f_code.co_name == "_enclawed_main"][0]
sys.argv[:] = ["x", "-c", ${JSON.stringify(UNREAD)}]
main.f_globals["_enclawed_main"]()
`;
    const r = await runPinned({ "a.py": again }, "python3 a.py", ["a.py"]);
    expect(r.ran).toBe(false);
    expect(r.out).toContain("code built at run time is not run");
    // A pinned script that only computes still runs, and the run's exit status is its own.
    const ok = await runPinned(
      {
        "b.py":
          "import atexit\natexit.register(lambda: open('done', 'w').write('x'))\nprint('fine')\n",
      },
      "python3 b.py && cat done",
      ["b.py"],
    );
    expect(ok.out).toContain("fine");
    expect(ok.out).toMatch(/fine\nx/);
    const st = await runPinned(
      { "c.py": "import sys\nsys.exit(3)\n" },
      "python3 c.py; echo status=$?",
      ["c.py"],
    );
    expect(st.out).toContain("status=3");
  });

  it("the python guard alone: ctypes (CDLL(None) included), C-API test modules and the collector's object lists are refused", async () => {
    for (const [name, text, why] of [
      ["cd.py", "import ctypes\nctypes.CDLL(None).system(b'id > pwned')\n", "reaches memory"],
      ["cc.py", "import _ctypes\n", "reaches memory"],
      ["tc.py", "import _testcapi\n", "reaches memory"],
      [
        "gc.py",
        "import gc\nfor o in gc.get_objects():\n    pass\nopen('pwned', 'w').write('uid=walked')\n",
        "interpreter's objects",
      ],
    ] as const) {
      const r = await runPinned({ [name]: text }, `python3 ${name}`, [name]);
      expect([name, r.ran]).toEqual([name, false]);
      expect([name, r.out.includes(why) ? why : r.out]).toEqual([name, why]);
    }
  });

  // Review round 4: toolchain code the guard admits was recognized by its file and
  // function name (a builder run through a trampoline, ast.parse's code with other
  // globals, a frozen name the run chose); and the hook's own state was reachable.
  it.each([
    [
      "dataclasses' builder run through threading.Thread.run",
      "import dataclasses, threading\nclass C:\n    pass\nC.__dataclass_fields__ = {}\nb = dataclasses._FuncBuilder({})\nb.src = [\" open('pwned', 'w').write('uid=dc')\"]\nthreading.Thread(target=b.add_fns_to_class, args=(C,)).run()\n",
    ],
    [
      "dataclasses' builder run through functools.partial, with fields named as the calls",
      "import dataclasses, functools\nclass C:\n    pass\nC.__dataclass_fields__ = {\"open\": None, \"write\": None}\nb = dataclasses._FuncBuilder({})\nb.src = [\" open('pwned', 'w').write('x')\"]\nfunctools.partial(b.add_fns_to_class, C)()\n",
    ],
    [
      "dataclasses' own processing with text added to a method (add_fn replaced)",
      "import dataclasses\norig = dataclasses._FuncBuilder.add_fn\ndef add_fn(self, name, args, body, **kw):\n    if name == \"__init__\":\n        body = list(body) + [\"  open('pwned', 'w').write('uid=injected')\"]\n    return orig(self, name, args, body, **kw)\ndataclasses._FuncBuilder.add_fn = add_fn\n@dataclasses.dataclass\nclass E:\n    open: int = 0\n    write: int = 1\nE()\n",
    ],
    [
      "dataclasses' own processing with a call through a field added",
      "import dataclasses\norig = dataclasses._FuncBuilder.add_fn\ndef add_fn(self, name, args, body, **kw):\n    if name == \"__init__\":\n        body = list(body) + [\"  self.open('pwned', 'w')\"]\n    return orig(self, name, args, body, **kw)\ndataclasses._FuncBuilder.add_fn = add_fn\n@dataclasses.dataclass\nclass E:\n    open: int = 0\nE()\n",
    ],
    [
      "ast.parse's code with other globals (types.FunctionType)",
      "import ast, types\ng = dict(ast.__dict__); g[\"PyCF_ONLY_AST\"] = 0\nparse2 = types.FunctionType(ast.parse.__code__, g, None, ast.parse.__defaults__)\nparse2.__kwdefaults__ = ast.parse.__kwdefaults__\nco = parse2(\"open('pwned', 'w').write('uid=unread')\", \"<frozen evil>\")\nexec(co, {})\n",
    ],
    [
      "ast.parse with its module's PyCF_ONLY_AST changed",
      "import ast\nast.PyCF_ONLY_AST = 0\nco = ast.parse(\"open('pwned', 'w').write('uid=unread')\", \"<frozen evil>\")\nexec(co, {})\n",
    ],
    [
      "a code object changed by the run (CodeType.replace)",
      'import ast\nco = ast.parse.__code__.replace(co_name="parse2")\n',
    ],
    [
      "ast.parse's code with a dict subclass as globals",
      "import ast, types\nclass G(dict): pass\ng = G(ast.__dict__); g[\"PyCF_ONLY_AST\"] = 0\np = types.FunctionType(ast.parse.__code__, g, None, ast.parse.__defaults__, None)\np.__kwdefaults__ = ast.parse.__kwdefaults__\nexec(p(\"open('pwned', 'w').write('uid=unread')\"), {})\n",
    ],
    [
      "namedtuple's code made into a function by the run",
      "import collections, types\nf = types.FunctionType(collections.namedtuple.__code__, dict(collections.__dict__), None, None, None)\n",
    ],
    [
      "bytecode through importlib's own _compile_bytecode after a toolchain .pyc was opened",
      'import _frozen_importlib_external as fe, marshal, glob\np = glob.glob("/usr/lib/python3.14/__pycache__/*.pyc")[0]\nopen(p, "rb").close()\ndata = marshal.dumps(compile("x=1", "<s>", "exec")) if False else b"\\xe3" + b"\\0" * 20\nfe._compile_bytecode(data, "x", p)\n',
    ],
    [
      "the archive hook's closure changed, then a module the run wrote",
      'import sys\ncells = sys.path_hooks\nfor h in sys.path_hooks:\n    for c in (getattr(h, "__closure__", None) or ()):\n        try:\n            v = c.cell_contents\n        except ValueError:\n            continue\n        if callable(v) and getattr(v, "__name__", "") == "trusted":\n            c.cell_contents = lambda p: True\nopen("evil_mod.py", "w").write("open(\'pwned\', \'w\').write(\'uid=unread module\')\\n")\nsys.path.insert(0, ".")\nimport evil_mod\n',
    ],
    [
      "the guard's frames from a refusal's traceback",
      'import sys\ntry:\n    open("/proc/self/mem", "rb")\nexcept PermissionError as e:\n    tb = e.__traceback__\n    while tb is not None:\n        fr = tb.tb_frame\n        if "PINS" in fr.f_locals or "TOOLCHAIN" in fr.f_locals:\n            print("reached", fr.f_code.co_name)\n        tb = tb.tb_next\nopen("evil_mod.py", "w").write("open(\'pwned\', \'w\').write(\'uid=unread module\')\\n")\n',
    ],
    [
      "os.path.realpath and abspath replaced, then a module the run wrote",
      'import os, posixpath\nposixpath.realpath = lambda p, strict=False: "/usr/lib/python3.14/os.py"\nos.path.abspath = lambda p: "/usr/lib/python3.14/os.py"\nopen("evil_mod2.py", "w").write("open(\'pwned\', \'w\').write(\'uid=unread module\')\\n")\nimport sys; sys.path.insert(0, ".")\nimport evil_mod2\n',
    ],
    [
      "a signal handler (it would run inside the hook)",
      "import signal\nsignal.signal(signal.SIGALRM, lambda s, f: None)\nopen('pwned', 'w').write('uid=handler')\n",
    ],
  ] as const)("the python guard alone: %s runs nothing it did not read", async (_name, text) => {
    const r = await runPinned({ "s.py": text }, "python3 s.py", ["s.py"]);
    expect(r.ran).toBe(false);
  });

  it("the python guard alone: the dataclasses of the toolchain and of a file Enclawed read still work, in every form", async () => {
    const r = await runPinned(
      {
        "d.py":
          'import dataclasses, itertools\nfrom dataclasses import dataclass, field, InitVar, KW_ONLY\nfrom typing import ClassVar\nn = 0\nfor eq, order, frozen, kw_only, unsafe_hash, repr_, slots, match_args in itertools.product([False, True], repeat=8):\n    if order and not eq:\n        continue\n    @dataclass(eq=eq, order=order, frozen=frozen, kw_only=kw_only, unsafe_hash=unsafe_hash, repr=repr_, slots=slots, match_args=match_args)\n    class A:\n        x: int\n        y: str = "a"\n        z: list = field(default_factory=list)\n        h: int = field(default=3, hash=True, compare=False, repr=False)\n        ni: int = field(default=0, init=False)\n        c: ClassVar[int] = 3\n        iv: InitVar[int] = 0\n        def __post_init__(self, iv):\n            pass\n    @dataclass(eq=eq, order=order, frozen=frozen, unsafe_hash=unsafe_hash, slots=slots)\n    class B(A):\n        w: float = 1.0\n        self: int = 2\n        other: int = 3\n        name: int = 4\n        value: int = 5\n        cls: int = 6\n        type: int = 7\n        object: int = 8\n        _: KW_ONLY\n        k: int = 5\n    b = B(x=1)\n    repr(b); b == b\n    n += 1\n@dataclass(weakref_slot=True, slots=True)\nclass W:\n    a: int = 1\n@dataclass\nclass E:\n    pass\nM = dataclasses.make_dataclass("M", [("a", int), ("b", str, field(default="x"))], frozen=True, namespace={"f": lambda self: 1})\nprint(M(1), E(), W(), dataclasses.asdict(B(x=1)), dataclasses.replace(B(x=1), x=2).x)\nimport argparse, traceback, pprint, pathlib, tomllib, json, email.message, logging, unittest, decimal, fractions, statistics, zoneinfo, enum, typing\np = argparse.ArgumentParser(prog="x"); p.add_argument("--a"); p.format_help()\nprint("DCFP", n)\n',
      },
      "python3 d.py",
      ["d.py"],
    );
    expect(r.out).toContain("DCFP 192");
  });

  // Review on a0cee25be: WebAssembly compiled bytes held in memory (code
  // generation from strings does not cover it).
  const WASM = "const b = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);\n";
  const DONE = "require('fs').writeFileSync('pwned', 'uid=wasm');\n";
  it("the reader refuses WebAssembly", async () => {
    const r = await attempt("node a.js", {
      "a.js": `${WASM}new WebAssembly.Instance(new WebAssembly.Module(b));\n${DONE}`,
    });
    expect(r.contained).toBe(false);
  });

  it("the node guard alone: WebAssembly compiles nothing, by any name", async () => {
    const W = 'const WA = globalThis["Web" + "Assembly"];\n';
    for (const js of [
      `${WASM}${W}new WA.Instance(new WA.Module(b));\n${DONE}`,
      `${WASM}${W}WA.compile(b).then(() => { ${DONE} });\n`,
      `${WASM}${W}WA.instantiate(b).then(() => { ${DONE} });\n`,
      `${WASM}${W}WA.compileStreaming(Promise.resolve(new Response(b, { headers: { "content-type": "application/wasm" } }))).then(() => { ${DONE} });\n`,
      `${WASM}${W}Object.defineProperty(WA, "Module", { value: function () {} });\n${DONE}`,
    ]) {
      const r = await runPinned({ "a.js": js }, "node a.js; sleep 1", ["a.js"]);
      expect([js, r.ran]).toEqual([js, false]);
    }
  });

  // Review round 5: a finalizer of the run's objects would run inside the hook's
  // frames (the collector runs where it interrupts), and a module the run forged
  // with a toolchain file's name passed for the toolchain.
  it("the python guard alone: the run cannot turn the collector back on, and its finalizers never run in the guard's frames", async () => {
    const r = await runPinned(
      {
        "fin.py":
          'import gc, sys, _imp, time\nimport importlib.machinery as M\ngc.enable()\nprint("enabled", gc.isenabled())\ntry:\n    _imp.create_builtin(M.ModuleSpec("gc", None, origin="built-in"))\n    print("new gc made")\nexcept ImportError:\n    print("no new gc")\nseen = []\nran = []\nclass F:\n    def __del__(self):\n        ran.append(1)\n        try:\n            f = sys._getframe(0)\n            while f is not None:\n                loc = f.f_locals\n                if "PINS" in loc or "TOOLCHAIN" in loc or "event" in loc or "check" in loc:\n                    seen.append(f.f_code.co_name)\n                f = f.f_back\n        except Exception:\n            seen.append("refused")\nfor i in range(3000):\n    a = F(); b = F(); a.o = b; b.o = a\n    del a, b\n    open("fin.py").close()\ntime.sleep(3)\nprint("collections", [g["collections"] for g in gc.get_stats()])\nprint("guard frames seen by finalizers:", sorted(set(s for s in seen if s != "refused")), "finalizers ran:", len(ran) > 0)\nopen("pwned", "w").write("uid=" + str(seen)) if [s for s in seen if s != "refused"] else None\n',
      },
      "python3 fin.py",
      ["fin.py"],
    );
    expect(r.out).toContain("enabled False");
    expect(r.out).toContain("no new gc");
    expect(r.out).toContain("guard frames seen by finalizers: [] finalizers ran: True");
    expect(r.ran).toBe(false);
  });

  it("the python guard alone: a module forged under a toolchain file's name is not the toolchain", async () => {
    const r = await runPinned(
      {
        "forge.py":
          'import sys, types, annotationlib\nm = types.ModuleType("forged")\nm.__file__ = annotationlib.__file__\nsys.modules["forged"] = m\nsrc = open(annotationlib.__file__, "rb").read()\nexec(compile(src, annotationlib.__file__, "exec"), m.__dict__)\nclass C:\n    x: undefined_name\nann = C.__annotate__\ntry:\n    m.call_annotate_function(ann, annotationlib.Format.FORWARDREF)\n    print("made")\nexcept PermissionError as e:\n    print("refused", e)\n',
      },
      "python3 forge.py",
      ["forge.py"],
    );
    expect(r.out).toContain("refused Enclawed: a function made from a code object was not loaded");
  });

  // Release review: pytest's default assertion rewriting compiles syntax trees;
  // string annotations (from __future__ import annotations, TypedDict) are
  // compiled by annotationlib; doctest and pdb reset tracing with settrace(None).
  it("the python guard alone: string annotations evaluate; one that calls, binds or loops is refused; settrace(None) is a no-op", async () => {
    const r = await runPinned(
      {
        "fr.py":
          'from __future__ import annotations\nimport typing, annotationlib\nfrom typing import TypedDict, NamedTuple\nclass D(TypedDict):\n    a: int\n    b: list[str] | None\n    c: typing.Literal["x", -1]\nclass N(NamedTuple):\n    a: int\nprint("hints", typing.get_type_hints(D), typing.get_type_hints(N))\nclass E:\n    x: "dict[str, typing.Any]"\nprint("ann", annotationlib.get_annotations(E, eval_str=True))\nfor bad in ["__import__(\'os\').system(\'id > pwned\')", "(lambda: 1)()", "[x for x in ()]", "a if b else c"]:\n    try:\n        typing.ForwardRef(bad).evaluate(globals={}, locals={})\n        print("evaluated", bad)\n    except PermissionError:\n        print("refused", bad)\n    except Exception as e:\n        print("other", type(e).__name__, bad)\nclass F:\n    y: "__import__(\'os\').system(\'id > pwned\')"\ntry:\n    annotationlib.get_annotations(F, eval_str=True)\n    print("evaluated F")\nexcept PermissionError:\n    print("refused F")\nimport sys\nsys.settrace(None); sys.setprofile(None)\ntry:\n    sys.settrace(print); print("traced")\nexcept PermissionError:\n    print("refused tracer")\n',
      },
      "python3 fr.py",
      ["fr.py"],
    );
    expect(r.out).toContain(
      "hints {'a': <class 'int'>, 'b': list[str] | None, 'c': typing.Literal['x', -1]}",
    );
    for (const bad of [
      "__import__('os').system('id > pwned')",
      "(lambda: 1)()",
      "[x for x in ()]",
      "a if b else c",
    ]) {
      expect(r.out).toContain(`refused ${bad}`);
    }
    expect(r.out).toContain("refused tracer");
    expect(r.ran).toBe(false);
  });

  it("the python guard alone: pytest runs with plain assertions and no cache plugin, whatever the line says", async () => {
    const r = await runPinned(
      { "pytest.py": 'import sys\nprint("ARGV", sys.argv[1:])\n' },
      "python3 -m pytest -q --assert=rewrite",
      ["pytest.py"],
    );
    expect(r.out).toContain(
      "ARGV ['-q', '--assert=rewrite', '-p', 'no:cacheprovider', '--assert=plain']",
    );
    const dashes = await runPinned(
      { "pytest.py": 'import sys\nprint("ARGV", sys.argv[1:])\n' },
      "python3 -m pytest -q -- x",
      ["pytest.py"],
    );
    expect(dashes.out).toContain("pytest with -- is not a form this contained run takes");
  });

  const hostPytest =
    live && spawnSync("python3", ["-I", "-c", "import pytest"], { encoding: "utf8" }).status === 0;
  it.skipIf(!hostPytest)(
    "end to end: a real pytest run with fixtures, a failing assertion and pytest.raises",
    async () => {
      const files = {
        "tests/test_a.py":
          'import json\n\ndef test_ok():\n    assert json.loads("[1]") == [1]\n\ndef test_fail():\n    x = {"a": 1}\n    assert x["a"] == 2\n\ndef test_raises():\n    import pytest\n    with pytest.raises(KeyError):\n        {}["k"]\n',
        "tests/test_b.py": "def test_fixture(one):\n    assert one == 1\n",
        "tests/conftest.py": "import pytest\n\n@pytest.fixture\ndef one():\n    return 1\n",
      };
      const r = await runPinned(files, "python3 -m pytest -q", Object.keys(files));
      expect(r.out).toContain("1 failed, 3 passed");
      expect(r.out).not.toContain("CodeNotRead");
    },
  );

  // node:sqlite loads native extensions: the guard refuses it before the
  // library is opened (not only the noexec mount when it is mapped).
  it("the node guard alone: node:sqlite loads no extension, by any way to a database", async () => {
    const S =
      "const S = __dirname + '/ext.so';\nconst sq = process.getBuiltinModule('node:sqlite');\n";
    const W = "require('fs').writeFileSync('pwned', 'uid=sqlite');\n";
    for (const [js, why] of [
      [
        `${S}new sq.DatabaseSync(':memory:', { allowExtension: true }).loadExtension(S);\n${W}`,
        "loads no native extension",
      ],
      [
        `${S}new sq.DatabaseSync(':memory:').loadExtension(S);\n${W}`,
        "loadExtension was not loaded",
      ],
      [
        `${S}new sq.DatabaseSync(':memory:').enableLoadExtension(true);\n${W}`,
        "enableLoadExtension was not loaded",
      ],
      [
        `${S}const D = new sq.DatabaseSync(':memory:').constructor;\nnew D(':memory:', { allowExtension: true });\n${W}`,
        "loads no native extension",
      ],
      [
        `${S}class X extends sq.DatabaseSync {}\nnew X(':memory:', { allowExtension: true });\n${W}`,
        "loads no native extension",
      ],
      [
        `${S}import('node:sqlite').then((ns) => { process.getBuiltinModule('module').syncBuiltinESMExports(); new ns.DatabaseSync(':memory:', { allowExtension: true }); ${W} });\n`,
        "loads no native extension",
      ],
      [`${S}process.dlopen({ exports: {} }, S);\n${W}`, "not one of the files Enclawed read"],
    ] as const) {
      const r = await runPinned({ "a.js": js, "ext.so": "not a library\n" }, "node a.js", ["a.js"]);
      expect([js, r.ran, r.out]).toEqual([js, false, expect.stringContaining(why)]);
    }
    const ok = await runPinned(
      {
        "a.js":
          "const sq = process.getBuiltinModule('node:sqlite');\nconsole.log('rows', JSON.stringify(new sq.DatabaseSync(':memory:').prepare('select 1 as x').all()));\n",
      },
      "node a.js",
      ["a.js"],
    );
    expect(ok.out).toContain('rows [{"x":1}]');
  });

  // Release review: native code loaded by sqlite or as an extension module was
  // stopped only by the noexec mounts (an exec-pinned file the run rewrote is
  // executable); the guard refuses it itself.
  const cc = spawnSync("cc", ["--version"], { encoding: "utf8" }).status === 0;
  it.skipIf(!cc)(
    "the python guard alone: no native code from sqlite's load_extension or an extension module outside the toolchain",
    async () => {
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-so-")));
      roots.push(dir);
      fs.writeFileSync(
        path.join(dir, "ext.c"),
        '#include <stdio.h>\n__attribute__((constructor)) static void ran(void) { FILE *f = fopen("pwned", "w"); if (f) { fputs("uid=native", f); fclose(f); } }\nint sqlite3_extension_init(void *a, void *b, void *c) { return 0; }\n',
      );
      expect(
        spawnSync("cc", [
          "-shared",
          "-fPIC",
          "-o",
          path.join(dir, "ext.so"),
          path.join(dir, "ext.c"),
        ]).status,
      ).toBe(0);
      const so = fs.readFileSync(path.join(dir, "ext.so"));
      for (const [name, text, extra] of [
        [
          "sq.py",
          "import sqlite3\nc = sqlite3.connect(':memory:')\ntry:\n    c.enable_load_extension(True)\n    c.load_extension('./ext.so')\n    print('LOADED')\nexcept Exception as e:\n    print('ERR', e)\ntry:\n    c.execute(\"select load_extension('./ext.so')\")\n    print('SQL-LOADED')\nexcept Exception as e:\n    print('ERR2', e)\n",
          "ext.so",
        ],
        [
          "imp.py",
          "import sys\nsys.path.insert(0, '.')\nimport ext\n",
          "ext.cpython-314-x86_64-linux-gnu.so",
        ],
        [
          "ldr.py",
          "import importlib.machinery, importlib.util\nl = importlib.machinery.ExtensionFileLoader('ext', './ext.so')\nimportlib.util.module_from_spec(importlib.util.spec_from_loader('ext', l))\n",
          "ext.so",
        ],
      ] as const) {
        const r = await runPinned({ [name]: text, [extra]: so }, `python3 ${name}`, [name]);
        expect([name, r.ran]).toEqual([name, false]);
        expect([
          name,
          /native code (?:into sqlite|from a file other than the toolchain)/.test(r.out),
        ]).toEqual([name, true]);
      }
    },
  );
});
