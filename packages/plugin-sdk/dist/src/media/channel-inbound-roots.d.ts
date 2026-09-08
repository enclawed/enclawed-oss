import type { MsgContext } from "../auto-reply/templating.js";
import type { EnclawedConfig } from "../config/types.js";
export declare function resolveChannelInboundAttachmentRoots(params: {
    cfg: EnclawedConfig;
    ctx: MsgContext;
}): readonly string[] | undefined;
export declare function resolveChannelRemoteInboundAttachmentRoots(params: {
    cfg: EnclawedConfig;
    ctx: MsgContext;
}): readonly string[] | undefined;
