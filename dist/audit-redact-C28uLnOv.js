import { n as inNonInitialUserNamespace } from "./userns-Om3FzFOv.js";
import { i as textOf } from "./untrusted-CVKPzaNH.js";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
//#region src/enclawed/adapter/git-programs.ts
const BOOLEAN = /^(true|false|yes|no|on|off|1|0)?$/i;
/** A pager value that runs nothing of its own: no pager, or `cat`. */
const INERT_PAGER = /^(?:|cat)$/;
/**
* Keys no read-only command acts on as a program (as `section.key`, or
* `section.*.key` with a subsection): data git reads, or settings only
* commands outside the read-only list consult (commit, merge, rebase, push,
* fetch and the network: credential helpers, ssh, http). Not here, so
* counted for every command: extensions.partialClone and remote.*.promisor
* (a missing object is fetched lazily, over the network, by any read),
* core.worktree (the work tree is elsewhere), core.fsmonitor = true (git
* starts its daemon), trace2.* (git writes its trace to a file or socket),
* and every key Enclawed does not know.
*/
const READ_INERT = new RegExp("^(?:" + [
	"core\\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks|autocrlf|safecrlf|eol|quotepath|abbrev|compression|loosecompression|editor|excludesfile|attributesfile|whitespace|untrackedcache|checkstat|trustctime|preloadindex|commitgraph|multipackindex|splitindex|sparsecheckout|sparsecheckoutcone|longpaths|fscache|packedgitwindowsize|packedgitlimit|deltabasecachesize|bigfilethreshold|warnambiguousrefs|sharedrepository|protecthfs|protectntfs|checkroundtripencoding|fsync|fsyncmethod|fsyncobjectfiles|askpass|sshcommand|gitproxy|commentchar|commentstring|notesref|hookspath|pager)",
	"core\\.fsmonitor=(?:false|no|off|0|)",
	"(?:user|author|committer|init|color|advice|i18n|credential|pull|push|rebase|merge|mergetool|difftool|status|log|format|pretty|blame|grep|fetch|help|commit|tag|index|feature|pack|protocol|http|url|sendemail|am|apply|rerere|transfer|receive|uploadpack|lfs|alias|column|interactive|add|checkout|clone|reset|stash|worktree|notes|mailmap|versionsort|sequence|trailer|gc|maintenance|bundle|submodule|branch|remote|ssh)\\.(?!\\*\\.)[^=]+",
	"extensions\\.(?:objectformat|compatobjectformat|worktreeconfig|refstorage|noop|preciousobjects)",
	"safe\\.(?:directory|barerepository)",
	"remote\\.\\*\\.(?:url|pushurl|fetch|push|tagopt|mirror|prune|prunetags|skipdefaultupdate|skipfetchall|followremotehead|receivepack|uploadpack|proxy|proxyauthmethod)",
	"branch\\.\\*\\.(?:remote|merge|rebase|pushremote|description)",
	"submodule\\.\\*\\.(?:url|active|branch|ignore|shallow|fetchrecursesubmodules)",
	"(?:credential|http|url|color|pretty|mergetool|difftool|merge|lfs|trailer|alias|sendemail)\\.\\*\\.[^=]+",
	"diff\\.(?:tool|guitool|renames|renamelimit|algorithm|mnemonicprefix|noprefix|srcprefix|dstprefix|colormoved|colormovedws|context|interhunkcontext|indentheuristic|relative|statgraphwidth|statnamewidth|submodule|ignoresubmodules|wserrorhighlight|dirstat|suppressblankempty|orderfile|autorefreshindex|trustexitcode|statcount|colormovedws)",
	"diff\\.\\*\\.(?:xfuncname|funcname|binary|wordregex|cachetextconv)",
	"filter\\.\\*\\.required",
	"gpg\\.(?:format|mintrustlevel)",
	"gpg\\.\\*\\.(?:allowedsignersfile|revocationfile)"
].join("|") + ")$");
/** Is this key (with its value) one no read-only command acts on? */
function readInert(section, sub, key, value) {
	const name = sub === null ? `${section}.${key}` : `${section}.*.${key}`;
	if (section === "core" && key === "fsmonitor") return READ_INERT.test(`${name}=${value.toLowerCase()}`);
	if (section === "extensions" && key === "partialclone") return false;
	if (section === "remote" && sub !== null && (key === "promisor" || key === "partialclonefilter")) return false;
	return READ_INERT.test(name);
}
/** The kind a config entry counts as for read-only commands, or null (inert). */
function entryKind(section, sub, key, value) {
	return kindOf(section, sub, key, value) ?? (readInert(section, sub, key, value) ? null : "config");
}
/**
* Hooks only commands outside the read-only list run (commit, merge, rebase,
* checkout, switch, push, am, gc, send-email, p4). Any other name, known
* (post-index-change, reference-transaction, fsmonitor-watchman) or not,
* counts for every read-only command.
*/
const WRITE_ONLY_HOOKS = new Set([
	"applypatch-msg",
	"pre-applypatch",
	"post-applypatch",
	"pre-commit",
	"pre-merge-commit",
	"prepare-commit-msg",
	"commit-msg",
	"post-commit",
	"pre-rebase",
	"post-checkout",
	"post-merge",
	"pre-push",
	"pre-receive",
	"update",
	"proc-receive",
	"post-receive",
	"post-update",
	"push-to-checkout",
	"pre-auto-gc",
	"post-rewrite",
	"sendemail-validate",
	"p4-changelist",
	"p4-prepare-changelist",
	"p4-post-changelist",
	"p4-pre-submit"
]);
/** GIT_* variables of the session that change nothing a read-only command runs or reads. */
const READ_SAFE_GIT_ENV = new Set([
	"GIT_TERMINAL_PROMPT",
	"GIT_EDITOR",
	"GIT_SEQUENCE_EDITOR",
	"GIT_MERGE_AUTOEDIT",
	"GIT_OPTIONAL_LOCKS",
	"GIT_CONFIG_NOSYSTEM",
	"GIT_CONFIG_GLOBAL",
	"GIT_CONFIG_SYSTEM",
	"GIT_AUTHOR_NAME",
	"GIT_AUTHOR_EMAIL",
	"GIT_AUTHOR_DATE",
	"GIT_COMMITTER_NAME",
	"GIT_COMMITTER_EMAIL",
	"GIT_COMMITTER_DATE",
	"GIT_ASKPASS",
	"GIT_SSH",
	"GIT_SSH_COMMAND",
	"GIT_SSH_VARIANT",
	"GIT_NO_LAZY_FETCH",
	"GIT_ADVICE",
	"GIT_FLUSH",
	"GIT_CEILING_DIRECTORIES"
]);
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
	if (section === "hook") return "hook";
	if (section === "core") {
		if (key === "fsmonitor") return BOOLEAN.test(value) ? null : "fsmonitor";
		if (key === "pager") return INERT_PAGER.test(value) ? null : "pager";
		return null;
	}
	if (section === "pager") return BOOLEAN.test(value) || INERT_PAGER.test(value) ? null : "pager";
	if ((section === "pretty" || section === "format" && key === "pretty") && /%G/.test(value)) return "gpg";
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
* The entries of one config file, and its lines git could read in a way this
* parser does not (a continued line, a line that is not a key: risks).
* null: the file exists but could not be read. A missing file has none.
*/
function configFile(f) {
	let text;
	try {
		text = fs.readFileSync(f, "utf8");
	} catch (err) {
		const code = err.code;
		return code === "ENOENT" || code === "ENOTDIR" ? {
			entries: [],
			risks: []
		} : null;
	}
	const entries = [];
	const risks = [];
	let section = "";
	let sub = null;
	for (const raw of text.split(/\r?\n/)) {
		if (/\\\s*$/.test(raw.replace(/\s[#;].*$/, ""))) {
			risks.push(`${f}: ${raw.trim()}`);
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
			risks.push(`${f}: ${l}`);
			continue;
		}
		const value = (kv[2] ?? "").replace(/\s[#;].*$/, "").replace(/^"(.*)"$/, "$1").trim();
		entries.push({
			section,
			sub,
			key: kv[1].toLowerCase(),
			value,
			line: `${f}: ${l}`
		});
	}
	return {
		entries,
		risks
	};
}
/** A listed key (section[.sub].key, as git prints it) split; the subsection keeps its case. */
function splitKey(full) {
	const first = full.indexOf(".");
	const last = full.lastIndexOf(".");
	if (first < 0) return {
		section: full.toLowerCase(),
		sub: null,
		key: ""
	};
	return {
		section: full.slice(0, first).toLowerCase(),
		sub: last > first ? full.slice(first + 1, last) : null,
		key: full.slice(last + 1).toLowerCase()
	};
}
/** git's boolean environment variables (git_env_bool): a true value. */
function envTrue(v) {
	return v !== void 0 && /^(?:1|true|yes|on)$/i.test(v.trim());
}
/**
* The global and system configuration files git reads with `env` (git v2.53:
* GIT_CONFIG_SYSTEM or /etc/gitconfig unless GIT_CONFIG_NOSYSTEM;
* GIT_CONFIG_GLOBAL, or $XDG_CONFIG_HOME/git/config and ~/.gitconfig), read
* here without following an include (an include counts as a risk).
*/
function outerFromFiles(env) {
	const files = [];
	if (!envTrue(env.GIT_CONFIG_NOSYSTEM)) files.push({
		scope: "system",
		file: env.GIT_CONFIG_SYSTEM ?? (process.platform === "win32" ? "" : "/etc/gitconfig")
	});
	if (env.GIT_CONFIG_GLOBAL !== void 0) files.push({
		scope: "global",
		file: env.GIT_CONFIG_GLOBAL
	});
	else {
		const xdg = env.XDG_CONFIG_HOME || (env.HOME ? path.join(env.HOME, ".config") : "");
		if (xdg) files.push({
			scope: "global",
			file: path.join(xdg, "git", "config")
		});
		if (env.HOME) files.push({
			scope: "global",
			file: path.join(env.HOME, ".gitconfig")
		});
	}
	const out = [];
	for (const { scope, file } of files) {
		if (file === "" || file === "/dev/null") continue;
		const r = configFile(path.resolve(file));
		if (!r) return null;
		if (r.risks.length) out.push({
			scope,
			key: "include.path",
			value: r.risks[0]
		});
		for (const e of r.entries) out.push({
			scope,
			key: e.sub === null ? `${e.section}.${e.key}` : `${e.section}.${e.sub}.${e.key}`,
			value: e.value
		});
	}
	return out;
}
/**
* The programs git can start for a read-only command run in `cwd`, with the
* session's environment (opts.env): the session's GIT_* variables and pager,
* the global and system configuration git reads with it, the repository's
* own configuration files, its hooks (core.hooksPath from any scope, else
* the git and common directories' hooks), the same in each submodule. null:
* something could not be read (callers treat that as a risk).
*/
function gitProgramsOf(cwd, opts = {}) {
	const env = opts.env ?? process.env;
	const out = [];
	for (const name of Object.keys(env).toSorted()) {
		const value = env[name];
		if (value === void 0) continue;
		if (name === "GIT_PAGER" || name === "PAGER") {
			if (!INERT_PAGER.test(value.trim()) && !(name === "PAGER" && /^(?:less|more)$/.test(value.trim()))) out.push({
				kind: "pager",
				line: `the session's environment sets ${name}=${value}`
			});
		} else if (name.startsWith("GIT_") && !READ_SAFE_GIT_ENV.has(name) && !name.startsWith("GIT_PS1_")) out.push({
			kind: "config",
			line: `the session's environment sets ${name}`
		});
	}
	let dir = path.resolve(cwd);
	let gitDir = null;
	for (;;) {
		gitDir = gitDirOf$1(dir);
		if (gitDir) break;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	const listed = opts.outer ? opts.outer(gitDir, env) : null;
	const outer = opts.outer ? listed : outerFromFiles(env);
	if (!outer) return null;
	let outerHooksPath = null;
	for (const e of outer) {
		if (![
			"system",
			"global",
			"command"
		].includes(e.scope)) continue;
		const { section, sub, key } = splitKey(e.key);
		if (opts.outer && (section === "include" || section === "includeif") && key === "path") continue;
		const value = (e.value ?? "").trim();
		if (section === "core" && key === "hookspath") outerHooksPath = value;
		const kind = entryKind(section, sub, key, value);
		if (kind) out.push({
			kind,
			line: `${e.scope} config: ${e.key}=${value}`
		});
	}
	if (!gitDir) return out;
	const own = programsIn(gitDir, {
		top: gitDir === dir ? null : dir,
		cwd: path.resolve(cwd),
		outerHooksPath,
		home: env.HOME ?? null,
		isModule: false
	});
	return own === null ? null : [...out, ...own];
}
/** The hooks in these directories a read-only command may run (see WRITE_ONLY_HOOKS). */
function hooksIn(dirs, out) {
	for (const d of new Set(dirs)) {
		let names;
		try {
			names = fs.readdirSync(d);
		} catch (err) {
			const code = err.code;
			if (code !== "ENOENT" && code !== "ENOTDIR") out.push({
				kind: "hook",
				line: `${d}: a hooks directory Enclawed could not read`
			});
			continue;
		}
		for (const n of names.toSorted()) if (!n.endsWith(".sample") && !WRITE_ONLY_HOOKS.has(n.toLowerCase())) out.push({
			kind: "hook",
			line: `${path.join(d, n)} (a hook git may run for a read-only command)`
		});
	}
}
function programsIn(gitDir, where) {
	const files = [path.join(gitDir, "config"), path.join(gitDir, "config.worktree")];
	let commonDir = gitDir;
	try {
		const common = fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
		commonDir = path.resolve(gitDir, common);
		files.push(path.join(commonDir, "config"));
	} catch {}
	const out = [];
	let hooksPath = null;
	let worktree = null;
	for (const f of files) {
		const r = configFile(f);
		if (!r) return null;
		for (const line of r.risks) out.push({
			kind: "include",
			line
		});
		for (const e of r.entries) {
			if (e.section === "core" && e.key === "hookspath") hooksPath = e.value;
			if (e.section === "core" && e.key === "worktree") {
				worktree = e.value;
				if (where.isModule) continue;
			}
			const kind = entryKind(e.section, e.sub, e.key, e.value);
			if (kind) out.push({
				kind,
				line: e.line
			});
		}
	}
	const hp = hooksPath ?? where.outerHooksPath;
	if (hp !== null && hp !== "") if (hp.startsWith("%(prefix)")) out.push({
		kind: "hook",
		line: `core.hooksPath ${hp}: a place Enclawed does not resolve`
	});
	else {
		const expanded = hp === "~" || hp.startsWith("~/") ? where.home ? path.join(where.home, hp.slice(1)) : null : hp.startsWith("~") ? null : hp;
		if (expanded === null) out.push({
			kind: "hook",
			line: `core.hooksPath ${hp}: a place Enclawed does not resolve`
		});
		else hooksIn([
			where.top,
			worktree === null ? null : path.resolve(gitDir, worktree),
			gitDir,
			path.dirname(gitDir),
			where.cwd
		].filter((b) => b !== null).map((b) => path.resolve(b, expanded)), out);
	}
	else hooksIn([path.join(gitDir, "hooks"), path.join(commonDir, "hooks")], out);
	if (!where.isModule) {
		const found = submoduleGitDirs(gitDir, worktree !== null ? path.resolve(gitDir, worktree) : where.top);
		if (typeof found === "string") out.push({
			kind: "include",
			line: `${gitDir}: ${found}`
		});
		for (const m of typeof found === "string" ? [] : found) {
			const inner = programsIn(m, {
				top: null,
				cwd: m,
				outerHooksPath: where.outerHooksPath,
				home: where.home,
				isModule: true
			});
			if (inner === null) return null;
			for (const p of inner) out.push({
				kind: "include",
				line: `submodule ${m}: ${p.line}`
			});
		}
	}
	return out;
}
const MAX_SUBMODULES = 512;
const MAX_SUBMODULE_DEPTH = 8;
/**
* Every git directory git may run in for a command of the repository at
* `gitDir` (work tree `top`, null: none): its absorbed submodules
* (.git/modules/**) and, recursively, each submodule of a work tree as git
* finds it. A reason string: a submodule whose git directory Enclawed cannot
* resolve as git does, or more than it reads (callers count that as a risk).
*/
function submoduleGitDirs(gitDir, top) {
	const seen = /* @__PURE__ */ new Set();
	const walked = /* @__PURE__ */ new Set();
	const out = [];
	const add = (d) => {
		let key = d;
		try {
			key = fs.realpathSync(d);
		} catch {}
		if (!seen.has(key)) {
			seen.add(key);
			out.push(d);
		}
		return out.length > MAX_SUBMODULES ? "more submodules than Enclawed reads" : null;
	};
	const walk = (g, t, depth) => {
		if (depth > MAX_SUBMODULE_DEPTH) return "submodules nested deeper than Enclawed reads";
		const absorbed = moduleDirsOf(g);
		if (!absorbed) return "more submodules than Enclawed reads";
		for (const m of absorbed) {
			const why = add(m);
			if (why) return why;
		}
		if (t === null) return null;
		const paths = workTreeSubmodulePaths(g, t);
		if (typeof paths === "string") return paths;
		for (const rel of paths) {
			const abs = path.resolve(t, rel);
			if (abs !== t && !abs.startsWith(t + path.sep)) return `the submodule path ${rel} leads outside the work tree`;
			const dotgit = path.join(abs, ".git");
			let st;
			try {
				st = fs.lstatSync(dotgit);
			} catch (err) {
				const code = err.code;
				if (code === "ENOENT" || code === "ENOTDIR") continue;
				return `the submodule ${rel} could not be read`;
			}
			let sub;
			if (st.isDirectory()) sub = dotgit;
			else if (st.isFile()) {
				let text;
				try {
					text = fs.readFileSync(dotgit, "utf8");
				} catch {
					return `the submodule ${rel}'s .git file could not be read`;
				}
				const m = /^gitdir:\s*(.+?)\s*$/m.exec(text);
				if (!m) return `the submodule ${rel}'s .git file names no git directory`;
				sub = path.resolve(abs, m[1]);
			} else return `the submodule ${rel}'s .git is neither a directory nor a file`;
			const why = add(sub);
			if (why) return why;
			if (!walked.has(abs)) {
				walked.add(abs);
				const inner = walk(sub, abs, depth + 1);
				if (inner) return inner;
			}
		}
		return null;
	};
	return walk(gitDir, top, 0) ?? out;
}
/** The submodule paths of a work tree: .gitmodules' `path` values and the index's gitlinks; a reason string when they cannot be read. */
function workTreeSubmodulePaths(gitDir, top) {
	const out = /* @__PURE__ */ new Set();
	try {
		const text = fs.readFileSync(path.join(top, ".gitmodules"), "utf8");
		for (const m of text.matchAll(/^\s*path\s*=\s*(.*?)\s*$/gim)) out.add(m[1].replace(/^"(.*)"$/, "$1"));
	} catch (err) {
		const code = err.code;
		if (code !== "ENOENT" && code !== "ENOTDIR") return ".gitmodules could not be read";
	}
	const links = indexGitlinks(gitDir);
	if (typeof links === "string") return links;
	for (const l of links) out.add(l);
	return [...out].toSorted();
}
/** The repository's object id length in bytes: 32 with extensions.objectFormat = sha256, else 20. */
function objectIdBytes(gitDir) {
	for (const f of [path.join(gitDir, "config"), path.join(gitDir, "commondir")]) {
		let file = f;
		if (f.endsWith("commondir")) try {
			file = path.join(path.resolve(gitDir, fs.readFileSync(f, "utf8").trim()), "config");
		} catch {
			continue;
		}
		const e = configFile(file)?.entries.find((x) => x.section === "extensions" && x.key === "objectformat");
		if (e) return e.value.toLowerCase() === "sha256" ? 32 : 20;
	}
	return 20;
}
/**
* The gitlink paths (submodules, mode 160000) of the repository's index
* (index versions 2, 3, 4). A reason string: an index Enclawed does not read
* whole (a split index, a sparse directory entry, an unknown version, a
* malformed entry). No index: none.
*/
function indexGitlinks(gitDir) {
	let buf;
	try {
		buf = fs.readFileSync(path.join(gitDir, "index"));
	} catch (err) {
		const code = err.code;
		return code === "ENOENT" || code === "ENOTDIR" ? [] : "the index could not be read";
	}
	try {
		if (fs.readdirSync(gitDir).some((n) => n.startsWith("sharedindex."))) return "a split index, which Enclawed does not read";
	} catch {
		return "the git directory could not be read";
	}
	const bad = "an index Enclawed does not read";
	if (buf.length < 12 || buf.toString("latin1", 0, 4) !== "DIRC") return bad;
	const version = buf.readUInt32BE(4);
	const count = buf.readUInt32BE(8);
	if (version < 2 || version > 4) return bad;
	const idLen = objectIdBytes(gitDir);
	const out = [];
	let at = 12;
	let prev = "";
	for (let i = 0; i < count; i++) {
		const start = at;
		const fixed = 40 + idLen + 2;
		if (at + fixed > buf.length) return bad;
		const mode = buf.readUInt32BE(at + 24);
		const flags = buf.readUInt16BE(at + 40 + idLen);
		at += fixed;
		if (flags & 16384) {
			if (version < 3 || at + 2 > buf.length) return bad;
			at += 2;
		}
		let name;
		if (version === 4) {
			let c = buf[at++];
			let strip = c & 127;
			while (c & 128) {
				if (at >= buf.length) return bad;
				c = buf[at++];
				strip = strip + 1 << 7 | c & 127;
			}
			const end = buf.indexOf(0, at);
			if (end < 0 || strip > Buffer.byteLength(prev)) return bad;
			const base = Buffer.from(prev);
			name = Buffer.concat([base.subarray(0, base.length - strip), buf.subarray(at, end)]).toString("utf8");
			at = end + 1;
		} else {
			const end = buf.indexOf(0, at);
			if (end < 0) return bad;
			name = buf.toString("utf8", at, end);
			at = start + (end - start + 8 & -8);
		}
		prev = name;
		const type = mode >>> 12 & 15;
		if (type === 4) return "a sparse index (a directory entry may hold submodules)";
		if (type === 14) out.push(name);
	}
	return out;
}
/** The git directories of a repository's submodules (.git/modules/**), bounded; null past the bound. */
function moduleDirsOf(gitDir) {
	const out = [];
	const stack = [[path.join(gitDir, "modules"), 0]];
	let budget = 2e4;
	while (stack.length) {
		const [d, depth] = stack.pop();
		if (budget-- <= 0 || depth > 32) return null;
		let entries;
		try {
			entries = fs.readdirSync(d, { withFileTypes: true });
		} catch {
			continue;
		}
		if (entries.some((e) => e.name === "HEAD") && entries.some((e) => e.name === "config")) out.push(d);
		const inObjects = path.basename(d) === "objects";
		for (const e of entries) {
			if (inObjects && (/^[0-9a-f]{2}$/i.test(e.name) || e.name === "pack" || e.name === "info")) continue;
			if (e.isDirectory()) stack.push([path.join(d, e.name), depth + 1]);
		}
	}
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
		case "include":
		case "config": return p;
		case "hook": return p;
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
		case "gpg":
			if ([
				"log",
				"show",
				"whatchanged",
				"shortlog",
				"rev-list"
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
const WINDOWS_SEMANTICS_FS = new Set([
	16914839,
	1397114950,
	4283649346,
	4266872130,
	20859,
	19780,
	538032816,
	1397118030,
	1936094318,
	1702057286
]);
/**
* Is `p` (or its nearest existing ancestor) on a file system with Windows
* name semantics? Always on Windows; on Linux by the mount's type; a type
* that cannot be read counts as no.
*/
function windowsSemanticsFs(p, platform = process.platform, typeOf = (q) => fs.statfsSync(q).type) {
	if (platform === "win32") return true;
	if (platform !== "linux") return false;
	for (let probe = p;; probe = path.dirname(probe)) try {
		return WINDOWS_SEMANTICS_FS.has(Number(BigInt.asUintN(32, BigInt(typeOf(probe)))));
	} catch {
		if (path.dirname(probe) === probe) return false;
	}
}
/**
* The real path of `abs`'s longest existing prefix, with the rest appended.
* On Windows the prefix is the final path the file system reports (its 8.3
* short names expanded to long names), and on Windows or on a Windows file
* system mounted elsewhere (windowsSemanticsFs) each appended component
* loses its trailing dots and spaces, as Windows drops them when it creates
* the file (`.mcp.json.` creates `.mcp.json`). A component that still cannot be named
* (an alternate data stream, `name:stream`) is kept as given, which the
* exec-config rules refuse (rule-decisions.ts, execConfigParts).
*/
function realpathNearestSync(abs, platform = process.platform === "win32" ? "win32" : "posix") {
	const resolve = platform === "win32" ? fs.realpathSync.native : fs.realpathSync;
	let probe = abs;
	const rest = [];
	for (;;) try {
		const real = resolve(probe);
		const win = rest.length > 0 && (platform === "win32" || windowsSemanticsFs(real));
		const tail = rest.toReversed().map((c) => win ? c.replace(/[. ]+$/, "") || c : c);
		return tail.length ? path.join(real, ...tail) : real;
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
		realpathNearest: (abs) => realpathNearestSync(abs),
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
		gitPrograms: opts.gitPrograms ?? (opts.gitConfigRisk ? void 0 : (cwd, env) => gitProgramsOf(cwd, {
			env: env ?? process.env,
			outer: (gitDir, e) => gitConfigEntriesOf(gitDir ?? "/dev/null", e)
		})),
		committedTree: (dir) => gitCommittedTreeOf(dir),
		gitConfigEntries: (gitDir, env) => gitConfigEntriesOf(gitDir, env)
	};
}
/**
* The configuration git reads for `gitDir`, every scope, includes followed:
* `git --git-dir=DIR config --list --show-scope --includes -z`, run with the
* system git, no GIT_* variable but the three that name the global and system
* files (GIT_CONFIG_GLOBAL, GIT_CONFIG_SYSTEM, GIT_CONFIG_NOSYSTEM), and HOME /
* XDG_CONFIG_HOME from `env` (the
* environment the command being decided runs with). Listing reads files only:
* no program, hook or helper runs. null when git fails.
*/
function gitConfigEntriesOf(gitDir, env, opts = {}) {
	const gitBin = opts.gitBin !== void 0 ? opts.gitBin : process.platform === "win32" ? "git" : trustedBinary("git");
	if (!gitBin) return null;
	const runEnv = { PATH: process.env.PATH ?? "/usr/bin:/bin" };
	for (const k of [
		"HOME",
		"XDG_CONFIG_HOME",
		"USERPROFILE",
		"SystemRoot",
		"GIT_CONFIG_GLOBAL",
		"GIT_CONFIG_SYSTEM",
		"GIT_CONFIG_NOSYSTEM"
	]) if (typeof env[k] === "string") runEnv[k] = env[k];
	const r = spawnSync(gitBin, [
		`--git-dir=${gitDir}`,
		"config",
		"--list",
		"--show-scope",
		"--includes",
		"-z"
	], {
		timeout: 5e3,
		env: runEnv,
		windowsHide: true,
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024
	});
	if (r.status !== 0 || typeof r.stdout !== "string") return null;
	const recs = r.stdout.split("\0");
	const out = [];
	for (let i = 0; i + 1 < recs.length; i += 2) {
		const nl = recs[i + 1].indexOf("\n");
		out.push({
			scope: recs[i],
			key: nl < 0 ? recs[i + 1] : recs[i + 1].slice(0, nl),
			value: nl < 0 ? null : recs[i + 1].slice(nl + 1)
		});
	}
	return out;
}
const MAX_WORDS = 128;
/** The words of a command that may be paths (quotes dropped, option values kept). */
function pathWords(command) {
	return command.replace(/['"]/g, "").split(/[\s;&|<>()`]+/).filter(Boolean).map((w) => w.startsWith("-") ? w.includes("=") ? w.slice(w.indexOf("=") + 1) : "" : w).filter((w) => w !== "").slice(0, MAX_WORDS);
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
		"PERLLIB",
		"PERL5DB",
		"RUBYOPT",
		"LESSOPEN",
		"LESSCLOSE",
		"XDG_RUNTIME_DIR"
	].includes(n);
}
const CODE_LOADING_ENV = {
	NODE_OPTIONS: "node",
	NODE_PATH: "node",
	NODE_REPL_EXTERNAL_MODULE: "node",
	NODE_COMPILE_CACHE: "node",
	PYTHONPATH: "python",
	PYTHONHOME: "python",
	PYTHONUSERBASE: "python",
	PYTHONINSPECT: "python",
	PYTHONPLATLIBDIR: "python",
	PYTHONSTARTUP: "python",
	PERL5OPT: "perl",
	PERL5LIB: "perl",
	PERLLIB: "perl",
	PERL5DB: "perl",
	RUBYOPT: "ruby",
	RUBYLIB: "ruby",
	RUBYGEMS_GEMDEPS: "ruby",
	GEM_PATH: "ruby",
	GEM_HOME: "ruby",
	JAVA_TOOL_OPTIONS: "java",
	_JAVA_OPTIONS: "java",
	JDK_JAVA_OPTIONS: "java",
	CLASSPATH: "java",
	PHPRC: "php",
	PHP_INI_SCAN_DIR: "php",
	TCLLIBPATH: "tcl",
	LD_PRELOAD: "any",
	LD_LIBRARY_PATH: "any",
	LD_AUDIT: "any",
	GCONV_PATH: "any",
	GLIBC_TUNABLES: "any",
	DYLD_INSERT_LIBRARIES: "any",
	DYLD_LIBRARY_PATH: "any",
	BASH_ENV: "any",
	ENV: "any",
	SHELLOPTS: "any",
	BASHOPTS: "any",
	PS4: "any",
	PROMPT_COMMAND: "any",
	EXECIGNORE: "any",
	IFS: "any"
};
/** Families by prefix. */
const CODE_LOADING_PREFIX = [
	[/^BASH_FUNC_/, "any"],
	[/^LD_(?:PRELOAD|AUDIT)/, "any"],
	[/^(?:DOTNET_|CORECLR_|COMPLUS_)/i, "dotnet"],
	[/^BUNDLE_/, "ruby"],
	[/^LUA_(?:INIT|PATH|CPATH)/, "lua"]
];
/**
* The first variable of `environment` (set to anything but empty) that makes
* a program of the given runtimes (null: not known, every runtime) load
* other code, or null.
*/
function codeLoadingEnvOf(environment, runtimes = null) {
	if (!environment) return null;
	for (const k of Object.keys(environment).toSorted()) {
		const r = Object.hasOwn(CODE_LOADING_ENV, k) ? CODE_LOADING_ENV[k] : CODE_LOADING_PREFIX.find(([re]) => re.test(k))?.[1] ?? null;
		if (r && (environment[k] ?? "") !== "" && (r === "any" || !runtimes || runtimes.has(r))) return k;
	}
	return null;
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
export { gitTrackingOf as A, untrustedBinaryReason as B, repositoryEnvMessage as C, execConfigInodeMatch as D, comparablePath as E, pathWords as F, moduleDirsOf as G, writeProtectedInodeIndex as H, protectedInodeIndex as I, realpathNearestSync as L, isInsideExact as M, isProtectedPath as N, expandHome as O, nodeFsProbe as P, systemBinaryUids as R, referencedFilesIn as S, staleHookGrants as T, gitCommandStarts as U, windowsSemanticsFs as V, gitProgramsOf as W, expandHookWords as _, redactSecretAssignments as a, hostEnvExtra as b, LOADER_INJECTION_ENV as c, changesShellCommands as d, classifyEnv as f, decideRepositoryEnv as g, decideHooks as h, providerTokenFindings as i, isInside as j, gitConfigRiskOf as k, REFUSED_ENV_CLASSES as l, credentialLike as m, redactAuditString as n, secretContentOf as o, codeLoadingEnvOf as p, SECRET_ASSIGNMENT_PLACEHOLDER as r, KNOWN_HOST_ENV as s, AUDIT_SECRET_PLACEHOLDER as t, canonicalOf as u, hookDigest as v, scrubLoaderEnv as w, recordableEnvValue as x, hooksMessage as y, trustedBinary as z };
