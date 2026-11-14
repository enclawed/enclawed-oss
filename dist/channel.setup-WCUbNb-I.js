import { t as createZalouserPluginBase } from "./shared-CqX9wuYV.js";
import { n as zalouserSetupAdapter } from "./setup-core-BAIF-1JG.js";
import { t as zalouserSetupWizard } from "./setup-surface-CkbuRYxN.js";
//#region extensions/zalouser/src/channel.setup.ts
const zalouserSetupPlugin = { ...createZalouserPluginBase({
	setupWizard: zalouserSetupWizard,
	setup: zalouserSetupAdapter
}) };
//#endregion
export { zalouserSetupPlugin as t };
