import { n as resolveWhatsAppGroupToolPolicy, r as resolveWhatsAppGroupIntroHint, t as resolveWhatsAppGroupRequireMention } from "./group-policy-CBc84Pdi.js";
import { m as readWebAuthState } from "./auth-store-BUBPgsD7.js";
import { r as whatsappSetupWizardProxy, t as createWhatsAppPluginBase } from "./shared-B5O5lAsv.js";
import { t as whatsappSetupAdapter } from "./setup-core-D4VO0Suw.js";
import { t as detectWhatsAppLegacyStateMigrations } from "./state-migrations-abvyJa8Y.js";
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
