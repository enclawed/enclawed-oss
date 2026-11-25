// Put a snapshot from the write history back. The snapshot's bytes must
// still hash to its name (a tampered or corrupted snapshot is refused), the
// content the restore replaces is itself snapshotted first, and every
// restore, refused ones included, is recorded in the audit log.
//
// A snapshot taken inside a sandbox goes back into that sandbox, through its
// own file bridge. If that sandbox no longer exists the restore is refused;
// `--to <host path>` restores it on the host instead, explicitly.

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  HistoryStore,
  HistoryTamperedError,
  SNAPSHOT_HASH_RE,
  type HistoryEntry,
} from "./history-store.js";
import { getRuntime } from "./runtime.js";

type SandboxOrigin = NonNullable<HistoryEntry["sandbox"]>;

/** File access inside a sandbox, as its file bridge offers it. */
export type SandboxRestoreAccess = {
  readFile(params: { filePath: string; cwd?: string }): Promise<Buffer>;
  stat(params: {
    filePath: string;
    cwd?: string;
  }): Promise<{ type: "file" | "directory" | "other"; size: number } | null>;
  writeFile(params: {
    filePath: string;
    cwd?: string;
    data: Buffer | string;
    mkdir?: boolean;
  }): Promise<void>;
};

/** Finds a live sandbox by the reference a snapshot recorded; null if it is gone. */
export type SandboxOpener = (origin: SandboxOrigin) => Promise<SandboxRestoreAccess | null>;

export type RestoreResult = Readonly<{
  hash: string;
  /** Host path, or the in-sandbox path when restored into a sandbox. */
  to: string;
  sandbox: { backendId: string; runtimeId: string } | null;
  /** Snapshot of what the restore replaced; null if nothing was there. */
  replacedSnapshot: string | null;
}>;

export type RestoreErrorCode =
  | "no-audit"
  | "bad-hash"
  | "unknown-snapshot"
  | "tampered"
  | "no-target"
  | "sandbox-missing"
  | "write-failed";

export class RestoreError extends Error {
  constructor(
    readonly code: RestoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RestoreError";
  }
}

export async function restoreSnapshot(opts: {
  hash: string;
  to?: string;
  store: HistoryStore;
  actor?: string;
  openSandbox?: SandboxOpener;
}): Promise<RestoreResult> {
  const runtime = getRuntime();
  if (!runtime) {
    // A restore that cannot be audited does not run.
    throw new RestoreError("no-audit", "the audit log is not available; refusing to restore");
  }
  const actor = opts.actor ?? "cli";
  const audit = async (outcome: string, extra: Record<string, unknown>) => {
    await runtime.audit.append({
      type: "history.restore",
      actor,
      level: null,
      payload: { hash: opts.hash, outcome, ...extra },
    });
  };
  const fail = async (
    code: RestoreErrorCode,
    message: string,
    extra: Record<string, unknown> = {},
  ): Promise<never> => {
    await audit("refused", { code, to: opts.to ?? null, ...extra });
    throw new RestoreError(code, message);
  };

  if (!SNAPSHOT_HASH_RE.test(opts.hash)) {
    return fail("bad-hash", `not a snapshot hash: ${opts.hash}`);
  }
  let content: Buffer;
  try {
    content = await opts.store.readVerified(opts.hash);
  } catch (err) {
    if (err instanceof HistoryTamperedError) {
      return fail("tampered", err.message);
    }
    return fail("unknown-snapshot", `no snapshot ${opts.hash} in ${opts.store.dir}`);
  }

  if (opts.to) {
    return restoreOnHost(path.resolve(opts.to));
  }
  const last = (await opts.store.list()).findLast((e) => e.hash === opts.hash);
  if (!last) {
    return fail("no-target", `snapshot ${opts.hash} has no recorded path; pass --to <path>`);
  }
  if (!last.sandbox) {
    return restoreOnHost(last.realPath);
  }
  const origin = last.sandbox;
  const sandboxInfo = { backendId: origin.backendId, runtimeId: origin.runtimeId };
  const access = opts.openSandbox ? await opts.openSandbox(origin).catch(() => null) : null;
  if (!access) {
    return fail(
      "sandbox-missing",
      `the ${origin.backendId} sandbox ${origin.runtimeId} this snapshot came from no longer ` +
        `exists; pass --to <host path> to restore it on the host instead`,
      { sandbox: sandboxInfo, containerPath: origin.containerPath },
    );
  }
  return restoreInSandbox(origin, access);

  async function keepReplaced(
    current: Buffer,
    entry: Pick<HistoryEntry, "path" | "realPath" | "sandbox">,
  ): Promise<string | null> {
    const put = await opts.store.put(current);
    if (!put.ok) {
      return null;
    }
    await opts.store.record({
      ...entry,
      op: "restore",
      hash: put.hash,
      size: current.length,
      tool: "history.restore",
      toolCallId: null,
      agentId: null,
    });
    return put.hash;
  }

  async function restoreOnHost(to: string): Promise<RestoreResult> {
    // Keep what the restore replaces, so the restore can be undone too.
    let replacedSnapshot: string | null = null;
    try {
      const st = await fs.lstat(to);
      if (st.isFile()) {
        replacedSnapshot = await keepReplaced(await fs.readFile(to), { path: to, realPath: to });
      }
    } catch {
      /* nothing there to keep */
    }
    try {
      await fs.mkdir(path.dirname(to), { recursive: true });
      const tmp = `${to}.${randomBytes(6).toString("hex")}.restore.tmp`;
      await fs.writeFile(tmp, content, { flag: "wx" });
      await fs.rename(tmp, to);
    } catch (err) {
      return fail("write-failed", `could not write ${to}: ${String(err)}`);
    }
    await audit("restored", { to, sandbox: null, replacedSnapshot, size: content.length });
    return { hash: opts.hash, to, sandbox: null, replacedSnapshot };
  }

  async function restoreInSandbox(
    origin: SandboxOrigin,
    access: SandboxRestoreAccess,
  ): Promise<RestoreResult> {
    const where = { filePath: origin.bridgePath, cwd: origin.bridgeCwd };
    const sandbox = { backendId: origin.backendId, runtimeId: origin.runtimeId };
    let replacedSnapshot: string | null = null;
    try {
      const st = await access.stat(where);
      if (st?.type === "file") {
        replacedSnapshot = await keepReplaced(await access.readFile(where), {
          path: origin.containerPath,
          realPath: origin.containerPath,
          sandbox: origin,
        });
      }
    } catch {
      /* nothing there to keep */
    }
    try {
      await access.writeFile({ ...where, data: content, mkdir: true });
    } catch (err) {
      return fail("write-failed", `could not write ${origin.containerPath}: ${String(err)}`, {
        sandbox,
      });
    }
    await audit("restored", {
      to: origin.containerPath,
      sandbox,
      replacedSnapshot,
      size: content.length,
    });
    return { hash: opts.hash, to: origin.containerPath, sandbox, replacedSnapshot };
  }
}
