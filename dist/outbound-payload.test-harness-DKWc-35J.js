import { n as vi } from "./test.DNmyFkvJ-SUcM9a0j.js";
import { r as primeChannelOutboundSendMock } from "./inbound-testkit-C0Y0uIU1.js";
import "./channel-contract-testing-DQvfl4Kl.js";
import { t as slackOutbound } from "./outbound-adapter-Ds2bgZp7.js";
//#region extensions/slack/src/outbound-payload.test-harness.ts
function createSlackOutboundPayloadHarness(params) {
	const sendSlack = vi.fn();
	primeChannelOutboundSendMock(sendSlack, {
		messageId: "sl-1",
		channelId: "C12345",
		ts: "1234.5678"
	}, params.sendResults);
	const ctx = {
		cfg: {},
		to: "C12345",
		text: "",
		payload: params.payload,
		deps: { sendSlack }
	};
	return {
		run: async () => await slackOutbound.sendPayload(ctx),
		sendMock: sendSlack,
		to: ctx.to
	};
}
//#endregion
export { createSlackOutboundPayloadHarness as t };
