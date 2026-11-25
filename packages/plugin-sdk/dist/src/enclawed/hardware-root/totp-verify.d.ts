import type { LatchFrameDevice } from "./device-latch.js";
export declare const TOTP_OP: {
    readonly LATCH_GET: 28;
    readonly TOTP_VERIFY: 45;
    readonly SIGN_ATTESTED: 46;
};
export declare const TAG_TOTP_VERDICT: Buffer<ArrayBuffer>;
export declare const TAG_ATTESTED_SIGN: Buffer<ArrayBuffer>;
export { CLOCK_DISAGREES_TEXT } from "./clock-disagrees-text.js";
/**
 * Purpose bytes the device binds into what it signs. 0x01..0x7F are verdict
 * purposes (TOTP_VERIFY), 0x80..0xFF attested-sign purposes (SIGN_ATTESTED); the device refuses
 * a purpose outside its command's range, so a verdict can never stand in for an attested signature.
 */
export declare const TOTP_PURPOSE: Readonly<{
    readonly "session-start": 1;
    readonly "policy-change": 2;
    readonly recovery: 3;
    readonly "disable-protection": 4;
    readonly "history-restore": 5;
    readonly admin: 6;
    readonly "auth-change": 7;
    readonly "auth-test": 8;
    readonly unlock: 9;
}>;
export type TotpPurpose = keyof typeof TOTP_PURPOSE;
export declare const ATTESTED_PURPOSE: Readonly<{
    readonly "admin-policy": 129;
}>;
export type AttestedPurpose = keyof typeof ATTESTED_PURPOSE;
/** How far the device's accepted step may sit from this host's clock (seconds). */
export declare const STEP_SKEW_S = 300;
export type DeviceTotpFailure = "malformed-code" | "malformed-nonce" | "unknown-purpose" | "unsupported" | "not-enrolled" | "locked" | "backoff" | "rejected" | "clock-disagrees" | "bad-signature" | "bad-verdict" | "stale-step" | "no-response" | "device-error";
/** The slice of a bound, certified device this needs. */
export type DeviceTotpAccess = {
    /** The device's identity key, as certified (birth certificate chained to a pinned root). */
    pubkeyRaw: Buffer;
    uid: Buffer;
    run<T>(fn: (dev: LatchFrameDevice) => Promise<T>): Promise<T>;
    /**
     * A device's LATCH_GET answer over a nonce of the caller's, when the device is reached through
     * another process (the broker's attestation round): `payload` is the device's raw answer and
     * `signedOver` what it signed it over, which the implementation has checked binds `nonce32`
     * (attestDigest of a batch containing it). Absent: LATCH_GET goes to the device through run().
     */
    latch?(nonce32: Buffer): Promise<{
        signedOver: Buffer;
        payload: Buffer;
    }>;
};
export interface VerdictBody {
    ver: number;
    purpose: number;
    pass: boolean;
    rfails: number;
    step: number;
    counter: bigint;
    waitMs: number;
    uid: Buffer;
}
export declare function parseVerdictBody(body: Buffer): VerdictBody;
/** The exact message TOTP_VERIFY (and every failed SIGN_ATTESTED) signs. */
export declare function verdictMessage(nonce: Buffer, body: Buffer): Buffer;
/** The exact message a passing SIGN_ATTESTED signs. */
export declare function attestedMessage(nonce: Buffer, body: Buffer, digest: Buffer, summary: Buffer): Buffer;
export declare function verifyVerdictSignature(pubRaw: Buffer, nonce: Buffer, body: Buffer, sig: Buffer): boolean;
export declare function verifyAttestedSignature(pubRaw: Buffer, nonce: Buffer, body: Buffer, digest: Buffer, summary: Buffer, sig: Buffer): boolean;
/** SHA3-256 of the human-readable summary the person was shown. */
export declare function summaryHash(text: string): Buffer;
type Evaluated = {
    ok: true;
    body: VerdictBody;
    rawBody: Buffer;
    sig: Buffer;
} | {
    ok: false;
    code: DeviceTotpFailure;
    waitMs?: number;
    /** On "rejected" / "clock-disagrees" only: the device's signed refusal, checked like a pass. */
    signed?: {
        rawBody: Buffer;
        sig: Buffer;
    };
};
/**
 * Checks one evaluated answer: signature over OUR nonce under the certified key, the expected
 * purpose and uid, and (on a pass) a step near this host's clock. Exported for the tests.
 */
export declare function checkVerdictAnswer(p: Buffer, opts: {
    nonce: Buffer;
    pubkeyRaw: Buffer;
    uid: Buffer;
    purpose: number;
    nowS: number;
    attested?: {
        digest: Buffer;
        summary: Buffer;
    };
}): Evaluated;
/** True when the device reports (signed, over a fresh nonce) a valid TOTP factor and a clear latch. */
export declare function deviceTotpEnrolled(access: DeviceTotpAccess): Promise<boolean>;
/** TOTP_VERIFY: the device's verdict on a typed 6-digit code, verified here. */
export declare function deviceTotpVerify(access: DeviceTotpAccess, p: {
    code: string;
    purpose: string;
    nowS?: number;
}): Promise<{
    ok: true;
    step: number;
    counter: bigint;
} | {
    ok: false;
    code: DeviceTotpFailure;
    waitMs?: number;
}>;
/**
 * A device-signed TOTP verdict, everything an offline verifier needs, hex-encoded. `body` is the
 * 32-byte verdict body (parseVerdictBody) and `sig` the device's signature over
 * verdictMessage(nonce, body), under the device key `pubkey`.
 */
export type VerdictRecord = {
    v: 1;
    purpose: number;
    uid: string;
    pubkey: string;
    nonce: string;
    body: string;
    sig: string;
};
export type DeviceTotpVerdict = {
    ok: true;
    record: VerdictRecord;
    step: number;
    stepTimeS: number;
    counter: bigint;
} | {
    ok: false;
    code: DeviceTotpFailure;
    waitMs?: number;
    /** Present when the device evaluated the code and signed its refusal ("rejected", "clock-disagrees"). */
    record?: VerdictRecord;
};
/**
 * TOTP_VERIFY over a nonce the CALLER chose (32 bytes), so the signed verdict can bind the
 * caller's own data (for example the hash of a grant it is about to store). Returns the checked,
 * device-signed record. A "no" from the device, or an answer that does not verify, is a result,
 * never an exception; only a failure to reach the device throws.
 */
export declare function deviceTotpVerdict(access: DeviceTotpAccess, p: {
    code: string;
    purpose: string;
    nonce: Uint8Array;
    nowS?: number;
}): Promise<DeviceTotpVerdict>;
/**
 * Offline check of a stored verdict record: signed by the expected device key, over the expected
 * nonce, a PASS for the expected purpose. The caller decides which device key counts (and must
 * have established that it is certified). Freshness is the caller's: `stepTimeS` is the time of
 * the code the device accepted (step * 30), by the authenticator's clock.
 */
export declare function verifyVerdictRecord(rec: unknown, expect: {
    purpose: TotpPurpose;
    nonce: Uint8Array;
    pubkeyRaw: Buffer;
    uid: Buffer;
}): {
    ok: true;
    stepTimeS: number;
    counter: bigint;
} | {
    ok: false;
    reason: string;
};
/** What a passing SIGN_ATTESTED produced: everything a verifier needs, hex-encoded. */
export type AttestedRecord = {
    v: 1;
    purpose: number;
    uid: string;
    pubkey: string;
    nonce: string;
    body: string;
    digest: string;
    summary: string;
    sig: string;
};
/** SIGN_ATTESTED: the device signs `digest` in the same request as a fresh, device-verified code. */
export declare function deviceSignAttested(access: DeviceTotpAccess, p: {
    code: string;
    purpose: AttestedPurpose;
    digest: Buffer;
    summaryText: string;
    nowS?: number;
}): Promise<{
    ok: true;
    record: AttestedRecord;
} | {
    ok: false;
    code: DeviceTotpFailure;
    waitMs?: number;
}>;
/**
 * Offline check of a stored attested record. The caller decides WHICH device keys may approve
 * (and must have established that they are certified); this checks the signature, the binding to
 * the expected purpose, digest and summary, and returns the device-attested time (step * 30).
 */
export declare function verifyAttestedRecord(rec: unknown, expect: {
    purpose: AttestedPurpose;
    digest: Buffer;
    summaryText: string;
    pubkeyRaw: Buffer;
    uid: Buffer;
}): {
    ok: true;
    stepTimeS: number;
    counter: bigint;
} | {
    ok: false;
    reason: string;
};
/**
 * The device-verified second factor for auth/device-factor.ts. `access` is resolved at every
 * call, so a device that went DIRTY or away in between is never used.
 */
export declare function createDeviceTotpSecondFactor(access: () => DeviceTotpAccess | null): {
    enrolled(): Promise<boolean>;
    verify(p: {
        code: string;
        purpose: string;
    }): Promise<{
        ok: true;
    } | {
        ok: false;
        code: string;
    }>;
} | null;
