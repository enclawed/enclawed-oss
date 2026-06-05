import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { OutboundIdentity } from "./identity-types.js";
export type { OutboundIdentity } from "./identity-types.js";
export declare function normalizeOutboundIdentity(identity?: OutboundIdentity | null): OutboundIdentity | undefined;
export declare function resolveAgentOutboundIdentity(cfg: EnclawedConfig, agentId: string): OutboundIdentity | undefined;
