import { n as getBundledChannelPlugin } from "./bundled-CPcF5CPE.js";
import { a as normalizeAnyChannelId } from "./registry-DWJO7iQk.js";
import { t as getChannelPlugin } from "./registry-CI36HBCI.js";
import "./plugins-lmHd1cqM.js";
//#region src/commands/doctor/channel-capabilities.ts
const DEFAULT_DOCTOR_CHANNEL_CAPABILITIES = {
	dmAllowFromMode: "topOnly",
	groupModel: "sender",
	groupAllowFromFallbackToAllowFrom: true,
	warnOnEmptyGroupSenderAllowlist: true
};
const STATIC_DOCTOR_CHANNEL_CAPABILITIES = {
	googlechat: {
		dmAllowFromMode: "nestedOnly",
		groupModel: "route",
		groupAllowFromFallbackToAllowFrom: false,
		warnOnEmptyGroupSenderAllowlist: false
	},
	matrix: {
		dmAllowFromMode: "nestedOnly",
		groupModel: "sender",
		groupAllowFromFallbackToAllowFrom: false,
		warnOnEmptyGroupSenderAllowlist: true
	},
	msteams: {
		dmAllowFromMode: "topOnly",
		groupModel: "hybrid",
		groupAllowFromFallbackToAllowFrom: false,
		warnOnEmptyGroupSenderAllowlist: true
	},
	zalouser: {
		dmAllowFromMode: "topOnly",
		groupModel: "hybrid",
		groupAllowFromFallbackToAllowFrom: false,
		warnOnEmptyGroupSenderAllowlist: false
	}
};
function getDoctorChannelCapabilities(channelName) {
	if (!channelName) return DEFAULT_DOCTOR_CHANNEL_CAPABILITIES;
	const staticCapabilities = STATIC_DOCTOR_CHANNEL_CAPABILITIES[channelName];
	if (staticCapabilities) return staticCapabilities;
	const registeredChannelId = normalizeAnyChannelId(channelName);
	if (!registeredChannelId) return DEFAULT_DOCTOR_CHANNEL_CAPABILITIES;
	const pluginDoctor = getChannelPlugin(registeredChannelId)?.doctor ?? getBundledChannelPlugin(registeredChannelId)?.doctor;
	if (pluginDoctor) return {
		dmAllowFromMode: pluginDoctor.dmAllowFromMode ?? DEFAULT_DOCTOR_CHANNEL_CAPABILITIES.dmAllowFromMode,
		groupModel: pluginDoctor.groupModel ?? DEFAULT_DOCTOR_CHANNEL_CAPABILITIES.groupModel,
		groupAllowFromFallbackToAllowFrom: pluginDoctor.groupAllowFromFallbackToAllowFrom ?? DEFAULT_DOCTOR_CHANNEL_CAPABILITIES.groupAllowFromFallbackToAllowFrom,
		warnOnEmptyGroupSenderAllowlist: pluginDoctor.warnOnEmptyGroupSenderAllowlist ?? DEFAULT_DOCTOR_CHANNEL_CAPABILITIES.warnOnEmptyGroupSenderAllowlist
	};
	return DEFAULT_DOCTOR_CHANNEL_CAPABILITIES;
}
//#endregion
export { getDoctorChannelCapabilities as t };
