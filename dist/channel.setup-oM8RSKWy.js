import { n as resolveWhatsAppGroupToolPolicy, r as resolveWhatsAppGroupIntroHint, t as resolveWhatsAppGroupRequireMention } from "./group-policy-DA_VkmZ7.js";
import { m as readWebAuthState } from "./auth-store-B3pQ6y7G.js";
import { r as whatsappSetupWizardProxy, t as createWhatsAppPluginBase } from "./shared-kRkKiinw.js";
import { t as whatsappSetupAdapter } from "./setup-core-DGF9qEPI.js";
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
