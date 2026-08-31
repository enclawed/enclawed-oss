import "./errors-D8p6rxH8.js";
import "./tmp-enclawed-dir-BTrLrKyp.js";
import "./env-DkSj_7zL.js";
import "./file-lock-ypOQcNY5.js";
import "./ssrf-DQDx1s1G.js";
import "./fetch-guard-YqO3vXgq.js";
import "./fs-safe-D-Jjh4zb.js";
import "./exec-approvals-C0ZBCFVO.js";
import "./proxy-fetch-BBzs-oIu.js";
import "./undici-global-dispatcher-j3TK6-oA.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-v8Vrh1sl.js";
import "./system-events-AQjBSiiK.js";
import "./retry-BAAOI--z.js";
import "./secret-file-DuHAcsZF.js";
import "./exec-approval-reply-D2yEmksv.js";
import "./approval-native-runtime-1NnMCQWP.js";
import "./exec-approval-command-display-C5K0qOpe.js";
import "./exec-approval-session-target-ueBMJzB3.js";
import "./heartbeat-visibility-Dx1VFD-Y.js";
import "./transport-ready-Cmxl1ghS.js";
import "./identity-CnPME7eg.js";
import "./http-body-CsYJ-Oh3.js";
import "./retry-policy-C6zCkqMU.js";
import "./ssrf-policy-CRYhPVuv.js";
//#region src/plugin-sdk/infra-runtime.ts
function normalizeWhatsAppReconnectAccountId(accountId) {
	return (accountId ?? "").trim() || "default";
}
const WHATSAPP_NO_LISTENER_ERROR_RE = /No active WhatsApp Web listener/i;
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-BNbBYWJx.js");
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
