import { h as MarkdownConfigSchema, o as DmPolicySchema } from "./zod-schema.core-PXLVKQoM.js";
import { t as AllowFromListSchema } from "./config-schema-Dl-YbJo-.js";
import "./direct-dm-access-Dy_-8YMf.js";
import "./channel-config-primitives-CyMeF3dm.js";
import "./channel-plugin-common-BZ0_GSRs.js";
import { r as buildSecretInputSchema } from "./secret-input-CLk7ofM4.js";
import "./status-helpers-Z5fKx70K.js";
import { t as zod_exports } from "./zod-D31fSMXP.js";
//#region extensions/nostr/src/config-schema.ts
/**
* Validates https:// URLs only (no javascript:, data:, file:, etc.)
*/
const safeUrlSchema = zod_exports.z.string().url().refine((url) => {
	try {
		return new URL(url).protocol === "https:";
	} catch {
		return false;
	}
}, { message: "URL must use https:// protocol" });
/**
* NIP-01 profile metadata schema
* https://github.com/nostr-protocol/nips/blob/master/01.md
*/
const NostrProfileSchema = zod_exports.z.object({
	name: zod_exports.z.string().max(256).optional(),
	displayName: zod_exports.z.string().max(256).optional(),
	about: zod_exports.z.string().max(2e3).optional(),
	picture: safeUrlSchema.optional(),
	banner: safeUrlSchema.optional(),
	website: safeUrlSchema.optional(),
	nip05: zod_exports.z.string().optional(),
	lud16: zod_exports.z.string().optional()
});
/**
* Zod schema for channels.nostr.* configuration
*/
const NostrConfigSchema = zod_exports.z.object({
	name: zod_exports.z.string().optional(),
	defaultAccount: zod_exports.z.string().optional(),
	enabled: zod_exports.z.boolean().optional(),
	markdown: MarkdownConfigSchema,
	privateKey: buildSecretInputSchema().optional(),
	relays: zod_exports.z.array(zod_exports.z.string()).optional(),
	dmPolicy: DmPolicySchema.optional(),
	allowFrom: AllowFromListSchema,
	profile: NostrProfileSchema.optional()
});
//#endregion
export { NostrProfileSchema as n, NostrConfigSchema as t };
