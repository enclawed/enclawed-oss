import { n as resolveWhatsAppGroupToolPolicy, r as resolveWhatsAppGroupIntroHint, t as resolveWhatsAppGroupRequireMention } from "./group-policy-DDSRZGKD.js";
import { m as readWebAuthState } from "./auth-store-CEv2hGm3.js";
import { r as whatsappSetupWizardProxy, t as createWhatsAppPluginBase } from "./shared-ByIXBEEC.js";
import { t as whatsappSetupAdapter } from "./setup-core-DH_9iXVt.js";
import { t as detectWhatsAppLegacyStateMigrations } from "./state-migrations-DmWpHm6k.js";
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
