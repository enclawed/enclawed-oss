// enclawed adapter kit: measuring what a session downloaded (M5, ./exec-taint.ts):
// a file's content digest, and the member list of a tar, gzip tar or zip
// archive read from the archive itself (no program is run to list it).

import { createHash } from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";

// Larger files are not hashed (the path rules still apply to them).
const MAX_DIGEST_BYTES = 256 * 1024 * 1024;
// Archives larger than this, or unpacking to more, are not listed: the
// destination tree written since is tainted instead.
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;

const digestCache = new Map<string, string>();

/** The SHA-256 of a regular file's content, or null (missing, not a file, too large). */
export function fileDigest(p: string): string | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(p);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size > MAX_DIGEST_BYTES) {
    return null;
  }
  const key = `${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
  const hit = digestCache.get(key);
  if (hit) {
    return hit;
  }
  try {
    const d = createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    if (digestCache.size > 4096) {
      digestCache.clear();
    }
    digestCache.set(key, d);
    return d;
  } catch {
    return null;
  }
}

/** The member paths an archive holds (tar, gzip-compressed tar, zip), or null when it cannot be listed. */
export function archiveMembers(file: string): string[] | null {
  let buf: Buffer;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_ARCHIVE_BYTES) {
      return null;
    }
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {
    return zipMembers(buf);
  }
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      buf = zlib.gunzipSync(buf, { maxOutputLength: MAX_UNPACKED_BYTES });
    } catch {
      return null;
    }
  }
  return tarMembers(buf);
}

function zipMembers(buf: Buffer): string[] | null {
  // End of central directory: the last 0x06054b50 within the final 64 KiB + 22 bytes.
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) {
      continue;
    }
    const count = buf.readUInt16LE(i + 10);
    let off = buf.readUInt32LE(i + 16);
    const out: string[] = [];
    for (let n = 0; n < count; n++) {
      if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) {
        return null;
      }
      const nameLen = buf.readUInt16LE(off + 28);
      const extraLen = buf.readUInt16LE(off + 30);
      const commentLen = buf.readUInt16LE(off + 32);
      const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
      if (!name.endsWith("/")) {
        out.push(name);
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }
  return null;
}

function tarMembers(buf: Buffer): string[] | null {
  const cstr = (b: Buffer, s: number, n: number) => {
    const z = b.indexOf(0, s);
    return b.toString("utf8", s, z >= 0 && z < s + n ? z : s + n);
  };
  const out: string[] = [];
  let off = 0;
  let longName: string | null = null;
  let paxPath: string | null = null;
  let headers = 0;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) {
      break;
    }
    // A header's checksum: the byte sum with the checksum field read as spaces.
    const stored = Number.parseInt(cstr(h, 148, 8).trim() || "x", 8);
    let sum = 0;
    for (let i = 0; i < 512; i++) {
      sum += i >= 148 && i < 156 ? 32 : h[i];
    }
    if (stored !== sum) {
      // Not a tar archive (or a damaged one): what was read so far, or unknown.
      return headers ? out : null;
    }
    headers++;
    const sizeField = h.subarray(124, 136);
    const size =
      (sizeField[0] & 0x80) !== 0
        ? Number(sizeField.readBigUInt64BE(4))
        : Number.parseInt(cstr(h, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 0x30);
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") {
      longName = cstr(body, 0, body.length);
      continue;
    }
    if (type === "x") {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString("utf8"));
      paxPath = m ? m[1] : null;
      continue;
    }
    if (type === "g" || type === "K") {
      continue;
    }
    const prefix = h.toString("latin1", 257, 262) === "ustar" ? cstr(h, 345, 155) : "";
    const name = paxPath ?? longName ?? (prefix ? `${prefix}/${cstr(h, 0, 100)}` : cstr(h, 0, 100));
    paxPath = null;
    longName = null;
    if (type !== "5") {
      out.push(name);
    }
  }
  return headers ? out : null;
}
