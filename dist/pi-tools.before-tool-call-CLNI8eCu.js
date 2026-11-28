import { i as isPlainObject } from "./workspace-dir-CwLpjIOc.js";
import "./utils-BcQ7uNrT.js";
import { t as createSubsystemLogger } from "./subsystem-BCgIuXto.js";
import { t as checkEnclawedHpcCall } from "./hpc-DmbgeOUc.js";
import { n as isFsWriteTool } from "./tool-capability-map-BAuf7O3V.js";
import { c as realpathOrNearest, i as recordApprovalBindingRefusal, n as checkHardwareRootForToolCall, o as resolveIrreversibleApproval, r as planIrreversibleToolCall, t as checkAuditLogForToolCall } from "./agent-tool-guard-CAhgsJQb.js";
import { a as resolveUrlResource, i as resolveFsResource, n as approvalArgsDigest, t as ApprovalGrantLedger } from "./approval-binding-DJpS6Wuh.js";
import { r as openBoundaryFile } from "./boundary-file-read-Cr1FZoqt.js";
import { t as getGlobalHookRunner } from "./hook-runner-global-BNxB-KNn.js";
import { r as PluginApprovalResolutions } from "./types-_jqyZuut.js";
import { l as normalizeToolName } from "./tool-policy-C6fxB-Hq.js";
import { l as copyPluginToolMeta, t as copyChannelAgentToolMeta } from "./channel-tools-Q_eSKv_l.js";
import { t as checkEnclawedToolCall } from "./tool-gate-BSH9H96q.js";
import { a as createLazyRuntimeSurface } from "./lazy-runtime-BJHi9Jdt.js";
import { t as callGatewayTool } from "./gateway-CD_vF3sd.js";
import { g as writeFileWithinRoot, o as mkdirPathWithinRoot, p as removePathWithinRoot } from "./fs-safe-CTh1h50c.js";
import { t as PATH_ALIAS_POLICIES } from "./path-alias-guards-BFZxJB5t.js";
import { n as assertSandboxPath } from "./sandbox-paths-QUFkyJIm.js";
import { n as toRelativeSandboxPath, t as resolvePathFromInput } from "./path-policy-BSwgRIte.js";
import { a as runInToolReplayContext, i as resolveDirectReplay, n as TOOL_WIRE_REPLAY, r as cloneReplayResult, t as TOOL_OBSERVATION } from "./tool-replay-DzE5Xp4s.js";
import fs from "node:fs";
import path from "node:path";
import fs$1 from "node:fs/promises";
import { Type } from "@sinclair/typebox";
import { AsyncLocalStorage } from "node:async_hooks";
function isAbortSignalCancellation(err, signal) {
	if (!signal?.aborted) return false;
	if (err === signal.reason) return true;
	return err instanceof Error && err.name === "AbortError";
}
const scopedApprover = new AsyncLocalStorage();
function runWithToolCallApprover(approver, run) {
	return scopedApprover.run(approver, run);
}
async function requestToolCallApproval(req) {
	const scoped = scopedApprover.getStore();
	if (scoped) try {
		return await scoped(req);
	} catch (err) {
		return {
			kind: "error",
			error: err
		};
	}
	const timeoutMs = req.timeoutMs ?? 12e4;
	const rpcTimeoutMs = timeoutMs + 1e4;
	try {
		const requestResult = await callGatewayTool("plugin.approval.request", { timeoutMs: rpcTimeoutMs }, {
			pluginId: req.pluginId,
			title: req.title,
			description: req.description,
			severity: req.severity,
			toolName: req.toolName,
			toolCallId: req.toolCallId,
			agentId: req.agentId,
			sessionKey: req.sessionKey,
			timeoutMs,
			twoPhase: true
		}, { expectFinal: false });
		const id = requestResult?.id;
		if (!id) return { kind: "request-failed" };
		let decision;
		if (Object.prototype.hasOwnProperty.call(requestResult ?? {}, "decision")) {
			decision = requestResult?.decision;
			if (decision === null) return { kind: "no-route" };
		} else {
			const waitPromise = callGatewayTool("plugin.approval.waitDecision", { timeoutMs: rpcTimeoutMs }, { id });
			const signal = req.signal;
			let waitResult;
			if (signal) {
				let onAbort;
				const abortPromise = new Promise((_, reject) => {
					if (signal.aborted) {
						reject(signal.reason);
						return;
					}
					onAbort = () => reject(signal.reason);
					signal.addEventListener("abort", onAbort, { once: true });
				});
				try {
					waitResult = await Promise.race([waitPromise, abortPromise]);
				} finally {
					if (onAbort) signal.removeEventListener("abort", onAbort);
				}
			} else waitResult = await waitPromise;
			decision = waitResult?.decision;
		}
		if (decision === PluginApprovalResolutions.ALLOW_ONCE || decision === PluginApprovalResolutions.ALLOW_ALWAYS || decision === PluginApprovalResolutions.DENY) return {
			kind: "decision",
			decision
		};
		return {
			kind: "decision",
			decision: "timeout"
		};
	} catch (err) {
		if (isAbortSignalCancellation(err, req.signal)) return {
			kind: "aborted",
			error: err
		};
		return {
			kind: "error",
			error: err
		};
	}
}
//#endregion
//#region src/agents/apply-patch-update.ts
async function defaultReadFile(filePath) {
	return fs$1.readFile(filePath, "utf8");
}
async function applyUpdateHunk(filePath, chunks, options) {
	const originalLines = (await (options?.readFile ?? defaultReadFile)(filePath).catch((err) => {
		throw new Error(`Failed to read file to update ${filePath}: ${err}`);
	})).split("\n");
	if (originalLines.length > 0 && originalLines[originalLines.length - 1] === "") originalLines.pop();
	let newLines = applyReplacements(originalLines, computeReplacements(originalLines, filePath, chunks));
	if (newLines.length === 0 || newLines[newLines.length - 1] !== "") newLines = [...newLines, ""];
	return newLines.join("\n");
}
function computeReplacements(originalLines, filePath, chunks) {
	const replacements = [];
	let lineIndex = 0;
	for (const chunk of chunks) {
		if (chunk.changeContext) {
			const ctxIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
			if (ctxIndex === null) throw new Error(`Failed to find context '${chunk.changeContext}' in ${filePath}`);
			lineIndex = ctxIndex + 1;
		}
		if (chunk.oldLines.length === 0) {
			const insertionIndex = originalLines.length > 0 && originalLines[originalLines.length - 1] === "" ? originalLines.length - 1 : originalLines.length;
			replacements.push([
				insertionIndex,
				0,
				chunk.newLines
			]);
			continue;
		}
		let pattern = chunk.oldLines;
		let newSlice = chunk.newLines;
		let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
		if (found === null && pattern[pattern.length - 1] === "") {
			pattern = pattern.slice(0, -1);
			if (newSlice.length > 0 && newSlice[newSlice.length - 1] === "") newSlice = newSlice.slice(0, -1);
			found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
		}
		if (found === null) throw new Error(`Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join("\n")}`);
		replacements.push([
			found,
			pattern.length,
			newSlice
		]);
		lineIndex = found + pattern.length;
	}
	replacements.sort((a, b) => a[0] - b[0]);
	return replacements;
}
function applyReplacements(lines, replacements) {
	const result = [...lines];
	for (const [startIndex, oldLen, newLines] of [...replacements].toReversed()) {
		for (let i = 0; i < oldLen; i += 1) if (startIndex < result.length) result.splice(startIndex, 1);
		for (let i = 0; i < newLines.length; i += 1) result.splice(startIndex + i, 0, newLines[i]);
	}
	return result;
}
function seekSequence(lines, pattern, start, eof) {
	if (pattern.length === 0) return start;
	if (pattern.length > lines.length) return null;
	const maxStart = lines.length - pattern.length;
	const searchStart = eof && lines.length >= pattern.length ? maxStart : start;
	if (searchStart > maxStart) return null;
	for (let i = searchStart; i <= maxStart; i += 1) if (linesMatch(lines, pattern, i, (value) => value)) return i;
	for (let i = searchStart; i <= maxStart; i += 1) if (linesMatch(lines, pattern, i, (value) => value.trimEnd())) return i;
	for (let i = searchStart; i <= maxStart; i += 1) if (linesMatch(lines, pattern, i, (value) => value.trim())) return i;
	for (let i = searchStart; i <= maxStart; i += 1) if (linesMatch(lines, pattern, i, (value) => normalizePunctuation(value.trim()))) return i;
	return null;
}
function linesMatch(lines, pattern, start, normalize) {
	for (let idx = 0; idx < pattern.length; idx += 1) if (normalize(lines[start + idx]) !== normalize(pattern[idx])) return false;
	return true;
}
function normalizePunctuation(value) {
	return Array.from(value).map((char) => {
		switch (char) {
			case "‐":
			case "‑":
			case "‒":
			case "–":
			case "—":
			case "―":
			case "−": return "-";
			case "‘":
			case "’":
			case "‚":
			case "‛": return "'";
			case "“":
			case "”":
			case "„":
			case "‟": return "\"";
			case "\xA0":
			case " ":
			case " ":
			case " ":
			case " ":
			case " ":
			case " ":
			case " ":
			case " ":
			case " ":
			case " ":
			case " ":
			case "　": return " ";
			default: return char;
		}
	}).join("");
}
//#endregion
//#region src/agents/apply-patch.ts
const BEGIN_PATCH_MARKER = "*** Begin Patch";
const END_PATCH_MARKER = "*** End Patch";
const ADD_FILE_MARKER = "*** Add File: ";
const DELETE_FILE_MARKER = "*** Delete File: ";
const UPDATE_FILE_MARKER = "*** Update File: ";
const MOVE_TO_MARKER = "*** Move to: ";
const EOF_MARKER = "*** End of File";
const CHANGE_CONTEXT_MARKER = "@@ ";
const EMPTY_CHANGE_CONTEXT_MARKER = "@@";
const applyPatchSchema = Type.Object({ input: Type.String({ description: "Patch content using the *** Begin Patch/End Patch format." }) });
function createApplyPatchTool(options = {}) {
	const cwd = options.cwd ?? process.cwd();
	const sandbox = options.sandbox;
	const workspaceOnly = options.workspaceOnly !== false;
	return {
		name: "apply_patch",
		label: "apply_patch",
		description: "Apply a patch to one or more files using the apply_patch format. The input should include *** Begin Patch and *** End Patch markers.",
		parameters: applyPatchSchema,
		execute: async (_toolCallId, args, signal) => {
			const params = args;
			const input = typeof params.input === "string" ? params.input : "";
			if (!input.trim()) throw new Error("Provide a patch input.");
			if (signal?.aborted) {
				const err = /* @__PURE__ */ new Error("Aborted");
				err.name = "AbortError";
				throw err;
			}
			const result = await applyPatch(input, {
				cwd,
				sandbox,
				workspaceOnly,
				signal
			});
			return {
				content: [{
					type: "text",
					text: result.text
				}],
				details: { summary: result.summary }
			};
		}
	};
}
async function applyPatch(input, options) {
	const parsed = parsePatchText(input);
	if (parsed.hunks.length === 0) throw new Error("No files were modified.");
	const summary = {
		added: [],
		modified: [],
		deleted: []
	};
	const seen = {
		added: /* @__PURE__ */ new Set(),
		modified: /* @__PURE__ */ new Set(),
		deleted: /* @__PURE__ */ new Set()
	};
	const fileOps = resolvePatchFileOps(options);
	for (const hunk of parsed.hunks) {
		if (options.signal?.aborted) {
			const err = /* @__PURE__ */ new Error("Aborted");
			err.name = "AbortError";
			throw err;
		}
		if (hunk.kind === "add") {
			const target = await resolvePatchPath(hunk.path, options);
			await ensureDir(target.resolved, fileOps);
			await fileOps.writeFile(target.resolved, hunk.contents);
			recordSummary(summary, seen, "added", target.display);
			continue;
		}
		if (hunk.kind === "delete") {
			const target = await resolvePatchPath(hunk.path, options, PATH_ALIAS_POLICIES.unlinkTarget);
			await fileOps.remove(target.resolved);
			recordSummary(summary, seen, "deleted", target.display);
			continue;
		}
		const target = await resolvePatchPath(hunk.path, options);
		const applied = await applyUpdateHunk(target.resolved, hunk.chunks, { readFile: (path) => fileOps.readFile(path) });
		if (hunk.movePath) {
			const moveTarget = await resolvePatchPath(hunk.movePath, options);
			await ensureDir(moveTarget.resolved, fileOps);
			await fileOps.writeFile(moveTarget.resolved, applied);
			await fileOps.remove(target.resolved);
			recordSummary(summary, seen, "modified", moveTarget.display);
		} else {
			await fileOps.writeFile(target.resolved, applied);
			recordSummary(summary, seen, "modified", target.display);
		}
	}
	return {
		summary,
		text: formatSummary(summary)
	};
}
function recordSummary(summary, seen, bucket, value) {
	if (seen[bucket].has(value)) return;
	seen[bucket].add(value);
	summary[bucket].push(value);
}
function formatSummary(summary) {
	const lines = ["Success. Updated the following files:"];
	for (const file of summary.added) lines.push(`A ${file}`);
	for (const file of summary.modified) lines.push(`M ${file}`);
	for (const file of summary.deleted) lines.push(`D ${file}`);
	return lines.join("\n");
}
function resolvePatchFileOps(options) {
	if (options.sandbox) {
		const { root, bridge } = options.sandbox;
		return {
			readFile: async (filePath) => {
				return (await bridge.readFile({
					filePath,
					cwd: root
				})).toString("utf8");
			},
			writeFile: (filePath, content) => bridge.writeFile({
				filePath,
				cwd: root,
				data: content
			}),
			remove: (filePath) => bridge.remove({
				filePath,
				cwd: root,
				force: false
			}),
			mkdirp: (dir) => bridge.mkdirp({
				filePath: dir,
				cwd: root
			})
		};
	}
	const workspaceOnly = options.workspaceOnly !== false;
	return {
		readFile: async (filePath) => {
			if (!workspaceOnly) return await fs$1.readFile(filePath, "utf8");
			const opened = await openBoundaryFile({
				absolutePath: filePath,
				rootPath: options.cwd,
				boundaryLabel: "workspace root"
			});
			assertBoundaryRead(opened, filePath);
			try {
				return fs.readFileSync(opened.fd, "utf8");
			} finally {
				fs.closeSync(opened.fd);
			}
		},
		writeFile: async (filePath, content) => {
			if (!workspaceOnly) {
				await fs$1.writeFile(filePath, content, "utf8");
				return;
			}
			const relative = toRelativeSandboxPath(options.cwd, filePath);
			await writeFileWithinRoot({
				rootDir: options.cwd,
				relativePath: relative,
				data: content,
				encoding: "utf8"
			});
		},
		remove: async (filePath) => {
			if (!workspaceOnly) {
				await fs$1.rm(filePath);
				return;
			}
			const relative = toRelativeSandboxPath(options.cwd, filePath);
			await removePathWithinRoot({
				rootDir: options.cwd,
				relativePath: relative
			});
		},
		mkdirp: async (dir) => {
			if (!workspaceOnly) {
				await fs$1.mkdir(dir, { recursive: true });
				return;
			}
			const relative = toRelativeSandboxPath(options.cwd, dir, { allowRoot: true });
			await mkdirPathWithinRoot({
				rootDir: options.cwd,
				relativePath: relative,
				allowRoot: true
			});
		}
	};
}
async function ensureDir(filePath, ops) {
	const parent = path.dirname(filePath);
	if (!parent || parent === ".") return;
	await ops.mkdirp(parent);
}
async function resolvePatchPath(filePath, options, aliasPolicy = PATH_ALIAS_POLICIES.strict) {
	if (options.sandbox) {
		const resolved = options.sandbox.bridge.resolvePath({
			filePath,
			cwd: options.cwd
		});
		if (options.workspaceOnly !== false && resolved.hostPath) await assertSandboxPath({
			filePath: resolved.hostPath,
			cwd: options.cwd,
			root: options.cwd,
			allowFinalSymlinkForUnlink: aliasPolicy.allowFinalSymlinkForUnlink,
			allowFinalHardlinkForUnlink: aliasPolicy.allowFinalHardlinkForUnlink
		});
		return {
			resolved: resolved.hostPath ?? resolved.containerPath,
			display: resolved.relativePath || resolved.containerPath
		};
	}
	const resolved = options.workspaceOnly !== false ? (await assertSandboxPath({
		filePath,
		cwd: options.cwd,
		root: options.cwd,
		allowFinalSymlinkForUnlink: aliasPolicy.allowFinalSymlinkForUnlink,
		allowFinalHardlinkForUnlink: aliasPolicy.allowFinalHardlinkForUnlink
	})).resolved : resolvePathFromInput(filePath, options.cwd);
	return {
		resolved,
		display: toDisplayPath(resolved, options.cwd)
	};
}
function assertBoundaryRead(opened, targetPath) {
	if (opened.ok) return;
	const reason = opened.reason === "validation" ? "unsafe path" : "path not found";
	throw new Error(`Failed boundary read for ${targetPath} (${reason})`);
}
function toDisplayPath(resolved, cwd) {
	const relative = path.relative(cwd, resolved);
	if (!relative || relative === "") return path.basename(resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) return resolved;
	return relative;
}
/**
* Every path a patch writes or deletes, in order, without touching disk.
* An update with a move writes the destination and deletes the source.
* Returns null when the patch does not parse (the tool would refuse it too).
*/
function listApplyPatchTargets(input) {
	let hunks;
	try {
		hunks = parsePatchText(input).hunks;
	} catch {
		return null;
	}
	const out = [];
	for (const hunk of hunks) if (hunk.kind === "add") out.push({
		path: hunk.path,
		op: "write"
	});
	else if (hunk.kind === "delete") out.push({
		path: hunk.path,
		op: "delete"
	});
	else if (hunk.movePath) out.push({
		path: hunk.movePath,
		op: "write"
	}, {
		path: hunk.path,
		op: "delete"
	});
	else out.push({
		path: hunk.path,
		op: "edit"
	});
	return out;
}
function parsePatchText(input) {
	const trimmed = input.trim();
	if (!trimmed) throw new Error("Invalid patch: input is empty.");
	const validated = checkPatchBoundariesLenient(trimmed.split(/\r?\n/));
	const hunks = [];
	const lastLineIndex = validated.length - 1;
	let remaining = validated.slice(1, lastLineIndex);
	let lineNumber = 2;
	while (remaining.length > 0) {
		const { hunk, consumed } = parseOneHunk(remaining, lineNumber);
		hunks.push(hunk);
		lineNumber += consumed;
		remaining = remaining.slice(consumed);
	}
	return {
		hunks,
		patch: validated.join("\n")
	};
}
function checkPatchBoundariesLenient(lines) {
	const strictError = checkPatchBoundariesStrict(lines);
	if (!strictError) return lines;
	if (lines.length < 4) throw new Error(strictError);
	const first = lines[0];
	const last = lines[lines.length - 1];
	if ((first === "<<EOF" || first === "<<'EOF'" || first === "<<\"EOF\"") && last.endsWith("EOF")) {
		const inner = lines.slice(1, lines.length - 1);
		const innerError = checkPatchBoundariesStrict(inner);
		if (!innerError) return inner;
		throw new Error(innerError);
	}
	throw new Error(strictError);
}
function checkPatchBoundariesStrict(lines) {
	const firstLine = lines[0]?.trim();
	const lastLine = lines[lines.length - 1]?.trim();
	if (firstLine === BEGIN_PATCH_MARKER && lastLine === END_PATCH_MARKER) return null;
	if (firstLine !== BEGIN_PATCH_MARKER) return "The first line of the patch must be '*** Begin Patch'";
	return "The last line of the patch must be '*** End Patch'";
}
function parseOneHunk(lines, lineNumber) {
	if (lines.length === 0) throw new Error(`Invalid patch hunk at line ${lineNumber}: empty hunk`);
	const firstLine = lines[0].trim();
	if (firstLine.startsWith(ADD_FILE_MARKER)) {
		const targetPath = firstLine.slice(14);
		let contents = "";
		let consumed = 1;
		for (const addLine of lines.slice(1)) if (addLine.startsWith("+")) {
			contents += `${addLine.slice(1)}\n`;
			consumed += 1;
		} else break;
		return {
			hunk: {
				kind: "add",
				path: targetPath,
				contents
			},
			consumed
		};
	}
	if (firstLine.startsWith(DELETE_FILE_MARKER)) return {
		hunk: {
			kind: "delete",
			path: firstLine.slice(17)
		},
		consumed: 1
	};
	if (firstLine.startsWith(UPDATE_FILE_MARKER)) {
		const targetPath = firstLine.slice(17);
		let remaining = lines.slice(1);
		let consumed = 1;
		let movePath;
		const moveCandidate = remaining[0]?.trim();
		if (moveCandidate?.startsWith(MOVE_TO_MARKER)) {
			movePath = moveCandidate.slice(13);
			remaining = remaining.slice(1);
			consumed += 1;
		}
		const chunks = [];
		while (remaining.length > 0) {
			if (remaining[0].trim() === "") {
				remaining = remaining.slice(1);
				consumed += 1;
				continue;
			}
			if (remaining[0].startsWith("***")) break;
			const { chunk, consumed: chunkLines } = parseUpdateFileChunk(remaining, lineNumber + consumed, chunks.length === 0);
			chunks.push(chunk);
			remaining = remaining.slice(chunkLines);
			consumed += chunkLines;
		}
		if (chunks.length === 0) throw new Error(`Invalid patch hunk at line ${lineNumber}: Update file hunk for path '${targetPath}' is empty`);
		return {
			hunk: {
				kind: "update",
				path: targetPath,
				movePath,
				chunks
			},
			consumed
		};
	}
	throw new Error(`Invalid patch hunk at line ${lineNumber}: '${lines[0]}' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`);
}
function parseUpdateFileChunk(lines, lineNumber, allowMissingContext) {
	if (lines.length === 0) throw new Error(`Invalid patch hunk at line ${lineNumber}: Update hunk does not contain any lines`);
	let changeContext;
	let startIndex = 0;
	if (lines[0] === EMPTY_CHANGE_CONTEXT_MARKER) startIndex = 1;
	else if (lines[0].startsWith(CHANGE_CONTEXT_MARKER)) {
		changeContext = lines[0].slice(3);
		startIndex = 1;
	} else if (!allowMissingContext) throw new Error(`Invalid patch hunk at line ${lineNumber}: Expected update hunk to start with a @@ context marker, got: '${lines[0]}'`);
	if (startIndex >= lines.length) throw new Error(`Invalid patch hunk at line ${lineNumber + 1}: Update hunk does not contain any lines`);
	const chunk = {
		changeContext,
		oldLines: [],
		newLines: [],
		isEndOfFile: false
	};
	let parsedLines = 0;
	for (const line of lines.slice(startIndex)) {
		if (line === EOF_MARKER) {
			if (parsedLines === 0) throw new Error(`Invalid patch hunk at line ${lineNumber + 1}: Update hunk does not contain any lines`);
			chunk.isEndOfFile = true;
			parsedLines += 1;
			break;
		}
		const marker = line[0];
		if (!marker) {
			chunk.oldLines.push("");
			chunk.newLines.push("");
			parsedLines += 1;
			continue;
		}
		if (marker === " ") {
			const content = line.slice(1);
			chunk.oldLines.push(content);
			chunk.newLines.push(content);
			parsedLines += 1;
			continue;
		}
		if (marker === "+") {
			chunk.newLines.push(line.slice(1));
			parsedLines += 1;
			continue;
		}
		if (marker === "-") {
			chunk.oldLines.push(line.slice(1));
			parsedLines += 1;
			continue;
		}
		if (parsedLines === 0) throw new Error(`Invalid patch hunk at line ${lineNumber + 1}: Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`);
		break;
	}
	return {
		chunk,
		consumed: parsedLines + startIndex
	};
}
//#endregion
//#region src/agents/tool-call-fs-targets.ts
function resolveFsCallTargets(toolName, params, where) {
	if (!isFsWriteTool(toolName)) return;
	const sandbox = where.fsSandbox;
	const root = sandbox ? sandbox.root : where.fsRoot;
	if (!root) return {
		targets: null,
		unresolved: "no-file-bridge"
	};
	const located = sandbox ? { sandbox } : { fsRoot: root };
	if (!isPlainObject(params)) return {
		targets: null,
		unresolved: "unresolvable-path",
		...located
	};
	const resolve = (p, op) => {
		let absPath = null;
		try {
			absPath = p.trim() ? resolvePathFromInput(p, root) : null;
		} catch {
			absPath = null;
		}
		return {
			path: p,
			absPath,
			op
		};
	};
	if (toolName === "apply_patch") {
		const listed = typeof params.input === "string" ? listApplyPatchTargets(params.input) : null;
		if (!listed || listed.length === 0) return {
			targets: null,
			unresolved: "unresolvable-path",
			...located
		};
		return {
			targets: listed.map((t) => resolve(t.path, t.op)),
			...located
		};
	}
	if (typeof params.path !== "string") return {
		targets: null,
		unresolved: "unresolvable-path",
		...located
	};
	return {
		targets: [resolve(params.path, toolName === "edit" ? "edit" : "write")],
		...located
	};
}
//#endregion
//#region src/agents/tool-call-approval-grant.ts
const GRANT_SLACK_MS = 1e4;
const ledger = new ApprovalGrantLedger();
/**
* The resources a call touches, resolved now: the host files a file tool
* writes, and the URL a tool fetches or posts to. Sandboxed file targets are
* bound by their arguments only (the sandbox's own file bridge resolves them).
*/
async function resolveToolCallResources(toolName, params, where) {
	const resources = [];
	const fs = resolveFsCallTargets(toolName, params, where);
	if (fs?.targets && !fs.sandbox) {
		for (const target of fs.targets) if (target.absPath) resources.push(await resolveFsResource(target.absPath));
	}
	if (isPlainObject(params)) for (const key of ["url", "targetUrl"]) {
		const value = params[key];
		const url = typeof value === "string" ? resolveUrlResource(value) : null;
		if (url) resources.push(url);
	}
	return resources;
}
async function issueToolCallGrant(params) {
	const resources = await resolveToolCallResources(params.toolName, params.args, params.where);
	return ledger.issue({
		tool: params.toolName,
		args: params.args,
		resources
	}, { ttlMs: (params.timeoutMs ?? 12e4) + GRANT_SLACK_MS });
}
function approveToolCallGrant(id) {
	return ledger.approve(id);
}
function revokeToolCallGrant(id) {
	ledger.revoke(id);
}
/** Spend the grant on the call as it is now; refused unless it is the approved call. */
async function consumeToolCallGrant(params) {
	const resources = await resolveToolCallResources(params.toolName, params.args, params.where);
	return ledger.consume(params.grantId, {
		tool: params.toolName,
		args: params.args,
		resources
	});
}
const PREVIEW_MAX = 300;
/** The lines added to an approval request so the person sees what they approve. */
function describeGrantForApproval(grant, args) {
	const lines = [];
	for (const r of grant.resources) lines.push(r.type === "fs" ? `Target: ${r.absPath}` : `Target: ${r.url}`);
	let preview;
	try {
		preview = JSON.stringify(args ?? null) ?? "null";
	} catch {
		preview = "(not serializable)";
	}
	if (preview.length > PREVIEW_MAX) preview = `${preview.slice(0, PREVIEW_MAX)}…`;
	lines.push(`Arguments: ${preview}`);
	lines.push(`This approval is for this exact call only (arguments ${approvalArgsDigest(args).slice(0, 12)}).`);
	return lines.join("\n");
}
//#endregion
//#region src/agents/tool-observation.ts
async function writeObservation(params, where) {
	if (typeof params.content !== "string") return null;
	const resolved = resolveFsCallTargets("write", params, where);
	const target = resolved?.targets?.length === 1 ? resolved.targets[0] : null;
	if (!target?.absPath) return null;
	const sandbox = where.fsSandbox;
	let filePath;
	let hostPath = null;
	if (sandbox) try {
		const at = sandbox.files.resolvePath({
			filePath: target.absPath,
			cwd: sandbox.root
		});
		filePath = at.hostPath ?? at.containerPath;
		hostPath = at.hostPath ?? null;
	} catch {
		return null;
	}
	else {
		filePath = await realpathOrNearest(target.absPath);
		hostPath = filePath;
	}
	const identity = hostPath ? await fileIdentity(hostPath) : null;
	return {
		type: "file-write",
		path: filePath,
		content: params.content,
		...identity ? { identity } : {}
	};
}
/** Identity of an existing regular file (`dev:ino:birthtimeNs`), else null. */
async function fileIdentity(filePath) {
	try {
		const st = await fs$1.stat(filePath, { bigint: true });
		return st.isFile() ? `${st.dev}:${st.ino}:${st.birthtimeNs}` : null;
	} catch {
		return null;
	}
}
/**
* The observation declaration of a host tool, or undefined when the host
* declares none (the batcher then refuses the tool if it is batched).
*/
function hostToolObservation(toolName, where) {
	if (toolName.trim().toLowerCase() === "write" && (where.fsRoot || where.fsSandbox)) return (params) => writeObservation(params, where);
}
//#endregion
//#region src/agents/pi-tools.before-tool-call.ts
/**
* A tool call refused by a before_tool_call hook.
*
* A policy refusal used to be thrown as a bare Error, so every consumer saw it
* as an execution failure. That matters at the Codex app-server boundary: a
* failure invites a retry, and retrying a policy decision just re-runs the gate,
* while the model is told the tool "errored" rather than that it was refused.
* A distinct type lets a caller report the refusal as a completed call whose
* answer is "no" -- terminal and legible -- and still be caught by anything
* handling plain Errors.
*/
var ToolCallBlockedError = class extends Error {
	constructor(reason) {
		super(reason);
		this.blocked = true;
		this.name = "ToolCallBlockedError";
	}
};
/**
* Identify a block across module instances.
*
* The suite runs with `isolate: false`, so a class identity check can fail when
* two copies of this module exist; the marker survives that.
*/
function isToolCallBlockedError(value) {
	return value instanceof Error && (value.blocked === true || value.name === "ToolCallBlockedError");
}
const log = createSubsystemLogger("agents/tools");
const BEFORE_TOOL_CALL_WRAPPED = Symbol("beforeToolCallWrapped");
const BEFORE_TOOL_CALL_HOOK_FAILURE_REASON = "Tool call blocked because before_tool_call hook failed";
const adjustedParamsByToolCallId = /* @__PURE__ */ new Map();
const MAX_TRACKED_ADJUSTED_PARAMS = 1024;
const LOOP_WARNING_BUCKET_SIZE = 10;
const MAX_LOOP_WARNING_KEYS = 256;
const loadBeforeToolCallRuntime = createLazyRuntimeSurface(() => import("./pi-tools.before-tool-call.runtime-C5Q1tfNN.js"), ({ beforeToolCallRuntime }) => beforeToolCallRuntime);
function buildAdjustedParamsKey(params) {
	if (params.runId && params.runId.trim()) return `${params.runId}:${params.toolCallId}`;
	return params.toolCallId;
}
function mergeParamsWithApprovalOverrides(originalParams, approvalParams) {
	if (approvalParams && isPlainObject(approvalParams)) {
		if (isPlainObject(originalParams)) return {
			...originalParams,
			...approvalParams
		};
		return approvalParams;
	}
	return originalParams;
}
function unwrapErrorCause(err) {
	if (err instanceof Error && err.cause !== void 0) return err.cause;
	return err;
}
function shouldEmitLoopWarning(state, warningKey, count) {
	if (!state.toolLoopWarningBuckets) state.toolLoopWarningBuckets = /* @__PURE__ */ new Map();
	const bucket = Math.floor(count / LOOP_WARNING_BUCKET_SIZE);
	if (bucket <= (state.toolLoopWarningBuckets.get(warningKey) ?? 0)) return false;
	state.toolLoopWarningBuckets.set(warningKey, bucket);
	if (state.toolLoopWarningBuckets.size > MAX_LOOP_WARNING_KEYS) {
		const oldest = state.toolLoopWarningBuckets.keys().next().value;
		if (oldest) state.toolLoopWarningBuckets.delete(oldest);
	}
	return true;
}
async function recordLoopOutcome(args) {
	if (!args.ctx?.sessionKey) return;
	try {
		const { getDiagnosticSessionState, recordToolCallOutcome } = await loadBeforeToolCallRuntime();
		recordToolCallOutcome(getDiagnosticSessionState({
			sessionKey: args.ctx.sessionKey,
			sessionId: args.ctx?.agentId
		}), {
			toolName: args.toolName,
			toolParams: args.toolParams,
			toolCallId: args.toolCallId,
			result: args.result,
			error: args.error,
			config: args.ctx.loopDetection
		});
	} catch (err) {
		log.warn(`tool loop outcome tracking failed: tool=${args.toolName} error=${String(err)}`);
	}
}
async function runBeforeToolCallHook(args) {
	const toolName = normalizeToolName(args.toolName || "tool");
	const guardCtx = {
		agentId: args.ctx?.agentId,
		sessionKey: args.ctx?.sessionKey,
		toolCallId: args.toolCallId
	};
	const hardware = checkHardwareRootForToolCall(toolName, guardCtx);
	if (!hardware.allowed) return {
		blocked: true,
		reason: `enclawed hardware root: ${hardware.reason}`
	};
	const auditGate = await checkAuditLogForToolCall();
	if (!auditGate.allowed) return {
		blocked: true,
		reason: `enclawed audit: ${auditGate.reason}`
	};
	const outcome = await runToolCallGates(args, toolName);
	if (outcome.blocked) return outcome;
	const plan = await planIrreversibleToolCall(toolName, guardCtx, {
		hookApproved: outcome.hookApproved === true,
		fs: resolveFsCallTargets(toolName, outcome.params, {
			fsRoot: args.ctx?.fsRoot,
			fsSandbox: args.ctx?.fsSandbox
		})
	});
	if (plan.kind === "refused") return {
		blocked: true,
		reason: `enclawed: ${plan.reason}`
	};
	if (plan.kind === "proceed") {
		const recorded = await checkAuditLogForToolCall();
		if (!recorded.allowed) return {
			blocked: true,
			reason: `enclawed audit: ${recorded.reason}`
		};
		return {
			blocked: false,
			params: outcome.params
		};
	}
	const where = {
		fsRoot: args.ctx?.fsRoot,
		fsSandbox: args.ctx?.fsSandbox
	};
	const grant = await issueToolCallGrant({
		toolName,
		args: outcome.params,
		where
	});
	const wait = await requestToolCallApproval({
		pluginId: "enclawed",
		title: plan.title,
		description: `${plan.description}\n${describeGrantForApproval(grant, outcome.params)}`,
		severity: "warning",
		toolName,
		toolCallId: args.toolCallId,
		agentId: args.ctx?.agentId,
		sessionKey: args.ctx?.sessionKey,
		signal: args.signal
	});
	if (wait.kind === "error") log.warn(`enclawed approval request failed, refusing the call: ${String(wait.error)}`);
	const result = wait.kind === "decision" ? wait.decision : wait.kind === "aborted" ? "cancelled" : wait.kind === "no-route" ? "no-route" : "unavailable";
	if (resolveIrreversibleApproval(toolName, guardCtx, plan.classification, result)) {
		approveToolCallGrant(grant.id);
		const bound = await consumeToolCallGrant({
			grantId: grant.id,
			toolName,
			args: outcome.params,
			where
		});
		if (!bound.ok) {
			recordApprovalBindingRefusal(toolName, guardCtx, bound.code, bound.reason);
			return {
				blocked: true,
				reason: `enclawed: the approval for "${toolName}" does not cover this call (${bound.reason}); it must be approved again`
			};
		}
		const recorded = await checkAuditLogForToolCall();
		if (!recorded.allowed) return {
			blocked: true,
			reason: `enclawed audit: ${recorded.reason}`
		};
		return {
			blocked: false,
			params: outcome.params
		};
	}
	revokeToolCallGrant(grant.id);
	return {
		blocked: true,
		reason: `enclawed: irreversible action "${toolName}" not approved (${result})`
	};
}
async function runToolCallGates(args, toolName) {
	const params = args.params;
	const enclawedDecision = checkEnclawedToolCall(toolName, args.ctx?.agentId);
	if (!enclawedDecision.allowed) return {
		blocked: true,
		reason: `enclawed policy: ${enclawedDecision.reason}`
	};
	if (toolName === "exec" && isPlainObject(params)) {
		const hpc = checkEnclawedHpcCall(params.command, params.workdir, args.ctx?.agentId, params.env);
		if (hpc && !hpc.allowed) return {
			blocked: true,
			reason: `enclawed hpc policy: ${hpc.reasons.join("; ")}`
		};
	}
	if (args.ctx?.sessionKey) {
		const { getDiagnosticSessionState, logToolLoopAction, detectToolCallLoop, recordToolCall } = await loadBeforeToolCallRuntime();
		const sessionState = getDiagnosticSessionState({
			sessionKey: args.ctx.sessionKey,
			sessionId: args.ctx?.agentId
		});
		const loopResult = detectToolCallLoop(sessionState, toolName, params, args.ctx.loopDetection);
		if (loopResult.stuck) {
			if (loopResult.level === "critical") {
				log.error(`Blocking ${toolName} due to critical loop: ${loopResult.message}`);
				logToolLoopAction({
					sessionKey: args.ctx.sessionKey,
					sessionId: args.ctx?.agentId,
					toolName,
					level: "critical",
					action: "block",
					detector: loopResult.detector,
					count: loopResult.count,
					message: loopResult.message,
					pairedToolName: loopResult.pairedToolName
				});
				return {
					blocked: true,
					reason: loopResult.message
				};
			} else if (shouldEmitLoopWarning(sessionState, loopResult.warningKey ?? `${loopResult.detector}:${toolName}`, loopResult.count)) {
				log.warn(`Loop warning for ${toolName}: ${loopResult.message}`);
				logToolLoopAction({
					sessionKey: args.ctx.sessionKey,
					sessionId: args.ctx?.agentId,
					toolName,
					level: "warning",
					action: "warn",
					detector: loopResult.detector,
					count: loopResult.count,
					message: loopResult.message,
					pairedToolName: loopResult.pairedToolName
				});
			}
		}
		recordToolCall(sessionState, toolName, params, args.toolCallId, args.ctx.loopDetection);
	}
	const hookRunner = getGlobalHookRunner();
	if (!hookRunner?.hasHooks("before_tool_call")) return {
		blocked: false,
		params: args.params
	};
	try {
		const normalizedParams = isPlainObject(params) ? params : {};
		const toolContext = {
			toolName,
			...args.ctx?.agentId && { agentId: args.ctx.agentId },
			...args.ctx?.sessionKey && { sessionKey: args.ctx.sessionKey },
			...args.ctx?.sessionId && { sessionId: args.ctx.sessionId },
			...args.ctx?.runId && { runId: args.ctx.runId },
			...args.toolCallId && { toolCallId: args.toolCallId }
		};
		const hookResult = await hookRunner.runBeforeToolCall({
			toolName,
			params: normalizedParams,
			...args.ctx?.runId && { runId: args.ctx.runId },
			...args.toolCallId && { toolCallId: args.toolCallId }
		}, toolContext);
		if (hookResult?.block) return {
			blocked: true,
			reason: hookResult.blockReason || "Tool call blocked by plugin hook"
		};
		if (hookResult?.requireApproval) {
			const approval = hookResult.requireApproval;
			const safeOnResolution = (resolution) => {
				const onResolution = approval.onResolution;
				if (typeof onResolution !== "function") return;
				try {
					Promise.resolve(onResolution(resolution)).catch((err) => {
						log.warn(`plugin onResolution callback failed: ${String(err)}`);
					});
				} catch (err) {
					log.warn(`plugin onResolution callback failed: ${String(err)}`);
				}
			};
			const approvedParams = mergeParamsWithApprovalOverrides(params, hookResult.params);
			const where = {
				fsRoot: args.ctx?.fsRoot,
				fsSandbox: args.ctx?.fsSandbox
			};
			const grant = await issueToolCallGrant({
				toolName,
				args: approvedParams,
				where,
				timeoutMs: approval.timeoutMs
			});
			const wait = await requestToolCallApproval({
				pluginId: approval.pluginId,
				title: approval.title,
				description: approval.description,
				severity: approval.severity,
				timeoutMs: approval.timeoutMs,
				toolName,
				toolCallId: args.toolCallId,
				agentId: args.ctx?.agentId,
				sessionKey: args.ctx?.sessionKey,
				signal: args.signal
			});
			switch (wait.kind) {
				case "request-failed":
					safeOnResolution(PluginApprovalResolutions.CANCELLED);
					return {
						blocked: true,
						reason: approval.description || "Plugin approval request failed"
					};
				case "no-route":
					safeOnResolution(PluginApprovalResolutions.CANCELLED);
					return {
						blocked: true,
						reason: "Plugin approval unavailable (no approval route)"
					};
				case "aborted":
					safeOnResolution(PluginApprovalResolutions.CANCELLED);
					log.warn(`plugin approval wait cancelled by run abort: ${String(wait.error)}`);
					return {
						blocked: true,
						reason: "Approval cancelled (run aborted)"
					};
				case "error":
					safeOnResolution(PluginApprovalResolutions.CANCELLED);
					log.warn(`plugin approval gateway request failed, falling back to block: ${String(wait.error)}`);
					return {
						blocked: true,
						reason: "Plugin approval required (gateway unavailable)"
					};
				case "decision": break;
			}
			safeOnResolution(wait.decision);
			if (wait.decision === "allow-once" || wait.decision === "allow-always") {
				approveToolCallGrant(grant.id);
				const runParams = mergeParamsWithApprovalOverrides(params, hookResult.params);
				const bound = await consumeToolCallGrant({
					grantId: grant.id,
					toolName,
					args: runParams,
					where
				});
				if (!bound.ok) {
					recordApprovalBindingRefusal(toolName, args.ctx ?? {}, bound.code, bound.reason);
					return {
						blocked: true,
						reason: `The approval does not cover this call (${bound.reason}); it must be approved again`
					};
				}
				return {
					blocked: false,
					params: runParams,
					hookApproved: true
				};
			}
			revokeToolCallGrant(grant.id);
			if (wait.decision === "deny") return {
				blocked: true,
				reason: "Denied by user"
			};
			if ((approval.timeoutBehavior ?? "deny") === "allow") return {
				blocked: false,
				params: mergeParamsWithApprovalOverrides(params, hookResult.params)
			};
			return {
				blocked: true,
				reason: "Approval timed out"
			};
		}
		if (hookResult?.params) return {
			blocked: false,
			params: mergeParamsWithApprovalOverrides(params, hookResult.params)
		};
	} catch (err) {
		const toolCallId = args.toolCallId ? ` toolCallId=${args.toolCallId}` : "";
		const cause = unwrapErrorCause(err);
		log.error(`before_tool_call hook failed: tool=${toolName}${toolCallId} error=${String(cause)}`);
		return {
			blocked: true,
			reason: BEFORE_TOOL_CALL_HOOK_FAILURE_REASON
		};
	}
	return {
		blocked: false,
		params
	};
}
/** Run a tool's execute, recording its outcome when the call asks for it. */
async function executeRecorded(call, run) {
	let result;
	try {
		result = await run();
	} catch (err) {
		if (call.directive?.kind === "record") call.outcome = {
			ok: false,
			error: err,
			wire: call.wire
		};
		throw err;
	}
	if (call.directive?.kind === "record") call.outcome = {
		ok: true,
		result: cloneReplayResult(result),
		wire: call.wire
	};
	return result;
}
/**
* Re-issue a recorded call for the egress batcher's scheduled refresh: the
* same tool and parameters, in a fresh replay context marked as a refresh.
* The halting gates still apply (a hardware root that is no longer CLEAN, or
* an audit log that cannot record), and a halted refresh changes nothing.
*/
async function rerunRecorded(original, ctx, run) {
	const guardCtx = {
		agentId: ctx?.agentId,
		sessionKey: ctx?.sessionKey,
		toolCallId: original.toolCallId
	};
	if (!checkHardwareRootForToolCall(normalizeToolName(original.toolName), guardCtx).allowed) return null;
	if (!(await checkAuditLogForToolCall()).allowed) return null;
	const again = {
		toolName: original.toolName,
		toolCallId: original.toolCallId,
		...original.runId ? { runId: original.runId } : {},
		wireReplay: original.wireReplay,
		directive: {
			kind: "record",
			refresh: true
		},
		executed: true
	};
	await runInToolReplayContext(again, () => executeRecorded(again, run)).catch(() => void 0);
	return again.outcome ?? null;
}
function wrapToolWithBeforeToolCallHook(tool, ctx) {
	const execute = tool.execute;
	if (!execute) return tool;
	const toolName = tool.name || "tool";
	const wireReplay = tool[TOOL_WIRE_REPLAY] === true;
	const declared = tool[TOOL_OBSERVATION];
	const observe = typeof declared === "function" ? async (p) => await declared(p) ?? null : hostToolObservation(toolName, {
		fsRoot: ctx?.fsRoot,
		fsSandbox: ctx?.fsSandbox
	});
	const wrappedTool = {
		...tool,
		execute: (toolCallId, params, signal, onUpdate) => {
			const call = {
				toolName,
				toolCallId,
				...ctx?.runId ? { runId: ctx.runId } : {},
				wireReplay,
				...observe ? { observe } : {},
				executed: false
			};
			return runInToolReplayContext(call, () => executeWrapped(call, toolCallId, params, signal, onUpdate));
		}
	};
	const executeWrapped = async (call, ...[toolCallId, params, signal, onUpdate]) => {
		const outcome = await runBeforeToolCallHook({
			toolName,
			params,
			toolCallId,
			ctx,
			signal
		});
		if (outcome.blocked) throw new ToolCallBlockedError(outcome.reason);
		if (toolCallId) {
			const adjustedParamsKey = buildAdjustedParamsKey({
				runId: ctx?.runId,
				toolCallId
			});
			adjustedParamsByToolCallId.set(adjustedParamsKey, outcome.params);
			if (adjustedParamsByToolCallId.size > MAX_TRACKED_ADJUSTED_PARAMS) {
				const oldest = adjustedParamsByToolCallId.keys().next().value;
				if (oldest) adjustedParamsByToolCallId.delete(oldest);
			}
		}
		const normalizedToolName = normalizeToolName(toolName || "tool");
		try {
			let result;
			const replay = resolveDirectReplay(call);
			if (replay) {
				if (!replay.ok) throw replay.error;
				result = cloneReplayResult(replay.result);
			} else {
				call.executed = true;
				if (call.directive?.kind === "record") call.rerun = () => rerunRecorded(call, ctx, () => execute(toolCallId, outcome.params, void 0, void 0));
				result = await executeRecorded(call, () => execute(toolCallId, outcome.params, signal, onUpdate));
			}
			await recordLoopOutcome({
				ctx,
				toolName: normalizedToolName,
				toolParams: outcome.params,
				toolCallId,
				result
			});
			return result;
		} catch (err) {
			await recordLoopOutcome({
				ctx,
				toolName: normalizedToolName,
				toolParams: outcome.params,
				toolCallId,
				error: err
			});
			throw err;
		}
	};
	copyPluginToolMeta(tool, wrappedTool);
	copyChannelAgentToolMeta(tool, wrappedTool);
	Object.defineProperty(wrappedTool, BEFORE_TOOL_CALL_WRAPPED, {
		value: true,
		enumerable: true
	});
	return wrappedTool;
}
function isToolWrappedWithBeforeToolCallHook(tool) {
	return tool[BEFORE_TOOL_CALL_WRAPPED] === true;
}
function consumeAdjustedParamsForToolCall(toolCallId, runId) {
	const adjustedParamsKey = buildAdjustedParamsKey({
		runId,
		toolCallId
	});
	const params = adjustedParamsByToolCallId.get(adjustedParamsKey);
	adjustedParamsByToolCallId.delete(adjustedParamsKey);
	return params;
}
const __testing = {
	BEFORE_TOOL_CALL_WRAPPED,
	buildAdjustedParamsKey,
	adjustedParamsByToolCallId,
	runBeforeToolCallHook,
	mergeParamsWithApprovalOverrides,
	isPlainObject
};
//#endregion
export { isToolWrappedWithBeforeToolCallHook as a, createApplyPatchTool as c, isToolCallBlockedError as i, runWithToolCallApprover as l, __testing as n, runBeforeToolCallHook as o, consumeAdjustedParamsForToolCall as r, wrapToolWithBeforeToolCallHook as s, ToolCallBlockedError as t };
