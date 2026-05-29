import type { EnclawedConfig } from "../config/types.enclawed.js";
import type { ExecApprovalDecision } from "./exec-approvals.js";
export type ResolveApprovalOverGatewayParams = {
    cfg: EnclawedConfig;
    approvalId: string;
    decision: ExecApprovalDecision;
    senderId?: string | null;
    allowPluginFallback?: boolean;
    gatewayUrl?: string;
    clientDisplayName?: string;
};
export declare function resolveApprovalOverGateway(params: ResolveApprovalOverGatewayParams): Promise<void>;
