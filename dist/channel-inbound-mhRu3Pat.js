import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { t as hasControlCommand } from "./command-detection-Bmn9gNgU.js";
import { n as resolveInboundDebounceMs, t as createInboundDebouncer } from "./inbound-debounce-hXPgDVh3.js";
import "./mentions-BC6KkXEs.js";
import "./direct-dm-D6Z-KtQ2.js";
import "./session-envelope-CoQku5-t.js";
//#region src/channels/inbound-debounce-policy.ts
function shouldDebounceTextInbound(params) {
	if (params.allowDebounce === false) return false;
	if (params.hasMedia) return false;
	const text = normalizeOptionalString(params.text) ?? "";
	if (!text) return false;
	return !hasControlCommand(text, params.cfg, params.commandOptions);
}
function createChannelInboundDebouncer(params) {
	const debounceMs = resolveInboundDebounceMs({
		cfg: params.cfg,
		channel: params.channel,
		overrideMs: params.debounceMsOverride
	});
	const { cfg: _cfg, channel: _channel, debounceMsOverride: _override, ...rest } = params;
	return {
		debounceMs,
		debouncer: createInboundDebouncer({
			debounceMs,
			...rest
		})
	};
}
//#endregion
export { shouldDebounceTextInbound as n, createChannelInboundDebouncer as t };
