// enclawed adapter kit: per-call conformance to verified skills.
//
// Skill admission (./skills.ts) proves, before a session starts, that a
// skill's implementation produces exactly the effects its specification
// declares (the biconditional) and pins every file of it by digest. This
// module carries that proof to each call: a call MADE UNDER an admitted skill
// is decided against that skill's verified capabilities, by rule, with no
// person:
//
//   conforming      allowed, and run contained with exactly the skill's
//                   capabilities (./contained-launch.ts: a private copy of the
//                   skill whose digest is re-checked, the project read-only or
//                   read-write by its fs capabilities, programs by spawn.proc,
//                   the network only to its declared net.egress targets,
//                   through the relay with each target's request shape);
//                   irreversible capabilities are audited as
//                   executed-under-skill;
//   non-conforming  denied by rule (skill-nonconformant), never asked.
//
// A call that is not attributable to a verified skill keeps every ordinary
// rule (irreversible: ask; no person: denied).
//
// ATTRIBUTION (fail closed; each condition is necessary):
//
//   1. The call is a POSIX shell command, and one of its simple commands
//      (after wrappers such as env, nohup, timeout) EXECUTES a file: its
//      program word contains a slash, or its program is an interpreter
//      (sh, bash, python3, node, `.`, source, ...) and the file is the first
//      operand after it. A file that is only read (cat, grep) is not executed.
//   2. The file's real path (symbolic links resolved) is inside the real
//      directory of a skill in this session's verified set.
//   3. That skill's admission facts are present (content digest, per-file
//      digests, capabilities), the file's sha256 NOW equals the digest pinned
//      at admission, and the whole directory's content digest NOW equals the
//      admitted one. A changed file is not the skill: the call is NOT
//      attributed and keeps the ordinary rules (the session's skill watcher
//      stops the session on the change).
//
// CONFORMANCE (an attributed call that fails any of these is denied):
//
//   a. the whole command is that one simple command (no list, pipe,
//      redirection, substitution, expansion, assignment or wrapper), parsed
//      by the strict parser of ./shell-readonly.ts, with no unquoted glob;
//   b. the file is one the admission's effect analysis covers (.py, .sh,
//      .bash, .js, .mjs, .cjs, outside dot-directories and node_modules), and
//      it runs under that language's interpreter: named as a bare program
//      word with no interpreter option, or the file run directly with a
//      shebang naming that interpreter;
//   c. every URL in the arguments is inside one of the skill's declared
//      net.egress targets (scheme, host, port and, for a shaped target, the
//      request grammar), and the skill declares net.egress;
//   d. every path in the arguments, and the working directory, is inside
//      the skill's directory or (when the skill declares an fs capability)
//      the project.
//
// What the attribution does not rest on: a skill's scripts cannot widen what
// they may do by what they print or by what the analysis missed; the
// containment holds them to the declared capabilities whatever they run.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseEgressTarget, urlWithinEgressTarget, type EgressTarget } from "../egress-target.js";
import { CAPABILITY } from "../skill-capabilities.js";
import { segments } from "./exec-provenance.js";
import { expandHome, isInside } from "./fs-probe.js";
import type { Ctx } from "./rule-kit.js";
import { splitSimpleCommand } from "./shell-readonly.js";
import { contentDigest } from "./skill-digest.js";
import type { SkillRun, SkillSet } from "./skill-types.js";

export type { SkillRun } from "./skill-types.js";

export type SkillAttribution =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "conformant"; run: SkillRun }>
  | Readonly<{ kind: "nonconformant"; skill: string; why: string }>;

const NONE: SkillAttribution = { kind: "none" };

/** The interpreters each analyzed script language runs under. */
const LANGUAGE: Readonly<Record<string, readonly string[]>> = {
  ".py": ["python3", "python"],
  ".sh": ["sh", "bash", "dash"],
  ".bash": ["bash"],
  ".js": ["node"],
  ".mjs": ["node"],
  ".cjs": ["node"],
};

/** Program words that execute their first operand (interpreters and the shell's own `.`/source). */
const EXECUTORS: ReadonlySet<string> = new Set([
  "sh",
  "bash",
  "dash",
  "zsh",
  "ksh",
  "ash",
  "python",
  "python2",
  "python3",
  "node",
  "deno",
  "bun",
  "perl",
  "ruby",
  "php",
  "source",
  ".",
]);

const WRAPPERS: Readonly<Record<string, number>> = {
  sudo: 0,
  doas: 0,
  env: 0,
  nohup: 0,
  exec: 0,
  command: 0,
  builtin: 0,
  time: 0,
  nice: 0,
  ionice: 0,
  stdbuf: 0,
  setsid: 0,
  xargs: 0,
  timeout: 1,
  chronic: 0,
};

/** The words a simple command runs with, after assignments and wrappers (full words, paths kept). */
function unwrap(words: readonly string[]): string[] {
  let w = [...words];
  for (let guard = 0; guard < 8 && w.length; guard++) {
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) {
      w = w.slice(1);
    }
    const base = path.basename(w[0] ?? "");
    if (!w.length || !Object.hasOwn(WRAPPERS, base)) {
      return w;
    }
    w = w.slice(1);
    while (w.length && w[0].startsWith("-")) {
      w = w.slice(1);
    }
    w = w.slice(WRAPPERS[base]);
  }
  return w;
}

/** The file a simple command executes (its word as written), or null. */
function executedWord(words: readonly string[]): string | null {
  const w = unwrap(words);
  if (!w.length) {
    return null;
  }
  if (w[0].includes("/")) {
    return w[0];
  }
  if (!EXECUTORS.has(w[0])) {
    return null;
  }
  return w.slice(1).find((x) => !x.startsWith("-")) ?? null;
}

type Verified = SkillSet["verified"][number];

/** The sha256 of a regular file (no symbolic link followed), as the admission pins it per file. */
function sha256File(p: string): string | null {
  try {
    if (!fs.lstatSync(p).isFile()) {
      return null;
    }
    return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
}

const relOf = (dir: string, file: string) => path.relative(dir, file).split(path.sep).join("/");

/** Is the file one the admission's effect analysis reads (by extension, outside skipped directories)? */
function analyzedScript(rel: string): string | null {
  const parts = rel.split("/");
  if (parts.slice(0, -1).some((p) => p.startsWith(".") || p === "node_modules")) {
    return null;
  }
  const ext = path.extname(rel).toLowerCase();
  return Object.hasOwn(LANGUAGE, ext) ? ext : null;
}

/** The interpreter a shebang line names (basename; `env X` read as X), or null. */
function shebangInterpreter(file: string): string | null {
  let head: string;
  try {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(256);
      const n = fs.readSync(fd, buf, 0, 256, 0);
      head = buf.subarray(0, n).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  const m = /^#!\s*(\S+)(?:[ \t]+(\S+))?[ \t]*\r?\n/.exec(head);
  if (!m) {
    return null;
  }
  const prog = path.basename(m[1]);
  if (prog === "env") {
    return m[2] && !m[2].startsWith("-") ? m[2] : null;
  }
  return m[2] ? null : prog; // an interpreter option on the shebang line: not plain
}

const URL_IN = /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s'"]*/g;
const GLOB_CHARS = new Set(["*", "?", "[", "~"]);

/** A glob or tilde character outside quotes (the strict parser keeps them; the shell would expand them). */
function unquotedGlob(command: string): string | null {
  let quote: string | null = null;
  for (const c of command) {
    if (quote) {
      if (c === quote) {
        quote = null;
      }
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (GLOB_CHARS.has(c)) {
      return c;
    }
  }
  return null;
}

/**
 * Attribute a shell call to a verified skill and decide its conformance.
 * `none`: not a call made under a verified skill (the ordinary rules apply).
 */
export function attributeSkillCall(
  ctx: Pick<Ctx, "cwd" | "home" | "fs"> & { projectDir: string },
  skills: SkillSet,
  command: string,
  dialect: "posix" | "powershell",
): SkillAttribution {
  if (dialect !== "posix" || !skills.verified.length || typeof command !== "string") {
    return NONE;
  }
  const real = (w: string) =>
    ctx.fs.realpathNearest(path.resolve(ctx.cwd, expandHome(w, ctx.home)));
  // 1-2. A simple command that executes a file inside a verified skill.
  let hit: { skill: Verified; fileReal: string } | null = null;
  for (const seg of segments(command)) {
    const word = executedWord(seg.words);
    if (!word) {
      continue;
    }
    const fileReal = real(word);
    const owners = skills.verified.filter((s) => isInside(s.dir, fileReal) && fileReal !== s.dir);
    if (owners.length) {
      // Nested skills: the innermost directory owns the file.
      const skill = owners.toSorted((a, b) => b.dir.length - a.dir.length)[0];
      hit = { skill, fileReal };
      break;
    }
  }
  if (!hit) {
    return NONE;
  }
  // 3. The admission facts, and the file and directory as admitted.
  const s = hit.skill;
  if (!s.contentDigest || !s.files || !s.caps) {
    return NONE;
  }
  const rel = relOf(s.dir, hit.fileReal);
  const pinned = s.files[rel];
  if (!pinned || sha256File(hit.fileReal) !== pinned) {
    return NONE;
  }
  let now: ReturnType<typeof contentDigest>;
  try {
    now = contentDigest(s.dir);
  } catch {
    return NONE;
  }
  if (now.problems.length || now.digest !== s.contentDigest) {
    return NONE;
  }
  const bad = (why: string): SkillAttribution => ({ kind: "nonconformant", skill: s.name, why });

  // a. Exactly one simple command, nothing the shell would expand.
  const split = splitSimpleCommand(command);
  if (!split.ok) {
    return bad(
      `the command does more than run the skill's file (${split.code}${split.detail ? `: ${split.detail}` : ""}); run the skill's file alone, as one command`,
    );
  }
  const glob = unquotedGlob(command);
  if (glob) {
    return bad(`an unquoted ${JSON.stringify(glob)} would be expanded by the shell; quote it`);
  }
  const argv = split.argv;
  // b. The file is analyzed, and runs under its language's interpreter.
  const ext = analyzedScript(rel);
  if (!ext) {
    return bad(
      `${rel} is not a script the skill's verification analyzed (only .py, .sh, .bash, .js, .mjs and .cjs files outside dot-directories and node_modules are)`,
    );
  }
  const allowed = LANGUAGE[ext];
  let interpreter: string;
  let args: string[];
  if (argv[0].includes("/") && real(argv[0]) === hit.fileReal) {
    const sb = shebangInterpreter(hit.fileReal);
    if (!sb || !allowed.includes(sb)) {
      return bad(
        `${rel} is run directly, and its first line does not name ${allowed.join(" or ")} plainly`,
      );
    }
    interpreter = sb;
    args = argv.slice(1);
  } else if (
    !argv[0].includes("/") &&
    allowed.includes(argv[0]) &&
    argv.length > 1 &&
    real(argv[1]) === hit.fileReal
  ) {
    interpreter = argv[0];
    args = argv.slice(2);
  } else {
    return bad(
      `${rel} must be run as \`${allowed[0]} <file> [arguments]\` or directly by its path, with no interpreter option or wrapper`,
    );
  }
  // c. URLs within the declared egress targets.
  let targets: EgressTarget[];
  try {
    targets = (s.egress ?? []).map((t) => parseEgressTarget(t));
  } catch {
    return bad("its declared egress targets do not parse");
  }
  const hasNet = s.caps.includes(CAPABILITY.NET_EGRESS);
  const fsCaps = s.caps.some(
    (c) =>
      c === CAPABILITY.FS_READ || c === CAPABILITY.FS_WRITE_REV || c === CAPABILITY.FS_WRITE_IRREV,
  );
  const projectReal = ctx.fs.realpathNearest(ctx.projectDir);
  for (const a of args) {
    if (a.includes("\u0000") || a.includes("\r") || a.includes("\n")) {
      return bad("an argument holds a control character");
    }
    const urls = a.match(URL_IN) ?? [];
    for (const u of urls) {
      if (!hasNet || !targets.some((t) => urlWithinEgressTarget(u, t))) {
        return bad(
          `the argument names ${JSON.stringify(u.slice(0, 200))}, which is not within the skill's declared egress targets (${s.egress?.join(", ") || "none"})`,
        );
      }
    }
    // d. Paths within the skill or (with an fs capability) the project.
    const rest = a.replace(URL_IN, "");
    const value = rest.startsWith("-")
      ? rest.includes("=")
        ? rest.slice(rest.indexOf("=") + 1)
        : ""
      : rest;
    if (value && (value.includes("/") || value.startsWith("."))) {
      const p = real(value);
      const inSkill = isInside(s.dir, p);
      const inProject = isInside(projectReal, p);
      if (!inSkill && !(fsCaps && inProject)) {
        return bad(
          `the argument names ${JSON.stringify(value.slice(0, 200))}, outside ${fsCaps ? "the project and " : ""}the skill's own directory${fsCaps ? "" : " (the skill declares no fs capability)"}`,
        );
      }
    }
  }
  const cwdReal = ctx.fs.realpathNearest(ctx.cwd);
  if (!isInside(s.dir, cwdReal) && !(fsCaps && isInside(projectReal, cwdReal))) {
    return bad(
      `the command runs in ${cwdReal}, outside ${fsCaps ? "the project and " : ""}the skill's own directory`,
    );
  }
  return {
    kind: "conformant",
    run: {
      name: s.name,
      dir: s.dir,
      contentDigest: s.contentDigest,
      caps: [...s.caps],
      egress: [...(s.egress ?? [])],
      file: rel,
      interpreter,
      args,
    },
  };
}
