import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { MsgContext, TemplateContext } from "../templating.js";
export declare function stageSandboxMedia(params: {
    ctx: MsgContext;
    sessionCtx: TemplateContext;
    cfg: EnclawedConfig;
    sessionKey?: string;
    workspaceDir: string;
}): Promise<void>;
