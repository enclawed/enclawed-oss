// Is a conflicted exec-config file git's own merge output? (Host side,
// read-only; called from ./repo-config.ts.)
//
// git's merge of a path is deterministic given: the stage 1/2/3 blobs, the
// merge driver the attributes name (text, union, binary), the strategy
// options the merging git ran with (-X ours/theirs, -X diff-algorithm=,
// -X patience/histogram, -X renormalize; merge.renormalize), the conflict
// style and marker size, and the labels it wrote. Each is taken from the
// repository or from the journaled argv of the very git process that wrote
// the file, and the merge is rebuilt with `git merge-file` on copies of the
// blobs (never executing a driver) and compared byte for byte after the
// same checkout conversion.
//
// rerere: when git replayed a recorded resolution, the file is the rr-cache
// postimage of the conflict whose preimage (rerere's normalized form: no
// labels, no base, sides in order) equals the rebuilt conflict. Accepted
// only when neither the preimage nor the postimage was written by the
// contained process (the name guard's journal), so a planted rr-cache
// entry is not a way in.
//
// Whitespace strategy options (-X ignore-space-change, ignore-all-space,
// ignore-space-at-eol, ignore-cr-at-eol), which merge-file lacks, are
// rebuilt with `git merge-tree --write-tree -X ...` in a throwaway bare
// repository. octopus and resolve are rebuilt like git-merge-one-file.
//
// Refused, by design: a custom merge driver (merge=<driver> in attributes)
// and any strategy that is not built in (-s <name>). Both run a program of
// the repository's choosing, which on agent and editor configuration is
// itself the attack surface; the refusal names the driver or strategy.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inodeKey } from "./name-guard.js";

export type MergeDeps = Readonly<{
  git: (top: string, args: string[], input?: string) => Buffer;
  gitBinary: () => string | null;
  env: Record<string, string>;
  safe: readonly string[];
  /** The checkout conversion of the path's content. */
  convert: (b: Buffer) => Buffer;
  /** Undo it (CRLF to LF) for -X renormalize. */
  normalize: (b: Buffer) => Buffer;
}>;

export type Stage = { mode: string; blob: string; stage: string };

export type MergeOptions = Readonly<{
  favor: "ours" | "theirs" | "union" | null;
  algos: readonly string[];
  renormalize: boolean;
  /** Whitespace strategy options: rebuilt with git merge-tree (merge-file has none). */
  whitespace: readonly string[];
  /** Options the rebuild cannot follow (the merge is then refused). */
  unsupported: readonly string[];
}>;

/** Whitespace strategy options git's merge machinery takes and merge-tree reproduces. */
export const WHITESPACE_OPTIONS = new Set([
  "ignore-space-change",
  "ignore-all-space",
  "ignore-space-at-eol",
  "ignore-cr-at-eol",
]);
/**
 * Built-in strategies whose content merge is rebuilt here. octopus and
 * resolve merge each path with `git merge-file` (git-merge-one-file.sh);
 * octopus does it pair by pair in the order of the heads given, and a path
 * can only stay conflicted in the last pair, whose stages the index holds.
 */
const STRATEGIES = new Set(["ort", "recursive", "resolve", "octopus"]);

const ALGOS = ["myers", "minimal", "patience", "histogram"];

/** The strategy options a merging git ran with, from its argv and the repository's config. */
export function mergeOptions(argv: readonly string[], renormalizeConfig: boolean): MergeOptions {
  const xs: string[] = [];
  const unsupported: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-X" || a === "--strategy-option") {
      xs.push(argv[++i] ?? "");
    } else if (a.startsWith("-X")) {
      xs.push(a.slice(2));
    } else if (a.startsWith("--strategy-option=")) {
      xs.push(a.slice("--strategy-option=".length));
    } else if (a === "-s" || a === "--strategy") {
      const s = argv[++i] ?? "";
      if (!STRATEGIES.has(s)) {
        unsupported.push(`strategy ${s}`);
      }
    } else if (a.startsWith("--strategy=")) {
      const s = a.slice("--strategy=".length);
      if (!STRATEGIES.has(s)) {
        unsupported.push(`strategy ${s}`);
      }
    }
  }
  let favor: MergeOptions["favor"] = null;
  let algos = [...ALGOS];
  let renormalize = renormalizeConfig;
  const whitespace: string[] = [];
  for (const x of xs) {
    if (x === "ours" || x === "theirs") {
      favor = x;
    } else if (x === "patience" || x === "histogram") {
      algos = [x];
    } else if (x.startsWith("diff-algorithm=")) {
      algos = [x.slice("diff-algorithm=".length)];
    } else if (WHITESPACE_OPTIONS.has(x)) {
      whitespace.push(x);
    } else if (x === "renormalize") {
      renormalize = true;
    } else if (x === "no-renormalize") {
      renormalize = false;
    } else if (/^(find-renames|rename-threshold|no-renames|subtree)/.test(x)) {
      // path-level: does not change the content merge of this path
    } else {
      unsupported.push(`-X ${x}`);
    }
  }
  return { favor, algos, renormalize, whitespace, unsupported };
}

const markerRe = (ch: string, n: number) => new RegExp(`^\\${ch}{${n}}(?: (.*?))?\\r?$`, "m");

/** rerere's normalized form of a conflicted text (rerere.c handle_path): no labels, no base, sides in order. */
export function rerereNormalize(text: string, size: number): string {
  const lt = "<".repeat(size);
  const eq = "=".repeat(size);
  const gt = ">".repeat(size);
  const bar = "|".repeat(size);
  const out: string[] = [];
  const lines = text.split(/(?<=\n)/);
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.startsWith(lt) || l[size] === "<") {
      out.push(l);
      i++;
      continue;
    }
    let one = "";
    let two = "";
    let part: "one" | "base" | "two" = "one";
    i++;
    while (i < lines.length && !(lines[i].startsWith(gt) && lines[i][size] !== ">")) {
      const x = lines[i];
      if (x.startsWith(bar) && part === "one") {
        part = "base";
      } else if (x.startsWith(eq) && x[size] !== "=" && part !== "two") {
        part = "two";
      } else if (part === "one") {
        one += x;
      } else if (part === "two") {
        two += x;
      }
      i++;
    }
    i++;
    const [a, b] = one <= two ? [one, two] : [two, one];
    out.push(`${lt}\n${a}${eq}\n${b}${gt}\n`);
  }
  return out.join("");
}

function writeTemp(dir: string, name: string, b: Buffer): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, b, { mode: 0o600 });
  return p;
}

/** Every merge git could have written for these stages with these options (with markers labelled as in `have`). */
function rebuilds(
  d: MergeDeps,
  top: string,
  stages: Stage[],
  have: string,
  size: number,
  driver: string,
  o: MergeOptions,
): Buffer[] {
  const s1 = stages.find((s) => s.stage === "1");
  const s2 = stages.find((s) => s.stage === "2")!;
  const s3 = stages.find((s) => s.stage === "3")!;
  const read = (blob: string | undefined) =>
    blob ? d.git(top, ["cat-file", "blob", blob]) : Buffer.alloc(0);
  const prep = (b: Buffer) => (o.renormalize ? d.normalize(b) : b);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-merge-"));
  try {
    const ours = writeTemp(tmp, "ours", prep(read(s2.blob)));
    const base = writeTemp(tmp, "base", prep(read(s1?.blob)));
    const theirs = writeTemp(tmp, "theirs", prep(read(s3.blob)));
    const oursLabel = markerRe("<", size).exec(have)?.[1] ?? "";
    const theirsLabel = markerRe(">", size).exec(have)?.[1] ?? "";
    const baseLabel = markerRe("|", size).exec(have)?.[1];
    const styles = baseLabel === undefined ? [[]] : [["--diff3"], ["--zdiff3"]];
    const favor = driver === "union" ? "union" : o.favor;
    const bin = d.gitBinary();
    if (!bin) {
      return [];
    }
    const out: Buffer[] = [];
    for (const style of styles) {
      for (const algo of o.algos) {
        const r = spawnSync(
          bin,
          [
            ...d.safe,
            "merge-file",
            "-p",
            `--marker-size=${size}`,
            `--diff-algorithm=${algo}`,
            ...style,
            ...(favor ? [`--${favor}`] : []),
            "-L",
            oursLabel,
            "-L",
            baseLabel ?? "",
            "-L",
            theirsLabel,
            ours,
            base,
            theirs,
          ],
          { cwd: top, env: d.env, timeout: 20_000, maxBuffer: 64 * 1024 * 1024 },
        );
        if (r.stdout) {
          out.push(r.stdout);
        }
      }
    }
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** `text` with the labels after conflict markers removed (they prove nothing; the content between them does). */
export function withoutLabels(text: string, size: number): string {
  return text.replace(new RegExp(`^([<>|]{${size}})(?: [^\\r\\n]*)?(\\r?)$`, "gm"), "$1$2");
}

/**
 * The path as git's merge machinery merges it with whitespace options:
 * `git merge-tree --write-tree -X <opts>` on trees holding the three stage
 * blobs, in a throwaway bare repository whose only link to the project is an
 * alternates entry to its objects (no project config, attributes, hooks or
 * filters; nothing written to the project).
 */
function mergeTreeRebuilds(
  d: MergeDeps,
  top: string,
  rel: string,
  stages: Stage[],
  size: number,
  driver: string,
  o: MergeOptions,
  styles: readonly string[],
): Buffer[] {
  const bin = d.gitBinary();
  if (!bin) {
    return [];
  }
  const run = (gitDir: string, args: string[], input?: string | Buffer) =>
    execFileSync(bin, [...d.safe, `--git-dir=${gitDir}`, ...args], {
      cwd: gitDir,
      env: d.env,
      input,
      timeout: 20_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-mtree-"));
  try {
    const g = path.join(tmp, "repo.git");
    execFileSync(bin, [...d.safe, "init", "-q", "--bare", "--template=", g], {
      env: d.env,
      stdio: "ignore",
    });
    const common = d
      .git(top, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
      .toString("utf8")
      .trim();
    fs.mkdirSync(path.join(g, "objects", "info"), { recursive: true });
    fs.writeFileSync(
      path.join(g, "objects", "info", "alternates"),
      `${path.join(common, "objects")}\n`,
    );
    fs.mkdirSync(path.join(g, "info"), { recursive: true });
    fs.writeFileSync(
      path.join(g, "info", "attributes"),
      `/${rel} conflict-marker-size=${size}${driver === "union" ? " merge=union" : ""}\n`,
    );
    const blobOf = (s: Stage | undefined) => {
      if (!s) {
        return run(g, ["hash-object", "-w", "--stdin"], "").toString("utf8").trim();
      }
      if (!o.renormalize) {
        return s.blob;
      }
      const bytes = d.normalize(d.git(top, ["cat-file", "blob", s.blob]));
      return run(g, ["hash-object", "-w", "--stdin"], bytes).toString("utf8").trim();
    };
    // A tree holding only this path (nested trees for its directories).
    const treeOf = (blob: string) => {
      const parts = rel.split("/");
      let entry = `100644 blob ${blob}\t${parts[parts.length - 1]}\n`;
      let tree = run(g, ["mktree"], entry).toString("utf8").trim();
      for (let i = parts.length - 2; i >= 0; i--) {
        entry = `040000 tree ${tree}\t${parts[i]}\n`;
        tree = run(g, ["mktree"], entry).toString("utf8").trim();
      }
      return tree;
    };
    const base = treeOf(blobOf(stages.find((s) => s.stage === "1")));
    const ours = treeOf(blobOf(stages.find((s) => s.stage === "2")));
    const theirs = treeOf(blobOf(stages.find((s) => s.stage === "3")));
    const opts = [
      ...o.whitespace.map((x) => `-X${x}`),
      ...(o.algos.length === 1 ? [`-Xdiff-algorithm=${o.algos[0]}`] : []),
      ...(o.favor && o.favor !== "union" ? [`-X${o.favor}`] : []),
    ];
    const out: Buffer[] = [];
    for (const style of styles) {
      const r = spawnSync(
        bin,
        [
          ...d.safe,
          `--git-dir=${g}`,
          "-c",
          `merge.conflictStyle=${style}`,
          "merge-tree",
          "--write-tree",
          ...opts,
          `--merge-base=${base}`,
          ours,
          theirs,
        ],
        { cwd: g, env: d.env, timeout: 20_000, maxBuffer: 64 * 1024 * 1024 },
      );
      const result = r.stdout?.toString("utf8").split("\n")[0];
      if (!result || !/^[0-9a-f]+$/.test(result)) {
        continue;
      }
      try {
        out.push(run(g, ["cat-file", "blob", `${result}:${rel}`]));
      } catch {
        /* the path is gone from the result */
      }
    }
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export type MergeVerdict =
  | Readonly<{ ok: true; how: "merge" | "rerere" | "side" }>
  | Readonly<{ ok: false; reason: string }>;

/** Is `have` what git's merge (or its rerere replay) wrote for these stages? */
export function verifyMerge(
  d: MergeDeps,
  top: string,
  stages: Stage[],
  have: Buffer,
  attrs: Readonly<{ size: number; driver: string; rel: string }>,
  argv: readonly string[],
  renormalizeConfig: boolean,
  written: ReadonlySet<string>,
): MergeVerdict {
  const s2 = stages.find((s) => s.stage === "2");
  const s3 = stages.find((s) => s.stage === "3");
  if (!s2 || !s3) {
    // modify/delete: the work tree holds the side that still exists.
    const side = s2 ?? s3;
    return side && d.convert(d.git(top, ["cat-file", "blob", side.blob])).equals(have)
      ? { ok: true, how: "side" }
      : { ok: false, reason: "content is not the surviving side of a modify/delete conflict" };
  }
  const o = mergeOptions(argv, renormalizeConfig);
  if (o.unsupported.length > 0) {
    return {
      ok: false,
      reason: o.unsupported.some((u) => u.startsWith("strategy "))
        ? `merged with ${o.unsupported.join(", ")}: a strategy that is not built in runs a program of the repository's choosing, which is refused for agent and editor configuration`
        : `merged with ${o.unsupported.join(", ")}, which cannot be rebuilt deterministically`,
    };
  }
  if (!["unspecified", "set", "text", "union", "binary"].includes(attrs.driver)) {
    return {
      ok: false,
      reason: `a custom merge driver ("${attrs.driver}") applies: a merge driver runs a command, which is refused for agent and editor configuration`,
    };
  }
  if (attrs.driver === "binary") {
    // The binary driver keeps our side and reports a conflict.
    return d.convert(d.git(top, ["cat-file", "blob", s2.blob])).equals(have)
      ? { ok: true, how: "side" }
      : { ok: false, reason: "content is not our side, which the binary merge driver keeps" };
  }
  const text = have.toString("utf8");
  const candidates =
    o.whitespace.length > 0
      ? mergeTreeRebuilds(
          d,
          top,
          attrs.rel,
          stages,
          attrs.size,
          attrs.driver,
          o,
          markerRe("|", attrs.size).test(text) ? ["diff3", "zdiff3"] : ["merge"],
        )
      : rebuilds(d, top, stages, text, attrs.size, attrs.driver, o);
  // As checked out (ort, recursive), or written raw (git-merge-one-file for
  // octopus and resolve); marker labels compared out.
  // Compared as bytes (latin1 is lossless), not as decoded text.
  const want = withoutLabels(have.toString("latin1"), attrs.size);
  if (
    candidates.some(
      (c) =>
        withoutLabels(d.convert(c).toString("latin1"), attrs.size) === want ||
        withoutLabels(c.toString("latin1"), attrs.size) === want,
    )
  ) {
    return { ok: true, how: "merge" };
  }
  // rerere: a recorded resolution of this very conflict, not written by the sandbox.
  const rr = path.join(top, ".git", "rr-cache");
  let ids: string[] = [];
  try {
    ids = fs.readdirSync(rr);
  } catch {
    ids = [];
  }
  if (ids.length > 0) {
    const pre = new Set(
      candidates.map((c) => rerereNormalize(d.normalize(c).toString("utf8"), attrs.size)),
    );
    for (const id of ids) {
      const prePath = path.join(rr, id, "preimage");
      const postPath = path.join(rr, id, "postimage");
      try {
        const sandboxWrote = [prePath, postPath].some((p) =>
          written.has(inodeKey(fs.lstatSync(p, { bigint: true }))),
        );
        if (sandboxWrote) {
          continue;
        }
        const preText = fs.readFileSync(prePath, "utf8");
        const post = fs.readFileSync(postPath);
        if (pre.has(preText) && d.convert(post).equals(have)) {
          return { ok: true, how: "rerere" };
        }
      } catch {
        /* incomplete entry */
      }
    }
  }
  return { ok: false, reason: "content is not git's merge of the conflicting blobs" };
}
