// Host-declared observations for the egress action batcher.
//
// The batcher (egress-core) keys every action it batches on what the action
// produces outside the tool, never on the tool call's parameters: a parameter
// that never reaches the observer would let a sender vary it to choose the
// sort order of its calls and to split identical repeats. A batched tool
// therefore needs a declared mapping from its call to that observation; one
// without is refused while the batcher enforces. The monitor declares
// `web_fetch` itself (a GET of its URL). The host declares the tools whose
// observation depends on host state the monitor cannot see:
//
//   write   the file it writes and the content: the path resolved exactly as
//           the file tools resolve it (relative to their root, `~` expanded),
//           then, on the host, through existing symbolic links, so that every
//           spelling of the same file is one observation. In a sandbox the
//           path is the one the sandbox's file bridge writes. When the file
//           already exists on the host, its filesystem identity
//           (dev:ino:birthtimeNs) is declared too, so a hard link to it is
//           the same observation.
//
// The declaration travels on the call's replay context (`tool-replay.ts`).

import fs from "node:fs/promises";
import type { SandboxTarget } from "../enclawed/fs-reversibility.js";
import { realpathOrNearest } from "../enclawed/fs-reversibility.js";
import { resolveFsCallTargets } from "./tool-call-fs-targets.js";
import type { ToolObservation } from "./tool-replay.js";

type Where = { fsRoot?: string; fsSandbox?: SandboxTarget };

async function writeObservation(
  params: Record<string, unknown>,
  where: Where,
): Promise<ToolObservation | null> {
  if (typeof params.content !== "string") {
    return null;
  }
  const resolved = resolveFsCallTargets("write", params, where);
  const target = resolved?.targets?.length === 1 ? resolved.targets[0] : null;
  if (!target?.absPath) {
    return null;
  }
  const sandbox = where.fsSandbox;
  let filePath: string;
  // Only a path on this host can be checked for its identity.
  let hostPath: string | null = null;
  if (sandbox) {
    try {
      const at = sandbox.files.resolvePath({ filePath: target.absPath, cwd: sandbox.root });
      filePath = at.hostPath ?? at.containerPath;
      hostPath = at.hostPath ?? null;
    } catch {
      // The bridge refuses the path; so would the tool. Nothing to key on.
      return null;
    }
  } else {
    filePath = await realpathOrNearest(target.absPath);
    hostPath = filePath;
  }
  const identity = hostPath ? await fileIdentity(hostPath) : null;
  return {
    type: "file-write",
    path: filePath,
    content: params.content,
    ...(identity ? { identity } : {}),
  };
}

/** Identity of an existing regular file (`dev:ino:birthtimeNs`), else null. */
async function fileIdentity(filePath: string): Promise<string | null> {
  try {
    const st = await fs.stat(filePath, { bigint: true });
    return st.isFile() ? `${st.dev}:${st.ino}:${st.birthtimeNs}` : null;
  } catch {
    // Not there yet: the resolved path names it.
    return null;
  }
}

/**
 * The observation declaration of a host tool, or undefined when the host
 * declares none (the batcher then refuses the tool if it is batched).
 */
export function hostToolObservation(
  toolName: string,
  where: Where,
): ((params: Record<string, unknown>) => Promise<ToolObservation | null>) | undefined {
  const name = toolName.trim().toLowerCase();
  if (name === "write" && (where.fsRoot || where.fsSandbox)) {
    return (params) => writeObservation(params, where);
  }
  return undefined;
}
