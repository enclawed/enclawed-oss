import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { t as hasControlCommand } from "./command-detection-NsqHQ9n5.js";
import { n as resolveInboundDebounceMs, t as createInboundDebouncer } from "./inbound-debounce-BP0iAAYw.js";
import "./mentions-CE7s7FdB.js";
import "./direct-dm-Cm7TOc9z.js";
import "./session-envelope-CJJ7WQUI.js";
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
