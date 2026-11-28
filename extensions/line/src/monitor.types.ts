// Leaf contract for the LINE provider monitor. Kept separate from monitor.ts
// so runtime.ts can type the injected monitor entrypoint without importing the
// monitor module (which itself reads the runtime store).

import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import type { RuntimeEnv } from "@enclawed/plugin-sdk/runtime-env";
import type { webhook } from "@line/bot-sdk";
import type { ResolvedLineAccount } from "./types.js";

export interface MonitorLineProviderOptions {
  channelAccessToken: string;
  channelSecret: string;
  accountId?: string;
  config: EnclawedConfig;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
  webhookUrl?: string;
  webhookPath?: string;
}

export interface LineProviderMonitor {
  account: ResolvedLineAccount;
  handleWebhook: (body: webhook.CallbackRequest) => Promise<void>;
  stop: () => void;
}

export type MonitorLineProvider = (
  opts: MonitorLineProviderOptions,
) => Promise<LineProviderMonitor>;
