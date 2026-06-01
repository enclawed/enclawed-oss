import { g as resolveUserPath } from "./utils-CrVQlOZJ.js";
import { _ as resolveStateDir } from "./paths-CDjhyzOH.js";
import { t as DEFAULT_AGENT_ID } from "./session-key-BOC5unB4.js";
import path from "node:path";
//#region src/agents/agent-paths.ts
function resolveEnclawedAgentDir(env = process.env) {
	const override = env.ENCLAWED_AGENT_DIR?.trim() || env.PI_CODING_AGENT_DIR?.trim();
	if (override) return resolveUserPath(override, env);
	return resolveUserPath(path.join(resolveStateDir(env), "agents", DEFAULT_AGENT_ID, "agent"), env);
}
//#endregion
export { resolveEnclawedAgentDir as t };
