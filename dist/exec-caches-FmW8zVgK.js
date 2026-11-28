import { n as scan } from "./dlp-scanner-CAEHT3p2.js";
import { t as quoteUntrusted } from "./untrusted-CVKPzaNH.js";
import { s as resolveRequestShape, t as GENERIC_SHAPE } from "./request-shape-CUn8Io5f.js";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";
//#region src/enclawed/adapter/types.ts
/** Every reason Enclawed writes starts with this, so a person can tell its prompts and refusals apart. */
const REASON_PREFIX = "Enclawed: ";
/** Every exec-config name, as data (lower case, NFC). */
const EXEC_CONFIG_NAMES = {
	segments: [
		".git",
		".hg",
		".sl",
		".jj",
		".github",
		".husky",
		".githooks",
		".lefthook",
		".lefthook-local",
		".devcontainer",
		".idx",
		".direnv",
		".mise",
		".claude",
		".codex",
		".gemini",
		".cursor",
		".kiro",
		".opencode",
		".amp",
		".clinerules",
		".roo",
		".windsurf",
		".amazonq",
		".continue",
		".kilocode",
		".junie",
		".trae",
		".qwen",
		".crush",
		".factory",
		".augment",
		".vscode",
		".idea",
		".fleet",
		".zed",
		".theia"
	],
	files: [
		".mcp.json",
		"mcp.json",
		"mcp_config.json",
		"mcp_settings.json",
		"cline_mcp_settings.json",
		"opencode.json",
		"opencode.jsonc",
		"crush.json",
		".crush.json",
		".aider.conf.yml",
		".aider.conf.yaml",
		".envrc",
		".autoenv.zsh",
		".autoenv_leave.zsh",
		".env.leave",
		"mise.toml",
		".mise.toml",
		"rtx.toml",
		".rtx.toml",
		".gitmodules",
		".gitattributes",
		".npmrc",
		".yarnrc",
		".yarnrc.yml",
		".pnpmfile.cjs",
		"package.json",
		"bunfig.toml",
		".bunfig.toml",
		".pre-commit-config.yaml",
		".pre-commit-config.yml",
		".overcommit.yml",
		...["", "."].flatMap((dot) => ["lefthook", "lefthook-local"].flatMap((n) => [
			"yml",
			"yaml",
			"toml",
			"json",
			"jsonc"
		].map((ext) => `${dot}${n}.${ext}`))),
		".lintstagedrc",
		".lintstagedrc.json",
		".lintstagedrc.yaml",
		".lintstagedrc.yml",
		".lintstagedrc.js",
		".lintstagedrc.mjs",
		".lintstagedrc.cjs",
		"lint-staged.config.js",
		"lint-staged.config.mjs",
		"lint-staged.config.cjs",
		".devcontainer.json",
		".gitpod.yml",
		".gitpod.yaml",
		".replit",
		"replit.nix",
		".exrc",
		".nvimrc",
		".nvim.lua",
		".vimrc",
		".gvimrc",
		".lvimrc",
		".lazy.lua",
		"sitecustomize.py",
		"usercustomize.py",
		"rust-toolchain",
		"rust-toolchain.toml",
		".tool-versions",
		".python-version",
		".ruby-version",
		".node-version",
		".nvmrc",
		".java-version",
		".sdkmanrc",
		"pnpm-workspace.yaml",
		".pnp.js",
		"gradle.properties",
		".sbtopts",
		".jvmopts",
		"global.json",
		"directory.build.props",
		"directory.build.targets",
		"directory.packages.props",
		"nuget.config",
		"go.work",
		".irbrc",
		".pryrc",
		".pdbrc",
		".user.ini"
	],
	suffixes: [
		".mcp.json",
		".code-workspace",
		".theia-workspace"
	],
	suffixesBelow: [["site-packages", ".pth"], ["dist-packages", ".pth"]],
	affixes: [
		["mise.", ".toml"],
		[".mise.", ".toml"],
		["rtx.", ".toml"],
		[".rtx.", ".toml"]
	],
	sequences: [
		[".cargo", "config"],
		[".cargo", "config.toml"],
		[".config", "mise"],
		[".config", "mise.toml"],
		["mise", "config.toml"],
		[".config", "gh"],
		[
			".local",
			"share",
			"gh"
		],
		["github cli"]
	]
};
/** The plain names of EXEC_CONFIG_NAMES (kept for callers of the older lists). */
const EXEC_CONFIG_SEGMENTS = EXEC_CONFIG_NAMES.segments;
const EXEC_CONFIG_FILES$1 = EXEC_CONFIG_NAMES.files;
const HOST_PLATFORM = process.platform === "win32" ? "win32" : "posix";
const SHORT_NAME = /~\d/;
const DRIVE = /^[a-z]:$/;
/**
* The components of `absPath` as the names a file system compares (lower
* case, NFC), or null when a component cannot be named with certainty (the
* caller then treats the path as exec-config). On every platform each
* component is matched without its trailing dots and spaces: Windows, and a
* Windows file system mounted elsewhere (WSL's /mnt/c, SMB, vfat, exFAT,
* NTFS), opens `.mcp.json.` and `.github ` as `.mcp.json` and `.github`; on
* another file system such a name is only an odd name, and asking for it
* costs nothing. A name made only of dots and spaces (not `.` or `..`)
* refuses. A `:` after the drive (an alternate data stream such as
* `.mcp.json::$DATA`) refuses on Windows; elsewhere the name is matched as
* what comes before its first `:` too. With Windows rules (`platform:
* "win32"`, also for a path on a Windows file system), an unresolved short
* name (`CLAUDE~1`) refuses.
*/
function execConfigParts(absPath, how = {}) {
	const parts = absPath.normalize("NFC").toLowerCase().split(/[\\/]+/);
	const win = (how.platform ?? HOST_PLATFORM) === "win32";
	const out = [];
	let prefix = true;
	for (const raw of parts) {
		if (prefix && (raw === "" || win && (raw === "?" || raw === "."))) {
			out.push(raw);
			continue;
		}
		if (prefix && win && DRIVE.test(raw)) {
			prefix = false;
			out.push(raw);
			continue;
		}
		prefix = false;
		if (raw === "" || raw === "." || raw === "..") {
			out.push(raw);
			continue;
		}
		if (win && raw.includes(":")) return null;
		const name = raw.replace(/[. ]+$/, "");
		if (name === "") return null;
		if (win && !how.resolved && SHORT_NAME.test(name)) return null;
		const colon = name.indexOf(":");
		if (colon >= 0) {
			const stem = name.slice(0, colon).replace(/[. ]+$/, "");
			if (stem === "") return null;
			out.push(stem);
		}
		out.push(name);
	}
	return out;
}
function nameIsExecConfig(base, extraFiles) {
	return EXEC_CONFIG_FILES$1.includes(base) || extraFiles.includes(base) || EXEC_CONFIG_NAMES.suffixes.some((x) => base.endsWith(x) && base !== x) || EXEC_CONFIG_NAMES.affixes.some(([a, z]) => base.startsWith(a) && base.endsWith(z) && base.length >= a.length + z.length);
}
function isExecConfigPath(absPath, extra = {}, how = {}) {
	const parts = execConfigParts(absPath, how);
	if (parts === null) return true;
	const segs = new Set([...EXEC_CONFIG_SEGMENTS, ...(extra?.segments ?? []).map((s) => s.toLowerCase())]);
	if (parts.some((p) => segs.has(p))) return true;
	if (EXEC_CONFIG_NAMES.sequences.some((seq) => parts.some((_, i) => seq.every((s, k) => parts[i + k] === s)))) return true;
	const last = parts.findLast(Boolean) ?? "";
	const colon = last.indexOf(":");
	const bases = colon < 0 ? [last] : [last, last.slice(0, colon).replace(/[. ]+$/, "")];
	const extraFiles = (extra?.files ?? []).map((s) => s.toLowerCase());
	return bases.some((base) => EXEC_CONFIG_NAMES.suffixesBelow.some(([d, x]) => base.endsWith(x) && base !== x && parts.slice(0, -1).includes(d)) || nameIsExecConfig(base, extraFiles));
}
/**
* A write target given as the agent named it (`abs`) and as the file system
* resolves it (`real`, realpathNearest: the final path of its existing part).
* Either form naming exec-config makes it exec-config. A short name in `abs`
* is left to `real`, which resolved it when it names an existing file (a new
* component is created under its literal name).
*/
function isExecConfigTarget(abs, real, extra = {}, platform, windowsFs = false) {
	if (windowsFs) return isExecConfigPath(abs, extra, { platform: "win32" }) || real !== null && real !== "" && isExecConfigPath(real, extra, { platform: "win32" });
	const resolved = real !== null && real !== "";
	return isExecConfigPath(abs, extra, {
		platform,
		resolved
	}) || resolved && isExecConfigPath(real, extra, {
		platform,
		resolved: true
	});
}
/**
* A directory whose files configure what runs later: one named by an
* exec-config segment (.git, .claude, ...), one inside it, or a directory on
* the way to an exec-config sequence (.cargo, .config). Removing it removes
* that configuration.
*/
function isExecConfigDir(absDir, extra = {}) {
	const parts = execConfigParts(absDir);
	if (parts === null) return true;
	const base = parts.findLast(Boolean) ?? "";
	return isExecConfigPath(absDir, extra) || isExecConfigPath(`${absDir}/x`, extra) || EXEC_CONFIG_NAMES.sequences.some((seq) => seq.length > 1 && seq[0] === base);
}
const BUILD_FILES = new Set([
	"makefile",
	"gnumakefile",
	"makefile.am",
	"makefile.in",
	"cmakelists.txt",
	"cmakepresets.json",
	"cmakeuserpresets.json",
	"meson.build",
	"meson_options.txt",
	"meson.options",
	"build.gradle",
	"build.gradle.kts",
	"settings.gradle",
	"settings.gradle.kts",
	"pom.xml",
	"setup.py",
	"setup.cfg",
	"pyproject.toml",
	"build.rs",
	"cargo.toml",
	"configure.ac",
	"configure.in",
	"sconstruct",
	"sconscript",
	"build",
	"build.bazel",
	"workspace",
	"workspace.bazel",
	"module.bazel",
	"justfile",
	".justfile",
	"taskfile.yml",
	"taskfile.yaml"
]);
const BUILD_EXTENSIONS = [".mk", ".cmake"];
/** A build file: what a build reads to know what to run (Makefile, CMakeLists.txt, pyproject.toml, ...). */
function isBuildFilePath(p) {
	const base = p.normalize("NFC").toLowerCase().split(/[\\/]+/).findLast(Boolean) ?? "";
	return BUILD_FILES.has(base) || BUILD_EXTENSIONS.some((x) => base.endsWith(x) && base !== x);
}
function allow(codes, why, capability) {
	return {
		outcome: "allow",
		reason: `${REASON_PREFIX}reversible (${why})`,
		codes,
		capability,
		reversible: true
	};
}
function deny(codes, why, capability) {
	return {
		outcome: "deny",
		reason: `${REASON_PREFIX}${why}`,
		codes,
		capability,
		reversible: null
	};
}
const upperFirst = (s) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
/**
* An irreversible action: pre-approved by the operator, refused where no
* person can be asked, otherwise asked.
*/
function irreversible(codes, why, capability, event, policy) {
	if (event.policyIds.some((id) => policy.preApprovedIrreversibleTools.has(id))) return {
		outcome: "allow",
		reason: `${REASON_PREFIX}irreversible, pre-approved by enclawed.policy.preApprovedIrreversibleTools: ${why}`,
		codes: [...codes, "pre-approved"],
		capability,
		reversible: false
	};
	if (event.approvalRoute === "no-person") {
		const mode = event.hostMode ?? "headless";
		return {
			outcome: "deny",
			reason: `${REASON_PREFIX}irreversible action needs a person, and this session (${quoteUntrusted(mode, { max: 40 })}) cannot ask one: ${why}`,
			codes: [...codes, `no-person:${mode}`],
			capability,
			reversible: false
		};
	}
	return {
		outcome: "ask",
		reason: `${REASON_PREFIX}irreversible action, approve only if intended. ${upperFirst(why)}`,
		codes,
		capability,
		reversible: false
	};
}
/**
* An action only a person may approve, each time: never pre-approved by
* policy, refused where no person can be asked, otherwise asked.
*/
function personOnly(codes, why, capability, event) {
	if (event.approvalRoute === "no-person") {
		const mode = event.hostMode ?? "headless";
		return {
			outcome: "deny",
			reason: `${REASON_PREFIX}this needs a person, and this session (${quoteUntrusted(mode, { max: 40 })}) cannot ask one: ${why}`,
			codes: [...codes, `no-person:${mode}`],
			capability,
			reversible: false
		};
	}
	return {
		outcome: "ask",
		reason: `${REASON_PREFIX}approve only if you asked for this. ${upperFirst(why)}`,
		codes,
		capability,
		reversible: false
	};
}
//#endregion
//#region src/enclawed/adapter/venv-trust.ts
function memoryVenvTrustStore() {
	const m = /* @__PURE__ */ new Map();
	return {
		trusted: (d) => m.get(d) ?? null,
		trust: (d, f) => {
			m.set(d, f);
		}
	};
}
function readStore(file) {
	try {
		const v = JSON.parse(fs.readFileSync(file, "utf8"));
		if (v && typeof v === "object" && !Array.isArray(v)) {
			const out = {};
			for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
			return out;
		}
	} catch {}
	return {};
}
/** The store's file in Enclawed's state directory (the script container's and the engine's). */
function venvTrustFile(stateDir) {
	return path.join(stateDir, "venv-trust.json");
}
/** A store in a file of Enclawed's own state (never in a project). */
function fileVenvTrustStore(file) {
	return {
		trusted: (d) => readStore(file)[d] ?? null,
		trust: (d, f) => recordVenvTrust(file, d, f)
	};
}
/** Record a fingerprint in the store file (atomically). */
function recordVenvTrust(file, dir, fingerprint) {
	const cur = readStore(file);
	cur[dir] = fingerprint;
	fs.mkdirSync(path.dirname(file), {
		recursive: true,
		mode: 448
	});
	const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
	fs.writeFileSync(tmp, `${JSON.stringify(cur, null, 1)}\n`, { mode: 384 });
	fs.renameSync(tmp, file);
}
/** Forget an environment's trust (a contained run changed its packages anyway). */
function revokeVenvTrust(file, dir) {
	const cur = readStore(file);
	if (!(dir in cur)) return;
	delete cur[dir];
	fs.mkdirSync(path.dirname(file), {
		recursive: true,
		mode: 448
	});
	const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
	fs.writeFileSync(tmp, `${JSON.stringify(cur, null, 1)}\n`, { mode: 384 });
	fs.renameSync(tmp, file);
}
const MAX_ENTRIES = 4e5;
/**
* The fingerprint of a virtual environment `dir`: its pyvenv.cfg and every
* entry below its lib* (site-packages, its .pth files and dist-info entry
* points included), bin, Scripts and include directories, less bytecode
* cache directories (__pycache__); every entry by its identity, size and
* modification and change times. null: it could not
* be read whole.
*/
function venvFingerprint(dir) {
	const lines = [];
	let budget = MAX_ENTRIES;
	const entry = (p) => {
		let st;
		try {
			st = fs.lstatSync(p, { bigint: true });
		} catch {
			return false;
		}
		const rel = path.relative(dir, p);
		const kind = st.isSymbolicLink() ? "l" : st.isDirectory() ? "d" : st.isFile() ? "f" : "o";
		let target = "";
		if (kind === "l") try {
			target = fs.readlinkSync(p);
		} catch {
			return false;
		}
		lines.push(kind === "d" ? `d\0${rel}\0${st.mode}` : `${kind}\0${rel}\0${st.size}\0${st.mtimeNs}\0${st.ctimeNs}\0${st.ino}\0${st.mode}\0${target}`);
		if (kind === "d") {
			let names;
			try {
				names = fs.readdirSync(p);
			} catch {
				return false;
			}
			for (const n of names) {
				if (n === "__pycache__") continue;
				if (--budget < 0 || !entry(path.join(p, n))) return false;
			}
		}
		return true;
	};
	if (!entry(path.join(dir, "pyvenv.cfg"))) return null;
	let tops;
	try {
		tops = fs.readdirSync(dir).filter((n) => /^(?:lib.*|bin|scripts|include)$/i.test(n));
	} catch {
		return null;
	}
	for (const t of tops) if (!entry(path.join(dir, t))) return null;
	lines.sort();
	return createHash("sha256").update(lines.join("\n")).digest("hex");
}
//#endregion
//#region src/enclawed/containment/build-mode.ts
/** Directories the containment finds programs in (./plan.ts PROGRAM_DIRS). */
const BUILD_PROGRAM_DIRS = [
	"/usr/local/bin",
	"/usr/bin",
	"/bin",
	"/usr/sbin",
	"/sbin"
];
/**
* The toolchain a build may run besides the project-script tools: build
* systems, compilers, binutils and what build scripts commonly call. A name
* this host does not have is left out; a build that needs something missing
* fails, which changes nothing.
*/
const BUILD_TOOLCHAIN_PROGRAMS = [
	"cmake",
	"ctest",
	"cpack",
	"make",
	"gmake",
	"ninja",
	"ninja-build",
	"samu",
	"meson",
	"cargo",
	"rustc",
	"rustdoc",
	"cargo-clippy",
	"clippy-driver",
	"rustfmt",
	"cargo-fmt",
	"go",
	"gofmt",
	"cc",
	"c++",
	"cpp",
	"gcc",
	"g++",
	"clang",
	"clang++",
	"gfortran",
	"f95",
	"ld",
	"ld.bfd",
	"ld.gold",
	"ld.lld",
	"lld",
	"as",
	"ar",
	"ranlib",
	"nm",
	"objcopy",
	"objdump",
	"strip",
	"readelf",
	"size",
	"strings",
	"c++filt",
	"addr2line",
	"gcc-ar",
	"gcc-nm",
	"gcc-ranlib",
	"pkg-config",
	"pkgconf",
	"python3",
	"perl",
	"install",
	"m4",
	"bison",
	"flex",
	"patch",
	"file",
	"nproc",
	"getconf",
	"hostname",
	"git",
	"ccache"
];
/**
* The read-only system trees a toolchain loads besides its programs' own
* libraries: headers, compiler internals (cc1, collect2, crt files, libgcc),
* static and shared libraries, CMake's modules and package files.
*/
const BUILD_TOOLCHAIN_DIRS = [
	"/usr/bin",
	"/usr/sbin",
	"/usr/include",
	"/usr/lib",
	"/usr/lib32",
	"/usr/lib64",
	"/usr/libexec",
	"/usr/share"
];
/**
* Where vendor toolchains install themselves (CUDA in /usr/local/cuda-*,
* MPICH or Open MPI in /usr/local/<name>, /opt/rocm, /opt/intel,
* /opt/nvidia/hpc_sdk): each entry of these directories is offered to a
* build read-only, a link (/usr/local/cuda -> /etc/alternatives/cuda ->
* /usr/local/cuda-13.1) with the links it goes through, unless it holds a
* file that may hold a credential (buildToolchainTrees). /usr/local/etc and
* /usr/local/src are configuration and sources, not toolchains: never.
*/
const BUILD_TOOLCHAIN_PARENTS = ["/usr/local", "/opt"];
const NOT_TOOLCHAIN = new Set([
	"etc",
	"src",
	"games"
]);
/** Environment of every contained build: the tools that could reach the network told they cannot. */
const BUILD_ENV = {
	CARGO_NET_OFFLINE: "true",
	GOPROXY: "off",
	GOTOOLCHAIN: "local",
	GOFLAGS: "-mod=readonly"
};
/** Mount points of this host (from /proc/self/mountinfo), or null when they cannot be read. */
function hostMountPoints() {
	try {
		return fs.readFileSync("/proc/self/mountinfo", "utf8").split("\n").map((l) => l.split(" ")[4]).filter((p) => typeof p === "string" && p.startsWith("/")).map((p) => p.replace(/\\040/g, " "));
	} catch {
		return null;
	}
}
/**
* The toolchain trees of this host as directories to bind read-only. A tree
* with another file system mounted below it (WSL mounts its GPU drivers under
* /usr/lib) cannot be bound whole from a user namespace (the kernel refuses
* a bind that would uncover what the inner mount hides): its subdirectories
* are bound instead, each one holding a mount point split again, and the
* mount points themselves are left out. Files directly in such a tree are
* left out too (a build that needs one fails, which changes nothing).
*/
function buildToolchainDirs(dirs = BUILD_TOOLCHAIN_DIRS) {
	const mounts = hostMountPoints() ?? [];
	const isDir = (p) => {
		try {
			return fs.lstatSync(p).isDirectory();
		} catch {
			return false;
		}
	};
	const out = [];
	const add = (d, depth) => {
		if (!isDir(d) || mounts.includes(d)) return;
		if (!mounts.some((m) => m.startsWith(`${d}/`))) {
			out.push(d);
			return;
		}
		if (depth > 4) return;
		let names = [];
		try {
			names = fs.readdirSync(d).toSorted();
		} catch {
			return;
		}
		for (const n of names) add(path.join(d, n), depth + 1);
	};
	for (const d of dirs) add(d, 0);
	return out;
}
/**
* A file name that may hold a credential (private keys, key stores, token
* files, environment files): a tree holding one is not offered to a build.
* A .pem or .key file only when it holds a private key (toolchains ship CA
* bundles and public certificates).
*/
const CREDENTIAL_NAME = /^(?:\.env(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519|xmss)(?:_sk)?|\.netrc|\.pgpass|\.git-credentials|\.npmrc|\.pypirc|\.htpasswd|credentials(?:\.json|\.toml|\.yml|\.yaml)?|.*\.(?:p12|pfx|jks|keystore|kdbx|ppk|ovpn|gpg))$/i;
const KEY_FILE = /\.(?:pem|key)$/i;
/** Whether `p` (a file) may hold a credential, by its name (and, for .pem/.key, a private key in it). */
function credentialFile(p) {
	const base = path.basename(p);
	if (/\.env\.(?:example|sample|template|dist|defaults)$/i.test(base)) return false;
	if (CREDENTIAL_NAME.test(base)) return true;
	if (KEY_FILE.test(base)) try {
		const fd = fs.openSync(p, "r");
		try {
			const buf = Buffer.alloc(64 * 1024);
			const n = fs.readSync(fd, buf, 0, buf.length, 0);
			return /PRIVATE KEY/.test(buf.subarray(0, n).toString("latin1"));
		} finally {
			fs.closeSync(fd);
		}
	} catch {
		return true;
	}
	return false;
}
/** A tree that holds no credential file (bounded walk, links not followed); false when too large to tell. */
function credentialFree(root, maxEntries = 4e5) {
	let left = maxEntries;
	const stack = [root];
	while (stack.length) {
		const d = stack.pop();
		let ents;
		try {
			ents = fs.readdirSync(d, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const e of ents) {
			if (--left < 0) return false;
			const p = path.join(d, e.name);
			if (e.isDirectory()) stack.push(p);
			else if (e.isFile() && credentialFile(p)) return false;
		}
	}
	return true;
}
const treeVerdicts = /* @__PURE__ */ new Map();
/**
* The vendor toolchain trees offered to a build (BUILD_TOOLCHAIN_PARENTS):
* each directory entry (bound read-only as it is) and each link to a
* directory (shown with its chain of links), when the tree it leads to holds
* no credential file. Walked once per process.
*/
function buildToolchainTrees(parents = BUILD_TOOLCHAIN_PARENTS) {
	const out = [];
	for (const parent of parents) {
		let names = [];
		try {
			names = fs.readdirSync(parent).toSorted();
		} catch {
			continue;
		}
		for (const n of names) {
			const p = path.join(parent, n);
			if (NOT_TOOLCHAIN.has(n)) continue;
			let real;
			try {
				real = fs.realpathSync(p);
				if (!fs.statSync(real).isDirectory()) continue;
			} catch {
				continue;
			}
			if (![...parents, "/usr"].some((x) => real.startsWith(`${x}/`)) || [
				"/usr/local/etc",
				"/usr/local/src",
				...parents.map((x) => path.join(x, "etc"))
			].some((x) => real === x || real.startsWith(`${x}/`))) continue;
			let ok = treeVerdicts.get(real);
			if (ok === void 0) {
				ok = credentialFree(real);
				treeVerdicts.set(real, ok);
			}
			if (ok) out.push(p);
		}
	}
	return out;
}
/** The program directories of the vendor trees a build sees (each tree's bin), for its PATH. */
function buildToolchainPath(trees) {
	const dirs = trees.flatMap((t) => /\/s?bin$/.test(t) ? [t] : [path.join(t, "bin")]);
	return [...new Set(dirs)].filter((b) => {
		try {
			return fs.statSync(b).isDirectory();
		} catch {
			return false;
		}
	});
}
/**
* The device nodes a GPU grant may show a contained build, and the driver
* directories (read-only) the user-space driver loads from:
*
*   WSL:            /dev/dxg (the Windows GPU paravirtualization device),
*                   /usr/lib/wsl/lib (libcuda, libdxcore, libd3d12) and
*                   /usr/lib/wsl/drivers (the driver store);
*   NVIDIA (Linux): /dev/nvidia[0-9]*, /dev/nvidiactl, /dev/nvidia-uvm,
*                   /dev/nvidia-uvm-tools, /dev/nvidia-modeset,
*                   /dev/nvidia-caps/*;
*   DRM:            render nodes only (/dev/dri/renderD*), never the
*                   display (card*) nodes.
*
* Device nodes give no file and no network access, but they reach the GPU
* kernel driver (on WSL, through the hypervisor to the Windows host's
* graphics driver): code in the build can use the GPU and the driver's full
* request surface. So they are shown only to a contained build of a project
* the person granted GPU use (never to a run with code pins, never by an
* environment variable or a project file).
*/
const GPU_DEVICE = /^\/dev\/(?:dxg|nvidia\d+|nvidiactl|nvidia-uvm|nvidia-uvm-tools|nvidia-modeset|nvidia-caps\/nvidia-cap\d+|dri\/renderD\d+)$/;
const GPU_DRIVER_DIRS = ["/usr/lib/wsl/lib", "/usr/lib/wsl/drivers"];
/** The GPU device nodes and driver directories this host has (empty when it has none). */
function hostGpu() {
	const devices = [];
	const add = (p) => {
		try {
			if (GPU_DEVICE.test(p) && fs.statSync(p).isCharacterDevice()) devices.push(p);
		} catch {}
	};
	add("/dev/dxg");
	for (const [dir, prefix] of [
		["/dev", "/dev/"],
		["/dev/nvidia-caps", "/dev/nvidia-caps/"],
		["/dev/dri", "/dev/dri/"]
	]) {
		let names = [];
		try {
			names = fs.readdirSync(dir).toSorted();
		} catch {
			continue;
		}
		for (const n of names) if (prefix + n !== "/dev/dxg") add(prefix + n);
	}
	const dirs = GPU_DRIVER_DIRS.filter((d) => {
		try {
			return fs.statSync(d).isDirectory();
		} catch {
			return false;
		}
	});
	return {
		devices,
		dirs: devices.length ? dirs : []
	};
}
/** What a contained build without the GPU grant says when it fails on a host that has a GPU. */
const NO_GPU_NOTICE = "this build ran without the GPU: the contained build shows no GPU device unless the person granted GPU use for this project";
//#endregion
//#region src/enclawed/containment/code-guard.ts
/** Where the guards live in the view (read-only, on the view's own tmpfs). */
const CODE_GUARD_DIR = "/.enclawed/code";
const NODE_GUARD_PATH = `${CODE_GUARD_DIR}/node-guard.cjs`;
const PY_GUARD_PATH = `${CODE_GUARD_DIR}/py-guard.py`;
/** Python's bytecode cache prefix in the view: an empty read-only directory. */
const PY_CACHE_PREFIX = `${CODE_GUARD_DIR}/pyc`;
/** Where the contained shell's copies of the scripts Enclawed read live in the view. */
const SHELL_COPY_DIR = "/.enclawed/code/sh";
/** Shells the shell guard wraps, by the basename of the real program. */
function guardedShell(realBase) {
	return realBase === "sh" || realBase === "dash" || realBase === "bash";
}
/** awk is GNU awk here: started with --sandbox (no system(), no redirection, no getline from files). */
function guardedAwk(realBase) {
	return realBase === "gawk";
}
/**
* The wrappers' configuration in the view (read by the name guard in its
* wrapper mode, ./name-guard.c): the wrapped programs, the -c texts and script
* copies a shell may run, the places a run can write, python's and node's
* guard options.
*/
const WRAPPERS_CONF_PATH = "/.enclawed/code/wrappers.conf";
/** The options node always starts with in a contained run: the guard first. */
const NODE_GUARD_OPTIONS = `--require=${NODE_GUARD_PATH} --disallow-code-generation-from-strings`;
/** Interpreters the guards cover, by the basename of the real program. */
function guardedInterpreter(realBase) {
	if (realBase === "node" || realBase === "nodejs") return "node";
	if (/^python3(?:\.\d+)?$/.test(realBase)) return "python";
	return null;
}
/** Programs that load code from files and have no guard: not started with code pins. */
const UNGUARDED_INTERPRETERS = /^(?:perl[\d.]*|ruby[\d.]*|php[\d.]*|lua[\d.]*|luajit|tclsh[\d.]*|wish[\d.]*|deno|bun|python2(?:\.\d+)?|python|pypy\d*|R|Rscript|julia|java|jshell|guile[\d.]*|racket|sbcl|ghci|runghc|osascript|pwsh|powershell|ts-node|tsx|irb|erl|escript|elixir|iex|swipl|gst|ocaml|scala)$/;
/** node's own test reporters: the only reporters not read as a file. */
const NODE_BUILTIN_REPORTERS_GUARD = [
	"spec",
	"tap",
	"dot",
	"junit",
	"lcov"
];
/** Options of NODE_ARGS_OK that take a value (checked by the guard's valueOk). */
const NODE_VALUED_GUARD = [
	"--test-reporter",
	"--test-reporter-destination",
	"--test-name-pattern",
	"--test-skip-pattern",
	"--test-concurrency",
	"--test-timeout",
	"--test-isolation",
	"--input-type"
];
/** The node options the guard accepts besides its own (the forms ../adapter/contained-exec.ts reads). */
const NODE_ARGS_OK = [
	"--test",
	"--test-only",
	"--test-force-exit",
	"--no-warnings",
	"--enable-source-maps",
	"--trace-warnings",
	"--experimental-test-coverage",
	"--check",
	"-c",
	"--test-reporter",
	"--test-reporter-destination",
	"--test-name-pattern",
	"--test-skip-pattern",
	"--test-concurrency",
	"--test-timeout",
	"--test-isolation",
	"--input-type",
	"-e",
	"--eval",
	"-p",
	"--print",
	"--disallow-code-generation-from-strings"
];
const json = (v) => JSON.stringify(v);
/** The node guard: preloaded first into every node process of the run. */
function nodeGuardSource(pins, toolchain, execPaths = []) {
	return `// Enclawed code pins: node guard (generated). Loaded first; see the kit's
// containment/code-guard.ts.
"use strict";
(() => {
  // node runs from an execute-only copy the view does not show: its own path,
  // for the run, is the guarded program's (so a node it starts goes through
  // the wrapper again).
  {
    const EXEC_PATHS = new Map(${json(execPaths.map((e) => [e.host, e.view]))});
    const v = EXEC_PATHS.get(process.execPath);
    if (v) {
      Object.defineProperty(process, "execPath", { value: v, writable: false, configurable: false, enumerable: true });
    }
  }
  const PINS = new Map(${json(pins.map((p) => [p.path, p.sha256]))});
  const TOOLCHAIN = ${json(toolchain)};
  const ARGS_OK = new Set(${json(NODE_ARGS_OK)});
  const VALUED = ${json(NODE_VALUED_GUARD)};
  const GUARD = ${json(NODE_GUARD_PATH)};
  const fs = require("node:fs");
  const crypto = require("node:crypto");
  const Module = require("node:module");
  const fail = (msg) => {
    try {
      fs.writeSync(2, "Enclawed: " + msg + "\\n");
    } catch {}
    process.exit(126);
  };
  if (typeof Module.registerHooks !== "function" || typeof crypto.hash !== "function") {
    fail("this node has no module hooks, so the code it loads cannot be checked; nothing was run");
  }
  // What the checks use at run time is taken now, before the run's code can
  // replace any of it (prototypes, fs functions, globals, the URL class's
  // accessors, Error.prepareStackTrace): no check calls a method by its name.
  const E = Error;
  const capture = E.captureStackTrace;
  const apply = Reflect.apply;
  const isArray = Array.isArray;
  const strStarts = String.prototype.startsWith;
  const strIndexOf = String.prototype.indexOf;
  const strSlice = String.prototype.slice;
  const strCode = String.prototype.charCodeAt;
  const slice = Array.prototype.slice;
  const arrIncludes = Array.prototype.includes;
  const mapGet = Map.prototype.get;
  const mapHas = Map.prototype.has;
  const gopd = Object.getOwnPropertyDescriptor;
  const defineProp = Object.defineProperty;
  const ownKeys = Reflect.ownKeys;
  const createObj = Object.create;
  const realpath0 = fs.realpathSync;
  const readFile0 = fs.readFileSync;
  const hash0 = crypto.hash;
  const bufFrom = Buffer.from;
  const decode0 = decodeURIComponent;
  const execPath = process.execPath;
  const pathResolve = require("node:path").resolve;
  const cwd0 = process.cwd;
  const starts = (s, p) => apply(strStarts, s, [p]);
  const has = (s, p) => apply(strIndexOf, s, [p]) >= 0;
  const realOf = (p) => {
    try {
      return apply(realpath0, fs, [p]);
    } catch {
      return p;
    }
  };
  const trusted = (p) => {
    for (let i = 0; i < TOOLCHAIN.length; i++) {
      const d = TOOLCHAIN[i];
      if (p === d || starts(p, d[d.length - 1] === "/" ? d : d + "/")) return true;
    }
    return false;
  };
  const sha = (b) => apply(hash0, crypto, ["sha256", b, "hex"]);
  const digits = (v) => {
    if (v === "") return false;
    for (let i = 0; i < v.length; i++) {
      const c = apply(strCode, v, [i]);
      if (c < 48 || c > 57) return false;
    }
    return true;
  };
  // A value option's value: a reporter is code (node's own, or a file Enclawed
  // read, never one of the toolchain's by path); a destination is standard
  // output or error, or a file outside the toolchain; the rest plain values.
  const BUILTIN_REPORTERS = ${json([...NODE_BUILTIN_REPORTERS_GUARD])};
  const valueOk = (name, v, base) => {
    if (typeof v !== "string") return false;
    if (name === "--test-reporter") {
      if (apply(arrIncludes, BUILTIN_REPORTERS, [v])) return true;
      const real = realOf(apply(pathResolve, null, [base, v]));
      return apply(mapHas, PINS, [real]) && !trusted(real);
    }
    if (name === "--test-reporter-destination") {
      if (v === "stdout" || v === "stderr") return true;
      return !trusted(realOf(apply(pathResolve, null, [base, v])));
    }
    if (name === "--test-concurrency" || name === "--test-timeout") return digits(v);
    if (name === "--input-type") return v === "module" || v === "commonjs";
    if (name === "--test-isolation") return v === "process" || v === "none";
    return true;
  };
  // Options that load other code before or around the guard are refused. Whether
  // node runs -e/-p code as CommonJS is noted: only then does node compile its one
  // eval wrapper, before any of the run's code.
  let evalCjs = false;
  {
    const xa = process.execArgv;
    let evalCode = false;
    let inputModule = false;
    for (let i = 0; i < xa.length; i++) {
      const a = xa[i];
      const eq = a.indexOf("=");
      const name = eq > 0 ? a.slice(0, eq) : a;
      if (a === "--require=" + GUARD || a === GUARD) continue;
      if (!a.startsWith("-")) continue;
      if (!ARGS_OK.has(name)) {
        fail("node " + name + " is not an option this contained run takes (it may load code Enclawed did not read); nothing was run");
      }
      if (name === "-e" || name === "--eval" || name === "-p" || name === "--print") {
        evalCode = true;
        if (eq < 0) i++;
        continue;
      }
      if (VALUED.includes(name)) {
        const v = eq > 0 ? a.slice(eq + 1) : xa[++i];
        if (!valueOk(name, v, process.cwd())) {
          fail("node " + name + " " + String(v).slice(0, 80) + " is not a value this contained run takes; nothing was run");
        }
        if (name === "--input-type" && v === "module") inputModule = true;
      }
    }
    evalCjs = evalCode && !inputModule;
  }
  class CodeNotRead extends Error {
    constructor(what, why) {
      super("Enclawed: " + what + " was not loaded: " + why + " (this contained run loads only the code Enclawed read)");
      this.code = "ERR_ENCLAWED_CODE_NOT_READ";
    }
  }
  // A file: URL's path, decoded here (the URL class's accessors are the run's
  // to replace): no host, no query or fragment, no encoded slash or NUL.
  const pathOf = (u) => {
    if (typeof u !== "string" || !starts(u, "file:///")) throw new CodeNotRead(String(u).slice(0, 80), "it is not a local file: URL");
    let s = apply(strSlice, u, [7]);
    let i = apply(strIndexOf, s, ["#"]);
    if (i >= 0) s = apply(strSlice, s, [0, i]);
    i = apply(strIndexOf, s, ["?"]);
    if (i >= 0) s = apply(strSlice, s, [0, i]);
    if (has(s, "%2f") || has(s, "%2F") || has(s, "%00")) throw new CodeNotRead(u, "its path is not a plain file path");
    return decode0(s);
  };
  // A file outside the toolchain must be one Enclawed read, with the bytes it
  // read: those bytes (null for a toolchain file).
  const pinned = (p) => {
    const real = realOf(p);
    if (trusted(real)) return null;
    const want = apply(mapGet, PINS, [real]);
    if (want === undefined) throw new CodeNotRead(p, "it is not one of the files Enclawed read");
    const buf = apply(readFile0, fs, [real]);
    if (sha(buf) !== want) throw new CodeNotRead(p, "its content is not what Enclawed read");
    return buf;
  };
  // Every file node loads is compiled from the bytes read here: a pinned file's
  // checked bytes, a toolchain file's own (never what node's default loader
  // would read through accessors the run may have replaced).
  Module.registerHooks({
    load(url, context, nextLoad) {
      if (typeof url !== "string" || starts(url, "data:")) {
        throw new CodeNotRead("a data: URL", "code built at run time is not loaded");
      }
      if (!starts(url, "file:")) {
        return nextLoad(url, context);
      }
      const p = pathOf(url);
      const buf = pinned(p);
      const source = buf === null ? apply(readFile0, fs, [realOf(p)]) : buf;
      const r = nextLoad(url, context);
      if (r.format === "addon" || r.format === "wasm") {
        // Native or wasm code: only the bytes read (and a native addon cannot map from a noexec place).
        return { ...r, source, shortCircuit: true };
      }
      return { format: r.format, source, shortCircuit: true };
    },
  });
  // The hooks above are the only ones, and node's module wrapper stays node's:
  // the run's code registers no other hook (in-thread or off-thread) and turns
  // on no compile cache, by whatever way it reaches node:module (require,
  // import, getBuiltinModule, an alias); the import namespace shows the same.
  const lock = (obj, k, what) => {
    if (!(k in obj)) return;
    const refuse = function () {
      throw new CodeNotRead(what, "the run's code does not change how node loads or builds code");
    };
    try {
      defineProp(obj, k, { value: refuse, writable: false, configurable: false });
    } catch {}
    if (obj[k] !== refuse) fail(what + " could not be closed; nothing was run");
  };
  for (const k of ["registerHooks", "register", "enableCompileCache"]) lock(Module, k, "module." + k);
  const wrap0 = Module.wrap;
  const wrapper0 = Module.wrapper;
  const W = [wrapper0[0], wrapper0[1]];
  const wrapperSame = () => {
    if (Module.wrap !== wrap0 || Module.wrapper !== wrapper0) return false;
    for (let i = 0; i < 2; i++) {
      const d = apply(gopd, Object, [wrapper0, "" + i]);
      if (d === undefined || "get" in d || "set" in d || d.value !== W[i]) return false;
    }
    return true;
  };
  // node -e / -p compile one wrapper of their (read) code, under this name, before any of the run's code.
  const evalName = (f) => {
    if (!starts(f, "[eval")) return false;
    let i = 5;
    while (i < f.length && apply(strCode, f, [i]) >= 48 && apply(strCode, f, [i]) <= 57) i++;
    if (apply(strCode, f, [i]) !== 93) return false;
    const rest = apply(strSlice, f, [i + 1]);
    return rest === "" || rest === "-wrapper";
  };
  let evalSeen = !evalCjs;
  // A module compiled by hand is checked the same way: a pinned file's bytes
  // under its name, a toolchain file's own bytes under its name.
  const compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (typeof content !== "string" || typeof filename !== "string") {
      throw new CodeNotRead("code built at run time", "it is not a file Enclawed read");
    }
    if (!wrapperSame()) throw new CodeNotRead(filename, "node's module wrapper was changed");
    if (!evalSeen && evalName(filename)) {
      evalSeen = true;
      return apply(compile, this, arguments);
    }
    if (!starts(filename, "/")) throw new CodeNotRead("code built at run time", "it is not a file Enclawed read");
    const real = realOf(filename);
    let want = apply(mapGet, PINS, [real]);
    if (trusted(real)) {
      try {
        want = sha(apply(readFile0, fs, [real]));
      } catch {
        want = undefined;
      }
    }
    const got = sha(apply(bufFrom, Buffer, [content, "utf8"]));
    const gotBom = sha(apply(bufFrom, Buffer, ["\\ufeff" + content, "utf8"]));
    if (want === undefined || (got !== want && gotBom !== want)) {
      throw new CodeNotRead(filename, want ? "its content is not what Enclawed read" : "it is not one of the files Enclawed read");
    }
    return apply(compile, this, arguments);
  };
  const dlopen = process.dlopen;
  process.dlopen = function (module, filename) {
    if (typeof filename !== "string") throw new CodeNotRead("a native addon", "its name is not a file Enclawed read");
    pinned(filename);
    return apply(dlopen, this, arguments);
  };
  // vm compiles strings into code, and an inspector session evaluates them: refused here.
  const vm = require("node:vm");
  for (const k of ownKeys(vm)) {
    if (typeof k === "string" && typeof vm[k] === "function" && k !== "isContext" && k !== "measureMemory") lock(vm, k, "vm." + k);
  }
  for (const name of ["node:inspector", "node:inspector/promises"]) {
    let m = null;
    try {
      m = require(name);
    } catch {}
    if (m) {
      for (const k of ["Session", "open"]) lock(m, k, name + " " + k);
    }
  }
  // WebAssembly compiles bytes in memory into code (code generation from
  // strings does not cover it): refused, by every way to a module or instance.
  const WA = globalThis.WebAssembly;
  if (WA) {
    for (const k of ["Module", "Instance", "compile", "instantiate", "compileStreaming", "instantiateStreaming"]) lock(WA, k, "WebAssembly." + k);
  }
  Module.syncBuiltinESMExports();
  // Programs. The run's own code starts none (Enclawed read it as code that
  // starts none); the toolchain may (npm runs a script's line with sh, which
  // runs contained like the rest), and node's own internals may start node
  // itself under this guard (the test runner runs each test file in a child).
  // Whatever path returns child_process (require, import, getBuiltinModule,
  // Module._load), it is the one module object stubbed here.
  let siteFile = null;
  {
    const h = {};
    const prev = E.prepareStackTrace;
    E.prepareStackTrace = (_e, cs) => cs;
    capture(h);
    // The stack is formatted when first read: read it while ours is in place.
    const st = h.stack;
    E.prepareStackTrace = prev;
    const site = st && st[0];
    siteFile = site ? Object.getPrototypeOf(site).getFileName : null;
  }
  const callerFile = () => {
    if (typeof siteFile !== "function") return undefined;
    const holder = {};
    const prev = E.prepareStackTrace;
    let frames = null;
    try {
      E.prepareStackTrace = (_e, cs) => cs;
      capture(holder, callerFile);
      frames = holder.stack;
    } catch {
      return undefined;
    } finally {
      try {
        E.prepareStackTrace = prev;
      } catch {}
    }
    if (!apply(isArray, Array, [frames])) return undefined;
    for (let i = 0; i < frames.length; i++) {
      const n = apply(siteFile, frames[i], []);
      if (typeof n !== "string" || n === "" || n === GUARD || apply(strStarts, n, ["node:"])) continue;
      if (!starts(n, "file:")) return n;
      try {
        return pathOf(n);
      } catch {
        return undefined;
      }
    }
    return null; // node's own internals only
  };
  const refuseStart = (what) => {
    throw new CodeNotRead(what, "a contained run's own code starts no program");
  };
  // Everything a start is decided on is first copied, once, into plain
  // primitives (no getter, toString or proxy of the run can answer the check one
  // way and the start another): data properties only, strings only.
  // Own data properties only: an assignment could reach a setter a prototype holds.
  const put = (o, k, v) => {
    apply(defineProp, Object, [o, k, { value: v, writable: true, enumerable: true, configurable: true }]);
  };
  const dataOf = (o, k) => {
    const d = apply(gopd, Object, [o, k]);
    if (d === undefined) return undefined;
    if (!("value" in d) || "get" in d || "set" in d) refuseStart("a start whose options are computed");
    return d.value;
  };
  const prim = (v) => {
    const t = typeof v;
    if (t === "string") return v;
    if (t === "number" || t === "boolean" || t === "bigint") return "" + v;
    refuseStart("a start with an argument that is not a string");
  };
  const strings = (arr) => {
    if (arr === undefined || arr === null) return [];
    if (!apply(isArray, Array, [arr])) refuseStart("a start whose arguments are not a list");
    const n = dataOf(arr, "length");
    const out = [];
    for (let i = 0; i < n; i++) put(out, "" + i, prim(dataOf(arr, "" + i)));
    return out;
  };
  const record = (o) => {
    const out = apply(createObj, Object, [null]);
    if (o === undefined || o === null) return out;
    if (typeof o !== "object") refuseStart("a start whose options are not an object");
    const keys = apply(ownKeys, Reflect, [o]);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (typeof k !== "string") continue;
      put(out, k, dataOf(o, k));
    }
    return out;
  };
  const envRecord = (e) => {
    const r = record(e);
    const out = apply(createObj, Object, [null]);
    const keys = apply(ownKeys, Reflect, [r]);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (r[k] !== undefined) put(out, k, prim(r[k]));
    }
    return out;
  };
  // node itself, started by node's own internals only (the test runner's
  // children): an allowlist of the options node's own test runner passes on
  // (getRunArgs: the parent's filtered execArgv, --test-force-exit,
  // --test-name-pattern/--test-skip-pattern, --test-only), then one file
  // Enclawed read; what follows the file is that program's own argv. It always
  // gets this guard's own NODE_OPTIONS.
  const NODE_OPTS = "--require=" + GUARD + " --disallow-code-generation-from-strings";
  const CHILD_FLAGS = ["--test", "--test-only", "--test-force-exit", "--no-warnings", "--enable-source-maps", "--trace-warnings", "--disallow-code-generation-from-strings"];
  const CHILD_VALUED = ["--test-name-pattern", "--test-skip-pattern", "--test-concurrency", "--test-timeout", "--test-isolation", "--test-reporter", "--test-reporter-destination"];
  // Workers: on a file Enclawed read (a path or a file: URL, read here once),
  // under this guard. Never code from a string, never node options of their
  // own, and a worker's own environment gets this guard's NODE_OPTIONS.
  const wt = require("node:worker_threads");
  const Worker = wt.Worker;
  const SHARE_ENV = wt.SHARE_ENV;
  class GuardedWorker extends Worker {
    constructor(file, options) {
      const refuse = (why) => {
        throw new CodeNotRead("a worker", why);
      };
      const href = typeof file === "string" ? file : file !== null && typeof file === "object" ? file.href : undefined;
      if (typeof href !== "string" || (typeof file !== "string" && !starts(href, "file:"))) refuse("its code is not a file Enclawed read");
      const real = realOf(starts(href, "file:") ? pathOf(href) : href);
      pinned(real);
      const o = record(options);
      if (o.eval) refuse("code built at run time is not run");
      if (o.execArgv !== undefined) refuse("a worker takes no node options of its own");
      if (o.env !== undefined && o.env !== SHARE_ENV) {
        const env = envRecord(o.env);
        put(env, "NODE_OPTIONS", NODE_OPTS);
        put(o, "env", env);
      }
      super(real, o);
    }
  }
  try {
    defineProp(wt, "Worker", { value: GuardedWorker, writable: false, configurable: false });
  } catch {}
  if (wt.Worker !== GuardedWorker) fail("worker_threads Worker could not be guarded; nothing was run");
  // node:sqlite loads native extensions: no database allows them and no way to
  // load one is left (taken now, its experimental warning held for the run).
  let sqlite = null;
  {
    const warn = process.emitWarning;
    process.emitWarning = () => {};
    try {
      sqlite = require("node:sqlite");
    } catch {}
    process.emitWarning = warn;
  }
  if (sqlite && typeof sqlite.DatabaseSync === "function") {
    const Db = sqlite.DatabaseSync;
    const construct = Reflect.construct;
    const DatabaseSync = function DatabaseSync(location, options) {
      if (new.target === undefined) throw new CodeNotRead("node:sqlite DatabaseSync", "it is a constructor");
      const o = record(options);
      if (o.allowExtension) throw new CodeNotRead("a sqlite extension", "a contained run loads no native extension");
      return apply(construct, Reflect, [Db, options === undefined ? [location] : [location, o], new.target]);
    };
    DatabaseSync.prototype = Db.prototype;
    lock(Db.prototype, "loadExtension", "node:sqlite loadExtension");
    lock(Db.prototype, "enableLoadExtension", "node:sqlite enableLoadExtension");
    try {
      defineProp(Db.prototype, "constructor", { value: DatabaseSync, writable: false, configurable: false });
      defineProp(sqlite, "DatabaseSync", { value: DatabaseSync, writable: false, configurable: false });
    } catch {}
    if (sqlite.DatabaseSync !== DatabaseSync || Db.prototype.constructor !== DatabaseSync) fail("node:sqlite could not be guarded; nothing was run");
  }
  Module.syncBuiltinESMExports();
  const nodeChildOk = (file, args, cwd) => {
    if (file !== execPath) return false;
    for (let i = 0; i < args.length; i++) {
      const x = args[i];
      if (x === "--require=" + GUARD) continue;
      if ((x === "--require" || x === "-r") && args[i + 1] === GUARD) {
        i++;
        continue;
      }
      if (apply(arrIncludes, CHILD_FLAGS, [x])) continue;
      const base = typeof cwd === "string" && cwd !== "" ? cwd : apply(cwd0, process, []);
      const eq = apply(strIndexOf, x, ["="]);
      if (eq > 0 && apply(arrIncludes, CHILD_VALUED, [apply(strSlice, x, [0, eq])])) {
        if (!valueOk(apply(strSlice, x, [0, eq]), apply(strSlice, x, [eq + 1]), base)) return false;
        continue;
      }
      if (apply(strStarts, x, ["-"])) return false;
      // The program: a file Enclawed read; what follows is its own argv.
      const real = realOf(apply(pathResolve, null, [base, x]));
      return apply(mapHas, PINS, [real]) && !trusted(real);
    }
    return false;
  };
  // Toolchain code starts programs only in a process whose own program is the
  // toolchain's (npm running a script's line). In a process started on code of
  // the run (its script, its tests), toolchain code it loads (a reporter, a
  // module by path) starts nothing: which toolchain code runs there, and with
  // what, is the run's choice.
  const mainToolchain = (() => {
    const m = process.argv[1];
    if (typeof m !== "string" || m === "") return false;
    return trusted(realOf(apply(pathResolve, null, [apply(cwd0, process, []), m])));
  })();
  const startKind = (file, args, cwd) => {
    const who = callerFile();
    if (who === undefined) return null;
    if (who === null) return nodeChildOk(file, args, cwd) ? "node-child" : null;
    return mainToolchain && trusted(realOf(who)) ? "toolchain" : null;
  };
  const cp = require("node:child_process");
  const proto = cp.ChildProcess && cp.ChildProcess.prototype;
  if (proto && typeof proto.spawn === "function") {
    const spawn0 = proto.spawn;
    const guardedSpawn = function (options) {
      const o = record(options);
      const file = prim(o.file);
      const argv = strings(o.args);
      let pairs = strings(o.envPairs);
      const kind = startKind(file, apply(slice, argv, [1]), o.cwd);
      if (kind === null) refuseStart("starting " + file);
      if (kind === "node-child") {
        const kept = [];
        for (let i = 0; i < pairs.length; i++) {
          if (!apply(strStarts, pairs[i], ["NODE_OPTIONS="])) put(kept, "" + kept.length, pairs[i]);
        }
        put(kept, "" + kept.length, "NODE_OPTIONS=" + NODE_OPTS);
        pairs = kept;
      }
      put(o, "file", file);
      put(o, "args", argv);
      put(o, "envPairs", pairs);
      return apply(spawn0, this, [o]);
    };
    try {
      Object.defineProperty(proto, "spawn", { value: guardedSpawn, writable: false, configurable: false });
    } catch {}
  }
  for (const k of ["spawnSync", "execSync", "execFileSync"]) {
    const f0 = cp[k];
    if (typeof f0 !== "function") continue;
    const g = function (a0, a1, a2) {
      let file;
      let args;
      let opts;
      if (k === "execSync") {
        file = "/bin/sh";
        args = [];
        put(args, "0", "-c");
        put(args, "1", prim(a0));
        opts = record(a1);
      } else {
        file = prim(a0);
        if (apply(isArray, Array, [a1])) {
          args = strings(a1);
          opts = record(a2);
        } else {
          args = [];
          opts = record(a1);
        }
      }
      const env = opts.env === undefined ? envRecord(process.env) : envRecord(opts.env);
      const kind = startKind(file, args, opts.cwd);
      if (kind === null) refuseStart("starting " + file);
      if (kind === "node-child") put(env, "NODE_OPTIONS", NODE_OPTS);
      put(opts, "env", env);
      return k === "execSync" ? apply(f0, this, [args[1], opts]) : apply(f0, this, [file, args, opts]);
    };
    try {
      Object.defineProperty(cp, k, { value: g, writable: false, configurable: false });
    } catch {}
  }
  // Native bindings (spawn_sync, process_wrap, ...) are not reached by name.
  for (const k of ["binding", "_linkedBinding"]) {
    try {
      Object.defineProperty(process, k, {
        value: () => refuseStart("process." + k),
        writable: false,
        configurable: false,
      });
    } catch {}
  }
  if (typeof process.execve === "function") {
    try {
      Object.defineProperty(process, "execve", { value: () => refuseStart("process.execve"), writable: false, configurable: false });
    } catch {}
  }
})();
`;
}
/** The python guard: the script the wrapper starts; it installs the audit hook, then runs the run's code. */
function pythonGuardSource(pins, toolchain, stdinPins = [], venv = null) {
	const pinDict = `{${pins.map((p) => `${json(p.path)}: ${json(p.sha256)}`).join(", ")}}`;
	return `# Enclawed code pins: python guard (generated). See the kit's
# containment/code-guard.ts.
import sys

# Programs this run may read from standard input (here-documents Enclawed read), by SHA-256.
_ENCLAWED_STDIN = ${`frozenset([${stdinPins.map((h) => json(h)).join(", ")}])`}

# The project virtual environment the run's Python runs as: (site-packages, include system site-packages).
_ENCLAWED_VENV = ${venv ? `(${json(venv.site)}, ${venv.systemSite ? "True" : "False"})` : "None"}


def _enclawed_paths(toolchain):
    # Path primitives over the interpreter's own C functions, bound now (before
    # the run's code starts): the standard library's os.path is Python code whose
    # modules the run may change. Each call makes fresh closures, so what one
    # user of them holds (the archive hook below is reachable from sys.path_hooks)
    # is not what the audit hook holds.
    import posix

    lstat, readlink, getcwd = posix.lstat, posix.readlink, posix.getcwd
    str_, type_, OSError_, any_ = str, type, OSError, any
    TOOLCHAIN = tuple(toolchain)

    def realpath(p):
        # As os.path.realpath (not strict), for an exact str; None: a link loop.
        if not p.startswith("/"):
            p = getcwd() + "/" + p
        todo = p.split("/")
        todo.reverse()
        out = []
        hops = 0
        while todo:
            x = todo.pop()
            if x == "" or x == ".":
                continue
            if x == "..":
                if out:
                    out.pop()
                continue
            cand = "/" + "/".join(out + [x])
            try:
                st = lstat(cand)
            except OSError_:
                out.append(x)
                continue
            if st.st_mode & 0o170000 == 0o120000:
                hops += 1
                if hops > 64:
                    return None
                try:
                    t = readlink(cand)
                except OSError_:
                    out.append(x)
                    continue
                if type_(t) is not str_:
                    return None
                if t.startswith("/"):
                    out = []
                parts = t.split("/")
                parts.reverse()
                todo.extend(parts)
            else:
                out.append(x)
        return "/" + "/".join(out)

    def inside(d, p):
        return p == d or p.startswith(d.rstrip("/") + "/")

    def trusted(p):
        # A path of the toolchain (read-only, the interpreter's own files).
        if type_(p) is not str_ or not p.startswith("/"):
            return False
        r = realpath(p)
        return r is not None and any_(inside(d, r) for d in TOOLCHAIN)

    return realpath, trusted


def _enclawed_guard(run_code=None):
    # run_code: the -c or standard-input code this guard compiled (before the
    # hook was installed) from the text Enclawed read; the one code object the
    # guard itself starts.
    #
    # The hook runs no code of the run: everything it calls is bound here, before
    # the run's code starts (builtins, the interpreter's C functions, the
    # toolchain functions whose frames it recognizes, by identity), it reads no
    # attribute an object of the run defines, and it turns strings into exact
    # str first. Its state lives only in these closures: no frame of the guard
    # but _enclawed_main is handed to the run (frames of a closure write its
    # cells). The run's code never runs inside it: the collector runs only in a
    # thread of the guard's own (a finalizer would run in the frame it interrupts,
    # and the run cannot turn the collector back on), no signal handler is
    # installed, and an event raised inside the hook by anything but the guard
    # is refused.
    import _imp
    import _io
    import _signal
    import _thread
    import builtins
    import gc
    import hashlib
    import keyword
    import os
    import types

    B = builtins.__dict__
    type, len, any, all, bytes, str, int, tuple, list, frozenset, issubclass, OSError, PermissionError, ImportError, Exception = (
        B["type"], B["len"], B["any"], B["all"], B["bytes"], B["str"], B["int"], B["tuple"], B["list"], B["frozenset"], B["issubclass"], B["OSError"], B["PermissionError"], B["ImportError"], B["Exception"])
    getframe = sys._getframe
    add_hook = sys.addaudithook
    fopen = _io.open
    sha256 = hashlib.sha256
    get_ident = _thread.get_ident
    gc_isenabled, gc_disable, gc_collect = gc.isenabled, gc.disable, gc.collect
    is_frozen, get_frozen_object = _imp.is_frozen, _imp.get_frozen_object
    FSENC = sys.getfilesystemencoding()
    CodeType, FrameType, TracebackType, ModuleType = types.CodeType, types.FrameType, types.TracebackType, types.ModuleType
    MODULE_DICT = ModuleType.__dict__["__dict__"].__get__
    TYPE_DICT = type.__dict__["__dict__"].__get__
    MODULES = sys.modules
    import time as _time
    sleep = _time.sleep
    HARD_KEYWORDS = frozenset(keyword.kwlist)

    PINS = types.MappingProxyType(${pinDict})
    GUARD = ${json(PY_GUARD_PATH)}
    realpath, trusted = _enclawed_paths(${json(toolchain)})

    class CodeNotRead(PermissionError):
        pass

    def text(x):
        # x as an exact str (a subclass's own methods never run here), or None.
        t = type(x)
        if t is str:
            return x
        if t is bytes or issubclass(t, bytes):
            try:
                return bytes.decode(x, FSENC)
            except Exception:
                return None
        if issubclass(t, str):
            return "".join((x, ""))
        return None

    def refuse(what, why):
        w = text(what)
        raise CodeNotRead("Enclawed: %s was not loaded: %s (this contained run loads only the code Enclawed read)" % (w if w is not None else "code", why))

    # The guard's own frame lookups: sys._getframe raises an audit event, and the
    # hook hands no guard frame to anyone else.
    OWN = {}

    def own(fn, *a):
        # fn(*a) as the guard's own call: the events it raises are the guard's.
        tid = get_ident()
        OWN[tid] = OWN.get(tid, 0) + 1
        try:
            return fn(*a)
        finally:
            n = OWN[tid] - 1
            if n:
                OWN[tid] = n
            else:
                del OWN[tid]

    def own_frame(depth):
        return own(getframe, depth + 2)

    def raiser():
        # The frame that raised the event: the first one that is not the guard's.
        f = own_frame(1)
        while f is not None and f.f_code.co_filename == GUARD:
            f = f.f_back
        return f

    def is_guard_frame(f):
        return type(f) is FrameType and f.f_code.co_filename == GUARD and f.f_code.co_name not in ("_enclawed_main", "<module>")

    def genuine(f, fn):
        # f runs the toolchain function fn itself: its own code, its own module's globals.
        return f is not None and f.f_code is fn[0] and f.f_globals is fn[1]

    def ident(fn):
        return (fn.__code__, fn.__globals__)

    # Code objects of the toolchain, by identity: those of its modules loaded
    # before the run (below) and those the guard checked against the toolchain's
    # own bytes when they ran (exec). A frame running one is the toolchain's code.
    REG = {}

    def record(code):
        todo = [code]
        while todo:
            c = todo.pop()
            if REG.get(id(c)) is c:
                continue
            REG[id(c)] = c
            for k in c.co_consts:
                if type(k) is CodeType:
                    todo.append(k)

    def toolchain_code(f):
        c = f.f_code
        return REG.get(id(c)) is c

    def plain_names(names):
        # Exact str (a subclass may answer isidentifier as it likes), ASCII identifiers.
        return all(type(n) is str and n.isascii() and n.isidentifier() for n in names)

    def namedtuple_template_ok(src):
        # collections.namedtuple compiles exactly
        #   lambda _cls, NAMES: _tuple_new(_cls, (NAMES))
        # with NAMES its field names joined by ", " (one name: a trailing ",").
        if type(src) is bytes:
            src = src.decode("ascii", "strict") if src.isascii() else None
        if type(src) is not str:
            return False
        head, tail = "lambda _cls, ", "))"
        if not src.startswith(head) or not src.endswith(tail):
            return False
        body = src[len(head):-len(tail)]
        mid = ": _tuple_new(_cls, ("
        if body.count(mid) != 1:
            return False
        first, second = body.split(mid)
        if first != second:
            return False
        names = first[:-1].split(", ") if first.endswith(",") and ", " not in first else first.split(", ")
        return len(names) > 0 and plain_names(names) and not any(n in HARD_KEYWORDS for n in names)

    # The toolchain functions whose run-time code the guard admits, as they are now.
    import ast as _ast_mod
    import collections as _coll

    AST_PARSE = ident(_ast_mod.parse)
    ONLY_AST = _ast_mod.PyCF_ONLY_AST
    NAMEDTUPLE = ident(_coll.namedtuple)
    # (Python 3.14: the guard runs on no older interpreter, see _enclawed_main.)
    import annotationlib as _al
    import dataclasses as _dc

    DC_SNAPSHOT = types.MappingProxyType({k: v for k, v in _dc.__dict__.items() if not k.startswith("__")})
    DC_ADD = ident(_dc._FuncBuilder.add_fns_to_class)
    DC_PROCESS = ident(_dc._process_class)
    DC_GLOBALS = _dc.__dict__
    _dcc = _dc.dataclass.__code__
    DC_CHAIN = frozenset([_dcc, _dc.make_dataclass.__code__] + [c for c in _dcc.co_consts if type(c) is CodeType and c.co_name == "wrap"])
    ANNOTATE = frozenset(v.__code__ for v in _al.__dict__.values() if type(v) is types.FunctionType and v.__globals__ is _al.__dict__)
    ANNOTATE_GLOBALS = _al.__dict__
    FORWARD_CODE = ident(_al.ForwardRef.__forward_code__.fget)
    FORWARD_EVALUATE = ident(_al.ForwardRef.evaluate)
    GET_ANNOTATIONS = ident(_al.get_annotations)
    CORO = ident(types.coroutine)
    import _frozen_importlib as _fi
    import _frozen_importlib_external as _fie
    CALL_REMOVED = ident(_fi._call_with_frames_removed)
    FROZEN_GET_CODE = ident(_fi.FrozenImporter.get_code)
    COMPILE_BYTECODE = ident(_fie._compile_bytecode)
    SOURCE_GET_CODE = ident(_fie.SourceLoader.get_code)
    IMP_DICT = _imp.__dict__

    def dc_unchanged():
        now = _dc.__dict__
        if len(now) - sum(1 for k in now if k.startswith("__")) != len(DC_SNAPSHOT):
            return False
        return all(now.get(k) is v for k, v in DC_SNAPSHOT.items())

    # dataclasses builds the methods of a class from text: the text is read here
    # with the words dataclasses writes (any other word, call or attribute: refused).
    DC_NAMES = frozenset(("self", "other", "name", "value", "cls", "super", "type", "hash", "NotImplemented", "FrozenInstanceError", "__dataclass_builtins_object__", "__dataclass_self__", "__dataclass_HAS_DEFAULT_FACTORY__", "__dataclasses_recursive_repr", "BUILTINS", "MISSING", "object"))
    DC_CALLABLE = frozenset(("super", "type", "hash", "FrozenInstanceError", "__dataclass_builtins_object__", "__dataclass_self__", "self", "other", "__dataclasses_recursive_repr", "BUILTINS", "object"))
    DC_ATTRS = frozenset(("__class__", "__qualname__", "__setattr__", "__delattr__", "__post_init__"))
    DC_KEYWORDS = frozenset(("def", "return", "if", "else", "is", "in", "or", "and", "not", "raise", "pass", "True", "False", "None"))
    IDENT_CHARS = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")
    OPS = ("->", "==", "!=", "<=", ">=", "(", ")", ",", ":", "=", "<", ">", ".", "*", "{", "}", "@", "[", "]")

    def dc_word(w):
        # The names dataclasses gives its locals: __dataclass_<what>__.
        return w.startswith("__dataclass_") and w.endswith("__") and len(w) > 14

    def dc_fstring(body, F):
        # {self.a.b}, {self.x!r}, {name!r}: dotted attributes the rules allow.
        out = []
        i = 0
        while i < len(body):
            c = body[i]
            if c == "}":
                return None
            if c != "{":
                i += 1
                continue
            j = body.find("}", i)
            if j < 0:
                return None
            expr = body[i + 1:j]
            if expr.endswith("!r"):
                expr = expr[:-2]
            parts = expr.split(".")
            if not parts or parts[0] not in ("self", "name", "other") or not plain_names(parts):
                return None
            if any(p not in DC_ATTRS and p not in F for p in parts[1:]):
                return None
            i = j + 1
        return True

    def dc_tokens(src, F):
        toks = []
        i, n = 0, len(src)
        while i < n:
            c = src[i]
            if c == " " or c == chr(10):
                if c == chr(10):
                    toks.append(("nl", c))
                i += 1
                continue
            if c in IDENT_CHARS:
                j = i
                while j < n and src[j] in IDENT_CHARS:
                    j += 1
                w = src[i:j]
                if w[0] in "0123456789":
                    return None
                if j < n and src[j] in ("'", '"'):
                    if w != "f":
                        return None
                    q = src[j]
                    k = src.find(q, j + 1)
                    if k < 0 or dc_fstring(src[j + 1:k], F) is None:
                        return None
                    body = src[j + 1:k]
                    if chr(10) in body or chr(92) in body:
                        return None
                    toks.append(("str", None))
                    i = k + 1
                    continue
                toks.append(("id", w))
                i = j
                continue
            if c in ("'", '"'):
                k = src.find(c, i + 1)
                if k < 0:
                    return None
                body = src[i + 1:k]
                if chr(10) in body or chr(92) in body:
                    return None
                toks.append(("str", None))
                i = k + 1
                continue
            for op in OPS:
                if src.startswith(op, i):
                    toks.append(("op", op))
                    i += len(op)
                    break
            else:
                return None
        return toks

    def dc_text_ok(src, fields):
        if type(src) is bytes:
            if not src.isascii():
                return False
            src = src.decode("ascii", "strict")
        if type(src) is not str or not src.isascii() or not src.startswith("def __create_fn__("):
            return False
        F = frozenset(fields)
        if not plain_names(F) or any(f in HARD_KEYWORDS for f in F):
            return False
        toks = dc_tokens(src, F)
        if toks is None:
            return False
        defined = frozenset(toks[k + 1][1] for k in range(len(toks) - 1) if toks[k] == ("id", "def") and toks[k + 1][0] == "id")
        if any(not (d.startswith("__") and d.endswith("__") and plain_names([d])) for d in defined):
            return False
        for k, (kind, v) in enumerate(toks):
            prev = toks[k - 1] if k else ("nl", "")
            nxt = toks[k + 1] if k + 1 < len(toks) else ("nl", "")
            if kind == "op":
                if v in ("[", "]"):
                    return False
                if v == "." and nxt[0] != "id":
                    return False
                if v == "*" and nxt != ("op", ","):
                    return False
                if v == "@" and nxt != ("id", "__dataclasses_recursive_repr"):
                    return False
                continue
            if kind != "id":
                continue
            calls = nxt in (("op", "("), ("op", "."))
            if prev == ("op", "."):
                before = toks[k - 2] if k >= 2 else ("nl", "")
                if before == ("op", ")") and v not in ("__setattr__", "__delattr__"):
                    return False
                if v in DC_ATTRS:
                    continue
                if v not in F or calls:
                    return False
                continue
            if prev == ("id", "def"):
                continue
            if v in DC_KEYWORDS:
                continue
            if v in HARD_KEYWORDS:
                return False
            if v in DC_CALLABLE or dc_word(v):
                continue
            if calls:
                return False
            if v not in DC_NAMES and v not in F and v not in defined:
                return False
        return True

    DC_PASSED = {}

    # A string annotation (typing's forward references, from __future__ import
    # annotations) is compiled as an expression: only names, attributes,
    # subscripts, |, constants and nested strings, never a call or anything
    # that defines or binds (no parentheses, colons, =, keywords but None/True/False).
    ANN_CHARS = frozenset("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.[],| -")

    def ann_text_ok(src):
        if type(src) is bytes:
            if not src.isascii():
                return False
            src = src.decode("ascii", "strict")
        if type(src) is not str or not src.isascii() or len(src) > 4096:
            return False
        if src.startswith("(*") and src.endswith(",)[0]"):
            src = src[2:-5]  # annotationlib's rewriting of a star unpack ('*Ts')
        i, n = 0, len(src)
        while i < n:
            c = src[i]
            if c in ("'", '"'):
                k = src.find(c, i + 1)
                if k < 0 or chr(10) in src[i + 1:k] or chr(92) in src[i + 1:k]:
                    return False
                i = k + 1
                continue
            if c not in ANN_CHARS:
                return False
            if c in IDENT_CHARS:
                j = i
                while j < n and src[j] in IDENT_CHARS:
                    j += 1
                w = src[i:j]
                if w in HARD_KEYWORDS and w not in ("None", "True", "False"):
                    return False
                if j < n and src[j] in ("'", '"'):
                    return False  # a string prefix (f, b, r, ...)
                i = j
                continue
            i += 1
        return True

    def dataclass_ok(f, src, compiling):
        # The text that dataclasses' own _FuncBuilder.add_fns_to_class runs, called by
        # dataclasses' own _process_class with the builder it made, for a class whose
        # fields are plain identifiers, dataclasses' names unchanged, decorated from
        # toolchain code or a file Enclawed read; and the text itself has only what
        # dataclasses writes.
        if _dc is None or not genuine(f, DC_ADD) or not dc_unchanged():
            return False
        p = f.f_back
        if not genuine(p, DC_PROCESS):
            return False
        loc, ploc = f.f_locals, p.f_locals
        cls = ploc.get("cls")
        if loc.get("self") is not ploc.get("func_builder") or loc.get("cls") is not cls or not issubclass(type(cls), type):
            return False
        flds = TYPE_DICT(cls).get("__dataclass_fields__")
        if type(flds) is not dict or not plain_names(list(flds.keys())):
            return False
        h = p.f_back
        while h is not None and h.f_globals is DC_GLOBALS and h.f_code in DC_CHAIN:
            h = h.f_back
        if h is None:
            return False
        c = h.f_code.co_filename
        r = realpath(absolute(c)) if type(c) is str and c and not c.startswith("<") else None
        if r is None or not (toolchain_code(h) or PINS.get(r) is not None):
            return False
        tid = get_ident()
        if compiling:
            if not dc_text_ok(src, list(flds.keys())):
                return False
            DC_PASSED[tid] = f
            return True
        # The run of the text just read, in the same frame.
        if DC_PASSED.get(tid) is f:
            del DC_PASSED[tid]
            return True
        return False

    NT_PASSED = {}

    def built_at_run_time(what, compiling=False, src=None):
        # Code built from a string runs only when the toolchain builds it from
        # text whose shape the guard checks here: collections.namedtuple (its exact
        # template over plain identifiers), ast.parse (a syntax tree, never code:
        # its flags ask for one), dataclasses (the text dataclasses writes) and
        # annotationlib's string annotations (names, attributes, subscripts only).
        # Each is recognized by its own code object and its own module's globals,
        # never by a file or function name; any other caller, the guard's own code
        # included (it compiled the run's code before this hook was installed):
        # refused.
        f = raiser()
        if f is not None:
            tid = get_ident()
            if genuine(f, NAMEDTUPLE):
                if compiling and namedtuple_template_ok(src):
                    NT_PASSED[tid] = f
                    return
                if not compiling and NT_PASSED.get(tid) is f:
                    del NT_PASSED[tid]
                    return
            elif genuine(f, AST_PARSE):
                fl = f.f_locals.get("flags")
                if compiling and type(fl) is int and fl & ONLY_AST:
                    return
            elif genuine(f, FORWARD_CODE):
                if compiling and ann_text_ok(src):
                    return
            elif genuine(f, GET_ANNOTATIONS):
                if compiling and ann_text_ok(src):
                    NT_PASSED[tid] = f
                    return
                if not compiling and NT_PASSED.get(tid) is f:
                    del NT_PASSED[tid]
                    return
            elif genuine(f, FORWARD_EVALUATE):
                # The code of a forward reference: every code object made from a
                # string is one of the texts admitted here.
                if not compiling:
                    return
            elif compiling or what == "code built at run time":
                if dataclass_ok(f, src, compiling):
                    return
        refuse(what, "code built at run time is not run")

    # Bytecode is read only from a toolchain .pyc the import system just opened,
    # with the bytes that file holds.
    pyc_opened = [None]

    def check_file(fn, data):
        r = realpath(fn)
        if r is None:
            refuse(fn, "it is not one of the files Enclawed read")
        if trusted(r):
            # Source compiled under a toolchain name must be that file's own bytes.
            if data is not None:
                try:
                    same = own(read_file, r) == data
                except OSError:
                    same = False
                if not same:
                    refuse(fn, "its content is not the toolchain file of that name")
            return
        want = PINS.get(r)
        if want is None:
            refuse(fn, "it is not one of the files Enclawed read")
        if data is not None and sha256(data).hexdigest() != want:
            refuse(fn, "its content is not what Enclawed read")
        if data is not None and not source_encoding_ok(data):
            refuse(fn, "its coding line names a codec other than utf-8, ascii or latin-1")

    SPACE = bytes((32, 9, 12))
    NAME_OK = frozenset(b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.")
    ENCODINGS_OK = ("utf-8", "utf8", "utf_8", "utf-8-sig", "utf_8_sig", "ascii", "us-ascii", "latin-1", "latin1", "latin_1", "iso-8859-1", "iso8859-1", "iso_8859_1", "l1")

    def source_encoding_ok(data):
        # A coding line (PEP 263, the first two lines) may name only the
        # interpreter's own source encodings: any other name goes through the
        # codec registry, where the run may have registered its own decoder.
        for line in data.split(bytes((10,)))[:2]:
            s = line.lstrip(SPACE)
            if not s.startswith(b"#"):
                continue
            i = s.find(b"coding")
            while i >= 0:
                if s[i + 6:i + 7] in (b":", b"="):
                    rest = s[i + 7:].lstrip(SPACE)
                    n = 0
                    while n < len(rest) and rest[n] in NAME_OK:
                        n += 1
                    if rest[:n].decode("ascii").lower() not in ENCODINGS_OK:
                        return False
                i = s.find(b"coding", i + 1)
        return True

    def frozen_code_ok(code):
        # A code object named as a frozen module is that frozen module's own code.
        fn = code.co_filename
        name = fn[len("<frozen "):-1] if fn.startswith("<frozen ") and fn.endswith(">") else None
        if name is None or not plain_names(name.split(".")):
            return False
        try:
            return bool(is_frozen(name)) and own(get_frozen_object, name) == code
        except Exception:
            return False

    def read_file(p):
        try:
            with fopen(p, "rb") as fh:
                return fh.read()
        except OSError:
            return None

    def absolute(p):
        return p if p.startswith("/") else os_getcwd() + "/" + p

    import posix
    os_getcwd = posix.getcwd

    def memory_name(rp):
        return rp is not None and rp.startswith("/proc/") and (rp.endswith(("/mem", "/pagemap")) or "/map_files" in rp)

    def check(event, args):
        if event == "compile":
            src, fn = args[0], text(args[1])
            # ast.parse itself (its flags ask for a syntax tree): no code, whatever
            # the text or the file name it is given.
            f = raiser()
            if f is not None and genuine(f, AST_PARSE):
                fl = f.f_locals.get("flags")
                if type(fl) is int and fl & ONLY_AST:
                    return
            # A file name given relative (runpy compiles a script by the path it was
            # given) is that file: checked like an absolute one. "<...>" names a string.
            if fn is not None and fn and not fn.startswith("<"):
                fn = absolute(fn)
            if fn is not None and fn.startswith("/"):
                t = type(src)
                if t is bytes:
                    check_file(fn, src)
                elif t is bytearray or t is memoryview:
                    check_file(fn, bytes(src))
                elif t is str:
                    check_file(fn, src.encode("utf-8"))
                else:
                    # A syntax tree made into code is code nobody read as text (whoever
                    # built or changed the tree): refused. ast.parse of a tree gives a tree.
                    f = raiser()
                    if f is not None and genuine(f, AST_PARSE):
                        fl = f.f_locals.get("flags")
                        if type(fl) is int and fl & ONLY_AST:
                            return  # a tree in, a tree out
                    refuse(fn, "code compiled from a syntax tree is not run")
            else:
                built_at_run_time("code compiled from a string", True, src)
        elif event == "exec":
            code = args[0]
            if run_code is not None and code is run_code:
                return  # the run's own code (-c or standard input), as Enclawed read it
            if type(code) is not CodeType:
                refuse("code", "code built at run time is not run")
            fn = code.co_filename
            if fn and not fn.startswith("<"):
                fn = absolute(fn)
            if fn.startswith("/"):
                check_file(fn, None)
                if trusted(fn):
                    record(code)
            elif fn.startswith("<frozen "):
                if not frozen_code_ok(code):
                    refuse(fn, "it is not the interpreter's own frozen module of that name")
                record(code)
            else:
                built_at_run_time("code built at run time")
        elif event == "marshal.loads":
            ok = bool(OWN.get(get_ident()))  # the guard's own reading of a frozen module
            f = raiser()
            data = args[0] if args else None
            # The interpreter's frozen modules (FrozenImporter): its own data, read
            # by its own code, by a module name.
            if ok:
                pass
            elif f is not None and genuine(f, CALL_REMOVED) and f.f_locals.get("f") is get_frozen_object:
                ok = True
            elif f is not None and genuine(f, FROZEN_GET_CODE) and IMP_DICT.get("get_frozen_object") is get_frozen_object and f.f_globals.get("_imp") is _imp:
                ok = True
            elif f is not None and genuine(f, COMPILE_BYTECODE) and genuine(f.f_back, SOURCE_GET_CODE) and pyc_opened[0] is not None and type(data) in (bytes, bytearray, memoryview):
                # Cached bytecode: the bytes after the header of the toolchain's
                # own .pyc that was just opened, for a module whose source is
                # there (SourceLoader). A sourceless .pyc (SourcelessFileLoader):
                # never, wherever it lies (no toolchain ships one; a virtual
                # environment's would be bytecode nobody read as source).
                whole = own(read_file, pyc_opened[0])
                ok = whole is not None and whole[16:] == bytes(data)
            pyc_opened[0] = None
            if not ok:
                refuse("bytecode", "bytecode is read only from the toolchain's own cached files")
        elif event == "marshal.load":
            refuse("bytecode", "bytecode is read only from the toolchain's own cached files")
        elif event == "function.__new__":
            # A function made by hand from a code object (types.FunctionType): only
            # by annotationlib's own functions (annotations), of checked code.
            f = raiser()
            if f is None or not (ANNOTATE_GLOBALS is not None and f.f_globals is ANNOTATE_GLOBALS and f.f_code in ANNOTATE):
                refuse("a function made from a code object", "code built at run time is not run")
            code = args[0]
            fn = code.co_filename if type(code) is CodeType else None
            if fn is None:
                refuse("a function made from a code object", "code built at run time is not run")
            if fn and not fn.startswith("<"):
                check_file(absolute(fn), None)
            elif fn.startswith("<frozen "):
                pass  # code of a frozen module's function, made by the toolchain's own code
            else:
                built_at_run_time("a function made from a code object")
        elif event == "code.__new__":
            f = raiser()
            if f is None or not genuine(f, CORO):
                refuse("a code object", "code built at run time is not run")
        elif event == "open":
            p = args[0]
            if type(p) is int:
                rp = realpath("/proc/self/fd/%d" % p)
                if memory_name(rp):
                    refuse(rp, "a process's memory is not opened")
                pyc_opened[0] = None
                return
            p = text(p)
            if p is None:
                refuse("a file", "a file name Enclawed does not read")
            # A process's memory (/proc/<pid>/mem, task/*/mem, map_files, pagemap),
            # by its own name, an fd alias or a symbolic link to it: never opened
            # (/proc is also read-only, and the name guard opens no procfs file
            # for writing).
            rp = realpath(p)
            if memory_name(rp):
                refuse(p, "a process's memory is not opened")
            if p.endswith((".pyc", ".pyo")):
                if rp is None or not trusted(rp):
                    refuse(p, "cached bytecode is not read from a writable place")
                pyc_opened[0] = rp
            else:
                pyc_opened[0] = None
        elif event in ("subprocess.Popen", "_posixsubprocess.fork_exec", "os.system", "os.exec", "os.posix_spawn", "os.spawn", "os.fork", "os.forkpty", "pty.spawn", "os.startfile", "os.kill", "os.killpg"):
            # No program is started from a contained python run (what it runs was
            # read as code that starts none).
            refuse(event, "a contained python run starts no program")
        elif event in ("sys.settrace", "sys.setprofile", "sys.monitoring.register_callback", "sys.remote_exec", "cpython.remote_debugger_script"):
            # A tracer sees every frame (the guard's and the toolchain's) and may move
            # where one continues: no contained python run traces, profiles or monitors.
            refuse(event, "a contained python run traces no code")
        elif event in ("gc.get_objects", "gc.get_referrers", "gc.get_referents", "sys._current_frames", "sys._current_exceptions", "sys.addaudithook"):
            # The collector's object lists and other threads' frames reach the
            # guard's own state; a second audit hook would see what this one does.
            refuse(event, "a contained python run does not walk the interpreter's objects")
        elif event == "sys._getframe":
            if not OWN.get(get_ident()) and is_guard_frame(args[0]):
                refuse("a frame", "the guard's own frames are not handed out")
        elif event == "object.__getattr__":
            if len(args) == 2 and type(args[1]) is str and args[1] == "f_code" and is_guard_frame(args[0]):
                refuse("a frame", "the guard's own frames are not handed out")
            if len(args) == 2 and type(args[1]) is str and args[1] in ("__code__", "__defaults__", "__kwdefaults__") and type(args[0]) is types.FunctionType and own(getattr_, args[0], "__code__").co_filename == GUARD:
                refuse("the guard", "the guard's own functions are not read")
            if len(args) == 2 and type(args[1]) is str and args[1] in ("tb_frame", "gi_frame", "cr_frame", "ag_frame") and not OWN.get(get_ident()):
                if is_guard_frame(own(getattr_, args[0], args[1])):
                    refuse("a frame", "the guard's own frames are not handed out")
        elif event in ("object.__setattr__", "object.__delattr__"):
            # The guard's own functions (the archive hook on sys.path_hooks) are not changed.
            o = args[0] if args else None
            if type(o) is types.FunctionType and own(getattr_, o, "__code__").co_filename == GUARD:
                refuse("the guard", "the guard's own functions are not changed")
        elif event.startswith("ctypes."):
            # ctypes reaches memory and native code (CDLL(None) is the interpreter
            # itself): no contained python run uses it.
            refuse(event, "a contained python run loads no native code by ctypes")
        elif event == "import":
            name = text(args[0])
            if name is None or name.split(".")[0] in NATIVE_MODULES:
                refuse(name, "a contained python run loads no module that reaches memory")
            # An extension module (the event _imp.create_dynamic raises with the
            # file it loads): only one of the toolchain's own files, never one of
            # the project, a writable place or a file the run wrote.
            fl = args[1] if len(args) > 1 else None
            if fl is not None:
                fl = text(fl)
                if fl is None or not trusted(absolute(fl)):
                    refuse(fl, "native code from a file other than the toolchain's is not loaded")
        elif event == "sqlite3.enable_load_extension":
            # sqlite loads native code by a file name (load_extension, in Python or in SQL).
            on = args[1] if len(args) > 1 else True
            if not (type(on) in (bool, int) and not on):
                refuse(event, "a contained python run loads no native code into sqlite")
        elif event == "sqlite3.load_extension":
            refuse(event, "a contained python run loads no native code into sqlite")

    getattr_ = B["getattr"]

    IN_HOOK = {}

    def hook(event, args):
        tid = get_ident()
        depth = IN_HOOK.get(tid, 0)
        if depth and OWN.get(tid):
            return  # the guard's own call (a file it reads, a frame or frozen module it looks up)
        if depth:
            # An event raised inside the hook by anything but the guard's own calls
            # (the guard reads frames' f_code and takes id() of code objects): refused.
            if not (event == "builtins.id" or (event == "object.__getattr__" and len(args) == 2 and type(args[1]) is str and args[1] == "f_code")):
                refuse(event, "nothing runs inside the guard")
            return
        if gc_isenabled():
            gc_disable()
            refuse(event, "the collector runs only in the guard's own thread")
        IN_HOOK[tid] = depth + 1
        try:
            check(event, args)
        finally:
            if depth:
                IN_HOOK[tid] = depth
            else:
                del IN_HOOK[tid]

    # Modules that reach the interpreter's memory or native code by address.
    NATIVE_MODULES = frozenset(("_ctypes", "ctypes", "_ctypes_test", "_testcapi", "_testinternalcapi", "_testlimitedcapi", "_testbuffer", "_testmultiphase", "_testsinglephase", "_testimportmultiple", "_testclinic", "_testclinic_limited", "_xxtestfuzz", "_testexternalinspection", "_remote_debugging"))

    sys.dont_write_bytecode = True
    # Archives on sys.path (zipimport) load only from the toolchain: an archive the
    # run wrote or the project holds is not code Enclawed read. The hook is reachable
    # from sys.path_hooks: it holds its own path functions, not the audit hook's.
    import zipimport

    def archive_hook(realpath, trusted, zipimporter, type, str, bytes, ImportError, FSENC):
        def toolchain_archives_only(p):
            if type(p) is bytes:
                p = p.decode(FSENC)
            if type(p) is not str:
                raise ImportError("Enclawed: not an archive Enclawed read")
            q = realpath(p)
            if q is None or not trusted(q):
                raise ImportError("Enclawed: %s is not an archive Enclawed read" % q)
            return zipimporter(p)

        return toolchain_archives_only

    toolchain_archives_only = archive_hook(*_enclawed_paths(${json(toolchain)}), zipimport.zipimporter, type, str, bytes, ImportError, FSENC)
    sys.path_hooks[:] = [toolchain_archives_only if h is zipimport.zipimporter else h for h in sys.path_hooks]
    sys.path_importer_cache.clear()
    # No signal handler of the run: one would run inside the hook, with its frame.
    def no_handlers(*a):
        raise PermissionError("Enclawed: a contained python run installs no signal handler")

    _signal.signal = no_handlers

    # sys.settrace(None) and sys.setprofile(None) (doctest, pdb's cleanup) do
    # nothing: no tracer is ever set. Any other function is refused.
    def no_tracer(func):
        if func is not None:
            raise PermissionError("Enclawed: a contained python run traces no code")

    sys.settrace = no_tracer
    sys.setprofile = no_tracer
    if "signal" in MODULES:
        MODULES["signal"].signal = no_handlers

    # Every built-in module, loaded now: no module instance is made after the run
    # starts (a new instance of gc, _imp or _signal would hold the functions
    # replaced here).
    for n in sys.builtin_module_names:
        if n not in MODULES:
            try:
                __import__(n)
            except Exception:
                pass

    def no_new_builtin(*a, **k):
        raise ImportError("Enclawed: a contained python run makes no new built-in module")

    _imp.create_builtin = no_new_builtin

    # The collector runs only in a thread of the guard's own, never in the run's
    # frames or the hook's; the run cannot turn it back on.
    def no_enable():
        return None

    gc_disable()
    gc.enable = no_enable

    def collector():
        while True:
            sleep(1.0)
            gc_collect()

    _thread.start_new_thread(collector, ())

    # The toolchain's code objects of the modules loaded now.
    for m in tuple(MODULES.values()):
        if not issubclass(type(m), ModuleType):
            continue
        md = MODULE_DICT(m)
        fl = md.get("__file__")
        spec = md.get("__spec__")
        if not ((type(fl) is str and trusted(fl)) or getattr(spec, "origin", None) == "frozen"):
            continue
        for v in tuple(md.values()):
            if type(v) is types.FunctionType and v.__globals__ is md:
                record(v.__code__)
            elif issubclass(type(v), type) and getattr(v, "__module__", None) == md.get("__name__"):
                for x in tuple(TYPE_DICT(v).values()):
                    if type(x) in (staticmethod, classmethod):
                        x = x.__func__
                    if type(x) is property:
                        for y in (x.fget, x.fset, x.fdel):
                            if type(y) is types.FunctionType:
                                record(y.__code__)
                    elif type(x) is types.FunctionType:
                        record(x.__code__)
    add_hook(hook)


def pytest_args(name, rest):
    # pytest runs with its assertions plain and no cache plugin, whatever the line,
    # its settings or the environment say (these options come last and win):
    # assertion rewriting compiles syntax trees, code nobody read as text.
    if name not in ("pytest", "py.test", "pytest-3"):
        return rest
    if "--" in rest:
        sys.stderr.write("Enclawed: pytest with -- is not a form this contained run takes; nothing was run\\n")
        sys.exit(126)
    # The environment's plugins and options (PYTEST_PLUGINS, PYTEST_ADDOPTS): not
    # the line's, not read: dropped.
    import os

    os.environ.pop("PYTEST_PLUGINS", None)
    os.environ.pop("PYTEST_ADDOPTS", None)
    return rest + ["-p", "no:cacheprovider", "--assert=plain"]


# After the run's code returns, the guard only exits (raise SystemExit): its frame
# unwinds and no path leads back to reading its arguments; the interpreter's own
# shutdown (threads joined, atexit, flushed streams) follows as for any program.
def _enclawed_main():
    # Contained python runs need Python 3.14 or newer (what this guard was verified on).
    if sys.version_info < (3, 14):
        sys.stderr.write("Enclawed: contained Python needs Python 3.14 or newer; this is %d.%d; nothing was run\\n" % sys.version_info[:2])
        sys.exit(126)
    import os
    import runpy
    import types

    # The arguments as the run was started with them, copied once: nothing the
    # run does to sys.argv changes what this guard runs.
    args = tuple(sys.argv[1:])
    safe = bool(sys.flags.isolated or getattr(sys.flags, "safe_path", False))
    # The project virtual environment: its site-packages in place of the
    # system's (after them when it includes them), as its python has them.
    # Only the path: no .pth file of it is processed (that would run its lines).
    if _ENCLAWED_VENV is not None:
        venv_site, system_site = _ENCLAWED_VENV
        system = [p for p in sys.path if p.endswith(("/site-packages", "/dist-packages"))]
        sys.path[:] = [p for p in sys.path if p not in system] + [venv_site] + (system if system_site else [])
    # The guard's own directory is not where the run's modules are found.
    if sys.path and sys.path[0] == ${json(CODE_GUARD_DIR)}:
        del sys.path[0]
    if len(args) >= 2 and args[0] == "-c":
        code = compile(args[1], "<string>", "exec")
        sys.argv = ["-c"] + list(args[2:])
        if not safe:
            sys.path.insert(0, "")
        main = types.ModuleType("__main__")
        main.__builtins__ = __builtins__
        sys.modules["__main__"] = main
        _enclawed_guard(code)
        exec(code, main.__dict__)
        raise SystemExit(0)
    if not args or args[0] == "-":
        # The program on standard input: run only when it is one Enclawed read.
        import hashlib

        data = sys.stdin.buffer.read()
        if hashlib.sha256(data).hexdigest() not in _ENCLAWED_STDIN:
            sys.stderr.write("Enclawed: the program on standard input is not one Enclawed read; nothing was run\\n")
            sys.exit(126)
        code = compile(data, "<stdin>", "exec")
        sys.argv = (["-"] + list(args[1:])) if args else [""]
        if not safe:
            sys.path.insert(0, "")
        main = types.ModuleType("__main__")
        main.__builtins__ = __builtins__
        sys.modules["__main__"] = main
        _enclawed_guard(code)
        exec(code, main.__dict__)
        raise SystemExit(0)
    if len(args) >= 2 and args[0] == "-m":
        sys.argv = ["-m"] + pytest_args(args[1], list(args[2:]))
        if not safe:
            sys.path.insert(0, os.getcwd())
        _enclawed_guard()
        runpy._run_module_as_main(args[1], alter_argv=True)
        raise SystemExit(0)
    if len(args) >= 1 and not args[0].startswith("-"):
        script = args[0]
        sys.argv = [script] + pytest_args(os.path.basename(script), list(args[1:]))
        if not safe:
            sys.path.insert(0, os.path.dirname(os.path.abspath(script)))
        _enclawed_guard()
        runpy.run_path(script, run_name="__main__")
        raise SystemExit(0)
    sys.stderr.write("Enclawed: python %s is not a form this contained run takes (only a script, -m, or -c code Enclawed read); nothing was run\\n" % (args[0] if args else "with no script"))
    sys.exit(126)


_enclawed_main()
`;
}
//#endregion
//#region src/enclawed/containment/real-copies.ts
const SCRATCH = [
	"/tmp",
	"/dev/shm",
	"/run"
];
const under = (p, d) => p === d || p.startsWith(`${d}/`);
/**
* Where the copies are kept: the user's cache directory, unless that lies in a
* scratch place (a contained run's own /tmp shows there, and the prefix links
* beside each copy must stay visible): then a directory of this user's own in
* /var/tmp, which must be the user's and writable by no one else.
*/
function realCopiesDir() {
	const xdg = process.env.XDG_CACHE_HOME;
	const base = xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), ".cache");
	const dir = path.join(base, "enclawed", "real");
	if (!SCRATCH.some((d) => under(path.resolve(dir), d) || under(path.resolve(dir), os.tmpdir()))) return dir;
	const own = `/var/tmp/enclawed-real-${process.getuid?.() ?? "u"}`;
	try {
		fs.mkdirSync(own, { mode: 448 });
	} catch {}
	const st = fs.lstatSync(own);
	if (!st.isDirectory() || st.uid !== process.getuid?.() || (st.mode & 63) !== 0) throw new Error(`${own} is not a directory of this user's own`);
	return own;
}
function recordOf(st, sha256) {
	return {
		sha256,
		ino: String(st.ino),
		size: String(st.size),
		mtimeNs: String(st.mtimeNs),
		ctimeNs: String(st.ctimeNs)
	};
}
/**
* The execute-only copy of `program` (a real path) whose prefix is `prefix`:
* an existing one when it still matches its record, else made now.
*/
function realProgramCopy(program, prefix, dir = realCopiesDir()) {
	const content = fs.readFileSync(program);
	const sha256 = createHash("sha256").update(content).digest("hex");
	const key = createHash("sha256").update(`${sha256}\0${prefix}`).digest("hex").slice(0, 32);
	const bin = path.join(dir, key, "bin");
	const file = path.join(bin, path.basename(program));
	const side = `${file}.record.json`;
	try {
		const st = fs.lstatSync(file, { bigint: true });
		const rec = JSON.parse(fs.readFileSync(side, "utf8"));
		if (st.isFile() && (Number(st.mode) & 4095) === 73 && Number(st.uid) === process.getuid?.() && JSON.stringify(rec) === JSON.stringify(recordOf(st, sha256))) return file;
	} catch {}
	fs.mkdirSync(bin, {
		recursive: true,
		mode: 448
	});
	for (const p of [file, side]) fs.rmSync(p, { force: true });
	const tmp = `${file}.${process.pid}.tmp`;
	const fd = fs.openSync(tmp, "wx", 384);
	try {
		fs.writeSync(fd, content);
		fs.fsyncSync(fd);
		fs.fchmodSync(fd, 73);
	} finally {
		fs.closeSync(fd);
	}
	fs.renameSync(tmp, file);
	const st = fs.lstatSync(file, { bigint: true });
	fs.writeFileSync(side, JSON.stringify(recordOf(st, sha256)), { mode: 256 });
	return file;
}
//#endregion
//#region src/enclawed/containment/routing.ts
const email = (path, source = "body") => ({
	source,
	path,
	kind: "email"
});
const POSTMARK_FIELDS = [
	"To",
	"Cc",
	"Bcc",
	"From",
	"ReplyTo"
];
/** Profiles shipped with the framework, by id. */
const SHIPPED_EGRESS_PROFILES = {
	postmark: {
		id: "postmark",
		hosts: ["api.postmarkapp.com"],
		rules: [
			{
				method: "POST",
				path: "/email",
				fields: POSTMARK_FIELDS.map((f) => email(f))
			},
			{
				method: "POST",
				path: "/email/withTemplate",
				fields: POSTMARK_FIELDS.map((f) => email(f))
			},
			{
				method: "POST",
				path: "/email/batch",
				fields: POSTMARK_FIELDS.map((f) => email(`[].${f}`))
			},
			{
				method: "POST",
				path: "/email/batchWithTemplates",
				fields: POSTMARK_FIELDS.map((f) => email(`Messages[].${f}`))
			}
		]
	},
	sendgrid: {
		id: "sendgrid",
		hosts: ["api.sendgrid.com"],
		rules: [{
			method: "POST",
			path: "/v3/mail/send",
			fields: [
				email("personalizations[].to[].email"),
				email("personalizations[].cc[].email"),
				email("personalizations[].bcc[].email"),
				email("personalizations[].from.email"),
				email("from.email"),
				email("reply_to.email"),
				email("reply_to_list[].email")
			]
		}]
	},
	mailgun: {
		id: "mailgun",
		hosts: ["api.mailgun.net", "api.eu.mailgun.net"],
		rules: [{
			method: "POST",
			path: "/v3/*/messages",
			fields: [
				"to",
				"cc",
				"bcc",
				"from",
				"h:Reply-To"
			].map((f) => email(f))
		}]
	},
	"aws-ses-v2": {
		id: "aws-ses-v2",
		hosts: ["email.*.amazonaws.com"],
		rules: [{
			method: "POST",
			path: "/v2/email/outbound-emails",
			fields: [
				email("Destination.ToAddresses[]"),
				email("Destination.CcAddresses[]"),
				email("Destination.BccAddresses[]"),
				email("FromEmailAddress"),
				email("ReplyToAddresses[]")
			]
		}]
	},
	slack: {
		id: "slack",
		hosts: ["slack.com"],
		rules: [
			{
				method: "POST",
				path: "/api/chat.postMessage",
				fields: [{
					source: "body",
					path: "channel",
					kind: "string"
				}]
			},
			{
				method: "POST",
				path: "/api/chat.postEphemeral",
				fields: [{
					source: "body",
					path: "channel",
					kind: "string"
				}, {
					source: "body",
					path: "user",
					kind: "string"
				}]
			},
			{
				method: "POST",
				path: "/api/files.completeUploadExternal",
				fields: [{
					source: "body",
					path: "channel_id",
					kind: "string"
				}, {
					source: "body",
					path: "channels",
					kind: "string"
				}]
			}
		]
	},
	twilio: {
		id: "twilio",
		hosts: ["api.twilio.com"],
		rules: [{
			method: "POST",
			path: "/2010-04-01/Accounts/*/Messages.json",
			fields: [{
				source: "body",
				path: "To",
				kind: "string"
			}, {
				source: "body",
				path: "From",
				kind: "string"
			}]
		}]
	},
	"github-webhooks": {
		id: "github-webhooks",
		hosts: ["api.github.com"],
		rules: [
			{
				method: "POST",
				path: "/repos/*/*/hooks",
				fields: [{
					source: "body",
					path: "config.url",
					kind: "url"
				}]
			},
			{
				method: "PATCH",
				path: "/repos/*/*/hooks/*",
				fields: [{
					source: "body",
					path: "config.url",
					kind: "url"
				}]
			},
			{
				method: "PATCH",
				path: "/repos/*/*/hooks/*/config",
				fields: [{
					source: "body",
					path: "url",
					kind: "url"
				}]
			},
			{
				method: "POST",
				path: "/orgs/*/hooks",
				fields: [{
					source: "body",
					path: "config.url",
					kind: "url"
				}]
			},
			{
				method: "PATCH",
				path: "/orgs/*/hooks/*",
				fields: [{
					source: "body",
					path: "config.url",
					kind: "url"
				}]
			}
		]
	}
};
function hostMatches(pattern, host) {
	const p = pattern.toLowerCase().split(".");
	const h = host.toLowerCase().replace(/\.$/, "").split(".");
	return p.length === h.length && p.every((label, i) => label === "*" || label === h[i]);
}
function pathMatches(pattern, path) {
	const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
	const p = pattern.replace(/\/+$/, "").split("/");
	const s = clean.split("/");
	for (let i = 0; i < p.length; i++) {
		if (p[i] === "**") return true;
		if (i >= s.length) return false;
		if (p[i] !== "*" && p[i].toLowerCase() !== s[i].toLowerCase()) return false;
	}
	return p.length === s.length;
}
/** The rules of `profiles` that apply to this request. */
function applicableRules(profiles, host, method, path) {
	const out = [];
	for (const profile of profiles) {
		if (!profile.hosts.some((h) => hostMatches(h, host))) continue;
		for (const rule of profile.rules) if ((!rule.method || rule.method.toUpperCase() === method.toUpperCase()) && pathMatches(rule.path, path)) out.push(rule);
	}
	return out;
}
const EMAIL_RE = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*/g;
/** Every address in an address-list string ("A <a@x>, b@y; c@z"), lower-cased. */
function emailsIn(text) {
	return [...text.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase());
}
function normalizeUrl(text) {
	try {
		const u = new URL(text.trim());
		u.hash = "";
		return u.href;
	} catch {
		return null;
	}
}
function normalizeString(text) {
	return text.trim().replace(/^[#@]/, "").toLowerCase();
}
/**
* The values a routing field carries, normalized the way the API itself
* reads them: an email field may hold a list of addresses with display
* names; a URL is compared in its parsed form.
*/
function routingValues(kind, raw) {
	if (kind === "email") {
		const found = emailsIn(raw);
		return found.length > 0 ? found : raw.trim() ? [`raw:${raw.trim().toLowerCase()}`] : [];
	}
	if (kind === "url") {
		const u = normalizeUrl(raw);
		return u ? [u] : raw.trim() ? [`raw:${raw.trim()}`] : [];
	}
	return raw.trim() ? [normalizeString(raw)] : [];
}
/** Every value a tool call's arguments (or the declared constants) can supply, in all normalized forms. */
function suppliedValues(sources) {
	const out = /* @__PURE__ */ new Set();
	const visit = (v, depth) => {
		if (depth > 32) return;
		if (typeof v === "string") {
			for (const e of emailsIn(v)) out.add(e);
			const trimmed = v.trim();
			if (trimmed) {
				out.add(`raw:${trimmed.toLowerCase()}`);
				out.add(`raw:${trimmed}`);
				out.add(normalizeString(trimmed));
				const u = normalizeUrl(trimmed);
				if (u) out.add(u);
			}
		} else if (typeof v === "number" || typeof v === "boolean") out.add(normalizeString(String(v)));
		else if (Array.isArray(v)) for (const x of v) visit(x, depth + 1);
		else if (v && typeof v === "object") for (const x of Object.values(v)) visit(x, depth + 1);
	};
	for (const s of sources) visit(s, 0);
	return out;
}
function addField(m, k, v) {
	const list = m.get(k) ?? [];
	list.push(v);
	m.set(k, list);
}
function parseMultipart(body, boundary) {
	const fields = /* @__PURE__ */ new Map();
	const delim = Buffer.from(`--${boundary}`);
	let pos = body.indexOf(delim);
	if (pos < 0) return null;
	for (;;) {
		pos += delim.length;
		if (body.subarray(pos, pos + 2).toString() === "--") return fields;
		const headEnd = body.indexOf("\r\n\r\n", pos);
		if (headEnd < 0) return null;
		const head = body.subarray(pos, headEnd).toString("utf8");
		const next = body.indexOf(delim, headEnd + 4);
		if (next < 0) return null;
		const content = body.subarray(headEnd + 4, next - 2);
		const nameMatch = /content-disposition:[^\r\n]*\bname="([^"]*)"/i.exec(head);
		const isFile = /content-disposition:[^\r\n]*\bfilename=/i.test(head);
		if (nameMatch && !isFile) addField(fields, nameMatch[1], content.toString("utf8"));
		pos = next;
	}
}
/** Parse a request body for routing-field extraction. Never throws. */
function parseRequestBody(contentType, body) {
	if (body.length === 0) return { kind: "empty" };
	const ct = (contentType ?? "").toLowerCase();
	try {
		if (ct.includes("json") || !ct && /^\s*[[{]/.test(body.subarray(0, 64).toString("utf8"))) return {
			kind: "json",
			value: JSON.parse(body.toString("utf8"))
		};
		if (ct.startsWith("application/x-www-form-urlencoded")) {
			const fields = /* @__PURE__ */ new Map();
			for (const [k, v] of new URLSearchParams(body.toString("utf8"))) addField(fields, k, v);
			return {
				kind: "form",
				fields
			};
		}
		if (ct.startsWith("multipart/form-data")) {
			const b = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");
			const parsed = b ? parseMultipart(body, (b[1] ?? b[2]).trim()) : null;
			return parsed ? {
				kind: "form",
				fields: parsed
			} : {
				kind: "unparseable",
				reason: "malformed multipart body"
			};
		}
	} catch (err) {
		return {
			kind: "unparseable",
			reason: err instanceof Error ? err.message : String(err)
		};
	}
	return {
		kind: "unparseable",
		reason: `content type "${contentType ?? ""}" is not one the profile can read`
	};
}
function jsonValuesAt(value, path) {
	const steps = path.replace(/\[\]/g, ".[]").split(".").filter((s) => s.length > 0);
	let current = [value];
	for (const step of steps) {
		const next = [];
		for (const c of current) if (step === "[]") {
			if (Array.isArray(c)) next.push(...c);
			else if (c !== void 0 && c !== null) next.push(c);
		} else if (c && typeof c === "object" && !Array.isArray(c)) {
			for (const [k, v] of Object.entries(c)) if (k.toLowerCase() === step.toLowerCase()) next.push(v);
		}
		current = next;
	}
	const values = [];
	let nonString = false;
	const collect = (v, depth) => {
		if (typeof v === "string") values.push(v);
		else if (typeof v === "number") values.push(String(v));
		else if (Array.isArray(v) && depth < 4) v.forEach((x) => collect(x, depth + 1));
		else if (v && typeof v === "object" && depth < 4) Object.values(v).forEach((x) => collect(x, depth + 1));
		else if (v !== null && v !== void 0 && typeof v !== "boolean") nonString = true;
	};
	current.forEach((v) => collect(v, 0));
	return {
		values,
		nonString
	};
}
/**
* Check every routing field of `req` against the values the in-flight
* call(s) supplied and the declared constants. A request no profile rule
* covers has no routing fields to check (`checked: 0`).
*/
function checkRoutingProvenance(req, profiles, supplied) {
	const path = req.target.split("?")[0];
	const rules = applicableRules(profiles, req.host, req.method, path);
	if (rules.length === 0) return {
		ok: true,
		checked: 0
	};
	let parsed = null;
	const query = new URLSearchParams(req.target.includes("?") ? req.target.slice(req.target.indexOf("?") + 1) : "");
	let checked = 0;
	for (const rule of rules) for (const field of rule.fields) {
		let raws = [];
		if (field.source === "header") {
			const want = field.path.toLowerCase();
			for (const [k, v] of Object.entries(req.headers)) if (k.toLowerCase() === want && v !== void 0) raws.push(...Array.isArray(v) ? v : [v]);
		} else if (field.source === "query") raws = query.getAll(field.path);
		else {
			parsed ??= parseRequestBody(req.contentType, req.body);
			if (parsed.kind === "unparseable") return {
				ok: false,
				code: "routing-body-unparseable",
				message: `the request body cannot be read to check its routing fields (${parsed.reason}); refused`
			};
			if (parsed.kind === "json") {
				const found = jsonValuesAt(parsed.value, field.path);
				if (found.nonString) return {
					ok: false,
					code: "routing-body-unparseable",
					field: field.path,
					message: `routing field ${field.path} holds a value that is not text; refused`
				};
				raws = found.values;
			} else if (parsed.kind === "form") {
				for (const [k, v] of parsed.fields) if (k.toLowerCase() === field.path.toLowerCase()) raws.push(...v);
			}
		}
		for (const raw of raws) for (const value of routingValues(field.kind, raw)) {
			checked++;
			if (!supplied.has(value)) return {
				ok: false,
				code: "routing-field-not-from-call",
				field: field.path,
				value: value.replace(/^raw:/, ""),
				message: `routing field ${field.path} = ${value.replace(/^raw:/, "")} does not come from the tool call's arguments or the declared constants; refused`
			};
		}
	}
	return {
		ok: true,
		checked
	};
}
/** Resolve profile references (shipped ids or inline profiles); unknown ids are an error. */
function resolveProfiles(refs) {
	const out = [];
	for (const ref of refs) if (typeof ref === "string") {
		const p = SHIPPED_EGRESS_PROFILES[ref];
		if (!p) return {
			ok: false,
			message: `unknown egress profile "${ref}"`
		};
		out.push(p);
	} else out.push(ref);
	return {
		ok: true,
		profiles: out
	};
}
//#endregion
//#region src/enclawed/containment/plan.ts
const realCopiesDirReal = () => {
	try {
		return fs.realpathSync(realCopiesDir());
	} catch {
		return realCopiesDir();
	}
};
/** Directories programs are looked up in by name (never the caller's PATH). */
const PROGRAM_DIRS = [
	"/usr/local/bin",
	"/usr/bin",
	"/bin",
	"/usr/sbin",
	"/sbin"
];
const hex = (s) => Buffer.from(s, "utf8").toString("hex");
/**
* Read-only data a runtime loads besides its libraries (Debian's node
* loads externalized builtins from /usr/share/nodejs; git its templates
* and helpers). Mounted only when the runtime is an allowed program.
*/
const RUNTIME_DATA = {
	node: [{
		path: "/usr/share/nodejs",
		exec: false
	}, {
		path: "/usr/lib/nodejs",
		exec: false
	}],
	git: [{
		path: "/usr/share/git-core",
		exec: false
	}, {
		path: "/usr/lib/git-core",
		exec: true
	}]
};
/** Roots that would hand over the system or every user's files. */
const TOO_BROAD = new Set([
	"/",
	"/bin",
	"/boot",
	"/dev",
	"/etc",
	"/home",
	"/lib",
	"/lib32",
	"/lib64",
	"/libx32",
	"/proc",
	"/root",
	"/run",
	"/sbin",
	"/sys",
	"/usr",
	"/var",
	"/Users"
]);
/** Directory names (any depth inside a read-write root) that configure what runs later. */
const EXEC_CONFIG_DIRS = [
	".claude",
	".codex",
	".gemini",
	".cursor",
	".kiro",
	".opencode",
	".amp",
	".clinerules",
	".vscode",
	".husky",
	".githooks",
	".devcontainer",
	".direnv"
];
/** The entries of a .git directory that hold its history: bound read-only with decl.gitHistoryReadOnly. */
const GIT_HISTORY_ENTRIES = [
	"HEAD",
	"refs",
	"packed-refs",
	"logs",
	"reftable",
	"ORIG_HEAD"
];
/** [parent, child] pairs. */
const EXEC_CONFIG_PAIRS = [
	[".github", "workflows"],
	[".github", "hooks"],
	[".git", "hooks"],
	[".git", "config"],
	[".git", "info"]
];
/**
* File names that configure what runs later. Each one, when missing at the
* top of a read-write root, is made to exist as a read-only placeholder
* whose content means "nothing configured" to its reader (PLACEHOLDER_FILE_CONTENT).
*
* Deliberately absent here (no placeholder is made for them): version pins
* (.nvmrc, .node-version, .python-version, .ruby-version, rust-toolchain):
* a placeholder would select no toolchain at all. They are still refused by
* name (EXEC_CONFIG_NAMES: a version manager's proxy starts what they
* name); .gitmodules (a submodule's `update = !command` is honored only
* from .git/config, which is protected); and project
* manifests (package.json, pyproject.toml, Makefile), which are the
* project's content rather than configuration a tool picks up unasked.
*/
const EXEC_CONFIG_FILES = [
	".mcp.json",
	".envrc",
	".npmrc",
	".yarnrc",
	".yarnrc.yml",
	".pnpmfile.cjs",
	".pre-commit-config.yaml",
	".pre-commit-config.yml",
	".tool-versions",
	"mise.toml",
	".mise.toml",
	"mise.local.toml",
	".mise.local.toml",
	"bunfig.toml",
	".bunfig.toml",
	"opencode.json",
	"opencode.jsonc",
	".aider.conf.yml",
	"config.worktree",
	".gitattributes"
];
/** Placeholder content that each file's reader takes as "nothing configured" (default: empty). */
const PLACEHOLDER_FILE_CONTENT = {
	".mcp.json": "{\"mcpServers\":{}}\n",
	".yarnrc.yml": "{}\n",
	".pre-commit-config.yaml": "repos: []\n",
	".pre-commit-config.yml": "repos: []\n",
	"opencode.json": "{}\n",
	"opencode.jsonc": "{}\n",
	".aider.conf.yml": "{}\n"
};
/** Top-level outputs a package install writes (its dependency trees and environments). */
const INSTALL_OUTPUTS = [
	"node_modules",
	".venv",
	"venv",
	"__pypackages__",
	".yarn",
	".pnp.cjs",
	".pnp.loader.mjs",
	".pnp.data.json",
	"build",
	"__pycache__"
];
/** Build metadata pip writes beside the project (`<name>.egg-info`). */
const isInstallMetadata = (name) => /^[^./][^/]*\.egg-info$/.test(name);
/** Lockfiles a package install writes. */
const INSTALL_LOCKFILES = [
	"package-lock.json",
	"npm-shrinkwrap.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"bun.lock",
	"bun.lockb",
	"poetry.lock",
	"Pipfile.lock",
	"uv.lock",
	"pdm.lock"
];
/** Manifests an install may update; only their dependency fields may change (checked after the run). */
const INSTALL_MANIFESTS = ["package.json", "pyproject.toml"];
/**
* Made to exist (as empty read-only directories) at the top of every
* read-write root when missing, so they cannot be created from inside.
* The host sees an empty directory while the process runs; it is removed
* afterwards if it is still empty.
*/
const PLACEHOLDER_DIRS = [
	".claude",
	".codex",
	".gemini",
	".cursor",
	".kiro",
	".opencode",
	".amp",
	".vscode",
	".github/workflows",
	".github/hooks"
];
/** The user's credential stores, relative to HOME; masked when inside a root. */
const CREDENTIAL_PATHS = [
	".ssh",
	".aws",
	".azure",
	".config/gcloud",
	".kube",
	".docker",
	".gnupg",
	".netrc",
	".git-credentials",
	".config/gh",
	".config/hub",
	".npmrc",
	".pypirc",
	".cargo/credentials",
	".cargo/credentials.toml",
	".claude",
	".claude.json",
	".codex",
	".gemini",
	".config/enclawed",
	".enclawed",
	".password-store",
	".local/share/keyrings",
	".bash_history",
	".zsh_history",
	".python_history",
	".node_repl_history"
];
/** Credential-format DLP findings (structured formats only: no prose patterns). */
const CREDENTIAL_DLP_IDS = new Set([
	"aws-access-key-id",
	"gcp-service-account",
	"azure-storage-key",
	"github-token",
	"gitlab-token",
	"openai-key",
	"anthropic-key",
	"slack-bot-token",
	"stripe-key",
	"jwt",
	"pem-private-key"
]);
function credentialFindings(text) {
	const out = [];
	for (let i = 0; i < text.length; i += 512 * 1024) {
		const chunk = text.slice(Math.max(0, i - 4096), i + 512 * 1024);
		for (const f of scan(chunk, { onOversize: "truncate" })) if (CREDENTIAL_DLP_IDS.has(f.id)) out.push(f.id);
	}
	return [...new Set(out)];
}
/** Variables the containment sets itself; a declaration may not override them. */
const RESERVED_ENV = /^(ENCLAWED_.*|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|CURL_CA_BUNDLE|GIT_SSL_CAINFO|GIT_CONFIG_NOSYSTEM|GIT_CONFIG_GLOBAL|GIT_CONFIG_SYSTEM|HTTPS?_PROXY|https?_proxy|ALL_PROXY|all_proxy|NO_PROXY|no_proxy)$/;
const SANDBOX_HOME = "/sandbox/home";
/** Where the name guard (./name-guard.c) is inside every view. */
const NAME_GUARD_VIEW_PATH = "/.enclawed/name-guard";
const CA_BUNDLE_PATHS = [
	"/etc/ssl/certs/ca-certificates.crt",
	"/etc/pki/tls/certs/ca-bundle.crt",
	"/etc/ssl/cert.pem"
];
const DNS_SERVER = "198.18.0.1";
const isInside = (child, parent) => child === parent || child.startsWith(parent.endsWith("/") ? parent : `${parent}/`);
function refuse(code, message) {
	return {
		ok: false,
		code,
		message
	};
}
/** Shared libraries of an ELF file, via the system's ldd (null: could not resolve). */
function lddLibraries(realPath) {
	const ldd = ["/usr/bin/ldd", "/bin/ldd"].find((p) => fs.existsSync(p));
	if (!ldd) return null;
	let out;
	try {
		out = execFileSync(ldd, [realPath], {
			encoding: "utf8",
			env: {
				LC_ALL: "C",
				PATH: "/usr/bin:/bin"
			},
			timeout: 1e4,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
	} catch (err) {
		const e = err;
		const text = `${e.stdout ?? ""}${e.stderr ?? ""}`;
		return /not a dynamic executable|statically linked/.test(text) ? [] : null;
	}
	const libs = [];
	for (const line of out.split("\n")) {
		if (/not found/.test(line)) return null;
		const m = /=>\s+(\/\S+)/.exec(line) ?? /^\s*(\/\S+)\s+\(/.exec(line);
		if (m) libs.push(m[1]);
	}
	return libs;
}
function isElf(p) {
	try {
		const fd = fs.openSync(p, "r");
		try {
			const b = Buffer.alloc(4);
			fs.readSync(fd, b, 0, 4, 0);
			return b.equals(Buffer.from([
				127,
				69,
				76,
				70
			]));
		} finally {
			fs.closeSync(fd);
		}
	} catch {
		return false;
	}
}
function shebang(p) {
	try {
		const fd = fs.openSync(p, "r");
		try {
			const b = Buffer.alloc(256);
			const n = fs.readSync(fd, b, 0, 256, 0);
			const head = b.subarray(0, n).toString("latin1");
			if (!head.startsWith("#!")) return null;
			return head.slice(2).split("\n")[0].trim().split(/\s+/).filter(Boolean);
		} finally {
			fs.closeSync(fd);
		}
	} catch {
		return null;
	}
}
function lookupProgram(name) {
	if (path.isAbsolute(name)) return fs.existsSync(name) ? name : null;
	if (name.includes("/")) return null;
	for (const dir of PROGRAM_DIRS) {
		const p = path.join(dir, name);
		try {
			const st = fs.statSync(p);
			if (st.isFile() && st.mode & 73) return p;
		} catch {}
	}
	return null;
}
/** View builder: tracks what exists in the view so paths and their symlink chains are added once. */
var ViewBuilder = class {
	constructor() {
		this.ops = [];
		this.made = new Set(["/"]);
	}
	dir(p) {
		const parts = p.split("/").filter(Boolean);
		let cur = "";
		for (const part of parts) {
			cur += `/${part}`;
			if (!this.made.has(cur)) {
				this.made.add(cur);
				this.ops.push({
					op: "dir",
					path: cur
				});
			}
		}
	}
	/**
	* Make `hostPath` exist in the view at the same path, replicating each
	* symlink on the way, and bind the final file or directory. Returns the
	* real path that was bound.
	*/
	bindPath(hostPath, opts, depth = 0) {
		if (depth > 16) throw new Error(`too many symbolic links resolving ${hostPath}`);
		const parts = path.resolve(hostPath).split("/").filter(Boolean);
		let cur = "";
		for (let i = 0; i < parts.length; i++) {
			const next = `${cur}/${parts[i]}`;
			if (fs.lstatSync(next).isSymbolicLink()) {
				const target = fs.readlinkSync(next);
				if (!this.made.has(next)) {
					this.dir(cur || "/");
					this.made.add(next);
					this.ops.push({
						op: "symlink",
						path: next,
						target
					});
				}
				const resolved = path.resolve(cur || "/", target, ...parts.slice(i + 1));
				return this.bindPath(resolved, opts, depth + 1);
			}
			cur = next;
		}
		if (!this.made.has(`bind:${cur}`)) {
			const st = fs.statSync(cur);
			this.dir(path.dirname(cur));
			this.made.add(`bind:${cur}`);
			this.made.add(cur);
			this.ops.push({
				op: "bind",
				src: cur,
				path: cur,
				file: !st.isDirectory(),
				ro: opts.ro,
				exec: opts.exec
			});
		}
		return cur;
	}
	file(p, content, mode = 420, base64 = false) {
		this.dir(path.dirname(p));
		this.made.add(p);
		this.ops.push({
			op: "file",
			path: p,
			content,
			...mode === 493 ? { mode } : {},
			...base64 ? { base64: true } : {}
		});
	}
	/**
	* Show a wrapper at a bound program's path and the real program beside it
	* at `hidden` (the same directory, so its own prefix logic still holds).
	*/
	wrapProgram(bound, hidden, wrapper) {
		const i = this.ops.findIndex((o) => o.op === "bind" && o.path === bound);
		if (i < 0) throw new Error(`${bound} is not bound in the view`);
		const o = this.ops[i];
		this.ops[i] = {
			op: "file",
			path: bound,
			content: wrapper,
			mode: 493
		};
		this.dir(path.dirname(hidden));
		this.made.add(hidden);
		this.ops.push({
			...o,
			path: hidden,
			ro: true,
			exec: true
		});
	}
	/** Show `binary` (the name guard) at a bound program's path, in place of the program. */
	wrapWith(bound, binary) {
		const i = this.ops.findIndex((o) => o.op === "bind" && o.path === bound);
		if (i < 0) throw new Error(`${bound} is not bound in the view`);
		const o = this.ops[i];
		this.ops[i] = {
			...o,
			src: binary,
			file: true,
			ro: true,
			exec: true
		};
	}
	push(op) {
		if (op.op === "tmpfs" || op.op === "device" || op.op === "symlink") this.dir(path.dirname(op.path));
		this.made.add(op.path);
		this.ops.push(op);
	}
};
const MAX_WALK_ENTRIES = 4e5;
const MAX_INSTALL_TOP_LEVEL = 1e4;
/**
* Top-level names of `root` that git ignores (generated output: dist, build,
* coverage, *.egg-info), when `root` is a git work tree. Read with git's own
* matcher, with every configurable program off (no fsmonitor, no hooks).
*/
function ignoredTopLevel(root) {
	const git = ["/usr/bin/git", "/bin/git"].find((p) => fs.existsSync(p));
	if (!git || !fs.existsSync(path.join(root, ".git"))) return /* @__PURE__ */ new Set();
	try {
		const out = execFileSync(git, [
			"-c",
			"core.fsmonitor=false",
			"-c",
			"core.hooksPath=/dev/null",
			"ls-files",
			"--others",
			"--ignored",
			"--exclude-standard",
			"--directory",
			"-z"
		], {
			cwd: root,
			encoding: "utf8",
			env: {
				PATH: "/usr/bin:/bin",
				GIT_CONFIG_NOSYSTEM: "1",
				GIT_CONFIG_GLOBAL: "/dev/null",
				LC_ALL: "C"
			},
			timeout: 2e4,
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			maxBuffer: 64 * 1024 * 1024
		});
		return new Set(out.split("\0").filter(Boolean).map((p) => p.split("/")[0]));
	} catch {
		return /* @__PURE__ */ new Set();
	}
}
const MAX_WALK_DEPTH = 24;
/** Execution-configuration paths that exist inside `root` (bounded walk; node_modules skipped). */
function findExecConfig(root) {
	const found = [];
	let seen = 0;
	const dirSet = new Set(EXEC_CONFIG_DIRS);
	const fileSet = new Set(EXEC_CONFIG_FILES);
	const stack = [{
		dir: root,
		depth: 0
	}];
	while (stack.length > 0) {
		const { dir, depth } = stack.pop();
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		const base = path.basename(dir);
		for (const e of entries) {
			if (++seen > MAX_WALK_ENTRIES) return {
				paths: found,
				truncated: true
			};
			const p = path.join(dir, e.name);
			const lower = e.name.toLowerCase();
			if (EXEC_CONFIG_PAIRS.some(([parent, child]) => parent === base.toLowerCase() && child === lower)) {
				found.push(p);
				continue;
			}
			if (dirSet.has(lower) || fileSet.has(lower)) {
				found.push(p);
				continue;
			}
			if (!e.isDirectory() || e.isSymbolicLink() || depth >= MAX_WALK_DEPTH) continue;
			if (lower === "node_modules") continue;
			if (lower === ".git") {
				stack.push({
					dir: p,
					depth: MAX_WALK_DEPTH
				});
				continue;
			}
			stack.push({
				dir: p,
				depth: depth + 1
			});
		}
	}
	return {
		paths: found,
		truncated: false
	};
}
/** Decide the containment for a declaration. Reads the filesystem; starts nothing. */
function planContainment(decl, ctx) {
	const pins = decl.codePins;
	const readPins = (decl.readPins ?? []).filter((r) => typeof r?.path === "string" && path.isAbsolute(r.path) && !/[\n\r]/.test(r.path) && typeof r?.sha256 === "string" && /^[0-9a-f]{64}$/.test(r.sha256));
	if (readPins.length !== (decl.readPins ?? []).length || readPins.length > 4096) return refuse("containment-declaration-invalid", "the files a shell may read are not well formed");
	if (pins !== void 0) {
		if (!Array.isArray(pins) || pins.length > 4096 || pins.some((p) => !p || typeof p.path !== "string" || !path.isAbsolute(p.path) || typeof p.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(p.sha256) || typeof p.exec !== "boolean" || p.shell !== void 0 && (p.shell !== true || typeof p.contentBase64 !== "string" || p.contentBase64.length > 1024 * 1024 || createHash("sha256").update(Buffer.from(p.contentBase64, "base64")).digest("hex") !== p.sha256))) return refuse("containment-declaration-invalid", "code pins must be { path (absolute), sha256 (hex), exec } entries (a shell pin with the content whose SHA-256 it is)");
	}
	const stdinPins = decl.stdinCodePins;
	if (stdinPins !== void 0 && (pins === void 0 || !Array.isArray(stdinPins) || stdinPins.length > 256 || stdinPins.some((h) => typeof h !== "string" || !/^[0-9a-f]{64}$/.test(h)))) return refuse("containment-declaration-invalid", "standard-input code pins must be SHA-256 digests (hex), given with code pins");
	const ownLine = typeof decl.command === "string" && /^(?:sh|bash|dash)$/.test(path.basename(decl.command)) && Array.isArray(decl.args) && decl.args[0] === "-c" && typeof decl.args[1] === "string" ? [decl.args[1]] : [];
	const shellTexts = Array.isArray(decl.shellTexts) ? [...decl.shellTexts, ...ownLine] : decl.shellTexts === void 0 ? ownLine : null;
	if (!Array.isArray(shellTexts) || shellTexts.length > 1024 || shellTexts.some((t) => typeof t !== "string") || shellTexts.reduce((n, t) => n + t.length, 0) > 4 * 1024 * 1024) return refuse("containment-declaration-invalid", "shell -c texts must be a list of strings");
	const pinned = pins !== void 0;
	if (decl.build !== void 0) {
		if (decl.kind !== "project-script" || pinned || (decl.destinations ?? []).length > 0 || (decl.secrets ?? []).length > 0 || (decl.execConfigWritable ?? []).length > 0 || !Array.isArray(decl.build?.masks) || decl.build.masks.length > 4096 || decl.build.masks.some((m) => typeof m !== "string" || !path.isAbsolute(m) || /[\n\r]/.test(m)) || decl.build.gpu !== void 0 && (!Array.isArray(decl.build.gpu.devices) || !Array.isArray(decl.build.gpu.dirs) || decl.build.gpu.devices.some((d) => typeof d !== "string" || !GPU_DEVICE.test(d)) || decl.build.gpu.dirs.some((d) => !GPU_DRIVER_DIRS.includes(d))) || decl.build.failureNotice !== void 0 && (typeof decl.build.failureNotice !== "string" || decl.build.failureNotice.length > 500)) return refuse("containment-declaration-invalid", "a contained build is a project script with no code pins, no destination, no secret and no writable configuration; its masks are absolute paths");
	}
	const strictExec = decl.kind === "mcp-server" || pinned;
	if (!decl.label || typeof decl.command !== "string" || !Array.isArray(decl.args)) return refuse("containment-declaration-invalid", "a containment declaration needs a label, a command and arguments");
	if (!path.isAbsolute(decl.cwd)) return refuse("containment-declaration-invalid", `working directory must be absolute: ${decl.cwd}`);
	const roots = [];
	for (const r of decl.roots) {
		if (!path.isAbsolute(r.path) || r.access !== "ro" && r.access !== "rw") return refuse("containment-declaration-invalid", `root must be an absolute path with access ro or rw: ${r.path}`);
		let real;
		try {
			real = fs.realpathSync(r.path);
		} catch {
			return refuse("containment-root-missing", `declared root does not exist: ${r.path}`);
		}
		if (!fs.statSync(real).isDirectory()) return refuse("containment-declaration-invalid", `declared root is not a directory: ${r.path}`);
		for (const p of [path.resolve(r.path), real]) if (TOO_BROAD.has(p)) return refuse("containment-root-too-broad", `declared root ${p} would expose the system or every user's files`);
		for (const c of CREDENTIAL_PATHS) {
			const cred = path.join(ctx.home, c);
			if (isInside(real, cred) || isInside(path.resolve(r.path), cred)) return refuse("containment-root-is-credential-store", `declared root ${r.path} is inside the credential store ${cred}`);
		}
		const exec = pinned && r.access === "rw" ? false : r.exec ?? (strictExec ? false : r.access === "rw");
		roots.push({
			declared: path.resolve(r.path),
			real,
			access: r.access,
			exec
		});
	}
	const cwdReal = (() => {
		try {
			return fs.realpathSync(decl.cwd);
		} catch {
			return path.resolve(decl.cwd);
		}
	})();
	if (!roots.some((r) => isInside(cwdReal, r.real))) return refuse("containment-cwd-outside-roots", `working directory ${decl.cwd} is not inside a declared root`);
	const view = new ViewBuilder();
	const libs = ctx.libraries ?? lddLibraries;
	const programReals = /* @__PURE__ */ new Map();
	const programBound = /* @__PURE__ */ new Map();
	const pending = [...decl.programs];
	const seenProgram = /* @__PURE__ */ new Set();
	while (pending.length > 0) {
		const name = pending.shift();
		if (seenProgram.has(name)) continue;
		seenProgram.add(name);
		const found = lookupProgram(name);
		if (!found) return refuse("containment-program-missing", `program "${name}" was not found in ${PROGRAM_DIRS.join(":")}`);
		const real = fs.realpathSync(found);
		if (isInside(real, realCopiesDirReal())) return refuse("containment-program-missing", `program "${name}" is not one a run may name`);
		for (const r of roots) if (r.access === "rw" && isInside(real, r.real)) return refuse("containment-program-writable", `program ${found} is inside the writable root ${r.declared}`);
		if (pinned && (UNGUARDED_INTERPRETERS.test(path.basename(real)) || UNGUARDED_INTERPRETERS.test(path.basename(found)))) return refuse("containment-command-not-allowed", `program ${found} loads code from files and has no code guard, so a run with code pins cannot include it`);
		programReals.set(found, real);
		programBound.set(found, view.bindPath(found, {
			ro: true,
			exec: true
		}));
		const py = /^python(\d+\.\d+)$/.exec(path.basename(real));
		if (py && fs.existsSync(`/usr/lib/python${py[1]}`)) view.bindPath(`/usr/lib/python${py[1]}`, {
			ro: true,
			exec: true
		});
		for (const data of RUNTIME_DATA[path.basename(found)] ?? []) if (fs.existsSync(data.path)) view.bindPath(data.path, {
			ro: true,
			exec: data.exec
		});
		if (isElf(real)) {
			const l = libs(real);
			if (l === null) return refuse("containment-libraries-unresolved", `the shared libraries of ${found} cannot be resolved`);
			for (const lib of l) view.bindPath(lib, {
				ro: true,
				exec: true
			});
		} else {
			const sb = shebang(real);
			if (sb && sb.length > 0) {
				pending.push(sb[0]);
				if (path.basename(sb[0]) === "env") {
					const interp = sb.slice(1).find((a) => !a.startsWith("-"));
					if (interp) pending.push(interp);
				}
			}
		}
	}
	if (ctx.nameGuard) {
		view.file(NAME_GUARD_VIEW_PATH, "");
		view.push({
			op: "bind",
			src: fs.realpathSync(ctx.nameGuard),
			path: NAME_GUARD_VIEW_PATH,
			file: true,
			ro: true,
			exec: true
		});
		const l = libs(fs.realpathSync(ctx.nameGuard));
		if (l === null) return refuse("containment-libraries-unresolved", "the shared libraries of the name guard cannot be resolved");
		for (const lib of l) view.bindPath(lib, {
			ro: true,
			exec: true
		});
	}
	const shellCopies = (pins ?? []).filter((p) => p.shell).map((p, i) => ({
		real: p.path,
		copy: `${SHELL_COPY_DIR}/${i}`,
		content: p.contentBase64 ?? ""
	}));
	const writablePlaces = [...new Set([
		...decl.roots.filter((r) => r.access === "rw").flatMap((r) => {
			try {
				return [r.path, fs.realpathSync(r.path)];
			} catch {
				return [r.path];
			}
		}),
		"/tmp",
		SANDBOX_HOME,
		"/dev/shm"
	])];
	const realPrograms = [];
	const wrapperLines = [];
	if (pinned) {
		for (const c of shellCopies) view.file(c.copy, c.content, 420, true);
		const guardReal = ctx.nameGuard ? fs.realpathSync(ctx.nameGuard) : null;
		for (const bound of new Set(programBound.values())) {
			const base = path.basename(bound);
			const kind = guardedAwk(base) ? "awk" : guardedShell(base) ? "shell" : guardedInterpreter(base);
			if (!kind || !guardReal) continue;
			const prefix = path.dirname(path.dirname(bound));
			if ([
				"/tmp",
				"/sandbox/home",
				"/dev/shm",
				...writablePlaces
			].some((w) => isInside(prefix, w.replace(/\/$/, "") || "/"))) return refuse("containment-program-writable", `${bound} loads its own code from ${prefix}, a place the run can write`);
			let copy;
			try {
				copy = realProgramCopy(bound, prefix);
			} catch (err) {
				return refuse("containment-real-copy-failed", `an execute-only copy of ${bound} could not be made (${err.message})`);
			}
			const cacheTop = path.dirname(path.dirname(copy));
			if ([
				"/tmp",
				"/sandbox/home",
				"/dev/shm",
				...writablePlaces
			].some((w) => cacheTop === w || cacheTop.startsWith(`${w.replace(/\/$/, "")}/`))) return refuse("containment-real-copy-failed", `the copies of the real programs (${cacheTop}) lie in a place the run can write`);
			for (const d of [
				"lib",
				"lib64",
				"share",
				"libexec"
			]) view.push({
				op: "symlink",
				path: `${cacheTop}/${d}`,
				target: `${prefix}/${d}`
			});
			view.wrapWith(bound, guardReal);
			realPrograms.push({
				view: bound,
				host: copy
			});
			wrapperLines.push(`bin ${hex(bound)} ${hex(kind)}`);
		}
		for (const t of shellTexts) wrapperLines.push(`text ${hex(t)}`);
		for (const c of shellCopies) wrapperLines.push(`copy ${hex(c.real)} ${hex(c.copy)}`);
		for (const w of writablePlaces) wrapperLines.push(`place ${hex(w)}`);
		for (const f of [
			"-E",
			"-s",
			"-B",
			"-X",
			`pycache_prefix=${PY_CACHE_PREFIX}`
		]) wrapperLines.push(`pyflag ${hex(f)}`);
		wrapperLines.push(`pyguard ${hex(PY_GUARD_PATH)}`);
		wrapperLines.push(`nodeopts ${hex(NODE_GUARD_OPTIONS)}`);
		view.file(WRAPPERS_CONF_PATH, `${wrapperLines.join("\n")}\n`);
	}
	let command = null;
	if (path.isAbsolute(decl.command)) {
		const want = (() => {
			try {
				return fs.realpathSync(decl.command);
			} catch {
				return decl.command;
			}
		})();
		for (const [req, real] of programReals) if (req === decl.command || real === want) command = decl.command;
	} else {
		const found = lookupProgram(decl.command);
		if (found && programReals.has(found)) command = found;
	}
	if (!command) return refuse("containment-command-not-allowed", `command ${decl.command} is not one of the declared programs`);
	const hostLdCache = "/etc/ld.so.cache";
	if (fs.existsSync(hostLdCache)) view.bindPath(hostLdCache, {
		ro: true,
		exec: false
	});
	view.file("/etc/passwd", `root:x:0:0:root:/root:/usr/sbin/nologin\nsandbox:x:${ctx.uid}:${ctx.gid}:sandbox:${SANDBOX_HOME}:/usr/sbin/nologin\n`);
	view.file("/etc/group", `root:x:0:\nsandbox:x:${ctx.gid}:\n`);
	view.file("/etc/hosts", "127.0.0.1 localhost\n::1 localhost\n");
	view.file("/etc/resolv.conf", `nameserver ${DNS_SERVER}\noptions attempts:2 timeout:2\n`);
	view.file("/etc/nsswitch.conf", "passwd: files\ngroup: files\nhosts: files dns\n");
	view.push({
		op: "tmpfs",
		path: "/tmp",
		exec: !strictExec
	});
	view.push({
		op: "tmpfs",
		path: SANDBOX_HOME,
		exec: !strictExec
	});
	view.push({
		op: "tmpfs",
		path: "/dev/shm",
		exec: false
	});
	const ordered = [...roots].toSorted((a, b) => a.real.split("/").length - b.real.split("/").length);
	for (const r of ordered) if (r.declared !== r.real) view.bindPath(r.declared, {
		ro: r.access === "ro",
		exec: r.exec
	});
	else view.bindPath(r.real, {
		ro: r.access === "ro",
		exec: r.exec
	});
	const writableExceptions = new Set((decl.execConfigWritable ?? []).map((p) => path.resolve(p)));
	const rwRoots = ordered.filter((x) => x.access === "rw");
	const rootOf = (p) => rwRoots.filter((x) => isInside(p, x.real)).toSorted((a, b) => b.real.length - a.real.length)[0];
	const execConfigReadOnly = [];
	const placeholders = [];
	const protect = [];
	for (const r of rwRoots) {
		const found = findExecConfig(r.real);
		if (found.truncated) return refuse("containment-tree-too-large", `root ${r.declared} has more than ${MAX_WALK_ENTRIES} entries outside node_modules; declare narrower roots`);
		for (const p of found.paths) {
			if (writableExceptions.has(p)) continue;
			let real;
			try {
				real = fs.realpathSync(p);
			} catch {
				continue;
			}
			if (!rootOf(real)) continue;
			if (protect.some((x) => x.path === real)) continue;
			const st = fs.statSync(real);
			execConfigReadOnly.push(real);
			protect.push({
				path: real,
				origin: "original",
				file: !st.isDirectory()
			});
		}
	}
	for (const ph of placeholders) {
		execConfigReadOnly.push(ph.path);
		protect.push({
			path: ph.path,
			origin: "placeholder",
			file: ph.kind === "file"
		});
	}
	const anchorSet = /* @__PURE__ */ new Set();
	for (const pr of protect) {
		const r = rootOf(pr.path);
		if (!r) continue;
		for (let d = path.dirname(pr.path); d !== r.real && isInside(d, r.real); d = path.dirname(d)) anchorSet.add(d);
	}
	const anchored = [...anchorSet].toSorted((a, b) => a.split("/").length - b.split("/").length);
	for (const d of anchored) view.push({
		op: "bind",
		src: d,
		path: d,
		file: false,
		ro: false,
		exec: rootOf(d).exec
	});
	for (const pr of protect) if (/\/\.git\/hooks(\/|$)/i.test(pr.path)) view.push({
		op: "bind",
		src: pr.path,
		path: pr.path,
		file: pr.file,
		ro: true,
		exec: false
	});
	if (decl.gitHistoryReadOnly) for (const r of rwRoots) {
		const gitDir = path.join(r.real, ".git");
		let isDir = false;
		try {
			isDir = fs.lstatSync(gitDir).isDirectory();
		} catch {}
		if (!isDir) continue;
		for (const name of GIT_HISTORY_ENTRIES) {
			const p = path.join(gitDir, name);
			let st;
			try {
				st = fs.lstatSync(p);
			} catch {
				continue;
			}
			if (!st.isSymbolicLink()) view.push({
				op: "bind",
				src: p,
				path: p,
				file: !st.isDirectory(),
				ro: true,
				exec: false
			});
		}
	}
	const installGuards = [];
	if (decl.kind === "package-install") for (const r of rwRoots) {
		let entries;
		try {
			entries = fs.readdirSync(r.real);
		} catch {
			return refuse("containment-root-missing", `cannot read ${r.declared}`);
		}
		if (entries.length > MAX_INSTALL_TOP_LEVEL) return refuse("containment-tree-too-large", `${r.declared} has more than ${MAX_INSTALL_TOP_LEVEL} top-level entries; an install cannot be caged there`);
		const ignored = ignoredTopLevel(r.real);
		const writable = [
			...INSTALL_OUTPUTS,
			...INSTALL_LOCKFILES,
			...INSTALL_MANIFESTS,
			...entries.filter((e) => ignored.has(e) && !e.startsWith(".") || isInstallMetadata(e))
		];
		const alreadyProtected = new Set(protect.map((x) => x.path));
		for (const e of entries) {
			const p = path.join(r.real, e);
			if (writable.includes(e) || alreadyProtected.has(p)) continue;
			const st = fs.lstatSync(p);
			if (st.isSymbolicLink()) continue;
			view.push({
				op: "bind",
				src: p,
				path: p,
				file: !st.isDirectory(),
				ro: true,
				exec: r.exec
			});
		}
		for (const top of new Set(placeholders.filter((ph) => isInside(ph.path, r.real) && ph.path !== r.real).map((ph) => path.relative(r.real, ph.path).split("/")[0]))) {
			const p = path.join(r.real, top);
			if (!entries.includes(top) && !alreadyProtected.has(p)) view.push({
				op: "bind",
				src: p,
				path: p,
				file: false,
				ro: true,
				exec: false
			});
		}
		installGuards.push({
			root: r.real,
			writable: [...new Set(writable)],
			existing: entries,
			manifests: INSTALL_MANIFESTS.filter((m) => entries.includes(m)),
			ours: [...new Set(placeholders.filter((ph) => isInside(ph.path, r.real) && ph.path !== r.real).map((ph) => path.relative(r.real, ph.path).split("/")[0]))]
		});
	}
	for (const d of decl.build?.gpu?.devices ?? []) {
		let st;
		try {
			st = fs.statSync(d);
		} catch {
			continue;
		}
		if (!st.isCharacterDevice()) return refuse("containment-declaration-invalid", `${d} is not a device node`);
		view.push({
			op: "device",
			path: d,
			src: d
		});
	}
	for (const d of decl.build?.gpu?.dirs ?? []) try {
		if (fs.statSync(d).isDirectory()) view.bindPath(d, {
			ro: true,
			exec: true
		});
	} catch {}
	for (const m of decl.build?.masks ?? []) {
		let st;
		try {
			st = fs.lstatSync(m);
		} catch {
			continue;
		}
		if (!st.isFile() || !rwRoots.some((r) => isInside(m, r.real))) return refuse("containment-declaration-invalid", `the secret file to mask ${m} is not a regular file inside a read-write root`);
		view.push({
			op: "mask",
			path: m,
			file: true
		});
	}
	for (const r of ordered) for (const c of CREDENTIAL_PATHS) {
		const cred = path.join(ctx.home, c);
		if (!isInside(cred, r.real) && !isInside(cred, r.declared)) continue;
		try {
			const real = fs.lstatSync(cred).isSymbolicLink() ? fs.realpathSync(cred) : cred;
			view.push({
				op: "mask",
				path: cred,
				file: !fs.statSync(real).isDirectory()
			});
		} catch {}
	}
	for (const d of [
		"null",
		"zero",
		"full",
		"random",
		"urandom"
	]) view.push({
		op: "device",
		path: `/dev/${d}`,
		src: `/dev/${d}`
	});
	view.push({
		op: "symlink",
		path: "/dev/fd",
		target: "/proc/self/fd"
	});
	view.push({
		op: "symlink",
		path: "/dev/stdin",
		target: "/proc/self/fd/0"
	});
	view.push({
		op: "symlink",
		path: "/dev/stdout",
		target: "/proc/self/fd/1"
	});
	view.push({
		op: "symlink",
		path: "/dev/stderr",
		target: "/proc/self/fd/2"
	});
	view.dir("/proc");
	const env = {};
	env.PATH = [...[...new Set([...programReals.keys()].map((p) => path.dirname(p)))], ...(decl.build?.path ?? []).filter((d) => typeof d === "string" && path.isAbsolute(d) && !d.includes(":") && roots.some((r) => r.access === "ro" && (isInside(d, r.declared) || isInside(d, r.real))))].join(":");
	env.HOME = SANDBOX_HOME;
	env.TMPDIR = "/tmp";
	env.USER = "sandbox";
	env.LOGNAME = "sandbox";
	env.LANG = "C.UTF-8";
	env.ENCLAWED_CONTAINED = decl.kind;
	if ([...programReals.keys()].some((p) => path.basename(p) === "git")) {
		env.GIT_CONFIG_NOSYSTEM = "1";
		env.GIT_CONFIG_GLOBAL = "/dev/null";
		env.GIT_TERMINAL_PROMPT = "0";
	}
	for (const [k, v] of Object.entries(decl.env ?? {})) {
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || typeof v !== "string") return refuse("containment-declaration-invalid", `invalid environment variable ${k}`);
		if (RESERVED_ENV.test(k)) return refuse("containment-env-reserved", `environment variable ${k} is set by the containment and cannot be declared`);
		const findings = credentialFindings(v);
		if (findings.length > 0) return refuse("containment-env-inline-secret", `environment variable ${k} carries a credential (${findings.join(", ")}); declare it as a secret so the process gets a handle`);
		env[k] = v;
	}
	const destinations = [];
	for (const d of decl.destinations ?? []) {
		const host = (typeof d.host === "string" ? d.host : "").toLowerCase();
		if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) return refuse("containment-declaration-invalid", `destination host must be a DNS name: ${d.host}`);
		if (!Number.isInteger(d.port) || d.port < 1 || d.port > 65535) return refuse("containment-declaration-invalid", `destination port out of range: ${d.port}`);
		if (![
			"inspect",
			"http",
			"opaque"
		].includes(d.mode)) return refuse("containment-declaration-invalid", `destination mode must be inspect, http or opaque: ${d.mode}`);
		const profiles = resolveProfiles(d.profiles ?? []);
		if (!profiles.ok) return refuse("containment-declaration-invalid", profiles.message);
		const shape = resolveRequestShape(d.shape);
		if (!shape.ok) return refuse("containment-declaration-invalid", `${host}:${d.port}: ${shape.message}`);
		if (shape.shape && d.mode === "opaque") return refuse("containment-declaration-invalid", `${host}:${d.port}: a request shape needs requests that can be read (mode inspect or http), not opaque`);
		if (!(decl.kind === "mcp-server") && (shape.shape?.profile === "api" || d.mode === "opaque")) return refuse("containment-declaration-invalid", `${host}:${d.port}: ${d.mode === "opaque" ? "an opaque destination" : "an api profile"} is declared only in a signed admission record (a ${decl.kind} reaches its destinations with the generic or a registry profile)`);
		destinations.push({
			host,
			port: d.port,
			mode: d.mode,
			background: d.background === true,
			profiles: profiles.profiles,
			constants: [...d.constants ?? []],
			shape: d.mode === "opaque" ? null : shape.shape ?? { ...GENERIC_SHAPE }
		});
	}
	for (const s of decl.secrets ?? []) {
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s.variable) || RESERVED_ENV.test(s.variable)) return refuse("containment-declaration-invalid", `invalid secret variable ${s.variable}`);
		if (s.variable in env) return refuse("containment-declaration-invalid", `secret variable ${s.variable} is also declared as a plain variable`);
		for (const dest of s.destinations) {
			const d = destinations.find((x) => `${x.host}:${x.port}` === dest.toLowerCase());
			if (!d || d.mode === "opaque") return refuse("containment-declaration-invalid", `secret ${s.id} names destination ${dest}, which is not a declared inspected destination`);
		}
	}
	if (pins) {
		const venv = decl.pythonVenv;
		if (venv) {
			if (!(typeof venv.dir === "string" && typeof venv.site === "string" && path.isAbsolute(venv.dir) && isInside(venv.site, venv.dir) && venv.site !== venv.dir && rwRoots.some((r) => isInside(venv.dir, r.real)) && fs.existsSync(path.join(venv.dir, "pyvenv.cfg")) && fs.existsSync(venv.site) && fs.realpathSync(venv.dir) === venv.dir && fs.realpathSync(venv.site) === venv.site && fs.statSync(venv.site).isDirectory())) return refuse("containment-declaration-invalid", `the Python environment ${String(venv.dir)} is not a virtual environment inside a read-write root`);
			view.push({
				op: "bind",
				src: venv.dir,
				path: venv.dir,
				file: false,
				ro: true,
				exec: false
			});
			view.push({
				op: "bind",
				src: venv.site,
				path: venv.site,
				file: false,
				ro: true,
				exec: true
			});
		}
		for (const p of pins) {
			if (!rwRoots.some((r) => isInside(p.path, r.real))) return refuse("containment-declaration-invalid", `code pin ${p.path} is not inside a read-write root`);
			if (p.exec && fs.existsSync(p.path) && fs.statSync(p.path).isFile()) view.push({
				op: "bind",
				src: p.path,
				path: p.path,
				file: true,
				ro: false,
				exec: true
			});
		}
		const toolchain = [...new Set([
			CODE_GUARD_DIR,
			...venv ? [venv.site] : [],
			...view.ops.flatMap((o) => o.op === "bind" && o.ro && !rwRoots.some((r) => isInside(o.path, r.real) || isInside(o.path, r.declared)) ? [o.path] : [])
		])].toSorted();
		view.file(NODE_GUARD_PATH, nodeGuardSource(pins, toolchain, realPrograms.filter((r) => guardedInterpreter(path.basename(r.view)) === "node")));
		view.file(PY_GUARD_PATH, pythonGuardSource(pins, toolchain, stdinPins ?? [], venv ? {
			site: venv.site,
			systemSite: venv.systemSite === true
		} : null));
		view.dir(PY_CACHE_PREFIX);
	}
	return {
		ok: true,
		plan: {
			kind: decl.kind,
			label: decl.label,
			command,
			args: [...decl.args],
			cwd: decl.cwd,
			ops: view.ops,
			env,
			strictExec,
			uid: ctx.uid,
			gid: ctx.gid,
			destinations,
			secrets: [...decl.secrets ?? []],
			placeholders,
			execConfigReadOnly,
			protect,
			anchored,
			installGuards,
			nameGuard: ctx.nameGuard ?? null,
			rwRoots: rwRoots.map((r) => r.real),
			execConfigWritable: [...writableExceptions],
			programs: [...programReals.keys()],
			realPrograms,
			readPins,
			gitRefsWritable: !decl.gitHistoryReadOnly,
			execPins: (pins ?? []).filter((p) => p.exec).map((p) => p.path),
			modeChanges: (decl.modeChanges ?? []).filter((m) => path.isAbsolute(m) && !m.includes("\n") && rwRoots.some((r) => isInside(m, r.real))),
			build: decl.build !== void 0,
			failureNotice: decl.build?.failureNotice ?? null
		}
	};
}
/** The node toolchain a project script or package install needs: node, sh, env, npm's tree. */
function nodeToolchain() {
	const programs = [
		"node",
		"sh",
		"env",
		...lookupProgram("npm") ? ["npm"] : []
	];
	const roots = [];
	const npm = lookupProgram("npm");
	if (npm) {
		const real = fs.realpathSync(npm);
		let dir = path.dirname(real);
		while (dir !== "/" && path.basename(dir) !== "npm") dir = path.dirname(dir);
		if (dir !== "/") roots.push({
			path: path.dirname(dir),
			access: "ro",
			exec: true
		});
	}
	return {
		programs,
		roots
	};
}
//#endregion
//#region src/enclawed/containment/exec-caches.ts
/**
* Implicit execution caches: what a later tool of the person runs, or prefers
* to its source, without any decision. Python's bytecode (a __pycache__
* entry, any .pyc or .pyo, a PEP 582 __pypackages__ tree: python imports a
* .pyc whose header matches the source's size and mtime), and the caches of
* transpilers and bundlers whose contents a dev server executes
* (node_modules/.cache: babel-loader, webpack, terser; node_modules/.vite;
* .parcel-cache; .turbo, whose outputs are restored in place). Never written
* by a contained run but an install (pip compiles its packages' bytecode).
* Data-only caches (.pytest_cache, .mypy_cache, .eslintcache) are not listed.
*/
const IMPLICIT_EXEC_CACHES = {
	dirs: [
		"__pycache__",
		"__pypackages__",
		".parcel-cache",
		".turbo"
	],
	suffixes: [".pyc", ".pyo"],
	pairs: [
		["node_modules", ".cache"],
		["node_modules", ".vite"],
		[".venv", "bin"],
		[".venv", "Scripts"],
		["venv", "bin"],
		["venv", "Scripts"],
		["conda", "activate.d"],
		["conda", "deactivate.d"],
		[".yarn", "releases"],
		[".yarn", "plugins"],
		[".yarn", "sdks"],
		[".angular", "cache"],
		[".next", "cache"],
		[".nx", "cache"]
	],
	under: [["node_modules", ".bin"]],
	files: [
		".clangd",
		".pnp.cjs",
		".pnp.loader.mjs",
		".pnp.data.json"
	]
};
/**
* Package-manager state: what the next run of any tool loads as installed
* code, structurally (not cache by cache). Written only by an install (or a
* person): never by a build, a test, a script a person approved or an MCP
* server.
*
*   node_modules/**: every installed package (but a package's own build/
*     tree: a native addon's outputs, node-gyp and cmake-js);
*   dirs: yarn's state (.yarn: its cache zips PnP loads code from, unplugged,
*     releases, plugins, sdks, patches, install-state), pnpm's store, Ruby's
*     Bundler settings (.bundle), Maven's wrapper (.mvn), Cargo's
*     configuration directory (.cargo);
*   pairs: Bundler's installed gems (vendor/bundle), Gradle's wrapper
*     (gradle/wrapper);
*   prefixes: yarn's PnP loaders by any name (.pnp.js, .pnp.cjs, ...), pnpm's
*     hooks (.pnpmfile.cjs, pnpmfile.js);
*   files: JavaScript lockfiles (which package code an install fetches);
*   a Composer project's vendor directory (vendor/autoload.php: every php run
*     of the project loads it), found by its autoloader.
*
* Go's vendor/ (source an explicit go build reads) and Elixir's deps/ are not
* listed: their contents are built by the explicit command, not loaded.
*/
const PACKAGE_STATE = {
	nodeModules: true,
	dirs: [
		".yarn",
		".pnpm-store",
		".bundle",
		".mvn",
		".cargo"
	],
	pairs: [
		["vendor", "bundle"],
		["gradle", "wrapper"],
		["vendor", "autoload.php"],
		["vendor", "composer"]
	],
	prefixes: [
		".pnp.",
		".pnpmfile.",
		"pnpmfile."
	],
	files: [
		"package-lock.json",
		"npm-shrinkwrap.json",
		"yarn.lock",
		"pnpm-lock.yaml",
		"bun.lock",
		"bun.lockb"
	]
};
/** The components of `abs` from its last node_modules on: inside a package's own build/? */
function nodeModulesWrite(ps) {
	const j = ps.lastIndexOf("node_modules");
	if (j < 0) return false;
	const pkgEnd = ps[j + 1]?.startsWith("@") ? j + 2 : j + 1;
	return !(ps.length > pkgEnd + 1 && ps[pkgEnd + 1] === "build");
}
/**
* Is writing `abs` writing package-manager state (PACKAGE_STATE)? `isComposerVendor`:
* whether a directory named vendor holds Composer's autoloader.
*/
function packageStateTarget(abs, isComposerVendor = () => false) {
	const ps = parts(abs);
	if (ps.length === 0) return false;
	if (nodeModulesWrite(ps)) return true;
	const dirs = lower(PACKAGE_STATE.dirs);
	for (let i = 0; i < ps.length; i++) {
		if (dirs.includes(ps[i])) return true;
		if (i > 0 && PACKAGE_STATE.pairs.some(([a, b]) => ps[i - 1] === a && ps[i] === b)) return true;
	}
	const last = ps[ps.length - 1];
	if (lower(PACKAGE_STATE.prefixes).some((p) => last.startsWith(p)) || lower(PACKAGE_STATE.files).includes(last)) return true;
	const comps = abs.split("/").filter((c) => c !== "" && c !== ".");
	for (let i = 1; i <= comps.length; i++) if (comps[i - 1].toLowerCase() === "vendor" && isComposerVendor(`/${comps.slice(0, i).join("/")}`)) return true;
	return false;
}
/**
* The files a protected yarn configuration names to run: .yarnrc.yml's
* yarnPath (berry) and .yarnrc's yarn-path (classic), each resolved against
* its file's directory, from the configurations in `dirs`. yarn runs that
* file in place of itself.
*/
function yarnPathTargets(dirs, read) {
	const out = /* @__PURE__ */ new Set();
	for (const d of new Set(dirs)) for (const [name, re] of [
		[".yarnrc.yml", /^\s*["']?yarnPath["']?\s*:\s*(.+?)\s*$/gm],
		[".yarnrc", /^\s*["']?yarn-path["']?\s+(.+?)\s*$/gm],
		["pnpm-workspace.yaml", /^\s*["']?(?:pnpmfile|globalPnpmfile)["']?\s*:\s*(.+?)\s*$/gm],
		[".npmrc", /^\s*(?:pnpmfile|global-pnpmfile)\s*=\s*(.+?)\s*$/gm]
	]) {
		const text = read(`${d}/${name}`);
		if (text === null) continue;
		for (const m of text.matchAll(re)) {
			const v = m[1].replace(/\s+#.*$/, "").replace(/^(["'])(.*)\1$/, "$2");
			if (v) out.add(v.startsWith("/") ? normalizeAbs(v) : normalizeAbs(`${d}/${v}`));
		}
	}
	return [...out].toSorted();
}
/** An absolute path with `.` and `..` taken as written (the configuration's own text). */
function normalizeAbs(p) {
	const out = [];
	for (const c of p.split("/")) {
		if (c === "" || c === ".") continue;
		if (c === "..") out.pop();
		else out.push(c);
	}
	return `/${out.join("/")}`;
}
/**
* A virtual environment's packages (lib/pythonX.Y/site-packages; Lib on
* Windows), by name: a contained run of the environment's Python trusts them
* as toolchain code, so no contained run but an install writes them (builds
* and runs a person approved included). Every environment found at the start
* (a directory holding pyvenv.cfg) is covered by path too (./name-guard.c).
*/
const VENV_PACKAGE_PAIRS = [
	[".venv", "lib"],
	[".venv", "lib64"],
	[".venv", "Lib"],
	["venv", "lib"],
	["venv", "lib64"],
	["venv", "Lib"]
];
/** The components of an absolute path, as the name guard compares them (case-insensitive). */
function parts(abs) {
	return abs.split("/").filter((c) => c !== "" && c !== ".").map((c) => c.toLowerCase());
}
const lower = (xs) => xs.map((x) => x.toLowerCase());
/**
* Is writing `abs` (a file or directory to create or change) writing an
* implicit execution cache or a virtual environment's entry points or
* packages (the name guard's rules, ./name-guard.c)? `isVenv`: whether a
* directory is a virtual environment found on disk (holding pyvenv.cfg or
* conda-meta), for environments not named .venv or venv.
*/
function implicitExecTarget(abs, isVenv = () => false) {
	const ps = parts(abs);
	if (ps.length === 0) return false;
	const dirs = lower(IMPLICIT_EXEC_CACHES.dirs);
	const pairs = [...IMPLICIT_EXEC_CACHES.pairs, ...VENV_PACKAGE_PAIRS].map(([a, b]) => [a.toLowerCase(), b.toLowerCase()]);
	const under = IMPLICIT_EXEC_CACHES.under.map(([a, b]) => [a.toLowerCase(), b.toLowerCase()]);
	for (let i = 0; i < ps.length; i++) {
		if (dirs.includes(ps[i])) return true;
		if (i > 0 && pairs.some(([a, b]) => ps[i - 1] === a && ps[i] === b)) return true;
		if (under.some(([a, b]) => ps[i] === b && ps.slice(0, i).includes(a))) return true;
	}
	const last = ps[ps.length - 1];
	if (lower(IMPLICIT_EXEC_CACHES.files).includes(last)) return true;
	if (lower(IMPLICIT_EXEC_CACHES.suffixes).some((x) => last.length > x.length && last.endsWith(x))) return true;
	if (last === "pyvenv.cfg") return true;
	const comps = abs.split("/").filter((c) => c !== "" && c !== ".");
	for (let i = comps.length; i >= 1; i--) if (isVenv(`/${comps.slice(0, i).join("/")}`)) {
		const next = (comps[i] ?? "").toLowerCase();
		return i === comps.length || next === "bin" || next === "scripts" || next.startsWith("lib") || next === "include" || next === ".enclawed-tainted";
	}
	return false;
}
//#endregion
export { EXEC_CONFIG_NAMES as $, checkRoutingProvenance as A, BUILD_PROGRAM_DIRS as B, ignoredTopLevel as C, nodeToolchain as D, lookupProgram as E, suppliedValues as F, buildToolchainTrees as G, NO_GPU_NOTICE as H, CODE_GUARD_DIR as I, memoryVenvTrustStore as J, hostGpu as K, UNGUARDED_INTERPRETERS as L, parseRequestBody as M, resolveProfiles as N, planContainment as O, routingValues as P, venvTrustFile as Q, guardedInterpreter as R, findExecConfig as S, lddLibraries as T, buildToolchainDirs as U, BUILD_TOOLCHAIN_PROGRAMS as V, buildToolchainPath as W, revokeVenvTrust as X, recordVenvTrust as Y, venvFingerprint as Z, PLACEHOLDER_DIRS as _, packageStateTarget as a, isExecConfigPath as at, SANDBOX_HOME as b, CREDENTIAL_DLP_IDS as c, upperFirst as ct, EXEC_CONFIG_FILES as d, allow as et, EXEC_CONFIG_PAIRS as f, NAME_GUARD_VIEW_PATH as g, INSTALL_OUTPUTS as h, implicitExecTarget as i, isExecConfigDir as it, emailsIn as j, SHIPPED_EGRESS_PROFILES as k, CREDENTIAL_PATHS as l, REASON_PREFIX as lt, INSTALL_MANIFESTS as m, PACKAGE_STATE as n, irreversible as nt, yarnPathTargets as o, isExecConfigTarget as ot, INSTALL_LOCKFILES as p, fileVenvTrustStore as q, VENV_PACKAGE_PAIRS as r, isBuildFilePath as rt, CA_BUNDLE_PATHS as s, personOnly as st, IMPLICIT_EXEC_CACHES as t, deny as tt, EXEC_CONFIG_DIRS as u, PLACEHOLDER_FILE_CONTENT as v, isInstallMetadata as w, credentialFindings as x, PROGRAM_DIRS as y, BUILD_ENV as z };
