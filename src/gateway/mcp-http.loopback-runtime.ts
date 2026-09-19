export type McpLoopbackRuntime = {
  port: number;
  token: string;
};

let activeRuntime: McpLoopbackRuntime | undefined;

export function getActiveMcpLoopbackRuntime(): McpLoopbackRuntime | undefined {
  return activeRuntime ? { ...activeRuntime } : undefined;
}

export function setActiveMcpLoopbackRuntime(runtime: McpLoopbackRuntime): void {
  activeRuntime = { ...runtime };
}

export function clearActiveMcpLoopbackRuntime(token: string): void {
  if (activeRuntime?.token === token) {
    activeRuntime = undefined;
  }
}

export function createMcpLoopbackServerConfig(port: number) {
  return {
    mcpServers: {
      enclawed: {
        type: "http",
        url: `http://127.0.0.1:${port}/mcp`,
        headers: {
          Authorization: "Bearer ${ENCLAWED_MCP_TOKEN}",
          "x-session-key": "${ENCLAWED_MCP_SESSION_KEY}",
          "x-enclawed-agent-id": "${ENCLAWED_MCP_AGENT_ID}",
          "x-enclawed-account-id": "${ENCLAWED_MCP_ACCOUNT_ID}",
          "x-enclawed-message-channel": "${ENCLAWED_MCP_MESSAGE_CHANNEL}",
          "x-enclawed-sender-is-owner": "${ENCLAWED_MCP_SENDER_IS_OWNER}",
        },
      },
    },
  };
}
