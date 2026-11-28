import { x as sliceUtf16Safe } from "./utils-BcQ7uNrT.js";
import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { t as getFlavor } from "./flavor-CPDBgn8D.js";
import "./host-env-security-DJQhLQ9j.js";
import { a as logWarn } from "./logger-CxYwkFNY.js";
import { p as scopedHeartbeatWakeOptions } from "./session-key-DQY-q7AR.js";
import { i as normalizeDeliveryContext } from "./delivery-context.shared-DYLFvPVv.js";
import "./delivery-context-C3IB6pRR.js";
import { n as assertSandboxPath } from "./sandbox-paths-QUFkyJIm.js";
import { T as resolveExecApprovalAllowedDecisions, r as DEFAULT_EXEC_APPROVAL_TIMEOUT_MS } from "./exec-approvals-BJGERJNl.js";
import "./bash-tools.schemas-BvbDl4zX.js";
import { n as requestHeartbeatNow } from "./heartbeat-wake-C4RKZ447.js";
import { i as enqueueSystemEvent } from "./system-events-4RiXCPl8.js";
import { i as createNetCageReporter, n as openNetCage, r as shellQuote, t as netCageSupport } from "./cage-uB4leQuX.js";
import { n as getShellConfig, r as sanitizeBinaryOutput } from "./shell-utils-CVuW2D1U.js";
import { t as getProcessSupervisor } from "./supervisor-X_vft2V9.js";
import { d as markExited, n as appendOutput, p as tail, r as createSessionSlug, t as addSession } from "./bash-process-registry-J5XqGLT8.js";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import fs$1 from "node:fs/promises";
//#region src/infra/path-prepend.ts
/**
* Find the actual key used for PATH in the env object.
* On Windows, `process.env` stores it as `Path` (not `PATH`),
* and after copying to a plain object the original casing is preserved.
*/
function findPathKey(env) {
	if ("PATH" in env) return "PATH";
	for (const key of Object.keys(env)) if (key.toUpperCase() === "PATH") return key;
	return "PATH";
}
function normalizePathPrepend(entries) {
	if (!Array.isArray(entries)) return [];
	const seen = /* @__PURE__ */ new Set();
	const normalized = [];
	for (const entry of entries) {
		if (typeof entry !== "string") continue;
		const trimmed = entry.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		normalized.push(trimmed);
	}
	return normalized;
}
function mergePathPrepend(existing, prepend) {
	if (prepend.length === 0) return existing;
	const partsExisting = (existing ?? "").split(path.delimiter).map((part) => part.trim()).filter(Boolean);
	const merged = [];
	const seen = /* @__PURE__ */ new Set();
	for (const part of [...prepend, ...partsExisting]) {
		if (seen.has(part)) continue;
		seen.add(part);
		merged.push(part);
	}
	return merged.join(path.delimiter);
}
function applyPathPrepend(env, prepend, options) {
	if (!Array.isArray(prepend) || prepend.length === 0) return;
	const pathKey = findPathKey(env);
	if (options?.requireExisting && !env[pathKey]) return;
	const merged = mergePathPrepend(env[pathKey], prepend);
	if (merged) env[pathKey] = merged;
}
//#endregion
//#region src/agents/bash-tools.exec-netcage.ts
var ExecNetworkRefusedError = class extends Error {
	constructor(..._args) {
		super(..._args);
		this.name = "ExecNetworkRefusedError";
	}
};
async function prepareExecNetCage(params, deps = { support: netCageSupport }) {
	const runtime = getRuntime();
	if (!runtime) {
		if (getFlavor() === "enclaved") throw new ExecNetworkRefusedError("exec refused: the enclaved flavor is active but the enclawed runtime is not bootstrapped, so this command cannot be network-caged.");
		return null;
	}
	if (runtime.policy.commandNetwork === "host") return null;
	const support = deps.support();
	if (!support.ok) {
		runtime.audit.append({
			type: "egress.cage.refused",
			actor: "exec",
			level: null,
			payload: { reason: support.reason }
		}).catch(() => {});
		throw new ExecNetworkRefusedError(`exec refused: ${support.reason}, so this command cannot be stopped from reaching the network. Run on a host with unprivileged user namespaces, or set enclawed.policy.commandNetwork to "host" to run commands on the host network.`);
	}
	const reporter = createNetCageReporter({
		source: "exec",
		label: params.command.length > 200 ? `${params.command.slice(0, 200)}…` : params.command,
		notify: (alert) => {
			logWarn(alert.message);
			params.onAlert(alert);
		}
	});
	const cage = await openNetCage({ onEvent: reporter.onEvent });
	return {
		wrapArgv(argv, cwd) {
			return cage.wrap(argv[0], argv.slice(1), cwd);
		},
		wrapPtyCommand(shell, shellArgs, command) {
			const { argv, env } = cage.wrap(shell, [...shellArgs, command]);
			return {
				ptyCommand: argv.map(shellQuote).join(" "),
				env
			};
		},
		async finish() {
			await cage.close();
			const lines = reporter.summary().filter((l) => !l.startsWith("1 × "));
			if (lines.length > 0) logWarn(`exec: blocked repeated network attempts: ${lines.join("; ")}`);
			return lines;
		}
	};
}
//#endregion
//#region src/agents/bash-tools.shared.ts
const CHUNK_LIMIT = 8 * 1024;
function buildSandboxEnv(params) {
	const env = {
		PATH: params.defaultPath,
		HOME: params.containerWorkdir
	};
	for (const [key, value] of Object.entries(params.sandboxEnv ?? {})) env[key] = value;
	for (const [key, value] of Object.entries(params.paramsEnv ?? {})) env[key] = value;
	return env;
}
function coerceEnv(env) {
	const record = {};
	if (!env) return record;
	for (const [key, value] of Object.entries(env)) if (typeof value === "string") record[key] = value;
	return record;
}
function buildDockerExecArgs(params) {
	const args = ["exec", "-i"];
	if (params.tty) args.push("-t");
	if (params.workdir) args.push("-w", params.workdir);
	for (const [key, value] of Object.entries(params.env)) {
		if (key === "PATH") continue;
		args.push("-e", `${key}=${value}`);
	}
	const hasCustomPath = typeof params.env.PATH === "string" && params.env.PATH.length > 0;
	if (hasCustomPath) args.push("-e", `ENCLAWED_PREPEND_PATH=${params.env.PATH}`);
	const pathExport = hasCustomPath ? "export PATH=\"${ENCLAWED_PREPEND_PATH}:$PATH\"; unset ENCLAWED_PREPEND_PATH; " : "";
	args.push(params.containerName, "/bin/sh", "-lc", `${pathExport}${params.command}`);
	return args;
}
async function resolveSandboxWorkdir(params) {
	const fallback = params.sandbox.workspaceDir;
	const candidateWorkdir = mapContainerWorkdirToHost({
		workdir: params.workdir,
		sandbox: params.sandbox
	}) ?? params.workdir;
	try {
		const resolved = await assertSandboxPath({
			filePath: candidateWorkdir,
			cwd: process.cwd(),
			root: params.sandbox.workspaceDir
		});
		if (!(await fs$1.stat(resolved.resolved)).isDirectory()) throw new Error("workdir is not a directory");
		const relative = resolved.relative ? resolved.relative.split(path.sep).join(path.posix.sep) : "";
		const containerWorkdir = relative ? path.posix.join(params.sandbox.containerWorkdir, relative) : params.sandbox.containerWorkdir;
		return {
			hostWorkdir: resolved.resolved,
			containerWorkdir
		};
	} catch {
		params.warnings.push(`Warning: workdir "${params.workdir}" is unavailable; using "${fallback}".`);
		return {
			hostWorkdir: fallback,
			containerWorkdir: params.sandbox.containerWorkdir
		};
	}
}
function mapContainerWorkdirToHost(params) {
	const workdir = normalizeContainerPath(params.workdir);
	const containerRoot = normalizeContainerPath(params.sandbox.containerWorkdir);
	if (containerRoot === ".") return;
	if (workdir === containerRoot) return path.resolve(params.sandbox.workspaceDir);
	if (!workdir.startsWith(`${containerRoot}/`)) return;
	const rel = workdir.slice(containerRoot.length + 1).split("/").filter(Boolean);
	return path.resolve(params.sandbox.workspaceDir, ...rel);
}
function normalizeContainerPath(input) {
	const normalized = input.trim().replace(/\\/g, "/");
	if (!normalized) return ".";
	return path.posix.normalize(normalized);
}
function resolveWorkdir(workdir, warnings) {
	const fallback = safeCwd() ?? homedir();
	try {
		if (statSync(workdir).isDirectory()) return workdir;
	} catch {}
	warnings.push(`Warning: workdir "${workdir}" is unavailable; using "${fallback}".`);
	return fallback;
}
function safeCwd() {
	try {
		const cwd = process.cwd();
		return existsSync(cwd) ? cwd : null;
	} catch {
		return null;
	}
}
/**
* Clamp a number within min/max bounds, using defaultValue if undefined or NaN.
*/
function clampWithDefault(value, defaultValue, min, max) {
	if (value === void 0 || Number.isNaN(value)) return defaultValue;
	return Math.min(Math.max(value, min), max);
}
function readEnvInt(key) {
	const raw = process.env[key];
	if (!raw) return;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : void 0;
}
function chunkString(input, limit = CHUNK_LIMIT) {
	const chunks = [];
	for (let i = 0; i < input.length; i += limit) chunks.push(input.slice(i, i + limit));
	return chunks;
}
function truncateMiddle(str, max) {
	if (str.length <= max) return str;
	const half = Math.floor((max - 3) / 2);
	return `${sliceUtf16Safe(str, 0, half)}...${sliceUtf16Safe(str, -half)}`;
}
function sliceLogLines(text, offset, limit) {
	if (!text) return {
		slice: "",
		totalLines: 0,
		totalChars: 0
	};
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	const totalLines = lines.length;
	const totalChars = text.length;
	let start = typeof offset === "number" && Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
	if (limit !== void 0 && offset === void 0) start = Math.max(totalLines - Math.max(0, Math.floor(limit)), 0);
	const end = typeof limit === "number" && Number.isFinite(limit) ? start + Math.max(0, Math.floor(limit)) : void 0;
	return {
		slice: lines.slice(start, end).join("\n"),
		totalLines,
		totalChars
	};
}
function deriveSessionName(command) {
	const tokens = tokenizeCommand(command);
	if (tokens.length === 0) return;
	const verb = tokens[0];
	let target = tokens.slice(1).find((t) => !t.startsWith("-"));
	if (!target) target = tokens[1];
	if (!target) return verb;
	const cleaned = truncateMiddle(stripQuotes(target), 48);
	return `${stripQuotes(verb)} ${cleaned}`;
}
function tokenizeCommand(command) {
	return (command.match(/(?:[^\s"']+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) ?? []).map((token) => stripQuotes(token)).filter(Boolean);
}
function stripQuotes(value) {
	const trimmed = value.trim();
	if (trimmed.startsWith("\"") && trimmed.endsWith("\"") || trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
	return trimmed;
}
function pad(str, width) {
	if (str.length >= width) return str;
	return str + " ".repeat(width - str.length);
}
//#endregion
//#region src/agents/pty-dsr.ts
const DSR_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[\\??6n`, "g");
function stripDsrRequests(input) {
	let requests = 0;
	return {
		cleaned: input.replace(DSR_PATTERN, () => {
			requests += 1;
			return "";
		}),
		requests
	};
}
function buildCursorPositionResponse(row = 1, col = 1) {
	return `\x1b[${row};${col}R`;
}
//#endregion
//#region src/agents/bash-tools.exec-runtime.ts
const SMKX = "\x1B[?1h";
const RMKX = "\x1B[?1l";
/**
* Detect cursor key mode from PTY output chunk.
* Uses lastIndexOf to find the *last* toggle in the chunk.
* Returns "application" if smkx is the last toggle, "normal" if rmkx is last,
* or null if no toggle is found.
*/
function detectCursorKeyMode(raw) {
	const lastSmkx = raw.lastIndexOf(SMKX);
	const lastRmkx = raw.lastIndexOf(RMKX);
	if (lastSmkx === -1 && lastRmkx === -1) return null;
	return lastSmkx > lastRmkx ? "application" : "normal";
}
const DEFAULT_MAX_OUTPUT = clampWithDefault(readEnvInt("PI_BASH_MAX_OUTPUT_CHARS"), 2e5, 1e3, 2e5);
const DEFAULT_PENDING_MAX_OUTPUT = clampWithDefault(readEnvInt("ENCLAWED_BASH_PENDING_MAX_OUTPUT_CHARS"), 3e4, 1e3, 2e5);
const DEFAULT_PATH = process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const DEFAULT_NOTIFY_SNIPPET_CHARS = 180;
const DEFAULT_APPROVAL_TIMEOUT_MS = DEFAULT_EXEC_APPROVAL_TIMEOUT_MS;
const DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS = DEFAULT_APPROVAL_TIMEOUT_MS + 1e4;
const DEFAULT_APPROVAL_RUNNING_NOTICE_MS = 1e4;
const APPROVAL_SLUG_LENGTH = 8;
function renderExecHostLabel(host) {
	return host === "sandbox" ? "sandbox" : host === "gateway" ? "gateway" : "node";
}
function renderExecTargetLabel(target) {
	return target === "auto" ? "auto" : renderExecHostLabel(target);
}
function isRequestedExecTargetAllowed(params) {
	if (params.requestedTarget === params.configuredTarget) return true;
	if (params.configuredTarget === "auto") {
		if (params.sandboxAvailable && (params.requestedTarget === "gateway" || params.requestedTarget === "node")) return false;
		return true;
	}
	return false;
}
function resolveExecTarget(params) {
	const configuredTarget = params.configuredTarget ?? "auto";
	const requestedTarget = params.requestedTarget ?? null;
	if (requestedTarget && !isRequestedExecTargetAllowed({
		configuredTarget,
		requestedTarget,
		sandboxAvailable: params.sandboxAvailable
	})) {
		const allowedConfig = Array.from(new Set(configuredTarget === "auto" && params.sandboxAvailable && (requestedTarget === "gateway" || requestedTarget === "node") ? [renderExecTargetLabel(requestedTarget)] : requestedTarget === "gateway" && !params.sandboxAvailable ? ["gateway", "auto"] : [renderExecTargetLabel(requestedTarget), "auto"])).join(" or ");
		throw new Error(`exec host not allowed (requested ${renderExecTargetLabel(requestedTarget)}; configured host is ${renderExecTargetLabel(configuredTarget)}; set tools.exec.host=${allowedConfig} to allow this override).`);
	}
	const selectedTarget = requestedTarget ?? configuredTarget;
	const resolvedTarget = params.elevatedRequested ? selectedTarget === "node" ? "node" : "gateway" : selectedTarget;
	return {
		configuredTarget,
		requestedTarget,
		selectedTarget: resolvedTarget,
		effectiveHost: resolvedTarget === "auto" ? params.sandboxAvailable ? "sandbox" : "gateway" : resolvedTarget
	};
}
function normalizeNotifyOutput(value) {
	return value.replace(/\s+/g, " ").trim();
}
function compactNotifyOutput(value, maxChars = DEFAULT_NOTIFY_SNIPPET_CHARS) {
	const normalized = normalizeNotifyOutput(value);
	if (!normalized) return "";
	if (normalized.length <= maxChars) return normalized;
	const safe = Math.max(1, maxChars - 1);
	return `${normalized.slice(0, safe)}…`;
}
function applyShellPath(env, shellPath) {
	if (!shellPath) return;
	const entries = shellPath.split(path.delimiter).map((part) => part.trim()).filter(Boolean);
	if (entries.length === 0) return;
	const pathKey = findPathKey(env);
	const merged = mergePathPrepend(env[pathKey], entries);
	if (merged) env[pathKey] = merged;
}
function maybeNotifyOnExit(session, status) {
	if (!session.backgrounded || !session.notifyOnExit || session.exitNotified) return;
	const sessionKey = session.sessionKey?.trim();
	if (!sessionKey) return;
	session.exitNotified = true;
	const exitLabel = session.exitSignal ? `signal ${session.exitSignal}` : `code ${session.exitCode ?? 0}`;
	const output = compactNotifyOutput(tail(session.tail || session.aggregated || "", 400));
	if (status === "completed" && !output && session.notifyOnExitEmptySuccess !== true) return;
	enqueueSystemEvent(output ? `Exec ${status} (${session.id.slice(0, 8)}, ${exitLabel}) :: ${output}` : `Exec ${status} (${session.id.slice(0, 8)}, ${exitLabel})`, {
		sessionKey,
		deliveryContext: session.notifyDeliveryContext,
		trusted: false
	});
	requestHeartbeatNow(scopedHeartbeatWakeOptions(sessionKey, { reason: "exec-event" }));
}
function createApprovalSlug(id) {
	return id.slice(0, APPROVAL_SLUG_LENGTH);
}
function buildApprovalPendingMessage(params) {
	let fence = "```";
	while (params.command.includes(fence)) fence += "`";
	const commandBlock = `${fence}sh\n${params.command}\n${fence}`;
	const lines = [];
	const allowedDecisions = params.allowedDecisions ?? resolveExecApprovalAllowedDecisions();
	const decisionText = allowedDecisions.join("|");
	const warningText = params.warningText?.trim();
	if (warningText) lines.push(warningText, "");
	lines.push(`Approval required (id ${params.approvalSlug}, full ${params.approvalId}).`);
	lines.push(`Host: ${params.host}`);
	if (params.nodeId) lines.push(`Node: ${params.nodeId}`);
	lines.push(`CWD: ${params.cwd ?? "(node default)"}`);
	lines.push("Command:");
	lines.push(commandBlock);
	lines.push("Mode: foreground (interactive approvals available).");
	lines.push(allowedDecisions.includes("allow-always") ? "Background mode requires pre-approved policy (allow-always or ask=off)." : "Background mode requires an effective policy that allows pre-approval (for example ask=off).");
	lines.push(`Reply with: /approve ${params.approvalSlug} ${decisionText}`);
	if (!allowedDecisions.includes("allow-always")) lines.push("The effective approval policy requires approval every time, so Allow Always is unavailable.");
	lines.push("If the short code is ambiguous, use the full id in /approve.");
	return lines.join("\n");
}
function resolveApprovalRunningNoticeMs(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_APPROVAL_RUNNING_NOTICE_MS;
	if (value <= 0) return 0;
	return Math.floor(value);
}
function joinExecFailureOutput(aggregated, reason) {
	return aggregated ? `${aggregated}\n\n${reason}` : reason;
}
function classifyExecFailureKind(params) {
	if (params.isShellFailure) return params.exitCode === 127 ? "shell-command-not-found" : "shell-not-executable";
	if (params.exitReason === "overall-timeout") return "overall-timeout";
	if (params.exitReason === "no-output-timeout") return "no-output-timeout";
	if (params.exitSignal != null) return "signal";
	return "aborted";
}
function formatExecFailureReason(params) {
	switch (params.failureKind) {
		case "shell-command-not-found": return "Command not found";
		case "shell-not-executable": return "Command not executable (permission denied)";
		case "overall-timeout": return typeof params.timeoutSec === "number" && params.timeoutSec > 0 ? `Command timed out after ${params.timeoutSec} seconds. If this command is expected to take longer, re-run with a higher timeout (e.g., exec timeout=300). If it should keep running, start it with exec background=true or yieldMs so Enclawed can register a pollable process session. Do not rely on shell backgrounding with a trailing &.` : "Command timed out. If this command is expected to take longer, re-run with a higher timeout (e.g., exec timeout=300). If it should keep running, start it with exec background=true or yieldMs so Enclawed can register a pollable process session. Do not rely on shell backgrounding with a trailing &.";
		case "no-output-timeout": return "Command timed out waiting for output";
		case "signal": return `Command aborted by signal ${params.exitSignal}`;
		case "aborted": return "Command aborted before exit code was captured";
	}
	throw new Error("Unsupported exec failure kind");
}
function buildExecExitOutcome(params) {
	const exitCode = params.exit.exitCode ?? 0;
	const isNormalExit = params.exit.reason === "exit";
	const isShellFailure = exitCode === 126 || exitCode === 127;
	if ((isNormalExit && !isShellFailure ? "completed" : "failed") === "completed") {
		const exitMsg = exitCode !== 0 ? `\n\n(Command exited with code ${exitCode})` : "";
		return {
			status: "completed",
			exitCode,
			exitSignal: params.exit.exitSignal,
			durationMs: params.durationMs,
			aggregated: params.aggregated + exitMsg,
			timedOut: false
		};
	}
	const failureKind = classifyExecFailureKind({
		exitReason: params.exit.reason,
		exitCode,
		isShellFailure,
		exitSignal: params.exit.exitSignal
	});
	const reason = formatExecFailureReason({
		failureKind,
		exitSignal: params.exit.exitSignal,
		timeoutSec: params.timeoutSec
	});
	return {
		status: "failed",
		exitCode: params.exit.exitCode,
		exitSignal: params.exit.exitSignal,
		durationMs: params.durationMs,
		aggregated: params.aggregated,
		timedOut: params.exit.timedOut,
		failureKind,
		reason: joinExecFailureOutput(params.aggregated, reason)
	};
}
function buildExecRuntimeErrorOutcome(params) {
	return {
		status: "failed",
		exitCode: null,
		exitSignal: null,
		durationMs: params.durationMs,
		aggregated: params.aggregated,
		timedOut: false,
		failureKind: "runtime-error",
		reason: joinExecFailureOutput(params.aggregated, String(params.error))
	};
}
async function runExecProcess(opts) {
	const startedAt = Date.now();
	const sessionId = createSessionSlug();
	const execCommand = opts.execCommand ?? opts.command;
	const supervisor = getProcessSupervisor();
	const shellRuntimeEnv = {
		...opts.env,
		ENCLAWED_SHELL: "exec"
	};
	const session = {
		id: sessionId,
		command: opts.command,
		scopeKey: opts.scopeKey,
		sessionKey: opts.sessionKey,
		notifyDeliveryContext: normalizeDeliveryContext(opts.notifyDeliveryContext),
		notifyOnExit: opts.notifyOnExit,
		notifyOnExitEmptySuccess: opts.notifyOnExitEmptySuccess === true,
		exitNotified: false,
		child: void 0,
		stdin: void 0,
		pid: void 0,
		startedAt,
		cwd: opts.workdir,
		maxOutputChars: opts.maxOutput,
		pendingMaxOutputChars: opts.pendingMaxOutput,
		totalOutputChars: 0,
		pendingStdout: [],
		pendingStderr: [],
		pendingStdoutChars: 0,
		pendingStderrChars: 0,
		aggregated: "",
		tail: "",
		exited: false,
		exitCode: void 0,
		exitSignal: void 0,
		truncated: false,
		backgrounded: false,
		cursorKeyMode: opts.usePty ? "unknown" : "normal"
	};
	addSession(session);
	let updatesDisabled = false;
	const emitUpdate = () => {
		if (!opts.onUpdate) return;
		if (session.backgrounded || session.exited || updatesDisabled) return;
		const tailText = session.tail || session.aggregated;
		const warningText = opts.warnings.length ? `${opts.warnings.join("\n")}\n\n` : "";
		opts.onUpdate({
			content: [{
				type: "text",
				text: warningText + (tailText || "")
			}],
			details: {
				status: "running",
				sessionId,
				pid: session.pid ?? void 0,
				startedAt,
				cwd: session.cwd,
				tail: session.tail
			}
		});
	};
	const handleStdout = (data) => {
		const raw = data;
		const mode = detectCursorKeyMode(raw);
		if (mode) session.cursorKeyMode = mode;
		const str = sanitizeBinaryOutput(raw);
		for (const chunk of chunkString(str)) {
			appendOutput(session, "stdout", chunk);
			emitUpdate();
		}
	};
	const handleStderr = (data) => {
		const str = sanitizeBinaryOutput(data);
		for (const chunk of chunkString(str)) {
			appendOutput(session, "stderr", chunk);
			emitUpdate();
		}
	};
	const timeoutMs = typeof opts.timeoutSec === "number" && opts.timeoutSec > 0 ? Math.floor(opts.timeoutSec * 1e3) : void 0;
	let sandboxFinalizeToken;
	let netCage = null;
	if (!opts.sandbox) try {
		netCage = await prepareExecNetCage({
			command: opts.command,
			onAlert: (alert) => {
				appendOutput(session, "stderr", `\n[enclawed] ${alert.message}\n`);
				emitUpdate();
			}
		});
	} catch (err) {
		markExited(session, null, null, "failed");
		maybeNotifyOnExit(session, "failed");
		throw err;
	}
	const spawnSpec = await (async () => {
		if (opts.sandbox) {
			const backendExecSpec = await opts.sandbox.buildExecSpec?.({
				command: execCommand,
				workdir: opts.containerWorkdir ?? opts.sandbox.containerWorkdir,
				env: shellRuntimeEnv,
				usePty: opts.usePty
			});
			sandboxFinalizeToken = backendExecSpec?.finalizeToken;
			return {
				mode: "child",
				argv: backendExecSpec?.argv ?? ["docker", ...buildDockerExecArgs({
					containerName: opts.sandbox.containerName,
					command: execCommand,
					workdir: opts.containerWorkdir ?? opts.sandbox.containerWorkdir,
					env: shellRuntimeEnv,
					tty: opts.usePty
				})],
				env: backendExecSpec?.env ?? process.env,
				stdinMode: backendExecSpec?.stdinMode ?? (opts.usePty ? "pipe-open" : "pipe-closed")
			};
		}
		const { shell, args: shellArgs } = getShellConfig();
		const shellArgv = [
			shell,
			...shellArgs,
			execCommand
		];
		const caged = netCage?.wrapArgv(shellArgv, opts.workdir);
		const childArgv = caged?.argv ?? shellArgv;
		const env = caged ? {
			...shellRuntimeEnv,
			...caged.env
		} : shellRuntimeEnv;
		if (opts.usePty) return {
			mode: "pty",
			ptyCommand: netCage ? netCage.wrapPtyCommand(shell, shellArgs, execCommand).ptyCommand : execCommand,
			childFallbackArgv: childArgv,
			env,
			stdinMode: "pipe-open"
		};
		return {
			mode: "child",
			argv: childArgv,
			env,
			stdinMode: "pipe-closed"
		};
	})();
	let managedRun = null;
	let usingPty = spawnSpec.mode === "pty";
	const cursorResponse = buildCursorPositionResponse();
	const onSupervisorStdout = (chunk) => {
		if (usingPty) {
			const { cleaned, requests } = stripDsrRequests(chunk);
			if (requests > 0 && managedRun?.stdin) for (let i = 0; i < requests; i += 1) managedRun.stdin.write(cursorResponse);
			handleStdout(cleaned);
			return;
		}
		handleStdout(chunk);
	};
	try {
		const spawnBase = {
			runId: sessionId,
			sessionId: opts.sessionKey?.trim() || sessionId,
			backendId: opts.sandbox ? "exec-sandbox" : "exec-host",
			scopeKey: opts.scopeKey,
			cwd: opts.workdir,
			env: spawnSpec.env,
			timeoutMs,
			captureOutput: false,
			onStdout: onSupervisorStdout,
			onStderr: handleStderr
		};
		managedRun = spawnSpec.mode === "pty" ? await supervisor.spawn({
			...spawnBase,
			mode: "pty",
			ptyCommand: spawnSpec.ptyCommand
		}) : await supervisor.spawn({
			...spawnBase,
			mode: "child",
			argv: spawnSpec.argv,
			stdinMode: spawnSpec.stdinMode
		});
	} catch (err) {
		if (spawnSpec.mode === "pty") {
			const warning = `Warning: PTY spawn failed (${String(err)}); retrying without PTY for \`${opts.command}\`.`;
			logWarn(`exec: PTY spawn failed (${String(err)}); retrying without PTY for "${opts.command}".`);
			opts.warnings.push(warning);
			usingPty = false;
			try {
				managedRun = await supervisor.spawn({
					runId: sessionId,
					sessionId: opts.sessionKey?.trim() || sessionId,
					backendId: "exec-host",
					scopeKey: opts.scopeKey,
					mode: "child",
					argv: spawnSpec.childFallbackArgv,
					cwd: opts.workdir,
					env: spawnSpec.env,
					stdinMode: "pipe-open",
					timeoutMs,
					captureOutput: false,
					onStdout: handleStdout,
					onStderr: handleStderr
				});
			} catch (retryErr) {
				await netCage?.finish().catch(() => []);
				markExited(session, null, null, "failed");
				maybeNotifyOnExit(session, "failed");
				throw retryErr;
			}
		} else {
			await netCage?.finish().catch(() => []);
			markExited(session, null, null, "failed");
			maybeNotifyOnExit(session, "failed");
			throw err;
		}
	}
	session.stdin = managedRun.stdin;
	session.pid = managedRun.pid;
	const promise = managedRun.wait().then(async (exit) => {
		updatesDisabled = true;
		for (const line of await netCage?.finish() ?? []) appendOutput(session, "stderr", `[enclawed] blocked again: ${line}\n`);
		const durationMs = Date.now() - startedAt;
		const outcome = buildExecExitOutcome({
			exit,
			aggregated: session.aggregated.trim(),
			durationMs,
			timeoutSec: opts.timeoutSec
		});
		markExited(session, exit.exitCode, exit.exitSignal, outcome.status);
		maybeNotifyOnExit(session, outcome.status);
		if (!session.child && session.stdin) session.stdin.destroyed = true;
		if (opts.sandbox?.finalizeExec) await opts.sandbox.finalizeExec({
			status: outcome.status,
			exitCode: exit.exitCode ?? null,
			timedOut: exit.timedOut,
			token: sandboxFinalizeToken
		});
		return outcome;
	}).catch(async (err) => {
		updatesDisabled = true;
		await netCage?.finish().catch(() => []);
		markExited(session, null, null, "failed");
		maybeNotifyOnExit(session, "failed");
		return buildExecRuntimeErrorOutcome({
			error: err,
			aggregated: session.aggregated.trim(),
			durationMs: Date.now() - startedAt
		});
	});
	return {
		session,
		startedAt,
		pid: session.pid ?? void 0,
		promise,
		kill: () => {
			managedRun?.cancel("manual-cancel");
		},
		disableUpdates: () => {
			updatesDisabled = true;
		}
	};
}
//#endregion
export { resolveWorkdir as C, normalizePathPrepend as D, applyPathPrepend as E, resolveSandboxWorkdir as S, truncateMiddle as T, clampWithDefault as _, DEFAULT_PENDING_MAX_OUTPUT as a, pad as b, createApprovalSlug as c, renderExecTargetLabel as d, resolveApprovalRunningNoticeMs as f, buildSandboxEnv as g, buildDockerExecArgs as h, DEFAULT_PATH as i, isRequestedExecTargetAllowed as l, runExecProcess as m, DEFAULT_APPROVAL_TIMEOUT_MS as n, applyShellPath as o, resolveExecTarget as p, DEFAULT_MAX_OUTPUT as r, buildApprovalPendingMessage as s, DEFAULT_APPROVAL_REQUEST_TIMEOUT_MS as t, normalizeNotifyOutput as u, coerceEnv as v, sliceLogLines as w, readEnvInt as x, deriveSessionName as y };
