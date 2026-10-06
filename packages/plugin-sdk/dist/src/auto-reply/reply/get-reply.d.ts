import { type EnclawedConfig } from "../../config/config.js";
import type { GetReplyOptions } from "../get-reply-options.types.js";
import type { ReplyPayload } from "../reply-payload.js";
import type { MsgContext } from "../templating.js";
export declare function getReplyFromConfig(ctx: MsgContext, opts?: GetReplyOptions, configOverride?: EnclawedConfig): Promise<ReplyPayload | ReplyPayload[] | undefined>;
