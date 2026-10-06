import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-Dzck2uJH.js";
import { d as ensureAgentWorkspace } from "./workspace-dcdTJd2I.js";
import { b as resolveAgentDir, x as resolveAgentWorkspaceDir } from "./agent-scope-5o1jve-2.js";
import { x as resolveThinkingDefault } from "./model-selection-3QcDboLc.js";
import { n as resolveAgentIdentity } from "./identity-IAiNDSmy.js";
import { i as saveSessionStore } from "./store-eo7yB1I1.js";
import "./sessions-Dq3XJ_x5.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-CADYkZ1j.js";
import { t as loadSessionStore } from "./store-load-C5fhLNaT.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-runner-B7vg49Dr.js";
import { t as resolveAgentTimeoutMs } from "./timeout-CZTBoioj.js";
import "./pi-embedded-CWRkQ2Oz.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.ENCLAWED_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("@enclawed/extension-api is deprecated. Migrate to api.runtime.agent.* or focused @enclawed/plugin-sdk/<subpath> imports. See https://docs.enclawed.ai/plugins/sdk-migration", {
	code: "ENCLAWED_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://docs.enclawed.ai/plugins/sdk-migration"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore };
