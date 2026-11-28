import fs from "node:fs";
//#region src/enclawed/hardware-root/userns.ts
function uidMap() {
	try {
		return fs.readFileSync("/proc/self/uid_map", "utf8").trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
	} catch {
		return null;
	}
}
/** True when this process is in a user namespace other than the initial one (Linux). */
function inNonInitialUserNamespace() {
	const m = uidMap();
	return m !== null && !(m.length === 1 && m[0][0] === 0 && m[0][1] === 0 && m[0][2] === 4294967295);
}
/** The HOST uid this process runs as (not the namespace-mapped one); null when unknown. */
function hostUid() {
	const uid = process.getuid?.();
	if (typeof uid !== "number") return null;
	const m = uidMap();
	if (m === null) return uid;
	for (const [inside, outside, count] of m) if (uid >= inside && uid < inside + count) return outside + (uid - inside);
	return null;
}
//#endregion
export { inNonInitialUserNamespace as n, hostUid as t };
