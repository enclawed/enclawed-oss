import { resolveConfigPath, resolveGatewayPort } from "../config/paths.js";
import type { EnclawedConfig } from "../config/types.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import { isSecureWebSocketUrl } from "./net.js";

export type GatewayConnectionDetails = {
  url: string;
  urlSource: string;
  bindDetail?: string;
  remoteFallbackNote?: string;
  message: string;
};

type GatewayConnectionDetailResolvers = {
  loadConfig?: () => EnclawedConfig;
  resolveConfigPath?: (env: NodeJS.ProcessEnv) => string;
  resolveGatewayPort?: (cfg?: EnclawedConfig, env?: NodeJS.ProcessEnv) => number;
};

export function buildGatewayConnectionDetailsWithResolvers(
  options: {
    config?: EnclawedConfig;
    url?: string;
    configPath?: string;
    urlSource?: "cli" | "env";
  } = {},
  resolvers: GatewayConnectionDetailResolvers = {},
): GatewayConnectionDetails {
  const config = options.config ?? resolvers.loadConfig?.() ?? {};
  const configPath =
    options.configPath ??
    resolvers.resolveConfigPath?.(process.env) ??
    resolveConfigPath(process.env);
  const isRemoteMode = config.gateway?.mode === "remote";
  const remote = isRemoteMode ? config.gateway?.remote : undefined;
  const tlsEnabled = config.gateway?.tls?.enabled === true;
  const localPort =
    resolvers.resolveGatewayPort?.(config, process.env) ?? resolveGatewayPort(config);
  const bindMode = config.gateway?.bind ?? "loopback";
  const scheme = tlsEnabled ? "wss" : "ws";
  const localUrl = `${scheme}://127.0.0.1:${localPort}`;
  const cliUrlOverride = normalizeOptionalString(options.url);
  const envUrlOverride = cliUrlOverride
    ? undefined
    : normalizeOptionalString(process.env.ENCLAWED_GATEWAY_URL);
  const urlOverride = cliUrlOverride ?? envUrlOverride;
  const remoteUrl = normalizeOptionalString(remote?.url);
  const remoteMisconfigured = isRemoteMode && !urlOverride && !remoteUrl;
  const urlSourceHint =
    options.urlSource ?? (cliUrlOverride ? "cli" : envUrlOverride ? "env" : undefined);
  const url = urlOverride || remoteUrl || localUrl;
  const urlSource = urlOverride
    ? urlSourceHint === "env"
      ? "env ENCLAWED_GATEWAY_URL"
      : "cli --url"
    : remoteUrl
      ? "config gateway.remote.url"
      : remoteMisconfigured
        ? "missing gateway.remote.url (fallback local)"
        : "local loopback";
  const bindDetail = !urlOverride && !remoteUrl ? `Bind: ${bindMode}` : undefined;
  const remoteFallbackNote = remoteMisconfigured
    ? "Warn: gateway.mode=remote but gateway.remote.url is missing; set gateway.remote.url or switch gateway.mode=local."
    : undefined;

  const allowPrivateWs = process.env.ENCLAWED_ALLOW_INSECURE_PRIVATE_WS === "1";
  if (!isSecureWebSocketUrl(url, { allowPrivateWs })) {
    throw new Error(
      [
        `SECURITY ERROR: Gateway URL "${url}" uses plaintext ws:// to a non-loopback address.`,
        "Both credentials and chat data would be exposed to network interception.",
        `Source: ${urlSource}`,
        `Config: ${configPath}`,
        "Fix: Use wss:// for remote gateway URLs.",
        "Safe remote access defaults:",
        "- keep gateway.bind=loopback and use an SSH tunnel (ssh -N -L 18789:127.0.0.1:18789 user@gateway-host)",
        "- or use Tailscale Serve/Funnel for HTTPS remote access",
        allowPrivateWs
          ? undefined
          : "Break-glass (trusted private networks only): set ENCLAWED_ALLOW_INSECURE_PRIVATE_WS=1",
        "Doctor: enclawed doctor --fix",
        "Docs: https://docs.enclawed.ai/gateway/remote",
      ].join("\n"),
    );
  }

  const message = [
    `Gateway target: ${url}`,
    `Source: ${urlSource}`,
    `Config: ${configPath}`,
    bindDetail,
    remoteFallbackNote,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    url,
    urlSource,
    bindDetail,
    remoteFallbackNote,
    message,
  };
}
