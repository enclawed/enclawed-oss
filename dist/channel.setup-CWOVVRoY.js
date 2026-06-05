import { t as createZalouserPluginBase } from "./shared-DyEQ9Gb3.js";
import { n as zalouserSetupAdapter } from "./setup-core-Cn_en6vi.js";
import { t as zalouserSetupWizard } from "./setup-surface-C4BaOU9H.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
