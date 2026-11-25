//#region src/infra/net/sdk-telemetry-headers.ts
/**
* Outbound request hygiene for provider SDK telemetry.
*
* Stainless-generated SDKs (`openai`, `@anthropic-ai/sdk`, and the SDKs pi-ai
* bundles) add `X-Stainless-*` headers to every request: OS, CPU
* architecture, runtime and runtime version, SDK language and package
* version, retry count, timeout, and helper method. They also send a
* `User-Agent: <Client>/JS <sdk-version>`. None of this is needed for a
* request to succeed; it fingerprints the host and the client stack to every
* provider. Enclawed removes the `X-Stainless-*` headers and drops the SDK
* version from that User-Agent before a request leaves the process.
*
* Everything else is left exactly as the caller built it (a provider that
* requires a specific User-Agent, such as GitHub Copilot or Anthropic OAuth,
* keeps it).
*/
const SDK_TELEMETRY_HEADER_PREFIX = "x-stainless-";
const STAINLESS_SDK_USER_AGENT = /^([A-Za-z_$][\w$]*\/JS) +\d\S*$/;
/** Whether a header name is SDK telemetry Enclawed never sends. */
function isSdkTelemetryHeaderName(name) {
	return name.trim().toLowerCase().startsWith(SDK_TELEMETRY_HEADER_PREFIX);
}
/**
* The User-Agent to send instead of `value`: a Stainless SDK User-Agent
* without its version (`OpenAI/JS 6.35.0` -> `OpenAI/JS`); any other value
* unchanged.
*/
function neutralizeSdkUserAgent(value) {
	const match = STAINLESS_SDK_USER_AGENT.exec(value.trim());
	return match ? match[1] : value;
}
function isUserAgentHeaderName(name) {
	return name.trim().toLowerCase() === "user-agent";
}
function needsRewrite(name, value) {
	return isSdkTelemetryHeaderName(name) || isUserAgentHeaderName(name) && neutralizeSdkUserAgent(value) !== value;
}
function rewriteHeadersObject(headers) {
	let changed = false;
	for (const [name, value] of headers) if (needsRewrite(name, value)) {
		changed = true;
		break;
	}
	if (!changed) return;
	const next = new Headers();
	for (const [name, value] of headers) {
		if (isSdkTelemetryHeaderName(name)) continue;
		next.append(name, isUserAgentHeaderName(name) ? neutralizeSdkUserAgent(value) : value);
	}
	return next;
}
function stripSdkTelemetryHeaders(headers) {
	if (headers === void 0 || headers === null) return headers;
	if (headers instanceof Headers) return rewriteHeadersObject(headers) ?? headers;
	if (Array.isArray(headers)) {
		if (!headers.some(([name, value]) => needsRewrite(name, value))) return headers;
		return headers.filter(([name]) => !isSdkTelemetryHeaderName(name)).map(([name, value]) => [name, isUserAgentHeaderName(name) ? neutralizeSdkUserAgent(value) : value]);
	}
	const record = headers;
	if (!Object.entries(record).some(([name, value]) => needsRewrite(name, value))) return headers;
	const next = {};
	for (const [name, value] of Object.entries(record)) {
		if (isSdkTelemetryHeaderName(name)) continue;
		next[name] = isUserAgentHeaderName(name) && typeof value === "string" ? neutralizeSdkUserAgent(value) : value;
	}
	return next;
}
function stripSdkTelemetryFromRequestInit(init) {
	if (!init?.headers) return init;
	const headers = stripSdkTelemetryHeaders(init.headers);
	return headers === init.headers ? init : {
		...init,
		headers
	};
}
const filteredFetches = /* @__PURE__ */ new WeakSet();
/**
* A fetch that removes SDK telemetry from every request before handing it to
* `fetchImpl` (or, when omitted, to `globalThis.fetch` as it is at call
* time). Idempotent: wrapping an already-filtered fetch returns it.
*/
function withoutSdkTelemetryHeaders(fetchImpl) {
	if (fetchImpl && filteredFetches.has(fetchImpl)) return fetchImpl;
	const filtered = (input, init) => {
		const target = fetchImpl ?? globalThis.fetch;
		if (init?.headers !== void 0) return target(input, stripSdkTelemetryFromRequestInit(init));
		if (input instanceof Request) {
			const headers = rewriteHeadersObject(input.headers);
			if (headers) return target(new Request(input, { headers }), init);
		}
		return target(input, init);
	};
	filteredFetches.add(filtered);
	return filtered;
}
//#endregion
export { withoutSdkTelemetryHeaders as n, stripSdkTelemetryFromRequestInit as t };
