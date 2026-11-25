import { n as inNonInitialUserNamespace } from "./userns-Om3FzFOv.js";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
//#region src/enclawed/adapter/git-programs.ts
const BOOLEAN = /^(true|false|yes|no|on|off|1|0)?$/i;
function gitDirOf$1(dir) {
	const dotgit = path.join(dir, ".git");
	let st;
	try {
		st = fs.statSync(dotgit);
	} catch {
		if (fs.existsSync(path.join(dir, "HEAD")) && fs.existsSync(path.join(dir, "config")) && fs.existsSync(path.join(dir, "objects"))) return dir;
		return null;
	}
	if (st.isDirectory()) return dotgit;
	try {
		const m = /^gitdir:\s*(.+)\s*$/m.exec(fs.readFileSync(dotgit, "utf8"));
		return m ? path.resolve(dir, m[1].trim()) : null;
	} catch {
		return null;
	}
}
/** One config line's kind of program (section and key already lowercased), or null. */
function kindOf(section, sub, key, value) {
	if (section === "include" || section === "includeif") return key === "path" ? "include" : null;
	if (section === "core") {
		if (key === "fsmonitor") return BOOLEAN.test(value) ? null : "fsmonitor";
		if (key === "hookspath") return "hook";
		if (key === "pager") return "pager";
		return null;
	}
	if (section === "pager") return BOOLEAN.test(value) ? null : "pager";
	if (section === "filter" && sub !== null) return [
		"clean",
		"smudge",
		"process"
	].includes(key) ? "filter" : null;
	if (section === "diff") {
		if (sub === null) return key === "external" ? "diff-command" : null;
		if (key === "textconv") return "textconv";
		return key === "command" ? "diff-command" : null;
	}
	if (section === "gpg") return key === "program" || key === "defaultkeycommand" ? "gpg" : null;
	if (section === "log" && key === "showsignature") return BOOLEAN.test(value) && !/^(true|yes|on|1)$/i.test(value) ? null : "gpg";
	return null;
}
/**
* The programs the repository holding `cwd` can make git start: its config
* files (with sections) and a post-index-change hook in its hooks directory.
* null: the configuration could not be read (callers treat that as a risk).
*/
function gitProgramsOf(cwd) {
	let dir = path.resolve(cwd);
	for (;;) {
		const gitDir = gitDirOf$1(dir);
		if (gitDir) return programsIn(gitDir);
		const parent = path.dirname(dir);
		if (parent === dir) return [];
		dir = parent;
	}
}
function programsIn(gitDir) {
	const files = [path.join(gitDir, "config"), path.join(gitDir, "config.worktree")];
	try {
		const common = fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
		files.push(path.join(path.resolve(gitDir, common), "config"));
	} catch {}
	const out = [];
	let hooksPath = null;
	for (const f of files) {
		let text;
		try {
			text = fs.readFileSync(f, "utf8");
		} catch (err) {
			if (err.code === "ENOENT") continue;
			return null;
		}
		let section = "";
		let sub = null;
		for (const raw of text.split(/\r?\n/)) {
			if (/\\\s*$/.test(raw.replace(/\s[#;].*$/, ""))) {
				out.push({
					kind: "include",
					line: `${f}: ${raw.trim()}`
				});
				continue;
			}
			let l = raw.trim();
			if (l === "" || l.startsWith("#") || l.startsWith(";")) continue;
			const head = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\](.*)$/.exec(l);
			if (head) {
				const name = head[1].toLowerCase();
				const dot = name.indexOf(".");
				section = dot < 0 ? name : name.slice(0, dot);
				sub = head[2] !== void 0 ? head[2] : dot < 0 ? null : name.slice(dot + 1);
				l = head[3].trim();
				if (l === "" || l.startsWith("#") || l.startsWith(";")) continue;
			}
			const kv = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/.exec(l);
			if (!kv) {
				out.push({
					kind: "include",
					line: `${f}: ${l}`
				});
				continue;
			}
			const key = kv[1].toLowerCase();
			const value = (kv[2] ?? "").replace(/\s[#;].*$/, "").replace(/^"(.*)"$/, "$1").trim();
			const kind = kindOf(section, sub, key, value);
			if (kind) out.push({
				kind,
				line: `${f}: ${l}`
			});
			if (section === "core" && key === "hookspath") hooksPath = value;
		}
	}
	const hooksDir = hooksPath ? path.resolve(path.dirname(gitDir), hooksPath) : path.join(gitDir, "hooks");
	const hook = path.join(hooksDir, "post-index-change");
	try {
		if (fs.statSync(hook).isFile()) out.push({
			kind: "hook",
			line: `${hook} (a hook git runs when it writes the index)`
		});
	} catch {}
	return out;
}
const PATCH_FLAG = /^(-p|-u|--patch|--patch-with-stat|--patch-with-raw|--cc|-c|-W|--function-context|--word-diff(=.*)?|--color-words(=.*)?|-U\d*|--unified(=.*)?|--textconv)$/;
const NO_PATCH = /^(-s|--no-patch)$/;
const STAT_LIKE = /^(--stat(=.*)?|--numstat|--shortstat|--name-only|--name-status|--raw|--summary|--dirstat(=.*)?|--compact-summary)$/;
/** Does this read-only git command produce a patch (where diff drivers and textconv run)? */
function makesPatch(sub, args) {
	const opts = args.slice(0, args.includes("--") ? args.indexOf("--") : args.length);
	if (opts.some((a) => NO_PATCH.test(a))) return false;
	const wants = opts.some((a) => PATCH_FLAG.test(a));
	if (sub === "diff" || sub === "show") return wants || !opts.some((a) => STAT_LIKE.test(a));
	return wants;
}
const SHOW_BLOB_FLAG = /^(?:-p|-u|--patch|-s|--no-patch|-W|--function-context|--no-color|--color(?:=.*)?|--no-textconv|--no-ext-diff|--word-diff(?:=.*)?|--color-words(?:=.*)?|-U\d+|--unified=\d+|--stat(?:=.*)?|--name-only|--name-status|--raw|--no-renames|--abbrev(?:=\d+)?|--format=.*|--pretty(?:=.*)?|--oneline|--no-pager)$/;
/**
* git show whose every argument before `--` is a blob or tree by name
* (REV:path, :path) with no --textconv: it prints the object as stored and
* runs no textconv (measured, git v2.53: show REV:path, -p, --stat, -W,
* --word-diff, several REV:path, :path and REV: ran none; --textconv did).
*/
function showsObjectsOnly(args) {
	const before = optionsOf(args);
	const named = before.filter((a) => !a.startsWith("-"));
	return named.length > 0 && named.every((a) => a.includes(":")) && before.every((a) => !a.startsWith("-") || SHOW_BLOB_FLAG.test(a)) && before.length === args.length;
}
/** The options of a command, before any `--`. */
function optionsOf(args) {
	return args.slice(0, args.includes("--") ? args.indexOf("--") : args.length);
}
/**
* A pickaxe search (-S<string>, -G<regex>, also clustered after other short
* flags, and --pickaxe-regex): git runs textconv on every blob it searches,
* with or without a patch in the output (measured, git v2.53).
*/
function pickaxe(args) {
	return optionsOf(args).some((a) => /^-[A-Za-z]*[SG]/.test(a) || a === "--pickaxe-regex");
}
/**
* git status -v / --verbose (also clustered, -sv): the diff of staged
* changes runs textconv. Counted whatever the output format (with --short or
* --porcelain git v2.53 did not run it), the wider set.
*/
function statusVerbose(args) {
	return optionsOf(args).some((a) => a === "--verbose" || /^-[a-z]*v/.test(a));
}
/**
* The first configured program this read-only git command would start, or
* null. `global`: the options before the subcommand (only -C and --no-pager
* pass the allowlist).
*/
function gitCommandStarts(call, programs) {
	const { sub, args } = call;
	const has = (re) => args.some((a) => re.test(a));
	const dirty = sub === "describe" && has(/^--(dirty|broken)(=.*)?$/);
	const readsIndex = [
		"status",
		"diff",
		"blame",
		"grep",
		"ls-files",
		"check-ignore",
		"clean"
	].includes(sub) || dirty;
	for (const p of programs) switch (p.kind) {
		case "include": return p;
		case "fsmonitor":
			if (readsIndex) return p;
			break;
		case "filter":
			if ([
				"status",
				"diff",
				"blame",
				"ls-files",
				"clean"
			].includes(sub) || dirty) return p;
			break;
		case "textconv":
			if (!optionsOf(args).includes("--no-textconv") && (sub === "blame" || sub === "status" && statusVerbose(args) || [
				"diff",
				"show",
				"log",
				"whatchanged"
			].includes(sub) && !(sub === "show" && showsObjectsOnly(args)) && (makesPatch(sub, args) || pickaxe(args)))) return p;
			break;
		case "diff-command":
			if (sub === "diff" && !has(/^--no-ext-diff$/)) return p;
			break;
		case "hook":
			if (sub === "status" || dirty) return p;
			break;
		case "gpg":
			if ([
				"log",
				"show",
				"whatchanged"
			].includes(sub)) return p;
			break;
		case "pager":
			if (!(call.global ?? []).includes("--no-pager")) return p;
			break;
	}
	return null;
}
//#endregion
//#region src/enclawed/adapter/fs-probe.ts
function comparablePath(p) {
	return path.resolve(p).normalize("NFC").toLowerCase();
}
/** Is `child` inside (or equal to) `dir`? Compared case-insensitively after NFC (macOS and Windows fold case). */
function isInside(dir, child) {
	const d = comparablePath(dir);
	const c = comparablePath(child);
	if (c === d) return true;
	const rel = path.relative(d, c);
	return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
/** Exact containment, no case folding: an allowance never matches by folding. */
function isInsideExact(dir, child) {
	const rel = path.relative(dir, child);
	return rel === "" || !rel.startsWith("..") && !path.isAbsolute(rel);
}
function realpathNearestSync(abs) {
	let probe = abs;
	const rest = [];
	for (;;) try {
		const real = fs.realpathSync(probe);
		return rest.length ? path.join(real, ...rest.toReversed()) : real;
	} catch {
		const parent = path.dirname(probe);
		if (parent === probe) return abs;
		rest.push(path.basename(probe));
		probe = parent;
	}
}
/** ~, $HOME and ${HOME} at the start of a path, expanded. */
function expandHome(p, home) {
	if (!home) return p;
	return p.replace(/^~(?=$|\/)/, home).replace(/^\$\{?HOME\}?(?=$|\/)/, home);
}
function isProtectedPath(prot, absPaths) {
	for (const p of absPaths) {
		if (!p) continue;
		if (prot.paths.some((q) => isInside(q, p))) return true;
		if (prot.prefixes.some((x) => comparablePath(path.dirname(p)) === comparablePath(x.dir) && path.basename(p).toLowerCase().startsWith(x.basename))) return true;
	}
	return false;
}
const SYSTEM_BIN_DIRS = [
	"/usr/bin",
	"/bin",
	"/usr/sbin",
	"/sbin"
];
function overflowUid() {
	try {
		const n = Number(fs.readFileSync("/proc/sys/kernel/overflowuid", "utf8").trim());
		return Number.isInteger(n) ? n : 65534;
	} catch {
		return 65534;
	}
}
function systemBinaryUids(extra = []) {
	const base = process.platform === "linux" && inNonInitialUserNamespace() ? [0, overflowUid()] : [0];
	return [...new Set([...base, ...extra])];
}
/** Every directory from `dir` up to the root owned by one of `uids` and not group/other-writable. */
function trustedChain(dir, uids) {
	for (let d = dir;;) {
		let st;
		try {
			st = fs.statSync(d);
		} catch {
			return false;
		}
		if (!uids.includes(st.uid) || (st.mode & 18) !== 0) return false;
		const up = path.dirname(d);
		if (up === d) return true;
		d = up;
	}
}
/**
* Why `file` is not a trusted system executable, or null when it is: the
* file it resolves to (symlinks followed) is a regular executable owned by a
* system uid and not group/other-writable, and every directory above both the
* link and its target is too.
*/
function untrustedBinaryReason(file, uids = systemBinaryUids()) {
	let real;
	let st;
	let linkDir;
	try {
		real = fs.realpathSync(file);
		st = fs.statSync(real);
		linkDir = fs.realpathSync(path.dirname(file));
	} catch (err) {
		return err.code ?? "UNKNOWN";
	}
	if (!st.isFile() || (st.mode & 73) === 0) return `${real} is not an executable file`;
	if (!uids.includes(st.uid) || (st.mode & 18) !== 0) return `${real} is owned by uid ${st.uid} or writable by group or other`;
	if (!trustedChain(path.dirname(real), uids) || !trustedChain(linkDir, uids)) return `a directory above ${real} is not a system directory`;
	return null;
}
function trustedBinary(name, dirs = SYSTEM_BIN_DIRS, o = {}) {
	if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
	const uids = systemBinaryUids(o.testUids ?? []);
	for (const d of dirs) {
		const p = path.join(d, name);
		if (untrustedBinaryReason(p, uids) === null) return fs.realpathSync(p);
	}
	return null;
}
/**
* Whether git keeps a copy of the file. Repository config that could start a
* program during the lookup is neutralized, no GIT_* variable from the
* environment is passed on, and the name is matched literally, never as a
* pattern.
*/
function gitTrackingOf(realPath, opts = {}) {
	const run = opts.run ?? ((c, a, o) => spawnSync(c, [...a], {
		...o,
		encoding: "utf8"
	}));
	const dir = path.dirname(realPath);
	const base = path.basename(realPath);
	const env = {};
	for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_") && typeof v === "string") env[k] = v;
	env.GIT_OPTIONAL_LOCKS = "0";
	const gitBin = opts.gitBin !== void 0 ? opts.gitBin : process.platform === "win32" ? "git" : trustedBinary("git");
	if (!gitBin) return "unknown";
	const git = (args) => run(gitBin, [
		"-c",
		"core.fsmonitor=false",
		"-c",
		"core.untrackedCache=false",
		"-C",
		dir,
		...args
	], {
		timeout: 5e3,
		env,
		windowsHide: true
	});
	const r = git([
		"--literal-pathspecs",
		"ls-files",
		"--error-unmatch",
		"--",
		base
	]);
	if (r.error || r.status === null) return "unknown";
	if (r.status === 0) return "tracked";
	if (r.status === 128 && /not a git repository/i.test(r.stderr)) return "no-repo";
	if (r.status !== 1) return "unknown";
	return git([
		"check-ignore",
		"-q",
		"--",
		base
	]).status === 0 ? "ignored" : "untracked";
}
/**
* HEAD's tree of the repository holding `dir`: path relative to the
* repository's top (with "/") -> blob id, or null when it cannot be read.
* Read with `git ls-tree` (no index, no working tree: no filter, fsmonitor
* or hook runs), the same system git and scrubbed environment as
* gitTrackingOf.
*/
function gitCommittedTreeOf(dir, opts = {}) {
	const gitBin = opts.gitBin !== void 0 ? opts.gitBin : process.platform === "win32" ? "git" : trustedBinary("git");
	if (!gitBin) return null;
	const env = {};
	for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_") && typeof v === "string") env[k] = v;
	env.GIT_OPTIONAL_LOCKS = "0";
	const run = (args) => spawnSync(gitBin, [
		"-c",
		"core.fsmonitor=false",
		"-c",
		"core.untrackedCache=false",
		"-C",
		dir,
		...args
	], {
		timeout: 1e4,
		env,
		windowsHide: true,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024
	});
	const top = run(["rev-parse", "--show-toplevel"]);
	if (top.status !== 0 || typeof top.stdout !== "string") return null;
	const r = run([
		"ls-tree",
		"-r",
		"-z",
		"--full-tree",
		"HEAD"
	]);
	if (r.status !== 0 || typeof r.stdout !== "string") return null;
	const blobs = /* @__PURE__ */ new Map();
	for (const rec of r.stdout.split("\0")) {
		const m = /^\d+ blob ([0-9a-f]+)\t(.*)$/s.exec(rec);
		if (m) blobs.set(m[2], m[1]);
	}
	return {
		top: top.stdout.trim(),
		blobs
	};
}
/** Inodes of every file under the given roots, with a work budget; `complete` is false when it ran out. */
function inodeIndex(roots, budget) {
	const map = /* @__PURE__ */ new Map();
	let left = budget;
	for (const root of roots) {
		const stack = [root];
		while (stack.length) {
			if (left-- <= 0) return {
				map,
				complete: false
			};
			const p = stack.pop();
			let st;
			try {
				st = fs.lstatSync(p);
			} catch {
				continue;
			}
			if (st.isFile()) map.set(`${st.dev}:${st.ino}`, p);
			else if (st.isDirectory()) try {
				for (const n of fs.readdirSync(p)) stack.push(path.join(p, n));
			} catch {}
		}
	}
	return {
		map,
		complete: true
	};
}
const RISKY_GIT_SECTION = /^\s*\[\s*(include|includeif|filter|gpg|pager|(diff|merge)\s+")/i;
const RISKY_GIT_KEY = /^\s*(fsmonitor|pager|hookspath|sshcommand|askpass|editor|external|showsignature|textconv|command|program|process|clean|smudge|driver)\s*(=|$)/i;
function gitDirOf(dir) {
	const dotgit = path.join(dir, ".git");
	let st;
	try {
		st = fs.statSync(dotgit);
	} catch {
		if (fs.existsSync(path.join(dir, "HEAD")) && fs.existsSync(path.join(dir, "config")) && fs.existsSync(path.join(dir, "objects"))) return dir;
		return null;
	}
	if (st.isDirectory()) return dotgit;
	try {
		const m = /^gitdir:\s*(.+)\s*$/m.exec(fs.readFileSync(dotgit, "utf8"));
		return m ? path.resolve(dir, m[1].trim()) : null;
	} catch {
		return null;
	}
}
/** The repository git config line (with its file) that could make a git command in `cwd` start a program, or null. */
function gitConfigRiskOf(cwd) {
	let dir = path.resolve(cwd);
	for (;;) {
		const gitDir = gitDirOf(dir);
		if (gitDir) {
			const files = [path.join(gitDir, "config"), path.join(gitDir, "config.worktree")];
			try {
				const common = fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
				files.push(path.join(path.resolve(gitDir, common), "config"));
			} catch {}
			for (const f of files) {
				let text;
				try {
					text = fs.readFileSync(f, "utf8");
				} catch {
					continue;
				}
				for (const line of text.split(/\r?\n/)) {
					const l = line.replace(/[#;].*$/, "");
					if (RISKY_GIT_SECTION.test(l) || RISKY_GIT_KEY.test(l)) return `${f}: ${l.trim()}`;
				}
			}
			return null;
		}
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}
const PROTECTED_WALK_BUDGET = 2e4;
const PRECOMPUTED_INDEX_BUDGET = 5e4;
const LIVE_INDEX_BUDGET = 1500;
const inodeKey = (st) => `${st.dev}:${st.ino}`;
/**
* Breadth-first over `roots` (shallowest entries first), up to `budget`
* entries, adding each file's and directory's inode to `map` (directories
* too: a bind-mounted protected directory has its inode under another path).
* Returns whether the walk finished.
*/
function protectedWalk(roots, budget, map) {
	let left = budget;
	let queue = [...roots];
	while (queue.length > 0) {
		const next = [];
		for (const p of queue) {
			if (--left < 0) return false;
			let st;
			try {
				st = fs.lstatSync(p);
			} catch {
				continue;
			}
			if (!map.has(inodeKey(st))) map.set(inodeKey(st), p);
			if (st.isDirectory()) try {
				for (const n of fs.readdirSync(p)) next.push(path.join(p, n));
			} catch {}
		}
		queue = next;
	}
	return true;
}
function protectedLatchFiles(prot) {
	const out = [];
	for (const x of prot.prefixes) try {
		for (const n of fs.readdirSync(x.dir)) if (n.toLowerCase().startsWith(x.basename)) out.push(path.join(x.dir, n));
	} catch {}
	return out;
}
/**
* Write the protected inode index once at launch into a file the agent may
* not write (the adapter's session directory); the adapter keeps the digest
* in its session record and passes both as ProtectedSet.inodeIndex.
*/
function writeProtectedInodeIndex(prot, file) {
	const map = /* @__PURE__ */ new Map();
	const complete = protectedWalk([
		...prot.statePaths ?? [],
		...prot.paths,
		...protectedLatchFiles(prot)
	], PRECOMPUTED_INDEX_BUDGET, map);
	const text = JSON.stringify({
		v: 1,
		complete,
		entries: [...map]
	});
	fs.writeFileSync(file, text, {
		mode: 384,
		flag: "wx"
	});
	return {
		file,
		digest: createHash("sha256").update(text).digest("hex"),
		entries: map.size,
		complete
	};
}
/**
* The inodes of the protected files and directories: the precomputed index
* (while its digest still matches) plus a live, bounded walk of the state
* paths first, which also covers files created after launch. With no
* precomputed index the walk gets `budget`.
*/
function protectedInodeIndex(prot, budget = PROTECTED_WALK_BUDGET) {
	const map = /* @__PURE__ */ new Map();
	let precomputed = false;
	let complete = false;
	const pre = prot.inodeIndex;
	if (pre?.file && pre.digest) try {
		const text = fs.readFileSync(pre.file, "utf8");
		if (createHash("sha256").update(text).digest("hex") === pre.digest) {
			const doc = JSON.parse(text);
			if (Array.isArray(doc.entries)) {
				for (const e of doc.entries) if (Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "string") map.set(e[0], e[1]);
				precomputed = true;
				complete = doc.complete === true;
			}
		}
	} catch {}
	const live = protectedWalk([
		...prot.statePaths ?? [],
		...protectedLatchFiles(prot),
		...prot.paths
	], precomputed ? LIVE_INDEX_BUDGET : budget, map);
	return {
		map,
		complete: complete || live,
		precomputed
	};
}
/** The protected file or directory `p` is (by inode), or one of its ancestors is (a bind-mounted protected directory). */
function boundProtected(ix, p) {
	try {
		const hit = ix.map.get(inodeKey(fs.lstatSync(p)));
		if (hit) return hit;
	} catch {}
	for (let d = path.dirname(p);; d = path.dirname(d)) {
		try {
			const st = fs.statSync(d);
			const hit = st.isDirectory() ? ix.map.get(inodeKey(st)) : void 0;
			if (hit) return hit;
		} catch {}
		if (path.dirname(d) === d) return null;
	}
}
const PROJECT_WALK_BUDGET = 2e4;
/**
* The project's exec-config file with the same inode as `st`, walking the
* project on the target's filesystem with a work budget. node_modules and
* .git/objects are skipped: never exec-config, and often huge (git objects
* are hard-linked by `git clone --local`).
*/
function execConfigInodeMatch(scope, st, budget = PROJECT_WALK_BUDGET) {
	const want = `${st.dev}:${st.ino}`;
	let left = budget;
	const stack = [scope.projectDir];
	while (stack.length) {
		const p = stack.pop();
		let s;
		try {
			s = fs.lstatSync(p);
		} catch {
			continue;
		}
		if (--left < 0) return {
			match: null,
			complete: false
		};
		if (s.isFile()) {
			if (`${s.dev}:${s.ino}` === want && scope.isExecConfig(p)) return {
				match: p,
				complete: true
			};
		} else if (s.isDirectory() && s.dev === st.dev) {
			let names;
			try {
				names = fs.readdirSync(p);
			} catch {
				continue;
			}
			for (const n of names) if (!(n === "node_modules" || n === "objects" && path.basename(p).toLowerCase() === ".git")) stack.push(path.join(p, n));
		}
	}
	return {
		match: null,
		complete: true
	};
}
/** The real filesystem probe. Inode indexes are built once per protected set. */
function nodeFsProbe(opts = {}) {
	const budget = opts.budget ?? 2e4;
	const indexes = /* @__PURE__ */ new WeakMap();
	const indexOf = (prot) => {
		let ix = indexes.get(prot);
		if (!ix) {
			ix = protectedInodeIndex(prot, budget);
			indexes.set(prot, ix);
		}
		return ix;
	};
	return {
		realpathNearest: realpathNearestSync,
		fileMode(p) {
			try {
				const st = fs.lstatSync(p);
				return st.isFile() ? st.mode & 4095 : null;
			} catch {
				return null;
			}
		},
		hardLink(realPath, prot, execConfig) {
			let st;
			try {
				st = fs.lstatSync(realPath);
			} catch {
				st = null;
			}
			const ix = prot ? indexOf(prot) : null;
			const bound = ix ? boundProtected(ix, realPath) : null;
			if (bound !== null) return {
				kind: "protected",
				nlink: st?.nlink ?? 0,
				match: bound
			};
			if (!st || !st.isFile()) return null;
			const undecided = ix !== null && st.nlink > 1 && !ix.complete;
			if (st.nlink <= 1) return null;
			const e = execConfig ? execConfigInodeMatch(execConfig, st, opts.projectBudget) : {
				match: null,
				complete: true
			};
			if (undecided) return {
				kind: "protected-unknown",
				nlink: st.nlink,
				match: e.match
			};
			if (e.match) return {
				kind: "exec-config",
				nlink: st.nlink,
				match: e.match
			};
			return {
				kind: "multiply-linked",
				nlink: st.nlink,
				complete: e.complete
			};
		},
		sameInodeAs(realPath, candidates) {
			let st;
			try {
				st = fs.statSync(realPath);
			} catch {
				return null;
			}
			if (!st.isFile()) return null;
			return inodeIndex(candidates, 2e3 * Math.max(1, candidates.length)).map.get(`${st.dev}:${st.ino}`) ?? null;
		},
		gitTracking: (p) => gitTrackingOf(p),
		gitConfigRisk: opts.gitConfigRisk ?? gitConfigRiskOf,
		gitPrograms: opts.gitPrograms ?? (opts.gitConfigRisk ? void 0 : gitProgramsOf),
		committedTree: (dir) => gitCommittedTreeOf(dir)
	};
}
const MAX_WORDS = 128;
/** The words of a command that may be paths (quotes dropped, option values kept). */
function pathWords(command) {
	return command.replace(/['"]/g, "").split(/[\s;&|<>()`]+/).filter(Boolean).map((w) => w.startsWith("-") ? w.includes("=") ? w.slice(w.indexOf("=") + 1) : "" : w).filter((w) => w !== "").slice(0, MAX_WORDS);
}
//#endregion
//#region src/enclawed/adapter/text-cleaner.ts
/**
* Unicode Default_Ignorable_Code_Point (DerivedCoreProperties.txt), Unicode
* 17.0, as inclusive [first, last] ranges, sorted. These render as nothing,
* so a person reading the text cannot see them.
*/
const DEFAULT_IGNORABLE_RANGES = [
	[173, 173],
	[847, 847],
	[1564, 1564],
	[4447, 4448],
	[6068, 6069],
	[6155, 6159],
	[8203, 8207],
	[8234, 8238],
	[8288, 8303],
	[12644, 12644],
	[65024, 65039],
	[65279, 65279],
	[65440, 65440],
	[65520, 65528],
	[113824, 113827],
	[119155, 119162],
	[917504, 921599]
];
/**
* What the model sees in place of content the cleaner could not finish.
* Neutral on purpose: it does not claim to come from Enclawed, whose notices
* reach the model only out of band.
*/
const WITHHELD_MARKER = "[content withheld: too complex to inspect]";
/** What neutralizeNotices puts before a notice-looking "Enclawed". */
const NOTICE_QUOTE = "quoted-";
/** The technique families this cleaner is designed to catch. */
const COVERED = [
	"withheld-region",
	"unicode-tag",
	"lone-surrogate",
	"zero-width-run",
	"variation-selector-run",
	"bidi-control",
	"ansi-conceal",
	"ansi-cursor",
	"ansi-c1",
	"control-overwrite",
	"spoofed-notice",
	"hidden-html"
];
const ZW_RUN = 4;
const VS_RUN = 2;
const MAX_PER_TYPE = 32;
const MAX_ROUNDS = 8;
const NONE = 0;
const TAG = 1;
const VS = 2;
const INVIS = 3;
const BIDI_OVERRIDE = 4;
const BIDI_OPEN = 5;
const BIDI_POP = 6;
const LONE = 7;
const BMP = new Uint8Array(65536);
for (const [a, b] of DEFAULT_IGNORABLE_RANGES) for (let cp = a; cp <= b && cp <= 65535; cp++) BMP[cp] = INVIS;
for (let cp = 65024; cp <= 65039; cp++) BMP[cp] = VS;
for (const cp of [
	6155,
	6156,
	6157,
	6159
]) BMP[cp] = VS;
BMP[8237] = BIDI_OVERRIDE;
BMP[8238] = BIDI_OVERRIDE;
for (const cp of [
	8234,
	8235,
	8294,
	8295,
	8296
]) BMP[cp] = BIDI_OPEN;
BMP[8236] = BIDI_POP;
BMP[8297] = BIDI_POP;
for (let cp = 55296; cp <= 57343; cp++) BMP[cp] = LONE;
const ASTRAL_IGNORABLE = DEFAULT_IGNORABLE_RANGES.filter(([, b]) => b > 65535);
function classOf(cp) {
	if (cp < 65536) return BMP[cp];
	if (cp >= 917504 && cp <= 917631) return TAG;
	if (cp >= 917760 && cp <= 917999) return VS;
	for (const [a, b] of ASTRAL_IGNORABLE) if (cp >= a && cp <= b) return INVIS;
	return NONE;
}
var TooComplex = class extends Error {};
function makeClock(deadline) {
	let n = 0;
	return () => {
		if ((++n & 65535) === 0 && performance.now() > deadline) throw new TooComplex();
	};
}
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
function decode(units, len) {
	if (LITTLE_ENDIAN) return Buffer.from(units.buffer, units.byteOffset, len * 2).toString("utf16le");
	let s = "";
	for (let i = 0; i < len; i += 8192) s += String.fromCharCode(...units.subarray(i, Math.min(len, i + 8192)));
	return s;
}
function encode(s) {
	const u = new Uint16Array(s.length);
	for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
	return u;
}
function isAscii(s) {
	return Buffer.byteLength(s, "utf8") === s.length;
}
/** Number of code points in a string (no intermediate array). */
function codePointLength(s) {
	let n = s.length;
	for (let i = 0; i + 1 < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c >= 55296 && c <= 56319) {
			const d = s.charCodeAt(i + 1);
			if (d >= 56320 && d <= 57343) {
				n--;
				i++;
			}
		}
	}
	return n;
}
const CURSOR_FINALS = new Set(Array.from("ABCDEFGHJKfsu").map((c) => c.charCodeAt(0)));
function applySgr(buf, from, to, concealed) {
	const priv = from < to && buf[from] >= 60 && buf[from] <= 63;
	const vals = [];
	const colon = [];
	let v = 0;
	let hasColon = false;
	for (let p = from; p <= to; p++) {
		const c = p < to ? buf[p] : 59;
		if (c >= 48 && c <= 57) {
			if (!hasColon && v < 1e5) v = v * 10 + (c - 48);
		} else if (c === 58) hasColon = true;
		else if (c === 59) {
			vals.push(v);
			colon.push(hasColon);
			v = 0;
			hasColon = false;
		}
	}
	let sawConceal = false;
	for (let k = 0; k < vals.length; k++) {
		const x = vals[k];
		if (!colon[k] && (x === 38 || x === 48 || x === 58)) {
			const mode = vals[k + 1];
			k += mode === 5 ? 2 : mode === 2 ? 4 : 0;
			continue;
		}
		if (x === 8) {
			concealed = true;
			sawConceal = true;
		} else if ((x === 0 || x === 28) && !priv) concealed = false;
	}
	return {
		concealed,
		sawConceal
	};
}
let scratch = new Uint32Array(256);
function overwriteLine(buf, from, to) {
	let end = to;
	const crlf = end > from && buf[end - 1] === 13;
	if (crlf) end--;
	if (scratch.length < end - from) scratch = new Uint32Array(Math.max(end - from, scratch.length * 2));
	let col = 0;
	let width = 0;
	for (let q = from; q < end; q++) {
		const c = buf[q];
		if (c === 13) {
			col = 0;
			continue;
		}
		if (c === 8) {
			if (col > 0) col--;
			continue;
		}
		let cp = c;
		if (c >= 55296 && c <= 56319 && q + 1 < end && buf[q + 1] >= 56320 && buf[q + 1] <= 57343) {
			cp = (c - 55296 << 10) + (buf[q + 1] - 56320) + 65536;
			q++;
		}
		scratch[col++] = cp;
		if (col > width) width = col;
	}
	let w = from;
	for (let k = 0; k < width; k++) {
		const cp = scratch[k];
		if (cp > 65535) {
			buf[w++] = 55296 + (cp - 65536 >> 10);
			buf[w++] = 56320 + (cp - 65536 & 1023);
		} else buf[w++] = cp;
	}
	if (crlf) buf[w++] = 13;
	return w;
}
const isC1String = (c) => c === 144 || c === 152 || c === 157 || c === 158 || c === 159;
const isStringIntro = (x) => x === 93 || x === 80 || x === 88 || x === 94 || x === 95;
function renderUnits(src, len, tick) {
	let out = new Uint16Array(len);
	let r = 0;
	let concealed = false;
	let conceal = -1;
	let cursor = -1;
	let ctrl = -1;
	let c1 = -1;
	let unterminated = false;
	let lineStart = 0;
	let lineOverwrite = false;
	const flushLine = () => {
		r = overwriteLine(out, lineStart, r);
	};
	let k = 0;
	while (k < len) {
		tick();
		const c = src[k];
		const popEsc = c !== 27 && !concealed && r > lineStart && out[r - 1] === 27;
		const csi = c === 27 && k + 1 < len && src[k + 1] === 91 ? k + 2 : c === 155 ? k + 1 : popEsc && c === 91 ? k + 1 : -1;
		if (csi >= 0) {
			let p = csi;
			while (p < len && src[p] >= 48 && src[p] <= 63) p++;
			const paramsEnd = p;
			while (p < len && src[p] >= 32 && src[p] <= 47) p++;
			if (p < len && src[p] >= 64 && src[p] <= 126) {
				const fin = src[p];
				if (c === 155 && c1 < 0) c1 = r;
				if (fin === 109 && paramsEnd === p) {
					const s = applySgr(src, csi, paramsEnd, concealed);
					concealed = s.concealed;
					if (s.sawConceal && conceal < 0) conceal = r;
				} else if (CURSOR_FINALS.has(fin) && cursor < 0) cursor = r;
				if (popEsc && c === 91) r--;
				k = p + 1;
				continue;
			}
		} else {
			let body = -1;
			let osc = false;
			if (c === 27 && k + 1 < len) {
				const nx = src[k + 1];
				if (isStringIntro(nx)) {
					body = k + 2;
					osc = nx === 93;
				}
			} else if (popEsc && isStringIntro(c)) {
				body = k + 1;
				osc = c === 93;
				r--;
			} else if (isC1String(c)) {
				body = k + 1;
				osc = c === 157;
				if (c1 < 0) c1 = r;
			}
			if (body >= 0) {
				let p = body;
				let end = -1;
				while (p < len) {
					const d = src[p];
					if (osc && d === 7) {
						end = p + 1;
						break;
					}
					if (d === 156) {
						end = p + 1;
						break;
					}
					if (d === 27 && p + 1 < len && src[p + 1] === 92) {
						end = p + 2;
						break;
					}
					p++;
					tick();
				}
				if (end < 0) {
					unterminated = true;
					if (conceal < 0) conceal = r;
					k = len;
					break;
				}
				k = end;
				continue;
			}
		}
		if (concealed) {
			k++;
			continue;
		}
		if (c === 10 || c === 11 || c === 12) {
			if (c !== 10 && ctrl < 0) ctrl = r;
			if (lineOverwrite) flushLine();
			lineOverwrite = false;
			out[r++] = 10;
			lineStart = r;
			k++;
			continue;
		}
		if (c === 8) {
			if (ctrl < 0) ctrl = r;
			lineOverwrite = true;
		} else if (c === 13 && !(k + 1 < len && src[k + 1] === 10)) lineOverwrite = true;
		if (r >= out.length) {
			const grown = new Uint16Array(out.length * 2 + 16);
			grown.set(out);
			out = grown;
		}
		out[r++] = c;
		k++;
	}
	if (lineOverwrite) flushLine();
	return {
		out,
		len: r,
		conceal,
		cursor,
		ctrl,
		c1,
		unterminated
	};
}
/** Does s hold anything renderUnits changes (ESC, CR, BS, VT, FF, or an 8-bit C1 introducer)? */
function needsRender(s) {
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c === 8 || c === 11 || c === 12 || c === 13 || c === 27 || c === 144 || c === 152 || c === 155 || c >= 157 && c <= 159) return true;
	}
	return false;
}
const INSTRUCTION_WORDS = new Set([
	"ignore",
	"instead",
	"must",
	"should",
	"delete",
	"remove",
	"run",
	"curl",
	"wget",
	"rm",
	"write",
	"overwrite",
	"replace",
	"reset",
	"execute",
	"exec",
	"tool",
	"agent",
	"assistant",
	"system",
	"prompt",
	"hook",
	"settings",
	"config",
	"token",
	"secret",
	"password",
	"credential",
	"disable",
	"enable",
	"fetch",
	"send",
	"post",
	"upload",
	"download",
	"install",
	"chmod"
]);
const DOTTED = [
	".env",
	".git",
	".claude",
	".mcp"
];
const MAX_WORD = Math.max(...[...INSTRUCTION_WORDS].map((w) => w.length));
const WORDS_BY_LENGTH = [];
for (const w of INSTRUCTION_WORDS) (WORDS_BY_LENGTH[w.length] ??= []).push(w);
const WORD_UNIT = new Uint8Array(128);
for (const ch of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_") WORD_UNIT[ch.charCodeAt(0)] = 1;
const isWordUnit = (c) => c < 128 && WORD_UNIT[c] === 1;
const lowerAscii = (c) => c >= 65 && c <= 90 ? c + 32 : c;
const isJsSpace = (c) => c >= 9 && c <= 13 || c === 32 || c === 160 || c === 5760 || c >= 8192 && c <= 8202 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279;
function matchCI(text, pos, needle) {
	if (pos + needle.length > text.length) return false;
	for (let q = 0; q < needle.length; q++) if (lowerAscii(text.charCodeAt(pos + q)) !== needle.charCodeAt(q)) return false;
	return true;
}
function readsLikeInstruction(text, from, to, tick) {
	let p = from;
	while (p < to) {
		tick();
		let c = text.charCodeAt(p);
		while (p < to && !isWordUnit(c)) {
			if (c === 46) {
				for (const sub of DOTTED) if (p + sub.length <= to && matchCI(text, p, sub)) return true;
			}
			c = ++p < to ? text.charCodeAt(p) : 0;
		}
		const ws = p;
		while (p < to && isWordUnit(text.charCodeAt(p))) p++;
		const len = p - ws;
		const words = len <= MAX_WORD ? WORDS_BY_LENGTH[len] : void 0;
		if (words) {
			for (const word of words) if (matchCI(text, ws, word)) return true;
		}
		for (let q = ws; q + 5 <= (len >= 5 ? p : 0); q++) if (text.charCodeAt(q + 3) === 95 && text.charCodeAt(q + 4) === 95 && matchCI(text, q, "mcp__")) return true;
	}
	return false;
}
const STYLE_HIDING = [
	"display:none",
	"font-size:0",
	"visibility:hidden",
	"color:fff",
	"color:#fff",
	"color:white"
];
function cssHides(text, from, to, tick) {
	let css = "";
	let pending = "";
	for (let p = from; p < to; p++) {
		tick();
		const c = text.charCodeAt(p);
		if (c === 58) {
			css += ":";
			pending = "";
			while (p + 1 < to && isJsSpace(text.charCodeAt(p + 1))) p++;
			continue;
		}
		if (isJsSpace(c)) {
			pending += String.fromCharCode(c);
			continue;
		}
		css += pending + String.fromCharCode(lowerAscii(c));
		pending = "";
	}
	return STYLE_HIDING.some((h) => css.includes(h));
}
function closeDetails(text, from, tick) {
	for (let p = text.indexOf("</", from); p >= 0; p = text.indexOf("</", p + 2)) {
		tick();
		if (matchCI(text, p, "</details>")) return p;
	}
	return -1;
}
function hiddenHtml(text, add, tick) {
	let p = 0;
	for (;;) {
		const s = text.indexOf("<!--", p);
		if (s < 0) break;
		const e = text.indexOf("-->", s + 4);
		if (e < 0) break;
		if (readsLikeInstruction(text, s + 4, e, tick)) {
			add("hidden-html", s, e - s - 4, "comment");
			break;
		}
		p = e + 3;
	}
	const cache = /* @__PURE__ */ new Map();
	const nextAt = (ch, from) => {
		let at = cache.get(ch);
		if (at === void 0 || at >= 0 && at < from) {
			at = text.indexOf(ch, from);
			cache.set(ch, at);
		}
		return at < 0 ? text.length : at;
	};
	for (let e = text.indexOf("="); e >= 0; e = text.indexOf("=", e + 1)) {
		tick();
		let k = e - 1;
		while (k >= 0 && isJsSpace(text.charCodeAt(k))) k--;
		if (k < 4 || !matchCI(text, k - 4, "style")) continue;
		let q = e + 1;
		while (q < text.length && isJsSpace(text.charCodeAt(q))) q++;
		const quote = text.charCodeAt(q);
		if (quote !== 34 && quote !== 39) continue;
		const v = Math.min(nextAt("\"", q + 1), nextAt("'", q + 1));
		if (nextAt(":", q + 1) < v && cssHides(text, q + 1, v, tick)) {
			add("hidden-html", k - 4, 1, "zero-size/transparent text");
			break;
		}
	}
	p = 0;
	for (;;) {
		const s = text.indexOf("<", p);
		if (s < 0) break;
		tick();
		const after = text.charCodeAt(s + 8);
		if (!matchCI(text, s, "<details") || !(after === 62 || isJsSpace(after))) {
			p = s + 1;
			continue;
		}
		const close = closeDetails(text, s + 9, tick);
		const end = close < 0 ? text.length : close + 10;
		if (readsLikeInstruction(text, s, end, tick)) {
			add("hidden-html", s, 1, "details");
			break;
		}
		if (close < 0) break;
		p = end;
	}
}
const NOTICE_WORD = "enclawed";
const CONFUSABLE = new Map(Object.entries({
	а: "a",
	в: "b",
	е: "e",
	ё: "e",
	є: "e",
	к: "k",
	м: "m",
	н: "h",
	о: "o",
	р: "p",
	с: "c",
	т: "t",
	у: "y",
	х: "x",
	ѕ: "s",
	і: "i",
	ї: "i",
	ј: "j",
	ԁ: "d",
	һ: "h",
	ӏ: "l",
	ԛ: "q",
	ԝ: "w",
	ɡ: "g",
	ɩ: "i",
	ґ: "r",
	ѵ: "v",
	ѡ: "w",
	ш: "w",
	α: "a",
	β: "b",
	ε: "e",
	η: "n",
	ι: "i",
	κ: "k",
	ν: "v",
	ο: "o",
	ρ: "p",
	τ: "t",
	υ: "u",
	χ: "x",
	ω: "w",
	ϲ: "c",
	ϳ: "j",
	γ: "y",
	μ: "u",
	ı: "i",
	ȷ: "j",
	ɑ: "a",
	ɛ: "e",
	ɔ: "c",
	ⅼ: "l",
	ℓ: "l",
	ǀ: "l",
	ʀ: "r",
	ɪ: "i",
	ᴀ: "a",
	ᴄ: "c",
	ᴇ: "e",
	ᴏ: "o",
	ᴡ: "w",
	ɴ: "n",
	ʟ: "l",
	Ꭱ: "r",
	Ꮃ: "w",
	Ꮟ: "b",
	Ꭵ: "i",
	"∶": ":",
	"꞉": ":",
	"˸": ":",
	"։": ":",
	"׃": ":",
	"⁚": ":",
	"︓": ":",
	"﹕": ":",
	"፡": ":",
	"〕": "]",
	"⟧": "]",
	"⦌": "]",
	"⌉": "]",
	"⌋": "]"
}));
const CONFUSABLE_UPPER = new Map(Object.entries({
	Η: "h",
	Ν: "n",
	Μ: "m",
	Β: "b",
	Ζ: "z",
	Ρ: "p",
	Χ: "x",
	Υ: "y",
	В: "b",
	Н: "h",
	М: "m",
	Р: "p",
	Х: "x",
	У: "y",
	Т: "t",
	К: "k"
}));
const COMBINING = /\p{M}/gu;
const UNICODE_SPACE = /^[\p{Zs}\t]$/u;
const skelCache = /* @__PURE__ */ new Map();
function skeletonOf(ch) {
	const cached = skelCache.get(ch);
	if (cached !== void 0) return cached;
	let v;
	const upper = CONFUSABLE_UPPER.get(ch);
	if (UNICODE_SPACE.test(ch)) v = " ";
	else if (upper !== void 0) v = upper;
	else {
		let out = "";
		for (const c of ch.normalize("NFKD").replace(COMBINING, "")) {
			const cp = c.codePointAt(0) ?? 0;
			if (classOf(cp) !== NONE) continue;
			if (cp < 128) {
				out += c.toLowerCase();
				continue;
			}
			const up = CONFUSABLE_UPPER.get(c);
			if (up !== void 0) {
				out += up;
				continue;
			}
			const l = c.toLowerCase();
			out += CONFUSABLE.get(l) ?? CONFUSABLE.get(c) ?? l;
		}
		v = out;
	}
	if (skelCache.size < 8192) skelCache.set(ch, v);
	return v;
}
const isEmphasis = (c) => c === 42 || c === 95 || c === 96 || c === 126;
const SKEL_BMP = new Int32Array(65536).fill(-1);
for (let c = 0; c < 128; c++) SKEL_BMP[c] = isEmphasis(c) ? -2 : c === 9 ? 32 : c >= 65 && c <= 90 ? c + 32 : c;
/**
* The skeleton of `s`: what a reader sees, as lowercase Latin with look-alikes
* folded, combining marks, invisibles and Markdown emphasis dropped, runs of
* spaces collapsed. `map[i]` is the index in `s` skeleton character i came
* from. Linear.
*/
function skeleton(s, tick = () => {}) {
	let buf = new Uint16Array(s.length + 64);
	let map = new Int32Array(s.length + 64);
	let n = 0;
	let space = false;
	const push = (u, at) => {
		if (n >= buf.length) {
			const nb = new Uint16Array(buf.length * 2);
			nb.set(buf);
			buf = nb;
			const nm = new Int32Array(map.length * 2);
			nm.set(map);
			map = nm;
		}
		buf[n] = u;
		map[n++] = at;
	};
	for (let i = 0; i < s.length;) {
		tick();
		const c = s.charCodeAt(i);
		let v;
		let w = 1;
		let multi = "";
		if (c < 55296 || c > 57343) {
			v = SKEL_BMP[c];
			if (v === -1) {
				const str = skeletonOf(String.fromCharCode(c));
				v = str.length === 0 ? -2 : str.length === 1 ? str.charCodeAt(0) : -3;
				SKEL_BMP[c] = v;
			}
			if (v === -3) multi = skeletonOf(String.fromCharCode(c));
		} else {
			const cp = s.codePointAt(i) ?? c;
			w = cp > 65535 ? 2 : 1;
			multi = skeletonOf(String.fromCodePoint(cp));
			v = -3;
		}
		if (v === -2) {
			i += w;
			continue;
		}
		if (v >= 0) {
			if (v === 32) {
				if (!space) push(32, i);
				space = true;
			} else {
				space = false;
				push(v, i);
			}
			i += w;
			continue;
		}
		for (let k = 0; k < multi.length; k++) {
			const u = multi.charCodeAt(k);
			if (u === 32) {
				if (space) continue;
				space = true;
			} else space = false;
			push(u, i);
		}
		i += w;
	}
	return {
		skel: decode(buf, n),
		map: map.subarray(0, n)
	};
}
const ASCII_WORD = /e[*_`~]*n[*_`~]*c[*_`~]*l[*_`~]*a[*_`~]*w[*_`~]*e[*_`~]*d/i;
function quotedBefore(s, o) {
	let b = o - 1;
	while (b >= 0 && (s.charCodeAt(b) === 42 || s.charCodeAt(b) === 95)) b--;
	if (b >= 0 && s.charCodeAt(b) === 91) b--;
	const c = b >= 0 ? s.charCodeAt(b) : 0;
	return c === 96 || c === 34 || c === 39;
}
function codeSpanTracker(s) {
	let ls = 0;
	let pos = 0;
	let before = 0;
	let firstLineTotal = -1;
	return (o) => {
		for (; pos < o; pos++) {
			const c = s.charCodeAt(pos);
			if (c === 10) {
				ls = pos + 1;
				before = 0;
			} else if (c === 96) before++;
		}
		if (before % 2 === 1) return true;
		if (ls !== 0) return false;
		if (firstLineTotal < 0) {
			let le = s.indexOf("\n");
			if (le < 0) le = s.length;
			firstLineTotal = 0;
			for (let k = 0; k < le; k++) if (s.charCodeAt(k) === 96) firstLineTotal++;
		}
		return (firstLineTotal - before) % 2 === 1;
	};
}
const isHexSkel = (c) => c >= 48 && c <= 57 || c >= 97 && c <= 102;
/**
* Text that imitates a notice from Enclawed, matched on the skeleton anywhere
* in a line: "enclawed", optional space, an optional hex token of 4 or more
* characters, optional space, then ":" (or "]" after a token). Each match gets
* NOTICE_QUOTE before the word in the original text. A plain quoted or
* inline-code "Enclawed:" (documentation of the format) is left alone. Linear.
*/
function neutralizeNotices(s, tick = () => {}) {
	if (s.length < 8) return {
		text: s,
		at: -1,
		count: 0
	};
	const asciiOnly = isAscii(s);
	if (asciiOnly && !ASCII_WORD.test(s)) return {
		text: s,
		at: -1,
		count: 0
	};
	const { skel, map } = asciiOnly && !/[*_`~\t]| {2}/.test(s) ? {
		skel: s.toLowerCase(),
		map: null
	} : skeleton(s, tick);
	const inCode = codeSpanTracker(s);
	let out = "";
	let last = 0;
	let at = -1;
	let count = 0;
	for (let i = skel.indexOf(NOTICE_WORD); i >= 0; i = skel.indexOf(NOTICE_WORD, i + 8)) {
		tick();
		let f = i + 8;
		if (skel.charCodeAt(f) === 32) f++;
		const hexFrom = f;
		while (f < skel.length && f - hexFrom <= 64 && isHexSkel(skel.charCodeAt(f))) f++;
		const tagged = f - hexFrom >= 4;
		if (f > hexFrom && !tagged) continue;
		if (skel.charCodeAt(f) === 32) f++;
		const c = skel.charCodeAt(f);
		if (!(c === 58 || c === 93 && tagged)) continue;
		const o = map ? map[i] : i;
		if (o < last || o >= 7 && s.slice(o - 7, o) === "quoted-") continue;
		const before = i > 0 ? skel.charCodeAt(i - 1) : 32;
		if (before >= 97 && before <= 122 || before >= 48 && before <= 57 || before === 46 || before === 47 || before === 92) continue;
		if (!tagged && (quotedBefore(s, o) || inCode(o))) continue;
		if (at < 0) at = o;
		count++;
		out += `${s.slice(last, o)}${NOTICE_QUOTE}`;
		last = o;
	}
	return count === 0 ? {
		text: s,
		at: -1,
		count: 0
	} : {
		text: out + s.slice(last),
		at,
		count
	};
}
const JOINING_SCRIPT = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Myanmar}\p{Script=Khmer}\p{Script=Tibetan}\p{Script=Thai}\p{Script=Lao}\p{Script=Balinese}\p{Script=Javanese}]/u;
const WORD_BREAK_SCRIPT = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Javanese}\p{Script=Balinese}]/u;
const PICTO = /\p{Extended_Pictographic}/u;
const LETTER = /[\p{L}\p{M}\p{N}]/u;
const isEmojiModifier = (cp) => cp >= 127995 && cp <= 127999;
function cpBefore(text, at) {
	if (at <= 0) return -1;
	const lo = text.charCodeAt(at - 1);
	if (lo >= 56320 && lo <= 57343 && at >= 2) {
		const hi = text.charCodeAt(at - 2);
		if (hi >= 55296 && hi <= 56319) return (hi - 55296 << 10) + (lo - 56320) + 65536;
	}
	return lo;
}
function legitInContext(text, i, j, c, cpAt) {
	const prev = cpBefore(text, i);
	if (prev < 0) return false;
	const prevCls = classOf(prev);
	const p = String.fromCodePoint(prev);
	if (c === 65038 || c === 65039) return prevCls === NONE && (PICTO.test(p) || /^[0-9#*]$/.test(p));
	if (c >= 65024 && c <= 65037) return prevCls === NONE && prev > 127 && /^[\p{L}\p{S}\p{N}]$/u.test(p);
	const cp = c >= 55296 && c <= 56319 ? text.codePointAt(i) ?? c : c;
	if (cp >= 917760 && cp <= 917999) return prevCls === NONE && /\p{Script=Han}/u.test(p);
	if (cp === 6155 || cp === 6156 || cp === 6157 || cp === 6159) return /\p{Script=Mongolian}/u.test(p);
	const next = j < text.length ? cpAt(j) : -1;
	if (next < 0) return false;
	const nx = String.fromCodePoint(next);
	const nextCls = classOf(next);
	if (cp === 8205 && (PICTO.test(p) || isEmojiModifier(prev) || prev === 65039) && PICTO.test(nx)) return true;
	if (cp === 8204 || cp === 8205) return prevCls === NONE && nextCls === NONE && JOINING_SCRIPT.test(p) && JOINING_SCRIPT.test(nx);
	if (cp === 8203) return prevCls === NONE && nextCls === NONE && WORD_BREAK_SCRIPT.test(p) && WORD_BREAK_SCRIPT.test(nx);
	if (cp === 173 || cp === 8288) return prevCls === NONE && nextCls === NONE && LETTER.test(p) && LETTER.test(nx);
	return false;
}
function stripInvisible(text, add, tick) {
	const n = text.length;
	const keep = new Uint16Array(n);
	let o = 0;
	let removedAny = false;
	let cpIndex = 0;
	let opens = 0;
	let unbalanced = false;
	let i = 0;
	let width = 1;
	const cpAt = (at) => {
		const c = text.charCodeAt(at);
		if (c >= 55296 && c <= 56319 && at + 1 < n) {
			const d = text.charCodeAt(at + 1);
			if (d >= 56320 && d <= 57343) {
				width = 2;
				return (c - 55296 << 10) + (d - 56320) + 65536;
			}
		}
		width = 1;
		return c;
	};
	while (i < n) {
		tick();
		let c = text.charCodeAt(i);
		if (c < 173) {
			const from = i;
			do {
				keep[o++] = c;
				c = ++i < n ? text.charCodeAt(i) : 65535;
			} while (c < 173);
			cpIndex += i - from;
			continue;
		}
		let cls;
		if (c < 55296 || c > 57343) {
			cls = BMP[c];
			width = 1;
		} else cls = classOf(cpAt(i));
		if (cls === NONE) {
			keep[o++] = c;
			if (width === 2) keep[o++] = text.charCodeAt(i + 1);
			i += width;
			cpIndex++;
			continue;
		}
		if (cls === TAG || cls === VS || cls === INVIS || cls === LONE) {
			const start = cpIndex;
			let count = 0;
			let j = i;
			while (j < n) {
				tick();
				if (classOf(cpAt(j)) !== cls) break;
				j += width;
				count++;
			}
			if (count === 1 && (cls === INVIS || cls === VS) && legitInContext(text, i, j, c, cpAt)) {
				for (let q = i; q < j; q++) keep[o++] = text.charCodeAt(q);
				cpIndex++;
				i = j;
				continue;
			}
			if (cls === TAG) add("unicode-tag", start, count);
			else if (cls === LONE) add("lone-surrogate", start, count);
			else if (cls === VS && count >= VS_RUN) add("variation-selector-run", start, count);
			else if (cls === INVIS && count >= ZW_RUN) add("zero-width-run", start, count);
			removedAny = true;
			cpIndex += count;
			i = j;
			continue;
		}
		if (cls === BIDI_OVERRIDE) {
			add("bidi-control", cpIndex, 1, "override (LRO/RLO)");
			removedAny = true;
		} else {
			if (cls === BIDI_OPEN) opens++;
			else if (--opens < 0) {
				unbalanced = true;
				opens = 0;
			}
			keep[o++] = c;
		}
		i += width;
		cpIndex++;
	}
	if (unbalanced || opens > 0) {
		add("bidi-control", -1, opens, "unbalanced embedding/isolate");
		let w = 0;
		for (let q = 0; q < o; q++) {
			tick();
			const cls = BMP[keep[q]];
			if (cls !== BIDI_OPEN && cls !== BIDI_POP) keep[w++] = keep[q];
		}
		o = w;
		removedAny = true;
	}
	return {
		keep,
		o,
		removedAny
	};
}
function cleanRound(text, add, tick) {
	const n = text.length;
	const ascii = isAscii(text);
	let keep = null;
	let o = 0;
	let removedAny = false;
	if (!ascii) ({keep, o, removedAny} = stripInvisible(text, add, tick));
	let clean;
	if (!removedAny && !needsRender(text)) clean = text;
	else {
		if (keep === null) {
			keep = encode(text);
			o = n;
		}
		const r = renderUnits(keep, o, tick);
		if (r.conceal >= 0) add("ansi-conceal", r.conceal, 1, r.unterminated ? "unterminated escape string" : void 0);
		if (r.cursor >= 0) add("ansi-cursor", r.cursor, 1);
		if (r.ctrl >= 0) add("control-overwrite", r.ctrl, 1, "backspace, vertical tab or form feed");
		if (r.c1 >= 0) add("ansi-c1", r.c1, 1, "8-bit C1 escape");
		clean = decode(r.out, r.len);
		if (clean === text) clean = text;
	}
	const nn = neutralizeNotices(clean, tick);
	if (nn.count > 0) {
		add("spoofed-notice", nn.at, nn.count);
		clean = nn.text;
	}
	return clean;
}
function withholdRegion(clean, next, add, tick) {
	let p = 0;
	const max = Math.min(clean.length, next.length);
	while (p < max && clean.charCodeAt(p) === next.charCodeAt(p)) p++;
	let q = 0;
	while (q < max - p && clean.charCodeAt(clean.length - 1 - q) === next.charCodeAt(next.length - 1 - q)) q++;
	const from = p === 0 ? 0 : clean.lastIndexOf("\n", p - 1) + 1;
	const nl = clean.indexOf("\n", Math.max(from, clean.length - q - 1));
	const to = nl < 0 ? clean.length : nl;
	const out = `${clean.slice(0, from)}${WITHHELD_MARKER}${clean.slice(to)}`;
	if (cleanRound(out, () => {}, tick) !== out) throw new TooComplex("no fixed point");
	add("withheld-region", from, to - from, "no fixed point");
	return out;
}
function scan(text, tick, deadline, maxRounds) {
	if (performance.now() > deadline) throw new TooComplex();
	const findings = [];
	const perType = /* @__PURE__ */ new Map();
	const add = (type, index, count, note) => {
		const k = perType.get(type) ?? 0;
		if (k < MAX_PER_TYPE) {
			perType.set(type, k + 1);
			findings.push({
				type,
				index,
				count,
				...note ? { note } : {}
			});
		}
	};
	let clean = text;
	for (let round = 0;; round++) {
		const next = cleanRound(clean, add, tick);
		if (next === clean) break;
		if (round + 1 >= maxRounds) {
			clean = withholdRegion(clean, next, add, tick);
			break;
		}
		clean = next;
	}
	hiddenHtml(text, add, tick);
	if (performance.now() > deadline) throw new TooComplex();
	return {
		clean,
		findings
	};
}
/** The fail-safe result for a payload that is not inspected. */
function withheldResult(text, note = "time budget exceeded") {
	return {
		clean: WITHHELD_MARKER,
		findings: [{
			type: "too-complex",
			index: 0,
			count: typeof text === "string" ? text.length : 0,
			note
		}],
		withheld: true
	};
}
/**
* Clean one string. On budget exhaustion `clean` is WITHHELD_MARKER and the
* single finding is "too-complex": the content is never passed through.
*/
function cleanText(text, opts = {}) {
	if (typeof text !== "string") return {
		clean: "",
		findings: []
	};
	const budgetMs = opts.budgetMs ?? 1e3;
	const deadline = Math.min(performance.now() + budgetMs, opts.deadline ?? Infinity);
	try {
		return scan(text, makeClock(deadline), deadline, opts.maxRounds ?? MAX_ROUNDS);
	} catch (err) {
		if (err instanceof TooComplex) return withheldResult(text, err.message || void 0);
		throw err;
	}
}
/** Strip invisible and bidi code points; returns the visible text and how many were removed. */
function stripHidden(s) {
	let out = "";
	let removed = 0;
	for (const ch of s) {
		const cp = ch.codePointAt(0) ?? 0;
		if (classOf(cp) !== NONE || cp === 8206 || cp === 8207 || cp === 1564) removed++;
		else out += ch;
	}
	return {
		text: out,
		removed
	};
}
/**
* The text of a value from outside Enclawed (a hook payload, a settings
* file, a record, a thrown value). A string is itself; a number, boolean,
* bigint, null or undefined reads as String() reads it; a symbol as its
* description form; an Error as "Name: message". Any other object is
* serialized deliberately as JSON (a function, or a value JSON cannot
* hold, as its type tag), never as "[object Object]", so two different
* objects never read as the same text.
*/
function textOf(value) {
	switch (typeof value) {
		case "string": return value;
		case "number":
		case "boolean":
		case "bigint":
		case "undefined": return String(value);
		case "symbol": return value.toString();
		default: break;
	}
	if (value === null) return "null";
	if (value instanceof Error) return String(value);
	try {
		const json = JSON.stringify(value);
		if (json !== void 0) return json;
	} catch {}
	return Object.prototype.toString.call(value);
}
function escapeUnit(c) {
	return `\\u${c.toString(16).padStart(4, "0")}`;
}
function jsonQuote(s) {
	const j = JSON.stringify(s);
	let out = "";
	for (let i = 0; i < j.length; i++) {
		const c = j.charCodeAt(i);
		out += c >= 127 && c <= 159 || c === 8232 || c === 8233 || c === 65532 || c === 65533 ? escapeUnit(c) : j[i];
	}
	return out;
}
/** One agent-controlled value, rendered for Enclawed's own messages: a JSON string literal, possibly with a note. */
function quoteUntrusted(value, opts = {}) {
	const max = opts.max ?? 200;
	const raw = value === void 0 ? "" : textOf(value);
	const { text, removed } = stripHidden(raw);
	const visible = neutralizeNotices(text).text;
	const cps = Array.from(visible);
	let shown = visible;
	let cut = "";
	if (cps.length > max) {
		shown = `${cps.slice(0, max).join("")}…`;
		cut = `${cps.length} characters, sha256 ${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;
	}
	const notes = [cut, removed ? `${removed} hidden character${removed === 1 ? "" : "s"} removed` : ""].filter(Boolean);
	return `${jsonQuote(shown)}${notes.length ? ` (${notes.join("; ")})` : ""}`;
}
/** A path Enclawed computed: bare when it is plain printable ASCII, quoted otherwise. */
function showPath(p) {
	const s = textOf(p ?? "");
	let plain = s.length > 0 && !s.includes("\"");
	for (let i = 0; plain && i < s.length; i++) {
		const c = s.charCodeAt(i);
		plain = c >= 33 && c <= 126;
	}
	return plain ? s : quoteUntrusted(s, { max: 400 });
}
/**
* Free text that mixes Enclawed's wording with values from elsewhere (an
* error message): hidden characters stripped, controls and newlines escaped,
* notice imitations neutralized, length capped. Not quoted.
*/
function sanitizeText(value, opts = {}) {
	const max = opts.max ?? 600;
	const { text } = stripHidden(textOf(value ?? ""));
	const base = opts.neutralize === false ? text : neutralizeNotices(text).text;
	let t = "";
	for (let i = 0; i < base.length; i++) {
		const c = base.charCodeAt(i);
		if (c === 10) t += "\\n";
		else if (c === 9) t += " ";
		else if (c <= 31 || c >= 127 && c <= 159 || c === 8232 || c === 8233) t += escapeUnit(c);
		else t += base[i];
	}
	const cps = Array.from(t);
	if (cps.length > max) t = `${cps.slice(0, max).join("")}… (${cps.length} characters)`;
	return t;
}
//#endregion
//#region src/enclawed/adapter/env-trust.ts
/** Classes whose repository-supplied value refuses the launch. */
const REFUSED_ENV_CLASSES = [
	"destination",
	"trust",
	"credential",
	"load",
	"telemetry"
];
/**
* Loader-injection variables: they make the dynamic loader map a library into
* the host CLI itself and every process it starts. Removed from what the
* launcher starts unless an administrator grants them. LD_LIBRARY_PATH and the
* DYLD_*_PATH search paths are not here (module systems set them for real
* work); from a repository they are refused like every other `load` variable.
*/
const LOADER_INJECTION_ENV = [
	"LD_PRELOAD",
	"LD_AUDIT",
	"DYLD_INSERT_LIBRARIES"
];
const MODEL_VARS = /(^|_)MODEL(_FORCE|_OPTION)?$/;
const NUMERIC_SUFFIX = /_(MS|S|SECONDS|MINUTES|TIMEOUT|TOKENS|THRESHOLD|LIMIT|BUDGET|COUNT|LENGTH|SIZE|CONCURRENCY|RETRIES|INTERVAL|PCT|PCT_OVERRIDE|LIMIT_OVERRIDE|DEPTH|WIDTH|PERCENT|ONE_IN|TURNS|GIB)$/;
const DESTINATION_SEGMENTS = new Set([
	"URL",
	"URLS",
	"URI",
	"HOST",
	"HOSTS",
	"HOSTNAME",
	"ENDPOINT",
	"ENDPOINTS",
	"BASE",
	"ORIGIN",
	"SOCKET",
	"SOCK",
	"PORT",
	"IP",
	"ADDR",
	"ADDRESS",
	"SERVER",
	"REGISTRY",
	"REGISTRIES",
	"MIRROR",
	"INDEX",
	"DOMAIN",
	"GATEWAY",
	"REGION",
	"LOCATION",
	"ZONE",
	"PUBLISH",
	"SHARE",
	"RELAY",
	"TUNNEL",
	"BRIDGE",
	"REMOTE",
	"INGRESS",
	"UPSTREAM",
	"WEBHOOK",
	"METADATA"
]);
const DESTINATION_NAMES = new Set([
	"GOSUMDB",
	"GONOSUMDB",
	"GONOSUMCHECK",
	"GOPRIVATE",
	"GOTOOLCHAIN"
]);
const TRUST_SUBSTRINGS = [
	"CERT",
	"TLS",
	"SSL",
	"INSECURE",
	"VERIFY",
	"CAINFO",
	"CAPATH",
	"CA_BUNDLE",
	"MTLS",
	"TRUST",
	"KEYLOG",
	"PINNING"
];
const TRUST_SEGMENTS = new Set([
	"CA",
	"SETTINGS",
	"POLICY",
	"SCRUB",
	"INHERIT",
	"SANDBOX",
	"SANDBOXED",
	"CONFINED",
	"PERMISSION",
	"PERMISSIONS"
]);
const TRUST_NAMES = new Set([
	"XDG_CONFIG_HOME",
	"KUBECONFIG",
	"CLOUDSDK_CONFIG",
	"CURL_HOME",
	"WGETRC",
	"NETRC",
	"GNUPGHOME",
	"APPDATA",
	"LOCALAPPDATA",
	"ALLUSERSPROFILE",
	"PROGRAMDATA",
	"USERPROFILE",
	"HOMEDRIVE",
	"HOMEPATH"
]);
const CREDENTIAL_SEGMENTS = new Set([
	"KEY",
	"KEYS",
	"TOKEN",
	"SECRET",
	"SECRETS",
	"PASSWORD",
	"PASSWD",
	"PASSPHRASE",
	"CREDENTIAL",
	"CREDENTIALS",
	"CREDS",
	"BEARER",
	"OAUTH",
	"AUTH",
	"AUTHORIZATION",
	"COOKIE",
	"COOKIES",
	"PROFILE",
	"ACCOUNT",
	"ORGANIZATION",
	"ORG",
	"WORKSPACE",
	"TENANT",
	"PROJECT",
	"FEDERATION",
	"IDENTITY",
	"ROLE",
	"HEADERS",
	"HEADER",
	"UUID",
	"SCOPES",
	"CREDMAN",
	"KEYCHAIN",
	"KEYRING",
	"CLIENT",
	"SESSION",
	"SCOPE",
	"EMAIL"
]);
const CREDENTIAL_PREFIXES = /^(AZURE_|AWS_|GOOGLE_|GCLOUD_|GH_|GITHUB_|ANTHROPIC_(API|AUTH|FOUNDRY|AWS|IDENTITY|ORGANIZATION|WORKSPACE|PROFILE|FEDERATION|ENVIRONMENT)|OPENAI_|GEMINI_|COPILOT_)/;
const LOAD_SEGMENTS = new Set([
	"PRELOAD",
	"PATH",
	"PATHS",
	"DIR",
	"DIRS",
	"HOME",
	"ROOT",
	"EXEC",
	"BIN",
	"BINARY",
	"SHELL",
	"BROWSER",
	"EDITOR",
	"COMMAND",
	"CMD",
	"HELPER",
	"WRAPPER",
	"PREFIX",
	"HOOK",
	"HOOKS",
	"PLUGIN",
	"PLUGINS",
	"MODULE",
	"MODULES",
	"LIBRARY",
	"LIB",
	"LIBS",
	"INSERT",
	"INTERPOSE",
	"LOADER",
	"LOADABLES",
	"OPTIONS",
	"OPTS",
	"FLAGS",
	"STARTUP",
	"INIT",
	"FILE",
	"CONFIG",
	"B64",
	"BUNDLE",
	"INSPECT",
	"INSPECTOR",
	"TMPDIR",
	"ROOTS",
	"EXECPATH"
]);
const LOAD_PREFIXES = /^(LD_|DYLD_|BUN_)/;
const LOAD_INTERPRETER = new Set([
	"NODE_OPTIONS",
	"NODE_PATH",
	"NODE_REPL_EXTERNAL_MODULE",
	"PYTHONPATH",
	"PYTHONSTARTUP",
	"PYTHONHOME",
	"PYTHONUSERBASE",
	"PYTHONEXECUTABLE",
	"PERL5OPT",
	"PERL5LIB",
	"PERLLIB",
	"PERL5DB",
	"RUBYOPT",
	"RUBYLIB",
	"LESSOPEN",
	"LESSCLOSE",
	"PAGER",
	"VISUAL",
	"PS4",
	"SHELLOPTS",
	"BASHOPTS",
	"JAVA_TOOL_OPTIONS",
	"_JAVA_OPTIONS"
]);
const LOAD_NAMES = new Set([
	"ZDOTDIR",
	"SHELL",
	"TMPDIR",
	"TEMP",
	"TMP",
	"BASH_ENV",
	"ENV",
	"PROMPT_COMMAND",
	"GOFLAGS",
	"GOPATH",
	"GOROOT",
	"CFLAGS",
	"CXXFLAGS",
	"LDFLAGS",
	"CPPFLAGS",
	"RUSTFLAGS",
	"RUSTC_WRAPPER",
	"MAVEN_OPTS",
	"GRADLE_OPTS"
]);
const TELEMETRY_SEGMENTS = new Set([
	"TELEMETRY",
	"TRACING",
	"DATADOG",
	"SENTRY",
	"OTEL",
	"OTLP"
]);
/**
* Known hosts' own names, kept here (in Enclawed) rather than in each
* adapter, so an adapter that forgets one does not weaken the check. Keyed by
* the adapter's host id.
*/
const KNOWN_HOST_ENV = { "claude-code": {
	benign: [
		"CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR",
		"CLAUDE_CODE_SESSION_KIND",
		"CLAUDE_CODE_CHILD_SESSION",
		"CLAUDE_CODE_SKIP_PROMPT_HISTORY",
		"CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT",
		"CLAUDE_CODE_DISABLE_NESTED_SESSION_ID"
	],
	providerSwitches: [
		"CLAUDE_CODE_USE_BEDROCK",
		"CLAUDE_CODE_USE_VERTEX",
		"CLAUDE_CODE_USE_FOUNDRY",
		"CLAUDE_CODE_USE_ANTHROPIC_AWS",
		"CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD"
	],
	destination: [
		"CLAUDE_CODE_USE_BEDROCK",
		"CLAUDE_CODE_USE_VERTEX",
		"CLAUDE_CODE_USE_FOUNDRY",
		"CLAUDE_CODE_USE_MANTLE",
		"CLAUDE_CODE_USE_ANTHROPIC_AWS",
		"CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
		"CLAUDE_CODE_USE_GATEWAY",
		"CLAUDE_CODE_USE_CCR_V2",
		"CLAUDE_CODE_EXTRA_BODY",
		"ENABLE_CLAUDEAI_MCP_SERVERS",
		"CLAUDE_CODE_MCP_ALLOWLIST_ENV"
	],
	trust: [
		"CLAUDE_PROJECT_DIR",
		"CLAUDE_CODE_DISABLE_ADMIN_ENV_UNION",
		"CLAUDE_CODE_ENVIRONMENT_KIND",
		"CLAUDE_CODE_MOCK_REMOTE_SETTINGS"
	]
} };
/** The extra names for a host: its known table merged with the adapter's own additions. */
function hostEnvExtra(host, own = {}) {
	const k = Object.hasOwn(KNOWN_HOST_ENV, host) ? KNOWN_HOST_ENV[host] : {};
	return {
		benign: [...k.benign ?? [], ...own.benign ?? []],
		destination: [...k.destination ?? [], ...own.destination ?? []],
		trust: [...k.trust ?? [], ...own.trust ?? []],
		providerSwitches: [...k.providerSwitches ?? [], ...own.providerSwitches ?? []]
	};
}
/** A provider's region names (generic: the cloud SDKs read them). */
const PROVIDER_REGION_NAMES = new Set([
	"AWS_REGION",
	"AWS_DEFAULT_REGION",
	"CLOUD_ML_REGION"
]);
const PROVIDER_REGION_PREFIX = /^VERTEX_REGION_[A-Z0-9_]+$/;
/** A project id that selects the user's own cloud project. */
const PROVIDER_PROJECT_NAMES = new Set(["ANTHROPIC_VERTEX_PROJECT_ID"]);
const SWITCH_VALUE = /^(1|0|true|false|yes|no|on|off)$/i;
const REGION_VALUE = /^(global|[a-z]{2,}(?:-[a-z0-9]+){1,3})$/;
const PROJECT_VALUE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
/**
* A value that only selects which of the user's own providers, regions or
* projects the session uses: a provider switch set on or off, a region id, a
* project id. Anything else (a URL, a host, an ARN, a credential) is not.
*/
function providerSelection(n, value, extra) {
	const v = value.trim();
	if (extra.providerSwitches?.includes(n)) return SWITCH_VALUE.test(v);
	if (PROVIDER_REGION_NAMES.has(n) || PROVIDER_REGION_PREFIX.test(n)) return REGION_VALUE.test(v);
	if (PROVIDER_PROJECT_NAMES.has(n)) return PROJECT_VALUE.test(v);
	return false;
}
const segmentsOf = (n) => n.split("_").filter(Boolean);
const hasSegment = (segs, set) => segs.some((s) => set.has(s));
/** Is `name` credential-shaped (its value is never written to the audit log)? */
function credentialLike(name, extra = {}) {
	const n = name.toUpperCase();
	if (extra.benign?.includes(n)) return false;
	return hasSegment(segmentsOf(n), CREDENTIAL_SEGMENTS) || /(TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|_KEY$)/.test(n);
}
/** The class of one variable; only model variables look at the value. */
function classifyEnv(name, value, extra = {}) {
	const n = name.toUpperCase();
	const segs = segmentsOf(n);
	if (extra.benign?.includes(n)) return {
		class: "benign",
		why: "a behavior switch"
	};
	if (typeof value === "string" && providerSelection(n, value, extra)) return {
		class: "provider",
		why: "selects the user's own provider, region or project (no endpoint, no credential)"
	};
	if (MODEL_VARS.test(n)) {
		const v = typeof value === "string" ? value.trim() : "";
		return /^arn:|:\/\/|^\/|\\/i.test(v) ? {
			class: "destination",
			why: "a model value that names a resource or location, not a model id"
		} : {
			class: "benign",
			why: "a model id"
		};
	}
	const trustNamed = TRUST_NAMES.has(n) || Boolean(extra.trust?.includes(n));
	if ((segs.includes("DISABLE") || n === "DO_NOT_TRACK") && !trustNamed && !TRUST_SUBSTRINGS.some((x) => n.includes(x))) return {
		class: "benign",
		why: "switches a feature off"
	};
	if (n.startsWith("OTEL_") || hasSegment(segs, TELEMETRY_SEGMENTS)) return {
		class: "telemetry",
		why: "what is exported as telemetry, and where"
	};
	if (n.includes("PROXY")) return {
		class: "destination",
		why: "a proxy: where traffic goes"
	};
	if (DESTINATION_NAMES.has(n) || extra.destination?.includes(n)) return {
		class: "destination",
		why: "where the session's traffic goes"
	};
	if (trustNamed || TRUST_SUBSTRINGS.some((s) => n.includes(s)) || hasSegment(segs, TRUST_SEGMENTS)) return {
		class: "trust",
		why: "what is trusted (certificates, TLS verification, settings and trust sources)"
	};
	if (NUMERIC_SUFFIX.test(n)) return {
		class: "benign",
		why: "a number or a duration"
	};
	if (hasSegment(segs, DESTINATION_SEGMENTS)) return {
		class: "destination",
		why: "an address, endpoint or region"
	};
	if (credentialLike(n, extra) || CREDENTIAL_PREFIXES.test(n)) return {
		class: "credential",
		why: "whose credentials or account are used"
	};
	if (LOAD_NAMES.has(n) || LOAD_INTERPRETER.has(n) || LOAD_PREFIXES.test(n) || hasSegment(segs, LOAD_SEGMENTS)) return {
		class: "load",
		why: "what code, binaries or configuration are loaded or run"
	};
	return {
		class: "benign",
		why: "a behavior switch that does not change where traffic goes, what is trusted or what is loaded"
	};
}
function isRefusedEnvClass(c) {
	return REFUSED_ENV_CLASSES.includes(c);
}
/** What the audit log may hold of a value: userinfo removed from URLs, bounded; credentials as a digest only. */
function recordableEnvValue(name, value) {
	const s = textOf(value ?? "");
	const digest = createHash("sha256").update(s).digest("hex").slice(0, 16);
	if (credentialLike(name)) return { digest };
	return {
		value: s.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/gi, "$1<userinfo>@").slice(0, 300),
		digest
	};
}
/**
* Names that change what the commands the gate treats as read-only would do
* (a PATH, a shell startup file, a pager, an interpreter option). When a
* lower settings file sets one the launcher did not pin, even a read-only
* command is irreversible (the engine's `shellEnvRisk`).
*/
function changesShellCommands(name, hostPrefixes = []) {
	const n = name.toUpperCase();
	if (/^(ENCLAWED_|ENCLAWEDER_|NODE_|NPM_CONFIG_|LD_|DYLD_|GIT_|BASH_FUNC_)/.test(n) || hostPrefixes.some((p) => n.startsWith(p))) return true;
	return [
		"PATH",
		"HOME",
		"TMPDIR",
		"BASH_ENV",
		"ENV",
		"PROMPT_COMMAND",
		"SHELLOPTS",
		"BASHOPTS",
		"PS4",
		"PAGER",
		"EDITOR",
		"VISUAL",
		"PYTHONPATH",
		"PYTHONSTARTUP",
		"PERL5OPT",
		"PERL5LIB",
		"RUBYOPT",
		"LESSOPEN",
		"LESSCLOSE",
		"XDG_RUNTIME_DIR"
	].includes(n);
}
/** Worth a record: what changes where traffic goes, what is trusted, whose account, telemetry, injected code. */
function recordWorthy(name, value, extra) {
	const c = classifyEnv(name, value, extra).class;
	if (c === "destination" || c === "trust" || c === "credential" || c === "telemetry" || c === "provider") return c;
	return c === "load" && /^(LD_|DYLD_|NODE_OPTIONS$|NODE_PATH$|BUN_OPTIONS$|JAVA_TOOL_OPTIONS$|_JAVA_OPTIONS$|PYTHONPATH$|PYTHONSTARTUP$|PERL5OPT$|PERL5LIB$|RUBYOPT$|ZDOTDIR$|BASH_ENV$|ENV$)/.test(name.toUpperCase()) ? c : null;
}
/**
* Decide the repository's env: every refused name (the launch must not
* start while any remains), and what each source sets of the recorded
* classes (for the session-start record).
*/
function decideRepositoryEnv(input) {
	const extra = input.extra ?? {};
	const effective = /* @__PURE__ */ new Map();
	for (const src of input.repository) for (const [name, v] of Object.entries(src.env)) effective.set(name, {
		origin: src.origin,
		value: textOf(v)
	});
	const has = (list, name) => list.some((s) => Object.hasOwn(s.env, name));
	const userValue = (name) => {
		let v;
		for (const s of input.user) if (Object.hasOwn(s.env, name) && s.env[name] !== void 0) v = textOf(s.env[name]);
		return v;
	};
	const refusals = [];
	const origins = [];
	const note = (name, value, origin, outcome) => {
		const c = recordWorthy(name, value, extra);
		if (c) origins.push({
			name,
			origin,
			class: c,
			outcome,
			...recordableEnvValue(name, value)
		});
	};
	for (const name of [...effective.keys()].toSorted()) {
		const { origin, value } = effective.get(name);
		const c = classifyEnv(name, value, extra);
		if (!isRefusedEnvClass(c.class)) {
			if (c.class === "provider") note(name, value, origin, "accepted");
			continue;
		}
		if (input.launcherPinned?.(name) && ![
			"destination",
			"trust",
			"credential"
		].includes(c.class)) continue;
		if (has(input.higher, name)) {
			note(name, value, origin, "shadowed");
			continue;
		}
		const mine = userValue(name);
		if (mine !== void 0 && mine === value) {
			note(name, value, origin, "same-as-user");
			continue;
		}
		refusals.push({
			origin,
			name,
			class: c.class,
			why: c.why
		});
	}
	for (const src of [...input.user, ...input.higher]) for (const [name, value] of Object.entries(src.env)) if (typeof value === "string") note(name, value, src.origin, "kept");
	return {
		refusals,
		origins
	};
}
const CLASS_EFFECT = {
	destination: "it changes where the agent or the commands it runs send traffic",
	trust: "it changes what the agent or the commands it runs trust",
	credential: "it changes whose credentials or account the session uses",
	load: "it changes what code the agent or the commands it runs load",
	telemetry: "it changes what the session exports as telemetry, and where",
	provider: "it selects which of the user's own providers the session uses",
	benign: "it changes nothing that matters here"
};
/** The refusal message for the first refusal, in plain words. */
function repositoryEnvMessage(refusals, app = "Enclawed") {
	const r = refusals[0];
	if (!r) return "";
	const more = refusals.length > 1 ? ` (and ${refusals.length - 1} more: ${refusals.slice(1, 5).map((x) => x.name).join(", ")})` : "";
	return `${r.origin} sets ${r.name} in its env; ${CLASS_EFFECT[r.class]} (${r.why}). A repository's settings must not do that, so ${app} refuses to start${more}. If you mean to use it, set ${r.name} yourself, in your shell or your own user settings, and remove it from the repository's settings`;
}
/** `env` without the loader-injection variables, except those an administrator granted (exact upper-case name). */
function scrubLoaderEnv(env, granted = []) {
	const out = { ...env };
	const removed = [];
	const kept = [];
	for (const k of Object.keys(env)) {
		const upper = k.toUpperCase();
		if (!LOADER_INJECTION_ENV.includes(upper)) continue;
		if (granted.includes(upper) && k === upper) kept.push(k);
		else {
			delete out[k];
			removed.push(k);
		}
	}
	return {
		env: out,
		removed: removed.toSorted(),
		granted: kept.toSorted()
	};
}
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
* Every string in `value` with the leading shell words the host expands
* replaced by the absolute paths they name (see HookEntry.expand). Only the
* words change; separators stay.
*/
function expandHookWords(value, x) {
	const vars = Object.entries(x.vars ?? {}).filter((e) => VAR_NAME.test(e[0]) && typeof e[1] === "string" && e[1] !== "");
	const word = (w) => {
		let out = w;
		if (x.home) out = out.replace(/^~(?=\/|$)/, x.home).replace(/^\$\{?HOME\}?(?=\/|$)/, x.home);
		for (const [name, to] of vars) out = out.replace(new RegExp(`^\\$\\{?${name}\\}?(?=/|$)`), to);
		return out;
	};
	const walk = (v) => {
		if (typeof v === "string") return v.replace(/[^\s;|&()<>`'"=]+/g, word);
		if (Array.isArray(v)) return v.map(walk);
		if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, y]) => [k, walk(y)]));
		return v;
	};
	return walk(value);
}
const MAX_REFERENCED_FILES = 64;
const MAX_REFERENCED_BYTES = 64 * 1024 * 1024;
function stringsIn(v, out = []) {
	if (typeof v === "string") out.push(v);
	else if (Array.isArray(v)) for (const x of v) stringsIn(x, out);
	else if (v && typeof v === "object") for (const x of Object.values(v)) stringsIn(x, out);
	return out;
}
/** Canonical JSON (object keys sorted, recursively): the form every grant digest hashes. */
function canonicalOf(v) {
	if (Array.isArray(v)) return `[${v.map(canonicalOf).join(",")}]`;
	if (v && typeof v === "object") {
		const o = v;
		return `{${Object.keys(o).toSorted().map((k) => `${JSON.stringify(k)}:${canonicalOf(o[k])}`).join(",")}}`;
	}
	return JSON.stringify(v ?? null);
}
/**
* Files a hook command names inside `base`, with their
* digests: editing the script a hook runs needs a new grant too.
*/
function referencedFilesIn(value, base, projectVar) {
	const root = realpathNearestSync(path.resolve(base));
	const seen = /* @__PURE__ */ new Map();
	for (const s of stringsIn(value)) for (const raw of s.split(/[\s;|&()<>`'"=]+/)) {
		if (!raw) continue;
		let word = raw;
		for (const v of projectVar) word = word.replace(new RegExp(`^\\$\\{?${v}\\}?(?=/|$)`), root);
		const abs = realpathNearestSync(path.resolve(root, word));
		if (abs === root || seen.has(abs) || !isInside(root, abs)) continue;
		let st;
		try {
			st = fs.statSync(abs);
		} catch {
			continue;
		}
		if (!st.isFile()) continue;
		if (seen.size >= MAX_REFERENCED_FILES) throw new Error(`the hook names more than ${MAX_REFERENCED_FILES} files; it cannot be granted`);
		if (st.size > MAX_REFERENCED_BYTES) throw new Error(`${abs} is larger than ${MAX_REFERENCED_BYTES} bytes; a hook that runs it cannot be granted`);
		seen.set(abs, createHash("sha256").update(fs.readFileSync(abs)).digest("hex"));
	}
	return [...seen.entries()].map(([abs, sha256]) => ({
		path: path.relative(root, abs),
		sha256
	})).toSorted((a, b) => a.path.localeCompare(b.path));
}
/**
* The grant digest of one hook: its scope, its file (relative to the project
* for repository hooks), its event and matcher, its whole value, and the
* content of every file it names.
*/
function hookDigest(h, o) {
	const repo = h.scope === "project" || h.scope === "local";
	const base = repo ? o.projectDir : path.isAbsolute(h.file) ? path.dirname(h.file) : o.projectDir;
	const root = realpathNearestSync(path.resolve(o.projectDir));
	const file = repo && path.isAbsolute(h.file) ? path.relative(root, realpathNearestSync(h.file)) : h.file;
	const value = h.expand ? expandHookWords(h.value ?? null, h.expand) : h.value ?? null;
	const doc = {
		v: 1,
		kind: "hook",
		scope: h.scope,
		file,
		event: h.event,
		matcher: h.matcher ?? null,
		value,
		files: [...referencedFilesIn(value, base, [...o.projectVars ?? [], "ENCLAWED_PROJECT_DIR"]), ...Object.entries(h.expand?.vars ?? {}).filter((e) => typeof e[1] === "string" && e[1] !== "").toSorted((a, b) => a[0] < b[0] ? -1 : 1).flatMap(([name, dir]) => referencedFilesIn(value, dir, []).map((f) => ({
			...f,
			path: `$${name}/${f.path}`
		})))]
	};
	return createHash("sha256").update(canonicalOf(doc)).digest("hex");
}
/**
* Hook admission for a launch: every hook from any scope but the
* administrator's managed settings must be granted by digest (repository
* hooks by a grant for this repository). Any refusal: the launch must not
* start. Enclawed's own hook is never in `hooks` (the adapter adds it after
* this decision, in a file of its own session).
*/
function decideHooks(hooks, grants, o) {
	const repo = realpathNearestSync(path.resolve(o.projectDir));
	const refusals = [];
	for (const h of hooks) {
		if (h.scope === "managed") continue;
		let digest;
		try {
			digest = hookDigest(h, o);
		} catch (err) {
			refusals.push({
				scope: h.scope,
				file: h.file,
				event: h.event,
				digest: null,
				why: err.message,
				grant: null
			});
			continue;
		}
		const repoScoped = h.scope === "project" || h.scope === "local";
		const grant = repoScoped ? {
			repo,
			digest
		} : {
			scope: h.scope,
			digest
		};
		if (!grants.some((g) => g.digest === digest && (repoScoped ? g.repo === repo : g.repo === void 0 && (g.scope === void 0 || g.scope === h.scope)))) refusals.push({
			scope: h.scope,
			file: h.file,
			event: h.event,
			digest,
			why: `a ${h.scope} hook for ${h.event} would run outside Enclawed's checks`,
			grant
		});
	}
	return {
		ok: refusals.length === 0,
		refusals
	};
}
/**
* Grants that match no hook present now (their hook changed, its digest
* rule changed, or it is gone): an administrator removes them, and adds the
* grant decideHooks names for the hook as it is now. `hooks` is every hook
* the host would run from any scope, as for decideHooks; grants for another
* repository are left out.
*/
function staleHookGrants(hooks, grants, o) {
	const live = /* @__PURE__ */ new Set();
	for (const h of hooks) try {
		live.add(hookDigest(h, o));
	} catch {}
	const repo = realpathNearestSync(path.resolve(o.projectDir));
	return grants.filter((g) => (g.repo === void 0 || g.repo === repo) && !live.has(g.digest));
}
/** The refusals in plain words, with the grant to add for each. */
function hooksMessage(refusals) {
	return ["Not starting: hooks that would run outside Enclawed's checks are not granted.", ...refusals.map((r) => `  - ${r.scope} hook for ${r.event} in ${r.file}: ${r.why}${r.grant ? `. Review it; to start anyway, an administrator grants exactly this hook: ${JSON.stringify(r.grant)} (a changed hook needs a new grant)` : ""}`)].join("\n");
}
//#endregion
//#region src/enclawed/adapter/secret-content.ts
/** Provider key formats: a fixed prefix and a minimum length of key alphabet after it. */
const PROVIDER_TOKENS = [
	{
		id: "stripe-key",
		re: /\b[rsp]k_(?:live|test)_[A-Za-z0-9]{16,}/g
	},
	{
		id: "openai-or-anthropic-key",
		re: /\bsk-(?:proj-|ant-(?:api|admin)\d{2}-|live-|svcacct-)?[A-Za-z0-9_-]{32,}/g
	},
	{
		id: "slack-token",
		re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g
	},
	{
		id: "github-token",
		re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g
	},
	{
		id: "gitlab-token",
		re: /\bglpat-[A-Za-z0-9_-]{20,}/g
	},
	{
		id: "npm-token",
		re: /\bnpm_[A-Za-z0-9]{36}\b/g
	},
	{
		id: "pypi-token",
		re: /\bpypi-[A-Za-z0-9_-]{50,}/g
	},
	{
		id: "huggingface-token",
		re: /\bhf_[A-Za-z0-9]{30,}/g
	},
	{
		id: "google-api-key",
		re: /\bAIza[0-9A-Za-z_-]{35}/g
	},
	{
		id: "google-oauth-token",
		re: /\bya29\.[0-9A-Za-z_-]{20,}/g
	},
	{
		id: "jwt",
		re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
	},
	{
		id: "digitalocean-token",
		re: /\bdo[opr]_v1_[a-f0-9]{64}\b/g
	},
	{
		id: "sendgrid-key",
		re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g
	},
	{
		id: "shopify-token",
		re: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/g
	}
];
/** Every provider key format in a text. */
function providerTokenFindings(text) {
	const out = [];
	for (const { id, re } of PROVIDER_TOKENS) for (const m of text.matchAll(re)) out.push({
		id,
		match: m[0]
	});
	return out;
}
const SECRET_NAME = /(^|[._-])(tokens?|secrets?|credentials?|creds|passw(or)?d|pass|apikey|api[-_]?keys?|auth|bearer|pat|private[-_]?key)([._-]|$)/i;
const TOKEN_VALUE = /^[A-Za-z0-9._~+/=:-]{12,512}$/;
const PRIVATE_KEY_BLOCK = /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/;
/** Largest file read whole for this check. */
const MAX_BYTES = 64 * 1024;
/** A token-shaped value: key alphabet only, both letters and digits. */
function tokenShaped(v) {
	return TOKEN_VALUE.test(v) && /[A-Za-z]/.test(v) && /\d/.test(v);
}
/** Is the text, as a file named `name`, a secret? Returns what kind, or null. */
function secretInText(text, name, dlp) {
	const formats = [...dlp(text), ...providerTokenFindings(text)].map((f) => f.id);
	if (formats.length) return `a credential (${[...new Set(formats)].toSorted().join(", ")})`;
	if (PRIVATE_KEY_BLOCK.test(text)) return "a private key";
	if (!SECRET_NAME.test(name)) return null;
	const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	if (lines.length === 0 || lines.length > 3) return null;
	return lines.map((l) => {
		const m = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*[=:]\s*["']?(.*?)["']?$/.exec(l);
		return m ? m[1] : l;
	}).every(tokenShaped) ? "a token (by its file name and content)" : null;
}
/**
* The secret a regular file holds, read whole, or null (not a regular file,
* empty, larger than the bound, unreadable). `dlp`: the framework's
* credential formats (credentials.ts credentialFindings).
*/
function secretContentOf(file, dlp) {
	let text;
	try {
		const st = fs.statSync(file);
		if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) return null;
		text = fs.readFileSync(file, "latin1");
	} catch {
		return null;
	}
	return secretInText(text, path.basename(file), dlp);
}
const SECRET_ASSIGNMENT_PLACEHOLDER = "[secret value removed by Enclawed]";
const ASSIGNMENT = /(^|[\s{,;(])(["']?)([A-Za-z_][A-Za-z0-9_.-]{1,64})\2(\s*(?:=>|=|:)\s*)(["']?)([A-Za-z0-9._~+/=:-]{12,512})\5/gm;
/**
* Every credential-shaped assignment's value in a text replaced, whatever
* file or program printed it (`aws_secret_access_key = ...` read through a
* link, a token in a config dump): content, not path, decides.
*/
function redactSecretAssignments(text) {
	let removed = 0;
	return {
		text: text.replace(ASSIGNMENT, (all, lead, q, name, sep, vq, value) => {
			if (!credentialLike(name) || !tokenShaped(value)) return all;
			removed++;
			return `${lead}${q}${name}${q}${sep}${vq}${SECRET_ASSIGNMENT_PLACEHOLDER}${vq}`;
		}),
		removed
	};
}
//#endregion
//#region src/enclawed/audit-redact.ts
const AUDIT_SECRET_PLACEHOLDER = "[secret removed by Enclawed]";
const EXTRA_FORMATS = [
	/\b(?:AKIA|ASIA)[0-9A-Z]{16,}\b/g,
	/AccountKey=[A-Za-z0-9+/=]{40,}/g,
	/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g
];
/** `s` with every secret value replaced; the same string when it holds none. */
function redactAuditString(s) {
	if (s.length < 8) return s;
	let out = s;
	for (const { re } of PROVIDER_TOKENS) out = out.replace(re, AUDIT_SECRET_PLACEHOLDER);
	for (const re of EXTRA_FORMATS) out = out.replace(re, AUDIT_SECRET_PLACEHOLDER);
	return redactSecretAssignments(out).text;
}
//#endregion
export { gitProgramsOf as $, NOTICE_QUOTE as A, gitTrackingOf as B, scrubLoaderEnv as C, showPath as D, sanitizeText as E, withheldResult as F, pathWords as G, isInsideExact as H, comparablePath as I, systemBinaryUids as J, protectedInodeIndex as K, execConfigInodeMatch as L, cleanText as M, codePointLength as N, textOf as O, neutralizeNotices as P, gitCommandStarts as Q, expandHome as R, repositoryEnvMessage as S, quoteUntrusted as T, isProtectedPath as U, isInside as V, nodeFsProbe as W, untrustedBinaryReason as X, trustedBinary as Y, writeProtectedInodeIndex as Z, hookDigest as _, redactSecretAssignments as a, recordableEnvValue as b, LOADER_INJECTION_ENV as c, changesShellCommands as d, classifyEnv as f, expandHookWords as g, decideRepositoryEnv as h, providerTokenFindings as i, WITHHELD_MARKER as j, COVERED as k, REFUSED_ENV_CLASSES as l, decideHooks as m, redactAuditString as n, secretContentOf as o, credentialLike as p, realpathNearestSync as q, SECRET_ASSIGNMENT_PLACEHOLDER as r, KNOWN_HOST_ENV as s, AUDIT_SECRET_PLACEHOLDER as t, canonicalOf as u, hooksMessage as v, staleHookGrants as w, referencedFilesIn as x, hostEnvExtra as y, gitConfigRiskOf as z };
