import type { ReplyPayload } from "../../auto-reply/reply-payload.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
export declare function shouldSuppressLocalExecApprovalPrompt(params: {
    channel?: string | null;
    cfg: EnclawedConfig;
    accountId?: string | null;
    payload: ReplyPayload;
}): boolean;
