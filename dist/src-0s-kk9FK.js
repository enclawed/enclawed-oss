import { n as isToolAdmitted, t as getServerByEndpoint } from "./server-registry-Dfft0BAM.js";
import { createPublicKey, verify } from "node:crypto";
//#region enclawed/ts/runtime.ts
const RUNTIME_KEY = Symbol.for("enclawed.runtime");
function getRuntime() {
	return globalThis[RUNTIME_KEY] ?? null;
}
//#endregion
//#region enclawed/src/classification-scheme.mjs
function normalizeName(s) {
	return String(s).trim().toUpperCase();
}
function makeLevel(rank, canonicalName, aliases = []) {
	return Object.freeze({
		rank,
		canonicalName,
		aliases: Object.freeze(aliases.slice())
	});
}
function freezeScheme(s) {
	return Object.freeze({
		id: s.id,
		description: s.description,
		levels: Object.freeze(s.levels.slice().sort((a, b) => a.rank - b.rank)),
		validCompartments: s.validCompartments ? Object.freeze(s.validCompartments.slice()) : void 0,
		validReleasability: s.validReleasability ? Object.freeze(s.validReleasability.slice()) : void 0
	});
}
const DEFAULT_SCHEME = freezeScheme({
	id: "enclawed-default",
	description: "Default merged scheme: generic-industry canonical names with US-gov aliases on the same numeric ladder.",
	levels: [
		makeLevel(0, "PUBLIC", [
			"UNCLASSIFIED",
			"U",
			"P"
		]),
		makeLevel(1, "INTERNAL", ["CUI", "I"]),
		makeLevel(2, "CONFIDENTIAL", ["C"]),
		makeLevel(3, "RESTRICTED", [
			"SECRET",
			"S",
			"R"
		]),
		makeLevel(4, "RESTRICTED-PLUS", [
			"TOP SECRET",
			"TS",
			"R+"
		]),
		makeLevel(5, "SCI", [
			"TOP SECRET//SCI",
			"TS//SCI",
			"RESTRICTED-PLUS//SCI"
		])
	]
});
const US_GOVERNMENT_SCHEME = freezeScheme({
	id: "us-government",
	description: "US-government classification ladder.",
	levels: [
		makeLevel(0, "UNCLASSIFIED", ["U", "PUBLIC"]),
		makeLevel(1, "CUI", ["INTERNAL"]),
		makeLevel(2, "CONFIDENTIAL", ["C"]),
		makeLevel(3, "SECRET", ["S", "RESTRICTED"]),
		makeLevel(4, "TOP SECRET", ["TS", "RESTRICTED-PLUS"]),
		makeLevel(5, "TOP SECRET//SCI", ["TS//SCI", "SCI"])
	],
	validReleasability: [
		"NOFORN",
		"REL TO USA",
		"FVEY",
		"ORCON",
		"PROPIN"
	]
});
const HEALTHCARE_HIPAA_SCHEME = freezeScheme({
	id: "healthcare-hipaa",
	description: "Healthcare scheme oriented around HIPAA / GDPR Art. 9 special-category data.",
	levels: [
		makeLevel(0, "PUBLIC", []),
		makeLevel(1, "INTERNAL", []),
		makeLevel(2, "PHI", ["PROTECTED-HEALTH-INFORMATION"]),
		makeLevel(3, "SENSITIVE-PHI", [
			"PSYCH",
			"GENETIC",
			"HIV-STATUS",
			"SUD"
		]),
		makeLevel(4, "RESEARCH-EMBARGOED", ["EMBARGO", "PRE-PUBLICATION"])
	],
	validCompartments: [
		"MENTAL-HEALTH",
		"GENETICS",
		"HIV",
		"SUD",
		"MINOR",
		"VIP"
	],
	validReleasability: [
		"NDA",
		"EYES_ONLY",
		"DO_NOT_FORWARD",
		"BAA-COVERED"
	]
});
const FINANCIAL_SERVICES_SCHEME = freezeScheme({
	id: "financial-services",
	description: "Financial-services scheme around MNPI, insider lists, privileged communications.",
	levels: [
		makeLevel(0, "PUBLIC", []),
		makeLevel(1, "INTERNAL", []),
		makeLevel(2, "CONFIDENTIAL", []),
		makeLevel(3, "MNPI", ["MATERIAL-NON-PUBLIC-INFORMATION", "INSIDER"]),
		makeLevel(4, "PRIVILEGED-COUNSEL", ["ATTORNEY-CLIENT", "LEGAL-PRIVILEGE"])
	],
	validCompartments: [
		"M_AND_A",
		"DEAL_TEAM",
		"RESTRICTED_LIST",
		"TRADING_DESK",
		"AUDIT"
	],
	validReleasability: [
		"NDA",
		"EYES_ONLY",
		"DO_NOT_FORWARD",
		"REGULATOR-DISCLOSURE"
	]
});
const GENERIC_3_TIER_SCHEME = freezeScheme({
	id: "generic-3-tier",
	description: "Smallest viable scheme: Public, Internal, Restricted.",
	levels: [
		makeLevel(0, "PUBLIC", []),
		makeLevel(1, "INTERNAL", []),
		makeLevel(2, "RESTRICTED", ["CONFIDENTIAL", "SENSITIVE"])
	]
});
Object.freeze({
	default: DEFAULT_SCHEME,
	"us-government": US_GOVERNMENT_SCHEME,
	"healthcare-hipaa": HEALTHCARE_HIPAA_SCHEME,
	"financial-services": FINANCIAL_SERVICES_SCHEME,
	"generic-3-tier": GENERIC_3_TIER_SCHEME
});
let activeScheme = DEFAULT_SCHEME;
function clearanceNameToRank(name, scheme = activeScheme) {
	const norm = normalizeName(name);
	for (const lv of scheme.levels) {
		if (normalizeName(lv.canonicalName) === norm) return lv.rank;
		for (const a of lv.aliases) if (normalizeName(a) === norm) return lv.rank;
	}
}
//#endregion
//#region enclawed/src/module-manifest.mjs
const LEGACY_CLEARANCE_ORDER$1 = Object.freeze({
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
});
const CLEARANCE_ORDER$1 = LEGACY_CLEARANCE_ORDER$1;
function clearanceToRank(name) {
	const fromScheme = clearanceNameToRank(name);
	if (fromScheme !== void 0) return fromScheme;
	return LEGACY_CLEARANCE_ORDER$1[String(name).toLowerCase()];
}
function parseManifest$1(raw) {
	if (raw === null || typeof raw !== "object") throw new TypeError("manifest must be a JSON object");
	if (raw.v !== 1) throw new Error(`unsupported manifest version: ${raw.v}`);
	const id = String(raw.id ?? "").trim();
	if (!id) throw new Error("manifest.id is required");
	const publisher = String(raw.publisher ?? "").trim();
	if (!publisher) throw new Error("manifest.publisher is required");
	const version = String(raw.version ?? "").trim();
	if (!version) throw new Error("manifest.version is required");
	const clearance = String(raw.clearance ?? "").trim();
	if (clearanceToRank(clearance) === void 0) throw new Error(`manifest.clearance "${clearance}" is not a recognized name in the active classification scheme`);
	if (!Array.isArray(raw.capabilities) || !raw.capabilities.every((c) => typeof c === "string")) throw new Error("manifest.capabilities must be string[]");
	const capabilities = Object.freeze(raw.capabilities.slice());
	const signerKeyId = typeof raw.signerKeyId === "string" && raw.signerKeyId.trim().length > 0 ? raw.signerKeyId.trim() : void 0;
	const signature = typeof raw.signature === "string" && raw.signature.trim().length > 0 ? raw.signature.trim() : void 0;
	const verification = typeof raw.verification === "string" && raw.verification.trim().length > 0 ? raw.verification.trim() : void 0;
	const netAllowedHosts = Array.isArray(raw.netAllowedHosts) && raw.netAllowedHosts.every((h) => typeof h === "string") ? Object.freeze(raw.netAllowedHosts.slice()) : Object.freeze([]);
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
function canonicalize(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
	return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}
function canonicalManifestBytes$1(manifest) {
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
function meetsClearance$1(actual, required) {
	return CLEARANCE_ORDER$1[actual] >= CLEARANCE_ORDER$1[required];
}
function parseManifest(raw) {
	return parseManifest$1(raw);
}
function canonicalManifestBytes(manifest) {
	return canonicalManifestBytes$1(manifest);
}
function meetsClearance(actual, required) {
	return meetsClearance$1(actual, required);
}
//#endregion
//#region enclawed/src/module-signing.mjs
function verifyManifestSignature$1(canonicalBytes, signatureBase64, publicKeyPem) {
	const key = createPublicKey({
		key: publicKeyPem,
		format: "pem"
	});
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
//#region enclawed/ts/module-signing.ts
function verifyManifestSignature(canonicalBytes, signatureBase64, publicKeyPem) {
	return verifyManifestSignature$1(canonicalBytes, signatureBase64, publicKeyPem);
}
let runtimeTrustRoot = Object.freeze([
	Object.freeze({
		keyId: "enclawed-community-2026",
		publicKeyPem: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZv8=
-----END PUBLIC KEY-----
`,
		approvedClearance: Object.freeze(["public", "internal"]),
		description: "Placeholder community signer."
	}),
	Object.freeze({
		keyId: "enclawed-bundled-dev-2026",
		publicKeyPem: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfA+FXXYndxLjvnbzBbMSuo3IPWP+r16CL3jbWjTWpQQ=
-----END PUBLIC KEY-----
`,
		approvedClearance: Object.freeze(["public", "internal"]),
		description: "Bundled-extension dev signer. Signs every shipped extensions/<id>/enclawed.module.json."
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
		description: "Reference highest-tier signer for the bundled mcp-attested module."
	})
]);
function findSigner$1(keyId) {
	return runtimeTrustRoot.find((s) => s.keyId === keyId);
}
function findSigner(keyId) {
	return findSigner$1(keyId);
}
//#endregion
//#region extensions/mcp-attested/src/server-clearance-verifier.ts
async function verifyServerClearance(serverUrl, required = "restricted-plus", fetcher = (u) => fetch(u)) {
	const base = serverUrl.replace(/\/+$/, "");
	const url = `${base}/.well-known/enclawed-clearance.json`;
	let raw;
	try {
		const r = await fetcher(url);
		if (!r.ok) return {
			ok: false,
			reason: `clearance fetch HTTP ${r.status}`
		};
		raw = await r.json();
	} catch (e) {
		return {
			ok: false,
			reason: `clearance fetch failed: ${e.message}`
		};
	}
	let manifest;
	try {
		manifest = parseManifest(raw);
	} catch (e) {
		return {
			ok: false,
			reason: `clearance manifest invalid: ${e.message}`
		};
	}
	if (!manifest.capabilities.includes("mcp-server")) return {
		ok: false,
		reason: "server clearance manifest does not declare mcp-server capability"
	};
	if (!manifest.signerKeyId || !manifest.signature) return {
		ok: false,
		reason: "server clearance manifest is unsigned"
	};
	const signer = findSigner(manifest.signerKeyId);
	if (!signer) return {
		ok: false,
		reason: `server clearance signer "${manifest.signerKeyId}" not in trust root`
	};
	if (signer.notAfter && Number.isFinite(Date.parse(signer.notAfter)) && Date.parse(signer.notAfter) < Date.now()) return {
		ok: false,
		reason: `server clearance signer "${signer.keyId}" expired (${signer.notAfter})`
	};
	if (!signer.approvedClearance.includes(manifest.clearance)) return {
		ok: false,
		reason: `signer "${signer.keyId}" not approved for clearance "${manifest.clearance}"`
	};
	if (!verifyManifestSignature(canonicalManifestBytes(manifest), manifest.signature, signer.publicKeyPem)) return {
		ok: false,
		reason: "server clearance signature verification failed"
	};
	if (!meetsClearance(manifest.clearance, required)) return {
		ok: false,
		reason: `server clearance "${manifest.clearance}" below required "${required}"`
	};
	if (manifest.netAllowedHosts && manifest.netAllowedHosts.length > 0) {
		let host = "";
		let hostname = "";
		try {
			const u = new URL(base);
			host = u.host;
			hostname = u.hostname;
		} catch {
			return {
				ok: false,
				reason: `server clearance: cannot parse server URL "${base}"`
			};
		}
		if (!manifest.netAllowedHosts.some((h) => h === host || h === hostname)) return {
			ok: false,
			reason: `server clearance not valid for host "${hostname}" (bound to: ${manifest.netAllowedHosts.join(", ")})`
		};
	}
	return {
		ok: true,
		clearance: manifest.clearance,
		signerKeyId: signer.keyId
	};
}
//#endregion
//#region extensions/mcp-attested/src/client.ts
var QClearedMcpClient = class {
	constructor(opts = {}) {
		this.opts = opts;
	}
	get required() {
		return this.opts.requiredClearance ?? "restricted-plus";
	}
	async connect(serverUrl) {
		const rt = getRuntime();
		const flavor = rt?.flavor ?? "open";
		const override = this.opts.override;
		if (this.opts.skipClearancePreflight && !override) {
			if (rt) rt.audit.append({
				type: "mcp.connect.allow",
				actor: "mcp-attested",
				level: this.required,
				payload: {
					serverUrl,
					signerKeyId: "bridge-admitted"
				}
			}).catch(() => {});
			return { ok: true };
		}
		const result = override ? override.ok ? {
			ok: true,
			clearance: this.required,
			signerKeyId: "override"
		} : {
			ok: false,
			reason: override.reason ?? "override deny"
		} : await verifyServerClearance(serverUrl, this.required);
		if (!result.ok) {
			const reason = `MCP server ${serverUrl}: ${result.reason}`;
			if (rt) rt.audit.append({
				type: flavor === "enclaved" ? "mcp.connect.deny" : "mcp.connect.warn",
				actor: "mcp-attested",
				level: this.required,
				payload: {
					serverUrl,
					reason: result.reason
				}
			}).catch(() => {});
			if (flavor === "enclaved") return {
				ok: false,
				reason
			};
			return {
				ok: false,
				reason: `${reason} (open flavor: warn-only)`
			};
		}
		if (rt) rt.audit.append({
			type: "mcp.connect.allow",
			actor: "mcp-attested",
			level: result.clearance,
			payload: {
				serverUrl,
				signerKeyId: result.signerKeyId
			}
		}).catch(() => {});
		return { ok: true };
	}
	async invoke(call) {
		const bridge = getServerByEndpoint(call.serverUrl);
		if (bridge) {
			if (!isToolAdmitted(bridge, call.toolName)) {
				const rt = getRuntime();
				if (rt) rt.audit.append({
					type: "mcp.tool.deny",
					actor: "mcp-attested",
					level: bridge.requiredClearance,
					payload: {
						serverUrl: call.serverUrl,
						bridge: bridge.bridge,
						toolName: call.toolName,
						reason: "tool not in bridge allowedTools"
					}
				}).catch(() => {});
				return {
					ok: false,
					reason: `tool "${call.toolName}" not admitted by bridge "${bridge.bridge}" (allowed: ${bridge.allowedTools.join(", ")})`
				};
			}
			const c = await this.connect(call.serverUrl);
			if (!c.ok) return {
				ok: false,
				reason: c.reason
			};
			const rpc = await bridge.transport.call("tools/call", {
				name: call.toolName,
				arguments: call.arguments
			});
			if (!rpc.ok) return {
				ok: false,
				reason: rpc.reason
			};
			return {
				ok: true,
				output: rpc.result
			};
		}
		const c = await this.connect(call.serverUrl);
		if (!c.ok) return {
			ok: false,
			reason: c.reason
		};
		return {
			ok: false,
			reason: "no registered bridge for this serverUrl; load a bundled bridge (mcp-google-workspace, mcp-github, …) or register a custom one via mcp-attested/server-registry"
		};
	}
};
//#endregion
//#region extensions/mcp-attested/src/http-transport.ts
let nextRpcId = 1;
function rpcId() {
	return `enclawed-mcp-${nextRpcId++}`;
}
var HttpJsonRpcTransport = class {
	constructor(opts) {
		if (!opts.endpoint || typeof opts.endpoint !== "string") throw new TypeError("HttpJsonRpcTransport: endpoint is required");
		if (!/^https?:\/\//i.test(opts.endpoint)) throw new TypeError(`HttpJsonRpcTransport: endpoint must be http(s):// (got "${opts.endpoint}")`);
		this.endpoint = opts.endpoint;
		this.authProvider = opts.authProvider;
		this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
		this.timeoutMs = opts.timeoutMs ?? 3e4;
	}
	async call(method, params) {
		let bearer;
		if (this.authProvider) {
			try {
				bearer = await this.authProvider();
			} catch (e) {
				return {
					ok: false,
					reason: `auth provider failed: ${e.message}`
				};
			}
			if (!bearer || typeof bearer !== "string") return {
				ok: false,
				reason: "auth provider returned an empty token"
			};
		}
		const headers = {
			"Content-Type": "application/json",
			Accept: "application/json"
		};
		if (bearer) headers.Authorization = `Bearer ${bearer}`;
		const body = JSON.stringify({
			jsonrpc: "2.0",
			id: rpcId(),
			method,
			params
		});
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		let res;
		try {
			res = await this.fetchImpl(this.endpoint, {
				method: "POST",
				headers,
				body,
				signal: controller.signal
			});
		} catch (e) {
			clearTimeout(timer);
			return {
				ok: false,
				reason: `http transport failed: ${e.message}`
			};
		}
		clearTimeout(timer);
		if (!res.ok) {
			let snippet = "";
			try {
				const text = await res.text();
				snippet = text.length > 512 ? `${text.slice(0, 512)}…` : text;
			} catch {}
			return {
				ok: false,
				status: res.status,
				reason: `http ${res.status}${snippet ? `: ${snippet}` : ""}`
			};
		}
		let payload;
		try {
			payload = await res.json();
		} catch (e) {
			return {
				ok: false,
				reason: `non-JSON response: ${e.message}`
			};
		}
		if (!payload || typeof payload !== "object") return {
			ok: false,
			reason: "json-rpc payload is not an object"
		};
		const env = payload;
		if ("error" in env && env.error) {
			const err = env.error;
			const msg = typeof err.message === "string" ? err.message : "unknown rpc error";
			return {
				ok: false,
				reason: `json-rpc error${typeof err.code === "number" ? ` (code ${err.code})` : ""}: ${msg}`
			};
		}
		return {
			ok: true,
			result: env.result
		};
	}
};
//#endregion
//#region extensions/mcp-attested/src/oauth-google.ts
const GOOGLE_OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
function read(env, key) {
	const enclawed = env[`ENCLAWED_${key}`];
	if (enclawed && enclawed.length > 0) return enclawed;
	const legacy = env[`OPENCLAW_${key}`];
	if (legacy && legacy.length > 0) return legacy;
}
var GoogleOAuthProvider = class {
	constructor(opts = {}) {
		this.env = opts.env ?? process.env;
		this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
		this.now = opts.now ?? Date.now;
	}
	/**
	* Resolve a fresh access token. Throws if no auth material is configured.
	* Cache window: 60s before declared expiry, to absorb clock skew.
	*/
	async getToken() {
		const direct = read(this.env, "GOOGLE_OAUTH_TOKEN");
		if (direct) return direct;
		const clientId = read(this.env, "GOOGLE_OAUTH_CLIENT_ID");
		const clientSecret = read(this.env, "GOOGLE_OAUTH_CLIENT_SECRET");
		const refresh = read(this.env, "GOOGLE_OAUTH_REFRESH_TOKEN");
		if (!clientId || !clientSecret || !refresh) throw new Error("Google OAuth not configured: set ENCLAWED_GOOGLE_OAUTH_TOKEN, OR set ENCLAWED_GOOGLE_OAUTH_CLIENT_ID + ENCLAWED_GOOGLE_OAUTH_CLIENT_SECRET + ENCLAWED_GOOGLE_OAUTH_REFRESH_TOKEN.");
		const now = this.now();
		if (this.cached && this.cached.expiresAt - 6e4 > now) return this.cached.token;
		const endpoint = read(this.env, "GOOGLE_OAUTH_TOKEN_ENDPOINT") ?? GOOGLE_OAUTH_TOKEN_ENDPOINT;
		const body = new URLSearchParams({
			grant_type: "refresh_token",
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refresh
		});
		const res = await this.fetchImpl(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString()
		});
		if (!res.ok) {
			let snippet = "";
			try {
				snippet = (await res.text()).slice(0, 256);
			} catch {}
			throw new Error(`Google OAuth refresh failed: HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`);
		}
		const payload = await res.json();
		const token = typeof payload.access_token === "string" ? payload.access_token : "";
		if (!token) throw new Error("Google OAuth refresh: response missing access_token");
		this.cached = {
			token,
			expiresAt: now + (typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 3300) * 1e3
		};
		return token;
	}
	/** Clear the in-memory access-token cache (test helper / token rotation). */
	invalidate() {
		this.cached = void 0;
	}
	/**
	* Returns true iff the env contains enough material to acquire a token.
	* Useful for bridge load paths that want to fail fast with a clear message.
	*/
	isConfigured() {
		if (read(this.env, "GOOGLE_OAUTH_TOKEN")) return true;
		return Boolean(read(this.env, "GOOGLE_OAUTH_CLIENT_ID") && read(this.env, "GOOGLE_OAUTH_CLIENT_SECRET") && read(this.env, "GOOGLE_OAUTH_REFRESH_TOKEN"));
	}
};
//#endregion
export { HttpJsonRpcTransport as n, QClearedMcpClient as r, GoogleOAuthProvider as t };
