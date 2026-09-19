import type { ExecApprovalSessionTarget } from "../infra/exec-approval-session-target.js";
import type { ExecApprovalRequest } from "../infra/exec-approvals.js";
import type { PluginApprovalRequest } from "../infra/plugin-approvals.js";
import type { EnclawedConfig } from "./config-runtime.js";
type ApprovalRequest = ExecApprovalRequest | PluginApprovalRequest;
type ApprovalKind = "exec" | "plugin";
type ApprovalResolverParams = {
    cfg: EnclawedConfig;
    accountId?: string | null;
    approvalKind?: ApprovalKind;
    request: ApprovalRequest;
};
type NativeApprovalTarget = {
    to: string;
    threadId?: string | number | null;
};
export declare function createChannelNativeOriginTargetResolver<TTarget>(params: {
    channel: string;
    shouldHandleRequest?: (params: ApprovalResolverParams) => boolean;
    resolveTurnSourceTarget: (request: ApprovalRequest) => TTarget | null;
    resolveSessionTarget: (sessionTarget: ExecApprovalSessionTarget, request: ApprovalRequest) => TTarget | null;
    /**
     * Equality predicate for two resolved targets. When omitted, a default is
     * derived from `normalizeTargetForMatch` (or strict structural equality when
     * neither is supplied).
     */
    targetsMatch?: (a: TTarget, b: TTarget) => boolean;
    /**
     * Normalizes a target before equality comparison. Use this when only the
     * comparable subset (e.g. recipient id) should be matched while preserving
     * the original target for delivery.
     */
    normalizeTargetForMatch?: (target: TTarget) => TTarget;
    resolveFallbackTarget?: (request: ApprovalRequest) => TTarget | null;
}): (input: ApprovalResolverParams) => TTarget | null;
export declare function createChannelApproverDmTargetResolver<TApprover, TTarget extends NativeApprovalTarget = NativeApprovalTarget>(params: {
    shouldHandleRequest?: (params: ApprovalResolverParams) => boolean;
    resolveApprovers: (params: {
        cfg: EnclawedConfig;
        accountId?: string | null;
    }) => readonly TApprover[];
    mapApprover: (approver: TApprover, params: ApprovalResolverParams) => TTarget | null | undefined;
}): (input: ApprovalResolverParams) => TTarget[];
export {};
