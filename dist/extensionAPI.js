import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-CCZENeBX.js";
import { d as ensureAgentWorkspace } from "./workspace-BDVMKguP.js";
import { b as resolveAgentDir, x as resolveAgentWorkspaceDir } from "./agent-scope-KtKaVseD.js";
import { x as resolveThinkingDefault } from "./model-selection-DBbD8v5w.js";
import { n as resolveAgentIdentity } from "./identity-QvYB2VDT.js";
import { i as saveSessionStore } from "./store-CrJC04MB.js";
import "./sessions-DSXY7ybN.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-qq5OwN7H.js";
import { t as loadSessionStore } from "./store-load-CZDjfQnz.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-runner-DaIIk6F4.js";
import { t as resolveAgentTimeoutMs } from "./timeout-_AMgkTKL.js";
import "./pi-embedded-psqgyNka.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.ENCLAWED_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("@enclawed/extension-api is deprecated. Migrate to api.runtime.agent.* or focused @enclawed/plugin-sdk/<subpath> imports. See https://docs.enclawed.ai/plugins/sdk-migration", {
	code: "ENCLAWED_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.enclawed.ai/plugins/sdk-migration"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore };
