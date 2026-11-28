// Execute-only copies of the real programs the containment's wrappers start
// (./name-guard.c wrapper mode). Made here, on the host, before a run: the
// supervisor opens each copy outside the sandbox and hands it only to a
// wrapper; the view never shows it. Execute-only (no read or write bit for
// anyone), a program started from it is not dumpable, so no other process of
// the run opens its executable or descriptors through /proc.
//
// Each copy is keyed by the SHA-256 of the program's bytes and its prefix (the
// directory its lib and share sit in), and recorded with its inode, size and
// times when it is made: a copy that no longer matches its record is made
// again. The cache lives under the user's own cache directory, which no
// contained run is shown.

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRATCH = ["/tmp", "/dev/shm", "/run"];
const under = (p: string, d: string) => p === d || p.startsWith(`${d}/`);

/**
 * Where the copies are kept: the user's cache directory, unless that lies in a
 * scratch place (a contained run's own /tmp shows there, and the prefix links
 * beside each copy must stay visible): then a directory of this user's own in
 * /var/tmp, which must be the user's and writable by no one else.
 */
export function realCopiesDir(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  const base = xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), ".cache");
  const dir = path.join(base, "enclawed", "real");
  if (!SCRATCH.some((d) => under(path.resolve(dir), d) || under(path.resolve(dir), os.tmpdir()))) {
    return dir;
  }
  const own = `/var/tmp/enclawed-real-${process.getuid?.() ?? "u"}`;
  try {
    fs.mkdirSync(own, { mode: 0o700 });
  } catch {
    /* there already */
  }
  const st = fs.lstatSync(own);
  if (!st.isDirectory() || st.uid !== process.getuid?.() || (st.mode & 0o077) !== 0) {
    throw new Error(`${own} is not a directory of this user's own`);
  }
  return own;
}

type Record = { sha256: string; ino: string; size: string; mtimeNs: string; ctimeNs: string };

function recordOf(st: fs.BigIntStats, sha256: string): Record {
  return {
    sha256,
    ino: String(st.ino),
    size: String(st.size),
    mtimeNs: String(st.mtimeNs),
    ctimeNs: String(st.ctimeNs),
  };
}

/**
 * The execute-only copy of `program` (a real path) whose prefix is `prefix`:
 * an existing one when it still matches its record, else made now.
 */
export function realProgramCopy(program: string, prefix: string, dir = realCopiesDir()): string {
  const content = fs.readFileSync(program);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const key = createHash("sha256").update(`${sha256}\0${prefix}`).digest("hex").slice(0, 32);
  const bin = path.join(dir, key, "bin");
  const file = path.join(bin, path.basename(program));
  const side = `${file}.record.json`;
  try {
    const st = fs.lstatSync(file, { bigint: true });
    const rec = JSON.parse(fs.readFileSync(side, "utf8")) as Record;
    if (
      st.isFile() &&
      (Number(st.mode) & 0o7777) === 0o111 &&
      Number(st.uid) === process.getuid?.() &&
      JSON.stringify(rec) === JSON.stringify(recordOf(st, sha256))
    ) {
      return file;
    }
  } catch {
    /* none yet, or no longer as recorded */
  }
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  for (const p of [file, side]) {
    fs.rmSync(p, { force: true });
  }
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
    fs.fchmodSync(fd, 0o111);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
  const st = fs.lstatSync(file, { bigint: true });
  fs.writeFileSync(side, JSON.stringify(recordOf(st, sha256)), { mode: 0o400 });
  return file;
}
