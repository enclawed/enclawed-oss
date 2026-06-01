import { t as createZalouserPluginBase } from "./shared-C5g4rTqS.js";
import { n as zalouserSetupAdapter } from "./setup-core-c8T-GWhH.js";
import { t as zalouserSetupWizard } from "./setup-surface-BJhMIHK4.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
