// Unix socket paths are limited (108 bytes on Linux, 104 on macOS, counting the
// terminating NUL). Directories for sockets are chosen so every socket fits,
// instead of failing to listen under a long TMPDIR.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The longest Unix socket path every platform accepts (macOS: 104 bytes with the NUL), with a
 * margin; and the longest session root that leaves room under it for a session directory
 * (`s-XXXXXX`, `a-XXXXXX`) and a socket name (`ctl.sock`, `relay.sock`).
 */
export const UNIX_SOCKET_PATH_MAX_BYTES = 100;
export const SESSION_ROOT_MAX_BYTES = UNIX_SOCKET_PATH_MAX_BYTES - 28;

/**
 * A fresh private (0700) directory for Unix sockets whose names are at most `maxName` bytes:
 * the first of XDG_RUNTIME_DIR, the system temp directory and /tmp where `<dir>/<name>` fits
 * UNIX_SOCKET_PATH_MAX_BYTES. Throws, saying so, when none does.
 */
export function privateSocketDir(
  prefix: string,
  o: Readonly<{ env?: Readonly<Record<string, string | undefined>>; maxName?: number }> = {},
): string {
  const env = o.env ?? process.env;
  const maxName = o.maxName ?? 16;
  const bases = [env.XDG_RUNTIME_DIR, os.tmpdir(), "/tmp"].filter(
    (b): b is string => typeof b === "string" && b.trim() !== "",
  );
  for (const base of new Set(bases)) {
    // mkdtemp appends six characters; then "/" and the socket name.
    if (Buffer.byteLength(path.join(base, prefix)) + 6 + 1 + maxName > UNIX_SOCKET_PATH_MAX_BYTES) {
      continue;
    }
    try {
      const dir = fs.mkdtempSync(path.join(base, prefix));
      fs.chmodSync(dir, 0o700);
      return dir;
    } catch {
      /* the next base */
    }
  }
  throw new Error(
    `no directory for Unix sockets: XDG_RUNTIME_DIR, the temp directory and /tmp are unusable or ` +
      `too long (a socket path is limited to ${UNIX_SOCKET_PATH_MAX_BYTES} bytes here); set TMPDIR to a short directory`,
  );
}
