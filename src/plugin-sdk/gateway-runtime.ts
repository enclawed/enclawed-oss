// Public gateway/client helpers for plugins that talk to the host gateway surface.

export * from "../gateway/channel-status-patches.js";
export { GatewayClient } from "../gateway/client.js";
export {
  createOperatorApprovalsGatewayClient,
  withOperatorApprovalsGatewayClient,
} from "../gateway/operator-approvals-client.js";
export type { EventFrame } from "../gateway/protocol/index.js";
export type {
  GatewayRequestHandlerOptions,
  GatewayRequestHandlers,
} from "../gateway/server-methods/types.js";

export { addGatewayClientOptions, callGatewayFromCli } from "../cli/gateway-rpc.js";
export type { GatewayRpcOpts } from "../cli/gateway-rpc.types.js";
export type { NodeSession } from "../gateway/node-registry.js";
export { ensureGatewayStartupAuth } from "../gateway/startup-auth.js";
export { ErrorCodes, errorShape, type ErrorCode } from "../gateway/protocol/schema/error-codes.js";
export { isLoopbackHost } from "./browser-config-support.js";
export { isNodeCommandAllowed, resolveNodeCommandAllowlist } from "../gateway/node-command-policy.js";
export { resolveGatewayAuth } from "../gateway/auth.js";
export { respondUnavailableOnNodeInvokeError } from "../gateway/server-methods/nodes.helpers.js";
export { safeParseJson } from "../utils.js";

export { createTransportActivityStatusPatch } from "../gateway/channel-status-patches.js";
export { startGatewayClientWhenEventLoopReady } from "../gateway/client-start-readiness.js";
