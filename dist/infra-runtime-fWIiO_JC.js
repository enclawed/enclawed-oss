import "./errors-D8p6rxH8.js";
import "./tmp-enclawed-dir-Dv5ezX8B.js";
import "./env-BkM4u1To.js";
import "./file-lock-kRHdo7h7.js";
import "./fetch-guard-CqBeRyBG.js";
import "./ssrf-cKOQ0IWE.js";
import "./fs-safe-BBzLrPTy.js";
import "./exec-approvals-Blz-CjV0.js";
import "./proxy-fetch-BX2zLteT.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-CuyKx8bA.js";
import "./system-events-CD6fuJpM.js";
import "./retry-CCLPkiJ6.js";
import "./undici-global-dispatcher-YgPeU3PB.js";
import "./secret-file-D4R28Gi_.js";
import "./exec-approval-reply-BqoPwec8.js";
import "./approval-native-runtime-DSHflUep.js";
import "./exec-approval-command-display-SR-xaMSW.js";
import "./exec-approval-session-target-C2taj4_Z.js";
import "./heartbeat-visibility-C5AViLXY.js";
import "./transport-ready-CS4tQS49.js";
import "./identity-AYTT_BCK.js";
import "./http-body-DFJ-F7-9.js";
import "./retry-policy-BhNotHyF.js";
import "./ssrf-policy-DVcaXdVR.js";
//#region src/plugin-sdk/infra-runtime.ts
function normalizeWhatsAppReconnectAccountId(accountId) {
	return (accountId ?? "").trim() || "default";
}
const WHATSAPP_NO_LISTENER_ERROR_RE = /No active WhatsApp Web listener/i;
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-BevYejho.js");
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
