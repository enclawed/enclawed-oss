import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, type EnclawedConfig } from "../config/config.js";
import { VERSION } from "../version.js";
import { EnclawedChannelBridge } from "./channel-bridge.js";
import { ClaudePermissionRequestSchema, type ClaudeChannelMode } from "./channel-shared.js";
import { getChannelMcpCapabilities, registerChannelMcpTools } from "./channel-tools.js";

export { EnclawedChannelBridge } from "./channel-bridge.js";

export type EnclawedMcpServeOptions = {
  gatewayUrl?: string;
  gatewayToken?: string;
  gatewayPassword?: string;
  config?: EnclawedConfig;
  claudeChannelMode?: ClaudeChannelMode;
  verbose?: boolean;
};

export async function createEnclawedChannelMcpServer(opts: EnclawedMcpServeOptions = {}): Promise<{
  server: McpServer;
  bridge: EnclawedChannelBridge;
  start: () => Promise<void>;
  close: () => Promise<void>;
}> {
  const cfg = opts.config ?? loadConfig();
  const claudeChannelMode = opts.claudeChannelMode ?? "auto";
  const capabilities = getChannelMcpCapabilities(claudeChannelMode);
  const server = new McpServer(
    { name: "enclawed", version: VERSION },
    capabilities ? { capabilities } : undefined,
  );
  const bridge = new EnclawedChannelBridge(cfg, {
    gatewayUrl: opts.gatewayUrl,
    gatewayToken: opts.gatewayToken,
    gatewayPassword: opts.gatewayPassword,
    claudeChannelMode,
    verbose: opts.verbose ?? false,
  });
  bridge.setServer(server);

  server.server.setNotificationHandler(ClaudePermissionRequestSchema, async ({ params }) => {
    await bridge.handleClaudePermissionRequest({
      requestId: params.request_id,
      toolName: params.tool_name,
      description: params.description,
      inputPreview: params.input_preview,
    });
  });
  registerChannelMcpTools(server, bridge);

  return {
    server,
    bridge,
    start: async () => {
      await bridge.start();
    },
    close: async () => {
      await bridge.close();
      await server.close();
    },
  };
}

export async function serveEnclawedChannelMcp(opts: EnclawedMcpServeOptions = {}): Promise<void> {
  const { server, start, close } = await createEnclawedChannelMcpServer(opts);
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const shutdown = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.stdin.off("end", shutdown);
    process.stdin.off("close", shutdown);
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    transport["onclose"] = undefined;
    close().then(resolveClosed, resolveClosed);
  };

  transport["onclose"] = shutdown;
  process.stdin.once("end", shutdown);
  process.stdin.once("close", shutdown);
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    await server.connect(transport);
    await start();
    await closed;
  } finally {
    shutdown();
    await closed;
  }
}
