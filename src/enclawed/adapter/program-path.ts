// enclawed adapter kit: which file a command word runs.
//
// The read-only allowlist (./shell-readonly.ts) names programs: `ls`, `cat`,
// `git`. It holds only when the word runs the machine's own program of that
// name. The shell finds it along the session's PATH, first match wins, so a
// PATH with a directory the agent can write ahead of the system directories
// (the project, `node_modules/.bin`, a temporary directory, an empty or
// relative entry, which is the working directory) lets the agent plant its
// own `ls` there with an allowed write and have it run, uncontained, as the
// allowlisted program.
//
// A command word is the verified program only when, resolved along the
// session's PATH (the environment the adapter passed, else the hook's own,
// which the host's shell starts from) exactly as the shell resolves it, it
// is found in an absolute PATH directory, and neither that directory nor the
// file it resolves to (links followed) lies where the agent can write
// without a person (the project, the system's temporary directories, the
// session's scratch paths), and the file and its directory are writable by
// no one but their owner, who is the system (root) or this user. Otherwise
// the command runs an unverified program: it is decided as any program that
// is not on the allowlist (contained, or asked). Builtins and reserved words
// run no file. A word that names no file anywhere on PATH runs nothing
// (the shell prints "command not found").

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isInside } from "./fs-probe.js";
import type { SimpleCommand } from "./shell-compound.js";
import { MPI_WRAPPERS } from "./shell-readonly-inspect.js";

const MPI_COMPILERS =
  "cc gcc c++ g++ gfortran f77 f90 f95 clang clang++ flang nvc nvc++ nvfortran pgcc pgc++ pgfortran icc icpc ifort icx icpx ifx".split(
    " ",
  );

// Shell builtins and reserved words: never a file on PATH.
const BUILTINS = new Set(
  "alias bg bind break builtin caller cd command compgen complete compopt continue declare dirs disown echo enable eval exec exit export false fc fg getopts hash help history jobs kill let local logout mapfile popd printf pushd pwd read readarray readonly return set shift shopt source suspend test times trap true type typeset ulimit umask unalias unset wait . : [ [[ ]] { } ! if then else elif fi case esac for while until do done in function select time coproc".split(
    " ",
  ),
);

/** The words of a simple command that the shell runs as programs: its command word, and what xargs, find -exec and the wrappers start. */
export function programWords(argv: readonly string[]): string[] {
  const out: string[] = [];
  if (argv.length === 0) {
    return out;
  }
  out.push(argv[0]);
  const base = path.basename(argv[0]);
  // Wrappers whose operand is the program they run (option values are not told
  // apart from it: every later word is checked as a program name, a superset).
  if (["xargs", "nice", "nohup", "time", "timeout", "stdbuf", "ionice", "env"].includes(base)) {
    out.push(...argv.slice(1).filter((w) => !w.startsWith("-")));
  }
  // dpkg hands its query actions to dpkg-query, found along PATH; dpkg-query
  // starts `pager` (along PATH) when its output is a terminal.
  if (base === "dpkg") {
    out.push("dpkg-query", "pager");
  } else if (base === "dpkg-query") {
    out.push("pager");
  }
  // An MPI compiler wrapper starts its compiler along PATH (its name comes from
  // the wrapper's configuration): the common compiler names, a superset.
  // gh runs git along PATH to read the repository's remotes and branch.
  if (base === "gh") {
    out.push("git");
  }
  if (MPI_WRAPPERS.has(base)) {
    out.push(...MPI_COMPILERS);
  }
  if (base === "find") {
    for (let j = 1; j + 1 < argv.length; j++) {
      if (/^-(?:exec|execdir|ok|okdir)$/.test(argv[j])) {
        out.push(argv[j + 1]);
      }
    }
  }
  return out;
}

export type ProgramCheck = Readonly<{
  /** The session's PATH (null: the hook process's own). */
  pathVar: string | null;
  projectDir: string;
  /** Directories the agent may write without a person besides the project and the temporary directories. */
  scratch?: readonly string[];
  /** The session's environment (GOTOOLCHAIN); absent: not known. */
  environment?: Readonly<Record<string, string | undefined>> | null;
}>;

function tempRoots(): string[] {
  const out = new Set<string>();
  for (const d of [os.tmpdir(), "/tmp", "/var/tmp", "/dev/shm"]) {
    try {
      out.add(fs.realpathSync(d));
    } catch {
      /* not on this system */
    }
  }
  return [...out];
}

// In a user namespace (a container, a sandbox) the system's files belong to
// an owner the namespace does not map, shown as the kernel's overflow id.
function overflowUid(): number | null {
  try {
    if (/^0\s+0\s+4294967295$/.test(fs.readFileSync("/proc/self/uid_map", "utf8").trim())) {
      return null; // the initial namespace: root is root
    }
    return Number(fs.readFileSync("/proc/sys/kernel/overflowuid", "utf8").trim());
  } catch {
    return null;
  }
}

/** Writable by nobody but its owner, who is root (or, in a user namespace, the unmapped system owner) or this user. */
function ownerOnly(p: string): boolean {
  try {
    const st = fs.statSync(p);
    const uid = process.getuid?.() ?? -1;
    if (st.uid !== 0 && st.uid !== uid && st.uid !== overflowUid()) {
      return false;
    }
    // A sticky directory (/tmp) is still writable by everyone.
    return (st.mode & 0o022) === 0;
  } catch {
    return false;
  }
}

// Version managers' proxies and shims: the program they start is chosen at
// run time from files of the working directory and its parents
// (rust-toolchain.toml, .python-version, .tool-versions, .nvmrc, package.json's
// packageManager, mise.toml, ...), which the agent may have written: a path
// into the project, or a toolchain downloaded from the network. Recognized by
// the file the name resolves to (its name, the directory it lies in, or the
// text of a shim script), wherever it is installed.
const SHIM_PROGRAMS = new Set([
  "rustup",
  "corepack",
  "volta",
  "volta-shim",
  "asdf",
  "mise",
  "rtx",
  "pyenv",
  "rbenv",
  "nodenv",
  "goenv",
  "jenv",
  "fnm",
  "proto",
]);
const SHIM_DIR =
  /\/(?:\.pyenv|\.asdf|\.rbenv|\.nodenv|\.goenv|\.jenv|\.volta|\.proto|\.local\/share\/(?:mise|rtx|fnm)|\.mise|\.fnm|\.sdkman\/candidates)\/|\/corepack\/|\/shims\//;
const SHIM_TEXT =
  /\b(?:pyenv|asdf|rbenv|nodenv|goenv|jenv|mise|rtx|volta|corepack|proto|rustup|sdkman)\b[^\n]*\b(?:exec|x|run)\b/;

/** Is the program at `real` (a resolved file) a version manager's proxy or shim? Its kind, or null. */
export function toolchainProxy(real: string): string | null {
  const base = path.basename(real);
  if (SHIM_PROGRAMS.has(base)) {
    return `${base}'s proxy`;
  }
  if (SHIM_DIR.test(real)) {
    return "a version manager's shim";
  }
  // rustup installs its proxies (cargo, rustc, ...) as links or copies of
  // itself next to it.
  try {
    const me = fs.statSync(real);
    const rustup = fs.statSync(path.join(path.dirname(real), "rustup"));
    if ((me.dev === rustup.dev && me.ino === rustup.ino) || me.size === rustup.size) {
      return "rustup's proxy";
    }
  } catch {
    /* no rustup beside it */
  }
  try {
    const fd = fs.openSync(real, "r");
    try {
      const buf = Buffer.alloc(4096);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      const head = buf.subarray(0, n).toString("latin1");
      if (head.startsWith("#!") && SHIM_TEXT.test(head)) {
        return "a version manager's shim script";
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    /* unreadable: decided by its name and place only */
  }
  return null;
}

/**
 * go starts the toolchain a go.mod or go.work names (GOTOOLCHAIN is "auto"
 * unless set to "local"), downloading it: a go.mod or go.work in the working
 * directory or above.
 */
function goSelects(
  cwd: string,
  environment: Readonly<Record<string, string | undefined>> | null | undefined,
): string | null {
  // The session's environment (the host's go runs with it); not known: go may select.
  if (environment?.GOTOOLCHAIN === "local") {
    return null;
  }
  for (let d = cwd; ; d = path.dirname(d)) {
    for (const f of ["go.work", "go.mod"]) {
      if (fs.existsSync(path.join(d, f))) {
        return `go reads ${path.join(d, f)}, which may name a toolchain go downloads and starts`;
      }
    }
    if (d === path.dirname(d)) {
      return null;
    }
  }
}

type Runtime = "node" | "python" | "perl" | "ruby" | "java" | "dotnet" | "lua" | "php" | "tcl";
const RUNTIME_OF_NAME: ReadonlyArray<[RegExp, Runtime]> = [
  [/^(?:node|nodejs|npm|npx|corepack|pnpm|pnpx|yarn|yarnpkg)$/, "node"],
  [/^(?:python[0-9.]*|pip[0-9.]*|pipx|pytest|uv|uvx)$/, "python"],
  [/^perl[0-9.]*$/, "perl"],
  [/^(?:ruby|gem|bundle|bundler|irb|rake)$/, "ruby"],
  [/^(?:java|javac|jar|jshell|mvn|gradle|kotlin|kotlinc|sbt|scala)$/, "java"],
  [/^dotnet$/, "dotnet"],
  [/^(?:lua[0-9.]*|luajit|luarocks)$/, "lua"],
  [/^(?:php[0-9.]*|composer)$/, "php"],
  [/^(?:tclsh[0-9.]*|wish[0-9.]*)$/, "tcl"],
];

/**
 * The runtimes the program a command word runs is started by: by its name
 * and the file it resolves to along `pathVar`, and a script's interpreter
 * (its #! line). Unknown (not found, unreadable): every runtime.
 */
export function runtimesOf(name: string, pathVar: string | null, cwd: string): Set<Runtime> | null {
  const out = new Set<Runtime>();
  const add = (base: string) => {
    for (const [re, r] of RUNTIME_OF_NAME) {
      if (re.test(base)) {
        out.add(r);
      }
    }
  };
  if (!name || BUILTINS.has(name)) {
    return out;
  }
  add(path.basename(name));
  let file: string | null = null;
  if (name.includes("/")) {
    file = path.resolve(cwd, name);
  } else {
    for (const dir of (pathVar ?? process.env.PATH ?? "").split(":")) {
      const cand = path.resolve(cwd, dir || ".", name);
      try {
        if (fs.statSync(cand).isFile()) {
          file = cand;
          break;
        }
      } catch {
        /* next */
      }
    }
  }
  if (!file) {
    return out; // runs nothing
  }
  try {
    const real = fs.realpathSync(file);
    add(path.basename(real));
    const fd = fs.openSync(real, "r");
    try {
      const buf = Buffer.alloc(256);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      const head = buf.subarray(0, n).toString("latin1");
      if (head.startsWith("#!")) {
        const words = head.slice(2).split("\n")[0].trim().split(/\s+/);
        for (const w of words) {
          add(path.basename(w));
        }
        // A shell script wrapper (`exec python3 ...`): the interpreters its text names count too.
        if (words.some((w) => /^(?:sh|bash|dash|zsh|ksh|mksh)$/.test(path.basename(w)))) {
          const text = fs.readFileSync(real).subarray(0, 65536).toString("latin1");
          for (const m of text.matchAll(/[A-Za-z0-9_.+-]+/g)) {
            add(m[0]);
          }
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  return out;
}

/**
 * Why the command word `name` does not run a verified program (see the
 * header), or null when it does (or runs no file: a builtin, nothing found).
 */
export function unverifiedProgramOf(
  name: string,
  o: ProgramCheck,
  cwd: string = o.projectDir,
): string | null {
  if (!name || BUILTINS.has(name)) {
    return null;
  }
  if (name.includes("/")) {
    return null; // a path, not a name: never on the allowlist (./shell-readonly.ts)
  }
  if (process.platform === "win32") {
    return null; // PATHEXT and the current directory first: not decided here
  }
  const pathVar = o.pathVar ?? process.env.PATH ?? "";
  const project = fs.existsSync(o.projectDir)
    ? fs.realpathSync(o.projectDir)
    : path.resolve(o.projectDir);
  const writable = [project, ...tempRoots(), ...(o.scratch ?? []).map((d) => path.resolve(d))];
  const agentWritable = (p: string) => writable.some((w) => isInside(w, p));
  for (const dir of pathVar.split(":")) {
    if (dir === "" || !path.isAbsolute(dir)) {
      // The working directory (empty entry, ".", a relative one): the agent writes there.
      const cand = path.resolve(cwd, dir || ".", name);
      if (fs.existsSync(cand)) {
        return `PATH entry ${JSON.stringify(dir)} is relative (the working directory), and ${name} there is a file the agent can write`;
      }
      continue;
    }
    const cand = path.join(dir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(cand);
    } catch {
      continue; // not in this directory
    }
    if (!st.isFile() || (st.mode & 0o111) === 0) {
      continue; // the shell skips what it cannot execute
    }
    let real: string;
    let realDir: string;
    try {
      real = fs.realpathSync(cand);
      realDir = fs.realpathSync(dir);
    } catch {
      return `${name} on PATH (${dir}) could not be resolved`;
    }
    if (agentWritable(realDir) || agentWritable(path.resolve(dir))) {
      return `${name} is found first in ${dir}, a directory the agent can write`;
    }
    if (agentWritable(real)) {
      return `${name} on PATH (${dir}) resolves to ${real}, a file the agent can write`;
    }
    if (!ownerOnly(real) || !ownerOnly(path.dirname(real)) || !ownerOnly(realDir)) {
      return `${name} on PATH (${dir}) resolves to ${real}, which someone other than the system or this user can change`;
    }
    const proxy = toolchainProxy(real) ?? toolchainProxy(cand);
    if (proxy) {
      return `${name} on PATH (${dir}) is ${proxy}, which chooses the program it starts from the project's files`;
    }
    if (path.basename(real) === "go" || name === "go") {
      return goSelects(cwd, o.environment);
    }
    return null;
  }
  return null; // found nowhere: runs nothing
}

/** The first program a line's simple commands run that is not verified, as a reason, or null. */
export function unverifiedProgramIn(
  commands: readonly SimpleCommand[],
  o: ProgramCheck,
): string | null {
  for (const c of commands) {
    // NAME=VALUE PATH=... before the command changes where it is found.
    const pathAssign = c.assigns.find((a) => a.name === "PATH");
    const check = pathAssign ? { ...o, pathVar: pathAssign.value } : o;
    for (const w of programWords(c.argv)) {
      const why =
        c.cwds.map((d) => unverifiedProgramOf(w, check, d)).find((x) => x !== null) ?? null;
      if (why) {
        return why;
      }
    }
  }
  return null;
}
