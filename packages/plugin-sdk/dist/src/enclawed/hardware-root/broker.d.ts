import net from "node:net";
import { type EnclawederSku } from "./enclaweder-hid.js";
import { type QueueJournal } from "./queue-journal.js";
/** What a process sees of the machine's hardware root. */
export type RootHealth = {
    status: "CLEAN";
} | {
    status: "DIRTY";
    reason: string;
}
/** The owner is gone or busy; not a tamper. Gated work waits or is refused. */
 | {
    status: "UNAVAILABLE";
    reason: string;
};
export type RootMember = {
    uid: string;
    pubkey: string;
    serial: string;
    /** The member's birth certificate (hex), which a client verifies against the pinned roots. */
    cert?: string;
};
/** A member as a client accepted it: certificate verified, model taken from the certificate. */
export type VerifiedMember = RootMember & {
    cert: string;
    sku: EnclawederSku;
};
/** One member's signed latch read, as the owner relays it (finding H1). */
export type MemberAttestation = {
    uid: string;
    latch: string;
};
/**
 * The nonce the device signs for a batch of client nonces: one LATCH_GET per member serves
 * every client polling at once, and each client checks that its own nonce is in the batch.
 */
export declare function attestDigest(nonces: Buffer[]): Buffer;
/** The slice of a device a signer needs. */
export type SigningDevice = {
    getIdentity(): Promise<{
        uid: Buffer;
        pubkeyRaw: Buffer;
    }>;
    challenge(nonce32: Buffer): Promise<{
        uid: Buffer;
        sig: Buffer;
    }>;
};
/** What the owner serves: its devices, a way to run work on one, its health. */
export type RootService = {
    members(): RootMember[];
    run<T>(fn: (dev: SigningDevice) => Promise<T>): Promise<T>;
    health(): RootHealth;
    /**
     * Has the device sign a journal head under the owner's authenticated latch session
     * (LATCH_CHECKPOINT, its own signature tag). Never CHALLENGE: that signs any 32 bytes for
     * anyone on the host, so a checkpoint made with it proves nothing (finding H2).
     */
    checkpoint?(head32: Buffer): Promise<{
        uid: Buffer;
        sid: bigint;
        ck: bigint;
        sig: Buffer;
    }>;
    /**
     * Each member's raw LATCH_GET answer over `nonce32` (finding H1): what lets a client check,
     * for itself, that a genuine device is here and holds a clean latch. No answer, no CLEAN.
     */
    attest?(nonce32: Buffer): Promise<MemberAttestation[]>;
    /**
     * Relays one sealed-factor frame (open 0x35 / sealed request 0x36) to the primary member and
     * returns its raw answer. The owner only moves bytes: a client seals its authenticator or
     * recovery code to the device itself, so the owner can neither read nor alter it.
     */
    relaySealed?(type: 0x35 | 0x36, payload: Buffer): Promise<Buffer>;
    /**
     * Relays one UNLOCK_USE (0x31) request to the primary member and returns its raw answer. The
     * request carries no secret (the client's nonce, a grant id, the host time, a scope); the
     * device signs its receipt over the client's own nonce, so the owner can neither forge a
     * receipt nor hand the client another client's.
     */
    relayUnlockUse?(payload: Buffer): Promise<Buffer>;
    /**
     * Relays one audit-anchor frame (open, set, keepalive, close, get) to the primary member and
     * returns its raw answer. The client runs the whole authenticated anchor session itself: the
     * session key comes from an exchange the device signs over the client's own nonce with the
     * certified key, every set is MAC'd under that key and every record is device-signed, so the
     * owner moves bytes it can neither read the key from nor forge (relayed-anchor.ts).
     */
    relayAnchor?(type: AnchorRelayType, payload: Buffer): Promise<Buffer>;
    /** `n` bytes of optional extra entropy from the hardware root, mixed in by callers. */
    entropy?(n: number): Promise<Buffer>;
};
/**
 * The audit-anchor frames a client may relay, with each request's exact length: ANCHOR_SET
 * (head, sid, counter, MAC), ANCHOR_GET (empty), ANCHOR_OPEN (the client's X25519 half and
 * nonce; an operator takeover is never relayed), ANCHOR_CLOSE and ANCHOR_KEEPALIVE (sid,
 * counter, MAC), and ANCHOR_READ (command set 0.5: the client's nonce).
 */
export declare const ANCHOR_RELAY_LENGTHS: Readonly<Record<number, number>>;
export type AnchorRelayType = 0x17 | 0x18 | 0x19 | 0x1a | 0x1b | 0x38;
/** Bounds of the broker's relay ops: frame sizes, and requests per client per second. */
export declare const RELAY_LIMITS: Readonly<{
    sealOpenLen: 48;
    sealedMinLen: number;
    sealedMaxLen: number;
    sealedPerSecond: 8;
    /** nonce(32) gid(8) host_time(8) scope(32): UNLOCK_USE's exact request. */
    unlockUseLen: 80;
    unlockUsePerSecond: 4;
    entropyMaxBytes: 64;
    entropyPerSecond: 4;
    /** A session's open, a set every log write, a keepalive every 30 s, a close; reads. */
    anchorPerSecond: 8;
}>;
/**
 * Checks one relay request against RELAY_LIMITS (shape only, nothing about the device). Returns
 * the decoded frame, or a reason. Exported for the bounds tests.
 */
export declare function checkRelayRequest(req: {
    op: "sealed";
    type?: unknown;
    frame?: unknown;
} | {
    op: "unlock-use";
    frame?: unknown;
} | {
    op: "anchor";
    type?: unknown;
    frame?: unknown;
} | {
    op: "entropy";
    n?: unknown;
}): {
    ok: true;
    type?: 0x35 | 0x36;
    anchorType?: AnchorRelayType;
    frame?: Buffer;
    n?: number;
} | {
    ok: false;
    error: string;
};
/** A per-client rate limit: at most `perSecond` requests in any one-second window. */
export declare class RelayRateLimit {
    #private;
    private readonly perSecond;
    private readonly now;
    constructor(perSecond: number, now?: () => number);
    take(): boolean;
}
/**
 * The socket the machine's owner listens on, for this user: ONE path per host user (finding
 * H11), never something the environment chooses between. On Linux it is
 * `/run/user/<host uid>/enclawed/enclaweder.sock`, built from the HOST uid (finding N16: a
 * process in `unshare -r` is uid 0 to itself, and must still find the host user's owner rather
 * than become a second one). XDG_RUNTIME_DIR and TMPDIR are not consulted: a process with one
 * and a process without would look for two different owners. Without /run/user/<uid> there is
 * no broker path, and boot refuses (brokerPathError) instead of falling back. Elsewhere (no
 * /run/user: macOS, Windows) the per-user temporary directory of the account is used.
 * ENCLAWEDER_BROKER remains the operator's explicit override (an absolute path), or "off".
 */
export declare function brokerSocketPath(): string;
/**
 * Why the broker path cannot be used, or null: on Linux the host uid must be known and its
 * runtime directory (/run/user/<uid>) must exist. Refusing is the point (finding H11): a
 * fallback that depends on the environment splits one machine into two owners.
 */
export declare function brokerPathError(): string | null;
/** The longest socket path the kernel keeps whole (sun_path, less its NUL). */
export declare const MAX_SOCKET_PATH = 107;
/** True when sharing is turned off: every process binds the devices itself. */
export declare function brokerDisabled(): boolean;
/**
 * Makes sure the socket's directory is this user's own, a real directory, and
 * closed to everyone else; creates it so if absent. Throws otherwise: a
 * directory another user controls could hold a socket that impersonates the
 * owner.
 */
export declare function secureSocketDir(socketPath: string): void;
/**
 * The owner's scheduler for device work. Every process on the machine shares
 * the devices, so their requests are scheduled, never raced:
 *
 *  - fair share: queues are per client and served round-robin, so one client
 *    that floods the device cannot starve another's heartbeats;
 *  - bounded: a client may have at most `maxQueued` requests waiting; more are
 *    refused at once ("busy") without touching a device. A device does on the
 *    order of ten operations a second, so a few waiting requests is already a
 *    backlog of a heartbeat interval;
 *  - deadlines: a request that waited longer than its deadline (its own, or
 *    `maxWaitMs`, whichever is shorter) is answered "timed out" and never
 *    sent: a heartbeat signed after its interval has passed is of no use;
 *  - concurrency: at most `slots()` requests run at once, one per device (the
 *    device itself takes one request on the wire at a time).
 */
export declare class DeviceScheduler {
    private readonly exec;
    private readonly slots;
    private readonly opts;
    private readonly now;
    private readonly queues;
    /** Requests per client counted against its bound: waiting, or being journaled. */
    private readonly held;
    private order;
    /** The client served last; the next turn starts after it. */
    private lastServed;
    private running;
    private seq;
    /** Clients that went away: anything of theirs still being journaled is refused. */
    private readonly gone;
    private timer;
    private checkpointed;
    private checkpointing;
    constructor(exec: (digest: Buffer) => Promise<{
        uid: Buffer;
        sig: Buffer;
    }>, slots: () => number, opts?: {
        maxQueued: number;
        maxWaitMs: number;
        /** Records every request and outcome; see queue-journal.ts. */
        journal?: QueueJournal;
        /** Signs a journal head under the latch session (finding H2); no signer = no checkpoints. */
        checkpointSigner?: (head32: Buffer) => Promise<{
            uid: Buffer;
            sid: bigint;
            ck: bigint;
            sig: Buffer;
        }>;
        /** How often the device signs the journal's head, when it has grown. */
        checkpointMs?: number;
    }, now?: () => number);
    /** Requests waiting and running. */
    stats(): {
        queued: number;
        running: number;
        clients: number;
    };
    submit(client: number, digest: Buffer, deadlineMs?: number): Promise<{
        uid: Buffer;
        sig: Buffer;
    }>;
    private enqueue;
    private release;
    /** A client went away: its waiting requests are dropped, unsent. */
    forget(client: number): void;
    /** Stops the checkpoint timer. */
    stop(): void;
    /**
     * Has the device sign the journal's head, if it grew since the last
     * checkpoint. The checkpoint goes through the queue like any request, and
     * writes only its own record, so an idle journal is not checkpointed again.
     */
    private checkpoint;
    /** Records the outcome, then hands it back: nothing leaves unrecorded. */
    private finish;
    private nextJob;
    private pump;
}
/**
 * Claims the owner's socket: listens on it and returns the server, or returns
 * null when a live owner already answers there. A socket nobody listens on is
 * stale (its owner died) and is replaced, but only that exact file: one that
 * is merely busy, or was replaced meanwhile, is never removed.
 */
export declare function claimOwnership(socketPath: string): Promise<net.Server | null>;
/**
 * Whether an owner listens on the socket: "live" (it accepted), "stale"
 * (nobody listens: refused, or no such file), or "busy" (any other failure,
 * such as a full backlog; never a reason to remove the socket).
 */
export declare function probeOwner(socketPath: string): Promise<"live" | "stale" | "busy">;
/** True when a live owner answers on the socket. */
export declare function ownerAnswers(socketPath: string): Promise<boolean>;
/**
 * Serves `service` on a claimed socket. Requests that arrive before `ready`
 * settles wait for it; if it rejects (the devices would not bind), every
 * request is answered with that reason.
 */
/** The scheduler every device request on a machine goes through, the owner's own included. */
export declare function schedulerFor(svc: RootService, journal?: QueueJournal, limits?: {
    maxQueued: number;
    maxWaitMs: number;
}): DeviceScheduler;
/** The owner's own client id in its scheduler. */
export declare const OWNER_CLIENT = 0;
export declare function serveRoot(server: net.Server, ready: Promise<{
    svc: RootService;
    scheduler: DeviceScheduler;
}>): {
    close(): Promise<void>;
};
/** A client's view of the owner. */
export type RemoteRoot = {
    /** Every member, each certificate verified against the pinned roots. */
    readonly members: VerifiedMember[];
    health(): RootHealth;
    /** Member 0, for signing; its answers are verified against that member's certified key. */
    device(): SigningDevice & {
        getCert(): Promise<Buffer>;
    };
    /**
     * Each member's latch read signed over a fresh nonce of the caller's, verified here, plus the
     * owner's raw answer so a separate process can check it again itself (codenclawed's hook).
     */
    attest(nonce32: Buffer): Promise<RemoteAttestation>;
    /**
     * Relays a sealed-factor frame through the owner (a SealRelay). The owner sees
     * only ciphertext; the client verifies the device's answers itself.
     */
    relaySealed(type: 0x35 | 0x36, payload: Buffer): Promise<Buffer>;
    /**
     * Relays one UNLOCK_USE request (80 bytes) through the owner. The device signs its receipt
     * over the client's nonce; the client verifies it (verifyUnlockReceipt) before acting on it.
     */
    relayUnlockUse(payload: Buffer): Promise<Buffer>;
    /**
     * Relays one audit-anchor frame through the owner; the client verifies every answer itself
     * (relayed-anchor.ts).
     */
    relayAnchor(type: AnchorRelayType, payload: Buffer): Promise<Buffer>;
    /** `n` (1..64) bytes of optional extra entropy from the hardware root, through the owner. */
    entropy(n: number): Promise<Buffer>;
    /** Resolves when the connection to the owner is lost. */
    readonly lost: Promise<void>;
    close(): void;
};
export declare class RootHaltError extends Error {
}
/**
 * The process answering on the broker socket did not prove a genuine device (finding H1): a
 * member without a valid birth certificate, a latch read that does not verify, a signature from
 * a key no member has.
 */
export declare class RootAttestError extends Error {
}
/** A verified attestation round: what each member's device signed over the caller's nonce. */
export type RemoteAttestation = {
    nonce: string;
    /** The batch of nonces the devices signed the digest of (the caller's is among them). */
    nonces: string[];
    members: Array<MemberAttestation & {
        pubkey: string;
        cert: string;
        sku: EnclawederSku;
    }>;
};
/**
 * Checks an attestation round for `nonce` against `members` (finding H1). Returns the verified
 * latch states per member uid, or throws RootAttestError naming what did not verify. Exported so
 * any process holding the owner's raw answer can check it itself.
 */
export declare function verifyRootAttestation(members: VerifiedMember[], nonce: Buffer, att: {
    nonces: unknown;
    members: unknown;
}): Map<string, {
    state: "CLEAR" | "SET";
    reason: string;
    sessionLive: boolean;
    armed: boolean;
    sid: bigint;
}>;
/** Checks every member's certificate; returns them with the model the certificate proves. */
export declare function verifyRootMembers(raw: unknown, rootPubkey?: Buffer | null): VerifiedMember[];
/** Options for connectRoot. */
export type ConnectOptions = {
    /** Demand one manufacturer root instead of the pinned domains (tests, single-SKU deployments). */
    rootPubkey?: Buffer | null;
    /** Deadline for a members/health answer (finding H3). */
    askTimeoutMs?: number;
    /** Deadline for a signature, waiting in the owner's queue included. */
    signTimeoutMs?: number;
};
/**
 * Connects to the owner. Throws RootHaltError when the owner reports that the devices would not
 * bind (not genuine, latched DIRTY, a session that may not continue): the client must refuse
 * exactly as the owner did. Throws RootAttestError when whatever answers cannot prove a genuine
 * device (finding H1). Returns null when nobody answers in time (the caller may retry).
 */
export declare function connectRoot(socketPath: string, healthMs?: number, opts?: ConnectOptions): Promise<RemoteRoot | null>;
