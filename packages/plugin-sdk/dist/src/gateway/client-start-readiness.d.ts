import type { GatewayClient, GatewayClientOptions } from "./client.js";
import { type EventLoopReadyResult } from "./event-loop-ready.js";
export type GatewayClientStartReadinessOptions = {
    timeoutMs?: number;
    clientOptions?: Pick<GatewayClientOptions, "connectChallengeTimeoutMs" | "connectDelayMs">;
    signal?: AbortSignal;
};
export declare function resolveGatewayClientStartReadinessTimeoutMs(options?: GatewayClientStartReadinessOptions): number;
export declare function startGatewayClientWhenEventLoopReady(client: GatewayClient, options?: GatewayClientStartReadinessOptions): Promise<EventLoopReadyResult>;
