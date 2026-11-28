// The containment's view of the filesystem, for the readers that decide what
// a contained run may do (./contained-exec.ts, ./python-reader.ts): every path
// they query is first resolved here one component at a time, the way the
// kernel will in the containment. A path that leads into the containment's own
// files is refused, and the refusal is kept for the whole reading: the line is
// refused even when a caller treats the failed query as "no such file".
// A test (./view-fs.test.ts) keeps every direct filesystem query out of the
// readers.

import fs from "node:fs";
import path from "node:path";

/** Directories of the containment that hold names this host's do not (or the containment itself). */
const VIEW_OWN = ["/.enclawed", "/proc", "/dev", "/sys"];
const inViewOwn = (p: string) => VIEW_OWN.some((d) => p === d || p.startsWith(`${d}/`));
/** Places whose contents in the containment are not this host's (fresh, private, or its own home). */
const VIEW_FRESH = ["/tmp", "/var/tmp", "/dev/shm", "/run", "/sandbox"];
const inViewFresh = (p: string) => VIEW_FRESH.some((d) => p === d || p.startsWith(`${d}/`));

export type ViewPath =
  | Readonly<{ kind: "found"; real: string }>
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "refused"; why: string }>;

/**
 * Where a path a line names leads, resolved one component at a time as the
 * kernel would (`..` physically, every symbolic link followed by its target),
 * with the containment's view in mind: a step into Enclawed's own directory,
 * /proc, /dev or /sys refuses (that is where a link like
 * /proc/self/root/.enclawed/... goes); a missing name reached through a link
 * into a place whose contents in the containment are not this host's (/tmp,
 * /var/tmp, /dev/shm, /run, its home) refuses; any other missing name is
 * "absent": the containment shows this host's project and read-only toolchain
 * (a subset of it), so it has nothing there either (/bin -> usr/bin and the
 * like resolve here as there).
 */
export function resolveViewPath(cwd: string, p: string): ViewPath {
  const parts = (p.startsWith("/") ? p : `${cwd}/${p}`).split("/");
  let cur = "/";
  let hops = 0;
  let hopFresh = false;
  const queue = parts.filter((x) => x !== "" && x !== ".");
  while (queue.length) {
    const comp = queue.shift() as string;
    if (comp === "." || comp === "") {
      continue;
    }
    if (comp === "..") {
      cur = path.dirname(cur);
      continue;
    }
    const next = cur === "/" ? `/${comp}` : `${cur}/${comp}`;
    if (inViewOwn(next)) {
      return { kind: "refused", why: `it leads into ${next}` };
    }
    let st: fs.Stats;
    try {
      st = fs.lstatSync(next);
    } catch {
      // Not here. A link that led here may resolve in the containment when its
      // target is in a place whose contents there are not this host's: refused.
      return hops > 0 && (hopFresh || inViewFresh(next))
        ? { kind: "refused", why: `a link it goes through leads to ${next}, which is not here` }
        : { kind: "absent" };
    }
    if (st.isSymbolicLink()) {
      if (++hops > 40) {
        return { kind: "refused", why: "too many links" };
      }
      let target: string;
      try {
        target = fs.readlinkSync(next);
      } catch {
        return { kind: "refused", why: `the link ${next} cannot be read` };
      }
      queue.unshift(...target.split("/").filter((x) => x !== "" && x !== "."));
      if (target.startsWith("/")) {
        cur = "/";
        hopFresh ||= inViewFresh(target);
      } else {
        hopFresh ||= inViewFresh(cur);
      }
      continue;
    }
    if (queue.length && !st.isDirectory()) {
      return { kind: "absent" }; // a file used as a directory: ENOTDIR, nothing runs
    }
    cur = next;
  }
  if (inViewOwn(cur)) {
    return { kind: "refused", why: `it leads into ${cur}` };
  }
  return { kind: "found", real: cur };
}

/**
 * Whether `p` (from `cwd`) means one place to the kernel and another to a
 * reading that takes `..` off the name: a `..` that steps back over a
 * symbolic link goes, for the kernel, to the parent of the link's target. The
 * link it steps back over, or null (no `..`, or none over a link).
 */
export function dotDotOverLink(cwd: string, p: string): string | null {
  if (!/(?:^|\/)\.\.(?:\/|$)/.test(p)) {
    return null;
  }
  const stack: string[] = [];
  for (const c of (p.startsWith("/") ? p : `${cwd}/${p}`).split("/")) {
    if (c === "" || c === ".") {
      continue;
    }
    if (c !== "..") {
      stack.push(c);
      continue;
    }
    if (stack.length === 0) {
      continue;
    }
    const here = `/${stack.join("/")}`;
    let st: fs.Stats;
    try {
      st = fs.lstatSync(here);
    } catch {
      return null; // missing: the kernel stops here, the name reaches nothing
    }
    if (st.isSymbolicLink()) {
      return here;
    }
    stack.pop();
  }
  return null;
}

/** Data paths every view has (the containment's own /dev shows these the same). */
const DEVICE_DATA = new Set([
  "/dev/null",
  "/dev/zero",
  "/dev/full",
  "/dev/random",
  "/dev/urandom",
  "/dev/tty",
  "/dev/stdin",
  "/dev/stdout",
  "/dev/stderr",
]);

/** Thrown for a path the view refuses (also kept in the reading's record). */
export class ViewRefused extends Error {}

let record: string[] | null = null;

/**
 * Run a reading with a record of refused paths: `fn`'s result, or the first
 * refusal (whatever `fn` did with the failed query).
 */
export function withViewRecord<T>(fn: () => T): { refused: string | null; value: T } {
  const outer = record;
  const mine: string[] = [];
  record = mine;
  try {
    const value = fn();
    return { refused: mine[0] ?? null, value };
  } finally {
    record = outer;
  }
}

/** The first refusal recorded so far in the current reading, if any. */
export function viewRefusal(): string | null {
  return record?.[0] ?? null;
}

function refusedPath(p: string, why: string): never {
  const msg = `${p.slice(0, 120)}: ${why}`;
  record?.push(msg);
  throw new ViewRefused(msg);
}

/** Check `p` (resolved against the process cwd when relative): refused paths throw (and are recorded). */
export function viewCheck(p: fs.PathLike | number): void {
  if (typeof p === "number") {
    return;
  }
  const abs = path.resolve(String(p));
  if (DEVICE_DATA.has(abs)) {
    return;
  }
  const r = resolveViewPath("/", abs);
  if (r.kind === "refused") {
    refusedPath(abs, r.why);
  }
}

/** Like viewCheck, but the last component is not followed (lstat, readlink). */
function viewCheckParent(p: fs.PathLike): void {
  const abs = path.resolve(String(p));
  viewCheck(path.dirname(abs));
  if (inViewOwn(abs) && !DEVICE_DATA.has(abs)) {
    refusedPath(abs, `it leads into ${abs}`);
  }
}

/** The readers' filesystem queries: each goes through the view first. */
export const viewFs = {
  existsSync(p: fs.PathLike): boolean {
    viewCheck(p);
    return fs.existsSync(p);
  },
  statSync(p: fs.PathLike): fs.Stats {
    viewCheck(p);
    return fs.statSync(p);
  },
  lstatSync(p: fs.PathLike): fs.Stats {
    viewCheckParent(p);
    return fs.lstatSync(p);
  },
  realpathSync(p: fs.PathLike): string {
    viewCheck(p);
    return fs.realpathSync(p);
  },
  readdirNames(p: fs.PathLike): string[] {
    viewCheck(p);
    return fs.readdirSync(p);
  },
  readdirEntries(p: fs.PathLike): fs.Dirent[] {
    viewCheck(p);
    return fs.readdirSync(p, { withFileTypes: true });
  },
  /** A link's own text (the link is not followed; its directory goes through the view). */
  readlink(p: fs.PathLike): string {
    viewCheckParent(p);
    return fs.readlinkSync(p, "utf8");
  },
  readText(p: fs.PathLike | number): string {
    viewCheck(p);
    return fs.readFileSync(p, "utf8");
  },
  readBytes(p: fs.PathLike | number): Buffer {
    viewCheck(p);
    return fs.readFileSync(p);
  },
  /** Note a path a decision uses without reading it (a realpath for "is it inside the project"). */
  note(p: string): void {
    try {
      viewCheck(p);
    } catch {
      /* recorded */
    }
  },
};
