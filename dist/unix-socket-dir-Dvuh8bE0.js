import fs from "node:fs";
import path from "node:path";
import os from "node:os";
/**
* A fresh private (0700) directory for Unix sockets whose names are at most `maxName` bytes:
* the first of XDG_RUNTIME_DIR, the system temp directory and /tmp where `<dir>/<name>` fits
* UNIX_SOCKET_PATH_MAX_BYTES. Throws, saying so, when none does.
*/
function privateSocketDir(prefix, o = {}) {
	const env = o.env ?? process.env;
	const maxName = o.maxName ?? 16;
	const bases = [
		env.XDG_RUNTIME_DIR,
		os.tmpdir(),
		"/tmp"
	].filter((b) => typeof b === "string" && b.trim() !== "");
	for (const base of new Set(bases)) {
		if (Buffer.byteLength(path.join(base, prefix)) + 6 + 1 + maxName > 100) continue;
		try {
			const dir = fs.mkdtempSync(path.join(base, prefix));
			fs.chmodSync(dir, 448);
			return dir;
		} catch {}
	}
	throw new Error(`no directory for Unix sockets: XDG_RUNTIME_DIR, the temp directory and /tmp are unusable or too long (a socket path is limited to 100 bytes here); set TMPDIR to a short directory`);
}
//#endregion
export { privateSocketDir as t };
