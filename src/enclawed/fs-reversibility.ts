// Per-call reversibility of agent file writes (write, edit, apply_patch, and
// the deletes apply_patch can express).
//
// A write is reversible when its history exists or is irrelevant:
//   - scratch: the target is inside a scratch location (the gateway's own
//     temp directory or enclawed.policy.scratchPaths). History is irrelevant
//     there, so nothing is snapshotted and no-history settings do not apply.
//   - snapshot: before the write runs, the target's current content (or the
//     fact that it does not exist yet) is stored in the local history store
//     (./history-store.ts). A delete's snapshot is the deleted content.
//   - git-clean: no snapshot could be kept, but the target is a tracked file
//     with no uncommitted changes, so its prior state is in git history.
//
// Writes by file tools that run in a sandbox are snapshotted the same way,
// reading the target's current content through the sandbox's own file
// bridge; the history entry and audit record name the sandbox and the
// in-sandbox path so a restore writes back into the same namespace.
//
// Everything else is irreversible, with a reason code the audit records:
// the operator opted the path or tool out of history (no-history-path,
// no-history-tool), the snapshot would exceed a cap (over-size-cap,
// over-retention-budget), the target is outside the workspace and scratch
// roots, is not a regular file, cannot be read, or cannot be resolved.

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { resolvePreferredEnclawedTmpDir } from "../infra/tmp-enclawed-dir.js";
import { isInsideDir, pathMatchesEntry } from "./history-paths.js";
import { HistoryStore, type HistoryOp } from "./history-store.js";
import type { Policy } from "./policy.js";

const execFileAsync = promisify(execFile);

export type FsWriteOp = Extract<HistoryOp, "write" | "edit" | "delete">;

export type FsWriteTarget = Readonly<{
  /** The path as the tool call gave it. */
  path: string;
  /** Resolved absolute path; null when it could not be resolved. */
  absPath: string | null;
  op: FsWriteOp;
}>;

export type FsReversibleBasis = "scratch" | "snapshot" | "git-clean";

export type FsNoHistoryCode =
  | "no-history-path"
  | "no-history-tool"
  | "over-size-cap"
  | "over-retention-budget"
  | "outside-allowed-roots"
  | "special-file"
  | "unreadable"
  | "store-failed"
  | "unresolvable-path"
  | "no-file-bridge"
  | "sandbox-read-failed";

/** Which sandbox a snapshot came from, so a restore can find it again. */
export type SandboxRef = Readonly<{ backendId: string; runtimeId: string; sessionKey: string }>;

/** The subset of a sandbox file bridge the history needs. */
export type SandboxFileAccess = {
  resolvePath(params: { filePath: string; cwd?: string }): {
    hostPath?: string;
    containerPath: string;
  };
  readFile(params: { filePath: string; cwd?: string }): Promise<Buffer>;
  stat(params: {
    filePath: string;
    cwd?: string;
  }): Promise<{ type: "file" | "directory" | "other"; size: number } | null>;
};

/** A sandbox whose file tools a call uses: where paths resolve, and its bridge. */
export type SandboxTarget = Readonly<{ ref: SandboxRef; root: string; files: SandboxFileAccess }>;

export type FsTargetResult = Readonly<
  {
    path: string;
    realPath: string | null;
    op: FsWriteOp;
    sandbox?: SandboxRef & { containerPath: string };
  } & (
    | {
        reversible: true;
        basis: FsReversibleBasis;
        /** Snapshot hash of the prior content; null for scratch, git-clean or a new file. */
        snapshot: string | null;
        prior: "absent" | "content" | "unrecorded";
        gitHead?: string;
      }
    | { reversible: false; code: FsNoHistoryCode }
  )
>;

export type FsHistoryOutcome = Readonly<{ reversible: boolean; targets: FsTargetResult[] }>;

async function realpathOrNearest(abs: string): Promise<string> {
  let probe = abs;
  const rest: string[] = [];
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      return rest.length ? path.join(real, ...rest.toReversed()) : real;
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) {
        return abs;
      }
      rest.push(path.basename(probe));
      probe = parent;
    }
  }
}

let cachedGatewayTmpDir: string | null | undefined;
function gatewayTmpDir(): string | null {
  if (cachedGatewayTmpDir === undefined) {
    try {
      cachedGatewayTmpDir = path.resolve(resolvePreferredEnclawedTmpDir({ warn: () => {} }));
    } catch {
      cachedGatewayTmpDir = null;
    }
  }
  return cachedGatewayTmpDir;
}

async function gitCleanHead(realPath: string): Promise<string | null> {
  const dir = path.dirname(realPath);
  const base = path.basename(realPath);
  const opts = { timeout: 5000, windowsHide: true };
  try {
    await execFileAsync("git", ["-C", dir, "ls-files", "--error-unmatch", "--", base], opts);
    const status = await execFileAsync(
      "git",
      ["-C", dir, "status", "--porcelain", "--", base],
      opts,
    );
    if (status.stdout.trim() !== "") {
      return null;
    }
    const head = await execFileAsync("git", ["-C", dir, "rev-parse", "HEAD"], opts);
    return head.stdout.trim() || null;
  } catch {
    return null;
  }
}

let defaultStore: { key: string; store: HistoryStore } | null = null;
function storeFor(policy: Policy): HistoryStore {
  const store = new HistoryStore({ limits: policy.history });
  const key = JSON.stringify([store.dir, policy.history.maxTotalBytes, policy.history.maxAgeDays]);
  if (defaultStore?.key !== key) {
    defaultStore = { key, store };
  }
  return defaultStore.store;
}

export type PrepareFsHistoryParams = Readonly<{
  tool: string;
  targets: readonly FsWriteTarget[];
  /** Host workspace root the file tools write under; absent when sandboxed. */
  fsRoot?: string;
  /** The sandbox the file tools run in, when they do. */
  sandbox?: SandboxTarget;
  policy: Policy;
  toolCallId?: string;
  agentId?: string;
  store?: HistoryStore;
  /** Override the gateway temp directory (tests); null disables it. */
  gatewayTmpDir?: string | null;
}>;

/**
 * Classify every target of one call and keep the history that makes it
 * reversible. The call is reversible only if every target is.
 */
export async function prepareFsWriteHistory(
  params: PrepareFsHistoryParams,
): Promise<FsHistoryOutcome> {
  const { policy, tool } = params;
  const store = params.store ?? storeFor(policy);
  const tmpDir = params.gatewayTmpDir === undefined ? gatewayTmpDir() : params.gatewayTmpDir;
  const scratchRoots = await Promise.all(
    [...(tmpDir ? [tmpDir] : []), ...policy.scratchPaths].map((p) => realpathOrNearest(p)),
  );
  const workspaceRoot = params.fsRoot ? await realpathOrNearest(path.resolve(params.fsRoot)) : null;

  const results: FsTargetResult[] = [];
  for (const target of params.targets) {
    results.push(
      params.sandbox
        ? await classifySandboxTarget(target, params.sandbox)
        : await classifyTarget(target),
    );
  }
  return { reversible: results.every((r) => r.reversible), targets: results };

  async function classifySandboxTarget(
    target: FsWriteTarget,
    sandbox: SandboxTarget,
  ): Promise<FsTargetResult> {
    const base = { path: target.path, op: target.op };
    if (!target.absPath) {
      return { ...base, realPath: null, reversible: false, code: "unresolvable-path" };
    }
    const query = { filePath: target.absPath, cwd: sandbox.root };
    let resolved: { hostPath?: string; containerPath: string };
    try {
      resolved = sandbox.files.resolvePath(query);
    } catch {
      // The bridge refuses paths outside the sandbox's mounts; so would the tool.
      return { ...base, realPath: null, reversible: false, code: "outside-allowed-roots" };
    }
    const at = {
      ...base,
      realPath: resolved.hostPath ?? resolved.containerPath,
      sandbox: { ...sandbox.ref, containerPath: resolved.containerPath },
    };
    if (policy.history.noHistoryTools.has(tool)) {
      return { ...at, reversible: false, code: "no-history-tool" };
    }
    const candidates = [target.absPath, resolved.containerPath, resolved.hostPath].filter(
      (p): p is string => typeof p === "string",
    );
    if (
      policy.history.noHistoryPaths.some((entry) =>
        candidates.some((p) => pathMatchesEntry(p, entry)),
      )
    ) {
      return { ...at, reversible: false, code: "no-history-path" };
    }
    const meta = {
      path: target.path,
      realPath: at.realPath,
      op: target.op,
      tool,
      toolCallId: params.toolCallId ?? null,
      agentId: params.agentId ?? null,
      sandbox: { ...at.sandbox, bridgePath: target.absPath, bridgeCwd: sandbox.root },
    };
    let st: Awaited<ReturnType<SandboxFileAccess["stat"]>>;
    try {
      st = await sandbox.files.stat(query);
    } catch {
      return { ...at, reversible: false, code: "sandbox-read-failed" };
    }
    if (st === null) {
      try {
        await store.record({ ...meta, hash: null, size: 0 });
      } catch {
        return { ...at, reversible: false, code: "store-failed" };
      }
      return { ...at, reversible: true, basis: "snapshot", snapshot: null, prior: "absent" };
    }
    if (st.type !== "file") {
      return { ...at, reversible: false, code: "special-file" };
    }
    if (st.size > policy.history.maxFileBytes) {
      return { ...at, reversible: false, code: "over-size-cap" };
    }
    let content: Buffer;
    try {
      content = await sandbox.files.readFile(query);
    } catch {
      return { ...at, reversible: false, code: "sandbox-read-failed" };
    }
    if (content.length > policy.history.maxFileBytes) {
      return { ...at, reversible: false, code: "over-size-cap" };
    }
    const put = await store.put(content);
    if (!put.ok) {
      return { ...at, reversible: false, code: put.code };
    }
    try {
      await store.record({ ...meta, hash: put.hash, size: content.length });
    } catch {
      return { ...at, reversible: false, code: "store-failed" };
    }
    return { ...at, reversible: true, basis: "snapshot", snapshot: put.hash, prior: "content" };
  }

  async function classifyTarget(target: FsWriteTarget): Promise<FsTargetResult> {
    const base = { path: target.path, op: target.op };
    if (!target.absPath) {
      return { ...base, realPath: null, reversible: false, code: "unresolvable-path" };
    }
    const realPath = await realpathOrNearest(target.absPath);
    const at = { ...base, realPath };
    if (scratchRoots.some((root) => isInsideDir(root, realPath))) {
      return { ...at, reversible: true, basis: "scratch", snapshot: null, prior: "unrecorded" };
    }
    if (!workspaceRoot || !isInsideDir(workspaceRoot, realPath)) {
      return { ...at, reversible: false, code: "outside-allowed-roots" };
    }
    if (policy.history.noHistoryTools.has(tool)) {
      return { ...at, reversible: false, code: "no-history-tool" };
    }
    if (
      policy.history.noHistoryPaths.some(
        (entry) => pathMatchesEntry(target.absPath!, entry) || pathMatchesEntry(realPath, entry),
      )
    ) {
      return { ...at, reversible: false, code: "no-history-path" };
    }
    const meta = {
      path: target.path,
      realPath,
      op: target.op,
      tool,
      toolCallId: params.toolCallId ?? null,
      agentId: params.agentId ?? null,
    };
    let st;
    try {
      st = await fs.lstat(realPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // Nothing there yet: the prior state is "absent", which the index
        // records so the creation can be traced and undone by deleting.
        try {
          await store.record({ ...meta, hash: null, size: 0 });
        } catch {
          return { ...at, reversible: false, code: "store-failed" };
        }
        return { ...at, reversible: true, basis: "snapshot", snapshot: null, prior: "absent" };
      }
      return { ...at, reversible: false, code: "unreadable" };
    }
    if (!st.isFile()) {
      return { ...at, reversible: false, code: "special-file" };
    }
    let failure: FsNoHistoryCode = "unreadable";
    if (st.size > policy.history.maxFileBytes) {
      failure = "over-size-cap";
    } else {
      let content: Buffer | null = null;
      try {
        content = await fs.readFile(realPath);
      } catch {
        failure = "unreadable";
      }
      if (content) {
        if (content.length > policy.history.maxFileBytes) {
          failure = "over-size-cap";
        } else {
          const put = await store.put(content);
          if (put.ok) {
            try {
              await store.record({ ...meta, hash: put.hash, size: content.length });
              return {
                ...at,
                reversible: true,
                basis: "snapshot",
                snapshot: put.hash,
                prior: "content",
              };
            } catch {
              failure = "store-failed";
            }
          } else {
            failure = put.code;
          }
        }
      }
    }
    // No snapshot could be kept. A tracked file with no uncommitted changes
    // still has its prior state in git history.
    const gitHead = await gitCleanHead(realPath);
    if (gitHead) {
      return {
        ...at,
        reversible: true,
        basis: "git-clean",
        snapshot: null,
        prior: "unrecorded",
        gitHead,
      };
    }
    return { ...at, reversible: false, code: failure };
  }
}

export function resetFsReversibilityForTest(): void {
  cachedGatewayTmpDir = undefined;
  defaultStore = null;
}
