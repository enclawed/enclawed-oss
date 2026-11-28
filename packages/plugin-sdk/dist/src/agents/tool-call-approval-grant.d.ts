import { ApprovalGrantLedger, type ApprovalConsumeResult, type ApprovalGrant, type ResourceIdentity } from "../enclawed/approval-binding.js";
import type { SandboxTarget } from "../enclawed/fs-reversibility.js";
type Where = {
    fsRoot?: string;
    fsSandbox?: SandboxTarget;
};
/**
 * The resources a call touches, resolved now: the host files a file tool
 * writes, and the URL a tool fetches or posts to. Sandboxed file targets are
 * bound by their arguments only (the sandbox's own file bridge resolves them).
 */
export declare function resolveToolCallResources(toolName: string, params: unknown, where: Where): Promise<ResourceIdentity[]>;
export declare function issueToolCallGrant(params: {
    toolName: string;
    args: unknown;
    where: Where;
    timeoutMs?: number;
}): Promise<ApprovalGrant>;
export declare function approveToolCallGrant(id: string): boolean;
export declare function revokeToolCallGrant(id: string): void;
/** Spend the grant on the call as it is now; refused unless it is the approved call. */
export declare function consumeToolCallGrant(params: {
    grantId: string;
    toolName: string;
    args: unknown;
    where: Where;
}): Promise<ApprovalConsumeResult>;
/** The lines added to an approval request so the person sees what they approve. */
export declare function describeGrantForApproval(grant: ApprovalGrant, args: unknown): string;
export declare const __testing: {
    ledger: ApprovalGrantLedger;
};
export {};
