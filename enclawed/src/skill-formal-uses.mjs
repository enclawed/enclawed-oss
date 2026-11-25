// Method A, second pass: every use of a program or a library is accounted for.
//
// The pattern packs of ./skill-formal-static.mjs recognise the canonical
// entry points of each capability (rm, open(..., "w"), fs.rmSync, fetch ...).
// On their own they are a deny list: an entry point they do not list
// (find -delete, perl -e, shutil.rmtree imported by name, a child_process
// function imported by name, os.popen) produced no effect at all, so a skill
// could declare less than it does and still satisfy the biconditional.
//
// This pass closes that by enumeration, over the same source text:
//
//   shell   every simple command (in lists, pipelines, subshells, command
//           substitutions, if/while/for/case bodies) runs a program; the
//           program is classified by a table of known programs and their
//           arguments (rm: every operand an irreversible write; git: by
//           subcommand; find: by its actions; an interpreter with a file:
//           spawn.proc, with inline code: TOP). A program the table does not
//           know, or a program word the script computes, is TOP: its effects
//           cannot be bounded.
//   python  every imported module is classified; for the modules that reach
//           the system (os, shutil, subprocess, pathlib, tempfile, io,
//           logging, ...) every member the code names is classified by a
//           table, and a member the table does not know is TOP. Network
//           modules are net.egress on any use. A module that is neither in
//           the tables nor a file of the skill itself is TOP.
//   js/ts   the same for node builtins and packages: fs (any alias, named or
//           destructured imports, fs.promises), child_process, net/http/...,
//           vm/module/v8 (TOP), process.binding and other escapes (TOP); a
//           bare specifier that is not a builtin and not in the skill's own
//           node_modules, or a relative import that leaves the skill, is TOP.
//
// Every effect found here is ADDED to the pattern packs' effects (a value
// already found with the same capability is not repeated), so the pass can
// only widen what the analysis reports: a skill that was contained stays
// contained only if it really declares what it does.

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { shellUses, spawnedBy, STR_RE } from "./skill-formal-shell.mjs";
import { analyzeSkillDirectory, stripForAnalysis } from "./skill-formal-static.mjs";

/** A set of words given as one space-separated string. */
const words = (text) => new Set(text.split(/\s+/).filter(Boolean));

const READ = "fs.read";
const REV = "fs.write.rev";
const IRREV = "fs.write.irrev";
const NET = "net.egress";
const SPAWN = "spawn.proc";
const SCHEMA = "mutate.schema";

// ────────────────────────────────────────────────────────────── python ──

const PY_PURE = new Set(
  (
    "json re math string textwrap collections collections.abc itertools functools dataclasses typing " +
    "typing_extensions enum datetime time random hashlib hmac base64 binascii struct decimal fractions " +
    "statistics difflib fnmatch argparse copy pprint unicodedata uuid heapq bisect operator contextlib " +
    "abc numbers html html.parser csv tomllib platform locale getpass traceback warnings types weakref " +
    "threading queue secrets zlib shlex keyword calendar colorsys array errno stat signal select " +
    "selectors atexit __future__ urllib.parse email email.message email.utils string.templatelib " +
    "textwrap graphlib zoneinfo ipaddress quopri"
  ).split(/\s+/),
);
const PY_READ_MODULES = words(
  "glob linecache configparser posixpath ntpath os.path filecmp mimetypes",
);
const PY_NET = new Set(
  (
    "socket ssl urllib urllib.request http http.client http.server http.cookiejar requests httpx " +
    "aiohttp ftplib smtplib poplib imaplib telnetlib xmlrpc xmlrpc.client websocket websockets " +
    "paramiko urllib3 socketserver"
  ).split(/\s+/),
);
const PY_SPAWN = new Set(["multiprocessing", "concurrent.futures", "webbrowser", "pty"]);
const PY_DB = new Set(["sqlite3", "dbm"]);
const PY_ARCHIVE = words("zipfile tarfile gzip bz2 lzma shutil._ codecs");
const PY_TOP = new Set(
  (
    "ctypes cffi importlib imp pickle cPickle _pickle dill cloudpickle marshal shelve code codeop " +
    "runpy builtins __builtin__ pdb bdb unittest doctest jsonpickle inspect gc sys._ os._"
  ).split(/\s+/),
);

/** A member table from space-separated names per classification. */
function memberTable(groups) {
  const as = {
    none: [],
    read: [READ],
    rev: [REV],
    irrev: [IRREV],
    readRev: [READ, REV],
    revIrrev: [REV, IRREV],
    spawn: [SPAWN],
    top: null,
    shell: "shell",
    py: "py",
    osPath: "os.path",
  };
  const t = {};
  for (const [kind, names] of Object.entries(groups)) {
    for (const k of words(names)) {
      t[k] = as[kind];
    }
  }
  return t;
}

// Member tables of the modules that reach the system: member -> capability list ([] = no effect).
const OS_MEMBERS = memberTable({
  osPath: "path",
  none: "getcwd getcwdb environ environb getenv getenvb putenv unsetenv sep altsep linesep pathsep extsep curdir pardir devnull name cpu_count getpid getppid getuid geteuid getgid getegid getlogin uname fspath fsencode fsdecode get_terminal_size terminal_size urandom isatty strerror error PathLike DirEntry stat_result chdir umask times getloadavg supports_follow_symlinks O_RDONLY O_WRONLY O_RDWR O_CREAT O_TRUNC O_APPEND O_EXCL F_OK R_OK W_OK X_OK SEEK_SET SEEK_CUR SEEK_END close fsync dup dup2 pipe wait waitpid WEXITSTATUS WIFEXITED P_WAIT P_NOWAIT",
  read: "listdir scandir walk stat lstat access readlink read",
  rev: "mkdir makedirs link symlink utime write",
  readRev: "open fdopen",
  irrev:
    "remove unlink rmdir removedirs rename renames replace truncate ftruncate chmod lchmod fchmod chown lchown fchown",
  shell: "system popen",
  top: "posix_spawn posix_spawnp fork forkpty",
});
// exec*/spawn* take the program and its words in several layouts: not bounded here.
for (const k of ["execl", "execle", "execlp", "execlpe", "execv", "execve", "execvp", "execvpe"]) {
  OS_MEMBERS[k] = null;
}
for (const k of [
  "spawnl",
  "spawnle",
  "spawnlp",
  "spawnlpe",
  "spawnv",
  "spawnve",
  "spawnvp",
  "spawnvpe",
]) {
  OS_MEMBERS[k] = null;
}
const SHUTIL_MEMBERS = memberTable({
  readRev: "copy copy2 copyfile copytree make_archive",
  none: "copyfileobj get_terminal_size ignore_patterns Error SameFileError",
  rev: "copymode copystat",
  irrev: "move rmtree chown",
  revIrrev: "unpack_archive",
  read: "which disk_usage",
});
const SUBPROCESS_MEMBERS = memberTable({
  py: "run call check_call check_output Popen",
  shell: "getoutput getstatusoutput",
  none: "PIPE STDOUT DEVNULL CalledProcessError TimeoutExpired CompletedProcess SubprocessError",
});
const TEMPFILE_MEMBERS = memberTable({
  none: "gettempdir gettempdirb mktemp tempdir",
  rev: "mkstemp mkdtemp TemporaryFile SpooledTemporaryFile",
  revIrrev: "NamedTemporaryFile TemporaryDirectory",
});
const IO_MEMBERS = memberTable({
  readRev: "open FileIO",
  none: "StringIO BytesIO TextIOWrapper BufferedReader BufferedWriter IOBase TextIOBase RawIOBase BufferedIOBase UnsupportedOperation DEFAULT_BUFFER_SIZE SEEK_SET SEEK_CUR SEEK_END",
});
const LOGGING_WRITERS = words(
  "FileHandler basicConfig RotatingFileHandler TimedRotatingFileHandler WatchedFileHandler handlers config",
);
const SYS_TOP = words(
  "modules settrace setprofile _getframe meta_path path_hooks addaudithook breakpointhook displayhook excepthook __dict__",
);
const PATHLIB_NAMES = words("Path PurePath PosixPath WindowsPath PurePosixPath PureWindowsPath");
const ASYNCIO_SPAWN = new Set(["create_subprocess_exec", "create_subprocess_shell"]);
const ASYNCIO_NET = new Set([
  "open_connection",
  "open_unix_connection",
  "start_server",
  "start_unix_server",
]);

/** The capabilities of `module.member` ([] none; null unknown -> TOP), or a sub-module name to continue with. */
function pyMember(mod, member) {
  if (mod === "os") {
    return Object.hasOwn(OS_MEMBERS, member) ? OS_MEMBERS[member] : undefined;
  }
  if (mod === "os.path" || PY_READ_MODULES.has(mod)) {
    return [READ];
  }
  if (mod === "shutil") {
    return Object.hasOwn(SHUTIL_MEMBERS, member) ? SHUTIL_MEMBERS[member] : null;
  }
  if (mod === "subprocess") {
    return Object.hasOwn(SUBPROCESS_MEMBERS, member) ? SUBPROCESS_MEMBERS[member] : null;
  }
  if (mod === "tempfile") {
    return Object.hasOwn(TEMPFILE_MEMBERS, member) ? TEMPFILE_MEMBERS[member] : null;
  }
  if (mod === "io") {
    return Object.hasOwn(IO_MEMBERS, member) ? IO_MEMBERS[member] : null;
  }
  if (mod === "logging" || mod.startsWith("logging.")) {
    return LOGGING_WRITERS.has(member) || mod !== "logging" ? [REV] : [];
  }
  if (mod === "sys") {
    return SYS_TOP.has(member) ? null : [];
  }
  if (mod === "pathlib") {
    // Path objects: their methods are found by name (pyPathMethods).
    return [];
  }
  if (mod === "asyncio") {
    return ASYNCIO_SPAWN.has(member) ? [SPAWN] : ASYNCIO_NET.has(member) ? [NET] : [];
  }
  return moduleCaps(mod);
}

const PY_MEMBER_TABLES = words(
  "os os.path shutil subprocess tempfile io logging sys pathlib asyncio",
);

/** Capabilities of any use of a whole module ([] none, null TOP), for modules without a member table. */
function moduleCaps(mod) {
  const root = mod.split(".")[0];
  if (PY_TOP.has(mod) || PY_TOP.has(root)) {
    return null;
  }
  if (PY_NET.has(mod) || PY_NET.has(root)) {
    return mod === "urllib.parse" ? [] : [NET];
  }
  if (PY_SPAWN.has(mod) || PY_SPAWN.has(root)) {
    return [SPAWN];
  }
  if (PY_DB.has(mod)) {
    return [READ, IRREV, SCHEMA];
  }
  if (PY_ARCHIVE.has(mod)) {
    return [READ, REV, IRREV];
  }
  if (PY_READ_MODULES.has(mod)) {
    return [READ];
  }
  if (PY_PURE.has(mod) || PY_PURE.has(root)) {
    return [];
  }
  return undefined;
}

/** The literal first argument of a call starting right after `open` (index of "("), or "*". */
function literalArg(src, at) {
  const m = /^\(\s*(?:[rbuRBU]{0,2})(['"`])([^'"`\n$]+)\1\s*[,)]/.exec(src.slice(at));
  return m ? m[2] : "*";
}

/**
 * Effects of a Python source: imports and the uses of their names.
 * `local(name)` says whether a module name is a file of the skill.
 */
export function pythonUses(src, local = () => false) {
  const effects = [];
  let top = null;
  const bind = new Map(); // local name -> { mod, member? }
  const lines = src.replace(/\\\n/g, " ");
  const importSpans = [];
  // from X import (a, b as c, ...)
  for (const m of lines.matchAll(
    /^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+(\([^)]*\)|[^\n#;]+)/gm,
  )) {
    importSpans.push([m.index, m.index + m[0].length]);
    const mod = m[1];
    const list = m[2].replace(/[()]/g, "");
    if (mod.startsWith(".")) {
      continue; // the skill's own package
    }
    for (const part of list.split(",")) {
      const t = part.trim();
      if (!t) {
        continue;
      }
      if (t === "*") {
        const c = PY_MEMBER_TABLES.has(mod) ? null : moduleCaps(mod);
        if (c === null || (c === undefined && !local(mod))) {
          top ??= `star-import-of ${mod}`;
        } else if (c) {
          for (const cap of c) {
            effects.push([cap, "*"]);
          }
        }
        continue;
      }
      const as = /^([\w]+)(?:\s+as\s+([\w]+))?$/.exec(t);
      if (!as) {
        top ??= `unreadable-import ${t}`;
        continue;
      }
      bind.set(as[2] ?? as[1], { mod, member: as[1] });
    }
  }
  // import a.b as c, d
  for (const m of lines.matchAll(/^[ \t]*import[ \t]+([^\n#;]+)/gm)) {
    importSpans.push([m.index, m.index + m[0].length]);
    for (const part of m[1].split(",")) {
      const as = /^\s*([\w.]+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
      if (!as) {
        top ??= `unreadable-import ${part.trim()}`;
        continue;
      }
      // `import a.b` binds `a`; `import a.b as c` binds c to a.b.
      if (as[2]) {
        bind.set(as[2], { mod: as[1] });
      } else {
        bind.set(as[1].split(".")[0], { mod: as[1].split(".")[0], full: as[1] });
        if (as[1].includes(".")) {
          // the submodule is loaded too
          const c = moduleCaps(as[1]);
          if (c === null) {
            top ??= `module ${as[1]}`;
          }
        }
      }
    }
  }
  const inImport = (idx) => importSpans.some(([a, b]) => idx >= a && idx < b);
  const add = (caps, value) => {
    for (const cap of caps) {
      effects.push([cap, value]);
    }
  };
  // One use of a member whose classification is r, with `after` the index right after the name.
  const useAt = (r, after, what) => {
    if (r === "shell" || r === "py") {
      if (src[after] !== "(") {
        top ??= `${what} (it starts programs) is used as a value`;
        return;
      }
      const sp = spawnedBy(src.slice(after + 1), r);
      for (const [cap, v] of sp.effects) {
        effects.push([cap, v]);
      }
      top ??= sp.top;
      return;
    }
    add(r === "os.path" ? [READ] : r, src[after] === "(" ? literalArg(src, after) : "*");
  };
  for (const [name, b] of bind) {
    const esc = name.replace(/[$]/g, "\\$");
    if (b.member !== undefined) {
      // from M import x as name: the member's capabilities, at each use of the name.
      const mod = b.mod;
      let caps;
      if (PY_MEMBER_TABLES.has(mod) || moduleCaps(mod) !== undefined) {
        caps = pyMember(mod, b.member);
        if (mod === "pathlib" && PATHLIB_NAMES.has(b.member)) {
          caps = [];
        }
      } else if (local(mod) || local(mod.split(".")[0])) {
        continue;
      } else {
        top ??= `unknown-module ${mod}`;
        continue;
      }
      if (caps === null || caps === undefined) {
        top ??= `unmodeled ${mod}.${b.member}`;
        continue;
      }
      if (Array.isArray(caps) && !caps.length) {
        continue;
      }
      for (const u of src.matchAll(new RegExp(`(?<![\\w.])${esc}\\b`, "g"))) {
        if (!inImport(u.index)) {
          useAt(caps, u.index + u[0].length, `${mod}.${b.member}`);
        }
      }
      continue;
    }
    const mod = b.mod;
    const known = PY_MEMBER_TABLES.has(mod) || moduleCaps(mod) !== undefined;
    if (!known) {
      if (!local(mod)) {
        top ??= `unknown-module ${b.full ?? mod}`;
      }
      continue;
    }
    if (!PY_MEMBER_TABLES.has(mod)) {
      const c = moduleCaps(mod);
      if (c === null) {
        top ??= `module ${mod}`;
      } else if (
        c.length &&
        new RegExp(`(?<![\\w.])${esc}\\b`).test(stripImports(src, importSpans))
      ) {
        add(c, "*");
      }
      continue;
    }
    // A module with a member table: every `name.member` (and name.path.member) is classified.
    for (const u of src.matchAll(
      new RegExp(`(?<![\\w.])${esc}\\b(\\s*\\.\\s*(\\w+)(?:\\s*\\.\\s*(\\w+))?)?`, "g"),
    )) {
      if (inImport(u.index)) {
        continue;
      }
      if (!u[1]) {
        if (/^\s*\[/.test(src.slice(u.index + u[0].length))) {
          top ??= `computed-member-of ${mod}`;
        } else {
          top ??= `the module ${mod} is used as a value`;
        }
        continue;
      }
      const r = pyMember(mod, u[2]);
      if (r === null || r === undefined) {
        top ??= `unmodeled ${mod}.${u[2]}`;
        continue;
      }
      // name.member(...) or name.member.sub(...): the call right after the matched name.
      useAt(r, u.index + u[0].length, `${mod}.${u[2]}`);
    }
  }
  // Path objects (pathlib imported in any form): methods that change files, found by name.
  if ([...bind.values()].some((b) => b.mod === "pathlib")) {
    for (const u of src.matchAll(
      /\.(unlink|rmdir|rename|chmod|lchmod|symlink_to|hardlink_to|link_to)\s*\(/g,
    )) {
      add([IRREV], "*");
      void u;
    }
    // Path.replace(target) takes one argument; str.replace takes two or three.
    for (const u of src.matchAll(/\.replace\s*\(([^(),]*(?:\([^()]*\))?[^(),]*)\)/g)) {
      add([IRREV], "*");
      void u;
    }
    for (const u of src.matchAll(/\.(write_text|write_bytes|touch|mkdir)\s*\(/g)) {
      add([REV], "*");
      void u;
    }
    for (const u of src.matchAll(/\.open\s*\(([^)]*)\)/g)) {
      if (!/^\s*(?:mode\s*=\s*)?['"]r?b?t?['"]?\s*(?:,|$)/.test(u[1]) || /[wax+]/.test(u[1])) {
        add([REV], "*");
      }
    }
  }
  // Builtins that reach every name in the program.
  if (/(?<![\w.])(?:globals|vars|locals)\s*\(\s*\)\s*\[|(?<![\w.])breakpoint\s*\(/.test(src)) {
    top ??= "computed-global";
  }
  if (/(?<![\w.])(?:setattr|delattr)\s*\(/.test(src)) {
    top ??= "computed-attribute-assignment";
  }
  return { effects, top };
}

function stripImports(src, spans) {
  let out = "";
  let last = 0;
  for (const [a, b] of spans.toSorted((x, y) => x[0] - y[0])) {
    out += src.slice(last, a);
    last = b;
  }
  return out + src.slice(last);
}

// ─────────────────────────────────────────────────────────── js / ts ──

const FS_TABLE = {};
for (const k of [
  "readFile",
  "readdir",
  "stat",
  "lstat",
  "exists",
  "access",
  "realpath",
  "readlink",
  "createReadStream",
  "opendir",
  "watch",
  "watchFile",
  "unwatchFile",
  "read",
  "readv",
  "fstat",
  "statfs",
  "glob",
]) {
  FS_TABLE[k] = [READ];
  FS_TABLE[`${k}Sync`] = [READ];
}
for (const k of [
  "writeFile",
  "appendFile",
  "mkdir",
  "mkdtemp",
  "copyFile",
  "cp",
  "createWriteStream",
  "open",
  "write",
  "writev",
  "symlink",
  "link",
  "utimes",
  "futimes",
  "lutimes",
]) {
  FS_TABLE[k] = [REV];
  FS_TABLE[`${k}Sync`] = [REV];
}
for (const k of [
  "unlink",
  "rm",
  "rmdir",
  "rename",
  "truncate",
  "ftruncate",
  "chmod",
  "fchmod",
  "lchmod",
  "chown",
  "fchown",
  "lchown",
]) {
  FS_TABLE[k] = [IRREV];
  FS_TABLE[`${k}Sync`] = [IRREV];
}
for (const k of ["close", "fsync", "fdatasync", "closeSync", "fsyncSync", "fdatasyncSync"]) {
  FS_TABLE[k] = [];
}
for (const k of [
  "constants",
  "Dirent",
  "Stats",
  "ReadStream",
  "WriteStream",
  "Dir",
  "F_OK",
  "R_OK",
  "W_OK",
  "X_OK",
]) {
  FS_TABLE[k] = [];
}
FS_TABLE.promises = "module";
FS_TABLE.default = "module";

// child_process: how each function names the program it starts.
const CP_TABLE = {
  exec: "shell",
  execSync: "shell",
  execFile: "argv",
  execFileSync: "argv",
  spawn: "argv",
  spawnSync: "argv",
  fork: "fork",
  ChildProcess: [],
  default: "module",
};

const JS_UNIFORM = {
  cluster: [SPAWN],
  worker_threads: [SPAWN],
  net: [NET],
  tls: [NET],
  http: [NET],
  https: [NET],
  http2: [NET],
  dgram: [NET],
  dns: [NET],
  "dns/promises": [NET],
  sqlite: [READ, IRREV, SCHEMA],
};
const JS_TOP = words("vm module v8 inspector repl wasi trace_events");
const JS_PURE = new Set(
  (
    "os path path/posix path/win32 url util util/types crypto events stream stream/promises stream/web " +
    "buffer string_decoder querystring assert assert/strict zlib readline readline/promises timers " +
    "timers/promises perf_hooks test async_hooks diagnostics_channel tty punycode constants console process"
  ).split(/\s+/),
);

function jsModule(spec) {
  const s = spec.replace(/^node:/, "");
  if (s === "fs" || s === "fs/promises") {
    return { kind: "table", table: FS_TABLE };
  }
  if (s === "child_process") {
    return { kind: "table", table: CP_TABLE };
  }
  if (Object.hasOwn(JS_UNIFORM, s)) {
    return { kind: "uniform", caps: JS_UNIFORM[s] };
  }
  if (JS_TOP.has(s)) {
    return { kind: "top" };
  }
  if (JS_PURE.has(s)) {
    return { kind: "pure" };
  }
  return null;
}

/**
 * Effects of a JavaScript / TypeScript source. `local(spec)` says whether a
 * module specifier resolves to a file of the skill (a relative path inside it,
 * or a package in its own node_modules).
 */
export function jsUses(src, local = () => false) {
  const effects = [];
  let top = null;
  // local name -> { table, member } (member null: the module object itself)
  const names = new Map();
  const add = (caps, value) => {
    for (const cap of caps) {
      effects.push([cap, value]);
    }
  };
  const spans = [];
  const bindAll = (table, bindingText) => {
    const b = (bindingText ?? "").trim();
    const brace = /\{([^}]*)\}/.exec(b);
    if (brace) {
      for (const part of brace[1].split(",")) {
        const t = part.trim();
        if (!t) {
          continue;
        }
        const as = /^([\w$]+)\s*(?:as|:)\s*([\w$]+)$/.exec(t) ?? /^([\w$]+)$/.exec(t);
        if (!as) {
          top ??= `unreadable binding ${t}`;
          continue;
        }
        names.set(as[2] ?? as[1], { table, member: as[1] });
      }
    }
    const rest = b.replace(/\{[^}]*\}/, "").replace(/\*\s*as\s+/, "");
    for (const t of rest.split(",")) {
      const id = t.trim();
      if (/^[\w$]+$/.test(id)) {
        names.set(id, { table, member: null });
      } else if (id) {
        top ??= `unreadable binding ${id}`;
      }
    }
  };
  const onModule = (spec, bindingText, at, len, member = null) => {
    spans.push([at, at + len]);
    const m = jsModule(spec);
    if (!m) {
      if (!local(spec)) {
        top ??= `module ${spec} is not part of the skill`;
      }
      return;
    }
    if (m.kind === "top") {
      top ??= `module ${spec}`;
      return;
    }
    if (m.kind === "pure") {
      return;
    }
    if (m.kind === "uniform") {
      add(m.caps, "*");
      return;
    }
    if (member !== null) {
      // require("fs").member: that member, bound to the name (if any) or used in place.
      const c = m.table[member];
      if (c === undefined) {
        top ??= `unmodeled ${String(spec)}.${String(member)}`;
      } else if (bindingText && /^[\w$]+$/.test(bindingText.trim())) {
        names.set(bindingText.trim(), {
          table: m.table,
          member: typeof c === "string" ? null : member,
        });
      } else if (typeof c !== "string") {
        useAt(c, at + len, `${String(spec)}.${String(member)}`);
      }
      return;
    }
    bindAll(m.table, bindingText);
  };
  // One use of a member whose classification is c, `after` the index right after it.
  const useAt = (c, after, what) => {
    if (c === "shell" || c === "argv" || c === "fork") {
      if (src[after] !== "(") {
        top ??= `${what} (it starts programs) is used as a value`;
        return;
      }
      const arg = src.slice(after + 1);
      const sp =
        c === "fork"
          ? spawnedBy(`"node", [${(STR_RE.exec(arg) ?? [""])[0]}]`, "argv")
          : spawnedBy(arg, c);
      for (const [cap, v] of sp.effects) {
        effects.push([cap, v]);
      }
      top ??= sp.top;
      return;
    }
    add(c, src[after] === "(" ? literalArg(src, after) : "*");
  };
  for (const m of src.matchAll(
    /\bimport\s+(?:type\s+)?([\w$*{}\s,]+?)\s+from\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bexport\s+(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    onModule(m[2] ?? m[3] ?? m[4], m[1], m.index, m[0].length);
  }
  for (const m of src.matchAll(
    /(?:(?:const|let|var)\s+([\w$]+|\{[^}]*\})\s*=\s*)?(?:await\s+)?(?:require|import)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)(\s*\.\s*[\w$]+)?/g,
  )) {
    onModule(m[2], m[1], m.index, m[0].length, m[3] ? m[3].replace(/[\s.]/g, "") : null);
  }
  const inSpan = (i) => spans.some(([x, y]) => i >= x && i < y);
  for (const [name, { table, member }] of names) {
    const esc = name.replace(/\$/g, "\\$");
    if (member !== null) {
      const c = table[member];
      if (c === undefined) {
        top ??= `unmodeled member ${member}`;
        continue;
      }
      if (typeof c === "string" && c === "module") {
        names.set(name, { table, member: null });
        continue;
      }
      if (Array.isArray(c) && !c.length) {
        continue;
      }
      for (const u of src.matchAll(new RegExp(`(?<![\\w$.])${esc}\\b`, "g"))) {
        if (!inSpan(u.index)) {
          useAt(c, u.index + u[0].length, member);
        }
      }
    }
  }
  for (const [name, { table, member }] of names) {
    if (member !== null) {
      continue;
    }
    const esc = name.replace(/\$/g, "\\$");
    for (const u of src.matchAll(
      new RegExp(
        `(?<![\\w$.])${esc}\\b(\\s*\\??\\.\\s*([\\w$]+)(?:\\s*\\??\\.\\s*([\\w$]+))?)?`,
        "g",
      ),
    )) {
      if (inSpan(u.index)) {
        continue;
      }
      if (!u[1]) {
        top ??= `the module bound to ${name} is used as a value`;
        continue;
      }
      let c = table[u[2]];
      let member = u[2];
      let end = u.index + u[0].length;
      if (c === "module") {
        // fs.promises.X
        member = u[3];
        c = member === undefined ? undefined : table[member];
      } else if (u[3] !== undefined) {
        // name.member.x: the member is used as a value, not called.
        end = u.index + u[1].indexOf(u[2]) + u[2].length;
      }
      if (c === undefined || c === "module") {
        top ??= `unmodeled member ${member ?? u[2]}`;
        continue;
      }
      useAt(c, end, member);
    }
  }
  // Escapes from the module system and other ways to reach the host.
  if (
    /\bprocess\s*\??\.\s*(?:binding|_linkedBinding|dlopen|kill|mainModule|reallyExit)\b|\bprocess\s*\[|(?<![\w$.])(?:Bun|Deno)\s*\.|\b(?:globalThis|global|self|window)\s*\[|\bmodule\s*\.\s*(?:constructor|require|_load|createRequire)\b|\brequire\s*\.\s*(?:cache|extensions|main)\b|(?<![\w$.])require(?!\s*\(|\s*\.\s*resolve)\b|\bcreateRequire\b/.test(
      src,
    )
  ) {
    top ??= "reaches-the-runtime-outside-the-analysed-calls";
  }
  if (/\bnew\s+(?:WebSocket|EventSource)\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(/.test(src)) {
    add([NET], "*");
  }
  return { effects, top };
}

// ─────────────────────────────────────────────────────────── entry ──

/**
 * The second pass for one file. `file` is its absolute path and `root` the
 * skill directory (to resolve which modules are the skill's own).
 */
export function usesOf(src, language, { file = null, root = null } = {}) {
  if (language === ".sh" || language === ".bash") {
    return shellUses(src);
  }
  if (language === ".py") {
    const local = (mod) => {
      if (!root) {
        return false;
      }
      const top = mod.split(".")[0];
      return pyLocalModules(root).has(top);
    };
    return pythonUses(src, local);
  }
  const local = (spec) => {
    if (!root) {
      return false;
    }
    if (spec.startsWith(".") || spec.startsWith("/")) {
      if (!file) {
        return false;
      }
      const p = path.resolve(path.dirname(file), spec);
      const rel = path.relative(root, p);
      return !rel.startsWith("..") && !path.isAbsolute(rel);
    }
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    // A package in a node_modules of the skill, between the file and the skill directory.
    for (let d = file ? path.dirname(file) : root; ; d = path.dirname(d)) {
      if (existsSync(path.join(d, "node_modules", pkg))) {
        return true;
      }
      if (d === root || path.relative(root, d).startsWith("..") || d === path.dirname(d)) {
        return false;
      }
    }
  };
  return jsUses(src, local);
}

const pyLocalCache = new Map();
/** Top-level Python module names a skill provides itself (any .py file or package directory in it). */
function pyLocalModules(root) {
  const hit = pyLocalCache.get(root);
  if (hit) {
    return hit;
  }
  const names = new Set();
  const walk = (d, depth) => {
    let ents = [];
    try {
      ents = readdirSafe(d);
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (existsSync(path.join(d, e.name, "__init__.py"))) {
          names.add(e.name);
        }
        if (depth < 12 && e.name !== ".git") {
          walk(path.join(d, e.name), depth + 1);
        }
      } else if (e.isFile() && e.name.endsWith(".py")) {
        names.add(e.name.slice(0, -3));
      }
    }
  };
  walk(root, 0);
  pyLocalCache.set(root, names);
  // The cache lives for one analysis (cleared by clearUsesCache).
  return names;
}

function readdirSafe(d) {
  return readdirSync(d, { withFileTypes: true });
}

/** Drop cached per-skill facts (one analysis of a directory clears them first). */
export function clearUsesCache() {
  pyLocalCache.clear();
}

/**
 * The second pass over a whole skill directory: the same files Method A
 * reads (analyzeSkillDirectory), each through usesOf. Returns the effects it
 * finds (capability tokens, sorted), the scripts whose effects it cannot bound
 * ({ script, reason }), and, when write folders are declared, every write
 * whose path is not a literal inside one ({ script, value }).
 */
export function analyzeSkillUses(dir, writeRoots = null) {
  clearUsesCache();
  const effects = new Set();
  const unbounded = [];
  const writes = [];
  analyzeSkillDirectory(dir, {
    onScript: ({ src, ext, file, rel }) => {
      const text = ext === ".sh" || ext === ".bash" ? src : stripForAnalysis(src, ext);
      const u = usesOf(text, ext, { file, root: dir });
      for (const [cap, value] of u.effects) {
        effects.add(cap);
        if (cap === REV || cap === IRREV) {
          writes.push({ script: rel, value: value ?? "*" });
        }
      }
      if (u.top) {
        unbounded.push({ script: rel, reason: u.top });
      }
    },
  });
  clearUsesCache();
  const roots = Array.isArray(writeRoots) && writeRoots.length ? writeRoots : null;
  const norm = (p) => path.posix.normalize(String(p).replace(/^\.\//, "")).replace(/\/+$/, "");
  const inside = (v) =>
    typeof v === "string" &&
    v !== "*" &&
    !path.posix.isAbsolute(v) &&
    !norm(v).split("/").includes("..") &&
    roots.some((r) => norm(v) === norm(r) || norm(v).startsWith(`${norm(r)}/`));
  const escapingWrites = roots ? writes.filter((w) => !inside(w.value)) : [];
  const key = (w) => `${w.script}\0${w.value}`;
  return {
    unionEffects: [...effects].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    unbounded: unbounded.toSorted((a, b) => (a.script < b.script ? -1 : 1)),
    escapingWrites: [...new Map(escapingWrites.map((w) => [key(w), w])).values()].toSorted((a, b) =>
      key(a) < key(b) ? -1 : 1,
    ),
  };
}
