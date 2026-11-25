import { n as inNonInitialUserNamespace, t as hostUid } from "./userns-Om3FzFOv.js";
import fs from "node:fs";
import path from "node:path";
import { createPrivateKey } from "node:crypto";
//#region src/enclawed/adapter/launch-gates.ts
/**
* May a session start on this log with this device? `device` null: no device
* is bound; `canAnchor` false: the device cannot anchor with authentication
* (the kit's hardwareRootSessionAnchor decides it). `rootRequired`: the
* hardware root is required on this host. Otherwise `check` is the device's
* comparison and `anchorFilePresent` whether the logger's signed anchor file
* exists.
*
* A session with a device bound, or with the root required, anchors its log
* or does not start: no device while the root is required, a device that
* cannot anchor, and firmware without anchoring are refused. Only a host
* that neither requires nor has a device starts without an anchor.
*/
function decideAnchorGate(o) {
	if (!o.device) {
		if (o.rootRequired) return {
			ok: false,
			status: "no-device",
			code: "anchor-root-required",
			detail: "the hardware root is required on this host and no Enclaweder is bound",
			counter: null
		};
		return {
			ok: true,
			status: "no-device",
			detail: "no Enclaweder is bound"
		};
	}
	if (!o.device.canAnchor) return {
		ok: false,
		status: "no-anchor",
		code: "anchor-unauthenticated",
		detail: "the bound Enclaweder cannot anchor this log with an authenticated anchor session, so another process of this user could anchor a log of its choosing",
		counter: null
	};
	const r = o.check;
	if (!r) return {
		ok: false,
		status: "unchecked",
		code: "anchor-not-checked",
		detail: "the device's comparison of the audit log did not run",
		counter: null
	};
	const detail = r.detail ?? "";
	if (r.status === "matched") {
		if (!o.anchorFilePresent) return {
			ok: false,
			status: "MISMATCH",
			code: "anchor-file-missing",
			detail: `the anchor file ${o.anchorFile} is missing while the device holds this log's anchor (${detail})`,
			counter: r.counter ?? null
		};
		return {
			ok: true,
			status: r.status,
			detail
		};
	}
	if (r.status === "MISMATCH" || r.status === "superseded") return {
		ok: false,
		status: r.status,
		code: r.code ?? r.status,
		detail,
		counter: r.counter ?? null
	};
	if (/does not support audit anchoring/.test(detail)) return {
		ok: false,
		status: "no-anchor",
		code: "anchor-unsupported",
		detail: `the bound Enclaweder's firmware cannot anchor the audit log (${detail})`,
		counter: r.counter ?? null
	};
	if (r.deviceHasAnchors === true) return {
		ok: false,
		status: "unanchored",
		code: o.anchorFilePresent ? "not-anchored-here" : "anchor-file-missing",
		detail: `the Enclaweder holds earlier anchors, but this audit log cannot be shown to be the one it anchored (${detail})`,
		counter: r.counter ?? null
	};
	return {
		ok: true,
		status: r.status,
		detail
	};
}
/** The refusal the launcher prints; `cli` is the adapter's command name. */
function anchorGateMessage(g, auditLog, cli) {
	return `the audit log does not match what the Enclaweder anchored (${g.status}${g.code !== g.status ? `, ${g.code}` : ""}): ${g.detail}. Not starting: a session started now would anchor this log and hide what happened to it. Keep the files as they are (${auditLog} and its anchor files), check them with: ${cli} audit verify. If you know why (you restored or replaced the log, took the anchor channel over, or share the device with another log), accept the current state as the new baseline with: ${cli} audit accept`;
}
const MAX_KEY_BYTES = 64 * 1024;
const MAX_ENTRIES = 4e3;
const KEYISH = /\.(pem|key|der|priv|sk)$/i;
const OPERATORISH = /operator|quorum|custod/i;
/** Is the file at `p` an Ed25519 private key? Never returns or logs the key. */
function isEd25519PrivateKeyFile(p) {
	let st;
	try {
		st = fs.statSync(p);
	} catch {
		return false;
	}
	if (!st.isFile() || st.size === 0 || st.size > MAX_KEY_BYTES) return false;
	let buf;
	try {
		buf = fs.readFileSync(p);
	} catch {
		return false;
	}
	try {
		const text = buf.toString("latin1");
		try {
			return (text.includes("-----BEGIN") ? createPrivateKey({
				key: text,
				format: "pem"
			}) : createPrivateKey({
				key: buf,
				format: "der",
				type: "pkcs8"
			})).asymmetricKeyType === "ed25519";
		} catch {
			return false;
		}
	} finally {
		buf.fill(0);
	}
}
function expand(p, home) {
	if (p.length === 0 || p.length > 4096) return null;
	if (p === "~" || p.startsWith("~/")) return path.join(home, p.slice(1));
	return path.isAbsolute(p) ? p : null;
}
function pathStrings(doc, home, out = /* @__PURE__ */ new Set(), depth = 0) {
	if (depth > 32) return out;
	if (typeof doc === "string") {
		const p = expand(doc, home);
		if (p) out.add(p);
	} else if (Array.isArray(doc)) for (const v of doc) pathStrings(v, home, out, depth + 1);
	else if (doc && typeof doc === "object") for (const v of Object.values(doc)) pathStrings(v, home, out, depth + 1);
	return out;
}
function filesUnder(dir, budget, depth = 4) {
	const out = [];
	const stack = [[dir, 0]];
	while (stack.length > 0 && budget.left > 0) {
		const [d, k] = stack.pop();
		let names;
		try {
			names = fs.readdirSync(d);
		} catch {
			continue;
		}
		for (const n of names) {
			if (--budget.left < 0) break;
			const p = path.join(d, n);
			let st;
			try {
				st = fs.lstatSync(p);
			} catch {
				continue;
			}
			if (st.isDirectory() && k < depth) stack.push([p, k + 1]);
			else if (st.isFile() || st.isSymbolicLink()) out.push(p);
		}
	}
	return out;
}
/**
* Operator private keys on this host. `bases`: the Enclawed and adapter
* state/config directories (any key under a directory named for operators
* counts); a key file named like an operator key directly in the home, a
* base or `cwd` counts; every path a policy document names that holds an
* Ed25519 private key counts.
*/
function findHostOperatorKeys(o) {
	const found = /* @__PURE__ */ new Map();
	const add = (p, why) => {
		let real = p;
		try {
			real = fs.realpathSync(p);
		} catch {}
		if (!found.has(real) && isEd25519PrivateKeyFile(real)) found.set(real, {
			path: p,
			why
		});
	};
	for (const f of o.extra ?? []) add(f, "given on the command line");
	for (const f of o.policyFiles ?? []) {
		let doc;
		try {
			doc = JSON.parse(fs.readFileSync(f, "utf8"));
		} catch {
			continue;
		}
		for (const p of pathStrings(doc, o.home)) if (KEYISH.test(p) || OPERATORISH.test(path.basename(p))) add(p, `named by the policy ${f}`);
	}
	const bases = [...new Set(o.bases)];
	const budget = { left: MAX_ENTRIES };
	for (const base of bases) {
		let names = [];
		try {
			names = fs.readdirSync(base);
		} catch {
			continue;
		}
		for (const n of names) {
			if (!OPERATORISH.test(n)) continue;
			const p = path.join(base, n);
			let st;
			try {
				st = fs.lstatSync(p);
			} catch {
				continue;
			}
			if (st.isDirectory()) for (const f of filesUnder(p, budget)) add(f, `in the operator key location ${p}`);
		}
	}
	for (const dir of new Set([
		o.home,
		...bases,
		o.cwd
	])) {
		let names = [];
		try {
			names = fs.readdirSync(dir);
		} catch {
			continue;
		}
		for (const n of names) if (OPERATORISH.test(n) && (KEYISH.test(n) || !n.includes("."))) add(path.join(dir, n), `named like an operator key in ${dir}`);
	}
	return [...found.values()];
}
/**
* May an operator-quorum operation run from this host? Never with a key file
* (`keyFiles`: the operator key files the command was given), never while an
* operator private key is on the host (`found`: findHostOperatorKeys).
*/
function decideOperatorAuthorization(o) {
	if (o.keyFiles.length > 0) return {
		ok: false,
		code: "operator-key-file",
		message: `${o.command} REFUSED: an operator key file is never accepted on the agent's host. Each operator signs the printed message on their own device (an offline station, a hardware token) and pastes the signature.`
	};
	if (o.found.length > 0) return {
		ok: false,
		code: "operator-key-on-host",
		message: `${o.command} REFUSED: operator private keys are on this host:\n` + o.found.map((f) => `  ${f.path} (${f.why})\n`).join("") + "An operator key on the agent's host lets any process of this user sign its own takeover, which defeats the device's operator quorum.\nMove every operator key off this machine (a hardware token, an offline station, or removable media that is not mounted), then run the command again with offline signatures.\n"
	};
	return { ok: true };
}
/** How many offline signers to ask for: 1 to 8. */
function offlineSignerCount(n) {
	const v = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
	return Number.isInteger(v) ? Math.max(1, Math.min(8, v)) : 1;
}
/** A pasted 64-byte Ed25519 signature (hex, whitespace ignored); anything else is empty, which the device refuses. */
function parseOfflineSignature(text) {
	const hex = text.replace(/\s/g, "");
	return Buffer.from(/^[0-9a-f]{128}$/i.test(hex) ? hex : "", "hex");
}
/** Re-check times (ms after the start): 1, 2, 4, 8 s, then every 15 s, up to ERASE_WATCH_S. */
function eraseWatchSchedule() {
	const out = [];
	let t = 0;
	let step = 1e3;
	while (t + step <= 60 * 1e3) {
		t += step;
		out.push(t);
		step = Math.min(step * 2, 15e3);
	}
	return out;
}
/**
* Watch the erased login and erase it again whenever it reappears. The
* adapter supplies where the login is (`present`) and how to erase it
* (`erase`, the kit's eraseCredentials over its locations); `sleep` and
* `note` are its timer and log.
*/
async function watchErased(o) {
	const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
	const note = (e) => {
		try {
			o.note?.(e);
		} catch {}
	};
	const schedule = eraseWatchSchedule();
	note({
		event: "start",
		checks: schedule.length
	});
	let reappeared = 0;
	let last = 0;
	for (const at of schedule) {
		await sleep(at - last);
		last = at;
		if (o.present()) {
			reappeared++;
			const r = o.erase();
			note({
				event: "reappeared",
				erased: r.erased,
				remaining: r.remaining
			});
		}
	}
	note({
		event: "end",
		reappeared
	});
	return {
		reappeared,
		checks: schedule.length
	};
}
/**
* Hidraw nodes this process could open, whatever sysfs says (a tmpfs over
* /sys/class/hidraw hides the listing, not the node). A node bound over by
* /dev/null (a test harness's mask) is not a device. Nodes are only
* stat'ed, never opened.
*/
function reachableHidrawNodes() {
	let names;
	try {
		names = fs.readdirSync("/dev").filter((n) => /^hidraw\d+$/.test(n));
	} catch {
		return [];
	}
	let nul = null;
	try {
		nul = fs.statSync("/dev/null").rdev;
	} catch {
		nul = null;
	}
	return names.map((n) => `/dev/${n}`).filter((p) => {
		try {
			const st = fs.statSync(p);
			return st.isCharacterDevice() && st.rdev !== nul;
		} catch {
			return false;
		}
	});
}
function hidrawListed() {
	try {
		return fs.readdirSync("/sys/class/hidraw").length > 0;
	} catch {
		return false;
	}
}
/**
* Why the hardware root must not be touched from here, or null (finding N16,
* H11). Inside a non-initial user namespace a process could open the device a
* second time, beside the host's owner, which collides with it and latches the
* root DIRTY. Refused whenever a device could be reached from here: a
* reachable hidraw node, a pinned node (`pinnedHidraw`, the ENCLAWEDER_HIDRAW
* value), or a listed device. With every node masked, nothing is refused.
*/
function userNamespaceDeviceRisk(o = {}) {
	if (process.platform !== "linux" || !inNonInitialUserNamespace()) return null;
	const nodes = reachableHidrawNodes();
	const pinned = (o.pinnedHidraw ?? "").trim();
	if (nodes.length === 0 && !pinned && !hidrawListed()) return null;
	const what = pinned ? `ENCLAWEDER_HIDRAW=${pinned} is set` : nodes.length ? `${nodes.join(", ")} can be opened here` : "an Enclaweder is listed";
	return `this process runs in a user namespace (uid ${process.getuid?.()} here, host uid ${hostUid() ?? "unknown"}) and ${what}: from here the device could be opened a second time, beside the host's owner, which collides with it and latches the root DIRTY. Run outside the namespace, or mask the device in it (/dev/null over /dev/hidraw*)`;
}
//#endregion
export { findHostOperatorKeys as a, parseOfflineSignature as c, watchErased as d, eraseWatchSchedule as i, reachableHidrawNodes as l, decideAnchorGate as n, isEd25519PrivateKeyFile as o, decideOperatorAuthorization as r, offlineSignerCount as s, anchorGateMessage as t, userNamespaceDeviceRisk as u };
