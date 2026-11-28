import { $ as EXEC_CONFIG_NAMES, d as EXEC_CONFIG_FILES, f as EXEC_CONFIG_PAIRS, n as PACKAGE_STATE, r as VENV_PACKAGE_PAIRS, t as IMPLICIT_EXEC_CACHES, u as EXEC_CONFIG_DIRS } from "./exec-caches-FmW8zVgK.js";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { createHash, randomBytes } from "node:crypto";
//#region src/enclawed/prebuilt/name-guard.generated.ts
const NAME_GUARD_PREBUILT = {
	sourceSha256: "782fa132474e780de9aa4d6018b1f4b8cb54f9aa79c7a872be32990b7861223c",
	binaries: {
		"linux-x64": "08d9cf547da6dc9d591bc439f030ad090a6dd71c974bd605367b95affe604475",
		"linux-arm64": null
	}
};
//#endregion
//#region src/enclawed/prebuilt/name-guard.ts
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
/** Where the prebuilt guard for an arch may be, relative to this module (source tree, bundle, package). */
function prebuiltCandidates(arch = process.arch) {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const rel = path.join("prebuilt", "name-guard", `linux-${arch}`, "name-guard");
	return [
		0,
		1,
		2,
		3,
		4
	].map((up) => path.join(here, "../".repeat(up), rel));
}
/** The digest recorded at build time for an arch, or null when none was built. */
function recordedGuardDigest(arch = process.arch) {
	return NAME_GUARD_PREBUILT.binaries[`linux-${arch}`] ?? null;
}
/**
* The prebuilt guard, checked byte for byte against the recorded digest and
* written as a fresh read-only copy in `stateDir/bin`: the copy holds exactly
* the verified bytes and is the file to execute. A binary that does not match
* is never used (the caller may still build from source).
*/
function prebuiltNameGuard(stateDir, o = {}) {
	const arch = o.arch ?? process.arch;
	if (process.platform !== "linux" && !o.candidates) return {
		ok: false,
		reason: `no prebuilt name guard for ${process.platform}`
	};
	const want = recordedGuardDigest(arch);
	if (!want) return {
		ok: false,
		reason: `no prebuilt name guard for linux-${arch}`
	};
	for (const file of o.candidates ?? prebuiltCandidates(arch)) {
		let bytes;
		try {
			bytes = fs.readFileSync(file);
		} catch {
			continue;
		}
		if (sha256(bytes) !== want) return {
			ok: false,
			reason: `the prebuilt name guard ${file} does not match the digest recorded at build time`
		};
		const dir = path.join(stateDir, "bin");
		fs.mkdirSync(dir, {
			recursive: true,
			mode: 448
		});
		const out = path.join(dir, `name-guard-${want.slice(0, 16)}-${process.pid}-${randomBytes(4).toString("hex")}`);
		fs.writeFileSync(out, bytes, {
			mode: 320,
			flag: "wx"
		});
		fs.chmodSync(out, 365);
		return {
			ok: true,
			binary: out,
			sha256: want
		};
	}
	return {
		ok: false,
		reason: `the prebuilt name guard for linux-${arch} is missing from this install`
	};
}
/** Before every exec: does the guard file still hold the verified bytes? null when it does, else why not. */
function nameGuardUnchanged(binary, digest) {
	try {
		return sha256(fs.readFileSync(binary)) === digest ? null : `the name guard ${binary} changed after it was verified`;
	} catch (err) {
		return `the name guard ${binary} cannot be read (${err.message})`;
	}
}
//#endregion
//#region src/enclawed/containment/name-guard.ts
/**
* The names the name guard protects in a contained run: the engine's single
* list of what configures what runs later (EXEC_CONFIG_NAMES), with the
* containment's own, less two kinds of name a contained run must still write:
* .git (git writes its objects, refs and index there; its hooks, config and
* info stay protected, EXEC_CONFIG_PAIRS) and package.json, with the .pth
* files of site directories (package installs write them).
*/
function guardedNames() {
	const uniq = (xs, key) => [...new Map(xs.map((x) => [key(x), x])).values()];
	const seqs = EXEC_CONFIG_NAMES.sequences;
	return {
		dirs: uniq([
			...EXEC_CONFIG_DIRS,
			...EXEC_CONFIG_NAMES.segments.filter((d) => d !== ".git"),
			...seqs.filter((q) => q.length === 1).map((q) => q[0])
		], (x) => x),
		files: uniq([...EXEC_CONFIG_FILES, ...EXEC_CONFIG_NAMES.files.filter((f) => f !== "package.json")], (x) => x),
		pairs: uniq([...EXEC_CONFIG_PAIRS.map(([a, b]) => [a, b]), ...seqs.filter((q) => q.length >= 2).map((q) => [q[q.length - 2], q[q.length - 1]])], ([a, b]) => `${a}/${b}`),
		suffixes: [...EXEC_CONFIG_NAMES.suffixes],
		affixes: EXEC_CONFIG_NAMES.affixes.map(([a, b]) => [a, b])
	};
}
/** Dependency trees nobody reads as configuration: names inside them are not refused. */
const NAME_GUARD_EXEMPT = [
	"node_modules",
	".venv",
	"venv",
	"__pypackages__"
];
let built = null;
const digests = /* @__PURE__ */ new Map();
/** The digest a guard binary had when this process made it ready (null: not one of ours). */
function nameGuardDigest(binary) {
	return digests.get(binary) ?? null;
}
function kernelSupports() {
	const m = /^(\d+)\.(\d+)/.exec(os.release());
	if (!m) return false;
	const [major, minor] = [Number(m[1]), Number(m[2])];
	return major > 5 || major === 5 && minor >= 19;
}
function sourcePath() {
	const here = path.dirname(fileURLToPath(import.meta.url));
	for (const p of [
		path.join(here, "name-guard.c"),
		path.join(here, "enclawed", "containment", "name-guard.c"),
		path.join(here, "..", "src", "enclawed", "containment", "name-guard.c")
	]) if (fs.existsSync(p)) return p;
	return null;
}
/**
* The guard binary: the prebuilt static one (../prebuilt/name-guard.ts,
* checked against the digest recorded at build time) when it was built from
* this very source; else built once per process from the shipped source
* into Enclawed's state directory (a fresh name each time, so nothing
* another process left there is ever run). Before every exec the caller
* checks the file still has the digest returned here (nameGuardUnchanged).
*/
function ensureNameGuard(stateDir) {
	if (built?.ok && fs.existsSync(built.binary)) return built;
	if (process.platform !== "linux" || !["x64", "arm64"].includes(process.arch)) return {
		ok: false,
		reason: `the name guard needs Linux on x64 or arm64 (${process.platform}/${process.arch})`
	};
	if (!kernelSupports()) return {
		ok: false,
		reason: `the name guard needs seccomp user notification with killable waits (Linux 5.19); this kernel is ${os.release()}`
	};
	const src = sourcePath();
	const sourceDigest = src ? createHash("sha256").update(fs.readFileSync(src)).digest("hex") : null;
	if (sourceDigest === null || sourceDigest === NAME_GUARD_PREBUILT.sourceSha256) {
		const pre = prebuiltNameGuard(stateDir);
		if (pre.ok) {
			digests.set(pre.binary, pre.sha256);
			built = {
				ok: true,
				binary: pre.binary,
				sha256: pre.sha256
			};
			return built;
		}
	}
	if (!src) return {
		ok: false,
		reason: "the name guard source is missing from this install"
	};
	const cc = [
		"/usr/bin/cc",
		"/usr/bin/gcc",
		"/usr/bin/clang"
	].find((p) => fs.existsSync(p));
	if (!cc) return {
		ok: false,
		reason: "building the name guard needs a C compiler (cc, gcc or clang)"
	};
	const digest = createHash("sha256").update(fs.readFileSync(src)).digest("hex").slice(0, 16);
	const dir = path.join(stateDir, "bin");
	fs.mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	const out = path.join(dir, `name-guard-${digest}-${process.pid}-${randomBytes(4).toString("hex")}`);
	try {
		execFileSync(cc, [
			"-O2",
			"-Wall",
			"-o",
			out,
			src
		], {
			stdio: [
				"ignore",
				"ignore",
				"pipe"
			],
			env: {
				PATH: "/usr/bin:/bin",
				LC_ALL: "C"
			},
			timeout: 6e4
		});
		fs.chmodSync(out, 365);
	} catch (err) {
		return {
			ok: false,
			reason: `the name guard did not build: ${(err.stderr?.toString() ?? String(err)).slice(0, 300)}`
		};
	}
	const sha256 = createHash("sha256").update(fs.readFileSync(out)).digest("hex");
	digests.set(out, sha256);
	built = {
		ok: true,
		binary: out,
		sha256
	};
	return built;
}
/** The supervisor's policy file: read-write roots, operator exceptions and the names refused. */
function nameGuardConfig(rwRoots, writable, gitExes = [], approvals = null, realPrograms = [], readPins = [], gitRefsWritable = true, kind = null, modeChanges = [], o = {}) {
	const projectScript = kind === "project-script";
	const build = o.build === true;
	return [
		...gitRefsWritable ? ["gitrefs 1"] : [],
		...projectScript ? ["file package.json"] : [],
		...modeChanges.map((m) => `modeok ${m}`),
		...(o.execPins ?? []).map((p) => `execpin ${p}`),
		...(o.protectPaths ?? []).filter((p) => !p.includes("\n")).map((p) => `protectpath ${p}`),
		...kind !== null && kind !== "package-install" ? [
			"pystartup 1",
			...IMPLICIT_EXEC_CACHES.dirs.map((d) => `xcachedir ${d}`),
			...IMPLICIT_EXEC_CACHES.suffixes.map((x) => `xcachesuffix ${x}`),
			...IMPLICIT_EXEC_CACHES.pairs.map(([a, b]) => `xcachepair ${a} ${b}`),
			...IMPLICIT_EXEC_CACHES.under.map(([a, b]) => `xcacheunder ${a} ${b}`),
			...IMPLICIT_EXEC_CACHES.files.map((f) => `xcachefile ${f}`),
			...VENV_PACKAGE_PAIRS.map(([a, b]) => `xcachepair ${a} ${b}`),
			"pmnodemodules 1",
			...PACKAGE_STATE.dirs.map((d) => `xcachedir ${d}`),
			...PACKAGE_STATE.pairs.map(([a, b]) => `xcachepair ${a} ${b}`),
			...PACKAGE_STATE.prefixes.map((x) => `xcacheprefix ${x}`),
			...PACKAGE_STATE.files.map((f) => `xcachefile ${f}`)
		] : [],
		...readPins.map((r) => `readpin ${r.sha256} ${r.path}`),
		...approvals ? [`approvals ${approvals}`] : [],
		...realPrograms.flatMap((r) => [`realview ${r.view}`, `realhost ${r.host}`]),
		...gitExes.map((g) => `gitexe ${g}`),
		...rwRoots.map((r) => `root ${r}`),
		...writable.map((w) => `allow ${w}`),
		...guardedNames().dirs.map((d) => `dir ${d}`),
		...guardedNames().files.map((f) => `file ${f}`),
		...guardedNames().pairs.map(([a, b]) => `pair ${a} ${b}`),
		...guardedNames().suffixes.map((x) => `suffix ${x}`),
		...guardedNames().affixes.map(([a, b]) => `affix ${a} ${b}`),
		...build ? [
			...BUILD_GUARDED_NAMES.dirs.map((d) => `dir ${d}`),
			...BUILD_GUARDED_NAMES.files.map((f) => `file ${f}`),
			...BUILD_GUARDED_NAMES.suffixes.map((x) => `suffix ${x}`),
			"commwrite 1"
		] : NAME_GUARD_EXEMPT.map((x) => `exempt ${x}`),
		""
	].join("\n");
}
/**
* What a contained build's name guard refuses besides guardedNames(): every
* path inside a .git directory (hooks of submodules and worktrees, config,
* objects and refs: a build changes no repository), package.json (its
* scripts run at the next install, on the host) and every .pth file (Python
* runs a site directory's .pth import lines at each start; a build writes
* none). Coarser than the engine's own rules on purpose: unread code gets
* the strictest form.
*/
const BUILD_GUARDED_NAMES = {
	dirs: [".git"],
	files: ["package.json"],
	suffixes: [".pth"]
};
/** Identity of an inode as the journal records it. */
function inodeKey(st) {
	return `${st.dev}:${st.ino}:${st.birthtimeNs}`;
}
/**
* Every inode the contained process created or opened for writing, from the
* journal (written by the supervisor before each call returns, so after the
* sandbox is frozen it is complete).
*/
function readJournal(file) {
	const out = /* @__PURE__ */ new Set();
	let text = "";
	try {
		text = fs.readFileSync(file, "utf8");
	} catch {
		return out;
	}
	for (const line of text.split("\n")) {
		if (/^[GCAV] /.test(line)) continue;
		const [dev, ino, sec, nsec] = line.split(" ");
		if (dev && ino && sec !== void 0 && nsec !== void 0) out.add(`${dev}:${ino}:${BigInt(sec) * 1000000000n + BigInt(nsec)}`);
	}
	return out;
}
//#endregion
export { readJournal as a, nameGuardDigest as i, inodeKey as n, nameGuardUnchanged as o, nameGuardConfig as r, ensureNameGuard as t };
