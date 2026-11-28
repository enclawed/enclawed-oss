import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { GatewayMessageChannel } from "../utils/message-channel.js";
import type { ToolFsPolicy } from "./tool-fs-policy.js";
export type EnclawedPluginToolOptions = {
    agentSessionKey?: string;
    agentChannel?: GatewayMessageChannel;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
    agentDir?: string;
    workspaceDir?: string;
    config?: EnclawedConfig;
    fsPolicy?: ToolFsPolicy;
    requesterSenderId?: string | null;
    senderIsOwner?: boolean;
    sessionId?: string;
    sandboxBrowserBridgeUrl?: string;
    allowHostBrowserControl?: boolean;
    sandboxed?: boolean;
    allowGatewaySubagentBinding?: boolean;
};
export declare function resolveEnclawedPluginToolInputs(params: {
    options?: EnclawedPluginToolOptions;
    resolvedConfig?: EnclawedConfig;
    runtimeConfig?: EnclawedConfig;
}): {
    context: {
        config: EnclawedConfig | undefined;
        runtimeConfig: EnclawedConfig | undefined;
        fsPolicy: ToolFsPolicy | undefined;
        workspaceDir: string;
        agentDir: string | undefined;
        agentId: string;
        sessionKey: string | undefined;
        sessionId: string | undefined;
        browser: {
            sandboxBridgeUrl: string | undefined;
            allowHostControl: boolean | undefined;
        };
        messageChannel: (string & {
            readonly __enclawedChannelIdBrand?: never;
        }) | undefined;
        agentAccountId: string | undefined;
        deliveryContext: import("../utils/delivery-context.types.ts").DeliveryContext | undefined;
        requesterSenderId: string | undefined;
        senderIsOwner: boolean | undefined;
        sandboxed: boolean | undefined;
    };
    allowGatewaySubagentBinding: boolean | undefined;
};
