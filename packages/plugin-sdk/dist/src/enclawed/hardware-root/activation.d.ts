export declare const CS05: Readonly<{
    readonly ANCHOR_OPEN_BOUND: 55;
    readonly ANCHOR_READ: 56;
    readonly KEY_DERIVE: 57;
}>;
export declare const TAG_ANCHOR_READ: Buffer<ArrayBuffer>;
/** How long the device keeps an activation (and so how long this process offers one). */
export declare const ACTIVATION_TTL_MS = 120000;
/** The TOTP verdict purpose that activates a launch. */
export declare const SESSION_START_PURPOSE = 1;
export type ActivationKind = "unlock-use" | "totp";
/** What the device must bind for an activation: the fields a verifier finds in the log. */
export type ActivationFacts = Readonly<{
    kind: "unlock-use";
    gid: bigint;
    useIndex: number;
    boot?: bigint;
}> | Readonly<{
    kind: "totp";
    step: number;
    counter: bigint;
}>;
export type Binding = Readonly<{
    kind: ActivationKind | "unknown";
    useIndex: number;
    step: number;
    gid: bigint;
    boot: bigint;
    counter: bigint;
}>;
/** A 32-byte binding as the device writes it; null when it is not one. */
export declare function parseBinding(b: Buffer | null | undefined): Binding | null;
/** Whether a device-written binding names exactly this activation. */
export declare function bindingNames(binding: Buffer | null | undefined, f: ActivationFacts): boolean;
/**
 * Remember an activation this process just made on device `devicePubHex`: `nonce` is the request
 * nonce it sent (UNLOCK_USE / TOTP_VERIFY), `facts` what the device's signed answer said.
 */
export declare function noteActivation(devicePubHex: string, nonce: Buffer, facts: ActivationFacts, now?: number): void;
export type HeldActivation = Readonly<{
    facts: ActivationFacts;
    nonce: Buffer;
    at: number;
}>;
/** The newest fresh activation not yet spent for `use`, or null. Does not spend it. */
export declare function peekActivation(devicePubHex: string, use: "anchor" | "key", now?: number): HeldActivation | null;
/** Mark an activation spent for `use` (the device spent it: never present it again for that). */
export declare function spendActivation(devicePubHex: string, a: HeldActivation, use: "anchor" | "key"): void;
/** Forget every activation (tests; and a process that lost its device). */
export declare function clearActivations(): void;
/** A fresh anchor read: the device's current record, signed over this process's nonce. */
export type FreshAnchorRead = Readonly<{
    /** The device has anchored at least once (counter > 0). */
    anchored: boolean;
    counter: bigint;
    head: Buffer;
    uid: Buffer;
    sess: bigint;
    opens: bigint;
    /** A session is live now, and its id (0n when none). */
    live: boolean;
    liveSid: bigint;
    /** The live session is bound; `liveBind` is its binding (else null). */
    liveBind: Buffer | null;
    /** The current head was set by the live session. */
    headByLive: boolean;
}>;
/**
 * Verifies an ANCHOR_READ answer: `status(1) body(112) sig(64)`, signed by the certified key over
 * "enclaweder.anchor-read.v1" | nonce | body, for `uid` when given. Null when it does not verify
 * (a replayed read, another device's, or an altered one).
 */
export declare function verifyAnchorRead(devicePubRaw: Buffer, nonce: Buffer, payload: Buffer, uid?: Buffer | null): FreshAnchorRead | null;
/**
 * The launch activations a log records: every `auth.device-factor` record (any adapter's prefix)
 * whose outcome is "verified". A device unlock names its grant and use (gid, useIndex); a device
 * TOTP code names its step and counter when the adapter records them (records without them name
 * nothing, so a bound anchor cannot be matched to them).
 */
export declare function deviceFactorActivations(records: Iterable<unknown>): ActivationFacts[];
/**
 * What the device has PROVEN about its command set. IDENTIFY's `fw_major.fw_minor` is unsigned and,
 * through the hardware root's owner, only the owner's word; an older version is exactly what an
 * owner would claim to have UNLOCK_USE relayed in the clear (its nonce is the launch's activation).
 * The proof is a fresh ANCHOR_READ (0x38): only command set 0.5 answers it, signed by the certified
 * key over a nonce chosen here, so nothing that relays can produce it.
 *
 *   proven     a verifying ANCHOR_READ over this process's nonce: command set 0.5 or later;
 *   older      the answer was "unsupported" (ERR_UNSUPPORTED, or a lone ERR_BAD_ARG): an older
 *              command set, or something in between that says so (indistinguishable, never proof);
 *   unproven   no answer, or one that does not verify over this nonce for this device.
 */
export type CommandSetProof = Readonly<{
    status: "proven";
    commandSet: "0.5";
}> | Readonly<{
    status: "older";
    reason: string;
}> | Readonly<{
    status: "unproven";
    reason: string;
}>;
/** The firmware update a refusal names (the Enclaweder firmware 0.3.3, command set 0.5). */
export declare const CS05_REFLASH_RUNBOOK = "the Enclaweder firmware 0.3.3 update from Enclawed, Inc.";
/**
 * Ask the device to prove command set 0.5: `read(nonce32)` carries ANCHOR_READ to it (directly, or
 * relayed) and returns the raw answer. `devicePubRaw` / `uid` are the CERTIFIED key and uid.
 */
export declare function proveCommandSet05(read: ((nonce32: Buffer) => Promise<Buffer>) | null | undefined, devicePubRaw: Buffer, uid: Buffer): Promise<CommandSetProof>;
