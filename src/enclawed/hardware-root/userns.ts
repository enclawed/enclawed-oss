// User namespaces and the hardware root (finding N16).
//
// Inside an unprivileged user namespace (`unshare -r`, bwrap, rootless containers) the uid a
// process sees is a mapped one, often 0. The broker socket used to be found by that uid, so a
// process in a namespace looked for a different owner than the host's, missed it, and opened the
// device itself: a second owner, interleaved frames, a genuine device latched DIRTY. Worse, the
// kernel still checks the device node against the HOST uid, so the open succeeded.
//
// So: the broker is found by the HOST uid (from /proc/self/uid_map), and a process outside the
// initial user namespace never opens a device node itself -- it may only reach the hardware root
// through the host's broker.
import fs from "node:fs";

function uidMap(): number[][] | null {
  try {
    return fs
      .readFileSync("/proc/self/uid_map", "utf8")
      .trim()
      .split("\n")
      .map((l) => l.trim().split(/\s+/).map(Number));
  } catch {
    return null;
  }
}

/** True when this process is in a user namespace other than the initial one (Linux). */
export function inNonInitialUserNamespace(): boolean {
  const m = uidMap();
  // The initial namespace maps every uid to itself: "0 0 4294967295".
  return (
    m !== null && !(m.length === 1 && m[0][0] === 0 && m[0][1] === 0 && m[0][2] === 4294967295)
  );
}

/** The HOST uid this process runs as (not the namespace-mapped one); null when unknown. */
export function hostUid(): number | null {
  const uid = process.getuid?.();
  if (typeof uid !== "number") {
    return null;
  }
  const m = uidMap();
  if (m === null) {
    return uid;
  }
  for (const [inside, outside, count] of m) {
    if (uid >= inside && uid < inside + count) {
      return outside + (uid - inside);
    }
  }
  return null; // unmapped: refuse to guess
}
