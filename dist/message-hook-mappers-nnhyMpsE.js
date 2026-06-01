import { i as formatErrorMessage } from "./errors-D8p6rxH8.js";
import { i as normalizeLowercaseStringOrEmpty, s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { n as resolveGlobalSingleton } from "./global-singleton-BvJ0xECh.js";
import { r as logVerbose } from "./globals-CYDryU7g.js";
import { i as normalizeChannelId, t as getChannelPlugin } from "./registry-CI36HBCI.js";
import "./plugins-lmHd1cqM.js";
//#region src/hooks/fire-and-forget.ts
const DEFAULT_MAX_CONCURRENT_FIRE_AND_FORGET_HOOKS = 16;
const DEFAULT_MAX_QUEUED_FIRE_AND_FORGET_HOOKS = 256;
const DEFAULT_FIRE_AND_FORGET_HOOK_TIMEOUT_MS = 2e3;
const MAX_HOOK_LOG_MESSAGE_LENGTH = 500;
const getFireAndForgetHookState = () => resolveGlobalSingleton(Symbol.for("enclawed.fireAndForgetHookState"), () => ({
	active: 0,
	queue: []
}));
function positiveIntegerOrDefault(value, fallback) {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
function replaceLogControlCharacters(value) {
	let result = "";
	for (const char of value) {
		const codePoint = char.codePointAt(0);
		if (codePoint === void 0 || codePoint <= 31 || codePoint === 127 || codePoint === 8232 || codePoint === 8233) {
			result += " ";
			continue;
		}
		result += char;
	}
	return result;
}
function formatHookErrorForLog(err) {
	return (replaceLogControlCharacters(formatErrorMessage(err)).replace(/\s+/g, " ").trim() || "unknown error").slice(0, MAX_HOOK_LOG_MESSAGE_LENGTH);
}
function fireAndForgetHook(task, label, logger = logVerbose) {
	task.catch((err) => {
		logger(`${label}: ${formatHookErrorForLog(err)}`);
	});
}
function runFireAndForgetHookJob(state, job, limits) {
	state.active += 1;
	let didLogTimeout = false;
	const timeout = job.timeoutMs > 0 ? setTimeout(() => {
		didLogTimeout = true;
		job.logger(`${job.label}: timed out after ${job.timeoutMs}ms`);
	}, job.timeoutMs) : void 0;
	Promise.resolve().then(job.task).catch((err) => {
		if (!didLogTimeout) job.logger(`${job.label}: ${formatHookErrorForLog(err)}`);
	}).finally(() => {
		if (timeout) clearTimeout(timeout);
		state.active -= 1;
		drainFireAndForgetHookQueue(state, limits);
	});
}
function drainFireAndForgetHookQueue(state, limits) {
	while (state.active < limits.maxConcurrency) {
		const next = state.queue.shift();
		if (!next) return;
		runFireAndForgetHookJob(state, next, limits);
	}
}
function fireAndForgetBoundedHook(task, label, logger = logVerbose, options = {}) {
	const state = getFireAndForgetHookState();
	const maxConcurrency = positiveIntegerOrDefault(options.maxConcurrency, DEFAULT_MAX_CONCURRENT_FIRE_AND_FORGET_HOOKS);
	const maxQueue = positiveIntegerOrDefault(options.maxQueue, DEFAULT_MAX_QUEUED_FIRE_AND_FORGET_HOOKS);
	const timeoutMs = positiveIntegerOrDefault(options.timeoutMs, DEFAULT_FIRE_AND_FORGET_HOOK_TIMEOUT_MS);
	if (state.active >= maxConcurrency && state.queue.length >= maxQueue) {
		logger(`${label}: queue full; dropping hook`);
		return;
	}
	state.queue.push({
		task,
		label,
		logger,
		timeoutMs
	});
	drainFireAndForgetHookQueue(state, { maxConcurrency });
}
//#endregion
//#region src/hooks/message-hook-mappers.ts
function deriveInboundMessageHookContext(ctx, overrides) {
	const content = overrides?.content ?? (typeof ctx.BodyForCommands === "string" ? ctx.BodyForCommands : typeof ctx.RawBody === "string" ? ctx.RawBody : typeof ctx.Body === "string" ? ctx.Body : "");
	const channelId = normalizeLowercaseStringOrEmpty(ctx.OriginatingChannel ?? ctx.Surface ?? ctx.Provider ?? "");
	const conversationId = ctx.OriginatingTo ?? ctx.To ?? ctx.From ?? void 0;
	const isGroup = Boolean(ctx.GroupSubject || ctx.GroupChannel);
	const mediaPaths = Array.isArray(ctx.MediaPaths) ? ctx.MediaPaths.filter((value) => typeof value === "string" && value.length > 0) : void 0;
	const mediaTypes = Array.isArray(ctx.MediaTypes) ? ctx.MediaTypes.filter((value) => typeof value === "string" && value.length > 0) : void 0;
	return {
		from: ctx.From ?? "",
		to: ctx.To,
		content,
		body: ctx.Body,
		bodyForAgent: ctx.BodyForAgent,
		transcript: ctx.Transcript,
		timestamp: typeof ctx.Timestamp === "number" && Number.isFinite(ctx.Timestamp) ? ctx.Timestamp : void 0,
		channelId,
		accountId: ctx.AccountId,
		conversationId,
		messageId: overrides?.messageId ?? ctx.MessageSidFull ?? ctx.MessageSid ?? ctx.MessageSidFirst ?? ctx.MessageSidLast,
		senderId: ctx.SenderId,
		senderName: ctx.SenderName,
		senderUsername: ctx.SenderUsername,
		senderE164: ctx.SenderE164,
		provider: ctx.Provider,
		surface: ctx.Surface,
		threadId: ctx.MessageThreadId,
		mediaPath: ctx.MediaPath ?? mediaPaths?.[0],
		mediaType: ctx.MediaType ?? mediaTypes?.[0],
		mediaPaths,
		mediaTypes,
		originatingChannel: ctx.OriginatingChannel,
		originatingTo: ctx.OriginatingTo,
		guildId: ctx.GroupSpace,
		channelName: ctx.GroupChannel,
		isGroup,
		groupId: isGroup ? conversationId : void 0,
		topicName: ctx.TopicName
	};
}
function buildCanonicalSentMessageHookContext(params) {
	return {
		to: params.to,
		content: params.content,
		success: params.success,
		error: params.error,
		channelId: params.channelId,
		accountId: params.accountId,
		conversationId: params.conversationId ?? params.to,
		messageId: params.messageId,
		isGroup: params.isGroup,
		groupId: params.groupId
	};
}
function toPluginMessageContext(canonical) {
	return {
		channelId: canonical.channelId,
		accountId: canonical.accountId,
		conversationId: canonical.conversationId
	};
}
function stripChannelPrefix(value, channelId) {
	if (!value) return;
	for (const prefix of [
		"channel:",
		"chat:",
		"user:"
	]) if (value.startsWith(prefix)) return value.slice(prefix.length);
	const prefix = `${channelId}:`;
	return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
function resolveInboundConversation(canonical) {
	const channelId = normalizeChannelId(canonical.channelId);
	const pluginResolved = channelId ? getChannelPlugin(channelId)?.messaging?.resolveInboundConversation?.({
		from: canonical.from,
		to: canonical.to ?? canonical.originatingTo,
		conversationId: canonical.conversationId,
		threadId: canonical.threadId,
		isGroup: canonical.isGroup
	}) : null;
	if (pluginResolved) return {
		conversationId: normalizeOptionalString(pluginResolved.conversationId),
		parentConversationId: normalizeOptionalString(pluginResolved.parentConversationId)
	};
	return { conversationId: stripChannelPrefix(canonical.to ?? canonical.originatingTo ?? canonical.conversationId, canonical.channelId) };
}
function toPluginInboundClaimContext(canonical) {
	const conversation = resolveInboundConversation(canonical);
	return {
		channelId: canonical.channelId,
		accountId: canonical.accountId,
		conversationId: conversation.conversationId,
		parentConversationId: conversation.parentConversationId,
		senderId: canonical.senderId,
		messageId: canonical.messageId
	};
}
function toPluginInboundClaimEvent(canonical, extras) {
	const context = toPluginInboundClaimContext(canonical);
	return {
		content: canonical.content,
		body: canonical.body,
		bodyForAgent: canonical.bodyForAgent,
		transcript: canonical.transcript,
		timestamp: canonical.timestamp,
		channel: canonical.channelId,
		accountId: canonical.accountId,
		conversationId: context.conversationId,
		parentConversationId: context.parentConversationId,
		senderId: canonical.senderId,
		senderName: canonical.senderName,
		senderUsername: canonical.senderUsername,
		threadId: canonical.threadId,
		messageId: canonical.messageId,
		isGroup: canonical.isGroup,
		commandAuthorized: extras?.commandAuthorized,
		wasMentioned: extras?.wasMentioned,
		metadata: {
			from: canonical.from,
			to: canonical.to,
			provider: canonical.provider,
			surface: canonical.surface,
			originatingChannel: canonical.originatingChannel,
			originatingTo: canonical.originatingTo,
			senderE164: canonical.senderE164,
			mediaPath: canonical.mediaPath,
			mediaType: canonical.mediaType,
			mediaPaths: canonical.mediaPaths,
			mediaTypes: canonical.mediaTypes,
			guildId: canonical.guildId,
			channelName: canonical.channelName,
			groupId: canonical.groupId,
			topicName: canonical.topicName
		}
	};
}
function toPluginMessageReceivedEvent(canonical) {
	return {
		from: canonical.from,
		content: canonical.content,
		timestamp: canonical.timestamp,
		metadata: {
			to: canonical.to,
			provider: canonical.provider,
			surface: canonical.surface,
			threadId: canonical.threadId,
			originatingChannel: canonical.originatingChannel,
			originatingTo: canonical.originatingTo,
			messageId: canonical.messageId,
			senderId: canonical.senderId,
			senderName: canonical.senderName,
			senderUsername: canonical.senderUsername,
			senderE164: canonical.senderE164,
			guildId: canonical.guildId,
			channelName: canonical.channelName,
			topicName: canonical.topicName
		}
	};
}
function toPluginMessageSentEvent(canonical) {
	return {
		to: canonical.to,
		content: canonical.content,
		success: canonical.success,
		...canonical.error ? { error: canonical.error } : {}
	};
}
function toInternalMessageReceivedContext(canonical) {
	return {
		from: canonical.from,
		content: canonical.content,
		timestamp: canonical.timestamp,
		channelId: canonical.channelId,
		accountId: canonical.accountId,
		conversationId: canonical.conversationId,
		messageId: canonical.messageId,
		metadata: {
			to: canonical.to,
			provider: canonical.provider,
			surface: canonical.surface,
			threadId: canonical.threadId,
			senderId: canonical.senderId,
			senderName: canonical.senderName,
			senderUsername: canonical.senderUsername,
			senderE164: canonical.senderE164,
			guildId: canonical.guildId,
			channelName: canonical.channelName,
			topicName: canonical.topicName
		}
	};
}
function toInternalMessageTranscribedContext(canonical, cfg) {
	return {
		...toInternalInboundMessageHookContextBase(canonical),
		transcript: canonical.transcript ?? "",
		cfg
	};
}
function toInternalMessagePreprocessedContext(canonical, cfg) {
	return {
		...toInternalInboundMessageHookContextBase(canonical),
		transcript: canonical.transcript,
		isGroup: canonical.isGroup,
		groupId: canonical.groupId,
		cfg
	};
}
function toInternalInboundMessageHookContextBase(canonical) {
	return {
		from: canonical.from,
		to: canonical.to,
		body: canonical.body,
		bodyForAgent: canonical.bodyForAgent,
		timestamp: canonical.timestamp,
		channelId: canonical.channelId,
		conversationId: canonical.conversationId,
		messageId: canonical.messageId,
		senderId: canonical.senderId,
		senderName: canonical.senderName,
		senderUsername: canonical.senderUsername,
		provider: canonical.provider,
		surface: canonical.surface,
		mediaPath: canonical.mediaPath,
		mediaType: canonical.mediaType
	};
}
function toInternalMessageSentContext(canonical) {
	return {
		to: canonical.to,
		content: canonical.content,
		success: canonical.success,
		...canonical.error ? { error: canonical.error } : {},
		channelId: canonical.channelId,
		accountId: canonical.accountId,
		conversationId: canonical.conversationId,
		messageId: canonical.messageId,
		...canonical.isGroup != null ? { isGroup: canonical.isGroup } : {},
		...canonical.groupId ? { groupId: canonical.groupId } : {}
	};
}
//#endregion
export { toInternalMessageSentContext as a, toPluginInboundClaimEvent as c, toPluginMessageSentEvent as d, fireAndForgetBoundedHook as f, toInternalMessageReceivedContext as i, toPluginMessageContext as l, formatHookErrorForLog as m, deriveInboundMessageHookContext as n, toInternalMessageTranscribedContext as o, fireAndForgetHook as p, toInternalMessagePreprocessedContext as r, toPluginInboundClaimContext as s, buildCanonicalSentMessageHookContext as t, toPluginMessageReceivedEvent as u };
