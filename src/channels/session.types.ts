import type { MsgContext } from "../auto-reply/templating.js";
import type { GroupKeyResolution, SessionEntry } from "../config/sessions/types.js";

export type InboundLastRouteUpdate = {
  sessionKey: string;
  channel: SessionEntry["lastChannel"];
  to: string;
  accountId?: string;
  threadId?: string | number;
  mainDmOwnerPin?: {
    ownerRecipient: string;
    senderRecipient: string;
    onSkip?: (params: { ownerRecipient: string; senderRecipient: string }) => void;
  };
};

export type RecordInboundSession = (params: {
  storePath: string;
  sessionKey: string;
  ctx: MsgContext;
  groupResolution?: GroupKeyResolution | null;
  createIfMissing?: boolean;
  updateLastRoute?: InboundLastRouteUpdate;
  onRecordError: (err: unknown) => void;
  /**
   * Optional async-task observer used by the turn runtime to track inbound
   * session metadata writes that the recorder kicks off concurrently
   * (deduplication, last-route persistence, group binding refresh, etc.).
   */
  trackSessionMetaTask?: (task: Promise<unknown>) => void;
}) => Promise<void>;
