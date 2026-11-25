import { n as resolveWhatsAppGroupToolPolicy, r as resolveWhatsAppGroupIntroHint, t as resolveWhatsAppGroupRequireMention } from "./group-policy-zLy5Y7E5.js";
import { m as readWebAuthState } from "./auth-store-CZ_4qFws.js";
import { r as whatsappSetupWizardProxy, t as createWhatsAppPluginBase } from "./shared-BqkDKwl6.js";
import { t as whatsappSetupAdapter } from "./setup-core-ZR0_b-Vh.js";
import { t as detectWhatsAppLegacyStateMigrations } from "./state-migrations-CQFekgJM.js";
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
