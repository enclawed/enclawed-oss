import { i as normalizeChannelId, t as getChannelPlugin } from "./registry-CI36HBCI.js";
import "./plugins-lmHd1cqM.js";
import { t as normalizeChatType } from "./chat-type-DUg3y7bt.js";
import { n as createReplyPrefixOptions } from "./reply-prefix-ClzzHSED.js";
import { t as createTypingCallbacks } from "./typing-Cqa1stT5.js";
//#region src/auto-reply/reply/source-reply-delivery-mode.ts
function resolveSourceReplyDeliveryMode(params) {
	if (params.requested) return params.messageToolAvailable === false && params.requested === "message_tool_only" ? "automatic" : params.requested;
	if (params.ctx.CommandSource === "native") return "automatic";
	const chatType = normalizeChatType(params.ctx.ChatType);
	let mode;
	if (chatType === "group" || chatType === "channel") mode = (params.cfg.messages?.groupChat?.visibleReplies ?? params.cfg.messages?.visibleReplies) === "automatic" ? "automatic" : "message_tool_only";
	else mode = (params.cfg.messages?.visibleReplies ?? params.defaultVisibleReplies) === "message_tool" ? "message_tool_only" : "automatic";
	if (mode === "message_tool_only" && params.messageToolAvailable === false) return "automatic";
	return mode;
}
//#endregion
//#region src/plugin-sdk/channel-reply-pipeline.ts
function createChannelReplyPipeline(params) {
	const channelId = params.channel ? normalizeChannelId(params.channel) ?? params.channel : void 0;
	let plugin;
	let pluginTransformResolved = false;
	const resolvePluginTransform = () => {
		if (pluginTransformResolved) return plugin?.messaging?.transformReplyPayload;
		pluginTransformResolved = true;
		plugin = channelId ? getChannelPlugin(channelId) : void 0;
		return plugin?.messaging?.transformReplyPayload;
	};
	const transformReplyPayload = params.transformReplyPayload ? params.transformReplyPayload : channelId ? (payload) => resolvePluginTransform()?.({
		payload,
		cfg: params.cfg,
		accountId: params.accountId
	}) ?? payload : void 0;
	return {
		...createReplyPrefixOptions({
			cfg: params.cfg,
			agentId: params.agentId,
			channel: params.channel,
			accountId: params.accountId
		}),
		...transformReplyPayload ? { transformReplyPayload } : {},
		...params.typingCallbacks ? { typingCallbacks: params.typingCallbacks } : params.typing ? { typingCallbacks: createTypingCallbacks(params.typing) } : {}
	};
}
function resolveChannelSourceReplyDeliveryMode(params) {
	return resolveSourceReplyDeliveryMode(params);
}
//#endregion
export { resolveChannelSourceReplyDeliveryMode as n, createChannelReplyPipeline as t };
