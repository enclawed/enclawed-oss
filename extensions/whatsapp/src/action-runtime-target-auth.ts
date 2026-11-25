import { ToolAuthorizationError } from "@enclawed/plugin-sdk/channel-actions";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { resolveWhatsAppAccount } from "./accounts.js";
import { resolveWhatsAppOutboundTarget } from "./resolve-outbound-target.js";

export function resolveAuthorizedWhatsAppOutboundTarget(params: {
  cfg: EnclawedConfig;
  chatJid: string;
  accountId?: string;
  actionLabel: string;
}): { to: string; accountId: string } {
  const account = resolveWhatsAppAccount({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  const resolution = resolveWhatsAppOutboundTarget({
    to: params.chatJid,
    allowFrom: account.allowFrom ?? [],
    mode: "implicit",
  });
  if (!resolution.ok) {
    throw new ToolAuthorizationError(
      `WhatsApp ${params.actionLabel} blocked: chatJid "${params.chatJid}" is not in the configured allowFrom list for account "${account.accountId}".`,
    );
  }
  return { to: resolution.to, accountId: account.accountId };
}
