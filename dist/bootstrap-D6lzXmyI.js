import { n as resolveDefaultConfigPath, r as resolveWorkspaceDirInfo } from "./workspace-dir-CwLpjIOc.js";
import { n as getRuntime, r as setRuntime } from "./runtime-Dt7e6nAN.js";
import { d as setActiveAdminPolicy, l as getActiveAdminPolicyLoad, n as resolveFlavor, s as describeAdminSource, t as getFlavor, u as loadAdminPolicy } from "./flavor-CPDBgn8D.js";
import { t as AuditLogger } from "./audit-log-B0xJdvPI.js";
import { h as setActiveScheme, m as loadSchemeByName, p as clearanceNameToRank } from "./policy-B_YSjRFl.js";
import { a as resolveBootPolicy, c as extractPolicyBlock, i as resolveAuditPathInputs, n as findRefusedEnvKnobs, o as resolveFipsRequirement, r as formatRefusal, t as enclavedPostureWarnings } from "./boot-posture-916uQMBO.js";
import { i as installRawSocketGuard, r as installEgressGuard } from "./egress-guard-BhEVaiEm.js";
import { K as setForensicAuditSink, i as bootHardwareRoot, l as hardwareRootInfo, q as setForensicContext } from "./hardware-root-DQ2ym1zw.js";
import { a as parseHpcPolicy, i as extractHpcBlock, n as configureHpcGate, r as resolveHpcGatePolicy } from "./hpc-DmbgeOUc.js";
import { i as setModuleBindings, n as computeModuleBinding } from "./module-binding-CBQdqVRW.js";
import { n as applyPersistedTrustOverlay, o as lockTrustRoot, r as findSigner } from "./trust-root-store-B1I1NSBh.js";
import { r as publishToolCapabilityClassifier } from "./tool-capability-map-BAuf7O3V.js";
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
/**
* Read a manifest/scheme field that must be a scalar.
*
* These parsers used `String(value ?? "")`, which turns a supplied object
* into the literal "[object Object]" -- a non-empty string that then passes
* every "is it present" check below it. A manifest claiming `{"id": {}}`
* would have been accepted with that as its id. Numbers stay acceptable
* (a version written unquoted is an ordinary mistake, not an attack);
* objects, arrays and booleans are malformed input and say so.
*/
function scalarField(value, field) {
	if (value === void 0 || value === null) return "";
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" || typeof value === "bigint") return String(value).trim();
	throw new TypeError(`${field} must be a string`);
}
function clearanceToRank(name) {
	const fromScheme = clearanceNameToRank(name);
	if (fromScheme !== void 0) return fromScheme;
	return LEGACY_CLEARANCE_ORDER[name.toLowerCase()];
}
function parseManifest(raw) {
	if (raw === null || typeof raw !== "object") throw new TypeError("manifest must be a JSON object");
	const m = raw;
	if (m.v !== 1) throw new Error(`unsupported manifest version: ${String(m.v)}`);
	const id = scalarField(m.id, "manifest.id");
	if (!id) throw new Error("manifest.id is required");
	const publisher = scalarField(m.publisher, "manifest.publisher");
	if (!publisher) throw new Error("manifest.publisher is required");
	const version = scalarField(m.version, "manifest.version");
	if (!version) throw new Error("manifest.version is required");
	const clearance = scalarField(m.clearance, "manifest.clearance");
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
		capabilities: [...manifest.capabilities].toSorted(),
		signerKeyId: manifest.signerKeyId ?? null,
		verification: manifest.verification,
		netAllowedHosts: [...manifest.netAllowedHosts ?? []].toSorted()
	};
	return Buffer.from(canonicalize(body), "utf8");
}
function canonicalize(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
	const obj = value;
	return "{" + Object.keys(obj).toSorted().map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
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
		}),
		privateKey: privateKey.export({
			format: "pem",
			type: "pkcs8"
		})
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
	const flavor = opts?.flavor ?? getRuntime()?.flavor ?? getFlavor();
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
async function preloadModuleDecisions(rootDir = DEFAULT_MODULES_ROOT, opts = {}) {
	const out = /* @__PURE__ */ new Map();
	const bindings = /* @__PURE__ */ new Map();
	setModuleBindings(bindings);
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
			const decision = await verifyModuleAtPath(moduleDir, { flavor: opts.flavor });
			const keys = new Set([ent.name]);
			const manifest = await loadModuleManifest(moduleDir);
			if (manifest) keys.add(manifest.id);
			const pluginId = await readPluginManifestId(moduleDir);
			if (pluginId) keys.add(pluginId);
			const binding = computeModuleBinding(moduleDir);
			for (const key of keys) {
				out.set(key, decision);
				bindings.set(key, binding);
			}
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
/** Loopback is always reachable by the raw-socket guard: the gateway's own clients and local models. */
const LOOPBACK_HOSTS = [
	"127.0.0.1",
	"::1",
	"localhost"
];
const LOOPBACK_CIDRS = ["127.0.0.0/8"];
function safeStateDir(env) {
	try {
		return resolveWorkspaceDirInfo({ env }).path;
	} catch {
		return;
	}
}
/** Audit-append failure handler for fire-and-forget records: never silent. */
function reportAuditFailure(type) {
	return (err) => {
		process.stderr.write(`enclawed: ERROR: could not write the "${type}" audit record: ${err instanceof Error ? err.message : String(err)}\n`);
	};
}
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
	const usesProcessEnv = opts.env === void 0 || opts.env === process.env;
	const adminLoad = opts.adminPolicy ?? (usesProcessEnv ? getActiveAdminPolicyLoad() : loadAdminPolicy({ stateDir: safeStateDir(env) }));
	if (opts.adminPolicy || usesProcessEnv) setActiveAdminPolicy(adminLoad);
	const admin = adminLoad.admin;
	const refusals = [];
	const refuse = (r) => {
		refusals.push(r);
		if (r.source !== "ENCLAWED_FLAVOR") process.stderr.write(`${formatRefusal(r)}\n`);
	};
	const resolvedFlavor = resolveFlavor(env, { adminFlavor: admin?.doc.flavor ?? null });
	const flavor = opts.flavor ?? resolvedFlavor.flavor;
	if (!opts.flavor && resolvedFlavor.refusedEnvValue !== null) {
		process.stderr.write(`enclawed: REFUSED: ENCLAWED_FLAVOR=${JSON.stringify(resolvedFlavor.refusedEnvValue)} would downgrade the "enclaved" flavor set by the admin policy; staying "enclaved".
`);
		refusals.push({
			source: "ENCLAWED_FLAVOR",
			setting: `ENCLAWED_FLAVOR=${resolvedFlavor.refusedEnvValue}`
		});
	}
	for (const line of adminLoad.ignored) process.stderr.write(`enclawed: WARNING: ${line}\n`);
	if (adminLoad.invalid !== null) {
		if (flavor === "enclaved") throw new Error(`enclawed: the admin policy is invalid: ${adminLoad.invalid}`);
		process.stderr.write(`enclawed: ignoring invalid admin policy (${adminLoad.invalid}).\n`);
	}
	const knobRefusals = findRefusedEnvKnobs({
		flavor,
		env,
		admin
	});
	if (env !== process.env) {
		const seen = new Set(knobRefusals.map((r) => r.setting));
		for (const r of findRefusedEnvKnobs({
			flavor,
			env: process.env,
			admin
		})) if (!seen.has(r.setting)) knobRefusals.push(r);
	}
	if (knobRefusals.length > 0) {
		for (const r of knobRefusals) process.stderr.write(`${formatRefusal(r)}\n`);
		throw new Error(`enclawed: refusing to start: ${knobRefusals.map((r) => r.setting).join("; ")}. Unset the variable(s); they are not user settings` + (flavor === "enclaved" ? " (retiring an Enclaweder: the admin policy sets \"allow\": { \"hardwareRootOptional\": true })" : "") + ".");
	}
	let activeSchemeId = "enclawed-default";
	if (opts.classificationScheme) {
		setActiveScheme(opts.classificationScheme);
		activeSchemeId = opts.classificationScheme.id;
	} else if (admin?.doc.classificationScheme) {
		const scheme = await loadSchemeByName(admin.doc.classificationScheme);
		setActiveScheme(scheme);
		activeSchemeId = scheme.id;
	} else if (env.ENCLAWED_CLASSIFICATION_SCHEME) if (flavor === "enclaved" || admin) refuse({
		source: "ENCLAWED_CLASSIFICATION_SCHEME",
		setting: `ENCLAWED_CLASSIFICATION_SCHEME=${env.ENCLAWED_CLASSIFICATION_SCHEME}`
	});
	else {
		const scheme = await loadSchemeByName(env.ENCLAWED_CLASSIFICATION_SCHEME);
		setActiveScheme(scheme);
		activeSchemeId = scheme.id;
	}
	const fips = resolveFipsRequirement({
		flavor,
		env,
		optionValue: opts.fipsRequired,
		admin
	});
	if (fips.refused) refuse(fips.refused);
	const fipsRequired = fips.required;
	const fipsEnabled = isFipsEnabled();
	if (fipsRequired) assertFipsMode();
	const fipsDowngrade = flavor === "enclaved" && !fipsRequired;
	if (fipsDowngrade) process.stderr.write(`enclawed: WARNING: the enclaved flavor is running without the FIPS requirement (set by ${fips.source === "option" ? "the embedding app" : "the admin policy"}; FIPS mode is ${fipsEnabled ? "on" : "off"}). This is an evaluation-only downgrade and is recorded in the audit log.
`);
	let policy;
	{
		let userBlock;
		if (!opts.policy) userBlock = extractPolicyBlock(await tryReadEnclawedConfigDocument(env));
		try {
			const decision = resolveBootPolicy({
				flavor,
				admin,
				userBlock,
				optionPolicy: opts.policy
			});
			policy = decision.policy;
			decision.refused.forEach(refuse);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (flavor === "enclaved") throw new Error(`enclawed.policy is invalid: ${message}`, { cause: err });
			process.stderr.write(`enclawed: ignoring invalid enclawed.policy in config (${message}); using flavor default.\n`);
			policy = resolveBootPolicy({
				flavor,
				admin: null,
				userBlock: void 0
			}).policy;
		}
	}
	if (opts.hpcPolicy !== void 0) configureHpcGate(opts.hpcPolicy);
	else {
		const hpcBlock = extractHpcBlock(await tryReadEnclawedConfigDocument(env));
		try {
			configureHpcGate(resolveHpcGatePolicy(hpcBlock, flavor));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (flavor === "enclaved") throw new Error(`enclawed.hpc in config is invalid: ${message}`, { cause: err });
			process.stderr.write(`enclawed: enclawed.hpc in config is invalid (${message}); refusing every HPC launch.\n`);
			configureHpcGate(parseHpcPolicy({
				enforce: true,
				schedulers: []
			}));
		}
	}
	try {
		const overlay = await applyPersistedTrustOverlay({
			env,
			flavor,
			adminSigners: admin?.doc.trustRoot?.signers ?? null
		});
		for (const line of overlay.refused) refuse({
			source: "the trust-root overlay",
			setting: line
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (flavor === "enclaved") throw new Error(`enclawed: invalid trust root: ${message}`, { cause: err });
		process.stderr.write(`enclawed: ignoring persisted trust root (${message}).\n`);
	}
	const auditInputs = resolveAuditPathInputs({
		flavor,
		admin,
		optionPath: opts.auditPath,
		envPath: env.ENCLAWED_AUDIT_PATH
	});
	auditInputs.refused.forEach(refuse);
	let auditPath = auditInputs.optionPath ?? auditInputs.adminPath ?? auditInputs.envPath ?? defaultAuditPathForFlavor(flavor);
	try {
		await mkdir(dirname(auditPath), { recursive: true });
	} catch (err) {
		const code = err.code;
		if (flavor === "enclaved" || !(code === "EACCES" || code === "EPERM" || code === "EROFS") || !auditInputs.allowUserFallback) throw err;
		const fallback = resolve(homedir(), ".enclawed", "audit.jsonl");
		if (fallback === auditPath) throw err;
		process.stderr.write(`enclawed: audit-log dir ${dirname(auditPath)} not writable (${code}); falling back to ${fallback}. Override with ENCLAWED_AUDIT_PATH.\n`);
		auditPath = fallback;
		await mkdir(dirname(auditPath), { recursive: true });
	}
	const audit = new AuditLogger({ filePath: auditPath });
	publishToolCapabilityClassifier();
	const restoreFetch = installEgressGuard({
		allowedHosts: policy.allowedHosts,
		freeze: flavor === "enclaved",
		onDeny: ({ host }) => {
			audit.append({
				type: "egress.deny",
				actor: "process",
				level: null,
				payload: { host }
			}).catch(reportAuditFailure("egress.deny"));
		}
	});
	let rawSocketGuardInstalled = false;
	if (policy.enforceAllowlists && opts.rawSocketGuard !== false) {
		installRawSocketGuard({
			allowedHosts: [...policy.allowedHosts, ...LOOPBACK_HOSTS],
			allowedCidrs: LOOPBACK_CIDRS,
			freeze: flavor === "enclaved",
			onDeny: ({ host, port, kind }) => {
				audit.append({
					type: "egress.deny",
					actor: "process",
					level: null,
					payload: {
						host,
						port: port ?? null,
						kind
					}
				}).catch(reportAuditFailure("egress.deny"));
			}
		});
		rawSocketGuardInstalled = true;
	}
	if (flavor === "enclaved") lockTrustRoot();
	let moduleDecisions = null;
	if (opts.preloadModules !== false) try {
		moduleDecisions = await preloadModuleDecisions(opts.modulesRoot, { flavor });
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
	if (opts.hardwareRoot !== false) {
		setForensicAuditSink((rec) => audit.append(rec));
		setForensicContext({ auditPath });
		await bootHardwareRoot();
	}
	if (policy.enforceAllowlists && policy.allowedTools.size === 0) process.stderr.write("enclawed: enclawed.policy.allowedTools is empty, so agents get no tools. List the tool ids to allow (see `enclawed policy`).\n");
	for (const line of enclavedPostureWarnings(flavor, policy)) process.stderr.write(`${line}\n`);
	if (refusals.length > 0) await audit.append({
		type: "enclawed.policy.refused",
		actor: "process",
		level: null,
		payload: {
			flavor,
			refusals: refusals.map((r) => ({ ...r }))
		}
	});
	await audit.append({
		type: "enclawed.boot",
		actor: "process",
		level: null,
		payload: {
			pid: process.pid,
			flavor,
			flavorSource: opts.flavor ? "option" : resolvedFlavor.source,
			refusedFlavorEnv: resolvedFlavor.refusedEnvValue,
			adminPolicy: describeAdminSource(admin),
			adminPolicyIgnored: [...adminLoad.ignored],
			policyRefusals: refusals.map((r) => `${r.source}: ${r.setting}`),
			rawSocketGuard: rawSocketGuardInstalled,
			commandNetwork: policy.commandNetwork,
			hardwareRoot: hardwareRootInfo(),
			hardwareRootSkippedByOption: opts.hardwareRoot === false,
			classificationScheme: activeSchemeId,
			enforceAllowlists: policy.enforceAllowlists,
			allowedChannels: [...policy.allowedChannels],
			allowedProviders: [...policy.allowedProviders],
			allowedTools: [...policy.allowedTools],
			allowedHosts: [...policy.allowedHosts],
			preApprovedIrreversibleTools: [...policy.preApprovedIrreversibleTools],
			scratchPaths: [...policy.scratchPaths],
			history: {
				maxFileBytes: policy.history.maxFileBytes,
				maxTotalBytes: policy.history.maxTotalBytes,
				maxAgeDays: policy.history.maxAgeDays,
				noHistoryPaths: [...policy.history.noHistoryPaths],
				noHistoryTools: [...policy.history.noHistoryTools]
			},
			fipsRequired,
			fipsSource: fips.source,
			fipsEnabled,
			fipsDowngrade,
			auditPath
		}
	});
	return runtime;
}
//#endregion
export { verifyManifestSignature as i, generateEd25519KeyPair as n, signManifest as r, bootstrapEnclawed as t };
