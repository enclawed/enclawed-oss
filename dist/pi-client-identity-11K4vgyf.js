import { n as withoutSdkTelemetryHeaders } from "./sdk-telemetry-headers-PHerGq54.js";
//#region src/agents/pi-client-identity.ts
/**
* Request identity Enclawed hands pi-ai for every model request.
*
* pi-ai >= 1.x identifies the caller on each request it builds: by default a
* detailed `User-Agent: pi/<version> (<os>; node/<version>; <arch>)`, and
* agent loops add provider attribution headers (OpenRouter `HTTP-Referer` /
* `X-OpenRouter-Title`, NVIDIA `X-BILLING-INVOKE-ORIGIN`, OpenCode
* `x-opencode-client`). The detailed User-Agent fingerprints the host OS,
* runtime and CPU architecture, and attribution headers advertise the client
* stack to third parties; neither is needed for a request to succeed.
*
* - `attribution: null` turns attribution headers off, including the
*   attribution pi-agent-core's `DEFAULT_AGENT_IDENTITY` merges in.
* - `userAgent: "short"` is the least-revealing mode the identity API offers:
*   a constant `pi` with no version, OS, runtime or architecture. (Removing the
*   header outright would let underlying HTTP clients substitute their own
*   defaults, which can carry the same platform details.)
*
* Headers configured on the model/provider or passed per request still win
* over identity headers. Enclawed's provider request policy
* (provider-attribution.ts) adds no attribution of its own.
*/
const ENCLAWED_PI_CLIENT_IDENTITY = Object.freeze({
	userAgent: "short",
	attribution: null
});
/**
* `options` with Enclawed's identity, replacing any identity set by pi layers,
* and a fetch that removes provider-SDK telemetry (`X-Stainless-*` host, OS,
* architecture and runtime headers, and the SDK version in the User-Agent)
* from every HTTP request pi-ai sends for this call. It wraps the caller's
* fetch when one is set and otherwise `globalThis.fetch` at call time.
*
* Every pi-ai request Enclawed issues passes through here, in whichever
* process issues it, so the filter does not depend on any entrypoint having
* installed a global hook.
*/
function withEnclawedClientIdentity(options) {
	return {
		...options,
		identity: { ...ENCLAWED_PI_CLIENT_IDENTITY },
		fetch: withoutSdkTelemetryHeaders(options.fetch)
	};
}
/**
* Wrap a stream function so every request it sends carries Enclawed's
* identity, whatever identity the agent loop or an inner pi layer supplied.
*/
function wrapStreamFnWithEnclawedClientIdentity(streamFn) {
	return (model, context, options) => streamFn(model, context, withEnclawedClientIdentity(options ?? {}));
}
//#endregion
export { withEnclawedClientIdentity as n, wrapStreamFnWithEnclawedClientIdentity as r, ENCLAWED_PI_CLIENT_IDENTITY as t };
