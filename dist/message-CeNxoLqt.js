import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { g as GATEWAY_CLIENT_NAMES, h as GATEWAY_CLIENT_MODES } from "./message-channel-DxD903us.js";
import { c as projectOutboundPayloadPlanForMirror, n as planOutboundDeliveryCalls, o as projectOutboundPayloadPlanForDelivery, r as createOutboundPayloadPlan, t as deliverOutboundPayloads } from "./deliver-BvwPxrxr.js";
import { n as resolveOutboundChannelPlugin } from "./channel-resolution-OsF0kH1Q.js";
import { n as normalizePollInput } from "./polls-Dk8aYlEx.js";
import { n as resolveMessageChannelSelection } from "./channel-selection-BHBE29Vg.js";
import { t as buildOutboundSessionContext } from "./session-context-CClamfdH.js";
import { r as resolveOutboundTarget } from "./targets-CST6I73B.js";
//#region src/infra/outbound/message.ts
let messageConfigRuntimePromise = null;
let messageGatewayRuntimePromise = null;
function loadMessageConfigRuntime() {
	messageConfigRuntimePromise ??= import("./message.config.runtime-EzgCsQI1.js");
	return messageConfigRuntimePromise;
}
function loadMessageGatewayRuntime() {
	messageGatewayRuntimePromise ??= import("./message.gateway.runtime-CTWi9bmh.js");
	return messageGatewayRuntimePromise;
}
function buildMessagePollResult(params) {
	return {
		channel: params.channel,
		to: params.to,
		question: params.normalized.question,
		options: params.normalized.options,
		maxSelections: params.normalized.maxSelections,
		durationSeconds: params.normalized.durationSeconds ?? null,
		durationHours: params.normalized.durationHours ?? null,
		via: "gateway",
		...params.dryRun ? { dryRun: true } : { result: params.result }
	};
}
async function resolveRequiredChannel(params) {
	return (await resolveMessageChannelSelection({
		cfg: params.cfg,
		channel: params.channel
	})).channel;
}
function resolveRequiredPlugin(channel, cfg) {
	const plugin = resolveOutboundChannelPlugin({
		channel,
		cfg
	});
	if (!plugin) throw new Error(`Unknown channel: ${channel}`);
	return plugin;
}
function resolveGatewayOptions(opts) {
	return {
		url: opts?.mode === GATEWAY_CLIENT_MODES.BACKEND || opts?.clientName === GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT ? void 0 : opts?.url,
		token: opts?.token,
		timeoutMs: typeof opts?.timeoutMs === "number" && Number.isFinite(opts.timeoutMs) ? Math.max(1, Math.floor(opts.timeoutMs)) : 1e4,
		clientName: opts?.clientName ?? GATEWAY_CLIENT_NAMES.CLI,
		clientDisplayName: opts?.clientDisplayName,
		mode: opts?.mode ?? GATEWAY_CLIENT_MODES.CLI
	};
}
async function callMessageGateway(params) {
	const { callGatewayLeastPrivilege } = await loadMessageGatewayRuntime();
	const gateway = resolveGatewayOptions(params.gateway);
	return await callGatewayLeastPrivilege({
		url: gateway.url,
		token: gateway.token,
		method: params.method,
		params: params.params,
		timeoutMs: gateway.timeoutMs,
		clientName: gateway.clientName,
		clientDisplayName: gateway.clientDisplayName,
		mode: gateway.mode
	});
}
async function resolveMessageConfig(cfg) {
	if (cfg) return cfg;
	const { loadConfig } = await loadMessageConfigRuntime();
	return loadConfig();
}
async function resolveGatewayIdempotencyKey(idempotencyKey) {
	if (idempotencyKey) return idempotencyKey;
	const { randomIdempotencyKey } = await loadMessageGatewayRuntime();
	return randomIdempotencyKey();
}
function resolveDirectSendTarget(params) {
	const resolvedTarget = resolveOutboundTarget({
		channel: params.channel,
		to: params.to,
		cfg: params.cfg,
		accountId: params.accountId,
		mode: "explicit"
	});
	if (!resolvedTarget.ok) throw resolvedTarget.error;
	return resolvedTarget;
}
/**
* The adapter calls `sendMessage` would make on a direct-delivery channel,
* without making them (`planOutboundDeliveryCalls`): the same channel,
* target resolution and payload normalization. Null on a channel that
* delivers through the gateway's send method (its calls are made there).
*/
async function planSendMessageDelivery(params) {
	const cfg = params.cfg;
	const channel = await resolveRequiredChannel({
		cfg,
		channel: params.channel
	});
	if ((resolveRequiredPlugin(channel, cfg).outbound?.deliveryMode ?? "direct") === "gateway") return null;
	const normalizedPayloads = projectOutboundPayloadPlanForDelivery(createOutboundPayloadPlan([{
		text: params.content,
		mediaUrl: params.mediaUrl,
		mediaUrls: params.mediaUrls
	}]));
	return await planOutboundDeliveryCalls({
		cfg,
		channel,
		to: resolveDirectSendTarget({
			cfg,
			channel,
			to: params.to,
			accountId: params.accountId
		}).to,
		accountId: params.accountId,
		payloads: normalizedPayloads,
		replyToId: params.replyToId,
		threadId: params.threadId,
		gifPlayback: params.gifPlayback,
		forceDocument: params.forceDocument,
		silent: params.silent
	});
}
async function sendMessage(params) {
	const cfg = await resolveMessageConfig(params.cfg);
	const channel = await resolveRequiredChannel({
		cfg,
		channel: params.channel
	});
	const deliveryMode = resolveRequiredPlugin(channel, cfg).outbound?.deliveryMode ?? "direct";
	const outboundPlan = createOutboundPayloadPlan([{
		text: params.content,
		mediaUrl: params.mediaUrl,
		mediaUrls: params.mediaUrls
	}]);
	const normalizedPayloads = projectOutboundPayloadPlanForDelivery(outboundPlan);
	const mirrorProjection = projectOutboundPayloadPlanForMirror(outboundPlan);
	const mirrorText = mirrorProjection.text;
	const mirrorMediaUrls = mirrorProjection.mediaUrls;
	const primaryMediaUrl = mirrorMediaUrls[0] ?? params.mediaUrl ?? null;
	if (params.dryRun) return {
		channel,
		to: params.to,
		via: deliveryMode === "gateway" ? "gateway" : "direct",
		mediaUrl: primaryMediaUrl,
		mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : void 0,
		dryRun: true
	};
	if (deliveryMode !== "gateway") {
		const outboundChannel = channel;
		const resolvedTarget = resolveDirectSendTarget({
			cfg,
			channel: outboundChannel,
			to: params.to,
			accountId: params.accountId
		});
		const outboundSession = buildOutboundSessionContext({
			cfg,
			agentId: params.agentId,
			sessionKey: params.requesterSessionKey ?? params.mirror?.sessionKey,
			requesterAccountId: params.requesterAccountId ?? params.accountId,
			requesterSenderId: params.requesterSenderId,
			requesterSenderName: params.requesterSenderName,
			requesterSenderUsername: params.requesterSenderUsername,
			requesterSenderE164: params.requesterSenderE164
		});
		const results = await deliverOutboundPayloads({
			cfg,
			channel: outboundChannel,
			to: resolvedTarget.to,
			session: outboundSession,
			accountId: params.accountId,
			payloads: normalizedPayloads,
			replyToId: params.replyToId,
			threadId: params.threadId,
			gifPlayback: params.gifPlayback,
			forceDocument: params.forceDocument,
			deps: params.deps,
			bestEffort: params.bestEffort,
			abortSignal: params.abortSignal,
			silent: params.silent,
			mirror: params.mirror ? {
				...params.mirror,
				text: mirrorText || params.content,
				mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : void 0,
				idempotencyKey: params.mirror.idempotencyKey ?? params.idempotencyKey
			} : void 0
		});
		return {
			channel,
			to: params.to,
			via: "direct",
			mediaUrl: primaryMediaUrl,
			mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : void 0,
			result: results.at(-1)
		};
	}
	const result = await callMessageGateway({
		gateway: params.gateway,
		method: "send",
		params: {
			to: params.to,
			message: params.content,
			mediaUrl: params.mediaUrl,
			mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : params.mediaUrls,
			gifPlayback: params.gifPlayback,
			accountId: params.accountId,
			agentId: params.agentId,
			channel,
			sessionKey: params.mirror?.sessionKey,
			idempotencyKey: await resolveGatewayIdempotencyKey(params.idempotencyKey)
		}
	});
	return {
		channel,
		to: params.to,
		via: "gateway",
		mediaUrl: primaryMediaUrl,
		mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : void 0,
		result
	};
}
/**
* The `sendPoll` call the gateway's poll method would make for `sendPoll`
* (same target resolution and poll normalization), without making it, or
* null when the channel has no core poll path or the gateway would refuse
* the request.
*/
async function planSendPoll(params) {
	const cfg = params.cfg;
	const channel = await resolveRequiredChannel({
		cfg,
		channel: params.channel
	});
	const outbound = resolveRequiredPlugin(channel, cfg).outbound;
	if (!outbound?.sendPoll) return null;
	if (typeof params.durationSeconds === "number" && outbound.supportsPollDurationSeconds !== true || typeof params.isAnonymous === "boolean" && outbound.supportsAnonymousPolls !== true) return null;
	const pollInput = {
		question: params.question,
		options: params.options,
		maxSelections: params.maxSelections,
		durationSeconds: params.durationSeconds,
		durationHours: params.durationHours
	};
	const clientSide = outbound.pollMaxOptions ? normalizePollInput(pollInput, { maxOptions: outbound.pollMaxOptions }) : normalizePollInput(pollInput);
	const sent = {
		question: clientSide.question,
		options: clientSide.options,
		maxSelections: clientSide.maxSelections,
		durationSeconds: clientSide.durationSeconds,
		durationHours: clientSide.durationHours
	};
	const normalized = outbound.pollMaxOptions ? normalizePollInput(sent, { maxOptions: outbound.pollMaxOptions }) : normalizePollInput(sent);
	const accountId = normalizeOptionalString(params.accountId);
	return {
		outbound,
		poll: {
			cfg,
			to: resolveDirectSendTarget({
				cfg,
				channel,
				to: params.to.trim(),
				accountId
			}).to,
			poll: normalized,
			accountId,
			threadId: normalizeOptionalString(params.threadId),
			silent: params.silent,
			isAnonymous: params.isAnonymous
		}
	};
}
async function sendPoll(params) {
	const cfg = await resolveMessageConfig(params.cfg);
	const channel = await resolveRequiredChannel({
		cfg,
		channel: params.channel
	});
	const pollInput = {
		question: params.question,
		options: params.options,
		maxSelections: params.maxSelections,
		durationSeconds: params.durationSeconds,
		durationHours: params.durationHours
	};
	const outbound = resolveRequiredPlugin(channel, cfg)?.outbound;
	if (!outbound?.sendPoll) throw new Error(`Unsupported poll channel: ${channel}`);
	const normalized = outbound.pollMaxOptions ? normalizePollInput(pollInput, { maxOptions: outbound.pollMaxOptions }) : normalizePollInput(pollInput);
	if (params.dryRun) return buildMessagePollResult({
		channel,
		to: params.to,
		normalized,
		dryRun: true
	});
	const result = await callMessageGateway({
		gateway: params.gateway,
		method: "poll",
		params: {
			to: params.to,
			question: normalized.question,
			options: normalized.options,
			maxSelections: normalized.maxSelections,
			durationSeconds: normalized.durationSeconds,
			durationHours: normalized.durationHours,
			threadId: params.threadId,
			silent: params.silent,
			isAnonymous: params.isAnonymous,
			channel,
			accountId: params.accountId,
			idempotencyKey: await resolveGatewayIdempotencyKey(params.idempotencyKey)
		}
	});
	return buildMessagePollResult({
		channel,
		to: params.to,
		normalized,
		result
	});
}
//#endregion
export { sendPoll as i, planSendPoll as n, sendMessage as r, planSendMessageDelivery as t };
