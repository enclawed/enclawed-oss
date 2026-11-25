// enclawed adapter kit: which programs a repository's git configuration can
// start, and which read-only git commands actually start them.
//
// A read-only git command (the allowlist in ./shell-readonly.ts) can still
// run a program the repository names: an untrusted checkout ships its own
// .git/config and .git/hooks. Which command runs which program was measured
// against git v2.53.0 (the system git the kit's checks use), with each
// mechanism planted in a fresh repository holding a committed change and a
// working-tree change, and every read-only subcommand run with stdout not a
// terminal:
//
//   core.fsmonitor (a program)   status, diff (also --cached), blame, grep (also
//                                --cached), ls-files (every mode), check-ignore,
//                                describe --dirty
//   filter.<d>.clean|smudge|process
//                                status, diff, blame, ls-files -m, describe --dirty
//   diff.<d>.textconv            diff, show (a commit's patch; not a blob or
//                                tree named REV:path without --textconv), log -p, blame;
//                                status -v/--verbose (its diff of staged
//                                changes); log, show, whatchanged with a
//                                pickaxe search (-S, -G), patch or not;
//                                not with --no-textconv, not for --stat/--name-*
//                                output, not log/show without a patch or pickaxe
//   diff.external, diff.<d>.command
//                                diff (not with --no-ext-diff)
//   hooks: post-index-change     status, describe --dirty (git writes the
//   (core.hooksPath or .git/hooks) refreshed index; no other hook runs for
//                                a read-only command)
//   core.pager, pager.<cmd>      only when stdout is a terminal; a host may give
//                                its shell one, so every command but those with
//                                --no-pager counts
//   gpg.program and log.showSignature
//                                log, show, whatchanged (a signed commit)
//   include.path, includeIf.*.path
//                                anything: the included file is not read here,
//                                so every command counts
//
// Everything else in the old list (core.editor, core.sshCommand, askPass,
// credential helpers, merge drivers, ...) is started only by commands that
// are not read-only (commit, fetch, merge, ...), which the allowlist already
// refuses. Where a measurement left room (diff --cached with a clean filter,
// ls-files without -m), the rule takes the wider set.

import fs from "node:fs";
import path from "node:path";

export type GitProgramKind =
  | "fsmonitor"
  | "filter"
  | "textconv"
  | "diff-command"
  | "hook"
  | "pager"
  | "gpg"
  | "include";

export type GitProgram = Readonly<{ kind: GitProgramKind; line: string }>;

const BOOLEAN = /^(true|false|yes|no|on|off|1|0)?$/i;

function gitDirOf(dir: string): string | null {
  const dotgit = path.join(dir, ".git");
  let st: fs.Stats;
  try {
    st = fs.statSync(dotgit);
  } catch {
    if (
      fs.existsSync(path.join(dir, "HEAD")) &&
      fs.existsSync(path.join(dir, "config")) &&
      fs.existsSync(path.join(dir, "objects"))
    ) {
      return dir;
    }
    return null;
  }
  if (st.isDirectory()) {
    return dotgit;
  }
  try {
    const m = /^gitdir:\s*(.+)\s*$/m.exec(fs.readFileSync(dotgit, "utf8"));
    return m ? path.resolve(dir, m[1].trim()) : null;
  } catch {
    return null;
  }
}

/** One config line's kind of program (section and key already lowercased), or null. */
function kindOf(
  section: string,
  sub: string | null,
  key: string,
  value: string,
): GitProgramKind | null {
  if (section === "include" || section === "includeif") {
    return key === "path" ? "include" : null;
  }
  if (section === "core") {
    if (key === "fsmonitor") {
      // true starts git's own daemon; a path or command is a program.
      return BOOLEAN.test(value) ? null : "fsmonitor";
    }
    if (key === "hookspath") {
      return "hook";
    }
    if (key === "pager") {
      return "pager";
    }
    return null;
  }
  if (section === "pager") {
    return BOOLEAN.test(value) ? null : "pager";
  }
  if (section === "filter" && sub !== null) {
    return ["clean", "smudge", "process"].includes(key) ? "filter" : null;
  }
  if (section === "diff") {
    if (sub === null) {
      return key === "external" ? "diff-command" : null;
    }
    if (key === "textconv") {
      return "textconv";
    }
    return key === "command" ? "diff-command" : null;
  }
  if (section === "gpg") {
    return key === "program" || key === "defaultkeycommand" ? "gpg" : null;
  }
  if (section === "log" && key === "showsignature") {
    return BOOLEAN.test(value) && !/^(true|yes|on|1)$/i.test(value) ? null : "gpg";
  }
  return null;
}

/**
 * The programs the repository holding `cwd` can make git start: its config
 * files (with sections) and a post-index-change hook in its hooks directory.
 * null: the configuration could not be read (callers treat that as a risk).
 */
export function gitProgramsOf(cwd: string): GitProgram[] | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const gitDir = gitDirOf(dir);
    if (gitDir) {
      return programsIn(gitDir);
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return [];
    }
    dir = parent;
  }
}

function programsIn(gitDir: string): GitProgram[] | null {
  const files = [path.join(gitDir, "config"), path.join(gitDir, "config.worktree")];
  try {
    const common = fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
    files.push(path.join(path.resolve(gitDir, common), "config"));
  } catch {
    /* not a linked worktree */
  }
  const out: GitProgram[] = [];
  let hooksPath: string | null = null;
  for (const f of files) {
    let text: string;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      return null;
    }
    let section = "";
    let sub: string | null = null;
    for (const raw of text.split(/\r?\n/)) {
      // A continued line: its meaning depends on the next one; read as a risk.
      if (/\\\s*$/.test(raw.replace(/\s[#;].*$/, ""))) {
        out.push({ kind: "include", line: `${f}: ${raw.trim()}` });
        continue;
      }
      let l = raw.trim();
      if (l === "" || l.startsWith("#") || l.startsWith(";")) {
        continue;
      }
      const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\](.*)$/.exec(l);
      if (head) {
        const name = head[1].toLowerCase();
        const dot = name.indexOf(".");
        section = dot < 0 ? name : name.slice(0, dot);
        sub = head[2] !== undefined ? head[2] : dot < 0 ? null : name.slice(dot + 1);
        l = head[3].trim();
        if (l === "" || l.startsWith("#") || l.startsWith(";")) {
          continue;
        }
      }
      const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/.exec(l);
      if (!kv) {
        // Not a line git would read as a key: refuse to guess.
        out.push({ kind: "include", line: `${f}: ${l}` });
        continue;
      }
      const key = kv[1].toLowerCase();
      const value = (kv[2] ?? "")
        .replace(/\s[#;].*$/, "")
        .replace(/^"(.*)"$/, "$1")
        .trim();
      const kind = kindOf(section, sub, key, value);
      if (kind) {
        out.push({ kind, line: `${f}: ${l}` });
      }
      if (section === "core" && key === "hookspath") {
        hooksPath = value;
      }
    }
  }
  const hooksDir = hooksPath
    ? path.resolve(path.dirname(gitDir), hooksPath)
    : path.join(gitDir, "hooks");
  const hook = path.join(hooksDir, "post-index-change");
  try {
    if (fs.statSync(hook).isFile()) {
      out.push({ kind: "hook", line: `${hook} (a hook git runs when it writes the index)` });
    }
  } catch {
    /* no such hook */
  }
  return out;
}

const PATCH_FLAG =
  /^(-p|-u|--patch|--patch-with-stat|--patch-with-raw|--cc|-c|-W|--function-context|--word-diff(=.*)?|--color-words(=.*)?|-U\d*|--unified(=.*)?|--textconv)$/;
const NO_PATCH = /^(-s|--no-patch)$/;
const STAT_LIKE =
  /^(--stat(=.*)?|--numstat|--shortstat|--name-only|--name-status|--raw|--summary|--dirstat(=.*)?|--compact-summary)$/;

/** Does this read-only git command produce a patch (where diff drivers and textconv run)? */
function makesPatch(sub: string, args: readonly string[]): boolean {
  const opts = args.slice(0, args.includes("--") ? args.indexOf("--") : args.length);
  if (opts.some((a) => NO_PATCH.test(a))) {
    return false;
  }
  const wants = opts.some((a) => PATCH_FLAG.test(a));
  if (sub === "diff" || sub === "show") {
    return wants || !opts.some((a) => STAT_LIKE.test(a));
  }
  return wants;
}

// Options of git show that take no separate value (a separate value could be
// read as the revision: -L 1,2:file shows a commit's patch).
const SHOW_BLOB_FLAG =
  /^(?:-p|-u|--patch|-s|--no-patch|-W|--function-context|--no-color|--color(?:=.*)?|--no-textconv|--no-ext-diff|--word-diff(?:=.*)?|--color-words(?:=.*)?|-U\d+|--unified=\d+|--stat(?:=.*)?|--name-only|--name-status|--raw|--no-renames|--abbrev(?:=\d+)?|--format=.*|--pretty(?:=.*)?|--oneline|--no-pager)$/;

/**
 * git show whose every argument before `--` is a blob or tree by name
 * (REV:path, :path) with no --textconv: it prints the object as stored and
 * runs no textconv (measured, git v2.53: show REV:path, -p, --stat, -W,
 * --word-diff, several REV:path, :path and REV: ran none; --textconv did).
 */
function showsObjectsOnly(args: readonly string[]): boolean {
  const before = optionsOf(args);
  const named = before.filter((a) => !a.startsWith("-"));
  return (
    named.length > 0 &&
    named.every((a) => a.includes(":")) &&
    before.every((a) => !a.startsWith("-") || SHOW_BLOB_FLAG.test(a)) &&
    before.length === args.length
  );
}

/** The options of a command, before any `--`. */
function optionsOf(args: readonly string[]): readonly string[] {
  return args.slice(0, args.includes("--") ? args.indexOf("--") : args.length);
}

/**
 * A pickaxe search (-S<string>, -G<regex>, also clustered after other short
 * flags, and --pickaxe-regex): git runs textconv on every blob it searches,
 * with or without a patch in the output (measured, git v2.53).
 */
function pickaxe(args: readonly string[]): boolean {
  return optionsOf(args).some((a) => /^-[A-Za-z]*[SG]/.test(a) || a === "--pickaxe-regex");
}

/**
 * git status -v / --verbose (also clustered, -sv): the diff of staged
 * changes runs textconv. Counted whatever the output format (with --short or
 * --porcelain git v2.53 did not run it), the wider set.
 */
function statusVerbose(args: readonly string[]): boolean {
  return optionsOf(args).some((a) => a === "--verbose" || /^-[a-z]*v/.test(a));
}

/**
 * The first configured program this read-only git command would start, or
 * null. `global`: the options before the subcommand (only -C and --no-pager
 * pass the allowlist).
 */
export function gitCommandStarts(
  call: Readonly<{ sub: string; args: readonly string[]; global?: readonly string[] }>,
  programs: readonly GitProgram[],
): GitProgram | null {
  const { sub, args } = call;
  const has = (re: RegExp) => args.some((a) => re.test(a));
  const dirty = sub === "describe" && has(/^--(dirty|broken)(=.*)?$/);
  const readsIndex =
    ["status", "diff", "blame", "grep", "ls-files", "check-ignore", "clean"].includes(sub) || dirty;
  for (const p of programs) {
    switch (p.kind) {
      case "include":
        return p;
      case "fsmonitor":
        if (readsIndex) {
          return p;
        }
        break;
      case "filter":
        if (["status", "diff", "blame", "ls-files", "clean"].includes(sub) || dirty) {
          return p;
        }
        break;
      case "textconv":
        if (
          !optionsOf(args).includes("--no-textconv") &&
          (sub === "blame" ||
            (sub === "status" && statusVerbose(args)) ||
            (["diff", "show", "log", "whatchanged"].includes(sub) &&
              !(sub === "show" && showsObjectsOnly(args)) &&
              (makesPatch(sub, args) || pickaxe(args))))
        ) {
          return p;
        }
        break;
      case "diff-command":
        if (sub === "diff" && !has(/^--no-ext-diff$/)) {
          return p;
        }
        break;
      case "hook":
        if (sub === "status" || dirty) {
          return p;
        }
        break;
      case "gpg":
        if (["log", "show", "whatchanged"].includes(sub)) {
          return p;
        }
        break;
      case "pager":
        if (!(call.global ?? []).includes("--no-pager")) {
          return p;
        }
        break;
    }
  }
  return null;
}
