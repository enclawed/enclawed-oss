// enclawed adapter kit: privilege escalation in a shell line.
//
// The agent never runs a command as another user. sudo, su, doas, pkexec,
// run0, sudoedit, sg, newgrp, `machinectl shell|login` start a program with
// another user's (usually root's) authority; passwd, chsh, chfn and gpasswd
// are the set-user-ID helpers that change accounts. The agent cannot type a
// password, and on a host with NOPASSWD rules or cached credentials the
// command would run as root with no prompt at all: such a line is denied,
// whatever it runs, and the person runs it in their own terminal.
//
// The program is found where the shell would start it: the command word of
// each simple command (./shell-segments.ts, quote aware, substitutions and
// here-documents included), after leading assignments and after the wrappers
// that run the command following their own options (env, nohup, exec,
// command, time, nice, ionice, stdbuf, setsid, timeout, xargs, chronic,
// chrt, taskset, flock, unbuffer, watch, strace, ltrace), in a `find -exec`,
// `-execdir`, `-ok`, `-okdir`, and in the text a shell runs with -c. A path
// (/usr/bin/sudo) is its base name. An alias of the host's shell is read as
// its text. A word that is only an argument (`grep sudo log`) is not a match.

import path from "node:path";
import type { ResolvedDefinitions } from "./shell-definitions.js";
import { segments } from "./shell-segments.js";

/** Programs that run something with another user's or group's authority, or change accounts. */
export const PRIVILEGE_PROGRAMS: ReadonlySet<string> = new Set([
  "sudo",
  "sudoedit",
  "su",
  "doas",
  "pkexec",
  "run0",
  "sg",
  "newgrp",
  "passwd",
  "chsh",
  "chfn",
  "gpasswd",
  "ksu",
  "calife",
  "super",
]);

// Wrappers that run the command after their own options: option words that
// take a separate value, per wrapper (an unknown option is skipped alone).
const WRAPPER_VALUE_OPTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  env: new Set(["-u", "--unset", "-C", "--chdir", "-S", "--split-string"]),
  nohup: new Set(),
  exec: new Set(["-a"]),
  command: new Set(),
  builtin: new Set(),
  time: new Set(["-f", "--format", "-o", "--output"]),
  nice: new Set(["-n", "--adjustment"]),
  ionice: new Set(["-c", "--class", "-n", "--classdata", "-p", "--pid"]),
  stdbuf: new Set(["-i", "-o", "-e", "--input", "--output", "--error"]),
  setsid: new Set(),
  chronic: new Set(),
  unbuffer: new Set(),
  xargs: new Set([
    "-I",
    "-n",
    "--max-args",
    "-L",
    "--max-lines",
    "-P",
    "--max-procs",
    "-d",
    "--delimiter",
    "-s",
    "--max-chars",
    "-E",
    "--eof",
    "-a",
    "--arg-file",
  ]),
  timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
  chrt: new Set(),
  taskset: new Set(),
  flock: new Set(["-w", "--timeout", "-E", "--conflict-exit-code", "-c", "--command"]),
  watch: new Set(["-n", "--interval", "-d", "--differences"]),
  strace: new Set(["-e", "-o", "-p", "-s", "-u", "-E", "-a", "-b", "-I", "-O", "-S", "-X", "-P"]),
  ltrace: new Set(["-e", "-o", "-p", "-s", "-u", "-a", "-n"]),
  "systemd-run": new Set([
    "-p",
    "--property",
    "--uid",
    "--gid",
    "-u",
    "--unit",
    "-E",
    "--setenv",
    "-M",
    "--machine",
    "--description",
    "--slice",
    "-H",
    "--host",
    "--working-directory",
  ]),
};
// Wrappers whose first operand(s) are not the command: timeout DURATION,
// chrt PRIORITY, taskset MASK, flock FILE (or FD), nice none.
const WRAPPER_OPERANDS: Readonly<Record<string, number>> = {
  timeout: 1,
  chrt: 1,
  taskset: 1,
  flock: 1,
};
const SHELLS = new Set(["sh", "bash", "dash", "zsh", "ksh", "ash", "mksh", "busybox"]);
const FIND_EXEC = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
const MAX_DEPTH = 6;

export type PrivilegeHit = Readonly<{ program: string }>;

/** The program a word list starts with another user's authority, or null. */
function wordsEscalate(
  words: readonly string[],
  defs: ResolvedDefinitions | null,
  depth: number,
): PrivilegeHit | null {
  if (depth > MAX_DEPTH) {
    return null;
  }
  let w = [...words];
  for (let guard = 0; guard < 16 && w.length; guard++) {
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) {
      w = w.slice(1);
    }
    if (!w.length) {
      return null;
    }
    const word = w[0];
    // An alias of the host's shell: its text stands in front of the rest.
    if (defs?.known && guard === 0 && defs.aliases.has(word)) {
      const text = defs.aliases.get(word) ?? "";
      const inner = escalationIn(`${text} ${w.slice(1).join(" ")}`, defs, depth + 1);
      if (inner) {
        return inner;
      }
    }
    const base = path.basename(word);
    if (PRIVILEGE_PROGRAMS.has(base)) {
      return { program: base };
    }
    if (base === "machinectl" && w.slice(1).some((a) => a === "shell" || a === "login")) {
      return { program: "machinectl" };
    }
    if (base === "find") {
      for (let i = 1; i < w.length; i++) {
        if (FIND_EXEC.has(w[i])) {
          const hit = wordsEscalate(w.slice(i + 1), defs, depth + 1);
          if (hit) {
            return hit;
          }
        }
      }
      return null;
    }
    if (SHELLS.has(base)) {
      // sh -c TEXT (any cluster holding c): TEXT is a line of its own.
      const rest = base === "busybox" ? w.slice(2) : w.slice(1);
      for (let i = 0; i < rest.length; i++) {
        if (/^-[A-Za-z]*c[A-Za-z]*$/.test(rest[i]) && rest[i + 1] !== undefined) {
          return escalationIn(rest[i + 1], defs, depth + 1);
        }
        if (!rest[i].startsWith("-")) {
          break;
        }
      }
      if (base === "busybox" && w[1]) {
        return wordsEscalate(w.slice(1), defs, depth + 1);
      }
      return null;
    }
    if (base === "env" && w.slice(1).some((a) => /^-[A-Za-z]*S|^--split-string/.test(a))) {
      // env -S TEXT splits TEXT into the command's words.
      const i = w.findIndex((a, k) => k > 0 && /^-[A-Za-z]*S|^--split-string/.test(a));
      const text = w[i].includes("=") ? w[i].slice(w[i].indexOf("=") + 1) : (w[i + 1] ?? "");
      const hit = escalationIn(text, defs, depth + 1);
      if (hit) {
        return hit;
      }
    }
    // Programs that run a command line given as one word through a shell:
    // flock -c TEXT, script -c TEXT, watch WORDS (joined), su -c is su itself.
    if (base === "flock" || base === "script") {
      const i = w.findIndex((a, k) => k > 0 && (/^-[A-Za-z]*c$/.test(a) || a === "--command"));
      if (i > 0 && w[i + 1] !== undefined) {
        const hit = escalationIn(w[i + 1], defs, depth + 1);
        if (hit) {
          return hit;
        }
      }
      if (base === "script") {
        return null;
      }
    }
    if (base === "watch") {
      const rest = w.slice(1);
      let k = 0;
      while (k < rest.length && rest[k].startsWith("-")) {
        k += WRAPPER_VALUE_OPTIONS.watch.has(rest[k]) ? 2 : 1;
      }
      return escalationIn(rest.slice(k).join(" "), defs, depth + 1);
    }
    // `command -v NAME` / `-V` only reports what NAME is.
    if (base === "command" && w.slice(1).some((a) => /^-[A-Za-z]*[vV]/.test(a))) {
      return null;
    }
    // systemd-run asks the system manager (polkit, or root) unless --user: a unit run as root by default.
    if (
      base === "systemd-run" &&
      (!w.includes("--user") || w.some((a) => /^--uid(?:=|$)|^-pUser=|^--property=User=/.test(a)))
    ) {
      return { program: "systemd-run" };
    }
    const values = WRAPPER_VALUE_OPTIONS[base];
    if (!values) {
      return null;
    }
    w = w.slice(1);
    while (w.length && w[0].startsWith("-") && w[0] !== "-") {
      const opt = w[0];
      w = w.slice(values.has(opt) ? 2 : 1);
      if (opt === "--") {
        break;
      }
    }
    // env NAME=VALUE ... CMD, after its options.
    w = w.slice(WRAPPER_OPERANDS[base] ?? 0);
  }
  return null;
}

/**
 * The first program of a shell line that runs with another user's
 * authority (sudo, su, doas, pkexec, ...), or null.
 */
export function escalationIn(
  command: string,
  defs: ResolvedDefinitions | null = null,
  depth = 0,
): PrivilegeHit | null {
  if (typeof command !== "string" || depth > MAX_DEPTH) {
    return null;
  }
  for (const seg of segments(command)) {
    const hit = wordsEscalate(seg.words, defs, depth);
    if (hit) {
      return hit;
    }
  }
  return null;
}
