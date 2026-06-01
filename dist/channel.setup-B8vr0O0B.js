import "./resolve-CzoIbKW1.js";
import { a as qqbotSetupAdapterShared, i as qqbotMeta, n as qqbotSetupWizard, r as qqbotConfigAdapter, t as qqbotChannelConfigSchema } from "./config-schema-CVP7YsHo.js";
//#region extensions/qqbot/src/channel.setup.ts
/**
* Setup-only QQBot plugin — lightweight subset used during `enclawed onboard`
* and `enclawed configure` without pulling the full runtime dependencies.
*/
const qqbotSetupPlugin = {
	id: "qqbot",
	setupWizard: qqbotSetupWizard,
	meta: { ...qqbotMeta },
	capabilities: {
		chatTypes: ["direct", "group"],
		media: true,
		reactions: false,
		threads: false,
		blockStreaming: true
	},
	reload: { configPrefixes: ["channels.qqbot"] },
	configSchema: qqbotChannelConfigSchema,
	config: { ...qqbotConfigAdapter },
	setup: { ...qqbotSetupAdapterShared }
};
//#endregion
export { qqbotSetupPlugin as t };
