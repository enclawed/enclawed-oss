import type { EnclawedConfig } from "../config/types.enclawed.js";
export type ApprovalCommandAuthorization = {
    authorized: boolean;
    reason?: string;
    explicit: boolean;
};
export declare function resolveApprovalCommandAuthorization(params: {
    cfg: EnclawedConfig;
    channel?: string | null;
    accountId?: string | null;
    senderId?: string | null;
    kind: "exec" | "plugin";
}): ApprovalCommandAuthorization;
