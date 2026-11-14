import { n as getRuntime } from "./runtime-Dt7e6nAN.js";
import { r as checkTool } from "./policy-CvFzDown.js";
//#region src/enclawed/tool-gate.ts
const auditedOfferDenials = /* @__PURE__ */ new Set();
function filterToolsByEnclawedPolicy(tools, normalize, warn) {
	const runtime = getRuntime();
	if (!runtime || !runtime.policy.enforceAllowlists) return tools;
	const denied = [];
	const allowed = tools.filter((tool) => {
		const id = normalize(tool.name);
		if (checkTool(runtime.policy, id).allowed) return true;
		denied.push(id);
		return false;
	});
	const fresh = denied.filter((id) => !auditedOfferDenials.has(id));
	if (fresh.length > 0) {
		for (const id of fresh) auditedOfferDenials.add(id);
		warn?.(`enclawed policy: tools not on enclawed.policy.allowedTools are unavailable (${fresh.join(", ")})`);
		runtime.audit.append({
			type: "policy.deny.tool",
			actor: "process",
			level: null,
			payload: {
				stage: "offer",
				ids: fresh
			}
		}).catch(() => {});
	}
	return allowed;
}
function checkEnclawedToolCall(toolName, actor) {
	const runtime = getRuntime();
	if (!runtime) return { allowed: true };
	const decision = checkTool(runtime.policy, toolName);
	if (!decision.allowed) runtime.audit.append({
		type: "policy.deny.tool",
		actor: actor ?? "process",
		level: null,
		payload: {
			stage: "call",
			id: toolName
		}
	}).catch(() => {});
	return decision;
}
//#endregion
export { filterToolsByEnclawedPolicy as n, checkEnclawedToolCall as t };
