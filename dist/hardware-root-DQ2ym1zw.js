import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { A as realStateWriteRefusal, D as pinnedPathRefusal, E as verifyChallenge, T as verifyCert, _ as findAllEnclaweders, a as ANCHOR_OPEN_TIMEOUT_MS, l as AnchorSession, m as Enclaweder, t as ACC_STATE, u as DeviceTransientError, y as rawEd25519ToPem } from "./enclaweder-hid-B_ZViqzj.js";
import { t as hostUid } from "./userns-Om3FzFOv.js";
import { a as noteActivation, c as proveCommandSet05, l as spendActivation, r as bindingNames, s as peekActivation, t as CS05 } from "./activation-CjSFhqw4.js";
import { t as CLOCK_DISAGREES_TEXT } from "./clock-disagrees-text-B9EMsSXG.js";
import { n as checkVerdictAnswer, t as TOTP_PURPOSE } from "./totp-verify-Dcx-evp7.js";
import { i as verifyChain, r as fileHeadAnchor, t as AuditLogger } from "./audit-log-B0xJdvPI.js";
import { n as hardwareRootMode } from "./root-mode-CIk3nj2e.js";
import fs, { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path, { dirname, join } from "node:path";
import os from "node:os";
import { createHash, createHmac, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, timingSafeEqual, verify } from "node:crypto";
import "node:readline";
import net from "node:net";
//#region src/enclawed/hardware-root/device-latch.ts
const LT = {
	AUTH_CHALLENGE: 18,
	LATCH_GET: 28,
	LATCH_HALT: 29,
	LATCH_OPEN: 30,
	LATCH_KEEPALIVE: 31,
	LATCH_CLOSE: 32,
	LATCH_CLEAR: 33,
	LATCH_CLEAR_2FA: 34,
	REISSUE_RECOVERY: 35,
	LATCH_LOG: 36,
	OPERATOR_HANDOVER: 37,
	CUSTODY_GET: 38,
	FIDO_CHALLENGE: 39,
	SET_HOST_TIME: 40,
	FAILLOG_GET: 41,
	LATCH_CHECKPOINT: 44
};
const ST$1 = {
	OK: 0,
	BAD_ARG: 1,
	BAD_STATE: 2,
	NOT_ENROLLED: 3,
	AUTH: 5,
	BUSY: 7,
	UNSUPPORTED: 8,
	LOCKED: 9,
	TIME: 10
};
const TAG = (s) => Buffer.from(s, "latin1");
const TAG_GET = TAG("ECW-LATCH-GET-01");
const TAG_OPEN = TAG("ECW-LATCH-OPN-01");
const TAG_KDF = TAG("ECW-LATCH-KDF-01");
const TAG_KAL = TAG("ECW-LATCH-KAL-01");
const TAG_CLS = TAG("ECW-LATCH-CLS-01");
const TAG_HLT = TAG("ECW-LATCH-HLT-01");
const TAG_CKP = TAG("ECW-LATCH-CKP-01");
TAG("ECW-JOURNAL-CK-01");
TAG("ECW-LATCH-LOG-01");
const TAG_FLG = TAG("ECW-FAILLOG-GT01");
const TAG_CUS = TAG("ECW-CUSTODY-GET1");
const OPER_AUTH = TAG("ECW-OPER-AUTH-01");
const X25519_SPKI$1 = Buffer.from("302a300506032b656e032100", "hex");
/** Lease the device grants a latch session; keep refreshing well inside it. */
const LATCH_LEASE_MS = 12e4;
const LATCH_KEEPALIVE_INTERVAL_MS = 3e4;
/**
* Keepalives in a row that may go unanswered before the host calls the session lost. Two misses
* leave the third renewal 90 s after the last good one, inside the 120 s lease, so the device
* never lapses on account of a loaded host; a third miss, or any definite refusal, is a loss.
* The device keeps its own lease either way: this only stops the host halting on a hiccup.
* Internal on purpose (no setting).
*/
const KEEPALIVE_MISSES_TOLERATED = 2;
/** Host sub-reason codes sent in LATCH_HALT (opaque to the device; for the operator's eyes). */
const HOST_HALT_CODE = {
	GUARD_CHECK_FAILED: 1,
	HOST_MIRROR: 16,
	DISCONNECT_SEEN: 17,
	OPERATOR_REQUEST: 32
};
const LATCH_REASON = {
	0: "none",
	1: "host halt (latch session)",
	2: "host halt (anchor session)",
	3: "host halt (no session)",
	4: "host session lapsed without a clean close",
	5: "USB re-enumeration while the host session was open",
	6: "power loss / unplug while the host session was open",
	7: "tamper",
	8: "environmental failure",
	9: "attestation quorum failure",
	10: "entropy health failure",
	11: "operator zeroize",
	12: "self-test failure"
};
/** What a person reads for each refusal; the command and status stay on the error's fields. */
const LATCH_ERROR_TEXT = {
	unsupported: "the device's firmware is too old for the halt latch: update the Enclaweder firmware",
	"no-response": "the device did not answer",
	"bad-signature": "the device's answer did not verify under its certified key",
	"bad-record": "the device's answer was malformed",
	locked: "the device is locked: its halt state is set, or recovery is locked after repeated failures",
	busy: "the device is busy",
	auth: "the device refused: authentication failed",
	"not-enrolled": "not set up on the device",
	"bad-state": "the device refused in its current state",
	"clock-disagrees": CLOCK_DISAGREES_TEXT,
	rejected: "the device rejected the request"
};
var DeviceLatchError = class extends Error {
	constructor(op, code, status = null, waitMs = null) {
		super(`${LATCH_ERROR_TEXT[code]}${waitMs ? `; try again in ${Math.ceil(waitMs / 1e3)} s` : ""}`);
		this.name = "DeviceLatchError";
		this.op = op;
		this.code = code;
		this.status = status;
		this.waitMs = waitMs;
	}
};
function codeOf(status) {
	switch (status) {
		case ST$1.UNSUPPORTED: return "unsupported";
		case ST$1.LOCKED: return "locked";
		case ST$1.BUSY: return "busy";
		case ST$1.AUTH: return "auth";
		case ST$1.TIME: return "clock-disagrees";
		case ST$1.NOT_ENROLLED: return "not-enrolled";
		case ST$1.BAD_STATE: return "bad-state";
		default: return "rejected";
	}
}
function fail(op, p) {
	const wait = (p[0] === ST$1.BUSY || p[0] === ST$1.AUTH || p[0] === ST$1.TIME) && p.length >= 5 ? p.readUInt32LE(1) : null;
	throw new DeviceLatchError(op, codeOf(p[0]), p[0], wait);
}
function le64$2(v) {
	const b = Buffer.alloc(8);
	b.writeBigUInt64LE(v);
	return b;
}
function le32$1(v) {
	const b = Buffer.alloc(4);
	b.writeUInt32LE(v >>> 0);
	return b;
}
function verifyBy$1(devicePubRaw, msg, sig) {
	try {
		return verify(null, msg, createPublicKey(rawEd25519ToPem(devicePubRaw)), sig);
	} catch {
		return false;
	}
}
async function call$1(dev, op, type, payload, timeoutMs = 5e3) {
	const f = await dev.request(type, 1, payload, timeoutMs);
	if (!f) throw new DeviceLatchError(op, "no-response");
	return f.payload;
}
/**
* Whether `err` means "no answer" rather than a wrong answer: the device did not answer in time
* (no-response), or its node went away (gone; USB re-enumeration, usbipd re-attach). Anything
* else the device said, or a signature that did not verify, is a definite answer: null.
*/
function transientDeviceError(err) {
	if (err instanceof DeviceTransientError) return err.code;
	if (err instanceof DeviceLatchError && err.code === "no-response") return "no-answer";
	const errno = err?.code;
	if (errno === "ENODEV" || errno === "EIO" || errno === "ENOENT") return "gone";
	return null;
}
/** Parse + verify a LATCH_GET answer against the nonce we sent and the certified device key. */
function parseDeviceLatch(p, nonce, devicePubRaw, uid) {
	if (p[0] !== ST$1.OK) fail("LATCH_GET", p);
	if (p.length !== 129) throw new DeviceLatchError("LATCH_GET", "bad-record", p[0]);
	const b = p.subarray(1, 65);
	if (!verifyBy$1(devicePubRaw, Buffer.concat([
		TAG_GET,
		nonce,
		b
	]), p.subarray(65, 129))) throw new DeviceLatchError("LATCH_GET", "bad-signature");
	const devUid = Buffer.from(b.subarray(52, 64));
	if (uid && !devUid.equals(uid)) throw new DeviceLatchError("LATCH_GET", "bad-record");
	if (b[0] !== 1) throw new DeviceLatchError("LATCH_GET", "bad-record");
	const flags = b[4];
	const since = b.readUInt32LE(32);
	return {
		state: b[1] ? "SET" : "CLEAR",
		reason: b[2],
		reasonText: LATCH_REASON[b[2]] ?? `reason ${b[2]}`,
		hostCode: b[3],
		flags,
		operatorAuthority: Boolean(flags & 1),
		factorsValid: Boolean(flags & 2),
		twoFactorLocked: Boolean(flags & 4),
		armed: Boolean(flags & 8),
		sessionLive: Boolean(flags & 16),
		custodyHandedOver: Boolean(flags & 64),
		codesLeft: b[5],
		failedAttempts: b[6],
		lastEvent: b[7],
		seq: b.readBigUInt64LE(8),
		setSeq: b.readBigUInt64LE(16),
		sid: b.readBigUInt64LE(24),
		sinceMs: b[1] && flags & 32 ? since : null,
		codeEpoch: b.readUInt32LE(36),
		custody: b.readUInt32LE(40),
		codeWaitMs: b.readUInt32LE(44),
		factorKind: b[48] === 2 ? "authenticator-app" : b[48] === 1 ? "security-key" : "none",
		uid: devUid
	};
}
/** LATCH_GET with a fresh nonce. Throws DeviceLatchError("unsupported") on firmware < 0.3. */
async function readDeviceLatch(dev, devicePubRaw, uid, timeoutMs = 5e3) {
	const nonce = randomBytes(32);
	return parseDeviceLatch(await call$1(dev, "LATCH_GET", LT.LATCH_GET, nonce, timeoutMs), nonce, devicePubRaw, uid);
}
/**
* LATCH_GET over a caller's nonce, answer unverified (the broker relays it to clients, who
* verify it themselves against the certified key; finding H1). Throws only when nothing came.
*/
async function latchGetRaw(dev, nonce32, timeoutMs = 2e3) {
	if (nonce32.length !== 32) throw new DeviceLatchError("LATCH_GET", "rejected");
	return call$1(dev, "LATCH_GET", LT.LATCH_GET, Buffer.from(nonce32), timeoutMs);
}
/** Set the device latch with no session (set-only; always allowed). Idempotent. */
async function haltDeviceAnonymous(dev, hostCode) {
	const p = await call$1(dev, "LATCH_HALT", LT.LATCH_HALT, Buffer.from([0, hostCode & 255]));
	if (p[0] !== ST$1.OK) fail("LATCH_HALT", p);
}
/**
* The guard's host session ("dirty on start"). One per device; a second open is ERR_BUSY.
* K is derived from an X25519 exchange signed by the certified device key and lives only in a
* private field.
*/
var LatchSession = class LatchSession {
	#dev;
	#key;
	#ctr = 0n;
	#closed = false;
	#timer = null;
	constructor(dev, key, sid, uid) {
		this.#dev = dev;
		this.#key = key;
		this.sid = sid;
		this.uid = uid;
	}
	get isOpen() {
		return !this.#closed;
	}
	static async open(dev, devicePubRaw, timeoutMs = 1e4) {
		const eph = generateKeyPairSync("x25519");
		const hostPub = Buffer.from(eph.publicKey.export({
			format: "der",
			type: "spki"
		}).subarray(12));
		const hostNonce = randomBytes(16);
		const p = await call$1(dev, "LATCH_OPEN", LT.LATCH_OPEN, Buffer.concat([hostPub, hostNonce]), timeoutMs);
		if (p[0] !== ST$1.OK) fail("LATCH_OPEN", p);
		if (p.length !== 133) throw new DeviceLatchError("LATCH_OPEN", "bad-record");
		const sid = p.readBigUInt64LE(1);
		const devPub = Buffer.from(p.subarray(9, 41));
		const devNonce = Buffer.from(p.subarray(41, 57));
		const uid = Buffer.from(p.subarray(57, 69));
		if (!verifyBy$1(devicePubRaw, Buffer.concat([
			TAG_OPEN,
			uid,
			le64$2(sid),
			hostPub,
			devPub,
			hostNonce,
			devNonce
		]), p.subarray(69, 133))) throw new DeviceLatchError("LATCH_OPEN", "bad-signature");
		let shared;
		try {
			shared = diffieHellman({
				privateKey: eph.privateKey,
				publicKey: createPublicKey({
					key: Buffer.concat([X25519_SPKI$1, devPub]),
					format: "der",
					type: "spki"
				})
			});
		} catch {
			throw new DeviceLatchError("LATCH_OPEN", "bad-record");
		}
		const key = Buffer.from(hkdfSync("sha3-256", shared, Buffer.concat([hostNonce, devNonce]), Buffer.concat([
			TAG_KDF,
			uid,
			le64$2(sid),
			hostPub,
			devPub
		]), 32));
		shared.fill(0);
		return new LatchSession(dev, key, sid, uid);
	}
	#authed(tag, extra = Buffer.alloc(0)) {
		this.#ctr += 1n;
		const mac = createHmac("sha3-256", this.#key).update(Buffer.concat([
			tag,
			this.uid,
			le64$2(this.sid),
			le64$2(this.#ctr),
			extra
		])).digest();
		return Buffer.concat([
			le64$2(this.sid),
			le64$2(this.#ctr),
			extra,
			mac
		]);
	}
	/** Renew the lease. Returns the lease granted (ms). */
	async keepalive() {
		if (this.#closed) throw new DeviceLatchError("LATCH_KEEPALIVE", "bad-state");
		const p = await call$1(this.#dev, "LATCH_KEEPALIVE", LT.LATCH_KEEPALIVE, this.#authed(TAG_KAL));
		if (p[0] !== ST$1.OK) fail("LATCH_KEEPALIVE", p);
		return p.length >= 5 ? p.readUInt32LE(1) : LATCH_LEASE_MS;
	}
	/** Set the device latch under this session (reason HOST_HALT, `hostCode` recorded). */
	async halt(hostCode) {
		const body = this.#authed(TAG_HLT, Buffer.from([hostCode & 255]));
		const req = Buffer.concat([
			Buffer.from([1, hostCode & 255]),
			body.subarray(0, 16),
			body.subarray(17)
		]);
		const p = await call$1(this.#dev, "LATCH_HALT", LT.LATCH_HALT, req);
		this.#stop();
		this.#closed = true;
		if (p[0] !== ST$1.OK) fail("LATCH_HALT", p);
	}
	/** A journal checkpoint the device signs for this session only (finding H2). */
	async checkpoint(head32) {
		if (head32.length !== 32) throw new Error("journal checkpoint: head must be 32 bytes");
		const body = this.#authed(TAG_CKP, head32);
		const p = await call$1(this.#dev, "LATCH_CHECKPOINT", LT.LATCH_CHECKPOINT, body);
		if (p[0] !== ST$1.OK || p.length !== 81) fail("LATCH_CHECKPOINT", p);
		return {
			uid: this.uid,
			sid: p.readBigUInt64LE(1),
			ck: p.readBigUInt64LE(9),
			sig: Buffer.from(p.subarray(17, 81))
		};
	}
	/** The clean close: the only thing that disarms the device's dirty-on-start flag. */
	async close() {
		if (this.#closed) return;
		this.#stop();
		const p = await call$1(this.#dev, "LATCH_CLOSE", LT.LATCH_CLOSE, this.#authed(TAG_CLS));
		this.#closed = true;
		this.#key.fill(0);
		if (p[0] !== ST$1.OK) fail("LATCH_CLOSE", p);
	}
	/** Best effort at process exit, when nothing can be awaited. */
	closeSync() {
		if (this.#closed) return;
		this.#stop();
		this.#closed = true;
		try {
			this.#dev.sendNoWait?.(LT.LATCH_CLOSE, this.#authed(TAG_CLS));
		} catch {}
		this.#key.fill(0);
	}
	startKeepalive(intervalMs, onLost) {
		this.#stop();
		let misses = 0;
		this.#timer = setInterval(() => {
			this.keepalive().then(() => {
				misses = 0;
			}, (err) => {
				if (transientDeviceError(err) && ++misses <= KEEPALIVE_MISSES_TOLERATED) return;
				this.#stop();
				onLost(err);
			});
		}, intervalMs);
		this.#timer.unref?.();
	}
	#stop() {
		if (this.#timer) {
			clearInterval(this.#timer);
			this.#timer = null;
		}
	}
};
/** The operator-quorum message for one AUTH_CHALLENGE nonce: what each operator signs. */
function operatorAuthMessage(nonce16, cmd, uid, args) {
	return Buffer.concat([
		OPER_AUTH,
		nonce16,
		Buffer.from([cmd]),
		uid,
		args
	]);
}
async function authChallenge(dev) {
	const p = await call$1(dev, "AUTH_CHALLENGE", LT.AUTH_CHALLENGE, Buffer.alloc(0));
	if (p[0] !== ST$1.OK || p.length < 17) fail("AUTH_CHALLENGE", p);
	return Buffer.from(p.subarray(1, 17));
}
/**
* Custodial clear by the operator quorum (lost factors). The signers see the exact message (the
* AUTH_CHALLENGE nonce, LATCH_CLEAR, this uid, the current latch seq) and should be off-host:
* hardware tokens, an air-gapped station, or a key on removable media.
*/
async function clearByOperatorQuorum(dev, devicePubRaw, uid, signers) {
	if (signers.length < 1 || signers.length > 8) throw new Error("operator recovery: needs 1..8 operator signatures");
	const cur = await readDeviceLatch(dev, devicePubRaw, uid);
	const nonce = await authChallenge(dev);
	const msg = operatorAuthMessage(nonce, LT.LATCH_CLEAR, uid, le64$2(cur.seq));
	const sigs = await Promise.all(signers.map(async (s) => Buffer.from(await s(msg))));
	if (sigs.some((s) => s.length !== 64)) throw new Error("operator recovery: an operator signature must be 64 bytes");
	const p = await call$1(dev, "LATCH_CLEAR", LT.LATCH_CLEAR, Buffer.concat([nonce, ...sigs]));
	if (p[0] !== ST$1.OK) fail("LATCH_CLEAR", p);
	return p.length >= 9 ? p.readBigUInt64LE(1) : 0n;
}
/** Two-factor clear. `recoveryCode` is the 16 raw bytes; the caller wipes it afterwards. */
async function clearByTwoFactors(dev, recoveryCode, factorA) {
	if (recoveryCode.length !== 16) throw new Error("a recovery code is 16 bytes");
	let req;
	if (factorA.kind === "totp") {
		const t = Buffer.alloc(8);
		t.writeBigUInt64LE(BigInt(Math.floor(factorA.hostTimeS)));
		req = Buffer.concat([
			recoveryCode,
			Buffer.from([2]),
			le32$1(factorA.code),
			t
		]);
	} else {
		const ad = factorA.authenticatorData;
		if (ad.length < 37 || ad.length > 96 || factorA.signature.length !== 64) throw new Error("FIDO2 assertion malformed");
		req = Buffer.concat([
			recoveryCode,
			Buffer.from([1, ad.length]),
			ad,
			factorA.signature
		]);
	}
	try {
		const p = await call$1(dev, "LATCH_CLEAR_2FA", LT.LATCH_CLEAR_2FA, req, 15e3);
		if (p[0] !== ST$1.OK) fail("LATCH_CLEAR_2FA", p);
		return {
			codeIndex: p[1],
			codesLeft: p[2],
			seq: p.readBigUInt64LE(3)
		};
	} finally {
		req.fill(0);
	}
}
/** FIDO2 factor: the device's one-shot clientDataHash and the registered credential id. */
async function fidoChallenge(dev) {
	const p = await call$1(dev, "FIDO_CHALLENGE", LT.FIDO_CHALLENGE, Buffer.alloc(0));
	if (p[0] !== ST$1.OK || p.length < 38) fail("FIDO_CHALLENGE", p);
	const n = p[37];
	return {
		clientDataHash: Buffer.from(p.subarray(1, 33)),
		counter: p.readUInt32LE(33),
		credentialId: Buffer.from(p.subarray(38, 38 + n))
	};
}
const FIDO_RP_ID = "enclaweder.local";
createHash("sha256").update(FIDO_RP_ID).digest();
const FAIL_OP = {
	1: "two-factor latch clear",
	2: "operator signature",
	3: "anchor-session MAC",
	4: "latch-session MAC",
	5: "TOTP enrollment"
};
const FAIL_REASON = {
	1: "did not verify",
	2: "malformed",
	3: "no/stale challenge",
	4: "locked out",
	5: "TOTP host time disagreed with the device's clock"
};
/** The device's signed failure log (newest first) and its never-resetting total. */
async function readFailLog(dev, devicePubRaw, uid) {
	const nonce = randomBytes(32);
	const p = await call$1(dev, "FAILLOG_GET", LT.FAILLOG_GET, nonce);
	if (p[0] !== ST$1.OK || p.length < 12) fail("FAILLOG_GET", p);
	const n = p[11];
	const bl = 11 + n * 40;
	if (p.length !== 1 + bl + 64) throw new DeviceLatchError("FAILLOG_GET", "bad-record");
	const body = p.subarray(1, 1 + bl);
	if (!verifyBy$1(devicePubRaw, Buffer.concat([
		TAG_FLG,
		nonce,
		uid,
		body
	]), p.subarray(1 + bl, 65 + bl))) throw new DeviceLatchError("FAILLOG_GET", "bad-signature");
	const entries = [];
	for (let i = 0; i < n; i++) {
		const e = body.subarray(11 + i * 40, 51 + i * 40);
		entries.push({
			seq: e.readBigUInt64LE(0),
			total: e.readBigUInt64LE(8),
			sid: e.readUInt32LE(16),
			hostTimeUntrusted: e.readUInt32LE(20),
			tickMs: e.readUInt32LE(24),
			op: e[28],
			opText: FAIL_OP[e[28]] ?? `op ${e[28]}`,
			reason: e[29],
			reasonText: FAIL_REASON[e[29]] ?? `reason ${e[29]}`,
			arg: e[30],
			count: e.readUInt16LE(32)
		});
	}
	return {
		total: body.readBigUInt64LE(0),
		pending: body.readUInt16LE(8),
		entries
	};
}
/** Who holds operator authority, as the device signs it. */
async function readCustody(dev, devicePubRaw, uid) {
	const nonce = randomBytes(32);
	const p = await call$1(dev, "CUSTODY_GET", LT.CUSTODY_GET, nonce);
	if (p[0] !== ST$1.OK || p.length < 7) fail("CUSTODY_GET", p);
	const N = p[6];
	const bl = 6 + N * 32;
	const body = p.subarray(1, 1 + bl);
	if (p.length !== 1 + bl + 64 || !verifyBy$1(devicePubRaw, Buffer.concat([
		TAG_CUS,
		nonce,
		uid,
		body
	]), p.subarray(1 + bl))) throw new DeviceLatchError("CUSTODY_GET", "bad-signature");
	const keys = [];
	for (let i = 0; i < N; i++) keys.push(Buffer.from(body.subarray(6 + i * 32, 38 + i * 32)));
	return {
		counter: body.readUInt32LE(0),
		m: body[4],
		keys
	};
}
//#endregion
//#region src/enclawed/hardware-root/queue-journal.ts
const QUEUE_REQUEST = "device.request";
const QUEUE_SIGNED = "device.signed";
const QUEUE_REFUSED = "device.refused";
const QUEUE_CHECKPOINT = "device.checkpoint";
const CHECKPOINT_TAG = Buffer.from("ENCLAWED-ROOT-QUEUE-CHECKPOINT-01");
/** What the device signs at a checkpoint: the journal's head at that moment. */
function checkpointDigest(head) {
	return createHash("sha256").update(CHECKPOINT_TAG).update(Buffer.from([0])).update(head).digest();
}
/** Where the journal of a machine's device requests lives, beside its guard state. */
function queueJournalPath(statePath) {
	return process.env.ENCLAWEDER_QUEUE_LOG ?? `${statePath}.queue.jsonl`;
}
var QueueJournal = class {
	constructor(filePath) {
		this.filePath = filePath;
		this.head = null;
		this.owner = {
			pid: process.pid,
			since: Date.now()
		};
		const refusal = realStateWriteRefusal(filePath);
		if (refusal) throw new Error(refusal);
		this.log = new AuditLogger({
			filePath,
			headAnchor: fileHeadAnchor(filePath)
		});
	}
	async append(type, payload) {
		const rec = await this.log.append({
			type,
			actor: `hardware-root:${this.owner.pid}`,
			level: null,
			payload: {
				...payload,
				owner: this.owner
			}
		});
		this.head = rec.recordHash;
		return rec;
	}
	request(client, seq, digest, until) {
		return this.append(QUEUE_REQUEST, {
			client,
			seq,
			digest: digest.toString("hex"),
			until
		});
	}
	signed(client, seq, uid, sig) {
		return this.append(QUEUE_SIGNED, {
			client,
			seq,
			uid: uid.toString("hex"),
			sig: sig.toString("hex")
		});
	}
	refused(client, seq, reason) {
		return this.append(QUEUE_REFUSED, {
			client,
			seq,
			reason
		});
	}
	/** A checkpoint the device signed under the owner's latch session (LATCH_CHECKPOINT, H2). */
	checkpoint(covers, uid, sig, sid, ck) {
		return this.append(QUEUE_CHECKPOINT, {
			covers,
			uid: uid.toString("hex"),
			sig: sig.toString("hex"),
			sid: String(sid),
			ck: String(ck)
		});
	}
	/** The hash of the last record written, or null before the first. */
	currentHead() {
		return this.head;
	}
	close() {
		return this.log.close();
	}
};
//#endregion
//#region src/enclawed/hardware-root/broker.ts
/** Domain tag of the digest a batch of client nonces is attested under. */
const ATTEST_TAG = Buffer.from("ECW-BROKER-ATT-1", "latin1");
/** The most client nonces one device latch read covers. */
const MAX_ATTEST_BATCH = 256;
/**
* The nonce the device signs for a batch of client nonces: one LATCH_GET per member serves
* every client polling at once, and each client checks that its own nonce is in the batch.
*/
function attestDigest(nonces) {
	const h = createHash("sha256").update(ATTEST_TAG);
	for (const n of nonces) h.update(n);
	return h.digest();
}
/**
* The audit-anchor frames a client may relay, with each request's exact length: ANCHOR_SET
* (head, sid, counter, MAC), ANCHOR_GET (empty), ANCHOR_OPEN (the client's X25519 half and
* nonce; an operator takeover is never relayed), ANCHOR_CLOSE and ANCHOR_KEEPALIVE (sid,
* counter, MAC), and ANCHOR_READ (command set 0.5: the client's nonce).
*/
const ANCHOR_RELAY_LENGTHS = Object.freeze({
	23: 80,
	24: 0,
	25: 48,
	26: 48,
	27: 48,
	56: 32
});
/** Bounds of the broker's relay ops: frame sizes, and requests per client per second. */
const RELAY_LIMITS = Object.freeze({
	sealOpenLen: 48,
	sealedMinLen: 43,
	sealedMaxLen: 363,
	sealedPerSecond: 8,
	unlockUseLen: 80,
	unlockUsePerSecond: 4,
	entropyMaxBytes: 64,
	entropyPerSecond: 4,
	anchorPerSecond: 8
});
/**
* Checks one relay request against RELAY_LIMITS (shape only, nothing about the device). Returns
* the decoded frame, or a reason. Exported for the bounds tests.
*/
function checkRelayRequest(req) {
	if (req.op === "anchor") {
		const want = typeof req.type === "number" && Object.hasOwn(ANCHOR_RELAY_LENGTHS, req.type) ? ANCHOR_RELAY_LENGTHS[req.type] : void 0;
		if (want === void 0) return {
			ok: false,
			error: "anchor: only audit-anchor frames are relayed"
		};
		if (typeof req.frame !== "string" || req.frame.length !== want * 2 || !/^([0-9a-f]{2})*$/.test(req.frame)) return {
			ok: false,
			error: `anchor: frame must be ${want} bytes of hex`
		};
		return {
			ok: true,
			anchorType: req.type,
			frame: Buffer.from(req.frame, "hex")
		};
	}
	if (req.op === "unlock-use") {
		if (typeof req.frame !== "string" || req.frame.length !== RELAY_LIMITS.unlockUseLen * 2 || !/^[0-9a-f]+$/.test(req.frame)) return {
			ok: false,
			error: `unlock-use: frame must be ${RELAY_LIMITS.unlockUseLen} bytes of hex`
		};
		return {
			ok: true,
			frame: Buffer.from(req.frame, "hex")
		};
	}
	if (req.op === "entropy") {
		const n = req.n;
		if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > RELAY_LIMITS.entropyMaxBytes) return {
			ok: false,
			error: `entropy: 1..${RELAY_LIMITS.entropyMaxBytes} bytes`
		};
		return {
			ok: true,
			n
		};
	}
	if (req.type !== 53 && req.type !== 54) return {
		ok: false,
		error: "sealed: only sealed-factor frames are relayed"
	};
	if (typeof req.frame !== "string" || !/^([0-9a-f]{2})*$/.test(req.frame)) return {
		ok: false,
		error: "sealed: frame must be hex"
	};
	const frame = Buffer.from(req.frame, "hex");
	if (!(req.type === 53 ? frame.length === RELAY_LIMITS.sealOpenLen : frame.length >= RELAY_LIMITS.sealedMinLen && frame.length <= RELAY_LIMITS.sealedMaxLen)) return {
		ok: false,
		error: "sealed: frame length out of bounds"
	};
	return {
		ok: true,
		type: req.type,
		frame
	};
}
/** A per-client rate limit: at most `perSecond` requests in any one-second window. */
var RelayRateLimit = class {
	#times = [];
	constructor(perSecond, now = () => performance.now()) {
		this.perSecond = perSecond;
		this.now = now;
	}
	take() {
		const t = this.now();
		this.#times = this.#times.filter((x) => t - x < 1e3);
		if (this.#times.length >= this.perSecond) return false;
		this.#times.push(t);
		return true;
	}
};
/**
* The socket the machine's owner listens on, for this user: ONE path per host user (finding
* H11), never something the environment chooses between. On Linux it is
* `/run/user/<host uid>/enclawed/enclaweder.sock`, built from the HOST uid (finding N16: a
* process in `unshare -r` is uid 0 to itself, and must still find the host user's owner rather
* than become a second one). XDG_RUNTIME_DIR and TMPDIR are not consulted: a process with one
* and a process without would look for two different owners. Without /run/user/<uid> there is
* no broker path, and boot refuses (brokerPathError) instead of falling back. Elsewhere (no
* /run/user: macOS, Windows) the per-user temporary directory of the account is used.
* ENCLAWEDER_BROKER remains the operator's explicit override (an absolute path), or "off".
*/
function brokerSocketPath() {
	const explicit = process.env.ENCLAWEDER_BROKER;
	if (explicit && !brokerDisabled()) return explicit;
	if (process.platform === "linux") {
		const uid = hostUid();
		return path.join("/run/user", uid === null ? "unmapped" : String(uid), "enclawed", "enclaweder.sock");
	}
	return path.join(os.tmpdir(), "enclawed-broker", "enclaweder.sock");
}
/**
* Why the broker path cannot be used, or null: on Linux the host uid must be known and its
* runtime directory (/run/user/<uid>) must exist. Refusing is the point (finding H11): a
* fallback that depends on the environment splits one machine into two owners.
*/
function brokerPathError() {
	if (process.env.ENCLAWEDER_BROKER && !brokerDisabled()) return path.isAbsolute(process.env.ENCLAWEDER_BROKER) ? null : "ENCLAWEDER_BROKER must be an absolute path";
	if (process.platform !== "linux") return null;
	const uid = hostUid();
	if (uid === null) return "the host uid of this process is not mapped, so the hardware root broker cannot be found";
	try {
		if (!statSync(`/run/user/${uid}`).isDirectory()) return `/run/user/${uid} is not a directory`;
	} catch {
		return `no runtime directory /run/user/${uid} (log in through a session manager, or set ENCLAWEDER_BROKER to an absolute socket path)`;
	}
	return null;
}
/** True when sharing is turned off: every process binds the devices itself. */
function brokerDisabled() {
	const v = (process.env.ENCLAWEDER_BROKER ?? "").trim().toLowerCase();
	return v === "off" || v === "0" || v === "false";
}
/**
* Makes sure the socket's directory is this user's own, a real directory, and
* closed to everyone else; creates it so if absent. Throws otherwise: a
* directory another user controls could hold a socket that impersonates the
* owner.
*/
function secureSocketDir(socketPath) {
	if (Buffer.byteLength(socketPath) > 107) throw new Error(`hardware root broker: socket path is longer than 107 bytes: ${socketPath}`);
	const dir = path.dirname(socketPath);
	if (!existsSync(dir)) mkdirSync(dir, {
		recursive: true,
		mode: 448
	});
	const st = lstatSync(dir);
	if (!st.isDirectory() || st.isSymbolicLink()) throw new Error(`hardware root broker: ${dir} is not a directory`);
	const uid = process.getuid?.();
	if (uid !== void 0 && st.uid !== uid) throw new Error(`hardware root broker: ${dir} belongs to another user`);
	if ((st.mode & 63) !== 0) throw new Error(`hardware root broker: ${dir} is open to other users`);
}
/**
* The owner's scheduler for device work. Every process on the machine shares
* the devices, so their requests are scheduled, never raced:
*
*  - fair share: queues are per client and served round-robin, so one client
*    that floods the device cannot starve another's heartbeats;
*  - bounded: a client may have at most `maxQueued` requests waiting; more are
*    refused at once ("busy") without touching a device. A device does on the
*    order of ten operations a second, so a few waiting requests is already a
*    backlog of a heartbeat interval;
*  - deadlines: a request that waited longer than its deadline (its own, or
*    `maxWaitMs`, whichever is shorter) is answered "timed out" and never
*    sent: a heartbeat signed after its interval has passed is of no use;
*  - concurrency: at most `slots()` requests run at once, one per device (the
*    device itself takes one request on the wire at a time).
*/
var DeviceScheduler = class {
	constructor(exec, slots, opts = {
		maxQueued: 4,
		maxWaitMs: 1e3
	}, now = Date.now) {
		this.exec = exec;
		this.slots = slots;
		this.opts = opts;
		this.now = now;
		this.queues = /* @__PURE__ */ new Map();
		this.held = /* @__PURE__ */ new Map();
		this.order = [];
		this.lastServed = null;
		this.running = 0;
		this.seq = 0;
		this.gone = /* @__PURE__ */ new Set();
		this.timer = null;
		this.checkpointed = null;
		this.checkpointing = false;
		if (opts.journal) {
			this.timer = setInterval(() => void this.checkpoint(), opts.checkpointMs ?? 1e3);
			this.timer.unref();
		}
	}
	/** Requests waiting and running. */
	stats() {
		let queued = 0;
		for (const q of this.queues.values()) queued += q.length;
		return {
			queued,
			running: this.running,
			clients: this.queues.size
		};
	}
	submit(client, digest, deadlineMs) {
		return this.enqueue(client, digest, deadlineMs, false);
	}
	async enqueue(client, digest, deadlineMs, internal) {
		const seq = ++this.seq;
		const journal = internal ? void 0 : this.opts.journal;
		const d = Buffer.from(digest);
		if ((this.held.get(client) ?? 0) >= this.opts.maxQueued) {
			await journal?.refused(client, seq, "busy");
			throw new Error("busy: too many requests waiting from this process");
		}
		this.held.set(client, (this.held.get(client) ?? 0) + 1);
		const wait = Math.min(this.opts.maxWaitMs, deadlineMs ?? this.opts.maxWaitMs);
		const until = this.now() + Math.max(0, wait);
		try {
			await journal?.request(client, seq, d, until);
		} catch (err) {
			this.release(client);
			throw err;
		}
		return new Promise((resolve, reject) => {
			const job = Object.freeze({
				client,
				seq,
				digest: d,
				until,
				journal,
				resolve,
				reject
			});
			if (this.gone.has(client)) {
				this.release(client);
				this.finish(job, /* @__PURE__ */ new Error("client gone"));
				return;
			}
			let q = this.queues.get(client);
			if (!q) {
				q = [];
				this.queues.set(client, q);
				this.order.push(client);
			}
			q.push(job);
			this.pump();
		});
	}
	release(client) {
		const n = (this.held.get(client) ?? 1) - 1;
		if (n <= 0) this.held.delete(client);
		else this.held.set(client, n);
	}
	/** A client went away: its waiting requests are dropped, unsent. */
	forget(client) {
		this.gone.add(client);
		for (const job of this.queues.get(client) ?? []) {
			this.release(client);
			this.finish(job, /* @__PURE__ */ new Error("client gone"));
		}
		this.queues.delete(client);
		this.order = this.order.filter((c) => c !== client);
	}
	/** Stops the checkpoint timer. */
	stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
	/**
	* Has the device sign the journal's head, if it grew since the last
	* checkpoint. The checkpoint goes through the queue like any request, and
	* writes only its own record, so an idle journal is not checkpointed again.
	*/
	async checkpoint() {
		const journal = this.opts.journal;
		const head = journal?.currentHead();
		if (!journal || !head || head === this.checkpointed || this.checkpointing) return;
		const signer = this.opts.checkpointSigner;
		if (!signer) return;
		this.checkpointing = true;
		try {
			const r = await signer(checkpointDigest(head));
			await journal.checkpoint(head, r.uid, r.sig, r.sid, r.ck);
			this.checkpointed = journal.currentHead();
		} catch {} finally {
			this.checkpointing = false;
		}
	}
	/** Records the outcome, then hands it back: nothing leaves unrecorded. */
	async finish(job, result) {
		try {
			if (result instanceof Error) {
				await job.journal?.refused(job.client, job.seq, result.message);
				job.reject(result);
			} else {
				await job.journal?.signed(job.client, job.seq, result.uid, result.sig);
				job.resolve(result);
			}
		} catch (err) {
			job.reject(err);
		}
	}
	nextJob() {
		const n = this.order.length;
		const after = this.lastServed === null ? -1 : this.order.indexOf(this.lastServed);
		for (let tried = 0; tried < n; tried++) {
			const client = this.order[(after + 1 + tried) % n];
			const q = this.queues.get(client) ?? [];
			while (q.length > 0) {
				const job = q.shift();
				this.release(client);
				if (this.now() > job.until) {
					this.finish(job, /* @__PURE__ */ new Error("timed out waiting for the device"));
					continue;
				}
				this.lastServed = client;
				return job;
			}
		}
		return null;
	}
	pump() {
		while (this.running < Math.max(1, this.slots())) {
			const job = this.nextJob();
			if (!job) return;
			this.running++;
			this.exec(job.digest).then((r) => {
				this.running--;
				this.finish(job, r);
				this.pump();
			}, (err) => {
				this.running--;
				this.finish(job, err);
				this.pump();
			});
		}
	}
};
/** How long the owner waits for one batched latch read from its devices. */
const ATTEST_TIMEOUT_MS = 2500;
/**
* Coalesces the clients' attestation nonces: while one batch is being signed, new nonces wait
* for the next. So the device does one LATCH_GET per member per round, however many clients poll.
*/
var Attestor = class {
	constructor(svc) {
		this.svc = svc;
		this.waiting = [];
		this.running = false;
	}
	attest(nonce) {
		return new Promise((resolve, reject) => {
			this.waiting.push({
				nonce,
				done: (r) => r instanceof Error ? reject(r) : resolve(r)
			});
			this.pump();
		});
	}
	pump() {
		if (this.running || this.waiting.length === 0) return;
		this.running = true;
		setImmediate(() => void this.round());
	}
	async round() {
		const batch = this.waiting.splice(0, MAX_ATTEST_BATCH);
		const nonces = batch.map((b) => b.nonce);
		let out;
		try {
			if (!this.svc.attest) throw new Error("this owner offers no device attestation");
			let timer;
			const members = await Promise.race([this.svc.attest(attestDigest(nonces)), new Promise((_, rej) => {
				timer = setTimeout(() => rej(/* @__PURE__ */ new Error("the devices did not answer the attestation in time")), ATTEST_TIMEOUT_MS);
			})]).finally(() => clearTimeout(timer));
			out = {
				nonces: nonces.map((n) => n.toString("hex")),
				members
			};
		} catch (err) {
			out = err;
		}
		for (const b of batch) b.done(out);
		this.running = false;
		this.pump();
	}
};
const MAX_LINE = 65536;
/**
* Claims the owner's socket: listens on it and returns the server, or returns
* null when a live owner already answers there. A socket nobody listens on is
* stale (its owner died) and is replaced, but only that exact file: one that
* is merely busy, or was replaced meanwhile, is never removed.
*/
async function claimOwnership(socketPath) {
	secureSocketDir(socketPath);
	const deadline = Date.now() + 15e3;
	while (Date.now() < deadline) {
		const server = net.createServer();
		const ok = await new Promise((resolve) => {
			server.once("error", (err) => resolve(err.code === "EADDRINUSE" ? "in-use" : err));
			server.listen({
				path: socketPath,
				backlog: 511
			}, () => resolve(true));
		});
		if (ok === true) {
			try {
				chmodSync(socketPath, 384);
			} catch {
				await new Promise((r) => server.close(() => r()));
				continue;
			}
			return server;
		}
		if (ok instanceof Error) throw new Error(`hardware root broker: cannot listen on ${socketPath}: ${ok.message}`);
		let before;
		try {
			before = lstatSync(socketPath).ino;
		} catch {
			continue;
		}
		const state = await probeOwner(socketPath);
		if (state === "live") return null;
		if (state === "busy") {
			await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
			continue;
		}
		try {
			if (lstatSync(socketPath).ino === before) unlinkSync(socketPath);
		} catch {}
	}
	throw new Error("hardware root broker: the owner's socket stayed busy");
}
/**
* Whether an owner listens on the socket: "live" (it accepted), "stale"
* (nobody listens: refused, or no such file), or "busy" (any other failure,
* such as a full backlog; never a reason to remove the socket).
*/
function probeOwner(socketPath) {
	return new Promise((resolve) => {
		const s = net.connect(socketPath);
		s.once("connect", () => {
			s.destroy();
			resolve("live");
		});
		s.once("error", (err) => resolve(err.code === "ECONNREFUSED" || err.code === "ENOENT" ? "stale" : "busy"));
	});
}
/** True when a live owner answers on the socket. */
async function ownerAnswers(socketPath) {
	return await probeOwner(socketPath) === "live";
}
/**
* Serves `service` on a claimed socket. Requests that arrive before `ready`
* settles wait for it; if it rejects (the devices would not bind), every
* request is answered with that reason.
*/
/** The scheduler every device request on a machine goes through, the owner's own included. */
function schedulerFor(svc, journal, limits = {
	maxQueued: 4,
	maxWaitMs: 1e3
}) {
	return new DeviceScheduler((digest) => svc.run((dev) => dev.challenge(digest)), () => svc.members().length, {
		...limits,
		...journal ? {
			journal,
			checkpointMs: 1e3,
			checkpointSigner: svc.checkpoint?.bind(svc)
		} : {}
	});
}
function serveRoot(server, ready) {
	const clients = /* @__PURE__ */ new Set();
	let failure = null;
	let scheduler = null;
	let attestor = null;
	ready.then((r) => {
		scheduler = r.scheduler;
		attestor = new Attestor(r.svc);
	}, (err) => {
		failure = err.message;
	});
	server.unref();
	let nextClient = 1;
	server.on("connection", (sock) => {
		const client = nextClient++;
		clients.add(sock);
		sock.unref();
		let inFlight = 0;
		const sealedLimit = new RelayRateLimit(RELAY_LIMITS.sealedPerSecond);
		const entropyLimit = new RelayRateLimit(RELAY_LIMITS.entropyPerSecond);
		const unlockUseLimit = new RelayRateLimit(RELAY_LIMITS.unlockUsePerSecond);
		const anchorLimit = new RelayRateLimit(RELAY_LIMITS.anchorPerSecond);
		sock.on("close", () => {
			clients.delete(sock);
			scheduler?.forget(client);
		});
		sock.on("error", () => void 0);
		let buf = "";
		const reply = (o) => {
			if (!sock.destroyed) sock.write(JSON.stringify(o) + "\n");
		};
		const handle = async (req) => {
			let svc;
			try {
				svc = (await ready).svc;
			} catch {
				reply({
					id: req.id,
					ok: false,
					halt: true,
					error: failure ?? "the devices did not bind"
				});
				return;
			}
			if (req.op === "members") reply({
				id: req.id,
				ok: true,
				members: svc.members()
			});
			else if (req.op === "health") if (typeof req.nonce === "string" && /^[0-9a-f]{64}$/.test(req.nonce) && attestor) try {
				const att = await attestor.attest(Buffer.from(req.nonce, "hex"));
				reply({
					id: req.id,
					ok: true,
					health: svc.health(),
					att
				});
			} catch (err) {
				reply({
					id: req.id,
					ok: true,
					health: svc.health(),
					attError: err.message
				});
			}
			else reply({
				id: req.id,
				ok: true,
				health: svc.health()
			});
			else if (req.op === "sign" && /^[0-9a-f]{64}$/.test(req.digest)) try {
				const deadline = typeof req.deadlineMs === "number" && Number.isFinite(req.deadlineMs) ? req.deadlineMs : void 0;
				const r = await scheduler.submit(client, Buffer.from(req.digest, "hex"), deadline);
				reply({
					id: req.id,
					ok: true,
					uid: r.uid.toString("hex"),
					sig: r.sig.toString("hex")
				});
			} catch (err) {
				reply({
					id: req.id,
					ok: false,
					error: err.message
				});
			}
			else if (req.op === "anchor") {
				const c = checkRelayRequest(req);
				if (!c.ok) reply({
					id: req.id,
					ok: false,
					error: c.error
				});
				else if (svc.relayAnchor === void 0) reply({
					id: req.id,
					ok: false,
					error: "anchor: not offered by this owner"
				});
				else if (!anchorLimit.take()) reply({
					id: req.id,
					ok: false,
					error: "anchor: rate limited"
				});
				else try {
					const out = await svc.relayAnchor(c.anchorType, c.frame);
					reply({
						id: req.id,
						ok: true,
						payload: out.toString("hex")
					});
				} catch (err) {
					reply({
						id: req.id,
						ok: false,
						error: err.message
					});
				}
			} else if (req.op === "sealed" || req.op === "unlock-use" || req.op === "entropy") {
				const c = checkRelayRequest(req);
				const offered = req.op === "sealed" ? svc.relaySealed !== void 0 : req.op === "unlock-use" ? svc.relayUnlockUse !== void 0 : svc.entropy !== void 0;
				const limit = req.op === "sealed" ? sealedLimit : req.op === "unlock-use" ? unlockUseLimit : entropyLimit;
				if (!c.ok) reply({
					id: req.id,
					ok: false,
					error: c.error
				});
				else if (!offered) reply({
					id: req.id,
					ok: false,
					error: `${req.op}: not offered by this owner`
				});
				else if (!limit.take()) reply({
					id: req.id,
					ok: false,
					error: `${req.op}: rate limited`
				});
				else try {
					const out = req.op === "sealed" ? await svc.relaySealed(c.type, c.frame) : req.op === "unlock-use" ? await svc.relayUnlockUse(c.frame) : await svc.entropy(c.n);
					reply({
						id: req.id,
						ok: true,
						payload: out.toString("hex")
					});
				} catch (err) {
					reply({
						id: req.id,
						ok: false,
						error: err.message
					});
				}
			} else reply({
				id: req.id ?? null,
				ok: false,
				error: "bad request"
			});
		};
		sock.on("data", (chunk) => {
			buf += chunk.toString("utf8");
			if (buf.length > MAX_LINE) {
				sock.destroy();
				return;
			}
			for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				let req;
				try {
					req = JSON.parse(line);
				} catch {
					sock.destroy();
					return;
				}
				if (inFlight++ === 0) sock.ref();
				handle(req).finally(() => {
					if (--inFlight === 0) sock.unref();
				});
			}
		});
	});
	return { close: () => new Promise((resolve) => {
		server.close(() => resolve());
		for (const s of clients) s.destroy();
	}) };
}
var RootHaltError = class extends Error {};
/**
* The process answering on the broker socket did not prove a genuine device (finding H1): a
* member without a valid birth certificate, a latch read that does not verify, a signature from
* a key no member has.
*/
var RootAttestError = class extends Error {};
/**
* Checks an attestation round for `nonce` against `members` (finding H1). Returns the verified
* latch states per member uid, or throws RootAttestError naming what did not verify. Exported so
* any process holding the owner's raw answer can check it itself.
*/
function verifyRootAttestation(members, nonce, att) {
	if (!Array.isArray(att.nonces) || !Array.isArray(att.members)) throw new RootAttestError("the owner's attestation is malformed");
	const nonces = att.nonces.map((n) => typeof n === "string" && /^[0-9a-f]{64}$/.test(n) ? Buffer.from(n, "hex") : null);
	if (nonces.some((n) => n === null) || nonces.length > MAX_ATTEST_BATCH || !nonces.some((n) => n.equals(nonce))) throw new RootAttestError("the owner's attestation does not cover this process's nonce");
	const digest = attestDigest(nonces);
	const out = /* @__PURE__ */ new Map();
	for (const m of members) {
		const a = att.members.find((x) => x?.uid === m.uid);
		if (!a || typeof a.latch !== "string" || !/^([0-9a-f]{2})+$/.test(a.latch)) throw new RootAttestError(`member ${m.serial} gave no signed latch read`);
		try {
			const l = parseDeviceLatch(Buffer.from(a.latch, "hex"), digest, Buffer.from(m.pubkey, "hex"), Buffer.from(m.uid, "hex"));
			out.set(m.uid, {
				state: l.state,
				reason: l.reasonText,
				sessionLive: l.sessionLive,
				armed: l.armed,
				sid: l.sid
			});
		} catch (err) {
			throw new RootAttestError(`member ${m.serial}'s latch read does not verify (${err instanceof DeviceLatchError ? err.code : err.message})`);
		}
	}
	return out;
}
/** Checks every member's certificate; returns them with the model the certificate proves. */
function verifyRootMembers(raw, rootPubkey = null) {
	if (!Array.isArray(raw) || raw.length === 0) throw new RootAttestError("the owner reported no members");
	const seen = /* @__PURE__ */ new Set();
	return raw.map((m, i) => {
		const hex = (v, n) => typeof v === "string" && v.length === n * 2 && /^[0-9a-f]+$/.test(v);
		if (!hex(m?.uid, 12) || !hex(m?.pubkey, 32) || typeof m?.cert !== "string" || !/^([0-9a-f]{2})+$/.test(m.cert)) throw new RootAttestError(`member ${i} has no certificate (uncertified, counterfeit, or an owner without attestation)`);
		if (seen.has(m.uid)) throw new RootAttestError("the owner reported the same member twice");
		seen.add(m.uid);
		const c = verifyCert(Buffer.from(m.cert, "hex"), Buffer.from(m.uid, "hex"), Buffer.from(m.pubkey, "hex"), rootPubkey);
		if (!c?.sku) throw new RootAttestError(`member ${i}'s certificate does not chain to a pinned manufacturer root for its key and uid`);
		const serial = (c.sku === "pro" ? "ECPRO-" : "ENCLW-") + m.uid.toUpperCase();
		return {
			uid: m.uid,
			pubkey: m.pubkey,
			cert: m.cert,
			serial,
			sku: c.sku
		};
	});
}
/**
* Connects to the owner. Throws RootHaltError when the owner reports that the devices would not
* bind (not genuine, latched DIRTY, a session that may not continue): the client must refuse
* exactly as the owner did. Throws RootAttestError when whatever answers cannot prove a genuine
* device (finding H1). Returns null when nobody answers in time (the caller may retry).
*/
async function connectRoot(socketPath, healthMs = 500, opts = {}) {
	const askTimeoutMs = opts.askTimeoutMs ?? 3e3;
	const signTimeoutMs = opts.signTimeoutMs ?? 6e3;
	const staleMs = 2 * healthMs + askTimeoutMs;
	const sock = net.connect(socketPath);
	if (!await new Promise((resolve) => {
		sock.once("connect", () => resolve(true));
		sock.once("error", () => resolve(false));
	})) return null;
	let next = 1;
	const waiting = /* @__PURE__ */ new Map();
	let buf = "";
	let lostReason = null;
	let markLost = () => void 0;
	const lost = new Promise((resolve) => {
		markLost = resolve;
	});
	const drop = (why) => {
		if (lostReason) return;
		lostReason = why;
		for (const done of waiting.values()) done({
			ok: false,
			error: why
		});
		waiting.clear();
		markLost();
	};
	sock.on("data", (chunk) => {
		buf += chunk.toString("utf8");
		if (buf.length > MAX_LINE) {
			sock.destroy();
			return;
		}
		for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
			let r;
			try {
				r = JSON.parse(buf.slice(0, nl));
			} catch {
				sock.destroy();
				return;
			}
			buf = buf.slice(nl + 1);
			const done = waiting.get(r.id);
			waiting.delete(r.id);
			done?.(r);
		}
	});
	sock.on("error", () => drop("the hardware root's owner is gone"));
	sock.on("close", () => drop("the hardware root's owner is gone"));
	let held = 0;
	const ask = (req, timeoutMs, background = false) => new Promise((resolve) => {
		if (lostReason) {
			resolve({
				ok: false,
				error: lostReason
			});
			return;
		}
		const id = next++;
		const holds = !background;
		if (holds && held++ === 0) sock.ref();
		let settled = false;
		const settle = (r) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			waiting.delete(id);
			if (holds && --held === 0) sock.unref();
			resolve(r);
		};
		const timer = setTimeout(() => settle({
			ok: false,
			timedOut: true,
			error: `the hardware root's owner did not answer within ${timeoutMs} ms`
		}), timeoutMs);
		timer.unref();
		waiting.set(id, settle);
		sock.write(JSON.stringify({
			...req,
			id
		}) + "\n");
	});
	const m = await ask({ op: "members" }, askTimeoutMs);
	if (!m.ok) {
		sock.destroy();
		if (m.halt) throw new RootHaltError(typeof m.error === "string" ? m.error : "the devices did not bind");
		return null;
	}
	let members;
	try {
		members = verifyRootMembers(m.members, opts.rootPubkey ?? null);
	} catch (err) {
		sock.destroy();
		throw err;
	}
	const byUid = new Map(members.map((x) => [x.uid, x]));
	const sids = /* @__PURE__ */ new Map();
	let health = {
		status: "UNAVAILABLE",
		reason: "not yet attested"
	};
	let freshAt = -Infinity;
	let attestFailure = null;
	let polling = false;
	/** One health request with a fresh nonce; returns the verified latch states, or why not. */
	const attestRound = async (nonce, background) => {
		const h = await ask({
			op: "health",
			nonce: nonce.toString("hex")
		}, askTimeoutMs, background);
		if (!h.ok) return {
			ok: false,
			fatal: false,
			reason: typeof h.error === "string" ? h.error : "no answer"
		};
		if (!h.att) return {
			ok: false,
			fatal: false,
			reason: typeof h.attError === "string" ? `the owner could not attest its devices: ${h.attError}` : "the owner sent no device attestation"
		};
		const att = h.att;
		try {
			return {
				ok: true,
				owner: h.health,
				att,
				states: verifyRootAttestation(members, nonce, att)
			};
		} catch (err) {
			return {
				ok: false,
				fatal: true,
				reason: err.message
			};
		}
	};
	/** Folds one attestation round into this client's view. Returns a fatal reason, if any. */
	const apply = (r) => {
		if (health.status === "DIRTY") return null;
		if (!r.ok) {
			if (r.fatal) {
				attestFailure = `the hardware root's owner did not prove a genuine device: ${r.reason}`;
				return attestFailure;
			}
			health = {
				status: "UNAVAILABLE",
				reason: r.reason
			};
			return null;
		}
		for (const [uid, st] of r.states) {
			const mem = byUid.get(uid);
			if (st.state === "SET") {
				health = {
					status: "DIRTY",
					reason: `enclaweder ${mem.serial} holds a DIRTY latch (${st.reason})`
				};
				return null;
			}
			if (!st.sessionLive || !st.armed) {
				health = {
					status: "UNAVAILABLE",
					reason: `enclaweder ${mem.serial} has no live host session`
				};
				return null;
			}
			const pinned = sids.get(uid);
			if (pinned === void 0) sids.set(uid, st.sid);
			else if (pinned !== st.sid) {
				attestFailure = `enclaweder ${mem.serial}'s host session changed: another process holds it now`;
				return attestFailure;
			}
		}
		const o = r.owner;
		if (o?.status === "CHECKING") {
			health = {
				status: "CHECKING",
				reason: typeof o.reason === "string" ? o.reason : "the owner is checking its device"
			};
			return null;
		}
		if (o?.status === "DIRTY") {
			health = {
				status: "DIRTY",
				reason: typeof o.reason === "string" ? o.reason : "the owner reports DIRTY"
			};
			return null;
		}
		if (o?.status !== "CLEAN") {
			health = {
				status: "UNAVAILABLE",
				reason: o && "reason" in o && typeof o.reason === "string" ? o.reason : "the owner is not CLEAN"
			};
			return null;
		}
		health = { status: "CLEAN" };
		freshAt = performance.now();
		return null;
	};
	const first = await attestRound(randomBytes(32), false);
	const fatal = apply(first);
	if (fatal) {
		sock.destroy();
		throw new RootAttestError(fatal);
	}
	if (!first.ok) {
		sock.destroy();
		return null;
	}
	const poll = async () => {
		if (polling || health.status === "DIRTY" || attestFailure) return;
		polling = true;
		try {
			apply(await attestRound(randomBytes(32), true));
		} finally {
			polling = false;
		}
	};
	const timer = setInterval(() => void poll(), healthMs);
	timer.unref();
	lost.then(() => {
		clearInterval(timer);
		if (health.status !== "DIRTY") health = {
			status: "UNAVAILABLE",
			reason: lostReason ?? "the hardware root's owner is gone"
		};
	});
	/** This client's view now: CLEAN only while a device-signed answer is fresh. */
	const current = () => {
		if (health.status === "DIRTY") return health;
		if (attestFailure) return {
			status: "UNAVAILABLE",
			reason: attestFailure
		};
		if (health.status === "CLEAN" && performance.now() - freshAt > staleMs) return {
			status: "UNAVAILABLE",
			reason: `no device-signed answer from the hardware root's owner for ${Math.round(performance.now() - freshAt)} ms (limit ${staleMs} ms)`
		};
		return health;
	};
	const primary = members[0];
	const device = {
		getIdentity: async () => ({
			uid: Buffer.from(primary.uid, "hex"),
			pubkeyRaw: Buffer.from(primary.pubkey, "hex")
		}),
		getCert: async () => Buffer.from(primary.cert, "hex"),
		challenge: async (nonce32) => {
			const h = current();
			if (h.status !== "CLEAN") throw new Error(`hardware root ${h.status}: ${h.reason}`);
			const r = await ask({
				op: "sign",
				digest: nonce32.toString("hex"),
				deadlineMs: signTimeoutMs
			}, signTimeoutMs);
			if (!r.ok) throw new Error(typeof r.error === "string" ? r.error : "signing failed");
			const uid = Buffer.from(String(r.uid), "hex");
			const sig = Buffer.from(String(r.sig), "hex");
			const mem = byUid.get(uid.toString("hex"));
			if (!mem || sig.length !== 64 || !verifyChallenge(Buffer.from(mem.pubkey, "hex"), nonce32, uid, sig)) {
				attestFailure = "the hardware root's owner returned a signature that no attested member made";
				throw new RootAttestError(attestFailure);
			}
			return {
				uid,
				sig
			};
		}
	};
	return {
		members,
		health: current,
		device: () => device,
		attest: async (nonce32) => {
			const r = await attestRound(nonce32, false);
			if (!r.ok) throw r.fatal ? new RootAttestError(r.reason) : new Error(r.reason);
			const fatalNow = apply(r);
			if (fatalNow) throw new RootAttestError(fatalNow);
			return {
				nonce: nonce32.toString("hex"),
				nonces: r.att.nonces,
				members: members.map((mm) => ({
					uid: mm.uid,
					pubkey: mm.pubkey,
					cert: mm.cert,
					sku: mm.sku,
					latch: r.att.members.find((x) => x.uid === mm.uid).latch
				}))
			};
		},
		relaySealed: async (type, payload) => {
			const r = await ask({
				op: "sealed",
				type,
				frame: payload.toString("hex")
			}, signTimeoutMs * 3);
			if (!r.ok || typeof r.payload !== "string" || !/^([0-9a-f]{2})*$/.test(r.payload)) throw new Error(typeof r.error === "string" ? r.error : "the owner did not relay the sealed frame");
			return Buffer.from(r.payload, "hex");
		},
		relayUnlockUse: async (payload) => {
			const r = await ask({
				op: "unlock-use",
				frame: payload.toString("hex")
			}, signTimeoutMs * 2);
			if (!r.ok || typeof r.payload !== "string" || !/^([0-9a-f]{2})*$/.test(r.payload)) throw new Error(typeof r.error === "string" ? r.error : "the owner did not relay the unlock use");
			return Buffer.from(r.payload, "hex");
		},
		relayAnchor: async (type, payload) => {
			const r = await ask({
				op: "anchor",
				type,
				frame: payload.toString("hex")
			}, type === 25 ? Math.max(signTimeoutMs * 3, 12e3) : signTimeoutMs * 3);
			if (!r.ok || typeof r.payload !== "string" || !/^([0-9a-f]{2})*$/.test(r.payload)) throw new Error(typeof r.error === "string" ? r.error : "the owner did not relay the anchor frame");
			return Buffer.from(r.payload, "hex");
		},
		entropy: async (n) => {
			const r = await ask({
				op: "entropy",
				n
			}, askTimeoutMs);
			if (!r.ok || typeof r.payload !== "string" || r.payload.length !== n * 2 || !/^[0-9a-f]*$/.test(r.payload)) throw new Error(typeof r.error === "string" ? r.error : "the owner sent no entropy");
			return Buffer.from(r.payload, "hex");
		},
		lost,
		close: () => {
			clearInterval(timer);
			sock.destroy();
		}
	};
}
//#endregion
//#region src/enclawed/hardware-root/forensics.ts
function safe(f) {
	try {
		return f();
	} catch {
		return null;
	}
}
let forensicContext = {};
function setForensicContext(ctx) {
	forensicContext = {
		...forensicContext,
		...ctx
	};
}
function getForensicContext() {
	return { ...forensicContext };
}
const FORENSIC_ENV = [
	"USER",
	"LOGNAME",
	"SUDO_USER",
	"HOSTNAME",
	"SSH_CONNECTION",
	"SSH_CLIENT",
	"SSH_TTY",
	"DISPLAY",
	"TERM",
	"LANG",
	"PWD"
];
function machineId() {
	for (const p of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
		const v = safe(() => fs.readFileSync(p, "utf8").trim());
		if (v) return v;
	}
	return null;
}
function forensicLogPath() {
	return process.env.ENCLAWEDER_FORENSIC_LOG ?? (process.env.ENCLAWEDER_STATE ? `${process.env.ENCLAWEDER_STATE}.forensics.jsonl` : void 0) ?? `${process.env.HOME ?? "/var/lib/enclawed"}/.enclawed-forensics.jsonl`;
}
function auditTail(n) {
	const p = forensicContext.auditPath ?? process.env.ENCLAWEDER_AUDIT_PATH;
	if (!p) return [];
	const raw = safe(() => fs.readFileSync(p, "utf8"));
	if (!raw) return [];
	return raw.trim().split("\n").filter(Boolean).slice(-n).map((l) => safe(() => JSON.parse(l)) ?? l);
}
function lastForensicHash() {
	const raw = safe(() => fs.readFileSync(forensicLogPath(), "utf8"));
	if (!raw) return null;
	const lines = raw.trim().split("\n").filter(Boolean);
	const last = lines[lines.length - 1];
	if (!last) return null;
	return safe(() => JSON.parse(last))?.hash ?? null;
}
/** Snapshot every identifying signal available at the moment of a tamper/DIRTY event. */
function captureForensics(trigger, device) {
	const interfaces = [];
	for (const [name, addrs] of Object.entries(os.networkInterfaces())) for (const a of addrs ?? []) interfaces.push({
		name,
		mac: a.mac,
		address: a.address,
		family: a.family,
		internal: a.internal
	});
	const env = {};
	for (const k of FORENSIC_ENV) {
		const v = process.env[k];
		if (v) env[k] = v;
	}
	const body = {
		schema: "enclaweder.forensics.v1",
		capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
		trigger,
		device,
		session: Object.keys(forensicContext).length > 0 ? getForensicContext() : null,
		host: {
			hostname: os.hostname(),
			osUser: safe(() => os.userInfo().username),
			platform: process.platform,
			release: os.release(),
			arch: process.arch,
			machineId: machineId(),
			uptimeSec: Math.round(os.uptime()),
			pid: process.pid,
			ppid: process.ppid,
			execPath: process.execPath,
			argv: process.argv,
			cwd: safe(() => process.cwd()),
			nodeVersion: process.version,
			env
		},
		network: { interfaces },
		timeline: auditTail(20),
		prevHash: lastForensicHash()
	};
	const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
	return {
		...body,
		hash
	};
}
let auditSink = null;
/** Registers (or, with null, removes) the audit chain every forensic snapshot is recorded in. */
function setForensicAuditSink(sink) {
	auditSink = sink;
}
/** The audit record type that carries a forensic snapshot's hash. */
const FORENSIC_AUDIT_TYPE = "hardware-root.forensics";
/** Persist a snapshot: append-only local log (survives the device wipe) + optional off-box webhook. */
async function recordForensics(snap) {
	try {
		const file = forensicLogPath();
		const refusal = realStateWriteRefusal(file);
		if (refusal) throw new Error(refusal);
		fs.appendFileSync(file, JSON.stringify(snap) + "\n");
	} catch (e) {
		try {
			console.error("[forensics] local write failed:", e.message);
		} catch {}
	}
	if (auditSink) try {
		await auditSink({
			type: FORENSIC_AUDIT_TYPE,
			actor: "hardware-root",
			level: null,
			payload: {
				hash: snap.hash,
				prevHash: snap.prevHash,
				trigger: snap.trigger.slice(0, 300),
				capturedAt: snap.capturedAt
			}
		});
	} catch (e) {
		try {
			console.error("[forensics] audit-chain record failed:", e.message);
		} catch {}
	}
	const hook = process.env.ENCLAWEDER_FORENSIC_WEBHOOK;
	if (hook) try {
		await fetch(hook, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(snap)
		});
	} catch {}
	try {
		const h = snap.host;
		console.error(`[forensics] tamper snapshot recorded (trigger="${snap.trigger}", host=${h.hostname}, session=${JSON.stringify(snap.session)}, hash=${snap.hash.slice(0, 12)}…)`);
	} catch {}
}
/** Capture + persist in one call. Fired by the guard when the hardware root goes DIRTY. */
async function captureAndRecordTamper(trigger, device) {
	const snap = captureForensics(trigger, device);
	await recordForensics(snap);
	return snap;
}
/**
* Checks the forensic log against the audit chain (finding H13): the log's own chain must be
* consistent; every forensic hash the audit chain recorded must still be in the log (a removed
* or rewritten snapshot is caught here); every snapshot in the log must be in the audit chain
* (one added afterwards is caught here); and the audit chain itself must verify, against its
* head anchor (the Enclaweder's, when the caller passes it).
*/
async function verifyForensicLog(forensicPath, auditPath, headAnchor) {
	const problems = [];
	let snaps = [];
	try {
		snaps = fs.readFileSync(forensicPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
	} catch (e) {
		if (e.code !== "ENOENT") problems.push(`forensic log unreadable: ${e.message}`);
	}
	let prev = null;
	snaps.forEach((s, i) => {
		const { hash, ...body } = s;
		if (createHash("sha256").update(JSON.stringify(body)).digest("hex") !== hash) problems.push(`snapshot ${i}: hash does not match its body`);
		if (body.prevHash !== prev) problems.push(`snapshot ${i}: prevHash does not link to the snapshot before it`);
		prev = hash;
	});
	const chain = await verifyChain(auditPath, headAnchor).catch((e) => ({
		ok: false,
		count: 0,
		brokenAt: 0,
		reason: e.message
	}));
	if (!chain.ok) problems.push(`audit chain does not verify: ${chain.reason} (record ${chain.brokenAt})`);
	const audited = [];
	try {
		for (const line of fs.readFileSync(auditPath, "utf8").split("\n")) {
			if (!line) continue;
			const r = JSON.parse(line);
			const h = r.payload?.hash;
			if (r.type === "hardware-root.forensics" && typeof h === "string") audited.push(h);
		}
	} catch (e) {
		problems.push(`audit log unreadable: ${e.message}`);
	}
	const inLog = new Set(snaps.map((s) => s.hash));
	const inAudit = new Set(audited);
	for (const h of audited) if (!inLog.has(h)) problems.push(`the audit chain records forensic snapshot ${h.slice(0, 16)}... that the log no longer holds (removed or rewritten)`);
	for (const s of snaps) if (!inAudit.has(s.hash)) problems.push(`forensic snapshot ${s.hash.slice(0, 16)}... is not in the audit chain`);
	return {
		ok: problems.length === 0,
		snapshots: snaps.length,
		audited: audited.length,
		problems
	};
}
//#endregion
//#region src/enclawed/hardware-root/failure-audit.ts
const SECRETISH = /\b[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-|\b\d{6}\b|[0-9a-f]{64,}/i;
/** Where the host keeps which device failure entries it has seen (beside the latch cache). */
function failureMirrorPath(statePath) {
	return `${statePath}.failures.jsonl`;
}
/** Record one host-observed failure (audit log + forensic log). Best effort; never throws. */
async function recordHostAuthFailure(f) {
	const payload = {
		op: f.op,
		reason: f.reason.replace(SECRETISH, "[redacted]").slice(0, 120),
		serial: f.serial ?? null,
		deviceTotal: f.deviceTotal ?? null
	};
	try {
		await getRuntime()?.audit.append({
			type: "hardware.auth-failure",
			actor: "enclawed",
			level: null,
			payload
		});
	} catch {}
	await captureAndRecordTamper(`auth-failure:${f.op}:${payload.reason}`, null).catch(() => void 0);
}
/**
* Pull the device's signed failure log and reconcile it with what this host has recorded.
* Returns the device entries this host had NOT recorded (each now recorded, flagged).
*/
async function reconcileDeviceFailures(dev, devicePubRaw, uid, statePath, serial, ownRecent = 0) {
	const log = await readFailLog(dev, devicePubRaw, uid);
	const mirror = failureMirrorPath(statePath);
	const seen = /* @__PURE__ */ new Set();
	try {
		for (const line of fs.readFileSync(mirror, "utf8").split("\n")) if (line) seen.add(JSON.parse(line).seq);
	} catch {}
	const unseen = log.entries.filter((e) => !seen.has(String(e.seq)));
	const mine = new Set(unseen.slice(0, ownRecent));
	const unlogged = unseen.slice(ownRecent);
	for (const e of unseen.toReversed()) try {
		const refusal = realStateWriteRefusal(mirror);
		if (refusal) throw new Error(refusal);
		fs.appendFileSync(mirror, JSON.stringify({
			seq: String(e.seq),
			total: String(e.total),
			op: e.op,
			reason: e.reason,
			count: e.count,
			at: Date.now(),
			host: mine.has(e) ? "recorded" : "UNLOGGED"
		}) + "\n");
	} catch {}
	if (unlogged.length) await recordHostAuthFailure({
		op: "operator-tool",
		reason: `device failure log has ${unlogged.length} entr${unlogged.length === 1 ? "y" : "ies"} not recorded on this host (device total ${log.total})`,
		serial,
		deviceTotal: String(log.total)
	});
	return {
		total: log.total,
		unlogged
	};
}
var HaltError = class extends Error {
	constructor(reason) {
		super("HALT: " + reason);
		this.name = "HaltError";
		this.reason = reason;
	}
};
const CHECK_ATTEMPTS = 3;
const CHECK_WINDOW_MS = 1e4;
/** Pause between attempts, so a stalled host gets to drain what it owes before the next one. */
const CHECK_PAUSE_MS = 1e3;
/** How often a node that went away is looked for again, within the window. */
const REOPEN_POLL_MS = 500;
const pause = (ms) => new Promise((r) => {
	setTimeout(r, ms).unref?.();
});
/** Device states a guard may bind in: power-on (PROVISION), READY, ATTESTED (finding H6). */
const BINDABLE_STATES = new Set([
	ACC_STATE.PROVISION,
	ACC_STATE.READY,
	ACC_STATE.ATTESTED
]);
function stateName(n) {
	return (Object.entries(ACC_STATE).find(([, v]) => v === n)?.[0] ?? `state ${n}`).toUpperCase();
}
var HardwareRootGuard = class {
	constructor({ statePath = "./.hw-root.state", onHalt, rootPubkey, deviceStaleMs = 15e3, answerBudgetMs = 1500 } = {}) {
		this.timer = null;
		this.session = null;
		this.sessionDev = null;
		this.refused = null;
		this.deviceCheckedAt = 0;
		this.checking = false;
		this.checkStartedAt = 0;
		this.heartbeatStarted = false;
		this.heartbeatEpoch = 0;
		this.cert = null;
		this.lastFailureTotal = null;
		this.answerBudgetMs = answerBudgetMs;
		this.statePath = statePath;
		this.onHalt = onHalt ?? (() => {});
		this.rootPubkey = rootPubkey ?? null;
		this.deviceStaleMs = deviceStaleMs;
		this.state = this.loadState();
	}
	/**
	* The host cache. Missing means never bound. ANY other failure -- a directory, a permission
	* error, a truncated or corrupt file -- reads as DIRTY (finding H7): an attacker who can break
	* the file must not thereby make the host look clean.
	*/
	loadState() {
		let text;
		try {
			text = fs.readFileSync(this.statePath, "utf8");
		} catch (err) {
			if (err.code === "ENOENT") return { status: "UNBOUND" };
			return this.unreadable(`latch file unreadable (${err.code ?? "error"})`);
		}
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch {
			return this.unreadable("latch file corrupt (not JSON)");
		}
		const st = parsed;
		if (!st || typeof st !== "object" || ![
			"UNBOUND",
			"CLEAN",
			"DIRTY"
		].includes(st.status)) return this.unreadable("latch file corrupt (no valid status)");
		return st;
	}
	unreadable(reason) {
		const now = Date.now();
		return {
			status: "DIRTY",
			dirty: {
				reason,
				at: now,
				lastGoodAt: 0,
				source: "host"
			},
			history: [{
				at: now,
				kind: "halt",
				detail: reason
			}]
		};
	}
	/** Atomic write (temp + rename). Throws; callers decide what a failure means. */
	saveState() {
		const refusal = realStateWriteRefusal(this.statePath);
		if (refusal) throw new Error(refusal);
		const tmp = `${this.statePath}.${process.pid}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
		fs.renameSync(tmp, this.statePath);
	}
	trySave() {
		try {
			this.saveState();
			return true;
		} catch {
			return false;
		}
	}
	log(e) {
		(this.state.history ??= []).push({
			at: Date.now(),
			...e
		});
	}
	get status() {
		return this.state.status;
	}
	get bound() {
		return this.state.bound ?? null;
	}
	get history() {
		return this.state.history ?? [];
	}
	/** The bound device's birth certificate, as verified at boot (clients re-verify it; H1). */
	get certificate() {
		return this.cert;
	}
	/** Why the last boot was refused, if it was (finding H5). */
	get refusal() {
		return this.refused;
	}
	/** Gate every accredited operation. Throws HaltError unless CLEAN, unrefused and device-fresh. */
	assertClean() {
		const g = this.gate();
		if (g.kind !== "clean") throw new HaltError(g.reason);
	}
	/**
	* The gate as a closed union (assertClean() throws its reason). A stale latch read or a
	* heartbeat still waiting for its answer closes the gate as "checking", not as a latch: the
	* check either proves the device again or, past its window, latches DIRTY itself.
	*/
	gate() {
		if (this.refused) return {
			kind: "refused",
			reason: `hardware root boot was refused: ${this.refused}`
		};
		if (this.state.status === "DIRTY") return {
			kind: "dirty",
			reason: `hardware root DIRTY: ${this.state.dirty?.reason} -- two-factor recovery on the device required`
		};
		if (this.state.status !== "CLEAN") return {
			kind: "unbound",
			reason: `hardware root not bound (${this.state.status})`
		};
		if (this.session && this.heartbeatStarted && !this.timer) return {
			kind: "halted",
			reason: "hardware root: the device heartbeat is not running"
		};
		const now = performance.now();
		if (this.session && this.checking && now - this.checkStartedAt > this.answerBudgetMs) return {
			kind: "checking",
			reason: `hardware root: checking the device -- its heartbeat has been unanswered for ${Math.round(now - this.checkStartedAt)} ms (limit ${this.answerBudgetMs} ms)`
		};
		if (this.session && now - this.deviceCheckedAt > this.deviceStaleMs) return {
			kind: "checking",
			reason: `hardware root: checking the device -- its latch was last verified ${Math.round(now - this.deviceCheckedAt)} ms ago (limit ${this.deviceStaleMs} ms)`
		};
		return { kind: "clean" };
	}
	/** Bind at boot. Refuses unless the DEVICE says clean; opens the device's host session. */
	async boot(dev) {
		try {
			const bound = await this.bootInner(dev);
			this.refused = null;
			return bound;
		} catch (err) {
			this.refused = err instanceof Error ? err instanceof HaltError ? err.reason : err.message : String(err);
			this.log({
				kind: "refused-boot",
				detail: this.refused.slice(0, 300)
			});
			this.trySave();
			throw err instanceof HaltError ? err : new HaltError(this.refused);
		}
	}
	async bootInner(dev) {
		const id = await dev.getIdentity();
		const st = await dev.getStatus();
		if (!BINDABLE_STATES.has(st.state)) throw new HaltError(`device is ${stateName(st.state)} at boot; it may bind only in PROVISION, READY or ATTESTED`);
		const cert = await dev.getCert();
		const parsedCert = cert ? verifyCert(cert, id.uid, id.pubkeyRaw, this.rootPubkey) : null;
		if (!parsedCert) throw new HaltError("device not GENUINE -- no valid manufacturer certificate for this key (uncertified, counterfeit, or zeroized)");
		this.cert = Buffer.from(cert);
		const serial = (parsedCert.sku === "pro" ? "ECPRO-" : "ENCLW-") + id.uid.toString("hex").toUpperCase();
		if (!dev.request) throw new HaltError("device latch unsupported: update firmware (this driver offers no frame access)");
		const ldev = dev;
		let latch;
		try {
			latch = await readDeviceLatch(ldev, id.pubkeyRaw, id.uid);
		} catch (err) {
			if (err instanceof DeviceLatchError && err.code === "unsupported") throw new HaltError(`device latch unsupported: update firmware (enclaweder ${serial})`);
			throw new HaltError(`device latch unreadable: ${err.message}`);
		}
		this.mirrorDevice(latch);
		await this.warnOnFailures(ldev, id.pubkeyRaw, id.uid, serial);
		if (this.state.status === "DIRTY" && latch.state === "CLEAR") {
			await haltDeviceAnonymous(ldev, HOST_HALT_CODE.HOST_MIRROR).catch(() => void 0);
			this.log({
				kind: "pushed-to-device",
				detail: this.state.dirty?.reason,
				serial
			});
			this.trySave();
			throw new HaltError(`refusing to boot: hardware root was left DIRTY (${this.state.dirty?.reason}); the halt is now held by enclaweder ${serial} -- two-factor recovery required`);
		}
		if (latch.state === "SET") {
			this.adoptDeviceHalt(latch, serial);
			throw new HaltError(`refusing to boot: enclaweder ${serial} holds a DIRTY latch (${latch.reasonText}) -- two-factor recovery on the device required`);
		}
		const nonce = randomBytes(32);
		const chal = await dev.challenge(nonce);
		if (!verifyChallenge(id.pubkeyRaw, nonce, chal.uid, chal.sig)) throw new HaltError("boot challenge failed");
		let session;
		try {
			session = await LatchSession.open(ldev, id.pubkeyRaw);
		} catch (err) {
			if (err instanceof DeviceLatchError && err.code === "busy") throw new HaltError(`another process holds enclaweder ${serial}'s host session; one owner per device (its lease ends ${err.waitMs ?? "?"} ms after its last renewal, and if it does not close cleanly the device latches DIRTY)`);
			throw new HaltError(`could not open the device host session: ${err.message}`);
		}
		this.session = session;
		this.sessionDev = dev;
		this.deviceCheckedAt = performance.now();
		const prev = this.state;
		this.state = {
			status: "CLEAN",
			bound: {
				serial,
				pubkey: id.pubkeyRaw.toString("hex"),
				uid: id.uid.toString("hex"),
				sku: parsedCert.sku
			},
			boundAt: Date.now(),
			lastGoodAt: Date.now(),
			dirty: null,
			sessionOpen: true,
			recoveries: prev.recoveries ?? [],
			history: prev.history ?? [],
			device: prev.device ?? null,
			failureTotalAtLastClean: prev.failureTotalAtLastClean
		};
		this.log({
			kind: "bound",
			serial,
			deviceSeq: String(session.sid)
		});
		this.mirrorDevice(latch);
		this.trySave();
		session.startKeepalive(LATCH_KEEPALIVE_INTERVAL_MS, (err) => this.markDirty(`device host session lost: ${err.message}`));
		return this.bound;
	}
	async warnOnFailures(dev, pub, uid, serial) {
		try {
			const f = await readFailLog(dev, pub, uid);
			this.lastFailureTotal = f.total;
			const since = f.total - BigInt(this.state.failureTotalAtLastClean ?? "0");
			if (since >= BigInt(3)) console.error(`[enclawed] WARNING: enclaweder ${serial} logged ${since} failed authentication attempt(s) since the last clean session (device total ${f.total}). Inspect: enclawed hardware-root status`);
		} catch {}
	}
	mirrorDevice(l) {
		this.state.device = {
			state: l.state,
			reason: l.reasonText,
			seq: String(l.seq),
			checkedAt: Date.now()
		};
	}
	/** The device says DIRTY: mirror it here (cache + audit), never the other way round. */
	adoptDeviceHalt(l, serial) {
		if (!(this.state.status === "DIRTY" && this.state.dirty?.source === "device")) {
			this.state.status = "DIRTY";
			this.state.dirty = {
				reason: `device latch: ${l.reasonText}`,
				at: Date.now(),
				lastGoodAt: this.state.lastGoodAt ?? 0,
				source: "device"
			};
			this.log({
				kind: "device-latch-set",
				detail: l.reasonText,
				serial,
				deviceSeq: String(l.setSeq)
			});
		}
		this.mirrorDevice(l);
		this.trySave();
	}
	/**
	* End the hardware-accredited session deliberately: the authenticated clean close is what
	* disarms the device. Only the guard that opened a session closes it, and only that writes
	* sessionOpen = false (finding H4): a refused recovery or a per-call process never does.
	*/
	closeSession() {
		this.stopHeartbeat();
		const s = this.session;
		if (!s) return;
		this.session = null;
		s.closeSync();
		if (this.lastFailureTotal !== null) this.state.failureTotalAtLastClean = String(this.lastFailureTotal);
		if (this.state.sessionOpen !== false) {
			this.state.sessionOpen = false;
			this.log({
				kind: "session-closed",
				serial: this.state.bound?.serial
			});
			this.trySave();
		}
	}
	/** As closeSession(), awaiting the device's acknowledgement (graceful exit paths). */
	async closeSessionAsync() {
		this.stopHeartbeat();
		const s = this.session;
		if (!s) return;
		this.session = null;
		try {
			await s.close();
		} catch {
			s.closeSync();
		}
		if (this.lastFailureTotal !== null) this.state.failureTotalAtLastClean = String(this.lastFailureTotal);
		if (this.state.sessionOpen !== false) {
			this.state.sessionOpen = false;
			this.log({
				kind: "session-closed",
				serial: this.state.bound?.serial
			});
			this.trySave();
		}
	}
	/** A journal checkpoint signed under this guard's device host session (finding H2). */
	async checkpoint(head32) {
		if (!this.session || this.state.status !== "CLEAN") throw new HaltError("no clean device host session to checkpoint under");
		return this.session.checkpoint(head32);
	}
	/**
	* One liveness check. Never rejects (finding H7). A definite answer that is not CLEAN latches
	* DIRTY at once; NO answer is made again within the fixed window (see CHECK_ATTEMPTS), and
	* latches DIRTY only when the window runs out.
	*/
	async check(dev) {
		if (this.state.status === "DIRTY") return {
			ok: false,
			reason: this.state.dirty?.reason
		};
		const fail = (reason) => {
			this.markDirty(reason);
			return {
				ok: false,
				reason
			};
		};
		const epoch = this.heartbeatEpoch;
		const started = performance.now();
		const elapsed = () => Math.round(performance.now() - started);
		const stoodDown = {
			ok: false,
			reason: "the heartbeat was stopped while checking"
		};
		try {
			for (let attempt = 1;; attempt++) {
				const step = await this.checkOnce(dev);
				if (this.state.status === "DIRTY") return {
					ok: false,
					reason: this.state.dirty?.reason
				};
				if (step.kind === "ok") {
					this.deviceCheckedAt = performance.now();
					this.state.lastGoodAt = Date.now();
					this.mirrorDevice(step.latch);
					this.trySave();
					return { ok: true };
				}
				if (step.kind === "device-halt") {
					this.adoptDeviceHalt(step.latch, this.state.bound?.serial ?? "");
					this.stopHeartbeat();
					this.session = null;
					this.onHaltSafe(`device latch: ${step.latch.reasonText}`);
					return {
						ok: false,
						reason: `device latch: ${step.latch.reasonText}`
					};
				}
				if (step.kind === "definite") return fail(step.reason);
				if (epoch !== this.heartbeatEpoch) return stoodDown;
				if (step.code === "gone" && dev.reconnect) {
					const found = await this.findAgain(dev, started, epoch);
					if (found === "stopped") return stoodDown;
					if (found.kind === "different") return fail(`a different device answered in place of the bound enclaweder (on ${found.path}) -- device swapped`);
					if (found.kind === "absent") return fail(`enclaweder disconnected: not found again within ${elapsed()} ms`);
					if (performance.now() - started < CHECK_WINDOW_MS) continue;
					return fail(`${step.reason}: reopened, but not proven again within ${elapsed()} ms`);
				}
				if (attempt >= CHECK_ATTEMPTS || performance.now() - started >= CHECK_WINDOW_MS) return fail(`${step.reason} (asked again; no answer within ${elapsed()} ms)`);
				await pause(CHECK_PAUSE_MS);
				if (epoch !== this.heartbeatEpoch) return stoodDown;
			}
		} catch (err) {
			return fail(`guard check error: ${err.message}`);
		}
	}
	/** Reopen a node that went away, polling within the check's window. */
	async findAgain(dev, started, epoch) {
		for (;;) {
			let found;
			try {
				found = await dev.reconnect();
			} catch {
				found = { kind: "absent" };
			}
			if (found.kind !== "absent" || performance.now() - started >= CHECK_WINDOW_MS) return found;
			await pause(REOPEN_POLL_MS);
			if (epoch !== this.heartbeatEpoch) return "stopped";
		}
	}
	/** One pass: identity, status, and the device's signed latch over a fresh nonce. */
	async checkOnce(dev) {
		const noAnswer = (err, reason) => {
			const code = transientDeviceError(err);
			return code ? {
				kind: "transient",
				code,
				reason
			} : null;
		};
		let id;
		try {
			id = await dev.getIdentity();
		} catch (err) {
			return noAnswer(err, "enclaweder disconnected (no response)") ?? {
				kind: "definite",
				reason: `enclaweder identity check failed: ${err.message}`
			};
		}
		if (id.pubkeyRaw.toString("hex") !== this.state.bound?.pubkey) return {
			kind: "definite",
			reason: "device key changed -- zeroized/re-minted or device swapped"
		};
		if (this.state.bound?.uid && id.uid.toString("hex") !== this.state.bound.uid) return {
			kind: "definite",
			reason: "device uid changed -- device swapped"
		};
		let st;
		try {
			st = await dev.getStatus();
		} catch (err) {
			return noAnswer(err, "enclaweder unresponsive") ?? {
				kind: "definite",
				reason: `enclaweder status check failed: ${err.message}`
			};
		}
		if (!BINDABLE_STATES.has(st.state)) return {
			kind: "definite",
			reason: `enclaweder reported ${stateName(st.state)}`
		};
		if (!dev.request) return {
			kind: "definite",
			reason: "device latch unsupported"
		};
		let latch;
		try {
			latch = await readDeviceLatch(dev, id.pubkeyRaw, id.uid);
		} catch (err) {
			const reason = `device latch check failed: ${err.message}`;
			return noAnswer(err, reason) ?? {
				kind: "definite",
				reason
			};
		}
		return latch.state === "SET" ? {
			kind: "device-halt",
			latch
		} : {
			kind: "ok",
			latch
		};
	}
	onHaltSafe(reason) {
		try {
			this.onHalt(reason);
		} catch {}
	}
	markDirty(reason) {
		if (this.state.status === "DIRTY") return;
		this.state.status = "DIRTY";
		this.state.dirty = {
			reason,
			at: Date.now(),
			lastGoodAt: this.state.lastGoodAt ?? 0,
			source: "host"
		};
		this.log({
			kind: "halt",
			detail: reason,
			serial: this.state.bound?.serial
		});
		this.stopHeartbeat();
		this.onHaltSafe(reason);
		const s = this.session;
		const d = this.sessionDev;
		this.session = null;
		if (s) s.halt(HOST_HALT_CODE.GUARD_CHECK_FAILED).catch(() => d?.request ? haltDeviceAnonymous(d, HOST_HALT_CODE.GUARD_CHECK_FAILED).catch(() => void 0) : void 0);
		this.trySave();
	}
	startHeartbeat(dev, { intervalMs = 1e3 } = {}) {
		this.stopHeartbeat();
		this.deviceStaleMs = Math.min(this.deviceStaleMs, 2 * intervalMs + this.answerBudgetMs);
		this.heartbeatStarted = true;
		const epoch = this.heartbeatEpoch;
		this.timer = setInterval(() => {
			if (this.checking) return;
			this.checking = true;
			this.checkStartedAt = performance.now();
			this.check(dev).then((r) => {
				if (!r.ok && epoch === this.heartbeatEpoch) this.stopHeartbeat();
			}).finally(() => {
				this.checking = false;
			});
		}, intervalMs);
		if (this.timer.unref) this.timer.unref();
	}
	stopHeartbeat() {
		this.heartbeatEpoch++;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
	/**
	* Recovery. The DEVICE clears its latch, verifying the factors itself; this only relays them,
	* then accepts the outcome when a fresh signed LATCH_GET says CLEAR. There is no boolean
	* "confirmed" authority: a process of this user cannot clear anything by calling this.
	*/
	async recover(dev, auth = {}) {
		if (!auth || !("kind" in auth)) throw new HaltError("recovery: a 'humanConfirmed' flag is no longer an authority. The Enclaweder clears its own latch only with two factors it verifies (an authenticator code or security key AND a one-time recovery code) or with the operator quorum: run `enclawed hardware-root recover`");
		const id = await dev.getIdentity().catch(() => null);
		if (!id) throw new HaltError("recovery: no device present");
		const bound = this.state.bound;
		const keyChanged = !!bound?.pubkey && id.pubkeyRaw.toString("hex") !== bound.pubkey;
		if (keyChanged && (!bound?.uid || id.uid.toString("hex") !== bound.uid)) throw new HaltError("recovery: present device is NOT the bound root of trust");
		const cert = await dev.getCert();
		const parsedCert = cert ? verifyCert(cert, id.uid, id.pubkeyRaw, this.rootPubkey) : null;
		if (!parsedCert) throw new HaltError("recovery: present device is not GENUINE");
		if (keyChanged && bound?.sku && parsedCert.sku !== bound.sku) throw new HaltError("recovery: present device is NOT the bound root of trust (different SKU)");
		if (!dev.request) throw new HaltError("recovery: device latch unsupported: update firmware");
		const ldev = dev;
		const serial = (parsedCert.sku === "pro" ? "ECPRO-" : "ENCLW-") + id.uid.toString("hex").toUpperCase();
		let latch = await readDeviceLatch(ldev, id.pubkeyRaw, id.uid);
		if (latch.state === "CLEAR" && this.state.status !== "DIRTY") throw new Error("not DIRTY");
		if (latch.state === "CLEAR") {
			await haltDeviceAnonymous(ldev, HOST_HALT_CODE.HOST_MIRROR);
			this.log({
				kind: "pushed-to-device",
				detail: this.state.dirty?.reason,
				serial
			});
			latch = await readDeviceLatch(ldev, id.pubkeyRaw, id.uid);
		}
		const cleared = this.state.dirty ?? null;
		let via;
		try {
			if (auth.kind === "two-factor") {
				via = "two-factor";
				await clearByTwoFactors(ldev, auth.recoveryCode, auth.factorA);
			} else {
				via = "operator-quorum";
				await clearByOperatorQuorum(ldev, id.pubkeyRaw, id.uid, auth.signers);
			}
		} catch (err) {
			this.log({
				kind: "halt",
				detail: `recovery refused by the device: ${err.message}`.slice(0, 300),
				serial
			});
			this.trySave();
			await recordHostAuthFailure({
				op: auth.kind === "two-factor" ? "latch-clear-two-factor" : "latch-clear-operator",
				reason: err instanceof DeviceLatchError ? err.code : "error",
				serial
			});
			await reconcileDeviceFailures(ldev, id.pubkeyRaw, id.uid, this.statePath, serial, 1).catch(() => void 0);
			throw new HaltError(`recovery refused by the device: ${err.message}`);
		} finally {
			if (auth.kind === "two-factor") auth.recoveryCode.fill(0);
		}
		const after = await readDeviceLatch(ldev, id.pubkeyRaw, id.uid);
		if (after.state !== "CLEAR") throw new HaltError("recovery: the device still reports its latch SET");
		if (keyChanged) {
			this.log({
				kind: "rebound",
				serial,
				deviceSeq: String(after.seq),
				detail: `re-provisioned unit adopted after ${via} recovery: key ${bound?.pubkey?.slice(0, 16)}... -> ${id.pubkeyRaw.toString("hex").slice(0, 16)}...`
			});
			this.state.bound = {
				serial,
				pubkey: id.pubkeyRaw.toString("hex"),
				uid: id.uid.toString("hex"),
				sku: parsedCert.sku
			};
			this.state.boundAt = Date.now();
		}
		this.state.status = "CLEAN";
		this.state.dirty = null;
		this.state.lastGoodAt = Date.now();
		this.state.sessionOpen = false;
		this.state.recoveries = (this.state.recoveries ?? []).concat([{
			at: Date.now(),
			cleared,
			via,
			deviceSeq: String(after.seq)
		}]);
		this.log({
			kind: "recovered",
			via,
			serial,
			deviceSeq: String(after.seq),
			detail: cleared?.reason
		});
		this.mirrorDevice(after);
		this.saveState();
		return true;
	}
};
//#endregion
//#region src/enclawed/hardware-root/latches.ts
/** The file name of one device's latch when several devices are bound. */
function memberLatchName(uid) {
	return `.enclawed-hw-root.${uid.toLowerCase()}.state`;
}
const MEMBER = /^\.enclawed-hw-root\.[0-9a-f]{24}\.state$/;
const LEGACY = /^\.enclawed-hw-root\.\d+\.state$/;
/**
* One latch file. Absent means nothing was latched there. ANYTHING else that stops it being read
* -- a directory, a permission error, a truncated or corrupt file -- reads as DIRTY (finding H7):
* breaking the file must never be a way to make the host look clean. (The device holds the
* authoritative latch; these files are only its cache.)
*/
function read(p) {
	let text;
	try {
		text = readFileSync(p, "utf8");
	} catch (err) {
		if (err.code === "ENOENT") return null;
		return {
			path: p,
			status: "DIRTY",
			dirty: { reason: `latch file unreadable (${err.code ?? "error"})` }
		};
	}
	try {
		const v = JSON.parse(text);
		if (!v || typeof v !== "object" || ![
			"UNBOUND",
			"CLEAN",
			"DIRTY"
		].includes(v.status)) throw new Error("no status");
		return {
			...v,
			path: p
		};
	} catch {
		return {
			path: p,
			status: "DIRTY",
			dirty: { reason: "latch file corrupt" }
		};
	}
}
function matching(dir, re) {
	try {
		return readdirSync(dir).filter((n) => re.test(n)).toSorted().map((n) => path.join(dir, n));
	} catch {
		return [];
	}
}
/**
* Every latch on this host: the single-device one at `statePath`, each
* device's own beside it, and any an earlier version left in `legacyDir`.
*/
function hostLatches(statePath, legacyDir) {
	const paths = new Set([statePath, ...matching(path.dirname(statePath), MEMBER)]);
	if (legacyDir) for (const p of matching(legacyDir, LEGACY)) paths.add(p);
	return [...paths].map(read).filter((l) => l !== null);
}
/** The first latch left DIRTY, or null. */
function dirtyLatch(latches) {
	return latches.find((l) => l.status === "DIRTY") ?? null;
}
//#endregion
//#region src/enclawed/hardware-root/fleet.ts
const SERIAL_PREFIX = {
	base: "ENCLW-",
	pro: "ECPRO-"
};
/** Full product names, keyed by the AUTHENTICATED model in the birth certificate. */
const SKU_NAME = {
	base: "Enclaweder Base",
	pro: "Enclaweder Pro"
};
/** The product name for a SKU, so single-device callers render it identically. */
function skuDisplayName(sku) {
	return SKU_NAME[sku];
}
/** Refuse to start a fleet that cannot hold its own file descriptors. */
function assertDescriptorBudget(count) {
	let limit = 0;
	try {
		const m = /Max open files\s+(\d+)/.exec(fs.readFileSync("/proc/self/limits", "utf8"));
		if (m) limit = Number(m[1]);
	} catch {}
	if (!limit) return;
	const headroom = 64;
	if (count + headroom > limit) throw new HaltError(`hardware root fleet: ${count} devices need more file descriptors than this process has (soft limit ${limit}). Raise it (ulimit -n ${count + headroom * 4}) before binding.`);
}
var HardwareRootFleet = class HardwareRootFleet {
	constructor(onHalt) {
		this.slots = [];
		this.pending = [];
		this.pendingHead = 0;
		this.idle = [];
		this.notClean = 0;
		this.halted = null;
		this.onHalt = onHalt;
	}
	/**
	* Detect, verify and bind every connected enclaweder. Each member is verified independently and
	* against ITS OWN trust domain, so a base unit and a Pro unit both bind, each proving genuineness
	* to the root that actually signed it. A member that fails to verify is fatal: booting a fleet
	* while ignoring a device that claims to be an enclaweder but cannot prove it is precisely the
	* situation the guard exists to refuse.
	*/
	static async boot(opts = {}) {
		const paths = opts.paths ?? findAllEnclaweders();
		const minMembers = opts.minMembers ?? 1;
		const fleet = new HardwareRootFleet(opts.onHalt ?? (() => {}));
		if (paths.length < minMembers) throw new HaltError(`hardware root fleet: ${paths.length} device(s) detected, ${minMembers} required`);
		const stateDir = opts.stateDir ?? process.env.HOME ?? "/var/lib/enclawed";
		const open = opts.openDevice ?? ((p) => new Enclaweder(p));
		assertDescriptorBudget(paths.length);
		const width = Math.max(1, Math.min(opts.bootConcurrency ?? 32, paths.length));
		const built = Array.from({ length: paths.length });
		let nextIndex = 0;
		const bindOne = async (i) => {
			const path = paths[i];
			const dev = open(path);
			const id = await dev.getIdentity();
			const guard = new HardwareRootGuard({
				statePath: join(stateDir, memberLatchName(id.uid.toString("hex"))),
				rootPubkey: opts.rootPubkey,
				onHalt: (r) => fleet.memberHalted(i, r)
			});
			const bound = await guard.boot(dev);
			const cert = await dev.getCert();
			const sku = (cert ? verifyCertSku(cert, id.uid, id.pubkeyRaw, opts.rootPubkey) : null) ?? "base";
			const serial = SERIAL_PREFIX[sku] + Buffer.from(id.uid).toString("hex").toUpperCase();
			const view = {
				index: i,
				...cert ? { cert: Buffer.from(cert).toString("hex") } : {},
				path,
				serial,
				uid: bound.uid,
				pubkey: bound.pubkey,
				sku,
				skuName: SKU_NAME[sku],
				status: "CLEAN",
				attestReady: false,
				inFlight: 0,
				completed: 0
			};
			built[i] = {
				index: i,
				path,
				dev,
				guard,
				sku,
				serial,
				uid: bound.uid,
				pubkey: bound.pubkey,
				attestReady: false,
				inFlight: 0,
				completed: 0,
				queue: Promise.resolve(),
				view,
				idle: false,
				halted: false,
				hbTimer: null
			};
		};
		await Promise.all(Array.from({ length: width }, async () => {
			for (let i = nextIndex++; i < paths.length; i = nextIndex++) await bindOne(i);
		}));
		fleet.slots = built;
		if (new Set(fleet.slots.map((s) => s.uid)).size !== fleet.slots.length) throw new HaltError("hardware root fleet: the same device was bound twice");
		for (const slot of fleet.slots) {
			slot.idle = true;
			fleet.idle.push(slot);
		}
		return fleet;
	}
	memberHalted(index, reason) {
		const slot = this.slots.find((s) => s.index === index);
		if (slot && !slot.halted) {
			slot.halted = true;
			this.notClean++;
		}
		this.halted = this.halted ?? `member ${index}: ${reason}`;
		this.onHalt(reason, slot ? {
			...slot.view,
			status: slot.guard.status
		} : null);
	}
	get size() {
		return this.slots.length;
	}
	/** Member 0's guard and device. The single-device API reuses these rather than opening a SECOND
	*  fd to the same hidraw node: two fds on one device means two interleaved request streams and
	*  two heartbeat timers, and the device rejects the interleaved frames. */
	get primary() {
		const s = this.slots[0];
		return s ? {
			guard: s.guard,
			dev: s.dev
		} : null;
	}
	/** Close the accredited session on every member. See closeHardwareRootSession(). */
	closeSession() {
		for (const s of this.slots) s.guard.closeSession();
	}
	/** As closeSession(), awaiting each device's acknowledgement of the clean close. */
	async closeSessionAsync() {
		await Promise.all(this.slots.map((s) => s.guard.closeSessionAsync().catch(() => void 0)));
	}
	/** CLEAN only while every member is CLEAN. */
	get status() {
		return this.halted || this.notClean > 0 ? "DIRTY" : "CLEAN";
	}
	/**
	* Snapshot of every member. Each slot owns ONE view object mutated in place, so this is a
	* shallow copy rather than N fresh allocations. It used to be called once per dispatched job,
	* making every job O(N) in allocations: at 4096 devices that alone cost 85 us of bookkeeping per
	* job and made the fleet, not the hardware, the ceiling. Nothing on the hot path calls it now.
	*/
	get members() {
		return this.slots.map((s) => {
			const v = s.view;
			v.status = s.guard.status;
			v.attestReady = s.attestReady;
			v.inFlight = s.inFlight;
			v.completed = s.completed;
			return { ...v };
		});
	}
	/** How many of each SKU are bound -- for the audit trail, not for trust decisions. */
	get composition() {
		const c = {
			base: 0,
			pro: 0
		};
		for (const s of this.slots) c[s.sku]++;
		return c;
	}
	/** Throws unless EVERY member is present and CLEAN. */
	assertClean() {
		if (this.halted) throw new HaltError(this.halted);
		if (this.notClean > 0) {
			const bad = this.slots.find((s) => s.guard.status !== "CLEAN");
			throw new HaltError(`hardware root fleet: member ${bad?.index} (${bad?.serial}) is ${bad?.guard.status}`);
		}
	}
	/**
	* Heartbeat every member, with start times STAGGERED across the interval: 4096 guards polling on
	* the same tick would put 4096 USB round trips into one moment and starve real work, while
	* spreading them keeps each device on its own cadence at a steady aggregate rate.
	*/
	startHeartbeat(opts = {}) {
		const interval = opts.intervalMs ?? 1e3;
		const n = this.slots.length || 1;
		this.slots.forEach((s, i) => {
			const delay = Math.floor(interval * i / n);
			s.hbTimer = setTimeout(() => {
				s.hbTimer = null;
				s.guard.startHeartbeat(s.dev, {
					...opts,
					intervalMs: interval
				});
			}, delay);
			s.hbTimer.unref?.();
		});
	}
	stopHeartbeat() {
		for (const s of this.slots) {
			if (s.hbTimer) {
				clearTimeout(s.hbTimer);
				s.hbTimer = null;
			}
			s.guard.stopHeartbeat();
		}
	}
	/**
	* Submit one job to the fleet. Devices PULL work as they go idle rather than the caller assigning
	* it up front, which is what makes a MIXED fleet actually faster: submit a batch and the Pro
	* members -- roughly 2x the signing rate of a base member -- simply take more of it. Measured on
	* a real base+Pro pair: 20 signatures split 14/6, 31.6 sig/s against 21.9 for the Pro alone.
	* Assigning by least-in-flight at submission time degenerates to round-robin, because when a
	* caller submits a batch nothing has completed yet and every device looks equally idle.
	*/
	async run(fn) {
		this.assertClean();
		if (this.slots.length === 0) throw new HaltError("hardware root fleet: no CLEAN member available");
		return new Promise((resolve, reject) => {
			this.pending.push({
				fn,
				resolve,
				reject
			});
			this.pump();
		});
	}
	/**
	* Hand queued work to idle devices. Both sides are O(1) per job: idle slots are popped off a
	* stack instead of rescanning all N, and the pending queue is consumed with a head index instead
	* of shift(). At 4096 members the scan-everything version cost 85 us per job; this is flat.
	*/
	pump() {
		while (this.idle.length > 0 && this.pendingHead < this.pending.length) {
			const slot = this.idle.pop();
			slot.idle = false;
			if (slot.guard.status !== "CLEAN") continue;
			const job = this.pending[this.pendingHead];
			this.pending[this.pendingHead++] = void 0;
			if (this.pendingHead > 1024 && this.pendingHead * 2 >= this.pending.length) {
				this.pending = this.pending.slice(this.pendingHead);
				this.pendingHead = 0;
			}
			this.enqueue(slot, job.fn).then(job.resolve, job.reject).finally(() => {
				this.markIdle(slot);
				this.pump();
			});
		}
	}
	markIdle(slot) {
		if (!slot.idle && slot.inFlight === 0 && slot.guard.status === "CLEAN") {
			slot.idle = true;
			this.idle.push(slot);
		}
	}
	enqueue(slot, fn) {
		slot.inFlight++;
		const member = slot.view;
		member.inFlight = slot.inFlight;
		member.completed = slot.completed;
		member.status = slot.guard.status;
		const next = slot.queue.then(() => fn(slot.dev, member), () => fn(slot.dev, member));
		slot.queue = next.then(() => {
			slot.inFlight--;
			slot.completed++;
		}, () => {
			slot.inFlight--;
			slot.completed++;
		});
		return next;
	}
	/**
	* Run one job on a SPECIFIC member, still queued behind that device's other work. Needed for
	* per-device measurement and diagnostics: run() deliberately picks by load, so it cannot time a
	* single device. Throws if the member does not exist or is not CLEAN.
	*/
	async runOn(index, fn) {
		this.assertClean();
		const slot = this.slots.find((s) => s.index === index);
		if (!slot) throw new HaltError(`hardware root fleet: no member ${index}`);
		if (slot.guard.status !== "CLEAN") throw new HaltError(`hardware root fleet: member ${index} is ${slot.guard.status}`);
		return this.enqueue(slot, fn);
	}
	/** Run the same job on EVERY member, in parallel. Used for corroboration, not throughput. */
	async all(fn) {
		this.assertClean();
		return Promise.all(this.slots.map(async (s) => {
			const member = s.view;
			try {
				return {
					member,
					value: await this.enqueue(s, fn),
					error: null
				};
			} catch (e) {
				return {
					member,
					value: null,
					error: e
				};
			}
		}));
	}
	/**
	* Enrol every member on one measurement so the fleet can attest it.
	*
	* Returns the members that are attest-ready. A member whose enrolment is refused is NOT made
	* ready: it is already holding a genesis (immutable until power cycle) that we cannot read back,
	* and attesting a mismatched measurement would fail-secure ZEROIZE it. `adoptExisting` is the
	* caller asserting that an already-enrolled member holds THIS measurement -- an assertion only a
	* human who provisioned it can make, which is why it is never the default.
	*/
	async enrollAll(meas32, { adoptExisting = false } = {}) {
		const results = await this.all(async (dev, member) => attesting(dev, member).enroll(meas32));
		for (const r of results) {
			const slot = this.slots[r.member.index];
			slot.attestReady = r.value === 0 || adoptExisting && r.error === null;
		}
		return this.members.filter((m) => m.attestReady);
	}
	/** Attest on the least-loaded attest-ready member. */
	async attest(meas32, nonce32) {
		this.assertClean();
		const ready = this.slots.filter((s) => s.attestReady && s.guard.status === "CLEAN");
		if (ready.length === 0) throw new HaltError("hardware root fleet: no member is enrolled for this measurement -- call enrollAll() first. Attesting an unenrolled measurement would fail-secure zeroize the device.");
		ready.sort((a, b) => a.inFlight - b.inFlight || a.completed - b.completed);
		const slot = ready[0];
		return {
			member: slot.view,
			result: await this.enqueue(slot, (dev, member) => attesting(dev, member).attest(meas32, nonce32))
		};
	}
	close() {
		this.stopHeartbeat();
		for (const s of this.slots) try {
			s.dev.close();
		} catch {}
	}
};
/**
* Narrow a bound device to one that can enrol and attest.
*
* Not every device object reaching the fleet implements those: the wire
* opcodes for them are not in this tree, so the Enclaweder class does not.
* Without this check the first call lands as "dev.enroll is not a function"
* from inside a worker, naming neither the device nor the reason. Fail with
* both, through the same HaltError path as every other fleet refusal.
*/
function attesting(dev, member) {
	const d = dev;
	if (typeof d.enroll !== "function" || typeof d.attest !== "function") throw new HaltError(`hardware root fleet: member ${member.index} (${member.skuName} ${member.serial}) does not implement enroll/attest -- this build cannot enrol a measurement on it`);
	return dev;
}
/** Resolve a cert's SKU through the pinned domains; null if it does not verify. */
function verifyCertSku(cert, uid, pubkeyRaw, rootPubRaw) {
	return verifyCert(cert, uid, pubkeyRaw, rootPubRaw ?? null)?.sku ?? null;
}
//#endregion
//#region src/enclawed/hardware-root/device-factors.ts
const CS04 = {
	STREAM_ENTROPY: 9,
	FIDO_CHALLENGE: 39,
	TOTP_VERIFY: 45,
	FACTOR_TAKEOVER: 47,
	UNLOCK_GRANT: 48,
	UNLOCK_USE: 49,
	UNLOCK_GET: 50,
	UNLOCK_REVOKE: 51,
	IDLOG_GET: 52,
	SEAL_OPEN: 53,
	SEALED: 54
};
const ST = {
	OK: 0,
	BAD_ARG: 1,
	BAD_STATE: 2,
	NOT_ENROLLED: 3,
	AUTH: 5,
	ZEROIZED: 6,
	BUSY: 7,
	UNSUPPORTED: 8,
	LOCKED: 9,
	TIME: 10
};
const T$1 = (s) => Buffer.from(s, "latin1");
const X25519_SPKI = Buffer.from("302a300506032b656e032100", "hex");
function failureOf(status) {
	switch (status) {
		case ST.UNSUPPORTED: return "unsupported";
		case ST.BAD_ARG: return "malformed";
		case ST.NOT_ENROLLED: return "not-enrolled";
		case ST.LOCKED: return "locked";
		case ST.BUSY: return "backoff";
		case ST.AUTH: return "rejected";
		case ST.TIME: return "clock-disagrees";
		case ST.ZEROIZED: return "zeroized";
		default: return "device-error";
	}
}
const waitOf = (p) => (p[0] === ST.BUSY || p[0] === ST.AUTH || p[0] === ST.TIME) && p.length >= 5 ? p.readUInt32LE(1) : void 0;
const le16 = (v) => {
	const b = Buffer.alloc(2);
	b.writeUInt16LE(v);
	return b;
};
const le32 = (v) => {
	const b = Buffer.alloc(4);
	b.writeUInt32LE(v >>> 0);
	return b;
};
const le64$1 = (v) => {
	const b = Buffer.alloc(8);
	b.writeBigUInt64LE(BigInt(v));
	return b;
};
function verifyBy(pub, msg, sig) {
	try {
		return verify(null, msg, createPublicKey(rawEd25519ToPem(pub)), sig);
	} catch {
		return false;
	}
}
async function call(dev, type, payload, timeoutMs = 5e3) {
	return (await dev.request(type, 1, payload, timeoutMs))?.payload ?? Buffer.alloc(0);
}
/** Seconds since the epoch, this host's clock. */
const nowS = () => Math.floor(Date.now() / 1e3);
/** Opens a seal: a fresh X25519 exchange with the device, verified against its certified key. */
async function openSeal(relay, devicePubRaw, uid) {
	const eph = generateKeyPairSync("x25519");
	const pub = Buffer.from(eph.publicKey.export({
		format: "der",
		type: "spki"
	}).subarray(12));
	const cn = randomBytes(16);
	const p = await relay(CS04.SEAL_OPEN, Buffer.concat([pub, cn]));
	if (p.length === 0) throw new FactorError("SEAL_OPEN", "no-response");
	if (p[0] !== ST.OK) throw new FactorError("SEAL_OPEN", failureOf(p[0]));
	if (p.length !== 133) throw new FactorError("SEAL_OPEN", "bad-record");
	const id = p.readBigUInt64LE(1);
	const dp = Buffer.from(p.subarray(9, 41));
	const dn = p.subarray(41, 57);
	if (!p.subarray(57, 69).equals(uid) || !verifyBy(devicePubRaw, Buffer.concat([
		T$1("ECW-SEAL-OPEN-01"),
		uid,
		le64$1(id),
		pub,
		dp,
		cn,
		dn
	]), p.subarray(69, 133))) throw new FactorError("SEAL_OPEN", "bad-signature");
	let shared;
	try {
		shared = diffieHellman({
			privateKey: eph.privateKey,
			publicKey: createPublicKey({
				key: Buffer.concat([X25519_SPKI, dp]),
				format: "der",
				type: "spki"
			})
		});
	} catch {
		throw new FactorError("SEAL_OPEN", "bad-record");
	}
	const salt = Buffer.concat([cn, dn]);
	const tail = Buffer.concat([
		uid,
		le64$1(id),
		pub,
		dp
	]);
	const kEnc = Buffer.from(hkdfSync("sha3-256", shared, salt, Buffer.concat([T$1("ECW-SEAL-KENC-01"), tail]), 32));
	const kMac = Buffer.from(hkdfSync("sha3-256", shared, salt, Buffer.concat([T$1("ECW-SEAL-KMAC-01"), tail]), 32));
	shared.fill(0);
	return {
		id,
		uid: Buffer.from(uid),
		kEnc,
		kMac
	};
}
/** The sealed frame for `op` carrying `inner` (that operation's plaintext request). Wipes the seal's keys. */
function sealFrame(s, op, inner) {
	if (inner.length > 320) throw new Error("a sealed request carries at most 320 bytes");
	const ct = Buffer.from(inner);
	for (let off = 0, i = 0; off < ct.length; off += 32, i++) {
		const ks = createHmac("sha3-256", s.kEnc).update(Buffer.concat([T$1("ECW-SEAL-KSTR-01"), Buffer.from([i])])).digest();
		for (let j = 0; j < 32 && off + j < ct.length; j++) ct[off + j] ^= ks[j];
	}
	const tag = createHmac("sha3-256", s.kMac).update(Buffer.concat([
		T$1("ECW-SEAL-MACT-01"),
		s.uid,
		le64$1(s.id),
		Buffer.from([op]),
		le16(ct.length),
		ct
	])).digest();
	s.kEnc.fill(0);
	s.kMac.fill(0);
	return Buffer.concat([
		le64$1(s.id),
		Buffer.from([op]),
		le16(ct.length),
		ct,
		tag
	]);
}
/** Send one factor-carrying request (`inner` is wiped afterwards) and return the device's answer. */
async function factorRequest(t, devicePubRaw, uid, op, inner, timeoutMs = 15e3) {
	try {
		if (t.kind === "direct") return await call(t.dev, op, inner, timeoutMs);
		const s = await openSeal(t.relay, devicePubRaw, uid);
		const p = await t.relay(CS04.SEALED, sealFrame(s, op, inner));
		if (p.length === 1 && p[0] === ST.AUTH) throw new FactorError("SEALED", "seal-refused");
		return p;
	} finally {
		inner.fill(0);
	}
}
/** What a person reads for each refusal; the device operation stays on the error's `op` field. */
const FACTOR_ERROR_TEXT = {
	unsupported: "the device's firmware is too old for this: update the Enclaweder firmware",
	malformed: "the request was malformed",
	"no-session": "there is no session to take over: open one normally",
	"not-enrolled": "the authenticator or recovery codes are not set up on the device",
	locked: "the device is locked: its halt state is set, or recovery is locked after repeated failures",
	backoff: "too many recent attempts",
	rejected: "the device refused the code",
	"clock-disagrees": CLOCK_DISAGREES_TEXT,
	"no-grant": "there is no live unlock grant",
	mismatch: "the unlock does not match the live grant",
	zeroized: "the device was zeroized and must be recovered first",
	"bad-signature": "the device's answer did not verify under its certified key",
	"bad-record": "the device's answer was malformed",
	"seal-refused": "the device refused the sealed request (altered, replayed or expired)",
	"use-refused": "the device refused this unlock use: it does not match the live unlock (another job, project, launch kind, ticket or credential), or its sealed request did not verify; no use was spent",
	"sealed-required": "the device (or the hardware root's owner relaying for it) refused this request sealed, and with the hardware root required it is never relayed in the clear: update the Enclaweder firmware to command set 0.5 (firmware 0.3.3)",
	"no-response": "the device did not answer",
	"device-error": "the device could not complete the request"
};
var FactorError = class extends Error {
	constructor(op, code, waitMs = null) {
		super(`${FACTOR_ERROR_TEXT[code]}${waitMs ? `; try again in ${Math.ceil(waitMs / 1e3)} s` : ""}`);
		this.name = "FactorError";
		this.op = op;
		this.code = code;
		this.waitMs = waitMs;
	}
};
/** An authenticator-code verdict sealed to the device through a relay, checked as deviceTotpVerify does. */
async function sealedTotpVerdict(relay, devicePubRaw, uid, p) {
	if (typeof p.code !== "string" || !/^\d{6}$/.test(p.code)) return {
		ok: false,
		code: "malformed-code"
	};
	const purpose = Object.hasOwn(TOTP_PURPOSE, p.purpose) ? TOTP_PURPOSE[p.purpose] : void 0;
	if (purpose === void 0) return {
		ok: false,
		code: "unknown-purpose"
	};
	const nonce = p.nonce ?? randomBytes(32);
	const t = p.nowS ?? nowS();
	let ans;
	try {
		ans = await factorRequest({
			kind: "sealed",
			relay
		}, devicePubRaw, uid, CS04.TOTP_VERIFY, Buffer.concat([
			nonce,
			le32(Number(p.code)),
			le64$1(t),
			Buffer.from([purpose])
		]));
	} catch (err) {
		if (err instanceof FactorError) return {
			ok: false,
			code: err.code
		};
		throw err;
	}
	const r = checkVerdictAnswer(ans, {
		nonce,
		pubkeyRaw: devicePubRaw,
		uid,
		purpose,
		nowS: t
	});
	if (r.ok) return {
		ok: true,
		body: r.body,
		rawBody: r.rawBody,
		sig: r.sig,
		nonce
	};
	return {
		ok: false,
		code: r.code,
		...r.waitMs === void 0 ? {} : { waitMs: r.waitMs }
	};
}
/** A session obtained by a takeover: its id, and keepalive / close under its key. */
var TakenSession = class {
	#dev;
	#key;
	#ctr = 0n;
	constructor(channel, sid, counter, uid, key, dev) {
		this.channel = channel;
		this.sid = sid;
		this.counter = counter;
		this.uid = uid;
		this.#key = key;
		this.#dev = dev;
	}
	/** The next authenticated request body `sid | ctr | HMAC(K, tag | uid | sid | ctr)`. */
	authed(kind) {
		const tag = this.channel === "latch" ? kind === "keepalive" ? "ECW-LATCH-KAL-01" : "ECW-LATCH-CLS-01" : kind === "keepalive" ? "ECW-ANCHOR-KAL-1" : "ECW-ANCHOR-CLS-1";
		this.#ctr += 1n;
		const mac = createHmac("sha3-256", this.#key).update(Buffer.concat([
			T$1(tag),
			this.uid,
			le64$1(this.sid),
			le64$1(this.#ctr)
		])).digest();
		return Buffer.concat([
			le64$1(this.sid),
			le64$1(this.#ctr),
			mac
		]);
	}
	async keepalive() {
		await this.#send(this.channel === "latch" ? 31 : 27, "keepalive");
	}
	async close() {
		await this.#send(this.channel === "latch" ? 32 : 26, "close");
		this.#key.fill(0);
	}
	async #send(type, kind) {
		if (!this.#dev) throw new Error("this session was taken over through a relay: its owner sends keepalives");
		const p = await call(this.#dev, type, this.authed(kind));
		if (p[0] !== ST.OK) throw new FactorError(kind === "close" ? "CLOSE" : "KEEPALIVE", failureOf(p[0] ?? 255), waitOf(p) ?? null);
	}
};
/** The FIDO2 challenge for a takeover (purpose 2), and the registered credential id. */
async function takeoverFidoChallenge(dev) {
	const p = await call(dev, CS04.FIDO_CHALLENGE, Buffer.from([2]));
	if (p[0] !== ST.OK || p.length < 38) throw new FactorError("FIDO_CHALLENGE", p.length ? failureOf(p[0]) : "no-response");
	return {
		clientDataHash: Buffer.from(p.subarray(1, 33)),
		counter: p.readUInt32LE(33),
		credentialId: Buffer.from(p.subarray(38, 38 + p[37]))
	};
}
function factorTail(recoveryCode, f) {
	if (recoveryCode.length !== 16) throw new Error("a recovery code is 16 bytes");
	if (f.kind === "totp") return Buffer.concat([
		recoveryCode,
		Buffer.from([2]),
		le32(f.code),
		le64$1(Math.floor(f.hostTimeS))
	]);
	const ad = f.authenticatorData;
	if (ad.length < 37 || ad.length > 96 || f.signature.length !== 64) throw new Error("FIDO2 assertion malformed");
	return Buffer.concat([
		recoveryCode,
		Buffer.from([1, ad.length]),
		ad,
		f.signature
	]);
}
/**
* Takeover: end the live session on `channel` and open this host's in its place, authorised
* by both of the person's factors (the device's two-factor rules: one-time recovery code, failure
* counter, backoff, lockout). Never on a set latch, never while the two-factor path is locked, and
* never a latch clear. Throws FactorError with the device's refusal; a refused attempt that the
* device evaluated is counted on the device. `recoveryCode` is wiped.
*/
async function takeoverByFactors(t, devicePubRaw, uid, p) {
	const eph = generateKeyPairSync("x25519");
	const hostPub = Buffer.from(eph.publicKey.export({
		format: "der",
		type: "spki"
	}).subarray(12));
	const hostNonce = randomBytes(16);
	const ch = p.channel === "latch" ? 1 : 2;
	const inner = Buffer.concat([
		Buffer.from([ch]),
		hostPub,
		hostNonce,
		factorTail(p.recoveryCode, p.factor)
	]);
	p.recoveryCode.fill(0);
	const r = await factorRequest(t, devicePubRaw, uid, CS04.FACTOR_TAKEOVER, inner);
	if (r.length === 0) throw new FactorError("FACTOR_TAKEOVER", "no-response");
	if (r[0] !== ST.OK) throw new FactorError("FACTOR_TAKEOVER", r[0] === ST.BAD_STATE ? "no-session" : failureOf(r[0]), waitOf(r) ?? null);
	const isLatch = p.channel === "latch";
	if (r.length !== (isLatch ? 133 : 141)) throw new FactorError("FACTOR_TAKEOVER", "bad-record");
	const sid = r.readBigUInt64LE(1);
	const counter = isLatch ? 0n : r.readBigUInt64LE(9);
	const o = isLatch ? 9 : 17;
	const dp = Buffer.from(r.subarray(o, o + 32));
	const dn = Buffer.from(r.subarray(o + 32, o + 48));
	const ruid = r.subarray(o + 48, o + 60);
	const transcript = isLatch ? Buffer.concat([
		T$1("ECW-LATCH-OPN-01"),
		ruid,
		le64$1(sid),
		hostPub,
		dp,
		hostNonce,
		dn
	]) : Buffer.concat([
		T$1("ECW-ANCHOR-OPN-1"),
		ruid,
		le64$1(sid),
		le64$1(counter),
		hostPub,
		dp,
		hostNonce,
		dn
	]);
	if (!ruid.equals(uid) || !verifyBy(devicePubRaw, transcript, r.subarray(o + 60, o + 124))) throw new FactorError("FACTOR_TAKEOVER", "bad-signature");
	const shared = diffieHellman({
		privateKey: eph.privateKey,
		publicKey: createPublicKey({
			key: Buffer.concat([X25519_SPKI, dp]),
			format: "der",
			type: "spki"
		})
	});
	const key = Buffer.from(hkdfSync("sha3-256", shared, Buffer.concat([hostNonce, dn]), Buffer.concat([
		T$1(isLatch ? "ECW-LATCH-KDF-01" : "ECW-ANCHOR-KDF-1"),
		uid,
		le64$1(sid),
		hostPub,
		dp
	]), 32));
	shared.fill(0);
	return new TakenSession(p.channel, sid, counter, Buffer.from(uid), key, t.kind === "direct" ? t.dev : null);
}
const TAG_UNLOCK_GRANT = T$1("enclaweder.unlock-grant.v1");
const TAG_UNLOCK_USE = T$1("enclaweder.unlock-use.v1");
const TAG_UNLOCK_STATE = T$1("enclaweder.unlock-state.v1");
const UNLOCK_STATE = [
	"none",
	"active",
	"exhausted",
	"expired",
	"revoked",
	"reset"
];
const UNLOCK_WHY = [
	"",
	"host",
	"latch",
	"zeroize",
	"replaced"
];
function parseUnlockBody(b) {
	if (b.length !== 100 || b[0] !== 1) throw new FactorError("UNLOCK", "bad-record");
	return {
		state: UNLOCK_STATE[b[1]] ?? `state ${b[1]}`,
		why: UNLOCK_WHY[b[2]] ?? `why ${b[2]}`,
		kind: [
			"",
			"grant",
			"use",
			"state",
			"revoke"
		][b[3]] || `kind ${b[3]}`,
		uses: b.readUInt16LE(4),
		used: b.readUInt16LE(6),
		gid: b.readBigUInt64LE(8),
		boot: b.readBigUInt64LE(16),
		leaseMs: b.readUInt32LE(24),
		leaseLeftMs: b.readUInt32LE(28),
		grantHostTimeS: b.readBigUInt64LE(32),
		hostTimeS: b.readBigUInt64LE(40),
		step: b.readUInt32LE(48),
		useIndex: b.readUInt16LE(52),
		uid: Buffer.from(b.subarray(56, 68)),
		scope: Buffer.from(b.subarray(68, 100))
	};
}
function unlockAnswer(p, tag, nonce, pub, uid) {
	if (p.length !== 165) throw new FactorError("UNLOCK", "bad-record");
	const raw = p.subarray(1, 101);
	const sig = p.subarray(101, 165);
	if (!verifyBy(pub, Buffer.concat([
		tag,
		nonce,
		raw
	]), sig)) throw new FactorError("UNLOCK", "bad-signature");
	const body = parseUnlockBody(Buffer.from(raw));
	if (!body.uid.equals(uid)) throw new FactorError("UNLOCK", "bad-record");
	return {
		body,
		record: {
			v: 1,
			tag: tag.equals(TAG_UNLOCK_GRANT) ? "grant" : tag.equals(TAG_UNLOCK_USE) ? "use" : "state",
			uid: uid.toString("hex"),
			pubkey: pub.toString("hex"),
			nonce: nonce.toString("hex"),
			body: raw.toString("hex"),
			sig: sig.toString("hex")
		}
	};
}
/**
* Unlock grant: the person's current authenticator code (6 digits) buys a grant of `uses` uses
* (1..65 535) inside `leaseS` seconds (30..129 600, 36 h), for `scope` (32 bytes: what is being
* unlocked). Each use's host time is checked by the device, not here.
* Send it `{ kind: "sealed", relay }` when another process owns the device, so the code never
* crosses that process in the clear.
*/
async function grantUnlock(t, devicePubRaw, uid, p) {
	if (!/^\d{6}$/.test(p.code) || p.scope.length !== 32 || !Number.isInteger(p.uses) || p.uses < 1 || p.uses > 65535 || !Number.isInteger(p.leaseS) || p.leaseS < 30 || p.leaseS > 129600) return {
		ok: false,
		code: "malformed"
	};
	const nonce = randomBytes(32);
	const inner = Buffer.concat([
		nonce,
		le32(Number(p.code)),
		le64$1(p.hostTimeS ?? nowS()),
		le16(p.uses),
		le32(p.leaseS),
		p.scope
	]);
	let r;
	try {
		r = await factorRequest(t, devicePubRaw, uid, CS04.UNLOCK_GRANT, inner);
	} catch (err) {
		if (err instanceof FactorError) return {
			ok: false,
			code: err.code
		};
		throw err;
	}
	if (r.length === 0) return {
		ok: false,
		code: "no-response"
	};
	if (r[0] !== ST.OK) {
		const w = r.length === 5 ? r.readUInt32LE(1) : r.length === 97 ? r.readUInt32LE(17) : void 0;
		return {
			ok: false,
			code: failureOf(r[0]),
			...w === void 0 ? {} : { waitMs: w }
		};
	}
	try {
		const a = unlockAnswer(r, TAG_UNLOCK_GRANT, nonce, devicePubRaw, uid);
		if (a.body.kind !== "grant" || a.body.state !== "active" || !a.body.scope.equals(p.scope)) return {
			ok: false,
			code: "bad-record"
		};
		return {
			ok: true,
			grant: a.body,
			record: a.record
		};
	} catch (err) {
		return {
			ok: false,
			code: err.code ?? "bad-record"
		};
	}
}
/**
* Unlock use: spend ONE use of grant `gid` on the device; returns the receipt the device signed
* over this call's fresh nonce. No receipt means no use: never act on an unlock without one.
*/
async function spendUnlock(dev, devicePubRaw, uid, p) {
	const nonce = p.nonce ?? randomBytes(32);
	if (nonce.length !== 32 || p.scope.length !== 32) return {
		ok: false,
		code: "malformed"
	};
	const r = await call(dev, CS04.UNLOCK_USE, Buffer.concat([
		nonce,
		le64$1(p.gid),
		le64$1(p.hostTimeS ?? nowS()),
		p.scope
	]));
	if (r.length === 0) return {
		ok: false,
		code: "no-response"
	};
	try {
		if (r[0] === ST.OK) {
			const a = unlockAnswer(r, TAG_UNLOCK_USE, nonce, devicePubRaw, uid);
			if (a.body.kind !== "use" || a.body.gid !== p.gid || !a.body.scope.equals(p.scope)) return {
				ok: false,
				code: "bad-record"
			};
			noteActivation(devicePubRaw.toString("hex"), nonce, {
				kind: "unlock-use",
				gid: a.body.gid,
				useIndex: a.body.useIndex,
				boot: a.body.boot
			});
			return {
				ok: true,
				receipt: a.body,
				record: a.record
			};
		}
		if (r[0] === ST.BAD_STATE && r.length === 165) return {
			ok: false,
			code: "no-grant",
			state: unlockAnswer(r, TAG_UNLOCK_STATE, nonce, devicePubRaw, uid).body
		};
	} catch (err) {
		return {
			ok: false,
			code: err.code ?? "bad-record"
		};
	}
	return {
		ok: false,
		code: r[0] === ST.AUTH ? "mismatch" : failureOf(r[0])
	};
}
/** The grant's state, signed over a fresh nonce. */
async function readUnlock(dev, devicePubRaw, uid) {
	const nonce = randomBytes(32);
	const r = await call(dev, CS04.UNLOCK_GET, nonce);
	if (r[0] !== ST.OK) throw new FactorError("UNLOCK_GET", r.length ? failureOf(r[0]) : "no-response");
	return unlockAnswer(r, TAG_UNLOCK_STATE, nonce, devicePubRaw, uid).body;
}
/** Ends grant `gid` (0n = whatever is live). Returns the signed state after. */
async function revokeUnlock(dev, devicePubRaw, uid, gid = 0n) {
	const nonce = randomBytes(32);
	const r = await call(dev, CS04.UNLOCK_REVOKE, Buffer.concat([nonce, le64$1(gid)]));
	if (r[0] !== ST.OK) throw new FactorError("UNLOCK_REVOKE", r.length ? failureOf(r[0]) : "no-response");
	return unlockAnswer(r, TAG_UNLOCK_STATE, nonce, devicePubRaw, uid).body;
}
/**
* Verifies a receipt offline: signed by `devicePubRaw` under the use tag over `nonce` (the
* verifier's own), for `uid` and `scope`, with a host time within `skewS` of `nowS`. Returns the
* body, or null. A verifier must also refuse a (boot, gid, useIndex) it has already seen.
*/
function verifyUnlockReceipt(rec, expect) {
	try {
		if (rec.v !== 1 || rec.tag !== "use" || rec.nonce !== expect.nonce.toString("hex")) return null;
		const raw = Buffer.from(rec.body, "hex");
		if (!verifyBy(expect.pubkeyRaw, Buffer.concat([
			TAG_UNLOCK_USE,
			expect.nonce,
			raw
		]), Buffer.from(rec.sig, "hex"))) return null;
		const b = parseUnlockBody(raw);
		const now = expect.nowS ?? nowS();
		if (b.kind !== "use" || !b.uid.equals(expect.uid) || !b.scope.equals(expect.scope) || Math.abs(Number(b.hostTimeS) - now) > (expect.skewS ?? 120)) return null;
		return b;
	} catch {
		return null;
	}
}
const TAG_IDENTITY_LOG = T$1("enclaweder.identity-log.v1");
const LOAD_REASON = {
	1: "magic missing",
	2: "CRC mismatch",
	3: "other"
};
const Z_REASON = {
	1: "tamper",
	2: "environmental failure",
	3: "host zeroize",
	4: "quorum failure",
	5: "entropy failure",
	6: "self-test failure"
};
/** The device's identity events (newest first) and its boot counter, signed over a fresh nonce. */
async function readIdentityLog(dev, devicePubRaw, uid) {
	const nonce = randomBytes(32);
	return parseIdentityLog(await call(dev, CS04.IDLOG_GET, nonce), nonce, devicePubRaw, uid);
}
/** Checks one identity-log answer against the nonce that was sent and the certified key. */
function parseIdentityLog(p, nonce, devicePubRaw, uid) {
	if (p.length === 0) throw new FactorError("IDLOG_GET", "no-response");
	if (p[0] !== ST.OK || p.length < 18) throw new FactorError("IDLOG_GET", failureOf(p[0]));
	const n = p[17];
	const bl = 17 + n * 40;
	if (p.length !== 1 + bl + 64) throw new FactorError("IDLOG_GET", "bad-record");
	const body = p.subarray(1, 1 + bl);
	if (!verifyBy(devicePubRaw, Buffer.concat([
		TAG_IDENTITY_LOG,
		nonce,
		uid,
		body
	]), p.subarray(1 + bl))) throw new FactorError("IDLOG_GET", "bad-signature");
	const events = [];
	for (let i = 0; i < n; i++) {
		const e = body.subarray(17 + i * 40, 57 + i * 40);
		const k = e[16];
		events.push({
			seq: e.readBigUInt64LE(0),
			boot: e.readBigUInt64LE(8),
			kind: k === 1 ? "mint" : k === 2 ? "load-failure" : k === 3 ? "zeroize" : `kind ${k}`,
			reason: e[17],
			reasonText: k === 2 ? LOAD_REASON[e[17]] ?? `reason ${e[17]}` : k === 3 ? Z_REASON[e[17]] ?? `reason ${e[17]}` : "",
			ctx: e[18],
			flags: e[19] & 127,
			arg: e.readUInt32LE(20),
			fingerprint: Buffer.from(e.subarray(24, 32)),
			tickMs: e.readUInt32LE(32),
			bootUnsaved: (e[19] & 128) !== 0
		});
	}
	return {
		boot: body.readBigUInt64LE(0),
		total: body.readBigUInt64LE(8),
		events
	};
}
/** SHA3-256(pubkey)[0..8]: how a MINT event names the key it minted. */
function identityFingerprint(pubkeyRaw) {
	return createHash("sha3-256").update(pubkeyRaw).digest().subarray(0, 8);
}
/** `n` (1..256) bytes of optional extra entropy from the hardware root: mix them in, never use them alone. */
async function readDeviceEntropy(dev, n, timeoutMs = 1e3) {
	if (!Number.isInteger(n) || n < 1 || n > 256) throw new RangeError(`device entropy: 1..256 bytes`);
	const p = await call(dev, CS04.STREAM_ENTROPY, le16(n), timeoutMs);
	if (p.length === 0) throw new FactorError("STREAM_ENTROPY", "no-response");
	if (p[0] !== ST.OK || p.length < 3 || p.readUInt16LE(1) !== n || p.length !== 3 + n) throw new FactorError("STREAM_ENTROPY", p[0] !== ST.OK ? failureOf(p[0]) : "bad-record");
	return Buffer.from(p.subarray(3));
}
//#endregion
//#region src/enclawed/hardware-root/key-derive.ts
const T = (s) => Buffer.from(s, "latin1");
const le64 = (v) => {
	const b = Buffer.alloc(8);
	b.writeBigUInt64LE(v);
	return b;
};
/**
* KEY_DERIVE for `label32` (what the key is for, e.g. SHA3-256 of a purpose string and the uid).
* `relay` carries SEAL_OPEN / SEALED to the device (directly, or through the owner); `devicePubRaw`
* is the CERTIFIED device key and `uid` its uid. Uses the newest activation this process holds for
* the device unless one is given, and spends it for key derivation only when the device answered.
*/
async function deriveDeviceKey(relay, devicePubRaw, uid, label32, activation = null) {
	if (label32.length !== 32) throw new Error("a key-derivation label is 32 bytes");
	const pubHex = devicePubRaw.toString("hex");
	const act = activation ?? peekActivation(pubHex, "key");
	if (!act) return {
		ok: false,
		code: "no-activation"
	};
	const seal = await openSeal(relay, devicePubRaw, uid);
	const kEnc = Buffer.from(seal.kEnc);
	const kMac = Buffer.from(seal.kMac);
	const id = seal.id;
	try {
		const inner = Buffer.concat([act.nonce, label32]);
		const ans = await relay(CS04.SEALED, sealFrame(seal, CS05.KEY_DERIVE, inner));
		inner.fill(0);
		if (ans.length === 1) switch (ans[0]) {
			case 1: return {
				ok: false,
				code: "unsupported"
			};
			case 5:
				spendActivation(pubHex, act, "key");
				return {
					ok: false,
					code: "refused"
				};
			case 6: return {
				ok: false,
				code: "zeroized"
			};
			case 9: return {
				ok: false,
				code: "locked"
			};
			default: return {
				ok: false,
				code: "bad-response"
			};
		}
		const opened = openKeyDeriveAnswer(kEnc, kMac, uid, id, ans);
		if (!opened) return {
			ok: false,
			code: "bad-response"
		};
		spendActivation(pubHex, act, "key");
		const { key, binding } = opened;
		if (!bindingNames(binding, act.facts)) {
			key.fill(0);
			return {
				ok: false,
				code: "bad-response"
			};
		}
		return {
			ok: true,
			key,
			binding,
			facts: act.facts
		};
	} finally {
		kEnc.fill(0);
		kMac.fill(0);
		if (!activation) act.nonce.fill(0);
	}
}
/**
* Opens a KEY_DERIVE answer `status(1) bind(32) ct(32) tag(32)` under the request's seal keys:
* the tag HMAC-SHA3-256(K_mac, "ECW-SEAL-RMAC-01" | uid | seal_id | 0x39 | bind | ct) must verify
* (constant time), then key = ct XOR HMAC-SHA3-256(K_enc, "ECW-SEAL-RSTR-01" | 0x00). Null when the
* answer is not one, or does not verify under these keys.
*/
function openKeyDeriveAnswer(kEnc, kMac, uid, sealId, ans) {
	if (ans.length !== 97 || ans[0] !== 0) return null;
	const binding = Buffer.from(ans.subarray(1, 33));
	const ct = ans.subarray(33, 65);
	if (!timingSafeEqual(createHmac("sha3-256", kMac).update(Buffer.concat([
		T("ECW-SEAL-RMAC-01"),
		uid,
		le64(sealId),
		Buffer.from([CS05.KEY_DERIVE]),
		binding,
		ct
	])).digest(), ans.subarray(65, 97))) return null;
	const ks = createHmac("sha3-256", kEnc).update(Buffer.concat([T("ECW-SEAL-RSTR-01"), Buffer.from([0])])).digest();
	const key = Buffer.alloc(32);
	for (let i = 0; i < 32; i++) key[i] = ct[i] ^ ks[i];
	ks.fill(0);
	return {
		key,
		binding
	};
}
/**
* What a kit says when the bound device predates command set 0.5 and it keeps deriving its
* credential key from a CHALLENGE signature: the residual this closes on newer firmware.
*/
const KEY_DERIVE_RESIDUAL = "the bound Enclaweder's firmware predates command set 0.5: the credential key is derived from a device signature that any process of this user able to reach the device (directly or through the hardware root's owner) can also obtain; update the Enclaweder firmware to bind it to a device-verified launch activation";
//#endregion
//#region src/enclawed/hardware-root/relayed-anchor.ts
const RELAYED = new Set([
	23,
	25,
	26,
	27
]);
/** A relayed anchor read cannot be fresh (see the header); the reader falls back to "offline". */
var RelayedAnchorReadError = class extends Error {
	constructor() {
		super("the device's anchor cannot be read freshly through the hardware root's owner (the read carries no nonce of this process)");
		this.name = "RelayedAnchorReadError";
	}
};
/**
* The client's anchor device through the owner. `health` is this process's view of the root (it
* must turn non-CLEAN when the owner is lost or replaced). Null when the root is not CLEAN or has
* no certified primary member.
*/
function relayedAnchorDevice(root, health) {
	const primary = root.members[0];
	if (!primary || health().status !== "CLEAN") return null;
	const certifiedPub = Buffer.from(primary.pubkey, "hex");
	const uid = Buffer.from(primary.uid, "hex");
	const assertClean = () => {
		const h = health();
		if (h.status !== "CLEAN") throw new Error(`hardware root ${h.status}: ${h.reason}`);
	};
	const frames = {
		async request(type, _id, payload = Buffer.alloc(0)) {
			if (!RELAYED.has(type)) throw new Error(`command 0x${type.toString(16)} is not relayed through the hardware root's owner`);
			assertClean();
			const ans = await root.relayAnchor(type, payload);
			assertClean();
			return ans.length === 0 ? null : { payload: ans };
		},
		sendNoWait(type, payload) {
			if (RELAYED.has(type)) root.relayAnchor(type, payload).catch(() => void 0);
		}
	};
	return {
		relayed: true,
		devicePublicKey: Buffer.from(certifiedPub),
		async anchorOpen(devicePublicKey) {
			if (!Buffer.from(devicePublicKey).equals(certifiedPub)) throw new Error("audit anchor: a session through the owner opens only against the certified primary member's key");
			assertClean();
			return AnchorSession.open(frames, certifiedPub, ANCHOR_OPEN_TIMEOUT_MS);
		},
		async anchorGet() {
			throw new RelayedAnchorReadError();
		},
		async anchorRead(nonce32) {
			assertClean();
			const ans = await root.relayAnchor(CS05.ANCHOR_READ, nonce32);
			assertClean();
			return ans;
		},
		...root.relaySealed ? { async anchorOpenBound(devicePublicKey, activationNonce) {
			if (!Buffer.from(devicePublicKey).equals(certifiedPub)) throw new Error("audit anchor: a session through the owner opens only against the certified primary member's key");
			const relaySealed = root.relaySealed;
			assertClean();
			return AnchorSession.openBound(frames, certifiedPub, activationNonce, { send: async (request) => {
				const seal = await openSeal(relaySealed, certifiedPub, uid);
				const ans = await relaySealed(CS04.SEALED, sealFrame(seal, CS05.ANCHOR_OPEN_BOUND, request));
				assertClean();
				return ans.length === 1 && ans[0] === 1 ? Buffer.from([8]) : ans;
			} });
		} } : {}
	};
}
//#endregion
//#region src/enclawed/hardware-root/relayed-factors.ts
/** The commands the sealed channel carries (the device refuses any other inside SEALED). */
const SEALED_OPS = new Set([
	45,
	46,
	CS04.UNLOCK_GRANT
]);
const ERR_AUTH = 5;
const ERR_BAD_ARG = 1;
/**
* The client's DeviceTotpAccess through the owner. `health` is this process's view of the root
* (it must turn non-CLEAN when the owner is lost or replaced). Null when the root is not CLEAN.
*/
function relayedTotpAccess(root, health, o = {}) {
	const clearUnlockUse = o.clearUnlockUse ?? (() => hardwareRootMode() !== "required");
	const primary = root.members[0];
	if (!primary || health().status !== "CLEAN") return null;
	const pubkeyRaw = Buffer.from(primary.pubkey, "hex");
	const uid = Buffer.from(primary.uid, "hex");
	const assertClean = () => {
		const h = health();
		if (h.status !== "CLEAN") throw new Error(`hardware root ${h.status}: ${h.reason}`);
	};
	const dev = { async request(type, _id, payload = Buffer.alloc(0)) {
		if (SEALED_OPS.has(type)) {
			const seal = await openSeal(root.relaySealed, pubkeyRaw, uid);
			const ans = await root.relaySealed(CS04.SEALED, sealFrame(seal, type, payload));
			if (ans.length === 1 && ans[0] === ERR_AUTH) throw new FactorError("SEALED", "seal-refused");
			return { payload: ans };
		}
		if (type === CS04.UNLOCK_USE) {
			const seal = await openSeal(root.relaySealed, pubkeyRaw, uid);
			const ans = await root.relaySealed(CS04.SEALED, sealFrame(seal, type, payload));
			if (ans.length === 1 && ans[0] === ERR_AUTH) throw new FactorError("UNLOCK_USE", "use-refused");
			if (!(ans.length === 1 && ans[0] === ERR_BAD_ARG)) return { payload: ans };
			if (!clearUnlockUse()) throw new FactorError("UNLOCK_USE", "sealed-required");
			return { payload: await root.relayUnlockUse(payload) };
		}
		throw new Error(`command 0x${type.toString(16)} is not relayed through the hardware root's owner`);
	} };
	return {
		pubkeyRaw,
		uid,
		cert: Buffer.from(primary.cert, "hex"),
		run: async (fn) => {
			assertClean();
			const out = await fn(dev);
			assertClean();
			return out;
		},
		latch: async (nonce32) => {
			assertClean();
			const a = await root.attest(nonce32);
			const m = a.members.find((x) => x.uid === primary.uid);
			if (!m || a.nonce !== nonce32.toString("hex") || !a.nonces.includes(a.nonce)) throw new Error("the owner's attestation does not cover this process's nonce");
			assertClean();
			return {
				signedOver: attestDigest(a.nonces.map((n) => Buffer.from(n, "hex"))),
				payload: Buffer.from(m.latch, "hex")
			};
		}
	};
}
//#endregion
//#region src/enclawed/hardware-root/session-anchor.ts
var SessionAnchorRefused = class extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "SessionAnchorRefused";
	}
};
function hasFn(o, name) {
	return typeof o === "object" && o !== null && typeof o[name] === "function";
}
/**
* Decide a session's anchor. `bound`: a hardware root is bound to this session (this process
* owns the devices, or is a client of the owner). `device`: what anchors for it, and
* `devicePublicKey` the certified key a session is opened against.
*/
function decideSessionAnchor(input) {
	if (!input.bound) return {
		ok: true,
		mode: "none"
	};
	const d = input.device;
	if (hasFn(d, "anchorOpen") && hasFn(d, "anchorGet")) {
		if (!input.devicePublicKey || input.devicePublicKey.length !== 32) return {
			ok: false,
			code: "anchor-unavailable",
			reason: "the session's hardware root has no certified device key to open the audit anchor against"
		};
		return {
			ok: true,
			mode: "authenticated",
			device: d,
			devicePublicKey: Buffer.from(input.devicePublicKey),
			relayed: input.relayed === true
		};
	}
	if (hasFn(d, "anchorSet")) return {
		ok: false,
		code: "anchor-unauthenticated",
		reason: "the session's hardware root can only anchor without authentication, which any process of this user could use to anchor a log of its choosing: refusing the session"
	};
	return {
		ok: false,
		code: "anchor-unavailable",
		reason: "the session's hardware root offers no authenticated audit anchor (the device is not CLEAN, or nothing relays it): refusing the session"
	};
}
/** The decision, or SessionAnchorRefused for a bound session that cannot anchor with authentication. */
function requireSessionAnchor(decision) {
	if (!decision.ok) throw new SessionAnchorRefused(decision.code, decision.reason);
	return decision;
}
//#endregion
//#region src/enclawed/hardware-root/recovery-code.ts
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECK = ALPHABET + "*~$=U";
/** Parse what a person typed. Never throws; the closed `code` says what was wrong. */
function parseRecoveryCode(typed) {
	const s = typed.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
	if (s.length !== 27) return {
		ok: false,
		code: "length"
	};
	let v = 0n;
	for (const ch of s.slice(0, 26)) {
		const d = ALPHABET.indexOf(ch);
		if (d < 0) return {
			ok: false,
			code: "character"
		};
		v = v << 5n | BigInt(d);
	}
	if (v >> 128n) return {
		ok: false,
		code: "range"
	};
	const ck = CHECK.indexOf(s[26]);
	if (ck < 0 || BigInt(ck) !== v % 37n) return {
		ok: false,
		code: "check"
	};
	return {
		ok: true,
		bytes: Buffer.from(v.toString(16).padStart(32, "0"), "hex")
	};
}
/** A TOTP code as typed (6 digits, spaces allowed). */
function parseTotp(typed) {
	const s = typed.replace(/\s/g, "");
	return /^\d{6}$/.test(s) ? Number(s) : null;
}
//#endregion
//#region src/enclawed/hardware-root/index.ts
/** Where the guard keeps its state (and, beside it, the device request journal). */
function guardStatePath(opts) {
	return opts.statePath ?? process.env.ENCLAWEDER_STATE ?? `${process.env.HOME ?? "/var/lib/enclawed"}/.enclawed-hw-root.state`;
}
/** Every latch on this host, those an earlier version wrote included. */
function latchesOf(opts) {
	return hostLatches(guardStatePath(opts), process.env.ENCLAWEDER_STATE_DIR ?? process.env.HOME ?? "/var/lib/enclawed");
}
/** Refuses to go on while any latch on this host is DIRTY, whichever device left it. */
function refuseDirty(latches, when) {
	const d = dirtyLatch(latches);
	if (d) throw new HaltError(`hardware root is latched DIRTY (${d.dirty?.reason ?? "reason not recorded"}) by enclaweder ${d.bound?.serial ?? "of unrecorded serial"}${when}. Human recovery is required with that device present.`);
}
let boundGuard = null;
/** Set when boot was refused: every gate stays closed until a later boot succeeds (finding H5). */
let refusedReason = null;
let boundDev = null;
let boundFleet = null;
let bootPromise = null;
let resolved = false;
let remote = null;
let shared = false;
let sharedDirty = null;
let brokerHandle = null;
let ownerScheduler = null;
/**
* What running without an Enclaweder means, said wherever it applies. Keys
* held in software sit on the host, so whoever compromises the host can use
* them, and secrets on it are exposed.
*/
const SOFTWARE_ONLY_NOTICE = "Running without an Enclaweder: keys are held in software on this host, so a compromised host can use them and expose secrets. Using Enclawed without an Enclaweder is far more secure than not using Enclawed at all; for security that holds when the host itself is compromised, the Enclaweder hardware is required.";
/** True if this deployment refuses to start without a hardware root (absence is fatal). */
function hardwareRootRequired() {
	return hardwareRootMode() === "required";
}
/**
* Detect and bind the hardware root at bootstrap. Idempotent; concurrent callers share one boot.
*   - device present -> bind + heartbeat + gate (MANDATORY); throws (fail-secure) if not genuine or
*     a prior DIRTY latch persists.
*   - device absent + required -> throws HaltError (refuse to boot).
*   - device absent + not required -> returns null (software-only); assertHardwareClean() no-ops.
*/
/** Explicit opt-out: the operator is knowingly running without the bound device. */
function hardwareRootOptional() {
	return hardwareRootMode() === "optional";
}
async function bootHardwareRoot(opts = {}) {
	if (resolved) return boundGuard ?? remote;
	if (bootPromise) return bootPromise;
	bootPromise = bootOnce(opts).catch((err) => {
		refusedReason = err instanceof HaltError ? err.reason : err?.message ?? String(err);
		bootPromise = null;
		throw err;
	});
	return bootPromise;
}
async function bootOnce(opts) {
	return (async () => {
		const pinned = opts.hidraw ?? process.env.ENCLAWEDER_HIDRAW;
		if (pinned) {
			const why = pinnedPathRefusal(pinned);
			if (why) throw new HaltError(`refusing the pinned Enclaweder path: ${why}`);
		}
		const paths = pinned ? [pinned] : findAllEnclaweders();
		if (!(paths[0] ?? null)) {
			const viaOwner = await clientOfOwnerWithoutDevice(opts);
			if (viaOwner) return viaOwner;
			if (hardwareRootRequired()) throw new HaltError("ENCLAWEDER_ROOT=required but no enclaweder was detected at bootstrap");
			const latches = latchesOf(opts);
			refuseDirty(latches, " and no enclaweder is present; removing a device does not clear it");
			const open = latches.find((l) => l.sessionOpen && l.bound?.serial);
			if (open && !hardwareRootOptional()) throw new HaltError(`refusing to continue a session accredited by enclaweder ${open.bound.serial}: the device is not present. Reconnect it, or set ENCLAWEDER_ROOT=optional to start a fresh software-only session.`);
			try {
				console.error("[enclawed] hardware root: no enclaweder detected — running software-only" + (process.platform !== "linux" ? ` (auto-detect is Linux/hidraw-only; platform=${process.platform})` : "") + ". Set ENCLAWEDER_ROOT=required to make its absence fatal. Running without an Enclaweder: keys are held in software on this host, so a compromised host can use them and expose secrets. Using Enclawed without an Enclaweder is far more secure than not using Enclawed at all; for security that holds when the host itself is compromised, the Enclaweder hardware is required.");
			} catch {}
			resolved = true;
			return null;
		}
		if (brokerDisabled()) {
			if (await ownerAnswers(opts.ownerSocket ?? brokerSocketPath())) throw new HaltError("an Enclawed process on this machine owns the Enclaweder; with sharing turned off (ENCLAWEDER_BROKER=off) this process may not open it as well");
			const g = await bindLocal(paths, opts);
			resolved = true;
			refusedReason = null;
			return g;
		}
		const pathErr = brokerPathError();
		if (pathErr) throw new HaltError(`the hardware root broker has no socket path: ${pathErr}`);
		const r = await acquireRoot(paths, opts);
		resolved = true;
		refusedReason = null;
		return r;
	})();
}
/**
* A process that sees no device joins the machine's owner as a client, when one answers on the
* canonical socket; null when none does (then the device-absent rules apply).
*/
async function clientOfOwnerWithoutDevice(opts) {
	if (brokerDisabled() || brokerPathError() || !await ownerAnswers(brokerSocketPath())) return null;
	refuseDirty(latchesOf(opts), "");
	let r;
	try {
		r = await connectRoot(brokerSocketPath(), 500, { rootPubkey: opts.rootPubkey ?? null });
	} catch (err) {
		if (err instanceof RootHaltError) throw new HaltError(err.message);
		if (err instanceof RootAttestError) throw new HaltError(`refusing the process on the hardware root broker socket: ${err.message}`);
		throw err;
	}
	if (!r) return null;
	remote = r;
	shared = true;
	resolved = true;
	refusedReason = null;
	r.lost.then(() => {
		if (!sharedDirty) remote = null;
	});
	return r;
}
/**
* Binds the detected devices in this process: the one place a device is
* opened. Every connected Enclaweder, base and Pro alike, as one accreditor.
*/
async function bindLocal(paths, opts) {
	const path = paths[0];
	try {
		console.error(`[enclawed] hardware root: enclaweder detected at ${path} — verifying…`);
	} catch {}
	refuseDirty(latchesOf(opts), "");
	if (paths.length > 1) {
		boundFleet = await HardwareRootFleet.boot({
			paths,
			rootPubkey: opts.rootPubkey,
			stateDir: dirname(guardStatePath(opts)),
			onHalt: (r, m) => {
				try {
					console.error(`[hardware-root] FLEET HALT: ${r}${m ? ` (member ${m.serial})` : ""}`);
				} catch {}
				captureAndRecordTamper(`fleet: ${r}`, {
					serial: m?.serial ?? null,
					pubkey: m?.pubkey ?? null,
					status: m?.status ?? "DIRTY"
				}).catch(() => {});
			}
		});
		const primary = boundFleet.primary;
		boundGuard = primary?.guard ?? null;
		boundDev = primary?.dev ?? null;
		boundFleet.startHeartbeat();
		installCleanExit();
		const c = boundFleet.composition;
		try {
			console.error(`[enclawed] hardware root FLEET engaged — ${boundFleet.size} devices (${c.base} base, ${c.pro} Pro) bound as one accreditor.`);
		} catch {}
		return boundGuard;
	}
	boundDev = new Enclaweder(path);
	boundGuard = new HardwareRootGuard({
		statePath: guardStatePath(opts),
		rootPubkey: opts.rootPubkey,
		onHalt: (r) => {
			try {
				console.error(`[hardware-root] HALT: ${r}`);
			} catch {}
			const info = hardwareRootInfo();
			captureAndRecordTamper(r, {
				serial: info.serial,
				pubkey: info.pubkey,
				status: info.status
			}).catch(() => {});
		}
	});
	let bound;
	try {
		bound = await boundGuard.boot(boundDev);
	} catch (err) {
		const msg = err instanceof HaltError ? err.reason : String(err);
		if (/device latch unsupported/.test(msg) && hardwareRootOptional() && !hardwareRootRequired()) {
			try {
				console.error(`[enclawed] hardware root: ${msg}. ENCLAWEDER_ROOT=optional: running software-only. ${SOFTWARE_ONLY_NOTICE}`);
			} catch {}
			boundDev.close();
			boundDev = null;
			boundGuard = null;
			return null;
		}
		boundGuard = null;
		boundDev.close();
		boundDev = null;
		throw err;
	}
	try {
		console.error(`[enclawed] hardware root of trust ENGAGED — enclaweder ${bound.serial} bound (key ${bound.pubkey.slice(0, 16)}…); on-chip challenge-response verified. Agent accreditation now REQUIRES this device present + CLEAN.`);
	} catch {}
	boundGuard.startHeartbeat(boundDev);
	installCleanExit();
	return boundGuard;
}
/**
* The device stays DIRTY unless this process closes its host session cleanly, so every graceful
* exit must send the authenticated close: process exit (normal end, process.exit) and SIGINT /
* SIGTERM / SIGHUP. A signal that already has a handler is left to it (the app's own shutdown
* calls closeHardwareRootSession); an unhandled one gets a handler that closes, then re-raises the
* signal so the process ends exactly as it would have. A crash or SIGKILL leaves the device dirty:
* that is the point.
*/
let cleanExitInstalled = false;
function installCleanExit() {
	if (cleanExitInstalled) return;
	cleanExitInstalled = true;
	process.once("exit", () => {
		try {
			closeHardwareRootSession();
		} catch {}
	});
	for (const sig of [
		"SIGINT",
		"SIGTERM",
		"SIGHUP"
	]) {
		if (process.listenerCount(sig) > 0) continue;
		const onSig = () => {
			try {
				closeHardwareRootSession();
			} catch {}
			process.removeListener(sig, onSig);
			process.kill(process.pid, sig);
		};
		process.on(sig, onSig);
	}
}
/** This process's own devices, as the owner serves them. */
function localService() {
	return {
		members: () => hardwareRootMembersLocal().map((m) => ({
			uid: m.uid,
			pubkey: m.pubkey,
			serial: m.serial,
			...m.cert ? { cert: m.cert } : {}
		})),
		attest: localAttest,
		run: async (fn) => {
			if (boundFleet) return boundFleet.run((dev) => fn(dev));
			if (!boundDev) throw new HaltError("no Enclaweder is bound");
			return fn(boundDev);
		},
		health: localHealth,
		checkpoint: (head32) => {
			if (!boundGuard) return Promise.reject(new HaltError("no Enclaweder is bound"));
			return boundGuard.checkpoint(head32);
		},
		relaySealed: (type, payload) => relayToPrimary(type, payload),
		relayUnlockUse: (payload) => relayToPrimary(49, payload),
		relayAnchor: (type, payload) => relayToPrimary(type, payload)
	};
}
/** One relayed request to the primary member, only while this owner's root is CLEAN. */
async function relayToPrimary(type, payload) {
	const h = localHealth();
	if (h.status !== "CLEAN") throw new HaltError(`hardware root ${h.status}: ${h.reason}`);
	const dev = boundDev;
	if (!dev) throw new HaltError("no Enclaweder is bound");
	return (await dev.request(type, 1, payload, 15e3))?.payload ?? Buffer.alloc(0);
}
/** Each bound member's raw LATCH_GET over `nonce32`, read on that member itself. */
async function localAttest(nonce32) {
	if (boundFleet) return (await boundFleet.all((dev) => latchGetRaw(dev, nonce32))).map((r) => {
		if (!r.value) throw r.error ?? new HaltError(`member ${r.member.serial} gave no latch read`);
		return {
			uid: r.member.uid,
			latch: r.value.toString("hex")
		};
	});
	if (!boundDev || !boundGuard?.bound) throw new HaltError("no Enclaweder is bound");
	return [{
		uid: boundGuard.bound.uid,
		latch: (await latchGetRaw(boundDev, nonce32)).toString("hex")
	}];
}
/**
* Each member's latch read, signed by its device over a nonce of the caller's, for a process
* that wants to check the devices itself (codenclawed's hook; findings H1, H15): every member,
* never just the first. As the owner, read here; as a client, relayed and verified through the
* owner. Null when no device is bound. Verify with verifyRootMembers + verifyRootAttestation.
*/
async function attestHardwareRoot(nonce32) {
	if (boundGuard) {
		const digestNonces = [Buffer.from(nonce32)];
		const raw = await localAttest(attestDigest(digestNonces));
		return {
			nonce: nonce32.toString("hex"),
			nonces: digestNonces.map((n) => n.toString("hex")),
			members: hardwareRootMembersLocal().map((m) => ({
				uid: m.uid,
				pubkey: m.pubkey,
				cert: m.cert ?? "",
				sku: m.sku,
				latch: raw.find((r) => r.uid === m.uid)?.latch ?? ""
			}))
		};
	}
	if (shared && remote) return remote.attest(nonce32);
	return null;
}
function localHealth() {
	if (!boundGuard) return {
		status: "UNAVAILABLE",
		reason: "no Enclaweder is bound"
	};
	try {
		boundFleet?.assertClean();
	} catch (err) {
		return {
			status: "DIRTY",
			reason: err.message
		};
	}
	const g = boundGuard.gate();
	if (g.kind === "clean") return { status: "CLEAN" };
	if (g.kind === "checking") return {
		status: "CHECKING",
		reason: `HALT: ${g.reason}`
	};
	return {
		status: "DIRTY",
		reason: `HALT: ${g.reason}`
	};
}
/**
* Becomes the machine's owner of the devices, or a client of the owner that
* already serves them. Ownership is the socket: whoever listens on it first
* binds the devices; everyone else signs through it.
*/
async function acquireRoot(paths, opts) {
	const sock = brokerSocketPath();
	const deadline = Date.now() + 15e3;
	for (let attempt = 0; Date.now() < deadline; attempt++) {
		refuseDirty(latchesOf(opts), "");
		const server = await claimOwnership(sock);
		if (server) {
			let settle;
			let fail;
			const ready = new Promise((res, rej) => {
				settle = res;
				fail = rej;
			});
			ready.catch(() => void 0);
			const served = serveRoot(server, ready);
			try {
				const g = await bindLocal(paths, opts);
				const svc = localService();
				ownerScheduler = schedulerFor(svc, new QueueJournal(queueJournalPath(guardStatePath(opts))));
				settle({
					svc,
					scheduler: ownerScheduler
				});
				brokerHandle = served;
				remote = null;
				return g;
			} catch (err) {
				fail(err);
				await new Promise((r) => setTimeout(r, 200));
				await served.close();
				throw err;
			}
		}
		let r;
		try {
			r = await connectRoot(sock, 500, { rootPubkey: opts.rootPubkey ?? null });
		} catch (err) {
			if (err instanceof RootHaltError) throw new HaltError(err.message);
			if (err instanceof RootAttestError) throw new HaltError(`refusing the process on the hardware root broker socket: ${err.message}`);
			throw err;
		}
		if (r) {
			remote = r;
			shared = true;
			r.lost.then(() => takeOver(paths, opts));
			return r;
		}
		await new Promise((res) => setTimeout(res, Math.min(1e3, 50 * 2 ** attempt) * Math.random()));
	}
	throw new HaltError("could not reach or become the owner of this machine's Enclaweders");
}
/**
* The owner went away. Its clients read UNAVAILABLE until one of them has
* bound the devices itself (full genuine check, persisted DIRTY latch) or has
* connected to whoever did. A takeover the guard refuses latches DIRTY.
*/
async function takeOver(paths, opts) {
	for (;;) try {
		const found = opts.hidraw ?? process.env.ENCLAWEDER_HIDRAW ? paths : findAllEnclaweders();
		if (found.length === 0) {
			sharedDirty = "the Enclaweder is gone: no device on the bus after its owner exited";
			return;
		}
		await acquireRoot(found, opts);
		return;
	} catch (err) {
		if (err instanceof HaltError) {
			sharedDirty = err.message;
			return;
		}
		await new Promise((res) => setTimeout(res, 500));
	}
}
function hardwareRootInfo() {
	if (!boundGuard && shared) {
		const m = remote?.members[0];
		return {
			anchored: true,
			serial: m?.serial ?? null,
			pubkey: m?.pubkey ?? null,
			status: hardwareRootHealth().status
		};
	}
	if (!boundGuard) return {
		anchored: false,
		serial: null,
		pubkey: null,
		status: "software-only"
	};
	const b = boundGuard.bound;
	return {
		anchored: true,
		serial: b?.serial ?? null,
		pubkey: b?.pubkey ?? null,
		status: boundGuard.status
	};
}
/** Gate a sensitive operation. Throws HaltError if the bound hardware root is DIRTY. No-op when no
*  device was detected at bootstrap (software-only deployment). */
function assertHardwareClean() {
	if (refusedReason && !boundGuard && !shared) throw new HaltError(`hardware root boot was refused: ${refusedReason}`);
	if (!boundGuard && shared) {
		const h = hardwareRootHealth();
		if (h.status !== "CLEAN") throw new HaltError(`hardware root ${h.status}: ${h.reason}`);
		return;
	}
	if (!boundGuard) return;
	boundGuard.assertClean();
	if (boundFleet) boundFleet.assertClean();
}
/**
* The machine's hardware root as this process sees it: CLEAN, DIRTY (latched),
* UNAVAILABLE (its owner is gone or busy; not a tamper), or CHECKING (the gate
* is closed while the device is asked again; refuse gated work, do not halt).
*/
function hardwareRootHealth() {
	if (refusedReason && !boundGuard && !shared) return {
		status: "DIRTY",
		reason: `boot refused: ${refusedReason}`
	};
	if (sharedDirty) return {
		status: "DIRTY",
		reason: sharedDirty
	};
	if (boundGuard) return localHealth();
	if (shared) return remote?.health() ?? {
		status: "UNAVAILABLE",
		reason: "between owners"
	};
	return {
		status: "UNAVAILABLE",
		reason: "no Enclaweder is bound"
	};
}
/**
* Every device of this machine's hardware root, for signing: the principal's
* keys (one per device) and a way to sign on one of them. Each request goes
* through the owner's scheduler, this process's own included. Null when no
* device is bound.
*/
function hardwareRootSigning() {
	const members = currentMembers();
	if (!members) return null;
	return {
		members,
		run: async (fn) => {
			const until = performance.now() + TAKEOVER_WAIT_MS;
			for (;;) {
				const dev = await currentSigningDevice();
				try {
					return await fn(dev);
				} catch (err) {
					const h = hardwareRootHealth();
					const ownerLost = /owner is gone/.test(err.message) || h.status === "UNAVAILABLE" || h.status === "CHECKING";
					if (h.status === "DIRTY" || !ownerLost || performance.now() > until) throw err;
					await new Promise((r) => setTimeout(r, 50));
				}
			}
		}
	};
}
/**
* Command set 0.5: KEY_DERIVE on the primary member, for this launch (key-derive.ts). Null when no
* hardware root is held here. `derive(label32)` answers `{ ok: false, code: "unsupported" }` on
* firmware before 0.5 (a kit then keeps its older key and reports KEY_DERIVE_RESIDUAL), and
* "no-activation" when this process made no device-verified activation in the last 120 s.
*/
function hardwareRootKeyDerivation() {
	if (!boundGuard && shared) {
		const r = remote;
		const m = r?.members[0];
		if (!r || !m || hardwareRootHealth().status !== "CLEAN") return null;
		return {
			uid: m.uid,
			pubkey: m.pubkey,
			derive: (label32) => deriveDeviceKey((type, payload) => r.relaySealed(type, payload), Buffer.from(m.pubkey, "hex"), Buffer.from(m.uid, "hex"), label32)
		};
	}
	const dev = boundDev;
	const b = boundGuard?.bound;
	if (!dev || !b || localHealth().status !== "CLEAN") return null;
	const relay = async (type, payload) => (await dev.request(type, 1, payload, 15e3))?.payload ?? Buffer.alloc(0);
	return {
		uid: b.uid,
		pubkey: b.pubkey,
		derive: (label32) => deriveDeviceKey(relay, Buffer.from(b.pubkey, "hex"), Buffer.from(b.uid, "hex"), label32)
	};
}
/**
* Command set 0.5, proven by the device (activation.ts proveCommandSet05): a fresh ANCHOR_READ on
* the primary member over this process's nonce, signed by its certified key, carried directly or
* relayed by the owner (who cannot forge it). Never IDENTIFY's version, which is unsigned and,
* through the owner, the owner's word. "unproven" when no hardware root is held here or it is not
* CLEAN.
*/
async function hardwareRootCommandSet() {
	if (!boundGuard && shared) {
		const r = remote;
		const m = r?.members[0];
		if (!r || !m || hardwareRootHealth().status !== "CLEAN") return {
			status: "unproven",
			reason: "the hardware root is not CLEAN here"
		};
		return proveCommandSet05((nonce) => r.relayAnchor(CS05.ANCHOR_READ, nonce), Buffer.from(m.pubkey, "hex"), Buffer.from(m.uid, "hex"));
	}
	const dev = boundDev;
	const b = boundGuard?.bound;
	if (!dev || !b || localHealth().status !== "CLEAN") return {
		status: "unproven",
		reason: "no CLEAN hardware root is held here"
	};
	return proveCommandSet05((nonce) => dev.anchorRead(nonce), Buffer.from(b.pubkey, "hex"), Buffer.from(b.uid, "hex"));
}
function currentMembers() {
	if (boundGuard) return hardwareRootMembersLocal().map((m) => ({
		uid: m.uid,
		pubkey: m.pubkey
	}));
	if (shared && remote) return remote.members.map((m) => ({
		uid: m.uid,
		pubkey: m.pubkey
	}));
	return null;
}
/** How long a request waits for a new owner while ownership changes hands. */
const TAKEOVER_WAIT_MS = 5e3;
async function currentSigningDevice() {
	const until = performance.now() + TAKEOVER_WAIT_MS;
	for (;;) {
		const h = hardwareRootHealth();
		if (h.status === "DIRTY") throw new HaltError(`hardware root DIRTY: ${h.reason}`);
		if (h.status === "CLEAN") {
			if (boundGuard && ownerScheduler) {
				const sched = ownerScheduler;
				const members = currentMembers();
				return {
					getIdentity: async () => ({
						uid: Buffer.from(members[0].uid, "hex"),
						pubkeyRaw: Buffer.from(members[0].pubkey, "hex")
					}),
					challenge: (nonce32) => sched.submit(0, nonce32)
				};
			}
			if (boundGuard) {
				const svc = localService();
				const members = currentMembers();
				return {
					getIdentity: async () => ({
						uid: Buffer.from(members[0].uid, "hex"),
						pubkeyRaw: Buffer.from(members[0].pubkey, "hex")
					}),
					challenge: (nonce32) => svc.run((d) => d.challenge(nonce32))
				};
			}
			if (remote) return remote.device();
		}
		if (performance.now() > until) throw new HaltError(`hardware root ${h.status}: ${"reason" in h ? h.reason : ""}`);
		await new Promise((r) => setTimeout(r, 50));
	}
}
/**
* The bound primary device, for signing with its key (for example the swarm
* operator's key). Null unless a device is bound and currently CLEAN, so a
* caller can never sign through a device the guard has halted. A machine with
* several devices signs through hardwareRootSigning() instead.
*/
function hardwareRootSigningDevice() {
	if (!boundGuard && shared) {
		if (!remote || remote.members.length !== 1 || hardwareRootHealth().status !== "CLEAN") return null;
		return remote.device();
	}
	if (!boundDev || !boundGuard?.bound) return null;
	try {
		assertHardwareClean();
	} catch {
		return null;
	}
	return boundDev;
}
/**
* The bound primary device for device-verified TOTP (TOTP_VERIFY / SIGN_ATTESTED; totp-verify.ts)
* and the device-counted unlock (UNLOCK_GRANT / UNLOCK_USE), with the key and certificate the
* guard verified at boot. Null unless the root is CLEAN. A client of another owner gets the same
* access through the owner (relayed-factors.ts): codes sealed to the device, every answer checked
* here against the primary member's certified key over a nonce chosen here.
*/
function hardwareRootTotpDevice() {
	if (!boundGuard && shared) {
		const r = remote;
		if (!r) return null;
		return relayedTotpAccess(r, () => remote === r && !boundGuard ? hardwareRootHealth() : {
			status: "UNAVAILABLE",
			reason: "the hardware root's owner changed"
		});
	}
	const dev = boundDev;
	const b = boundGuard?.bound;
	const cert = boundGuard?.certificate;
	if (!dev || !b || !cert || localHealth().status !== "CLEAN") return null;
	return {
		pubkeyRaw: Buffer.from(b.pubkey, "hex"),
		uid: Buffer.from(b.uid, "hex"),
		cert,
		run: (fn) => fn(dev)
	};
}
/**
* The audit anchor this session must use, decided by the kit (session-anchor.ts): this process's
* own bound device, or, for a client of the machine's owner, the authenticated anchor session
* relayed through the owner (relayed-anchor.ts). A session with a hardware root that cannot anchor
* with authentication is refused (`ok: false`); adapters run the session only on `ok: true`.
*/
function hardwareRootSessionAnchor() {
	if (!boundGuard && shared) {
		const r = remote;
		const device = r ? relayedAnchorDevice(r, () => remote === r && !boundGuard ? hardwareRootHealth() : {
			status: "UNAVAILABLE",
			reason: "the hardware root's owner changed"
		}) : null;
		return decideSessionAnchor({
			bound: true,
			device,
			devicePublicKey: device?.devicePublicKey ?? null,
			relayed: true
		});
	}
	if (!boundGuard) return decideSessionAnchor({
		bound: refusedReason !== null,
		device: null,
		devicePublicKey: null
	});
	const b = boundGuard.bound;
	const clean = localHealth().status === "CLEAN";
	return decideSessionAnchor({
		bound: true,
		device: clean ? boundDev : null,
		devicePublicKey: clean && b ? Buffer.from(b.pubkey, "hex") : null
	});
}
/** hardwareRootSessionAnchor(), throwing SessionAnchorRefused when the session must not run. */
function requireHardwareRootSessionAnchor() {
	return requireSessionAnchor(hardwareRootSessionAnchor());
}
function hardwareRootMembersLocal() {
	if (boundFleet) return boundFleet.members;
	if (!boundGuard?.bound) return [];
	const b = boundGuard.bound;
	const sku = b.sku ?? (b.serial.startsWith("ECPRO-") ? "pro" : "base");
	return [{
		index: 0,
		path: process.env.ENCLAWEDER_HIDRAW ?? "",
		serial: b.serial,
		uid: b.uid,
		pubkey: b.pubkey,
		...boundGuard.certificate ? { cert: boundGuard.certificate.toString("hex") } : {},
		sku,
		skuName: skuDisplayName(sku),
		status: boundGuard.status,
		attestReady: false,
		inFlight: 0,
		completed: 0
	}];
}
/** True iff a hardware root was detected and bound at bootstrap. */
/**
* Close the hardware-accredited session on a deliberate shutdown.
*
* Without this the sessionOpen flag never clears, every later boot
* without the device looks like an interrupted accredited session, and
* rule "absent + CLEAN -> may run" becomes unreachable. Safe to call
* when no device was ever bound.
*/
function closeHardwareRootSession() {
	boundFleet?.closeSession();
	boundGuard?.closeSession();
	ownerScheduler?.stop();
	brokerHandle?.close();
	brokerHandle = null;
}
/**
* As closeHardwareRootSession(), waiting for each device to acknowledge the clean close (the
* only thing that disarms its dirty-on-start latch). Call it from SIGINT/SIGTERM handlers and
* every graceful exit path; a process that dies without it leaves the device DIRTY, by design.
*/
async function closeHardwareRootSessionAsync() {
	await boundFleet?.closeSessionAsync();
	await boundGuard?.closeSessionAsync().catch(() => void 0);
	ownerScheduler?.stop();
	await brokerHandle?.close().catch(() => void 0);
	brokerHandle = null;
}
function hardwareRootPresent() {
	return boundGuard !== null || shared;
}
/**
* Recover a DIRTY latch from a process that has NOT booted the root (a CLI, the installer).
*
* The Enclaweder holds the latch and clears it only with two factors it verifies itself (an
* authenticator code or security-key assertion AND a one-time recovery code) or with the operator
* quorum. `humanConfirmed` is no longer accepted as an authority: a process of this user could
* always pass `true`. Nothing here ends an accredited session (finding H4): only the guard that
* opened a device host session closes it, on a clean exit.
*/
async function recoverHardwareRootStandalone(opts) {
	if (!opts.auth) throw new HaltError("recovery: the Enclaweder now holds the latch and clears it only with two factors it verifies (an authenticator code or security key AND a one-time recovery code) or with the operator quorum; 'humanConfirmed' is not an authority. Run: enclawed hardware-root recover");
	if (!brokerDisabled() && await ownerAnswers(brokerSocketPath())) throw new HaltError("recovery: an Enclawed process on this machine owns the Enclaweder; stop it first");
	const paths = opts.hidraw ? [opts.hidraw] : findAllEnclaweders();
	if (paths.length === 0) throw new HaltError("recovery: no enclaweder detected on the bus");
	const guard = new HardwareRootGuard({
		statePath: guardStatePath(opts),
		rootPubkey: opts.rootPubkey
	});
	const devs = paths.map((p) => new Enclaweder(p));
	try {
		const own = (await Promise.all(devs.map((d) => d.getIdentity().then((id) => id.pubkeyRaw.toString("hex")).catch(() => null)))).indexOf(guard.bound?.pubkey ?? "");
		const recovered = await guard.recover(devs[Math.max(own, 0)], opts.auth);
		const serial = guard.bound?.serial;
		return serial ? {
			recovered,
			serial
		} : { recovered };
	} finally {
		for (const d of devs) d.close();
	}
}
/**
* The hardware root as the DEVICES report it (signed answers over fresh nonces), plus every host
* latch cache. Reads only; never binds, never opens a host session. Refuses to open a device that
* a live owner holds: then the owner's health is reported instead.
*/
async function hardwareRootStatusStandalone(opts = {}) {
	const hostLatches = latchesOf(opts);
	if (!brokerDisabled() && await ownerAnswers(brokerSocketPath())) {
		const r = await connectRoot(brokerSocketPath()).catch(() => null);
		return {
			hostLatches,
			owner: r ? r.health() : {
				status: "UNAVAILABLE",
				reason: "owner did not answer"
			},
			devices: []
		};
	}
	const devices = [];
	for (const p of findAllEnclaweders()) {
		let dev = null;
		try {
			dev = new Enclaweder(p);
			const id = await dev.getIdentity();
			const rep = {
				path: p,
				serial: id.serial,
				uid: id.uid.toString("hex"),
				pubkey: id.pubkeyRaw.toString("hex"),
				state: null,
				cert: null,
				sku: null,
				keyProof: null,
				latch: null,
				latchError: null,
				latchErrorCode: null,
				failures: null,
				custody: null
			};
			rep.state = await dev.getStatus().then((s) => s.state).catch(() => null);
			const cert = await dev.getCert().catch(() => null);
			const parsed = cert ? verifyCert(cert, id.uid, id.pubkeyRaw, opts.rootPubkey ?? null) : null;
			rep.cert = !cert ? "missing" : parsed ? "valid" : "invalid";
			if (parsed?.sku) {
				rep.sku = parsed.sku;
				rep.serial = (parsed.sku === "pro" ? "ECPRO-" : "ENCLW-") + id.uid.toString("hex").toUpperCase();
			}
			try {
				rep.latch = await readDeviceLatch(dev, id.pubkeyRaw, id.uid);
				rep.keyProof = true;
				rep.failures = await readFailLog(dev, id.pubkeyRaw, id.uid).catch(() => null);
				const c = await readCustody(dev, id.pubkeyRaw, id.uid).catch(() => null);
				rep.custody = c ? {
					counter: c.counter,
					m: c.m,
					keys: c.keys.map((k) => k.toString("hex"))
				} : null;
			} catch (err) {
				rep.latchError = err instanceof DeviceLatchError ? err.message : String(err);
				rep.latchErrorCode = err instanceof DeviceLatchError ? err.code : null;
				if (rep.latchErrorCode === "bad-signature") rep.keyProof = false;
			}
			if (rep.keyProof === null) {
				const nonce = randomBytes(32);
				rep.keyProof = await dev.challenge(nonce).then((c) => verifyChallenge(id.pubkeyRaw, nonce, c.uid, c.sig)).catch(() => null);
			}
			devices.push(rep);
		} catch (err) {
			devices.push({
				path: p,
				serial: "?",
				uid: "?",
				pubkey: "",
				state: null,
				cert: null,
				sku: null,
				keyProof: null,
				latch: null,
				latchError: err instanceof Error ? err.message : String(err),
				latchErrorCode: null,
				failures: null,
				custody: null
			});
		} finally {
			dev?.close();
		}
	}
	return {
		hostLatches,
		owner: null,
		devices
	};
}
/**
* The host seam for code outside the core TypeScript build: the enterprise edition's sealed
* accreditors. They reach
* THIS hardware root through it (broker client with device attestation, device-held latch, one
* owner per device), never a copy of their own: a second implementation was a second owner of
* the device that bypassed every check here. Installed once per process; a later module instance
* of this file (a test runner's isolation, or a second bundle) leaves the first in place.
*/
const HARDWARE_ROOT_SEAM = Symbol.for("enclawed.hardware-root.v1");
if (!(HARDWARE_ROOT_SEAM in globalThis)) Object.defineProperty(globalThis, HARDWARE_ROOT_SEAM, {
	value: Object.freeze({
		version: 1,
		bootHardwareRoot,
		assertHardwareClean,
		hardwareRootHealth
	}),
	writable: false,
	configurable: false,
	enumerable: false
});
//#endregion
export { connectRoot as $, grantUnlock as A, sealedTotpVerdict as B, decideSessionAnchor as C, deriveDeviceKey as D, KEY_DERIVE_RESIDUAL as E, readDeviceEntropy as F, HardwareRootGuard as G, takeoverByFactors as H, readIdentityLog as I, verifyForensicLog as J, setForensicAuditSink as K, readUnlock as L, openSeal as M, parseIdentityLog as N, FactorError as O, parseUnlockBody as P, brokerSocketPath as Q, revokeUnlock as R, SessionAnchorRefused as S, relayedAnchorDevice as T, takeoverFidoChallenge as U, spendUnlock as V, verifyUnlockReceipt as W, RootHaltError as X, RootAttestError as Y, brokerDisabled as Z, hardwareRootTotpDevice as _, closeHardwareRootSession as a, parseRecoveryCode as b, hardwareRootHealth as c, hardwareRootPresent as d, verifyRootAttestation as et, hardwareRootRequired as f, hardwareRootStatusStandalone as g, hardwareRootSigningDevice as h, bootHardwareRoot as i, operatorAuthMessage as it, identityFingerprint as j, TakenSession as k, hardwareRootInfo as l, hardwareRootSigning as m, assertHardwareClean as n, FIDO_RP_ID as nt, closeHardwareRootSessionAsync as o, hardwareRootSessionAnchor as p, setForensicContext as q, attestHardwareRoot as r, fidoChallenge as rt, hardwareRootCommandSet as s, SOFTWARE_ONLY_NOTICE as t, verifyRootMembers as tt, hardwareRootKeyDerivation as u, recoverHardwareRootStandalone as v, RelayedAnchorReadError as w, parseTotp as x, requireHardwareRootSessionAnchor as y, sealFrame as z };
