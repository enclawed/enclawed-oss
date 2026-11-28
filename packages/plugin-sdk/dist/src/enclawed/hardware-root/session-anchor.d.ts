import type { AnchorCapableDevice } from "./head-anchor.js";
export type SessionAnchorRefusal = "anchor-unauthenticated" | "anchor-unavailable";
export type SessionAnchorDecision = Readonly<{
    ok: true;
    mode: "authenticated";
    device: AnchorCapableDevice;
    devicePublicKey: Buffer;
    relayed: boolean;
}> | Readonly<{
    ok: true;
    mode: "none";
}> | Readonly<{
    ok: false;
    code: SessionAnchorRefusal;
    reason: string;
}>;
export declare class SessionAnchorRefused extends Error {
    readonly code: SessionAnchorRefusal;
    constructor(code: SessionAnchorRefusal, message: string);
}
/**
 * Decide a session's anchor. `bound`: a hardware root is bound to this session (this process
 * owns the devices, or is a client of the owner). `device`: what anchors for it, and
 * `devicePublicKey` the certified key a session is opened against.
 */
export declare function decideSessionAnchor(input: {
    bound: boolean;
    device: unknown;
    devicePublicKey: Buffer | null;
    relayed?: boolean;
}): SessionAnchorDecision;
/** The decision, or SessionAnchorRefused for a bound session that cannot anchor with authentication. */
export declare function requireSessionAnchor(decision: SessionAnchorDecision): Exclude<SessionAnchorDecision, {
    ok: false;
}>;
