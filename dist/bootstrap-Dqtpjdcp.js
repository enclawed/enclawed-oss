import { n as resolveDefaultConfigPath } from "./workspace-dir-BFXVbXDc.js";
import { n as getRuntime, r as setRuntime } from "./runtime-Dt7e6nAN.js";
import { t as AuditLogger } from "./audit-log-C65NJQk2.js";
import { a as defaultOpenPolicy, d as loadSchemeByName, f as setActiveScheme, i as defaultEnclavedPolicy, u as clearanceNameToRank } from "./policy-wE3FfoUy.js";
import { t as getFlavor } from "./flavor-DhzvlYLU.js";
import { n as applyPersistedTrustOverlay, o as lockTrustRoot, r as findSigner } from "./trust-root-store-CxHS2Xlo.js";
import { t as loadPolicyFromJson } from "./policy-loader-D_0tQcCt.js";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { createPrivateKey, createPublicKey, generateKeyPairSync, getFips, sign, verify } from "node:crypto";
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
	await audit.append({
		type: "enclawed.boot",
		actor: "process",
		level: null,
		payload: {
			pid: process.pid,
			flavor,
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
export { EgressDeniedError as a, verifyManifestSignature as i, generateEd25519KeyPair as n, installEgressGuard as o, signManifest as r, bootstrapEnclawed as t };
