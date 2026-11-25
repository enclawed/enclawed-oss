import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import type { ResolvedBlueBubblesAccount } from "./accounts.js";
import { getBlueBubblesRuntime } from "./runtime.js";
export {
  DEFAULT_WEBHOOK_PATH,
  normalizeWebhookPath,
  resolveWebhookPathFromConfig,
} from "./webhook-shared.js";

export type BlueBubblesRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export type BlueBubblesMonitorOptions = {
  account: ResolvedBlueBubblesAccount;
  config: EnclawedConfig;
  runtime: BlueBubblesRuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  webhookPath?: string;
};

export type BlueBubblesCoreRuntime = ReturnType<typeof getBlueBubblesRuntime>;

export type WebhookTarget = {
  account: ResolvedBlueBubblesAccount;
  config: EnclawedConfig;
  runtime: BlueBubblesRuntimeEnv;
  core: BlueBubblesCoreRuntime;
  path: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};
