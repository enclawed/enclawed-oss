import { n as resolveWhatsAppGroupToolPolicy, r as resolveWhatsAppGroupIntroHint, t as resolveWhatsAppGroupRequireMention } from "./group-policy-BlSBfHIb.js";
import { m as readWebAuthState } from "./auth-store-Du-ZfACA.js";
import { r as whatsappSetupWizardProxy, t as createWhatsAppPluginBase } from "./shared-BzvT1P1R.js";
import { t as whatsappSetupAdapter } from "./setup-core-DcN6cCdE.js";
import { t as detectWhatsAppLegacyStateMigrations } from "./state-migrations-UtYggpzJ.js";
//#region extensions/whatsapp/src/channel.setup.ts
const whatsappSetupPlugin = {
	...createWhatsAppPluginBase({
		groups: {
			resolveRequireMention: resolveWhatsAppGroupRequireMention,
			resolveToolPolicy: resolveWhatsAppGroupToolPolicy,
			resolveGroupIntroHint: resolveWhatsAppGroupIntroHint
		},
		setupWizard: whatsappSetupWizardProxy,
		setup: whatsappSetupAdapter,
		isConfigured: async (account) => await readWebAuthState(account.authDir) === "linked"
	}),
	lifecycle: { detectLegacyStateMigrations: ({ oauthDir }) => detectWhatsAppLegacyStateMigrations({ oauthDir }) }
};
//#endregion
export { whatsappSetupPlugin as t };
