import fs from "node:fs";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { getPlatformAdapter } from "../engine/adapter/index.js";
import {
  DEFAULT_ACCOUNT_ID as ENGINE_DEFAULT_ACCOUNT_ID,
  applyAccountConfig,
  listAccountIds,
  resolveAccountBase,
  resolveDefaultAccountId,
} from "../engine/config/resolve.js";
import type { ResolvedQQBotAccount, QQBotAccountConfig } from "../types.js";

export const DEFAULT_ACCOUNT_ID = ENGINE_DEFAULT_ACCOUNT_ID;

interface QQBotChannelConfig extends QQBotAccountConfig {
  accounts?: Record<string, QQBotAccountConfig>;
  defaultAccount?: string;
}

/** List all configured QQBot account IDs. */
export function listQQBotAccountIds(cfg: EnclawedConfig): string[] {
  return listAccountIds(cfg as unknown as Record<string, unknown>);
}

/** Resolve the default QQBot account ID. */
export function resolveDefaultQQBotAccountId(cfg: EnclawedConfig): string {
  return resolveDefaultAccountId(cfg as unknown as Record<string, unknown>);
}

/** Resolve QQBot account config for runtime or setup flows. */
export function resolveQQBotAccount(
  cfg: EnclawedConfig,
  accountId?: string | null,
  opts?: { allowUnresolvedSecretRef?: boolean },
): ResolvedQQBotAccount {
  const raw = cfg as unknown as Record<string, unknown>;
  const base = resolveAccountBase(raw, accountId);

  const qqbot = cfg.channels?.qqbot as QQBotChannelConfig | undefined;
  /**
   * Legacy top-level account uses `channels.qqbot` as the base, but per-account
   * fields (allowFrom, streaming, …) often live under `accounts.default`.
   * Merge that slice so runtime sees `config.streaming` etc.
   */
  const accountConfig: QQBotAccountConfig =
    base.accountId === DEFAULT_ACCOUNT_ID
      ? {
          ...qqbot,
          ...qqbot?.accounts?.[DEFAULT_ACCOUNT_ID],
        }
      : (qqbot?.accounts?.[base.accountId] ?? {});

  let clientSecret = "";
  let secretSource: "config" | "file" | "env" | "none" = "none";

  const clientSecretPath =
    base.accountId === DEFAULT_ACCOUNT_ID
      ? "channels.qqbot.clientSecret"
      : `channels.qqbot.accounts.${base.accountId}.clientSecret`;

  const adapter = getPlatformAdapter();
  if (adapter.hasConfiguredSecret(accountConfig.clientSecret)) {
    clientSecret = opts?.allowUnresolvedSecretRef
      ? (adapter.normalizeSecretInputString(accountConfig.clientSecret) ?? "")
      : (adapter.resolveSecretInputString({
          value: accountConfig.clientSecret,
          path: clientSecretPath,
        }) ?? "");
    secretSource = "config";
  } else if (accountConfig.clientSecretFile) {
    try {
      clientSecret = fs.readFileSync(accountConfig.clientSecretFile, "utf8").trim();
      secretSource = "file";
    } catch {
      secretSource = "none";
    }
  } else if (process.env.QQBOT_CLIENT_SECRET && base.accountId === DEFAULT_ACCOUNT_ID) {
    clientSecret = process.env.QQBOT_CLIENT_SECRET;
    secretSource = "env";
  }

  return {
    accountId: base.accountId,
    name: accountConfig.name,
    enabled: base.enabled,
    appId: base.appId,
    clientSecret,
    secretSource,
    systemPrompt: base.systemPrompt,
    markdownSupport: base.markdownSupport,
    config: accountConfig,
  };
}

/** Apply account config updates back into the Enclawed config object. */
export function applyQQBotAccountConfig(
  cfg: EnclawedConfig,
  accountId: string,
  input: {
    appId?: string;
    clientSecret?: string;
    clientSecretFile?: string;
    name?: string;
  },
): EnclawedConfig {
  return applyAccountConfig(
    cfg as unknown as Record<string, unknown>,
    accountId,
    input,
  ) as EnclawedConfig;
}
