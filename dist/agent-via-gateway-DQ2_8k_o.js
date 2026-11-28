import { s as normalizeOptionalString } from "./string-coerce-BUSzWgUA.js";
import { r as writeRuntimeJson } from "./runtime-1ULlIz69.js";
import { t as formatCliCommand } from "./command-format-Dyt7cO_V.js";
import { a as loadConfig } from "./io-B2MO_b-F.js";
import { c as normalizeAgentId } from "./session-key-DQY-q7AR.js";
import { _ as listAgentIds } from "./agent-scope-h_sJkIo9.js";
import { t as killProcessTree } from "./kill-tree-D_KUDMuS.js";
import "./config-BDqdmU33.js";
import { g as GATEWAY_CLIENT_NAMES, h as GATEWAY_CLIENT_MODES, u as normalizeMessageChannel } from "./message-channel-DxD903us.js";
import { m as resolveSendableOutboundReplyParts } from "./reply-payload-DTkaIIIO.js";
import { c as randomIdempotencyKey, r as callGateway } from "./call-CZTEeqLo.js";
import { t as getProcessSupervisor } from "./supervisor-X_vft2V9.js";
import { l as listRunningSessions } from "./bash-process-registry-J5XqGLT8.js";
import { i as resolveSessionKeyForRequest } from "./live-model-switch-Dk4uQCqu.js";
import { n as withProgress } from "./progress-CreFRWgg.js";
import { n as agentCommand } from "./agent-command-BOzO0ztp.js";
import "./agent-CgtmcLWg.js";
//#region src/agents/bash-process-cleanup.ts
/**
* Ends every exec session still running in the background and returns how
* many it ended. The process registry lives in this process's memory, so once
* a one-shot run exits nobody can poll or kill its background sessions again;
* left alone they keep the CLI from exiting (an open PTY holds the event loop)
* or outlive it as orphans.
*/
function terminateBackgroundExecSessions() {
	const supervisor = getProcessSupervisor();
	let ended = 0;
	for (const session of listRunningSessions()) {
		const record = supervisor.getRecord(session.id);
		if (record && record.state !== "exited") {
			supervisor.cancel(session.id, "manual-cancel");
			ended++;
			continue;
		}
		const pid = session.pid ?? session.child?.pid;
		if (typeof pid === "number" && Number.isFinite(pid) && pid > 0) {
			killProcessTree(pid);
			ended++;
		}
	}
	return ended;
}
//#endregion
//#region src/commands/agent-via-gateway.ts
const NO_GATEWAY_TIMEOUT_MS = 2147e6;
function parseTimeoutSeconds(opts) {
	const raw = opts.timeout !== void 0 ? Number.parseInt(opts.timeout, 10) : opts.cfg.agents?.defaults?.timeoutSeconds ?? 600;
	if (Number.isNaN(raw) || raw < 0) throw new Error("--timeout must be a non-negative integer (seconds; 0 means no timeout)");
	return raw;
}
function formatPayloadForLog(payload) {
	const parts = resolveSendableOutboundReplyParts({
		text: payload.text,
		mediaUrls: payload.mediaUrls,
		mediaUrl: typeof payload.mediaUrl === "string" ? payload.mediaUrl : void 0
	});
	const lines = [];
	if (parts.text) lines.push(parts.text.trimEnd());
	for (const url of parts.mediaUrls) lines.push(`MEDIA:${url}`);
	return lines.join("\n").trimEnd();
}
async function agentViaGatewayCommand(opts, runtime) {
	const body = (opts.message ?? "").trim();
	if (!body) throw new Error("Message (--message) is required");
	if (!opts.to && !opts.sessionId && !opts.agent) throw new Error("Pass --to <E.164>, --session-id, or --agent to choose a session");
	const cfg = loadConfig();
	const agentIdRaw = opts.agent?.trim();
	const agentId = agentIdRaw ? normalizeAgentId(agentIdRaw) : void 0;
	if (agentId) {
		if (!listAgentIds(cfg).includes(agentId)) throw new Error(`Unknown agent id "${agentIdRaw}". Use "${formatCliCommand("enclawed agents list")}" to see configured agents.`);
	}
	const timeoutSeconds = parseTimeoutSeconds({
		cfg,
		timeout: opts.timeout
	});
	const gatewayTimeoutMs = timeoutSeconds === 0 ? NO_GATEWAY_TIMEOUT_MS : Math.max(1e4, (timeoutSeconds + 30) * 1e3);
	const sessionKey = resolveSessionKeyForRequest({
		cfg,
		agentId,
		to: opts.to,
		sessionId: opts.sessionId
	}).sessionKey;
	const channel = normalizeMessageChannel(opts.channel);
	const idempotencyKey = normalizeOptionalString(opts.runId) || randomIdempotencyKey();
	const response = await withProgress({
		label: "Waiting for agent reply…",
		indeterminate: true,
		enabled: opts.json !== true
	}, async () => await callGateway({
		method: "agent",
		params: {
			message: body,
			agentId,
			to: opts.to,
			replyTo: opts.replyTo,
			sessionId: opts.sessionId,
			sessionKey,
			thinking: opts.thinking,
			deliver: Boolean(opts.deliver),
			channel,
			replyChannel: opts.replyChannel,
			replyAccountId: opts.replyAccount,
			bestEffortDeliver: opts.bestEffortDeliver,
			timeout: timeoutSeconds,
			lane: opts.lane,
			extraSystemPrompt: opts.extraSystemPrompt,
			idempotencyKey
		},
		expectFinal: true,
		timeoutMs: gatewayTimeoutMs,
		clientName: GATEWAY_CLIENT_NAMES.CLI,
		mode: GATEWAY_CLIENT_MODES.CLI
	}));
	if (opts.json) {
		writeRuntimeJson(runtime, response);
		return response;
	}
	const payloads = (response?.result)?.payloads ?? [];
	if (payloads.length === 0) {
		runtime.log(response?.summary ? response.summary : "No reply from agent.");
		return response;
	}
	for (const payload of payloads) {
		const out = formatPayloadForLog(payload);
		if (out) runtime.log(out);
	}
	return response;
}
async function agentCliCommand(opts, runtime, deps) {
	const localOpts = {
		...opts,
		agentId: opts.agent,
		replyAccountId: opts.replyAccount,
		cleanupBundleMcpOnRunEnd: opts.local === true
	};
	if (opts.local === true) try {
		return await agentCommand(localOpts, runtime, deps);
	} finally {
		terminateBackgroundExecSessions();
	}
	try {
		return await agentViaGatewayCommand(opts, runtime);
	} catch (err) {
		runtime.error?.(`Gateway agent failed; falling back to embedded: ${String(err)}`);
		return await agentCommand(localOpts, runtime, deps);
	}
}
//#endregion
export { agentCliCommand as t };
