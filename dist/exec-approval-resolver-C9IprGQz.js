import { t as isApprovalNotFoundError } from "./approval-errors-DY3nIPsd.js";
import "./error-runtime-BGM6tzrQ.js";
import { t as resolveApprovalOverGateway } from "./approval-gateway-resolver-k4fP0Nl3.js";
import "./approval-gateway-runtime-BHyMoPzY.js";
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
