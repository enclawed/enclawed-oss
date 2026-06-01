import { t as isApprovalNotFoundError } from "./approval-errors-BicXj9VF.js";
import "./error-runtime-B1mERaOx.js";
import { t as resolveApprovalOverGateway } from "./approval-gateway-resolver-CQv1DHEO.js";
import "./approval-gateway-runtime-DJBJt0LG.js";
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
