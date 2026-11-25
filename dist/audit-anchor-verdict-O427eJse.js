import { i as deviceFactorActivations, r as bindingNames } from "./activation-BpVU1YFa.js";
import fs from "node:fs";
//#region src/enclawed/hardware-root/audit-anchor-verdict.ts
const HELD = new Set(["held", "required"]);
function isLaunchType(t) {
	return typeof t === "string" && (t === "launch" || t.endsWith(".launch"));
}
/** Launch records that claim the hardware root was held or required, from parsed records. */
function launchRootClaims(records) {
	const out = [];
	let line = 0;
	for (const r of records) {
		line++;
		if (!r || typeof r !== "object") continue;
		const rec = r;
		if (!isLaunchType(rec.type) || !rec.payload || typeof rec.payload !== "object") continue;
		const p = rec.payload;
		const hw = typeof p.hardware === "string" ? p.hardware : null;
		if (hw !== null && HELD.has(hw) || p.rootRequired === true) out.push({
			line,
			type: rec.type,
			hardware: hw
		});
	}
	return out;
}
/** The same, read from JSONL files (a log's segments). An unparseable line is skipped here: the chain check refuses it. */
function launchRootClaimsInFiles(files) {
	return launchRootClaims(recordsInFiles(files));
}
/** The launch activations (auth.device-factor, verified) a log's segments record (activation.ts). */
function deviceFactorActivationsInFiles(files) {
	return deviceFactorActivations(recordsInFiles(files));
}
function recordsInFiles(files) {
	const records = [];
	for (const f of files) for (const l of fs.readFileSync(f, "utf8").split("\n")) {
		if (!l.trim()) continue;
		try {
			records.push(JSON.parse(l));
		} catch {
			records.push(null);
		}
	}
	return records;
}
/**
* The verdict. `device` is the device's comparison of the log (null when none ran); `chainAnchor`
* is the chain verifier's head check ("matched": device-attested; "matched-offline": only a
* stored copy; "absent").
*/
function decideAuditAnchorVerdict(o) {
	if (o.device === "MISMATCH" || o.device === "superseded") return {
		ok: false,
		code: "anchor-mismatch",
		detail: `the device's anchor does not match this log (${o.device})`
	};
	const rootClaimed = o.claims.length > 0;
	if (!rootClaimed) return {
		ok: true,
		rootClaimed
	};
	if (o.attestation?.fresh !== true) return {
		ok: false,
		code: "anchor-read-unproven",
		detail: `the log's own launch records say the hardware root was ${o.claims[0].hardware ?? "required"} (${o.claims.length} launch record(s), first at record ${o.claims[0].line}), and the device gave no fresh anchor read signed over this verification's own nonce (command set 0.5): the device ${o.device === null ? o.chainAnchor === "matched" ? "matched without a fresh read (an older firmware, or something in between answering \"unsupported\")" : o.chainAnchor === "matched-offline" ? "was not present (only a stored copy matched)" : "was not shown" : o.device === "matched" ? "matched without a fresh read (an older firmware, or something in between answering \"unsupported\")" : `is ${o.device}`}; completeness and the launch's binding cannot be proven, so the log does not verify (update the Enclaweder to firmware 0.3.3, command set 0.5, and verify with it attached)`
	};
	if (o.device === "matched" || o.device === null && o.chainAnchor === "matched") {
		const unbound = boundAnchorRefusal(o.attestation ?? null, o.activations ?? []);
		return unbound ? {
			ok: false,
			code: "anchor-unbound",
			detail: unbound
		} : {
			ok: true,
			rootClaimed
		};
	}
	const first = o.claims[0];
	return {
		ok: false,
		code: "anchor-unproven",
		detail: `the log's own launch records say the hardware root was ${first.hardware ?? "required"} (${o.claims.length} launch record(s), first at record ${first.line}), but the device anchor ${o.device === null ? o.chainAnchor === "matched-offline" ? "was not present (only a stored copy matched)" : "was not shown" : `is ${o.device}`}: completeness cannot be proven, so the log does not verify`
	};
}
/**
* Command set 0.5: why a device-matched head does not stand for one of this log's launches, or
* null when it does (or when the device predates 0.5: no fresh read, today's answer stands).
* A head set by an unbound session (anything that opened the channel without an activation, as
* a same-user forger does) or by a session bound to an activation this log does not record (a
* forger that spent a use of the person's grant itself names ITS use, not the launch's) does not.
*/
function boundAnchorRefusal(a, activations) {
	if (!a?.fresh) return "no fresh anchor read signed over this verification's nonce shows which activation bound the device's head; the log does not verify";
	if (a.version === null) return `the record that set the device's head (counter ${a.counter}, session ${a.sess}) is not at hand, so which launch's activation authorised that session cannot be shown; the log does not verify`;
	if (a.version !== 3 || a.bind === null) return `the device's head was set by anchor session ${a.sess}, which no device-verified launch activation bound (an unbound open, as anything on the host can make); the log does not verify`;
	const bind = Buffer.from(a.bind, "hex");
	if (activations.some((f) => bindingNames(bind, f))) return null;
	return `the device's head was set by anchor session ${a.sess}, bound to a device activation that none of this log's own auth.device-factor records names; the log does not verify`;
}
//#endregion
export { launchRootClaimsInFiles as a, launchRootClaims as i, decideAuditAnchorVerdict as n, deviceFactorActivationsInFiles as r, boundAnchorRefusal as t };
