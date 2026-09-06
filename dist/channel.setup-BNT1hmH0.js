import { t as createZalouserPluginBase } from "./shared-DpDItsIq.js";
import { n as zalouserSetupAdapter } from "./setup-core-CwxgwCuG.js";
import { t as zalouserSetupWizard } from "./setup-surface-WpKue61Z.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
