// enclawed adapter kit: the recorded content of a project's files, kept so a
// change made outside the agent can be put back (./file-integrity.ts).
//
// The file-integrity record holds each file's digest at the last audited
// state. To make a change outside the agent reversible, the content behind
// that digest must stay retrievable after the file was overwritten, so it is
// kept as the file becomes the recorded state (launch, the agent's own writes
// and commands, an acceptance), the cheapest way available:
//
//   - in git: when the project is a git repository and HEAD's commit holds
//     the file with exactly this content (same blob id), nothing is copied;
//     the record names the blob, and a restore reads it with `git cat-file`
//     (and checks it still hashes to the recorded SHA-256);
//   - a copy: otherwise, in a content-addressed store beside the record
//     (objects named by SHA-256, mode 0600), within fixed bounds: a file over
//     MAX_KEPT_FILE_BYTES, a store over MAX_KEPT_BYTES, or a file git ignores
//     (build output, dependencies) is not copied, and a change to it is
//     detected and recorded as always but cannot be put back by Enclawed.
//
// A copy is removed as soon as no recorded path references it any more: the
// file changed again through a checked action, or was committed (git holds it
// then), or was accepted and is held in git. So the store holds at most the
// recorded state of the files git does not hold as they are.
//
// git runs as in ./fs-probe.ts gitCommittedTreeOf: the system git, no GIT_*
// variable from the environment, core.fsmonitor off, replace objects off, and
// only plumbing that starts no filter, driver or hook (rev-parse, ls-tree,
// cat-file blob, diff-tree --name-only, check-ignore).

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { trustedBinary } from "./fs-probe.js";

/** Bounds of the copies kept for one project (internal constants, not settings). */
export const MAX_KEPT_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_KEPT_BYTES = 512 * 1024 * 1024;

const SHA256_RE = /^[0-9a-f]{64}$/;

/** Where the recorded content of one path is: a blob of HEAD's commit, or a copy in the store. */
export type KeptRef =
  | Readonly<{ sha256: string; size: number; at: "git"; blob: string; commit: string }>
  | Readonly<{ sha256: string; size: number; at: "copy" }>;

/** A content-addressed store of copies (by SHA-256 of the bytes). */
export interface ContentStore {
  /** Its directory, when it has one. */
  readonly dir: string | null;
  has(sha256: string): boolean;
  /** The bytes, checked against their name; null when absent or not matching. */
  get(sha256: string): Buffer | null;
  put(sha256: string, data: Buffer): boolean;
  remove(sha256: string): void;
  list(): string[];
  /** Bytes held now. */
  bytes(): number;
}

export const sha256Of = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

/** A store in a directory: objects/<sha256>, written through a temporary file and a rename. */
export function dirContentStore(dir: string): ContentStore {
  const objects = path.join(dir, "objects");
  const at = (sha: string) => {
    if (!SHA256_RE.test(sha)) {
      throw new TypeError(`not a content hash: ${sha}`);
    }
    return path.join(objects, sha);
  };
  return {
    dir,
    has: (sha) => fs.existsSync(at(sha)),
    get(sha) {
      let b: Buffer;
      try {
        b = fs.readFileSync(at(sha));
      } catch {
        return null;
      }
      return sha256Of(b) === sha ? b : null;
    },
    put(sha, data) {
      const target = at(sha);
      if (sha256Of(data) !== sha) {
        return false;
      }
      try {
        fs.mkdirSync(objects, { recursive: true, mode: 0o700 });
        if (fs.existsSync(target)) {
          return true;
        }
        const tmp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
        fs.writeFileSync(tmp, data, { mode: 0o600, flag: "wx" });
        fs.renameSync(tmp, target);
        return true;
      } catch {
        return false;
      }
    },
    remove(sha) {
      try {
        fs.rmSync(at(sha), { force: true });
      } catch {
        /* removed already */
      }
    },
    list() {
      try {
        return fs.readdirSync(objects).filter((n) => SHA256_RE.test(n));
      } catch {
        return [];
      }
    },
    bytes() {
      let total = 0;
      for (const n of this.list()) {
        try {
          total += fs.statSync(path.join(objects, n)).size;
        } catch {
          /* removed concurrently */
        }
      }
      return total;
    },
  };
}

/** A store in memory (tests, a single-process adapter). */
export function memoryContentStore(): ContentStore {
  const held = new Map<string, Buffer>();
  return {
    dir: null,
    has: (sha) => held.has(sha),
    get: (sha) => {
      const b = held.get(sha);
      return b && sha256Of(b) === sha ? Buffer.from(b) : null;
    },
    put: (sha, data) => {
      if (sha256Of(data) !== sha) {
        return false;
      }
      held.set(sha, Buffer.from(data));
      return true;
    },
    remove: (sha) => void held.delete(sha),
    list: () => [...held.keys()],
    bytes: () => [...held.values()].reduce((n, b) => n + b.length, 0),
  };
}

// ─── git, read-only plumbing ────────────────────────────────────────────

/** A repository Enclawed reads: its top directory and a runner of git plumbing in it. */
export type GitRepo = Readonly<{
  top: string;
  run(args: readonly string[], input?: string): { status: number | null; stdout: Buffer } | null;
}>;

function gitEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith("GIT_") && typeof v === "string") {
      env[k] = v;
    }
  }
  env.GIT_OPTIONAL_LOCKS = "0";
  env.GIT_NO_REPLACE_OBJECTS = "1";
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}

/** The git repository holding `dir`, or null (no repository, no trusted git). */
export function gitRepoOf(dir: string, o: { gitBin?: string | null } = {}): GitRepo | null {
  const gitBin =
    o.gitBin !== undefined ? o.gitBin : process.platform === "win32" ? "git" : trustedBinary("git");
  if (!gitBin) {
    return null;
  }
  const env = gitEnv();
  const runIn = (cwd: string, args: readonly string[], input?: string) => {
    const r = spawnSync(
      gitBin,
      ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-C", cwd, ...args],
      {
        timeout: 20_000,
        env,
        windowsHide: true,
        maxBuffer: 256 * 1024 * 1024,
        ...(input !== undefined ? { input } : {}),
      },
    );
    return r.error ? null : { status: r.status, stdout: r.stdout };
  };
  const top = runIn(dir, ["rev-parse", "--show-toplevel"]);
  if (!top || top.status !== 0) {
    return null;
  }
  const t = top.stdout.toString("utf8").trim();
  if (!t) {
    return null;
  }
  let real: string;
  try {
    real = fs.realpathSync(t);
  } catch {
    return null;
  }
  return { top: real, run: (args, input) => runIn(real, args, input) };
}

/** HEAD's commit id, or null (no commit yet, unreadable). */
export function gitHeadOf(repo: GitRepo): string | null {
  const r = repo.run(["rev-parse", "--verify", "-q", "HEAD^{commit}"]);
  const id = r && r.status === 0 ? r.stdout.toString("utf8").trim() : "";
  return /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(id) ? id : null;
}

/** A commit's tree: path from the repository's top ("/") -> blob id; null when unreadable. */
export function gitTreeOf(repo: GitRepo, rev: string): Map<string, string> | null {
  const r = repo.run(["ls-tree", "-r", "-z", "--full-tree", rev]);
  if (!r || r.status !== 0) {
    return null;
  }
  const blobs = new Map<string, string>();
  for (const rec of r.stdout.toString("utf8").split("\0")) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.*)$/s.exec(rec);
    if (m) {
      blobs.set(m[2], m[1]);
    }
  }
  return blobs;
}

/** A blob's bytes (no filter, no conversion), or null. */
export function gitBlobOf(repo: GitRepo, blob: string): Buffer | null {
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(blob)) {
    return null;
  }
  const r = repo.run(["cat-file", "blob", blob]);
  return r && r.status === 0 ? r.stdout : null;
}

/** The paths (from the top) a commit changed against `from` (null: against nothing, a root commit). */
export function gitChangedPaths(repo: GitRepo, from: string | null, to: string): string[] | null {
  const r = repo.run(
    from
      ? ["diff-tree", "-r", "-z", "--no-renames", "--name-only", "--no-commit-id", from, to]
      : ["diff-tree", "-r", "-z", "--no-renames", "--name-only", "--no-commit-id", "--root", to],
  );
  if (!r || r.status !== 0) {
    return null;
  }
  return r.stdout
    .toString("utf8")
    .split("\0")
    .filter((p) => p !== "");
}

/** Of these paths (from the top), the ones git ignores (not tracked, matched by an ignore rule). */
export function gitIgnoredOf(repo: GitRepo, paths: readonly string[]): Set<string> {
  if (!paths.length) {
    return new Set();
  }
  const r = repo.run(["check-ignore", "-z", "--stdin"], `${paths.join("\0")}\0`);
  // 0: some ignored, 1: none; anything else: unknown, nothing counts as ignored.
  if (!r || (r.status !== 0 && r.status !== 1)) {
    return new Set();
  }
  return new Set(
    r.stdout
      .toString("utf8")
      .split("\0")
      .filter((p) => p !== ""),
  );
}

/** git's blob id of `content`, in the repository's object format (by the length of an id it uses). */
export function gitBlobId(content: Buffer, idLength: number): string {
  const h = createHash(idLength === 64 ? "sha256" : "sha1");
  h.update(`blob ${content.length}\0`);
  h.update(content);
  return h.digest("hex");
}

/** A path from the repository's top, as the project's relative path; null outside the project. */
export function projectRelOf(repo: GitRepo, root: string, p: string): string | null {
  const rel = path.relative(root, path.join(repo.top, p));
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return rel.split(path.sep).join("/");
}

/** The project's relative path as a path from the repository's top; null when the repository does not hold it. */
export function topRelOf(repo: GitRepo, root: string, rel: string): string | null {
  const t = path.relative(repo.top, path.join(root, rel));
  if (t === "" || t.startsWith("..") || path.isAbsolute(t)) {
    return null;
  }
  return t.split(path.sep).join("/");
}

/** A file's bytes, not through a link; null when it is not a regular file or over `max`. */
export function readPlainFile(abs: string, max: number): Buffer | null {
  let fd: number;
  try {
    fd = fs.openSync(abs, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch {
    return null;
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.size > max) {
      return null;
    }
    return fs.readFileSync(fd);
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}
