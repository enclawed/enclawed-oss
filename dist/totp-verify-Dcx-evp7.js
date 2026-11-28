import { y as rawEd25519ToPem } from "./enclaweder-hid-B_ZViqzj.js";
import { a as noteActivation } from "./activation-CjSFhqw4.js";
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
//#region src/enclawed/hardware-root/totp-verify.ts
const TOTP_OP = {
	LATCH_GET: 28,
	TOTP_VERIFY: 45,
	SIGN_ATTESTED: 46
};
const TAG_TOTP_VERDICT = Buffer.from("enclaweder.totp-verdict.v1", "latin1");
const TAG_ATTESTED_SIGN = Buffer.from("enclaweder.attested-sign.v1", "latin1");
const TAG_LATCH_GET = Buffer.from("ECW-LATCH-GET-01", "latin1");
const ST = {
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
const FA_TOTP = 2;
/**
* Purpose bytes the device binds into what it signs. 0x01..0x7F are verdict
* purposes (TOTP_VERIFY), 0x80..0xFF attested-sign purposes (SIGN_ATTESTED); the device refuses
* a purpose outside its command's range, so a verdict can never stand in for an attested signature.
*/
const TOTP_PURPOSE = Object.freeze({
	"session-start": 1,
	"policy-change": 2,
	recovery: 3,
	"disable-protection": 4,
	"history-restore": 5,
	admin: 6,
	"auth-change": 7,
	"auth-test": 8,
	unlock: 9
});
/** The byte for a purpose name, own properties only ("constructor" is not a purpose). */
function purposeByte(table, name) {
	return Object.hasOwn(table, name) ? table[name] : void 0;
}
const ATTESTED_PURPOSE = Object.freeze({ "admin-policy": 129 });
function parseVerdictBody(body) {
	if (body.length !== 32) throw new Error("verdict body must be 32 bytes");
	return {
		ver: body[0],
		purpose: body[1],
		pass: body[2] === 1,
		rfails: body[3],
		step: body.readUInt32LE(4),
		counter: body.readBigUInt64LE(8),
		waitMs: body.readUInt32LE(16),
		uid: Buffer.from(body.subarray(20, 32))
	};
}
function edOk(pubRaw, msg, sig) {
	try {
		return sig.length === 64 && verify(null, msg, createPublicKey(rawEd25519ToPem(pubRaw)), sig);
	} catch {
		return false;
	}
}
/** The exact message TOTP_VERIFY (and every failed SIGN_ATTESTED) signs. */
function verdictMessage(nonce, body) {
	return Buffer.concat([
		TAG_TOTP_VERDICT,
		nonce,
		body
	]);
}
/** The exact message a passing SIGN_ATTESTED signs. */
function attestedMessage(nonce, body, digest, summary) {
	return Buffer.concat([
		TAG_ATTESTED_SIGN,
		nonce,
		body,
		digest,
		summary
	]);
}
function verifyVerdictSignature(pubRaw, nonce, body, sig) {
	return nonce.length === 32 && body.length === 32 && edOk(pubRaw, verdictMessage(nonce, body), sig);
}
function verifyAttestedSignature(pubRaw, nonce, body, digest, summary, sig) {
	return nonce.length === 32 && body.length === 32 && digest.length === 32 && summary.length === 32 && edOk(pubRaw, attestedMessage(nonce, body, digest, summary), sig);
}
/** SHA3-256 of the human-readable summary the person was shown. */
function summaryHash(text) {
	return createHash("sha3-256").update(Buffer.from(text, "utf8")).digest();
}
function statusFailure(status) {
	switch (status) {
		case ST.UNSUPPORTED: return "unsupported";
		case ST.NOT_ENROLLED: return "not-enrolled";
		case ST.LOCKED: return "locked";
		case ST.BUSY: return "backoff";
		case ST.BAD_ARG: return "unknown-purpose";
		default: return "device-error";
	}
}
function request(code, nowS, purpose, nonce, extra = []) {
	const t = Buffer.alloc(8);
	t.writeBigUInt64LE(BigInt(nowS));
	const c = Buffer.alloc(4);
	c.writeUInt32LE(Number(code));
	return Buffer.concat([
		nonce,
		c,
		t,
		Buffer.from([purpose]),
		...extra
	]);
}
/**
* Checks one evaluated answer: signature over OUR nonce under the certified key, the expected
* purpose and uid, and (on a pass) a step near this host's clock. Exported for the tests.
*/
function checkVerdictAnswer(p, opts) {
	if (p.length === 0) return {
		ok: false,
		code: "no-response"
	};
	if (p[0] !== ST.OK && p[0] !== ST.AUTH && p[0] !== ST.TIME) return {
		ok: false,
		code: statusFailure(p[0]),
		...p.length === 5 ? { waitMs: p.readUInt32LE(1) } : {}
	};
	if (p.length !== 97) return {
		ok: false,
		code: "bad-verdict"
	};
	const rawBody = Buffer.from(p.subarray(1, 33));
	const sig = Buffer.from(p.subarray(33, 97));
	if (!(p[0] === ST.OK && opts.attested ? verifyAttestedSignature(opts.pubkeyRaw, opts.nonce, rawBody, opts.attested.digest, opts.attested.summary, sig) : verifyVerdictSignature(opts.pubkeyRaw, opts.nonce, rawBody, sig))) return {
		ok: false,
		code: "bad-signature"
	};
	const body = parseVerdictBody(rawBody);
	if (body.ver !== 1 || body.purpose !== opts.purpose || !body.uid.equals(opts.uid)) return {
		ok: false,
		code: "bad-verdict"
	};
	if (p[0] !== ST.OK || !body.pass) return {
		ok: false,
		code: p[0] === ST.TIME ? "clock-disagrees" : "rejected",
		waitMs: body.waitMs,
		signed: {
			rawBody,
			sig
		}
	};
	if (Math.abs(body.step * 30 - opts.nowS) > 300) return {
		ok: false,
		code: "stale-step"
	};
	return {
		ok: true,
		body,
		rawBody,
		sig
	};
}
/** True when the device reports (signed, over a fresh nonce) a valid TOTP factor and a clear latch. */
async function deviceTotpEnrolled(access) {
	const nonce = randomBytes(32);
	let signedOver = nonce;
	let p;
	if (access.latch) {
		const r = await access.latch(nonce);
		signedOver = r.signedOver;
		p = r.payload;
	} else p = (await access.run((dev) => dev.request(TOTP_OP.LATCH_GET, 1, nonce, 2e3)))?.payload;
	if (!p || p.length !== 129 || p[0] !== ST.OK || signedOver.length !== 32) return false;
	const body = p.subarray(1, 65);
	if (!edOk(access.pubkeyRaw, Buffer.concat([
		TAG_LATCH_GET,
		signedOver,
		body
	]), p.subarray(65, 129))) return false;
	if (!body.subarray(52, 64).equals(access.uid)) return false;
	return body[1] === 0 && (body[4] & 2) !== 0 && body[48] === FA_TOTP;
}
/** TOTP_VERIFY over `nonce`, checked; the shared core of deviceTotpVerify and deviceTotpVerdict. */
async function verdictExchange(access, p) {
	if (typeof p.code !== "string" || !/^\d{6}$/.test(p.code)) return {
		ok: false,
		code: "malformed-code"
	};
	const purpose = purposeByte(TOTP_PURPOSE, p.purpose);
	if (purpose === void 0) return {
		ok: false,
		code: "unknown-purpose"
	};
	const nowS = p.nowS ?? Math.floor(Date.now() / 1e3);
	const r = checkVerdictAnswer((await access.run((dev) => dev.request(TOTP_OP.TOTP_VERIFY, 1, request(p.code, nowS, purpose, p.nonce), 5e3)))?.payload ?? Buffer.alloc(0), {
		nonce: p.nonce,
		pubkeyRaw: access.pubkeyRaw,
		uid: access.uid,
		purpose,
		nowS
	});
	if (r.ok && purpose === 1) noteActivation(access.pubkeyRaw.toString("hex"), p.nonce, {
		kind: "totp",
		step: r.body.step,
		counter: r.body.counter
	});
	return {
		...r,
		purposeByte: purpose
	};
}
/**
* TOTP_VERIFY over a nonce the CALLER chose (32 bytes), so the signed verdict can bind the
* caller's own data (for example the hash of a grant it is about to store). Returns the checked,
* device-signed record. A "no" from the device, or an answer that does not verify, is a result,
* never an exception; only a failure to reach the device throws.
*/
async function deviceTotpVerdict(access, p) {
	if (!(p.nonce instanceof Uint8Array) || p.nonce.length !== 32) return {
		ok: false,
		code: "malformed-nonce"
	};
	const nonce = Buffer.from(p.nonce);
	const r = await verdictExchange(access, {
		...p,
		nonce
	});
	const record = (rawBody, sig, purpose) => ({
		v: 1,
		purpose,
		uid: access.uid.toString("hex"),
		pubkey: access.pubkeyRaw.toString("hex"),
		nonce: nonce.toString("hex"),
		body: rawBody.toString("hex"),
		sig: sig.toString("hex")
	});
	if (r.ok) return {
		ok: true,
		record: record(r.rawBody, r.sig, r.purposeByte),
		step: r.body.step,
		stepTimeS: r.body.step * 30,
		counter: r.body.counter
	};
	return {
		ok: false,
		code: r.code,
		...r.waitMs === void 0 ? {} : { waitMs: r.waitMs },
		...r.signed && r.purposeByte !== void 0 ? { record: record(r.signed.rawBody, r.signed.sig, r.purposeByte) } : {}
	};
}
const hexField = (v, n) => typeof v === "string" && v.length === n * 2 && /^[0-9a-f]+$/.test(v) ? Buffer.from(v, "hex") : null;
/**
* Offline check of a stored verdict record: signed by the expected device key, over the expected
* nonce, a PASS for the expected purpose. The caller decides which device key counts (and must
* have established that it is certified). Freshness is the caller's: `stepTimeS` is the time of
* the code the device accepted (step * 30), by the authenticator's clock.
*/
function verifyVerdictRecord(rec, expect) {
	const r = rec;
	if (!r || typeof r !== "object" || r.v !== 1) return {
		ok: false,
		reason: "not a verdict record"
	};
	const nonce = hexField(r.nonce, 32);
	const body = hexField(r.body, 32);
	const sig = hexField(r.sig, 64);
	const pub = hexField(r.pubkey, 32);
	const uid = hexField(r.uid, 12);
	if (!nonce || !body || !sig || !pub || !uid) return {
		ok: false,
		reason: "malformed verdict record"
	};
	const purpose = purposeByte(TOTP_PURPOSE, expect.purpose);
	if (purpose === void 0) return {
		ok: false,
		reason: "unknown purpose"
	};
	if (!pub.equals(expect.pubkeyRaw) || !uid.equals(expect.uid)) return {
		ok: false,
		reason: "signed by a different device"
	};
	if (!(expect.nonce instanceof Uint8Array) || !nonce.equals(Buffer.from(expect.nonce))) return {
		ok: false,
		reason: "made for another request"
	};
	if (!verifyVerdictSignature(pub, nonce, body, sig)) return {
		ok: false,
		reason: "device signature does not verify"
	};
	const b = parseVerdictBody(body);
	if (b.ver !== 1 || !b.pass || b.purpose !== purpose || r.purpose !== purpose || !b.uid.equals(uid)) return {
		ok: false,
		reason: "verdict does not approve this purpose"
	};
	return {
		ok: true,
		stepTimeS: b.step * 30,
		counter: b.counter
	};
}
/**
* Offline check of a stored attested record. The caller decides WHICH device keys may approve
* (and must have established that they are certified); this checks the signature, the binding to
* the expected purpose, digest and summary, and returns the device-attested time (step * 30).
*/
function verifyAttestedRecord(rec, expect) {
	const r = rec;
	const hex = hexField;
	if (!r || r.v !== 1) return {
		ok: false,
		reason: "not an attested record"
	};
	const nonce = hex(r.nonce, 32);
	const body = hex(r.body, 32);
	const digest = hex(r.digest, 32);
	const summary = hex(r.summary, 32);
	const sig = hex(r.sig, 64);
	const pub = hex(r.pubkey, 32);
	const uid = hex(r.uid, 12);
	if (!nonce || !body || !digest || !summary || !sig || !pub || !uid) return {
		ok: false,
		reason: "malformed attested record"
	};
	const purpose = purposeByte(ATTESTED_PURPOSE, expect.purpose);
	if (purpose === void 0) return {
		ok: false,
		reason: "unknown purpose"
	};
	if (!pub.equals(expect.pubkeyRaw) || !uid.equals(expect.uid)) return {
		ok: false,
		reason: "signed by a different device"
	};
	if (!digest.equals(expect.digest)) return {
		ok: false,
		reason: "digest does not match the document"
	};
	if (!summary.equals(summaryHash(expect.summaryText))) return {
		ok: false,
		reason: "summary does not match the document"
	};
	if (!verifyAttestedSignature(pub, nonce, body, digest, summary, sig)) return {
		ok: false,
		reason: "device signature does not verify"
	};
	const b = parseVerdictBody(body);
	if (b.ver !== 1 || !b.pass || b.purpose !== purpose || r.purpose !== purpose || !b.uid.equals(uid)) return {
		ok: false,
		reason: "verdict does not approve this purpose"
	};
	return {
		ok: true,
		stepTimeS: b.step * 30,
		counter: b.counter
	};
}
//#endregion
export { verifyAttestedRecord as a, deviceTotpVerdict as i, checkVerdictAnswer as n, verifyVerdictRecord as o, deviceTotpEnrolled as r, TOTP_PURPOSE as t };
