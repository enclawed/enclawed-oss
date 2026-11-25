import { t as isApprovalNotFoundError } from "./approval-errors-7MyUF5wg.js";
import "./error-runtime-ZxMCL7t6.js";
import { t as resolveApprovalOverGateway } from "./approval-gateway-resolver-Dyoiu0Mc.js";
import "./approval-gateway-runtime-FZqYIyx_.js";
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
