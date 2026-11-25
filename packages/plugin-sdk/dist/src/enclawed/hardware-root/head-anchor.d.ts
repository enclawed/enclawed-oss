import type { HeadAnchorSink } from "../audit-log.js";
import { type AnchorResponse } from "./enclaweder-hid.js";
/** An open anchor session, as AnchorSession provides it. */
export type AnchorSessionHandle = {
    readonly sid: bigint;
    /** Command set 0.5: the activation binding of a bound session (null or absent: unbound). */
    readonly binding?: Buffer | null;
    set(head32: Buffer): Promise<AnchorResponse>;
    close(): Promise<void>;
    /** Best-effort close that cannot be awaited, for process exit. */
    closeSync?(): void;
    /** Lease renewal (command set 0.2); see AnchorSession.startKeepalive. */
    startKeepalive?(intervalMs: number, onLost: (err: Error) => void): void;
    stopKeepalive?(): void;
};
/** The slice of the device this needs (Enclaweder provides it). */
export type AnchorCapableDevice = {
    anchorOpen(devicePublicKey: Buffer): Promise<AnchorSessionHandle>;
    anchorGet(): Promise<AnchorResponse | null>;
    /** Command set 0.5: ANCHOR_OPEN_BOUND with a held activation's nonce (AnchorSession.openBound). */
    anchorOpenBound?(devicePublicKey: Buffer, activationNonce: Buffer): Promise<AnchorSessionHandle>;
    /** Command set 0.5: ANCHOR_READ over `nonce32`, the raw answer (one byte 8 = unsupported). */
    anchorRead?(nonce32: Buffer): Promise<Buffer>;
};
/**
 * Something other than this logger holds or held the anchor channel. Distinct from
 * HeadAnchorTampered (a record that does not verify): this is raised while WRITING, and must
 * reach an operator rather than be retried.
 *
 *   ANCHOR_SESSION_BUSY      ANCHOR_OPEN answered ERR_BUSY: another session is open on the
 *                            device. Something on this host opened it first, or this logger's
 *                            previous process crashed without closing. `waitMs` (command set
 *                            0.2) is that holder's lease left if it stops renewing; a crashed
 *                            logger's session is gone then. To recover sooner: an operator-quorum
 *                            takeover. Firmware 0.1 has no lease (waitMs null): only a replug.
 *   ANCHOR_SESSION_HIJACKED  the device dropped this logger's session (ERR_AUTH mid-session, or
 *                            a refused lease renewal) and the reopen did not get the next session
 *                            id, so another session was opened in between (another process, or
 *                            an operator takeover). The head is still anchored under the new
 *                            session before this is thrown.
 */
export type HeadAnchorAlarmCode = "ANCHOR_SESSION_BUSY" | "ANCHOR_SESSION_HIJACKED";
export declare class HeadAnchorAlarm extends Error {
    readonly code: HeadAnchorAlarmCode;
    /** ANCHOR_SESSION_BUSY on command set 0.2: the holder's lease left, ms (a lower bound). */
    readonly waitMs: number | null;
    constructor(code: HeadAnchorAlarmCode, detail: string, waitMs?: number | null);
}
/**
 * An anchor that is present but does not verify.
 *
 * Distinct from an absent anchor on purpose. "Missing" means we cannot prove
 * completeness; "present and wrong" means someone edited it, which is a finding
 * in its own right and must never be reported as a clean absence.
 */
/**
 * Why a stored or live anchor was rejected.
 *   invalid          does not verify, is malformed, or is inconsistent with the counter.
 *   foreign-session  the device's head was set under an anchor session this logger never held:
 *                    something else anchored the device (another logger, or malware).
 *   downgrade        a record format older than one this logger already stored.
 */
export type HeadAnchorTamperCode = "invalid" | "foreign-session" | "downgrade";
export declare class HeadAnchorTampered extends Error {
    readonly code: HeadAnchorTamperCode;
    constructor(reason: string, code?: HeadAnchorTamperCode);
}
/**
 * Close every anchor session this process holds (authenticated ANCHOR_CLOSE). Call at a
 * graceful shutdown; process exit falls back to a best-effort close that is not awaited.
 */
export declare function closeHeadAnchorSessions(): Promise<void>;
/**
 * Head anchor attested by the enclaweder's monotonic counter.
 *
 * @param devicePublicKey raw Ed25519 public key from the device's identity,
 *   which the guard has already checked against the signed birth certificate.
 *   Verification is against THAT key, not one read back from the anchor file,
 *   or an attacker would simply supply their own key alongside their own
 *   signature.
 */
export declare function enclawederHeadAnchor(opts: {
    device: AnchorCapableDevice;
    devicePublicKey: Buffer;
    /** Where the offline copy is kept. */
    path: string;
    serial?: string;
}): HeadAnchorSink;
