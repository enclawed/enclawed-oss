export type McpLoopbackRuntime = {
    port: number;
    token: string;
};
export declare function getActiveMcpLoopbackRuntime(): McpLoopbackRuntime | undefined;
export declare function setActiveMcpLoopbackRuntime(runtime: McpLoopbackRuntime): void;
export declare function clearActiveMcpLoopbackRuntime(token: string): void;
export declare function createMcpLoopbackServerConfig(port: number): {
    mcpServers: {
        enclawed: {
            type: string;
            url: string;
            headers: {
                Authorization: string;
                "x-session-key": string;
                "x-enclawed-agent-id": string;
                "x-enclawed-account-id": string;
                "x-enclawed-message-channel": string;
                "x-enclawed-sender-is-owner": string;
            };
        };
    };
};
