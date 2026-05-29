// Bundled bridge: Google Workspace first-party MCP servers.
//
// Google ships remote MCP servers over HTTP with OAuth 2.0 bearer auth. The
// canonical endpoints (see https://developers.google.com/workspace/guides/configure-mcp-servers):
//
//   - https://gmailmcp.googleapis.com/mcp/v1     (Gmail)
//   - https://calendarmcp.googleapis.com/mcp/v1  (Calendar)
//   - https://drivemcp.googleapis.com/mcp/v1     (Drive)
//   - https://chatmcp.googleapis.com/mcp/v1      (Chat)
//   - https://people.googleapis.com/mcp/v1       (People)
//
// This bridge wires those endpoints up against mcp-attested's HTTP transport,
// shares one GoogleOAuthProvider across all five (one OAuth identity =
// access to the whole Workspace API surface the operator authorized), and
// registers each as a separate `RegisteredServer` so the per-server
// `allowedTools` allowlist can be tuned independently.
//
// Required env (legacy ENCLAWED_* aliases are honored via brand-env.ts):
//   - ENCLAWED_GOOGLE_OAUTH_TOKEN
//   OR
//   - ENCLAWED_GOOGLE_OAUTH_CLIENT_ID
//   - ENCLAWED_GOOGLE_OAUTH_CLIENT_SECRET
//   - ENCLAWED_GOOGLE_OAUTH_REFRESH_TOKEN
//
// Required scopes (operator-side, granted at OAuth consent time):
//   - https://www.googleapis.com/auth/gmail.modify
//   - https://www.googleapis.com/auth/calendar
//   - https://www.googleapis.com/auth/drive
//   - https://www.googleapis.com/auth/chat.messages
//   - https://www.googleapis.com/auth/contacts.readonly
// (Trim to only the services your bridge instance loads.)

import {
  GoogleOAuthProvider,
  HttpJsonRpcTransport,
  registerServer,
  type RegisteredServer,
} from "../../mcp-attested/src/index.js";

export type GoogleWorkspaceService = "gmail" | "calendar" | "drive" | "chat" | "people";

export const GOOGLE_WORKSPACE_ENDPOINTS: Readonly<Record<GoogleWorkspaceService, string>> =
  Object.freeze({
    gmail: "https://gmailmcp.googleapis.com/mcp/v1",
    calendar: "https://calendarmcp.googleapis.com/mcp/v1",
    drive: "https://drivemcp.googleapis.com/mcp/v1",
    chat: "https://chatmcp.googleapis.com/mcp/v1",
    people: "https://people.googleapis.com/mcp/v1",
  });

// Canonical tool list each service admits. These mirror the tool names
// Google's MCP servers document at
// https://developers.google.com/workspace/guides/configure-mcp-servers .
//
// The point is the *closed list*: a malicious or hallucinated tool name
// outside this set is denied by mcp-attested before any network call.
export const GOOGLE_WORKSPACE_TOOLS: Readonly<
  Record<GoogleWorkspaceService, ReadonlyArray<string>>
> = Object.freeze({
  gmail: Object.freeze([
    "create_draft",
    "send_draft",
    "search_threads",
    "get_thread",
    "list_labels",
    "create_label",
    "modify_thread_labels",
  ]),
  calendar: Object.freeze([
    "create_event",
    "list_events",
    "get_event",
    "update_event",
    "delete_event",
    "suggest_time",
  ]),
  drive: Object.freeze(["search_files", "get_file", "create_file", "update_file", "share_file"]),
  chat: Object.freeze(["list_spaces", "list_messages", "create_message"]),
  people: Object.freeze(["list_contacts", "search_contacts", "get_contact"]),
});

export type GoogleWorkspaceBridgeOptions = Readonly<{
  /** Which services to register; default: gmail+calendar (the secretary scenario). */
  services?: ReadonlyArray<GoogleWorkspaceService>;
  /** Required clearance for the admission gate. Defaults to "internal". */
  requiredClearance?: string;
  /** Override the OAuth provider (test seam). */
  oauth?: GoogleOAuthProvider;
  /** Override the endpoint map (test seam). */
  endpoints?: Readonly<Record<GoogleWorkspaceService, string>>;
  /** Override fetch (test seam, passed into the transport). */
  fetchImpl?: typeof fetch;
  /**
   * Narrow the per-service allowedTools below the canonical Google list.
   * Each entry MUST be a subset of GOOGLE_WORKSPACE_TOOLS[svc]; values
   * outside the canonical list are dropped (silently — escalation must
   * not be possible by passing a typo). Missing services keep the
   * canonical allowedTools. Use this to ship a demo or a tenant-policy
   * that admits only a closed subset of the Google MCP surface.
   */
  allowedToolsOverride?: Readonly<Partial<Record<GoogleWorkspaceService, ReadonlyArray<string>>>>;
}>;

export type LoadResult = Readonly<{
  registered: ReadonlyArray<RegisteredServer>;
}>;

/**
 * Load the Google Workspace bridge: build one OAuth provider, build one
 * HTTP transport per requested service, register each with the
 * mcp-attested server registry. Idempotent failure: if the OAuth env
 * isn't configured, this throws with the same actionable message the
 * provider raises — bridges should call this only when they intend the
 * operator to have wired Google Workspace.
 */
export function loadGoogleWorkspaceBridge(opts: GoogleWorkspaceBridgeOptions = {}): LoadResult {
  const services = opts.services ?? (["gmail", "calendar"] as const);
  const requiredClearance = opts.requiredClearance ?? "internal";
  const endpoints = opts.endpoints ?? GOOGLE_WORKSPACE_ENDPOINTS;
  const oauth = opts.oauth ?? new GoogleOAuthProvider();

  if (!oauth.isConfigured()) {
    throw new Error(
      "mcp-google-workspace: Google OAuth env not configured. " +
        "Set ENCLAWED_GOOGLE_OAUTH_TOKEN, OR " +
        "ENCLAWED_GOOGLE_OAUTH_CLIENT_ID + " +
        "ENCLAWED_GOOGLE_OAUTH_CLIENT_SECRET + " +
        "ENCLAWED_GOOGLE_OAUTH_REFRESH_TOKEN.",
    );
  }

  const authProvider = () => oauth.getToken();
  const registered: RegisteredServer[] = [];
  for (const svc of services) {
    const endpoint = endpoints[svc];
    const canonical = GOOGLE_WORKSPACE_TOOLS[svc];
    const override = opts.allowedToolsOverride?.[svc];
    // Narrowing-only override: take the intersection of the override and
    // the canonical list. A typo in the override list silently drops to
    // the canonical baseline rather than admitting an unknown tool, so
    // the override path cannot be used for escalation.
    const tools =
      override !== undefined
        ? Object.freeze(canonical.filter((t) => override.includes(t)))
        : canonical;
    const transport = new HttpJsonRpcTransport({
      endpoint,
      authProvider,
      fetchImpl: opts.fetchImpl,
    });
    const entry: RegisteredServer = Object.freeze({
      id: `mcp.google.${svc}`,
      bridge: "mcp-google-workspace",
      endpoint,
      requiredClearance,
      allowedTools: tools,
      transport,
    });
    registerServer(entry);
    registered.push(entry);
  }
  return Object.freeze({ registered: Object.freeze(registered) });
}
