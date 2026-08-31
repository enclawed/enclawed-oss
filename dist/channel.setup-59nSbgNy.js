import { t as createZalouserPluginBase } from "./shared-CymhuquL.js";
import { n as zalouserSetupAdapter } from "./setup-core-CnvYUKr_.js";
import { t as zalouserSetupWizard } from "./setup-surface-DCFuxlpC.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
