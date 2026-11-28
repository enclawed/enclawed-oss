// Reopen the sandbox a history snapshot came from, for `enclawed history
// restore`. Kept behind a runtime boundary so the history CLI loads the
// sandbox stack only when a restore needs it.
//
// "Exists" means the sandbox runtime is still in the sandbox registry and
// resolving the recorded session yields that same runtime. A removed sandbox
// is never recreated to receive a restore: the caller is told it is gone.

import { resolveSandboxContext } from "../agents/sandbox/context.js";
import { readRegistry } from "../agents/sandbox/registry.js";
import { loadConfig } from "../config/config.js";
import type { SandboxOpener } from "../enclawed/history-restore.js";

export const openSnapshotSandbox: SandboxOpener = async (origin) => {
  const registry = await readRegistry();
  if (!registry.entries.some((e) => e.containerName === origin.runtimeId)) {
    return null;
  }
  const context = await resolveSandboxContext({
    config: loadConfig(),
    sessionKey: origin.sessionKey,
  });
  if (!context?.fsBridge || context.runtimeId !== origin.runtimeId) {
    return null;
  }
  return context.fsBridge;
};
