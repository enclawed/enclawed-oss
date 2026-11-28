import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-Bvw4wDfw.js";
import { d as ensureAgentWorkspace } from "./workspace-DcK7dXK2.js";
import { b as resolveAgentDir, x as resolveAgentWorkspaceDir } from "./agent-scope-h_sJkIo9.js";
import { x as resolveThinkingDefault } from "./model-selection-BbR_dk2S.js";
import { n as resolveAgentIdentity } from "./identity-CNV9oY5W.js";
import { i as saveSessionStore } from "./store-BQvp3QbG.js";
import "./sessions-Cc2mnF-I.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-CPbkMJ31.js";
import { t as loadSessionStore } from "./store-load-DOa6JKcY.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-runner-CLAGfAb8.js";
import { t as resolveAgentTimeoutMs } from "./timeout-OzmCU5r2.js";
import "./pi-embedded-D70BJcWB.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.ENCLAWED_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("@enclawed/extension-api is deprecated. Migrate to api.runtime.agent.* or focused @enclawed/plugin-sdk/<subpath> imports. See https://github.com/enclawed/enclawed-oss/blob/main/docs/plugins/sdk-migration.md", {
	code: "ENCLAWED_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://github.com/enclawed/enclawed-oss/blob/main/docs/plugins/sdk-migration.md"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore };
