import { n as scan } from "./dlp-scanner-CAEHT3p2.js";
import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { a as logWarn } from "./logger-DS0DGCW4.js";
import { t as captureHttpExchange } from "./runtime-euHf3Onk.js";
import { n as buildTimeoutAbortSignal } from "./fetch-timeout-DvI5vtIZ.js";
import { i as hasProxyEnvConfigured } from "./proxy-env-Bt4kGcCo.js";
import { t as retainSafeHeadersForCrossOriginRedirect$1 } from "./redirect-headers-kO0EmVLa.js";
import { n as createHttp1EnvHttpProxyAgent, r as createHttp1ProxyAgent, t as createHttp1Agent } from "./undici-runtime-iY-JTtmk.js";
import { r as isMockedFetch, t as fetchWithRuntimeDispatcher } from "./runtime-fetch-BU4AljFn.js";
import { t as stripSdkTelemetryFromRequestInit } from "./sdk-telemetry-headers-PHerGq54.js";
import { a as createPinnedDispatcher, h as resolvePinnedHostnameWithPolicy, i as closeDispatcher, n as assertHostnameAllowedWithPolicy, t as SsrFBlockedError } from "./ssrf-cKOQ0IWE.js";
//#region src/enclawed/model-egress.ts
var EgressPolicyError = class extends Error {
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "EgressPolicyError";
	}
};
function normalizeHost(host) {
	return host.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}
/** Refuse a host the policy does not allow. A no-op when allowlists are not enforced. */
function assertHostAllowedByPolicy(url) {
	const runtime = getRuntime();
	if (!runtime || !runtime.policy.enforceAllowlists) return;
	const host = normalizeHost(url.hostname);
	for (const allowed of runtime.policy.allowedHosts) if (normalizeHost(allowed) === host) return;
	runtime.audit.append({
		type: "egress.deny",
		actor: "process",
		level: null,
		payload: { host }
	}).catch(() => {});
	throw new EgressPolicyError(`egress denied: ${host} is not on enclawed.policy.allowedHosts`, "host-not-allowed");
}
const NEVER_SENT = new Set([
	"industry-classification-banner",
	"us-classification-banner",
	"us-doe-restricted-data",
	"us-sci-codeword",
	"aws-access-key-id",
	"gcp-service-account",
	"azure-storage-key",
	"github-token",
	"gitlab-token",
	"openai-key",
	"anthropic-key",
	"slack-bot-token",
	"stripe-key",
	"jwt",
	"pem-private-key"
]);
function decoded(text) {
	try {
		return decodeURIComponent(text.replaceAll("+", " "));
	} catch {
		return text;
	}
}
function bodyText(body) {
	if (typeof body === "string") return body;
	if (body instanceof URLSearchParams) return body.toString();
	if (body instanceof Uint8Array) return Buffer.from(body.subarray(0, 1024 * 1024)).toString("latin1");
	return "";
}
function looksLikeRealKey(id, match) {
	if (id !== "openai-key") return true;
	return !match.replace(/^sk-/, "").includes("-");
}
/** The secret families a model-requested URL or body carries. */
function secretsInModelRequest(url, body) {
	const ids = scan(`${url}\n${decoded(url)}\n${bodyText(body)}`, { onOversize: "truncate" }).filter((f) => NEVER_SENT.has(f.id) && looksLikeRealKey(f.id, f.match)).map((f) => f.id);
	return [...new Set(ids)];
}
/** Refuse, audit and report a model-requested request that carries a secret. */
function assertModelRequestCarriesNoSecrets(params) {
	const found = secretsInModelRequest(params.url, params.body);
	if (found.length === 0) return;
	let host = "";
	try {
		host = new URL(params.url).hostname;
	} catch {}
	getRuntime()?.audit.append({
		type: "egress.dlp.block",
		actor: params.via,
		level: null,
		payload: {
			host,
			dlp: found
		}
	}).catch(() => {});
	const message = `Enclawed blocked a request the model asked for (${params.via}) to ${host || "a URL"}: it carried ${found.join(", ")}. Nothing was sent.`;
	logWarn(message);
	throw new EgressPolicyError(message, "secret-in-request");
}
//#endregion
//#region src/infra/net/fetch-guard.ts
const GUARDED_FETCH_MODE = {
	STRICT: "strict",
	TRUSTED_ENV_PROXY: "trusted_env_proxy",
	TRUSTED_EXPLICIT_PROXY: "trusted_explicit_proxy"
};
const DEFAULT_MAX_REDIRECTS = 3;
function withStrictGuardedFetchMode(params) {
	return {
		...params,
		mode: GUARDED_FETCH_MODE.STRICT
	};
}
function withTrustedEnvProxyGuardedFetchMode(params) {
	return {
		...params,
		mode: GUARDED_FETCH_MODE.TRUSTED_ENV_PROXY
	};
}
function withTrustedExplicitProxyGuardedFetchMode(params) {
	return {
		...params,
		mode: GUARDED_FETCH_MODE.TRUSTED_EXPLICIT_PROXY
	};
}
function resolveGuardedFetchMode(params) {
	if (params.mode) return params.mode;
	if (params.proxy === "env" && params.dangerouslyAllowEnvProxyWithoutPinnedDns === true) return GUARDED_FETCH_MODE.TRUSTED_ENV_PROXY;
	return GUARDED_FETCH_MODE.STRICT;
}
function assertExplicitProxySupportsPinnedDns(url, dispatcherPolicy, pinDns) {
	if (pinDns !== false && dispatcherPolicy?.mode === "explicit-proxy" && url.protocol !== "https:") throw new Error("Explicit proxy SSRF pinning requires HTTPS targets; plain HTTP targets are not supported");
}
function createPolicyDispatcherWithoutPinnedDns(dispatcherPolicy) {
	if (!dispatcherPolicy) return null;
	if (dispatcherPolicy.mode === "direct") return createHttp1Agent(dispatcherPolicy.connect ? { connect: { ...dispatcherPolicy.connect } } : void 0);
	if (dispatcherPolicy.mode === "env-proxy") return createHttp1EnvHttpProxyAgent({
		...dispatcherPolicy.connect ? { connect: { ...dispatcherPolicy.connect } } : {},
		...dispatcherPolicy.proxyTls ? { proxyTls: { ...dispatcherPolicy.proxyTls } } : {}
	});
	const proxyUrl = dispatcherPolicy.proxyUrl.trim();
	return dispatcherPolicy.proxyTls ? createHttp1ProxyAgent({
		uri: proxyUrl,
		requestTls: { ...dispatcherPolicy.proxyTls }
	}) : createHttp1ProxyAgent({ uri: proxyUrl });
}
async function assertExplicitProxyAllowed(dispatcherPolicy, lookupFn, policy) {
	if (!dispatcherPolicy || dispatcherPolicy.mode !== "explicit-proxy") return;
	let parsedProxyUrl;
	try {
		parsedProxyUrl = new URL(dispatcherPolicy.proxyUrl);
	} catch {
		throw new Error("Invalid explicit proxy URL");
	}
	if (!["http:", "https:"].includes(parsedProxyUrl.protocol)) throw new Error("Explicit proxy URL must use http or https");
	await resolvePinnedHostnameWithPolicy(parsedProxyUrl.hostname, {
		lookupFn,
		policy: dispatcherPolicy.allowPrivateProxy === true ? {
			...policy,
			allowPrivateNetwork: true,
			hostnameAllowlist: void 0
		} : policy
	});
}
function isRedirectStatus(status) {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
function isAmbientGlobalFetch(params) {
	return typeof params.fetchImpl === "function" && typeof params.globalFetch === "function" && params.fetchImpl === params.globalFetch;
}
function retainSafeHeadersForCrossOriginRedirectHeaders(headers) {
	return retainSafeHeadersForCrossOriginRedirect$1(headers);
}
function retainSafeHeadersForCrossOriginRedirect(init) {
	if (!init?.headers) return init;
	return {
		...init,
		headers: retainSafeHeadersForCrossOriginRedirect$1(init.headers)
	};
}
function dropBodyHeaders(headers) {
	if (!headers) return headers;
	const nextHeaders = new Headers(headers);
	nextHeaders.delete("content-encoding");
	nextHeaders.delete("content-language");
	nextHeaders.delete("content-length");
	nextHeaders.delete("content-location");
	nextHeaders.delete("content-type");
	nextHeaders.delete("transfer-encoding");
	return nextHeaders;
}
function rewriteRedirectInitForMethod(params) {
	const { init, status } = params;
	if (!init) return init;
	const currentMethod = init.method?.toUpperCase() ?? "GET";
	if (!(status === 303 ? currentMethod !== "GET" && currentMethod !== "HEAD" : (status === 301 || status === 302) && currentMethod === "POST")) return init;
	return {
		...init,
		method: "GET",
		body: void 0,
		headers: dropBodyHeaders(init.headers)
	};
}
function rewriteRedirectInitForCrossOrigin(params) {
	const { init, allowUnsafeReplay } = params;
	if (!init || allowUnsafeReplay) return init;
	const currentMethod = init.method?.toUpperCase() ?? "GET";
	if (currentMethod === "GET" || currentMethod === "HEAD") return init;
	return {
		...init,
		body: void 0,
		headers: dropBodyHeaders(init.headers)
	};
}
async function fetchWithSsrFGuard(params) {
	const defaultFetch = params.fetchImpl ?? globalThis.fetch;
	if (!defaultFetch) throw new Error("fetch is not available");
	const maxRedirects = typeof params.maxRedirects === "number" && Number.isFinite(params.maxRedirects) ? Math.max(0, Math.floor(params.maxRedirects)) : DEFAULT_MAX_REDIRECTS;
	const mode = resolveGuardedFetchMode(params);
	const { signal, cleanup } = buildTimeoutAbortSignal({
		timeoutMs: params.timeoutMs,
		signal: params.signal
	});
	let released = false;
	const release = async (dispatcher) => {
		if (released) return;
		released = true;
		cleanup();
		await closeDispatcher(dispatcher ?? void 0);
	};
	const wireKey = (url) => {
		try {
			const parsed = new URL(url);
			parsed.hash = "";
			return parsed.toString();
		} catch {
			return url;
		}
	};
	const visited = new Set([wireKey(params.url)]);
	let currentUrl = params.url;
	let currentInit = params.init ? stripSdkTelemetryFromRequestInit({ ...params.init }) : void 0;
	let redirectCount = 0;
	while (true) {
		let parsedUrl;
		try {
			parsedUrl = new URL(currentUrl);
		} catch {
			await release();
			throw new Error("Invalid URL: must be http or https");
		}
		if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			await release();
			throw new Error("Invalid URL: must be http or https");
		}
		try {
			assertHostAllowedByPolicy(parsedUrl);
		} catch (err) {
			await release();
			throw err;
		}
		let dispatcher = null;
		try {
			const usesTrustedExplicitProxyMode = mode === GUARDED_FETCH_MODE.TRUSTED_EXPLICIT_PROXY && params.dispatcherPolicy?.mode === "explicit-proxy";
			assertExplicitProxySupportsPinnedDns(parsedUrl, params.dispatcherPolicy, usesTrustedExplicitProxyMode ? false : params.pinDns);
			await assertExplicitProxyAllowed(params.dispatcherPolicy, params.lookupFn, params.policy);
			if (mode === GUARDED_FETCH_MODE.TRUSTED_ENV_PROXY && hasProxyEnvConfigured()) dispatcher = createHttp1EnvHttpProxyAgent();
			else if (usesTrustedExplicitProxyMode) {
				assertHostnameAllowedWithPolicy(parsedUrl.hostname, params.policy);
				dispatcher = createPolicyDispatcherWithoutPinnedDns(params.dispatcherPolicy);
			} else if (params.pinDns === false) {
				await resolvePinnedHostnameWithPolicy(parsedUrl.hostname, {
					lookupFn: params.lookupFn,
					policy: params.policy
				});
				dispatcher = createPolicyDispatcherWithoutPinnedDns(params.dispatcherPolicy);
			} else dispatcher = createPinnedDispatcher(await resolvePinnedHostnameWithPolicy(parsedUrl.hostname, {
				lookupFn: params.lookupFn,
				policy: params.policy
			}), params.dispatcherPolicy, params.policy);
			const init = {
				...currentInit ? { ...currentInit } : {},
				redirect: "manual",
				...dispatcher ? { dispatcher } : {},
				...signal ? { signal } : {}
			};
			const supportsDispatcherInit = params.fetchImpl !== void 0 && !isAmbientGlobalFetch({
				fetchImpl: params.fetchImpl,
				globalFetch: globalThis.fetch
			}) || isMockedFetch(defaultFetch);
			const response = Boolean(dispatcher) && !supportsDispatcherInit ? await fetchWithRuntimeDispatcher(parsedUrl.toString(), init) : await defaultFetch(parsedUrl.toString(), init);
			if (params.capture !== false) captureHttpExchange({
				url: parsedUrl.toString(),
				method: currentInit?.method ?? "GET",
				requestHeaders: currentInit?.headers,
				requestBody: currentInit?.body ?? null,
				response,
				transport: "http",
				flowId: params.capture?.flowId,
				meta: {
					captureOrigin: "guarded-fetch",
					...params.auditContext ? { auditContext: params.auditContext } : {},
					...params.capture?.meta
				}
			});
			if (isRedirectStatus(response.status)) {
				const location = response.headers.get("location");
				if (!location) {
					await release(dispatcher);
					throw new Error(`Redirect missing location header (${response.status})`);
				}
				redirectCount += 1;
				if (redirectCount > maxRedirects) {
					await release(dispatcher);
					throw new Error(`Too many redirects (limit: ${maxRedirects})`);
				}
				const nextParsedUrl = new URL(location, parsedUrl);
				const nextUrl = nextParsedUrl.toString();
				if (visited.has(wireKey(nextUrl))) {
					await release(dispatcher);
					throw new Error("Redirect loop detected");
				}
				currentInit = rewriteRedirectInitForMethod({
					init: currentInit,
					status: response.status
				});
				if (nextParsedUrl.origin !== parsedUrl.origin) {
					currentInit = rewriteRedirectInitForCrossOrigin({
						init: currentInit,
						allowUnsafeReplay: params.allowCrossOriginUnsafeRedirectReplay === true
					});
					currentInit = retainSafeHeadersForCrossOriginRedirect(currentInit);
				}
				visited.add(wireKey(nextUrl));
				response.body?.cancel();
				await closeDispatcher(dispatcher);
				currentUrl = nextUrl;
				continue;
			}
			return {
				response,
				finalUrl: currentUrl,
				release: async () => release(dispatcher)
			};
		} catch (err) {
			if (err instanceof SsrFBlockedError) logWarn(`security: blocked URL fetch (${params.auditContext ?? "url-fetch"}) target=${parsedUrl.origin}${parsedUrl.pathname} reason=${err.message}`);
			await release(dispatcher);
			throw err;
		}
	}
}
//#endregion
export { withTrustedEnvProxyGuardedFetchMode as a, withStrictGuardedFetchMode as i, fetchWithSsrFGuard as n, withTrustedExplicitProxyGuardedFetchMode as o, retainSafeHeadersForCrossOriginRedirectHeaders as r, assertModelRequestCarriesNoSecrets as s, GUARDED_FETCH_MODE as t };
