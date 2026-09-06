import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { FinalizedMsgContext } from "../templating.js";
export type FastAbortResult = {
    handled: boolean;
    aborted: boolean;
    stoppedSubagents?: number;
};
export type TryFastAbortFromMessage = (params: {
    ctx: FinalizedMsgContext;
    cfg: EnclawedConfig;
}) => Promise<FastAbortResult>;
export type FormatAbortReplyText = (stoppedSubagents?: number) => string;
