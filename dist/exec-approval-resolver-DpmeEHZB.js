import { t as isApprovalNotFoundError } from "./approval-errors-DKwTFnr5.js";
import "./error-runtime-8fPZWhDX.js";
import { t as resolveApprovalOverGateway } from "./approval-gateway-resolver-CN6UAShO.js";
import "./approval-gateway-runtime-DfvvdH-9.js";
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
