import { r as resolveWorkspaceDirInfo } from "./workspace-dir-BFXVbXDc.js";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
const DEFAULT_TRUST_ROOT = Object.freeze([
	Object.freeze({
		keyId: "enclawed-community-2026",
		publicKeyPem: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZv8=
-----END PUBLIC KEY-----
`,
		approvedClearance: Object.freeze(["public", "internal"]),
		description: "Placeholder community signer. Replace before any high-trust deployment."
	}),
	Object.freeze({
		keyId: "enclawed-bundled-dev-2026",
		publicKeyPem: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfA+FXXYndxLjvnbzBbMSuo3IPWP+r16CL3jbWjTWpQQ=
-----END PUBLIC KEY-----
`,
		approvedClearance: Object.freeze(["public", "internal"]),
		description: "Bundled-extension dev signer. Signs every shipped extensions/<id>/enclawed.module.json. Replace with an HSM-anchored signer before any non-dev deployment."
	}),
	Object.freeze({
		keyId: "enclawed-attested-reference-2026",
		publicKeyPem: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAzSWxiIufG9qsDIvBjEIDSIhbLNLHB0UGP9+eQmKIFzc=
-----END PUBLIC KEY-----
`,
		approvedClearance: Object.freeze([
			"public",
			"internal",
			"confidential",
			"restricted",
			"restricted-plus"
		]),
		description: "Reference highest-tier signer for the bundled mcp-attested module. Replace before production; private key was destroyed after manifest signing."
	})
]);
let runtimeTrustRoot = DEFAULT_TRUST_ROOT;
let trustRootLocked = false;
var TrustRootLockedError = class extends Error {
	constructor() {
		super("trust root is locked; setTrustRoot/resetTrustRoot rejected post-lock");
		this.name = "TrustRootLockedError";
	}
};
function getTrustRoot() {
	return runtimeTrustRoot;
}
function setTrustRoot(signers) {
	if (trustRootLocked) throw new TrustRootLockedError();
	if (!Array.isArray(signers)) throw new TypeError("setTrustRoot: signers must be an array");
	for (const s of signers) if (!s || typeof s.keyId !== "string" || !s.publicKeyPem || !s.approvedClearance) throw new TypeError("setTrustRoot: each signer must define keyId, publicKeyPem, approvedClearance");
	runtimeTrustRoot = Object.freeze(signers.map((s) => Object.freeze({ ...s })));
}
function findSigner(keyId) {
	return runtimeTrustRoot.find((s) => s.keyId === keyId);
}
function lockTrustRoot() {
	trustRootLocked = true;
}
function isTrustRootLocked() {
	return trustRootLocked;
}
//#endregion
//#region src/enclawed/trust-root-store.ts
const PERSISTED_TRUST_ROOT_FILENAME = "trust-root.json";
const VALID_CLEARANCES = new Set([
	"public",
	"internal",
	"confidential",
	"restricted",
	"restricted-plus",
	"unclassified",
	"cui",
	"secret",
	"top-secret",
	"top-secret-sci",
	"q-cleared",
	"l-cleared"
]);
function isPersistedShape(x) {
	if (!x || typeof x !== "object" || Array.isArray(x)) return false;
	const o = x;
	if (o.v !== 1) return false;
	if (!Array.isArray(o.signers)) return false;
	for (const s of o.signers) {
		if (!s || typeof s !== "object") return false;
		const obj = s;
		if (typeof obj.keyId !== "string" || obj.keyId.length === 0) return false;
		if (typeof obj.publicKeyPem !== "string" || !obj.publicKeyPem.includes("BEGIN PUBLIC KEY")) return false;
		if (!Array.isArray(obj.approvedClearance)) return false;
		for (const c of obj.approvedClearance) {
			if (typeof c !== "string") return false;
			if (!VALID_CLEARANCES.has(c)) return false;
		}
		if (obj.description !== void 0 && typeof obj.description !== "string") return false;
		if (obj.notAfter !== void 0 && typeof obj.notAfter !== "string") return false;
	}
	return true;
}
function resolveStorePath(env) {
	return join(resolveWorkspaceDirInfo({ env }).path, PERSISTED_TRUST_ROOT_FILENAME);
}
async function readPersistedTrustRoot(options = {}) {
	const path = options.filePath ?? resolveStorePath(options.env ?? process.env);
	let raw;
	try {
		raw = await readFile(path, "utf8");
	} catch {
		return;
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new Error(`trust-root file at ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (!isPersistedShape(parsed)) throw new Error(`trust-root file at ${path} does not match the expected schema`);
	return parsed;
}
async function writePersistedTrustRoot(doc, options = {}) {
	const path = options.filePath ?? resolveStorePath(options.env ?? process.env);
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp-${process.pid}`;
	await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, { mode: 384 });
	await rename(tmp, path);
	return path;
}
function persistedSignersToRuntime(doc) {
	return doc.signers.map((s) => Object.freeze({
		keyId: s.keyId,
		publicKeyPem: s.publicKeyPem,
		approvedClearance: Object.freeze(s.approvedClearance.map((c) => c)),
		description: s.description ?? "Persisted runtime signer.",
		...s.notAfter ? { notAfter: s.notAfter } : {}
	}));
}
/**
* Layer persisted signers on top of `DEFAULT_TRUST_ROOT` and apply the result
* via `setTrustRoot(...)`. Skipped if the trust root has already been locked
* (idempotent in tests). Conflicts: persisted entries with a keyId that
* already exists in the default root REPLACE the default entry — the
* operator is explicitly asserting the new clearance set.
*/
async function applyPersistedTrustOverlay(options = {}) {
	if (isTrustRootLocked()) return {
		applied: 0,
		reason: "trust root locked"
	};
	const doc = await readPersistedTrustRoot(options);
	if (!doc) return {
		applied: 0,
		reason: "no persisted file"
	};
	const persisted = persistedSignersToRuntime(doc);
	const persistedIds = new Set(persisted.map((s) => s.keyId));
	setTrustRoot([...DEFAULT_TRUST_ROOT.filter((s) => !persistedIds.has(s.keyId)), ...persisted]);
	return { applied: persisted.length };
}
/**
* Add (or replace) a single signer in the persisted overlay file. Returns
* the file path written. Does NOT call `setTrustRoot` — bootstrap will pick
* the overlay up on next process start. In the open flavor (where the trust
* root is not locked) we ALSO apply it to the running process so the new
* signer is visible to any code that re-reads the trust root.
*/
async function addPersistedSigner(signer, options = {}) {
	if (!signer.keyId || typeof signer.keyId !== "string") throw new TypeError("addPersistedSigner: keyId is required");
	if (!signer.publicKeyPem || !signer.publicKeyPem.includes("BEGIN PUBLIC KEY")) throw new TypeError("addPersistedSigner: publicKeyPem must be a PEM-encoded SPKI block");
	if (!Array.isArray(signer.approvedClearance) || signer.approvedClearance.length === 0) throw new TypeError("addPersistedSigner: approvedClearance must be a non-empty array");
	for (const c of signer.approvedClearance) if (!VALID_CLEARANCES.has(c)) throw new TypeError(`addPersistedSigner: unknown clearance "${c}"`);
	const existing = await readPersistedTrustRoot(options) ?? {
		v: 1,
		signers: []
	};
	const prior = existing.signers.findIndex((s) => s.keyId === signer.keyId);
	const replaced = prior >= 0;
	const next = {
		v: 1,
		signers: replaced ? existing.signers.map((s, i) => i === prior ? signer : s) : [...existing.signers, signer]
	};
	const path = await writePersistedTrustRoot(next, options);
	if (!isTrustRootLocked()) {
		const persisted = persistedSignersToRuntime(next);
		const persistedIds = new Set(persisted.map((s) => s.keyId));
		const live = getTrustRoot().filter((s) => !persistedIds.has(s.keyId) && !DEFAULT_TRUST_ROOT.some((d) => d.keyId === s.keyId));
		setTrustRoot([
			...DEFAULT_TRUST_ROOT.filter((s) => !persistedIds.has(s.keyId)),
			...live,
			...persisted
		]);
	}
	return {
		path,
		replaced
	};
}
//#endregion
export { isTrustRootLocked as a, getTrustRoot as i, applyPersistedTrustOverlay as n, lockTrustRoot as o, findSigner as r, addPersistedSigner as t };
