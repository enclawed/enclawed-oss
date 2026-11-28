import "./errors-D8p6rxH8.js";
import "./tmp-enclawed-dir-Dv5ezX8B.js";
import "./env-BkM4u1To.js";
import "./file-lock-DW5LfF_G.js";
import "./fetch-guard-p1TvidUH.js";
import "./ssrf-Dr9txi7x.js";
import "./fs-safe-CTh1h50c.js";
import "./exec-approvals-BJGERJNl.js";
import "./proxy-fetch-BhBDmE6L.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-Ccm99-EZ.js";
import "./system-events-4RiXCPl8.js";
import "./retry-DUe1kb-s.js";
import "./undici-global-dispatcher-xqPZ_xhU.js";
import "./secret-file-BgN_hgHh.js";
import "./exec-approval-reply-BvXKYQ8I.js";
import "./approval-native-runtime-DPeJSS84.js";
import "./exec-approval-command-display-CIoEqp3T.js";
import "./exec-approval-session-target-CL3aG7zW.js";
import "./heartbeat-visibility-C2SIyMg4.js";
import "./transport-ready-B6Oe3QOW.js";
import "./identity-BnQ5qAV-.js";
import "./http-body-hGoGB5i3.js";
import "./retry-policy-BiTaTooI.js";
import "./ssrf-policy-CMIBjC1W.js";
//#region src/plugin-sdk/infra-runtime.ts
function normalizeWhatsAppReconnectAccountId(accountId) {
	return (accountId ?? "").trim() || "default";
}
const WHATSAPP_NO_LISTENER_ERROR_RE = /No active WhatsApp Web listener/i;
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-Bjd35_RK.js");
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
