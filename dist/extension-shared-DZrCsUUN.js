import { l as resolveDefaultSecretProviderAlias } from "./ref-contract-CXDupHS0.js";
import { r as hasEnvHttpProxyConfigured } from "./proxy-env-C6YBem4U.js";
import { i as runPassiveAccountLifecycle } from "./channel-lifecycle.core-Bo_gGSVW.js";
import { t as createLoggerBackedRuntime } from "./runtime-logger-b78FdXWe.js";
//#region src/plugin-sdk/extension-shared.ts
function buildPassiveChannelStatusSummary(snapshot, extra) {
	return {
		configured: snapshot.configured ?? false,
		...extra ?? {},
		running: snapshot.running ?? false,
		lastStartAt: snapshot.lastStartAt ?? null,
		lastStopAt: snapshot.lastStopAt ?? null,
		lastError: snapshot.lastError ?? null
	};
}
function buildPassiveProbedChannelStatusSummary(snapshot, extra) {
	return {
		...buildPassiveChannelStatusSummary(snapshot, extra),
		probe: snapshot.probe,
		lastProbeAt: snapshot.lastProbeAt ?? null
	};
}
function buildTrafficStatusSummary(snapshot) {
	return {
		lastInboundAt: snapshot?.lastInboundAt ?? null,
		lastOutboundAt: snapshot?.lastOutboundAt ?? null
	};
}
async function runStoppablePassiveMonitor(params) {
	await runPassiveAccountLifecycle({
		abortSignal: params.abortSignal,
		start: params.start,
		stop: async (monitor) => {
			monitor.stop();
		}
	});
}
function resolveLoggerBackedRuntime(runtime, logger) {
	return runtime ?? createLoggerBackedRuntime({
		logger,
		exitError: () => /* @__PURE__ */ new Error("Runtime exit not available")
	});
}
function requireChannelOpenAllowFrom(params) {
	params.requireOpenAllowFrom({
		policy: params.policy,
		allowFrom: params.allowFrom,
		ctx: params.ctx,
		path: ["allowFrom"],
		message: `channels.${params.channel}.dmPolicy="open" requires channels.${params.channel}.allowFrom to include "*"`
	});
}
function readStatusIssueFields(value, fields) {
	if (!value || typeof value !== "object") return null;
	const record = value;
	const result = {};
	for (const field of fields) result[field] = record[field];
	return result;
}
function coerceStatusIssueAccountId(value) {
	return typeof value === "string" ? value : typeof value === "number" ? String(value) : void 0;
}
function createDeferred() {
	let resolve;
	let reject;
	return {
		promise: new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		}),
		resolve,
		reject
	};
}
async function resolveAmbientNodeProxyAgent(params) {
	if (!hasEnvHttpProxyConfigured(params?.protocol ?? "https")) return;
	try {
		const { ProxyAgent } = await import("proxy-agent");
		params?.onUsingProxy?.();
		return new ProxyAgent();
	} catch (error) {
		params?.onError?.(error);
		return;
	}
}
const DEFAULT_PACKAGE_JSON_VERSION_CANDIDATES = [
	"./package.json",
	"../package.json",
	"../../package.json"
];
/**
* Reads the package version from the first candidate package.json that
* resolves under the consumer's require seam. Returns "unknown" if no
* candidate resolves. Centralises the source-vs-bundled-layout dance plugins
* need so they can advertise their version without hard-coding paths.
*/
function readPluginPackageVersion(params) {
	for (const candidate of params.candidates ?? DEFAULT_PACKAGE_JSON_VERSION_CANDIDATES) try {
		const version = params.require(candidate).version;
		if (typeof version === "string" && version.trim().length > 0) return version;
	} catch {}
	return params.fallback ?? "unknown";
}
/**
* Returns true when a secret reference {provider, id} can be resolved from
* process.env without writing or reading from secret-storage files. Used by
* extension scaffolding that needs to gate config-collection prompts on
* whether env-only resolution suffices.
*/
function canResolveEnvSecretRefInReadOnlyPath(params) {
	const providerConfig = params.cfg?.secrets?.providers?.[params.provider];
	if (!providerConfig) return params.provider === resolveDefaultSecretProviderAlias(params.cfg ?? {}, "env");
	if (providerConfig.source !== "env") return false;
	const allowlist = providerConfig.allowlist;
	return !allowlist || allowlist.includes(params.id);
}
//#endregion
export { coerceStatusIssueAccountId as a, readStatusIssueFields as c, resolveLoggerBackedRuntime as d, runStoppablePassiveMonitor as f, canResolveEnvSecretRefInReadOnlyPath as i, requireChannelOpenAllowFrom as l, buildPassiveProbedChannelStatusSummary as n, createDeferred as o, buildTrafficStatusSummary as r, readPluginPackageVersion as s, buildPassiveChannelStatusSummary as t, resolveAmbientNodeProxyAgent as u };
