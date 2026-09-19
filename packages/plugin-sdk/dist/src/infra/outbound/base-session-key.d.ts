import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { type RoutePeer } from "../../routing/resolve-route.js";
export declare function buildOutboundBaseSessionKey(params: {
    cfg: EnclawedConfig;
    agentId: string;
    channel: string;
    accountId?: string | null;
    peer: RoutePeer;
}): string;
