import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { t as normalizeChatType } from "./chat-type-DUg3y7bt.js";
import { t as resolveConversationLabel } from "./conversation-label-IBF9k0Yz.js";
import { n as vi, t as globalExpect } from "./test.D1JkM1w4-D13rLkG2.js";
//#region src/channels/sender-identity.ts
function validateSenderIdentity(ctx) {
	const issues = [];
	const isDirect = normalizeChatType(ctx.ChatType) === "direct";
	const senderId = normalizeOptionalString(ctx.SenderId) || "";
	const senderName = normalizeOptionalString(ctx.SenderName) || "";
	const senderUsername = normalizeOptionalString(ctx.SenderUsername) || "";
	const senderE164 = normalizeOptionalString(ctx.SenderE164) || "";
	if (!isDirect) {
		if (!senderId && !senderName && !senderUsername && !senderE164) issues.push("missing sender identity (SenderId/SenderName/SenderUsername/SenderE164)");
	}
	if (senderE164) {
		if (!/^\+\d{3,}$/.test(senderE164)) issues.push(`invalid SenderE164: ${senderE164}`);
	}
	if (senderUsername) {
		if (senderUsername.includes("@")) issues.push(`SenderUsername should not include "@": ${senderUsername}`);
		if (/\s/.test(senderUsername)) issues.push(`SenderUsername should not include whitespace: ${senderUsername}`);
	}
	if (ctx.SenderId != null && !senderId) issues.push("SenderId is set but empty");
	return issues;
}
//#endregion
//#region src/channels/plugins/contracts/test-helpers.ts
function primeChannelOutboundSendMock(sendMock, fallbackResult, sendResults = []) {
	sendMock.mockReset();
	if (sendResults.length === 0) {
		sendMock.mockResolvedValue(fallbackResult);
		return;
	}
	for (const result of sendResults) sendMock.mockResolvedValueOnce(result);
}
function expectChannelInboundContextContract(ctx) {
	globalExpect(validateSenderIdentity(ctx)).toEqual([]);
	globalExpect(ctx.Body).toBeTypeOf("string");
	globalExpect(ctx.BodyForAgent).toBeTypeOf("string");
	globalExpect(ctx.BodyForCommands).toBeTypeOf("string");
	const chatType = normalizeChatType(ctx.ChatType);
	if (chatType && chatType !== "direct") globalExpect(ctx.ConversationLabel?.trim() || resolveConversationLabel(ctx)).toBeTruthy();
}
//#endregion
//#region src/channels/plugins/contracts/inbound-testkit.ts
function createInboundContextCapture() {
	return { ctx: void 0 };
}
function buildDispatchInboundCaptureMock(actual, setCtx) {
	const dispatchInboundMessage = vi.fn(async (params) => {
		setCtx(params.ctx);
		return {
			queuedFinal: false,
			counts: {
				tool: 0,
				block: 0,
				final: 0
			}
		};
	});
	return {
		...actual,
		dispatchInboundMessage,
		dispatchInboundMessageWithDispatcher: dispatchInboundMessage,
		dispatchInboundMessageWithBufferedDispatcher: dispatchInboundMessage
	};
}
createInboundContextCapture();
//#endregion
export { expectChannelInboundContextContract as n, primeChannelOutboundSendMock as r, buildDispatchInboundCaptureMock as t };
