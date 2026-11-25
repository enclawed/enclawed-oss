// The file effects of a Bash line the recorded run ran, applied to the
// rebuilt run with fs, only where they are exact. Nothing is ever executed.
//
// A line qualifies when every simple command is one of:
//   - a file operation on literal paths inside the run: mkdir [-p], cp [-pf]
//     (files only), mv [-f], touch, rm [-f] [-r];
//   - a command whose exit status is computed here: cd, echo, true, ls
//     (the operands exist), cmp (two files compared), sha256sum / md5sum
//     (the operands exist), set (options);
//   - any other read-only command (the kit's strict allowlist): no effect, but
//     its status is unknown.
// Commands run in the shell's order: `&&`, `||`, `;` and `set -e` are followed
// while every status is known. When a file operation would come after a status
// the replay cannot know (a loop body, an unknown command), nothing of the
// line is applied. No variable is left (the line's own assignments are
// bound), no substitution but `$(date +FMT)` with date fields only (the run's
// day, runDay), no redirection to a file, no pipe.

import fs from "node:fs";
import path from "node:path";
import { expandGlob } from "../../../src/enclawed/adapter/contained-exec.ts";
import { parseCompound } from "../../../src/enclawed/adapter/shell-compound.ts";
import { classifyArgv } from "../../../src/enclawed/adapter/shell-readonly.ts";

/** The harness's run limit: no run lasts longer (codenclawed-bench run.mjs). */
const RUN_LIMIT_S = 420;
/** Time between the end of a run and its record (post-run checks), at most. */
const RECORD_SLACK_S = 180;

/** YYYY-MM-DD of an instant in a time zone. */
export function localDay(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The day `date` printed during a run: the record's time (`ts`, written after
 * the run) and the earliest the run can have started (its duration or the run
 * limit, plus the slack before the record) fall on the same day in the time
 * zone the sandbox used (TZ, else the host's zone). Null when they do not, or
 * the record has no time.
 */
export function runDay(
  r,
  timeZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const end = Date.parse(String(r?.ts ?? ""));
  if (!Number.isFinite(end)) {
    return null;
  }
  const dur = Number.isFinite(r?.durationS) ? Math.max(r.durationS, 0) : RUN_LIMIT_S;
  const start = end - (Math.min(dur, RUN_LIMIT_S) + RECORD_SLACK_S) * 1000;
  const a = localDay(start, timeZone);
  const b = localDay(end, timeZone);
  return a === b ? a : null;
}

/** `date +FMT` on `day` (YYYY-MM-DD), for date fields only; null for any other field. */
export function formatDay(fmt, day) {
  const [Y, m, d] = day.split("-");
  let out = "";
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch !== "%") {
      if (!/[A-Za-z0-9._:/-]/.test(ch)) {
        return null;
      }
      out += ch;
      continue;
    }
    const f = fmt[++i];
    const v = { F: day, Y, m, d, y: Y.slice(2), "%": "%" }[f];
    if (v === undefined) {
      return null; // a time field or anything else: not known here
    }
    out += v;
  }
  return out;
}

/** Words after which a line may change a file or run code (conservative). */
const REST_MAY_WRITE =
  /\b(?:mkdir|cp|mv|touch|rm|rmdir|ln|tee|install|dd|truncate|chmod|chown|sed|perl|python3?|node|npm|npx|pnpm|yarn|bun|sh|bash|dash|zsh|git|curl|wget|tar|unzip|zip|gzip|gunzip|xargs|find|awk|eval|exec|source|sqlite3)\b|(?:^|[^<0-9&])>|>>|\s\.\s/;

const FILE_OPS = {
  mkdir: /^-p$/,
  cp: /^-[pf]+$/,
  mv: /^-f$/,
  touch: /^$/,
  rm: /^-(?:f|r|rf|fr)$/,
};
const KNOWN = {
  cd: /^$/,
  echo: /^-n$/,
  true: /^$/,
  ls: /^-[la1]+$/,
  cmp: /^-s$/,
  sha256sum: /^$/,
  md5sum: /^$/,
};

/**
 * Apply the line's file effects (see the header); true when applied, null when
 * the line is not one whose effects are exact here (nothing applied).
 */
export function applyFileEffects(command, cwd, runDir, day = null) {
  let text = command;
  if (/\$\(\s*date\b|`\s*date\b/.test(text)) {
    if (!day) {
      return null;
    }
    text = text.replace(/\$\(date \+([^)\s'"]+)\)/g, (m, f) => formatDay(f, day) ?? m);
    if (/\$\(\s*date\b|`\s*date\b/.test(text)) {
      return null;
    }
  }
  // A compound (loop, if, case, group): its statuses are not followed here. The
  // line's part before the first one is applied when nothing from there on
  // can change a file (no file operation, redirection or program that runs code).
  const compound = /(?:^|[;&|\n]\s*)(?:(?:for|while|until|if|case|select|function)\s|[({]\s)/.exec(
    text,
  );
  if (compound) {
    const rest = text.slice(compound.index);
    if (REST_MAY_WRITE.test(rest)) {
      return null;
    }
    text = text.slice(0, compound.index).replace(/(?:&&|\|\||;|\s)*$/, "");
    if (!text.trim()) {
      return true;
    }
  }
  const p = parseCompound(
    text,
    { cwd, home: null, env: {}, exported: {} },
    { fileRedirects: true },
  );
  if (!p.ok) {
    return null;
  }
  const inRun = (f) => f === runDir || f.startsWith(`${runDir}${path.sep}`);
  const ops = [];
  for (const c of p.commands) {
    if (
      c.assigns.length ||
      c.writes?.length ||
      c.reads?.length ||
      (c.stdin ?? null) !== null ||
      c.filesets?.length ||
      c.next === "|" ||
      c.piped ||
      c.cwds.length !== 1 ||
      c.argv.some((a) => /[-$`]/.test(a))
    ) {
      return null;
    }
    const [prog, ...args] = c.argv;
    const flags = args.filter((a) => a.startsWith("-"));
    const words = args.filter((a) => !a.startsWith("-"));
    let kind;
    if (FILE_OPS[prog]) {
      kind = "file";
    } else if (prog === "set" && args.every((a) => /^[-+][euxo]+$|^pipefail$/.test(a))) {
      kind = "set";
    } else if (
      KNOWN[prog] &&
      flags.every((f) => KNOWN[prog].test(f)) &&
      (!c.unknownArgs || prog === "echo")
    ) {
      kind = "known";
    } else if (classifyArgv(c.argv).readOnly || prog === "echo") {
      kind = "unknown";
    } else {
      return null;
    }
    let operands = [];
    if (kind !== "unknown" && kind !== "set" && prog !== "echo") {
      if (c.unknownArgs || (kind === "file" && !flags.every((f) => FILE_OPS[prog].test(f)))) {
        return null;
      }
      try {
        operands = words.flatMap((a) => expandGlob(c.cwd, a)).map((a) => path.resolve(c.cwd, a));
      } catch {
        return null;
      }
      if (kind === "file" && !operands.every(inRun)) {
        return null;
      }
      // A pattern that matched nothing stays a word: cmp/ls of it is still exact.
    }
    ops.push({ prog, kind, flags, operands, next: c.next, args });
  }
  // A file operation after the first status the replay cannot know: not exact.
  const firstUnknown = ops.findIndex((o) => o.kind === "unknown");
  if (firstUnknown >= 0 && ops.slice(firstUnknown + 1).some((o) => o.kind === "file")) {
    return null;
  }
  let status = 0;
  let prevNext = null;
  let errexit = false;
  for (const o of ops) {
    if ((prevNext === "&&" && status !== 0) || (prevNext === "||" && status === 0)) {
      prevNext = o.next;
      continue;
    }
    const inList = prevNext === "&&" || prevNext === "||" || o.next === "&&" || o.next === "||";
    prevNext = o.next;
    if (o.kind === "unknown") {
      return true; // nothing after it changes a file (checked above)
    }
    if (o.kind === "set") {
      errexit ||= o.args.some((a) => /^-[a-z]*e/.test(a));
      status = 0;
      continue;
    }
    status = runOp(o);
    if (errexit && status !== 0 && !inList) {
      return true; // set -e: the shell exits here
    }
  }
  return true;
}

/** One operation, as the coreutils command does it; its exit status. */
function runOp({ prog, flags, operands }) {
  const has = (f) => flags.some((x) => x.includes(f));
  const exists = (f) => {
    try {
      fs.lstatSync(f);
      return true;
    } catch {
      return false;
    }
  };
  try {
    switch (prog) {
      case "echo":
      case "true":
        return 0;
      case "cd":
        return operands.length <= 1 &&
          (operands.length === 0 || (exists(operands[0]) && fs.statSync(operands[0]).isDirectory()))
          ? 0
          : 1;
      case "ls":
      case "sha256sum":
      case "md5sum":
        return operands.every(exists) ? 0 : prog === "ls" ? 2 : 1;
      case "cmp":
        if (operands.length !== 2 || !operands.every(exists)) {
          return 2;
        }
        return fs.readFileSync(operands[0]).equals(fs.readFileSync(operands[1])) ? 0 : 1;
      case "mkdir":
        for (const d of operands) {
          fs.mkdirSync(d, { recursive: has("p") });
        }
        return 0;
      case "touch":
        for (const f of operands) {
          if (!exists(f)) {
            fs.writeFileSync(f, "");
          }
        }
        return 0;
      case "rm": {
        let st = 0;
        for (const f of operands) {
          if (!exists(f)) {
            st = has("f") ? st : 1;
            continue;
          }
          if (fs.lstatSync(f).isDirectory() && !has("r")) {
            st = 1;
            continue;
          }
          fs.rmSync(f, { recursive: has("r"), force: true });
        }
        return st;
      }
      case "cp":
      case "mv": {
        if (operands.length < 2) {
          return 1;
        }
        const dest = operands[operands.length - 1];
        const dir = exists(dest) && fs.statSync(dest).isDirectory();
        if (operands.length > 2 && !dir) {
          return 1;
        }
        let st = 0;
        for (const src of operands.slice(0, -1)) {
          if (!exists(src) || fs.lstatSync(src).isDirectory()) {
            st = 1;
            continue;
          }
          const to = dir ? path.join(dest, path.basename(src)) : dest;
          if (prog === "cp") {
            fs.copyFileSync(src, to);
            if (has("p")) {
              const t = fs.statSync(src);
              fs.utimesSync(to, t.atime, t.mtime);
              fs.chmodSync(to, t.mode & 0o7777);
            }
          } else {
            fs.renameSync(src, to);
          }
        }
        return st;
      }
      default:
        return 1;
    }
  } catch {
    return 1;
  }
}
