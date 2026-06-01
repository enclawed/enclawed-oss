import { i as redactToolDetail } from "./redact-D4nea1HF.js";
import { i as formatErrorMessage } from "./errors-D8p6rxH8.js";
import { n as resolveEnclawedPackageRootSync } from "./enclawed-root-CTcOq9RL.js";
import { S as truncateUtf16Safe } from "./utils-CrVQlOZJ.js";
import { t as createSubsystemLogger } from "./subsystem-DTyALtnK.js";
import "./version-CeugVlbG.js";
import { n as resolveProviderIdForAuth } from "./provider-auth-aliases-BedcKmsr.js";
import "./agent-scope-D-lQQ64_.js";
import "./registry-Bj1z72i4.js";
import { s as joinPresentTextSegments, t as getGlobalHookRunner } from "./hook-runner-global-B18jmw-H.js";
import { r as PluginApprovalResolutions } from "./types-VxFFQ_Ma.js";
import { r as getActivePluginRegistry } from "./runtime-v-gfCtZv.js";
import { F as resolveProviderSystemPromptContribution } from "./provider-runtime-Bf8EdmFA.js";
import "./agent-paths-CK1LyoiU.js";
import "./session-write-lock-B7HIVMq0.js";
import { f as normalizeEmbeddedAgentRuntime } from "./attempt.tool-run-context-T9Y5X8Gu.js";
import { r as isSilentReplyPayloadText } from "./tokens-DEyoRqN5.js";
import { l as normalizeToolName } from "./tool-policy-Bkov0fJO.js";
import "./model-auth-m8tj01Sr.js";
import { o as logProviderToolSchemaDiagnostics, s as normalizeProviderToolSchemas } from "./attempt.thread-helpers-DzbwuuIA.js";
import "./logger-DPoiSUrL.js";
import { m as resolveSendableOutboundReplyParts } from "./reply-payload-Dibp0yeY.js";
import { r as resolveToolDisplay, t as formatToolDetail } from "./tool-display-CF_5zmiu.js";
import { d as runContextEngineMaintenance, n as buildAfterTurnRuntimeContextFromUsage, t as buildAfterTurnRuntimeContext } from "./attempt.prompt-helpers-BaHNznhx.js";
import { t as callGatewayTool } from "./gateway-DxzpW_Fw.js";
import { i as runBeforeToolCallHook, n as consumeAdjustedParamsForToolCall } from "./pi-tools.before-tool-call-Ba_x4gYA.js";
import "./nodes-utils-BQDNDJzx.js";
import "./runs-BK6SAvHE.js";
import "./sandbox-B3AYL5AZ.js";
import { h as isGpt5ModelId } from "./provider-model-shared-B5LoHGGO.js";
import { r as resolveTranscriptPolicy } from "./compaction-runtime-context-CFJTfTAd.js";
import { i as resolvePreparedExtraParams } from "./extra-params-DpRmUOh5.js";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
//#region src/infra/approval-display-paths.ts
function formatApprovalDisplayPath(value) {
	const normalized = value.trim();
	if (!normalized || hasRelativePathSegment(normalized)) return normalized;
	const unixHomeMatch = normalized.match(/^\/(?:home|Users)\/([^/]+)(.*)$/);
	if (unixHomeMatch && isSafeHomeSegment(unixHomeMatch[1])) return compactHomeSuffix(unixHomeMatch[2] ?? "");
	const windowsHomeMatch = normalized.match(/^[A-Za-z]:[\\/]Users[\\/]([^\\/]+)(.*)$/i);
	if (windowsHomeMatch && isSafeHomeSegment(windowsHomeMatch[1])) return compactHomeSuffix(windowsHomeMatch[2] ?? "");
	return normalized;
}
function compactHomeSuffix(suffix) {
	return `~${suffix.replace(/\\/g, "/")}`;
}
function isSafeHomeSegment(segment) {
	return segment !== void 0 && segment !== "." && segment !== "..";
}
function hasRelativePathSegment(value) {
	return /(^|[\\/])\.{1,2}(?=[\\/]|$)/.test(value);
}
async function runAgentCleanupStep(params) {
	const timeoutMs = Math.max(1, Math.floor(params.timeoutMs ?? 1e4));
	let timeoutHandle;
	let timedOut = false;
	const cleanupPromise = Promise.resolve().then(params.cleanup);
	const observedCleanupPromise = cleanupPromise.catch((error) => {
		if (!timedOut) params.log.warn(`agent cleanup failed: runId=${params.runId} sessionId=${params.sessionId} step=${params.step} error=${formatErrorMessage(error)}`);
	});
	const timeoutPromise = new Promise((resolve) => {
		timeoutHandle = setTimeout(() => {
			timedOut = true;
			resolve("timeout");
		}, timeoutMs);
		timeoutHandle.unref?.();
	});
	const result = await Promise.race([observedCleanupPromise.then(() => "done"), timeoutPromise]);
	if (timeoutHandle) clearTimeout(timeoutHandle);
	if (result === "timeout") {
		params.log.warn(`agent cleanup timed out: runId=${params.runId} sessionId=${params.sessionId} step=${params.step} timeoutMs=${timeoutMs}`);
		cleanupPromise.catch((error) => {
			params.log.warn(`agent cleanup rejected after timeout: runId=${params.runId} sessionId=${params.sessionId} step=${params.step} error=${formatErrorMessage(error)}`);
		});
	}
}
//#endregion
//#region src/agents/pi-embedded-runner/result-fallback-classifier.ts
const EMPTY_TERMINAL_REPLY_RE = /Agent couldn't generate a response/i;
const PLAN_ONLY_TERMINAL_REPLY_RE = /Agent stopped after repeated plan-only turns/i;
function isEmbeddedPiRunResult(value) {
	return Boolean(value && typeof value === "object" && "meta" in value && value.meta && typeof value.meta === "object");
}
function hasVisibleNonErrorPayload(result) {
	return (result.payloads ?? []).some((payload) => {
		if (!payload || payload.isError === true || payload.isReasoning === true) return false;
		return (typeof payload.text === "string" ? payload.text.trim() : "").length > 0 || Boolean(payload.mediaUrl) || Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0;
	});
}
function hasOutboundSideEffects(result) {
	return result.didSendViaMessagingTool === true || (result.messagingToolSentTexts?.length ?? 0) > 0 || (result.messagingToolSentMediaUrls?.length ?? 0) > 0 || (result.messagingToolSentTargets?.length ?? 0) > 0 || (result.successfulCronAdds ?? 0) > 0 || (result.meta.toolSummary?.calls ?? 0) > 0;
}
function hasDeliberateSilentTerminalReply(result) {
	return [result.meta.finalAssistantRawText, result.meta.finalAssistantVisibleText].some((text) => typeof text === "string" && isSilentReplyPayloadText(text));
}
function classifyHarnessResult(params) {
	switch (params.result.meta.agentHarnessResultClassification) {
		case "empty": return {
			message: `${params.provider}/${params.model} ended without a visible assistant reply`,
			reason: "format",
			code: "empty_result"
		};
		case "reasoning-only": return {
			message: `${params.provider}/${params.model} ended with reasoning only`,
			reason: "format",
			code: "reasoning_only_result"
		};
		case "planning-only": return {
			message: `${params.provider}/${params.model} exhausted plan-only retries without taking action`,
			reason: "format",
			code: "planning_only_result"
		};
		default: return null;
	}
}
function classifyEmbeddedPiRunResultForModelFallback(params) {
	if (!isEmbeddedPiRunResult(params.result)) return null;
	if (params.result.meta.aborted || params.hasDirectlySentBlockReply === true || params.hasBlockReplyPipelineOutput === true || hasVisibleNonErrorPayload(params.result)) return null;
	if (hasOutboundSideEffects(params.result)) return null;
	const harnessClassification = classifyHarnessResult({
		provider: params.provider,
		model: params.model,
		result: params.result
	});
	if (harnessClassification) return harnessClassification;
	const payloads = params.result.payloads ?? [];
	const errorText = payloads.filter((payload) => payload?.isError === true).map((payload) => typeof payload.text === "string" ? payload.text : "").join("\n");
	if (EMPTY_TERMINAL_REPLY_RE.test(errorText)) return {
		message: `${params.provider}/${params.model} ended with an incomplete terminal response`,
		reason: "format",
		code: "incomplete_result"
	};
	if (!isGpt5ModelId(params.model)) return null;
	if (payloads.length === 0 && hasDeliberateSilentTerminalReply(params.result)) return null;
	if (payloads.length === 0) return {
		message: `${params.provider}/${params.model} ended without a visible assistant reply`,
		reason: "format",
		code: "empty_result"
	};
	if (payloads.every((payload) => payload.isReasoning === true)) return {
		message: `${params.provider}/${params.model} ended with reasoning only`,
		reason: "format",
		code: "reasoning_only_result"
	};
	if (PLAN_ONLY_TERMINAL_REPLY_RE.test(errorText)) return {
		message: `${params.provider}/${params.model} exhausted plan-only retries without taking action`,
		reason: "format",
		code: "planning_only_result"
	};
	if (!EMPTY_TERMINAL_REPLY_RE.test(errorText)) return null;
	return {
		message: `${params.provider}/${params.model} ended with an incomplete terminal response`,
		reason: "format",
		code: "incomplete_result"
	};
}
//#endregion
//#region src/agents/runtime-plan/auth.ts
const CODEX_HARNESS_AUTH_PROVIDER = "openai-codex";
function resolveHarnessAuthProvider(params) {
	const harnessId = normalizeEmbeddedAgentRuntime(params.harnessId);
	const runtime = normalizeEmbeddedAgentRuntime(params.harnessRuntime);
	return harnessId === "codex" || runtime === "codex" ? CODEX_HARNESS_AUTH_PROVIDER : void 0;
}
function buildAgentRuntimeAuthPlan(params) {
	const aliasLookupParams = {
		config: params.config,
		workspaceDir: params.workspaceDir
	};
	const providerForAuth = resolveProviderIdForAuth(params.provider, aliasLookupParams);
	const authProfileProviderForAuth = resolveProviderIdForAuth(params.authProfileProvider ?? params.provider, aliasLookupParams);
	const harnessAuthProvider = resolveHarnessAuthProvider(params);
	const harnessProviderForAuth = harnessAuthProvider ? resolveProviderIdForAuth(harnessAuthProvider, aliasLookupParams) : void 0;
	const harnessCanForwardProfile = params.allowHarnessAuthProfileForwarding !== false && harnessProviderForAuth && harnessProviderForAuth === authProfileProviderForAuth;
	const canForwardProfile = providerForAuth === authProfileProviderForAuth || harnessCanForwardProfile;
	return {
		providerForAuth,
		authProfileProviderForAuth,
		...harnessProviderForAuth ? { harnessAuthProvider: harnessProviderForAuth } : {},
		...canForwardProfile ? { forwardedAuthProfileId: params.sessionAuthProfileId } : {}
	};
}
//#endregion
//#region src/agents/runtime-plan/build.ts
function formatResolvedRef(params) {
	return `${params.provider}/${params.modelId}`;
}
function hasMedia(payload) {
	return resolveSendableOutboundReplyParts(payload).hasMedia;
}
function asEnclawedConfig(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function asProviderRuntimeModel(value) {
	return value !== void 0 ? value : void 0;
}
function asThinkLevel(value) {
	return value !== void 0 ? value : void 0;
}
function buildAgentRuntimeDeliveryPlan(params) {
	asEnclawedConfig(params.config);
	return {
		isSilentPayload(payload) {
			return isSilentReplyPayloadText(payload.text, "NO_REPLY") && !hasMedia(payload);
		},
		resolveFollowupRoute() {}
	};
}
function buildAgentRuntimeOutcomePlan() {
	return { classifyRunResult: classifyEmbeddedPiRunResultForModelFallback };
}
function buildAgentRuntimePlan(params) {
	const config = asEnclawedConfig(params.config);
	const model = asProviderRuntimeModel(params.model);
	const modelApi = params.modelApi ?? params.model?.api ?? void 0;
	const transport = params.resolvedTransport;
	const auth = buildAgentRuntimeAuthPlan({
		provider: params.provider,
		authProfileProvider: params.authProfileProvider,
		sessionAuthProfileId: params.sessionAuthProfileId,
		config,
		workspaceDir: params.workspaceDir,
		harnessId: params.harnessId,
		harnessRuntime: params.harnessRuntime,
		allowHarnessAuthProfileForwarding: params.allowHarnessAuthProfileForwarding
	});
	const resolvedRef = {
		provider: params.provider,
		modelId: params.modelId,
		...modelApi ? { modelApi } : {},
		...params.harnessId ? { harnessId: params.harnessId } : {},
		...transport ? { transport } : {}
	};
	const toolContext = {
		provider: params.provider,
		config,
		workspaceDir: params.workspaceDir,
		env: process.env,
		modelId: params.modelId,
		modelApi,
		model
	};
	const resolveToolContext = (overrides) => ({
		...toolContext,
		...overrides?.workspaceDir !== void 0 ? { workspaceDir: overrides.workspaceDir } : {},
		...overrides?.modelApi !== void 0 ? { modelApi: overrides.modelApi } : {},
		...overrides?.model !== void 0 ? { model: asProviderRuntimeModel(overrides.model) } : {}
	});
	const resolveTranscriptRuntimePolicy = (overrides) => resolveTranscriptPolicy({
		provider: params.provider,
		modelId: params.modelId,
		config,
		workspaceDir: overrides?.workspaceDir ?? params.workspaceDir,
		env: process.env,
		modelApi: overrides?.modelApi ?? modelApi,
		model: asProviderRuntimeModel(overrides?.model) ?? model
	});
	const resolveTransportExtraParams = (overrides = {}) => resolvePreparedExtraParams({
		cfg: config,
		provider: params.provider,
		modelId: params.modelId,
		extraParamsOverride: overrides.extraParamsOverride ?? params.extraParamsOverride,
		thinkingLevel: asThinkLevel(overrides.thinkingLevel ?? params.thinkingLevel),
		agentId: overrides.agentId ?? params.agentId
	});
	return {
		resolvedRef,
		auth,
		prompt: {
			provider: params.provider,
			modelId: params.modelId,
			resolveSystemPromptContribution(context) {
				return resolveProviderSystemPromptContribution({
					provider: params.provider,
					config,
					workspaceDir: context.workspaceDir ?? params.workspaceDir,
					context: {
						...context,
						config: asEnclawedConfig(context.config)
					}
				});
			}
		},
		tools: {
			normalize(tools, overrides) {
				return normalizeProviderToolSchemas({
					...resolveToolContext(overrides),
					tools
				});
			},
			logDiagnostics(tools, overrides) {
				logProviderToolSchemaDiagnostics({
					...resolveToolContext(overrides),
					tools
				});
			}
		},
		transcript: {
			policy: resolveTranscriptRuntimePolicy(),
			resolvePolicy: resolveTranscriptRuntimePolicy
		},
		delivery: buildAgentRuntimeDeliveryPlan(params),
		outcome: buildAgentRuntimeOutcomePlan(),
		transport: {
			extraParams: resolveTransportExtraParams(),
			resolveExtraParams: resolveTransportExtraParams
		},
		observability: {
			resolvedRef: formatResolvedRef({
				provider: params.provider,
				modelId: params.modelId
			}),
			provider: params.provider,
			modelId: params.modelId,
			...modelApi ? { modelApi } : {},
			...params.harnessId ? { harnessId: params.harnessId } : {},
			...auth.forwardedAuthProfileId ? { authProfileId: auth.forwardedAuthProfileId } : {},
			...transport ? { transport } : {}
		}
	};
}
//#endregion
//#region src/auto-reply/heartbeat-tool-response.ts
const HEARTBEAT_RESPONSE_TOOL_NAME = "heartbeat_respond";
const HEARTBEAT_TOOL_OUTCOMES = [
	"no_change",
	"progress",
	"done",
	"blocked",
	"needs_attention"
];
const HEARTBEAT_TOOL_PRIORITIES = [
	"low",
	"normal",
	"high"
];
const OUTCOMES = new Set(HEARTBEAT_TOOL_OUTCOMES);
const PRIORITIES = new Set(HEARTBEAT_TOOL_PRIORITIES);
function isRecord$1(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readString(value) {
	return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function readStringAlias(record, ...keys) {
	for (const key of keys) {
		const value = readString(record[key]);
		if (value) return value;
	}
}
function readBooleanAlias(record, ...keys) {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "boolean") return value;
	}
}
function normalizeHeartbeatToolResponse(value) {
	if (!isRecord$1(value)) return;
	const outcome = readString(value.outcome);
	const notify = readBooleanAlias(value, "notify");
	const summary = readString(value.summary);
	if (!outcome || !OUTCOMES.has(outcome) || notify === void 0 || !summary) return;
	const priority = readString(value.priority);
	const notificationText = readStringAlias(value, "notificationText", "notification_text");
	const reason = readString(value.reason);
	const nextCheck = readStringAlias(value, "nextCheck", "next_check");
	return {
		outcome,
		notify,
		summary,
		...notificationText ? { notificationText } : {},
		...reason ? { reason } : {},
		...priority && PRIORITIES.has(priority) ? { priority } : {},
		...nextCheck ? { nextCheck } : {}
	};
}
//#endregion
//#region src/agents/runtime-plan/tools.ts
function runtimePlanToolContext(params) {
	return {
		workspaceDir: params.workspaceDir,
		modelApi: params.modelApi ?? void 0,
		model: params.model
	};
}
function normalizeAgentRuntimeTools(params) {
	const planContext = runtimePlanToolContext(params);
	return params.runtimePlan?.tools.normalize(params.tools, planContext) ?? normalizeProviderToolSchemas({
		tools: params.tools,
		provider: params.provider,
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env ?? process.env,
		modelId: params.modelId,
		modelApi: params.modelApi,
		model: params.model
	});
}
function logAgentRuntimeToolDiagnostics(params) {
	const planContext = runtimePlanToolContext(params);
	if (params.runtimePlan) {
		params.runtimePlan.tools.logDiagnostics(params.tools, planContext);
		return;
	}
	logProviderToolSchemaDiagnostics({
		tools: params.tools,
		provider: params.provider,
		config: params.config,
		workspaceDir: params.workspaceDir,
		env: params.env ?? process.env,
		modelId: params.modelId,
		modelApi: params.modelApi,
		model: params.model
	});
}
//#endregion
//#region src/agents/harness/hook-context.ts
function buildAgentHookContext(params) {
	return {
		runId: params.runId,
		...params.jobId ? { jobId: params.jobId } : {},
		...params.agentId ? { agentId: params.agentId } : {},
		...params.sessionKey ? { sessionKey: params.sessionKey } : {},
		...params.sessionId ? { sessionId: params.sessionId } : {},
		...params.workspaceDir ? { workspaceDir: params.workspaceDir } : {},
		...params.modelProviderId ? { modelProviderId: params.modelProviderId } : {},
		...params.modelId ? { modelId: params.modelId } : {},
		...params.messageProvider ? { messageProvider: params.messageProvider } : {},
		...params.trigger ? { trigger: params.trigger } : {},
		...params.channelId ? { channelId: params.channelId } : {}
	};
}
//#endregion
//#region src/agents/harness/prompt-compaction-hook-helpers.ts
const log$5 = createSubsystemLogger("agents/harness");
async function resolveAgentHarnessBeforePromptBuildResult(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_prompt_build") && !hookRunner?.hasHooks("before_agent_start")) return {
		prompt: params.prompt,
		developerInstructions: params.developerInstructions
	};
	const hookCtx = buildAgentHookContext(params.ctx);
	const promptEvent = {
		prompt: params.prompt,
		messages: params.messages
	};
	const promptBuildResult = hookRunner.hasHooks("before_prompt_build") ? await hookRunner.runBeforePromptBuild(promptEvent, hookCtx).catch((error) => {
		log$5.warn(`before_prompt_build hook failed: ${String(error)}`);
	}) : void 0;
	const legacyResult = hookRunner.hasHooks("before_agent_start") ? await hookRunner.runBeforeAgentStart(promptEvent, hookCtx).catch((error) => {
		log$5.warn(`before_agent_start hook (legacy prompt build path) failed: ${String(error)}`);
	}) : void 0;
	const systemPrompt = resolvePromptBuildSystemPrompt({
		developerInstructions: params.developerInstructions,
		promptBuildResult,
		legacyResult
	});
	return {
		prompt: joinPresentTextSegments([
			promptBuildResult?.prependContext,
			legacyResult?.prependContext,
			params.prompt
		]) ?? params.prompt,
		developerInstructions: joinPresentTextSegments([
			promptBuildResult?.prependSystemContext,
			legacyResult?.prependSystemContext,
			systemPrompt,
			promptBuildResult?.appendSystemContext,
			legacyResult?.appendSystemContext
		]) ?? systemPrompt
	};
}
function resolvePromptBuildSystemPrompt(params) {
	if (typeof params.promptBuildResult?.systemPrompt === "string") return params.promptBuildResult.systemPrompt;
	if (typeof params.legacyResult?.systemPrompt === "string") return params.legacyResult.systemPrompt;
	return params.developerInstructions;
}
async function runAgentHarnessBeforeCompactionHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_compaction")) return;
	try {
		await hookRunner.runBeforeCompaction({
			messageCount: params.messages.length,
			messages: params.messages,
			sessionFile: params.sessionFile
		}, buildAgentHookContext(params.ctx));
	} catch (error) {
		log$5.warn(`before_compaction hook failed: ${String(error)}`);
	}
}
async function runAgentHarnessAfterCompactionHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("after_compaction")) return;
	try {
		await hookRunner.runAfterCompaction({
			messageCount: params.messages.length,
			compactedCount: params.compactedCount,
			sessionFile: params.sessionFile
		}, buildAgentHookContext(params.ctx));
	} catch (error) {
		log$5.warn(`after_compaction hook failed: ${String(error)}`);
	}
}
//#endregion
//#region src/plugins/codex-app-server-extension-factory.ts
function listCodexAppServerExtensionFactories() {
	return getActivePluginRegistry()?.codexAppServerExtensionFactories?.map((entry) => entry.factory) ?? [];
}
//#endregion
//#region src/agents/harness/codex-app-server-extensions.ts
const log$4 = createSubsystemLogger("agents/harness");
function createCodexAppServerToolResultExtensionRunner(ctx, factories = listCodexAppServerExtensionFactories()) {
	const handlers = [];
	const runtime = { on(event, handler) {
		if (event === "tool_result") handlers.push(handler);
	} };
	const initPromise = (async () => {
		for (const factory of factories) await factory(runtime);
	})();
	return { async applyToolResultExtensions(event) {
		await initPromise;
		let current = event.result;
		for (const handler of handlers) try {
			const next = await handler({
				...event,
				result: current
			}, ctx);
			if (next?.result) current = next.result;
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			log$4.warn(`[codex] tool_result extension failed for ${event.toolName}: ${detail}`);
		}
		return current;
	} };
}
//#endregion
//#region src/agents/harness/tool-result-middleware.ts
const log$3 = createSubsystemLogger("agents/harness");
const MAX_MIDDLEWARE_CONTENT_BLOCKS = 200;
const MAX_MIDDLEWARE_TEXT_CHARS = 1e5;
const MAX_MIDDLEWARE_IMAGE_DATA_CHARS = 5e6;
const MAX_MIDDLEWARE_DETAILS_BYTES = 1e5;
const MAX_MIDDLEWARE_DETAILS_DEPTH = 20;
const MAX_MIDDLEWARE_DETAILS_KEYS = 1e3;
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isValidMiddlewareContentBlock(value) {
	if (!isRecord(value) || typeof value.type !== "string") return false;
	if (value.type === "text") return typeof value.text === "string" && value.text.length <= MAX_MIDDLEWARE_TEXT_CHARS;
	if (value.type === "image") return typeof value.mimeType === "string" && value.mimeType.trim().length > 0 && typeof value.data === "string" && value.data.length <= MAX_MIDDLEWARE_IMAGE_DATA_CHARS;
	return false;
}
function isValidMiddlewareDetails(value, state = {
	keys: 0,
	bytes: 0,
	seen: /* @__PURE__ */ new WeakSet()
}, depth = 0) {
	if (value === void 0 || value === null) return true;
	if (depth > MAX_MIDDLEWARE_DETAILS_DEPTH) return false;
	if (typeof value === "string") {
		state.bytes += value.length;
		return state.bytes <= MAX_MIDDLEWARE_DETAILS_BYTES;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		state.bytes += String(value).length;
		return state.bytes <= MAX_MIDDLEWARE_DETAILS_BYTES;
	}
	if (typeof value !== "object") return false;
	if (state.seen.has(value)) return false;
	state.seen.add(value);
	if (Array.isArray(value)) {
		state.keys += value.length;
		if (state.keys > MAX_MIDDLEWARE_DETAILS_KEYS) return false;
		for (const entry of value) if (!isValidMiddlewareDetails(entry, state, depth + 1)) return false;
		return true;
	}
	for (const [key, entry] of Object.entries(value)) {
		state.keys += 1;
		state.bytes += key.length;
		if (state.keys > MAX_MIDDLEWARE_DETAILS_KEYS || state.bytes > MAX_MIDDLEWARE_DETAILS_BYTES) return false;
		if (!isValidMiddlewareDetails(entry, state, depth + 1)) return false;
	}
	return true;
}
function isValidMiddlewareToolResult(value) {
	if (!isRecord(value) || !Array.isArray(value.content)) return false;
	if (value.content.length > MAX_MIDDLEWARE_CONTENT_BLOCKS) return false;
	return value.content.every(isValidMiddlewareContentBlock) && isValidMiddlewareDetails(value.details);
}
function buildMiddlewareFailureResult() {
	return {
		content: [{
			type: "text",
			text: "Tool output unavailable due to post-processing error."
		}],
		details: {
			status: "error",
			middlewareError: true
		}
	};
}
function createAgentToolResultMiddlewareRunner(ctx, handlers) {
	const middlewareContext = {
		...ctx,
		harness: ctx.harness ?? ctx.runtime
	};
	let resolvedHandlers = handlers;
	let resolvedHandlersPromise;
	const resolveHandlers = async () => {
		if (resolvedHandlers) return resolvedHandlers;
		resolvedHandlersPromise ??= import("./agent-tool-result-middleware-loader-4fbXs7M3.js").then(({ loadAgentToolResultMiddlewaresForRuntime }) => loadAgentToolResultMiddlewaresForRuntime({ runtime: ctx.runtime }));
		resolvedHandlers = await resolvedHandlersPromise;
		return resolvedHandlers;
	};
	return { async applyToolResultMiddleware(event) {
		let current = event.result;
		for (const handler of await resolveHandlers()) try {
			const candidate = (await handler({
				...event,
				result: current
			}, middlewareContext))?.result ?? current;
			if (isValidMiddlewareToolResult(candidate)) current = candidate;
			else {
				log$3.warn(`[${ctx.runtime}] discarded invalid tool result middleware output for ${truncateUtf16Safe(event.toolName, 120)}`);
				return buildMiddlewareFailureResult();
			}
		} catch {
			log$3.warn(`[${ctx.runtime}] tool result middleware failed for ${truncateUtf16Safe(event.toolName, 120)}`);
			return buildMiddlewareFailureResult();
		}
		return current;
	} };
}
//#endregion
//#region src/agents/harness/context-engine-lifecycle.ts
/**
* Run optional bootstrap + bootstrap maintenance for a harness-owned context engine.
*/
async function bootstrapHarnessContextEngine(params) {
	if (!params.hadSessionFile || !(params.contextEngine?.bootstrap || params.contextEngine?.maintain)) return;
	try {
		if (typeof params.contextEngine?.bootstrap === "function") await params.contextEngine.bootstrap({
			sessionId: params.sessionId,
			sessionKey: params.sessionKey,
			sessionFile: params.sessionFile
		});
		await (params.runMaintenance ?? runHarnessContextEngineMaintenance)({
			contextEngine: params.contextEngine,
			sessionId: params.sessionId,
			sessionKey: params.sessionKey,
			sessionFile: params.sessionFile,
			reason: "bootstrap",
			sessionManager: params.sessionManager,
			runtimeContext: params.runtimeContext
		});
	} catch (bootstrapErr) {
		params.warn(`context engine bootstrap failed: ${String(bootstrapErr)}`);
	}
}
/**
* Assemble model context through the active harness-owned context engine.
*/
async function assembleHarnessContextEngine(params) {
	if (!params.contextEngine) return;
	return await params.contextEngine.assemble({
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		messages: params.messages,
		tokenBudget: params.tokenBudget,
		...params.availableTools ? { availableTools: params.availableTools } : {},
		...params.citationsMode ? { citationsMode: params.citationsMode } : {},
		model: params.modelId,
		...params.prompt !== void 0 ? { prompt: params.prompt } : {}
	});
}
/**
* Finalize a completed harness turn via afterTurn or ingest fallbacks.
*/
async function finalizeHarnessContextEngineTurn(params) {
	if (!params.contextEngine) return { postTurnFinalizationSucceeded: true };
	let postTurnFinalizationSucceeded = true;
	if (typeof params.contextEngine.afterTurn === "function") try {
		await params.contextEngine.afterTurn({
			sessionId: params.sessionIdUsed,
			sessionKey: params.sessionKey,
			sessionFile: params.sessionFile,
			messages: params.messagesSnapshot,
			prePromptMessageCount: params.prePromptMessageCount,
			tokenBudget: params.tokenBudget,
			runtimeContext: params.runtimeContext
		});
	} catch (afterTurnErr) {
		postTurnFinalizationSucceeded = false;
		params.warn(`context engine afterTurn failed: ${String(afterTurnErr)}`);
	}
	else {
		const newMessages = params.messagesSnapshot.slice(params.prePromptMessageCount);
		if (newMessages.length > 0) if (typeof params.contextEngine.ingestBatch === "function") try {
			await params.contextEngine.ingestBatch({
				sessionId: params.sessionIdUsed,
				sessionKey: params.sessionKey,
				messages: newMessages
			});
		} catch (ingestErr) {
			postTurnFinalizationSucceeded = false;
			params.warn(`context engine ingest failed: ${String(ingestErr)}`);
		}
		else for (const msg of newMessages) try {
			await params.contextEngine.ingest?.({
				sessionId: params.sessionIdUsed,
				sessionKey: params.sessionKey,
				message: msg
			});
		} catch (ingestErr) {
			postTurnFinalizationSucceeded = false;
			params.warn(`context engine ingest failed: ${String(ingestErr)}`);
		}
	}
	if (!params.promptError && !params.aborted && !params.yieldAborted && postTurnFinalizationSucceeded) await (params.runMaintenance ?? runHarnessContextEngineMaintenance)({
		contextEngine: params.contextEngine,
		sessionId: params.sessionIdUsed,
		sessionKey: params.sessionKey,
		sessionFile: params.sessionFile,
		reason: "turn",
		sessionManager: params.sessionManager,
		runtimeContext: params.runtimeContext
	});
	return { postTurnFinalizationSucceeded };
}
/**
* Build runtime context passed into harness context-engine hooks.
*/
function buildHarnessContextEngineRuntimeContext(params) {
	return buildAfterTurnRuntimeContext(params);
}
/**
* Build runtime context passed into harness context-engine hooks from usage data.
*/
function buildHarnessContextEngineRuntimeContextFromUsage(params) {
	return buildAfterTurnRuntimeContextFromUsage(params);
}
/**
* Run optional transcript maintenance for a harness-owned context engine.
*/
async function runHarnessContextEngineMaintenance(params) {
	return await runContextEngineMaintenance({
		contextEngine: params.contextEngine,
		sessionId: params.sessionId,
		sessionKey: params.sessionKey,
		sessionFile: params.sessionFile,
		reason: params.reason,
		sessionManager: params.sessionManager,
		runtimeContext: params.runtimeContext,
		executionMode: params.executionMode
	});
}
/**
* Return true when a non-legacy context engine should affect plugin harness behavior.
*/
function isActiveHarnessContextEngine(contextEngine) {
	return Boolean(contextEngine && contextEngine.info.id !== "legacy");
}
//#endregion
//#region src/agents/harness/hook-helpers.ts
const log$2 = createSubsystemLogger("agents/harness");
async function runAgentHarnessAfterToolCallHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("after_tool_call")) return;
	const adjustedArgs = consumeAdjustedParamsForToolCall(params.toolCallId, params.runId);
	const eventArgs = adjustedArgs && typeof adjustedArgs === "object" ? adjustedArgs : params.startArgs;
	try {
		await hookRunner.runAfterToolCall({
			toolName: params.toolName,
			params: eventArgs,
			...params.runId ? { runId: params.runId } : {},
			toolCallId: params.toolCallId,
			...params.result ? { result: params.result } : {},
			...params.error ? { error: params.error } : {},
			...params.startedAt != null ? { durationMs: Date.now() - params.startedAt } : {}
		}, {
			toolName: params.toolName,
			...params.agentId ? { agentId: params.agentId } : {},
			...params.sessionId ? { sessionId: params.sessionId } : {},
			...params.sessionKey ? { sessionKey: params.sessionKey } : {},
			...params.runId ? { runId: params.runId } : {},
			toolCallId: params.toolCallId
		});
	} catch (error) {
		log$2.warn(`after_tool_call hook failed: tool=${params.toolName} error=${String(error)}`);
	}
}
function runAgentHarnessBeforeMessageWriteHook(params) {
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_message_write")) return params.message;
	const result = hookRunner.runBeforeMessageWrite({ message: params.message }, {
		...params.agentId ? { agentId: params.agentId } : {},
		...params.sessionKey ? { sessionKey: params.sessionKey } : {}
	});
	if (result?.block) return null;
	return result?.message ?? params.message;
}
//#endregion
//#region src/agents/harness/lifecycle-hook-helpers.ts
const log$1 = createSubsystemLogger("agents/harness");
function runAgentHarnessLlmInputHook(params) {
	const hookRunner = params.hookRunner ?? getGlobalHookRunner();
	if (!hookRunner?.hasHooks("llm_input") || typeof hookRunner.runLlmInput !== "function") return;
	hookRunner.runLlmInput(params.event, buildAgentHookContext(params.ctx)).catch((error) => {
		log$1.warn(`llm_input hook failed: ${String(error)}`);
	});
}
function runAgentHarnessLlmOutputHook(params) {
	const hookRunner = params.hookRunner ?? getGlobalHookRunner();
	if (!hookRunner?.hasHooks("llm_output") || typeof hookRunner.runLlmOutput !== "function") return;
	hookRunner.runLlmOutput(params.event, buildAgentHookContext(params.ctx)).catch((error) => {
		log$1.warn(`llm_output hook failed: ${String(error)}`);
	});
}
function runAgentHarnessAgentEndHook(params) {
	const hookRunner = params.hookRunner ?? getGlobalHookRunner();
	if (!hookRunner?.hasHooks("agent_end") || typeof hookRunner.runAgentEnd !== "function") return;
	hookRunner.runAgentEnd(params.event, buildAgentHookContext(params.ctx)).catch((error) => {
		log$1.warn(`agent_end hook failed: ${String(error)}`);
	});
}
async function runAgentHarnessBeforeAgentFinalizeHook(params) {
	const hookRunner = params.hookRunner ?? getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_agent_finalize") || typeof hookRunner.runBeforeAgentFinalize !== "function") return { action: "continue" };
	try {
		return normalizeBeforeAgentFinalizeResult(await hookRunner.runBeforeAgentFinalize(params.event, buildAgentHookContext(params.ctx)));
	} catch (error) {
		log$1.warn(`before_agent_finalize hook failed: ${String(error)}`);
		return { action: "continue" };
	}
}
function normalizeBeforeAgentFinalizeResult(result) {
	if (result?.action === "finalize") return result.reason?.trim() ? {
		action: "finalize",
		reason: result.reason.trim()
	} : { action: "finalize" };
	if (result?.action === "revise") {
		const reason = result.reason?.trim();
		return reason ? {
			action: "revise",
			reason
		} : { action: "continue" };
	}
	return { action: "continue" };
}
//#endregion
//#region src/agents/harness/native-hook-relay.ts
const NATIVE_HOOK_RELAY_EVENTS = [
	"pre_tool_use",
	"post_tool_use",
	"permission_request",
	"before_agent_finalize"
];
const DEFAULT_RELAY_TTL_MS = 1800 * 1e3;
const DEFAULT_RELAY_TIMEOUT_MS = 5e3;
const DEFAULT_PERMISSION_TIMEOUT_MS = 12e4;
const MAX_NATIVE_HOOK_RELAY_INVOCATIONS = 200;
const MAX_NATIVE_HOOK_RELAY_JSON_DEPTH = 64;
const MAX_NATIVE_HOOK_RELAY_JSON_NODES = 2e4;
const MAX_NATIVE_HOOK_RELAY_STRING_LENGTH = 1e6;
const MAX_NATIVE_HOOK_RELAY_TOTAL_STRING_LENGTH = 4e6;
const MAX_NATIVE_HOOK_RELAY_HISTORY_STRING_LENGTH = 4e3;
const MAX_NATIVE_HOOK_RELAY_HISTORY_TOTAL_STRING_LENGTH = 2e4;
const MAX_NATIVE_HOOK_RELAY_HISTORY_ARRAY_ITEMS = 50;
const MAX_NATIVE_HOOK_RELAY_HISTORY_OBJECT_KEYS = 50;
const MAX_PERMISSION_FALLBACK_KEYS = 200;
const MAX_PERMISSION_FALLBACK_KEY_CHARS = 240;
const MAX_PERMISSION_FINGERPRINT_SORT_KEYS = 200;
const MAX_APPROVAL_TITLE_LENGTH = 80;
const MAX_APPROVAL_DESCRIPTION_LENGTH = 700;
const MAX_PERMISSION_APPROVALS_PER_WINDOW = 12;
const PERMISSION_APPROVAL_WINDOW_MS = 6e4;
const MAX_NATIVE_HOOK_BRIDGE_BODY_BYTES = 5e6;
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
const relays = /* @__PURE__ */ new Map();
const relayBridges = /* @__PURE__ */ new Map();
const invocations = [];
const pendingPermissionApprovals = /* @__PURE__ */ new Map();
const permissionApprovalWindows = /* @__PURE__ */ new Map();
const log = createSubsystemLogger("agents/harness/native-hook-relay");
let nativeHookRelayPermissionApprovalRequester = requestNativeHookRelayPermissionApproval;
const nativeHookRelayProviderAdapters = { codex: {
	normalizeMetadata: normalizeCodexHookMetadata,
	readToolInput: readCodexToolInput,
	readToolResponse: readCodexToolResponse,
	renderNoopResponse: () => {
		return {
			stdout: "",
			stderr: "",
			exitCode: 0
		};
	},
	renderPreToolUseBlockResponse: (reason) => ({
		stdout: `${JSON.stringify({ hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason: reason
		} })}\n`,
		stderr: "",
		exitCode: 0
	}),
	renderBeforeAgentFinalizeReviseResponse: (reason) => ({
		stdout: `${JSON.stringify({
			decision: "block",
			reason
		})}\n`,
		stderr: "",
		exitCode: 0
	}),
	renderBeforeAgentFinalizeStopResponse: (reason) => ({
		stdout: `${JSON.stringify({
			continue: false,
			...reason?.trim() ? { stopReason: reason.trim() } : {}
		})}\n`,
		stderr: "",
		exitCode: 0
	}),
	renderPermissionDecisionResponse: (decision, message) => ({
		stdout: `${JSON.stringify({ hookSpecificOutput: {
			hookEventName: "PermissionRequest",
			decision: decision === "allow" ? { behavior: "allow" } : {
				behavior: "deny",
				message: message?.trim() || "Denied by Enclawed"
			}
		} })}\n`,
		stderr: "",
		exitCode: 0
	})
} };
function registerNativeHookRelay(params) {
	pruneExpiredNativeHookRelays();
	const relayId = normalizeRelayId(params.relayId) ?? randomUUID();
	const allowedEvents = normalizeAllowedEvents(params.allowedEvents);
	unregisterNativeHookRelay(relayId);
	const registration = {
		relayId,
		provider: params.provider,
		...params.agentId ? { agentId: params.agentId } : {},
		sessionId: params.sessionId,
		...params.sessionKey ? { sessionKey: params.sessionKey } : {},
		runId: params.runId,
		allowedEvents,
		expiresAtMs: Date.now() + normalizePositiveInteger(params.ttlMs, DEFAULT_RELAY_TTL_MS),
		...params.signal ? { signal: params.signal } : {}
	};
	relays.set(relayId, registration);
	registerNativeHookRelayBridge(registration);
	return {
		...registration,
		commandForEvent: (event) => buildNativeHookRelayCommand({
			provider: params.provider,
			relayId,
			event,
			timeoutMs: params.command?.timeoutMs,
			executable: params.command?.executable,
			nodeExecutable: params.command?.nodeExecutable
		}),
		unregister: () => unregisterNativeHookRelay(relayId)
	};
}
function unregisterNativeHookRelay(relayId) {
	unregisterNativeHookRelayBridge(relayId);
	relays.delete(relayId);
	removeNativeHookRelayInvocations(relayId);
	removeNativeHookRelayPermissionState(relayId);
}
function normalizeRelayId(value) {
	const trimmed = value?.trim();
	if (!trimmed) return;
	if (trimmed.length > 160 || !/^[A-Za-z0-9._:-]+$/u.test(trimmed)) throw new Error("native hook relay id must be non-empty, compact, and URL-safe");
	return trimmed;
}
function buildNativeHookRelayCommand(params) {
	const timeoutMs = normalizePositiveInteger(params.timeoutMs, DEFAULT_RELAY_TIMEOUT_MS);
	const executable = params.executable ?? resolveEnclawedCliExecutable();
	return shellQuoteArgs([
		...executable === "enclawed" ? ["enclawed"] : [params.nodeExecutable ?? process.execPath, executable],
		"hooks",
		"relay",
		"--provider",
		params.provider,
		"--relay-id",
		params.relayId,
		"--event",
		params.event,
		"--timeout",
		String(timeoutMs)
	]);
}
async function invokeNativeHookRelay(params) {
	const provider = readNativeHookRelayProvider(params.provider);
	const relayId = readNonEmptyString(params.relayId, "relayId");
	const event = readNativeHookRelayEvent(params.event);
	const registration = relays.get(relayId);
	if (!registration) {
		pruneExpiredNativeHookRelays();
		throw new Error("native hook relay not found");
	}
	if (Date.now() > registration.expiresAtMs) {
		relays.delete(relayId);
		removeNativeHookRelayInvocations(relayId);
		throw new Error("native hook relay expired");
	}
	if (registration.provider !== provider) throw new Error("native hook relay provider mismatch");
	if (!registration.allowedEvents.includes(event)) throw new Error("native hook relay event not allowed");
	if (!isJsonValue(params.rawPayload)) throw new Error("native hook relay payload must be JSON-compatible");
	const normalized = normalizeNativeHookInvocation({
		registration,
		event,
		rawPayload: params.rawPayload
	});
	recordNativeHookRelayInvocation(normalized);
	return processNativeHookRelayInvocation({
		registration,
		invocation: normalized,
		adapter: getNativeHookRelayProviderAdapter(provider)
	});
}
function recordNativeHookRelayInvocation(invocation) {
	invocations.push({
		...invocation,
		rawPayload: snapshotNativeHookRelayPayload(invocation.rawPayload)
	});
	if (invocations.length > MAX_NATIVE_HOOK_RELAY_INVOCATIONS) invocations.splice(0, invocations.length - MAX_NATIVE_HOOK_RELAY_INVOCATIONS);
}
function removeNativeHookRelayInvocations(relayId) {
	for (let index = invocations.length - 1; index >= 0; index -= 1) if (invocations[index]?.relayId === relayId) invocations.splice(index, 1);
}
function pruneExpiredNativeHookRelays(now = Date.now()) {
	for (const [relayId, registration] of relays) if (now > registration.expiresAtMs) {
		relays.delete(relayId);
		unregisterNativeHookRelayBridge(relayId);
		removeNativeHookRelayInvocations(relayId);
	}
}
function registerNativeHookRelayBridge(registration) {
	unregisterNativeHookRelayBridge(registration.relayId);
	const token = randomUUID();
	const bridgeDir = ensureNativeHookRelayBridgeDir();
	const bridgeKey = nativeHookRelayBridgeKey(registration.relayId);
	const registryPath = path.join(bridgeDir, `${bridgeKey}.json`);
	const server = createServer((req, res) => {
		handleNativeHookRelayBridgeRequest(req, res, {
			provider: registration.provider,
			relayId: registration.relayId,
			token
		});
	});
	const bridge = {
		relayId: registration.relayId,
		registryPath,
		token,
		server
	};
	relayBridges.set(registration.relayId, bridge);
	server.on("error", (error) => {
		log.debug("native hook relay bridge server error", {
			error,
			relayId: registration.relayId
		});
	});
	server.listen(0, "127.0.0.1", () => {
		if (relayBridges.get(registration.relayId) !== bridge) return;
		const address = server.address();
		if (!address || typeof address === "string") {
			log.debug("native hook relay bridge server address unavailable", { relayId: registration.relayId });
			return;
		}
		writeNativeHookRelayBridgeRecord(registryPath, {
			version: 1,
			relayId: registration.relayId,
			pid: process.pid,
			hostname: "127.0.0.1",
			port: address.port,
			token,
			expiresAtMs: registration.expiresAtMs
		});
	});
	server.unref();
}
function unregisterNativeHookRelayBridge(relayId) {
	const bridge = relayBridges.get(relayId);
	if (!bridge) return;
	relayBridges.delete(relayId);
	bridge.server.close();
	if (readNativeHookRelayBridgeRecordIfExists(relayId)?.token === bridge.token) rmSync(bridge.registryPath, { force: true });
}
async function handleNativeHookRelayBridgeRequest(req, res, auth) {
	try {
		if (req.method !== "POST" || req.url !== "/invoke") {
			writeNativeHookRelayBridgeJson(res, 404, {
				ok: false,
				error: "not found"
			});
			return;
		}
		if (req.headers.authorization !== `Bearer ${auth.token}`) {
			writeNativeHookRelayBridgeJson(res, 403, {
				ok: false,
				error: "forbidden"
			});
			return;
		}
		const body = await readNativeHookRelayBridgeBody(req);
		const payload = readNativeHookRelayBridgePayload(JSON.parse(body));
		if (payload.provider !== auth.provider || payload.relayId !== auth.relayId) {
			writeNativeHookRelayBridgeJson(res, 403, {
				ok: false,
				error: "native hook relay bridge target mismatch"
			});
			return;
		}
		writeNativeHookRelayBridgeJson(res, 200, {
			ok: true,
			result: await invokeNativeHookRelay(payload)
		});
	} catch (error) {
		writeNativeHookRelayBridgeJson(res, 500, {
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		});
	}
}
async function readNativeHookRelayBridgeBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		total += buffer.byteLength;
		if (total > MAX_NATIVE_HOOK_BRIDGE_BODY_BYTES) throw new Error("native hook relay bridge payload too large");
		chunks.push(buffer);
	}
	return Buffer.concat(chunks, total).toString("utf8");
}
function readNativeHookRelayBridgePayload(value) {
	if (!isJsonObject(value)) throw new Error("native hook relay bridge payload must be an object");
	return {
		provider: value.provider,
		relayId: value.relayId,
		event: value.event,
		rawPayload: value.rawPayload
	};
}
function writeNativeHookRelayBridgeJson(res, statusCode, payload) {
	const body = JSON.stringify(payload);
	res.writeHead(statusCode, {
		"content-type": "application/json",
		"content-length": Buffer.byteLength(body)
	});
	res.end(body);
}
function readNativeHookRelayBridgeRecordIfExists(relayId) {
	const registryPath = nativeHookRelayBridgeRegistryPath(relayId);
	try {
		const parsed = JSON.parse(readFileSync(registryPath, "utf8"));
		if (isNativeHookRelayBridgeRecord(parsed, relayId)) return parsed;
	} catch (error) {
		if (error.code !== "ENOENT") log.debug("failed to read native hook relay bridge registry", {
			error,
			relayId
		});
	}
}
function isNativeHookRelayBridgeRecord(value, relayId) {
	return isJsonObject(value) && value.version === 1 && value.relayId === relayId && typeof value.pid === "number" && Number.isInteger(value.pid) && value.hostname === "127.0.0.1" && typeof value.port === "number" && Number.isInteger(value.port) && value.port > 0 && value.port <= 65535 && typeof value.token === "string" && value.token.length > 0 && typeof value.expiresAtMs === "number";
}
function nativeHookRelayBridgeDir() {
	const uid = typeof process.getuid === "function" ? process.getuid() : "nouid";
	return path.join(tmpdir(), `enclawed-native-hook-relays-${uid}`);
}
function ensureNativeHookRelayBridgeDir() {
	const bridgeDir = nativeHookRelayBridgeDir();
	mkdirSync(bridgeDir, {
		recursive: true,
		mode: 448
	});
	const stats = lstatSync(bridgeDir);
	const expectedUid = typeof process.getuid === "function" ? process.getuid() : void 0;
	if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("unsafe native hook relay bridge directory");
	if (expectedUid !== void 0 && stats.uid !== expectedUid) throw new Error("unsafe native hook relay bridge directory owner");
	if ((stats.mode & 63) !== 0) {
		chmodSync(bridgeDir, 448);
		if ((lstatSync(bridgeDir).mode & 63) !== 0) throw new Error("unsafe native hook relay bridge directory permissions");
	}
	return bridgeDir;
}
function writeNativeHookRelayBridgeRecord(registryPath, record) {
	const tempPath = path.join(path.dirname(registryPath), `.${path.basename(registryPath)}.${process.pid}.${randomUUID()}.tmp`);
	try {
		writeFileSync(tempPath, `${JSON.stringify(record)}\n`, {
			mode: 384,
			flag: "wx"
		});
		renameSync(tempPath, registryPath);
		chmodSync(registryPath, 384);
	} catch (error) {
		rmSync(tempPath, { force: true });
		throw error;
	}
}
function nativeHookRelayBridgeRegistryPath(relayId) {
	return path.join(nativeHookRelayBridgeDir(), `${nativeHookRelayBridgeKey(relayId)}.json`);
}
function nativeHookRelayBridgeKey(relayId) {
	return createHash("sha256").update(relayId).digest("hex").slice(0, 32);
}
async function processNativeHookRelayInvocation(params) {
	if (params.invocation.event === "pre_tool_use") return runNativeHookRelayPreToolUse(params);
	if (params.invocation.event === "post_tool_use") return runNativeHookRelayPostToolUse(params);
	if (params.invocation.event === "before_agent_finalize") return runNativeHookRelayBeforeAgentFinalize(params);
	return runNativeHookRelayPermissionRequest(params);
}
async function runNativeHookRelayPreToolUse(params) {
	const outcome = await runBeforeToolCallHook({
		toolName: normalizeNativeHookToolName(params.invocation.toolName),
		params: params.adapter.readToolInput(params.invocation.rawPayload),
		...params.invocation.toolUseId ? { toolCallId: params.invocation.toolUseId } : {},
		signal: params.registration.signal,
		ctx: {
			...params.registration.agentId ? { agentId: params.registration.agentId } : {},
			sessionId: params.registration.sessionId,
			...params.registration.sessionKey ? { sessionKey: params.registration.sessionKey } : {},
			runId: params.registration.runId
		}
	});
	if (outcome.blocked) return params.adapter.renderPreToolUseBlockResponse(outcome.reason);
	return params.adapter.renderNoopResponse(params.invocation.event);
}
async function runNativeHookRelayPostToolUse(params) {
	await runAgentHarnessAfterToolCallHook({
		toolName: normalizeNativeHookToolName(params.invocation.toolName),
		toolCallId: params.invocation.toolUseId ?? `${params.invocation.event}:${params.invocation.receivedAt}`,
		runId: params.registration.runId,
		...params.registration.agentId ? { agentId: params.registration.agentId } : {},
		sessionId: params.registration.sessionId,
		...params.registration.sessionKey ? { sessionKey: params.registration.sessionKey } : {},
		startArgs: params.adapter.readToolInput(params.invocation.rawPayload),
		result: params.adapter.readToolResponse(params.invocation.rawPayload)
	});
	return params.adapter.renderNoopResponse(params.invocation.event);
}
async function runNativeHookRelayPermissionRequest(params) {
	const request = {
		provider: params.registration.provider,
		...params.registration.agentId ? { agentId: params.registration.agentId } : {},
		sessionId: params.registration.sessionId,
		...params.registration.sessionKey ? { sessionKey: params.registration.sessionKey } : {},
		runId: params.registration.runId,
		toolName: normalizeNativeHookToolName(params.invocation.toolName),
		...params.invocation.toolUseId ? { toolCallId: params.invocation.toolUseId } : {},
		...params.invocation.cwd ? { cwd: params.invocation.cwd } : {},
		...params.invocation.model ? { model: params.invocation.model } : {},
		toolInput: params.adapter.readToolInput(params.invocation.rawPayload),
		...params.registration.signal ? { signal: params.registration.signal } : {}
	};
	const approvalKey = nativeHookRelayPermissionApprovalKey({
		registration: params.registration,
		request
	});
	const pendingApproval = pendingPermissionApprovals.get(approvalKey);
	try {
		const decision = await (pendingApproval ?? startNativeHookRelayPermissionApprovalWithBudget({
			registration: params.registration,
			approvalKey,
			request
		}));
		if (decision === "allow") return params.adapter.renderPermissionDecisionResponse("allow");
		if (decision === "deny") return params.adapter.renderPermissionDecisionResponse("deny", "Denied by user");
	} catch (error) {
		log.warn(`native hook permission approval failed; deferring to provider approval path: ${String(error)}`);
	}
	return params.adapter.renderNoopResponse(params.invocation.event);
}
async function runNativeHookRelayBeforeAgentFinalize(params) {
	const outcome = await runAgentHarnessBeforeAgentFinalizeHook({
		event: {
			runId: params.registration.runId,
			sessionId: params.registration.sessionId,
			...params.registration.sessionKey ? { sessionKey: params.registration.sessionKey } : {},
			...params.invocation.turnId ? { turnId: params.invocation.turnId } : {},
			provider: params.registration.provider,
			...params.invocation.model ? { model: params.invocation.model } : {},
			...params.invocation.cwd ? { cwd: params.invocation.cwd } : {},
			...params.invocation.transcriptPath ? { transcriptPath: params.invocation.transcriptPath } : {},
			stopHookActive: params.invocation.stopHookActive === true,
			...params.invocation.lastAssistantMessage ? { lastAssistantMessage: params.invocation.lastAssistantMessage } : {}
		},
		ctx: {
			...params.registration.agentId ? { agentId: params.registration.agentId } : {},
			sessionId: params.registration.sessionId,
			...params.registration.sessionKey ? { sessionKey: params.registration.sessionKey } : {},
			runId: params.registration.runId,
			...params.invocation.cwd ? { workspaceDir: params.invocation.cwd } : {},
			...params.invocation.model ? { modelId: params.invocation.model } : {}
		}
	});
	if (outcome.action === "revise") return params.adapter.renderBeforeAgentFinalizeReviseResponse(outcome.reason);
	if (outcome.action === "finalize") return params.adapter.renderBeforeAgentFinalizeStopResponse(outcome.reason);
	return params.adapter.renderNoopResponse(params.invocation.event);
}
async function startNativeHookRelayPermissionApprovalWithBudget(params) {
	if (!consumeNativeHookRelayPermissionBudget(params.registration.relayId)) {
		log.warn(`native hook permission approval rate limit exceeded; deferring to provider approval path: relay=${params.registration.relayId} run=${params.registration.runId}`);
		return "defer";
	}
	const approval = nativeHookRelayPermissionApprovalRequester(params.request).finally(() => {
		pendingPermissionApprovals.delete(params.approvalKey);
	});
	pendingPermissionApprovals.set(params.approvalKey, approval);
	return approval;
}
function nativeHookRelayPermissionApprovalKey(params) {
	return [
		params.registration.relayId,
		params.registration.runId,
		params.request.toolCallId ? `call:${params.request.toolCallId}` : permissionRequestFallbackKey(params.request),
		permissionRequestContentFingerprint(params.request)
	].join(":");
}
function permissionRequestFallbackKey(request) {
	const command = readOptionalString(request.toolInput.command);
	if (command) return `${request.toolName}:command:${truncateText(command, 240)}`;
	return `${request.toolName}:keys:${permissionRequestToolInputKeyFingerprint(request.toolInput)}`;
}
function permissionRequestToolInputKeyFingerprint(toolInput) {
	let fingerprint = "";
	const { keys, truncated } = readBoundedOwnKeys(toolInput, MAX_PERMISSION_FALLBACK_KEYS);
	for (const key of keys) {
		const separator = fingerprint ? "," : "";
		const remaining = MAX_PERMISSION_FALLBACK_KEY_CHARS - fingerprint.length - separator.length;
		if (remaining <= 0) break;
		fingerprint += `${separator}${key.slice(0, remaining)}`;
	}
	if (truncated && fingerprint.length < MAX_PERMISSION_FALLBACK_KEY_CHARS) fingerprint += `${fingerprint ? "," : ""}...`.slice(0, MAX_PERMISSION_FALLBACK_KEY_CHARS - fingerprint.length);
	return fingerprint || "none";
}
function permissionRequestContentFingerprint(request) {
	const hash = createHash("sha256");
	hash.update(request.toolName);
	hash.update("\0");
	updateJsonHash(hash, request.toolInput);
	return hash.digest("hex");
}
function updateJsonHash(hash, value) {
	if (value === null) {
		hash.update("null");
		return;
	}
	if (typeof value === "string") {
		hash.update("string:");
		hash.update(JSON.stringify(value));
		return;
	}
	if (typeof value === "number") {
		hash.update(`number:${String(value)}`);
		return;
	}
	if (typeof value === "boolean") {
		hash.update(`boolean:${String(value)}`);
		return;
	}
	if (Array.isArray(value)) {
		hash.update("[");
		for (const item of value) {
			updateJsonHash(hash, item);
			hash.update(",");
		}
		hash.update("]");
		return;
	}
	hash.update("{");
	const { keys, truncated } = readBoundedOwnKeys(value, MAX_PERMISSION_FINGERPRINT_SORT_KEYS);
	for (const key of keys) {
		hash.update(JSON.stringify(key));
		hash.update(":");
		updateJsonHash(hash, value[key]);
		hash.update(",");
	}
	if (truncated) {
		const sortedKeySet = new Set(keys);
		hash.update("#object-tail:");
		for (const key in value) {
			if (!Object.prototype.hasOwnProperty.call(value, key) || sortedKeySet.has(key)) continue;
			hash.update(JSON.stringify(key));
			hash.update(":");
			updateJsonHash(hash, value[key]);
			hash.update(",");
		}
	}
	hash.update("}");
}
function readBoundedOwnKeys(value, maxKeys) {
	const keys = [];
	let truncated = false;
	for (const key in value) {
		if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
		if (keys.length >= maxKeys) {
			truncated = true;
			break;
		}
		keys.push(key);
	}
	keys.sort();
	return {
		keys,
		truncated
	};
}
function consumeNativeHookRelayPermissionBudget(relayId, now = Date.now()) {
	const windowStart = now - PERMISSION_APPROVAL_WINDOW_MS;
	const timestamps = (permissionApprovalWindows.get(relayId) ?? []).filter((timestamp) => timestamp >= windowStart);
	if (timestamps.length >= MAX_PERMISSION_APPROVALS_PER_WINDOW) {
		permissionApprovalWindows.set(relayId, timestamps);
		return false;
	}
	timestamps.push(now);
	permissionApprovalWindows.set(relayId, timestamps);
	return true;
}
function removeNativeHookRelayPermissionState(relayId) {
	permissionApprovalWindows.delete(relayId);
	for (const key of pendingPermissionApprovals.keys()) if (key.startsWith(`${relayId}:`)) pendingPermissionApprovals.delete(key);
}
function snapshotNativeHookRelayPayload(payload) {
	return snapshotJsonValue(payload, { remainingStringLength: MAX_NATIVE_HOOK_RELAY_HISTORY_TOTAL_STRING_LENGTH });
}
function snapshotJsonValue(value, state) {
	if (value === null || typeof value === "number" || typeof value === "boolean") return value;
	if (typeof value === "string") return snapshotString(value, state);
	if (Array.isArray(value)) {
		const items = value.slice(0, MAX_NATIVE_HOOK_RELAY_HISTORY_ARRAY_ITEMS).map((item) => snapshotJsonValue(item, state));
		if (value.length > MAX_NATIVE_HOOK_RELAY_HISTORY_ARRAY_ITEMS) items.push("[truncated]");
		return items;
	}
	const snapshot = {};
	const keys = Object.keys(value);
	for (const key of keys.slice(0, MAX_NATIVE_HOOK_RELAY_HISTORY_OBJECT_KEYS)) snapshot[snapshotString(key, state)] = snapshotJsonValue(value[key], state);
	if (keys.length > MAX_NATIVE_HOOK_RELAY_HISTORY_OBJECT_KEYS) snapshot["[truncated]"] = keys.length - MAX_NATIVE_HOOK_RELAY_HISTORY_OBJECT_KEYS;
	return snapshot;
}
function snapshotString(value, state) {
	if (state.remainingStringLength <= 0) return "[truncated]";
	const limit = Math.min(value.length, MAX_NATIVE_HOOK_RELAY_HISTORY_STRING_LENGTH, state.remainingStringLength);
	state.remainingStringLength -= limit;
	if (limit >= value.length) return value;
	return `${value.slice(0, limit)}...[truncated]`;
}
function normalizeNativeHookInvocation(params) {
	const metadata = getNativeHookRelayProviderAdapter(params.registration.provider).normalizeMetadata(params.rawPayload);
	return {
		provider: params.registration.provider,
		relayId: params.registration.relayId,
		event: params.event,
		...metadata,
		...params.registration.agentId ? { agentId: params.registration.agentId } : {},
		sessionId: params.registration.sessionId,
		...params.registration.sessionKey ? { sessionKey: params.registration.sessionKey } : {},
		runId: params.registration.runId,
		rawPayload: params.rawPayload,
		receivedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
function getNativeHookRelayProviderAdapter(provider) {
	return nativeHookRelayProviderAdapters[provider];
}
function normalizeCodexHookMetadata(rawPayload) {
	const payload = isJsonObject(rawPayload) ? rawPayload : {};
	const metadata = {};
	const nativeEventName = readOptionalString(payload.hook_event_name);
	if (nativeEventName) metadata.nativeEventName = nativeEventName;
	const cwd = readOptionalString(payload.cwd);
	if (cwd) metadata.cwd = cwd;
	const model = readOptionalString(payload.model);
	if (model) metadata.model = model;
	const turnId = readOptionalString(payload.turn_id);
	if (turnId) metadata.turnId = turnId;
	const transcriptPath = readOptionalString(payload.transcript_path);
	if (transcriptPath) metadata.transcriptPath = transcriptPath;
	const permissionMode = readOptionalString(payload.permission_mode);
	if (permissionMode) metadata.permissionMode = permissionMode;
	const stopHookActive = readOptionalBoolean(payload.stop_hook_active);
	if (stopHookActive !== void 0) metadata.stopHookActive = stopHookActive;
	const lastAssistantMessage = readOptionalString(payload.last_assistant_message);
	if (lastAssistantMessage) metadata.lastAssistantMessage = lastAssistantMessage;
	const toolName = readOptionalString(payload.tool_name);
	if (toolName) metadata.toolName = toolName;
	const toolUseId = readOptionalString(payload.tool_use_id);
	if (toolUseId) metadata.toolUseId = toolUseId;
	return metadata;
}
function readCodexToolInput(rawPayload) {
	const toolInput = (isJsonObject(rawPayload) ? rawPayload : {}).tool_input;
	if (isJsonObject(toolInput)) return toolInput;
	if (toolInput === void 0) return {};
	return { value: toolInput };
}
function readCodexToolResponse(rawPayload) {
	return (isJsonObject(rawPayload) ? rawPayload : {}).tool_response;
}
function normalizeNativeHookToolName(toolName) {
	return normalizeToolName(toolName ?? "tool");
}
async function requestNativeHookRelayPermissionApproval(request) {
	const timeoutMs = DEFAULT_PERMISSION_TIMEOUT_MS;
	const requestResult = await callGatewayTool("plugin.approval.request", { timeoutMs: timeoutMs + 1e4 }, {
		pluginId: `enclawed-native-hook-relay-${request.provider}`,
		title: truncateText(`${nativeHookRelayProviderDisplayName(request.provider)} permission request`, MAX_APPROVAL_TITLE_LENGTH),
		description: truncateText(formatPermissionApprovalDescription(request), MAX_APPROVAL_DESCRIPTION_LENGTH),
		severity: "warning",
		toolName: request.toolName,
		toolCallId: request.toolCallId,
		agentId: request.agentId,
		sessionKey: request.sessionKey,
		timeoutMs,
		twoPhase: true
	}, { expectFinal: false });
	const approvalId = requestResult?.id;
	if (!approvalId) return "defer";
	let decision;
	if (Object.prototype.hasOwnProperty.call(requestResult ?? {}, "decision")) decision = requestResult.decision;
	else decision = (await waitForNativeHookRelayApprovalDecision({
		approvalId,
		signal: request.signal,
		timeoutMs
	}))?.decision;
	if (decision === PluginApprovalResolutions.ALLOW_ONCE || decision === PluginApprovalResolutions.ALLOW_ALWAYS) return "allow";
	if (decision === PluginApprovalResolutions.DENY) return "deny";
	return "defer";
}
async function waitForNativeHookRelayApprovalDecision(params) {
	const waitPromise = callGatewayTool("plugin.approval.waitDecision", { timeoutMs: params.timeoutMs + 1e4 }, { id: params.approvalId });
	if (!params.signal) return waitPromise;
	let onAbort;
	const abortPromise = new Promise((_, reject) => {
		if (params.signal.aborted) {
			reject(params.signal.reason);
			return;
		}
		onAbort = () => reject(params.signal.reason);
		params.signal.addEventListener("abort", onAbort, { once: true });
	});
	try {
		return await Promise.race([waitPromise, abortPromise]);
	} finally {
		if (onAbort) params.signal.removeEventListener("abort", onAbort);
	}
}
function formatPermissionApprovalDescription(request) {
	return [
		`Tool: ${sanitizeApprovalText(request.toolName)}`,
		request.cwd ? `Cwd: ${sanitizeApprovalText(request.cwd)}` : void 0,
		request.model ? `Model: ${sanitizeApprovalText(request.model)}` : void 0,
		formatToolInputPreview(request.toolInput)
	].filter((line) => Boolean(line)).join("\n");
}
function formatToolInputPreview(toolInput) {
	const command = readOptionalString(toolInput.command);
	if (command) return `Command: ${truncateText(sanitizeApprovalText(command), 240)}`;
	const keys = Object.keys(toolInput).map(sanitizeApprovalText).filter(Boolean).toSorted();
	if (!keys.length) return;
	return `Input keys: ${keys.slice(0, 12).join(", ")}${keys.length > 12 ? ` (${keys.length - 12} omitted)` : ""}`;
}
function sanitizeApprovalText(value) {
	let sanitized = "";
	for (const char of value.replace(ANSI_ESCAPE_PATTERN, "")) {
		const codePoint = char.codePointAt(0);
		sanitized += codePoint != null && isUnsafeApprovalCodePoint(codePoint) ? " " : char;
	}
	return sanitized.replace(/\s+/g, " ").trim();
}
function isUnsafeApprovalCodePoint(codePoint) {
	return codePoint >= 0 && codePoint <= 8 || codePoint === 11 || codePoint === 12 || codePoint >= 14 && codePoint <= 31 || codePoint >= 127 && codePoint <= 159 || codePoint >= 8234 && codePoint <= 8238 || codePoint >= 8294 && codePoint <= 8297;
}
function nativeHookRelayProviderDisplayName(provider) {
	if (provider === "codex") return "Codex";
	return provider;
}
function truncateText(value, maxLength) {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}
function resolveEnclawedCliExecutable() {
	const envPath = process.env.ENCLAWED_CLI_PATH?.trim();
	if (envPath && existsSync(envPath)) return envPath;
	const packageRoot = resolveEnclawedPackageRootSync({
		moduleUrl: import.meta.url,
		argv1: process.argv[1],
		cwd: process.cwd()
	});
	if (packageRoot) {
		for (const candidate of [
			path.join(packageRoot, "enclawed.mjs"),
			path.join(packageRoot, "dist", "entry.js"),
			path.join(packageRoot, "scripts", "run-node.mjs")
		]) if (existsSync(candidate)) return candidate;
	}
	const argvEntry = process.argv[1];
	if (argvEntry) {
		const resolved = path.resolve(argvEntry);
		if (existsSync(resolved)) return resolved;
	}
	throw new Error("Cannot resolve Enclawed CLI executable path for native hook relay");
}
function normalizeAllowedEvents(events) {
	if (!events?.length) return NATIVE_HOOK_RELAY_EVENTS;
	return [...new Set(events)];
}
function normalizePositiveInteger(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
function shellQuoteArgs(args) {
	return args.map((arg) => shellQuoteArg(arg, process.platform)).join(" ");
}
function shellQuoteArg(value, platform) {
	if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) return value;
	if (platform === "win32") return `"${value.replaceAll("\"", "\\\"")}"`;
	return `'${value.replaceAll("'", "'\\''")}'`;
}
function readNativeHookRelayProvider(value) {
	if (value === "codex") return value;
	throw new Error("unsupported native hook relay provider");
}
function readNativeHookRelayEvent(value) {
	if (value === "pre_tool_use" || value === "post_tool_use" || value === "permission_request" || value === "before_agent_finalize") return value;
	throw new Error("unsupported native hook relay event");
}
function readNonEmptyString(value, name) {
	if (typeof value === "string" && value.trim()) return value.trim();
	throw new Error(`native hook relay ${name} is required`);
}
function readOptionalString(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
function readOptionalBoolean(value) {
	return typeof value === "boolean" ? value : void 0;
}
function isJsonValue(value) {
	const stack = [{
		value,
		depth: 0
	}];
	let nodes = 0;
	let totalStringLength = 0;
	while (stack.length) {
		const current = stack.pop();
		nodes += 1;
		if (nodes > MAX_NATIVE_HOOK_RELAY_JSON_NODES) return false;
		if (current.depth > MAX_NATIVE_HOOK_RELAY_JSON_DEPTH) return false;
		if (current.value === null) continue;
		if (typeof current.value === "string") {
			if (current.value.length > MAX_NATIVE_HOOK_RELAY_STRING_LENGTH) return false;
			totalStringLength += current.value.length;
			if (totalStringLength > MAX_NATIVE_HOOK_RELAY_TOTAL_STRING_LENGTH) return false;
			continue;
		}
		if (typeof current.value === "number") {
			if (!Number.isFinite(current.value)) return false;
			continue;
		}
		if (typeof current.value === "boolean") continue;
		if (Array.isArray(current.value)) {
			for (let index = 0; index < current.value.length; index += 1) {
				if (nodes + stack.length + 1 > MAX_NATIVE_HOOK_RELAY_JSON_NODES) return false;
				stack.push({
					value: current.value[index],
					depth: current.depth + 1
				});
			}
			continue;
		}
		if (!isJsonObject(current.value)) return false;
		try {
			for (const key in current.value) {
				if (!Object.prototype.hasOwnProperty.call(current.value, key)) continue;
				if (key.length > MAX_NATIVE_HOOK_RELAY_STRING_LENGTH) return false;
				totalStringLength += key.length;
				if (totalStringLength > MAX_NATIVE_HOOK_RELAY_TOTAL_STRING_LENGTH) return false;
				if (nodes + stack.length + 1 > MAX_NATIVE_HOOK_RELAY_JSON_NODES) return false;
				stack.push({
					value: current.value[key],
					depth: current.depth + 1
				});
			}
		} catch {
			return false;
		}
	}
	return true;
}
function isJsonObject(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	try {
		const prototype = Object.getPrototypeOf(value);
		return prototype === Object.prototype || prototype === null;
	} catch {
		return false;
	}
}
const __testing = {
	clearNativeHookRelaysForTests() {
		for (const relayId of relayBridges.keys()) unregisterNativeHookRelayBridge(relayId);
		relays.clear();
		invocations.length = 0;
		pendingPermissionApprovals.clear();
		permissionApprovalWindows.clear();
		nativeHookRelayPermissionApprovalRequester = requestNativeHookRelayPermissionApproval;
	},
	getNativeHookRelayInvocationsForTests() {
		return [...invocations];
	},
	getNativeHookRelayRegistrationForTests(relayId) {
		return relays.get(relayId);
	},
	getNativeHookRelayBridgeDirForTests() {
		return nativeHookRelayBridgeDir();
	},
	getNativeHookRelayBridgeRegistryPathForTests(relayId) {
		return nativeHookRelayBridgeRegistryPath(relayId);
	},
	getNativeHookRelayBridgeRecordForTests(relayId) {
		const record = readNativeHookRelayBridgeRecordIfExists(relayId);
		return record ? { ...record } : void 0;
	},
	formatPermissionApprovalDescriptionForTests(request) {
		return formatPermissionApprovalDescription(request);
	},
	permissionRequestContentFingerprintForTests(request) {
		return permissionRequestContentFingerprint(request);
	},
	permissionRequestToolInputKeyFingerprintForTests(toolInput) {
		return permissionRequestToolInputKeyFingerprint(toolInput);
	},
	setNativeHookRelayPermissionApprovalRequesterForTests(requester) {
		nativeHookRelayPermissionApprovalRequester = requester;
	}
};
//#endregion
//#region src/plugin-sdk/agent-harness-runtime.ts
const TOOL_PROGRESS_OUTPUT_MAX_CHARS = 8e3;
/**
* Derive the same compact user-facing tool detail that Pi uses for progress logs.
*/
function inferToolMetaFromArgs(toolName, args) {
	return formatToolDetail(resolveToolDisplay({
		name: toolName,
		args
	}));
}
/**
* Prepare verbose tool output for user-facing progress messages.
*/
function formatToolProgressOutput(output, options) {
	const trimmed = output.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
	if (!trimmed) return;
	const redacted = redactToolDetail(trimmed);
	const maxChars = options?.maxChars ?? 8e3;
	if (redacted.length <= maxChars) return redacted;
	return `${truncateUtf16Safe(redacted, maxChars)}\n...(truncated)...`;
}
/**
* Classify terminal harness turns that completed without assistant output that
* should advance fallback. Deliberate silent replies such as NO_REPLY count as
* intentional output, while whitespace-only text remains fallback-eligible.
* This is intentionally SDK-level so plugin harness adapters such as Codex
* preserve the same Enclawed-owned fallback signals as the built-in PI path
* without re-implementing terminal-result policy.
*/
function classifyAgentHarnessTerminalOutcome(params) {
	if (!params.turnCompleted || params.promptError !== void 0 && params.promptError !== null || hasVisibleAssistantText(params.assistantTexts)) return;
	if (params.planText?.trim()) return "planning-only";
	if (params.reasoningText?.trim()) return "reasoning-only";
	return "empty";
}
function hasVisibleAssistantText(assistantTexts) {
	return assistantTexts.some((text) => text.trim().length > 0);
}
//#endregion
export { buildAgentRuntimePlan as A, resolveAgentHarnessBeforePromptBuildResult as C, normalizeAgentRuntimeTools as D, logAgentRuntimeToolDiagnostics as E, runAgentCleanupStep as M, formatApprovalDisplayPath as N, HEARTBEAT_RESPONSE_TOOL_NAME as O, createCodexAppServerToolResultExtensionRunner as S, runAgentHarnessBeforeCompactionHook as T, buildHarnessContextEngineRuntimeContextFromUsage as _, __testing as a, runHarnessContextEngineMaintenance as b, runAgentHarnessAgentEndHook as c, runAgentHarnessLlmOutputHook as d, runAgentHarnessAfterToolCallHook as f, buildHarnessContextEngineRuntimeContext as g, bootstrapHarnessContextEngine as h, inferToolMetaFromArgs as i, classifyEmbeddedPiRunResultForModelFallback as j, normalizeHeartbeatToolResponse as k, runAgentHarnessBeforeAgentFinalizeHook as l, assembleHarnessContextEngine as m, classifyAgentHarnessTerminalOutcome as n, buildNativeHookRelayCommand as o, runAgentHarnessBeforeMessageWriteHook as p, formatToolProgressOutput as r, registerNativeHookRelay as s, TOOL_PROGRESS_OUTPUT_MAX_CHARS as t, runAgentHarnessLlmInputHook as u, finalizeHarnessContextEngineTurn as v, runAgentHarnessAfterCompactionHook as w, createAgentToolResultMiddlewareRunner as x, isActiveHarnessContextEngine as y };
