import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { l as resolveProviderRequestPolicyConfig, n as buildProviderRequestDispatcherPolicy } from "./provider-request-config-D3aQvGgi.js";
import { r as fetchWithTimeout } from "./fetch-timeout-CX15k_ki.js";
import { c as shouldUseEnvHttpProxyForUrl } from "./proxy-env-C6YBem4U.js";
import { n as fetchWithSsrFGuard, t as GUARDED_FETCH_MODE } from "./fetch-guard-DaTUExyj.js";
import path from "node:path";
//#region src/agents/provider-http-errors.ts
function asBoolean(value) {
	return typeof value === "boolean" ? value : void 0;
}
function asObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function truncateErrorDetail(detail, limit = 220) {
	return detail.length <= limit ? detail : `${detail.slice(0, limit - 1)}…`;
}
async function readResponseTextLimited(response, limitBytes = 16 * 1024) {
	if (limitBytes <= 0) return "";
	const reader = response.body?.getReader();
	if (!reader) return "";
	const decoder = new TextDecoder();
	let total = 0;
	let text = "";
	let reachedLimit = false;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (!value || value.byteLength === 0) continue;
			const remaining = limitBytes - total;
			if (remaining <= 0) {
				reachedLimit = true;
				break;
			}
			const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
			total += chunk.byteLength;
			text += decoder.decode(chunk, { stream: true });
			if (total >= limitBytes) {
				reachedLimit = true;
				break;
			}
		}
		text += decoder.decode();
	} finally {
		if (reachedLimit) await reader.cancel().catch(() => {});
	}
	return text;
}
function formatProviderErrorPayload(payload) {
	const root = asObject(payload);
	const detailObject = asObject(root?.detail);
	const subject = asObject(root?.error) ?? detailObject ?? root;
	if (!subject) return;
	const message = normalizeOptionalString(subject.message) ?? normalizeOptionalString(subject.detail) ?? normalizeOptionalString(root?.message) ?? normalizeOptionalString(root?.error) ?? normalizeOptionalString(root?.detail);
	const type = normalizeOptionalString(subject.type);
	const code = normalizeOptionalString(subject.code) ?? normalizeOptionalString(subject.status);
	const metadata = [type ? `type=${type}` : void 0, code ? `code=${code}` : void 0].filter((value) => Boolean(value)).join(", ");
	if (message && metadata) return `${truncateErrorDetail(message)} [${metadata}]`;
	if (message) return truncateErrorDetail(message);
	if (metadata) return `[${metadata}]`;
}
async function extractProviderErrorDetail(response) {
	const rawBody = normalizeOptionalString(await readResponseTextLimited(response));
	if (!rawBody) return;
	try {
		return formatProviderErrorPayload(JSON.parse(rawBody)) ?? truncateErrorDetail(rawBody);
	} catch {
		return truncateErrorDetail(rawBody);
	}
}
function extractProviderRequestId(response) {
	return normalizeOptionalString(response.headers.get("x-request-id")) ?? normalizeOptionalString(response.headers.get("request-id"));
}
function formatProviderHttpErrorMessage(params) {
	const { label, status, detail, requestId, statusPrefix = "" } = params;
	return `${label} (${statusPrefix}${status})` + (detail ? `: ${detail}` : "") + (requestId ? ` [request_id=${requestId}]` : "");
}
async function createProviderHttpError(response, label, options) {
	const detail = await extractProviderErrorDetail(response);
	const requestId = extractProviderRequestId(response);
	return new Error(formatProviderHttpErrorMessage({
		label,
		status: response.status,
		detail,
		requestId,
		statusPrefix: options?.statusPrefix
	}));
}
async function assertOkOrThrowProviderError(response, label) {
	if (response.ok) return;
	throw await createProviderHttpError(response, label);
}
async function assertOkOrThrowHttpError(response, label) {
	if (response.ok) return;
	throw await createProviderHttpError(response, label, { statusPrefix: "HTTP " });
}
//#endregion
//#region src/media-understanding/shared.ts
const DEFAULT_GUARDED_HTTP_TIMEOUT_MS = 6e4;
const MAX_AUDIT_CONTEXT_CHARS = 80;
function resolveAudioTranscriptionUploadFileName(fileName, mime) {
	const trimmed = fileName?.trim();
	const baseName = trimmed ? path.basename(trimmed) : "audio";
	const lowerMime = mime?.trim().toLowerCase();
	if (/\.aac$/i.test(baseName)) return `${baseName.slice(0, -4) || "audio"}.m4a`;
	if (!path.extname(baseName) && lowerMime === "audio/aac") return `${baseName || "audio"}.m4a`;
	return baseName;
}
function buildAudioTranscriptionFormData(params) {
	const form = new FormData();
	const bytes = new Uint8Array(params.buffer);
	const blob = new Blob([bytes], { type: params.mime ?? "application/octet-stream" });
	form.append("file", blob, resolveAudioTranscriptionUploadFileName(params.fileName, params.mime));
	for (const [name, value] of Object.entries(params.fields ?? {})) {
		const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
		if (text) form.append(name, text);
	}
	return form;
}
function createProviderOperationDeadline(params) {
	if (typeof params.timeoutMs !== "number" || !Number.isFinite(params.timeoutMs) || params.timeoutMs <= 0) return { label: params.label };
	const timeoutMs = Math.floor(params.timeoutMs);
	return {
		deadlineAtMs: Date.now() + timeoutMs,
		label: params.label,
		timeoutMs
	};
}
function resolveProviderOperationTimeoutMs(params) {
	const deadlineAtMs = params.deadline.deadlineAtMs;
	if (typeof deadlineAtMs !== "number") return params.defaultTimeoutMs;
	const remainingMs = deadlineAtMs - Date.now();
	if (remainingMs <= 0) throw new Error(`${params.deadline.label} timed out after ${params.deadline.timeoutMs}ms`);
	return Math.max(1, Math.min(params.defaultTimeoutMs, remainingMs));
}
async function waitProviderOperationPollInterval(params) {
	const deadlineAtMs = params.deadline.deadlineAtMs;
	if (typeof deadlineAtMs !== "number") {
		await new Promise((resolve) => setTimeout(resolve, params.pollIntervalMs));
		return;
	}
	const remainingMs = deadlineAtMs - Date.now();
	if (remainingMs <= 0) throw new Error(`${params.deadline.label} timed out after ${params.deadline.timeoutMs}ms`);
	await new Promise((resolve) => setTimeout(resolve, Math.min(params.pollIntervalMs, remainingMs)));
}
async function pollProviderOperationJson(params) {
	for (let attempt = 0; attempt < params.maxAttempts; attempt += 1) {
		const response = await fetchWithTimeout(params.url, {
			method: "GET",
			headers: params.headers
		}, resolveProviderOperationTimeoutMs({
			deadline: params.deadline,
			defaultTimeoutMs: params.defaultTimeoutMs
		}), params.fetchFn);
		await assertOkOrThrowHttpError(response, params.requestFailedMessage);
		const payload = await response.json();
		if (params.isComplete(payload)) return payload;
		const failureMessage = params.getFailureMessage?.(payload);
		if (failureMessage) throw new Error(failureMessage);
		await waitProviderOperationPollInterval({
			deadline: params.deadline,
			pollIntervalMs: params.pollIntervalMs
		});
	}
	throw new Error(params.timeoutMessage);
}
function resolveGuardedHttpTimeoutMs(timeoutMs) {
	if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return DEFAULT_GUARDED_HTTP_TIMEOUT_MS;
	return timeoutMs;
}
function sanitizeAuditContext(auditContext) {
	const cleaned = auditContext?.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
	if (!cleaned) return;
	return cleaned.slice(0, MAX_AUDIT_CONTEXT_CHARS);
}
function resolveProviderHttpRequestConfig(params) {
	const requestConfig = resolveProviderRequestPolicyConfig({
		provider: params.provider ?? "",
		baseUrl: params.baseUrl,
		defaultBaseUrl: params.defaultBaseUrl,
		capability: params.capability ?? "other",
		transport: params.transport ?? "http",
		callerHeaders: params.headers ? Object.fromEntries(new Headers(params.headers).entries()) : void 0,
		providerHeaders: params.defaultHeaders,
		precedence: "caller-wins",
		allowPrivateNetwork: params.allowPrivateNetwork,
		api: params.api,
		request: params.request
	});
	const headers = new Headers(requestConfig.headers);
	if (!requestConfig.baseUrl) throw new Error("Missing baseUrl: provide baseUrl or defaultBaseUrl");
	return {
		baseUrl: requestConfig.baseUrl,
		allowPrivateNetwork: requestConfig.allowPrivateNetwork,
		headers,
		dispatcherPolicy: buildProviderRequestDispatcherPolicy(requestConfig),
		requestConfig
	};
}
/**
* Decide whether to auto-upgrade a provider HTTP request into
* `TRUSTED_ENV_PROXY` mode based on the runtime environment.
*
* This is gated conservatively to avoid the SSRF bypasses the initial
* auto-upgrade path exposed (see enclawed#64974 review threads):
*
* 1. If the caller supplied an explicit `dispatcherPolicy` — custom proxy URL,
*    `proxyTls`, or `connect` options — do NOT override it. Trusted-env mode
*    builds an `EnvHttpProxyAgent` that would silently drop those overrides,
*    breaking enterprise proxy/mTLS configs.
*
* 2. Only auto-upgrade when `HTTP_PROXY` or `HTTPS_PROXY` (lower- or
*    upper-case) is configured for the target protocol. `ALL_PROXY` is
*    explicitly ignored by `EnvHttpProxyAgent`, so counting it would
*    auto-upgrade requests that then make direct connections while skipping
*    pinned-DNS/SSRF hostname checks.
*
* 3. If `NO_PROXY` would bypass the proxy for this target, do NOT auto-upgrade.
*    `EnvHttpProxyAgent` makes direct connections for `NO_PROXY` matches, but
*    in `TRUSTED_ENV_PROXY` mode `fetchWithSsrFGuard` skips
*    `resolvePinnedHostnameWithPolicy` — so those direct connections would
*    bypass SSRF protection. Keep strict mode for `NO_PROXY` matches.
*/
function shouldAutoUpgradeToTrustedEnvProxy(params) {
	if (params.dispatcherPolicy) return false;
	return shouldUseEnvHttpProxyForUrl(params.url);
}
async function fetchWithTimeoutGuarded(url, init, timeoutMs, fetchFn, options) {
	const resolvedMode = options?.mode ?? (shouldAutoUpgradeToTrustedEnvProxy({
		url,
		dispatcherPolicy: options?.dispatcherPolicy
	}) ? GUARDED_FETCH_MODE.TRUSTED_ENV_PROXY : void 0);
	return await fetchWithSsrFGuard({
		url,
		fetchImpl: fetchFn,
		init,
		timeoutMs: resolveGuardedHttpTimeoutMs(timeoutMs),
		policy: options?.ssrfPolicy,
		lookupFn: options?.lookupFn,
		pinDns: options?.pinDns,
		dispatcherPolicy: options?.dispatcherPolicy,
		auditContext: sanitizeAuditContext(options?.auditContext),
		...resolvedMode ? { mode: resolvedMode } : {}
	});
}
function resolveGuardedPostRequestOptions(params) {
	if (!params.allowPrivateNetwork && !params.dispatcherPolicy && params.pinDns === void 0 && !params.auditContext && params.mode === void 0) return;
	return {
		...params.allowPrivateNetwork ? { ssrfPolicy: { allowPrivateNetwork: true } } : {},
		...params.pinDns !== void 0 ? { pinDns: params.pinDns } : {},
		...params.dispatcherPolicy ? { dispatcherPolicy: params.dispatcherPolicy } : {},
		...params.auditContext ? { auditContext: params.auditContext } : {},
		...params.mode !== void 0 ? { mode: params.mode } : {}
	};
}
async function postTranscriptionRequest(params) {
	return fetchWithTimeoutGuarded(params.url, {
		method: "POST",
		headers: params.headers,
		body: params.body
	}, params.timeoutMs, params.fetchFn, resolveGuardedPostRequestOptions(params));
}
async function postJsonRequest(params) {
	return fetchWithTimeoutGuarded(params.url, {
		method: "POST",
		headers: params.headers,
		body: JSON.stringify(params.body)
	}, params.timeoutMs, params.fetchFn, resolveGuardedPostRequestOptions(params));
}
async function postMultipartRequest(params) {
	return fetchWithTimeoutGuarded(params.url, {
		method: "POST",
		headers: params.headers,
		body: params.body
	}, params.timeoutMs, params.fetchFn, resolveGuardedPostRequestOptions(params));
}
function requireTranscriptionText(value, missingMessage) {
	const text = value?.trim();
	if (!text) throw new Error(missingMessage);
	return text;
}
//#endregion
export { truncateErrorDetail as S, extractProviderErrorDetail as _, postJsonRequest as a, formatProviderHttpErrorMessage as b, requireTranscriptionText as c, waitProviderOperationPollInterval as d, asBoolean as f, createProviderHttpError as g, assertOkOrThrowProviderError as h, pollProviderOperationJson as i, resolveProviderHttpRequestConfig as l, assertOkOrThrowHttpError as m, createProviderOperationDeadline as n, postMultipartRequest as o, asObject as p, fetchWithTimeoutGuarded as r, postTranscriptionRequest as s, buildAudioTranscriptionFormData as t, resolveProviderOperationTimeoutMs as u, extractProviderRequestId as v, readResponseTextLimited as x, formatProviderErrorPayload as y };
