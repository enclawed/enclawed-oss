export const CONTROL_UI_BOOTSTRAP_CONFIG_PATH = "/__enclawed/control-ui-config.json";

export type ControlUiEmbedSandboxMode = "strict" | "scripts" | "trusted";

/**
 * How the Control UI treats a `gatewayUrl` supplied by a link:
 * - confirm   : ask the person before switching (open flavor).
 * - allowlist : refuse without asking unless the origin is loopback, the
 *               gateway serving the UI, or in `allowedGatewayOrigins`; ask for
 *               the rest (enclaved flavor).
 */
export type ControlUiGatewayUrlPolicy = "confirm" | "allowlist";

export type ControlUiBootstrapConfig = {
  basePath: string;
  assistantName: string;
  assistantAvatar: string;
  assistantAgentId: string;
  serverVersion?: string;
  localMediaPreviewRoots?: string[];
  embedSandbox?: ControlUiEmbedSandboxMode;
  allowExternalEmbedUrls?: boolean;
  gatewayUrlPolicy?: ControlUiGatewayUrlPolicy;
  /** Normalized gateway origins (`normalizeGatewayOrigin`) from gateway.controlUi.allowedGatewayUrls. */
  allowedGatewayOrigins?: string[];
};
