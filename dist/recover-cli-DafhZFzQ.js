import { b as parseRecoveryCode, g as hardwareRootStatusStandalone, nt as FIDO_RP_ID, rt as fidoChallenge, v as recoverHardwareRootStandalone, x as parseTotp } from "./hardware-root-DQ2ym1zw.js";
import fs from "node:fs";
import { createPrivateKey, sign } from "node:crypto";
import { createInterface } from "node:readline/promises";
const STATE = {
	BOOT: 0,
	SELFTEST: 1,
	PROVISION: 2,
	READY: 3,
	ATTESTED: 4,
	ZEROIZED: 5,
	FAULT: 6
};
const USABLE = new Set([
	STATE.PROVISION,
	STATE.READY,
	STATE.ATTESTED
]);
/** Why the device halted, in plain words. */
const HALT_REASON = {
	1: "halted by this computer",
	2: "halted by this computer (audit log protection)",
	3: "halted by this computer",
	4: "this computer's session ended without a clean close (crash, kill or suspend)",
	5: "the device was reset or re-plugged during a session",
	6: "unplugged or lost power during a session",
	7: "tamper detected",
	8: "the device detected an environmental fault",
	9: "attestation quorum failure",
	10: "the device's random-number health check failed",
	11: "zeroized by an operator",
	12: "the device failed a self-test"
};
const TODO = {
	recover: "Run `enclawed hardware-root recover` with the unit plugged in: you need your authenticator (app code, or security key with --fido) plus one recovery code.",
	notEnrolled: "Two-factor recovery is not set up on this device: contact your operators to recover it.",
	locked: "Two-factor recovery is locked after repeated failed attempts: contact your operators (only they can recover it now).",
	zeroized: "Do not use this unit: its keys are destroyed. Contact Enclawed or your operators to re-provision it.",
	counterfeit: "Stop: this device may be counterfeit. Do not use it, and report it to Enclawed or your operators.",
	firmware: "Update the Enclaweder firmware.",
	noDevice: "Plug the Enclaweder in. On WSL, attach it from an elevated Windows prompt first: `usbipd list`, then `usbipd attach --wsl --busid <BUSID>`.",
	unreadable: "The device did not give a verifiable answer: unplug it, plug it back in and run `enclawed hardware-root status` again. If it persists, contact your operators.",
	starting: "The device is still starting up: wait a few seconds and run status again.",
	fault: "The device reports a fault: unplug it and plug it back in. If it stays in fault, contact Enclawed or your operators.",
	reprovisioned: "This unit was re-provisioned (same serial, new keys) since this computer bound it: run `enclawed hardware-root recover` to adopt it; the device verifies the recovery.",
	ownerDirty: "Stop the Enclawed processes on this machine, then run `enclawed hardware-root recover`.",
	ownerUnavailable: "The Enclawed process that owns the device is not answering: stop it and run status again.",
	ownerChecking: "The Enclawed process that owns the device is checking it again (an answer was late): run status again in a few seconds."
};
function haltReason(l) {
	return `${HALT_REASON[l.reason] ?? l.reasonText}${l.sinceMs !== null ? `, ${Math.round(l.sinceMs / 1e3)} s ago` : " (before this power-on)"}`;
}
function serialOf(uid, fallback) {
	return fallback ?? (uid ? `ENCLW-${uid.toUpperCase()}` : null);
}
function fmtFailure(e) {
	const when = e.hostTimeUntrusted ? `${(/* @__PURE__ */ new Date(e.hostTimeUntrusted * 1e3)).toISOString()} (computer clock)` : "time unknown";
	return `${e.opText}: ${e.reasonText}${e.count > 1 ? ` x${e.count}` : ""}, ${when}`;
}
function diagnoseDevice(d, hostLatches) {
	const todo = [];
	const answered = d.state !== null;
	const firmwareOld = d.latchErrorCode === "unsupported";
	const bound = hostLatches.filter((l) => l.bound?.uid);
	const mine = bound.filter((l) => l.bound?.uid?.toLowerCase() === d.uid.toLowerCase());
	let zeroization;
	if (d.state === STATE.ZEROIZED || d.cert === "missing") {
		zeroization = {
			status: "zeroized",
			detail: "keys destroyed: the unit is unprovisioned and needs re-provisioning"
		};
		todo.push(TODO.zeroized);
	} else if (bound.length > 0 && mine.length === 0) {
		const others = [...new Set(bound.map((l) => serialOf(l.bound?.uid, l.bound?.serial)))];
		zeroization = {
			status: "different-unit",
			detail: `this computer is bound to ${others.join(", ")}, not to this unit`
		};
		todo.push(`Plug in the unit this computer is bound to (${others.join(", ")}). Moving this computer to a different unit is an operator action: if you did not swap the device on purpose, treat it as tampering and contact your operators.`);
	} else if (mine.some((l) => l.bound?.pubkey && l.bound.pubkey.toLowerCase() !== d.pubkey)) {
		zeroization = {
			status: "different-unit",
			detail: "same serial, new keys: re-provisioned since this computer bound it"
		};
		todo.push(TODO.reprovisioned);
	} else if (!answered) zeroization = {
		status: "unknown",
		detail: "the device did not report its state"
	};
	else zeroization = {
		status: "not-zeroized",
		detail: "keys present"
	};
	let genuine;
	if (d.cert === "invalid" || d.keyProof === false) {
		genuine = {
			status: "not-genuine",
			detail: d.cert === "invalid" ? "its certificate does not verify against the Enclawed root" : "it could not prove it holds the key it reports"
		};
		todo.push(TODO.counterfeit);
	} else if (d.cert === "missing") genuine = {
		status: "unprovisioned",
		detail: "it carries no certificate"
	};
	else if (d.cert === "valid" && d.keyProof === true) genuine = {
		status: "genuine",
		detail: `certificate verified against the Enclawed ${d.sku === "pro" ? "Pro" : "Base"} root; it proved it holds its key`
	};
	else genuine = {
		status: "unknown",
		detail: d.cert === "valid" ? "certificate verified, but the device did not answer the key check" : "the device did not answer"
	};
	let operational;
	if (!answered) {
		operational = {
			status: "not-operational",
			detail: "it does not answer"
		};
		todo.push(TODO.unreadable);
	} else if (d.state === STATE.FAULT) {
		operational = {
			status: "not-operational",
			detail: "it reports a fault"
		};
		todo.push(TODO.fault);
	} else if (d.state === STATE.BOOT || d.state === STATE.SELFTEST) {
		operational = {
			status: "not-operational",
			detail: "it is still starting up"
		};
		todo.push(TODO.starting);
	} else if (d.state === STATE.ZEROIZED) operational = {
		status: "not-operational",
		detail: "it is zeroized"
	};
	else if (!USABLE.has(d.state)) {
		operational = {
			status: "not-operational",
			detail: "it reports an unknown state"
		};
		todo.push(TODO.fault);
	} else if (firmwareOld) {
		operational = {
			status: "not-operational",
			detail: "its firmware is too old"
		};
		todo.push(TODO.firmware);
	} else if (!d.latch) {
		operational = {
			status: "not-operational",
			detail: "its halt state could not be verified"
		};
		if (genuine.status !== "not-genuine" && zeroization.status !== "zeroized") todo.push(TODO.unreadable);
	} else operational = {
		status: "operational",
		detail: "it answers, its self-tests passed and its firmware is current"
	};
	const hostDirty = mine.find((l) => l.status === "DIRTY");
	let halt;
	if (d.latch?.state === "SET") halt = {
		status: "DIRTY",
		reason: haltReason(d.latch)
	};
	else if (hostDirty) halt = {
		status: "DIRTY",
		reason: `recorded by this computer: ${hostDirty.dirty?.reason ?? "no reason recorded"}`
	};
	else if (d.latch) halt = {
		status: "CLEAN",
		reason: null
	};
	else halt = {
		status: "unknown",
		reason: null
	};
	let recovery = null;
	const l = d.latch;
	if (l) recovery = {
		authenticator: l.factorsValid ? l.factorKind : "none",
		codesLeft: l.factorsValid ? l.codesLeft : 0,
		failedAttemptsSinceClean: l.failedAttempts,
		failedAttemptsLifetime: d.failures ? String(d.failures.total) : null,
		recentFailures: (d.failures?.entries ?? []).slice(0, 5).map(fmtFailure),
		locked: l.twoFactorLocked,
		retryInSeconds: l.codeWaitMs ? Math.ceil(l.codeWaitMs / 1e3) : null,
		operators: l.custodyHandedOver ? `your organization's operators${d.custody ? ` (${d.custody.m} of ${d.custody.keys.length})` : ""}` : "Enclawed, Inc."
	};
	if (halt.status === "DIRTY" && zeroization.status !== "zeroized") {
		if (recovery?.locked) todo.push(TODO.locked);
		else if (recovery && recovery.authenticator === "none") todo.push(TODO.notEnrolled);
		else if (!todo.includes(TODO.reprovisioned)) todo.push(TODO.recover);
	} else if (recovery?.locked) todo.push(TODO.locked);
	if (recovery && recovery.authenticator === "none" && halt.status !== "DIRTY") todo.push("Two-factor recovery is not set up on this device: ask your operators to set it up before you need it.");
	if (recovery && recovery.authenticator !== "none" && recovery.codesLeft <= 2) todo.push(`Only ${recovery.codesLeft} recovery code(s) left: ask your operators to reissue a new set.`);
	if (recovery && recovery.failedAttemptsSinceClean >= 3) todo.push(`${recovery.failedAttemptsSinceClean} failed recovery attempts since the last clean session: someone may be guessing codes. Investigate before continuing.`);
	const verdict = genuine.status === "not-genuine" || zeroization.status !== "not-zeroized" || operational.status !== "operational" ? "not-operational" : halt.status === "DIRTY" ? "dirty" : "ok";
	return {
		serial: d.serial,
		path: d.path,
		genuine,
		operational,
		zeroization,
		halt,
		recovery,
		verdict,
		todo
	};
}
const EXIT = {
	ok: 0,
	dirty: 2,
	"not-operational": 3,
	"no-device": 3
};
const RANK = {
	ok: 0,
	dirty: 1,
	"not-operational": 2,
	"no-device": 2
};
/** Decide every device's state and what to do. Pure: no device or file access. */
function diagnoseHardwareRoot(r) {
	if (r.owner) {
		const status = r.owner.status;
		const reason = "reason" in r.owner && r.owner.reason ? r.owner.reason : null;
		const verdict = status === "CLEAN" ? "ok" : status === "DIRTY" ? "dirty" : "not-operational";
		return {
			verdict,
			exitCode: EXIT[verdict],
			owner: {
				status,
				reason
			},
			devices: [],
			hostRecords: [],
			todo: status === "CLEAN" ? [] : [status === "DIRTY" ? TODO.ownerDirty : status === "CHECKING" ? TODO.ownerChecking : TODO.ownerUnavailable]
		};
	}
	const devices = r.devices.map((d) => diagnoseDevice(d, r.hostLatches));
	const present = new Set(r.devices.map((d) => d.uid.toLowerCase()));
	const hostRecords = r.hostLatches.filter((l) => l.status === "DIRTY" && !present.has(l.bound?.uid?.toLowerCase() ?? "")).map((l) => ({
		serial: serialOf(l.bound?.uid, l.bound?.serial),
		reason: l.dirty?.reason ?? null
	}));
	let verdict = devices.length === 0 ? "no-device" : "ok";
	for (const d of devices) if (RANK[d.verdict] > RANK[verdict]) verdict = d.verdict;
	const todo = [];
	if (devices.length === 0) todo.push(TODO.noDevice);
	if (hostRecords.length > 0) {
		todo.push(`This computer holds a DIRTY record for ${hostRecords.map((h) => h.serial ?? "an unknown unit").join(", ")}: plug that unit in and run \`enclawed hardware-root recover\`.`);
		if (verdict === "ok") verdict = "dirty";
	}
	return {
		verdict,
		exitCode: EXIT[verdict],
		owner: null,
		devices,
		hostRecords,
		todo
	};
}
const OVERALL = {
	ok: "OK: operational and CLEAN",
	dirty: "DIRTY: accreditation is halted until recovery",
	"not-operational": "NOT OPERATIONAL",
	"no-device": "NO DEVICE"
};
function recoveryLine(r) {
	const parts = [r.authenticator === "authenticator-app" ? "authenticator app enrolled" : r.authenticator === "security-key" ? "security key enrolled" : "two-factor recovery not set up"];
	if (r.authenticator !== "none") parts.push(`${r.codesLeft} recovery code(s) left`);
	parts.push(`${r.failedAttemptsSinceClean} failed attempt(s) since the last clean session${r.failedAttemptsLifetime !== null ? ` (${r.failedAttemptsLifetime} in the device's lifetime)` : ""}`);
	if (r.locked) parts.push("LOCKED after repeated failures (operators only)");
	else if (r.retryInSeconds) parts.push(`next attempt allowed in ${r.retryInSeconds} s`);
	return parts.join("; ");
}
/** The human rendering of a diagnosis. */
function renderHardwareRootDiagnosis(dx) {
	const out = [];
	if (dx.owner) out.push(`The Enclaweder is in use by an Enclawed process on this machine: ${dx.owner.status}${dx.owner.reason ? ` (${dx.owner.reason})` : ""}`);
	if (!dx.owner && dx.devices.length === 0) out.push("No Enclaweder detected.");
	for (const d of dx.devices) {
		out.push(`Enclaweder ${d.serial}`);
		out.push(`  Present:      yes (${d.path})`);
		out.push(`  Genuine:      ${d.genuine.status === "genuine" ? "yes" : d.genuine.status === "not-genuine" ? "NO" : d.genuine.status === "unprovisioned" ? "unprovisioned" : "unknown"} -- ${d.genuine.detail}`);
		out.push(`  Operational:  ${d.operational.status === "operational" ? "yes" : "NO"} -- ${d.operational.detail}`);
		out.push(`  Zeroization:  ${d.zeroization.status === "not-zeroized" ? "not zeroized" : d.zeroization.status === "zeroized" ? "ZEROIZED" : d.zeroization.status === "different-unit" ? "DIFFERENT UNIT" : "unknown"} -- ${d.zeroization.detail}`);
		out.push(`  Halt state:   ${d.halt.status}${d.halt.reason ? ` -- ${d.halt.reason}` : ""}`);
		if (d.recovery) {
			out.push(`  Recovery:     ${recoveryLine(d.recovery)}`);
			out.push(`  Operators:    ${d.recovery.operators}`);
			for (const f of d.recovery.recentFailures) out.push(`    failed: ${f}`);
		}
		if (d.todo.length > 0) {
			out.push("  What to do:");
			for (const t of d.todo) out.push(`    - ${t}`);
		}
	}
	for (const h of dx.hostRecords) out.push(`This computer: DIRTY record for ${h.serial ?? "an unknown unit"}${h.reason ? ` -- ${h.reason}` : ""}`);
	if (dx.todo.length > 0) {
		out.push("What to do:");
		for (const t of dx.todo) out.push(`  - ${t}`);
	}
	out.push(`Overall: ${OVERALL[dx.verdict]} (exit ${dx.exitCode})`);
	return `${out.join("\n")}\n`;
}
//#endregion
//#region src/enclawed/hardware-root/recover-cli.ts
const defaultIO = () => ({
	out: process.stdout,
	err: process.stderr,
	stdin: process.stdin,
	stdoutIsTTY: process.stdout.isTTY
});
/** ENCLW- or ECPRO- with the full 24-hex uid; returns the uid (lower-case) or null. */
function typedSerialUid(typed) {
	const m = /^(ENCLW|ECPRO)-([0-9A-F]{24})$/i.exec(typed.trim());
	return m ? m[2].toLowerCase() : null;
}
async function ask(io, q) {
	const rl = createInterface({
		input: io.stdin,
		output: io.out,
		terminal: false
	});
	try {
		io.out.write(q);
		return (await rl.question("")).trim();
	} finally {
		rl.close();
	}
}
/**
* Read a line in raw mode. The returned string is all the caller ever holds. Without `echo`
* nothing is shown. With `echo` the characters are shown while typing (a long code is easier to
* get right when you can see it), and the line is wiped once Enter is pressed.
*/
async function askSecret(io, q, opts = {}) {
	io.out.write(q);
	const stdin = io.stdin;
	if (!stdin.isTTY || !stdin.setRawMode) throw new Error("a recovery code is read only from an interactive terminal (no echo)");
	stdin.setRawMode(true);
	stdin.resume();
	return new Promise((resolve, reject) => {
		let buf = "";
		const onData = (d) => {
			for (const ch of d.toString("utf8")) {
				if (ch === "\r" || ch === "\n") {
					done();
					resolve(buf);
					return;
				}
				if (ch === "") {
					done();
					reject(/* @__PURE__ */ new Error("aborted"));
					return;
				}
				if (ch === "" || ch === "\b") {
					if (opts.echo && buf.length > 0) io.out.write("\b \b");
					buf = buf.slice(0, -1);
				} else if (ch >= " ") {
					buf += ch;
					if (opts.echo) io.out.write(ch);
				}
			}
		};
		const done = () => {
			stdin.removeListener("data", onData);
			stdin.setRawMode?.(false);
			stdin.pause();
			io.out.write(opts.echo ? `\r\u001b[2K${q}(entered)\n` : "\n");
		};
		stdin.on("data", onData);
	});
}
/**
* `enclawed hardware-root status`: the user's diagnosis (present, genuine, operational,
* zeroization, halt state, recovery readiness, and what to do). Read-only: it never changes the
* device or this computer, and never asks for a factor. Returns the exit code: 0 operational and
* CLEAN, 2 DIRTY, 3 not operational / zeroized / not genuine / different unit / no device,
* 1 error.
*/
async function hardwareRootStatusCli(opts = {}, io = defaultIO()) {
	let dx;
	try {
		dx = diagnoseHardwareRoot(await hardwareRootStatusStandalone({ statePath: opts.statePath }));
	} catch (e) {
		io.err.write(`enclawed: hardware-root status failed: ${e.message ?? String(e)}\n`);
		return 1;
	}
	io.out.write(opts.json ? `${JSON.stringify(dx, null, 2)}\n` : renderHardwareRootDiagnosis(dx));
	return dx.exitCode;
}
/**
* `enclawed hardware-root recover`. Interactive only: stdin and stdout must be a terminal, so no
* typed code can be piped from or into a file. Returns the exit code.
*/
async function hardwareRootRecoverCli(opts = {}, io = defaultIO()) {
	const audit = async (ev) => {
		try {
			await opts.audit?.(ev);
		} catch {}
	};
	if (!io.stdin.isTTY || !io.stdoutIsTTY) {
		io.err.write("enclawed: recovery requires an interactive terminal (stdin and stdout); run it yourself at a console, with the Enclaweder plugged in\n");
		await audit({
			outcome: "refused",
			code: "no-tty"
		});
		return 1;
	}
	const st = await hardwareRootStatusStandalone({ statePath: opts.statePath });
	if (st.owner) {
		io.err.write("enclawed: an Enclawed process on this machine owns the Enclaweder; stop it first\n");
		await audit({
			outcome: "refused",
			code: "owner-running"
		});
		return 1;
	}
	const dev = st.devices.find((d) => d.latch?.state === "SET") ?? st.devices[0];
	if (!dev) {
		io.err.write("enclawed: no Enclaweder detected on the bus\n");
		return 1;
	}
	if (!dev.latch) {
		io.err.write(`enclawed: ${dev.latchError}\n`);
		await audit({
			outcome: "refused",
			code: "latch-unavailable",
			serial: dev.serial
		});
		return 1;
	}
	const hostDirty = st.hostLatches.find((l) => l.status === "DIRTY");
	if (dev.latch.state !== "SET" && !hostDirty) {
		io.out.write(`Nothing to recover: enclaweder ${dev.serial} reports its latch CLEAN.\n`);
		return 0;
	}
	io.out.write(`Hardware root is DIRTY: accreditation is halted.\n  device: ${hostDirty?.bound?.serial ?? dev.serial}\n  reason: ${dev.latch.state === "SET" ? dev.latch.reasonText : hostDirty?.dirty?.reason ?? "(unrecorded)"}\n`);
	io.out.write("Confirm you are physically holding the bound Enclaweder.\n");
	const typedUid = typedSerialUid(await ask(io, "Type the serial printed on it (ENCLW-... or ECPRO-..., all 24 characters after the dash): "));
	if (!typedUid || typedUid !== dev.uid) {
		io.out.write("Aborted: the serial did not match. Nothing was changed.\n");
		await audit({
			outcome: "aborted",
			code: "serial-mismatch",
			serial: dev.serial
		});
		return 1;
	}
	let auth;
	if (opts.operatorKeys?.length || opts.operatorOffline) {
		let signers;
		if (opts.operatorKeys?.length) try {
			signers = opts.operatorKeys.map((f) => {
				const stt = fs.statSync(f);
				if (process.platform !== "win32" && (stt.mode & 63) !== 0) throw new Error(`${f} is readable or writable by others (mode ${(stt.mode & 511).toString(8)})`);
				const k = createPrivateKey(fs.readFileSync(f));
				if (k.asymmetricKeyType !== "ed25519") throw new Error(`${f} is not an Ed25519 private key`);
				return (msg) => sign(null, msg, k);
			});
		} catch (e) {
			io.err.write(`enclawed: operator keys: ${e.message}\n`);
			await audit({
				outcome: "refused",
				code: "operator-keys"
			});
			return 1;
		}
		else {
			const count = Math.max(1, Math.min(8, opts.operatorOffline ?? 1));
			signers = Array.from({ length: count }, (_v, i) => async (msg) => {
				io.out.write(`\nOperator ${i + 1} of ${count}: sign this message (hex) with your operator key, on your own device:\n${msg.toString("hex")}\n`);
				const hex = (await ask(io, "Paste the 64-byte Ed25519 signature (hex): ")).replace(/\s/g, "");
				return Buffer.from(/^[0-9a-f]{128}$/i.test(hex) ? hex : "", "hex");
			});
		}
		auth = {
			kind: "operator-quorum",
			signers
		};
	} else {
		io.out.write("\nTwo factors, both checked by the Enclaweder itself:\n  1. a current code from your authenticator app (or your security key, with --fido)\n  2. one of your one-time recovery codes (used once, then dead)\nBoth are typed on this computer: that is why each works only once.\n\n");
		let factorA;
		if (opts.fido) {
			const a = await fidoAssert(opts.fido, opts.hidraw, io);
			if (!a) {
				await audit({
					outcome: "refused",
					code: "fido-unavailable",
					serial: dev.serial
				});
				return 1;
			}
			factorA = a;
		} else {
			const t = parseTotp(await askSecret(io, "Authenticator code (6 digits): "));
			if (t === null) {
				io.out.write("That is not a 6-digit code. Nothing was sent.\n");
				return 1;
			}
			factorA = {
				kind: "totp",
				code: t,
				hostTimeS: Math.floor(Date.now() / 1e3)
			};
		}
		const parsed = parseRecoveryCode(await askSecret(io, "Recovery code (dashes optional, shown while you type): ", { echo: true }));
		if (!parsed.ok) {
			io.out.write(`That recovery code is not valid (${parsed.code}): check it against your paper copy. Nothing was sent to the device.\n`);
			await audit({
				outcome: "refused",
				code: `code-${parsed.code}`,
				serial: dev.serial
			});
			return 1;
		}
		auth = {
			kind: "two-factor",
			recoveryCode: parsed.bytes,
			factorA
		};
	}
	try {
		const r = await recoverHardwareRootStandalone({
			auth,
			statePath: opts.statePath,
			hidraw: opts.hidraw
		});
		await audit({
			outcome: r.recovered ? "recovered" : "not-recovered",
			serial: r.serial ?? dev.serial,
			via: auth.kind
		});
		io.out.write(r.recovered ? `Recovered: enclaweder ${r.serial ?? dev.serial} reports its latch CLEAN again.\n` : "Recovery did not complete; the latch is unchanged.\n");
		return r.recovered ? 0 : 1;
	} catch (e) {
		const msg = e.message ?? String(e);
		await audit({
			outcome: "refused",
			code: "device-refused",
			serial: dev.serial,
			via: auth.kind,
			detail: msg.slice(0, 300)
		});
		io.err.write(`enclawed: recovery REFUSED: ${msg}\nThe device keeps its latch and counts the attempt; repeated failures back off and then lock the two-factor path (operator quorum only).\n`);
		return 1;
	}
}
/**
* FIDO2 factor through libfido2's `fido2-assert` (package fido2-tools): the device's one-shot
* nonce is the clientDataHash, the RP id is fixed, user verification (PIN or biometric) required.
*/
async function fidoAssert(token, hidraw, io) {
	const { spawnSync } = await import("node:child_process");
	const { Enclaweder } = await import("./enclaweder-hid-CPLkJTj6.js");
	const { findAllEnclaweders } = await import("./enclaweder-hid-CPLkJTj6.js");
	const path = hidraw ?? findAllEnclaweders()[0];
	if (!path) return null;
	const d = new Enclaweder(path);
	let ch;
	try {
		ch = await fidoChallenge(d);
	} catch (e) {
		io.err.write(`enclawed: the device issued no FIDO2 challenge: ${e.message}\n`);
		return null;
	} finally {
		d.close();
	}
	const input = `${ch.clientDataHash.toString("base64")}\n${FIDO_RP_ID}\n${ch.credentialId.toString("base64")}\n`;
	io.out.write("Touch your security key and enter its PIN when asked.\n");
	const r = spawnSync("fido2-assert", [
		"-G",
		"-v",
		"-t",
		"up=true",
		token
	], {
		input,
		encoding: "utf8",
		stdio: [
			"pipe",
			"pipe",
			"inherit"
		]
	});
	if (r.error || r.status !== 0) {
		io.err.write(`enclawed: fido2-assert failed${r.error ? ` (${r.error.message}; install fido2-tools)` : ""}\n`);
		return null;
	}
	const lines = r.stdout.trim().split("\n");
	const cbor = Buffer.from(lines[2] ?? "", "base64");
	const authData = cbor[0] === 88 ? cbor.subarray(2, 2 + cbor[1]) : cbor;
	return {
		kind: "fido2",
		authenticatorData: Buffer.from(authData),
		signature: Buffer.from(lines[3] ?? "", "base64")
	};
}
//#endregion
export { diagnoseHardwareRoot as a, typedSerialUid as i, hardwareRootRecoverCli as n, renderHardwareRootDiagnosis as o, hardwareRootStatusCli as r, askSecret as t };
