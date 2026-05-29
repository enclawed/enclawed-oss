// Bundled bridge: CalDAV MCP server bound to an app-specific password.
// The Calendar half of the secretary's three-MCP surface after the
// migration off Google OAuth.
//
// What this bridge ships:
//   - One MCP transport (CalDavTransport) speaking RFC-4791 CalDAV
//     over HTTPS, authenticated by HTTP Basic with the same
//     app-specific password the IMAP+SMTP bridge uses.
//   - One synthetic endpoint key (mcp+caldav://<host>/<email>) used
//     by mcp-attested's registry.
//   - A closed `allowedTools` list: list_events, get_event.
//
// Required env (shared with mcp-imap-smtp):
//   - ENCLAWED_IMAP_APP_PASSWORD
//   - ENCLAWED_SECRETARY_PRINCIPAL_EMAIL

import { registerServer, type RegisteredServer } from "../../mcp-attested/src/server-registry.js";
import { CalDavTransport, type CalDavTransportOptions } from "./caldav-transport.js";

export { CalDavTransport } from "./caldav-transport.js";
export type {
  CalDavTransportOptions,
  EventSummary,
  EventDetail,
  Attendee,
} from "./caldav-transport.js";

export const CALDAV_TOOLS = Object.freeze(["list_events", "get_event"]);

export type CalDavBridgeOptions = CalDavTransportOptions & {
  /** Required clearance for the admission gate. Defaults to "internal". */
  requiredClearance?: string;
  /** Narrow the canonical tool list further (intersection only — never widens). */
  allowedToolsOverride?: ReadonlyArray<string>;
  /**
   * Override the synthetic endpoint key. By default it is
   * `mcp+caldav://<hostname-of-serverUrl>/<username>`. The runtime
   * passes this same string as McpToolCall.serverUrl when invoking.
   */
  endpoint?: string;
};

function syntheticEndpoint(opts: CalDavBridgeOptions): string {
  if (opts.endpoint) {
    return opts.endpoint;
  }
  let host = "caldav";
  try {
    host = new URL(opts.serverUrl).host;
  } catch {
    // serverUrl was not a URL; fall back to the literal value.
    host = opts.serverUrl;
  }
  const u = encodeURIComponent(opts.username);
  return `mcp+caldav://${host}/${u}`;
}

export function loadCalDavBridge(opts: CalDavBridgeOptions): {
  registered: RegisteredServer;
} {
  const requiredClearance = opts.requiredClearance ?? "internal";
  const endpoint = syntheticEndpoint(opts);
  const baseline = CALDAV_TOOLS;
  const allowedTools = opts.allowedToolsOverride
    ? Object.freeze(baseline.filter((t) => opts.allowedToolsOverride!.includes(t)))
    : baseline;
  const transport = new CalDavTransport(opts);
  const entry: RegisteredServer = Object.freeze({
    id: "mcp.caldav",
    bridge: "mcp-caldav",
    endpoint,
    requiredClearance,
    allowedTools,
    transport,
  });
  registerServer(entry);
  return { registered: entry };
}
