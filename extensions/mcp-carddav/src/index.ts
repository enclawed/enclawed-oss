// Bundled bridge: CardDAV MCP server bound to an app-specific
// password. The Contacts half of the secretary's three-MCP surface
// after the migration off Google OAuth.

import { registerServer, type RegisteredServer } from "../../mcp-attested/src/server-registry.js";
import { CardDavTransport, type CardDavTransportOptions } from "./carddav-transport.js";

export { CardDavTransport } from "./carddav-transport.js";
export type { CardDavTransportOptions, Contact } from "./carddav-transport.js";
export { parseVCard, type ParsedContact } from "./vcard.js";

export const CARDDAV_TOOLS = Object.freeze(["search_contacts", "list_contacts"]);

export type CardDavBridgeOptions = CardDavTransportOptions & {
  requiredClearance?: string;
  allowedToolsOverride?: ReadonlyArray<string>;
  endpoint?: string;
};

function syntheticEndpoint(opts: CardDavBridgeOptions): string {
  if (opts.endpoint) {
    return opts.endpoint;
  }
  let host = "carddav";
  try {
    host = new URL(opts.serverUrl).host;
  } catch {
    host = opts.serverUrl;
  }
  const u = encodeURIComponent(opts.username);
  return `mcp+carddav://${host}/${u}`;
}

export function loadCardDavBridge(opts: CardDavBridgeOptions): {
  registered: RegisteredServer;
} {
  const requiredClearance = opts.requiredClearance ?? "internal";
  const endpoint = syntheticEndpoint(opts);
  const baseline = CARDDAV_TOOLS;
  const allowedTools = opts.allowedToolsOverride
    ? Object.freeze(baseline.filter((t) => opts.allowedToolsOverride!.includes(t)))
    : baseline;
  const transport = new CardDavTransport(opts);
  const entry: RegisteredServer = Object.freeze({
    id: "mcp.carddav",
    bridge: "mcp-carddav",
    endpoint,
    requiredClearance,
    allowedTools,
    transport,
  });
  registerServer(entry);
  return { registered: entry };
}
