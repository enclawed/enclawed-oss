import type { MsgContext } from "../auto-reply/templating.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export type ApplyLinkUnderstandingResult = {
    outputs: string[];
    urls: string[];
};
export declare function applyLinkUnderstanding(params: {
    ctx: MsgContext;
    cfg: EnclawedConfig;
}): Promise<ApplyLinkUnderstandingResult>;
