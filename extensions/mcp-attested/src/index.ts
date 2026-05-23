export { QClearedMcpClient } from "./client.js";
export { verifyServerClearance } from "./server-clearance-verifier.js";
export type { ClearanceVerifyResult } from "./server-clearance-verifier.js";
export type { McpToolCall, McpToolResult, McpClientOptions } from "./client.js";

// HTTP transport for first-party / community MCP servers that speak
// JSON-RPC over HTTP(S).
export { HttpJsonRpcTransport } from "./http-transport.js";
export type {
  HttpTransportOptions,
  JsonRpcResult,
  JsonRpcOk,
  JsonRpcErr,
  AuthProvider,
} from "./http-transport.js";

// OAuth bearer-token provider for Google Workspace MCP servers.
export { GoogleOAuthProvider } from "./oauth-google.js";
export type { GoogleOAuthEnv, GoogleOAuthProviderOptions } from "./oauth-google.js";

// In-process registry of admitted MCP server bridges; the first-party
// bundled bridges (mcp-google-workspace, mcp-github) register here at
// load time and the client enforces their `allowedTools` allowlist.
export {
  registerServer,
  unregisterServer,
  getServerById,
  getServerByEndpoint,
  listServers,
  isToolAdmitted,
  ServerRegistrationError,
  _resetServerRegistryForTest,
} from "./server-registry.js";
export type { RegisteredServer } from "./server-registry.js";
