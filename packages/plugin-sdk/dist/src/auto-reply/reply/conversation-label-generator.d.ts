import type { EnclawedConfig } from "../../config/types.enclawed.js";
export type ConversationLabelParams = {
    userMessage: string;
    prompt: string;
    cfg: EnclawedConfig;
    agentId?: string;
    agentDir?: string;
    maxLength?: number;
};
export declare function generateConversationLabel(params: ConversationLabelParams): Promise<string | null>;
