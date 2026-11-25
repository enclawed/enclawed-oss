import "./defaults-Dz6Umtsd.js";
import { t as isCliProvider } from "./model-selection-cli-C4thDAEd.js";
import "./model-selection-D0i1_wAd.js";
import { o as updateSessionStore } from "./store-D4aRtgSD.js";
import "./sessions-BGiO5uqq.js";
import { l as setSessionRuntimeModel, n as mergeSessionEntry } from "./types-Bfn-Bwpu.js";
import { n as deriveSessionTotalTokens, r as hasNonzeroUsage } from "./usage-hvDXTFSH.js";
import { o as setCliSessionBinding, s as setCliSessionId } from "./cli-session-Cvs-f33M.js";
//#region src/agents/command/session-store.ts
let usageFormatModulePromise;
let contextModulePromise;
async function getUsageFormatModule() {
	usageFormatModulePromise ??= import("./usage-format-BvE8_eXr.js");
	return await usageFormatModulePromise;
}
async function getContextModule() {
	contextModulePromise ??= import("./context-DZbMH-DF.js");
	return await contextModulePromise;
}
function resolveNonNegativeNumber(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
async function updateSessionStoreAfterAgentRun(params) {
	const { cfg, sessionId, sessionKey, storePath, sessionStore, defaultProvider, defaultModel, fallbackProvider, fallbackModel, result } = params;
	const usage = result.meta.agentMeta?.usage;
	const promptTokens = result.meta.agentMeta?.promptTokens;
	const compactionsThisRun = Math.max(0, result.meta.agentMeta?.compactionCount ?? 0);
	const modelUsed = result.meta.agentMeta?.model ?? fallbackModel ?? defaultModel;
	const providerUsed = result.meta.agentMeta?.provider ?? fallbackProvider ?? defaultProvider;
	const contextTokens = typeof params.contextTokensOverride === "number" && params.contextTokensOverride > 0 ? params.contextTokensOverride : (await getContextModule()).resolveContextTokensForModel({
		cfg,
		provider: providerUsed,
		model: modelUsed,
		fallbackContextTokens: 2e5,
		allowAsyncLoad: false
	}) ?? 2e5;
	const entry = sessionStore[sessionKey] ?? {
		sessionId,
		updatedAt: Date.now()
	};
	const next = {
		...entry,
		sessionId,
		updatedAt: Date.now(),
		contextTokens
	};
	setSessionRuntimeModel(next, {
		provider: providerUsed,
		model: modelUsed
	});
	if (isCliProvider(providerUsed, cfg)) {
		const cliSessionBinding = result.meta.agentMeta?.cliSessionBinding;
		if (cliSessionBinding?.sessionId?.trim()) setCliSessionBinding(next, providerUsed, cliSessionBinding);
		else {
			const cliSessionId = result.meta.agentMeta?.sessionId?.trim();
			if (cliSessionId) setCliSessionId(next, providerUsed, cliSessionId);
		}
	}
	next.abortedLastRun = result.meta.aborted ?? false;
	if (result.meta.systemPromptReport) next.systemPromptReport = result.meta.systemPromptReport;
	if (hasNonzeroUsage(usage)) {
		const { estimateUsageCost, resolveModelCostConfig } = await getUsageFormatModule();
		const input = usage.input ?? 0;
		const output = usage.output ?? 0;
		const totalTokens = deriveSessionTotalTokens({
			usage: promptTokens ? void 0 : usage,
			contextTokens,
			promptTokens
		});
		const runEstimatedCostUsd = resolveNonNegativeNumber(estimateUsageCost({
			usage,
			cost: resolveModelCostConfig({
				provider: providerUsed,
				model: modelUsed,
				config: cfg
			})
		}));
		next.inputTokens = input;
		next.outputTokens = output;
		if (typeof totalTokens === "number" && Number.isFinite(totalTokens) && totalTokens > 0) {
			next.totalTokens = totalTokens;
			next.totalTokensFresh = true;
		} else {
			next.totalTokens = void 0;
			next.totalTokensFresh = false;
		}
		next.cacheRead = usage.cacheRead ?? 0;
		next.cacheWrite = usage.cacheWrite ?? 0;
		if (runEstimatedCostUsd !== void 0) next.estimatedCostUsd = (resolveNonNegativeNumber(entry.estimatedCostUsd) ?? 0) + runEstimatedCostUsd;
	}
	if (compactionsThisRun > 0) next.compactionCount = (entry.compactionCount ?? 0) + compactionsThisRun;
	sessionStore[sessionKey] = await updateSessionStore(storePath, (store) => {
		const merged = mergeSessionEntry(store[sessionKey], next);
		store[sessionKey] = merged;
		return merged;
	});
}
//#endregion
export { updateSessionStoreAfterAgentRun };
