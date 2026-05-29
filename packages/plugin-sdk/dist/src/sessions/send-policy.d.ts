import type { SessionChatType, SessionEntry } from "../config/sessions.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export type SessionSendPolicyDecision = "allow" | "deny";
export declare function normalizeSendPolicy(raw?: string | null): SessionSendPolicyDecision | undefined;
export declare function resolveSendPolicy(params: {
    cfg: EnclawedConfig;
    entry?: SessionEntry;
    sessionKey?: string;
    channel?: string;
    chatType?: SessionChatType;
}): SessionSendPolicyDecision;
