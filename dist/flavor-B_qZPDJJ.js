import { r as resolveWorkspaceDirInfo } from "./workspace-dir-CwLpjIOc.js";
import { w as verifyCert } from "./enclaweder-hid-PwgkfW6O.js";
import { a as verifyAttestedRecord } from "./totp-verify-BQJH1IaL.js";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { createHash, createPublicKey, verify } from "node:crypto";
//#region src/enclawed/admin-policy.ts
const SYSTEM_POLICY_DIR = "/etc/enclawed";
const ADMIN_POLICY_FILENAME = "policy.json";
const SIGNED_POLICY_FILENAME = "policy.signed.json";
const ORG_KEYS_FILENAME = "org-keys.json";
const DEVICE_POLICY_FILENAME = "policy.device.json";
/** Longest a device-attested policy may stay valid after the device signed it. */
const DEVICE_POLICY_MAX_TTL_S = 2160 * 3600;
/** Domain separator for admin-policy signatures. */
const ADMIN_POLICY_SIGNING_DOMAIN = "enclawed-admin-policy-v1\0";
const TOP_KEYS = new Set([
	"v",
	"flavor",
	"fipsRequired",
	"classificationScheme",
	"policy",
	"audit",
	"trustRoot",
	"allow",
	"expiresAt",
	"description",
	"issuedAt"
]);
/**
* Check that `path` is a regular file owned by a trusted uid with mode no
* wider than 0644, that it is not a symlink, and that no ancestor directory is
* a symlink, owned by an untrusted uid, or writable by group/other. ENOENT is
* reported as `{ ok: false, reason: "ENOENT" }`.
*/
function checkRootOwnedFile(path, trustedUids = [0], opts = {}) {
	const abs = resolve(path);
	let st;
	try {
		st = lstatSync(abs);
	} catch (err) {
		return {
			ok: false,
			reason: err.code ?? "UNKNOWN"
		};
	}
	const uidMap = opts.uidMap === void 0 ? readUidMap() : opts.uidMap;
	if (uidMap !== null && !isInitialUidMap(uidMap)) return {
		ok: false,
		reason: "this process runs in a non-initial user namespace"
	};
	if (st.isSymbolicLink()) return {
		ok: false,
		reason: `${abs} is a symlink`
	};
	if (!st.isFile()) return {
		ok: false,
		reason: `${abs} is not a regular file`
	};
	if (!trustedUids.includes(st.uid)) return {
		ok: false,
		reason: `${abs} is owned by uid ${st.uid}, not root`
	};
	if ((st.mode & 3675) !== 0) return {
		ok: false,
		reason: `${abs} has mode ${(st.mode & 4095).toString(8)}, wider than 0644`
	};
	const root = parse(abs).root;
	let dir = dirname(abs);
	let first = true;
	for (;;) {
		let ds;
		try {
			ds = lstatSync(dir);
		} catch (err) {
			return {
				ok: false,
				reason: `${dir}: ${err.code ?? "UNKNOWN"}`
			};
		}
		if (ds.isSymbolicLink()) return {
			ok: false,
			reason: `${dir} is a symlink`
		};
		if (!ds.isDirectory()) return {
			ok: false,
			reason: `${dir} is not a directory`
		};
		if (!trustedUids.includes(ds.uid) && ds.uid !== 0) return {
			ok: false,
			reason: `${dir} is owned by uid ${ds.uid}, not root`
		};
		const groupOtherWritable = (ds.mode & 18) !== 0;
		const sticky = (ds.mode & 512) !== 0;
		if (groupOtherWritable && (first || !sticky)) return {
			ok: false,
			reason: `${dir} is writable by group or other`
		};
		if (dir === root) break;
		dir = dirname(dir);
		first = false;
	}
	return { ok: true };
}
/** /proc/self/uid_map, or null where it does not exist (non-Linux). */
function readUidMap() {
	if (process.platform !== "linux") return null;
	try {
		return readFileSync("/proc/self/uid_map", "utf8");
	} catch {
		return "";
	}
}
function isInitialUidMap(map) {
	const lines = map.trim().split("\n").filter(Boolean);
	return lines.length === 1 && /^\s*0\s+0\s+4294967295\s*$/.test(lines[0]);
}
function isStringArray(v) {
	return Array.isArray(v) && v.every((x) => typeof x === "string");
}
/** Validate an admin-policy document's shape. Throws TypeError on any problem. */
function parseAdminPolicyDoc(raw, opts = {}) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("admin policy must be a JSON object");
	const o = raw;
	if (o.v !== 1) throw new TypeError("admin policy \"v\" must be 1");
	for (const key of Object.keys(o)) if (!TOP_KEYS.has(key)) throw new TypeError(`admin policy key "${key}" is not a known setting`);
	if (o.flavor !== void 0 && o.flavor !== "enclaved" && o.flavor !== "open") throw new TypeError("admin policy \"flavor\" must be \"enclaved\" or \"open\"");
	if (o.fipsRequired !== void 0 && typeof o.fipsRequired !== "boolean") throw new TypeError("admin policy \"fipsRequired\" must be a boolean");
	if (o.classificationScheme !== void 0 && typeof o.classificationScheme !== "string") throw new TypeError("admin policy \"classificationScheme\" must be a string");
	if (o.audit !== void 0) {
		const a = o.audit;
		if (!a || typeof a !== "object" || Array.isArray(a)) throw new TypeError("admin policy \"audit\" must be an object");
		if (a.path !== void 0 && (typeof a.path !== "string" || !isAbsolute(a.path))) throw new TypeError("admin policy \"audit.path\" must be an absolute path");
		if (a.allowUserFallback !== void 0 && typeof a.allowUserFallback !== "boolean") throw new TypeError("admin policy \"audit.allowUserFallback\" must be a boolean");
	}
	if (o.trustRoot !== void 0) {
		const t = o.trustRoot;
		if (!t || typeof t !== "object" || !Array.isArray(t.signers)) throw new TypeError("admin policy \"trustRoot.signers\" must be an array");
	}
	if (o.allow !== void 0) {
		const a = o.allow;
		if (!a || typeof a !== "object" || Array.isArray(a)) throw new TypeError("admin policy \"allow\" must be an object");
		if (a.dangerousConfigFlags !== void 0 && !isStringArray(a.dangerousConfigFlags)) throw new TypeError("admin policy \"allow.dangerousConfigFlags\" must be a string array");
		if (a.gatewayAuthNone !== void 0 && typeof a.gatewayAuthNone !== "boolean") throw new TypeError("admin policy \"allow.gatewayAuthNone\" must be a boolean");
		if (a.hardwareRootOptional !== void 0 && typeof a.hardwareRootOptional !== "boolean") throw new TypeError("admin policy \"allow.hardwareRootOptional\" must be a boolean");
		if (a.bundledPluginsDir !== void 0 && (typeof a.bundledPluginsDir !== "string" || !a.bundledPluginsDir.startsWith("/"))) throw new TypeError("admin policy \"allow.bundledPluginsDir\" must be an absolute path");
	}
	if (o.expiresAt !== void 0 && (typeof o.expiresAt !== "string" || Number.isNaN(Date.parse(o.expiresAt)))) throw new TypeError("admin policy \"expiresAt\" must be an ISO date");
	if (opts.signed && o.expiresAt === void 0) throw new TypeError("a signed admin policy must carry \"expiresAt\"");
	return Object.freeze({ ...o });
}
function readOrgKeys(path, trustedUids, uidMap) {
	const check = checkRootOwnedFile(path, trustedUids, uidMap === void 0 ? {} : { uidMap });
	if (!check.ok) return check.reason === "ENOENT" ? {
		keys: [],
		devices: []
	} : `org keys ignored: ${check.reason}`;
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		return `org keys ignored: ${path} is not valid JSON (${err.message})`;
	}
	const keys = parsed?.keys;
	if (!Array.isArray(keys)) return `org keys ignored: ${path} has no "keys" array`;
	const out = [];
	for (const k of keys) {
		if (typeof k?.keyId !== "string") continue;
		if (typeof k.publicKeyPem === "string") out.push({
			keyId: k.keyId,
			publicKeyPem: k.publicKeyPem
		});
	}
	const devices = [];
	const devs = parsed?.enclaweders;
	for (const d of Array.isArray(devs) ? devs : []) if (typeof d?.uid === "string" && /^[0-9a-f]{24}$/.test(d.uid) && typeof d.pubkey === "string" && /^[0-9a-f]{64}$/.test(d.pubkey)) devices.push({
		uid: Buffer.from(d.uid, "hex"),
		pubkey: Buffer.from(d.pubkey, "hex"),
		label: typeof d.label === "string" ? d.label : d.uid
	});
	return {
		keys: out,
		devices
	};
}
function verifySignature(key, payload, sig) {
	try {
		return verify(null, Buffer.concat([Buffer.from(ADMIN_POLICY_SIGNING_DOMAIN, "utf8"), payload]), createPublicKey(key.publicKeyPem), sig);
	} catch {
		return false;
	}
}
function readSigned(path, orgKeys, now) {
	let raw;
	try {
		if (lstatSync(path).isSymbolicLink()) return {
			ok: false,
			reason: `${path} is a symlink`
		};
		raw = readFileSync(path, "utf8");
	} catch (err) {
		if (err.code === "ENOENT") return null;
		return {
			ok: false,
			reason: `${path}: ${err.message}`
		};
	}
	let env;
	try {
		env = JSON.parse(raw);
	} catch {
		return {
			ok: false,
			reason: `${path} is not valid JSON`
		};
	}
	if (env?.v !== 1 || typeof env.payload !== "string" || typeof env.keyId !== "string" || typeof env.sig !== "string") return {
		ok: false,
		reason: `${path} is not a signed admin-policy envelope`
	};
	const key = orgKeys.find((k) => k.keyId === env.keyId);
	if (!key) return {
		ok: false,
		reason: `${path} is signed by "${env.keyId}", which is not an org key`
	};
	const payload = Buffer.from(env.payload, "base64");
	if (!verifySignature(key, payload, Buffer.from(env.sig, "base64"))) return {
		ok: false,
		reason: `${path}: signature does not verify`
	};
	let doc;
	try {
		doc = parseAdminPolicyDoc(JSON.parse(payload.toString("utf8")), { signed: true });
	} catch (err) {
		return {
			ok: false,
			reason: `${path}: ${err.message}`
		};
	}
	if (Date.parse(doc.expiresAt) <= now.getTime()) return {
		ok: false,
		reason: `${path} expired at ${doc.expiresAt}`
	};
	return {
		ok: true,
		doc,
		keyId: env.keyId
	};
}
/**
* The short, human-readable summary of a document that the person is shown before typing the
* code, and that the device binds (as SHA3-256) into its signature. Deterministic: a verifier
* recomputes it from the document, so a summary that does not describe the document is refused.
*/
function adminPolicySummary(payload) {
	const digest = createHash("sha3-256").update(payload).digest("hex");
	const doc = parseAdminPolicyDoc(JSON.parse(payload.toString("utf8")), { signed: true });
	const parts = [`Enclawed admin policy ${digest.slice(0, 16)}`];
	if (doc.flavor !== void 0) parts.push(`flavor=${doc.flavor}`);
	if (doc.fipsRequired !== void 0) parts.push(`fipsRequired=${String(doc.fipsRequired)}`);
	if (doc.classificationScheme !== void 0) parts.push(`classificationScheme=${doc.classificationScheme}`);
	if (doc.policy !== void 0) parts.push("policy=replaced");
	if (doc.audit !== void 0) parts.push(`audit.path=${doc.audit.path ?? "-"} allowUserFallback=${String(doc.audit.allowUserFallback ?? false)}`);
	if (doc.trustRoot !== void 0) parts.push(`trustRoot.signers=${doc.trustRoot.signers.length}`);
	if (doc.allow?.dangerousConfigFlags?.length) parts.push(`allow.dangerousConfigFlags=${[...doc.allow.dangerousConfigFlags].toSorted().join(",")}`);
	if (doc.allow?.gatewayAuthNone !== void 0) parts.push(`allow.gatewayAuthNone=${String(doc.allow.gatewayAuthNone)}`);
	if (doc.allow?.hardwareRootOptional !== void 0) parts.push(`allow.hardwareRootOptional=${String(doc.allow.hardwareRootOptional)}`);
	if (doc.allow?.bundledPluginsDir !== void 0) parts.push(`allow.bundledPluginsDir=${doc.allow.bundledPluginsDir}`);
	parts.push(`expires ${doc.expiresAt}`);
	return parts.join("; ");
}
function readDeviceAttested(path, devices, now, rootPubkey) {
	let raw;
	try {
		if (lstatSync(path).isSymbolicLink()) return {
			ok: false,
			reason: `${path} is a symlink`
		};
		raw = readFileSync(path, "utf8");
	} catch (err) {
		if (err.code === "ENOENT") return null;
		return {
			ok: false,
			reason: `${path}: ${err.message}`
		};
	}
	let env;
	try {
		env = JSON.parse(raw);
	} catch {
		return {
			ok: false,
			reason: `${path} is not valid JSON`
		};
	}
	const hex = (v, n) => typeof v === "string" && v.length === n * 2 && /^[0-9a-f]+$/.test(v) ? Buffer.from(v, "hex") : null;
	const uid = hex(env?.device?.uid, 12);
	const pub = hex(env?.device?.pubkey, 32);
	const cert = hex(env?.device?.cert, 119);
	if (env?.v !== 1 || env.kind !== "enclaweder-attested" || typeof env.payload !== "string" || typeof env.summary !== "string" || !uid || !pub || !cert) return {
		ok: false,
		reason: `${path} is not a device-attested admin-policy envelope`
	};
	const listed = devices.find((d) => d.uid.equals(uid) && d.pubkey.equals(pub));
	if (!listed) return {
		ok: false,
		reason: `${path} is attested by Enclaweder ${uid.toString("hex")}, which is not listed in org-keys.json`
	};
	if (!verifyCert(cert, uid, pub, rootPubkey)) return {
		ok: false,
		reason: `${path}: the attesting device is not genuine (certificate does not verify)`
	};
	const payload = Buffer.from(env.payload, "base64");
	let doc;
	let summary;
	try {
		doc = parseAdminPolicyDoc(JSON.parse(payload.toString("utf8")), { signed: true });
		summary = adminPolicySummary(payload);
	} catch (err) {
		return {
			ok: false,
			reason: `${path}: ${err.message}`
		};
	}
	if (env.summary !== summary) return {
		ok: false,
		reason: `${path}: the summary does not describe the document`
	};
	const v = verifyAttestedRecord(env.attestation, {
		purpose: "admin-policy",
		digest: createHash("sha3-256").update(payload).digest(),
		summaryText: summary,
		pubkeyRaw: pub,
		uid
	});
	if (!v.ok) return {
		ok: false,
		reason: `${path}: ${v.reason}`
	};
	const nowS = Math.floor(now.getTime() / 1e3);
	const expS = Math.floor(Date.parse(doc.expiresAt) / 1e3);
	if (v.stepTimeS > nowS + 300) return {
		ok: false,
		reason: `${path}: the device-attested time is in the future`
	};
	if (expS > v.stepTimeS + 7776e3) return {
		ok: false,
		reason: `${path}: expiresAt is more than ${DEVICE_POLICY_MAX_TTL_S / 86400} days after the device approved it`
	};
	if (expS <= nowS) return {
		ok: false,
		reason: `${path} expired at ${doc.expiresAt}`
	};
	return {
		ok: true,
		doc,
		device: listed.label
	};
}
/** Load the admin policy from the root-owned and signed locations. Never throws. */
function loadAdminPolicy(opts = {}) {
	if ((opts.platform ?? process.platform) === "win32") return {
		admin: null,
		ignored: [],
		invalid: null
	};
	const systemDir = opts.systemDir ?? "/etc/enclawed";
	const trustedUids = opts.trustedUids ?? [0];
	const now = (opts.now ?? (() => /* @__PURE__ */ new Date()))();
	const ignored = [];
	const orgKeysRes = readOrgKeys(join(systemDir, ORG_KEYS_FILENAME), trustedUids, opts.uidMap);
	const orgKeys = typeof orgKeysRes === "string" ? [] : orgKeysRes.keys;
	const orgDevices = typeof orgKeysRes === "string" ? [] : orgKeysRes.devices;
	if (typeof orgKeysRes === "string") ignored.push(orgKeysRes);
	const signedPaths = [join(systemDir, SIGNED_POLICY_FILENAME)];
	if (opts.stateDir) signedPaths.push(join(opts.stateDir, SIGNED_POLICY_FILENAME));
	for (const p of signedPaths) {
		const res = readSigned(p, orgKeys, now);
		if (res === null) continue;
		if (res.ok) return {
			admin: Object.freeze({
				source: Object.freeze({
					kind: "signed",
					path: p,
					keyId: res.keyId
				}),
				doc: res.doc
			}),
			ignored,
			invalid: null
		};
		ignored.push(`signed admin policy ignored: ${res.reason}`);
	}
	const devicePaths = [join(systemDir, DEVICE_POLICY_FILENAME)];
	if (opts.stateDir) devicePaths.push(join(opts.stateDir, DEVICE_POLICY_FILENAME));
	for (const p of devicePaths) {
		const res = readDeviceAttested(p, orgDevices, now, opts.deviceRootPubkey ?? null);
		if (res === null) continue;
		if (res.ok) return {
			admin: Object.freeze({
				source: Object.freeze({
					kind: "device-attested",
					path: p,
					device: res.device
				}),
				doc: res.doc
			}),
			ignored,
			invalid: null
		};
		ignored.push(`device-attested admin policy ignored: ${res.reason}`);
	}
	const filePath = join(systemDir, ADMIN_POLICY_FILENAME);
	const check = checkRootOwnedFile(filePath, trustedUids, opts.uidMap === void 0 ? {} : { uidMap: opts.uidMap });
	if (!check.ok) {
		if (check.reason !== "ENOENT") ignored.push(`admin policy ${filePath} ignored: ${check.reason}`);
		return {
			admin: null,
			ignored,
			invalid: null
		};
	}
	try {
		const doc = parseAdminPolicyDoc(JSON.parse(readFileSync(filePath, "utf8")));
		return {
			admin: Object.freeze({
				source: Object.freeze({
					kind: "root-file",
					path: filePath
				}),
				doc
			}),
			ignored,
			invalid: null
		};
	} catch (err) {
		return {
			admin: null,
			ignored,
			invalid: `${filePath}: ${err.message}`
		};
	}
}
const ADMIN_KEY = Symbol.for("enclawed.admin-policy");
function setActiveAdminPolicy(load) {
	globalThis[ADMIN_KEY] = Object.freeze(load);
}
function getActiveAdminPolicyLoad() {
	const g = globalThis;
	if (!g[ADMIN_KEY]) g[ADMIN_KEY] = Object.freeze(loadAdminPolicy({ stateDir: defaultStateDir() }));
	return g[ADMIN_KEY];
}
function defaultStateDir() {
	try {
		return resolveWorkspaceDirInfo({ env: process.env }).path;
	} catch {
		return;
	}
}
function getActiveAdminPolicy() {
	return getActiveAdminPolicyLoad().admin;
}
/** True when the admin policy explicitly allows the named dangerous config flag. */
function adminAllowsDangerousFlag(flag) {
	return getActiveAdminPolicy()?.doc.allow?.dangerousConfigFlags?.includes(flag) === true;
}
/** True when the admin policy explicitly allows gateway.auth.mode "none". */
function adminAllowsGatewayAuthNone() {
	return getActiveAdminPolicy()?.doc.allow?.gatewayAuthNone === true;
}
/** Human-readable source of the admin policy, for the boot record and `policy show`. */
function describeAdminSource(admin) {
	if (!admin) return "none";
	if (admin.source.kind === "signed") return `signed:${admin.source.keyId}:${admin.source.path}`;
	if (admin.source.kind === "device-attested") return `device-attested:${admin.source.device}:${admin.source.path}`;
	return `root-file:${admin.source.path}`;
}
//#endregion
//#region src/enclawed/flavor.ts
const SECURE_ALIASES = new Set([
	"enclaved",
	"secure",
	"classified",
	"high-side"
]);
const OPEN_ALIASES = new Set([
	"open",
	"enclawed-compat",
	"permissive",
	"default"
]);
function parseFlavor(raw) {
	if (typeof raw !== "string") return null;
	const v = raw.trim().toLowerCase();
	if (SECURE_ALIASES.has(v)) return "enclaved";
	if (OPEN_ALIASES.has(v)) return "open";
	return null;
}
function resolveFlavor(env = process.env, opts = {}) {
	const adminFlavor = opts.adminFlavor === void 0 ? getActiveAdminPolicy()?.doc.flavor ?? null : opts.adminFlavor;
	const explicit = parseFlavor(env.ENCLAWED_FLAVOR);
	if (explicit === "open" && adminFlavor === "enclaved") return {
		flavor: "enclaved",
		source: "admin-policy",
		refusedEnvValue: env.ENCLAWED_FLAVOR ?? null
	};
	if (explicit) return {
		flavor: explicit,
		source: "env",
		refusedEnvValue: null
	};
	if (adminFlavor) return {
		flavor: adminFlavor,
		source: "admin-policy",
		refusedEnvValue: null
	};
	return {
		flavor: "open",
		source: "default",
		refusedEnvValue: null
	};
}
function getFlavor(env = process.env, opts) {
	return resolveFlavor(env, opts).flavor;
}
//#endregion
export { adminAllowsGatewayAuthNone as a, getActiveAdminPolicy as c, setActiveAdminPolicy as d, adminAllowsDangerousFlag as i, getActiveAdminPolicyLoad as l, resolveFlavor as n, checkRootOwnedFile as o, SYSTEM_POLICY_DIR as r, describeAdminSource as s, getFlavor as t, loadAdminPolicy as u };
