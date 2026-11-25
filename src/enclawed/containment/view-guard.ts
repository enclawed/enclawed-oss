// Keeping the protected paths of a containment protected while it runs
// (inside ./contain-init.ts, which is PID 1 of the containment's PID
// namespace and sees the host's filesystem).
//
// Inside the sandbox nothing can move a protected path: it is a read-only
// mount point, and every directory between it and its root is a mount point
// too (anchored, ./plan.ts), so rename and rmdir fail with EBUSY; and the
// name guard (./name-guard.c) refuses every create, write, rename or link
// onto an exec-config name anywhere in a read-write root. Only the HOST can
// change a protected path: `git push -u` saving .git/config through
// .git/config.lock, an editor's atomic save, `git clean` removing an empty
// placeholder. Such a change is the host's, and the run goes on, unless the
// object now at the path is one the contained process wrote:
//
//   1. an inotify watch on each directory that holds a protected path or an
//      anchor (fs.watch), checked against the identity (device, inode)
//      recorded before start, plus the mount table as a backstop;
//   2. the moment an identity changes, the sandbox is FROZEN (SIGSTOP to
//      every process of the PID namespace but the supervisor, confirmed in
//      /proc) before anything else is done;
//   3. the name guard's journal lists every inode the contained process
//      created or opened for writing (written before each such call
//      returns, so complete once the sandbox is frozen). An object at a
//      protected path that is in the journal (a temporary file the sandbox
//      wrote and the host then renamed into place) is moved to Enclawed's
//      quarantine, original files are named for the launcher to restore,
//      and the sandbox is killed (containment-view-changed). Anything else
//      is the host's own work: the identity is updated, the sandbox thawed,
//      and the run continues (containment-host-change).

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { inodeKey } from "./name-guard.js";

/** A watched path. `dev`/`ino` are its current identity: updated when the host changes it. */
export type WatchedPath = {
  readonly path: string;
  readonly origin: "original" | "placeholder";
  readonly file: boolean;
  dev: number;
  ino: number;
  /** sha256 of a file's content at start (null for directories). */
  readonly digest: string | null;
};

export type Anchor = { readonly path: string; dev: number; ino: number };

// dev -1: recorded as absent (the host removed it).
const sameIdentity = (st: fs.Stats | null, w: { dev: number; ino: number }) =>
  st === null ? w.dev === -1 : st.dev === w.dev && st.ino === w.ino;

function lstatOrNull(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

/** Paths among `protect` and `anchors` whose identity differs from the recorded one. */
export function changedIdentities(
  protect: readonly WatchedPath[],
  anchors: readonly Anchor[],
): string[] {
  return [...anchors, ...protect]
    .filter((w) => !sameIdentity(lstatOrNull(w.path), w))
    .map((w) => w.path);
}

const spin = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Pids of every other process in this PID namespace (we are its init), but `keep`. */
function namespacePids(keep: readonly number[]): number[] {
  try {
    return fs
      .readdirSync("/proc")
      .filter((n) => /^\d+$/.test(n))
      .map(Number)
      .filter((pid) => pid !== process.pid && pid !== 1 && !keep.includes(pid));
  } catch {
    return [];
  }
}

function stateOf(pid: number): string | null {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
  } catch {
    return null; // gone
  }
}

/**
 * Freeze every process of the containment but `keep` (the name guard's
 * supervisor), synchronously: SIGSTOP to each, then wait until /proc shows
 * each one stopped (or gone). Returns false when one did not stop in time
 * (the caller kills).
 */
export function freezeSandbox(keep: readonly number[] = [], timeoutMs = 500): boolean {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // A process that forked since the last round gets its own signal.
    const running = namespacePids(keep).filter((pid) => {
      const s = stateOf(pid);
      return s !== null && !"TtZX".includes(s);
    });
    if (running.length === 0) {
      return true;
    }
    if (Date.now() > deadline) {
      return false;
    }
    for (const pid of running) {
      try {
        process.kill(pid, "SIGSTOP");
      } catch {
        /* gone */
      }
    }
    spin(1);
  }
}

export function thawSandbox(keep: readonly number[] = []): void {
  for (const pid of namespacePids(keep)) {
    try {
      process.kill(pid, "SIGCONT");
    } catch {
      /* gone */
    }
  }
}

export function killSandbox(keep: readonly number[] = []): void {
  for (const pid of namespacePids(keep)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
}

/** Move `p` into the quarantine; never deleted unless it cannot be moved or copied. */
export function quarantine(p: string, dir: string): string | null {
  const dest = path.join(
    dir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`,
    encodeURIComponent(p),
  );
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  } catch {
    /* the copy below fails too, and the path is removed */
  }
  try {
    fs.renameSync(p, dest);
    return dest;
  } catch {
    /* another filesystem: copy, then remove */
  }
  try {
    fs.cpSync(p, dest, { recursive: true, verbatimSymlinks: true });
    fs.rmSync(p, { recursive: true, force: true });
    return dest;
  } catch {
    fs.rmSync(p, { recursive: true, force: true });
    return null;
  }
}

export type LossOutcome = {
  /** Protected paths whose identity changed. */
  changed: string[];
  quarantined: Array<{ path: string; to: string | null }>;
  /** Original exec-config files to put back (the launcher holds their bytes). */
  restore: string[];
};

/**
 * Was this object written by the contained process? With `deep`, anything
 * inside a directory counts too (a protected directory may hold nothing of
 * the sandbox's; an anchor such as .git holds what it legitimately wrote).
 */
function writtenBySandbox(
  p: string,
  written: ReadonlySet<string>,
  deep: boolean,
  excepted: ReadonlySet<string>,
  depth = 0,
): boolean {
  if (excepted.has(p)) {
    return false; // the guard's exception: checked by ./guard-writes.ts
  }
  let st: fs.BigIntStats;
  try {
    st = fs.lstatSync(p, { bigint: true });
  } catch {
    return false;
  }
  if (written.has(inodeKey(st))) {
    return true;
  }
  if (deep && st.isDirectory() && depth < 8) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(p);
    } catch {
      return true; // unreadable: cannot be shown to be the host's
    }
    return names.some((n) => writtenBySandbox(path.join(p, n), written, deep, excepted, depth + 1));
  }
  return false;
}

/**
 * With the sandbox frozen: decide each changed protected path with the
 * journal of what the contained process wrote. What it wrote is
 * quarantined; what the host did becomes the new identity.
 */
export function handleViewLoss(
  protect: WatchedPath[],
  anchors: Anchor[],
  quarantineDir: string,
  written: ReadonlySet<string>,
  /** Paths the name guard let the contained git (or an approval) write: checked by ./guard-writes.ts. */
  excepted: ReadonlySet<string> = new Set(),
): LossOutcome {
  const out: LossOutcome = { changed: [], quarantined: [], restore: [] };
  const accept = (w: { dev: number; ino: number }, st: fs.Stats | null) => {
    w.dev = st ? st.dev : -1;
    w.ino = st ? st.ino : -1;
  };
  const decide = (w: Anchor | WatchedPath, deep: boolean, original: boolean) => {
    const st = lstatOrNull(w.path);
    if (sameIdentity(st, w)) {
      return;
    }
    out.changed.push(w.path);
    if (st && writtenBySandbox(w.path, written, deep, excepted)) {
      out.quarantined.push({ path: w.path, to: quarantine(w.path, quarantineDir) });
      if (original) {
        out.restore.push(w.path);
      }
      return;
    }
    accept(w, st);
  };
  for (const a of anchors) {
    decide(a, false, false);
  }
  for (const w of protect) {
    decide(w, true, w.origin === "original" && w.file);
  }
  return out;
}

/**
 * Watch the host side of every protected path and anchor. `onLoss` is
 * called (once) synchronously from the inotify event that shows an identity
 * change. Throws when a watch cannot be set up (the caller refuses to start).
 */
export function watchProtected(
  protect: readonly WatchedPath[],
  anchors: readonly Anchor[],
  onLoss: (changed: string[]) => boolean,
): () => void {
  const byDir = new Map<string, Array<WatchedPath | Anchor>>();
  for (const w of [...protect, ...anchors]) {
    const d = path.dirname(w.path);
    byDir.set(d, [...(byDir.get(d) ?? []), w]);
  }
  let fired = false;
  const watchers: fs.FSWatcher[] = [];
  const stop = () => {
    for (const w of watchers.splice(0)) {
      w.close();
    }
  };
  const check = (list: Array<WatchedPath | Anchor>) => {
    if (fired) {
      return;
    }
    const changed = list.filter((w) => !sameIdentity(lstatOrNull(w.path), w)).map((w) => w.path);
    if (changed.length > 0) {
      fired = true;
      // Handled as the host's own change: keep watching (with the new identities).
      fired = !onLoss(changed);
    }
  };
  try {
    for (const [dir, list] of byDir) {
      const names = new Set(list.map((w) => path.basename(w.path)));
      const watcher = fs.watch(dir, { persistent: false }, (_event, name) => {
        if (name === null || names.has(name)) {
          check(list);
        }
      });
      watcher.on("error", () => {
        // A watch that dies is a protection that is no longer watched.
        if (!fired) {
          fired = true;
          fired = !onLoss([dir]);
        }
      });
      watchers.push(watcher);
    }
  } catch (err) {
    stop();
    throw err;
  }
  return stop;
}
