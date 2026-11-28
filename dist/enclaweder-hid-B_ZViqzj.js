import { n as inNonInitialUserNamespace } from "./userns-Om3FzFOv.js";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os, { platform } from "node:os";
import { inspect } from "node:util";
import { createHash, createHmac, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomInt, verify } from "node:crypto";
//#region src/enclawed/hardware-root/test-guard.ts
/**
* The one deliberate opt-in that lets a process under a test runner open a REAL Enclaweder.
* Its value must be exactly this string: a stray `=1` in a shell profile is not consent.
*/
const LIVE_DEVICE_TEST_ENV = "ENCLAWEDER_LIVE_DEVICE_TEST";
const LIVE_DEVICE_TEST_ACK = "I_UNDERSTAND";
/** True when this process runs under a test runner (vitest, node --test, jest, NODE_ENV=test). */
function underTestRunner() {
	const e = process.env;
	if (e.VITEST || e.VITEST_WORKER_ID || e.VITEST_POOL_ID || e.JEST_WORKER_ID || e.NODE_TEST_CONTEXT) return true;
	if ((e.NODE_ENV ?? "").trim().toLowerCase() === "test") return true;
	return [...process.execArgv, ...(e.NODE_OPTIONS ?? "").split(/\s+/)].some((a) => a === "--test" || a.startsWith("--test=") || a.startsWith("--test-"));
}
/**
* Why a test-runner process must not touch the real device, or null. Test suites have touched
* the founder's real Enclaweder more than once (a hardware test in the default suite, a stale
* build binding the real device and latch), so under any test runner every real-device open is
* refused unless ENCLAWEDER_LIVE_DEVICE_TEST=I_UNDERSTAND is set. Simulated devices (an injected
* transport) never come through here.
*/
function testRunnerRefusal() {
	if (!underTestRunner() || process.env["ENCLAWEDER_LIVE_DEVICE_TEST"] === "I_UNDERSTAND") return null;
	return `a test runner may not open a real Enclaweder; set ${LIVE_DEVICE_TEST_ENV}=${LIVE_DEVICE_TEST_ACK} only for a deliberate live-device run (pnpm test:device)`;
}
/** The real user's home, from the password database: HOME is whatever the caller exported. */
function realHome() {
	try {
		return os.userInfo().homedir || null;
	} catch {
		return null;
	}
}
/**
* Why a test-runner process must not write `file`, or null: the real user's hardware-root
* latch, its journal and history (`~/.enclawed-hw-root*`) and the forensic log
* (`~/.enclawed-forensics*`), whatever HOME says. Throwaway paths are fine.
*/
function realStateWriteRefusal(file) {
	if (!underTestRunner() || process.env["ENCLAWEDER_LIVE_DEVICE_TEST"] === "I_UNDERSTAND") return null;
	const home = realHome();
	if (!home) return null;
	const abs = path.resolve(file);
	const base = path.basename(abs);
	if (path.dirname(abs) === path.resolve(home) && /^\.enclawed-(hw-root|forensics)/.test(base)) return `a test runner may not write the real ${abs}; give the test its own state path (or set ${LIVE_DEVICE_TEST_ENV}=${LIVE_DEVICE_TEST_ACK} for a deliberate live-device run)`;
	return null;
}
let nodeHidCache;
/**
* node-hid is a native optional dependency. A host without prebuilds
* for its platform must degrade to software-only, not crash the
* bootstrap, so every failure to load collapses to null.
*/
function loadNodeHid() {
	if (nodeHidCache !== void 0) return nodeHidCache;
	try {
		nodeHidCache = createRequire(import.meta.url)("node-hid");
	} catch {
		nodeHidCache = null;
	}
	return nodeHidCache;
}
/** Every attached enclaweder, as opaque handles for openHid(). */
function listEnclawederPaths() {
	if (platform() === "linux") return listHidrawPaths();
	const hid = loadNodeHid();
	if (!hid) return [];
	try {
		return hid.devices().filter((d) => d.vendorId === 4617 && d.productId === 57600).map((d) => d.path).filter((p) => typeof p === "string" && p.length > 0).toSorted();
	} catch {
		return [];
	}
}
/**
* The USB/Bluetooth identity a hidraw node reports, parsed from its uevent's exact
* `HID_ID=bbbb:vvvvvvvv:pppppppp` line (finding H10). HID_NAME and HID_UNIQ are strings the
* peripheral supplies about itself, so nothing is ever matched against them.
*/
function parseHidId(uevent) {
	for (const line of uevent.split("\n")) {
		const m = /^HID_ID=([0-9A-Fa-f]{4}):([0-9A-Fa-f]{8}):([0-9A-Fa-f]{8})$/.exec(line.trim());
		if (m) return {
			bus: parseInt(m[1], 16),
			vid: parseInt(m[2], 16),
			pid: parseInt(m[3], 16)
		};
	}
	return null;
}
/** True when the hidraw node `name` (e.g. "hidraw0") reports the Enclaweder's VID:PID. */
function hidrawIsEnclaweder(name) {
	if (!/^hidraw\d+$/.test(name)) return false;
	try {
		const id = parseHidId(fs.readFileSync(`/sys/class/hidraw/${name}/device/uevent`, "utf8"));
		return id !== null && id.vid === 4617 && id.pid === 57600;
	} catch {
		return false;
	}
}
/**
* Why a pinned device path (ENCLAWEDER_HIDRAW or an explicit option) must not be opened, or
* null (finding H10): on Linux it must be a /dev/hidrawN node whose sysfs identity is the
* Enclaweder's VID:PID, so protocol frames are never written to some other HID device.
*/
function pinnedPathRefusal(path) {
	if (platform() !== "linux") return null;
	const m = /^\/dev\/(hidraw\d+)$/.exec(path);
	if (!m) return `${path} is not a /dev/hidrawN node`;
	if (!hidrawIsEnclaweder(m[1])) return `${path} does not report the Enclaweder's USB identity (1209:E100)`;
	return null;
}
function listHidrawPaths() {
	const found = [];
	try {
		for (const hd of fs.readdirSync("/sys/class/hidraw")) if (hidrawIsEnclaweder(hd)) found.push(`/dev/${hd}`);
	} catch {}
	return found.toSorted((a, b) => {
		return Number(a.replace(/\D+/g, "")) - Number(b.replace(/\D+/g, ""));
	});
}
function openHid(path) {
	return platform() === "linux" ? openHidraw(path) : openNodeHid(path);
}
/**
* Why this process must not open the device node itself, or null (finding N16, H14). A process
* outside the initial user namespace reaches the hardware root only through the host's broker;
* ENCLAWEDER_DEVICE=deny (set by test and benchmark harnesses) refuses every direct open.
*/
function directOpenRefusal() {
	const runner = testRunnerRefusal();
	if (runner) return runner;
	if ((process.env.ENCLAWEDER_DEVICE ?? "").trim().toLowerCase() === "deny") return "direct device access is denied in this environment (ENCLAWEDER_DEVICE=deny)";
	if (platform() === "linux" && inNonInitialUserNamespace()) return "this process runs in a non-initial user namespace; it may reach the Enclaweder only through the host's broker, never by opening the device node";
	return null;
}
function openHidraw(path) {
	const refusal = directOpenRefusal() ?? pinnedPathRefusal(path);
	if (refusal) throw new Error(`enclaweder: refusing to open ${path}: ${refusal}`);
	const fd = fs.openSync(path, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
	const lock = spawnSync("flock", [
		"-n",
		"-x",
		"3"
	], { stdio: [
		"ignore",
		"ignore",
		"ignore",
		fd
	] });
	if (!lock.error && lock.status === 1) {
		fs.closeSync(fd);
		throw new Error(`enclaweder: ${path} is held by another process (exclusive lock); one owner per device`);
	}
	return {
		writeReport(report) {
			fs.writeSync(fd, report);
		},
		readReport(into) {
			try {
				return fs.readSync(fd, into, 0, into.length, null);
			} catch (e) {
				if (e.code === "EAGAIN") return 0;
				throw e;
			}
		},
		close() {
			try {
				fs.closeSync(fd);
			} catch {}
		}
	};
}
function openNodeHid(path) {
	const refusal = directOpenRefusal();
	if (refusal) throw new Error(`enclaweder: refusing to open ${path}: ${refusal}`);
	const hid = loadNodeHid();
	if (!hid) throw new Error(`enclaweder: no HID backend available on ${platform()}. Install the optional native dependency 'node-hid' to drive the hardware root on this platform.`);
	const dev = new hid.HID(path);
	return {
		writeReport(report) {
			dev.write(Array.from(report));
		},
		readReport(into) {
			const data = dev.readTimeout(0);
			if (!data || data.length === 0) return 0;
			const n = Math.min(data.length, into.length);
			Buffer.from(data).copy(into, 0, 0, n);
			return n;
		},
		close() {
			try {
				dev.close();
			} catch {}
		}
	};
}
//#endregion
//#region src/enclawed/hardware-root/enclaweder-hid.ts
/**
* A Pro unit enumerates as ECPRO-, so render the serial the device itself reports in its USB
* descriptor (Linux sysfs metadata only, no device I/O).
* Null when unreadable (other platforms, an injected transport) or when it does not carry this
* unit's UID; callers then fall back to the base rendering. Cosmetic and unauthenticated: never
* gate on it.
*/
function usbDescriptorSerial(devPath, uid) {
	if (!devPath?.startsWith("/dev/hidraw")) return null;
	try {
		const dev = fs.realpathSync(`/sys/class/hidraw/${devPath.slice(5)}/device`);
		const s = fs.readFileSync(`${dev}/../../serial`, "utf8").trim();
		const hex = uid.toString("hex").toUpperCase();
		return ["ENCLW-", "ECPRO-"].some((pre) => s === pre + hex) ? s : null;
	} catch {
		return null;
	}
}
const CHALLENGE_TAG = Buffer.from("ECW-CHALLENGE-01");
const ANCHOR_TAG = Buffer.from("ECW-ANCHOR-01\0\0\0", "latin1");
const ANCHOR_TAG_V2 = Buffer.from("ECW-ANCHOR-02\0\0\0", "latin1");
const ANCHOR_OPEN_TAG = Buffer.from("ECW-ANCHOR-OPN-1", "latin1");
const ANCHOR_KDF_TAG = Buffer.from("ECW-ANCHOR-KDF-1", "latin1");
const ANCHOR_SET_TAG = Buffer.from("ECW-ANCHOR-SET-1", "latin1");
const ANCHOR_CLOSE_TAG = Buffer.from("ECW-ANCHOR-CLS-1", "latin1");
const ANCHOR_KEEPALIVE_TAG = Buffer.from("ECW-ANCHOR-KAL-1", "latin1");
const ANCHOR_TAG_V3 = Buffer.from("enclaweder.anchor-record.v3", "latin1");
const ANCHOR_OPEN_BOUND_TAG = Buffer.from("enclaweder.anchor-open-bound.v1", "latin1");
const OPER_AUTH_TAG = Buffer.from("ECW-OPER-AUTH-01", "latin1");
const X25519_SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");
/** Auto-detect a connected enclaweder by its USB VID:PID (1209:E100). Returns the
*  /dev/hidraw* path or null. Used at enclawed bootstrap: if a device is found, it is mandatory. */
function findAllEnclaweders() {
	return listEnclawederPaths();
}
/** raw Ed25519 public key (32 bytes) -> SPKI PEM (so Node crypto + enclawed can use it). */
function rawEd25519ToPem(raw32) {
	return createPublicKey({
		key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(raw32)]),
		format: "der",
		type: "spki"
	}).export({
		format: "pem",
		type: "spki"
	});
}
/** Verify a proof-of-possession challenge response against the device's raw public key. */
function verifyChallenge(pubkeyRaw, nonce32, uid12, sig64) {
	const pub = createPublicKey(rawEd25519ToPem(pubkeyRaw));
	const msg = Buffer.concat([
		CHALLENGE_TAG,
		Buffer.from(nonce32),
		Buffer.from(uid12)
	]);
	try {
		return verify(null, msg, pub, sig64);
	} catch {
		return false;
	}
}
/** Verify a device-signed audit anchor (record v1) against the device's raw public key.
*  Kept for anchors stored before the firmware moved to record v2. */
function verifyAnchor(pubkeyRaw, counter, head32, uid12, sig64) {
	const pub = createPublicKey(rawEd25519ToPem(pubkeyRaw));
	const ctr = Buffer.alloc(8);
	ctr.writeBigUInt64LE(counter);
	const msg = Buffer.concat([
		ANCHOR_TAG,
		ctr,
		Buffer.from(head32),
		Buffer.from(uid12)
	]);
	try {
		return verify(null, msg, pub, sig64);
	} catch {
		return false;
	}
}
/** Verify a device-signed record v2 (authenticated anchoring) against the device's raw key. */
function verifyAnchorV2(pubkeyRaw, counter, head32, uid12, sess, opens, sig64) {
	const msg = Buffer.concat([
		ANCHOR_TAG_V2,
		le64(counter),
		Buffer.from(head32),
		Buffer.from(uid12),
		le64(sess),
		le64(opens)
	]);
	try {
		return verify(null, msg, createPublicKey(rawEd25519ToPem(pubkeyRaw)), sig64);
	} catch {
		return false;
	}
}
/** Verify a device-signed record v3 (a bound session, command set 0.5) against the device's raw key. */
function verifyAnchorV3(pubkeyRaw, counter, head32, uid12, sess, opens, bind32, sig64) {
	const msg = Buffer.concat([
		ANCHOR_TAG_V3,
		le64(counter),
		Buffer.from(head32),
		Buffer.from(uid12),
		le64(sess),
		le64(opens),
		Buffer.from(bind32)
	]);
	try {
		return verify(null, msg, createPublicKey(rawEd25519ToPem(pubkeyRaw)), sig64);
	} catch {
		return false;
	}
}
/**
* Verify an anchor record of either version. A record without `version` (written by code that
* predates record v2) is a v1 record. The two signature tags differ, so neither version's
* signature can be passed off as the other's.
*/
function verifyAnchorRecord(pubkeyRaw, a) {
	if (a.version === 3) {
		if (typeof a.sess !== "bigint" || typeof a.opens !== "bigint" || a.bind?.length !== 32) return false;
		return verifyAnchorV3(pubkeyRaw, a.counter, a.head, a.uid, a.sess, a.opens, a.bind, a.sig);
	}
	if (a.version === 2) {
		if (typeof a.sess !== "bigint" || typeof a.opens !== "bigint") return false;
		return verifyAnchorV2(pubkeyRaw, a.counter, a.head, a.uid, a.sess, a.opens, a.sig);
	}
	return verifyAnchor(pubkeyRaw, a.counter, a.head, a.uid, a.sig);
}
/** Pinned manufacturer root public key (Ed25519, raw 32B). PUBLIC -- safe to embed. This is the trust
*  anchor: a genuine enclaweder carries a birth certificate signed by the matching root PRIVATE key
*  (kept offline). Its root_id (first 4B of SHA-256) is 5cc8040c. Override via the guard only for testing or a different manufacturer root. */
const ENCLAWEDER_ROOT_PUBKEY = Buffer.from("8b7d01806542104d3ef9560c644297bd4f07279e646fe33da9a072f4fc5f6694", "hex");
/** Enclaweder Pro manufacturer root. Pro is a SEPARATE TRUST DOMAIN, not a flag on the base line:
*  a Pro unit is signed by its own root, so the authenticated model field -- never the USB serial
*  prefix -- is the thing to gate on. */
const ENCLAWEDER_ROOT_PUBKEY_PRO = Buffer.from("d41d18029a04b9e69afd2c689c86eaf54f9dccd2e1adade684f0dfbd421daf8d", "hex");
/** The pinned trust domains. `model` is the ONLY model each root is permitted to have issued, so a
*  cert claiming model=2 while signed by the base root is rejected even though its signature is
*  valid -- that combination is exactly the "base unit presented as Pro" forgery the separate-domain
*  design exists to stop. */
const ENCLAWEDER_DOMAINS = [{
	name: "base",
	model: 1,
	pub: ENCLAWEDER_ROOT_PUBKEY
}, {
	name: "pro",
	model: 2,
	pub: ENCLAWEDER_ROOT_PUBKEY_PRO
}];
/** 4-byte key id = first 4 bytes of SHA-256(root pubkey). */
function certRootId(rootPubRaw) {
	return createHash("sha256").update(rootPubRaw).digest().subarray(0, 4);
}
/**
* Verify a device birth certificate (119B) and bind it to a device:
* it must (a) chain to the pinned manufacturer root, and (b) certify THIS exact device's uid + key.
* Returns the parsed cert, or null if anything fails. Requiring this at bind time turns "a device is
* present" into "a MANUFACTURER-CERTIFIED device is present": a zeroized/re-minted or counterfeit unit
* passes challenge-response (it holds its own key) but has no root-signed cert for that key.
*/
function verifyCert(cert, deviceUid, devicePubRaw, rootPubRaw = null) {
	const CERT_SIGNED_LEN = 55;
	const CERT_LEN = 119;
	if (cert.length !== CERT_LEN || cert[0] !== 1) return null;
	const parsed = {
		ver: cert[0],
		uid: Buffer.from(cert.subarray(1, 13)),
		devicePub: Buffer.from(cert.subarray(13, 45)),
		model: cert[45] | cert[46] << 8,
		date: (cert[47] | cert[48] << 8 | cert[49] << 16 | cert[50] << 24) >>> 0,
		rootId: Buffer.from(cert.subarray(51, 55))
	};
	const domain = rootPubRaw ? ENCLAWEDER_DOMAINS.find((dm) => dm.pub.equals(rootPubRaw)) ?? {
		name: parsed.model === 2 ? "pro" : "base",
		model: null,
		pub: rootPubRaw
	} : ENCLAWEDER_DOMAINS.find((dm) => parsed.rootId.equals(certRootId(dm.pub)));
	if (!domain) return null;
	if (!parsed.rootId.equals(certRootId(domain.pub))) return null;
	if (domain.model !== null && parsed.model !== domain.model) return null;
	parsed.sku = domain.name;
	if (!parsed.uid.equals(deviceUid) || !parsed.devicePub.equals(devicePubRaw)) return null;
	try {
		const pub = createPublicKey(rawEd25519ToPem(domain.pub));
		if (!verify(null, cert.subarray(0, CERT_SIGNED_LEN), pub, cert.subarray(CERT_SIGNED_LEN, CERT_LEN))) return null;
	} catch {
		return null;
	}
	return parsed;
}
const T = {
	GET_STATUS: 2,
	GET_IDENTITY: 13,
	GET_CERT: 15,
	CHALLENGE: 17,
	AUTH_CHALLENGE: 18,
	ANCHOR_SET: 23,
	ANCHOR_GET: 24,
	ANCHOR_OPEN: 25,
	ANCHOR_CLOSE: 26,
	ANCHOR_KEEPALIVE: 27,
	ANCHOR_OPEN_BOUND: 55,
	ANCHOR_READ: 56
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function le64(v) {
	const b = Buffer.alloc(8);
	b.writeBigUInt64LE(v);
	return b;
}
/**
* Parse a signed anchor record, either version, told apart by length AND the version byte
* (Enclaweder wire protocol):
*   v2  status(1) ver=2(1) counter(8 LE) head(32) uid(12) sess(8 LE) opens(8 LE) sig(64)  134 B
*   v1  status(1) counter(8 LE) head(32) uid(12) sig(64)                                117 B
*/
function parseAnchor(p) {
	if (p.length === 166 && p[1] === 3) return {
		version: 3,
		counter: p.readBigUInt64LE(2),
		head: Buffer.from(p.subarray(10, 42)),
		uid: Buffer.from(p.subarray(42, 54)),
		sess: p.readBigUInt64LE(54),
		opens: p.readBigUInt64LE(62),
		bind: Buffer.from(p.subarray(70, 102)),
		sig: Buffer.from(p.subarray(102, 166))
	};
	if (p.length === 134 && p[1] === 2) return {
		version: 2,
		counter: p.readBigUInt64LE(2),
		head: Buffer.from(p.subarray(10, 42)),
		uid: Buffer.from(p.subarray(42, 54)),
		sess: p.readBigUInt64LE(54),
		opens: p.readBigUInt64LE(62),
		sig: Buffer.from(p.subarray(70, 134))
	};
	if (p.length === 117) return {
		version: 1,
		counter: p.readBigUInt64LE(1),
		head: Buffer.from(p.subarray(9, 41)),
		uid: Buffer.from(p.subarray(41, 53)),
		sess: 0n,
		opens: 0n,
		sig: Buffer.from(p.subarray(53, 117))
	};
	throw new Error(`audit anchor: the device returned an unrecognized ${p.length}-byte record`);
}
/** Device status codes the anchor commands return. */
const ANCHOR_STATUS = {
	OK: 0,
	BAD_ARG: 1,
	BAD_STATE: 2,
	NOT_ENROLLED: 3,
	AUTH: 5,
	BUSY: 7,
	UNSUPPORTED: 8
};
/** What a person reads; the command and status stay on the error's fields. */
const ANCHOR_OP_TEXT = {
	ANCHOR_OPEN: "opening the audit-anchor session",
	ANCHOR_SET: "anchoring the audit log",
	ANCHOR_CLOSE: "closing the audit-anchor session",
	ANCHOR_KEEPALIVE: "renewing the audit-anchor session",
	AUTH_CHALLENGE: "the operator challenge"
};
const ANCHOR_CODE_TEXT = {
	busy: "another process holds the device's audit-anchor session",
	auth: "the device no longer holds this session, or authentication failed",
	unsupported: "the device's firmware is too old: update the Enclaweder firmware",
	rejected: "the device rejected the request",
	"no-response": "the device did not answer",
	"bad-signature": "the device's answer did not verify under its certified key",
	"bad-record": "the device's answer did not verify or is not ours",
	closed: "the session is closed"
};
var AnchorAuthError = class extends Error {
	constructor(op, code, status = null, waitMs = null) {
		super(`${ANCHOR_OP_TEXT[op]}: ${ANCHOR_CODE_TEXT[code]}` + (waitMs === null ? "" : ` (wait ${Math.ceil(waitMs / 1e3)} s)`));
		this.name = "AnchorAuthError";
		this.op = op;
		this.code = code;
		this.status = status;
		this.waitMs = waitMs;
	}
};
/** `07 | wait_ms(4 LE)` -> wait_ms; null for a bare status (firmware 0.1) or another status. */
function busyWaitMs(p) {
	return p[0] === ANCHOR_STATUS.BUSY && p.length >= 5 ? p.readUInt32LE(1) : null;
}
/** An error for a non-OK device answer, carrying its status and (for ERR_BUSY) the wait. */
function statusError(op, p) {
	return new AnchorAuthError(op, statusCode(p[0]), p[0], busyWaitMs(p));
}
function statusCode(status) {
	switch (status) {
		case ANCHOR_STATUS.BUSY: return "busy";
		case ANCHOR_STATUS.AUTH: return "auth";
		case ANCHOR_STATUS.UNSUPPORTED: return "unsupported";
		default: return "rejected";
	}
}
/** How long to wait for the device to answer ANCHOR_OPEN (allow up to 10 s). */
const ANCHOR_OPEN_TIMEOUT_MS = 1e4;
/** Command set 0.2: a session ends by itself this long after its open or last accepted
*  SET / KEEPALIVE (set by the device; KEEPALIVE reports the lease actually granted). */
const ANCHOR_LEASE_MS = 12e4;
/** How often a holder renews: well inside the lease, so a missed beat or two does not lose it. */
const ANCHOR_KEEPALIVE_INTERVAL_MS = 3e4;
/**
* One authenticated anchor session (Enclaweder wire protocol, "record v2").
*
* The device admits one session at a time and a second ANCHOR_OPEN fails rather than
* superseding, so whoever opens first owns the anchor until a replug, an authenticated close,
* or (command set 0.2) its lease running out -- 120 s after its last accepted SET/KEEPALIVE,
* which startKeepalive() prevents while the process lives -- or an operator-quorum takeover
* (AnchorSession.takeover). The session key K is derived on both sides from an X25519 exchange whose device half
* is signed by the certified device key; it never crosses the wire, and it lives only in this
* object's private field -- never written, logged, serialized or shown by inspect().
*/
var AnchorSession = class AnchorSession {
	#dev;
	#devicePubRaw;
	#key;
	#ctr = 0n;
	#closed = false;
	#timer = null;
	constructor(dev, devicePubRaw, key, sid, uid, counterAtOpen, binding) {
		this.#dev = dev;
		this.#devicePubRaw = Buffer.from(devicePubRaw);
		this.#key = key;
		this.sid = sid;
		this.uid = uid;
		this.counterAtOpen = counterAtOpen;
		this.binding = binding;
	}
	/** The device this session was opened on. */
	get device() {
		return this.#dev;
	}
	get isOpen() {
		return !this.#closed;
	}
	/**
	* ANCHOR_OPEN, verified against the CERTIFIED device key (`devicePubRaw`, already checked
	* against the birth certificate). Throws AnchorAuthError; code "busy" means something else
	* on this host holds the anchor session and must be raised as an alarm, not retried. Its
	* `waitMs` (command set 0.2) is when that holder's lease ends if it stops renewing; null on
	* firmware 0.1, where only a replug frees the channel.
	*/
	static async open(dev, devicePubRaw, timeoutMs = ANCHOR_OPEN_TIMEOUT_MS) {
		return AnchorSession.#openWith(dev, devicePubRaw, null, timeoutMs);
	}
	/**
	* ANCHOR_OPEN_BOUND (command set 0.5): open the session on presenting the request nonce of this
	* launch's device-verified activation (an UNLOCK_USE or a session-start TOTP_VERIFY this process
	* made). The device signs the open under "enclaweder.anchor-open-bound.v1" with the activation's
	* binding, verified here against the certified key; every record of the session is then v3 and
	* carries it. `send` carries the request when it must not travel in the clear (a relayed
	* client seals it, relayed-anchor.ts); by default it goes to `dev` as is. ERR_AUTH (code
	* "auth") = the device holds no fresh, unspent activation with this nonce; ERR_BUSY = a bound
	* or taken-over session holds the channel (a PLAIN session is replaced by the device);
	* "unsupported" = firmware before command set 0.5.
	*/
	static async openBound(dev, devicePubRaw, activationNonce, opts = {}) {
		if (activationNonce.length !== 32) throw new Error("audit anchor: an activation nonce is 32 bytes");
		return AnchorSession.#openWith(dev, devicePubRaw, null, opts.timeoutMs ?? 1e4, {
			nonce: activationNonce,
			send: opts.send
		});
	}
	/**
	* Operator takeover (command set 0.2): ANCHOR_OPEN carrying an M-of-N operator authorisation,
	* which ends a live session (its holder's next request is ERR_AUTH) and opens this one in its
	* place. `uid` is the device uid from GET_IDENTITY. Each signer signs
	* "ECW-OPER-AUTH-01" | nonce | 0x19 | uid | host_pub | host_nonce over a fresh AUTH_CHALLENGE
	* nonce, so an authorisation opens only the session for the key pair it was issued to.
	* ERR_AUTH (code "auth") = the quorum did not verify, or no operator key is installed.
	*/
	static async takeover(dev, devicePubRaw, uid, signers, timeoutMs = ANCHOR_OPEN_TIMEOUT_MS) {
		if (signers.length < 1 || signers.length > 8) throw new Error("audit-anchor takeover: needs 1..8 operator signatures");
		if (uid.length !== 12) throw new Error(`audit-anchor takeover: uid must be 12 bytes, got ${uid.length}`);
		return AnchorSession.#openWith(dev, devicePubRaw, {
			uid,
			signers
		}, timeoutMs);
	}
	static async #openWith(dev, devicePubRaw, op, timeoutMs, bound = null) {
		timeoutMs = Math.max(timeoutMs, 5e3);
		const eph = generateKeyPairSync("x25519");
		const hostPub = Buffer.from(eph.publicKey.export({
			format: "der",
			type: "spki"
		}).subarray(12));
		const hostNonce = randomBytes(16);
		let req = Buffer.concat([hostPub, hostNonce]);
		if (op) {
			const ch = await dev.request(T.AUTH_CHALLENGE, 1, Buffer.alloc(0), timeoutMs);
			if (!ch) throw new AnchorAuthError("AUTH_CHALLENGE", "no-response");
			if (ch.payload[0] !== ANCHOR_STATUS.OK || ch.payload.length < 17) throw statusError("AUTH_CHALLENGE", ch.payload);
			const nonce = Buffer.from(ch.payload.subarray(1, 17));
			const msg = Buffer.concat([
				OPER_AUTH_TAG,
				nonce,
				Buffer.from([T.ANCHOR_OPEN]),
				Buffer.from(op.uid),
				req
			]);
			const sigs = await Promise.all(op.signers.map(async (sign) => Buffer.from(await sign(msg))));
			if (sigs.some((g) => g.length !== 64)) throw new Error("audit-anchor takeover: an operator signature must be 64 bytes");
			req = Buffer.concat([
				req,
				nonce,
				...sigs
			]);
		}
		let p;
		if (bound) {
			const breq = Buffer.concat([req, bound.nonce]);
			const ans = bound.send ? await bound.send(breq) : (await dev.request(T.ANCHOR_OPEN_BOUND, 1, breq, timeoutMs))?.payload ?? null;
			breq.fill(0);
			if (!ans || ans.length === 0) throw new AnchorAuthError("ANCHOR_OPEN", "no-response");
			p = ans;
		} else {
			const f = await dev.request(T.ANCHOR_OPEN, 1, req, timeoutMs);
			if (!f) throw new AnchorAuthError("ANCHOR_OPEN", "no-response");
			p = f.payload;
		}
		if (p[0] !== ANCHOR_STATUS.OK) throw statusError("ANCHOR_OPEN", p);
		if (p.length !== (bound ? 173 : 141)) throw new AnchorAuthError("ANCHOR_OPEN", "bad-record", p[0]);
		const sid = p.readBigUInt64LE(1);
		const counter = p.readBigUInt64LE(9);
		const devPub = Buffer.from(p.subarray(17, 49));
		const devNonce = Buffer.from(p.subarray(49, 65));
		const uid = Buffer.from(p.subarray(65, 77));
		const binding = bound ? Buffer.from(p.subarray(77, 109)) : null;
		const sig = bound ? p.subarray(109, 173) : p.subarray(77, 141);
		const transcript = binding ? Buffer.concat([
			ANCHOR_OPEN_BOUND_TAG,
			uid,
			le64(sid),
			le64(counter),
			hostPub,
			devPub,
			hostNonce,
			devNonce,
			binding
		]) : Buffer.concat([
			ANCHOR_OPEN_TAG,
			uid,
			le64(sid),
			le64(counter),
			hostPub,
			devPub,
			hostNonce,
			devNonce
		]);
		let genuine = false;
		try {
			genuine = verify(null, transcript, createPublicKey(rawEd25519ToPem(devicePubRaw)), sig);
		} catch {
			genuine = false;
		}
		if (!genuine) throw new AnchorAuthError("ANCHOR_OPEN", "bad-signature");
		let shared;
		try {
			shared = diffieHellman({
				privateKey: eph.privateKey,
				publicKey: createPublicKey({
					key: Buffer.concat([X25519_SPKI_PREFIX, devPub]),
					format: "der",
					type: "spki"
				})
			});
		} catch {
			throw new AnchorAuthError("ANCHOR_OPEN", "bad-record");
		}
		const info = Buffer.concat([
			ANCHOR_KDF_TAG,
			uid,
			le64(sid),
			hostPub,
			devPub
		]);
		const key = Buffer.from(hkdfSync("sha3-256", shared, Buffer.concat([hostNonce, devNonce]), info, 32));
		shared.fill(0);
		return new AnchorSession(dev, devicePubRaw, key, sid, uid, counter, binding);
	}
	#mac(parts) {
		return createHmac("sha3-256", this.#key).update(Buffer.concat(parts)).digest();
	}
	/**
	* ANCHOR_SET under this session. Returns the record, verified and checked to be ours: v2 for an
	* unbound session, v3 carrying exactly this session's binding for a bound one.
	*/
	async set(head32) {
		if (this.#closed) throw new AnchorAuthError("ANCHOR_SET", "closed");
		if (head32.length !== 32) throw new Error(`audit anchor: head must be 32 bytes, got ${head32.length}`);
		const ctr = ++this.#ctr;
		const head = Buffer.from(head32);
		const mac = this.#mac([
			ANCHOR_SET_TAG,
			this.uid,
			le64(this.sid),
			le64(ctr),
			head
		]);
		const f = await this.#dev.request(T.ANCHOR_SET, 1, Buffer.concat([
			head,
			le64(this.sid),
			le64(ctr),
			mac
		]));
		if (!f) throw new AnchorAuthError("ANCHOR_SET", "no-response");
		if (f.payload[0] !== ANCHOR_STATUS.OK) throw statusError("ANCHOR_SET", f.payload);
		let r;
		try {
			r = parseAnchor(f.payload);
		} catch {
			throw new AnchorAuthError("ANCHOR_SET", "bad-record", f.payload[0]);
		}
		if (r.version !== (this.binding ? 3 : 2) || this.binding !== null && !(r.bind?.equals(this.binding) ?? false) || r.sess !== this.sid || !r.head.equals(head) || !r.uid.equals(this.uid) || !verifyAnchorRecord(this.#devicePubRaw, r)) throw new AnchorAuthError("ANCHOR_SET", "bad-record", f.payload[0]);
		return r;
	}
	/**
	* ANCHOR_KEEPALIVE (command set 0.2): renew the lease without anchoring. Returns the lease
	* granted, in ms. Shares the request counter with SET and CLOSE; request() is FIFO per
	* device and the counter is taken synchronously, so they reach the device in counter order.
	*/
	async keepalive() {
		if (this.#closed) throw new AnchorAuthError("ANCHOR_KEEPALIVE", "closed");
		const ctr = ++this.#ctr;
		const mac = this.#mac([
			ANCHOR_KEEPALIVE_TAG,
			this.uid,
			le64(this.sid),
			le64(ctr)
		]);
		const f = await this.#dev.request(T.ANCHOR_KEEPALIVE, 1, Buffer.concat([
			le64(this.sid),
			le64(ctr),
			mac
		]));
		if (!f) throw new AnchorAuthError("ANCHOR_KEEPALIVE", "no-response");
		if (f.payload[0] !== ANCHOR_STATUS.OK || f.payload.length < 5) throw statusError("ANCHOR_KEEPALIVE", f.payload);
		return f.payload.readUInt32LE(1);
	}
	/**
	* Keep the session alive while the process is: a KEEPALIVE every `intervalMs`. The timer is
	* unref()'d, so it never holds the process open; a crashed process stops renewing and the
	* device frees the channel one lease later. On the first failure the timer stops and
	* `onLost` is called once (the session expired, was taken over, or the device is gone) --
	* except "unsupported": firmware 0.1 has no lease to renew, so it stops silently.
	* Idempotent while running; cleared when the session is closed.
	*/
	startKeepalive(intervalMs = ANCHOR_KEEPALIVE_INTERVAL_MS, onLost) {
		if (this.#timer || this.#closed) return;
		this.#timer = setInterval(() => {
			this.keepalive().catch((err) => {
				this.stopKeepalive();
				if (err instanceof AnchorAuthError && err.code === "unsupported") return;
				onLost?.(err instanceof Error ? err : new Error(String(err)));
			});
		}, intervalMs);
		this.#timer.unref?.();
	}
	stopKeepalive() {
		if (this.#timer) {
			clearInterval(this.#timer);
			this.#timer = null;
		}
	}
	get keepaliveRunning() {
		return this.#timer !== null;
	}
	#closePayload() {
		const ctr = ++this.#ctr;
		const mac = this.#mac([
			ANCHOR_CLOSE_TAG,
			this.uid,
			le64(this.sid),
			le64(ctr)
		]);
		return Buffer.concat([
			le64(this.sid),
			le64(ctr),
			mac
		]);
	}
	#forget() {
		this.stopKeepalive();
		this.#closed = true;
		this.#key.fill(0);
	}
	/** Authenticated ANCHOR_CLOSE. The key is wiped whatever the device answers. */
	async close() {
		if (this.#closed) return;
		const payload = this.#closePayload();
		this.#forget();
		const f = await this.#dev.request(T.ANCHOR_CLOSE, 1, payload);
		if (!f) throw new AnchorAuthError("ANCHOR_CLOSE", "no-response");
		if (f.payload[0] !== ANCHOR_STATUS.OK) throw statusError("ANCHOR_CLOSE", f.payload);
	}
	/**
	* Best-effort synchronous close for process exit, where nothing can be awaited: writes the
	* authenticated ANCHOR_CLOSE and does not wait for the answer. A device that misses it keeps
	* the session until it is replugged, which is the protocol's documented recovery.
	*/
	closeSync() {
		if (this.#closed) return;
		const payload = this.#closePayload();
		this.#forget();
		try {
			this.#dev.sendNoWait?.(T.ANCHOR_CLOSE, payload);
		} catch {}
	}
	toJSON() {
		return {
			sid: this.sid.toString(),
			uid: this.uid.toString("hex"),
			counterAtOpen: this.counterAtOpen.toString(),
			open: !this.#closed
		};
	}
	[inspect.custom]() {
		return `AnchorSession { sid: ${this.sid}, open: ${!this.#closed} }`;
	}
};
function crc16(buf) {
	let crc = 65535;
	for (const b of buf) {
		crc ^= b << 8;
		for (let i = 0; i < 8; i++) crc = crc & 32768 ? (crc << 1 ^ 4129) & 65535 : crc << 1 & 65535;
	}
	return crc;
}
function encode(type, id, payload = Buffer.alloc(0)) {
	const body = Buffer.from([
		1,
		type,
		id & 255,
		id >> 8,
		payload.length & 255,
		payload.length >> 8
	]);
	const b = Buffer.concat([body, payload]);
	const c = crc16(b);
	return Buffer.concat([
		Buffer.from([226]),
		b,
		Buffer.from([c & 255, c >> 8])
	]);
}
/** Start of frame, and the only frame version there is. */
const SOF = 226;
const PROTO_VER = 1;
/** The largest payload the device accepts or sends in one frame. */
const MAX_PAYLOAD = 2048;
const MAX_RX_BUFFER = 4 * (9 + MAX_PAYLOAD);
const ACC_STATE = {
	BOOT: 0,
	SELFTEST: 1,
	PROVISION: 2,
	READY: 3,
	ATTESTED: 4,
	ZEROIZED: 5,
	FAULT: 6
};
/**
* Errno codes a USB HID node reports when the device went away under the open descriptor: the
* cable or hub re-enumerated it, or usbipd re-attached it to WSL. The device may be back on a
* new node a moment later, so these are "gone for now", never by themselves a verdict.
*/
const DEVICE_GONE_ERRNO = new Set([
	"ENODEV",
	"EIO",
	"ENOENT"
]);
/**
* A request that got NO answer, as opposed to an answer that was wrong. The guard treats it as
* transient (retry, reopen) within a fixed window; only a definite answer, or the window running
* out, latches the hardware root DIRTY.
*/
var DeviceTransientError = class extends Error {
	constructor(code, message) {
		super(message);
		this.name = "DeviceTransientError";
		this.code = code;
	}
};
/** A transport for a node that went away: every use fails as ENODEV, until reconnect(). */
function goneTransport() {
	const gone = () => {
		const e = /* @__PURE__ */ new Error("the Enclaweder's device node is gone");
		e.code = "ENODEV";
		throw e;
	};
	return {
		writeReport: gone,
		readReport: gone,
		close() {}
	};
}
var Enclaweder = class {
	/**
	* `path` is whatever listEnclawederPaths() returned for this platform:
	* a /dev/hidraw* node on Linux, an opaque node-hid path elsewhere. A
	* transport may be injected directly for tests, with `reopen` standing in for the scan and
	* open reconnect() uses (an injected transport without it cannot be reopened).
	*/
	constructor(path, transport, reopen) {
		this.mid = 0;
		this.knownPub = null;
		this.knownUid = null;
		this.lane = Promise.resolve();
		this.reconnecting = null;
		this.hid = transport ?? openHid(path);
		this.devPath = transport ? null : path;
		this.lastPath = path;
		this.reopen = transport && !reopen ? null : {
			scan: reopen?.scan ?? listEnclawederPaths,
			open: reopen?.open ?? openHid
		};
		this.buf = Buffer.alloc(0);
	}
	close() {
		this.hid.close();
	}
	/**
	* After the node went away (ENODEV / EIO / ENOENT): find the device again and reopen it.
	*
	* Every Enclaweder node the platform lists is tried, the last one first, and a node is kept
	* only when GET_IDENTITY on it reports the same key AND uid as this driver's last identity
	* answer. That answer is unsigned, so it is not the proof: the guard re-establishes
	* with a fresh signed latch read, which only the pinned device key can produce. Nothing here
	* clears or latches anything; it only says what it found. One reconnect at a time.
	*/
	reconnect() {
		this.reconnecting ??= this.reconnectNow().finally(() => {
			this.reconnecting = null;
		});
		return this.reconnecting;
	}
	async reconnectNow() {
		const pinPub = this.knownPub;
		const pinUid = this.knownUid;
		if (!this.reopen || !pinPub || !pinUid) return { kind: "absent" };
		try {
			this.hid.close();
		} catch {}
		this.hid = goneTransport();
		let scanned = [];
		try {
			scanned = this.reopen.scan();
		} catch {}
		const paths = [this.lastPath, ...scanned.filter((p) => p !== this.lastPath)];
		let different = null;
		for (const p of paths) {
			let t;
			try {
				t = this.reopen.open(p);
			} catch {
				continue;
			}
			this.hid = t;
			this.buf = Buffer.alloc(0);
			let f = null;
			try {
				f = await this.request(T.GET_IDENTITY, 1);
			} catch {
				f = null;
			}
			const p0 = f?.payload;
			if (p0 && p0[0] === 0 && p0.length >= 46) {
				const uid = p0.subarray(1, 13);
				const pub = p0.subarray(13, 45);
				if (uid.equals(pinUid) && pub.equals(pinPub)) {
					this.lastPath = p;
					if (this.devPath !== null) this.devPath = p;
					return {
						kind: "same",
						path: p
					};
				}
				different ??= p;
			}
			try {
				t.close();
			} catch {}
			this.hid = goneTransport();
		}
		return different ? {
			kind: "different",
			path: different
		} : { kind: "absent" };
	}
	/** Discard every report already pending on the node, and the receive buffer. */
	drain() {
		const tmp = Buffer.alloc(64);
		for (let i = 0; i < 256 && this.hid.readReport(tmp) > 0; i++);
		this.buf = Buffer.alloc(0);
	}
	writeFrame(frame) {
		for (let off = 0; off < frame.length; off += 64) {
			const chunk = frame.subarray(off, off + 64);
			const rep = Buffer.alloc(65);
			chunk.copy(rep, 1);
			this.hid.writeReport(rep);
		}
	}
	/**
	* The next complete, well-formed frame in the receive buffer, or null (finding H8).
	*
	* A candidate starts at a SOF byte and must carry VER 1, a LEN no larger than the device's
	* largest payload and a matching CRC. Anything else is not a frame: the parser moves ONE byte
	* on and looks again, so a stray SOF in line noise, or in the tail of a late answer to an
	* earlier request, can no longer swallow the genuine answer behind it. A candidate whose
	* bytes have not all arrived yet is kept, but a complete valid frame AFTER it is still
	* returned (the candidate was noise, since frames never overlap).
	*/
	tryParse() {
		const b = this.buf;
		let keepFrom = -1;
		for (let i = b.indexOf(SOF); i >= 0; i = b.indexOf(SOF, i + 1)) {
			if (b.length - i < 7) {
				if (keepFrom < 0) keepFrom = i;
				break;
			}
			if (b[i + 1] !== PROTO_VER) continue;
			const len = b[i + 5] | b[i + 6] << 8;
			if (len > 2048) continue;
			if (b.length - i < 9 + len) {
				if (keepFrom < 0) keepFrom = i;
				continue;
			}
			const crcRx = b[i + 7 + len] | b[i + 8 + len] << 8;
			if (crc16(b.subarray(i + 1, i + 7 + len)) !== crcRx) continue;
			const f = {
				type: b[i + 2],
				id: b[i + 3] | b[i + 4] << 8,
				payload: Buffer.from(b.subarray(i + 7, i + 7 + len))
			};
			this.buf = Buffer.from(b.subarray(i + 9 + len));
			return f;
		}
		this.buf = keepFrom < 0 ? Buffer.alloc(0) : Buffer.from(b.subarray(keepFrom));
		if (this.buf.length > MAX_RX_BUFFER) this.buf = Buffer.from(this.buf.subarray(this.buf.length - MAX_RX_BUFFER));
		return null;
	}
	/**
	* Message id: RANDOM, never the previous one (finding D1). Every reader of a hidraw node sees
	* every IN report, so a predictable id let another process on the host inject requests whose
	* answers matched ours (a stray CHALLENGE answer was then reported as a bad signature and
	* latched a genuine device DIRTY). The wire id is a u16; 0 is reserved for events.
	*/
	nextId() {
		let id;
		do
			id = randomInt(1, 65536);
		while (id === this.mid);
		this.mid = id;
		return id;
	}
	/**
	* Send one request and return ONLY its own response.
	*
	* This used to match on TYPE ALONE while every caller passed a hard-coded id, so two successive
	* challenge() calls were indistinguishable on the wire: if one timed out, its late response could
	* be handed to the NEXT request. For challenge that is not a benign glitch -- the caller verifies
	* the signature against the nonce IT sent, so a stale response is reported as a BAD SIGNATURE,
	* i.e. the tooling accuses genuine hardware of being counterfeit. Matters more with a fleet,
	* where several devices are driven concurrently.
	*/
	async request(type, _idIgnored, payload = Buffer.alloc(0), timeoutMs = 3e3, accept) {
		const run = () => this.requestNow(type, payload, timeoutMs, accept);
		const next = this.lane.then(run, run);
		this.lane = next.catch(() => void 0);
		return next;
	}
	async requestNow(type, payload, timeoutMs, accept) {
		try {
			return await this.requestIo(type, payload, timeoutMs, accept);
		} catch (err) {
			const code = err?.code;
			if (typeof code === "string" && DEVICE_GONE_ERRNO.has(code)) {
				this.hid = goneTransport();
				throw new DeviceTransientError("gone", `the Enclaweder's device node went away (${code})`);
			}
			throw err;
		}
	}
	async requestIo(type, payload, timeoutMs, accept) {
		const id = this.nextId();
		this.drain();
		this.writeFrame(encode(type, id, payload));
		const want = type | 128;
		const ours = (f) => f.type === want && f.id === id && (!accept || accept(f));
		const end = performance.now() + timeoutMs;
		while (performance.now() < end) {
			const f = this.tryParse();
			if (f) if (ours(f)) return f;
			else continue;
			const tmp = Buffer.alloc(64);
			const n = this.hid.readReport(tmp);
			if (n > 0) this.buf = Buffer.concat([this.buf, tmp.subarray(0, n)]);
			else await sleep(2);
		}
		return this.lastLook(ours);
	}
	/** Every report already pending, parsed, without waiting: the answer `ours` accepts, or null. */
	lastLook(ours) {
		const tmp = Buffer.alloc(64);
		for (let i = 0; i < 256; i++) {
			for (let f = this.tryParse(); f; f = this.tryParse()) if (ours(f)) return f;
			const n = this.hid.readReport(tmp);
			if (n <= 0) break;
			this.buf = Buffer.concat([this.buf, tmp.subarray(0, n)]);
		}
		for (let f = this.tryParse(); f; f = this.tryParse()) if (ours(f)) return f;
		return null;
	}
	async getIdentity() {
		const f = await this.request(T.GET_IDENTITY, 1);
		if (!f) throw new DeviceTransientError("no-answer", "the device did not answer the identity request");
		const p = f.payload;
		if (p[0] !== 0 || p.length < 46) throw new Error("the device rejected the identity request");
		const uid = Buffer.from(p.subarray(1, 13));
		this.knownPub = Buffer.from(p.subarray(13, 45));
		this.knownUid = Buffer.from(uid);
		return {
			uid,
			serial: usbDescriptorSerial(this.devPath, uid) ?? "ENCLW-" + uid.toString("hex").toUpperCase(),
			pubkeyRaw: Buffer.from(p.subarray(13, 45)),
			flags: p[45]
		};
	}
	async getStatus() {
		const f = await this.request(T.GET_STATUS, 1);
		if (!f) throw new DeviceTransientError("no-answer", "the device did not answer the status request");
		const p = f.payload;
		if (p[0] !== 0 || p.length < 17 || p[1] > ACC_STATE.FAULT) throw new Error("the device rejected the status request");
		return {
			state: p[1],
			gate: p[2],
			k: p[3],
			n: p[4],
			nodesOnline: p[6],
			ledger: p[12] | p[13] << 8 | p[14] << 16 | p[15] << 24,
			locked: p[16]
		};
	}
	/** Proof-of-possession: the device signs tag||nonce||uid with its private key. */
	async challenge(nonce32) {
		const pub = this.knownPub;
		const f = await this.request(T.CHALLENGE, 1, Buffer.from(nonce32), 3e3, (fr) => fr.payload[0] !== 0 ? fr.payload.length === 1 : fr.payload.length === 77 && (!pub || verifyChallenge(pub, nonce32, fr.payload.subarray(1, 13), fr.payload.subarray(13, 77))));
		if (!f || f.payload[0] !== 0) throw new Error(f?.payload[0] === 9 ? "the device refused the key check: its halt state is set" : "the device rejected the key check");
		const p = f.payload;
		return {
			uid: Buffer.from(p.subarray(1, 13)),
			sig: Buffer.from(p.subarray(13, 77))
		};
	}
	/**
	* Open the one authenticated anchor session (ANCHOR_OPEN). `devicePubRaw` must be the key
	* certified by the birth certificate. Throws AnchorAuthError with code "busy" when another
	* session holds the channel: raise that as an alarm, never retry over it.
	*/
	async anchorOpen(devicePubRaw, timeoutMs = ANCHOR_OPEN_TIMEOUT_MS) {
		return AnchorSession.open(this, devicePubRaw, timeoutMs);
	}
	/**
	* ANCHOR_OPEN_BOUND (command set 0.5): the anchor session bound to this launch's activation; see
	* AnchorSession.openBound. On a direct device the request travels as an OUT report, which no
	* other process on the host reads.
	*/
	async anchorOpenBound(devicePubRaw, activationNonce, timeoutMs = ANCHOR_OPEN_TIMEOUT_MS) {
		return AnchorSession.openBound(this, devicePubRaw, activationNonce, { timeoutMs });
	}
	/**
	* ANCHOR_READ (command set 0.5): the device's current anchor, signed over `nonce32` (the
	* caller's own). Returns the raw answer for activation.ts verifyAnchorRead; a one-byte
	* ERR_UNSUPPORTED (8) means firmware before command set 0.5.
	*/
	async anchorRead(nonce32) {
		if (nonce32.length !== 32) throw new Error("audit anchor: a read nonce is 32 bytes");
		const f = await this.request(T.ANCHOR_READ, 1, nonce32);
		if (!f) throw new Error("the device did not answer the audit-anchor read");
		return f.payload;
	}
	/**
	* Record a new audit-log head and advance the device's counter, under `session`.
	*
	* The counter is NOT a parameter -- it belongs to the device. A host that could
	* choose it could replay an old one and undo the only protection this provides.
	* The session is required: since record v2 the device refuses a bare head (ERR_AUTH),
	* because anything able to open the HID node could otherwise anchor a fabricated log.
	*/
	async anchorSet(head32, session) {
		if (!(session instanceof AnchorSession) || session.device !== this) throw new Error("audit anchor: requires an anchor session opened on this device");
		return session.set(head32);
	}
	/** ANCHOR_KEEPALIVE under `session` (command set 0.2). Returns the lease granted, in ms. */
	async anchorKeepalive(session) {
		if (!(session instanceof AnchorSession) || session.device !== this) throw new Error("audit anchor: requires an anchor session opened on this device");
		return session.keepalive();
	}
	/**
	* Operator-quorum takeover of the anchor channel (command set 0.2); see AnchorSession.takeover.
	* The recovery for a BUSY alarm that cannot wait out the holder's lease.
	*/
	async anchorTakeover(devicePubRaw, uid, signers, timeoutMs = ANCHOR_OPEN_TIMEOUT_MS) {
		return AnchorSession.takeover(this, devicePubRaw, uid, signers, timeoutMs);
	}
	/** Authenticated ANCHOR_CLOSE of `session`. */
	async anchorClose(session) {
		if (!(session instanceof AnchorSession) || session.device !== this) throw new Error("audit anchor: requires an anchor session opened on this device");
		await session.close();
	}
	/** Write one request and do not wait for its answer (anchor close at process exit only). */
	sendNoWait(type, payload) {
		this.writeFrame(encode(type, this.nextId(), payload));
	}
	/**
	* Read the current anchor without advancing it.
	*
	* Verification must not mutate the state it is checking, which is why this is a
	* separate opcode. Returns null when the device has never anchored -- deliberately
	* distinct from a counter of zero.
	*/
	async anchorGet() {
		const f = await this.request(T.ANCHOR_GET, 1);
		if (!f) throw new Error("the device did not answer the audit-anchor read");
		if (f.payload[0] === 3) return null;
		if (f.payload[0] !== 0) throw new Error("the device rejected the audit-anchor read");
		return parseAnchor(f.payload);
	}
	/** Fetch the on-device birth certificate (opaque 119B blob). null if the device has none. */
	async getCert() {
		const f = await this.request(T.GET_CERT, 1);
		if (!f || f.payload.length < 3 || f.payload[0] !== 0) return null;
		const p = f.payload;
		const n = p[1] | p[2] << 8;
		if (n <= 0 || p.length < 3 + n) return null;
		return Buffer.from(p.subarray(3, 3 + n));
	}
};
//#endregion
export { realStateWriteRefusal as A, verifyAnchorV2 as C, pinnedPathRefusal as D, verifyChallenge as E, LIVE_DEVICE_TEST_ACK as O, verifyAnchorRecord as S, verifyCert as T, findAllEnclaweders as _, ANCHOR_OPEN_TIMEOUT_MS as a, usbDescriptorSerial as b, AnchorAuthError as c, ENCLAWEDER_DOMAINS as d, ENCLAWEDER_ROOT_PUBKEY as f, busyWaitMs as g, MAX_PAYLOAD as h, ANCHOR_OPEN_BOUND_TAG as i, underTestRunner as j, LIVE_DEVICE_TEST_ENV as k, AnchorSession as l, Enclaweder as m, ANCHOR_KEEPALIVE_INTERVAL_MS as n, ANCHOR_STATUS as o, ENCLAWEDER_ROOT_PUBKEY_PRO as p, ANCHOR_LEASE_MS as r, ANCHOR_TAG_V3 as s, ACC_STATE as t, DeviceTransientError as u, parseAnchor as v, verifyAnchorV3 as w, verifyAnchor as x, rawEd25519ToPem as y };
