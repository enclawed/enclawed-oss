import { resolveApprovalOverGateway } from "@enclawed/plugin-sdk/approval-gateway-runtime";
import type { ExecApprovalReplyDecision } from "@enclawed/plugin-sdk/approval-runtime";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { isApprovalNotFoundError } from "@enclawed/plugin-sdk/error-runtime";

export { isApprovalNotFoundError };

export async function resolveMatrixApproval(params: {
  cfg: EnclawedConfig;
  approvalId: string;
  decision: ExecApprovalReplyDecision;
  senderId?: string | null;
  gatewayUrl?: string;
}): Promise<void> {
  await resolveApprovalOverGateway({
    cfg: params.cfg,
    approvalId: params.approvalId,
    decision: params.decision,
    senderId: params.senderId,
    gatewayUrl: params.gatewayUrl,
    clientDisplayName: `Matrix approval (${params.senderId?.trim() || "unknown"})`,
  });
}
