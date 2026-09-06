import "./errors-D8p6rxH8.js";
import "./tmp-enclawed-dir-BTrLrKyp.js";
import "./env-DMXNDA06.js";
import "./file-lock-ypOQcNY5.js";
import "./ssrf-DQDx1s1G.js";
import "./fetch-guard-LpiuL2Me.js";
import "./fs-safe-DbL4T6oL.js";
import "./exec-approvals-C0ZBCFVO.js";
import "./proxy-fetch-D3Mzuk-U.js";
import "./undici-global-dispatcher-j3TK6-oA.js";
import { n as drainPendingDeliveries$1 } from "./delivery-queue-v8Vrh1sl.js";
import "./system-events-C58tIl-I.js";
import "./retry-hubNFPI9.js";
import "./secret-file-D_Q0RXHL.js";
import "./exec-approval-reply-CENdgjHe.js";
import "./approval-native-runtime-DYIszrpm.js";
import "./exec-approval-command-display-C5K0qOpe.js";
import "./exec-approval-session-target-CN1Mvdh8.js";
import "./heartbeat-visibility-Dx1VFD-Y.js";
import "./transport-ready-Cmxl1ghS.js";
import "./identity-BZHzywBa.js";
import "./http-body-CsYJ-Oh3.js";
import "./retry-policy-CzNbAdWn.js";
import "./ssrf-policy-CRYhPVuv.js";
//#region src/plugin-sdk/infra-runtime.ts
function normalizeWhatsAppReconnectAccountId(accountId) {
	return (accountId ?? "").trim() || "default";
}
const WHATSAPP_NO_LISTENER_ERROR_RE = /No active WhatsApp Web listener/i;
let outboundDeliverRuntimePromise = null;
async function loadOutboundDeliverRuntime() {
	outboundDeliverRuntimePromise ??= import("./deliver-runtime-BETX9CIj.js");
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
