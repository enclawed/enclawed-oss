import { n as resolveDefaultConfigPath } from "./workspace-dir-BFXVbXDc.js";
import { n as getRuntime, r as setRuntime } from "./runtime-Dt7e6nAN.js";
import { t as AuditLogger } from "./audit-log-C65NJQk2.js";
import { a as defaultOpenPolicy, d as loadSchemeByName, f as setActiveScheme, i as defaultEnclavedPolicy, u as clearanceNameToRank } from "./policy-wE3FfoUy.js";
import { t as getFlavor } from "./flavor-DhzvlYLU.js";
import { n as applyPersistedTrustOverlay, o as lockTrustRoot, r as findSigner } from "./trust-root-store-CxHS2Xlo.js";
import { t as loadPolicyFromJson } from "./policy-loader-D_0tQcCt.js";
import { createRequire } from "node:module";
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import os, { homedir } from "node:os";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, getFips, randomBytes, sign, verify } from "node:crypto";
import * as nodeNet from "node:net";
Object.freeze({
	N: 2 ** 15,
	r: 8,
	p: 1
});
function isFipsEnabled() {
	try {
		return getFips() === 1;
	} catch {
		return false;
	}
}
function assertFipsMode() {
	if (!isFipsEnabled()) throw new Error("FIPS mode is not enabled in this Node binary. Re-launch with OPENSSL_CONF pointing to a FIPS-enabled provider config and a FIPS 140-3 validated OpenSSL module. (CWE-327)");
}
//#endregion
//#region src/enclawed/egress-guard.ts
var EgressDeniedError = class extends Error {
	constructor(host, reason) {
		super(`egress denied: ${host ?? "<unknown host>"} (${reason})`);
		this.host = host;
		this.reason = reason;
		this.name = "EgressDeniedError";
	}
};
function hostOf(input) {
	if (typeof input === "string") try {
		return new URL(input).hostname;
	} catch {
		return null;
	}
	if (input && typeof input === "object") {
		const rec = input;
		if (typeof rec.url === "string") try {
			return new URL(rec.url).hostname;
		} catch {
			return null;
		}
		if (typeof rec.hostname === "string") return rec.hostname;
	}
	return null;
}
function createEgressGuard(opts) {
	const allow = new Set([...opts.allowedHosts].map(String));
	const guarded = (async (input, init) => {
		const host = hostOf(input);
		if (!host || !allow.has(host)) {
			const err = new EgressDeniedError(host, "host not on allowlist");
			if (opts.onDeny) try {
				opts.onDeny({
					host,
					input,
					init
				});
			} catch {}
			throw err;
		}
		return opts.fetchImpl(input, init);
	});
	guarded.__enclawedGuard = true;
	return guarded;
}
function installEgressGuard(opts) {
	const previous = globalThis.fetch;
	const guard = createEgressGuard({
		...opts,
		fetchImpl: previous
	});
	if (opts.freeze) {
		Object.defineProperty(globalThis, "fetch", {
			value: guard,
			writable: false,
			configurable: false,
			enumerable: true
		});
		return () => {};
	}
	globalThis.fetch = guard;
	return () => {
		globalThis.fetch = previous;
	};
}
function ipv4ToInt(ip) {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let n = 0;
	for (const p of parts) {
		const x = Number(p);
		if (!Number.isInteger(x) || x < 0 || x > 255) return null;
		n = n * 256 + x;
	}
	return n >>> 0;
}
function ipInCidr(ip, cidr) {
	if (typeof ip !== "string" || typeof cidr !== "string") return false;
	const slash = cidr.indexOf("/");
	if (slash < 0) return ip === cidr;
	const base = cidr.slice(0, slash);
	const bits = Number(cidr.slice(slash + 1));
	if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
	const ipN = ipv4ToInt(ip);
	const baseN = ipv4ToInt(base);
	if (ipN === null || baseN === null) return false;
	if (bits === 0) return true;
	const mask = bits === 32 ? 4294967295 : 4294967295 << 32 - bits >>> 0;
	return (ipN & mask) >>> 0 === (baseN & mask) >>> 0;
}
const LEARNED_IP_TTL_MS = 5 * 6e4;
const dnsRecorders = /* @__PURE__ */ new Set();
let dnsHooksInstalled = false;
function normalizeIp(host) {
	return host.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/%.*$/, "");
}
function harvestIps(values) {
	const out = [];
	const visit = (v) => {
		if (typeof v === "string") out.push(v);
		else if (Array.isArray(v)) for (const e of v) visit(e);
		else if (v && typeof v === "object" && typeof v.address === "string") out.push(v.address);
	};
	for (const v of values) visit(v);
	return out;
}
function installDnsLearningHooks() {
	if (dnsHooksInstalled) return;
	dnsHooksInstalled = true;
	let dns;
	try {
		dns = createRequire(import.meta.url)("node:dns");
	} catch {
		return;
	}
	const announce = (hostname, rest) => {
		if (typeof hostname !== "string" || dnsRecorders.size === 0) return;
		const ips = harvestIps(rest);
		if (ips.length === 0) return;
		for (const rec of dnsRecorders) rec(hostname, ips);
	};
	const wrapCb = (orig) => function wrappedResolve(...args) {
		const hostname = args[0];
		const cbIdx = args.length - 1;
		const cb = args[cbIdx];
		if (typeof cb === "function") args[cbIdx] = function observedCb(err, ...rest) {
			if (!err) announce(hostname, rest);
			return cb.call(this, err, ...rest);
		};
		return orig.apply(this, args);
	};
	dns.lookup = wrapCb(dns.lookup);
	dns.resolve4 = wrapCb(dns.resolve4);
	dns.resolve6 = wrapCb(dns.resolve6);
	if (dns.Resolver?.prototype) {
		dns.Resolver.prototype.resolve4 = wrapCb(dns.Resolver.prototype.resolve4);
		dns.Resolver.prototype.resolve6 = wrapCb(dns.Resolver.prototype.resolve6);
	}
}
function installRawSocketGuard(opts) {
	const allowedHosts = new Set([...opts.allowedHosts].map(String));
	const allowedCidrs = [...opts.allowedCidrs ?? []].map(String);
	const onDeny = opts.onDeny;
	const learnedIps = /* @__PURE__ */ new Map();
	const recorder = (hostname, ips) => {
		if (!allowedHosts.has(hostname.toLowerCase())) return;
		const expiry = Date.now() + LEARNED_IP_TTL_MS;
		for (const ip of ips) learnedIps.set(normalizeIp(ip), expiry);
	};
	dnsRecorders.add(recorder);
	installDnsLearningHooks();
	function isAllowed(host, _port) {
		if (typeof host !== "string" || host.length === 0) return false;
		const lc = host.toLowerCase();
		if (allowedHosts.has(lc)) return true;
		const nip = normalizeIp(host);
		const expiry = learnedIps.get(nip);
		if (expiry !== void 0) {
			if (expiry > Date.now()) return true;
			learnedIps.delete(nip);
		}
		if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
			for (const cidr of allowedCidrs) if (ipInCidr(host, cidr)) return true;
		}
		return false;
	}
	function denyAndAudit(host, port, kind) {
		const reason = `egress denied: ${kind} to ${host || "<unknown>"}:${port ?? "?"} not on allowlist`;
		if (onDeny) try {
			onDeny({
				host,
				port,
				kind,
				reason
			});
		} catch {}
		const err = new EgressDeniedError(host, reason);
		err.kind = kind;
		err.port = port;
		return err;
	}
	const Socket = nodeNet.Socket;
	const originalConnect = Socket.prototype.connect;
	const patchedConnect = function enclawedRawSocketGuardConnect(...args) {
		let probe = args;
		if (Array.isArray(args[0])) probe = args[0];
		let host;
		let port;
		if (typeof probe[0] === "object" && probe[0] !== null && !Array.isArray(probe[0])) {
			const o = probe[0];
			host = o.host;
			port = o.port;
		} else if (typeof probe[0] === "number" || typeof probe[0] === "string" && /^\d+$/.test(probe[0])) {
			port = Number(probe[0]);
			if (typeof probe[1] === "string") host = probe[1];
		}
		const targetHost = typeof host === "string" && host !== "" ? host : typeof host === "number" ? String(host) : "localhost";
		const targetPort = typeof port === "number" ? port : void 0;
		if (!isAllowed(targetHost, targetPort)) throw denyAndAudit(targetHost, targetPort, "net.Socket.connect");
		return originalConnect.apply(this, args);
	};
	if (opts.freeze) {
		const desc = Object.getOwnPropertyDescriptor(Socket.prototype, "connect");
		if (!(desc && desc.configurable === false && desc.writable === false && typeof desc.value === "function" && desc.value.name === "enclawedRawSocketGuardConnect")) Object.defineProperty(Socket.prototype, "connect", {
			value: patchedConnect,
			writable: false,
			configurable: false,
			enumerable: false
		});
	} else Socket.prototype.connect = patchedConnect;
	return {
		uninstall() {
			if (opts.freeze) return;
			Socket.prototype.connect = originalConnect;
			dnsRecorders.delete(recorder);
		},
		isAllowed
	};
}
//#endregion
//#region src/enclawed/module-manifest.ts
const LEGACY_CLEARANCE_ORDER = {
	public: 0,
	internal: 1,
	confidential: 2,
	restricted: 3,
	"restricted-plus": 4,
	unclassified: 0,
	cui: 1,
	secret: 3,
	"top-secret": 4,
	"q-cleared": 4
};
const CLEARANCE_ORDER = LEGACY_CLEARANCE_ORDER;
function clearanceToRank(name) {
	const fromScheme = clearanceNameToRank(name);
	if (fromScheme !== void 0) return fromScheme;
	return LEGACY_CLEARANCE_ORDER[name.toLowerCase()];
}
function parseManifest(raw) {
	if (raw === null || typeof raw !== "object") throw new TypeError("manifest must be a JSON object");
	const m = raw;
	if (m.v !== 1) throw new Error(`unsupported manifest version: ${String(m.v)}`);
	const id = String(m.id ?? "").trim();
	if (!id) throw new Error("manifest.id is required");
	const publisher = String(m.publisher ?? "").trim();
	if (!publisher) throw new Error("manifest.publisher is required");
	const version = String(m.version ?? "").trim();
	if (!version) throw new Error("manifest.version is required");
	const clearance = String(m.clearance ?? "").trim();
	if (clearanceToRank(clearance) === void 0) throw new Error(`manifest.clearance "${clearance}" is not a recognized name in the active classification scheme`);
	const capsIn = m.capabilities;
	if (!Array.isArray(capsIn) || !capsIn.every((c) => typeof c === "string")) throw new Error("manifest.capabilities must be string[]");
	const capabilities = Object.freeze(capsIn.slice());
	const signerKeyId = typeof m.signerKeyId === "string" && m.signerKeyId.trim().length > 0 ? m.signerKeyId.trim() : void 0;
	const signature = typeof m.signature === "string" && m.signature.trim().length > 0 ? m.signature.trim() : void 0;
	const verification = typeof m.verification === "string" && m.verification.trim().length > 0 ? m.verification.trim() : void 0;
	const netAllowedHostsIn = m.netAllowedHosts;
	const netAllowedHosts = Array.isArray(netAllowedHostsIn) && netAllowedHostsIn.every((h) => typeof h === "string") ? Object.freeze(netAllowedHostsIn.slice()) : Object.freeze([]);
	return Object.freeze({
		v: 1,
		id,
		publisher,
		version,
		clearance,
		capabilities,
		signerKeyId,
		signature,
		verification,
		netAllowedHosts
	});
}
function canonicalManifestBytes(manifest) {
	const body = {
		v: manifest.v,
		id: manifest.id,
		publisher: manifest.publisher,
		version: manifest.version,
		clearance: manifest.clearance,
		capabilities: [...manifest.capabilities].sort(),
		signerKeyId: manifest.signerKeyId ?? null,
		verification: manifest.verification,
		netAllowedHosts: [...manifest.netAllowedHosts ?? []].sort()
	};
	return Buffer.from(canonicalize(body), "utf8");
}
function canonicalize(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
	const obj = value;
	return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}
function meetsClearance(actual, required) {
	return CLEARANCE_ORDER[actual] >= CLEARANCE_ORDER[required];
}
//#endregion
//#region src/enclawed/module-signing.ts
function generateEd25519KeyPair() {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	return {
		publicKey: publicKey.export({
			format: "pem",
			type: "spki"
		}).toString(),
		privateKey: privateKey.export({
			format: "pem",
			type: "pkcs8"
		}).toString()
	};
}
function loadPublicKey(pem) {
	return createPublicKey({
		key: pem,
		format: "pem"
	});
}
function loadPrivateKey(pem) {
	return createPrivateKey({
		key: pem,
		format: "pem"
	});
}
function signManifest(canonicalBytes, privateKeyPem) {
	return sign(null, canonicalBytes, loadPrivateKey(privateKeyPem)).toString("base64");
}
function verifyManifestSignature(canonicalBytes, signatureBase64, publicKeyPem) {
	const key = loadPublicKey(publicKeyPem);
	let sigBuf;
	try {
		sigBuf = Buffer.from(signatureBase64, "base64");
	} catch {
		return false;
	}
	if (sigBuf.length !== 64) return false;
	try {
		return verify(null, canonicalBytes, key, sigBuf);
	} catch {
		return false;
	}
}
//#endregion
//#region src/enclawed/module-loader.ts
function checkModule(manifest, opts) {
	const flavor = opts?.flavor ?? getFlavor();
	const required = opts?.requiredClearance;
	const audit = (decision) => {
		const rt = getRuntime();
		if (rt) rt.audit.append({
			type: "module.decision",
			actor: manifest.id,
			level: manifest.clearance,
			payload: {
				decision,
				flavor
			}
		}).catch(() => {});
		return decision;
	};
	if (flavor === "open") {
		const warnings = [];
		let signerKeyId = null;
		if (manifest.signerKeyId && manifest.signature) {
			const signer = findSigner(manifest.signerKeyId);
			if (!signer) warnings.push(`signer "${manifest.signerKeyId}" not in trust root (open mode: warn-only)`);
			else if (!verifyManifestSignature(canonicalManifestBytes(manifest), manifest.signature, signer.publicKeyPem)) warnings.push("signature verification failed (open mode: warn-only)");
			else if (!signer.approvedClearance.includes(manifest.clearance)) warnings.push(`signer not approved for clearance "${manifest.clearance}" (open mode: warn-only)`);
			else signerKeyId = signer.keyId;
		} else warnings.push("module is unsigned (open mode: warn-only)");
		if (required && !meetsClearance(manifest.clearance, required)) return audit({
			allowed: false,
			flavor,
			reason: `module clearance "${manifest.clearance}" below required "${required}"`
		});
		return audit({
			allowed: true,
			flavor,
			clearance: manifest.clearance,
			signerKeyId,
			warnings: Object.freeze(warnings)
		});
	}
	if (!manifest.signerKeyId || !manifest.signature) return audit({
		allowed: false,
		flavor,
		reason: "enclaved flavor: module has no signature"
	});
	const signer = findSigner(manifest.signerKeyId);
	if (!signer) return audit({
		allowed: false,
		flavor,
		reason: `enclaved flavor: signer "${manifest.signerKeyId}" not in trust root`
	});
	if (signer.notAfter && Date.parse(signer.notAfter) < Date.now()) return audit({
		allowed: false,
		flavor,
		reason: `enclaved flavor: signer "${signer.keyId}" expired (${signer.notAfter})`
	});
	if (!signer.approvedClearance.includes(manifest.clearance)) return audit({
		allowed: false,
		flavor,
		reason: `enclaved flavor: signer "${signer.keyId}" not approved for clearance "${manifest.clearance}"`
	});
	if (!verifyManifestSignature(canonicalManifestBytes(manifest), manifest.signature, signer.publicKeyPem)) return audit({
		allowed: false,
		flavor,
		reason: "enclaved flavor: signature verification failed"
	});
	if (required && !meetsClearance(manifest.clearance, required)) return audit({
		allowed: false,
		flavor,
		reason: `enclaved flavor: module clearance "${manifest.clearance}" below required "${required}"`
	});
	return audit({
		allowed: true,
		flavor,
		clearance: manifest.clearance,
		signerKeyId: signer.keyId,
		warnings: Object.freeze([])
	});
}
//#endregion
//#region src/enclawed/integration/module-loader-shim.ts
const MANIFEST_FILENAME = "enclawed.module.json";
async function loadModuleManifest(moduleDir) {
	try {
		const raw = await readFile(join(moduleDir, MANIFEST_FILENAME), "utf8");
		return parseManifest(JSON.parse(raw));
	} catch (e) {
		if (e.code === "ENOENT") return null;
		throw e;
	}
}
async function verifyModuleAtPath(moduleDir, opts) {
	const flavor = getFlavor();
	const manifest = await loadModuleManifest(moduleDir);
	if (!manifest) {
		if (flavor === "enclaved") {
			const decision = {
				allowed: false,
				flavor,
				reason: `enclaved flavor: module at ${moduleDir} has no ${MANIFEST_FILENAME}`
			};
			const rt = getRuntime();
			if (rt) rt.audit.append({
				type: "module.decision",
				actor: moduleDir,
				level: null,
				payload: {
					decision,
					flavor,
					reason: "missing-manifest"
				}
			}).catch(() => {});
			return decision;
		}
		return {
			allowed: true,
			flavor,
			clearance: "unclassified",
			signerKeyId: null,
			warnings: Object.freeze([`module at ${moduleDir} has no ${MANIFEST_FILENAME} (open mode: warn-only)`])
		};
	}
	return checkModule(manifest, {
		requiredClearance: opts?.requiredClearance,
		flavor
	});
}
//#endregion
//#region src/enclawed/integration/preload.ts
const DEFAULT_MODULES_ROOT = "extensions";
async function readPluginManifestId(moduleDir) {
	try {
		const raw = await readFile(join(moduleDir, "enclawed.plugin.json"), "utf8");
		const parsed = JSON.parse(raw);
		return typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : null;
	} catch {
		return null;
	}
}
async function preloadModuleDecisions(rootDir = DEFAULT_MODULES_ROOT) {
	const out = /* @__PURE__ */ new Map();
	let entries;
	try {
		entries = await readdir(rootDir, { withFileTypes: true });
	} catch (e) {
		if (e.code === "ENOENT") return out;
		throw e;
	}
	for (const ent of entries) {
		if (!ent.isDirectory()) continue;
		const moduleDir = join(rootDir, ent.name);
		try {
			const decision = await verifyModuleAtPath(moduleDir);
			const keys = new Set([ent.name]);
			const manifest = await loadModuleManifest(moduleDir);
			if (manifest) keys.add(manifest.id);
			const pluginId = await readPluginManifestId(moduleDir);
			if (pluginId) keys.add(pluginId);
			for (const key of keys) out.set(key, decision);
		} catch (e) {
			out.set(ent.name, {
				allowed: false,
				flavor: "enclaved",
				reason: `manifest parse error: ${e.message}`
			});
		}
	}
	return out;
}
//#endregion
//#region src/enclawed/hardware-root/enclaweder-hid.ts
const CHALLENGE_TAG = Buffer.from("ECW-CHALLENGE-01");
/** Auto-detect a connected enclaweder by its USB VID:PID (1209:E100) via sysfs. Returns the
*  /dev/hidraw* path or null. Used at enclawed bootstrap: if a device is found, it is mandatory. */
function findEnclaweder() {
	try {
		for (const hd of fs.readdirSync("/sys/class/hidraw")) try {
			const u = fs.readFileSync(`/sys/class/hidraw/${hd}/device/uevent`, "utf8").toUpperCase();
			if (u.includes("00001209") && u.includes("0000E100")) return `/dev/${hd}`;
		} catch {}
	} catch {}
	return null;
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
*  (kept offline). Its root_id (first 4B of SHA-256) is 5cc8040c. Mirrors provisioning/root_pub.hex;
*  override via the guard only for testing or a different manufacturer root. */
const ENCLAWEDER_ROOT_PUBKEY = Buffer.from("8b7d01806542104d3ef9560c644297bd4f07279e646fe33da9a072f4fc5f6694", "hex");
/** 4-byte key id = first 4 bytes of SHA-256(root pubkey). Mirrors provisioning/cert.py root_id(). */
function certRootId(rootPubRaw) {
	return createHash("sha256").update(rootPubRaw).digest().subarray(0, 4);
}
/**
* Verify a device birth certificate (119B; layout in provisioning/cert.py) and bind it to a device:
* it must (a) chain to the pinned manufacturer root, and (b) certify THIS exact device's uid + key.
* Returns the parsed cert, or null if anything fails. Requiring this at bind time turns "a device is
* present" into "a MANUFACTURER-CERTIFIED device is present": a zeroized/re-minted or counterfeit unit
* passes challenge-response (it holds its own key) but has no root-signed cert for that key.
*/
function verifyCert(cert, deviceUid, devicePubRaw, rootPubRaw = ENCLAWEDER_ROOT_PUBKEY) {
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
	if (!parsed.rootId.equals(certRootId(rootPubRaw))) return null;
	if (!parsed.uid.equals(deviceUid) || !parsed.devicePub.equals(devicePubRaw)) return null;
	try {
		const pub = createPublicKey(rawEd25519ToPem(rootPubRaw));
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
	CHALLENGE: 17
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
	constructor(path = "/dev/hidraw0") {
		this.fd = fs.openSync(path, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
		this.buf = Buffer.alloc(0);
	}
	close() {
		try {
			fs.closeSync(this.fd);
		} catch {}
	}
	writeFrame(frame) {
		for (let off = 0; off < frame.length; off += 64) {
			const chunk = frame.subarray(off, off + 64);
			const rep = Buffer.alloc(65);
			chunk.copy(rep, 1);
			fs.writeSync(this.fd, rep);
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
	async request(type, id, payload = Buffer.alloc(0), timeoutMs = 3e3) {
		this.writeFrame(encode(type, id, payload));
		const want = type | 128;
		const end = Date.now() + timeoutMs;
		while (Date.now() < end) {
			const f = this.tryParse();
			if (f) if (f.type === want) return f;
			else continue;
			try {
				const tmp = Buffer.alloc(64);
				const n = fs.readSync(this.fd, tmp, 0, 64, null);
				if (n > 0) this.buf = Buffer.concat([this.buf, tmp.subarray(0, n)]);
			} catch (e) {
				if (e.code === "EAGAIN") await sleep(2);
				else throw e;
			}
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
		this.rootPubkey = rootPubkey ?? ENCLAWEDER_ROOT_PUBKEY;
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
		if (!cert || !verifyCert(cert, id.uid, id.pubkeyRaw, this.rootPubkey)) throw new HaltError("device not GENUINE -- no valid manufacturer certificate for this key (uncertified, counterfeit, or zeroized)");
		if (st.state === ACC_STATE.ZEROIZED) throw new HaltError("device is ZEROIZED at boot");
		this.state = {
			status: "CLEAN",
			bound: {
				serial: id.serial,
				pubkey: id.pubkeyRaw.toString("hex"),
				uid: id.uid.toString("hex")
			},
			boundAt: Date.now(),
			lastGoodAt: Date.now(),
			dirty: null
		};
		this.saveState();
		return this.bound;
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
let boundGuard = null;
let boundDev = null;
let bootPromise = null;
let resolved = false;
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
async function bootHardwareRoot(opts = {}) {
	if (resolved) return boundGuard;
	if (bootPromise) return bootPromise;
	bootPromise = (async () => {
		const path = opts.hidraw ?? process.env.ENCLAWEDER_HIDRAW ?? findEnclaweder();
		if (!path) {
			if (hardwareRootRequired()) throw new HaltError("ENCLAWEDER_ROOT=required but no enclaweder was detected at bootstrap");
			resolved = true;
			return null;
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
		resolved = true;
		return boundGuard;
	})();
	return bootPromise;
}
function hardwareRootInfo() {
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
	if (!boundGuard) return;
	boundGuard.assertClean();
}
//#endregion
//#region src/enclawed/bootstrap.ts
const DEFAULT_AUDIT_PATH_ENCLAVED = "/var/log/enclawed/audit.jsonl";
function defaultAuditPathForFlavor(flavor) {
	if (flavor === "enclaved") return DEFAULT_AUDIT_PATH_ENCLAVED;
	return resolve(homedir(), ".enclawed", "audit.jsonl");
}
/**
* Read and JSON-parse the resolved enclawed config file. Returns `undefined`
* if the file does not exist, is not readable, or is not valid JSON. Errors
* are intentionally swallowed at bootstrap because the loader is consulted
* before logger initialization; downstream code reads the same document
* later for individual extension blocks and can surface richer errors there.
*/
async function tryReadEnclawedConfigDocument(env) {
	try {
		const { path: configPath } = resolveDefaultConfigPath({ env });
		let raw;
		try {
			raw = await readFile(configPath, "utf8");
		} catch {
			return;
		}
		return JSON.parse(raw);
	} catch {
		return;
	}
}
async function bootstrapEnclawed(opts = {}) {
	const env = opts.env ?? process.env;
	const flavor = opts.flavor ?? getFlavor(env);
	let activeSchemeId = "enclawed-default";
	if (opts.classificationScheme) {
		setActiveScheme(opts.classificationScheme);
		activeSchemeId = opts.classificationScheme.id;
	} else if (env.ENCLAWED_CLASSIFICATION_SCHEME) {
		const scheme = await loadSchemeByName(env.ENCLAWED_CLASSIFICATION_SCHEME);
		setActiveScheme(scheme);
		activeSchemeId = scheme.id;
	}
	const fipsDefault = flavor === "enclaved";
	const fipsEnv = env.ENCLAWED_FIPS_REQUIRED;
	const fipsRequired = opts.fipsRequired ?? (fipsEnv === void 0 ? fipsDefault : fipsEnv !== "0");
	if (fipsRequired) assertFipsMode();
	let policy;
	if (opts.policy) policy = opts.policy;
	else {
		const fallback = flavor === "enclaved" ? defaultEnclavedPolicy() : defaultOpenPolicy();
		const jsonDoc = await tryReadEnclawedConfigDocument(env);
		if (jsonDoc !== void 0) try {
			policy = loadPolicyFromJson(jsonDoc, {
				maxOutputClearance: fallback.maxOutputClearance,
				defaultDataLabel: fallback.defaultDataLabel,
				enforceAllowlists: fallback.enforceAllowlists
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (flavor === "enclaved") throw new Error(`enclawed.policy in config is invalid: ${message}`);
			process.stderr.write(`enclawed: ignoring invalid enclawed.policy in config (${message}); using flavor default.\n`);
			policy = fallback;
		}
		else policy = fallback;
	}
	try {
		await applyPersistedTrustOverlay({ env });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (flavor === "enclaved") throw new Error(`enclawed: invalid persisted trust root: ${message}`);
		process.stderr.write(`enclawed: ignoring persisted trust root (${message}).\n`);
	}
	let auditPath = opts.auditPath ?? env.ENCLAWED_AUDIT_PATH ?? defaultAuditPathForFlavor(flavor);
	try {
		await mkdir(dirname(auditPath), { recursive: true });
	} catch (err) {
		const code = err.code;
		if (flavor === "enclaved" || !(code === "EACCES" || code === "EPERM" || code === "EROFS")) throw err;
		const fallback = resolve(homedir(), ".enclawed", "audit.jsonl");
		if (fallback === auditPath) throw err;
		process.stderr.write(`enclawed: audit-log dir ${dirname(auditPath)} not writable (${code}); falling back to ${fallback}. Override with ENCLAWED_AUDIT_PATH.\n`);
		auditPath = fallback;
		await mkdir(dirname(auditPath), { recursive: true });
	}
	const audit = new AuditLogger({ filePath: auditPath });
	const restoreFetch = installEgressGuard({
		allowedHosts: policy.allowedHosts,
		freeze: flavor === "enclaved",
		onDeny: ({ host }) => {
			audit.append({
				type: "egress.deny",
				actor: "process",
				level: null,
				payload: { host }
			}).catch(() => {});
		}
	});
	if (flavor === "enclaved") lockTrustRoot();
	let moduleDecisions = null;
	if (opts.preloadModules !== false) try {
		moduleDecisions = await preloadModuleDecisions(opts.modulesRoot);
	} catch (e) {
		if (flavor === "enclaved") throw e;
		moduleDecisions = /* @__PURE__ */ new Map();
	}
	const runtime = Object.freeze({
		flavor,
		policy,
		audit,
		restoreFetch,
		fipsRequired,
		moduleDecisions
	});
	setRuntime(runtime);
	await bootHardwareRoot();
	await audit.append({
		type: "enclawed.boot",
		actor: "process",
		level: null,
		payload: {
			pid: process.pid,
			flavor,
			hardwareRoot: hardwareRootInfo(),
			classificationScheme: activeSchemeId,
			enforceAllowlists: policy.enforceAllowlists,
			allowedChannels: [...policy.allowedChannels],
			allowedProviders: [...policy.allowedProviders],
			allowedHosts: [...policy.allowedHosts],
			fipsRequired
		}
	});
	return runtime;
}
//#endregion
export { signManifest as a, installEgressGuard as c, generateEd25519KeyPair as i, installRawSocketGuard as l, assertHardwareClean as n, verifyManifestSignature as o, hardwareRootInfo as r, EgressDeniedError as s, bootstrapEnclawed as t };
