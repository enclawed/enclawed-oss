import { C as ignoredTopLevel, n as inodeKey, w as isInstallMetadata } from "./name-guard-CTKesQw-.js";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { randomBytes } from "node:crypto";
//#region src/enclawed/containment/toml-lite.ts
/** A number, boolean or date, as its normalized source text. */
var TomlScalar = class {
	constructor(raw) {
		this.raw = raw;
	}
};
var Reader = class {
	constructor(s) {
		this.s = s;
		this.i = 0;
	}
	peek(n = 0) {
		return this.s[this.i + n] ?? "";
	}
	startsWith(t) {
		return this.s.startsWith(t, this.i);
	}
	fail(msg) {
		const line = this.s.slice(0, this.i).split("\n").length;
		throw new Error(`toml: ${msg} at line ${line}`);
	}
	/** Spaces and tabs. */
	ws() {
		while (this.peek() === " " || this.peek() === "	") this.i++;
	}
	/** Whitespace, newlines and comments (inside arrays). */
	wsnl() {
		for (;;) {
			this.ws();
			if (this.peek() === "#") while (this.i < this.s.length && this.peek() !== "\n") this.i++;
			else if (this.peek() === "\n" || this.startsWith("\r\n")) this.i += this.peek() === "\n" ? 1 : 2;
			else return;
		}
	}
	/** End of a line: optional comment, then newline or end of input. */
	eol() {
		this.ws();
		if (this.peek() === "#") while (this.i < this.s.length && this.peek() !== "\n") this.i++;
		if (this.startsWith("\r\n")) this.i += 2;
		else if (this.peek() === "\n") this.i++;
		else if (this.i < this.s.length) this.fail("expected the end of the line");
	}
};
const ESC = {
	b: "\b",
	t: "	",
	n: "\n",
	f: "\f",
	r: "\r",
	"\"": "\"",
	"\\": "\\"
};
function basicString(r, multi) {
	let out = "";
	r.i += multi ? 3 : 1;
	if (multi && r.peek() === "\n") r.i++;
	else if (multi && r.startsWith("\r\n")) r.i += 2;
	for (;;) {
		if (r.i >= r.s.length) r.fail("unterminated string");
		if (multi ? r.startsWith("\"\"\"") : r.peek() === "\"") {
			let q = 0;
			if (multi) {
				while (r.peek(3 + q) === "\"" && q < 2) q++;
				out += "\"".repeat(q);
				r.i += 3 + q;
			} else r.i++;
			return out;
		}
		const c = r.peek();
		if (!multi && c === "\n") r.fail("newline in a string");
		if (c === "\\") {
			const e = r.peek(1);
			if (multi && (e === "\n" || e === " " || e === "	" || e === "\r")) {
				r.i++;
				while (/[ \t\r\n]/.test(r.peek())) r.i++;
				continue;
			}
			if (ESC[e] !== void 0) {
				out += ESC[e];
				r.i += 2;
				continue;
			}
			if (e === "u" || e === "U") {
				const n = e === "u" ? 4 : 8;
				const hex = r.s.slice(r.i + 2, r.i + 2 + n);
				if (!new RegExp(`^[0-9a-fA-F]{${n}}$`).test(hex)) r.fail("bad unicode escape");
				out += String.fromCodePoint(parseInt(hex, 16));
				r.i += 2 + n;
				continue;
			}
			r.fail("bad escape");
		}
		out += c;
		r.i++;
	}
}
function literalString(r, multi) {
	r.i += multi ? 3 : 1;
	if (multi && r.peek() === "\n") r.i++;
	else if (multi && r.startsWith("\r\n")) r.i += 2;
	const end = multi ? "'''" : "'";
	const j = r.s.indexOf(end, r.i);
	if (j < 0) r.fail("unterminated literal string");
	let k = j;
	if (multi) while (r.s[k + 3] === "'" && k - j < 2) k++;
	const out = r.s.slice(r.i, k);
	if (!multi && out.includes("\n")) r.fail("newline in a literal string");
	r.i = k + end.length;
	return out;
}
function key(r) {
	const parts = [];
	for (;;) {
		r.ws();
		if (r.peek() === "\"") parts.push(basicString(r, false));
		else if (r.peek() === "'") parts.push(literalString(r, false));
		else {
			const m = /^[A-Za-z0-9_-]+/.exec(r.s.slice(r.i));
			if (!m) r.fail("bad key");
			parts.push(m[0]);
			r.i += m[0].length;
		}
		r.ws();
		if (r.peek() !== ".") return parts;
		r.i++;
	}
}
function arrayValue(r) {
	r.i++;
	const arr = [];
	for (;;) {
		r.wsnl();
		if (r.peek() === "]") {
			r.i++;
			return arr;
		}
		arr.push(value(r));
		r.wsnl();
		if (r.peek() === ",") r.i++;
		else if (r.peek() !== "]") r.fail("expected , or ] in an array");
	}
}
function inlineTable(r) {
	r.i++;
	const t = {};
	r.ws();
	if (r.peek() === "}") {
		r.i++;
		return t;
	}
	for (;;) {
		const k = key(r);
		if (r.peek() !== "=") r.fail("expected = in an inline table");
		r.i++;
		put(r, t, k, value(r));
		r.ws();
		if (r.peek() === ",") {
			r.i++;
			continue;
		}
		if (r.peek() === "}") {
			r.i++;
			return t;
		}
		r.fail("expected , or } in an inline table");
	}
}
function value(r) {
	r.ws();
	if (r.startsWith("\"\"\"")) return basicString(r, true);
	if (r.peek() === "\"") return basicString(r, false);
	if (r.startsWith("'''")) return literalString(r, true);
	if (r.peek() === "'") return literalString(r, false);
	if (r.peek() === "[") return arrayValue(r);
	if (r.peek() === "{") return inlineTable(r);
	const m = /^[^\s,\]}#]+/.exec(r.s.slice(r.i));
	if (!m) r.fail("expected a value");
	let raw = m[0];
	r.i += raw.length;
	const more = /^ \d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})?/.exec(r.s.slice(r.i));
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && more) {
		raw += `T${more[0].slice(1)}`;
		r.i += more[0].length;
	}
	return new TomlScalar(raw.replace(/_/g, ""));
}
const isTable = (v) => !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof TomlScalar);
function descend(r, t, path) {
	let cur = t;
	for (const p of path) {
		let next = cur[p];
		if (next === void 0) {
			next = {};
			cur[p] = next;
		}
		if (Array.isArray(next)) {
			const last = next[next.length - 1];
			if (!isTable(last)) r.fail(`${p} is not a table`);
			next = last;
		}
		if (!isTable(next)) r.fail(`${p} is not a table`);
		cur = next;
	}
	return cur;
}
function put(r, t, k, v) {
	const parent = descend(r, t, k.slice(0, -1));
	const last = k[k.length - 1];
	if (last in parent) r.fail(`duplicate key ${k.join(".")}`);
	parent[last] = v;
}
/** Parse a TOML document. Throws on anything it cannot read. */
function parseToml(text) {
	const r = new Reader(text.replace(/^﻿/, ""));
	const root = {};
	let cur = root;
	for (;;) {
		r.wsnl();
		if (r.i >= r.s.length) return root;
		if (r.startsWith("[[")) {
			r.i += 2;
			const k = key(r);
			if (!r.startsWith("]]")) r.fail("expected ]]");
			r.i += 2;
			const parent = descend(r, root, k.slice(0, -1));
			const last = k[k.length - 1];
			const existing = parent[last];
			const arr = existing === void 0 ? [] : existing;
			parent[last] = arr;
			if (!Array.isArray(arr)) r.fail(`${k.join(".")} is not an array of tables`);
			const t = {};
			arr.push(t);
			cur = t;
			r.eol();
		} else if (r.peek() === "[") {
			r.i++;
			const k = key(r);
			if (r.peek() !== "]") r.fail("expected ]");
			r.i++;
			cur = descend(r, root, k);
			r.eol();
		} else {
			const k = key(r);
			if (r.peek() !== "=") r.fail("expected =");
			r.i++;
			put(r, cur, k, value(r));
			r.eol();
		}
	}
}
//#endregion
//#region src/enclawed/containment/view-guard.ts
const sameIdentity = (st, w) => st === null ? w.dev === -1 : st.dev === w.dev && st.ino === w.ino;
function lstatOrNull(p) {
	try {
		return fs.lstatSync(p);
	} catch {
		return null;
	}
}
/** Paths among `protect` and `anchors` whose identity differs from the recorded one. */
function changedIdentities(protect, anchors) {
	return [...anchors, ...protect].filter((w) => !sameIdentity(lstatOrNull(w.path), w)).map((w) => w.path);
}
const spin = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/** Pids of every other process in this PID namespace (we are its init), but `keep`. */
function namespacePids(keep) {
	try {
		return fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n)).map(Number).filter((pid) => pid !== process.pid && pid !== 1 && !keep.includes(pid));
	} catch {
		return [];
	}
}
function stateOf(pid) {
	try {
		const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
		return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
	} catch {
		return null;
	}
}
/**
* Freeze every process of the containment but `keep` (the name guard's
* supervisor), synchronously: SIGSTOP to each, then wait until /proc shows
* each one stopped (or gone). Returns false when one did not stop in time
* (the caller kills).
*/
function freezeSandbox(keep = [], timeoutMs = 500) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const running = namespacePids(keep).filter((pid) => {
			const s = stateOf(pid);
			return s !== null && !"TtZX".includes(s);
		});
		if (running.length === 0) return true;
		if (Date.now() > deadline) return false;
		for (const pid of running) try {
			process.kill(pid, "SIGSTOP");
		} catch {}
		spin(1);
	}
}
function thawSandbox(keep = []) {
	for (const pid of namespacePids(keep)) try {
		process.kill(pid, "SIGCONT");
	} catch {}
}
function killSandbox(keep = []) {
	for (const pid of namespacePids(keep)) try {
		process.kill(pid, "SIGKILL");
	} catch {}
}
/** Move `p` into the quarantine; never deleted unless it cannot be moved or copied. */
function quarantine(p, dir) {
	const dest = path.join(dir, `${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`, encodeURIComponent(p));
	try {
		fs.mkdirSync(path.dirname(dest), {
			recursive: true,
			mode: 448
		});
	} catch {}
	try {
		fs.renameSync(p, dest);
		return dest;
	} catch {}
	try {
		fs.cpSync(p, dest, {
			recursive: true,
			verbatimSymlinks: true
		});
		fs.rmSync(p, {
			recursive: true,
			force: true
		});
		return dest;
	} catch {
		fs.rmSync(p, {
			recursive: true,
			force: true
		});
		return null;
	}
}
/**
* Was this object written by the contained process? With `deep`, anything
* inside a directory counts too (a protected directory may hold nothing of
* the sandbox's; an anchor such as .git holds what it legitimately wrote).
*/
function writtenBySandbox(p, written, deep, excepted, depth = 0) {
	if (excepted.has(p)) return false;
	let st;
	try {
		st = fs.lstatSync(p, { bigint: true });
	} catch {
		return false;
	}
	if (written.has(inodeKey(st))) return true;
	if (deep && st.isDirectory() && depth < 8) {
		let names = [];
		try {
			names = fs.readdirSync(p);
		} catch {
			return true;
		}
		return names.some((n) => writtenBySandbox(path.join(p, n), written, deep, excepted, depth + 1));
	}
	return false;
}
/**
* With the sandbox frozen: decide each changed protected path with the
* journal of what the contained process wrote. What it wrote is
* quarantined; what the host did becomes the new identity.
*/
function handleViewLoss(protect, anchors, quarantineDir, written, excepted = /* @__PURE__ */ new Set()) {
	const out = {
		changed: [],
		quarantined: [],
		restore: []
	};
	const accept = (w, st) => {
		w.dev = st ? st.dev : -1;
		w.ino = st ? st.ino : -1;
	};
	const decide = (w, deep, original) => {
		const st = lstatOrNull(w.path);
		if (sameIdentity(st, w)) return;
		out.changed.push(w.path);
		if (st && writtenBySandbox(w.path, written, deep, excepted)) {
			out.quarantined.push({
				path: w.path,
				to: quarantine(w.path, quarantineDir)
			});
			if (original) out.restore.push(w.path);
			return;
		}
		accept(w, st);
	};
	for (const a of anchors) decide(a, false, false);
	for (const w of protect) decide(w, true, w.origin === "original" && w.file);
	return out;
}
/**
* Watch the host side of every protected path and anchor. `onLoss` is
* called (once) synchronously from the inotify event that shows an identity
* change. Throws when a watch cannot be set up (the caller refuses to start).
*/
function watchProtected(protect, anchors, onLoss) {
	const byDir = /* @__PURE__ */ new Map();
	for (const w of [...protect, ...anchors]) {
		const d = path.dirname(w.path);
		byDir.set(d, [...byDir.get(d) ?? [], w]);
	}
	let fired = false;
	const watchers = [];
	const stop = () => {
		for (const w of watchers.splice(0)) w.close();
	};
	const check = (list) => {
		if (fired) return;
		const changed = list.filter((w) => !sameIdentity(lstatOrNull(w.path), w)).map((w) => w.path);
		if (changed.length > 0) {
			fired = true;
			fired = !onLoss(changed);
		}
	};
	try {
		for (const [dir, list] of byDir) {
			const names = new Set(list.map((w) => path.basename(w.path)));
			const watcher = fs.watch(dir, { persistent: false }, (_event, name) => {
				if (name === null || names.has(name)) check(list);
			});
			watcher.on("error", () => {
				if (!fired) {
					fired = true;
					fired = !onLoss([dir]);
				}
			});
			watchers.push(watcher);
		}
	} catch (err) {
		stop();
		throw err;
	}
	return stop;
}
//#endregion
//#region src/enclawed/containment/install-guard.ts
/**
* pyproject.toml tables an install may change (uv add, poetry add, pdm add):
* dotted paths, "*" for any one key.
*/
const PYPROJECT_DEPENDENCY_PATHS = [
	"project.dependencies",
	"project.optional-dependencies",
	"dependency-groups",
	"tool.poetry.dependencies",
	"tool.poetry.dev-dependencies",
	"tool.poetry.group.*.dependencies",
	"tool.uv.dev-dependencies",
	"tool.pdm.dev-dependencies"
];
/** `t` without the dependency tables (a copy). */
function withoutPyprojectDependencies(t) {
	const copy = structuredClone(t);
	const drop = (node, parts) => {
		const [head, ...rest] = parts;
		for (const k of head === "*" ? Object.keys(node) : [head]) {
			const v = node[k];
			if (rest.length === 0) delete node[k];
			else if (v && typeof v === "object" && !Array.isArray(v) && !("raw" in v)) drop(v, rest);
		}
	};
	for (const p of PYPROJECT_DEPENDENCY_PATHS) drop(copy, p.split("."));
	return copy;
}
/** Did only the dependency fields of manifest `name` change? */
function onlyDependenciesChanged(name, before, after) {
	if (name === "pyproject.toml") try {
		return isDeepStrictEqual(withoutPyprojectDependencies(parseToml(before.toString("utf8"))), withoutPyprojectDependencies(parseToml(after.toString("utf8"))));
	} catch {
		return false;
	}
	const a = parseJson(before);
	const b = parseJson(after);
	return a !== void 0 && b !== void 0 && isDeepStrictEqual(withoutDependencies(a), withoutDependencies(b));
}
/** package.json fields an install may change. */
const MANIFEST_DEPENDENCY_FIELDS = [
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
	"peerDependenciesMeta",
	"bundleDependencies",
	"bundledDependencies"
];
/** What the check compares against: taken just before the install starts. */
function captureInstallBaseline(guard) {
	const links = /* @__PURE__ */ new Map();
	for (const name of guard.existing) {
		const p = path.join(guard.root, name);
		try {
			if (fs.lstatSync(p).isSymbolicLink()) links.set(name, fs.readlinkSync(p));
		} catch {}
	}
	const manifests = /* @__PURE__ */ new Map();
	for (const m of guard.manifests) try {
		manifests.set(m, fs.readFileSync(path.join(guard.root, m)));
	} catch {}
	return {
		guard,
		links,
		manifests
	};
}
function withoutDependencies(v) {
	if (!v || typeof v !== "object" || Array.isArray(v)) return v;
	const out = { ...v };
	for (const f of MANIFEST_DEPENDENCY_FIELDS) delete out[f];
	return out;
}
function parseJson(b) {
	try {
		return JSON.parse(b.toString("utf8"));
	} catch {
		return;
	}
}
/**
* The manifest to put back: the original, with the dependency fields the
* install wrote (npm's own save survives; everything else is undone).
*/
function restoredManifest(original, a, b) {
	const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
	if (!isObject(a) || !isObject(b)) return original;
	const merged = { ...a };
	for (const f of MANIFEST_DEPENDENCY_FIELDS) if (f in b) merged[f] = b[f];
	else delete merged[f];
	const indent = /^[{[]\r?\n([ \t]+)/.exec(original.toString("utf8"))?.[1] ?? "  ";
	return Buffer.from(`${JSON.stringify(merged, null, indent)}\n`, "utf8");
}
/** Check the project after the install; quarantine and restore what the cage does not allow. */
function checkInstall(base, quarantineDir) {
	const { guard } = base;
	const out = [];
	const known = new Set([
		...guard.existing,
		...guard.writable,
		...guard.ours
	]);
	let now;
	try {
		now = fs.readdirSync(guard.root);
	} catch {
		return out;
	}
	const fresh = now.filter((e) => !known.has(e) && !isInstallMetadata(e));
	for (const e of fresh.filter((x) => x.startsWith("."))) {
		const p = path.join(guard.root, e);
		out.push({
			path: p,
			what: "new-entry",
			quarantinedTo: quarantine(p, quarantineDir)
		});
	}
	const visible = fresh.filter((x) => !x.startsWith("."));
	if (visible.length > 0) {
		const ignored = ignoredTopLevel(guard.root);
		for (const e of visible) if (!ignored.has(e)) {
			const p = path.join(guard.root, e);
			out.push({
				path: p,
				what: "new-entry",
				quarantinedTo: quarantine(p, quarantineDir)
			});
		}
	}
	for (const [name, target] of base.links) {
		const p = path.join(guard.root, name);
		let cur = null;
		try {
			cur = fs.lstatSync(p).isSymbolicLink() ? fs.readlinkSync(p) : "\0not-a-link";
		} catch {
			cur = null;
		}
		if (cur === target) continue;
		const to = cur === null ? null : quarantine(p, quarantineDir);
		try {
			fs.symlinkSync(target, p);
		} catch {}
		out.push({
			path: p,
			what: "link-changed",
			quarantinedTo: to
		});
	}
	for (const [name, original] of base.manifests) {
		const p = path.join(guard.root, name);
		let cur = null;
		try {
			cur = fs.readFileSync(p);
		} catch {
			cur = null;
		}
		if (cur !== null && cur.equals(original)) continue;
		if (cur !== null && onlyDependenciesChanged(name, original, cur)) continue;
		const to = cur === null ? null : quarantine(p, quarantineDir);
		fs.writeFileSync(p, name === "package.json" ? restoredManifest(original, parseJson(original), cur === null ? void 0 : parseJson(cur)) : original);
		out.push({
			path: p,
			what: "manifest-changed",
			quarantinedTo: to
		});
	}
	return out;
}
//#endregion
//#region src/enclawed/containment/seccomp.ts
const BPF_LD_W_ABS = 32;
const BPF_JEQ_K = 21;
const BPF_JGE_K = 53;
const BPF_RET_K = 6;
const SECCOMP_RET_ALLOW = 2147418112;
const SECCOMP_RET_ERRNO = 327680;
const EPERM = 1;
const ENOSYS = 38;
const ARCH = {
	x64: {
		audit: 3221225534,
		memfdCreate: 319,
		x32Bit: 1073741824
	},
	arm64: {
		audit: 3221225655,
		memfdCreate: 279,
		x32Bit: null
	}
};
/** The filter for this machine's architecture, or null when it has none (strict mode then refuses). */
function strictExecSeccompFilter(arch = process.arch) {
	const a = ARCH[arch];
	if (!a) return null;
	const prog = [];
	prog.push([
		BPF_LD_W_ABS,
		0,
		0,
		4
	]);
	prog.push([
		BPF_JEQ_K,
		1,
		0,
		a.audit
	]);
	prog.push([
		BPF_RET_K,
		0,
		0,
		SECCOMP_RET_ERRNO | ENOSYS
	]);
	prog.push([
		BPF_LD_W_ABS,
		0,
		0,
		0
	]);
	if (a.x32Bit !== null) {
		prog.push([
			BPF_JGE_K,
			0,
			1,
			a.x32Bit
		]);
		prog.push([
			BPF_RET_K,
			0,
			0,
			SECCOMP_RET_ERRNO | ENOSYS
		]);
	}
	prog.push([
		BPF_JEQ_K,
		0,
		1,
		a.memfdCreate
	]);
	prog.push([
		BPF_RET_K,
		0,
		0,
		SECCOMP_RET_ERRNO | EPERM
	]);
	prog.push([
		BPF_RET_K,
		0,
		0,
		SECCOMP_RET_ALLOW
	]);
	const out = Buffer.alloc(prog.length * 8);
	prog.forEach(([code, jt, jf, k], i) => {
		out.writeUInt16LE(code, i * 8);
		out.writeUInt8(jt, i * 8 + 2);
		out.writeUInt8(jf, i * 8 + 3);
		out.writeUInt32LE(k >>> 0, i * 8 + 4);
	});
	return out;
}
//#endregion
export { changedIdentities as a, killSandbox as c, watchProtected as d, checkInstall as i, quarantine as l, MANIFEST_DEPENDENCY_FIELDS as n, freezeSandbox as o, captureInstallBaseline as r, handleViewLoss as s, strictExecSeccompFilter as t, thawSandbox as u };
