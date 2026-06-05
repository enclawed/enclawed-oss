import { vi } from "vitest";
import { createRuntimeEnv } from "../../test-utils/plugin-runtime-env.js";
import type { ChannelAccountSnapshot } from "../../channels/plugins/types.core.js";
import type { ChannelGatewayContext } from "../../channels/plugins/types.adapters.js";
import type { EnclawedConfig } from "../config-types.js";
import type { RuntimeEnv } from "../../runtime.js";

export function createStartAccountContext<TAccount extends { accountId: string }>(params: {
  account: TAccount;
  abortSignal?: AbortSignal;
  cfg?: EnclawedConfig;
  runtime?: RuntimeEnv;
  statusPatchSink?: (next: ChannelAccountSnapshot) => void;
}): ChannelGatewayContext<TAccount> {
  const snapshot: ChannelAccountSnapshot = {
    accountId: params.account.accountId,
    configured: true,
    enabled: true,
    running: false,
  };
  return {
    accountId: params.account.accountId,
    account: params.account,
    cfg: params.cfg ?? ({} as EnclawedConfig),
    runtime: params.runtime ?? createRuntimeEnv(),
    abortSignal: params.abortSignal ?? new AbortController().signal,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    getStatus: () => snapshot,
    setStatus: (next: ChannelAccountSnapshot) => {
      Object.assign(snapshot, next);
      params.statusPatchSink?.(snapshot);
    },
  };
}
