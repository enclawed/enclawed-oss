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
  if (["xargs", "nice", "nohup", "time", "timeout", "stdbuf", "ionice"].includes(base)) {
    out.push(...argv.slice(1).filter((w) => !w.startsWith("-")));
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
