import { n as HttpJsonRpcTransport, t as GoogleOAuthProvider } from "./src-0s-kk9FK.js";
import { r as registerServer } from "./server-registry-Dfft0BAM.js";
//#region extensions/mcp-google-workspace/src/index.ts
const GOOGLE_WORKSPACE_ENDPOINTS = Object.freeze({
	gmail: "https://gmailmcp.googleapis.com/mcp/v1",
	calendar: "https://calendarmcp.googleapis.com/mcp/v1",
	drive: "https://drivemcp.googleapis.com/mcp/v1",
	chat: "https://chatmcp.googleapis.com/mcp/v1",
	people: "https://people.googleapis.com/mcp/v1"
});
const GOOGLE_WORKSPACE_TOOLS = Object.freeze({
	gmail: Object.freeze([
		"create_draft",
		"send_draft",
		"search_threads",
		"get_thread",
		"list_labels",
		"create_label",
		"modify_thread_labels"
	]),
	calendar: Object.freeze([
		"create_event",
		"list_events",
		"get_event",
		"update_event",
		"delete_event",
		"suggest_time"
	]),
	drive: Object.freeze([
		"search_files",
		"get_file",
		"create_file",
		"update_file",
		"share_file"
	]),
	chat: Object.freeze([
		"list_spaces",
		"list_messages",
		"create_message"
	]),
	people: Object.freeze([
		"list_contacts",
		"search_contacts",
		"get_contact"
	])
});
/**
* Load the Google Workspace bridge: build one OAuth provider, build one
* HTTP transport per requested service, register each with the
* mcp-attested server registry. Idempotent failure: if the OAuth env
* isn't configured, this throws with the same actionable message the
* provider raises — bridges should call this only when they intend the
* operator to have wired Google Workspace.
*/
function loadGoogleWorkspaceBridge(opts = {}) {
	const services = opts.services ?? ["gmail", "calendar"];
	const requiredClearance = opts.requiredClearance ?? "internal";
	const endpoints = opts.endpoints ?? GOOGLE_WORKSPACE_ENDPOINTS;
	const oauth = opts.oauth ?? new GoogleOAuthProvider();
	if (!oauth.isConfigured()) throw new Error("mcp-google-workspace: Google OAuth env not configured. Set ENCLAWED_GOOGLE_OAUTH_TOKEN, OR ENCLAWED_GOOGLE_OAUTH_CLIENT_ID + ENCLAWED_GOOGLE_OAUTH_CLIENT_SECRET + ENCLAWED_GOOGLE_OAUTH_REFRESH_TOKEN.");
	const authProvider = () => oauth.getToken();
	const registered = [];
	for (const svc of services) {
		const endpoint = endpoints[svc];
		const canonical = GOOGLE_WORKSPACE_TOOLS[svc];
		const override = opts.allowedToolsOverride?.[svc];
		const tools = override !== void 0 ? Object.freeze(canonical.filter((t) => override.includes(t))) : canonical;
		const transport = new HttpJsonRpcTransport({
			endpoint,
			authProvider,
			fetchImpl: opts.fetchImpl
		});
		const entry = Object.freeze({
			id: `mcp.google.${svc}`,
			bridge: "mcp-google-workspace",
			endpoint,
			requiredClearance,
			allowedTools: tools,
			transport
		});
		registerServer(entry);
		registered.push(entry);
	}
	return Object.freeze({ registered: Object.freeze(registered) });
}
//#endregion
export { GOOGLE_WORKSPACE_TOOLS as n, loadGoogleWorkspaceBridge as r, GOOGLE_WORKSPACE_ENDPOINTS as t };
