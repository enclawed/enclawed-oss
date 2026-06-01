import { a as resetGlobalHookRunner } from "./hook-runner-global-B18jmw-H.js";
import { c as it, o as beforeEach, t as globalExpect } from "./test.D1JkM1w4-D13rLkG2.js";
import "./inbound-testkit-C_igZ148.js";
//#region src/channels/plugins/contracts/outbound-payload-testkit.ts
function installChannelOutboundPayloadContractSuite(params) {
	beforeEach(() => {
		resetGlobalHookRunner();
	});
	it("text-only delegates to sendText", async () => {
		const { run, sendMock, to } = await params.createHarness({ payload: { text: "hello" } });
		const result = await run();
		globalExpect(sendMock).toHaveBeenCalledTimes(1);
		globalExpect(sendMock).toHaveBeenCalledWith(to, "hello", globalExpect.any(Object));
		globalExpect(result).toMatchObject({ channel: params.channel });
	});
	it("single media delegates to sendMedia", async () => {
		const { run, sendMock, to } = await params.createHarness({ payload: {
			text: "cap",
			mediaUrl: "https://example.com/a.jpg"
		} });
		const result = await run();
		globalExpect(sendMock).toHaveBeenCalledTimes(1);
		globalExpect(sendMock).toHaveBeenCalledWith(to, "cap", globalExpect.objectContaining({ mediaUrl: "https://example.com/a.jpg" }));
		globalExpect(result).toMatchObject({ channel: params.channel });
	});
	it("multi-media iterates URLs with caption on first", async () => {
		const { run, sendMock, to } = await params.createHarness({
			payload: {
				text: "caption",
				mediaUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"]
			},
			sendResults: [{ messageId: "m-1" }, { messageId: "m-2" }]
		});
		const result = await run();
		globalExpect(sendMock).toHaveBeenCalledTimes(2);
		globalExpect(sendMock).toHaveBeenNthCalledWith(1, to, "caption", globalExpect.objectContaining({ mediaUrl: "https://example.com/1.jpg" }));
		globalExpect(sendMock).toHaveBeenNthCalledWith(2, to, "", globalExpect.objectContaining({ mediaUrl: "https://example.com/2.jpg" }));
		globalExpect(result).toMatchObject({
			channel: params.channel,
			messageId: "m-2"
		});
	});
	it("empty payload returns no-op", async () => {
		const { run, sendMock } = await params.createHarness({ payload: {} });
		const result = await run();
		globalExpect(sendMock).not.toHaveBeenCalled();
		globalExpect(result).toEqual({
			channel: params.channel,
			messageId: ""
		});
	});
	if (params.chunking.mode === "passthrough") {
		it("text exceeding chunk limit is sent as-is when chunker is null", async () => {
			const text = "a".repeat(params.chunking.longTextLength);
			const { run, sendMock, to } = await params.createHarness({ payload: { text } });
			const result = await run();
			globalExpect(sendMock).toHaveBeenCalledTimes(1);
			globalExpect(sendMock).toHaveBeenCalledWith(to, text, globalExpect.any(Object));
			globalExpect(result).toMatchObject({ channel: params.channel });
		});
		return;
	}
	const chunking = params.chunking;
	it("chunking splits long text", async () => {
		const text = "a".repeat(chunking.longTextLength);
		const { run, sendMock } = await params.createHarness({
			payload: { text },
			sendResults: [{ messageId: "c-1" }, { messageId: "c-2" }]
		});
		const result = await run();
		globalExpect(sendMock.mock.calls.length).toBeGreaterThanOrEqual(2);
		for (const call of sendMock.mock.calls) globalExpect(call[1].length).toBeLessThanOrEqual(chunking.maxChunkLength);
		globalExpect(result).toMatchObject({ channel: params.channel });
	});
}
//#endregion
export { installChannelOutboundPayloadContractSuite as t };
