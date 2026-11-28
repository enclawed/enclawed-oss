// The Python reader (./python-reader.ts) through the contained-execution
// reader (./contained-exec.ts): which Python programs may run contained with
// no person, and which escapes are refused. Every refusal row has a twin that
// differs only in the refused construct and is allowed (the mutation check:
// the row fails if the rule that refuses it is removed).

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROGRAM_DIRS } from "../containment/plan.js";
import { containedExecution } from "./contained-exec.js";
import { nodeFsProbe } from "./fs-probe.js";
import {
  containedPythonStatus,
  PYTHON_PROGRAM_DIRS,
  pythonFacts,
  readPython,
  setPythonVersionProbeForTests,
} from "./python-reader.js";
import { isExecConfigPath } from "./rule-kit.js";
import { parseCompound } from "./shell-compound.js";

let root: string;
let proj: string;

const put = (rel: string, s: string) => {
  fs.mkdirSync(path.dirname(path.join(proj, rel)), { recursive: true });
  fs.writeFileSync(path.join(proj, rel), s);
};

function verdict(line: string) {
  const p = parseCompound(line, { cwd: proj, home: null }, { fileRedirects: true });
  if (!p.ok) {
    throw new Error(`unparsed: ${line} (${p.code})`);
  }
  return containedExecution(
    {
      projectDir: proj,
      home: null,
      fs: nodeFsProbe(),
      repositoryEnv: [],
      equalsCommitted: () => true,
    },
    p.commands,
  );
}

/** python3 - <<'EOF' with this code. */
const heredoc = (code: string) => `python3 - <<'EOF'\n${code}\nEOF`;
const inline = (code: string) => `python3 -c '${code.replace(/'/g, "'\\''")}'`;

function ok(code: string): void {
  for (const line of [heredoc(code), inline(code)]) {
    const v = verdict(line);
    expect([code, v.ok ? "ok" : v.why]).toEqual([code, "ok"]);
  }
}
function refused(code: string, why: RegExp = /./): void {
  for (const line of [heredoc(code), inline(code)]) {
    const v = verdict(line);
    expect([code, v.ok ? "ok" : "refused"]).toEqual([code, "refused"]);
    if (!v.ok) {
      expect(v.why).toMatch(why);
    }
  }
}

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-pyread-")));
  proj = path.join(root, "proj");
  fs.mkdirSync(proj);
  put(
    "util.py",
    "import json\n\ndef load(p):\n    with open(p) as f:\n        return json.load(f)\n",
  );
  put("osholder.py", "import os\n\ndef cwd():\n    return os.getcwd()\n");
  put("aliased.py", "import os as helper\nVALUE = 1\n");
  put("pkg/__init__.py", "from .inner import VALUE\n");
  put("pkg/inner.py", "VALUE = 2\n");
  put("pkg/holds.py", "import shutil\n");
  put("bad.py", "import subprocess\nsubprocess.run(['id'])\n");
  put("nsdir/mod.py", "X = 1\n");
  put("data.json", "{}\n");
  put("lib/README", "a directory on sys.path\n");
  put("scripts/report.py", "import sys\nfrom util import load\nprint(load(sys.argv[1]))\n");
  put("scripts/util.py", "import json\n\ndef load(p):\n    return json.load(open(p))\n");
  put("scripts/evil.py", "import util\nimport socket\n");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("python reader: programs that only read, write files and compute run contained", () => {
  it.each([
    "import json, sys\nprint(json.dumps({'a': 1}))",
    "import re, collections\nc = collections.Counter(re.findall(r'\\w+', open('data.json').read()))\nprint(c.most_common(3))",
    "import os\nfor root, dirs, files in os.walk('.'):\n    print(root, len(files))",
    "import os\nos.makedirs('out', exist_ok=True)\nopen(os.path.join('out', 'r.txt'), 'w').write('x')",
    "import os\nprint(os.environ.get('HOME'), os.getcwd(), os.path.exists('data.json'))",
    "import pathlib\nfor p in sorted(pathlib.Path('.').rglob('*.py')):\n    print(p, p.stat().st_size)",
    "from pathlib import Path\nPath('out2').mkdir(exist_ok=True)\nPath('out2/a.txt').write_text('a')",
    "import csv, io\nr = csv.reader(io.StringIO('a,b'))\nprint(list(r))",
    "import hashlib\nprint(hashlib.sha256(open('data.json','rb').read()).hexdigest())",
    "import shutil\nshutil.copy('data.json', 'copy.json')",
    "from collections import namedtuple\nP = namedtuple('P', 'a b')\nprint(P(1, 2))",
    "import typing\nT = typing.TypeVar('T')\ndef f(x: 'int') -> 'list[int]':\n    return [x]\nprint(f(1))",
    "import sys\nif len(sys.argv) > 5:\n    sys.exit(1)\nprint(sys.version_info[:2])",
    "x = 'a-b'.replace('-', '_')\nprint(x, getattr(x, 'upper')())",
    "import xml.etree.ElementTree as ET\nprint(ET.fromstring('<a/>').tag)",
    "import urllib.parse\nprint(urllib.parse.quote('a b'))",
    "class C:\n    def __init__(self):\n        self._x = 1\n    def __repr__(self):\n        return 'C'\nprint(C(), super)",
    "import util\nprint(util.load('data.json'))",
    "from util import load\nprint(load('data.json'))",
    "import pkg\nprint(pkg.VALUE)",
    "from pkg import inner\nprint(inner.VALUE)",
    "import osholder\nprint(osholder.cwd())",
    "import sys\nsys.path.insert(0, 'scripts')\nimport report",
    "import no_such_module_anywhere_zz",
    "import json\nprint(json.decoder.JSONDecodeError)",
    "import os.path\nprint(os.path.join('a', 'b'))",
    "if __name__ == '__main__':\n    print(__file__ if '__file__' in dir() else '-')",
  ])("%s", (code) => ok(code));

  it("a script file and the project modules it imports", () => {
    const v = verdict("python3 scripts/report.py data.json");
    expect(v.ok ? [...v.files].map((f) => path.relative(proj, f)) : v.why).toEqual([
      "scripts/report.py",
      "scripts/util.py",
    ]);
  });

  it("standard-input code is pinned by its digest; -c code needs no pin", () => {
    const v = verdict(heredoc("print(1)"));
    expect(v.ok && v.stdin).toEqual([
      createHash("sha256").update("print(1)\n", "utf8").digest("hex"),
    ]);
    const c = verdict(inline("print(1)"));
    expect(c.ok && c.stdin).toEqual([]);
  });
});

describe("python reader: what escapes the containment's meaning is refused", () => {
  // [refused code, its allowed twin]
  const pairs: readonly (readonly [string, string, RegExp?])[] = [
    [
      "import subprocess\nsubprocess.run(['id'])",
      "import string\nstring.capwords('id')",
      /subprocess/,
    ],
    ["import os\nos.system('id')", "import os\nos.getcwd()", /os\.system/],
    ["import os\nos.popen('id')", "import os\nos.listdir('.')"],
    ["import os\nos.execv('/bin/sh', ['sh'])", "import os\nos.stat('.')"],
    ["import os\nos.remove('data.json')", "import os\nos.path.exists('data.json')"],
    ["import os\nos.rename('a', 'b')", "import os\nos.path.basename('a')"],
    ["import shutil\nshutil.rmtree('out')", "import shutil\nshutil.copytree('a', 'b')"],
    ["import shutil\nshutil.move('a', 'b')", "import shutil\nshutil.copy2('a', 'b')"],
    [
      "from pathlib import Path\nPath('a').unlink()",
      "from pathlib import Path\nPath('a').exists()",
    ],
    ["from pathlib import Path\nPath('a').replace('b')", "s = 'a'\ns.replace('a', 'b')"],
    [
      "from pathlib import Path\nPath('a').symlink_to('/etc')",
      "from pathlib import Path\nPath('a').touch()",
    ],
    ["import socket\nsocket.socket()", "import struct\nstruct.pack('i', 1)", /socket/],
    [
      "import urllib.request\nurllib.request.urlopen('x')",
      "import urllib.parse\nurllib.parse.urlparse('x')",
    ],
    ["import http.client", "import html.parser"],
    ["import ctypes\nctypes.CDLL(None)", "import array\narray.array('i')"],
    ["import importlib\nimportlib.import_module('o' + 's')", "import itertools\nitertools.count()"],
    ["__import__('os').system('id')", "print('os')"],
    ["eval('1+1')", "print(1+1)"],
    ["exec('print(1)')", "print(1)"],
    ["compile('1', 'x', 'eval')", "print('compile')"],
    ["import pickle\npickle.loads(b'')", "import json\njson.loads('1')"],
    ["import marshal", "import math"],
    ["getattr(__builtins__, 'ev' + 'al')('1')", "getattr('x', 'upper')()"],
    ["f = getattr\nf(1, 'x')", "f = len\nf('x')"],
    ["n = 'upper'\ngetattr('x', n)()", "getattr('x', 'upper')()"],
    ["getattr('x', '__class__')", "getattr('x', 'lower')"],
    ["import os\nos.__dict__['system']('id')", "import os\nos.environ['X']"],
    ["x = ().__class__.__bases__[0].__subclasses__()", "x = ().count(1)"],
    ["def f(): pass\nf.__globals__['os']", "def f(): pass\nf.__name__"],
    ["import glob\nglob.os.system('id')", "import glob\nglob.glob('*')"],
    ["import tempfile\ntempfile._os.system('id')", "import tempfile\ntempfile.mkdtemp()"],
    ["import codecs\ncodecs.builtins.eval('1')", "import codecs\ncodecs.decode(b'a', 'ascii')"],
    ["import os\nf = os\nf.system('id')", "import os\nf = os.path.join\nf('a', 'b')"],
    ["import sys\nsys.modules['os'].system('id')", "import sys\nsys.argv[0]"],
    ["import sys\nsys._getframe().f_globals", "import sys\nsys.version"],
    ["def g():\n    yield 1\ng().gi_frame.f_globals", "def g():\n    yield 1\nnext(g())"],
    [
      "import string\nstring.Formatter().get_field('0.__globals__', [f], {})",
      "import string\nstring.capwords('a b')",
    ],
    ["import operator\noperator.attrgetter('__class__')(1)", "import operator\noperator.add(1, 2)"],
    ["import typing\ntyping.get_type_hints(f)", "import typing\ntyping.cast(int, 1)"],
    [
      "import functools\n@functools.singledispatch\ndef f(x): pass",
      "import functools\n@functools.lru_cache\ndef f(x): pass",
    ],
    ["def f(x: \"__import__('os').system('id')\"): pass", "def f(x: 'int'): pass"],
    ["import unittest.mock", "import unittest"],
    ["import logging.config", "import logging\nlogging.getLogger('a')"],
    ["import multiprocessing", "import threading"],
    ["import asyncio", "import queue"],
    ["import sys\nsys.path.insert(0, x)", "import sys\nsys.path.insert(0, 'lib')"],
    ["import sys\nsys.path = []", "import sys\nprint(sys.path)"],
    ["from os import system", "from os import getcwd"],
    ["from os import *", "from os.path import *"],
    ["import numpy", "import math"],
    // No module as a value: not passed, stored, or a setattr/delattr target.
    [
      "import collections\nsetattr(collections, 'type', print)",
      "import collections\ngetattr(collections, 'OrderedDict')()",
    ],
    [
      "import argparse, collections\nargparse.ArgumentParser().parse_args([], namespace=collections)",
      "import argparse\nargparse.ArgumentParser().parse_args([])",
    ],
    ["import json\nd = json.decoder", "import json\nd = json.decoder.JSONDecodeError"],
    [
      "import collections\ndel collections.namedtuple",
      "import collections\ncollections.namedtuple('P', 'a')",
    ],
    // A module's private internals, or an attribute this reading cannot resolve.
    [
      "import calendar\ncalendar._locale._collections_abc.FunctionType",
      "import calendar\ncalendar.isleap(2024)",
    ],
    ["import calendar\ncalendar.no_such_name.x", "import calendar\ncalendar.month_name[1]"],
    ["from calendar import _locale", "from calendar import isleap"],
    // sys.path: only a directory there now (an archive or file holds unread code).
    ["import sys\nsys.path.insert(0, 'data.json')", "import sys\nsys.path.insert(0, 'lib')"],
    ["import sys\nsys.path.append('vendor.zip')", "import sys\nsys.path.append('lib')"],
    // dataclasses pastes field names into source it executes (2.0.5 review).
    ["from dataclasses import dataclass", "from collections import namedtuple"],
    ["import os\nf = os\nf.remove('x')", "import os\nf = os.path.join\nf('a', 'b')"],
    ["import json.tool", "import json.decoder"],
    // An object os holds, found by identity under another module's name.
    ["from io import _check_methods", "from io import StringIO"],
    [
      "import string\nclass F(string.Formatter):\n    pass",
      "import string\nclass F(str):\n    pass",
    ],
    ["import typing\ntyping._eval_type(t, {}, {})", "import ast\nast.literal_eval('1')"],
    [
      "import glob\nmatch glob:\n    case object(os=m):\n        pass",
      "x = 1\nmatch x:\n    case int(real=r):\n        pass",
    ],
    ["class K:\n    __match_args__ = ('os',)", "class K:\n    __match_args__ = ('a',)"],
    [
      "import unittest\nunittest.main(argv=['x', 'os.fork'])",
      "import unittest\nunittest.main(verbosity=2)",
    ],
    [
      "from pathlib import Path\nPath('a')._delete()",
      "from pathlib import Path\nPath('a').is_dir()",
    ],
    ["breakpoint()", "print()"],
    ["help(len)", "print(len)"],
    ["globals()['x'] = 1", "x = 1"],
    ["vars()", "dir()"],
    ["import bad", "import util"],
    ["import aliased\naliased.helper.remove('x')", "import aliased\naliased.VALUE"],
    ["from aliased import helper", "from aliased import VALUE"],
    ["from aliased import *", "from util import *"],
    ["import aliased\nprint(aliased)", "import util\nprint(util)"],
    ["from pkg import holds\nprint(holds)", "from pkg import inner\nprint(inner)"],
    ["import nsdir.mod", "import pkg.inner"],
    ["open('/proc/self/mem', 'wb')", "open('local.bin', 'wb')"],
    ["open('/home/someone/.ssh/id_rsa').read()", "open('data.json').read()"],
    ["import os\nos.symlink('/etc/passwd', 'p')", "import os\nos.readlink('p')"],
    ["import os\nos.chmod('a', 0o755)", "import os\nos.access('a', os.R_OK)"],
    ["import os\nos.kill(1, 9)", "import os\nos.getpid()"],
    [
      "e = None\ntry:\n    1/0\nexcept Exception as e:\n    e.__traceback__.tb_frame",
      "try:\n    1/0\nexcept Exception as e:\n    print(e)",
    ],
    ["import json\njson.loads = print", "import json\nprint(json.loads('1'))"],
    ["import uuid\nuuid.uuid1()", "import uuid\nuuid.uuid4()"],
    ["import platform\nplatform.architecture()", "import sys\nsys.platform"],
    [
      "import sqlite3\nsqlite3.connect('a.db').execute('DELETE FROM t')",
      "import sqlite3\nsqlite3.connect('a.db').execute('SELECT 1')",
    ],
    // Frames and tracing, by family (a tracer moves where a frame continues).
    [
      "import threading\nthreading.settrace_all_threads(print)",
      "import threading\nthreading.active_count()",
      /tracing/,
    ],
    [
      "import threading\nthreading.setprofile_all_threads(print)",
      "import threading\nthreading.get_ident()",
    ],
    ["import threading\nthreading.gettrace()", "import threading\nthreading.main_thread()"],
    [
      "import traceback\nlist(traceback.walk_stack(None))",
      "import traceback\ntraceback.format_exc()",
      /frames/,
    ],
    ["import traceback\ntraceback.walk_tb(None)", "import traceback\ntraceback.extract_tb(None)"],
    ["def f(fr):\n    fr.f_lineno = 3", "def f(fr):\n    fr.lineno = 3"],
    ["def f(fr):\n    fr.f_trace = f", "def f(fr):\n    fr.trace = f"],
    ["def f(fr):\n    fr.f_trace_lines = True", "def f(fr):\n    fr.trace_lines = True"],
    ["def f(fr):\n    fr.f_trace_opcodes = True", "def f(fr):\n    fr.trace_opcodes = True"],
    ["def f(fr):\n    setattr(fr, 'f_lineno', 3)", "def f(fr):\n    setattr(fr, 'lineno', 3)"],
    ["def f(e):\n    return e.tb_frame", "def f(e):\n    return e.tb_lineno"],
    ["def g():\n    yield 1\ng().gi_frame", "def g():\n    yield 1\ng().gi_running"],
    ["def f(c):\n    return c.cr_frame", "def f(c):\n    return c.cr_running"],
    ["def f(fr):\n    return fr.f_back", "def f(fr):\n    return fr.back"],
    ["import sys\nsys.monitoring", "import sys\nsys.version"],
    [
      "def f(o):\n    o.monitoring.use_tool_id(1, 'x')",
      "def f(o):\n    o.monitor.use_tool_id(1, 'x')",
    ],
    ["def f(o):\n    o.call_tracing(f, ())", "def f(o):\n    o.call(f, ())"],
    ["def f(o):\n    o._getframe(1)", "def f(o):\n    o.get_frame(1)"],
    ["def f(o):\n    o._current_frames()", "def f(o):\n    o.current_frame_count()"],
    ["def f(o):\n    o.remote_exec(1, 'x')", "def f(o):\n    o.remote(1, 'x')"],
    // The arguments the run was started with are not changed.
    ["import sys\nsys.argv[:] = ['x']", "import sys\nargs = sys.argv[:]", /sys\.argv/],
    ["import sys\nsys.argv[1] = 'x'", "import sys\nx = sys.argv[1]"],
    ["import sys\ndel sys.argv[0]", "import sys\nn = len(sys.argv)"],
    ["import sys\nsys.argv.append('x')", "import sys\nsys.argv.index('x')"],
    ["import sys\nsys.argv.extend(['x'])", "import sys\nsys.argv.count('x')"],
    ["import sys\nsys.orig_argv.clear()", "import sys\nsys.orig_argv.copy()"],
    ["import sys\nsys.argv = ['x']", "import sys\nargv = ['x']"],
    // The containment's own files, by a literal or a constant expression.
    ["open('/.enclawed/code/py-guard.py').read()", "open('enclawed/code/py-guard.py').read()"],
    [
      "open(chr(47) + '.encl' + 'awed' + chr(47) + 'code').read()",
      "open(chr(47) + 'encl' + 'awed' + chr(47) + 'code').read()",
      /containment's own/,
    ],
    ["open('/'.join(['', '.enclawed', 'code']))", "open('/'.join(['', 'enclawed', 'code']))"],
    [
      "import os\nos.path.join('/', '.enclawed', 'x')",
      "import os\nos.path.join('/', 'enclawed', 'x')",
    ],
    ["x = f'{chr(47)}.enclawed'", "x = f'{chr(47)}enclawed'"],
    ["open('//./.enclawed/x')", "open('//./enclawed/x')"],
  ];
  it.each(pairs)("%s", (bad, good, why) => {
    refused(bad as string, (why as RegExp | undefined) ?? /./);
    ok(good as string);
  });

  it("a script that imports a project module reaching the network", () => {
    const v = verdict("python3 scripts/evil.py");
    expect(v.ok ? "ok" : v.why).toMatch(/socket/);
  });

  it("a literal write to a git hook is handed to the engine as a write (decided like the Write: it asks)", () => {
    const v = verdict(heredoc("open('.git/hooks/pre-commit', 'w').write('x')"));
    expect(v.ok && v.writes.map((w) => path.relative(proj, w))).toEqual([".git/hooks/pre-commit"]);
    expect(isExecConfigPath(path.join(proj, ".git/hooks/pre-commit"))).toBe(true);
  });

  it("a file that does not decode as UTF-8 is not read (the interpreter may read other text)", () => {
    fs.writeFileSync(
      path.join(proj, "latin.py"),
      Buffer.concat([
        Buffer.from("# -*- coding: latin-1 -*-\nx"),
        Buffer.from([0xe9]),
        Buffer.from(" = 1\nprint(x\u00e9\n"),
      ]),
    );
    const v = verdict("python3 latin.py");
    expect(v.ok ? "ok" : v.why).toMatch(/could not be read/);
  });

  it("python -m unittest names only project modules; pytest loads no plugin by name", () => {
    for (const [line, allowed] of [
      ["python3 -m unittest util", true],
      ["python3 -m unittest pkg.inner", true],
      ["python3 -m unittest os.fork", false],
      ["python3 -m unittest antigravity", false],
      ["python3 -m pytest -q", true],
      ["python3 -m pytest -p evil_plugin", false],
      ["python3 -m pytest --pyargs os", false],
      ["python3 -m pytest -pevil_plugin", false],
      ["python3 -m pytest -q --assert=plain tests", true],
      ["python3 -m pytest -k ok", false],
      ["python3 -m pytest -kok", false],
      ["python3 -m pytest -m slow", false],
      ["python3 -m pytest --doctest-modules", false],
    ] as const) {
      const v = verdict(line);
      expect([line, v.ok]).toEqual([line, allowed]);
    }
  });

  it("piped or redirected standard input is not read", () => {
    for (const line of ["cat x.py | python3 -", "python3 - < data.json", "python3", "python3 -"]) {
      const v = verdict(line);
      expect([line, v.ok]).toEqual([line, false]);
    }
  });

  it("a project file shadowing an allowed standard-library module is refused", () => {
    put("shadow/random.py", "import os\nhelper = os\n");
    const p = parseCompound("cd shadow && python3 -c 'import random; random.random()'", {
      cwd: proj,
      home: null,
    });
    expect(p.ok).toBe(true);
    if (p.ok) {
      const v = containedExecution(
        {
          projectDir: proj,
          home: null,
          fs: nodeFsProbe(),
          repositoryEnv: [],
          equalsCommitted: () => true,
        },
        p.commands,
      );
      expect(v.ok ? "ok" : v.why).toMatch(/shadows/);
    }
  });
});

describe("python reader: the parse never runs the code", () => {
  it("parses with the interpreter the containment starts (the same program lookup)", () => {
    expect(PYTHON_PROGRAM_DIRS).toEqual(PROGRAM_DIRS);
  });

  it("reading code that would write a file writes nothing", () => {
    const marker = path.join(root, "ran-marker");
    const code = `open(${JSON.stringify(marker)}, "w").write("x")\nimport os\nos.system("touch ${marker}")`;
    expect(pythonFacts(code)).not.toBeNull();
    expect(fs.existsSync(marker)).toBe(false);
  });

  it("text python3 cannot parse runs nothing (the same interpreter parses it); oversized text is refused", () => {
    // A syntax error anywhere: python3 compiles the whole file first and runs none of it.
    expect(readPython("import os\nos.system('id')\nprint(1", "x", null, [], io())).toBeNull();
    expect(readPython(`${"(".repeat(5000)}1${")".repeat(5000)}`, "x", null, [], io())).toBeNull();
    // Parsed, but nested deeper than the reader walks: refused, never taken as unparsed.
    expect(readPython(`x = ${"-".repeat(3000)}1`, "x", null, [], io())).toMatch(/deeper/);
    expect(readPython("x = 1\n".repeat(200_000), "x", null, [], io())).toMatch(/could not be read/);
  });
});

function io() {
  return {
    load: (f: string) => ({ real: f, text: fs.readFileSync(f, "utf8") }),
    checkText: () => {},
    cwd: proj,
    show: (f: string) => f,
  };
}

describe("python reader: contained Python needs Python 3.14 or newer", () => {
  afterAll(() => setPythonVersionProbeForTests(null));

  it("an older interpreter (its binary's own answer) is not offered containment; 3.14 is", () => {
    setPythonVersionProbeForTests(() => [3, 13]);
    const v = verdict(heredoc("print(1)"));
    expect(v.ok ? "ok" : v.why).toMatch(
      /contained Python needs Python 3\.14 or newer; this host has 3\.13/,
    );
    expect(containedPythonStatus().unsupported).toMatch(/this host has 3\.13/);
    setPythonVersionProbeForTests(() => null);
    const u = verdict(heredoc("print(1)"));
    expect(u.ok ? "ok" : u.why).toMatch(/could not tell the version/);
    setPythonVersionProbeForTests(() => [3, 14]);
    expect(verdict(heredoc("print(1)")).ok).toBe(true);
    expect(containedPythonStatus().unsupported).toBeNull();
    setPythonVersionProbeForTests(() => [4, 0]);
    expect(verdict(heredoc("print(1)")).ok).toBe(true);
  });

  it("the real probe reads this host's python3", () => {
    setPythonVersionProbeForTests(null);
    const st = containedPythonStatus();
    if (st.program) {
      expect(st.version).not.toBeNull();
    }
  });
});
