import type { MsgContext } from "../auto-reply/templating.js";
import type { EnclawedConfig } from "../config/types.enclawed.js";
export type LinkUnderstandingResult = {
    urls: string[];
    outputs: string[];
};
export declare function runLinkUnderstanding(params: {
    cfg: EnclawedConfig;
    ctx: MsgContext;
    message?: string;
}): Promise<LinkUnderstandingResult>;
