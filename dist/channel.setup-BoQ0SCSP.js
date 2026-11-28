import { n as resolveWhatsAppGroupToolPolicy, r as resolveWhatsAppGroupIntroHint, t as resolveWhatsAppGroupRequireMention } from "./group-policy-DL0EXd-T.js";
import { m as readWebAuthState } from "./auth-store-FEH7HxtI.js";
import { r as whatsappSetupWizardProxy, t as createWhatsAppPluginBase } from "./shared-D9svnToS.js";
import { t as whatsappSetupAdapter } from "./setup-core-DKvhBbNJ.js";
import { t as detectWhatsAppLegacyStateMigrations } from "./state-migrations-B3rQKdhH.js";
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
