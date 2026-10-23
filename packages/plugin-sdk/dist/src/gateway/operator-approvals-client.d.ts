import type { EnclawedConfig } from "../config/types.enclawed.js";
import { GatewayClient, type GatewayClientOptions } from "./client.js";
export declare function createOperatorApprovalsGatewayClient(params: Pick<GatewayClientOptions, "clientDisplayName" | "onClose" | "onConnectError" | "onEvent" | "onHelloOk"> & {
    config: EnclawedConfig;
    gatewayUrl?: string;
}): Promise<GatewayClient>;
export declare function withOperatorApprovalsGatewayClient<T>(params: {
    config: EnclawedConfig;
    gatewayUrl?: string;
    clientDisplayName: string;
}, run: (client: GatewayClient) => Promise<T>): Promise<T>;
