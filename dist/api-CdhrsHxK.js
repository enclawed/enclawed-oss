import { i as formatErrorMessage } from "./errors-D8p6rxH8.js";
import { i as normalizeLowercaseStringOrEmpty } from "./string-coerce-BUSzWgUA.js";
import { g as resolveUserPath } from "./utils-BcQ7uNrT.js";
import { n as fetchWithSsrFGuard } from "./fetch-guard-p1TvidUH.js";
import "./error-runtime-BgFs31oW.js";
import { n as buildHostnameAllowlistPolicyFromSuffixAllowlist } from "./ssrf-policy-CMIBjC1W.js";
import "./ssrf-runtime--F8sIg90.js";
import "./text-runtime-a81Cxtqz.js";
import "./runtime-api-DBZuwxCb.js";
import fs from "node:fs/promises";
import crypto from "node:crypto";
//#region extensions/googlechat/src/google-auth.runtime.ts
const GOOGLE_AUTH_POLICY = buildHostnameAllowlistPolicyFromSuffixAllowlist(["accounts.google.com", "googleapis.com"]);
const GOOGLE_AUTH_AUDIT_CONTEXT = "googlechat.auth.google-auth";
const GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/auth";
const GOOGLE_AUTH_PROVIDER_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs";
const GOOGLE_AUTH_TOKEN_URI = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_UNIVERSE_DOMAIN = "googleapis.com";
const GOOGLE_CLIENT_CERTS_URL_PREFIX = "https://www.googleapis.com/robot/v1/metadata/x509/";
const MAX_GOOGLE_AUTH_RESPONSE_BYTES = 1024 * 1024;
const MAX_GOOGLE_CHAT_SERVICE_ACCOUNT_FILE_BYTES = 64 * 1024;
function asNullableObjectRecord(value) {
	return value !== null && typeof value === "object" ? value : null;
}
function hasProxyAgentShape(value) {
	const record = asNullableObjectRecord(value);
	return record !== null && record.proxy instanceof URL;
}
function hasTlsAgentShape(value) {
	const record = asNullableObjectRecord(value);
	return record !== null && asNullableObjectRecord(record.options) !== null;
}
function resolveGoogleAuthAgent(init, url) {
	return typeof init.agent === "function" ? init.agent(url) : init.agent;
}
function hasTlsOptions(options) {
	return options.cert !== void 0 || options.key !== void 0;
}
function resolveGoogleAuthTlsOptions(init, url) {
	const explicit = {
		cert: init.cert,
		key: init.key
	};
	if (hasTlsOptions(explicit)) return explicit;
	const agent = resolveGoogleAuthAgent(init, url);
	if (hasProxyAgentShape(agent)) return {
		cert: agent.connectOpts?.cert,
		key: agent.connectOpts?.key
	};
	if (hasTlsAgentShape(agent)) return {
		cert: agent.options?.cert,
		key: agent.options?.key
	};
	return {};
}
function normalizeGoogleAuthProxyEnvValue(value) {
	if (typeof value !== "string") return;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}
function resolveGoogleAuthEnvProxyUrl(protocol) {
	const httpProxy = normalizeGoogleAuthProxyEnvValue(process.env.HTTP_PROXY) ?? normalizeGoogleAuthProxyEnvValue(process.env.http_proxy);
	const httpsProxy = normalizeGoogleAuthProxyEnvValue(process.env.HTTPS_PROXY) ?? normalizeGoogleAuthProxyEnvValue(process.env.https_proxy);
	if (protocol === "https") return httpsProxy ?? httpProxy ?? void 0;
	return httpProxy ?? void 0;
}
function collectGoogleAuthNoProxyRules(noProxy = []) {
	const rules = [...noProxy];
	const envRules = (process.env.NO_PROXY ?? process.env.no_proxy)?.split(",") ?? [];
	for (const rule of envRules) {
		const trimmed = rule.trim();
		if (trimmed.length > 0) rules.push(trimmed);
	}
	return rules;
}
function shouldBypassGoogleAuthProxy(url, noProxy = []) {
	for (const rule of collectGoogleAuthNoProxyRules(noProxy)) {
		if (rule instanceof RegExp) {
			if (rule.test(url.toString())) return true;
			continue;
		}
		if (rule instanceof URL) {
			if (rule.origin === url.origin) return true;
			continue;
		}
		if (rule.startsWith("*.") || rule.startsWith(".")) {
			const cleanedRule = rule.replace(/^\*\./, ".");
			if (url.hostname.endsWith(cleanedRule)) return true;
			continue;
		}
		if (rule === url.origin || rule === url.hostname || rule === url.href) return true;
	}
	return false;
}
function readGoogleAuthProxyUrl(value) {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : void 0;
	}
	if (value instanceof URL) return value.toString();
}
function readOptionalTrimmedString(record, fieldName) {
	const value = record[fieldName];
	if (value === void 0 || value === null) return;
	if (typeof value !== "string") throw new Error(`Google Chat service account field "${fieldName}" must be a string`);
	const trimmed = value.trim();
	if (!trimmed) throw new Error(`Google Chat service account field "${fieldName}" cannot be empty`);
	return trimmed;
}
function readRequiredTrimmedString(record, fieldName) {
	return readOptionalTrimmedString(record, fieldName) ?? (() => {
		throw new Error(`Google Chat service account is missing "${fieldName}"`);
	})();
}
function assertExactUrlField(record, fieldName, expectedUrl) {
	const value = readOptionalTrimmedString(record, fieldName);
	if (!value) return;
	if (value !== expectedUrl) throw new Error(`Google Chat service account field "${fieldName}" must be ${expectedUrl}, got ${value}`);
}
function assertUrlPrefixField(record, fieldName, expectedPrefix) {
	const value = readOptionalTrimmedString(record, fieldName);
	if (!value) return;
	if (!value.startsWith(expectedPrefix)) throw new Error(`Google Chat service account field "${fieldName}" must start with ${expectedPrefix}, got ${value}`);
}
function validateGoogleChatServiceAccountCredentials(credentials) {
	const type = readOptionalTrimmedString(credentials, "type");
	if (type && type !== "service_account") throw new Error(`Google Chat credentials must use service_account auth, got "${type}" instead`);
	readRequiredTrimmedString(credentials, "client_email");
	readRequiredTrimmedString(credentials, "private_key");
	const universeDomain = readOptionalTrimmedString(credentials, "universe_domain");
	if (universeDomain && universeDomain !== GOOGLE_AUTH_UNIVERSE_DOMAIN) throw new Error(`Google Chat service account field "universe_domain" must be ${GOOGLE_AUTH_UNIVERSE_DOMAIN}, got ${universeDomain}`);
	assertExactUrlField(credentials, "auth_uri", GOOGLE_AUTH_URI);
	assertExactUrlField(credentials, "auth_provider_x509_cert_url", GOOGLE_AUTH_PROVIDER_CERTS_URL);
	assertExactUrlField(credentials, "token_uri", GOOGLE_AUTH_TOKEN_URI);
	assertUrlPrefixField(credentials, "client_x509_cert_url", GOOGLE_CLIENT_CERTS_URL_PREFIX);
	return credentials;
}
async function readCredentialsFile(filePath) {
	const resolvedPath = resolveUserPath(filePath);
	if (!resolvedPath) throw new Error("Google Chat service account file path is empty");
	let handle = null;
	try {
		handle = await fs.open(resolvedPath, "r");
	} catch {
		throw new Error("Failed to load Google Chat service account file.");
	}
	try {
		const stat = await handle.stat();
		if (!stat.isFile()) throw new Error("Google Chat service account file must be a regular file.");
		if (stat.size > MAX_GOOGLE_CHAT_SERVICE_ACCOUNT_FILE_BYTES) throw new Error(`Google Chat service account file exceeds ${MAX_GOOGLE_CHAT_SERVICE_ACCOUNT_FILE_BYTES} bytes.`);
		let raw;
		try {
			raw = await handle.readFile({ encoding: "utf8" });
		} catch {
			throw new Error("Failed to load Google Chat service account file.");
		}
		if (Buffer.byteLength(raw, "utf8") > MAX_GOOGLE_CHAT_SERVICE_ACCOUNT_FILE_BYTES) throw new Error(`Google Chat service account file exceeds ${MAX_GOOGLE_CHAT_SERVICE_ACCOUNT_FILE_BYTES} bytes.`);
		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new Error("Invalid Google Chat service account JSON.");
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Google Chat service account file must contain a JSON object.");
		return parsed;
	} finally {
		await handle.close().catch(() => {});
	}
}
function sanitizeGoogleAuthInit(init) {
	if (!init) return;
	const nextInit = { ...init };
	delete nextInit.agent;
	delete nextInit.cert;
	delete nextInit.dispatcher;
	delete nextInit.fetchImplementation;
	delete nextInit.key;
	delete nextInit.noProxy;
	delete nextInit.proxy;
	return nextInit;
}
function resolveGoogleAuthDispatcherPolicy(input, init) {
	const requestUrl = input instanceof Request ? new URL(input.url) : new URL(typeof input === "string" ? input : input.toString());
	const nextInit = sanitizeGoogleAuthInit(init);
	const googleAuthInit = init ?? {};
	const tlsOptions = resolveGoogleAuthTlsOptions(googleAuthInit, requestUrl);
	const proxyBypassed = shouldBypassGoogleAuthProxy(requestUrl, Array.isArray(googleAuthInit.noProxy) ? googleAuthInit.noProxy : []);
	const agent = resolveGoogleAuthAgent(googleAuthInit, requestUrl);
	const explicitProxy = readGoogleAuthProxyUrl(googleAuthInit.proxy) ?? (hasProxyAgentShape(agent) ? agent.proxy.toString() : void 0);
	if (!proxyBypassed && explicitProxy) return {
		dispatcherPolicy: {
			allowPrivateProxy: true,
			mode: "explicit-proxy",
			...hasTlsOptions(tlsOptions) ? { proxyTls: { ...tlsOptions } } : {},
			proxyUrl: explicitProxy
		},
		init: nextInit
	};
	if (proxyBypassed ? void 0 : resolveGoogleAuthEnvProxyUrl(requestUrl.protocol === "http:" ? "http" : "https")) return {
		dispatcherPolicy: {
			mode: "env-proxy",
			...hasTlsOptions(tlsOptions) ? { proxyTls: { ...tlsOptions } } : {}
		},
		init: nextInit
	};
	if (hasTlsOptions(tlsOptions)) return {
		dispatcherPolicy: {
			connect: { ...tlsOptions },
			mode: "direct"
		},
		init: nextInit
	};
	return { init: nextInit };
}
function createGoogleAuthFetch(baseFetch) {
	return async (input, init) => {
		const url = input instanceof Request ? input.url : String(input);
		const guardedOptions = resolveGoogleAuthDispatcherPolicy(input, init);
		const { response, release } = await fetchWithSsrFGuard({
			auditContext: GOOGLE_AUTH_AUDIT_CONTEXT,
			dispatcherPolicy: guardedOptions.dispatcherPolicy,
			init: guardedOptions.init,
			policy: GOOGLE_AUTH_POLICY,
			url,
			...baseFetch ? { fetchImpl: baseFetch } : {}
		});
		try {
			const body = await readGoogleAuthResponseBytes(response);
			const bufferedBody = Uint8Array.from(body);
			return new Response(bufferedBody.buffer, {
				headers: response.headers,
				status: response.status,
				statusText: response.statusText
			});
		} finally {
			await release();
		}
	};
}
async function readGoogleAuthResponseBytes(response) {
	const contentLengthHeader = response.headers.get("content-length");
	if (contentLengthHeader) {
		const contentLength = Number(contentLengthHeader);
		if (Number.isFinite(contentLength) && contentLength > MAX_GOOGLE_AUTH_RESPONSE_BYTES) throw new Error(`Google auth response exceeds ${MAX_GOOGLE_AUTH_RESPONSE_BYTES} bytes.`);
	}
	const reader = response.body?.getReader();
	if (!reader) throw new Error("Google auth response body stream unavailable; refusing to buffer unbounded response.");
	const chunks = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > MAX_GOOGLE_AUTH_RESPONSE_BYTES) {
				try {
					await reader.cancel("Google auth response exceeded buffer limit");
				} catch {}
				throw new Error(`Google auth response exceeds ${MAX_GOOGLE_AUTH_RESPONSE_BYTES} bytes.`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}
async function resolveValidatedGoogleChatCredentials(account) {
	if (account.credentials) return validateGoogleChatServiceAccountCredentials(account.credentials);
	if (account.credentialsFile) return validateGoogleChatServiceAccountCredentials(await readCredentialsFile(account.credentialsFile));
	return null;
}
/** Google ID tokens are ~1 KiB; anything this large is not a token we issue or accept. */
const MAX_JWT_LENGTH = 16 * 1024;
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;
function base64UrlEncode(value) {
	return Buffer.from(value).toString("base64url");
}
function decodeSegment(segment, label) {
	if (!BASE64URL_SEGMENT.test(segment)) throw new Error(`Malformed token ${label} segment`);
	const decoded = Buffer.from(segment, "base64url");
	if (decoded.toString("base64url") !== segment) throw new Error(`Malformed token ${label} segment`);
	return decoded;
}
function decodeJsonObject(segment, label) {
	const raw = decodeSegment(segment, label).toString("utf8");
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`Can't parse token ${label}`);
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`Can't parse token ${label}`);
	return parsed;
}
function readNumericDate(payload, field) {
	const value = payload[field];
	if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} field using invalid format`);
	return value;
}
function loadRsaPublicKey(certOrKey) {
	let key;
	try {
		key = crypto.createPublicKey(certOrKey);
	} catch {
		throw new Error("Invalid verification certificate");
	}
	if (key.asymmetricKeyType !== "rsa") throw new Error("Verification certificate is not an RSA key");
	return key;
}
/**
* Verify a Google-signed RS256 JWT against a `kid -> PEM certificate` map.
* Throws on every failure; never returns an unverified payload. Error messages
* never echo the token itself.
*/
function verifyGoogleSignedJwt(params) {
	const { jwt, certs, audience, issuers } = params;
	if (typeof jwt !== "string" || jwt.length === 0 || jwt.length > MAX_JWT_LENGTH) throw new Error("Malformed token");
	if (typeof audience !== "string" || audience.length === 0) throw new Error("Missing required audience");
	if (issuers.length === 0) throw new Error("Missing allowed issuers");
	const segments = jwt.split(".");
	if (segments.length !== 3) throw new Error("Wrong number of segments in token");
	const [headerSegment, payloadSegment, signatureSegment] = segments;
	const header = decodeJsonObject(headerSegment, "envelope");
	const payload = decodeJsonObject(payloadSegment, "payload");
	const signature = decodeSegment(signatureSegment, "signature");
	if (header.alg !== "RS256") throw new Error(`Unsupported token algorithm: ${String(header.alg).slice(0, 32)}`);
	if (Object.prototype.hasOwnProperty.call(header, "crit")) throw new Error("Unsupported critical token header");
	const kid = header.kid;
	if (typeof kid !== "string" || kid.length === 0) throw new Error("Token envelope has no key id");
	if (!Object.prototype.hasOwnProperty.call(certs, kid)) throw new Error("No pem found for envelope");
	const cert = certs[kid];
	if (typeof cert !== "string" || cert.length === 0) throw new Error("No pem found for envelope");
	const publicKey = loadRsaPublicKey(cert);
	if (!crypto.verify("sha256", Buffer.from(`${headerSegment}.${payloadSegment}`, "utf8"), {
		key: publicKey,
		padding: crypto.constants.RSA_PKCS1_PADDING
	}, signature)) throw new Error("Invalid token signature");
	if (payload.iat === void 0 || payload.iat === null || payload.iat === 0) throw new Error("No issue time in token");
	if (payload.exp === void 0 || payload.exp === null || payload.exp === 0) throw new Error("No expiration time in token");
	const iat = readNumericDate(payload, "iat");
	const exp = readNumericDate(payload, "exp");
	const now = (params.nowMs ?? Date.now()) / 1e3;
	if (exp >= now + 86400) throw new Error("Expiration time too far in future");
	if (now < iat - 300) throw new Error("Token used too early");
	if (now > exp + 300) throw new Error("Token used too late");
	if (payload.nbf !== void 0) {
		if (now < readNumericDate(payload, "nbf") - 300) throw new Error("Token used too early");
	}
	if (typeof payload.iss !== "string" || !issuers.includes(payload.iss)) throw new Error(`Invalid issuer, expected one of [${issuers.join(",")}]`);
	if (typeof payload.aud !== "string" || payload.aud !== audience) throw new Error("Wrong recipient, payload audience != requiredAudience");
	return {
		header,
		payload
	};
}
/**
* Build the RFC 7523 JWT-bearer assertion Google's token endpoint expects from
* a service account: RS256 over `{iss, scope, aud, exp, iat}` with a one-hour
* lifetime, the same claims and header gtoken produced.
*/
function createServiceAccountAssertion(params) {
	let key;
	try {
		key = crypto.createPrivateKey(params.privateKey);
	} catch {
		throw new Error("Google Chat service account private_key is not a valid private key");
	}
	if (key.asymmetricKeyType !== "rsa") throw new Error("Google Chat service account private_key must be an RSA key");
	const iat = Math.floor((params.nowMs ?? Date.now()) / 1e3);
	const signingInput = `${base64UrlEncode(JSON.stringify({ alg: "RS256" }))}.${base64UrlEncode(JSON.stringify({
		iss: params.clientEmail,
		scope: params.scope,
		aud: params.audience,
		exp: iat + 3600,
		iat
	}))}`;
	return `${signingInput}.${base64UrlEncode(crypto.sign("sha256", Buffer.from(signingInput, "utf8"), {
		key,
		padding: crypto.constants.RSA_PKCS1_PADDING
	}))}`;
}
//#endregion
//#region extensions/googlechat/src/google-auth-client.ts
const JWT_BEARER_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";
/** google-auth-library DEFAULT_EAGER_REFRESH_THRESHOLD_MILLIS. */
const EAGER_REFRESH_THRESHOLD_MS = 300 * 1e3;
/** gaxios retry defaults: 3 status retries, 2 no-response retries. */
const MAX_STATUS_RETRIES = 3;
const MAX_NO_RESPONSE_RETRIES = 2;
const RETRYABLE_STATUS_RANGES = [
	[100, 199],
	[408, 408],
	[429, 429],
	[500, 599]
];
const defaultSleep = async (ms) => {
	await new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
};
let sleep = defaultSleep;
const googleAuthFetch = createGoogleAuthFetch();
let federatedCertsCache = null;
/** Non-JSON body on a 2xx response: deterministic, so never retried. */
var GoogleAuthResponseFormatError = class extends Error {
	constructor() {
		super("Google auth response is not valid JSON");
		this.name = "GoogleAuthResponseFormatError";
	}
};
var GoogleAuthHttpError = class extends Error {
	constructor(message, status) {
		super(message);
		this.name = "GoogleAuthHttpError";
		this.status = status;
	}
};
/**
* Proxy precedence gaxios applied before handing the request to our guarded
* fetch (HTTPS_PROXY, https_proxy, HTTP_PROXY, http_proxy; first non-empty).
* Passing it as `proxy` keeps the guard's explicit-proxy policy and NO_PROXY
* bypass identical to the previous gaxios-driven path.
*/
function resolveGaxiosStyleProxyUrl() {
	for (const name of [
		"HTTPS_PROXY",
		"https_proxy",
		"HTTP_PROXY",
		"http_proxy"
	]) {
		const value = process.env[name];
		if (typeof value === "string" && value.length > 0) return value;
	}
}
function isRetryableStatus(status) {
	return RETRYABLE_STATUS_RANGES.some(([min, max]) => status >= min && status <= max);
}
/** gaxios getNextRetryDelay with retryDelay=100 and multiplier=2. */
function retryDelayMs(attempt) {
	return (attempt === 0 ? 100 : 0) + (2 ** attempt - 1) / 2 * 1e3;
}
function describeGoogleAuthError(data, status) {
	if (data !== null && typeof data === "object" && !Array.isArray(data)) {
		const record = data;
		if (typeof record.error === "string") {
			const description = typeof record.error_description === "string" ? record.error_description : "";
			return `${record.error}: ${description}`;
		}
	}
	return `Google auth request failed with status ${status}`;
}
async function sendOnce(url, init) {
	const response = await googleAuthFetch(url, init);
	const text = await response.text();
	let data;
	try {
		data = text.length > 0 ? JSON.parse(text) : void 0;
	} catch {
		data = void 0;
	}
	if (response.status < 200 || response.status >= 300) throw new GoogleAuthHttpError(describeGoogleAuthError(data, response.status), response.status);
	if (data === void 0) throw new GoogleAuthResponseFormatError();
	return {
		data,
		headers: response.headers
	};
}
async function requestGoogleAuthJson(params) {
	const headers = { accept: "application/json" };
	if (params.body) headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
	const proxy = resolveGaxiosStyleProxyUrl();
	const init = {
		method: params.method,
		headers,
		...params.body ? { body: params.body.toString() } : {},
		...proxy ? { proxy } : {}
	};
	for (let attempt = 0;; attempt += 1) try {
		return await sendOnce(params.url, init);
	} catch (error) {
		if (!(error instanceof GoogleAuthHttpError ? isRetryableStatus(error.status) && attempt < MAX_STATUS_RETRIES : !(error instanceof GoogleAuthResponseFormatError) && attempt < MAX_NO_RESPONSE_RETRIES)) throw error;
		await sleep(retryDelayMs(attempt));
	}
}
/**
* Service-account access tokens via the RFC 7523 JWT-bearer grant, cached
* until five minutes before expiry (OAuth2Client semantics). Concurrent
* callers share one in-flight grant.
*/
var GoogleServiceAccountTokenClient = class {
	#clientEmail;
	#privateKey;
	#scope;
	#cached = null;
	#inFlight = null;
	constructor(credentials, scopes) {
		this.#clientEmail = credentials.client_email.trim();
		this.#privateKey = credentials.private_key;
		this.#scope = scopes.join(" ");
	}
	async getAccessToken() {
		const cached = this.#cached;
		if (cached && cached.expiresAtMs > Date.now() + EAGER_REFRESH_THRESHOLD_MS) return cached.accessToken;
		if (!this.#inFlight) this.#inFlight = this.#refresh().finally(() => {
			this.#inFlight = null;
		});
		return await this.#inFlight;
	}
	async #refresh() {
		const assertion = createServiceAccountAssertion({
			clientEmail: this.#clientEmail,
			privateKey: this.#privateKey,
			scope: this.#scope,
			audience: GOOGLE_AUTH_TOKEN_URI
		});
		const { data } = await requestGoogleAuthJson({
			url: GOOGLE_AUTH_TOKEN_URI,
			method: "POST",
			body: new URLSearchParams({
				grant_type: JWT_BEARER_GRANT_TYPE,
				assertion
			})
		});
		const record = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
		const accessToken = record.access_token;
		if (typeof accessToken !== "string" || accessToken.length === 0) throw new Error("Could not refresh access token.");
		const expiresIn = typeof record.expires_in === "number" && Number.isFinite(record.expires_in) && record.expires_in > 0 ? record.expires_in : 0;
		this.#cached = {
			accessToken,
			expiresAtMs: Date.now() + expiresIn * 1e3
		};
		return accessToken;
	}
};
function parseCacheControlMaxAgeMs(cacheControl) {
	if (!cacheControl) return null;
	const match = /max-age=([0-9]+)/.exec(cacheControl);
	return match ? Number(match[1]) * 1e3 : null;
}
function parsePemCertMap(data) {
	if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("Verification certificates response is not an object");
	const certs = {};
	for (const [kid, cert] of Object.entries(data)) {
		if (typeof cert !== "string" || cert.length === 0) throw new Error("Verification certificates response has a non-string entry");
		certs[kid] = cert;
	}
	if (Object.keys(certs).length === 0) throw new Error("Verification certificates response is empty");
	return certs;
}
/**
* Google's OAuth2 federated sign-on PEM certificates (the v1 endpoint
* OAuth2Client.verifyIdToken uses under Node), cached for the response's
* Cache-Control max-age and not cached when the header carries none.
*/
async function fetchGoogleFederatedSignonCerts() {
	const now = Date.now();
	if (federatedCertsCache && now < federatedCertsCache.expiresAtMs) return federatedCertsCache.certs;
	let response;
	try {
		response = await requestGoogleAuthJson({
			url: GOOGLE_AUTH_PROVIDER_CERTS_URL,
			method: "GET"
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to retrieve verification certificates: ${message}`, { cause: error });
	}
	const certs = parsePemCertMap(response.data);
	const maxAgeMs = parseCacheControlMaxAgeMs(response.headers.get("cache-control"));
	federatedCertsCache = maxAgeMs === null ? null : {
		certs,
		expiresAtMs: now + maxAgeMs
	};
	return certs;
}
//#endregion
//#region extensions/googlechat/src/auth.ts
const CHAT_SCOPE = "https://www.googleapis.com/auth/chat.bot";
const CHAT_ISSUER = "chat@system.gserviceaccount.com";
const ADDON_ISSUER_PATTERN = /^service-\d+@gcp-sa-gsuiteaddons\.iam\.gserviceaccount\.com$/;
const CHAT_CERTS_URL = "https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com";
const GOOGLE_ID_TOKEN_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const MAX_AUTH_CACHE_SIZE = 32;
const authCache = /* @__PURE__ */ new Map();
let cachedCerts = null;
function buildAuthKey(account) {
	if (account.credentialsFile) return `file:${account.credentialsFile}`;
	if (account.credentials) return `inline:${JSON.stringify(account.credentials)}`;
	return "none";
}
async function getAuthInstance(account) {
	const key = buildAuthKey(account);
	const cached = authCache.get(account.accountId);
	if (cached && cached.key === key) return cached.auth;
	const credentials = await resolveValidatedGoogleChatCredentials(account);
	if (!credentials) throw new Error("Google Chat credentials are missing.");
	const evictOldest = () => {
		if (authCache.size > MAX_AUTH_CACHE_SIZE) {
			const oldest = authCache.keys().next().value;
			if (oldest !== void 0) authCache.delete(oldest);
		}
	};
	const auth = new GoogleServiceAccountTokenClient(credentials, [CHAT_SCOPE]);
	authCache.set(account.accountId, {
		key,
		auth
	});
	evictOldest();
	return auth;
}
async function getGoogleChatAccessToken(account) {
	const token = await (await getAuthInstance(account)).getAccessToken();
	if (!token) throw new Error("Missing Google Chat access token");
	return token;
}
async function fetchChatCerts() {
	const now = Date.now();
	if (cachedCerts && now - cachedCerts.fetchedAt < 600 * 1e3) return cachedCerts.certs;
	const { response, release } = await fetchWithSsrFGuard({
		url: CHAT_CERTS_URL,
		auditContext: "googlechat.auth.certs"
	});
	try {
		if (!response.ok) throw new Error(`Failed to fetch Chat certs (${response.status})`);
		const certs = parsePemCertMap(await response.json());
		cachedCerts = {
			fetchedAt: now,
			certs
		};
		return certs;
	} finally {
		await release();
	}
}
async function verifyGoogleChatRequest(params) {
	const bearer = params.bearer?.trim();
	if (!bearer) return {
		ok: false,
		reason: "missing token"
	};
	const audience = params.audience?.trim();
	if (!audience) return {
		ok: false,
		reason: "missing audience"
	};
	const audienceType = params.audienceType ?? null;
	if (audienceType === "app-url") try {
		const { payload } = verifyGoogleSignedJwt({
			jwt: bearer,
			certs: await fetchGoogleFederatedSignonCerts(),
			audience,
			issuers: GOOGLE_ID_TOKEN_ISSUERS
		});
		const email = normalizeLowercaseStringOrEmpty(typeof payload.email === "string" ? payload.email : "");
		if (payload.email_verified !== true) return {
			ok: false,
			reason: "email not verified"
		};
		if (email === CHAT_ISSUER) return { ok: true };
		if (!ADDON_ISSUER_PATTERN.test(email)) return {
			ok: false,
			reason: `invalid issuer: ${email}`
		};
		const expectedAddOnPrincipal = normalizeLowercaseStringOrEmpty(params.expectedAddOnPrincipal ?? "");
		if (!expectedAddOnPrincipal) return {
			ok: false,
			reason: "missing add-on principal binding"
		};
		const tokenPrincipal = normalizeLowercaseStringOrEmpty(typeof payload.sub === "string" ? payload.sub : "");
		if (!tokenPrincipal || tokenPrincipal !== expectedAddOnPrincipal) return {
			ok: false,
			reason: `unexpected add-on principal: ${tokenPrincipal || "<missing>"}`
		};
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			reason: err instanceof Error ? err.message : "invalid token"
		};
	}
	if (audienceType === "project-number") try {
		verifyGoogleSignedJwt({
			jwt: bearer,
			certs: await fetchChatCerts(),
			audience,
			issuers: [CHAT_ISSUER]
		});
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			reason: err instanceof Error ? err.message : "invalid token"
		};
	}
	return {
		ok: false,
		reason: "unsupported audience type"
	};
}
//#endregion
//#region extensions/googlechat/src/api.ts
const CHAT_API_BASE = "https://chat.googleapis.com/v1";
const CHAT_UPLOAD_BASE = "https://chat.googleapis.com/upload/v1";
const headersToObject = (headers) => headers instanceof Headers ? Object.fromEntries(headers.entries()) : Array.isArray(headers) ? Object.fromEntries(headers) : headers || {};
async function withGoogleChatResponse(params) {
	const { account, url, init, auditContext, errorPrefix = "Google Chat API", handleResponse } = params;
	const token = await getGoogleChatAccessToken(account);
	const { response, release } = await fetchWithSsrFGuard({
		url,
		init: {
			...init,
			headers: {
				...headersToObject(init?.headers),
				Authorization: `Bearer ${token}`
			}
		},
		auditContext
	});
	try {
		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new Error(`${errorPrefix} ${response.status}: ${text || response.statusText}`);
		}
		return await handleResponse(response);
	} finally {
		await release();
	}
}
async function fetchJson(account, url, init) {
	return await withGoogleChatResponse({
		account,
		url,
		init: {
			...init,
			headers: {
				...headersToObject(init.headers),
				"Content-Type": "application/json"
			}
		},
		auditContext: "googlechat.api.json",
		handleResponse: async (response) => await response.json()
	});
}
async function fetchOk(account, url, init) {
	await withGoogleChatResponse({
		account,
		url,
		init,
		auditContext: "googlechat.api.ok",
		handleResponse: async () => void 0
	});
}
async function fetchBuffer(account, url, init, options) {
	return await withGoogleChatResponse({
		account,
		url,
		init,
		auditContext: "googlechat.api.buffer",
		handleResponse: async (res) => {
			const maxBytes = options?.maxBytes;
			const lengthHeader = res.headers.get("content-length");
			if (maxBytes && lengthHeader) {
				const length = Number(lengthHeader);
				if (Number.isFinite(length) && length > maxBytes) throw new Error(`Google Chat media exceeds max bytes (${maxBytes})`);
			}
			if (!maxBytes || !res.body) return {
				buffer: Buffer.from(await res.arrayBuffer()),
				contentType: res.headers.get("content-type") ?? void 0
			};
			const reader = res.body.getReader();
			const chunks = [];
			let total = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (!value) continue;
				total += value.length;
				if (total > maxBytes) {
					await reader.cancel();
					throw new Error(`Google Chat media exceeds max bytes (${maxBytes})`);
				}
				chunks.push(Buffer.from(value));
			}
			return {
				buffer: Buffer.concat(chunks, total),
				contentType: res.headers.get("content-type") ?? void 0
			};
		}
	});
}
async function sendGoogleChatMessage(params) {
	const { account, space, text, thread, attachments } = params;
	const body = {};
	if (text) body.text = text;
	if (thread) body.thread = { name: thread };
	if (attachments && attachments.length > 0) body.attachment = attachments.map((item) => Object.assign({ attachmentDataRef: { attachmentUploadToken: item.attachmentUploadToken } }, item.contentName ? { contentName: item.contentName } : {}));
	const urlObj = new URL(`${CHAT_API_BASE}/${space}/messages`);
	if (thread) urlObj.searchParams.set("messageReplyOption", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
	const result = await fetchJson(account, urlObj.toString(), {
		method: "POST",
		body: JSON.stringify(body)
	});
	return result ? { messageName: result.name } : null;
}
async function updateGoogleChatMessage(params) {
	const { account, messageName, text } = params;
	return { messageName: (await fetchJson(account, `${CHAT_API_BASE}/${messageName}?updateMask=text`, {
		method: "PATCH",
		body: JSON.stringify({ text })
	})).name };
}
async function deleteGoogleChatMessage(params) {
	const { account, messageName } = params;
	await fetchOk(account, `${CHAT_API_BASE}/${messageName}`, { method: "DELETE" });
}
async function uploadGoogleChatAttachment(params) {
	const { account, space, filename, buffer, contentType } = params;
	const boundary = `enclawed-${crypto.randomUUID()}`;
	const header = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ filename })}\r\n`;
	const mediaHeader = `--${boundary}\r\nContent-Type: ${contentType ?? "application/octet-stream"}\r\n\r\n`;
	const footer = `\r\n--${boundary}--\r\n`;
	const body = Buffer.concat([
		Buffer.from(header, "utf8"),
		Buffer.from(mediaHeader, "utf8"),
		buffer,
		Buffer.from(footer, "utf8")
	]);
	return { attachmentUploadToken: (await withGoogleChatResponse({
		account,
		url: `${CHAT_UPLOAD_BASE}/${space}/attachments:upload?uploadType=multipart`,
		init: {
			method: "POST",
			headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
			body
		},
		auditContext: "googlechat.upload",
		errorPrefix: "Google Chat upload",
		handleResponse: async (response) => await response.json()
	})).attachmentDataRef?.attachmentUploadToken };
}
async function downloadGoogleChatMedia(params) {
	const { account, resourceName, maxBytes } = params;
	return await fetchBuffer(account, `${CHAT_API_BASE}/media/${resourceName}?alt=media`, void 0, { maxBytes });
}
async function createGoogleChatReaction(params) {
	const { account, messageName, emoji } = params;
	return await fetchJson(account, `${CHAT_API_BASE}/${messageName}/reactions`, {
		method: "POST",
		body: JSON.stringify({ emoji: { unicode: emoji } })
	});
}
async function listGoogleChatReactions(params) {
	const { account, messageName, limit } = params;
	const url = new URL(`${CHAT_API_BASE}/${messageName}/reactions`);
	if (limit && limit > 0) url.searchParams.set("pageSize", String(limit));
	return (await fetchJson(account, url.toString(), { method: "GET" })).reactions ?? [];
}
async function deleteGoogleChatReaction(params) {
	const { account, reactionName } = params;
	await fetchOk(account, `${CHAT_API_BASE}/${reactionName}`, { method: "DELETE" });
}
async function findGoogleChatDirectMessage(params) {
	const { account, userName } = params;
	const url = new URL(`${CHAT_API_BASE}/spaces:findDirectMessage`);
	url.searchParams.set("name", userName);
	return await fetchJson(account, url.toString(), { method: "GET" });
}
async function probeGoogleChat(account) {
	try {
		const url = new URL(`${CHAT_API_BASE}/spaces`);
		url.searchParams.set("pageSize", "1");
		await fetchJson(account, url.toString(), { method: "GET" });
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: formatErrorMessage(err)
		};
	}
}
//#endregion
export { findGoogleChatDirectMessage as a, sendGoogleChatMessage as c, verifyGoogleChatRequest as d, downloadGoogleChatMedia as i, updateGoogleChatMessage as l, deleteGoogleChatMessage as n, listGoogleChatReactions as o, deleteGoogleChatReaction as r, probeGoogleChat as s, createGoogleChatReaction as t, uploadGoogleChatAttachment as u };
