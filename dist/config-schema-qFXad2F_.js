import { r as buildChannelConfigSchema } from "./config-schema-m9sdEi9w.js";
import { a as SignalConfigSchema } from "./zod-schema.providers-core-CSS7RluT.js";
import "./config-api-BWMGV2X9.js";
//#endregion
//#region extensions/signal/src/config-schema.ts
const SignalChannelConfigSchema = buildChannelConfigSchema(SignalConfigSchema, { uiHints: {
	"": {
		label: "Signal",
		help: "Signal channel provider configuration including account identity and DM policy behavior. Keep account mapping explicit so routing remains stable across multi-device setups."
	},
	dmPolicy: {
		label: "Signal DM Policy",
		help: "Direct message access control (\"pairing\" recommended). \"open\" requires channels.signal.allowFrom=[\"*\"]."
	},
	configWrites: {
		label: "Signal Config Writes",
		help: "Allow Signal to write config in response to channel events/commands (default: true)."
	},
	account: {
		label: "Signal Account",
		help: "Signal account identifier (phone/number handle) used to bind this channel config to a specific Signal identity. Keep this aligned with your linked device/session state."
	}
} });
//#endregion
export { SignalChannelConfigSchema as t };
