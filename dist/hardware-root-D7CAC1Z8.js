import { n as fileHeadAnchor, t as AuditLogger } from "./audit-log-Be5bBX6_.js";
import { createRequire } from "node:module";
import fs, { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import path, { dirname, join } from "node:path";
import os, { platform } from "node:os";
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import "node:readline";
import net from "node:net";
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
function listHidrawPaths() {
	const found = [];
	try {
		for (const hd of fs.readdirSync("/sys/class/hidraw")) try {
			const u = fs.readFileSync(`/sys/class/hidraw/${hd}/device/uevent`, "utf8").toUpperCase();
			if (u.includes(4617 .toString(16).padStart(8, "0").toUpperCase()) && u.includes(57600 .toString(16).padStart(8, "0").toUpperCase())) found.push(`/dev/${hd}`);
		} catch {}
	} catch {}
	return found.toSorted((a, b) => {
		return Number(a.replace(/\D+/g, "")) - Number(b.replace(/\D+/g, ""));
	});
}
function openHid(path) {
	return platform() === "linux" ? openHidraw(path) : openNodeHid(path);
}
function openHidraw(path) {
	const fd = fs.openSync(path, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
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
const CHALLENGE_TAG = Buffer.from("ECW-CHALLENGE-01");
Buffer.from("ECW-ANCHOR-01\0\0\0", "latin1");
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
	ANCHOR_SET: 23,
	ANCHOR_GET: 24
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** status(1) counter(8 LE) head(32) uid(12) sig(64) -- see protocol/PROTOCOL.md. */
function parseAnchor(p) {
	if (p.length < 117) throw new Error(`anchor response too short: ${p.length} bytes, expected 117`);
	return {
		counter: p.readBigUInt64LE(1),
		head: Buffer.from(p.subarray(9, 41)),
		uid: Buffer.from(p.subarray(41, 53)),
		sig: Buffer.from(p.subarray(53, 117))
	};
}
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
const ACC_STATE = {
	BOOT: 0,
	SELFTEST: 1,
	PROVISION: 2,
	READY: 3,
	ATTESTED: 4,
	ZEROIZED: 5,
	FAULT: 6
};
var Enclaweder = class {
	/**
	* `path` is whatever listEnclawederPaths() returned for this platform:
	* a /dev/hidraw* node on Linux, an opaque node-hid path elsewhere. A
	* transport may be injected directly for tests.
	*/
	constructor(path = "/dev/hidraw0", transport) {
		this.mid = 0;
		this.lane = Promise.resolve();
		this.hid = transport ?? openHid(path);
		this.buf = Buffer.alloc(0);
	}
	close() {
		this.hid.close();
	}
	writeFrame(frame) {
		for (let off = 0; off < frame.length; off += 64) {
			const chunk = frame.subarray(off, off + 64);
			const rep = Buffer.alloc(65);
			chunk.copy(rep, 1);
			this.hid.writeReport(rep);
		}
	}
	tryParse() {
		let b = this.buf;
		let i = 0;
		while (i < b.length && b[i] !== 226) i++;
		if (i) {
			b = b.subarray(i);
			this.buf = b;
		}
		if (b.length < 9) return null;
		const len = b[5] | b[6] << 8;
		if (b.length < 9 + len) return null;
		const type = b[2];
		const id = b[3] | b[4] << 8;
		const payload = Buffer.from(b.subarray(7, 7 + len));
		const crcRx = b[7 + len] | b[8 + len] << 8;
		const ok = crc16(b.subarray(1, 7 + len)) === crcRx;
		this.buf = Buffer.from(b.subarray(9 + len));
		return ok ? {
			type,
			id,
			payload
		} : null;
	}
	/** Monotonic message id. The wire id is a u16, so wrap at 0xffff and skip 0. */
	nextId() {
		this.mid = this.mid % 65535 + 1;
		return this.mid;
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
	async request(type, _idIgnored, payload = Buffer.alloc(0), timeoutMs = 3e3) {
		const run = () => this.requestNow(type, payload, timeoutMs);
		const next = this.lane.then(run, run);
		this.lane = next.catch(() => void 0);
		return next;
	}
	async requestNow(type, payload, timeoutMs) {
		const id = this.nextId();
		this.buf = Buffer.alloc(0);
		this.writeFrame(encode(type, id, payload));
		const want = type | 128;
		const end = Date.now() + timeoutMs;
		while (Date.now() < end) {
			const f = this.tryParse();
			if (f) if (f.type === want && f.id === id) return f;
			else continue;
			const tmp = Buffer.alloc(64);
			const n = this.hid.readReport(tmp);
			if (n > 0) this.buf = Buffer.concat([this.buf, tmp.subarray(0, n)]);
			else await sleep(2);
		}
		return null;
	}
	async getIdentity() {
		const f = await this.request(T.GET_IDENTITY, 1);
		if (!f) throw new Error("GET_IDENTITY: no response");
		const p = f.payload;
		const uid = Buffer.from(p.subarray(1, 13));
		return {
			uid,
			serial: "ENCLW-" + uid.toString("hex").toUpperCase(),
			pubkeyRaw: Buffer.from(p.subarray(13, 45)),
			flags: p[45]
		};
	}
	async getStatus() {
		const f = await this.request(T.GET_STATUS, 1);
		if (!f) throw new Error("GET_STATUS: no response");
		const p = f.payload;
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
		const f = await this.request(T.CHALLENGE, 1, Buffer.from(nonce32));
		if (!f || f.payload[0] !== 0) throw new Error("CHALLENGE: rejected");
		const p = f.payload;
		return {
			uid: Buffer.from(p.subarray(1, 13)),
			sig: Buffer.from(p.subarray(13, 77))
		};
	}
	/**
	* Record a new audit-log head and advance the device's counter.
	*
	* The counter is NOT a parameter -- it belongs to the device. A host that could
	* choose it could replay an old one and undo the only protection this provides.
	*/
	async anchorSet(head32) {
		if (head32.length !== 32) throw new Error(`ANCHOR_SET: head must be 32 bytes, got ${head32.length}`);
		const f = await this.request(T.ANCHOR_SET, 1, Buffer.from(head32));
		if (!f || f.payload[0] !== 0) throw new Error(`ANCHOR_SET: rejected (status ${f ? f.payload[0] : "no response"})`);
		return parseAnchor(f.payload);
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
		if (!f) throw new Error("ANCHOR_GET: no response");
		if (f.payload[0] === 3) return null;
		if (f.payload[0] !== 0) throw new Error(`ANCHOR_GET: rejected (status ${f.payload[0]})`);
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
	checkpoint(covers, uid, sig) {
		return this.append(QUEUE_CHECKPOINT, {
			covers,
			uid: uid.toString("hex"),
			sig: sig.toString("hex")
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
/** The socket the machine's owner listens on, for this user. */
function brokerSocketPath() {
	const explicit = process.env.ENCLAWEDER_BROKER;
	if (explicit) return explicit;
	const uid = process.getuid?.() ?? "u";
	const base = process.env.XDG_RUNTIME_DIR ?? os.tmpdir();
	return path.join(base, `enclawed-${uid}`, "enclaweder.sock");
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
		this.checkpointing = true;
		try {
			const r = await this.enqueue(CHECKPOINT_CLIENT, checkpointDigest(head), void 0, true);
			await journal.checkpoint(head, r.uid, r.sig);
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
/** The scheduler's own client id for journal checkpoints. */
const CHECKPOINT_CLIENT = -1;
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
			checkpointMs: 1e3
		} : {}
	});
}
function serveRoot(server, ready) {
	const clients = /* @__PURE__ */ new Set();
	let failure = null;
	let scheduler = null;
	ready.then((r) => {
		scheduler = r.scheduler;
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
			else if (req.op === "health") reply({
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
			else reply({
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
* Connects to the owner. Throws RootHaltError when the owner reports that the
* devices would not bind (not genuine, latched DIRTY, a session that may not
* continue): the client must refuse exactly as the owner did.
*/
async function connectRoot(socketPath, healthMs = 500) {
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
	const ask = (req, background = false) => new Promise((resolve) => {
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
		waiting.set(id, (r) => {
			if (holds && --held === 0) sock.unref();
			resolve(r);
		});
		sock.write(JSON.stringify({
			...req,
			id
		}) + "\n");
	});
	const m = await ask({ op: "members" });
	if (!m.ok) {
		sock.destroy();
		if (m.halt) throw new RootHaltError(typeof m.error === "string" ? m.error : "the devices did not bind");
		return null;
	}
	const members = m.members;
	let health = { status: "CLEAN" };
	const poll = async (background) => {
		if (health.status === "DIRTY") return;
		const h = await ask({ op: "health" }, background);
		if (!h.ok) {
			health = {
				status: "UNAVAILABLE",
				reason: typeof h.error === "string" ? h.error : "no answer"
			};
			return;
		}
		health = h.health;
	};
	await poll(false);
	const timer = setInterval(() => void poll(true), healthMs);
	timer.unref();
	lost.then(() => {
		clearInterval(timer);
		if (health.status !== "DIRTY") health = {
			status: "UNAVAILABLE",
			reason: lostReason ?? "the hardware root's owner is gone"
		};
	});
	const device = {
		getIdentity: async () => ({
			uid: Buffer.from(members[0].uid, "hex"),
			pubkeyRaw: Buffer.from(members[0].pubkey, "hex")
		}),
		challenge: async (nonce32) => {
			if (health.status !== "CLEAN") throw new Error(`hardware root ${health.status}: ${health.reason}`);
			const r = await ask({
				op: "sign",
				digest: nonce32.toString("hex")
			});
			if (!r.ok) throw new Error(typeof r.error === "string" ? r.error : "signing failed");
			return {
				uid: Buffer.from(String(r.uid), "hex"),
				sig: Buffer.from(String(r.sig), "hex")
			};
		}
	};
	return {
		members,
		health: () => health,
		device: () => device,
		lost,
		close: () => {
			clearInterval(timer);
			sock.destroy();
		}
	};
}
//#endregion
//#region src/enclawed/hardware-root/guard.ts
var HaltError = class extends Error {
	constructor(reason) {
		super("HALT: " + reason);
		this.name = "HaltError";
		this.reason = reason;
	}
};
var HardwareRootGuard = class {
	constructor({ statePath = "./.hw-root.state", onHalt, rootPubkey } = {}) {
		this.timer = null;
		this.statePath = statePath;
		this.onHalt = onHalt ?? (() => {});
		this.rootPubkey = rootPubkey ?? null;
		this.state = this.loadState();
	}
	loadState() {
		try {
			return JSON.parse(fs.readFileSync(this.statePath, "utf8"));
		} catch {
			return { status: "UNBOUND" };
		}
	}
	saveState() {
		fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
	}
	get status() {
		return this.state.status;
	}
	get bound() {
		return this.state.bound ?? null;
	}
	/** Gate every accredited operation. Throws HaltError unless CLEAN. */
	assertClean() {
		if (this.state.status !== "CLEAN") throw new HaltError(this.state.status === "DIRTY" ? `hardware root DIRTY: ${this.state.dirty?.reason} -- human recovery required` : `hardware root not bound (${this.state.status})`);
	}
	/** Bind at boot. Refuses to start clean if a prior DIRTY latch persists. */
	async boot(dev) {
		if (this.state.status === "DIRTY") throw new HaltError(`refusing to boot: hardware root was left DIRTY (${this.state.dirty?.reason}) -- human recovery required`);
		const id = await dev.getIdentity();
		const st = await dev.getStatus();
		const nonce = randomBytes(32);
		const chal = await dev.challenge(nonce);
		if (!verifyChallenge(id.pubkeyRaw, nonce, chal.uid, chal.sig)) throw new HaltError("boot challenge failed");
		const cert = await dev.getCert();
		const parsedCert = cert ? verifyCert(cert, id.uid, id.pubkeyRaw, this.rootPubkey) : null;
		if (!parsedCert) throw new HaltError("device not GENUINE -- no valid manufacturer certificate for this key (uncertified, counterfeit, or zeroized)");
		if (st.state === ACC_STATE.ZEROIZED) throw new HaltError("device is ZEROIZED at boot");
		this.state = {
			status: "CLEAN",
			bound: {
				serial: id.serial,
				pubkey: id.pubkeyRaw.toString("hex"),
				uid: id.uid.toString("hex"),
				sku: parsedCert.sku
			},
			boundAt: Date.now(),
			lastGoodAt: Date.now(),
			dirty: null,
			sessionOpen: true
		};
		this.saveState();
		return this.bound;
	}
	/**
	* End the hardware-accredited session deliberately. The binding and
	* its CLEAN status are kept -- this only records that the run closed
	* on its own terms, so the next boot without a device is a fresh
	* start rather than the continuation of an accredited session.
	*/
	closeSession() {
		if (this.state.sessionOpen !== false) {
			this.state.sessionOpen = false;
			this.saveState();
		}
	}
	/** One liveness check; latches DIRTY on any failure. */
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
		let id;
		let st;
		try {
			id = await dev.getIdentity();
		} catch {
			return fail("enclaweder disconnected (no response)");
		}
		if (id.pubkeyRaw.toString("hex") !== this.state.bound?.pubkey) return fail("device key changed -- zeroized/re-minted or device swapped");
		try {
			st = await dev.getStatus();
		} catch {
			return fail("enclaweder unresponsive");
		}
		if (st.state === ACC_STATE.ZEROIZED) return fail("enclaweder reported ZEROIZED");
		const nonce = randomBytes(32);
		let chal;
		try {
			chal = await dev.challenge(nonce);
		} catch {
			return fail("challenge unanswered");
		}
		if (!verifyChallenge(id.pubkeyRaw, nonce, chal.uid, chal.sig)) return fail("challenge signature invalid");
		this.state.lastGoodAt = Date.now();
		this.saveState();
		return { ok: true };
	}
	markDirty(reason) {
		if (this.state.status === "DIRTY") return;
		this.state.status = "DIRTY";
		this.state.dirty = {
			reason,
			at: Date.now(),
			lastGoodAt: this.state.lastGoodAt ?? 0
		};
		this.saveState();
		this.onHalt(reason);
	}
	startHeartbeat(dev, { intervalMs = 1e3 } = {}) {
		this.stopHeartbeat();
		this.timer = setInterval(() => {
			this.check(dev).then((r) => {
				if (!r.ok) this.stopHeartbeat();
			});
		}, intervalMs);
		if (this.timer.unref) this.timer.unref();
	}
	stopHeartbeat() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
	/** Human-only recovery: DIRTY + explicit human confirmation + the GENUINE bound device present. */
	async recover(dev, { humanConfirmed } = {}) {
		if (this.state.status !== "DIRTY") throw new Error("not DIRTY");
		if (humanConfirmed !== true) throw new HaltError("recovery requires explicit human confirmation");
		const id = await dev.getIdentity().catch(() => null);
		if (!id) throw new HaltError("recovery: no device present");
		if (id.pubkeyRaw.toString("hex") !== this.state.bound?.pubkey) throw new HaltError("recovery: present device is NOT the bound root of trust");
		const nonce = randomBytes(32);
		const chal = await dev.challenge(nonce);
		if (!verifyChallenge(id.pubkeyRaw, nonce, chal.uid, chal.sig)) throw new HaltError("recovery: device failed challenge");
		const cleared = this.state.dirty ?? null;
		this.state.status = "CLEAN";
		this.state.dirty = null;
		this.state.lastGoodAt = Date.now();
		this.state.recoveries = (this.state.recoveries ?? []).concat([{
			at: Date.now(),
			cleared
		}]);
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
function read(p) {
	try {
		return {
			...JSON.parse(readFileSync(p, "utf8")),
			path: p
		};
	} catch {
		return null;
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
//#region src/enclawed/hardware-root/forensics.ts
function safe(f) {
	try {
		return f();
	} catch {
		return null;
	}
}
let forensicContext = {};
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
	return process.env.ENCLAWEDER_FORENSIC_LOG ?? `${process.env.HOME ?? "/var/lib/enclawed"}/.enclawed-forensics.jsonl`;
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
/** Persist a snapshot: append-only local log (survives the device wipe) + optional off-box webhook. */
async function recordForensics(snap) {
	try {
		fs.appendFileSync(forensicLogPath(), JSON.stringify(snap) + "\n");
	} catch (e) {
		try {
			console.error("[forensics] local write failed:", e.message);
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
	const v = process.env.ENCLAWEDER_ROOT;
	return v === "required" || v === "1" || v === "true";
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
	const v = (process.env.ENCLAWEDER_ROOT ?? "").trim().toLowerCase();
	return v === "optional" || v === "0" || v === "false" || v === "off";
}
async function bootHardwareRoot(opts = {}) {
	if (resolved) return boundGuard ?? remote;
	if (bootPromise) return bootPromise;
	bootPromise = (async () => {
		const pinned = opts.hidraw ?? process.env.ENCLAWEDER_HIDRAW;
		const paths = pinned ? [pinned] : findAllEnclaweders();
		if (!(paths[0] ?? null)) {
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
			const g = await bindLocal(paths, opts);
			resolved = true;
			return g;
		}
		const r = await acquireRoot(paths, opts);
		resolved = true;
		return r;
	})();
	return bootPromise;
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
			stateDir: dirname(guardStatePath(opts)),
			onHalt: (r, m) => {
				try {
					console.error(`[hardware-root] FLEET HALT: ${r}${m ? ` (member ${m.serial})` : ""}`);
				} catch {}
			}
		});
		const primary = boundFleet.primary;
		boundGuard = primary?.guard ?? null;
		boundDev = primary?.dev ?? null;
		boundFleet.startHeartbeat();
		const c = boundFleet.composition;
		try {
			console.error(`[enclawed] hardware root FLEET engaged — ${boundFleet.size} devices (${c.base} base, ${c.pro} Pro) bound as one accreditor.`);
		} catch {}
		return boundGuard;
	}
	boundDev = new Enclaweder(path);
	boundGuard = new HardwareRootGuard({
		statePath: opts.statePath ?? process.env.ENCLAWEDER_STATE ?? `${process.env.HOME ?? "/var/lib/enclawed"}/.enclawed-hw-root.state`,
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
	const bound = await boundGuard.boot(boundDev);
	try {
		console.error(`[enclawed] hardware root of trust ENGAGED — enclaweder ${bound.serial} bound (key ${bound.pubkey.slice(0, 16)}…); on-chip challenge-response verified. Agent accreditation now REQUIRES this device present + CLEAN.`);
	} catch {}
	boundGuard.startHeartbeat(boundDev);
	return boundGuard;
}
/** This process's own devices, as the owner serves them. */
function localService() {
	return {
		members: () => hardwareRootMembersLocal().map((m) => ({
			uid: m.uid,
			pubkey: m.pubkey,
			serial: m.serial
		})),
		run: async (fn) => {
			if (boundFleet) return boundFleet.run((dev) => fn(dev));
			if (!boundDev) throw new HaltError("no Enclaweder is bound");
			return fn(boundDev);
		},
		health: localHealth
	};
}
function localHealth() {
	if (!boundGuard) return {
		status: "UNAVAILABLE",
		reason: "no Enclaweder is bound"
	};
	try {
		boundGuard.assertClean();
		boundFleet?.assertClean();
	} catch (err) {
		return {
			status: "DIRTY",
			reason: err.message
		};
	}
	return { status: "CLEAN" };
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
			r = await connectRoot(sock);
		} catch (err) {
			if (err instanceof RootHaltError) throw new HaltError(err.message);
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
* or UNAVAILABLE (its owner is gone or busy; not a tamper).
*/
function hardwareRootHealth() {
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
			const until = Date.now() + TAKEOVER_WAIT_MS;
			for (;;) {
				const dev = await currentSigningDevice();
				try {
					return await fn(dev);
				} catch (err) {
					const h = hardwareRootHealth();
					const ownerLost = /owner is gone/.test(err.message) || h.status === "UNAVAILABLE";
					if (h.status === "DIRTY" || !ownerLost || Date.now() > until) throw err;
					await new Promise((r) => setTimeout(r, 50));
				}
			}
		}
	};
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
	const until = Date.now() + TAKEOVER_WAIT_MS;
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
		if (Date.now() > until) throw new HaltError(`hardware root ${h.status}: ${"reason" in h ? h.reason : ""}`);
		await new Promise((r) => setTimeout(r, 50));
	}
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
* Recover a DIRTY latch from a process that has NOT booted the root.
*
* `recoverHardwareRoot` above only works inside a running agent, because it
* needs the module-level bindings that `bootHardwareRoot` sets -- and boot
* REFUSES while the latch is DIRTY, which is exactly the state a recovery tool
* runs in. So a standalone tool could not reach recovery at all: the latch said
* "human recovery required" with nothing a human could actually invoke.
*
* This attaches its own device handle and guard instead, then defers to
* `guard.recover()` unchanged -- the bound-key comparison and the fresh
* challenge-response still decide. Nothing here loosens that; it only supplies
* the caller the guard was always written to expect.
*/
async function recoverHardwareRootStandalone(opts) {
	if (!brokerDisabled() && await ownerAnswers(brokerSocketPath())) throw new HaltError("recovery: an Enclawed process on this machine owns the Enclaweder; stop it first");
	const paths = findAllEnclaweders();
	if (paths.length === 0) throw new HaltError("recovery: no enclaweder detected on the bus");
	const guard = new HardwareRootGuard({ statePath: guardStatePath(opts) });
	const devs = paths.map((p) => new Enclaweder(p));
	try {
		const own = (await Promise.all(devs.map((d) => d.getIdentity().then((id) => id.pubkeyRaw.toString("hex")).catch(() => null)))).indexOf(guard.bound?.pubkey ?? "");
		const recovered = await guard.recover(devs[Math.max(own, 0)], { humanConfirmed: opts.humanConfirmed });
		const serial = guard.bound?.serial;
		return serial ? {
			recovered,
			serial
		} : { recovered };
	} finally {
		guard.closeSession();
		for (const d of devs) d.close();
	}
}
//#endregion
export { hardwareRootHealth as a, recoverHardwareRootStandalone as c, verifyChallenge as d, closeHardwareRootSession as i, HardwareRootGuard as l, assertHardwareClean as n, hardwareRootInfo as o, bootHardwareRoot as r, hardwareRootSigning as s, SOFTWARE_ONLY_NOTICE as t, rawEd25519ToPem as u };
