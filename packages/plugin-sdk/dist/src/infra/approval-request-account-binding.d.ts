import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ExecApprovalRequest } from "./exec-approvals.js";
import type { PluginApprovalRequest } from "./plugin-approvals.js";
type ApprovalRequestLike = ExecApprovalRequest | PluginApprovalRequest;
export declare function resolveApprovalRequestAccountId(params: {
    cfg: EnclawedConfig;
    request: ApprovalRequestLike;
    channel?: string | null;
}): string | null;
export declare function resolveApprovalRequestChannelAccountId(params: {
    cfg: EnclawedConfig;
    request: ApprovalRequestLike;
    channel: string;
}): string | null;
export declare function doesApprovalRequestMatchChannelAccount(params: {
    cfg: EnclawedConfig;
    request: ApprovalRequestLike;
    channel: string;
    accountId?: string | null;
}): boolean;
export {};
