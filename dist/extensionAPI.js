import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-DkpvRRFC.js";
import { d as ensureAgentWorkspace } from "./workspace-Dg5fnKWT.js";
import { b as resolveAgentDir, x as resolveAgentWorkspaceDir } from "./agent-scope-D-lQQ64_.js";
import { x as resolveThinkingDefault } from "./model-selection-DYKhuAoE.js";
import { n as resolveAgentIdentity } from "./identity-BvKgoUTt.js";
import { i as saveSessionStore } from "./store-BojxuYyw.js";
import "./sessions-BhMvlzjx.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-Lozvxyih.js";
import { t as loadSessionStore } from "./store-load-BbG7SOzr.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-runner-D0f2iyPl.js";
import { t as resolveAgentTimeoutMs } from "./timeout-D3KpBffA.js";
import "./pi-embedded-D4WhD7CB.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.ENCLAWED_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("@enclawed/extension-api is deprecated. Migrate to api.runtime.agent.* or focused @enclawed/plugin-sdk/<subpath> imports. See https://docs.enclawed.ai/plugins/sdk-migration", {
	code: "ENCLAWED_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.enclawed.ai/plugins/sdk-migration"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore };
