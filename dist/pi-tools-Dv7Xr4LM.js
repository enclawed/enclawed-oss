import { i as normalizeLowercaseStringOrEmpty, o as normalizeOptionalLowercaseString } from "./string-coerce-BUSzWgUA.js";
import { a as logWarn } from "./logger-CxYwkFNY.js";
import { a as isSubagentSessionKey } from "./session-key-utils-EZPI4YGr.js";
import { v as resolveAgentConfig } from "./agent-scope-h_sJkIo9.js";
import { d as resolveGatewayMessageChannel } from "./message-channel-DxD903us.js";
import { _ as PROCESS_TOOL_DISPLAY_SUMMARY, g as EXEC_TOOL_DISPLAY_SUMMARY, i as collectExplicitAllowlist, n as applyOwnerOnlyToolPolicy, o as mergeAlsoAllowPolicy, u as resolveToolProfilePolicy } from "./tool-policy-C6fxB-Hq.js";
import { i as listChannelAgentTools, l as copyPluginToolMeta, t as copyChannelAgentToolMeta, u as getPluginToolMeta } from "./channel-tools-Q_eSKv_l.js";
import { i as resolveImageSanitizationLimits } from "./tool-images-WoP8RS9i.js";
import { n as normalizeToolParameters } from "./pi-tools.schema-CQFCcIMo.js";
import { c as shouldSuppressManagedWebSearchTool } from "./codex-native-web-search-DsZrqUCw.js";
import { t as bindAbortRelay } from "./fetch-timeout-Cj9v5qPv.js";
import { a as createEnclawedReadTool, c as createSandboxedEditTool, d as wrapToolMemoryFlushAppendOnlyWrite, f as wrapToolWorkspaceRootGuard, l as createSandboxedReadTool, o as createHostWorkspaceEditTool, p as wrapToolWorkspaceRootGuardWithOptions, s as createHostWorkspaceWriteTool, t as createEnclawedTools, u as createSandboxedWriteTool } from "./enclawed-tools-VvoYgEtt.js";
import { c as createApplyPatchTool, s as wrapToolWithBeforeToolCallHook } from "./pi-tools.before-tool-call-CLNI8eCu.js";
import { i as resolveMergedSafeBinProfileFixtures } from "./exec-safe-bin-runtime-policy-BhEAEGL8.js";
import { n as describeProcessTool, t as describeExecTool } from "./bash-tools.descriptions-DukebJ4a.js";
import { n as processSchema, t as execSchema } from "./bash-tools.schemas-BvbDl4zX.js";
import { a as resolveGroupToolPolicy, l as resolveWorkspaceRoot, r as resolveEffectiveToolPolicy, s as resolveSubagentToolPolicyForSession } from "./read-capability-B31fMLuO.js";
import { t as isToolAllowedByPolicies } from "./tool-policy-match-BeXraSDN.js";
import { i as resolveToolFsConfig, t as createToolFsPolicy } from "./tool-fs-policy-Yy_5rD1h.js";
import { n as buildDefaultToolPolicyPipelineSteps, t as applyToolPolicyPipeline } from "./tool-policy-pipeline-BGXnXAjy.js";
import { createCodingTools, createReadTool } from "@mariozechner/pi-coding-agent";
//#region src/agents/pi-tools.abort.ts
function throwAbortError() {
	const err = /* @__PURE__ */ new Error("Aborted");
	err.name = "AbortError";
	throw err;
}
/**
* Checks if an object is a valid AbortSignal using structural typing.
* This is more reliable than `instanceof` across different realms (VM, iframe, etc.)
* where the AbortSignal constructor may differ.
*/
function isAbortSignal(obj) {
	return obj instanceof AbortSignal;
}
function combineAbortSignals(a, b) {
	if (!a && !b) return;
	if (a && !b) return a;
	if (b && !a) return b;
	if (a?.aborted) return a;
	if (b?.aborted) return b;
	if (typeof AbortSignal.any === "function" && isAbortSignal(a) && isAbortSignal(b)) return AbortSignal.any([a, b]);
	const controller = new AbortController();
	const onAbort = bindAbortRelay(controller);
	a?.addEventListener("abort", onAbort, { once: true });
	b?.addEventListener("abort", onAbort, { once: true });
	return controller.signal;
}
function wrapToolWithAbortSignal(tool, abortSignal) {
	if (!abortSignal) return tool;
	const execute = tool.execute;
	if (!execute) return tool;
	const wrappedTool = {
		...tool,
		execute: async (toolCallId, params, signal, onUpdate) => {
			const combined = combineAbortSignals(signal, abortSignal);
			if (combined?.aborted) throwAbortError();
			return await execute(toolCallId, params, combined, onUpdate);
		}
	};
	copyPluginToolMeta(tool, wrappedTool);
	copyChannelAgentToolMeta(tool, wrappedTool);
	return wrappedTool;
}
//#endregion
//#region src/agents/pi-tools.deferred-followup.ts
function applyDeferredFollowupToolDescriptions(tools, params) {
	const hasCronTool = tools.some((tool) => tool.name === "cron");
	return tools.map((tool) => {
		if (tool.name === "exec") return {
			...tool,
			description: describeExecTool({
				agentId: params?.agentId,
				hasCronTool
			})
		};
		if (tool.name === "process") return {
			...tool,
			description: describeProcessTool({ hasCronTool })
		};
		return tool;
	});
}
//#endregion
//#region src/agents/pi-tools.message-provider-policy.ts
const TOOL_DENY_BY_MESSAGE_PROVIDER = { voice: ["tts"] };
const TOOL_ALLOW_BY_MESSAGE_PROVIDER = { node: [
	"canvas",
	"image",
	"pdf",
	"tts",
	"web_fetch",
	"web_search"
] };
function filterToolNamesByMessageProvider(toolNames, messageProvider) {
	const normalizedProvider = normalizeOptionalLowercaseString(messageProvider);
	if (!normalizedProvider) return [...toolNames];
	const allowedTools = TOOL_ALLOW_BY_MESSAGE_PROVIDER[normalizedProvider];
	if (allowedTools && allowedTools.length > 0) {
		const allowedSet = new Set(allowedTools);
		return toolNames.filter((toolName) => allowedSet.has(toolName));
	}
	const deniedTools = TOOL_DENY_BY_MESSAGE_PROVIDER[normalizedProvider];
	if (!deniedTools || deniedTools.length === 0) return [...toolNames];
	const deniedSet = new Set(deniedTools);
	return toolNames.filter((toolName) => !deniedSet.has(toolName));
}
function filterToolsByMessageProvider(tools, messageProvider) {
	const filteredToolNames = filterToolNamesByMessageProvider(tools.map((tool) => tool.name), messageProvider);
	const remainingCounts = /* @__PURE__ */ new Map();
	for (const toolName of filteredToolNames) remainingCounts.set(toolName, (remainingCounts.get(toolName) ?? 0) + 1);
	return tools.filter((tool) => {
		const remaining = remainingCounts.get(tool.name) ?? 0;
		if (remaining <= 0) return false;
		remainingCounts.set(tool.name, remaining - 1);
		return true;
	});
}
//#endregion
//#region src/agents/pi-tools.ts
function isOpenAIProvider(provider) {
	const normalized = normalizeOptionalLowercaseString(provider);
	return normalized === "openai" || normalized === "openai-codex";
}
const MEMORY_FLUSH_ALLOWED_TOOL_NAMES = new Set(["read", "write"]);
function createLazyExecTool(defaults) {
	let loadedTool;
	const loadTool = async () => {
		if (!loadedTool) {
			const { createExecTool } = await import("./bash-tools-CfAvNxHE.js");
			loadedTool = createExecTool(defaults);
		}
		return loadedTool;
	};
	return {
		name: "exec",
		label: "exec",
		displaySummary: EXEC_TOOL_DISPLAY_SUMMARY,
		get description() {
			return describeExecTool({
				agentId: defaults?.agentId,
				hasCronTool: defaults?.hasCronTool === true
			});
		},
		parameters: execSchema,
		execute: async (...args) => (await loadTool()).execute(...args)
	};
}
function createLazyProcessTool(defaults) {
	let loadedTool;
	const loadTool = async () => {
		if (!loadedTool) {
			const { createProcessTool } = await import("./bash-tools-CfAvNxHE.js");
			loadedTool = createProcessTool(defaults);
		}
		return loadedTool;
	};
	return {
		name: "process",
		label: "process",
		displaySummary: PROCESS_TOOL_DISPLAY_SUMMARY,
		description: describeProcessTool({ hasCronTool: defaults?.hasCronTool === true }),
		parameters: processSchema,
		execute: async (...args) => (await loadTool()).execute(...args)
	};
}
function applyModelProviderToolPolicy(tools, params) {
	if (params?.config?.agents?.defaults?.experimental?.localModelLean === true) {
		const leanDeny = new Set([
			"browser",
			"cron",
			"message"
		]);
		tools = tools.filter((tool) => !leanDeny.has(tool.name));
	}
	if (shouldSuppressManagedWebSearchTool({
		config: params?.config,
		modelProvider: params?.modelProvider,
		modelApi: params?.modelApi,
		agentDir: params?.agentDir
	})) return tools.filter((tool) => tool.name !== "web_search");
	return tools;
}
function isApplyPatchAllowedForModel(params) {
	const allowModels = Array.isArray(params.allowModels) ? params.allowModels : [];
	if (allowModels.length === 0) return true;
	const modelId = params.modelId?.trim();
	if (!modelId) return false;
	const normalizedModelId = normalizeLowercaseStringOrEmpty(modelId);
	const provider = normalizeOptionalLowercaseString(params.modelProvider);
	const normalizedFull = provider && !normalizedModelId.includes("/") ? `${provider}/${normalizedModelId}` : normalizedModelId;
	return allowModels.some((entry) => {
		const normalized = normalizeOptionalLowercaseString(entry);
		if (!normalized) return false;
		return normalized === normalizedModelId || normalized === normalizedFull;
	});
}
function resolveExecConfig(params) {
	const cfg = params.cfg;
	const globalExec = cfg?.tools?.exec;
	const agentExec = cfg && params.agentId ? resolveAgentConfig(cfg, params.agentId)?.tools?.exec : void 0;
	return {
		host: agentExec?.host ?? globalExec?.host,
		security: agentExec?.security ?? globalExec?.security,
		ask: agentExec?.ask ?? globalExec?.ask,
		node: agentExec?.node ?? globalExec?.node,
		pathPrepend: agentExec?.pathPrepend ?? globalExec?.pathPrepend,
		safeBins: agentExec?.safeBins ?? globalExec?.safeBins,
		strictInlineEval: agentExec?.strictInlineEval ?? globalExec?.strictInlineEval,
		safeBinTrustedDirs: agentExec?.safeBinTrustedDirs ?? globalExec?.safeBinTrustedDirs,
		safeBinProfiles: resolveMergedSafeBinProfileFixtures({
			global: globalExec,
			local: agentExec
		}),
		backgroundMs: agentExec?.backgroundMs ?? globalExec?.backgroundMs,
		timeoutSec: agentExec?.timeoutSec ?? globalExec?.timeoutSec,
		approvalRunningNoticeMs: agentExec?.approvalRunningNoticeMs ?? globalExec?.approvalRunningNoticeMs,
		cleanupMs: agentExec?.cleanupMs ?? globalExec?.cleanupMs,
		notifyOnExit: agentExec?.notifyOnExit ?? globalExec?.notifyOnExit,
		notifyOnExitEmptySuccess: agentExec?.notifyOnExitEmptySuccess ?? globalExec?.notifyOnExitEmptySuccess,
		applyPatch: agentExec?.applyPatch ?? globalExec?.applyPatch
	};
}
function resolveToolLoopDetectionConfig(params) {
	const global = params.cfg?.tools?.loopDetection;
	const agent = params.agentId && params.cfg ? resolveAgentConfig(params.cfg, params.agentId)?.tools?.loopDetection : void 0;
	if (!agent) return global;
	if (!global) return agent;
	return {
		...global,
		...agent,
		detectors: {
			...global.detectors,
			...agent.detectors
		}
	};
}
function createEnclawedCodingTools(options) {
	const execToolName = "exec";
	const sandbox = options?.sandbox?.enabled ? options.sandbox : void 0;
	const isMemoryFlushRun = options?.trigger === "memory";
	if (isMemoryFlushRun && !options?.memoryFlushWritePath) throw new Error("memoryFlushWritePath required for memory-triggered tool runs");
	const memoryFlushWritePath = isMemoryFlushRun ? options.memoryFlushWritePath : void 0;
	const { agentId, globalPolicy, globalProviderPolicy, agentPolicy, agentProviderPolicy, profile, providerProfile, profileAlsoAllow, providerProfileAlsoAllow } = resolveEffectiveToolPolicy({
		config: options?.config,
		sessionKey: options?.sessionKey,
		agentId: options?.agentId,
		modelProvider: options?.modelProvider,
		modelId: options?.modelId
	});
	const sandboxToolPolicy = sandbox?.tools;
	const groupPolicy = resolveGroupToolPolicy({
		config: options?.config,
		sessionKey: options?.sessionKey,
		spawnedBy: options?.spawnedBy,
		messageProvider: options?.messageProvider,
		groupId: options?.groupId,
		groupChannel: options?.groupChannel,
		groupSpace: options?.groupSpace,
		accountId: options?.agentAccountId,
		senderId: options?.senderId,
		senderName: options?.senderName,
		senderUsername: options?.senderUsername,
		senderE164: options?.senderE164
	});
	const profilePolicy = resolveToolProfilePolicy(profile);
	const providerProfilePolicy = resolveToolProfilePolicy(providerProfile);
	const profilePolicyWithAlsoAllow = mergeAlsoAllowPolicy(profilePolicy, profileAlsoAllow);
	const providerProfilePolicyWithAlsoAllow = mergeAlsoAllowPolicy(providerProfilePolicy, providerProfileAlsoAllow);
	const scopeKey = options?.exec?.scopeKey ?? options?.sessionKey ?? (agentId ? `agent:${agentId}` : void 0);
	const subagentPolicy = isSubagentSessionKey(options?.sessionKey) && options?.sessionKey ? resolveSubagentToolPolicyForSession(options.config, options.sessionKey) : void 0;
	const allowBackground = isToolAllowedByPolicies("process", [
		profilePolicyWithAlsoAllow,
		providerProfilePolicyWithAlsoAllow,
		globalPolicy,
		globalProviderPolicy,
		agentPolicy,
		agentProviderPolicy,
		groupPolicy,
		sandboxToolPolicy,
		subagentPolicy
	]);
	const execConfig = resolveExecConfig({
		cfg: options?.config,
		agentId
	});
	const fsConfig = resolveToolFsConfig({
		cfg: options?.config,
		agentId
	});
	const fsPolicy = createToolFsPolicy({ workspaceOnly: isMemoryFlushRun || fsConfig.workspaceOnly });
	const sandboxRoot = sandbox?.workspaceDir;
	const sandboxFsBridge = sandbox?.fsBridge;
	const allowWorkspaceWrites = sandbox?.workspaceAccess !== "ro";
	const workspaceRoot = resolveWorkspaceRoot(options?.workspaceDir);
	const workspaceOnly = fsPolicy.workspaceOnly;
	const applyPatchConfig = execConfig.applyPatch;
	const applyPatchWorkspaceOnly = workspaceOnly || applyPatchConfig?.workspaceOnly !== false;
	const applyPatchEnabled = applyPatchConfig?.enabled !== false && isOpenAIProvider(options?.modelProvider) && isApplyPatchAllowedForModel({
		modelProvider: options?.modelProvider,
		modelId: options?.modelId,
		allowModels: applyPatchConfig?.allowModels
	});
	if (sandboxRoot && !sandboxFsBridge) throw new Error("Sandbox filesystem bridge is unavailable.");
	const imageSanitization = resolveImageSanitizationLimits(options?.config);
	const base = createCodingTools(workspaceRoot).flatMap((tool) => {
		if (tool.name === "read") {
			if (sandboxRoot) {
				const sandboxed = createSandboxedReadTool({
					root: sandboxRoot,
					bridge: sandboxFsBridge,
					modelContextWindowTokens: options?.modelContextWindowTokens,
					imageSanitization
				});
				return [workspaceOnly ? wrapToolWorkspaceRootGuardWithOptions(sandboxed, sandboxRoot, { containerWorkdir: sandbox.containerWorkdir }) : sandboxed];
			}
			const wrapped = createEnclawedReadTool(createReadTool(workspaceRoot), {
				modelContextWindowTokens: options?.modelContextWindowTokens,
				imageSanitization
			});
			return [workspaceOnly ? wrapToolWorkspaceRootGuard(wrapped, workspaceRoot) : wrapped];
		}
		if (tool.name === "bash" || tool.name === execToolName) return [];
		if (tool.name === "write") {
			if (sandboxRoot) return [];
			const wrapped = createHostWorkspaceWriteTool(workspaceRoot, { workspaceOnly });
			return [workspaceOnly ? wrapToolWorkspaceRootGuard(wrapped, workspaceRoot) : wrapped];
		}
		if (tool.name === "edit") {
			if (sandboxRoot) return [];
			const wrapped = createHostWorkspaceEditTool(workspaceRoot, { workspaceOnly });
			return [workspaceOnly ? wrapToolWorkspaceRootGuard(wrapped, workspaceRoot) : wrapped];
		}
		return [tool];
	});
	const { cleanupMs: cleanupMsOverride, ...execDefaults } = options?.exec ?? {};
	const execTool = createLazyExecTool({
		...execDefaults,
		host: options?.exec?.host ?? execConfig.host,
		security: options?.exec?.security ?? execConfig.security,
		ask: options?.exec?.ask ?? execConfig.ask,
		trigger: options?.trigger,
		node: options?.exec?.node ?? execConfig.node,
		pathPrepend: options?.exec?.pathPrepend ?? execConfig.pathPrepend,
		safeBins: options?.exec?.safeBins ?? execConfig.safeBins,
		strictInlineEval: options?.exec?.strictInlineEval ?? execConfig.strictInlineEval,
		safeBinTrustedDirs: options?.exec?.safeBinTrustedDirs ?? execConfig.safeBinTrustedDirs,
		safeBinProfiles: options?.exec?.safeBinProfiles ?? execConfig.safeBinProfiles,
		agentId,
		cwd: workspaceRoot,
		allowBackground,
		scopeKey,
		sessionKey: options?.sessionKey,
		messageProvider: options?.messageProvider,
		currentChannelId: options?.currentChannelId,
		currentThreadTs: options?.currentThreadTs,
		accountId: options?.agentAccountId,
		backgroundMs: options?.exec?.backgroundMs ?? execConfig.backgroundMs,
		timeoutSec: options?.exec?.timeoutSec ?? execConfig.timeoutSec,
		approvalRunningNoticeMs: options?.exec?.approvalRunningNoticeMs ?? execConfig.approvalRunningNoticeMs,
		notifyOnExit: options?.exec?.notifyOnExit ?? execConfig.notifyOnExit,
		notifyOnExitEmptySuccess: options?.exec?.notifyOnExitEmptySuccess ?? execConfig.notifyOnExitEmptySuccess,
		sandbox: sandbox ? {
			containerName: sandbox.containerName,
			workspaceDir: sandbox.workspaceDir,
			containerWorkdir: sandbox.containerWorkdir,
			env: sandbox.backend?.env ?? sandbox.docker.env,
			buildExecSpec: sandbox.backend?.buildExecSpec.bind(sandbox.backend),
			finalizeExec: sandbox.backend?.finalizeExec?.bind(sandbox.backend)
		} : void 0
	});
	const processTool = createLazyProcessTool({
		cleanupMs: cleanupMsOverride ?? execConfig.cleanupMs,
		scopeKey
	});
	const applyPatchTool = !applyPatchEnabled || sandboxRoot && !allowWorkspaceWrites ? null : createApplyPatchTool({
		cwd: sandboxRoot ?? workspaceRoot,
		sandbox: sandboxRoot && allowWorkspaceWrites ? {
			root: sandboxRoot,
			bridge: sandboxFsBridge
		} : void 0,
		workspaceOnly: applyPatchWorkspaceOnly
	});
	const tools = [
		...base,
		...sandboxRoot ? allowWorkspaceWrites ? [workspaceOnly ? wrapToolWorkspaceRootGuardWithOptions(createSandboxedEditTool({
			root: sandboxRoot,
			bridge: sandboxFsBridge
		}), sandboxRoot, { containerWorkdir: sandbox.containerWorkdir }) : createSandboxedEditTool({
			root: sandboxRoot,
			bridge: sandboxFsBridge
		}), workspaceOnly ? wrapToolWorkspaceRootGuardWithOptions(createSandboxedWriteTool({
			root: sandboxRoot,
			bridge: sandboxFsBridge
		}), sandboxRoot, { containerWorkdir: sandbox.containerWorkdir }) : createSandboxedWriteTool({
			root: sandboxRoot,
			bridge: sandboxFsBridge
		})] : [] : [],
		...applyPatchTool ? [applyPatchTool] : [],
		execTool,
		processTool,
		...listChannelAgentTools({ cfg: options?.config }),
		...createEnclawedTools({
			sandboxBrowserBridgeUrl: sandbox?.browser?.bridgeUrl,
			allowHostBrowserControl: sandbox ? sandbox.browserAllowHostControl : true,
			agentSessionKey: options?.sessionKey,
			agentChannel: resolveGatewayMessageChannel(options?.messageProvider),
			agentAccountId: options?.agentAccountId,
			agentTo: options?.messageTo,
			agentThreadId: options?.messageThreadId,
			agentGroupId: options?.groupId ?? null,
			agentGroupChannel: options?.groupChannel ?? null,
			agentGroupSpace: options?.groupSpace ?? null,
			agentDir: options?.agentDir,
			sandboxRoot,
			sandboxContainerWorkdir: sandbox?.containerWorkdir,
			sandboxFsBridge,
			fsPolicy,
			workspaceDir: workspaceRoot,
			spawnWorkspaceDir: options?.spawnWorkspaceDir ? resolveWorkspaceRoot(options.spawnWorkspaceDir) : void 0,
			sandboxed: !!sandbox,
			config: options?.config,
			pluginToolAllowlist: collectExplicitAllowlist([
				profilePolicy,
				providerProfilePolicy,
				globalPolicy,
				globalProviderPolicy,
				agentPolicy,
				agentProviderPolicy,
				groupPolicy,
				sandboxToolPolicy,
				subagentPolicy
			]),
			currentChannelId: options?.currentChannelId,
			currentThreadTs: options?.currentThreadTs,
			currentMessageId: options?.currentMessageId,
			modelProvider: options?.modelProvider,
			modelId: options?.modelId,
			replyToMode: options?.replyToMode,
			hasRepliedRef: options?.hasRepliedRef,
			modelHasVision: options?.modelHasVision,
			requireExplicitMessageTarget: options?.requireExplicitMessageTarget,
			disableMessageTool: options?.disableMessageTool,
			requesterAgentIdOverride: agentId,
			requesterSenderId: options?.senderId,
			senderIsOwner: options?.senderIsOwner,
			sessionId: options?.sessionId,
			onYield: options?.onYield,
			allowGatewaySubagentBinding: options?.allowGatewaySubagentBinding
		})
	];
	const withHooks = applyToolPolicyPipeline({
		tools: applyOwnerOnlyToolPolicy(applyModelProviderToolPolicy(filterToolsByMessageProvider(isMemoryFlushRun && memoryFlushWritePath ? tools.flatMap((tool) => {
			if (!MEMORY_FLUSH_ALLOWED_TOOL_NAMES.has(tool.name)) return [];
			if (tool.name === "write") return [wrapToolMemoryFlushAppendOnlyWrite(tool, {
				root: sandboxRoot ?? workspaceRoot,
				relativePath: memoryFlushWritePath,
				containerWorkdir: sandbox?.containerWorkdir,
				sandbox: sandboxRoot && sandboxFsBridge ? {
					root: sandboxRoot,
					bridge: sandboxFsBridge
				} : void 0
			})];
			return [tool];
		}) : tools, options?.messageProvider), {
			config: options?.config,
			modelProvider: options?.modelProvider,
			modelApi: options?.modelApi,
			modelId: options?.modelId,
			agentDir: options?.agentDir,
			modelCompat: options?.modelCompat
		}), options?.senderIsOwner === true),
		toolMeta: (tool) => getPluginToolMeta(tool),
		warn: logWarn,
		steps: [
			...buildDefaultToolPolicyPipelineSteps({
				profilePolicy: profilePolicyWithAlsoAllow,
				profile,
				profileUnavailableCoreWarningAllowlist: profilePolicy?.allow,
				providerProfilePolicy: providerProfilePolicyWithAlsoAllow,
				providerProfile,
				providerProfileUnavailableCoreWarningAllowlist: providerProfilePolicy?.allow,
				globalPolicy,
				globalProviderPolicy,
				agentPolicy,
				agentProviderPolicy,
				groupPolicy,
				agentId
			}),
			{
				policy: sandboxToolPolicy,
				label: "sandbox tools.allow"
			},
			{
				policy: subagentPolicy,
				label: "subagent tools.allow"
			}
		]
	}).map((tool) => normalizeToolParameters(tool, {
		modelProvider: options?.modelProvider,
		modelId: options?.modelId,
		modelCompat: options?.modelCompat
	})).map((tool) => wrapToolWithBeforeToolCallHook(tool, {
		agentId,
		sessionKey: options?.sessionKey,
		sessionId: options?.sessionId,
		runId: options?.runId,
		loopDetection: resolveToolLoopDetectionConfig({
			cfg: options?.config,
			agentId
		}),
		...sandbox && sandboxRoot && sandboxFsBridge ? { fsSandbox: {
			ref: {
				backendId: sandbox.backendId,
				runtimeId: sandbox.runtimeId,
				sessionKey: sandbox.sessionKey
			},
			root: sandboxRoot,
			files: sandboxFsBridge
		} } : sandboxRoot ? {} : { fsRoot: workspaceRoot }
	}));
	return applyDeferredFollowupToolDescriptions(options?.abortSignal ? withHooks.map((tool) => wrapToolWithAbortSignal(tool, options.abortSignal)) : withHooks, { agentId });
}
//#endregion
export { resolveToolLoopDetectionConfig as n, createEnclawedCodingTools as t };
