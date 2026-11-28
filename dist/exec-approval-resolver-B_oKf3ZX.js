import { t as isApprovalNotFoundError } from "./approval-errors-9CpY2jzv.js";
import "./error-runtime-BgFs31oW.js";
import { t as resolveApprovalOverGateway } from "./approval-gateway-resolver-Cqm-j1Fy.js";
import "./approval-gateway-runtime-GBgR2usk.js";
//#region extensions/matrix/src/exec-approval-resolver.ts
async function resolveMatrixApproval(params) {
	await resolveApprovalOverGateway({
		cfg: params.cfg,
		approvalId: params.approvalId,
		decision: params.decision,
		senderId: params.senderId,
		gatewayUrl: params.gatewayUrl,
		clientDisplayName: `Matrix approval (${params.senderId?.trim() || "unknown"})`
	});
}
//#endregion
export { isApprovalNotFoundError, resolveMatrixApproval };
