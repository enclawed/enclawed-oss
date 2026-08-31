//#region extensions/mcp-attested/src/server-registry.ts
const REGISTRY = /* @__PURE__ */ new Map();
var ServerRegistrationError = class extends Error {
	constructor(..._args) {
		super(..._args);
		this.name = "ServerRegistrationError";
	}
};
function registerServer(entry) {
	if (!entry || typeof entry.id !== "string" || entry.id.length === 0) throw new ServerRegistrationError("registerServer: id is required");
	if (typeof entry.endpoint !== "string" || entry.endpoint.length === 0) throw new ServerRegistrationError(`registerServer(${entry.id}): endpoint is required`);
	if (!Array.isArray(entry.allowedTools) || entry.allowedTools.length === 0) throw new ServerRegistrationError(`registerServer(${entry.id}): allowedTools must be a non-empty array`);
	if (REGISTRY.has(entry.id)) throw new ServerRegistrationError(`registerServer(${entry.id}): already registered`);
	REGISTRY.set(entry.id, Object.freeze({
		...entry,
		allowedTools: Object.freeze([...entry.allowedTools])
	}));
}
function getServerByEndpoint(endpoint) {
	for (const v of REGISTRY.values()) if (v.endpoint === endpoint) return v;
}
/** True iff `tool` appears in the bridge's allowedTools list. */
function isToolAdmitted(bridge, tool) {
	return bridge.allowedTools.includes(tool);
}
//#endregion
export { isToolAdmitted as n, registerServer as r, getServerByEndpoint as t };
