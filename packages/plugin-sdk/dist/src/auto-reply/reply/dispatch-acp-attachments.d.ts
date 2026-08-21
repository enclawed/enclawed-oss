import type { AcpTurnAttachment } from "../../acp/control-plane/manager.types.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { FinalizedMsgContext } from "../templating.js";
export declare function loadDispatchAcpMediaRuntime(): Promise<typeof import("./dispatch-acp-media.runtime.js")>;
export type DispatchAcpAttachmentRuntime = Pick<Awaited<ReturnType<typeof loadDispatchAcpMediaRuntime>>, "MediaAttachmentCache" | "isMediaUnderstandingSkipError" | "normalizeAttachments" | "resolveMediaAttachmentLocalRoots">;
export declare function resolveAcpAttachments(params: {
    ctx: FinalizedMsgContext;
    cfg: EnclawedConfig;
    runtime?: DispatchAcpAttachmentRuntime;
}): Promise<AcpTurnAttachment[]>;
