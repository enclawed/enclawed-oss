import { t as createZalouserPluginBase } from "./shared-Bfm4eekw.js";
import { n as zalouserSetupAdapter } from "./setup-core-BlIrJKty.js";
import { t as zalouserSetupWizard } from "./setup-surface-1cRM1-Gn.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
