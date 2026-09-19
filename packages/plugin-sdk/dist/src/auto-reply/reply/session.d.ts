import { type GroupKeyResolution, type SessionEntry, type SessionScope } from "../../config/sessions/types.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { MsgContext, TemplateContext } from "../templating.js";
export type SessionInitResult = {
    sessionCtx: TemplateContext;
    sessionEntry: SessionEntry;
    previousSessionEntry?: SessionEntry;
    sessionStore: Record<string, SessionEntry>;
    sessionKey: string;
    sessionId: string;
    isNewSession: boolean;
    resetTriggered: boolean;
    systemSent: boolean;
    abortedLastRun: boolean;
    storePath: string;
    sessionScope: SessionScope;
    groupResolution?: GroupKeyResolution;
    isGroup: boolean;
    bodyStripped?: string;
    triggerBodyNormalized: string;
};
export declare function initSessionState(params: {
    ctx: MsgContext;
    cfg: EnclawedConfig;
    commandAuthorized: boolean;
}): Promise<SessionInitResult>;
