import { t as getGlobalHookRunner } from "./hook-runner-global-BroItLZD.js";
import "./constants-D11gkljK.js";
import { t as buildOutboundMediaLoadOptions } from "./load-options-DUeaBIoT.js";
import { AsyncLocalStorage } from "node:async_hooks";
//#region src/media/configured-max-bytes.ts
const MB = 1024 * 1024;
function resolveConfiguredMediaMaxBytes(cfg) {
	const configured = cfg?.agents?.defaults?.mediaMaxMb;
	if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) return Math.floor(configured * MB);
}
//#endregion
//#region src/infra/outbound/sending-scope.ts
const mediatedScope = new AsyncLocalStorage();
/** True inside a delivery whose payload already ran the outbound sending hooks. */
function isOutboundSendMediated() {
	return mediatedScope.getStore() === true;
}
/** Run `fn` as a delivery whose payload already ran the outbound sending hooks. */
function runAsMediatedOutboundSend(fn) {
	return mediatedScope.run(true, fn);
}
//#endregion
//#region src/infra/outbound/sending-hooks.ts
let mediaSendingRuntimePromise;
async function loadMediaSendingRuntime() {
	mediaSendingRuntimePromise ??= import("./media-sending.runtime-7HxV1qdS.js");
	return await mediaSendingRuntimePromise;
}
/** True when a `message_sending` or `media_sending` handler is registered. */
function hasOutboundSendingHooks(hookRunner = getGlobalHookRunner()) {
	return Boolean(hookRunner && (hookRunner.hasHooks("message_sending") || hookRunner.hasHooks("media_sending")));
}
/**
* Run `media_sending` over attachments the caller already holds as bytes.
* Returns the replacement attachments when a handler rewrote them.
*/
async function runMediaSendingHookOnLoadedMedia(params) {
	const { target } = params;
	const result = await params.hookRunner.runMediaSending({
		to: target.to,
		content: params.text,
		media: params.media,
		metadata: {
			...target.metadata,
			channel: target.channel,
			accountId: target.accountId
		}
	}, {
		channelId: target.channel,
		accountId: target.accountId,
		conversationId: target.conversationId ?? target.to
	});
	if (result?.cancel) return { cancelled: true };
	if (!result?.media) return {
		cancelled: false,
		changed: false
	};
	if (result.media.length === 0 && !params.text.trim()) return { cancelled: true };
	return {
		cancelled: false,
		changed: true,
		media: result.media
	};
}
/** Largest attachment the sending hooks load: the configured cap, else the largest default. */
function resolveSendingMaxBytes(cfg) {
	return resolveConfiguredMediaMaxBytes(cfg) ?? 104857600;
}
/**
* Run `media_sending` over one send's attachments. The media is loaded under
* the sender's media-access policy, so a handler never sees a file the sender
* could not send; replacements are saved to the outbound media store.
*/
async function runMediaSendingHook(params) {
	const { target } = params;
	const unchanged = {
		cancelled: false,
		changed: false,
		mediaUrls: [...params.mediaUrls]
	};
	if (params.mediaUrls.length === 0 || !params.hookRunner.hasHooks("media_sending")) return unchanged;
	const runtime = await loadMediaSendingRuntime();
	const mediaAccess = target.mediaAccess ?? { localRoots: runtime.getAgentScopedMediaLocalRoots(target.cfg, target.agentId) };
	const maxBytes = resolveSendingMaxBytes(target.cfg);
	const media = [];
	for (const source of params.mediaUrls) {
		const loaded = await runtime.loadWebMediaRaw(source, buildOutboundMediaLoadOptions({
			maxBytes,
			mediaAccess,
			optimizeImages: false
		}));
		media.push({
			source,
			buffer: loaded.buffer,
			...loaded.contentType ? { contentType: loaded.contentType } : {},
			...loaded.fileName ? { fileName: loaded.fileName } : {}
		});
	}
	const result = await runMediaSendingHookOnLoadedMedia({
		hookRunner: params.hookRunner,
		text: params.text,
		media,
		target
	});
	if (result.cancelled) return { cancelled: true };
	if (!result.changed) return unchanged;
	const mediaUrls = [];
	for (const item of result.media) {
		const saved = await runtime.saveMediaBuffer(item.buffer, item.contentType, "outbound", maxBytes, item.fileName);
		mediaUrls.push(saved.path);
	}
	return {
		cancelled: false,
		changed: true,
		mediaUrls
	};
}
/**
* Run `message_sending` then `media_sending` over one outbound send. A no-op
* (unchanged) when no handler is registered, or when the caller is already
* inside a delivery whose payload ran the hooks (see `sending-scope.ts`).
*/
async function runOutboundSendingHooks(params) {
	const mediaUrls = [...params.mediaUrls ?? []];
	const unchanged = {
		cancelled: false,
		changed: false,
		text: params.text,
		mediaUrls
	};
	const hookRunner = params.hookRunner === void 0 ? getGlobalHookRunner() : params.hookRunner;
	if (!hookRunner || isOutboundSendMediated()) return unchanged;
	const { target } = params;
	let text = params.text;
	let changed = false;
	if (hookRunner.hasHooks("message_sending")) {
		const result = await hookRunner.runMessageSending({
			to: target.to,
			content: text,
			...target.replyToId != null ? { replyToId: target.replyToId } : {},
			...target.threadId != null ? { threadId: target.threadId } : {},
			metadata: {
				...target.metadata,
				channel: target.channel,
				accountId: target.accountId,
				mediaUrls,
				...target.threadId != null ? { threadId: target.threadId } : {}
			}
		}, {
			channelId: target.channel,
			accountId: target.accountId,
			conversationId: target.conversationId ?? target.to
		});
		if (result?.cancel) return { cancelled: true };
		if (typeof result?.content === "string" && result.content !== text) {
			text = result.content;
			changed = true;
		}
	}
	const media = await runMediaSendingHook({
		hookRunner,
		text,
		mediaUrls,
		target
	});
	if (media.cancelled) return { cancelled: true };
	return {
		cancelled: false,
		changed: changed || media.changed,
		text,
		mediaUrls: media.mediaUrls
	};
}
/**
* Apply a sending outcome to a reply payload: the rewritten text and, when the
* attachments were rewritten, the saved replacements. Returns null when the
* send was cancelled.
*/
function applyOutboundSendingOutcome(payload, outcome) {
	if (outcome.cancelled) return null;
	if (!outcome.changed) return payload;
	const originalText = payload.text ?? "";
	const textChanged = outcome.text !== originalText;
	const original = payload.mediaUrls?.length ? payload.mediaUrls : payload.mediaUrl ? [payload.mediaUrl] : [];
	const mediaChanged = original.length !== outcome.mediaUrls.length || original.some((url, index) => url !== outcome.mediaUrls[index]);
	return {
		...payload,
		...textChanged ? { text: outcome.text } : {},
		...mediaChanged ? {
			mediaUrl: outcome.mediaUrls[0],
			mediaUrls: outcome.mediaUrls.length > 0 ? outcome.mediaUrls : void 0
		} : {}
	};
}
//#endregion
export { runOutboundSendingHooks as a, resolveConfiguredMediaMaxBytes as c, runMediaSendingHookOnLoadedMedia as i, hasOutboundSendingHooks as n, isOutboundSendMediated as o, runMediaSendingHook as r, runAsMediatedOutboundSend as s, applyOutboundSendingOutcome as t };
