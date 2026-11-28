import { y as rawEd25519ToPem } from "./enclaweder-hid-B_ZViqzj.js";
import { createPublicKey, randomBytes, verify } from "node:crypto";
//#region src/enclawed/hardware-root/activation.ts
const CS05 = Object.freeze({
	ANCHOR_OPEN_BOUND: 55,
	ANCHOR_READ: 56,
	KEY_DERIVE: 57
});
const TAG_ANCHOR_READ = Buffer.from("enclaweder.anchor-read.v1", "latin1");
/** How long the device keeps an activation (and so how long this process offers one). */
const ACTIVATION_TTL_MS = 12e4;
/** A 32-byte binding as the device writes it; null when it is not one. */
function parseBinding(b) {
	if (!b || b.length !== 32) return null;
	return {
		kind: b[0] === 1 ? "unlock-use" : b[0] === 2 ? "totp" : "unknown",
		useIndex: b.readUInt16LE(2),
		step: b.readUInt32LE(4),
		gid: b.readBigUInt64LE(8),
		boot: b.readBigUInt64LE(16),
		counter: b.readBigUInt64LE(24)
	};
}
/** Whether a device-written binding names exactly this activation. */
function bindingNames(binding, f) {
	const b = parseBinding(binding);
	if (!b || b.kind !== f.kind) return false;
	if (f.kind === "unlock-use") return b.gid === f.gid && b.useIndex === f.useIndex && (f.boot === void 0 || b.boot === f.boot) && b.counter === 0n;
	return b.step === f.step && b.counter === f.counter && b.gid === 0n && b.useIndex === 0;
}
const held = /* @__PURE__ */ new Map();
const HELD_MAX = 4;
/**
* Remember an activation this process just made on device `devicePubHex`: `nonce` is the request
* nonce it sent (UNLOCK_USE / TOTP_VERIFY), `facts` what the device's signed answer said.
*/
function noteActivation(devicePubHex, nonce, facts, now = Date.now()) {
	if (nonce.length !== 32) return;
	const list = (held.get(devicePubHex) ?? []).filter((h) => now - h.at < ACTIVATION_TTL_MS);
	list.push({
		facts,
		nonce: Buffer.from(nonce),
		at: now,
		anchor: false,
		key: false
	});
	while (list.length > HELD_MAX) list.shift()?.nonce.fill(0);
	held.set(devicePubHex, list);
}
/** The newest fresh activation not yet spent for `use`, or null. Does not spend it. */
function peekActivation(devicePubHex, use, now = Date.now()) {
	const list = held.get(devicePubHex) ?? [];
	for (let i = list.length - 1; i >= 0; i--) {
		const h = list[i];
		if (now - h.at < 12e4 && !h[use]) return {
			facts: h.facts,
			nonce: Buffer.from(h.nonce),
			at: h.at
		};
	}
	return null;
}
/** Mark an activation spent for `use` (the device spent it: never present it again for that). */
function spendActivation(devicePubHex, a, use) {
	for (const h of held.get(devicePubHex) ?? []) if (h.nonce.equals(a.nonce)) h[use] = true;
}
/**
* Verifies an ANCHOR_READ answer: `status(1) body(112) sig(64)`, signed by the certified key over
* "enclaweder.anchor-read.v1" | nonce | body, for `uid` when given. Null when it does not verify
* (a replayed read, another device's, or an altered one).
*/
function verifyAnchorRead(devicePubRaw, nonce, payload, uid = null) {
	if (payload.length !== 177 || payload[0] !== 0 || nonce.length !== 32) return null;
	const body = payload.subarray(1, 113);
	let ok = false;
	try {
		ok = verify(null, Buffer.concat([
			TAG_ANCHOR_READ,
			nonce,
			body
		]), createPublicKey(rawEd25519ToPem(devicePubRaw)), payload.subarray(113, 177));
	} catch {
		ok = false;
	}
	if (!ok || body[0] !== 1) return null;
	const rUid = Buffer.from(body.subarray(44, 56));
	if (uid && !rUid.equals(uid)) return null;
	const flags = body[1];
	const counter = body.readBigUInt64LE(4);
	if ((flags & 1) !== 0 !== counter > 0n) return null;
	return {
		anchored: (flags & 1) !== 0,
		counter,
		head: Buffer.from(body.subarray(12, 44)),
		uid: rUid,
		sess: body.readBigUInt64LE(56),
		opens: body.readBigUInt64LE(64),
		live: (flags & 2) !== 0,
		liveSid: body.readBigUInt64LE(72),
		liveBind: (flags & 4) !== 0 ? Buffer.from(body.subarray(80, 112)) : null,
		headByLive: (flags & 8) !== 0
	};
}
const DEC = /^\d{1,20}$/;
const asBig = (v) => typeof v === "string" && DEC.test(v) ? BigInt(v) : typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : null;
/**
* The launch activations a log records: every `auth.device-factor` record (any adapter's prefix)
* whose outcome is "verified". A device unlock names its grant and use (gid, useIndex); a device
* TOTP code names its step and counter when the adapter records them (records without them name
* nothing, so a bound anchor cannot be matched to them).
*/
function deviceFactorActivations(records) {
	const out = [];
	for (const r of records) {
		if (!r || typeof r !== "object") continue;
		const rec = r;
		if (typeof rec.type !== "string" || !(rec.type === "auth.device-factor" || rec.type.endsWith(".auth.device-factor")) || !rec.payload || typeof rec.payload !== "object") continue;
		const p = rec.payload;
		if (p.outcome !== "verified") continue;
		if (p.via === "device-unlock") {
			const gid = asBig(p.gid);
			const useIndex = typeof p.useIndex === "number" ? p.useIndex : null;
			if (gid !== null && useIndex !== null && Number.isInteger(useIndex) && useIndex > 0) {
				const boot = asBig(p.boot);
				out.push({
					kind: "unlock-use",
					gid,
					useIndex,
					...boot === null ? {} : { boot }
				});
			}
		} else if (p.via === "device-totp") {
			const step = typeof p.step === "number" && Number.isInteger(p.step) ? p.step : null;
			const counter = asBig(p.counter);
			if (step !== null && counter !== null) out.push({
				kind: "totp",
				step,
				counter
			});
		}
	}
	return out;
}
/** The firmware update a refusal names (the Enclaweder firmware 0.3.3, command set 0.5). */
const CS05_REFLASH_RUNBOOK = "the Enclaweder firmware 0.3.3 update from Enclawed, Inc.";
/**
* Ask the device to prove command set 0.5: `read(nonce32)` carries ANCHOR_READ to it (directly, or
* relayed) and returns the raw answer. `devicePubRaw` / `uid` are the CERTIFIED key and uid.
*/
async function proveCommandSet05(read, devicePubRaw, uid) {
	if (!read) return {
		status: "unproven",
		reason: "nothing carries ANCHOR_READ to the device"
	};
	const nonce = randomBytes(32);
	let ans;
	try {
		ans = await read(nonce);
	} catch (err) {
		return {
			status: "unproven",
			reason: `the device did not answer ANCHOR_READ (${err?.message ?? String(err)})`
		};
	}
	if (ans.length === 1 && (ans[0] === 8 || ans[0] === 1)) return {
		status: "older",
		reason: "the device answered ANCHOR_READ as unsupported (firmware before command set 0.5)"
	};
	return verifyAnchorRead(devicePubRaw, nonce, ans, uid) ? {
		status: "proven",
		commandSet: "0.5"
	} : {
		status: "unproven",
		reason: "the ANCHOR_READ answer is not signed over this process's nonce by the certified key (a replayed or altered answer, or another device)"
	};
}
//#endregion
export { noteActivation as a, proveCommandSet05 as c, deviceFactorActivations as i, spendActivation as l, CS05_REFLASH_RUNBOOK as n, parseBinding as o, bindingNames as r, peekActivation as s, CS05 as t, verifyAnchorRead as u };
