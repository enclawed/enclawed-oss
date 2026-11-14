import { t as isApprovalNotFoundError } from "./approval-errors-ButW3oxG.js";
import "./error-runtime-sUu-TTTK.js";
import { t as resolveApprovalOverGateway } from "./approval-gateway-resolver-D6HPB-vu.js";
import "./approval-gateway-runtime-DiRgu8wd.js";
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
