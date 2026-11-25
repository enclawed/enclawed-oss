import { n as DEFAULT_MODEL, r as DEFAULT_PROVIDER } from "./defaults-Dz6Umtsd.js";
import { d as ensureAgentWorkspace } from "./workspace-Cy6_bLdq.js";
import { b as resolveAgentDir, x as resolveAgentWorkspaceDir } from "./agent-scope-DVYmA2Mv.js";
import { x as resolveThinkingDefault } from "./model-selection-D0i1_wAd.js";
import { n as resolveAgentIdentity } from "./identity-CWMoN-UM.js";
import { i as saveSessionStore } from "./store-D4aRtgSD.js";
import "./sessions-BGiO5uqq.js";
import { i as resolveSessionFilePath, u as resolveStorePath } from "./paths-BGNVd2ln.js";
import { t as loadSessionStore } from "./store-load-DFKLYkRa.js";
import { t as runEmbeddedPiAgent } from "./pi-embedded-runner-CweubJxJ.js";
import { t as resolveAgentTimeoutMs } from "./timeout-eBqnyX_t.js";
import "./pi-embedded-COjmvSV0.js";
//#region src/extensionAPI.ts
if (process.env.VITEST !== "true" && process.env.ENCLAWED_SUPPRESS_EXTENSION_API_WARNING !== "1") process.emitWarning("@enclawed/extension-api is deprecated. Migrate to api.runtime.agent.* or focused @enclawed/plugin-sdk/<subpath> imports. See https://github.com/enclawed/enclawed-oss/blob/main/docs/plugins/sdk-migration.md", {
	code: "ENCLAWED_EXTENSION_API_DEPRECATED",
	detail: "This compatibility bridge is temporary. Bundled plugins should use the injected plugin runtime instead of importing host-side agent helpers directly. Migration guide: https://github.com/enclawed/enclawed-oss/blob/main/docs/plugins/sdk-migration.md"
});
//#endregion
export { DEFAULT_MODEL, DEFAULT_PROVIDER, ensureAgentWorkspace, loadSessionStore, resolveAgentDir, resolveAgentIdentity, resolveAgentTimeoutMs, resolveAgentWorkspaceDir, resolveSessionFilePath, resolveStorePath, resolveThinkingDefault, runEmbeddedPiAgent, saveSessionStore };
