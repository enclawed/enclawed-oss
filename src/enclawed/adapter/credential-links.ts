// enclawed adapter kit: other names of a secret file. A hard link has the
// secret's content under an unrelated name (realpath does not see it), and a
// symbolic link below a directory that a recursive read searches leads the
// reader into a secret store. Both are found by what the file system says
// (device and inode; the link's real target), never by name. The callers
// (./credentials.ts for the user's credential stores, ./path-rules.ts for
// Enclawed's and the agent CLI's secrets) say which files are secret.

import fs from "node:fs";
import path from "node:path";

/** A secret a link reaches: the secret's path and what it is. */
export type LinkHit = Readonly<{ path: string; what: string }>;

/** Where secret files are, and which files there are secret. */
export type SecretRoots = ReadonlyArray<
  Readonly<{ path: string; include: (p: string) => boolean }>
>;

// The secret stores are small; past this many entries the index is incomplete.
const INDEX_BUDGET = 50_000;
// A recursive read's directory walk (directory entries, not stat calls).
export const LINK_WALK_BUDGET = 300_000;

type SecretInode = { path: string; nlink: number };
type SecretIndex = { map: Map<string, SecretInode>; complete: boolean };

const keyOf = (st: Pick<fs.Stats, "dev" | "ino">) => `${st.dev}:${st.ino}`;

/**
 * The device and inode of every secret regular file below `roots` (a root's
 * own symbolic link is followed; links below it are not), with its link
 * count. Built for each decision that needs it: a secret replaced since (a
 * new inode) or linked since (a higher link count) is seen as it is now.
 */
function secretIndex(roots: SecretRoots): SecretIndex {
  const map = new Map<string, SecretInode>();
  let left = INDEX_BUDGET;
  for (const root of roots) {
    let start: string;
    try {
      start = fs.realpathSync(root.path);
    } catch {
      continue; // not there
    }
    const stack = [start];
    while (stack.length) {
      const p = stack.pop() as string;
      if (--left < 0) {
        return { map, complete: false };
      }
      let st: fs.Stats;
      try {
        st = fs.lstatSync(p);
      } catch {
        continue;
      }
      if (st.isFile()) {
        if (root.include(p) && !map.has(keyOf(st))) {
          map.set(keyOf(st), { path: p, nlink: st.nlink });
        }
      } else if (st.isDirectory()) {
        try {
          for (const n of fs.readdirSync(p)) {
            stack.push(path.join(p, n));
          }
        } catch {
          /* unreadable: nothing the agent can read through a link either */
        }
      }
    }
  }
  return { map, complete: true };
}

/**
 * Is the regular file at `real` another name (a hard link) of a secret file?
 * Only a file with more than one link can be. When the secret stores were too
 * large to index, a multiply-linked file is a hit: it cannot be ruled out.
 */
export function hardLinkedSecret(real: string, roots: SecretRoots, what: string): LinkHit | null {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(real);
  } catch {
    return null;
  }
  if (!st.isFile() || st.nlink <= 1) {
    return null;
  }
  const ix = secretIndex(roots);
  const hit = ix.map.get(keyOf(st));
  if (hit) {
    return { path: hit.path, what: `${what} (the target is another name for it, a hard link)` };
  }
  return ix.complete
    ? null
    : {
        path: real,
        what: "a file with several names (hard links) that may be a secret (the secret stores are too large to rule it out)",
      };
}

const lexicallyInside = (dir: string, p: string) => {
  const rel = path.relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/**
 * Does a recursive read of `dir` reach a secret through a link below it? A
 * symbolic link whose real target is a secret, or holds one (`classify`), is
 * a hit, and a link to a directory elsewhere is searched too (a reader that
 * follows links reads it); a regular file that is a hard link of a secret is
 * a hit. Hard links are looked for only when some secret file has more than
 * one name (or the secret stores could not all be indexed), so the common
 * case costs one directory listing per directory. Too large to walk: a hit.
 */
export function linkedSecretBelow(
  dir: string,
  roots: SecretRoots,
  classify: (real: string) => LinkHit | null,
  what: string,
  budget = LINK_WALK_BUDGET,
): LinkHit | null {
  let start: string;
  try {
    start = fs.realpathSync(dir);
    if (!fs.statSync(start).isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }
  const ix = secretIndex(roots);
  const aliased = new Set([...ix.map].filter(([, v]) => v.nlink > 1).map(([k]) => k));
  const wantInodes = aliased.size > 0 || !ix.complete;
  // Every directory tree walked: a link whose target lies (by name) inside
  // one is walked there, its own links included.
  const bases = [start];
  const seen = new Set<string>([start]);
  const stack = [start];
  let left = budget;
  while (stack.length) {
    const d = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (--left < 0) {
        return {
          path: dir,
          what: "a directory too large to check for links to secret files",
        };
      }
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) {
        let target: string;
        try {
          target = path.resolve(d, fs.readlinkSync(p));
        } catch {
          continue;
        }
        if (bases.some((b) => lexicallyInside(b, target))) {
          continue; // walked where it is (any link on its way is a link of a walked tree)
        }
        let real: string;
        try {
          real = fs.realpathSync(p);
        } catch {
          continue; // dangling: reads nothing
        }
        const hit = classify(real);
        if (hit) {
          return { path: hit.path, what: `${hit.what} (through the symbolic link ${p})` };
        }
        try {
          if (!seen.has(real) && fs.statSync(real).isDirectory()) {
            seen.add(real);
            bases.push(real);
            stack.push(real);
          } else if (wantInodes) {
            const h = hardLinkedSecret(real, roots, what);
            if (h) {
              return h;
            }
          }
        } catch {
          /* gone */
        }
      } else if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile() && wantInodes) {
        let st: fs.Stats;
        try {
          st = fs.lstatSync(p);
        } catch {
          continue;
        }
        if (st.nlink > 1) {
          const hit = ix.map.get(keyOf(st));
          if (hit) {
            return {
              path: hit.path,
              what: `${what} (${p} is another name for it, a hard link)`,
            };
          }
          if (!ix.complete) {
            return {
              path: p,
              what: "a file with several names (hard links) that may be a secret (the secret stores are too large to rule it out)",
            };
          }
        }
      }
    }
  }
  return null;
}
