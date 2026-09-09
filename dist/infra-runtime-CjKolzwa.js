import "./errors-D8p6rxH8.js";
import "./tmp-enclawed-dir-BTrLrKyp.js";
import "./env-DMXNDA06.js";
import "./file-lock-CS5HSPQ5.js";
import "./ssrf-DjpVlwtu.js";
import "./fetch-guard-CgHO6oDe.js";
import "./fs-safe-C3irXap3.js";
import "./exec-approvals-CSCQWe00.js";
import "./proxy-fetch-CYbocpTD.js";
import "./undici-global-dispatcher-CEjuidQ3.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-CKk6bp9Y.js";
import "./system-events-BDxISYT2.js";
import "./retry-C9tlAwQL.js";
import "./secret-file-D6GVat0t.js";
import "./exec-approval-reply-DXBP45LV.js";
import "./approval-native-runtime-GYSNdh1v.js";
import "./exec-approval-command-display-C3ipBx8k.js";
import "./exec-approval-session-target-C6A8BT1H.js";
import "./heartbeat-visibility-COfdzFBC.js";
import "./transport-ready-DpBoY-PY.js";
import "./identity-CRPkIVc3.js";
import "./http-body-CrYxTOA6.js";
import "./retry-policy-CRWLdzcO.js";
import "./ssrf-policy-BIENEBhb.js";
//#region src/plugin-sdk/infra-runtime.ts
function normalizeWhatsAppReconnectAccountId(accountId) {
	return (accountId ?? "").trim() || "default";
}
const WHATSAPP_NO_LISTENER_ERROR_RE = /No active WhatsApp Web listener/i;
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-2-5C9Rni.js");
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
