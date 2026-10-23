import {
  createResolvedApproverActionAuthAdapter,
  resolveApprovalApprovers,
} from "@enclawed/plugin-sdk/approval-auth-runtime";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { resolveSlackAccount, resolveSlackAccountAllowFrom } from "./accounts.js";
import { normalizeSlackApproverId } from "./exec-approvals.js";

function getSlackApprovalApprovers(params: {
  cfg: EnclawedConfig;
  accountId?: string | null;
}): string[] {
  const account = resolveSlackAccount(params).config;
  return resolveApprovalApprovers({
    allowFrom: resolveSlackAccountAllowFrom(params),
    defaultTo: account.defaultTo,
    normalizeApprover: normalizeSlackApproverId,
    normalizeDefaultTo: normalizeSlackApproverId,
  });
}

export function isSlackApprovalAuthorizedSender(params: {
  cfg: EnclawedConfig;
  accountId?: string | null;
  senderId?: string | null;
}): boolean {
  const senderId = params.senderId ? normalizeSlackApproverId(params.senderId) : undefined;
  if (!senderId) {
    return false;
  }
  return getSlackApprovalApprovers(params).includes(senderId);
}

export const slackApprovalAuth = createResolvedApproverActionAuthAdapter({
  channelLabel: "Slack",
  resolveApprovers: ({ cfg, accountId }) => getSlackApprovalApprovers({ cfg, accountId }),
  normalizeSenderId: (value) => normalizeSlackApproverId(value),
});
