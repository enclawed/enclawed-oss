// Every tamper latch a host keeps, whatever number of devices wrote it.
//
// One device keeps its latch at the guard's state path. Several devices keep
// one latch each, beside it, named by the device. Earlier versions named those
// by the order the devices enumerated in. A latch belongs to the host, not to
// the device count: plugging in a second device, or unplugging one of two,
// must not be a way past a latched DIRTY. So every boot reads all of them.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type Latch = {
  path: string;
  status?: string;
  bound?: { serial?: string; pubkey?: string; uid?: string } | null;
  dirty?: { reason?: string } | null;
  sessionOpen?: boolean;
};

/** The file name of one device's latch when several devices are bound. */
export function memberLatchName(uid: string): string {
  return `.enclawed-hw-root.${uid.toLowerCase()}.state`;
}

const MEMBER = /^\.enclawed-hw-root\.[0-9a-f]{24}\.state$/;
// Named by enumeration order, as earlier versions wrote them.
const LEGACY = /^\.enclawed-hw-root\.\d+\.state$/;

/**
 * One latch file. Absent means nothing was latched there. ANYTHING else that stops it being read
 * -- a directory, a permission error, a truncated or corrupt file -- reads as DIRTY (finding H7):
 * breaking the file must never be a way to make the host look clean. (The device holds the
 * authoritative latch; these files are only its cache.)
 */
function read(p: string): Latch | null {
  let text: string;
  try {
    text = readFileSync(p, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    return {
      path: p,
      status: "DIRTY",
      dirty: {
        reason: `latch file unreadable (${(err as NodeJS.ErrnoException).code ?? "error"})`,
      },
    };
  }
  try {
    const v = JSON.parse(text) as Omit<Latch, "path">;
    if (
      !v ||
      typeof v !== "object" ||
      !["UNBOUND", "CLEAN", "DIRTY"].includes(v.status as string)
    ) {
      throw new Error("no status");
    }
    return { ...v, path: p };
  } catch {
    return { path: p, status: "DIRTY", dirty: { reason: "latch file corrupt" } };
  }
}

function matching(dir: string, re: RegExp): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => re.test(n))
      .toSorted()
      .map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

/**
 * Every latch on this host: the single-device one at `statePath`, each
 * device's own beside it, and any an earlier version left in `legacyDir`.
 */
export function hostLatches(statePath: string, legacyDir?: string): Latch[] {
  const paths = new Set([statePath, ...matching(path.dirname(statePath), MEMBER)]);
  if (legacyDir) {
    for (const p of matching(legacyDir, LEGACY)) {
      paths.add(p);
    }
  }
  return [...paths].map(read).filter((l): l is Latch => l !== null);
}

/** The first latch left DIRTY, or null. */
export function dirtyLatch(latches: Latch[]): Latch | null {
  return latches.find((l) => l.status === "DIRTY") ?? null;
}
