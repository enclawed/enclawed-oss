import type { MsgContext } from "../auto-reply/templating.js";
import type { GroupKeyResolution } from "../config/sessions/types.js";
import type { InboundLastRouteUpdate } from "./session.types.js";
export type { InboundLastRouteUpdate, RecordInboundSession } from "./session.types.js";
export declare function recordInboundSession(params: {
    storePath: string;
    sessionKey: string;
    ctx: MsgContext;
    groupResolution?: GroupKeyResolution | null;
    createIfMissing?: boolean;
    updateLastRoute?: InboundLastRouteUpdate;
    onRecordError: (err: unknown) => void;
    /**
     * Hands the metadata write back to the caller so a connection can await it
     * during teardown. Without it the write below is a floating promise and a
     * socket that closes first loses it.
     */
    trackSessionMetaTask?: (task: Promise<unknown>) => void;
}): Promise<void>;
