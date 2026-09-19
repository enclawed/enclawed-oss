import type { MsgContext } from "../auto-reply/templating.js";
import type { EnclawedConfig } from "../config/types.js";
import type { ActiveMediaModel } from "./active-model.types.js";
import type { MediaUnderstandingDecision, MediaUnderstandingOutput, MediaUnderstandingProvider } from "./types.js";
export type ApplyMediaUnderstandingResult = {
    outputs: MediaUnderstandingOutput[];
    decisions: MediaUnderstandingDecision[];
    appliedImage: boolean;
    appliedAudio: boolean;
    appliedVideo: boolean;
    appliedFile: boolean;
};
export declare function applyMediaUnderstanding(params: {
    ctx: MsgContext;
    cfg: EnclawedConfig;
    agentDir?: string;
    providers?: Record<string, MediaUnderstandingProvider>;
    activeModel?: ActiveMediaModel;
}): Promise<ApplyMediaUnderstandingResult>;
