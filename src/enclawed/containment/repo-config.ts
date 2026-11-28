// Repository configuration the contained git wrote (host side, run from
// ./contain-init.ts once the writing git process has exited).
//
// The name guard (./name-guard.c) lets the contained git write an
// exec-config path (.vscode/settings.json, .github/workflows/ci.yml,
// .claude/settings.json, ...) only while it checks files out of the
// repository, and journals each such path. Afterwards each one must be
// exactly what git itself would have produced:
//
//   - a checked-out file: the index's blob AS GIT CHECKS IT OUT, with the
//     end-of-line conversion the attributes and config ask for (computed
//     here, never by running anything). A filter driver, a
//     working-tree-encoding or ident expansion on an exec-config path is
//     refused by name: a filter driver runs a command, which on agent
//     config is itself an attack surface;
//   - a conflicted file: git's own merge of the index's stage 1/2/3 blobs
//     (`git merge-file`, read-only, with the markers, labels, conflict
//     style and marker size of the file and the repository), converted the
//     same way. Reported as "conflicted": the session holds until a person
//     resolves it, through a write the session approves.
//
// Host git runs read-only with every configurable program off (no
// fsmonitor, no hooks, no system or global config, no filters).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { verifyMerge } from "./merge-check.js";

export type TrackedVerdict =
  | Readonly<{
      ok: true;
      path: string;
      state: "checked-out" | "conflicted";
      blob: string;
      sha256: string;
    }>
  | Readonly<{ ok: true; path: string; absent: true }>
  | Readonly<{
      ok: false;
      path: string;
      reason: string;
      tracked?: { blob: string; mode: string };
    }>;

export const GIT_ENV = {
  PATH: "/usr/bin:/bin",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_PAGER: "cat",
  GIT_TERMINAL_PROMPT: "0",
  LC_ALL: "C",
};
const SAFE = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];

export function gitBinary(): string | null {
  return ["/usr/bin/git", "/bin/git"].find((p) => fs.existsSync(p)) ?? null;
}

/** The work tree that holds `p` (nearest directory above it with a .git). */
export function workTreeOf(p: string): string | null {
  for (let d = path.dirname(p); d !== path.dirname(d); d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, ".git"))) {
      return d;
    }
  }
  return null;
}

/** Run host git read-only; throws on failure. */
export function git(top: string, args: string[], input?: string): Buffer {
  const bin = gitBinary();
  if (!bin) {
    throw new Error("git is not installed on the host");
  }
  return execFileSync(bin, [...SAFE, ...args], {
    cwd: top,
    env: GIT_ENV,
    timeout: 20_000,
    input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function configGet(top: string, key: string): string | null {
  try {
    return git(top, ["config", "--get", key]).toString("utf8").trim().toLowerCase();
  } catch {
    return null; // unset
  }
}

/** Attributes of `rel`: unspecified, unset, set, or a value. */
function attributes(top: string, rel: string): Record<string, string> {
  const names = [
    "filter",
    "text",
    "eol",
    "crlf",
    "ident",
    "working-tree-encoding",
    "conflict-marker-size",
    "merge",
  ];
  const out = git(top, ["check-attr", "-z", ...names, "--", rel])
    .toString("utf8")
    .split("\0");
  const attrs: Record<string, string> = {};
  for (let i = 0; i + 2 < out.length; i += 3) {
    attrs[out[i + 1]] = out[i + 2];
  }
  return attrs;
}

const isSet = (v: string | undefined) => v !== undefined && v !== "unspecified" && v !== "unset";

export type Crlf = "always" | "auto" | "never";
export type Conversion = { ok: true; crlf: Crlf } | { ok: false; reason: string };

/**
 * How git checks `rel` out (convert.c): refused for filter drivers,
 * working-tree-encoding and ident; otherwise the end-of-line conversion.
 */
export function checkoutConversion(top: string, rel: string): Conversion {
  const a = attributes(top, rel);
  if (isSet(a.filter)) {
    return {
      ok: false,
      reason: `a filter driver ("${a.filter}") applies to ${rel}: a filter runs a command, which is refused for agent and editor configuration`,
    };
  }
  if (isSet(a["working-tree-encoding"])) {
    return { ok: false, reason: `working-tree-encoding applies to ${rel}` };
  }
  if (a.ident === "set") {
    return { ok: false, reason: `ident expansion applies to ${rel}` };
  }
  // The legacy crlf attribute maps onto text.
  const legacy: Record<string, string> = { unset: "unset", set: "set", input: "input" };
  const text = a.text !== "unspecified" ? a.text : (legacy[a.crlf] ?? "unspecified");
  if (text === "unset" || text === "input" || a.eol === "lf") {
    return { ok: true, crlf: "never" };
  }
  if (a.eol === "crlf") {
    return { ok: true, crlf: text === "auto" ? "auto" : "always" };
  }
  const autocrlf = configGet(top, "core.autocrlf");
  const coreEol = configGet(top, "core.eol");
  const wantsCrlf = autocrlf === "true" || (autocrlf !== "input" && coreEol === "crlf");
  if (text === "set") {
    return { ok: true, crlf: wantsCrlf ? "always" : "never" };
  }
  if (text === "auto") {
    return { ok: true, crlf: wantsCrlf ? "auto" : "never" };
  }
  // Unspecified: only core.autocrlf=true converts (as auto).
  return { ok: true, crlf: autocrlf === "true" ? "auto" : "never" };
}

/** The bytes git writes for `blob` under the conversion `crlf`. */
export function applyConversion(blob: Buffer, crlf: Crlf): Buffer {
  if (crlf === "never") {
    return blob;
  }
  const s = blob.toString("latin1");
  // auto: binary, a lone CR, or CRLF already in the repository: left alone.
  if (crlf === "auto" && (s.includes("\0") || /\r(?!\n)/.test(s) || s.includes("\r\n"))) {
    return blob;
  }
  return Buffer.from(s.replace(/(?<!\r)\n/g, "\r\n"), "latin1");
}

type Stage = { mode: string; blob: string; stage: string };

function stagesOf(top: string, rel: string): Stage[] {
  const out = git(top, ["ls-files", "--stage", "-z", "--", rel]).toString("utf8");
  const stages: Stage[] = [];
  for (const entry of out.split("\0").filter(Boolean)) {
    const m = /^(\d+) ([0-9a-f]+) (\d)\t(.*)$/s.exec(entry);
    if (m && m[4] === rel) {
      stages.push({ mode: m[1], blob: m[2], stage: m[3] });
    }
  }
  return stages;
}

/** Is the file at `p` exactly what git checks out (or merges) there? */
export function verifyTracked(
  p: string,
  ctx: Readonly<{ argv?: readonly string[]; written?: ReadonlySet<string> }> = {},
): TrackedVerdict {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(p);
  } catch {
    return { ok: true, path: p, absent: true }; // written, then removed again
  }
  if (st.isDirectory()) {
    return { ok: true, path: p, absent: true }; // directories carry no content; their files are checked
  }
  if (!st.isFile()) {
    return { ok: false, path: p, reason: "not a regular file" };
  }
  const top = workTreeOf(p);
  if (!top) {
    return { ok: false, path: p, reason: "not inside a git work tree" };
  }
  const rel = path.relative(top, p).split(path.sep).join("/");
  try {
    const stages = stagesOf(top, rel);
    if (stages.length === 0) {
      return { ok: false, path: p, reason: "not tracked by the index" };
    }
    if (stages.some((s) => s.mode !== "100644" && s.mode !== "100755")) {
      return { ok: false, path: p, reason: "tracked as something other than a regular file" };
    }
    const conv = checkoutConversion(top, rel);
    if (!conv.ok) {
      return { ok: false, path: p, reason: conv.reason };
    }
    const have = fs.readFileSync(p);
    const sha256 = createHash("sha256").update(have).digest("hex");
    const clean = stages.find((s) => s.stage === "0");
    if (clean) {
      const expected = applyConversion(git(top, ["cat-file", "blob", clean.blob]), conv.crlf);
      if (!expected.equals(have)) {
        return {
          ok: false,
          path: p,
          reason: `content is not the tracked blob ${clean.blob.slice(0, 12)} as git checks it out`,
          tracked: { blob: clean.blob, mode: clean.mode },
        };
      }
      return { ok: true, path: p, state: "checked-out", blob: clean.blob, sha256 };
    }
    const a = attributes(top, rel);
    const sizeAttr = a["conflict-marker-size"];
    const size = /^\d+$/.test(sizeAttr ?? "") ? Number(sizeAttr) : 7;
    const crlf = conv.crlf;
    const m = verifyMerge(
      {
        git,
        gitBinary,
        env: GIT_ENV,
        safe: SAFE,
        convert: (b) => applyConversion(b, crlf),
        normalize: (b) => Buffer.from(b.toString("latin1").replace(/\r\n/g, "\n"), "latin1"),
      },
      top,
      stages,
      have,
      { size, driver: a.merge ?? "unspecified", rel },
      ctx.argv ?? [],
      configGet(top, "merge.renormalize") === "true",
      ctx.written ?? new Set(),
    );
    if (!m.ok) {
      return { ok: false, path: p, reason: m.reason };
    }
    return {
      ok: true,
      path: p,
      state: "conflicted",
      blob: stages.map((s) => s.blob).join(","),
      sha256,
    };
  } catch (err) {
    return {
      ok: false,
      path: p,
      reason: `could not be compared with the index: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Put the tracked blob back at `p` (after what was there went to quarantine). */
export function restoreTracked(p: string, tracked: { blob: string; mode: string }): boolean {
  const top = workTreeOf(p);
  if (!top) {
    return false;
  }
  try {
    const rel = path.relative(top, p).split(path.sep).join("/");
    const conv = checkoutConversion(top, rel);
    const bytes = applyConversion(
      git(top, ["cat-file", "blob", tracked.blob]),
      conv.ok ? conv.crlf : "never",
    );
    fs.writeFileSync(p, bytes, { flag: "wx", mode: tracked.mode === "100755" ? 0o755 : 0o644 });
    return true;
  } catch {
    return false;
  }
}

export type GuardWrite = {
  kind: "G" | "C" | "A";
  pid: number;
  path: string;
  /** The argv the writing git ran with (from its "V" line). */
  argv?: readonly string[];
};

// Journaled git invocations by pid (a "V" line precedes that process's first "G").
const argvOf = new Map<number, string[]>();

/** The name guard's journal lines for its exceptions (G, C, A), from `offset`. */
export function readGitWrites(
  file: string,
  offset: number,
): { entries: GuardWrite[]; offset: number } {
  let buf: Buffer;
  try {
    const fd = fs.openSync(file, "r");
    try {
      const size = fs.fstatSync(fd).size;
      buf = Buffer.alloc(Math.max(0, size - offset));
      fs.readSync(fd, buf, 0, buf.length, offset);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { entries: [], offset };
  }
  const text = buf.toString("utf8");
  const end = text.lastIndexOf("\n") + 1; // whole lines only
  const entries: GuardWrite[] = [];
  for (const line of text.slice(0, end).split("\n")) {
    const v = /^V (\d+) (.*)$/.exec(line);
    if (v) {
      argvOf.set(
        Number(v[1]),
        v[2].split("\x1f").filter((x, i, all) => i < all.length - 1 || x !== ""),
      );
      continue;
    }
    const m = /^([GCA]) (\d+) (.+)$/.exec(line);
    if (m) {
      const pid = Number(m[2]);
      entries.push({ kind: m[1] as GuardWrite["kind"], pid, path: m[3], argv: argvOf.get(pid) });
    }
  }
  return { entries, offset: offset + Buffer.byteLength(text.slice(0, end)) };
}

/** Is `sha256` still the content of `p`? */
export const sha256Of = (p: string) => {
  try {
    return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
};
