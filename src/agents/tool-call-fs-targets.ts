// Resolve what a file tool call (write, edit, apply_patch) will write, so the
// enclawed gate can keep its history before it runs. Paths resolve exactly as
// the file tools resolve them: relative to their root, with `~` expanded. The
// root is the host workspace, or the sandbox workspace whose file bridge the
// tools write through. A caller with neither has no way to read the files
// first, so its writes stay irreversible.

import type { FsCallTargets } from "../enclawed/agent-tool-guard.js";
import type { FsWriteTarget, SandboxTarget } from "../enclawed/fs-reversibility.js";
import { isFsWriteTool } from "../enclawed/tool-capability-map.js";
import { isPlainObject } from "../utils.js";
import { listApplyPatchTargets } from "./apply-patch.js";
import { resolvePathFromInput } from "./path-policy.js";

export function resolveFsCallTargets(
  toolName: string,
  params: unknown,
  where: { fsRoot?: string; fsSandbox?: SandboxTarget },
): FsCallTargets | undefined {
  if (!isFsWriteTool(toolName)) {
    return undefined;
  }
  const sandbox = where.fsSandbox;
  const root = sandbox ? sandbox.root : where.fsRoot;
  if (!root) {
    return { targets: null, unresolved: "no-file-bridge" };
  }
  const located = sandbox ? { sandbox } : { fsRoot: root };
  if (!isPlainObject(params)) {
    return { targets: null, unresolved: "unresolvable-path", ...located };
  }
  const resolve = (p: string, op: FsWriteTarget["op"]): FsWriteTarget => {
    let absPath: string | null = null;
    try {
      absPath = p.trim() ? resolvePathFromInput(p, root) : null;
    } catch {
      absPath = null;
    }
    return { path: p, absPath, op };
  };
  if (toolName === "apply_patch") {
    const listed = typeof params.input === "string" ? listApplyPatchTargets(params.input) : null;
    if (!listed || listed.length === 0) {
      return { targets: null, unresolved: "unresolvable-path", ...located };
    }
    return { targets: listed.map((t) => resolve(t.path, t.op)), ...located };
  }
  if (typeof params.path !== "string") {
    return { targets: null, unresolved: "unresolvable-path", ...located };
  }
  return {
    targets: [resolve(params.path, toolName === "edit" ? "edit" : "write")],
    ...located,
  };
}
