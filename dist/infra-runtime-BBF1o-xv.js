import "./errors-D8p6rxH8.js";
import "./tmp-enclawed-dir-BTrLrKyp.js";
import "./env-DMXNDA06.js";
import "./file-lock-B3u7BSnf.js";
import "./fetch-guard-IT_rWldX.js";
import "./ssrf-CeUgojmR.js";
import "./fs-safe-HEHEfaEP.js";
import "./exec-approvals-CwUdGPpb.js";
import "./proxy-fetch-BgTVHvFa.js";
import "./undici-global-dispatcher-xX99uO1k.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-BI9k5cS8.js";
import "./system-events-CZEBXacH.js";
import "./retry-9jlqkOMS.js";
import "./secret-file-B84COzMM.js";
import "./exec-approval-reply-UcmXJRAe.js";
import "./approval-native-runtime-B5o8VNvv.js";
import "./exec-approval-command-display-CR2hzx_u.js";
import "./exec-approval-session-target-QzBa6cMU.js";
import "./heartbeat-visibility-B6KDwPEx.js";
import "./transport-ready-q3S_uSVu.js";
import "./identity-CRb10Ltq.js";
import "./http-body-D7uyc70p.js";
import "./retry-policy-DDTLlrff.js";
import "./ssrf-policy-Dl1VYtZa.js";
//#region src/plugin-sdk/infra-runtime.ts
function normalizeWhatsAppReconnectAccountId(accountId) {
	return (accountId ?? "").trim() || "default";
}
const WHATSAPP_NO_LISTENER_ERROR_RE = /No active WhatsApp Web listener/i;
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-7kC60kjW.js");
	return await outboundDeliverRuntimePromise;
}
async function drainPendingDeliveries(opts) {
	const deliver = opts.deliver ?? (await loadOutboundDeliverRuntime()).deliverOutboundPayloads;
	await drainPendingDeliveries$1({
		...opts,
		deliver
	});
}
/**
* @deprecated Prefer plugin-owned reconnect policy wired through
* `drainPendingDeliveries(...)`. This compatibility shim preserves the
* historical public SDK symbol for existing plugin callers.
*/
async function drainReconnectQueue(opts) {
	const normalizedAccountId = normalizeWhatsAppReconnectAccountId(opts.accountId);
	await drainPendingDeliveries({
		drainKey: `whatsapp:${normalizedAccountId}`,
		logLabel: "WhatsApp reconnect drain",
		cfg: opts.cfg,
		log: opts.log,
		stateDir: opts.stateDir,
		deliver: opts.deliver,
		selectEntry: (entry) => ({
			match: entry.channel === "whatsapp" && normalizeWhatsAppReconnectAccountId(entry.accountId) === normalizedAccountId && typeof entry.lastError === "string" && WHATSAPP_NO_LISTENER_ERROR_RE.test(entry.lastError),
			bypassBackoff: true
		})
	});
}
//#endregion
export { drainReconnectQueue as n, drainPendingDeliveries as t };
