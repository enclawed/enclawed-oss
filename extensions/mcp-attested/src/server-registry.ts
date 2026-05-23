// In-process registry of registered MCP server bridges.
//
// The bundled first-party bridges (extensions/mcp-google-workspace,
// extensions/mcp-github) call registerServer() at load time to declare
// their endpoint, transport, auth provider, and the *closed list* of tool
// names they are willing to admit. QClearedMcpClient.invoke() consults
// this registry: tools outside the declared list are denied at the admission
// gate before any network traffic.
//
// This is the `servers[].tools[]` admission contract the tutorial copy and
// the main-pillars agent's policy-loader path both reference. The registry
// keeps the contract internal-only — it is NOT a public plugin-SDK surface
// — so the two parallel agents cannot conflict on it: whatever JSON config
// schema the main agent lands, it ultimately calls into this same
// registerServer() seam.

import type { HttpJsonRpcTransport } from "./http-transport.js";

export type RegisteredServer = Readonly<{
  /** Stable id (e.g. "mcp.google.gmail", "mcp.github"). */
  id: string;
  /** Bridge / publisher name (e.g. "mcp-google-workspace"). */
  bridge: string;
  /** Endpoint the bridge is willing to talk to. */
  endpoint: string;
  /** Required clearance for the admission gate (defaults to "internal"). */
  requiredClearance: string;
  /** Closed list of tool names this bridge admits through. */
  allowedTools: ReadonlyArray<string>;
  /** Bound transport (already wired to auth, etc.). */
  transport: HttpJsonRpcTransport;
}>;

const REGISTRY = new Map<string, RegisteredServer>();

export class ServerRegistrationError extends Error {
  override name = "ServerRegistrationError";
}

export function registerServer(entry: RegisteredServer): void {
  if (!entry || typeof entry.id !== "string" || entry.id.length === 0) {
    throw new ServerRegistrationError("registerServer: id is required");
  }
  if (typeof entry.endpoint !== "string" || entry.endpoint.length === 0) {
    throw new ServerRegistrationError(`registerServer(${entry.id}): endpoint is required`);
  }
  if (!Array.isArray(entry.allowedTools) || entry.allowedTools.length === 0) {
    throw new ServerRegistrationError(
      `registerServer(${entry.id}): allowedTools must be a non-empty array`,
    );
  }
  if (REGISTRY.has(entry.id)) {
    throw new ServerRegistrationError(`registerServer(${entry.id}): already registered`);
  }
  REGISTRY.set(entry.id, Object.freeze({
    ...entry,
    allowedTools: Object.freeze([...entry.allowedTools]),
  }));
}

export function unregisterServer(id: string): boolean {
  return REGISTRY.delete(id);
}

export function getServerById(id: string): RegisteredServer | undefined {
  return REGISTRY.get(id);
}

export function getServerByEndpoint(endpoint: string): RegisteredServer | undefined {
  for (const v of REGISTRY.values()) {
    if (v.endpoint === endpoint) return v;
  }
  return undefined;
}

export function listServers(): ReadonlyArray<RegisteredServer> {
  return [...REGISTRY.values()];
}

/** Test helper: wipe all entries. */
export function _resetServerRegistryForTest(): void {
  REGISTRY.clear();
}

/** True iff `tool` appears in the bridge's allowedTools list. */
export function isToolAdmitted(bridge: RegisteredServer, tool: string): boolean {
  return bridge.allowedTools.includes(tool);
}
