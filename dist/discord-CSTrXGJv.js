import { i as __reExport, r as __exportAll } from "./chunk-iyeSoAlh.js";
import { $ as IsMap, A as IsBigInt$1, At as IsSymbol, B as Union, C as IsLiteralNumber, Ct as IsMinLength$1, D as IsInteger$1, Dt as IsObject, Et as IsNumber, F as IsEnum$1, Ft as Symbols, G as Ref$1, H as _Object_, J as IsBase, K as IsArray$1, L as IsCyclic, M as Hash, Mt as IsUnsafePropertyKey, N as Unreachable, Nt as IsValueLike, O as Boolean$1, Ot as IsObjectNotArray, P as IsIntersect, Pt as Keys, Q as Get$2, R as Unknown, S as IsLiteralBoolean, St as IsMaxLength$1, T as Literal, Tt as IsNull, V as IsObject$1, W as IsRef$1, X as Optional, Y as IsOptional, Z as IsSchema$1, _ as IsNumber$1, _t as IsGreaterThan, a as IsTemplateLiteral, at as EveryAll, b as IsLiteral, bt as IsLessEqualThan, c as IsRecord, ct as IsAsyncIterator, d as RecordValue, dt as IsClassInstance, et as IsSet, f as IsTuple, ft as IsConstructor, g as String$1, gt as IsGreaterEqualThan, h as IsString$1, ht as IsFunction, i as Compare, it as Every, j as IsCodec, jt as IsUndefined, k as IsBoolean$1, kt as IsString, lt as IsBigInt, m as TemplateLiteralDecode, mt as IsEqual, n as Instantiate, nt as Entries, o as IsVoid, ot as HasPropertyKey, p as EnumToUnion, pt as IsDeepEqual, r as Options, rt as EntriesRegExp, s as IsUndefined$1, st as IsArray, t as Evaluate, tt as IsTypeArray, u as RecordPattern, ut as IsBoolean, v as Number$1, vt as IsInteger, w as IsLiteralString, wt as IsMultipleOf$1, x as IsLiteralBigInt, xt as IsLessThan, y as IsNull$1, yt as IsIterator, z as IsUnion } from "./build-D6ni3YJD.js";
import { inspect } from "node:util";
import { createHash } from "node:crypto";
import { ApplicationCommandOptionType, ApplicationCommandType, ButtonStyle, ComponentType, GatewayDispatchEvents, InteractionContextType, InteractionResponseType, InteractionType, MessageFlags, Routes, TextInputStyle } from "discord-api-types/v10";
//#region node_modules/typebox/build/system/arguments/arguments.mjs
/**
* Match arguments for overloaded functions that use the `...args: unknown[]` pattern. Arguments
* are parsed using argument length only.
*/
function Match$1(args, match) {
	return match[args.length]?.(...args) ?? (() => {
		throw Error("Invalid Arguments");
	})();
}
//#endregion
//#region node_modules/typebox/build/system/locale/en_US.mjs
/** en_US: English (United States) - ISO 639-1 language code 'en' with ISO 3166-1 alpha-2 country code 'US' for United States. */
function en_US(error) {
	switch (error.keyword) {
		case "additionalProperties": return "must not have additional properties";
		case "anyOf": return "must match a schema in anyOf";
		case "boolean": return "schema is false";
		case "const": return "must be equal to constant";
		case "contains": return "must contain at least 1 valid item";
		case "dependencies": return `must have properties ${error.params.dependencies.join(", ")} when property ${error.params.property} is present`;
		case "dependentRequired": return `must have properties ${error.params.dependencies.join(", ")} when property ${error.params.property} is present`;
		case "enum": return "must be equal to one of the allowed values";
		case "exclusiveMaximum": return `must be ${error.params.comparison} ${error.params.limit}`;
		case "exclusiveMinimum": return `must be ${error.params.comparison} ${error.params.limit}`;
		case "format": return `must match format "${error.params.format}"`;
		case "if": return `must match "${error.params.failingKeyword}" schema`;
		case "maxItems": return `must not have more than ${error.params.limit} items`;
		case "maxLength": return `must not have more than ${error.params.limit} characters`;
		case "maxProperties": return `must not have more than ${error.params.limit} properties`;
		case "maximum": return `must be ${error.params.comparison} ${error.params.limit}`;
		case "minItems": return `must not have fewer than ${error.params.limit} items`;
		case "minLength": return `must not have fewer than ${error.params.limit} characters`;
		case "minProperties": return `must not have fewer than ${error.params.limit} properties`;
		case "minimum": return `must be ${error.params.comparison} ${error.params.limit}`;
		case "multipleOf": return `must be multiple of ${error.params.multipleOf}`;
		case "not": return "must not be valid";
		case "oneOf": return "must match exactly one schema in oneOf";
		case "pattern": return `must match pattern "${error.params.pattern}"`;
		case "propertyNames": return `property names ${error.params.propertyNames.join(", ")} are invalid`;
		case "required": return `must have required properties ${error.params.requiredProperties.join(", ")}`;
		case "type": return typeof error.params.type === "string" ? `must be ${error.params.type}` : `must be either ${error.params.type.join(" or ")}`;
		case "unevaluatedItems": return "must not have unevaluated items";
		case "unevaluatedProperties": return "must not have unevaluated properties";
		case "uniqueItems": return `must not have duplicate items`;
		case "~guard": return `must match check function`;
		case "~refine": return error.params.message;
		default: return "an unknown validation error occurred";
	}
}
//#endregion
//#region node_modules/typebox/build/system/locale/_config.mjs
let locale = en_US;
/** Gets the locale */
function Get$1() {
	return locale;
}
//#endregion
//#region extensions/discord/src/internal/api.commands.ts
async function listApplicationCommands(rest, clientId) {
	return await rest.get(Routes.applicationCommands(clientId));
}
async function createApplicationCommand(rest, clientId, body) {
	return await rest.post(Routes.applicationCommands(clientId), { body });
}
async function editApplicationCommand(rest, clientId, commandId, body) {
	return await rest.patch(Routes.applicationCommand(clientId, commandId), { body });
}
async function deleteApplicationCommand(rest, clientId, commandId) {
	await rest.delete(Routes.applicationCommand(clientId, commandId));
}
async function overwriteApplicationCommands(rest, clientId, body) {
	await rest.put(Routes.applicationCommands(clientId), { body });
}
async function overwriteGuildApplicationCommands(rest, clientId, guildId, body) {
	await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
}
//#endregion
//#region extensions/discord/src/internal/api.guild.ts
async function getGuild(rest, guildId) {
	return await rest.get(Routes.guild(guildId));
}
async function createGuildChannel(rest, guildId, data) {
	return await rest.post(Routes.guildChannels(guildId), data);
}
async function moveGuildChannels(rest, guildId, data) {
	await rest.patch(Routes.guildChannels(guildId), data);
}
async function getGuildMember(rest, guildId, userId) {
	return await rest.get(Routes.guildMember(guildId, userId));
}
async function listGuildRoles(rest, guildId) {
	return await rest.get(Routes.guildRoles(guildId));
}
async function listGuildChannels(rest, guildId) {
	return await rest.get(Routes.guildChannels(guildId));
}
async function putChannelPermission(rest, channelId, targetId, data) {
	await rest.put(Routes.channelPermission(channelId, targetId), data);
}
async function deleteChannelPermission(rest, channelId, targetId) {
	await rest.delete(Routes.channelPermission(channelId, targetId));
}
async function listGuildActiveThreads(rest, guildId) {
	return await rest.get(Routes.guildActiveThreads(guildId));
}
async function getGuildVoiceState(rest, guildId, userId) {
	return await rest.get(Routes.guildVoiceState(guildId, userId));
}
async function listGuildScheduledEvents(rest, guildId) {
	return await rest.get(Routes.guildScheduledEvents(guildId));
}
async function createGuildScheduledEvent(rest, guildId, body) {
	return await rest.post(Routes.guildScheduledEvents(guildId), { body });
}
async function timeoutGuildMember(rest, guildId, userId, data) {
	return await rest.patch(Routes.guildMember(guildId, userId), data);
}
async function addGuildMemberRole(rest, guildId, userId, roleId) {
	await rest.put(Routes.guildMemberRole(guildId, userId, roleId));
}
async function removeGuildMemberRole(rest, guildId, userId, roleId) {
	await rest.delete(Routes.guildMemberRole(guildId, userId, roleId));
}
async function removeGuildMember(rest, guildId, userId, data) {
	await rest.delete(Routes.guildMember(guildId, userId), data);
}
async function createGuildBan(rest, guildId, userId, data) {
	await rest.put(Routes.guildBan(guildId, userId), data);
}
async function listGuildEmojis(rest, guildId) {
	return await rest.get(Routes.guildEmojis(guildId));
}
async function createGuildEmoji(rest, guildId, data) {
	return await rest.post(Routes.guildEmojis(guildId), data);
}
async function createGuildSticker(rest, guildId, data) {
	return await rest.post(Routes.guildStickers(guildId), data);
}
//#endregion
//#region extensions/discord/src/internal/api.interactions.ts
async function createInteractionCallback(rest, interactionId, token, body) {
	return await rest.post(Routes.interactionCallback(interactionId, token), { body });
}
async function editWebhookMessage(rest, applicationId, token, messageId, data, query) {
	return query ? await rest.patch(Routes.webhookMessage(applicationId, token, messageId), data, query) : await rest.patch(Routes.webhookMessage(applicationId, token, messageId), data);
}
async function deleteWebhookMessage(rest, applicationId, token, messageId) {
	return await rest.delete(Routes.webhookMessage(applicationId, token, messageId));
}
async function getWebhookMessage(rest, applicationId, token, messageId) {
	return await rest.get(Routes.webhookMessage(applicationId, token, messageId));
}
async function createWebhookMessage(rest, applicationId, token, data, query) {
	return await rest.post(Routes.webhook(applicationId, token), data, query);
}
//#endregion
//#region extensions/discord/src/internal/api.messages.ts
async function getChannel(rest, channelId) {
	return await rest.get(Routes.channel(channelId));
}
async function editChannel(rest, channelId, data) {
	return await rest.patch(Routes.channel(channelId), data);
}
async function deleteChannel(rest, channelId) {
	await rest.delete(Routes.channel(channelId));
}
async function listChannelMessages(rest, channelId, query) {
	return await rest.get(Routes.channelMessages(channelId), query);
}
async function getChannelMessage(rest, channelId, messageId) {
	return await rest.get(Routes.channelMessage(channelId, messageId));
}
async function createChannelMessage(rest, channelId, data) {
	return await rest.post(Routes.channelMessages(channelId), data);
}
async function editChannelMessage(rest, channelId, messageId, data) {
	return await rest.patch(Routes.channelMessage(channelId, messageId), data);
}
async function deleteChannelMessage(rest, channelId, messageId) {
	await rest.delete(Routes.channelMessage(channelId, messageId));
}
async function pinChannelMessage(rest, channelId, messageId) {
	await rest.put(Routes.channelPin(channelId, messageId));
}
async function unpinChannelMessage(rest, channelId, messageId) {
	await rest.delete(Routes.channelPin(channelId, messageId));
}
async function listChannelPins(rest, channelId) {
	return await rest.get(Routes.channelPins(channelId));
}
async function sendChannelTyping(rest, channelId) {
	await rest.post(Routes.channelTyping(channelId));
}
async function createThread(rest, channelId, data, messageId) {
	const route = messageId ? Routes.threads(channelId, messageId) : Routes.threads(channelId);
	return await rest.post(route, data);
}
async function listChannelArchivedThreads(rest, channelId, query) {
	return await rest.get(Routes.channelThreads(channelId, "public"), query);
}
async function searchGuildMessages(rest, guildId, params) {
	return await rest.get(`/guilds/${guildId}/messages/search?${params.toString()}`);
}
//#endregion
//#region extensions/discord/src/internal/api.reactions.ts
async function createOwnMessageReaction(rest, channelId, messageId, encodedEmoji) {
	await rest.put(Routes.channelMessageOwnReaction(channelId, messageId, encodedEmoji));
}
async function deleteOwnMessageReaction(rest, channelId, messageId, encodedEmoji) {
	await rest.delete(Routes.channelMessageOwnReaction(channelId, messageId, encodedEmoji));
}
async function listMessageReactionUsers(rest, channelId, messageId, encodedEmoji, query) {
	return await rest.get(Routes.channelMessageReaction(channelId, messageId, encodedEmoji), query);
}
//#endregion
//#region extensions/discord/src/internal/api.users.ts
async function getCurrentUser(rest) {
	return await rest.get(Routes.user("@me"));
}
async function getUser(rest, userId) {
	return await rest.get(Routes.user(userId));
}
async function createUserDmChannel(rest, recipientId) {
	return await rest.post(Routes.userChannels(), { body: { recipient_id: recipientId } });
}
//#endregion
//#region extensions/discord/src/internal/api.webhooks.ts
async function createChannelWebhook(rest, channelId, data) {
	return await rest.post(Routes.channelWebhooks(channelId), data);
}
//#endregion
//#region extensions/discord/src/internal/command-deploy.ts
var DiscordCommandDeployer = class {
	constructor(params) {
		this.params = params;
		this.hashes = /* @__PURE__ */ new Map();
	}
	async getCommands() {
		return await listApplicationCommands(this.rest, this.params.clientId);
	}
	async deploy(options = {}) {
		const commands = this.params.commands.filter((command) => command.name !== "*");
		const serializedGlobal = commands.filter((command) => !command.guildIds).map((command) => command.serialize());
		for (const [guildId, entries] of groupGuildCommands(commands)) await this.putCommandSetIfChanged(`guild:${guildId}`, entries, async () => {
			await overwriteGuildApplicationCommands(this.rest, this.params.clientId, guildId, entries);
		}, options);
		if (this.params.devGuilds?.length) {
			for (const guildId of this.params.devGuilds) {
				const entries = commands.map((command) => command.serialize());
				await this.putCommandSetIfChanged(`dev-guild:${guildId}`, entries, async () => {
					await overwriteGuildApplicationCommands(this.rest, this.params.clientId, guildId, entries);
				}, options);
			}
			return {
				mode: options.mode ?? "reconcile",
				usedDevGuilds: true
			};
		}
		if (options.mode !== "overwrite") {
			await this.putCommandSetIfChanged("global:reconcile", serializedGlobal, async () => {
				await this.reconcileGlobalCommands(serializedGlobal);
			}, options);
			return {
				mode: "reconcile",
				usedDevGuilds: false
			};
		}
		await this.putCommandSetIfChanged("global:overwrite", serializedGlobal, async () => {
			await overwriteApplicationCommands(this.rest, this.params.clientId, serializedGlobal);
		}, options);
		return {
			mode: "overwrite",
			usedDevGuilds: false
		};
	}
	async reconcileGlobalCommands(desired) {
		const existing = await this.getCommands();
		const existingByKey = new Map(existing.map((command) => [stableCommandKey(command), command]));
		const desiredKeys = /* @__PURE__ */ new Set();
		for (const command of desired) {
			const key = stableCommandKey(command);
			desiredKeys.add(key);
			const current = existingByKey.get(key);
			if (!current) {
				await createApplicationCommand(this.rest, this.params.clientId, command);
				continue;
			}
			if (!commandsEqual(current, command)) await editApplicationCommand(this.rest, this.params.clientId, current.id, command);
		}
		for (const command of existing) if (!desiredKeys.has(stableCommandKey(command))) await deleteApplicationCommand(this.rest, this.params.clientId, command.id);
	}
	async putCommandSetIfChanged(key, commands, deploy, options) {
		const hash = stableCommandSetHash(commands);
		if (!options.force && this.hashes.get(key) === hash) return;
		await deploy();
		this.hashes.set(key, hash);
	}
	get rest() {
		return this.params.rest();
	}
};
function groupGuildCommands(commands) {
	const guildCommands = /* @__PURE__ */ new Map();
	for (const command of commands.filter((entry) => entry.guildIds)) for (const guildId of command.guildIds ?? []) {
		const entries = guildCommands.get(guildId) ?? [];
		entries.push(command.serialize());
		guildCommands.set(guildId, entries);
	}
	return guildCommands;
}
function stableCommandKey(command) {
	return `${command.type ?? ApplicationCommandType.ChatInput}:${command.name}`;
}
function comparableCommand(value) {
	if (!value || typeof value !== "object") return value;
	const omit = new Set([
		"id",
		"application_id",
		"guild_id",
		"version",
		"default_permission",
		"nsfw"
	]);
	return stableComparableObject(Object.fromEntries(Object.entries(value).filter(([key, entry]) => !omit.has(key) && entry !== void 0)));
}
function stableComparableObject(value) {
	if (Array.isArray(value)) return value.map((entry) => stableComparableObject(entry));
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== void 0).toSorted(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stableComparableObject(entry)]));
}
function commandsEqual(a, b) {
	return JSON.stringify(comparableCommand(a)) === JSON.stringify(comparableCommand(b));
}
function stableCommandSetHash(commands) {
	const stable = commands.map((command) => stableComparableObject(command)).toSorted((a, b) => stableCommandKey(a).localeCompare(stableCommandKey(b)));
	return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}
//#endregion
//#region extensions/discord/src/internal/components.base.ts
function parseCustomId(id) {
	const [rawKey, ...parts] = id.split(";");
	const [keyPart, firstValue] = rawKey.split("=");
	const key = keyPart.includes(":") ? keyPart.split(":")[0] : keyPart;
	const data = {};
	const entries = firstValue === void 0 ? parts : [rawKey.slice(key.length + 1), ...parts];
	for (const entry of entries) {
		const index = entry.indexOf("=");
		if (index < 0) continue;
		const name = entry.slice(0, index).replace(/^[^:]+:/, "");
		const raw = entry.slice(index + 1);
		data[name] = raw === "true" ? true : raw === "false" ? false : raw;
	}
	return {
		key,
		data
	};
}
function clean$3(value) {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== void 0));
}
function colorToNumber(value) {
	if (typeof value === "number") return value;
	if (typeof value === "string" && /^#?[0-9a-f]{6}$/i.test(value)) return Number.parseInt(value.replace(/^#/, ""), 16);
}
var BaseComponent = class {
	constructor() {
		this.isV2 = false;
	}
};
var BaseMessageInteractiveComponent = class extends BaseComponent {
	constructor(..._args) {
		super(..._args);
		this.isV2 = false;
		this.defer = false;
		this.ephemeral = false;
		this.customIdParser = parseCustomId;
	}
	run(_interaction, _data) {}
};
var BaseModalComponent = class extends BaseComponent {};
//#endregion
//#region extensions/discord/src/internal/components.message.ts
var BaseButton = class extends BaseMessageInteractiveComponent {
	constructor(..._args) {
		super(..._args);
		this.type = ComponentType.Button;
		this.style = ButtonStyle.Primary;
		this.disabled = false;
	}
};
var Button = class extends BaseButton {
	serialize() {
		return clean$3({
			type: this.type,
			style: this.style,
			custom_id: this.customId,
			label: this.label,
			emoji: this.emoji,
			disabled: this.disabled || void 0
		});
	}
};
var LinkButton = class extends BaseButton {
	constructor(..._args2) {
		super(..._args2);
		this.customId = "";
		this.style = ButtonStyle.Link;
	}
	async run() {
		throw new Error("Link buttons do not run handlers");
	}
	serialize() {
		return clean$3({
			type: this.type,
			style: this.style,
			label: this.label,
			emoji: this.emoji,
			disabled: this.disabled || void 0,
			url: this.url
		});
	}
};
var AnySelectMenu = class extends BaseMessageInteractiveComponent {
	constructor(..._args3) {
		super(..._args3);
		this.disabled = false;
	}
	serialize() {
		return clean$3({
			...this.serializeOptions(),
			custom_id: this.customId,
			placeholder: this.placeholder,
			min_values: this.minValues,
			max_values: this.maxValues,
			disabled: this.disabled || void 0,
			required: this.required
		});
	}
};
var StringSelectMenu = class extends AnySelectMenu {
	constructor(..._args4) {
		super(..._args4);
		this.type = ComponentType.StringSelect;
	}
	serializeOptions() {
		return {
			type: this.type,
			options: this.options
		};
	}
};
var UserSelectMenu = class extends AnySelectMenu {
	constructor(..._args5) {
		super(..._args5);
		this.type = ComponentType.UserSelect;
	}
	serializeOptions() {
		return {
			type: this.type,
			default_values: this.defaultValues
		};
	}
};
var RoleSelectMenu = class extends AnySelectMenu {
	constructor(..._args6) {
		super(..._args6);
		this.type = ComponentType.RoleSelect;
	}
	serializeOptions() {
		return {
			type: this.type,
			default_values: this.defaultValues
		};
	}
};
var MentionableSelectMenu = class extends AnySelectMenu {
	constructor(..._args7) {
		super(..._args7);
		this.type = ComponentType.MentionableSelect;
	}
	serializeOptions() {
		return {
			type: this.type,
			default_values: this.defaultValues
		};
	}
};
var ChannelSelectMenu = class extends AnySelectMenu {
	constructor(..._args8) {
		super(..._args8);
		this.type = ComponentType.ChannelSelect;
	}
	serializeOptions() {
		return {
			type: this.type,
			default_values: this.defaultValues,
			channel_types: this.channelTypes
		};
	}
};
var Row = class extends BaseComponent {
	constructor(components = []) {
		super();
		this.type = ComponentType.ActionRow;
		this.isV2 = false;
		this.components = components;
	}
	addComponent(component) {
		this.components.push(component);
	}
	removeComponent(component) {
		this.components = this.components.filter((entry) => entry !== component);
	}
	removeAllComponents() {
		this.components = [];
	}
	serialize() {
		return {
			type: this.type,
			components: this.components.map((entry) => entry.serialize())
		};
	}
};
var TextDisplay = class extends BaseComponent {
	constructor(content) {
		super();
		this.content = content;
		this.type = ComponentType.TextDisplay;
		this.isV2 = true;
	}
	serialize() {
		return clean$3({
			type: this.type,
			content: this.content
		});
	}
};
var Separator = class extends BaseComponent {
	constructor(options) {
		super();
		this.type = ComponentType.Separator;
		this.isV2 = true;
		this.divider = true;
		this.spacing = "small";
		this.spacing = options?.spacing ?? this.spacing;
		this.divider = options?.divider ?? this.divider;
	}
	serialize() {
		return clean$3({
			type: this.type,
			divider: this.divider,
			spacing: this.spacing === "large" ? 2 : this.spacing === "small" ? 1 : this.spacing
		});
	}
};
var Thumbnail = class extends BaseComponent {
	constructor(url) {
		super();
		this.url = url;
		this.type = ComponentType.Thumbnail;
		this.isV2 = true;
	}
	serialize() {
		return clean$3({
			type: this.type,
			media: this.url ? { url: this.url } : void 0
		});
	}
};
var Section = class extends BaseComponent {
	constructor(components = [], accessory) {
		super();
		this.components = components;
		this.accessory = accessory;
		this.type = ComponentType.Section;
		this.isV2 = true;
	}
	serialize() {
		return clean$3({
			type: this.type,
			components: this.components.map((entry) => entry.serialize()),
			accessory: this.accessory?.serialize()
		});
	}
};
var MediaGallery = class extends BaseComponent {
	constructor(items = []) {
		super();
		this.items = items;
		this.type = ComponentType.MediaGallery;
		this.isV2 = true;
	}
	serialize() {
		return {
			type: this.type,
			items: this.items.map((entry) => ({
				media: { url: entry.url },
				description: entry.description,
				spoiler: entry.spoiler
			}))
		};
	}
};
var File = class extends BaseComponent {
	constructor(file, spoiler = false) {
		super();
		this.file = file;
		this.spoiler = spoiler;
		this.type = ComponentType.File;
		this.isV2 = true;
	}
	serialize() {
		return clean$3({
			type: this.type,
			file: this.file ? { url: this.file } : void 0,
			spoiler: this.spoiler || void 0
		});
	}
};
var Container = class extends BaseComponent {
	constructor(components = [], options) {
		super();
		this.type = ComponentType.Container;
		this.isV2 = true;
		this.spoiler = false;
		this.components = components;
		this.accentColor = options?.accentColor;
		this.spoiler = options?.spoiler ?? false;
	}
	serialize() {
		return clean$3({
			type: this.type,
			components: this.components.map((entry) => entry.serialize()),
			accent_color: colorToNumber(this.accentColor),
			spoiler: this.spoiler || void 0
		});
	}
};
//#endregion
//#region extensions/discord/src/internal/components.modal.ts
var TextInput = class extends BaseModalComponent {
	constructor(..._args) {
		super(..._args);
		this.type = ComponentType.TextInput;
		this.customIdParser = parseCustomId;
		this.style = TextInputStyle.Short;
	}
	serialize() {
		return clean$3({
			type: this.type,
			custom_id: this.customId,
			style: this.style,
			min_length: this.minLength,
			max_length: this.maxLength,
			required: this.required,
			value: this.value,
			placeholder: this.placeholder
		});
	}
};
var CheckboxGroup = class extends BaseModalComponent {
	constructor(..._args2) {
		super(..._args2);
		this.type = 22;
		this.options = [];
	}
	serialize() {
		return clean$3({
			type: this.type,
			custom_id: this.customId,
			options: this.options,
			required: this.required,
			min_values: this.minValues,
			max_values: this.maxValues
		});
	}
};
var RadioGroup = class extends BaseModalComponent {
	constructor(..._args3) {
		super(..._args3);
		this.type = 21;
		this.options = [];
	}
	serialize() {
		return clean$3({
			type: this.type,
			custom_id: this.customId,
			options: this.options,
			required: this.required,
			min_values: this.minValues,
			max_values: this.maxValues
		});
	}
};
var Label = class extends BaseModalComponent {
	constructor(component) {
		super();
		this.component = component;
		this.type = ComponentType.Label;
		this.customId = "";
	}
	serialize() {
		return clean$3({
			type: this.type,
			label: this.label,
			description: this.description,
			component: this.component?.serialize()
		});
	}
};
var Modal = class {
	constructor() {
		this.components = [];
		this.customIdParser = parseCustomId;
	}
	serialize() {
		return {
			title: this.title,
			custom_id: this.customId,
			components: this.components.map((entry) => entry.serialize())
		};
	}
};
//#endregion
//#region extensions/discord/src/internal/payload.ts
function clean$2(value) {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== void 0));
}
function serializeAnyComponent(component) {
	return component.serialize();
}
function payloadHasV2Components(payload) {
	return Boolean(payload.components?.some((component) => component.isV2));
}
function normalizePayloadFlags(payload) {
	const flags = payload.ephemeral ? (payload.flags ?? 0) | MessageFlags.Ephemeral : payload.flags;
	if (!payloadHasV2Components(payload)) return flags;
	if (payload.content || payload.embeds?.length) throw new Error("Discord Components V2 payloads cannot include content or embeds");
	return (flags ?? 0) | MessageFlags.IsComponentsV2;
}
function serializePayload(payload) {
	if (typeof payload === "string") return { content: payload };
	const flags = normalizePayloadFlags(payload);
	return clean$2({
		content: payload.content,
		embeds: payload.embeds?.map((entry) => "serialize" in entry ? entry.serialize() : entry),
		components: payload.components?.map((entry) => serializeAnyComponent(entry)),
		allowed_mentions: payload.allowed_mentions ?? payload.allowedMentions,
		flags,
		tts: payload.tts,
		files: payload.files,
		poll: payload.poll,
		sticker_ids: payload.stickers
	});
}
//#endregion
//#region extensions/discord/src/internal/structures.ts
var Base = class {
	constructor(client) {
		this.client = client;
	}
};
var User = class extends Base {
	constructor(client, rawDataOrId) {
		super(client);
		this._rawData = typeof rawDataOrId === "string" ? null : rawDataOrId;
		this.id = typeof rawDataOrId === "string" ? rawDataOrId : rawDataOrId.id;
	}
	get rawData() {
		if (!this._rawData) throw new Error("Partial Discord user has no raw data");
		return this._rawData;
	}
	get partial() {
		return this._rawData === null;
	}
	get username() {
		return this._rawData?.username ?? "";
	}
	get globalName() {
		return this._rawData?.global_name;
	}
	get discriminator() {
		return this._rawData?.discriminator;
	}
	get bot() {
		return this._rawData?.bot;
	}
	get avatar() {
		return this._rawData?.avatar;
	}
	get avatarUrl() {
		return this.avatar ? `https://cdn.discordapp.com/avatars/${this.id}/${this.avatar}.png` : null;
	}
	toString() {
		return `<@${this.id}>`;
	}
	async fetch() {
		return this.client.fetchUser(this.id);
	}
	async createDm() {
		return await createUserDmChannel(this.client.rest, this.id);
	}
	async send(data) {
		const dm = await this.createDm();
		const message = await createChannelMessage(this.client.rest, dm.id, { body: serializePayload(data) });
		return new Message(this.client, message);
	}
};
var Role = class extends Base {
	constructor(client, rawDataOrId) {
		super(client);
		this._rawData = typeof rawDataOrId === "string" ? null : rawDataOrId;
		this.id = typeof rawDataOrId === "string" ? rawDataOrId : rawDataOrId.id;
	}
	get name() {
		return this._rawData?.name ?? "";
	}
};
var Guild = class extends Base {
	constructor(client, rawDataOrId) {
		super(client);
		this._rawData = typeof rawDataOrId === "string" ? null : rawDataOrId;
		this.id = typeof rawDataOrId === "string" ? rawDataOrId : rawDataOrId.id;
	}
	get name() {
		return this._rawData?.name ?? "";
	}
};
var GuildMember = class extends Base {
	constructor(client, rawData) {
		super(client);
		this.rawData = rawData;
	}
	get user() {
		return this.rawData.user ? new User(this.client, this.rawData.user) : null;
	}
	get roles() {
		return this.rawData.roles ?? [];
	}
	get nickname() {
		return this.rawData.nick ?? void 0;
	}
};
var Message = class Message extends Base {
	constructor(client, rawDataOrIds) {
		super(client);
		this._rawData = typeof rawDataOrIds === "string" || !("author" in rawDataOrIds) ? null : rawDataOrIds;
		this.id = typeof rawDataOrIds === "string" ? rawDataOrIds : rawDataOrIds.id;
		this.channelId = typeof rawDataOrIds === "string" ? "" : "channel_id" in rawDataOrIds ? rawDataOrIds.channel_id : rawDataOrIds.channelId ?? "";
	}
	get rawData() {
		if (!this._rawData) throw new Error("Partial Discord message has no raw data");
		return this._rawData;
	}
	get partial() {
		return this._rawData === null;
	}
	get message() {
		return this;
	}
	get channel_id() {
		return this.channelId;
	}
	get guild_id() {
		return this._rawData?.guild_id;
	}
	get guild() {
		return this.guild_id ? new Guild(this.client, this.guild_id) : null;
	}
	get webhookId() {
		return this.webhook_id;
	}
	get webhook_id() {
		return this._rawData?.webhook_id ?? null;
	}
	get member() {
		const member = this._rawData?.member;
		return member ? new GuildMember(this.client, member) : null;
	}
	get rawMember() {
		return this._rawData?.member;
	}
	get content() {
		return this._rawData?.content ?? "";
	}
	get author() {
		return this._rawData?.author ? new User(this.client, this._rawData.author) : null;
	}
	get embeds() {
		return this._rawData?.embeds ?? [];
	}
	get attachments() {
		return this._rawData?.attachments ?? [];
	}
	get stickers() {
		return this._rawData?.sticker_items ?? [];
	}
	get mentionedUsers() {
		return (this._rawData?.mentions ?? []).map((user) => new User(this.client, user));
	}
	get mentionedRoles() {
		return this._rawData?.mention_roles ?? [];
	}
	get mentionedEveryone() {
		return this._rawData?.mention_everyone ?? false;
	}
	get timestamp() {
		return this._rawData?.timestamp;
	}
	get type() {
		return this._rawData?.type;
	}
	get messageReference() {
		return this._rawData?.message_reference;
	}
	get referencedMessage() {
		return this._rawData?.referenced_message ? new Message(this.client, this._rawData.referenced_message) : null;
	}
	get thread() {
		return this._rawData?.thread ? channelFactory(this.client, this._rawData.thread) : null;
	}
	async fetch() {
		const raw = await getChannelMessage(this.client.rest, this.channelId, this.id);
		return new Message(this.client, raw);
	}
	async delete() {
		await deleteChannelMessage(this.client.rest, this.channelId, this.id);
	}
	async edit(data) {
		const raw = await editChannelMessage(this.client.rest, this.channelId, this.id, { body: serializePayload(data) });
		return new Message(this.client, raw);
	}
	async reply(data) {
		const raw = await createChannelMessage(this.client.rest, this.channelId, { body: {
			...serializePayload(data),
			message_reference: {
				message_id: this.id,
				fail_if_not_exists: false
			}
		} });
		return new Message(this.client, raw);
	}
	async pin() {
		await pinChannelMessage(this.client.rest, this.channelId, this.id);
	}
	async unpin() {
		await unpinChannelMessage(this.client.rest, this.channelId, this.id);
	}
};
function channelFactory(_client, channelData, _partial) {
	return {
		...channelData,
		rawData: channelData,
		guildId: "guild_id" in channelData ? channelData.guild_id : void 0,
		guild: "guild_id" in channelData && typeof channelData.guild_id === "string" ? new Guild(_client, channelData.guild_id) : void 0,
		parentId: "parent_id" in channelData ? channelData.parent_id : void 0
	};
}
//#endregion
//#region extensions/discord/src/internal/entity-cache.ts
const DEFAULT_REST_CACHE_TTL_MS = 3e4;
var DiscordEntityCache = class {
	constructor(params) {
		this.params = params;
		this.entries = /* @__PURE__ */ new Map();
	}
	async fetchUser(id) {
		return await this.fetchCached(`user:${id}`, async () => {
			const raw = await getUser(this.rest, id);
			return new User(this.params.client, raw);
		});
	}
	async fetchChannel(id) {
		return await this.fetchCached(`channel:${id}`, async () => {
			const raw = await getChannel(this.rest, id);
			return channelFactory(this.params.client, raw);
		});
	}
	async fetchGuild(id) {
		return await this.fetchCached(`guild:${id}`, async () => {
			const raw = await getGuild(this.rest, id);
			return new Guild(this.params.client, raw);
		});
	}
	async fetchMember(guildId, userId) {
		return await this.fetchCached(`member:${guildId}:${userId}`, async () => {
			const raw = await getGuildMember(this.rest, guildId, userId);
			return new GuildMember(this.params.client, raw);
		});
	}
	invalidateForGatewayEvent(type, data) {
		const raw = data && typeof data === "object" ? data : {};
		const channelUpdate = GatewayDispatchEvents.ChannelUpdate;
		const channelDelete = GatewayDispatchEvents.ChannelDelete;
		const guildUpdate = GatewayDispatchEvents.GuildUpdate;
		const guildMemberUpdate = GatewayDispatchEvents.GuildMemberUpdate;
		if (type === channelUpdate || type === channelDelete) this.deleteId("channel", raw.id);
		if (type === guildUpdate) this.deleteId("guild", raw.id);
		if (type === guildMemberUpdate) {
			const guildId = raw.guild_id;
			const user = raw.user && typeof raw.user === "object" ? raw.user : {};
			if (typeof guildId === "string" && typeof user.id === "string") {
				this.entries.delete(`member:${guildId}:${user.id}`);
				this.entries.delete(`user:${user.id}`);
			}
		}
	}
	deleteId(prefix, id) {
		if (typeof id === "string") this.entries.delete(`${prefix}:${id}`);
	}
	async fetchCached(key, fetcher) {
		const ttl = this.params.ttlMs ?? DEFAULT_REST_CACHE_TTL_MS;
		if (ttl > 0) {
			const cached = this.entries.get(key);
			if (cached && cached.expiresAt > Date.now()) return cached.value;
		}
		const value = await fetcher();
		if (ttl > 0) this.entries.set(key, {
			expiresAt: Date.now() + ttl,
			value
		});
		return value;
	}
	get rest() {
		return typeof this.params.rest === "function" ? this.params.rest() : this.params.rest;
	}
};
//#endregion
//#region extensions/discord/src/internal/event-queue.ts
const DEFAULT_MAX_QUEUE_SIZE = 1e4;
const DEFAULT_MAX_CONCURRENCY = 50;
const DEFAULT_LISTENER_TIMEOUT_MS = 12e4;
const DEFAULT_SLOW_LISTENER_THRESHOLD_MS = 3e4;
var DiscordEventQueue = class {
	constructor(options = {}) {
		this.queue = [];
		this.processing = 0;
		this.processedCount = 0;
		this.droppedCount = 0;
		this.timeoutCount = 0;
		this.options = {
			maxQueueSize: normalizePositiveInteger(options.maxQueueSize, DEFAULT_MAX_QUEUE_SIZE),
			maxConcurrency: normalizePositiveInteger(options.maxConcurrency, DEFAULT_MAX_CONCURRENCY),
			listenerTimeout: normalizePositiveInteger(options.listenerTimeout, DEFAULT_LISTENER_TIMEOUT_MS),
			slowListenerThreshold: normalizePositiveInteger(options.slowListenerThreshold, DEFAULT_SLOW_LISTENER_THRESHOLD_MS)
		};
	}
	enqueue(params) {
		if (this.queue.length >= this.options.maxQueueSize) {
			this.droppedCount += 1;
			return Promise.reject(/* @__PURE__ */ new Error(`Discord event queue is full for ${params.eventType}; maxQueueSize=${this.options.maxQueueSize}`));
		}
		return new Promise((resolve, reject) => {
			this.queue.push({
				...params,
				resolve,
				reject
			});
			this.processNext();
		});
	}
	getMetrics() {
		return {
			queueSize: this.queue.length,
			processing: this.processing,
			processed: this.processedCount,
			dropped: this.droppedCount,
			timeouts: this.timeoutCount,
			maxQueueSize: this.options.maxQueueSize,
			maxConcurrency: this.options.maxConcurrency
		};
	}
	processNext() {
		while (this.processing < this.options.maxConcurrency && this.queue.length > 0) {
			const job = this.queue.shift();
			if (!job) return;
			this.processing += 1;
			this.runJob(job).then(job.resolve, job.reject).finally(() => {
				this.processing -= 1;
				this.processedCount += 1;
				this.processNext();
			});
		}
	}
	async runJob(job) {
		const startedAt = Date.now();
		try {
			await this.runWithTimeout(job);
			this.logSlowListener(job, Date.now() - startedAt);
		} catch (error) {
			if (isListenerTimeoutError(error)) {
				this.timeoutCount += 1;
				console.error(`[EventQueue] Listener ${job.listenerName} timed out after ${this.options.listenerTimeout}ms for event ${job.eventType}`);
				return;
			}
			console.error(`[EventQueue] Listener ${job.listenerName} failed for event ${job.eventType}:`, error);
		}
	}
	async runWithTimeout(job) {
		let timeout;
		try {
			await Promise.race([job.run(), new Promise((_, reject) => {
				timeout = setTimeout(() => {
					reject(createListenerTimeoutError(this.options.listenerTimeout));
				}, this.options.listenerTimeout);
				timeout.unref?.();
			})]);
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	}
	logSlowListener(job, durationMs) {
		if (durationMs < this.options.slowListenerThreshold) return;
		console.warn(`[EventQueue] Slow listener detected: ${job.listenerName} took ${durationMs}ms for event ${job.eventType}`);
	}
};
function normalizePositiveInteger(value, fallback) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
	return Math.max(1, Math.floor(value));
}
function createListenerTimeoutError(timeoutMs) {
	const error = /* @__PURE__ */ new Error(`Listener timeout after ${timeoutMs}ms`);
	error.name = "DiscordEventQueueListenerTimeoutError";
	return error;
}
function isListenerTimeoutError(error) {
	return error instanceof Error && error.name === "DiscordEventQueueListenerTimeoutError";
}
//#endregion
//#region extensions/discord/src/internal/commands.ts
function clean$1(value) {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== void 0));
}
function resolveConditionalCommandOption(value, interaction) {
	return typeof value === "function" ? value(interaction) : value;
}
async function deferCommandInteractionIfNeeded(command, interaction) {
	if (!resolveConditionalCommandOption(command.defer, interaction)) return;
	await interaction.defer({ ephemeral: resolveConditionalCommandOption(command.ephemeral, interaction) });
}
function readRawCommandOptions(interaction) {
	const options = interaction.rawData.data?.options;
	return Array.isArray(options) ? options : [];
}
function findSelectedSubcommand(subcommands, interaction) {
	const subcommandName = readRawCommandOptions(interaction).find((option) => option.type === ApplicationCommandOptionType.Subcommand)?.name;
	return typeof subcommandName === "string" ? subcommands.find((command) => command.name === subcommandName) : void 0;
}
function findCommandOption(options, name) {
	if (!name) return;
	return options?.find((option) => option.name === name);
}
function hasCommandOptions(command) {
	return "options" in command;
}
function resolveFocusedCommandOptionAutocompleteHandler(command, interaction) {
	const focusedName = interaction.options.getFocused()?.name;
	const autocomplete = findCommandOption("subcommands" in command && Array.isArray(command.subcommands) ? findSelectedSubcommand(command.subcommands, interaction)?.options : hasCommandOptions(command) ? command.options : void 0, focusedName)?.autocomplete;
	return typeof autocomplete === "function" ? autocomplete : void 0;
}
var BaseCommand = class {
	constructor() {
		this.defer = false;
		this.ephemeral = false;
		this.integrationTypes = [0, 1];
		this.contexts = [
			InteractionContextType.Guild,
			InteractionContextType.BotDM,
			InteractionContextType.PrivateChannel
		];
	}
	serialize() {
		return clean$1({
			name: this.name,
			name_localizations: this.nameLocalizations,
			description: this.type === ApplicationCommandType.ChatInput ? this.description ?? "" : void 0,
			description_localizations: this.descriptionLocalizations,
			type: this.type,
			options: this.serializeOptions(),
			integration_types: this.integrationTypes,
			contexts: this.contexts,
			default_member_permissions: Array.isArray(this.permission) ? this.permission.reduce((sum, entry) => sum | entry, 0n).toString() : this.permission ? this.permission.toString() : null
		});
	}
};
var Command = class extends BaseCommand {
	constructor(..._args) {
		super(..._args);
		this.type = ApplicationCommandType.ChatInput;
	}
	async autocomplete(interaction) {
		throw new Error(`The ${interaction.rawData?.data?.name ?? this.name} command does not support autocomplete`);
	}
	async preCheck(interaction) {
		return Boolean(interaction) || true;
	}
	serializeOptions() {
		return this.options?.map((option) => {
			if (typeof option.autocomplete === "function") {
				const { autocomplete: _autocomplete, ...rest } = option;
				return {
					...rest,
					autocomplete: true
				};
			}
			return option;
		});
	}
};
var CommandWithSubcommands = class extends BaseCommand {
	constructor(..._args2) {
		super(..._args2);
		this.type = ApplicationCommandType.ChatInput;
	}
	async run(interaction) {
		const subcommand = findSelectedSubcommand(this.subcommands, interaction);
		if (!subcommand) {
			const subcommandName = readRawCommandOptions(interaction).find((option) => option.type === ApplicationCommandOptionType.Subcommand)?.name;
			throw new Error(`Unknown Discord subcommand: ${typeof subcommandName === "string" ? subcommandName : "<missing>"}`);
		}
		await deferCommandInteractionIfNeeded(subcommand, interaction);
		return await subcommand.run(interaction);
	}
	serializeOptions() {
		return this.subcommands.map((command) => clean$1({
			name: command.name,
			name_localizations: command.nameLocalizations,
			description: command.description ?? "",
			description_localizations: command.descriptionLocalizations,
			type: ApplicationCommandOptionType.Subcommand,
			options: command.serializeOptions()
		}));
	}
};
//#endregion
//#region extensions/discord/src/internal/interaction-options.ts
function readFocusedOption(options) {
	for (const option of options ?? []) {
		if ("focused" in option && option.focused) return option;
		const child = readFocusedOption(readChildOptions(option));
		if (child) return child;
	}
}
function findOption(options, name) {
	for (const option of options ?? []) {
		if (option.name === name) return option;
		const child = findOption(readChildOptions(option), name);
		if (child) return child;
	}
}
function readChildOptions(option) {
	if (!("options" in option) || !Array.isArray(option.options)) return;
	return option.options;
}
var OptionsHandler = class {
	constructor(rawOptions, client, resolvedChannels) {
		this.rawOptions = rawOptions;
		this.client = client;
		this.resolvedChannels = resolvedChannels;
	}
	getString(name) {
		const option = findOption(this.rawOptions, name);
		const value = option && "value" in option ? option.value : void 0;
		return typeof value === "string" ? value : null;
	}
	getNumber(name) {
		const option = findOption(this.rawOptions, name);
		const value = option && "value" in option ? option.value : void 0;
		return typeof value === "number" ? value : null;
	}
	getBoolean(name) {
		const option = findOption(this.rawOptions, name);
		const value = option && "value" in option ? option.value : void 0;
		return typeof value === "boolean" ? value : null;
	}
	async getChannel(name, required = false) {
		const option = findOption(this.rawOptions, name);
		const value = option && "value" in option ? option.value : void 0;
		const id = typeof value === "string" ? value : void 0;
		const resolved = id ? this.resolvedChannels?.[id] : void 0;
		if (resolved) return channelFactory(this.client, resolved);
		if (id) return await this.client.fetchChannel(id);
		if (required) throw new Error(`Missing required channel option ${name}`);
		return null;
	}
	getFocused() {
		return readFocusedOption(this.rawOptions);
	}
};
//#endregion
//#region extensions/discord/src/internal/interaction-response.ts
var InteractionResponseController = class {
	constructor() {
		this.state = "unacknowledged";
	}
	get acknowledged() {
		return this.state !== "unacknowledged";
	}
	recordCallback(type) {
		if (type === InteractionResponseType.DeferredChannelMessageWithSource) {
			this.state = "deferred";
			return;
		}
		if (type === InteractionResponseType.DeferredMessageUpdate) {
			this.state = "deferred-update";
			return;
		}
		this.state = "replied";
	}
	nextReplyAction() {
		if (this.state === "deferred" || this.state === "deferred-update") return "edit";
		if (this.state === "unacknowledged") return "initial";
		return "follow-up";
	}
	recordReplyEdit() {
		this.state = "replied";
	}
};
function needsComponentsV2Query(body) {
	return body !== null && typeof body === "object" && "flags" in body && typeof body.flags === "number" && (body.flags & MessageFlags.IsComponentsV2) !== 0;
}
//#endregion
//#region extensions/discord/src/internal/modal-fields.ts
function extractModalFields(components) {
	const out = {};
	for (const component of flattenModalComponents(components)) {
		const raw = component;
		if (typeof raw.custom_id !== "string") continue;
		if (Array.isArray(raw.values)) out[raw.custom_id] = raw.values.map(String);
		else if (typeof raw.value === "string" || typeof raw.value === "number" || typeof raw.value === "boolean") out[raw.custom_id] = String(raw.value);
	}
	return out;
}
function flattenModalComponents(components) {
	const out = [];
	for (const entry of components) {
		if (!entry || typeof entry !== "object") continue;
		const component = entry;
		if (component.component && typeof component.component === "object") out.push(component.component);
		if (Array.isArray(component.components)) out.push(...flattenModalComponents(component.components));
		out.push(entry);
	}
	return out;
}
var ModalFields = class {
	constructor(values, resolved, client) {
		this.values = values;
		this.resolved = resolved;
		this.client = client;
	}
	value(id, required) {
		const value = this.values[id];
		if (required && (value === void 0 || Array.isArray(value) && value.length === 0)) throw new Error(`Missing required modal field ${id}`);
		return value;
	}
	getText(id, required = false) {
		const value = this.value(id, required);
		return typeof value === "string" ? value : null;
	}
	getStringSelect(id, required = false) {
		const value = this.value(id, required);
		if (Array.isArray(value)) return value;
		return typeof value === "string" ? [value] : [];
	}
	getRoleSelect(id, required = false) {
		return this.getStringSelect(id, required).map((roleId) => {
			const raw = this.resolved?.roles?.[roleId];
			return raw ? new Role(this.client, {
				id: roleId,
				name: raw.name ?? ""
			}) : new Role(this.client, roleId);
		});
	}
	getUserSelect(id, required = false) {
		return this.getStringSelect(id, required).map((userId) => {
			const raw = this.resolved?.users?.[userId];
			return new User(this.client, {
				id: userId,
				username: raw?.username ?? ""
			});
		});
	}
};
//#endregion
//#region node_modules/typebox/build/schema/types/_guard.mjs
function IsGuardInterface(value) {
	return IsObject(value) && HasPropertyKey(value, "check") && HasPropertyKey(value, "errors") && IsFunction(value.check) && IsFunction(value.errors);
}
function IsGuard(value) {
	return HasPropertyKey(value, "~guard") && IsGuardInterface(value["~guard"]);
}
//#endregion
//#region node_modules/typebox/build/schema/types/_refine.mjs
/**
* Returns true if the schema contains an '~refine` keyword
* @specification None
*/
function IsRefine(value) {
	return HasPropertyKey(value, "~refine") && IsArray(value["~refine"]) && Every(value["~refine"], 0, (value) => IsObject(value) && HasPropertyKey(value, "check") && HasPropertyKey(value, "error") && IsFunction(value.check) && IsFunction(value.error));
}
//#endregion
//#region node_modules/typebox/build/schema/types/schema.mjs
/** Returns true if this value is object like */
function IsSchemaObject(value) {
	return IsObject(value) && !IsArray(value);
}
/** Returns true if this value is a boolean */
function IsBooleanSchema(value) {
	return IsBoolean(value);
}
/** Returns true if this value is schema like */
function IsSchema(value) {
	return IsSchemaObject(value) || IsBooleanSchema(value);
}
//#endregion
//#region node_modules/typebox/build/schema/types/additionalItems.mjs
/**
* Returns true if the schema contains a valid additionalItems property
* @specification Json Schema 7
*/
function IsAdditionalItems(schema) {
	return HasPropertyKey(schema, "additionalItems") && IsSchema(schema.additionalItems);
}
//#endregion
//#region node_modules/typebox/build/schema/types/additionalProperties.mjs
/**
* Returns true if the schema contains a valid additionalProperties property
* @specification Json Schema 7
*/
function IsAdditionalProperties(schema) {
	return HasPropertyKey(schema, "additionalProperties") && IsSchema(schema.additionalProperties);
}
//#endregion
//#region node_modules/typebox/build/schema/types/allOf.mjs
/**
* Returns true if the schema contains a valid allOf property
* @specification Json Schema 7
*/
function IsAllOf(schema) {
	return HasPropertyKey(schema, "allOf") && IsArray(schema.allOf) && schema.allOf.every((value) => IsSchema(value));
}
//#endregion
//#region node_modules/typebox/build/schema/types/anchor.mjs
/**
* Returns true if the schema contains a valid $anchor property
*/
function IsAnchor(schema) {
	return HasPropertyKey(schema, "$anchor") && IsString(schema.$anchor);
}
//#endregion
//#region node_modules/typebox/build/schema/types/anyOf.mjs
/**
* Returns true if the schema contains a valid anyOf property
* @specification Json Schema 7
*/
function IsAnyOf(schema) {
	return HasPropertyKey(schema, "anyOf") && IsArray(schema.anyOf) && schema.anyOf.every((value) => IsSchema(value));
}
//#endregion
//#region node_modules/typebox/build/schema/types/const.mjs
/**
* Returns true if the schema contains a valid const property
* @specification Json Schema 7
*/
function IsConst(value) {
	return HasPropertyKey(value, "const");
}
//#endregion
//#region node_modules/typebox/build/schema/types/contains.mjs
/**
* Returns true if the schema contains a valid contains property
* @specification Json Schema 7
*/
function IsContains(schema) {
	return HasPropertyKey(schema, "contains") && IsSchema(schema.contains);
}
//#endregion
//#region node_modules/typebox/build/schema/types/default.mjs
/**
* Returns true if the schema contains a valid contentMediaType property
* @specification Json Schema 7
*/
function IsDefault(schema) {
	return HasPropertyKey(schema, "default");
}
//#endregion
//#region node_modules/typebox/build/schema/types/dependencies.mjs
/**
* Returns true if the schema contains a valid dependencies property
* @specification Json Schema 7
*/
function IsDependencies(schema) {
	return HasPropertyKey(schema, "dependencies") && IsObject(schema.dependencies) && Object.values(schema.dependencies).every((value) => IsSchema(value) || IsArray(value) && value.every((value) => IsString(value)));
}
//#endregion
//#region node_modules/typebox/build/schema/types/dependentRequired.mjs
/**
* Returns true if the schema contains a valid dependentRequired property
* @specification Json Schema 2019-09
*/
function IsDependentRequired(schema) {
	return HasPropertyKey(schema, "dependentRequired") && IsObject(schema.dependentRequired) && Object.values(schema.dependentRequired).every((value) => IsArray(value) && value.every((value) => IsString(value)));
}
//#endregion
//#region node_modules/typebox/build/schema/types/dependentSchemas.mjs
/**
* Returns true if the schema contains a valid dependentRequired property
* @specification Json Schema 2019-09
*/
function IsDependentSchemas(schema) {
	return HasPropertyKey(schema, "dependentSchemas") && IsObject(schema.dependentSchemas) && Object.values(schema.dependentSchemas).every((value) => IsSchema(value));
}
//#endregion
//#region node_modules/typebox/build/schema/types/dynamicAnchor.mjs
/**
* Returns true if the schema contains a valid $dynamicAnchor property
*/
function IsDynamicAnchor(schema) {
	return HasPropertyKey(schema, "$dynamicAnchor") && IsString(schema.$dynamicAnchor);
}
//#endregion
//#region node_modules/typebox/build/schema/types/dynamicRef.mjs
/**
* Returns true if the schema contains a valid $dynamicRef property
*/
function IsDynamicRef(schema) {
	return HasPropertyKey(schema, "$dynamicRef") && IsString(schema.$dynamicRef);
}
//#endregion
//#region node_modules/typebox/build/schema/types/else.mjs
/**
* Returns true if the schema contains a valid else property
* @specification Json Schema 7
*/
function IsElse(schema) {
	return HasPropertyKey(schema, "else") && IsSchema(schema.else);
}
//#endregion
//#region node_modules/typebox/build/schema/types/enum.mjs
/**
* Returns true if the schema contains a valid enum property
* @specification Json Schema 7
*/
function IsEnum(schema) {
	return HasPropertyKey(schema, "enum") && IsArray(schema.enum);
}
//#endregion
//#region node_modules/typebox/build/schema/types/exclusiveMaximum.mjs
/**
* Returns true if the schema contains a valid exclusiveMaximum property
* @specification Json Schema 7
*/
function IsExclusiveMaximum(schema) {
	return HasPropertyKey(schema, "exclusiveMaximum") && (IsNumber(schema.exclusiveMaximum) || IsBigInt(schema.exclusiveMaximum));
}
//#endregion
//#region node_modules/typebox/build/schema/types/exclusiveMinimum.mjs
/**
* Returns true if the schema contains a valid exclusiveMinimum property
* @specification Json Schema 7
*/
function IsExclusiveMinimum(schema) {
	return HasPropertyKey(schema, "exclusiveMinimum") && (IsNumber(schema.exclusiveMinimum) || IsBigInt(schema.exclusiveMinimum));
}
//#endregion
//#region node_modules/typebox/build/schema/types/format.mjs
/**
* Returns true if the schema contains a valid format property
* @specification Json Schema 7
*/
function IsFormat(schema) {
	return HasPropertyKey(schema, "format") && IsString(schema.format);
}
//#endregion
//#region node_modules/typebox/build/schema/types/id.mjs
/**
* Returns true if the schema contains a valid $id property
* @specification Json Schema 7
*/
function IsId(schema) {
	return HasPropertyKey(schema, "$id") && IsString(schema.$id);
}
//#endregion
//#region node_modules/typebox/build/schema/types/if.mjs
/**
* Returns true if the schema contains a valid $id property
* @specification Json Schema 7
*/
function IsIf(schema) {
	return HasPropertyKey(schema, "if") && IsSchema(schema.if);
}
//#endregion
//#region node_modules/typebox/build/schema/types/items.mjs
/**
* Returns true if the schema contains a valid items property
* @specification Json Schema 7
*/
function IsItems(schema) {
	return HasPropertyKey(schema, "items") && (IsSchema(schema.items) || IsArray(schema.items) && schema.items.every((value) => {
		return IsSchema(value);
	}));
}
/** Returns true if this schema is a sized items variant */
function IsItemsSized(schema) {
	return IsItems(schema) && IsArray(schema.items);
}
//#endregion
//#region node_modules/typebox/build/schema/types/maximum.mjs
/**
* Returns true if the schema contains a valid maximum property
* @specification Json Schema 7
*/
function IsMaximum(schema) {
	return HasPropertyKey(schema, "maximum") && (IsNumber(schema.maximum) || IsBigInt(schema.maximum));
}
//#endregion
//#region node_modules/typebox/build/schema/types/maxContains.mjs
/**
* Returns true if the schema contains a valid maxContains property
* @specification Json Schema 2019-09
*/
function IsMaxContains(schema) {
	return HasPropertyKey(schema, "maxContains") && IsNumber(schema.maxContains);
}
//#endregion
//#region node_modules/typebox/build/schema/types/maxItems.mjs
/**
* Returns true if the schema contains a valid maxItems property
* @specification Json Schema 7
*/
function IsMaxItems(schema) {
	return HasPropertyKey(schema, "maxItems") && IsNumber(schema.maxItems);
}
//#endregion
//#region node_modules/typebox/build/schema/types/maxLength.mjs
/**
* Returns true if the schema contains a valid maxLength property
* @specification Json Schema 7
*/
function IsMaxLength(schema) {
	return HasPropertyKey(schema, "maxLength") && IsNumber(schema.maxLength);
}
//#endregion
//#region node_modules/typebox/build/schema/types/maxProperties.mjs
/**
* Returns true if the schema contains a valid maxProperties property
* @specification Json Schema 7
*/
function IsMaxProperties(schema) {
	return HasPropertyKey(schema, "maxProperties") && IsNumber(schema.maxProperties);
}
//#endregion
//#region node_modules/typebox/build/schema/types/minimum.mjs
/**
* Returns true if the schema contains a valid minimum property
* @specification Json Schema 7
*/
function IsMinimum(schema) {
	return HasPropertyKey(schema, "minimum") && (IsNumber(schema.minimum) || IsBigInt(schema.minimum));
}
//#endregion
//#region node_modules/typebox/build/schema/types/minContains.mjs
/**
* Returns true if the schema contains a valid maxContains property
* @specification Json Schema 2019-09
*/
function IsMinContains(schema) {
	return HasPropertyKey(schema, "minContains") && IsNumber(schema.minContains);
}
//#endregion
//#region node_modules/typebox/build/schema/types/minItems.mjs
/**
* Returns true if the schema contains a valid minItems property
* @specification Json Schema 7
*/
function IsMinItems(schema) {
	return HasPropertyKey(schema, "minItems") && IsNumber(schema.minItems);
}
//#endregion
//#region node_modules/typebox/build/schema/types/minLength.mjs
/**
* Returns true if the schema contains a valid minLength property
* @specification Json Schema 7
*/
function IsMinLength(schema) {
	return HasPropertyKey(schema, "minLength") && IsNumber(schema.minLength);
}
//#endregion
//#region node_modules/typebox/build/schema/types/minProperties.mjs
/**
* Returns true if the schema contains a valid minProperties property
* @specification Json Schema 7
*/
function IsMinProperties(schema) {
	return HasPropertyKey(schema, "minProperties") && IsNumber(schema.minProperties);
}
//#endregion
//#region node_modules/typebox/build/schema/types/multipleOf.mjs
/**
* Returns true if the schema contains a valid multipleOf property
* @specification Json Schema 7
*/
function IsMultipleOf(schema) {
	return HasPropertyKey(schema, "multipleOf") && (IsNumber(schema.multipleOf) || IsBigInt(schema.multipleOf));
}
//#endregion
//#region node_modules/typebox/build/schema/types/not.mjs
/**
* Returns true if the schema contains a valid not property
* @specification Json Schema 7
*/
function IsNot(schema) {
	return HasPropertyKey(schema, "not") && IsSchema(schema.not);
}
//#endregion
//#region node_modules/typebox/build/schema/types/oneOf.mjs
/**
* Returns true if the schema contains a valid oneOf property
* @specification Json Schema 7
*/
function IsOneOf(schema) {
	return HasPropertyKey(schema, "oneOf") && IsArray(schema.oneOf) && schema.oneOf.every((value) => IsSchema(value));
}
//#endregion
//#region node_modules/typebox/build/schema/types/pattern.mjs
/**
* Returns true if the schema contains a valid pattern property
* @specification Json Schema 7
*/
function IsPattern(schema) {
	return HasPropertyKey(schema, "pattern") && (IsString(schema.pattern) || schema.pattern instanceof RegExp);
}
//#endregion
//#region node_modules/typebox/build/schema/types/patternProperties.mjs
/**
* Returns true if the schema contains a valid patternProperties property
* @specification Json Schema 7
*/
function IsPatternProperties(schema) {
	return HasPropertyKey(schema, "patternProperties") && IsObject(schema.patternProperties) && Object.values(schema.patternProperties).every((value) => IsSchema(value));
}
//#endregion
//#region node_modules/typebox/build/schema/types/prefixItems.mjs
/**
* Returns true if the schema contains a valid prefixItems property
*/
function IsPrefixItems(schema) {
	return HasPropertyKey(schema, "prefixItems") && IsArray(schema.prefixItems) && schema.prefixItems.every((schema) => IsSchema(schema));
}
//#endregion
//#region node_modules/typebox/build/schema/types/properties.mjs
/**
* Returns true if the schema contains a valid properties property
* @specification Json Schema 7
*/
function IsProperties(schema) {
	return HasPropertyKey(schema, "properties") && IsObject(schema.properties) && Object.values(schema.properties).every((value) => IsSchema(value));
}
//#endregion
//#region node_modules/typebox/build/schema/types/propertyNames.mjs
/**
* Returns true if the schema contains a valid propertyNames property
* @specification Json Schema 7
*/
function IsPropertyNames(schema) {
	return HasPropertyKey(schema, "propertyNames") && (IsObject(schema.propertyNames) || IsSchema(schema.propertyNames));
}
//#endregion
//#region node_modules/typebox/build/schema/types/recursiveAnchor.mjs
/**
* Returns true if the schema contains a valid $recursiveAnchor property
*/
function IsRecursiveAnchor(schema) {
	return HasPropertyKey(schema, "$recursiveAnchor") && IsBoolean(schema.$recursiveAnchor);
}
/**
* Returns true if the schema contains a valid $recursiveAnchor property that is true
*/
function IsRecursiveAnchorTrue(schema) {
	return IsRecursiveAnchor(schema) && IsEqual(schema.$recursiveAnchor, true);
}
//#endregion
//#region node_modules/typebox/build/schema/types/recursiveRef.mjs
/**
* Returns true if the schema contains a valid $recursiveRef property
*/
function IsRecursiveRef(schema) {
	return HasPropertyKey(schema, "$recursiveRef") && IsString(schema.$recursiveRef);
}
//#endregion
//#region node_modules/typebox/build/schema/types/ref.mjs
/**
* Returns true if the schema contains a valid $ref property
* @specification Json Schema 7
*/
function IsRef(schema) {
	return HasPropertyKey(schema, "$ref") && IsString(schema.$ref);
}
//#endregion
//#region node_modules/typebox/build/schema/types/required.mjs
/**
* Returns true if the schema contains a valid required property
* @specification Json Schema 7
*/
function IsRequired(schema) {
	return HasPropertyKey(schema, "required") && IsArray(schema.required) && schema.required.every((value) => IsString(value));
}
//#endregion
//#region node_modules/typebox/build/schema/types/then.mjs
/**
* Returns true if the schema contains a valid then property
* @specification Json Schema 7
*/
function IsThen(schema) {
	return HasPropertyKey(schema, "then") && IsSchema(schema.then);
}
//#endregion
//#region node_modules/typebox/build/schema/types/type.mjs
/**
* Returns true if the schema contains a valid type property
* @specification Json Schema 7
*/
function IsType(schema) {
	return HasPropertyKey(schema, "type") && (IsString(schema.type) || IsArray(schema.type) && schema.type.every((value) => IsString(value)));
}
//#endregion
//#region node_modules/typebox/build/schema/types/uniqueItems.mjs
/**
* Returns true if the schema contains a valid uniqueItems property
* @specification Json Schema 7
*/
function IsUniqueItems(schema) {
	return HasPropertyKey(schema, "uniqueItems") && IsBoolean(schema.uniqueItems);
}
//#endregion
//#region node_modules/typebox/build/schema/types/unevaluatedItems.mjs
/**
* Returns true if the schema contains a valid unevaluatedItems property
* @specification Json Schema 2019-09
*/
function IsUnevaluatedItems(schema) {
	return HasPropertyKey(schema, "unevaluatedItems") && IsSchema(schema.unevaluatedItems);
}
//#endregion
//#region node_modules/typebox/build/schema/types/unevaluatedProperties.mjs
/**
* Returns true if the schema contains a valid unevaluatedProperties property
* @specification Json Schema 2019-09
*/
function IsUnevaluatedProperties(schema) {
	return HasPropertyKey(schema, "unevaluatedProperties") && IsSchema(schema.unevaluatedProperties);
}
//#endregion
//#region node_modules/typebox/build/schema/engine/_context.mjs
var CheckContext = class {
	constructor() {
		this.stack = [{
			indices: /* @__PURE__ */ new Set(),
			keys: /* @__PURE__ */ new Set()
		}];
	}
	Push() {
		const indices = /* @__PURE__ */ new Set();
		const keys = /* @__PURE__ */ new Set();
		this.stack.push({
			indices,
			keys
		});
		return true;
	}
	Pop() {
		this.stack.pop();
		return true;
	}
	AddIndex(index) {
		this.GetIndices().add(index);
		return true;
	}
	AddKey(key) {
		this.GetKeys().add(key);
		return true;
	}
	GetIndices() {
		return this.stack[this.stack.length - 1].indices;
	}
	GetKeys() {
		return this.stack[this.stack.length - 1].keys;
	}
	Merge(results) {
		for (const context of results) {
			context.GetIndices().forEach((value) => this.GetIndices().add(value));
			context.GetKeys().forEach((value) => this.GetKeys().add(value));
		}
		return true;
	}
};
var ErrorContext = class extends CheckContext {
	constructor(callback) {
		super();
		this.callback = callback;
	}
	AddError(error) {
		this.callback(error);
		return false;
	}
};
var AccumulatedErrorContext = class extends ErrorContext {
	constructor() {
		super((error) => this.errors.push(error));
		this.errors = [];
	}
	AddError(error) {
		this.errors.push(error);
		return false;
	}
	GetErrors() {
		return this.errors;
	}
};
//#endregion
//#region node_modules/typebox/build/schema/engine/_guard.mjs
function CheckGuard(_stack, _context, schema, value) {
	return schema["~guard"].check(value);
}
function ErrorGuard(_stack, context, schemaPath, instancePath, schema, value) {
	return schema["~guard"].check(value) || context.AddError({
		keyword: "~guard",
		schemaPath,
		instancePath,
		params: { errors: schema["~guard"].errors(value) }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/_refine.mjs
function CheckRefine(_stack, _context, schema, value) {
	return Every(schema["~refine"], 0, (refinement, _) => refinement.check(value));
}
function ErrorRefine(_stack, context, schemaPath, instancePath, schema, value) {
	return EveryAll(schema["~refine"], 0, (refinement, index) => {
		return refinement.check(value) || context.AddError({
			keyword: "~refine",
			schemaPath,
			instancePath,
			params: {
				index,
				message: refinement.error(value)
			}
		});
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/additionalItems.mjs
function IsValid$4(schema) {
	return IsItems(schema) && IsArray(schema.items);
}
function CheckAdditionalItems(stack, context, schema, value) {
	if (!IsValid$4(schema)) return true;
	return value.every((item, index) => {
		return IsLessThan(index, schema.items.length) || CheckSchemaPushStack(stack, context, schema.additionalItems, item) && context.AddIndex(index);
	});
}
function ErrorAdditionalItems(stack, context, schemaPath, instancePath, schema, value) {
	if (!IsValid$4(schema)) return true;
	return value.every((item, index) => {
		const nextSchemaPath = `${schemaPath}/additionalItems`;
		const nextInstancePath = `${instancePath}/${index}`;
		return IsLessThan(index, schema.items.length) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema.additionalItems, item) && context.AddIndex(index);
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/additionalProperties.mjs
function GetPropertyKeyAsPattern(key) {
	return `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
function GetPropertiesPattern(schema) {
	const patterns = [];
	if (IsPatternProperties(schema)) patterns.push(...Keys(schema.patternProperties));
	if (IsProperties(schema)) patterns.push(...Keys(schema.properties).map(GetPropertyKeyAsPattern));
	return IsEqual(patterns.length, 0) ? "(?!)" : `(${patterns.join("|")})`;
}
function CheckAdditionalProperties(stack, context, schema, value) {
	const regexp = new RegExp(GetPropertiesPattern(schema));
	return Every(Keys(value), 0, (key, _index) => {
		return regexp.test(key) || CheckSchemaPushStack(stack, context, schema.additionalProperties, value[key]) && context.AddKey(key);
	});
}
function ErrorAdditionalProperties(stack, context, schemaPath, instancePath, schema, value) {
	const regexp = new RegExp(GetPropertiesPattern(schema));
	const additionalProperties = [];
	return EveryAll(Keys(value), 0, (key, _index) => {
		const nextSchemaPath = `${schemaPath}/additionalProperties`;
		const nextInstancePath = `${instancePath}/${key}`;
		const nextContext = new AccumulatedErrorContext();
		const isAdditionalProperty = regexp.test(key) || ErrorSchemaPushStack(stack, nextContext, nextSchemaPath, nextInstancePath, schema.additionalProperties, value[key]) && context.AddKey(key);
		if (!isAdditionalProperty) additionalProperties.push(key);
		return isAdditionalProperty;
	}) || context.AddError({
		keyword: "additionalProperties",
		schemaPath,
		instancePath,
		params: { additionalProperties }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/allOf.mjs
function CheckAllOf(stack, context, schema, value) {
	const results = schema.allOf.reduce((result, schema) => {
		const nextContext = new CheckContext();
		return CheckSchema(stack, nextContext, schema, value) ? [...result, nextContext] : result;
	}, []);
	return IsEqual(results.length, schema.allOf.length) && context.Merge(results);
}
function ErrorAllOf(stack, context, schemaPath, instancePath, schema, value) {
	const failedContexts = [];
	const results = schema.allOf.reduce((result, schema, index) => {
		const nextSchemaPath = `${schemaPath}/allOf/${index}`;
		const nextContext = new AccumulatedErrorContext();
		const isSchema = ErrorSchema(stack, nextContext, nextSchemaPath, instancePath, schema, value);
		if (!isSchema) failedContexts.push(nextContext);
		return isSchema ? [...result, nextContext] : result;
	}, []);
	const isAllOf = IsEqual(results.length, schema.allOf.length) && context.Merge(results);
	if (!isAllOf) failedContexts.forEach((failed) => failed.GetErrors().forEach((error) => context.AddError(error)));
	return isAllOf;
}
//#endregion
//#region node_modules/typebox/build/schema/engine/anyOf.mjs
function CheckAnyOf(stack, context, schema, value) {
	const results = schema.anyOf.reduce((result, schema) => {
		const nextContext = new CheckContext();
		return CheckSchema(stack, nextContext, schema, value) ? [...result, nextContext] : result;
	}, []);
	return IsGreaterThan(results.length, 0) && context.Merge(results);
}
function ErrorAnyOf(stack, context, schemaPath, instancePath, schema, value) {
	const failedContexts = [];
	const results = schema.anyOf.reduce((result, schema, index) => {
		const nextContext = new AccumulatedErrorContext();
		const isSchema = ErrorSchema(stack, nextContext, `${schemaPath}/anyOf/${index}`, instancePath, schema, value);
		if (!isSchema) failedContexts.push(nextContext);
		return isSchema ? [...result, nextContext] : result;
	}, []);
	const isAnyOf = IsGreaterThan(results.length, 0) && context.Merge(results);
	if (!isAnyOf) failedContexts.forEach((failed) => failed.GetErrors().forEach((error) => context.AddError(error)));
	return isAnyOf || context.AddError({
		keyword: "anyOf",
		schemaPath,
		instancePath,
		params: {}
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/boolean.mjs
function CheckBooleanSchema(_stack, _context, schema, _value) {
	return schema;
}
function ErrorBooleanSchema(stack, context, schemaPath, instancePath, schema, value) {
	return CheckBooleanSchema(stack, context, schema, value) || context.AddError({
		keyword: "boolean",
		schemaPath,
		instancePath,
		params: {}
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/const.mjs
function CheckConst(_stack, _context, schema, value) {
	return IsValueLike(schema.const) ? IsEqual(value, schema.const) : IsDeepEqual(value, schema.const);
}
function ErrorConst(stack, context, schemaPath, instancePath, schema, value) {
	return CheckConst(stack, context, schema, value) || context.AddError({
		keyword: "const",
		schemaPath,
		instancePath,
		params: { allowedValue: schema.const }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/contains.mjs
function IsValid$3(schema) {
	return !(IsMinContains(schema) && IsEqual(schema.minContains, 0));
}
function CheckContains(stack, context, schema, value) {
	if (!IsValid$3(schema)) return true;
	return !IsEqual(value.length, 0) && value.some((item) => CheckSchema(stack, context, schema.contains, item));
}
function ErrorContains(stack, context, schemaPath, instancePath, schema, value) {
	return CheckContains(stack, context, schema, value) || context.AddError({
		keyword: "contains",
		schemaPath,
		instancePath,
		params: { minContains: 1 }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/dependencies.mjs
function CheckDependencies(stack, context, schema, value) {
	const isLength = IsEqual(Keys(value).length, 0);
	const isEvery = Every(Entries(schema.dependencies), 0, ([key, schema]) => {
		return !HasPropertyKey(value, key) || (IsArray(schema) ? schema.every((key) => HasPropertyKey(value, key)) : CheckSchema(stack, context, schema, value));
	});
	return isLength || isEvery;
}
function ErrorDependencies(stack, context, schemaPath, instancePath, schema, value) {
	const isLength = IsEqual(Keys(value).length, 0);
	const isEvery = EveryAll(Entries(schema.dependencies), 0, ([key, schema]) => {
		const nextSchemaPath = `${schemaPath}/dependencies/${key}`;
		return !HasPropertyKey(value, key) || (IsArray(schema) ? schema.every((dependency) => HasPropertyKey(value, dependency) || context.AddError({
			keyword: "dependencies",
			schemaPath,
			instancePath,
			params: {
				property: key,
				dependencies: schema
			}
		})) : ErrorSchema(stack, context, nextSchemaPath, instancePath, schema, value));
	});
	return isLength || isEvery;
}
//#endregion
//#region node_modules/typebox/build/schema/engine/dependentRequired.mjs
function CheckDependentRequired(_stack, _context, schema, value) {
	const isLength = IsEqual(Keys(value).length, 0);
	const isEvery = Every(Entries(schema.dependentRequired), 0, ([key, keys]) => {
		return !HasPropertyKey(value, key) || keys.every((key) => HasPropertyKey(value, key));
	});
	return isLength || isEvery;
}
function ErrorDependentRequired(_stack, context, schemaPath, instancePath, schema, value) {
	const isLength = IsEqual(Keys(value).length, 0);
	const isEveryEntry = EveryAll(Entries(schema.dependentRequired), 0, ([key, keys]) => {
		return !HasPropertyKey(value, key) || EveryAll(keys, 0, (dependency) => HasPropertyKey(value, dependency) || context.AddError({
			keyword: "dependentRequired",
			schemaPath,
			instancePath,
			params: {
				property: key,
				dependencies: keys
			}
		}));
	});
	return isLength || isEveryEntry;
}
//#endregion
//#region node_modules/typebox/build/schema/engine/dependentSchemas.mjs
function CheckDependentSchemas(stack, context, schema, value) {
	const isLength = IsEqual(Keys(value).length, 0);
	const isEvery = Every(Entries(schema.dependentSchemas), 0, ([key, schema]) => {
		return !HasPropertyKey(value, key) || CheckSchema(stack, context, schema, value);
	});
	return isLength || isEvery;
}
function ErrorDependentSchemas(stack, context, schemaPath, instancePath, schema, value) {
	const isLength = IsEqual(Keys(value).length, 0);
	const isEvery = EveryAll(Entries(schema.dependentSchemas), 0, ([key, schema]) => {
		const nextSchemaPath = `${schemaPath}/dependentSchemas/${key}`;
		return !HasPropertyKey(value, key) || ErrorSchema(stack, context, nextSchemaPath, instancePath, schema, value);
	});
	return isLength || isEvery;
}
//#endregion
//#region node_modules/typebox/build/schema/engine/dynamicRef.mjs
function CheckDynamicRef(stack, context, schema, value) {
	const target = stack.DynamicRef(schema) ?? false;
	return IsSchema(target) && CheckSchema(stack, context, target, value);
}
function ErrorDynamicRef(stack, context, _schemaPath, instancePath, schema, value) {
	const target = stack.DynamicRef(schema) ?? false;
	return IsSchema(target) && ErrorSchema(stack, context, "#", instancePath, target, value);
}
//#endregion
//#region node_modules/typebox/build/schema/engine/enum.mjs
function CheckEnum(_stack, _context, schema, value) {
	return schema.enum.some((option) => IsValueLike(option) ? IsEqual(value, option) : IsDeepEqual(value, option));
}
function ErrorEnum(stack, context, schemaPath, instancePath, schema, value) {
	return CheckEnum(stack, context, schema, value) || context.AddError({
		keyword: "enum",
		schemaPath,
		instancePath,
		params: { allowedValues: schema.enum }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/exclusiveMaximum.mjs
function CheckExclusiveMaximum(_stack, _context, schema, value) {
	return IsLessThan(value, schema.exclusiveMaximum);
}
function ErrorExclusiveMaximum(stack, context, schemaPath, instancePath, schema, value) {
	return CheckExclusiveMaximum(stack, context, schema, value) || context.AddError({
		keyword: "exclusiveMaximum",
		schemaPath,
		instancePath,
		params: {
			comparison: "<",
			limit: schema.exclusiveMaximum
		}
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/exclusiveMinimum.mjs
function CheckExclusiveMinimum(_stack, _context, schema, value) {
	return IsGreaterThan(value, schema.exclusiveMinimum);
}
function ErrorExclusiveMinimum(stack, context, schemaPath, instancePath, schema, value) {
	return CheckExclusiveMinimum(stack, context, schema, value) || context.AddError({
		keyword: "exclusiveMinimum",
		schemaPath,
		instancePath,
		params: {
			comparison: ">",
			limit: schema.exclusiveMinimum
		}
	});
}
//#endregion
//#region node_modules/typebox/build/format/date.mjs
const DAYS = [
	0,
	31,
	28,
	31,
	30,
	31,
	30,
	31,
	31,
	30,
	31,
	30,
	31
];
const DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
function IsLeapYear(year) {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
/**
* Returns true if the value is a ISO8601 Date component string
* @source ajv-formats
* @example `2020-12-12`
*/
function IsDate(value) {
	const matches = DATE.exec(value);
	if (!matches) return false;
	const year = +matches[1];
	const month = +matches[2];
	const day = +matches[3];
	return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && IsLeapYear(year) ? 29 : DAYS[month]);
}
//#endregion
//#region node_modules/typebox/build/format/time.mjs
const TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(?:Z|([+-])(\d\d):(\d\d))?$/i;
/**
* Returns true if the value is a ISO time string
* @specification
*/
function IsTime(value, strictTimeZone = true) {
	const matches = TIME.exec(value);
	if (!matches) return false;
	const hr = +matches[1];
	const min = +matches[2];
	const sec = +matches[3];
	const tzSign = matches[4] === "-" ? -1 : 1;
	const tzH = +(matches[5] || 0);
	const tzM = +(matches[6] || 0);
	if (tzH > 23 || tzM > 59) return false;
	if (strictTimeZone && !matches[4] && value.toLowerCase().indexOf("z") === -1) return false;
	if (hr <= 23 && min <= 59 && sec < 60) return true;
	const utcMin = min - tzM * tzSign;
	const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
	return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
}
//#endregion
//#region node_modules/typebox/build/format/date_time.mjs
/**
* Returns true if the value is a ISO8601 DateTime string
* @source ajv-formats
* @example `2020-12-12T20:20:40+00:00`
*/
function IsDateTime(value, strictTimeZone = true) {
	const dateTime = value.split(/T/i);
	return dateTime.length === 2 && IsDate(dateTime[0]) && IsTime(dateTime[1], strictTimeZone);
}
//#endregion
//#region node_modules/typebox/build/format/duration.mjs
const Duration = /^P((\d+Y(\d+M(\d+D)?)?|\d+M(\d+D)?|\d+D)(T(\d+H(\d+M(\d+S)?)?|\d+M(\d+S)?|\d+S))?|T(\d+H(\d+M(\d+S)?)?|\d+M(\d+S)?|\d+S)|\d+W)$/;
/**
* Returns true if the value is a valid ISO-8601 duration.
* @specification https://tools.ietf.org/html/rfc3339
*/
function IsDuration(value) {
	return Duration.test(value);
}
//#endregion
//#region node_modules/typebox/build/format/email.mjs
const Email = /^(?!.*\.\.)[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
/**
* Returns true if the value is an Email
* @specification ajv-formats
*/
function IsEmail(value) {
	return Email.test(value);
}
//#endregion
//#region node_modules/typebox/build/format/_puny.mjs
const PUNYCODE_BASE = 36;
const PUNYCODE_TMIN = 1;
const PUNYCODE_TMAX = 26;
const PUNYCODE_SKEW = 38;
const PUNYCODE_DAMP = 700;
const PUNYCODE_INITIAL_BIAS = 72;
const PUNYCODE_INITIAL_N = 128;
function Adapt(delta, numPoints, firstTime) {
	delta = firstTime ? Math.floor(delta / PUNYCODE_DAMP) : delta >> 1;
	delta += Math.floor(delta / numPoints);
	let k = 0;
	while (delta > (PUNYCODE_BASE - PUNYCODE_TMIN) * PUNYCODE_TMAX >> 1) {
		delta = Math.floor(delta / (PUNYCODE_BASE - PUNYCODE_TMIN));
		k += PUNYCODE_BASE;
	}
	return k + Math.floor((PUNYCODE_BASE - PUNYCODE_TMIN + 1) * delta / (delta + PUNYCODE_SKEW));
}
function Decode$7(value) {
	const output = [];
	let n = PUNYCODE_INITIAL_N;
	let i = 0;
	let bias = PUNYCODE_INITIAL_BIAS;
	const delimIdx = value.lastIndexOf("-");
	if (delimIdx > 0) for (let j = 0; j < delimIdx; j++) {
		const cp = value.charCodeAt(j);
		if (cp >= 128) throw new Error("Invalid punycode: non-basic before delimiter");
		output.push(cp);
	}
	let inIdx = delimIdx < 0 ? 0 : delimIdx + 1;
	while (inIdx < value.length) {
		const oldi = i;
		let w = 1;
		let k = PUNYCODE_BASE;
		while (true) {
			if (inIdx >= value.length) throw new Error("Invalid punycode: unexpected end of input");
			const ch = value.charCodeAt(inIdx++);
			let digit;
			if (ch >= 97 && ch <= 122) digit = ch - 97;
			else if (ch >= 48 && ch <= 57) digit = ch - 48 + 26;
			else if (ch >= 65 && ch <= 90) digit = ch - 65;
			else throw new Error("Invalid punycode: bad digit character");
			i += digit * w;
			const t = k <= bias ? PUNYCODE_TMIN : k >= bias + PUNYCODE_TMAX ? PUNYCODE_TMAX : k - bias;
			if (digit < t) break;
			w *= PUNYCODE_BASE - t;
			k += PUNYCODE_BASE;
		}
		const outLen = output.length + 1;
		bias = Adapt(i - oldi, outLen, oldi === 0);
		n += Math.floor(i / outLen);
		i %= outLen;
		output.splice(i, 0, n);
		i++;
	}
	return globalThis.String.fromCodePoint(...output);
}
//#endregion
//#region node_modules/typebox/build/format/_idna.mjs
function IsNonspacingMark(cp) {
	return /\p{Mn}/u.test(String.fromCodePoint(cp));
}
function IsSpacingCombiningMark(cp) {
	return /\p{Mc}/u.test(String.fromCodePoint(cp));
}
function IsEnclosingMark(cp) {
	return /\p{Me}/u.test(String.fromCodePoint(cp));
}
function IsCombiningMark(cp) {
	return IsNonspacingMark(cp) || IsSpacingCombiningMark(cp) || IsEnclosingMark(cp);
}
const RFC5892_DISALLOWED = new Set([
	1600,
	2042,
	12334,
	12335,
	12337,
	12338,
	12339,
	12340,
	12341,
	12347
]);
const VIRAMA_CPS = new Set([
	2381,
	2509,
	2637,
	2765,
	2893,
	3021,
	3149,
	3277,
	3387,
	3388,
	3405,
	3530,
	6980,
	7082,
	7083,
	43456,
	69702,
	69759,
	69817,
	69939,
	69940,
	70080,
	70197,
	70477,
	70722,
	70850,
	71103,
	71231,
	71350,
	72767,
	73028,
	73029
]);
function IsGreek(cp) {
	return /\p{Script=Greek}/u.test(String.fromCodePoint(cp));
}
function IsHebrew(cp) {
	return /\p{Script=Hebrew}/u.test(String.fromCodePoint(cp));
}
function IsHiragana(cp) {
	return /\p{Script=Hiragana}/u.test(String.fromCodePoint(cp));
}
function IsKatakana(cp) {
	return /\p{Script=Katakana}/u.test(String.fromCodePoint(cp));
}
function IsHan(cp) {
	return /\p{Script=Han}/u.test(String.fromCodePoint(cp));
}
function IsArabicIndicDigit(cp) {
	return cp >= 1632 && cp <= 1641;
}
function IsExtendedArabicIndicDigit(cp) {
	return cp >= 1776 && cp <= 1785;
}
function IsVirama(cp) {
	return VIRAMA_CPS.has(cp);
}
function IsUnicodeLabel(value) {
	if (value.length === 0) return false;
	const cps = [...value].map((c) => c.codePointAt(0));
	const len = cps.length;
	if (cps[0] === 45 || cps[len - 1] === 45) return false;
	if (len >= 4 && cps[2] === 45 && cps[3] === 45) return false;
	if (IsCombiningMark(cps[0])) return false;
	let hasJapanese = false;
	let hasArabicIndic = false;
	let hasExtendedArabicIndic = false;
	for (let i = 0; i < len; i++) {
		const cp = cps[i];
		if (RFC5892_DISALLOWED.has(cp)) return false;
		if (IsHiragana(cp) || IsKatakana(cp) || IsHan(cp)) hasJapanese = true;
		if (IsArabicIndicDigit(cp)) hasArabicIndic = true;
		if (IsExtendedArabicIndicDigit(cp)) hasExtendedArabicIndic = true;
		const prev = cps[i - 1], next = cps[i + 1];
		switch (cp) {
			case 183:
				if (prev !== 108 || next !== 108) return false;
				break;
			case 885:
				if (next === void 0 || !IsGreek(next)) return false;
				break;
			case 1523:
			case 1524:
				if (prev === void 0 || !IsHebrew(prev)) return false;
				break;
			case 8205:
				if (prev === void 0 || !IsVirama(prev)) return false;
				break;
			case 12539: break;
		}
	}
	if (value.includes("・") && !hasJapanese) return false;
	if (hasArabicIndic && hasExtendedArabicIndic) return false;
	return true;
}
function IsAsciiLabel(value) {
	if (value.charCodeAt(0) === 45 || value.charCodeAt(value.length - 1) === 45) return false;
	if (value.length >= 4 && value.charCodeAt(2) === 45 && value.charCodeAt(3) === 45) return false;
	for (let i = 0; i < value.length; i++) {
		const ch = value.charCodeAt(i);
		if (!(ch >= 97 && ch <= 122 || ch >= 65 && ch <= 90 || ch >= 48 && ch <= 57 || ch === 45)) return false;
	}
	return true;
}
function IsPuny(value) {
	return value.toLowerCase().startsWith("xn--");
}
function IsPunyLabel(value) {
	try {
		return IsUnicodeLabel(Decode$7(value.slice(4)));
	} catch {
		return false;
	}
}
function IsIdnLabel(value) {
	if (value.length === 0 || value.length > 63) return false;
	return IsPuny(value) ? IsPunyLabel(value) : IsUnicodeLabel(value);
}
function IsLabel(value) {
	if (value.length === 0 || value.length > 63) return false;
	return IsPuny(value) ? IsPunyLabel(value) : IsAsciiLabel(value);
}
//#endregion
//#region node_modules/typebox/build/format/hostname.mjs
/**
* Returns true if the value is a valid hostname.
* @specification https://tools.ietf.org/html/rfc1123
* @specification https://tools.ietf.org/html/rfc5891
* @specification https://tools.ietf.org/html/rfc5892
*/
function IsHostname(value) {
	if (value.length === 0 || value.length > 253) return false;
	if (value.charCodeAt(value.length - 1) === 46) return false;
	for (const label of value.split(".")) if (!IsLabel(label)) return false;
	return true;
}
//#endregion
//#region node_modules/typebox/build/format/idn_email.mjs
const IdnEmail = /^(?!.*\.\.)[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\.[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+)*@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)*$/iu;
/**
* Returns true if the value is an IdnEmail
* @specification ajv-formats (unicode-extension)
*/
function IsIdnEmail(value) {
	return IdnEmail.test(value);
}
//#endregion
//#region node_modules/typebox/build/format/idn_hostname.mjs
/**
* Returns true if the value is a valid internationalized (IDN) hostname.
* @specification https://tools.ietf.org/html/rfc3490
* @specification https://tools.ietf.org/html/rfc5891
* @specification https://tools.ietf.org/html/rfc5892
*/
function IsIdnHostname(value) {
	if (value.length === 0 || value.includes(" ")) return false;
	const canonical = value.normalize("NFC").replace(/[\u002E\u3002\uFF0E\uFF61]/g, ".");
	if (canonical.length > 253) return false;
	for (const label of canonical.split(".")) if (!IsIdnLabel(label)) return false;
	return true;
}
//#endregion
//#region node_modules/typebox/build/format/ipv4.mjs
function IsIPv4Internal(value, start, end) {
	let dots = 0;
	let num = 0;
	let digits = 0;
	let leading = 0;
	for (let i = start; i < end; i++) {
		const ch = value.charCodeAt(i);
		if (ch === 46) {
			if (digits === 0 || num > 255 || leading === 48 && digits > 1) return false;
			dots++;
			num = 0;
			digits = 0;
			leading = 0;
		} else if (ch >= 48 && ch <= 57) {
			if (digits === 0) leading = ch;
			num = num * 10 + (ch - 48);
			digits++;
		} else return false;
	}
	return dots === 3 && digits > 0 && num <= 255 && !(leading === 48 && digits > 1);
}
/**
* Returns true if the value is a IPV4 address
* @specification http://tools.ietf.org/html/rfc2673#section-3.2
*/
function IsIPv4(value) {
	return IsIPv4Internal(value, 0, value.length);
}
//#endregion
//#region node_modules/typebox/build/format/ipv6.mjs
function InRange(ch) {
	return ch >= 48 && ch <= 57 || ch >= 65 && ch <= 70 || ch >= 97 && ch <= 102;
}
/**
* Returns true if the value is an IPv6 address
* @specification http://tools.ietf.org/html/rfc2373#section-2.2
*/
function IsIPv6(value) {
	const length = value.length;
	if (length === 0) return false;
	let groups = 0;
	let compressed = false;
	let i = 0;
	if (value.charCodeAt(0) === 58 && value.charCodeAt(1) === 58) {
		if (length === 2) return true;
		compressed = true;
		i = 2;
	}
	while (i < length) {
		let digits = 0;
		const start = i;
		while (i < length && InRange(value.charCodeAt(i))) {
			i++;
			digits++;
		}
		if (digits === 0) return false;
		const next = value.charCodeAt(i);
		if (next === 46) {
			if (!IsIPv4Internal(value, start, length)) return false;
			groups += 2;
			i = length;
			break;
		}
		if (digits > 4) return false;
		groups++;
		if (i === length) break;
		if (next !== 58) return false;
		i++;
		if (value.charCodeAt(i) === 58) {
			if (compressed) return false;
			if (value.charCodeAt(i + 1) === 58) return false;
			compressed = true;
			i++;
			if (i === length) break;
		}
	}
	return compressed ? groups <= 7 : groups === 8;
}
//#endregion
//#region node_modules/typebox/build/format/iri_reference.mjs
function TryUrl(value) {
	try {
		new URL(value, "http://example.com");
		return true;
	} catch {
		return false;
	}
}
/**
* Returns true if the value is a Iri reference
* @specification
*/
function IsIriReference(value) {
	if (value.includes(" ")) return false;
	if (value.includes("\\")) return false;
	if (/[\x00-\x1F\x7F]/.test(value)) return false;
	if (/%(?![0-9a-fA-F]{2})/.test(value)) return false;
	if (value === "") return true;
	const colonIndex = value.indexOf(":");
	if (colonIndex > 0 && /^[a-zA-Z][a-zA-Z0-9+\-.]*$/.test(value.substring(0, colonIndex))) return TryUrl(value);
	else {
		if (value.match(/^([a-zA-Z][a-zA-Z0-9+\-.]*)(\/\/)/) && colonIndex === -1) return false;
		return TryUrl(value);
	}
}
//#endregion
//#region node_modules/typebox/build/format/iri.mjs
/**
* Returns true if the value is a Iri
* @specification
*/
function IsIri(value) {
	try {
		new URL(value);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region node_modules/typebox/build/format/json_pointer_uri_fragment.mjs
const JsonPointerUriFragment = /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i;
/**
* Returns true if the value is a json pointer uri fragment
* @specification
* @source ajv-formats
*/
function IsJsonPointerUriFragment(value) {
	return JsonPointerUriFragment.test(value);
}
//#endregion
//#region node_modules/typebox/build/format/json_pointer.mjs
const JsonPointer = /^(?:\/(?:[^~/]|~0|~1)*)*$/;
/**
* Returns true if the value is a json pointer
* @specification
* @source ajv-formats
*/
function IsJsonPointer(value) {
	return JsonPointer.test(value);
}
//#endregion
//#region node_modules/typebox/build/format/regex.mjs
/**
* Returns true if the value is a regular expression string pattern
* @specification
* @source ajv-formats
*/
function IsRegex(value) {
	if (value.length === 0) return false;
	try {
		new RegExp(value);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region node_modules/typebox/build/format/relative_json_pointer.mjs
const RelativeJsonPointer = /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/;
/**
* Returns true if the value is a relative json pointer
* @specification
* @source ajv-formats
*/
function IsRelativeJsonPointer(value) {
	return RelativeJsonPointer.test(value);
}
//#endregion
//#region node_modules/typebox/build/format/uri_reference.mjs
const UriReference = /^(?!.*[^\x00-\x7F])(?!.*\\)(?:(?:[a-z][a-z0-9+\-.]*:)?(?:\/\/[^\s[\]{}<>^`|]*)?|[^\s[\]{}<>^`|]*)(?:\?[^\s[\]{}<>^`|]*)?(?:#[^\s[\]{}<>^`|]*)?$/i;
/**
* Returns true if the value is a valid URI Reference.
* @specification https://tools.ietf.org/html/rfc3986
*/
function IsUriReference(value) {
	return UriReference.test(value);
}
//#endregion
//#region node_modules/typebox/build/format/uri_template.mjs
const UriTemplate = /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i;
/**
* Returns true if the value is a uri template
* @specification
* @source ajv-formats
*/
function IsUriTemplate(value) {
	return UriTemplate.test(value);
}
//#endregion
//#region node_modules/typebox/build/format/uri.mjs
function IsAlpha(ch) {
	return ch >= 97 && ch <= 122 || ch >= 65 && ch <= 90;
}
function IsAlphaNumeric(ch) {
	return IsAlpha(ch) || ch >= 48 && ch <= 57;
}
function IsHex(ch) {
	return ch >= 48 && ch <= 57 || ch >= 65 && ch <= 70 || ch >= 97 && ch <= 102;
}
function IsSchemeChar(ch) {
	return IsAlphaNumeric(ch) || ch === 43 || ch === 45 || ch === 46;
}
function IsUnreserved(ch) {
	return IsAlphaNumeric(ch) || ch === 45 || ch === 46 || ch === 95 || ch === 126;
}
function IsSubDelim(ch) {
	return ch === 33 || ch === 36 || ch === 38 || ch === 39 || ch === 40 || ch === 41 || ch === 42 || ch === 43 || ch === 44 || ch === 59 || ch === 61;
}
function IsPchar(ch) {
	return IsUnreserved(ch) || IsSubDelim(ch) || ch === 58 || ch === 64;
}
/**
* Returns true if the value matches RFC 3986 URI syntax.
* @specification https://tools.ietf.org/html/rfc3986
*/
function IsUri(value) {
	const length = value.length;
	if (length === 0) return false;
	if (!IsAlpha(value.charCodeAt(0))) return false;
	let i = 1;
	while (i < length) {
		const ch = value.charCodeAt(i);
		if (ch === 58) break;
		if (!IsSchemeChar(ch)) return false;
		i++;
	}
	if (value.charCodeAt(i) !== 58) return false;
	i++;
	if (value.charCodeAt(i) === 47 && value.charCodeAt(i + 1) === 47) {
		i += 2;
		const authorityStart = i;
		let atPos = -1;
		for (let j = i; j < length; j++) {
			const ch = value.charCodeAt(j);
			if (ch === 64) {
				atPos = j;
				break;
			}
			if (ch === 47 || ch === 63 || ch === 35) break;
		}
		if (atPos !== -1) {
			for (let j = authorityStart; j < atPos; j++) {
				const ch = value.charCodeAt(j);
				if (ch === 91 || ch === 93) return false;
				if (ch === 37) {
					if (j + 2 >= atPos || !IsHex(value.charCodeAt(j + 1)) || !IsHex(value.charCodeAt(j + 2))) return false;
					j += 2;
				} else if (!IsUnreserved(ch) && !IsSubDelim(ch) && ch !== 58) return false;
			}
			i = atPos + 1;
		}
		if (value.charCodeAt(i) === 91) {
			i++;
			while (i < length && value.charCodeAt(i) !== 93) i++;
			if (value.charCodeAt(i) !== 93) return false;
			i++;
		} else while (i < length) {
			const ch = value.charCodeAt(i);
			if (ch === 47 || ch === 63 || ch === 35 || ch === 58) break;
			if (ch < 128 && !IsUnreserved(ch) && !IsSubDelim(ch)) return false;
			i++;
		}
		if (value.charCodeAt(i) === 58) {
			i++;
			while (i < length) {
				const ch = value.charCodeAt(i);
				if (ch === 47 || ch === 63 || ch === 35) break;
				if (ch < 48 || ch > 57) return false;
				i++;
			}
		}
	}
	while (i < length) {
		const ch = value.charCodeAt(i);
		if (ch === 37) {
			if (i + 2 >= length || !IsHex(value.charCodeAt(i + 1)) || !IsHex(value.charCodeAt(i + 2))) return false;
			i += 2;
		} else if (ch > 127) return false;
		else if (!(IsPchar(ch) || ch === 47 || ch === 63 || ch === 35)) return false;
		i++;
	}
	return true;
}
//#endregion
//#region node_modules/typebox/build/format/url.mjs
const Url = /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu;
/**
* Returns true if the value is a Url
* @specification
* @source ajv-formats
*/
function IsUrl(value) {
	return Url.test(value);
}
//#endregion
//#region node_modules/typebox/build/format/uuid.mjs
const Uuid = /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
/**
* Returns true if the value is a uuid
* @specification
* @source ajv-formats
*/
function IsUuid(value) {
	return Uuid.test(value);
}
//#endregion
//#region node_modules/typebox/build/format/_registry.mjs
const formats = /* @__PURE__ */ new Map();
/** Clears all entries */
function Clear() {
	formats.clear();
}
/** Tests a value against a format, if the format is not registered, true */
function Test(format, value) {
	return formats.get(format)?.(value) ?? true;
}
/** Resets all formats to defaults */
function Reset() {
	Clear();
	formats.set("date-time", IsDateTime);
	formats.set("date", IsDate);
	formats.set("duration", IsDuration);
	formats.set("email", IsEmail);
	formats.set("hostname", IsHostname);
	formats.set("idn-email", IsIdnEmail);
	formats.set("idn-hostname", IsIdnHostname);
	formats.set("ipv4", IsIPv4);
	formats.set("ipv6", IsIPv6);
	formats.set("iri-reference", IsIriReference);
	formats.set("iri", IsIri);
	formats.set("json-pointer-uri-fragment", IsJsonPointerUriFragment);
	formats.set("json-pointer", IsJsonPointer);
	formats.set("regex", IsRegex);
	formats.set("relative-json-pointer", IsRelativeJsonPointer);
	formats.set("time", IsTime);
	formats.set("uri-reference", IsUriReference);
	formats.set("uri-template", IsUriTemplate);
	formats.set("uri", IsUri);
	formats.set("url", IsUrl);
	formats.set("uuid", IsUuid);
}
Reset();
//#endregion
//#region node_modules/typebox/build/schema/engine/format.mjs
function CheckFormat(_stack, _context, schema, value) {
	return Test(schema.format, value);
}
function ErrorFormat(stack, context, schemaPath, instancePath, schema, value) {
	return CheckFormat(stack, context, schema, value) || context.AddError({
		keyword: "format",
		schemaPath,
		instancePath,
		params: { format: schema.format }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/if.mjs
function CheckIf(stack, context, schema, value) {
	const thenSchema = IsThen(schema) ? schema.then : true;
	const elseSchema = IsElse(schema) ? schema.else : true;
	return CheckSchema(stack, context, schema.if, value) ? CheckSchema(stack, context, thenSchema, value) : CheckSchema(stack, context, elseSchema, value);
}
function ErrorIf(stack, context, schemaPath, instancePath, schema, value) {
	const thenSchema = IsThen(schema) ? schema.then : true;
	const elseSchema = IsElse(schema) ? schema.else : true;
	const trueContext = new AccumulatedErrorContext();
	const isIf = ErrorSchema(stack, trueContext, `${schemaPath}/if`, instancePath, schema.if, value) ? ErrorSchema(stack, trueContext, `${schemaPath}/then`, instancePath, thenSchema, value) || context.AddError({
		keyword: "if",
		schemaPath,
		instancePath,
		params: { failingKeyword: "then" }
	}) : ErrorSchema(stack, context, `${schemaPath}/else`, instancePath, elseSchema, value) || context.AddError({
		keyword: "if",
		schemaPath,
		instancePath,
		params: { failingKeyword: "else" }
	});
	if (isIf) context.Merge([trueContext]);
	return isIf;
}
//#endregion
//#region node_modules/typebox/build/schema/engine/items.mjs
function CheckItemsSized(stack, context, schema, value) {
	return Every(schema.items, 0, (schema, index) => {
		return IsLessEqualThan(value.length, index) || CheckSchemaPushStack(stack, context, schema, value[index]) && context.AddIndex(index);
	});
}
function ErrorItemsSized(stack, context, schemaPath, instancePath, schema, value) {
	return EveryAll(schema.items, 0, (schema, index) => {
		const nextSchemaPath = `${schemaPath}/items/${index}`;
		const nextInstancePath = `${instancePath}/${index}`;
		return IsLessEqualThan(value.length, index) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema, value[index]) && context.AddIndex(index);
	});
}
function CheckItemsUnsized(stack, context, schema, value) {
	return Every(value, IsPrefixItems(schema) ? schema.prefixItems.length : 0, (element, index) => {
		return CheckSchemaPushStack(stack, context, schema.items, element) && context.AddIndex(index);
	});
}
function ErrorItemsUnsized(stack, context, schemaPath, instancePath, schema, value) {
	return EveryAll(value, IsPrefixItems(schema) ? schema.prefixItems.length : 0, (element, index) => {
		return ErrorSchemaPushStack(stack, context, `${schemaPath}/items`, `${instancePath}/${index}`, schema.items, element) && context.AddIndex(index);
	});
}
function CheckItems(stack, context, schema, value) {
	return IsItemsSized(schema) ? CheckItemsSized(stack, context, schema, value) : CheckItemsUnsized(stack, context, schema, value);
}
function ErrorItems(stack, context, schemaPath, instancePath, schema, value) {
	return IsItemsSized(schema) ? ErrorItemsSized(stack, context, schemaPath, instancePath, schema, value) : ErrorItemsUnsized(stack, context, schemaPath, instancePath, schema, value);
}
//#endregion
//#region node_modules/typebox/build/schema/engine/maxContains.mjs
function IsValid$2(schema) {
	return IsContains(schema);
}
function CheckMaxContains(stack, context, schema, value) {
	if (!IsValid$2(schema)) return true;
	return IsLessEqualThan(value.reduce((result, item) => CheckSchema(stack, context, schema.contains, item) ? ++result : result, 0), schema.maxContains);
}
function ErrorMaxContains(stack, context, schemaPath, instancePath, schema, value) {
	const minContains = IsMinContains(schema) ? schema.minContains : 1;
	return CheckMaxContains(stack, context, schema, value) || context.AddError({
		keyword: "contains",
		schemaPath,
		instancePath,
		params: {
			minContains,
			maxContains: schema.maxContains
		}
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/maximum.mjs
function CheckMaximum(_stack, _context, schema, value) {
	return IsLessEqualThan(value, schema.maximum);
}
function ErrorMaximum(stack, context, schemaPath, instancePath, schema, value) {
	return CheckMaximum(stack, context, schema, value) || context.AddError({
		keyword: "maximum",
		schemaPath,
		instancePath,
		params: {
			comparison: "<=",
			limit: schema.maximum
		}
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/maxItems.mjs
function CheckMaxItems(_stack, _context, schema, value) {
	return IsLessEqualThan(value.length, schema.maxItems);
}
function ErrorMaxItems(stack, context, schemaPath, instancePath, schema, value) {
	return CheckMaxItems(stack, context, schema, value) || context.AddError({
		keyword: "maxItems",
		schemaPath,
		instancePath,
		params: { limit: schema.maxItems }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/maxLength.mjs
function CheckMaxLength(_stack, _context, schema, value) {
	return IsMaxLength$1(value, schema.maxLength);
}
function ErrorMaxLength(stack, context, schemaPath, instancePath, schema, value) {
	return CheckMaxLength(stack, context, schema, value) || context.AddError({
		keyword: "maxLength",
		schemaPath,
		instancePath,
		params: { limit: schema.maxLength }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/maxProperties.mjs
function CheckMaxProperties(_stack, _context, schema, value) {
	return IsLessEqualThan(Keys(value).length, schema.maxProperties);
}
function ErrorMaxProperties(stack, context, schemaPath, instancePath, schema, value) {
	return CheckMaxProperties(stack, context, schema, value) || context.AddError({
		keyword: "maxProperties",
		schemaPath,
		instancePath,
		params: { limit: schema.maxProperties }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/minContains.mjs
function IsValid$1(schema) {
	return IsContains(schema);
}
function CheckMinContains(stack, context, schema, value) {
	if (!IsValid$1(schema)) return true;
	return IsGreaterEqualThan(value.reduce((result, item) => CheckSchema(stack, context, schema.contains, item) ? ++result : result, 0), schema.minContains);
}
function ErrorMinContains(stack, context, schemaPath, instancePath, schema, value) {
	return CheckMinContains(stack, context, schema, value) || context.AddError({
		keyword: "contains",
		schemaPath,
		instancePath,
		params: { minContains: schema.minContains }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/minimum.mjs
function CheckMinimum(_stack, _context, schema, value) {
	return IsGreaterEqualThan(value, schema.minimum);
}
function ErrorMinimum(stack, context, schemaPath, instancePath, schema, value) {
	return CheckMinimum(stack, context, schema, value) || context.AddError({
		keyword: "minimum",
		schemaPath,
		instancePath,
		params: {
			comparison: ">=",
			limit: schema.minimum
		}
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/minItems.mjs
function CheckMinItems(_stack, _context, schema, value) {
	return IsGreaterEqualThan(value.length, schema.minItems);
}
function ErrorMinItems(stack, context, schemaPath, instancePath, schema, value) {
	return CheckMinItems(stack, context, schema, value) || context.AddError({
		keyword: "minItems",
		schemaPath,
		instancePath,
		params: { limit: schema.minItems }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/minLength.mjs
function CheckMinLength(_stack, _context, schema, value) {
	return IsMinLength$1(value, schema.minLength);
}
function ErrorMinLength(stack, context, schemaPath, instancePath, schema, value) {
	return CheckMinLength(stack, context, schema, value) || context.AddError({
		keyword: "minLength",
		schemaPath,
		instancePath,
		params: { limit: schema.minLength }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/minProperties.mjs
function CheckMinProperties(_stack, _context, schema, value) {
	return IsGreaterEqualThan(Keys(value).length, schema.minProperties);
}
function ErrorMinProperties(stack, context, schemaPath, instancePath, schema, value) {
	return CheckMinProperties(stack, context, schema, value) || context.AddError({
		keyword: "minProperties",
		schemaPath,
		instancePath,
		params: { limit: schema.minProperties }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/multipleOf.mjs
function CheckMultipleOf(_stack, _context, schema, value) {
	return IsMultipleOf$1(value, schema.multipleOf);
}
function ErrorMultipleOf(stack, context, schemaPath, instancePath, schema, value) {
	return CheckMultipleOf(stack, context, schema, value) || context.AddError({
		keyword: "multipleOf",
		schemaPath,
		instancePath,
		params: { multipleOf: schema.multipleOf }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/not.mjs
function CheckNot(stack, context, schema, value) {
	const nextContext = new CheckContext();
	return !CheckSchema(stack, nextContext, schema.not, value) && context.Merge([nextContext]);
}
function ErrorNot(stack, context, schemaPath, instancePath, schema, value) {
	return CheckNot(stack, context, schema, value) || context.AddError({
		keyword: "not",
		schemaPath,
		instancePath,
		params: {}
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/oneOf.mjs
function CheckOneOf(stack, context, schema, value) {
	const passedContexts = schema.oneOf.reduce((result, schema) => {
		const nextContext = new CheckContext();
		return CheckSchema(stack, nextContext, schema, value) ? [...result, nextContext] : result;
	}, []);
	return IsEqual(passedContexts.length, 1) && context.Merge(passedContexts);
}
function ErrorOneOf(stack, context, schemaPath, instancePath, schema, value) {
	const failedContexts = [];
	const passingSchemas = [];
	const passedContexts = schema.oneOf.reduce((result, schema, index) => {
		const nextContext = new AccumulatedErrorContext();
		const isSchema = ErrorSchema(stack, nextContext, `${schemaPath}/oneOf/${index}`, instancePath, schema, value);
		if (isSchema) passingSchemas.push(index);
		if (!isSchema) failedContexts.push(nextContext);
		return isSchema ? [...result, nextContext] : result;
	}, []);
	const isOneOf = IsEqual(passedContexts.length, 1) && context.Merge(passedContexts);
	if (!isOneOf && IsEqual(passingSchemas.length, 0)) failedContexts.forEach((failed) => failed.GetErrors().forEach((error) => context.AddError(error)));
	return isOneOf || context.AddError({
		keyword: "oneOf",
		schemaPath,
		instancePath,
		params: { passingSchemas }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/pattern.mjs
function CheckPattern(_stack, _context, schema, value) {
	return (IsString(schema.pattern) ? new RegExp(schema.pattern, "u") : schema.pattern).test(value);
}
function ErrorPattern(stack, context, schemaPath, instancePath, schema, value) {
	return CheckPattern(stack, context, schema, value) || context.AddError({
		keyword: "pattern",
		schemaPath,
		instancePath,
		params: { pattern: schema.pattern }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/patternProperties.mjs
function CheckPatternProperties(stack, context, schema, value) {
	return Every(Entries(schema.patternProperties), 0, ([pattern, schema]) => {
		const regexp = new RegExp(pattern, "u");
		return Every(Entries(value), 0, ([key, prop]) => {
			return !regexp.test(key) || CheckSchemaPushStack(stack, context, schema, prop) && context.AddKey(key);
		});
	});
}
function ErrorPatternProperties(stack, context, schemaPath, instancePath, schema, value) {
	return EveryAll(Entries(schema.patternProperties), 0, ([pattern, schema]) => {
		const nextSchemaPath = `${schemaPath}/patternProperties/${pattern}`;
		const regexp = new RegExp(pattern, "u");
		return EveryAll(Entries(value), 0, ([key, value]) => {
			const nextInstancePath = `${instancePath}/${key}`;
			return !regexp.test(key) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema, value) && context.AddKey(key);
		});
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/prefixItems.mjs
function CheckPrefixItems(stack, context, schema, value) {
	return IsEqual(value.length, 0) || Every(schema.prefixItems, 0, (schema, index) => {
		return IsLessEqualThan(value.length, index) || CheckSchemaPushStack(stack, context, schema, value[index]) && context.AddIndex(index);
	});
}
function ErrorPrefixItems(stack, context, schemaPath, instancePath, schema, value) {
	return IsEqual(value.length, 0) || EveryAll(schema.prefixItems, 0, (schema, index) => {
		const nextSchemaPath = `${schemaPath}/prefixItems/${index}`;
		const nextInstancePath = `${instancePath}/${index}`;
		return IsLessEqualThan(value.length, index) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema, value[index]) && context.AddIndex(index);
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/_exact_optional.mjs
function IsExactOptional(required, key) {
	return required.includes(key) || Get$2().exactOptionalPropertyTypes;
}
function InexactOptionalCheck(value, key) {
	return IsUndefined(value[key]);
}
//#endregion
//#region node_modules/typebox/build/schema/engine/properties.mjs
function CheckProperties(stack, context, schema, value) {
	const required = IsRequired(schema) ? schema.required : [];
	return Every(Entries(schema.properties), 0, ([key, schema]) => {
		const isProperty = !HasPropertyKey(value, key) || CheckSchemaPushStack(stack, context, schema, value[key]) && context.AddKey(key);
		return IsExactOptional(required, key) ? isProperty : InexactOptionalCheck(value, key) || isProperty;
	});
}
function ErrorProperties(stack, context, schemaPath, instancePath, schema, value) {
	const required = IsRequired(schema) ? schema.required : [];
	return EveryAll(Entries(schema.properties), 0, ([key, schema]) => {
		const nextSchemaPath = `${schemaPath}/properties/${key}`;
		const nextInstancePath = `${instancePath}/${key}`;
		const isProperty = () => !HasPropertyKey(value, key) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema, value[key]) && context.AddKey(key);
		return IsExactOptional(required, key) ? isProperty() : InexactOptionalCheck(value, key) || isProperty();
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/propertyNames.mjs
function CheckPropertyNames(stack, context, schema, value) {
	return Every(Keys(value), 0, (key, _index) => CheckSchema(stack, context, schema.propertyNames, key));
}
function ErrorPropertyNames(stack, context, schemaPath, instancePath, schema, value) {
	const propertyNames = [];
	return EveryAll(Keys(value), 0, (key, _index) => {
		const nextInstancePath = `${instancePath}/${key}`;
		const nextSchemaPath = `${schemaPath}/propertyNames`;
		const isPropertyName = ErrorSchema(stack, new AccumulatedErrorContext(), nextSchemaPath, nextInstancePath, schema.propertyNames, key);
		if (!isPropertyName) propertyNames.push(key);
		return isPropertyName;
	}) || context.AddError({
		keyword: "propertyNames",
		schemaPath,
		instancePath,
		params: { propertyNames }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/recursiveRef.mjs
function CheckRecursiveRef(stack, context, schema, value) {
	const target = stack.RecursiveRef(schema) ?? false;
	return IsSchema(target) && CheckSchema(stack, context, target, value);
}
function ErrorRecursiveRef(stack, context, _schemaPath, instancePath, schema, value) {
	const target = stack.RecursiveRef(schema) ?? false;
	return IsSchema(target) && ErrorSchema(stack, context, "#", instancePath, target, value);
}
//#endregion
//#region node_modules/typebox/build/schema/engine/ref.mjs
function CheckRef(stack, context, schema, value) {
	const target = stack.Ref(schema) ?? false;
	const nextContext = new CheckContext();
	const result = IsSchema(target) && CheckSchema(stack, nextContext, target, value);
	if (result) context.Merge([nextContext]);
	return result;
}
function ErrorRef(stack, context, _schemaPath, instancePath, schema, value) {
	const target = stack.Ref(schema) ?? false;
	const nextContext = new AccumulatedErrorContext();
	const result = IsSchema(target) && ErrorSchema(stack, nextContext, "#", instancePath, target, value);
	if (result) context.Merge([nextContext]);
	if (!result) nextContext.GetErrors().forEach((error) => context.AddError(error));
	return result;
}
//#endregion
//#region node_modules/typebox/build/schema/engine/required.mjs
function CheckRequired(_stack, _context, schema, value) {
	return Every(schema.required, 0, (key) => HasPropertyKey(value, key));
}
function ErrorRequired(_stack, context, schemaPath, instancePath, schema, value) {
	const requiredProperties = [];
	return EveryAll(schema.required, 0, (key) => {
		const hasKey = HasPropertyKey(value, key);
		if (!hasKey) requiredProperties.push(key);
		return hasKey;
	}) || context.AddError({
		keyword: "required",
		schemaPath,
		instancePath,
		params: { requiredProperties }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/type.mjs
function CheckTypeName(_stack, _context, type, _schema, value) {
	return IsEqual(type, "object") ? IsObjectNotArray(value) : IsEqual(type, "array") ? IsArray(value) : IsEqual(type, "boolean") ? IsBoolean(value) : IsEqual(type, "integer") ? IsInteger(value) : IsEqual(type, "number") ? IsNumber(value) : IsEqual(type, "null") ? IsNull(value) : IsEqual(type, "string") ? IsString(value) : IsEqual(type, "asyncIterator") ? IsAsyncIterator(value) : IsEqual(type, "bigint") ? IsBigInt(value) : IsEqual(type, "constructor") ? IsConstructor(value) : IsEqual(type, "function") ? IsFunction(value) : IsEqual(type, "iterator") ? IsIterator(value) : IsEqual(type, "symbol") ? IsSymbol(value) : IsEqual(type, "undefined") ? IsUndefined(value) : IsEqual(type, "void") ? IsUndefined(value) : true;
}
function CheckTypeNames(stack, context, types, schema, value) {
	return types.some((type) => CheckTypeName(stack, context, type, schema, value));
}
function CheckType(stack, context, schema, value) {
	return IsArray(schema.type) ? CheckTypeNames(stack, context, schema.type, schema, value) : CheckTypeName(stack, context, schema.type, schema, value);
}
function ErrorType(stack, context, schemaPath, instancePath, schema, value) {
	return (IsArray(schema.type) ? CheckTypeNames(stack, context, schema.type, schema, value) : CheckTypeName(stack, context, schema.type, schema, value)) || context.AddError({
		keyword: "type",
		schemaPath,
		instancePath,
		params: { type: schema.type }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/unevaluatedItems.mjs
function CheckUnevaluatedItems(stack, context, schema, value) {
	const indices = context.GetIndices();
	return Every(value, 0, (item, index) => {
		return (indices.has(index) || CheckSchema(stack, context, schema.unevaluatedItems, item)) && context.AddIndex(index);
	});
}
function ErrorUnevaluatedItems(stack, context, schemaPath, instancePath, schema, value) {
	const indices = context.GetIndices();
	const unevaluatedItems = [];
	return EveryAll(value, 0, (item, index) => {
		const nextContext = new AccumulatedErrorContext();
		const isEvaluatedItem = (indices.has(index) || ErrorSchema(stack, nextContext, schemaPath, instancePath, schema.unevaluatedItems, item)) && context.AddIndex(index);
		if (!isEvaluatedItem) unevaluatedItems.push(index);
		return isEvaluatedItem;
	}) || context.AddError({
		keyword: "unevaluatedItems",
		schemaPath,
		instancePath,
		params: { unevaluatedItems }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/unevaluatedProperties.mjs
function CheckUnevaluatedProperties(stack, context, schema, value) {
	const keys = context.GetKeys();
	return Every(Entries(value), 0, ([key, prop]) => {
		return keys.has(key) || CheckSchema(stack, context, schema.unevaluatedProperties, prop) && context.AddKey(key);
	});
}
function ErrorUnevaluatedProperties(stack, context, schemaPath, instancePath, schema, value) {
	const keys = context.GetKeys();
	const unevaluatedProperties = [];
	return EveryAll(Entries(value), 0, ([key, prop]) => {
		const nextContext = new AccumulatedErrorContext();
		const isEvaluatedProperty = keys.has(key) || ErrorSchema(stack, nextContext, schemaPath, instancePath, schema.unevaluatedProperties, prop) && context.AddKey(key);
		if (!isEvaluatedProperty) unevaluatedProperties.push(key);
		return isEvaluatedProperty;
	}) || context.AddError({
		keyword: "unevaluatedProperties",
		schemaPath,
		instancePath,
		params: { unevaluatedProperties }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/uniqueItems.mjs
function IsValid(schema) {
	return !IsEqual(schema.uniqueItems, false);
}
function CheckUniqueItems(_stack, _context, schema, value) {
	if (!IsValid(schema)) return true;
	const set = new Set(value.map(Hash)).size;
	const isLength = value.length;
	return IsEqual(set, isLength);
}
function ErrorUniqueItems(_stack, context, schemaPath, instancePath, schema, value) {
	if (!IsValid(schema)) return true;
	const set = /* @__PURE__ */ new Set();
	const duplicateItems = value.reduce((result, value, index) => {
		const hash = Hash(value);
		if (set.has(hash)) return [...result, index];
		set.add(hash);
		return result;
	}, []);
	return IsEqual(duplicateItems.length, 0) || context.AddError({
		keyword: "uniqueItems",
		schemaPath,
		instancePath,
		params: { duplicateItems }
	});
}
//#endregion
//#region node_modules/typebox/build/schema/engine/schema.mjs
function CheckSchemaPushStack(stack, context, schema, value) {
	return context.Push() && CheckSchema(stack, context, schema, value) && context.Pop();
}
function CheckSchema(stack, context, schema, value) {
	stack.Push(schema);
	const result = IsBooleanSchema(schema) ? CheckBooleanSchema(stack, context, schema, value) : (!IsType(schema) || CheckType(stack, context, schema, value)) && (!(IsObject(value) && !IsArray(value)) || (!IsRequired(schema) || CheckRequired(stack, context, schema, value)) && (!IsAdditionalProperties(schema) || CheckAdditionalProperties(stack, context, schema, value)) && (!IsDependencies(schema) || CheckDependencies(stack, context, schema, value)) && (!IsDependentRequired(schema) || CheckDependentRequired(stack, context, schema, value)) && (!IsDependentSchemas(schema) || CheckDependentSchemas(stack, context, schema, value)) && (!IsPatternProperties(schema) || CheckPatternProperties(stack, context, schema, value)) && (!IsProperties(schema) || CheckProperties(stack, context, schema, value)) && (!IsPropertyNames(schema) || CheckPropertyNames(stack, context, schema, value)) && (!IsMinProperties(schema) || CheckMinProperties(stack, context, schema, value)) && (!IsMaxProperties(schema) || CheckMaxProperties(stack, context, schema, value))) && (!IsArray(value) || (!IsAdditionalItems(schema) || CheckAdditionalItems(stack, context, schema, value)) && (!IsContains(schema) || CheckContains(stack, context, schema, value)) && (!IsItems(schema) || CheckItems(stack, context, schema, value)) && (!IsMaxContains(schema) || CheckMaxContains(stack, context, schema, value)) && (!IsMaxItems(schema) || CheckMaxItems(stack, context, schema, value)) && (!IsMinContains(schema) || CheckMinContains(stack, context, schema, value)) && (!IsMinItems(schema) || CheckMinItems(stack, context, schema, value)) && (!IsPrefixItems(schema) || CheckPrefixItems(stack, context, schema, value)) && (!IsUniqueItems(schema) || CheckUniqueItems(stack, context, schema, value))) && (!IsString(value) || (!IsMaxLength(schema) || CheckMaxLength(stack, context, schema, value)) && (!IsMinLength(schema) || CheckMinLength(stack, context, schema, value)) && (!IsFormat(schema) || CheckFormat(stack, context, schema, value)) && (!IsPattern(schema) || CheckPattern(stack, context, schema, value))) && (!(IsNumber(value) || IsBigInt(value)) || (!IsExclusiveMaximum(schema) || CheckExclusiveMaximum(stack, context, schema, value)) && (!IsExclusiveMinimum(schema) || CheckExclusiveMinimum(stack, context, schema, value)) && (!IsMaximum(schema) || CheckMaximum(stack, context, schema, value)) && (!IsMinimum(schema) || CheckMinimum(stack, context, schema, value)) && (!IsMultipleOf(schema) || CheckMultipleOf(stack, context, schema, value))) && (!IsRef(schema) || CheckRef(stack, context, schema, value)) && (!IsRecursiveRef(schema) || CheckRecursiveRef(stack, context, schema, value)) && (!IsDynamicRef(schema) || CheckDynamicRef(stack, context, schema, value)) && (!IsGuard(schema) || CheckGuard(stack, context, schema, value)) && (!IsConst(schema) || CheckConst(stack, context, schema, value)) && (!IsEnum(schema) || CheckEnum(stack, context, schema, value)) && (!IsIf(schema) || CheckIf(stack, context, schema, value)) && (!IsNot(schema) || CheckNot(stack, context, schema, value)) && (!IsAllOf(schema) || CheckAllOf(stack, context, schema, value)) && (!IsAnyOf(schema) || CheckAnyOf(stack, context, schema, value)) && (!IsOneOf(schema) || CheckOneOf(stack, context, schema, value)) && (!IsUnevaluatedItems(schema) || !IsArray(value) || CheckUnevaluatedItems(stack, context, schema, value)) && (!IsUnevaluatedProperties(schema) || !IsObject(value) || CheckUnevaluatedProperties(stack, context, schema, value)) && (!IsRefine(schema) || CheckRefine(stack, context, schema, value));
	stack.Pop(schema);
	return result;
}
function ErrorSchemaPushStack(stack, context, schemaPath, instancePath, schema, value) {
	return context.Push() && ErrorSchema(stack, context, schemaPath, instancePath, schema, value) && context.Pop();
}
function ErrorSchema(stack, context, schemaPath, instancePath, schema, value) {
	stack.Push(schema);
	const result = IsBooleanSchema(schema) ? ErrorBooleanSchema(stack, context, schemaPath, instancePath, schema, value) : !!(+(!IsType(schema) || ErrorType(stack, context, schemaPath, instancePath, schema, value)) & +(!(IsObject(value) && !IsArray(value)) || !!(+(!IsRequired(schema) || ErrorRequired(stack, context, schemaPath, instancePath, schema, value)) & +(!IsAdditionalProperties(schema) || ErrorAdditionalProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDependencies(schema) || ErrorDependencies(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDependentRequired(schema) || ErrorDependentRequired(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDependentSchemas(schema) || ErrorDependentSchemas(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPatternProperties(schema) || ErrorPatternProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsProperties(schema) || ErrorProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPropertyNames(schema) || ErrorPropertyNames(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinProperties(schema) || ErrorMinProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaxProperties(schema) || ErrorMaxProperties(stack, context, schemaPath, instancePath, schema, value)))) & +(!IsArray(value) || !!(+(!IsAdditionalItems(schema) || ErrorAdditionalItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsContains(schema) || ErrorContains(stack, context, schemaPath, instancePath, schema, value)) & +(!IsItems(schema) || ErrorItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaxContains(schema) || ErrorMaxContains(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaxItems(schema) || ErrorMaxItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinContains(schema) || ErrorMinContains(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinItems(schema) || ErrorMinItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPrefixItems(schema) || ErrorPrefixItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsUniqueItems(schema) || ErrorUniqueItems(stack, context, schemaPath, instancePath, schema, value)))) & +(!IsString(value) || !!(+(!IsMaxLength(schema) || ErrorMaxLength(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinLength(schema) || ErrorMinLength(stack, context, schemaPath, instancePath, schema, value)) & +(!IsFormat(schema) || ErrorFormat(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPattern(schema) || ErrorPattern(stack, context, schemaPath, instancePath, schema, value)))) & +(!(IsNumber(value) || IsBigInt(value)) || !!(+(!IsExclusiveMaximum(schema) || ErrorExclusiveMaximum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsExclusiveMinimum(schema) || ErrorExclusiveMinimum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaximum(schema) || ErrorMaximum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinimum(schema) || ErrorMinimum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMultipleOf(schema) || ErrorMultipleOf(stack, context, schemaPath, instancePath, schema, value)))) & +(!IsRef(schema) || ErrorRef(stack, context, schemaPath, instancePath, schema, value)) & +(!IsRecursiveRef(schema) || ErrorRecursiveRef(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDynamicRef(schema) || ErrorDynamicRef(stack, context, schemaPath, instancePath, schema, value)) & +(!IsGuard(schema) || ErrorGuard(stack, context, schemaPath, instancePath, schema, value)) & +(!IsConst(schema) || ErrorConst(stack, context, schemaPath, instancePath, schema, value)) & +(!IsEnum(schema) || ErrorEnum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsIf(schema) || ErrorIf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsNot(schema) || ErrorNot(stack, context, schemaPath, instancePath, schema, value)) & +(!IsAllOf(schema) || ErrorAllOf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsAnyOf(schema) || ErrorAnyOf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsOneOf(schema) || ErrorOneOf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsUnevaluatedItems(schema) || !IsArray(value) || ErrorUnevaluatedItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsUnevaluatedProperties(schema) || !IsObject(value) || ErrorUnevaluatedProperties(stack, context, schemaPath, instancePath, schema, value))) && (!IsRefine(schema) || ErrorRefine(stack, context, schemaPath, instancePath, schema, value));
	stack.Pop(schema);
	return result;
}
//#endregion
//#region node_modules/typebox/build/schema/pointer/pointer.mjs
function GetIndex(index, value) {
	return IsObject(value) && !IsUnsafePropertyKey(index) ? value[index] : void 0;
}
function GetIndices(indices, value) {
	return indices.reduce((value, index) => GetIndex(index, value), value);
}
/** Returns an array of path indices for the given pointer */
function Indices(pointer) {
	if (IsEqual(pointer.length, 0)) return [];
	const indices = pointer.split("/").map((index) => index.replace(/~1/g, "/").replace(/~0/g, "~"));
	return indices.length > 0 && indices[0] === "" ? indices.slice(1) : indices;
}
/** Gets a value at the pointer, or undefined if not exists */
function Get(value, pointer) {
	return GetIndices(Indices(pointer), value);
}
//#endregion
//#region node_modules/typebox/build/schema/resolve/ref.mjs
function MatchId(schema, base, ref) {
	if (schema.$id === ref.hash) return schema;
	const absoluteId = new URL(schema.$id, base.href);
	const absoluteRef = new URL(ref.href, base.href);
	if (IsEqual(absoluteId.pathname, absoluteRef.pathname)) return ref.hash.startsWith("#") ? MatchHash(schema, base, ref) : schema;
}
function MatchAnchor(schema, base, ref) {
	const absoluteAnchor = new URL(`#${schema.$anchor}`, base.href);
	const absoluteRef = new URL(ref.href, base.href);
	return IsEqual(absoluteAnchor.href, absoluteRef.href) ? schema : void 0;
}
function MatchDynamicAnchor(schema, base, ref) {
	const absoluteAnchor = new URL(`#${schema.$dynamicAnchor}`, base.href);
	const absoluteRef = new URL(ref.href, base.href);
	return IsEqual(absoluteAnchor.href, absoluteRef.href) ? schema : void 0;
}
function MatchHash(schema, _base, ref) {
	if (ref.href.endsWith("#")) return schema;
	if (!ref.hash.startsWith("#")) return void 0;
	const fragment = decodeURIComponent(ref.hash.slice(1));
	if (!fragment.startsWith("/")) return void 0;
	return Get(schema, fragment);
}
function Match(schema, base, ref) {
	if (IsId(schema)) {
		const result = MatchId(schema, base, ref);
		if (!IsUndefined(result)) return result;
	}
	if (IsAnchor(schema)) {
		const result = MatchAnchor(schema, base, ref);
		if (!IsUndefined(result)) return result;
	}
	if (IsDynamicAnchor(schema)) {
		const result = MatchDynamicAnchor(schema, base, ref);
		if (!IsUndefined(result)) return result;
	}
	return MatchHash(schema, base, ref);
}
function FromArray$5(schema, base, ref) {
	return schema.reduce((result, item) => {
		const match = FromValue$1(item, base, ref);
		return !IsUndefined(match) ? match : result;
	}, void 0);
}
function FromObject$5(schema, base, ref) {
	return Keys(schema).reduce((result, key) => {
		const match = FromValue$1(schema[key], base, ref);
		return !IsUndefined(match) ? match : result;
	}, void 0);
}
function FromValue$1(schema, base, ref) {
	const nextBase = IsSchemaObject(schema) && IsId(schema) ? new URL(schema.$id, base.href) : base;
	if (IsSchemaObject(schema)) {
		const result = Match(schema, nextBase, ref);
		if (!IsUndefined(result)) return result;
	}
	if (IsArray(schema)) return FromArray$5(schema, nextBase, ref);
	if (IsObject(schema)) return FromObject$5(schema, nextBase, ref);
}
function Ref(schema, ref) {
	const defaultBase = new URL("http://unknown/");
	const initialBase = IsId(schema) ? new URL(schema.$id, defaultBase.href) : defaultBase;
	return FromValue$1(schema, initialBase, new URL(ref, initialBase.href));
}
function DynamicRef(root, base, dynamicRef, dynamicAnchors) {
	const fragmentTarget = dynamicRef.$dynamicRef.startsWith("#") ? Ref(base, dynamicRef.$dynamicRef) : Ref(root, dynamicRef.$dynamicRef);
	if (IsUndefined(fragmentTarget)) return void 0;
	if (!IsSchemaObject(fragmentTarget) || !IsDynamicAnchor(fragmentTarget)) return fragmentTarget;
	if (new URL(dynamicRef.$dynamicRef, "http://unknown/").hash.startsWith("#/")) return fragmentTarget;
	return dynamicAnchors.find((anchor) => anchor.$dynamicAnchor === fragmentTarget.$dynamicAnchor) ?? fragmentTarget;
}
//#endregion
//#region node_modules/typebox/build/schema/engine/_stack.mjs
var __classPrivateFieldGet = function(receiver, state, kind, f) {
	if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
	if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
	return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Stack_instances, _Stack_PushResourceAnchors, _Stack_PopResourceAnchors, _Stack_FromContext, _Stack_FromRef;
var Stack = class {
	constructor(context, schema) {
		_Stack_instances.add(this);
		this.context = context;
		this.schema = schema;
		this.ids = [];
		this.anchors = [];
		this.recursiveAnchors = [];
		this.dynamicAnchors = [];
	}
	BaseURL() {
		return this.ids.reduce((result, schema) => new URL(schema.$id, result), new URL("http://unknown"));
	}
	Base() {
		return this.ids[this.ids.length - 1] ?? this.schema;
	}
	Push(schema) {
		if (!IsSchemaObject(schema)) return;
		if (IsId(schema)) {
			this.ids.push(schema);
			__classPrivateFieldGet(this, _Stack_instances, "m", _Stack_PushResourceAnchors).call(this, schema);
		}
		if (IsAnchor(schema)) this.anchors.push(schema);
		if (IsRecursiveAnchorTrue(schema)) this.recursiveAnchors.push(schema);
		if (IsDynamicAnchor(schema)) this.dynamicAnchors.push(schema);
	}
	Pop(schema) {
		if (!IsSchemaObject(schema)) return;
		if (IsId(schema)) {
			this.ids.pop();
			__classPrivateFieldGet(this, _Stack_instances, "m", _Stack_PopResourceAnchors).call(this, schema);
		}
		if (IsAnchor(schema)) this.anchors.pop();
		if (IsRecursiveAnchorTrue(schema)) this.recursiveAnchors.pop();
		if (IsDynamicAnchor(schema)) this.dynamicAnchors.pop();
	}
	Ref(ref) {
		return __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_FromContext).call(this, ref) ?? __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_FromRef).call(this, ref);
	}
	RecursiveRef(recursiveRef) {
		return IsRecursiveAnchorTrue(this.Base()) ? Ref(this.recursiveAnchors[0], recursiveRef.$recursiveRef) : Ref(this.Base(), recursiveRef.$recursiveRef);
	}
	DynamicRef(dynamicRef) {
		const root = this.schema;
		return DynamicRef(root, this.Base(), dynamicRef, this.dynamicAnchors);
	}
};
_Stack_instances = /* @__PURE__ */ new WeakSet(), _Stack_PushResourceAnchors = function _Stack_PushResourceAnchors(schema, isRoot = true) {
	if (!IsSchemaObject(schema)) return;
	const current = schema;
	if (!isRoot && IsId(current)) return;
	if (!isRoot && IsDynamicAnchor(current)) this.dynamicAnchors.push(current);
	for (const key of Keys(current)) __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_PushResourceAnchors).call(this, current[key], false);
}, _Stack_PopResourceAnchors = function _Stack_PopResourceAnchors(schema, isRoot = true) {
	if (!IsSchemaObject(schema)) return;
	const current = schema;
	if (!isRoot && IsId(current)) return;
	if (!isRoot && IsDynamicAnchor(current)) this.dynamicAnchors.pop();
	for (const key of Keys(current)) __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_PopResourceAnchors).call(this, current[key], false);
}, _Stack_FromContext = function _Stack_FromContext(ref) {
	return HasPropertyKey(this.context, ref.$ref) ? this.context[ref.$ref] : void 0;
}, _Stack_FromRef = function _Stack_FromRef(ref) {
	const root = this.schema;
	return !ref.$ref.startsWith("#") ? Ref(root, ref.$ref) : Ref(this.Base(), ref.$ref);
};
//#endregion
//#region node_modules/typebox/build/schema/errors.mjs
/** Checks a value and returns validation errors */
function Errors$1(...args) {
	const [context, schema, value] = Match$1(args, {
		3: (context, schema, value) => [
			context,
			schema,
			value
		],
		2: (schema, value) => [
			{},
			schema,
			value
		]
	});
	const settings = Get$2();
	const locale = Get$1();
	const errors = [];
	return [ErrorSchema(new Stack(context, schema), new ErrorContext((error) => {
		if (IsGreaterEqualThan(errors.length, settings.maxErrors)) return;
		return errors.push({
			...error,
			message: locale(error)
		});
	}), "#", "", schema, value), errors];
}
//#endregion
//#region node_modules/typebox/build/schema/check.mjs
/** Checks a value against the provided schema */
function Check$1(...args) {
	const [context, schema, value] = Match$1(args, {
		3: (context, schema, value) => [
			context,
			schema,
			value
		],
		2: (schema, value) => [
			{},
			schema,
			value
		]
	});
	return CheckSchema(new Stack(context, schema), new CheckContext(), schema, value);
}
//#endregion
//#region node_modules/typebox/build/value/check/check.mjs
/** Checks a value matches the provided type. */
function Check(...args) {
	const [context, type, value] = Match$1(args, {
		3: (context, type, value) => [
			context,
			type,
			value
		],
		2: (type, value) => [
			{},
			type,
			value
		]
	});
	return Check$1(context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/errors/errors.mjs
/**
* Performs an exhaustive Check on the specified value and reports any errors found.
* If no errors are found, an empty array is returned. Unlike Check, this function
* does not terminate at the first occurance of an error. For best performance, call
* Check first and call Errors only if Check returns false.
*/
function Errors(...args) {
	const [context, type, value] = Match$1(args, {
		3: (context, type, value) => [
			context,
			type,
			value
		],
		2: (type, value) => [
			{},
			type,
			value
		]
	});
	const [_, errors] = Errors$1(context, type, value);
	return errors;
}
//#endregion
//#region node_modules/typebox/build/value/assert/assert.mjs
var AssertError = class extends Error {
	constructor(source, value, errors) {
		super(source);
		Object.defineProperty(this, "cause", {
			value: {
				source,
				errors,
				value
			},
			writable: false,
			configurable: false,
			enumerable: false
		});
	}
};
//#endregion
//#region node_modules/typebox/build/value/clean/from_array.mjs
function FromArray$4(context, type, value) {
	if (!IsArray(value)) return value;
	return value.map((value) => FromType$3(context, type.items, value));
}
//#endregion
//#region node_modules/typebox/build/value/clean/from_base.mjs
function FromBase$2(_context, type, value) {
	return type.Clean(value);
}
//#endregion
//#region node_modules/typebox/build/value/clean/from_cyclic.mjs
function FromCyclic$3(context, type, value) {
	return FromType$3({
		...context,
		...type.$defs
	}, Ref$1(type.$ref), value);
}
//#endregion
//#region node_modules/typebox/build/value/clean/from_intersect.mjs
function EvaluateIntersection(context, type) {
	const additionalProperties = HasPropertyKey(type, "unevaluatedProperties") ? { additionalProperties: type.unevaluatedProperties } : {};
	const evaluated = Evaluate(Instantiate(context, type));
	return IsObject$1(evaluated) ? Options(evaluated, additionalProperties) : evaluated;
}
function FromIntersect$3(context, type, value) {
	return FromType$3(context, EvaluateIntersection(context, type), value);
}
//#endregion
//#region node_modules/typebox/build/value/clean/additional.mjs
function GetAdditionalProperties(type) {
	return HasPropertyKey(type, "additionalProperties") ? type.additionalProperties : void 0;
}
//#endregion
//#region node_modules/typebox/build/value/clean/from_object.mjs
function FromObject$4(context, type, value) {
	if (!IsObject(value) || IsArray(value)) return value;
	const additionalProperties = GetAdditionalProperties(type);
	for (const key of Keys(value)) {
		if (HasPropertyKey(type.properties, key)) {
			value[key] = FromType$3(context, type.properties[key], value[key]);
			continue;
		}
		if (IsBoolean(additionalProperties) && IsEqual(additionalProperties, true) || IsSchema$1(additionalProperties) && Check(context, additionalProperties, value[key])) {
			value[key] = FromType$3(context, additionalProperties, value[key]);
			continue;
		}
		delete value[key];
	}
	return value;
}
//#endregion
//#region node_modules/typebox/build/value/clean/from_record.mjs
function FromRecord$3(context, type, value) {
	if (!IsObject(value)) return value;
	const additionalProperties = GetAdditionalProperties(type);
	const [recordPattern, recordValue] = [new RegExp(RecordPattern(type)), RecordValue(type)];
	for (const key of Keys(value)) {
		if (recordPattern.test(key)) {
			value[key] = FromType$3(context, recordValue, value[key]);
			continue;
		}
		if (IsBoolean(additionalProperties) && IsEqual(additionalProperties, true) || IsSchema$1(additionalProperties) && Check(context, additionalProperties, value[key])) {
			value[key] = FromType$3(context, additionalProperties, value[key]);
			continue;
		}
		delete value[key];
	}
	return value;
}
//#endregion
//#region node_modules/typebox/build/value/clean/from_ref.mjs
function FromRef$3(context, type, value) {
	return HasPropertyKey(context, type.$ref) ? FromType$3(context, context[type.$ref], value) : value;
}
//#endregion
//#region node_modules/typebox/build/value/clean/from_tuple.mjs
function FromTuple$3(context, schema, value) {
	if (!IsArray(value)) return value;
	const length = Math.min(value.length, schema.items.length);
	for (let index = 0; index < length; index++) value[index] = FromType$3(context, schema.items[index], value[index]);
	return IsGreaterThan(value.length, length) ? value.slice(0, length) : value;
}
//#endregion
//#region node_modules/typebox/build/value/clone/clone.mjs
function FromClassInstance(value) {
	return value;
}
function FromObjectInstance(value) {
	const result = {};
	for (const key of Keys(value)) {
		if (IsUnsafePropertyKey(key)) continue;
		result[key] = Clone(value[key]);
	}
	for (const key of Symbols(value)) result[key] = Clone(value[key]);
	return result;
}
function FromObject$3(value) {
	return IsClassInstance(value) ? FromClassInstance(value) : FromObjectInstance(value);
}
function FromArray$3(value) {
	return value.map((element) => Clone(element));
}
function FromTypedArray(value) {
	return value.slice();
}
function FromMap(value) {
	return new Map(Clone([...value.entries()]));
}
function FromSet(value) {
	return new Set(Clone([...value.values()]));
}
function FromValue(value) {
	return value;
}
/**
* Returns a Clone of the given value. This function is similar to structuredClone()
* but also supports deep cloning instances of Map, Set and TypeArray.
*/
function Clone(value) {
	return IsTypeArray(value) ? FromTypedArray(value) : IsMap(value) ? FromMap(value) : IsSet(value) ? FromSet(value) : IsArray(value) ? FromArray$3(value) : IsObject(value) ? FromObject$3(value) : FromValue(value);
}
//#endregion
//#region node_modules/typebox/build/value/shared/union_priority_sort.mjs
function DeterministicCompare(left, right) {
	return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
/** Deterministically sorts schemas by structural relationship (narrow to broad) */
function UnionPrioritySort(types, order = 1) {
	return types.sort((left, right) => {
		const result = Compare(left, right);
		return (IsEqual(result, "disjoint") ? DeterministicCompare(left, right) : IsEqual(result, "right-inside") ? 1 : IsEqual(result, "left-inside") ? -1 : DeterministicCompare(left, right)) * order;
	});
}
//#endregion
//#region node_modules/typebox/build/value/clean/from_union.mjs
function FromUnion$3(context, type, value) {
	for (const schema of UnionPrioritySort(type.anyOf)) {
		const clean = FromType$3(context, schema, Clone(value));
		if (Check(context, schema, clean)) return clean;
	}
	return value;
}
//#endregion
//#region node_modules/typebox/build/value/clean/from_type.mjs
function FromType$3(context, type, value) {
	return IsArray$1(type) ? FromArray$4(context, type, value) : IsBase(type) ? FromBase$2(context, type, value) : IsCyclic(type) ? FromCyclic$3(context, type, value) : IsIntersect(type) ? FromIntersect$3(context, type, value) : IsObject$1(type) ? FromObject$4(context, type, value) : IsRecord(type) ? FromRecord$3(context, type, value) : IsRef$1(type) ? FromRef$3(context, type, value) : IsTuple(type) ? FromTuple$3(context, type, value) : IsUnion(type) ? FromUnion$3(context, type, value) : value;
}
//#endregion
//#region node_modules/typebox/build/value/clean/clean.mjs
/**
* Cleans a value by removing non-evaluated properties and elements as derived from the provided type.
* This function returns unknown so callers should Check the return value before use. This function
* mutates the provided value. If mutation is not wanted, you should Clone the value before passing
* to this function.
*/
function Clean(...args) {
	const [context, type, value] = Match$1(args, {
		3: (context, type, value) => [
			context,
			type,
			value
		],
		2: (type, value) => [
			{},
			type,
			value
		]
	});
	return FromType$3(context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/convert/try/try_result.mjs
function IsOk(value) {
	return IsObject(value) && HasPropertyKey(value, "value");
}
function Ok(value) {
	return { value };
}
function Fail() {}
//#endregion
//#region node_modules/typebox/build/value/convert/try/try_array.mjs
function TryArray(value) {
	return IsArray(value) ? Ok(value) : Ok([value]);
}
//#endregion
//#region node_modules/typebox/build/value/convert/try/try_bigint.mjs
function FromBoolean$4(value) {
	return IsEqual(value, true) ? Ok(BigInt(1)) : Ok(BigInt(0));
}
const bigintPattern = /^-?(0|[1-9]\d*)n$/;
const decimalPattern = /^-?(0|[1-9]\d*)\.\d+$/;
const integerPattern = /^-?(0|[1-9]\d*)$/;
function IsStringBigIntLike(value) {
	return bigintPattern.test(value);
}
function IsStringDecimalLike(value) {
	return decimalPattern.test(value);
}
function IsStringIntegerLike(value) {
	return integerPattern.test(value);
}
function FromString$5(value) {
	const lowercase = value.toLowerCase();
	return IsStringBigIntLike(value) ? Ok(BigInt(value.slice(0, value.length - 1))) : IsStringDecimalLike(value) ? Ok(BigInt(value.split(".")[0])) : IsStringIntegerLike(value) ? Ok(BigInt(value)) : IsEqual(lowercase, "false") ? Ok(BigInt(0)) : IsEqual(lowercase, "true") ? Ok(BigInt(1)) : /* @__PURE__ */ Fail();
}
function TryBigInt(value) {
	return IsBigInt(value) ? Ok(value) : IsBoolean(value) ? FromBoolean$4(value) : IsNumber(value) ? Ok(BigInt(Math.trunc(value))) : IsNull(value) ? Ok(BigInt(0)) : IsString(value) ? FromString$5(value) : IsUndefined(value) ? Ok(BigInt(0)) : /* @__PURE__ */ Fail();
}
//#endregion
//#region node_modules/typebox/build/value/convert/try/try_boolean.mjs
function FromBigInt$4(value) {
	return IsEqual(value, BigInt(0)) ? Ok(false) : IsEqual(value, BigInt(1)) ? Ok(true) : /* @__PURE__ */ Fail();
}
function FromNumber$3(value) {
	return IsEqual(value, 0) ? Ok(false) : IsEqual(value, 1) ? Ok(true) : /* @__PURE__ */ Fail();
}
function FromString$4(value) {
	return IsEqual(value.toLowerCase(), "false") ? Ok(false) : IsEqual(value.toLowerCase(), "true") ? Ok(true) : IsEqual(value, "0") ? Ok(false) : IsEqual(value, "1") ? Ok(true) : /* @__PURE__ */ Fail();
}
function TryBoolean(value) {
	return IsBigInt(value) ? FromBigInt$4(value) : IsBoolean(value) ? Ok(value) : IsNumber(value) ? FromNumber$3(value) : IsNull(value) ? Ok(false) : IsString(value) ? FromString$4(value) : IsUndefined(value) ? Ok(false) : /* @__PURE__ */ Fail();
}
//#endregion
//#region node_modules/typebox/build/value/convert/try/try_null.mjs
function FromBigInt$3(value) {
	return IsEqual(value, BigInt(0)) ? Ok(null) : /* @__PURE__ */ Fail();
}
function FromBoolean$3(value) {
	return IsEqual(value, false) ? Ok(null) : /* @__PURE__ */ Fail();
}
function FromNumber$2(value) {
	return IsEqual(value, 0) ? Ok(null) : /* @__PURE__ */ Fail();
}
function FromString$3(value) {
	const lowercase = value.toLowerCase();
	return IsEqual(lowercase, "undefined") || IsEqual(lowercase, "null") || IsEqual(value, "") || IsEqual(value, "0") ? Ok(null) : /* @__PURE__ */ Fail();
}
function TryNull(value) {
	return IsBigInt(value) ? FromBigInt$3(value) : IsBoolean(value) ? FromBoolean$3(value) : IsNumber(value) ? FromNumber$2(value) : IsNull(value) ? Ok(null) : IsString(value) ? FromString$3(value) : IsUndefined(value) ? Ok(null) : /* @__PURE__ */ Fail();
}
//#endregion
//#region node_modules/typebox/build/value/convert/try/try_number.mjs
const maxBigInt = BigInt(Number.MAX_SAFE_INTEGER);
const minBigInt = BigInt(Number.MIN_SAFE_INTEGER);
function FromBigInt$2(value) {
	return value <= maxBigInt && value >= minBigInt ? Ok(Number(value)) : /* @__PURE__ */ Fail();
}
function FromBoolean$2(value) {
	return Ok(value ? 1 : 0);
}
function FromString$2(value) {
	const coerced = +value;
	if (IsNumber(coerced)) return Ok(coerced);
	const lowercase = value.toLowerCase();
	if (IsEqual(lowercase, "false")) return Ok(0);
	if (IsEqual(lowercase, "true")) return Ok(1);
	const result = TryBigInt(value);
	if (IsOk(result)) return result.value <= maxBigInt && result.value >= minBigInt ? Ok(Number(result.value)) : /* @__PURE__ */ Fail();
	return /* @__PURE__ */ Fail();
}
function TryNumber(value) {
	return IsBigInt(value) ? FromBigInt$2(value) : IsBoolean(value) ? FromBoolean$2(value) : IsNumber(value) ? Ok(value) : IsNull(value) ? Ok(0) : IsString(value) ? FromString$2(value) : IsUndefined(value) ? Ok(0) : /* @__PURE__ */ Fail();
}
//#endregion
//#region node_modules/typebox/build/value/convert/try/try_string.mjs
function TryString(value) {
	return IsBigInt(value) ? Ok(value.toString()) : IsBoolean(value) ? Ok(value.toString()) : IsNumber(value) ? Ok(value.toString()) : IsNull(value) ? Ok("null") : IsString(value) ? Ok(value) : IsUndefined(value) ? Ok("") : /* @__PURE__ */ Fail();
}
//#endregion
//#region node_modules/typebox/build/value/convert/try/try_undefined.mjs
function FromBigInt$1(value) {
	return IsEqual(value, BigInt(0)) ? Ok(void 0) : /* @__PURE__ */ Fail();
}
function FromBoolean$1(value) {
	return IsEqual(value, false) ? Ok(void 0) : /* @__PURE__ */ Fail();
}
function FromNumber$1(value) {
	return IsEqual(value, 0) ? Ok(void 0) : /* @__PURE__ */ Fail();
}
function FromString$1(value) {
	const lowercase = value.toLowerCase();
	return IsEqual(lowercase, "undefined") || IsEqual(lowercase, "null") || IsEqual(value, "") || IsEqual(value, "0") ? Ok(void 0) : /* @__PURE__ */ Fail();
}
function TryUndefined(value) {
	return IsBigInt(value) ? FromBigInt$1(value) : IsBoolean(value) ? FromBoolean$1(value) : IsNumber(value) ? FromNumber$1(value) : IsNull(value) ? Ok(void 0) : IsString(value) ? FromString$1(value) : IsUndefined(value) ? Ok(value) : /* @__PURE__ */ Fail();
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_array.mjs
function FromArray$2(context, type, value) {
	return TryArray(value).value.map((value) => FromType$2(context, type.items, value));
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_base.mjs
function FromBase$1(_context, type, value) {
	return type.Convert(value);
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_bigint.mjs
function FromBigInt(_context, _type, value) {
	const result = TryBigInt(value);
	return IsOk(result) ? result.value : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_boolean.mjs
function FromBoolean(_context, _type, value) {
	const result = TryBoolean(value);
	return IsOk(result) ? result.value : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_cyclic.mjs
function FromCyclic$2(context, type, value) {
	return FromType$2({
		...context,
		...type.$defs
	}, Ref$1(type.$ref), value);
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_union.mjs
function FromUnion$2(context, type, value) {
	if (type.anyOf.some((type) => Check(context, type, value))) return value;
	const selected = type.anyOf.map((type) => FromType$2(context, type, Clone(value))).find((value) => Check(context, type, value));
	return IsUndefined(selected) ? value : selected;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_enum.mjs
function FromEnum(context, type, value) {
	return FromUnion$2(context, EnumToUnion(type), value);
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_integer.mjs
function FromInteger(_context, _type, value) {
	const result = TryNumber(value);
	return IsOk(result) ? Math.trunc(result.value) : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_intersect.mjs
function FromIntersect$2(context, type, value) {
	return FromType$2(context, Evaluate(Instantiate(context, type)), value);
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_literal.mjs
function FromLiteralBigInt(_context, type, value) {
	const result = TryBigInt(value);
	return IsOk(result) && IsEqual(type.const, result.value) ? result.value : value;
}
function FromLiteralBoolean(_context, type, value) {
	const result = TryBoolean(value);
	return IsOk(result) && IsEqual(type.const, result.value) ? result.value : value;
}
function FromLiteralNumber(_context, type, value) {
	const result = TryNumber(value);
	return IsOk(result) && IsEqual(type.const, result.value) ? result.value : value;
}
function FromLiteralString(_context, type, value) {
	const result = TryString(value);
	return IsOk(result) && IsEqual(type.const, result.value) ? result.value : value;
}
function FromLiteral(context, type, value) {
	if (IsEqual(type.const, value)) return value;
	return IsLiteralBigInt(type) ? FromLiteralBigInt(context, type, value) : IsLiteralBoolean(type) ? FromLiteralBoolean(context, type, value) : IsLiteralNumber(type) ? FromLiteralNumber(context, type, value) : IsLiteralString(type) ? FromLiteralString(context, type, value) : Unreachable();
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_null.mjs
function FromNull(_context, _type, value) {
	const result = TryNull(value);
	return IsOk(result) ? result.value : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_number.mjs
function FromNumber(_context, _type, value) {
	const result = TryNumber(value);
	return IsOk(result) ? result.value : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_additional.mjs
/**
* Used by Object and Record Types. The entries are derived from the known
* properties obtained from 'properties' and 'patternProperties' respectively.
*/
function FromAdditionalProperties(context, entries, additionalProperties, value) {
	const keys = Keys(value);
	for (const [regexp, _] of entries) for (const key of keys) if (!regexp.test(key)) value[key] = FromType$2(context, additionalProperties, value[key]);
	return value;
}
//#endregion
//#region node_modules/typebox/build/value/shared/optional_undefined.mjs
function IsOptionalUndefined(property, key, value) {
	return IsOptional(property) && IsUndefined(value[key]);
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_object.mjs
function FromProperties(context, type, value) {
	const entries = EntriesRegExp(type.properties);
	const keys = Keys(value);
	for (const [regexp, property] of entries) for (const key of keys) {
		if (!regexp.test(key) || IsOptionalUndefined(property, key, value)) continue;
		value[key] = FromType$2(context, property, value[key]);
	}
	return HasPropertyKey(type, "additionalProperties") && IsObject(type.additionalProperties) ? FromAdditionalProperties(context, entries, type.additionalProperties, value) : value;
}
function FromObject$2(context, type, value) {
	return IsObjectNotArray(value) ? FromProperties(context, type, value) : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_record.mjs
function FromPatternProperties(context, type, value) {
	const entries = EntriesRegExp(type.patternProperties);
	const keys = Keys(value);
	for (const [regexp, schema] of entries) for (const key of keys) if (regexp.test(key)) value[key] = FromType$2(context, schema, value[key]);
	return HasPropertyKey(type, "additionalProperties") && IsObject(type.additionalProperties) ? FromAdditionalProperties(context, entries, type.additionalProperties, value) : value;
}
function FromRecord$2(context, type, value) {
	return IsObjectNotArray(value) ? FromPatternProperties(context, type, value) : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_ref.mjs
function FromRef$2(context, type, value) {
	return HasPropertyKey(context, type.$ref) ? FromType$2(context, context[type.$ref], value) : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_string.mjs
function FromString(_context, _type, value) {
	const result = TryString(value);
	return IsOk(result) ? result.value : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_template_literal.mjs
function FromTemplateLiteral(context, type, value) {
	return FromType$2(context, TemplateLiteralDecode(type.pattern), value);
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_tuple.mjs
function FromTuple$2(context, type, value) {
	if (!IsArray(value)) return value;
	for (let index = 0; index < Math.min(type.items.length, value.length); index++) value[index] = FromType$2(context, type.items[index], value[index]);
	return value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_undefined.mjs
function FromUndefined(_context, _type, value) {
	const result = TryUndefined(value);
	return IsOk(result) ? result.value : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_void.mjs
function FromVoid(_context, _type, value) {
	return IsOk(TryUndefined(value)) ? void 0 : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/from_type.mjs
function FromType$2(context, type, value) {
	return IsArray$1(type) ? FromArray$2(context, type, value) : IsBase(type) ? FromBase$1(context, type, value) : IsBigInt$1(type) ? FromBigInt(context, type, value) : IsBoolean$1(type) ? FromBoolean(context, type, value) : IsCyclic(type) ? FromCyclic$2(context, type, value) : IsEnum$1(type) ? FromEnum(context, type, value) : IsInteger$1(type) ? FromInteger(context, type, value) : IsIntersect(type) ? FromIntersect$2(context, type, value) : IsLiteral(type) ? FromLiteral(context, type, value) : IsNull$1(type) ? FromNull(context, type, value) : IsNumber$1(type) ? FromNumber(context, type, value) : IsObject$1(type) ? FromObject$2(context, type, value) : IsRecord(type) ? FromRecord$2(context, type, value) : IsRef$1(type) ? FromRef$2(context, type, value) : IsString$1(type) ? FromString(context, type, value) : IsTemplateLiteral(type) ? FromTemplateLiteral(context, type, value) : IsTuple(type) ? FromTuple$2(context, type, value) : IsUndefined$1(type) ? FromUndefined(context, type, value) : IsUnion(type) ? FromUnion$2(context, type, value) : IsVoid(type) ? FromVoid(context, type, value) : value;
}
//#endregion
//#region node_modules/typebox/build/value/convert/convert.mjs
/**
* Converts a value to the given type, coercing interior values if a reasonable conversion is possible. This
* function returns unknown so callers should Check the return value before use. This function mutates the
* provided value. If mutation is not wanted, you should Clone the value before passing to this function.
*/
function Convert(...args) {
	const [context, type, value] = Match$1(args, {
		3: (context, type, value) => [
			context,
			type,
			value
		],
		2: (type, value) => [
			{},
			type,
			value
		]
	});
	return FromType$2(context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/default/from_array.mjs
function FromArray$1(context, type, value) {
	if (!IsArray(value)) return value;
	for (let i = 0; i < value.length; i++) value[i] = FromType$1(context, type.items, value[i]);
	return value;
}
//#endregion
//#region node_modules/typebox/build/value/default/from_base.mjs
function FromBase(context, type, value) {
	return type.Default(value);
}
//#endregion
//#region node_modules/typebox/build/value/default/from_cyclic.mjs
function FromCyclic$1(context, type, value) {
	return FromType$1({
		...context,
		...type.$defs
	}, Ref$1(type.$ref), value);
}
//#endregion
//#region node_modules/typebox/build/value/default/from_default.mjs
function FromDefault(type, value) {
	if (!IsUndefined(value)) return value;
	return IsFunction(type.default) ? type.default() : Clone(type.default);
}
//#endregion
//#region node_modules/typebox/build/value/default/from_intersect.mjs
function FromIntersect$1(context, type, value) {
	return FromType$1(context, Evaluate(Instantiate(context, type)), value);
}
//#endregion
//#region node_modules/typebox/build/value/default/from_object.mjs
function FromObject$1(context, type, value) {
	if (!IsObject(value)) return value;
	const knownPropertyKeys = Keys(type.properties);
	for (const key of knownPropertyKeys) {
		if (IsUndefined(FromType$1(context, type.properties[key], value[key])) && (IsOptional(type.properties[key]) || !HasPropertyKey(type.properties[key], "default"))) continue;
		value[key] = FromType$1(context, type.properties[key], value[key]);
	}
	if (!IsAdditionalProperties(type) || IsBoolean(type.additionalProperties)) return value;
	for (const key of Keys(value)) {
		if (knownPropertyKeys.includes(key)) continue;
		value[key] = FromType$1(context, type.additionalProperties, value[key]);
	}
	return value;
}
//#endregion
//#region node_modules/typebox/build/value/default/from_record.mjs
function FromRecord$1(context, type, value) {
	if (!IsObject(value)) return value;
	const [recordKey, recordValue] = [new RegExp(RecordPattern(type)), RecordValue(type)];
	for (const key of Keys(value)) {
		if (!(recordKey.test(key) && IsDefault(recordValue))) continue;
		value[key] = FromType$1(context, recordValue, value[key]);
	}
	if (!IsAdditionalProperties(type)) return value;
	for (const key of Keys(value)) {
		if (recordKey.test(key)) continue;
		value[key] = FromType$1(context, type.additionalProperties, value[key]);
	}
	return value;
}
//#endregion
//#region node_modules/typebox/build/value/default/from_ref.mjs
function FromRef$1(context, type, value) {
	return HasPropertyKey(context, type.$ref) ? FromType$1(context, context[type.$ref], value) : value;
}
//#endregion
//#region node_modules/typebox/build/value/default/from_tuple.mjs
function FromTuple$1(context, schema, value) {
	if (!IsArray(value)) return value;
	const [items, max] = [schema.items, Math.max(schema.items.length, value.length)];
	for (let i = 0; i < max; i++) if (i < items.length) value[i] = FromType$1(context, items[i], value[i]);
	return value;
}
//#endregion
//#region node_modules/typebox/build/value/default/from_union.mjs
function FromUnion$1(context, schema, value) {
	for (const inner of schema.anyOf) {
		const result = FromType$1(context, inner, Clone(value));
		if (Check(context, inner, result)) return result;
	}
	return value;
}
//#endregion
//#region node_modules/typebox/build/value/default/from_type.mjs
function FromType$1(context, type, value) {
	const defaulted = IsDefault(type) ? FromDefault(type, value) : value;
	return IsArray$1(type) ? FromArray$1(context, type, defaulted) : IsBase(type) ? FromBase(context, type, defaulted) : IsCyclic(type) ? FromCyclic$1(context, type, defaulted) : IsIntersect(type) ? FromIntersect$1(context, type, defaulted) : IsObject$1(type) ? FromObject$1(context, type, defaulted) : IsRecord(type) ? FromRecord$1(context, type, defaulted) : IsRef$1(type) ? FromRef$1(context, type, defaulted) : IsTuple(type) ? FromTuple$1(context, type, defaulted) : IsUnion(type) ? FromUnion$1(context, type, defaulted) : defaulted;
}
//#endregion
//#region node_modules/typebox/build/value/default/default.mjs
/**
* Patches missing properties on the value using default annotations specified on the provided type. This
* function returns unknown so callers should Check the return value before use. This function mutates the
* provided value. If mutation is not wanted, you should Clone the value before passing to this function.
*/
function Default(...args) {
	const [context, type, value] = Match$1(args, {
		3: (context, type, value) => [
			context,
			type,
			value
		],
		2: (type, value) => [
			{},
			type,
			value
		]
	});
	return FromType$1(context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/pipeline/pipeline.mjs
/** Creates a value processing pipeline. */
function Pipeline(pipeline) {
	return (...args) => {
		const [context, type, value] = Match$1(args, {
			3: (context, type, value) => [
				context,
				type,
				value
			],
			2: (type, value) => [
				{},
				type,
				value
			]
		});
		return pipeline.reduce((result, func) => func(context, type, result), value);
	};
}
//#endregion
//#region node_modules/typebox/build/value/codec/callback.mjs
function Decode$6(_context, type, value) {
	return type["~codec"].decode(value);
}
function Encode$6(_context, type, value) {
	return type["~codec"].encode(value);
}
function Callback(direction, context, type, value) {
	if (!IsCodec(type)) return value;
	return IsEqual(direction, "Decode") ? Decode$6(context, type, value) : Encode$6(context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/codec/from_array.mjs
function Decode$5(direction, context, type, value) {
	if (!IsArray(value)) return Unreachable();
	for (let i = 0; i < value.length; i++) value[i] = FromType(direction, context, type.items, value[i]);
	return Callback(direction, context, type, value);
}
function Encode$5(direction, context, type, value) {
	const exterior = Callback(direction, context, type, value);
	if (!IsArray(exterior)) return exterior;
	for (let i = 0; i < exterior.length; i++) exterior[i] = FromType(direction, context, type.items, exterior[i]);
	return exterior;
}
function FromArray(direction, context, type, value) {
	return IsEqual(direction, "Decode") ? Decode$5(direction, context, type, value) : Encode$5(direction, context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/codec/from_cyclic.mjs
function FromCyclic(direction, context, type, value) {
	value = FromType(direction, {
		...context,
		...type.$defs
	}, Ref$1(type.$ref), value);
	return Callback(direction, context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/codec/from_intersect.mjs
function MergeInteriors(interiors) {
	return interiors.reduce((results, interior) => ({
		...results,
		...interior
	}), {});
}
function NonMatchingInterior(value, interiors) {
	for (const interior of interiors) if (!IsDeepEqual(value, interior)) return interior;
	return value;
}
function Decode$4(direction, context, type, value) {
	if (IsEqual(type.allOf.length, 0)) return Callback(direction, context, type, value);
	const interiors = type.allOf.map((schema) => FromType(direction, context, schema, Clean(schema, Clone(value))));
	return Callback(direction, context, type, interiors.every((result) => IsObject(result)) ? MergeInteriors(interiors) : NonMatchingInterior(value, interiors));
}
function Encode$4(direction, context, type, value) {
	if (IsEqual(type.allOf.length, 0)) return Callback(direction, context, type, value);
	const exterior = Callback(direction, context, type, value);
	const interiors = type.allOf.map((schema) => FromType(direction, context, schema, Clean(schema, Clone(exterior))));
	if (interiors.every((result) => IsObject(result))) return MergeInteriors(interiors);
	return NonMatchingInterior(exterior, interiors);
}
function FromIntersect(direction, context, type, value) {
	return IsEqual(direction, "Decode") ? Decode$4(direction, context, type, value) : Encode$4(direction, context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/codec/from_object.mjs
function Decode$3(direction, context, type, value) {
	if (!IsObjectNotArray(value)) return Unreachable();
	for (const key of Keys(type.properties)) {
		if (!HasPropertyKey(value, key) || IsOptionalUndefined(type.properties[key], key, value)) continue;
		value[key] = FromType(direction, context, type.properties[key], value[key]);
	}
	return Callback(direction, context, type, value);
}
function Encode$3(direction, context, type, value) {
	const exterior = Callback(direction, context, type, value);
	if (!IsObjectNotArray(exterior)) return exterior;
	for (const key of Keys(type.properties)) {
		if (!HasPropertyKey(exterior, key) || IsOptionalUndefined(type.properties[key], key, exterior)) continue;
		exterior[key] = FromType(direction, context, type.properties[key], exterior[key]);
	}
	return exterior;
}
function FromObject(direction, context, type, value) {
	return IsEqual(direction, "Decode") ? Decode$3(direction, context, type, value) : Encode$3(direction, context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/codec/from_record.mjs
function Decode$2(direction, context, type, value) {
	if (!IsObjectNotArray(value)) return Unreachable();
	const regexp = new RegExp(RecordPattern(type));
	for (const key of Keys(value)) {
		if (!regexp.test(key)) Unreachable();
		value[key] = FromType(direction, context, RecordValue(type), value[key]);
	}
	return Callback(direction, context, type, value);
}
function Encode$2(direction, context, type, value) {
	const exterior = Callback(direction, context, type, value);
	if (!IsObjectNotArray(exterior)) return exterior;
	const regexp = new RegExp(RecordPattern(type));
	for (const key of Keys(exterior)) {
		if (!regexp.test(key)) continue;
		exterior[key] = FromType(direction, context, RecordValue(type), exterior[key]);
	}
	return exterior;
}
function FromRecord(direction, context, type, value) {
	return IsEqual(direction, "Decode") ? Decode$2(direction, context, type, value) : Encode$2(direction, context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/codec/from_ref.mjs
function ResolveRef(direction, context, type, value) {
	return HasPropertyKey(context, type.$ref) ? FromType(direction, context, context[type.$ref], value) : value;
}
function FromRef(direction, context, type, value) {
	return IsEqual(direction, "Decode") ? Callback(direction, context, type, ResolveRef(direction, context, type, value)) : ResolveRef(direction, context, type, Callback(direction, context, type, value));
}
//#endregion
//#region node_modules/typebox/build/value/codec/from_tuple.mjs
function Decode$1(direction, context, type, value) {
	if (!IsArray(value)) return Unreachable();
	for (let i = 0; i < Math.min(type.items.length, value.length); i++) value[i] = FromType(direction, context, type.items[i], value[i]);
	return Callback(direction, context, type, value);
}
function Encode$1(direction, context, type, value) {
	const exterior = Callback(direction, context, type, value);
	if (!IsArray(exterior)) return value;
	for (let i = 0; i < Math.min(type.items.length, exterior.length); i++) exterior[i] = FromType(direction, context, type.items[i], exterior[i]);
	return exterior;
}
function FromTuple(direction, context, type, value) {
	return IsEqual(direction, "Decode") ? Decode$1(direction, context, type, value) : Encode$1(direction, context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/codec/from_union.mjs
function Decode(direction, context, type, value) {
	for (const schema of UnionPrioritySort(type.anyOf, 1)) {
		if (!Check(context, schema, value)) continue;
		return Callback(direction, context, type, FromType(direction, context, schema, value));
	}
	return value;
}
function Encode(direction, context, type, value) {
	const exterior = Callback(direction, context, type, value);
	for (const schema of UnionPrioritySort(type.anyOf, -1)) {
		const variant = FromType(direction, context, schema, Clone(exterior));
		if (!Check(context, schema, variant)) continue;
		return variant;
	}
	return exterior;
}
function FromUnion(direction, context, type, value) {
	return IsEqual(direction, "Decode") ? Decode(direction, context, type, value) : Encode(direction, context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/codec/from_type.mjs
function FromType(direction, context, type, value) {
	return IsArray$1(type) ? FromArray(direction, context, type, value) : IsCyclic(type) ? FromCyclic(direction, context, type, value) : IsIntersect(type) ? FromIntersect(direction, context, type, value) : IsObject$1(type) ? FromObject(direction, context, type, value) : IsRecord(type) ? FromRecord(direction, context, type, value) : IsRef$1(type) ? FromRef(direction, context, type, value) : IsTuple(type) ? FromTuple(direction, context, type, value) : IsUnion(type) ? FromUnion(direction, context, type, value) : Callback(direction, context, type, value);
}
//#endregion
//#region node_modules/typebox/build/value/codec/decode.mjs
var DecodeError = class extends AssertError {
	constructor(value, errors) {
		super("Decode", value, errors);
	}
};
function Assert$2(context, type, value) {
	if (!Check(context, type, value)) throw new DecodeError(value, Errors(context, type, value));
	return value;
}
/** Executes Decode callbacks only */
function DecodeUnsafe(context, type, value) {
	return FromType("Decode", context, type, value);
}
Pipeline([
	(_context, _type, value) => Clone(value),
	(context, type, value) => Default(context, type, value),
	(context, type, value) => Convert(context, type, value),
	(context, type, value) => Clean(context, type, value),
	(context, type, value) => Assert$2(context, type, value),
	(context, type, value) => DecodeUnsafe(context, type, value)
]);
//#endregion
//#region node_modules/typebox/build/value/codec/encode.mjs
var EncodeError = class extends AssertError {
	constructor(value, errors) {
		super("Encode", value, errors);
	}
};
function Assert$1(context, type, value) {
	if (!Check(context, type, value)) throw new EncodeError(value, Errors(context, type, value));
	return value;
}
/** Executes Encode callbacks only */
function EncodeUnsafe(context, type, value) {
	return FromType("Encode", context, type, value);
}
Pipeline([
	(_context, _type, value) => Clone(value),
	(context, type, value) => EncodeUnsafe(context, type, value),
	(context, type, value) => Default(context, type, value),
	(context, type, value) => Convert(context, type, value),
	(context, type, value) => Clean(context, type, value),
	(context, type, value) => Assert$1(context, type, value)
]);
//#endregion
//#region node_modules/typebox/build/value/parse/parse.mjs
var ParseError = class extends AssertError {
	constructor(value, errors) {
		super("Parse", value, errors);
	}
};
function Assert(context, type, value) {
	if (!Check(context, type, value)) throw new ParseError(value, Errors(context, type, value));
	return value;
}
Pipeline([
	(_context, _type, value) => Clone(value),
	(context, type, value) => Default(context, type, value),
	(context, type, value) => Convert(context, type, value),
	(context, type, value) => Clean(context, type, value),
	(context, type, value) => Assert(context, type, value)
]);
Union([
	_Object_({
		type: Literal("insert"),
		path: String$1(),
		value: Unknown()
	}),
	Object({
		type: Literal("update"),
		path: String$1(),
		value: Unknown()
	}),
	_Object_({
		type: Literal("delete"),
		path: String$1()
	})
]);
//#endregion
//#region extensions/discord/src/internal/schemas.ts
const discordInteractionPayloadSchema = _Object_({
	id: String$1({ minLength: 1 }),
	token: String$1({ minLength: 1 }),
	type: Number$1()
}, { additionalProperties: true });
const discordRateLimitBodySchema = _Object_({
	message: Optional(String$1()),
	retry_after: Optional(Union([Number$1(), String$1()])),
	global: Optional(Boolean$1()),
	code: Optional(Union([Number$1(), String$1()]))
}, { additionalProperties: true });
function assertDiscordInteractionPayload(value) {
	if (!Check(discordInteractionPayloadSchema, value)) throw new Error("Invalid Discord interaction payload");
}
function isDiscordRateLimitBody(value) {
	return Check(discordRateLimitBodySchema, value);
}
//#endregion
//#region extensions/discord/src/internal/interactions.ts
function toCommandRawInteraction(rawData) {
	return rawData;
}
function toMessageComponentRawInteraction(rawData) {
	return rawData;
}
function toModalSubmitRawInteraction(rawData) {
	return rawData;
}
function readInteractionUser(rawData, client) {
	const directUser = "user" in rawData ? rawData.user : void 0;
	if (directUser && typeof directUser === "object" && "id" in directUser) return new User(client, directUser);
	const memberUser = rawData.member?.user;
	if (memberUser && typeof memberUser === "object" && typeof memberUser.id === "string") {
		const user = { ...memberUser };
		if (typeof user.username !== "string") user.username = "";
		return new User(client, user);
	}
	return null;
}
var BaseInteraction = class {
	constructor(client, rawData) {
		this.client = client;
		this.rawData = rawData;
		this.message = null;
		this.response = new InteractionResponseController();
		this.id = rawData.id;
		this.token = rawData.token;
		this.user = readInteractionUser(rawData, client);
		this.userId = this.user?.id ?? "";
		this.guild = rawData.guild_id ? new Guild(client, rawData.guild_id) : null;
		this.channel = "channel" in rawData && rawData.channel ? channelFactory(client, rawData.channel) : null;
	}
	get acknowledged() {
		return this.response.acknowledged;
	}
	get responseState() {
		return this.response.state;
	}
	set responseState(nextState) {
		this.response.state = nextState;
	}
	async callback(type, data) {
		this.response.recordCallback(type);
		return await createInteractionCallback(this.client.rest, this.id, this.token, data === void 0 ? { type } : {
			type,
			data
		});
	}
	async reply(payload) {
		const action = this.response.nextReplyAction();
		if (action === "edit") return await this.editReply(payload);
		if (action === "follow-up") return await this.followUp(payload);
		return await this.callback(InteractionResponseType.ChannelMessageWithSource, serializePayload(payload));
	}
	async defer(options) {
		return await this.callback(InteractionResponseType.DeferredChannelMessageWithSource, options?.ephemeral ? { flags: 64 } : void 0);
	}
	async acknowledge() {
		return await this.defer();
	}
	async editReply(payload) {
		const body = serializePayload(payload);
		const query = needsComponentsV2Query(body) ? { with_components: true } : void 0;
		const result = query ? await editWebhookMessage(this.client.rest, this.client.options.clientId, this.token, "@original", { body }, query) : await editWebhookMessage(this.client.rest, this.client.options.clientId, this.token, "@original", { body });
		this.response.recordReplyEdit();
		return result;
	}
	async deleteReply() {
		return await deleteWebhookMessage(this.client.rest, this.client.options.clientId, this.token, "@original");
	}
	async fetchReply() {
		return await getWebhookMessage(this.client.rest, this.client.options.clientId, this.token, "@original");
	}
	async followUp(payload) {
		const body = serializePayload(payload);
		return await createWebhookMessage(this.client.rest, this.client.options.clientId, this.token, { body }, needsComponentsV2Query(body) ? { with_components: true } : void 0);
	}
};
var CommandInteraction = class extends BaseInteraction {
	constructor(client, rawData) {
		super(client, rawData);
		this.options = new OptionsHandler(rawData.data.options, client, rawData.data.resolved?.channels);
	}
};
var AutocompleteInteraction = class extends CommandInteraction {
	async respond(choices) {
		return await this.callback(InteractionResponseType.ApplicationCommandAutocompleteResult, { choices });
	}
};
var BaseComponentInteraction = class extends BaseInteraction {
	constructor(client, rawData) {
		super(client, rawData);
		this.message = rawData.message && typeof rawData.message === "object" ? new Message(client, rawData.message) : null;
		this.values = Array.isArray(rawData.data.values) ? rawData.data.values.map(String) : [];
	}
	async update(payload) {
		return await this.callback(InteractionResponseType.UpdateMessage, serializePayload(payload));
	}
	async acknowledge() {
		return await this.callback(InteractionResponseType.DeferredMessageUpdate);
	}
	async showModal(modal) {
		return await this.callback(InteractionResponseType.Modal, modal.serialize());
	}
};
var ButtonInteraction = class extends BaseComponentInteraction {};
var StringSelectMenuInteraction = class extends BaseComponentInteraction {};
var UserSelectMenuInteraction = class extends BaseComponentInteraction {};
var RoleSelectMenuInteraction = class extends BaseComponentInteraction {};
var MentionableSelectMenuInteraction = class extends BaseComponentInteraction {};
var ChannelSelectMenuInteraction = class extends BaseComponentInteraction {};
var ModalInteraction = class extends BaseInteraction {
	constructor(client, rawData) {
		super(client, rawData);
		this.fields = new ModalFields(extractModalFields(rawData.data.components ?? []), rawData.data.resolved, client);
	}
	async acknowledge() {
		return await this.callback(InteractionResponseType.DeferredMessageUpdate);
	}
};
function createInteraction(client, rawData) {
	assertDiscordInteractionPayload(rawData);
	if (rawData.type === InteractionType.ApplicationCommandAutocomplete) return new AutocompleteInteraction(client, toCommandRawInteraction(rawData));
	if (rawData.type === InteractionType.ApplicationCommand) return new CommandInteraction(client, toCommandRawInteraction(rawData));
	if (rawData.type === InteractionType.ModalSubmit) return new ModalInteraction(client, toModalSubmitRawInteraction(rawData));
	if (rawData.type === InteractionType.MessageComponent) {
		const componentRawData = toMessageComponentRawInteraction(rawData);
		switch (rawData.data?.component_type) {
			case ComponentType.Button: return new ButtonInteraction(client, componentRawData);
			case ComponentType.StringSelect: return new StringSelectMenuInteraction(client, componentRawData);
			case ComponentType.UserSelect: return new UserSelectMenuInteraction(client, componentRawData);
			case ComponentType.RoleSelect: return new RoleSelectMenuInteraction(client, componentRawData);
			case ComponentType.MentionableSelect: return new MentionableSelectMenuInteraction(client, componentRawData);
			case ComponentType.ChannelSelect: return new ChannelSelectMenuInteraction(client, componentRawData);
			default: return new BaseComponentInteraction(client, componentRawData);
		}
	}
	return new BaseInteraction(client, rawData);
}
function parseComponentInteractionData(component, customId) {
	return component.customIdParser(customId).data;
}
//#endregion
//#region extensions/discord/src/internal/interaction-dispatch.ts
async function dispatchInteraction(client, rawData) {
	const interaction = createInteraction(client, rawData);
	if (rawData.type === InteractionType.ApplicationCommandAutocomplete) {
		const command = client.commands.find((entry) => entry.name === readInteractionName(rawData));
		if (!command) return;
		const autocompleteInteraction = interaction;
		const optionAutocomplete = resolveFocusedCommandOptionAutocompleteHandler(command, autocompleteInteraction);
		if (optionAutocomplete) {
			await optionAutocomplete(autocompleteInteraction);
			return;
		}
		if ("autocomplete" in command) await command.autocomplete(autocompleteInteraction);
		return;
	}
	if (rawData.type === InteractionType.ApplicationCommand) {
		const command = client.commands.find((entry) => entry.name === readInteractionName(rawData));
		if (command && "run" in command) {
			await deferCommandInteractionIfNeeded(command, interaction);
			await command.run(interaction);
		}
		return;
	}
	if (rawData.type === InteractionType.MessageComponent) {
		const customId = readCustomId(rawData);
		if (!customId) return;
		const component = client.componentHandler.resolve(customId, { componentType: rawData.data?.component_type });
		if (component) {
			const componentInteraction = interaction;
			await deferComponentInteractionIfNeeded(component, componentInteraction);
			await component.run(componentInteraction, parseComponentInteractionData(component, customId));
		}
		return;
	}
	if (rawData.type === InteractionType.ModalSubmit) {
		const customId = readCustomId(rawData);
		if (!customId) return;
		const modal = client.modalHandler.resolve(customId);
		if (modal) await modal.run(interaction, modal.customIdParser(customId).data);
	}
}
function resolveConditionalComponentOption(value, interaction) {
	return typeof value === "function" ? value(interaction) : value;
}
async function deferComponentInteractionIfNeeded(component, interaction) {
	if (!resolveConditionalComponentOption(component.defer, interaction)) return;
	if (resolveConditionalComponentOption(component.ephemeral, interaction)) {
		await interaction.defer({ ephemeral: true });
		return;
	}
	await interaction.acknowledge();
}
function readInteractionName(rawData) {
	return rawData.data?.name;
}
function readCustomId(rawData) {
	return rawData.data?.custom_id;
}
//#endregion
//#region extensions/discord/src/internal/rest-body.ts
function serializeRequestBody(data, headers) {
	if (data?.headers) for (const [key, value] of Object.entries(data.headers)) headers.set(key, value);
	if (data?.body == null) return;
	if (typeof data.body === "object") {
		const bodyObject = data.body;
		const topLevelFiles = Array.isArray(bodyObject.files) ? bodyObject.files : void 0;
		const nestedData = bodyObject.data && typeof bodyObject.data === "object" ? bodyObject.data : void 0;
		const nestedFiles = nestedData && Array.isArray(nestedData.files) ? nestedData.files : void 0;
		const files = topLevelFiles ?? nestedFiles;
		const filesContainer = topLevelFiles ? bodyObject : nestedFiles ? nestedData : void 0;
		if (files?.length && filesContainer) {
			if (data.multipartStyle === "form") {
				const formData = new FormData();
				for (const [key, value] of Object.entries(filesContainer)) {
					if (key === "files" || value === void 0 || value === null) continue;
					formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
				}
				for (const file of files) {
					const item = file;
					const name = typeof item.name === "string" && item.name ? item.name : "file";
					const blob = item.data instanceof Blob ? item.data : new Blob([item.data], { type: typeof item.contentType === "string" ? item.contentType : void 0 });
					formData.append(typeof item.fieldName === "string" && item.fieldName ? item.fieldName : "file", blob, name);
				}
				return formData;
			}
			const payloadJson = topLevelFiles ? { ...bodyObject } : {
				...bodyObject,
				data: { ...nestedData }
			};
			const payloadFilesContainer = topLevelFiles ? payloadJson : payloadJson.data ?? {};
			const formData = new FormData();
			const existingAttachments = Array.isArray(payloadFilesContainer.attachments) ? [...payloadFilesContainer.attachments] : [];
			const uploaded = files.map((file, index) => {
				const item = file;
				const name = typeof item.name === "string" && item.name ? item.name : `file-${index}`;
				const blob = item.data instanceof Blob ? item.data : new Blob([item.data], { type: typeof item.contentType === "string" ? item.contentType : void 0 });
				const id = existingAttachments.length + index;
				formData.append(`files[${id}]`, blob, name);
				const attachment = {
					id,
					filename: name
				};
				if (typeof item.description === "string") attachment.description = item.description;
				if (typeof item.duration_secs === "number") attachment.duration_secs = item.duration_secs;
				if (typeof item.waveform === "string") attachment.waveform = item.waveform;
				return attachment;
			});
			payloadFilesContainer.attachments = [...existingAttachments, ...uploaded];
			delete payloadFilesContainer.files;
			formData.append("payload_json", JSON.stringify(payloadJson));
			return formData;
		}
	}
	if (!data.rawBody) headers.set("Content-Type", "application/json");
	return data.rawBody ? data.body : JSON.stringify(data.body);
}
//#endregion
//#region extensions/discord/src/internal/rest-errors.ts
function readDiscordCode(body) {
	const value = body && typeof body === "object" && "code" in body ? body.code : void 0;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
}
function readDiscordMessage(body, fallback) {
	const value = body && typeof body === "object" && "message" in body ? body.message : void 0;
	return typeof value === "string" && value.trim() ? value : fallback;
}
function readRetryAfterHeader(value, now = Date.now()) {
	if (!value) return;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return seconds;
	const retryAt = Date.parse(value);
	return Number.isFinite(retryAt) ? (retryAt - now) / 1e3 : void 0;
}
function coerceRetryAfterSeconds(value) {
	if (typeof value !== "number" && typeof value !== "string") return;
	const seconds = typeof value === "number" ? value : Number(value);
	return Number.isFinite(seconds) && seconds >= 0 ? Math.max(0, seconds) : void 0;
}
function readRetryAfter(body, response, fallbackSeconds = 0) {
	return coerceRetryAfterSeconds(body && typeof body === "object" && "retry_after" in body ? body.retry_after : void 0) ?? coerceRetryAfterSeconds(readRetryAfterHeader(response.headers.get("Retry-After"))) ?? fallbackSeconds;
}
var DiscordError = class extends Error {
	constructor(response, body) {
		super(readDiscordMessage(body, `Discord API request failed (${response.status})`));
		this.name = "DiscordError";
		this.status = response.status;
		this.statusCode = response.status;
		this.rawBody = body;
		this.rawError = body;
		this.discordCode = readDiscordCode(body);
	}
};
var RateLimitError = class extends DiscordError {
	constructor(response, body) {
		super(response, body);
		this.name = "RateLimitError";
		this.retryAfter = readRetryAfter(body, response, 1);
		this.scope = body.global ? "global" : response.headers.get("X-RateLimit-Scope");
		this.bucket = response.headers.get("X-RateLimit-Bucket");
	}
};
//#endregion
//#region extensions/discord/src/internal/rest-routes.ts
function createRouteKey(method, path) {
	return `${method.toUpperCase()} ${path.split("?")[0] ?? path}`;
}
function readTopLevelRouteKey(path) {
	const [pathname = path] = path.split("?");
	const [first, id, token] = pathname.replace(/^\/+/, "").split("/");
	if (!first || !id) return pathname;
	if (first === "channels" || first === "guilds" || first === "webhooks") return first === "webhooks" && token ? `${first}/${id}/${token}` : `${first}/${id}`;
	return first;
}
function createBucketKey(bucket, path) {
	return `${bucket}:${readTopLevelRouteKey(path)}`;
}
function readHeaderNumber(headers, name) {
	const value = headers.get(name);
	if (!value) return;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : void 0;
}
function readResetAt(response) {
	const resetAfter = readHeaderNumber(response.headers, "X-RateLimit-Reset-After");
	if (resetAfter !== void 0) return Date.now() + Math.max(0, resetAfter * 1e3);
	const reset = readHeaderNumber(response.headers, "X-RateLimit-Reset");
	return reset !== void 0 ? reset * 1e3 : void 0;
}
function appendQuery(path, query) {
	if (!query || Object.keys(query).length === 0) return path;
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) search.set(key, String(value));
	return `${path}?${search.toString()}`;
}
//#endregion
//#region extensions/discord/src/internal/rest-scheduler.ts
const INVALID_REQUEST_WINDOW_MS = 10 * 6e4;
var RestScheduler = class {
	constructor(options, executor) {
		this.options = options;
		this.executor = executor;
		this.activeWorkers = 0;
		this.buckets = /* @__PURE__ */ new Map();
		this.globalRateLimitUntil = 0;
		this.invalidRequestTimestamps = [];
		this.queueGeneration = 0;
		this.queuedRequests = 0;
		this.routeBuckets = /* @__PURE__ */ new Map();
	}
	enqueue(params) {
		if (this.queuedRequests >= this.options.maxQueueSize) throw new Error("Discord request queue is full");
		const routeKey = createRouteKey(params.method, params.path);
		const bucket = this.getBucket(this.routeBuckets.get(routeKey) ?? routeKey);
		return new Promise((resolve, reject) => {
			this.queuedRequests += 1;
			bucket.pending.push({
				...params,
				generation: this.queueGeneration,
				routeKey,
				retryCount: 0,
				resolve,
				reject
			});
			this.drainQueues();
		});
	}
	recordResponse(routeKey, path, response, parsed) {
		this.updateRateLimitState(routeKey, path, response, parsed);
		this.recordInvalidRequest(routeKey, path, response);
	}
	clearQueue() {
		this.queueGeneration += 1;
		if (this.drainTimer) {
			clearTimeout(this.drainTimer);
			this.drainTimer = void 0;
		}
		this.rejectPending(/* @__PURE__ */ new Error("Discord request queue cleared"));
	}
	abortPending() {
		this.queueGeneration += 1;
		this.rejectPending(new DOMException("Aborted", "AbortError"));
	}
	get queueSize() {
		return this.queuedRequests;
	}
	getMetrics() {
		this.pruneInvalidRequests();
		return {
			globalRateLimitUntil: this.globalRateLimitUntil,
			activeBuckets: this.buckets.size,
			routeBucketMappings: this.routeBuckets.size,
			buckets: Array.from(this.buckets.entries()).map(([key, bucket]) => ({
				key,
				active: bucket.active,
				bucket: bucket.bucket,
				invalidRequests: bucket.invalidRequests,
				pending: bucket.pending.length,
				rateLimitHits: bucket.rateLimitHits,
				remaining: bucket.remaining,
				resetAt: bucket.resetAt,
				routeKeyCount: bucket.routeKeys.size
			})),
			invalidRequestCount: this.invalidRequestTimestamps.length,
			invalidRequestCountByStatus: this.invalidRequestTimestamps.reduce((counts, entry) => {
				counts[entry.status] = (counts[entry.status] ?? 0) + 1;
				return counts;
			}, {}),
			queueSize: this.queueSize,
			activeWorkers: this.activeWorkers,
			maxConcurrentWorkers: this.maxConcurrentWorkers
		};
	}
	get maxConcurrentWorkers() {
		return Math.max(1, Math.floor(this.options.maxConcurrency));
	}
	get maxRateLimitRetries() {
		return Math.max(0, Math.floor(this.options.maxRateLimitRetries));
	}
	getBucket(key) {
		const existing = this.buckets.get(key);
		if (existing) return existing;
		const bucket = {
			active: 0,
			invalidRequests: 0,
			pending: [],
			rateLimitHits: 0,
			resetAt: 0,
			routeKeys: new Set([key])
		};
		this.buckets.set(key, bucket);
		return bucket;
	}
	hasBucketReference(key) {
		for (const bucketKey of this.routeBuckets.values()) if (bucketKey === key) return true;
		return false;
	}
	isBucketRateLimited(bucket, now = Date.now()) {
		return bucket.remaining === 0 && bucket.resetAt > now;
	}
	pruneRouteMapping(routeKey) {
		const bucketKey = this.routeBuckets.get(routeKey);
		if (!bucketKey) return;
		this.routeBuckets.delete(routeKey);
		this.buckets.get(bucketKey)?.routeKeys.delete(routeKey);
	}
	pruneIdleRouteMappings(bucketKey, bucket, now = Date.now()) {
		if (bucket.active > 0 || bucket.pending.length > 0 || this.isBucketRateLimited(bucket, now)) return;
		for (const routeKey of Array.from(bucket.routeKeys)) if (this.routeBuckets.get(routeKey) === bucketKey) this.pruneRouteMapping(routeKey);
	}
	shouldPruneIdleBucket(key) {
		return this.routeBuckets.get(key) !== key && !this.hasBucketReference(key);
	}
	bindRouteToBucket(routeKey, bucketKey) {
		const target = this.getBucket(bucketKey);
		target.routeKeys.add(routeKey);
		this.routeBuckets.set(routeKey, bucketKey);
		const routeBucket = this.buckets.get(routeKey);
		if (routeBucket && routeBucket !== target) {
			target.pending.push(...routeBucket.pending);
			routeBucket.pending = [];
			if (routeBucket.active === 0) this.buckets.delete(routeKey);
		}
		return target;
	}
	updateRateLimitState(routeKey, path, response, parsed) {
		const bucketHeader = response.headers.get("X-RateLimit-Bucket");
		const bucket = bucketHeader ? this.bindRouteToBucket(routeKey, createBucketKey(bucketHeader, path)) : this.getBucket(this.routeBuckets.get(routeKey) ?? routeKey);
		bucket.bucket = bucketHeader ?? bucket.bucket;
		const limit = readHeaderNumber(response.headers, "X-RateLimit-Limit");
		if (limit !== void 0) bucket.limit = limit;
		const remaining = readHeaderNumber(response.headers, "X-RateLimit-Remaining");
		if (remaining !== void 0) bucket.remaining = remaining;
		const resetAt = readResetAt(response);
		if (resetAt !== void 0) bucket.resetAt = resetAt;
		if (response.status !== 429) return;
		bucket.rateLimitHits += 1;
		const retryAfterMs = Math.max(0, readRetryAfter(parsed, response, 1) * 1e3);
		const retryAt = Date.now() + retryAfterMs;
		if (response.headers.get("X-RateLimit-Global") === "true" || isGlobalRateLimit(parsed)) {
			this.globalRateLimitUntil = Math.max(this.globalRateLimitUntil, retryAt);
			return;
		}
		bucket.remaining = 0;
		bucket.resetAt = Math.max(bucket.resetAt, retryAt);
	}
	recordInvalidRequest(routeKey, path, response) {
		if (response.status !== 401 && response.status !== 403 && response.status !== 429) return;
		if (response.status === 429 && response.headers.get("X-RateLimit-Scope") === "shared") return;
		const now = Date.now();
		this.invalidRequestTimestamps.push({
			at: now,
			status: response.status
		});
		this.pruneInvalidRequests(now);
		const bucketHeader = response.headers.get("X-RateLimit-Bucket");
		const bucketKey = bucketHeader ? createBucketKey(bucketHeader, path) : this.routeBuckets.get(routeKey) ?? routeKey;
		const bucket = this.buckets.get(bucketKey);
		if (bucket) bucket.invalidRequests += 1;
	}
	pruneInvalidRequests(now = Date.now()) {
		const cutoff = now - INVALID_REQUEST_WINDOW_MS;
		while (this.invalidRequestTimestamps.length > 0 && (this.invalidRequestTimestamps[0]?.at ?? 0) <= cutoff) this.invalidRequestTimestamps.shift();
	}
	getBucketWaitMs(bucket, now) {
		if (bucket.remaining === 0 && bucket.resetAt > now) return bucket.resetAt - now;
		if (bucket.remaining === 0 && bucket.resetAt <= now) bucket.remaining = bucket.limit;
		return 0;
	}
	scheduleDrain(delayMs = 0) {
		if (this.drainTimer) return;
		this.drainTimer = setTimeout(() => {
			this.drainTimer = void 0;
			this.drainQueues();
		}, Math.max(0, delayMs));
		this.drainTimer.unref?.();
	}
	drainQueues() {
		const now = Date.now();
		if (this.globalRateLimitUntil > now) {
			this.scheduleDrain(this.globalRateLimitUntil - now);
			return;
		}
		let nextDelayMs = Number.POSITIVE_INFINITY;
		for (const [key, bucket] of this.buckets) {
			if (this.activeWorkers >= this.maxConcurrentWorkers) break;
			if (bucket.pending.length === 0) {
				if (bucket.active !== 0) continue;
				if (this.isBucketRateLimited(bucket, now)) {
					nextDelayMs = Math.min(nextDelayMs, bucket.resetAt - now);
					continue;
				}
				this.pruneIdleRouteMappings(key, bucket, now);
				if (this.shouldPruneIdleBucket(key)) this.buckets.delete(key);
				continue;
			}
			if (bucket.active > 0) continue;
			const waitMs = this.getBucketWaitMs(bucket, now);
			if (waitMs > 0) {
				nextDelayMs = Math.min(nextDelayMs, waitMs);
				continue;
			}
			const queued = bucket.pending.shift();
			if (!queued) continue;
			if (bucket.remaining !== void 0 && bucket.remaining > 0) bucket.remaining -= 1;
			bucket.active += 1;
			this.activeWorkers += 1;
			this.runQueuedRequest(queued, bucket);
		}
		if (Number.isFinite(nextDelayMs)) this.scheduleDrain(nextDelayMs);
	}
	async runQueuedRequest(queued, bucket) {
		let requeued = false;
		try {
			queued.resolve(await this.executor(queued));
		} catch (error) {
			if (error instanceof RateLimitError && this.requeueRateLimitedRequest(queued)) {
				requeued = true;
				return;
			}
			queued.reject(error);
		} finally {
			bucket.active = Math.max(0, bucket.active - 1);
			this.activeWorkers = Math.max(0, this.activeWorkers - 1);
			if (!requeued) this.queuedRequests = Math.max(0, this.queuedRequests - 1);
			if (bucket.active === 0 && bucket.pending.length === 0) {
				for (const routeKey of bucket.routeKeys) if (this.routeBuckets.get(routeKey) === routeKey) this.routeBuckets.delete(routeKey);
			}
			this.drainQueues();
		}
	}
	requeueRateLimitedRequest(queued) {
		if (queued.generation !== this.queueGeneration || queued.retryCount >= this.maxRateLimitRetries) return false;
		const bucketKey = this.routeBuckets.get(queued.routeKey) ?? queued.routeKey;
		this.getBucket(bucketKey).pending.push({
			...queued,
			retryCount: queued.retryCount + 1
		});
		return true;
	}
	rejectPending(error) {
		for (const bucket of this.buckets.values()) for (const queued of bucket.pending.splice(0)) {
			queued.reject(error);
			this.queuedRequests = Math.max(0, this.queuedRequests - 1);
		}
	}
};
function isGlobalRateLimit(parsed) {
	return parsed && typeof parsed === "object" && "global" in parsed ? Boolean(parsed.global) : false;
}
//#endregion
//#region extensions/discord/src/internal/rest.ts
const defaultOptions = {
	tokenHeader: "Bot",
	baseUrl: "https://discord.com/api",
	apiVersion: 10,
	userAgent: "Enclawed Discord",
	timeout: 15e3,
	queueRequests: true,
	maxQueueSize: 1e3,
	runtimeProfile: "persistent"
};
const DEFAULT_MAX_CONCURRENT_WORKERS = 4;
function coerceResponseBody(raw) {
	if (!raw) return;
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}
var RequestClient = class {
	constructor(token, options) {
		this.requestControllers = /* @__PURE__ */ new Set();
		this.token = token.replace(/^Bot\s+/i, "");
		this.customFetch = options?.fetch;
		this.options = {
			...defaultOptions,
			...options
		};
		this.scheduler = new RestScheduler({
			maxConcurrency: this.options.scheduler?.maxConcurrency ?? DEFAULT_MAX_CONCURRENT_WORKERS,
			maxRateLimitRetries: this.options.scheduler?.maxRateLimitRetries ?? 3,
			maxQueueSize: this.options.maxQueueSize ?? defaultOptions.maxQueueSize
		}, async (request) => await this.executeRequest(request.method, request.path, {
			data: request.data,
			query: request.query
		}, request.routeKey));
	}
	async get(path, query) {
		return await this.request("GET", path, { query });
	}
	async post(path, data, query) {
		return await this.request("POST", path, {
			data,
			query
		});
	}
	async patch(path, data, query) {
		return await this.request("PATCH", path, {
			data,
			query
		});
	}
	async put(path, data, query) {
		return await this.request("PUT", path, {
			data,
			query
		});
	}
	async delete(path, data, query) {
		return await this.request("DELETE", path, {
			data,
			query
		});
	}
	async request(method, path, params) {
		const routeKey = createRouteKey(method, path);
		if (!this.options.queueRequests) return await this.executeRequest(method, path, params, routeKey);
		return await this.scheduler.enqueue({
			method,
			path,
			...params
		});
	}
	async executeRequest(method, path, params, routeKey = createRouteKey(method, path)) {
		const url = `${this.options.baseUrl}/v${this.options.apiVersion}${appendQuery(path, params.query)}`;
		const headers = new Headers({ "User-Agent": this.options.userAgent ?? defaultOptions.userAgent });
		if (this.token !== "webhook") headers.set("Authorization", `${this.options.tokenHeader ?? "Bot"} ${this.token}`);
		const body = serializeRequestBody(params.data, headers);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.options.timeout ?? 15e3);
		timeout.unref?.();
		this.requestControllers.add(controller);
		try {
			const response = await (this.customFetch ?? fetch)(url, {
				method,
				headers,
				body,
				signal: controller.signal
			});
			const parsed = coerceResponseBody(await response.text());
			this.scheduler.recordResponse(routeKey, path, response, parsed);
			if (response.status === 204) return;
			if (response.status === 429) {
				const rateLimitBody = isDiscordRateLimitBody(parsed) ? parsed : void 0;
				throw new RateLimitError(response, {
					message: readDiscordMessage(rateLimitBody, "Rate limited"),
					retry_after: readRetryAfter(rateLimitBody, response, 1),
					code: readDiscordCode(rateLimitBody),
					global: Boolean(rateLimitBody?.global)
				});
			}
			if (!response.ok) throw new DiscordError(response, parsed);
			return parsed;
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") throw error;
			if (error instanceof Error) throw error;
			throw new Error(`Discord request failed: ${inspect(error)}`, { cause: error });
		} finally {
			clearTimeout(timeout);
			this.requestControllers.delete(controller);
		}
	}
	clearQueue() {
		this.scheduler.clearQueue();
	}
	get queueSize() {
		return this.scheduler.queueSize;
	}
	getSchedulerMetrics() {
		return this.scheduler.getMetrics();
	}
	abortAllRequests() {
		this.scheduler.abortPending();
		for (const controller of this.requestControllers) controller.abort();
		this.requestControllers.clear();
	}
};
//#endregion
//#region extensions/discord/src/internal/client.ts
var Plugin = class {};
var ComponentRegistry = class {
	constructor() {
		this.entries = /* @__PURE__ */ new Map();
		this.wildcardEntries = [];
	}
	register(entry) {
		const key = parseRegistryKey(entry.customId, entry.customIdParser);
		if (key === "*") {
			if (!this.wildcardEntries.includes(entry)) this.wildcardEntries.push(entry);
			return;
		}
		const entries = this.entries.get(key) ?? [];
		if (!entries.includes(entry)) {
			entries.push(entry);
			this.entries.set(key, entries);
		}
	}
	resolve(customId, options) {
		for (const entries of this.entries.values()) {
			const match = entries.find((entry) => {
				if (options?.componentType !== void 0 && entry.type !== options.componentType) return false;
				const parser = entry.customIdParser ?? parseCustomId;
				return parseRegistryKey(entry.customId, parser) === parseRegistryKey(customId, parser);
			});
			if (match) return match;
		}
		return this.wildcardEntries.find((entry) => {
			if (options?.componentType !== void 0 && entry.type !== options.componentType) return false;
			return true;
		});
	}
};
function parseRegistryKey(customId, parser = parseCustomId) {
	return parser(customId).key;
}
var Client = class {
	constructor(options, handlers, plugins = []) {
		this.routes = [];
		this.plugins = [];
		this.componentHandler = new ComponentRegistry();
		this.modalHandler = new ComponentRegistry();
		if (!options.clientId) throw new Error("Missing Discord application ID");
		if (!options.token) throw new Error("Missing Discord bot token");
		this.options = {
			...options,
			baseUrl: options.baseUrl.replace(/\/+$/, "")
		};
		this.commands = handlers.commands ?? [];
		this.listeners = handlers.listeners ?? [];
		this.rest = new RequestClient(options.token, options.requestOptions);
		this.eventQueue = this.options.eventQueue ? new DiscordEventQueue(this.options.eventQueue) : void 0;
		this.entityCache = new DiscordEntityCache({
			client: this,
			rest: () => this.rest,
			ttlMs: this.options.restCacheTtlMs
		});
		this.commandDeployer = new DiscordCommandDeployer({
			clientId: this.options.clientId,
			commands: this.commands,
			devGuilds: this.options.devGuilds,
			rest: () => this.rest
		});
		for (const component of handlers.components ?? []) this.componentHandler.register(component);
		for (const command of this.commands) for (const component of command.components ?? []) this.componentHandler.register(component);
		for (const modal of handlers.modals ?? []) this.modalHandler.register(modal);
		for (const plugin of plugins) {
			plugin.registerClient?.(this);
			plugin.registerRoutes?.(this);
			this.plugins.push({
				id: plugin.id,
				plugin
			});
		}
	}
	getPlugin(id) {
		return this.plugins.find((entry) => entry.id === id)?.plugin;
	}
	registerListener(listener) {
		if (!this.listeners.includes(listener)) this.listeners.push(listener);
		return listener;
	}
	unregisterListener(listener) {
		const index = this.listeners.indexOf(listener);
		if (index < 0) return false;
		this.listeners.splice(index, 1);
		return true;
	}
	getRuntimeMetrics() {
		return {
			request: this.rest.getSchedulerMetrics(),
			eventQueue: this.eventQueue?.getMetrics()
		};
	}
	async fetchUser(id) {
		return await this.entityCache.fetchUser(id);
	}
	async fetchChannel(id) {
		return await this.entityCache.fetchChannel(id);
	}
	async fetchGuild(id) {
		return await this.entityCache.fetchGuild(id);
	}
	async fetchMember(guildId, userId) {
		return await this.entityCache.fetchMember(guildId, userId);
	}
	async getDiscordCommands() {
		return await this.commandDeployer.getCommands();
	}
	async deployCommands(options = {}) {
		return await this.commandDeployer.deploy(options);
	}
	async reconcileCommands() {
		return await this.deployCommands({ mode: "reconcile" });
	}
	async handleInteraction(rawData, _ctx) {
		await dispatchInteraction(this, rawData);
	}
	async dispatchGatewayEvent(type, data) {
		this.entityCache.invalidateForGatewayEvent(type, data);
		const listeners = this.listeners.filter((entry) => entry.type === type);
		if (!this.eventQueue) {
			for (const listener of listeners) await listener.handle(data, this);
			return;
		}
		await Promise.all(listeners.map((listener) => this.eventQueue.enqueue({
			eventType: type,
			listenerName: listener.constructor.name || "AnonymousListener",
			run: async () => {
				await listener.handle(data, this);
			}
		})));
	}
};
//#endregion
//#region extensions/discord/src/internal/embeds.ts
function clean(value) {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== void 0));
}
var Embed = class {
	constructor(embed) {
		Object.assign(this, embed);
	}
	serialize() {
		return clean({
			title: this.title,
			description: this.description,
			url: this.url,
			timestamp: this.timestamp,
			color: this.color,
			footer: this.footer,
			image: typeof this.image === "string" ? { url: this.image } : this.image,
			thumbnail: typeof this.thumbnail === "string" ? { url: this.thumbnail } : this.thumbnail,
			author: this.author,
			fields: this.fields
		});
	}
};
//#endregion
//#region extensions/discord/src/internal/listeners.ts
var BaseListener = class {};
var ReadyListener = class extends BaseListener {
	constructor(..._args) {
		super(..._args);
		this.type = GatewayDispatchEvents.Ready;
	}
};
var ResumedListener = class extends BaseListener {
	constructor(..._args2) {
		super(..._args2);
		this.type = GatewayDispatchEvents.Resumed;
	}
};
var MessageCreateListener = class extends BaseListener {
	constructor(..._args3) {
		super(..._args3);
		this.type = GatewayDispatchEvents.MessageCreate;
	}
};
var InteractionCreateListener = class extends BaseListener {
	constructor(..._args4) {
		super(..._args4);
		this.type = GatewayDispatchEvents.InteractionCreate;
	}
};
var MessageReactionAddListener = class extends BaseListener {
	constructor(..._args5) {
		super(..._args5);
		this.type = GatewayDispatchEvents.MessageReactionAdd;
	}
};
var MessageReactionRemoveListener = class extends BaseListener {
	constructor(..._args6) {
		super(..._args6);
		this.type = GatewayDispatchEvents.MessageReactionRemove;
	}
};
var PresenceUpdateListener = class extends BaseListener {
	constructor(..._args7) {
		super(..._args7);
		this.type = GatewayDispatchEvents.PresenceUpdate;
	}
};
var ThreadUpdateListener = class extends BaseListener {
	constructor(..._args8) {
		super(..._args8);
		this.type = GatewayDispatchEvents.ThreadUpdate;
	}
};
//#endregion
//#region extensions/discord/src/internal/discord.ts
var discord_exports = /* @__PURE__ */ __exportAll({
	AnySelectMenu: () => AnySelectMenu,
	AutocompleteInteraction: () => AutocompleteInteraction,
	Base: () => Base,
	BaseCommand: () => BaseCommand,
	BaseComponent: () => BaseComponent,
	BaseComponentInteraction: () => BaseComponentInteraction,
	BaseInteraction: () => BaseInteraction,
	BaseListener: () => BaseListener,
	BaseMessageInteractiveComponent: () => BaseMessageInteractiveComponent,
	BaseModalComponent: () => BaseModalComponent,
	Button: () => Button,
	ButtonInteraction: () => ButtonInteraction,
	ChannelSelectMenu: () => ChannelSelectMenu,
	ChannelSelectMenuInteraction: () => ChannelSelectMenuInteraction,
	CheckboxGroup: () => CheckboxGroup,
	Client: () => Client,
	Command: () => Command,
	CommandInteraction: () => CommandInteraction,
	CommandWithSubcommands: () => CommandWithSubcommands,
	ComponentRegistry: () => ComponentRegistry,
	Container: () => Container,
	DiscordError: () => DiscordError,
	Embed: () => Embed,
	File: () => File,
	Guild: () => Guild,
	GuildMember: () => GuildMember,
	InteractionCreateListener: () => InteractionCreateListener,
	Label: () => Label,
	LinkButton: () => LinkButton,
	MediaGallery: () => MediaGallery,
	MentionableSelectMenu: () => MentionableSelectMenu,
	MentionableSelectMenuInteraction: () => MentionableSelectMenuInteraction,
	Message: () => Message,
	MessageCreateListener: () => MessageCreateListener,
	MessageReactionAddListener: () => MessageReactionAddListener,
	MessageReactionRemoveListener: () => MessageReactionRemoveListener,
	Modal: () => Modal,
	ModalFields: () => ModalFields,
	ModalInteraction: () => ModalInteraction,
	OptionsHandler: () => OptionsHandler,
	Plugin: () => Plugin,
	PresenceUpdateListener: () => PresenceUpdateListener,
	RadioGroup: () => RadioGroup,
	RateLimitError: () => RateLimitError,
	ReadyListener: () => ReadyListener,
	RequestClient: () => RequestClient,
	ResumedListener: () => ResumedListener,
	Role: () => Role,
	RoleSelectMenu: () => RoleSelectMenu,
	RoleSelectMenuInteraction: () => RoleSelectMenuInteraction,
	Row: () => Row,
	Section: () => Section,
	Separator: () => Separator,
	StringSelectMenu: () => StringSelectMenu,
	StringSelectMenuInteraction: () => StringSelectMenuInteraction,
	TextDisplay: () => TextDisplay,
	TextInput: () => TextInput,
	ThreadUpdateListener: () => ThreadUpdateListener,
	Thumbnail: () => Thumbnail,
	User: () => User,
	UserSelectMenu: () => UserSelectMenu,
	UserSelectMenuInteraction: () => UserSelectMenuInteraction,
	addGuildMemberRole: () => addGuildMemberRole,
	channelFactory: () => channelFactory,
	clean: () => clean$3,
	colorToNumber: () => colorToNumber,
	createApplicationCommand: () => createApplicationCommand,
	createChannelMessage: () => createChannelMessage,
	createChannelWebhook: () => createChannelWebhook,
	createGuildBan: () => createGuildBan,
	createGuildChannel: () => createGuildChannel,
	createGuildEmoji: () => createGuildEmoji,
	createGuildScheduledEvent: () => createGuildScheduledEvent,
	createGuildSticker: () => createGuildSticker,
	createInteraction: () => createInteraction,
	createInteractionCallback: () => createInteractionCallback,
	createOwnMessageReaction: () => createOwnMessageReaction,
	createThread: () => createThread,
	createUserDmChannel: () => createUserDmChannel,
	createWebhookMessage: () => createWebhookMessage,
	deferCommandInteractionIfNeeded: () => deferCommandInteractionIfNeeded,
	deleteApplicationCommand: () => deleteApplicationCommand,
	deleteChannel: () => deleteChannel,
	deleteChannelMessage: () => deleteChannelMessage,
	deleteChannelPermission: () => deleteChannelPermission,
	deleteOwnMessageReaction: () => deleteOwnMessageReaction,
	deleteWebhookMessage: () => deleteWebhookMessage,
	editApplicationCommand: () => editApplicationCommand,
	editChannel: () => editChannel,
	editChannelMessage: () => editChannelMessage,
	editWebhookMessage: () => editWebhookMessage,
	getChannel: () => getChannel,
	getChannelMessage: () => getChannelMessage,
	getCurrentUser: () => getCurrentUser,
	getGuild: () => getGuild,
	getGuildMember: () => getGuildMember,
	getGuildVoiceState: () => getGuildVoiceState,
	getUser: () => getUser,
	getWebhookMessage: () => getWebhookMessage,
	listApplicationCommands: () => listApplicationCommands,
	listChannelArchivedThreads: () => listChannelArchivedThreads,
	listChannelMessages: () => listChannelMessages,
	listChannelPins: () => listChannelPins,
	listGuildActiveThreads: () => listGuildActiveThreads,
	listGuildChannels: () => listGuildChannels,
	listGuildEmojis: () => listGuildEmojis,
	listGuildRoles: () => listGuildRoles,
	listGuildScheduledEvents: () => listGuildScheduledEvents,
	listMessageReactionUsers: () => listMessageReactionUsers,
	moveGuildChannels: () => moveGuildChannels,
	overwriteApplicationCommands: () => overwriteApplicationCommands,
	overwriteGuildApplicationCommands: () => overwriteGuildApplicationCommands,
	parseComponentInteractionData: () => parseComponentInteractionData,
	parseCustomId: () => parseCustomId,
	pinChannelMessage: () => pinChannelMessage,
	putChannelPermission: () => putChannelPermission,
	removeGuildMember: () => removeGuildMember,
	removeGuildMemberRole: () => removeGuildMemberRole,
	resolveFocusedCommandOptionAutocompleteHandler: () => resolveFocusedCommandOptionAutocompleteHandler,
	searchGuildMessages: () => searchGuildMessages,
	sendChannelTyping: () => sendChannelTyping,
	serializePayload: () => serializePayload,
	timeoutGuildMember: () => timeoutGuildMember,
	unpinChannelMessage: () => unpinChannelMessage
});
import * as import_discord_api_types_v10 from "discord-api-types/v10";
__reExport(discord_exports, import_discord_api_types_v10);
//#endregion
export { deleteOwnMessageReaction as $, RadioGroup as A, listGuildScheduledEvents as At, Row as B, Guild as C, getGuild as Ct, CheckboxGroup as D, listGuildChannels as Dt, serializePayload as E, listGuildActiveThreads as Et, File as F, timeoutGuildMember as Ft, Thumbnail as G, Separator as H, LinkButton as I, overwriteApplicationCommands as It, parseCustomId as J, UserSelectMenu as K, MediaGallery as L, Button as M, putChannelPermission as Mt, ChannelSelectMenu as N, removeGuildMember as Nt, Label as O, listGuildEmojis as Ot, Container as P, removeGuildMemberRole as Pt, createOwnMessageReaction as Q, MentionableSelectMenu as R, CommandWithSubcommands as S, deleteChannelPermission as St, User as T, getGuildVoiceState as Tt, StringSelectMenu as U, Section as V, TextDisplay as W, createUserDmChannel as X, createChannelWebhook as Y, getCurrentUser as Z, readDiscordMessage as _, createGuildBan as _t, MessageReactionRemoveListener as a, editChannel as at, Check as b, createGuildScheduledEvent as bt, ResumedListener as c, getChannelMessage as ct, Client as d, listChannelPins as dt, listMessageReactionUsers as et, Plugin as f, pinChannelMessage as ft, readDiscordCode as g, addGuildMemberRole as gt, RateLimitError as h, unpinChannelMessage as ht, MessageReactionAddListener as i, deleteChannelMessage as it, TextInput as j, moveGuildChannels as jt, Modal as k, listGuildRoles as kt, ThreadUpdateListener as l, listChannelArchivedThreads as lt, DiscordError as m, sendChannelTyping as mt, InteractionCreateListener as n, createThread as nt, PresenceUpdateListener as o, editChannelMessage as ot, RequestClient as p, searchGuildMessages as pt, BaseMessageInteractiveComponent as q, MessageCreateListener as r, deleteChannel as rt, ReadyListener as s, getChannel as st, discord_exports as t, createChannelMessage as tt, Embed as u, listChannelMessages as ut, readRetryAfter as v, createGuildChannel as vt, Message as w, getGuildMember as wt, Command as x, createGuildSticker as xt, Errors as y, createGuildEmoji as yt, RoleSelectMenu as z };
