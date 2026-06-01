import { n as resolveWhatsAppGroupToolPolicy, r as resolveWhatsAppGroupIntroHint, t as resolveWhatsAppGroupRequireMention } from "./group-policy-D0SIIvUK.js";
import { m as readWebAuthState } from "./auth-store-B8a74NE_.js";
import { r as whatsappSetupWizardProxy, t as createWhatsAppPluginBase } from "./shared-De-FVVh-.js";
import { t as whatsappSetupAdapter } from "./setup-core-CaCC4nIT.js";
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
