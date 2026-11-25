// The Enclaweders of one machine, shared by every Enclawed process on it.
//
// A device may have one owner: two processes on one hidraw node interleave
// their frames, and the device's answers to either are lost or scrambled (a
// genuine device then fails its boot challenge, and every process halts). So
// the first process to boot the hardware root on a machine becomes the owner:
// it binds the devices exactly as the bootstrap always has and serves them on
// a Unix socket that only the user can open. Every later process is a client:
// it signs through the owner and reads the owner's guard state, and never
// opens a device.
//
// Ownership is the socket itself. A process claims it by listening; a live
// owner answers on it; a socket nobody answers is stale and is replaced. When
// the owner exits, its clients read the root as UNAVAILABLE (not DIRTY: a
// process exiting is not tampering) and one of them takes over by booting the
// devices itself, with the full genuine check and the persisted DIRTY latch.
//
// The socket's directory must be the user's own and closed to others (0700,
// not a link). A process that can open the socket is one that could open the
// hidraw node itself, so the owner grants no authority the account lacks.
//
// Nothing that answers on the socket is trusted for what it says (findings H1,
// H3). Any same-user process can listen there first, so a client believes only
// what a DEVICE signed: each member's birth certificate, checked against the
// pinned manufacturer roots, and, on every health poll, each member's signed
// latch read (LATCH_GET) over a digest of the client's own fresh nonce. CLEAN
// means "every certified member signed CLEAR, with its host session live, within
// the last 2 health intervals plus one answer budget"; every request has a
// deadline; every signature the owner returns is verified against the member
// that made it. An owner that cannot prove a genuine device is UNAVAILABLE.

import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { DeviceLatchError, parseDeviceLatch } from "./device-latch.js";
import { verifyCert, verifyChallenge, type EnclawederSku } from "./enclaweder-hid.js";
import { checkpointDigest, type QueueJournal } from "./queue-journal.js";
import { hostUid } from "./userns.js";

/** What a process sees of the machine's hardware root. */
export type RootHealth =
  | { status: "CLEAN" }
  | { status: "DIRTY"; reason: string }
  /** The owner is gone or busy; not a tamper. Gated work waits or is refused. */
  | { status: "UNAVAILABLE"; reason: string };

export type RootMember = {
  uid: string;
  pubkey: string;
  serial: string;
  /** The member's birth certificate (hex), which a client verifies against the pinned roots. */
  cert?: string;
};

/** A member as a client accepted it: certificate verified, model taken from the certificate. */
export type VerifiedMember = RootMember & { cert: string; sku: EnclawederSku };

/** One member's signed latch read, as the owner relays it (finding H1). */
export type MemberAttestation = { uid: string; latch: string };

/** Domain tag of the digest a batch of client nonces is attested under. */
const ATTEST_TAG = Buffer.from("ECW-BROKER-ATT-1", "latin1");
/** The most client nonces one device latch read covers. */
const MAX_ATTEST_BATCH = 256;

/**
 * The nonce the device signs for a batch of client nonces: one LATCH_GET per member serves
 * every client polling at once, and each client checks that its own nonce is in the batch.
 */
export function attestDigest(nonces: Buffer[]): Buffer {
  const h = createHash("sha256").update(ATTEST_TAG);
  for (const n of nonces) {
    h.update(n);
  }
  return h.digest();
}

/** The slice of a device a signer needs. */
export type SigningDevice = {
  getIdentity(): Promise<{ uid: Buffer; pubkeyRaw: Buffer }>;
  challenge(nonce32: Buffer): Promise<{ uid: Buffer; sig: Buffer }>;
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
  checkpoint?(head32: Buffer): Promise<{ uid: Buffer; sid: bigint; ck: bigint; sig: Buffer }>;
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
export const ANCHOR_RELAY_LENGTHS: Readonly<Record<number, number>> = Object.freeze({
  0x17: 32 + 8 + 8 + 32,
  0x18: 0,
  0x19: 32 + 16,
  0x1a: 8 + 8 + 32,
  0x1b: 8 + 8 + 32,
  // Command set 0.5: ANCHOR_READ, the client's own 32-byte nonce (the answer is signed over it).
  // ANCHOR_OPEN_BOUND is never relayed in the clear: it travels sealed (op "sealed").
  0x38: 32,
});
export type AnchorRelayType = 0x17 | 0x18 | 0x19 | 0x1a | 0x1b | 0x38;

/** Bounds of the broker's relay ops: frame sizes, and requests per client per second. */
export const RELAY_LIMITS = Object.freeze({
  sealOpenLen: 48,
  sealedMinLen: 11 + 32,
  sealedMaxLen: 11 + 320 + 32,
  sealedPerSecond: 8,
  /** nonce(32) gid(8) host_time(8) scope(32): UNLOCK_USE's exact request. */
  unlockUseLen: 80,
  unlockUsePerSecond: 4,
  entropyMaxBytes: 64,
  entropyPerSecond: 4,
  /** A session's open, a set every log write, a keepalive every 30 s, a close; reads. */
  anchorPerSecond: 8,
});

/**
 * Checks one relay request against RELAY_LIMITS (shape only, nothing about the device). Returns
 * the decoded frame, or a reason. Exported for the bounds tests.
 */
export function checkRelayRequest(
  req:
    | { op: "sealed"; type?: unknown; frame?: unknown }
    | { op: "unlock-use"; frame?: unknown }
    | { op: "anchor"; type?: unknown; frame?: unknown }
    | { op: "entropy"; n?: unknown },
):
  | { ok: true; type?: 0x35 | 0x36; anchorType?: AnchorRelayType; frame?: Buffer; n?: number }
  | { ok: false; error: string } {
  if (req.op === "anchor") {
    const want =
      typeof req.type === "number" && Object.hasOwn(ANCHOR_RELAY_LENGTHS, req.type)
        ? ANCHOR_RELAY_LENGTHS[req.type]
        : undefined;
    if (want === undefined) {
      return { ok: false, error: "anchor: only audit-anchor frames are relayed" };
    }
    if (
      typeof req.frame !== "string" ||
      req.frame.length !== want * 2 ||
      !/^([0-9a-f]{2})*$/.test(req.frame)
    ) {
      return { ok: false, error: `anchor: frame must be ${want} bytes of hex` };
    }
    return {
      ok: true,
      anchorType: req.type as AnchorRelayType,
      frame: Buffer.from(req.frame, "hex"),
    };
  }
  if (req.op === "unlock-use") {
    if (
      typeof req.frame !== "string" ||
      req.frame.length !== RELAY_LIMITS.unlockUseLen * 2 ||
      !/^[0-9a-f]+$/.test(req.frame)
    ) {
      return {
        ok: false,
        error: `unlock-use: frame must be ${RELAY_LIMITS.unlockUseLen} bytes of hex`,
      };
    }
    return { ok: true, frame: Buffer.from(req.frame, "hex") };
  }
  if (req.op === "entropy") {
    const n = req.n;
    if (
      typeof n !== "number" ||
      !Number.isInteger(n) ||
      n < 1 ||
      n > RELAY_LIMITS.entropyMaxBytes
    ) {
      return { ok: false, error: `entropy: 1..${RELAY_LIMITS.entropyMaxBytes} bytes` };
    }
    return { ok: true, n };
  }
  if (req.type !== 0x35 && req.type !== 0x36) {
    return { ok: false, error: "sealed: only sealed-factor frames are relayed" };
  }
  if (typeof req.frame !== "string" || !/^([0-9a-f]{2})*$/.test(req.frame)) {
    return { ok: false, error: "sealed: frame must be hex" };
  }
  const frame = Buffer.from(req.frame, "hex");
  const okLen =
    req.type === 0x35
      ? frame.length === RELAY_LIMITS.sealOpenLen
      : frame.length >= RELAY_LIMITS.sealedMinLen && frame.length <= RELAY_LIMITS.sealedMaxLen;
  if (!okLen) {
    return { ok: false, error: "sealed: frame length out of bounds" };
  }
  return { ok: true, type: req.type, frame };
}

/** A per-client rate limit: at most `perSecond` requests in any one-second window. */
export class RelayRateLimit {
  #times: number[] = [];
  constructor(
    private readonly perSecond: number,
    private readonly now: () => number = () => performance.now(),
  ) {}
  take(): boolean {
    const t = this.now();
    this.#times = this.#times.filter((x) => t - x < 1000);
    if (this.#times.length >= this.perSecond) {
      return false;
    }
    this.#times.push(t);
    return true;
  }
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
export function brokerSocketPath(): string {
  const explicit = process.env.ENCLAWEDER_BROKER;
  if (explicit && !brokerDisabled()) {
    return explicit;
  }
  if (process.platform === "linux") {
    const uid = hostUid();
    return path.join(
      "/run/user",
      uid === null ? "unmapped" : String(uid),
      "enclawed",
      "enclaweder.sock",
    );
  }
  // The account's own temporary directory (per user on macOS and Windows), under a fixed name.
  return path.join(os.tmpdir(), "enclawed-broker", "enclaweder.sock");
}

/**
 * Why the broker path cannot be used, or null: on Linux the host uid must be known and its
 * runtime directory (/run/user/<uid>) must exist. Refusing is the point (finding H11): a
 * fallback that depends on the environment splits one machine into two owners.
 */
export function brokerPathError(): string | null {
  if (process.env.ENCLAWEDER_BROKER && !brokerDisabled()) {
    return path.isAbsolute(process.env.ENCLAWEDER_BROKER)
      ? null
      : "ENCLAWEDER_BROKER must be an absolute path";
  }
  if (process.platform !== "linux") {
    return null;
  }
  const uid = hostUid();
  if (uid === null) {
    return "the host uid of this process is not mapped, so the hardware root broker cannot be found";
  }
  try {
    if (!statSync(`/run/user/${uid}`).isDirectory()) {
      return `/run/user/${uid} is not a directory`;
    }
  } catch {
    return `no runtime directory /run/user/${uid} (log in through a session manager, or set ENCLAWEDER_BROKER to an absolute socket path)`;
  }
  return null;
}

/** The longest socket path the kernel keeps whole (sun_path, less its NUL). */
export const MAX_SOCKET_PATH = 107;

/** True when sharing is turned off: every process binds the devices itself. */
export function brokerDisabled(): boolean {
  const v = (process.env.ENCLAWEDER_BROKER ?? "").trim().toLowerCase();
  return v === "off" || v === "0" || v === "false";
}

/**
 * Makes sure the socket's directory is this user's own, a real directory, and
 * closed to everyone else; creates it so if absent. Throws otherwise: a
 * directory another user controls could hold a socket that impersonates the
 * owner.
 */
export function secureSocketDir(socketPath: string): void {
  // The kernel keeps 107 bytes of a socket's path and silently drops the
  // rest, so a longer path would listen, and be found, under another name.
  if (Buffer.byteLength(socketPath) > MAX_SOCKET_PATH) {
    throw new Error(
      `hardware root broker: socket path is longer than ${MAX_SOCKET_PATH} bytes: ${socketPath}`,
    );
  }
  const dir = path.dirname(socketPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const st = lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) {
    throw new Error(`hardware root broker: ${dir} is not a directory`);
  }
  const uid = process.getuid?.();
  if (uid !== undefined && st.uid !== uid) {
    throw new Error(`hardware root broker: ${dir} belongs to another user`);
  }
  if ((st.mode & 0o077) !== 0) {
    throw new Error(`hardware root broker: ${dir} is open to other users`);
  }
}

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
export class DeviceScheduler {
  private readonly queues = new Map<number, Job[]>();
  /** Requests per client counted against its bound: waiting, or being journaled. */
  private readonly held = new Map<number, number>();
  private order: number[] = [];
  /** The client served last; the next turn starts after it. */
  private lastServed: number | null = null;
  private running = 0;
  private seq = 0;
  /** Clients that went away: anything of theirs still being journaled is refused. */
  private readonly gone = new Set<number>();
  private timer: NodeJS.Timeout | null = null;
  private checkpointed: string | null = null;
  private checkpointing = false;

  constructor(
    private readonly exec: (digest: Buffer) => Promise<{ uid: Buffer; sig: Buffer }>,
    private readonly slots: () => number,
    private readonly opts: {
      maxQueued: number;
      maxWaitMs: number;
      /** Records every request and outcome; see queue-journal.ts. */
      journal?: QueueJournal;
      /** Signs a journal head under the latch session (finding H2); no signer = no checkpoints. */
      checkpointSigner?: (
        head32: Buffer,
      ) => Promise<{ uid: Buffer; sid: bigint; ck: bigint; sig: Buffer }>;
      /** How often the device signs the journal's head, when it has grown. */
      checkpointMs?: number;
    } = { maxQueued: 4, maxWaitMs: 1000 },
    private readonly now: () => number = Date.now,
  ) {
    if (opts.journal) {
      this.timer = setInterval(() => void this.checkpoint(), opts.checkpointMs ?? 1000);
      this.timer.unref();
    }
  }

  /** Requests waiting and running. */
  stats(): { queued: number; running: number; clients: number } {
    let queued = 0;
    for (const q of this.queues.values()) {
      queued += q.length;
    }
    return { queued, running: this.running, clients: this.queues.size };
  }

  submit(
    client: number,
    digest: Buffer,
    deadlineMs?: number,
  ): Promise<{ uid: Buffer; sig: Buffer }> {
    return this.enqueue(client, digest, deadlineMs, false);
  }

  private async enqueue(
    client: number,
    digest: Buffer,
    deadlineMs: number | undefined,
    internal: boolean,
  ): Promise<{ uid: Buffer; sig: Buffer }> {
    const seq = ++this.seq;
    const journal = internal ? undefined : this.opts.journal;
    // The request is this copy, frozen: nothing outside can change what is signed.
    const d = Buffer.from(digest);
    if ((this.held.get(client) ?? 0) >= this.opts.maxQueued) {
      await journal?.refused(client, seq, "busy");
      throw new Error("busy: too many requests waiting from this process");
    }
    this.held.set(client, (this.held.get(client) ?? 0) + 1);
    const wait = Math.min(this.opts.maxWaitMs, deadlineMs ?? this.opts.maxWaitMs);
    const until = this.now() + Math.max(0, wait);
    try {
      // Recorded before it is queued: nothing reaches a device unrecorded.
      await journal?.request(client, seq, d, until);
    } catch (err) {
      this.release(client);
      throw err;
    }
    return new Promise<{ uid: Buffer; sig: Buffer }>((resolve, reject) => {
      const job = Object.freeze({ client, seq, digest: d, until, journal, resolve, reject });
      if (this.gone.has(client)) {
        this.release(client);
        void this.finish(job, new Error("client gone"));
        return;
      }
      let q = this.queues.get(client);
      if (!q) {
        q = [];
        this.queues.set(client, q);
        this.order.push(client);
      }
      q.push(job);
      this.pump();
    });
  }

  private release(client: number): void {
    const n = (this.held.get(client) ?? 1) - 1;
    if (n <= 0) {
      this.held.delete(client);
    } else {
      this.held.set(client, n);
    }
  }

  /** A client went away: its waiting requests are dropped, unsent. */
  forget(client: number): void {
    this.gone.add(client);
    for (const job of this.queues.get(client) ?? []) {
      this.release(client);
      void this.finish(job, new Error("client gone"));
    }
    this.queues.delete(client);
    this.order = this.order.filter((c) => c !== client);
  }

  /** Stops the checkpoint timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Has the device sign the journal's head, if it grew since the last
   * checkpoint. The checkpoint goes through the queue like any request, and
   * writes only its own record, so an idle journal is not checkpointed again.
   */
  private async checkpoint(): Promise<void> {
    const journal = this.opts.journal;
    const head = journal?.currentHead();
    if (!journal || !head || head === this.checkpointed || this.checkpointing) {
      return;
    }
    const signer = this.opts.checkpointSigner;
    if (!signer) {
      return; // CHALLENGE-signed checkpoints are forgeable (finding H2): make none
    }
    this.checkpointing = true;
    try {
      const r = await signer(checkpointDigest(head));
      await journal.checkpoint(head, r.uid, r.sig, r.sid, r.ck);
      this.checkpointed = journal.currentHead();
    } catch {
      // The device was busy or gone: the next tick tries again.
    } finally {
      this.checkpointing = false;
    }
  }

  /** Records the outcome, then hands it back: nothing leaves unrecorded. */
  private async finish(job: Job, result: { uid: Buffer; sig: Buffer } | Error): Promise<void> {
    try {
      if (result instanceof Error) {
        await job.journal?.refused(job.client, job.seq, result.message);
        job.reject(result);
      } else {
        await job.journal?.signed(job.client, job.seq, result.uid, result.sig);
        job.resolve(result);
      }
    } catch (err) {
      job.reject(err as Error);
    }
  }

  private nextJob(): Job | null {
    const n = this.order.length;
    const after = this.lastServed === null ? -1 : this.order.indexOf(this.lastServed);
    for (let tried = 0; tried < n; tried++) {
      const client = this.order[(after + 1 + tried) % n];
      const q = this.queues.get(client) ?? [];
      while (q.length > 0) {
        const job = q.shift()!;
        // Off the queue: no longer held against the client's bound.
        this.release(client);
        if (this.now() > job.until) {
          void this.finish(job, new Error("timed out waiting for the device"));
          continue;
        }
        this.lastServed = client;
        return job;
      }
    }
    return null;
  }

  private pump(): void {
    while (this.running < Math.max(1, this.slots())) {
      const job = this.nextJob();
      if (!job) {
        return;
      }
      this.running++;
      this.exec(job.digest).then(
        (r) => {
          this.running--;
          void this.finish(job, r);
          this.pump();
        },
        (err: unknown) => {
          this.running--;
          void this.finish(job, err as Error);
          this.pump();
        },
      );
    }
  }
}

type Job = Readonly<{
  client: number;
  seq: number;
  digest: Buffer;
  /** The request is dropped, unsent, if it has not started by then. */
  until: number;
  journal: QueueJournal | undefined;
  resolve: (r: { uid: Buffer; sig: Buffer }) => void;
  reject: (e: Error) => void;
}>;

/** One line-delimited JSON exchange per request. */
type Req =
  | { id: number; op: "members" }
  | { id: number; op: "health"; nonce?: string }
  | { id: number; op: "sign"; digest: string; deadlineMs?: number }
  | { id: number; op: "sealed"; type: number; frame: string }
  | { id: number; op: "unlock-use"; frame: string }
  | { id: number; op: "anchor"; type: number; frame: string }
  | { id: number; op: "entropy"; n: number };

/** How long the owner waits for one batched latch read from its devices. */
const ATTEST_TIMEOUT_MS = 2500;

/**
 * Coalesces the clients' attestation nonces: while one batch is being signed, new nonces wait
 * for the next. So the device does one LATCH_GET per member per round, however many clients poll.
 */
class Attestor {
  private waiting: Array<{
    nonce: Buffer;
    done: (r: { nonces: string[]; members: MemberAttestation[] } | Error) => void;
  }> = [];
  private running = false;
  constructor(private readonly svc: RootService) {}

  attest(nonce: Buffer): Promise<{ nonces: string[]; members: MemberAttestation[] }> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ nonce, done: (r) => (r instanceof Error ? reject(r) : resolve(r)) });
      this.pump();
    });
  }

  private pump(): void {
    if (this.running || this.waiting.length === 0) {
      return;
    }
    this.running = true;
    // One tick of grace so clients polling together share a round.
    setImmediate(() => void this.round());
  }

  private async round(): Promise<void> {
    const batch = this.waiting.splice(0, MAX_ATTEST_BATCH);
    const nonces = batch.map((b) => b.nonce);
    let out: { nonces: string[]; members: MemberAttestation[] } | Error;
    try {
      if (!this.svc.attest) {
        throw new Error("this owner offers no device attestation");
      }
      let timer: NodeJS.Timeout | undefined;
      const members = await Promise.race([
        this.svc.attest(attestDigest(nonces)),
        new Promise<never>((_, rej) => {
          timer = setTimeout(
            () => rej(new Error("the devices did not answer the attestation in time")),
            ATTEST_TIMEOUT_MS,
          );
        }),
      ]).finally(() => clearTimeout(timer));
      out = { nonces: nonces.map((n) => n.toString("hex")), members };
    } catch (err) {
      out = err as Error;
    }
    for (const b of batch) {
      b.done(out);
    }
    this.running = false;
    this.pump();
  }
}

const MAX_LINE = 1 << 16;

/**
 * Claims the owner's socket: listens on it and returns the server, or returns
 * null when a live owner already answers there. A socket nobody listens on is
 * stale (its owner died) and is replaced, but only that exact file: one that
 * is merely busy, or was replaced meanwhile, is never removed.
 */
export async function claimOwnership(socketPath: string): Promise<net.Server | null> {
  secureSocketDir(socketPath);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const server = net.createServer();
    const ok = await new Promise<true | "in-use" | Error>((resolve) => {
      server.once("error", (err: NodeJS.ErrnoException) =>
        resolve(err.code === "EADDRINUSE" ? "in-use" : err),
      );
      // A deep backlog: every process on the machine may connect at once.
      server.listen({ path: socketPath, backlog: 511 }, () => resolve(true));
    });
    if (ok === true) {
      try {
        chmodSync(socketPath, 0o600);
      } catch {
        // Our socket file is gone: someone else holds the name now. Not ours.
        await new Promise<void>((r) => server.close(() => r()));
        continue;
      }
      return server;
    }
    if (ok instanceof Error) {
      throw new Error(`hardware root broker: cannot listen on ${socketPath}: ${ok.message}`);
    }
    let before: number;
    try {
      before = lstatSync(socketPath).ino;
    } catch {
      continue; // gone already: try to claim again
    }
    const state = await probeOwner(socketPath);
    if (state === "live") {
      return null;
    }
    if (state === "busy") {
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
      continue;
    }
    // Stale: remove that file, and only that file.
    try {
      if (lstatSync(socketPath).ino === before) {
        unlinkSync(socketPath);
      }
    } catch {
      // replaced or removed meanwhile
    }
  }
  throw new Error("hardware root broker: the owner's socket stayed busy");
}

/**
 * Whether an owner listens on the socket: "live" (it accepted), "stale"
 * (nobody listens: refused, or no such file), or "busy" (any other failure,
 * such as a full backlog; never a reason to remove the socket).
 */
export function probeOwner(socketPath: string): Promise<"live" | "stale" | "busy"> {
  return new Promise((resolve) => {
    const s = net.connect(socketPath);
    s.once("connect", () => {
      s.destroy();
      resolve("live");
    });
    s.once("error", (err: NodeJS.ErrnoException) =>
      resolve(err.code === "ECONNREFUSED" || err.code === "ENOENT" ? "stale" : "busy"),
    );
  });
}

/** True when a live owner answers on the socket. */
export async function ownerAnswers(socketPath: string): Promise<boolean> {
  return (await probeOwner(socketPath)) === "live";
}

/**
 * Serves `service` on a claimed socket. Requests that arrive before `ready`
 * settles wait for it; if it rejects (the devices would not bind), every
 * request is answered with that reason.
 */
/** The scheduler every device request on a machine goes through, the owner's own included. */
export function schedulerFor(
  svc: RootService,
  journal?: QueueJournal,
  limits: { maxQueued: number; maxWaitMs: number } = { maxQueued: 4, maxWaitMs: 1000 },
): DeviceScheduler {
  return new DeviceScheduler(
    (digest) => svc.run((dev) => dev.challenge(digest)),
    () => svc.members().length,
    {
      ...limits,
      ...(journal
        ? { journal, checkpointMs: 1000, checkpointSigner: svc.checkpoint?.bind(svc) }
        : {}),
    },
  );
}

/** The owner's own client id in its scheduler. */
export const OWNER_CLIENT = 0;

export function serveRoot(
  server: net.Server,
  ready: Promise<{ svc: RootService; scheduler: DeviceScheduler }>,
): { close(): Promise<void> } {
  const clients = new Set<net.Socket>();
  let failure: string | null = null;
  let scheduler: DeviceScheduler | null = null;
  let attestor: Attestor | null = null;
  ready.then(
    (r) => {
      scheduler = r.scheduler;
      attestor = new Attestor(r.svc);
    },
    (err: unknown) => {
      failure = (err as Error).message;
    },
  );
  // Serving never keeps the owner alive by itself: a process that owns the
  // devices only because it booted first (an agent, a CLI command) exits when
  // its own work is done, and its clients take over. A connection holds the
  // owner only while a request on it is being answered, so nothing asked is
  // dropped. A process whose job is to own (swarm device-broker) holds itself.
  server.unref();
  let nextClient = 1;
  server.on("connection", (sock) => {
    const client = nextClient++;
    clients.add(sock);
    sock.unref();
    let inFlight = 0;
    const sealedLimit = new RelayRateLimit(RELAY_LIMITS.sealedPerSecond);
    const entropyLimit = new RelayRateLimit(RELAY_LIMITS.entropyPerSecond);
    const unlockUseLimit = new RelayRateLimit(RELAY_LIMITS.unlockUsePerSecond);
    const anchorLimit = new RelayRateLimit(RELAY_LIMITS.anchorPerSecond);
    sock.on("close", () => {
      clients.delete(sock);
      scheduler?.forget(client);
    });
    sock.on("error", () => undefined);
    let buf = "";
    const reply = (o: unknown) => {
      if (!sock.destroyed) {
        sock.write(JSON.stringify(o) + "\n");
      }
    };
    const handle = async (req: Req) => {
      let svc: RootService;
      try {
        svc = (await ready).svc;
      } catch {
        reply({ id: req.id, ok: false, halt: true, error: failure ?? "the devices did not bind" });
        return;
      }
      if (req.op === "members") {
        reply({ id: req.id, ok: true, members: svc.members() });
      } else if (req.op === "health") {
        if (typeof req.nonce === "string" && /^[0-9a-f]{64}$/.test(req.nonce) && attestor) {
          // The health this owner claims, plus what its devices signed over the client's nonce.
          try {
            const att = await attestor.attest(Buffer.from(req.nonce, "hex"));
            reply({ id: req.id, ok: true, health: svc.health(), att });
          } catch (err) {
            reply({ id: req.id, ok: true, health: svc.health(), attError: (err as Error).message });
          }
        } else {
          reply({ id: req.id, ok: true, health: svc.health() });
        }
      } else if (req.op === "sign" && /^[0-9a-f]{64}$/.test(req.digest)) {
        try {
          const deadline =
            typeof req.deadlineMs === "number" && Number.isFinite(req.deadlineMs)
              ? req.deadlineMs
              : undefined;
          const r = await scheduler!.submit(client, Buffer.from(req.digest, "hex"), deadline);
          reply({ id: req.id, ok: true, uid: r.uid.toString("hex"), sig: r.sig.toString("hex") });
        } catch (err) {
          reply({ id: req.id, ok: false, error: (err as Error).message });
        }
      } else if (req.op === "anchor") {
        // An anchor frame: bounded, rate-limited, moved as bytes (the client verifies it all).
        const c = checkRelayRequest(req);
        if (!c.ok) {
          reply({ id: req.id, ok: false, error: c.error });
        } else if (svc.relayAnchor === undefined) {
          reply({ id: req.id, ok: false, error: "anchor: not offered by this owner" });
        } else if (!anchorLimit.take()) {
          reply({ id: req.id, ok: false, error: "anchor: rate limited" });
        } else {
          try {
            const out = await svc.relayAnchor(c.anchorType!, c.frame!);
            reply({ id: req.id, ok: true, payload: out.toString("hex") });
          } catch (err) {
            reply({ id: req.id, ok: false, error: (err as Error).message });
          }
        }
      } else if (req.op === "sealed" || req.op === "unlock-use" || req.op === "entropy") {
        // Opaque relays, bounded and rate-limited per client. The owner cannot read a sealed
        // frame (the client sealed it to the device), only forward it; an unlock use carries
        // nothing secret, and its receipt is signed over the client's own nonce.
        const c = checkRelayRequest(req);
        const offered =
          req.op === "sealed"
            ? svc.relaySealed !== undefined
            : req.op === "unlock-use"
              ? svc.relayUnlockUse !== undefined
              : svc.entropy !== undefined;
        const limit =
          req.op === "sealed"
            ? sealedLimit
            : req.op === "unlock-use"
              ? unlockUseLimit
              : entropyLimit;
        if (!c.ok) {
          reply({ id: req.id, ok: false, error: c.error });
        } else if (!offered) {
          reply({ id: req.id, ok: false, error: `${req.op}: not offered by this owner` });
        } else if (!limit.take()) {
          reply({ id: req.id, ok: false, error: `${req.op}: rate limited` });
        } else {
          try {
            const out =
              req.op === "sealed"
                ? await svc.relaySealed!(c.type!, c.frame!)
                : req.op === "unlock-use"
                  ? await svc.relayUnlockUse!(c.frame!)
                  : await svc.entropy!(c.n!);
            reply({ id: req.id, ok: true, payload: out.toString("hex") });
          } catch (err) {
            reply({ id: req.id, ok: false, error: (err as Error).message });
          }
        }
      } else {
        reply({ id: (req as { id?: unknown }).id ?? null, ok: false, error: "bad request" });
      }
    };
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (buf.length > MAX_LINE) {
        sock.destroy();
        return;
      }
      for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let req: Req;
        try {
          req = JSON.parse(line) as Req;
        } catch {
          sock.destroy();
          return;
        }
        if (inFlight++ === 0) {
          sock.ref();
        }
        void handle(req).finally(() => {
          if (--inFlight === 0) {
            sock.unref();
          }
        });
      }
    });
  });
  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const s of clients) {
          s.destroy();
        }
      }),
  };
}

/** A client's view of the owner. */
export type RemoteRoot = {
  /** Every member, each certificate verified against the pinned roots. */
  readonly members: VerifiedMember[];
  health(): RootHealth;
  /** Member 0, for signing; its answers are verified against that member's certified key. */
  device(): SigningDevice & { getCert(): Promise<Buffer> };
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

export class RootHaltError extends Error {}

/**
 * The process answering on the broker socket did not prove a genuine device (finding H1): a
 * member without a valid birth certificate, a latch read that does not verify, a signature from
 * a key no member has.
 */
export class RootAttestError extends Error {}

/** A verified attestation round: what each member's device signed over the caller's nonce. */
export type RemoteAttestation = {
  nonce: string;
  /** The batch of nonces the devices signed the digest of (the caller's is among them). */
  nonces: string[];
  members: Array<MemberAttestation & { pubkey: string; cert: string; sku: EnclawederSku }>;
};

/**
 * Checks an attestation round for `nonce` against `members` (finding H1). Returns the verified
 * latch states per member uid, or throws RootAttestError naming what did not verify. Exported so
 * any process holding the owner's raw answer can check it itself.
 */
export function verifyRootAttestation(
  members: VerifiedMember[],
  nonce: Buffer,
  att: { nonces: unknown; members: unknown },
): Map<
  string,
  { state: "CLEAR" | "SET"; reason: string; sessionLive: boolean; armed: boolean; sid: bigint }
> {
  if (!Array.isArray(att.nonces) || !Array.isArray(att.members)) {
    throw new RootAttestError("the owner's attestation is malformed");
  }
  const nonces = att.nonces.map((n) =>
    typeof n === "string" && /^[0-9a-f]{64}$/.test(n) ? Buffer.from(n, "hex") : null,
  );
  if (
    nonces.some((n) => n === null) ||
    nonces.length > MAX_ATTEST_BATCH ||
    !nonces.some((n) => n!.equals(nonce))
  ) {
    throw new RootAttestError("the owner's attestation does not cover this process's nonce");
  }
  const digest = attestDigest(nonces as Buffer[]);
  const out = new Map<
    string,
    { state: "CLEAR" | "SET"; reason: string; sessionLive: boolean; armed: boolean; sid: bigint }
  >();
  for (const m of members) {
    const a = (att.members as Array<{ uid?: unknown; latch?: unknown }>).find(
      (x) => x?.uid === m.uid,
    );
    if (!a || typeof a.latch !== "string" || !/^([0-9a-f]{2})+$/.test(a.latch)) {
      throw new RootAttestError(`member ${m.serial} gave no signed latch read`);
    }
    try {
      const l = parseDeviceLatch(
        Buffer.from(a.latch, "hex"),
        digest,
        Buffer.from(m.pubkey, "hex"),
        Buffer.from(m.uid, "hex"),
      );
      out.set(m.uid, {
        state: l.state,
        reason: l.reasonText,
        sessionLive: l.sessionLive,
        armed: l.armed,
        sid: l.sid,
      });
    } catch (err) {
      throw new RootAttestError(
        `member ${m.serial}'s latch read does not verify (${err instanceof DeviceLatchError ? err.code : (err as Error).message})`,
      );
    }
  }
  return out;
}

/** Checks every member's certificate; returns them with the model the certificate proves. */
export function verifyRootMembers(
  raw: unknown,
  rootPubkey: Buffer | null = null,
): VerifiedMember[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new RootAttestError("the owner reported no members");
  }
  const seen = new Set<string>();
  return raw.map((m: Partial<RootMember>, i) => {
    const hex = (v: unknown, n: number) =>
      typeof v === "string" && v.length === n * 2 && /^[0-9a-f]+$/.test(v);
    if (
      !hex(m?.uid, 12) ||
      !hex(m?.pubkey, 32) ||
      typeof m?.cert !== "string" ||
      !/^([0-9a-f]{2})+$/.test(m.cert)
    ) {
      throw new RootAttestError(
        `member ${i} has no certificate (uncertified, counterfeit, or an owner without attestation)`,
      );
    }
    if (seen.has(m.uid!)) {
      throw new RootAttestError("the owner reported the same member twice");
    }
    seen.add(m.uid!);
    const c = verifyCert(
      Buffer.from(m.cert, "hex"),
      Buffer.from(m.uid!, "hex"),
      Buffer.from(m.pubkey!, "hex"),
      rootPubkey,
    );
    if (!c?.sku) {
      throw new RootAttestError(
        `member ${i}'s certificate does not chain to a pinned manufacturer root for its key and uid`,
      );
    }
    // The serial follows the certified model, never the owner's say-so.
    const serial = (c.sku === "pro" ? "ECPRO-" : "ENCLW-") + m.uid!.toUpperCase();
    return { uid: m.uid!, pubkey: m.pubkey!, cert: m.cert, serial, sku: c.sku };
  });
}

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
export async function connectRoot(
  socketPath: string,
  healthMs = 500,
  opts: ConnectOptions = {},
): Promise<RemoteRoot | null> {
  const askTimeoutMs = opts.askTimeoutMs ?? 3000;
  const signTimeoutMs = opts.signTimeoutMs ?? 6000;
  // CLEAN must have been device-signed this recently (finding H3).
  const staleMs = 2 * healthMs + askTimeoutMs;
  const sock = net.connect(socketPath);
  const up = await new Promise<boolean>((resolve) => {
    sock.once("connect", () => resolve(true));
    sock.once("error", () => resolve(false));
  });
  if (!up) {
    return null;
  }
  let next = 1;
  const waiting = new Map<number, (r: Record<string, unknown>) => void>();
  let buf = "";
  let lostReason: string | null = null;
  let markLost: () => void = () => undefined;
  const lost = new Promise<void>((resolve) => {
    markLost = resolve;
  });
  const drop = (why: string) => {
    if (lostReason) {
      return;
    }
    lostReason = why;
    for (const done of waiting.values()) {
      done({ ok: false, error: why });
    }
    waiting.clear();
    markLost();
  };
  sock.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    if (buf.length > MAX_LINE) {
      sock.destroy();
      return;
    }
    for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
      let r: Record<string, unknown>;
      try {
        r = JSON.parse(buf.slice(0, nl)) as Record<string, unknown>;
      } catch {
        sock.destroy();
        return;
      }
      buf = buf.slice(nl + 1);
      const done = waiting.get(r.id as number);
      waiting.delete(r.id as number);
      done?.(r);
    }
  });
  sock.on("error", () => drop("the hardware root's owner is gone"));
  sock.on("close", () => drop("the hardware root's owner is gone"));
  // The connection keeps this process alive only while it waits for an answer
  // it asked for. An idle connection, or one with only a background health
  // poll out, does not: a process whose work is done exits, rather than live
  // on as long as the owner does (and a silent owner cannot pin it through
  // its health polls). The first request, for the members, is always one it
  // waits for, so the connection is released when that answer comes.
  let held = 0;
  // `background` marks the periodic health polls: nobody awaits them. Every request has a
  // deadline (finding H3): an owner that is stopped or wedged is answered for by the timer.
  const ask = (req: Record<string, unknown>, timeoutMs: number, background = false) =>
    new Promise<Record<string, unknown>>((resolve) => {
      if (lostReason) {
        resolve({ ok: false, error: lostReason });
        return;
      }
      const id = next++;
      const holds = !background;
      if (holds && held++ === 0) {
        sock.ref();
      }
      let settled = false;
      const settle = (r: Record<string, unknown>) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        waiting.delete(id);
        if (holds && --held === 0) {
          sock.unref();
        }
        resolve(r);
      };
      const timer = setTimeout(
        () =>
          settle({
            ok: false,
            timedOut: true,
            error: `the hardware root's owner did not answer within ${timeoutMs} ms`,
          }),
        timeoutMs,
      );
      timer.unref();
      waiting.set(id, settle);
      sock.write(JSON.stringify({ ...req, id }) + "\n");
    });

  const m = await ask({ op: "members" }, askTimeoutMs);
  if (!m.ok) {
    sock.destroy();
    if (m.halt) {
      throw new RootHaltError(typeof m.error === "string" ? m.error : "the devices did not bind");
    }
    return null;
  }
  let members: VerifiedMember[];
  try {
    members = verifyRootMembers(m.members, opts.rootPubkey ?? null);
  } catch (err) {
    sock.destroy();
    throw err;
  }
  const byUid = new Map(members.map((x) => [x.uid, x]));
  // Each member's device host session, pinned at the first attestation: another sid means
  // another process now holds the device, not the owner this client attested.
  const sids = new Map<string, bigint>();

  // DIRTY is latched: once seen, it stays, whatever comes after. An owner that fails to prove
  // its devices is UNAVAILABLE for good on this connection (attestFailure).
  let health: RootHealth = { status: "UNAVAILABLE", reason: "not yet attested" };
  let freshAt = -Infinity;
  let attestFailure: string | null = null;
  let polling = false;

  /** One health request with a fresh nonce; returns the verified latch states, or why not. */
  const attestRound = async (
    nonce: Buffer,
    background: boolean,
  ): Promise<
    | {
        ok: true;
        owner: RootHealth;
        att: { nonces: string[]; members: MemberAttestation[] };
        states: ReturnType<typeof verifyRootAttestation>;
      }
    | { ok: false; fatal: boolean; reason: string }
  > => {
    const h = await ask({ op: "health", nonce: nonce.toString("hex") }, askTimeoutMs, background);
    if (!h.ok) {
      return {
        ok: false,
        fatal: false,
        reason: typeof h.error === "string" ? h.error : "no answer",
      };
    }
    if (!h.att) {
      return {
        ok: false,
        fatal: false,
        reason:
          typeof h.attError === "string"
            ? `the owner could not attest its devices: ${h.attError}`
            : "the owner sent no device attestation",
      };
    }
    const att = h.att as { nonces: string[]; members: MemberAttestation[] };
    try {
      return {
        ok: true,
        owner: h.health as RootHealth,
        att,
        states: verifyRootAttestation(members, nonce, att),
      };
    } catch (err) {
      return { ok: false, fatal: true, reason: (err as Error).message };
    }
  };

  /** Folds one attestation round into this client's view. Returns a fatal reason, if any. */
  const apply = (r: Awaited<ReturnType<typeof attestRound>>): string | null => {
    if (health.status === "DIRTY") {
      return null;
    }
    if (!r.ok) {
      if (r.fatal) {
        attestFailure = `the hardware root's owner did not prove a genuine device: ${r.reason}`;
        return attestFailure;
      }
      health = { status: "UNAVAILABLE", reason: r.reason };
      return null;
    }
    for (const [uid, st] of r.states) {
      const mem = byUid.get(uid)!;
      if (st.state === "SET") {
        health = {
          status: "DIRTY",
          reason: `enclaweder ${mem.serial} holds a DIRTY latch (${st.reason})`,
        };
        return null;
      }
      if (!st.sessionLive || !st.armed) {
        health = {
          status: "UNAVAILABLE",
          reason: `enclaweder ${mem.serial} has no live host session`,
        };
        return null;
      }
      const pinned = sids.get(uid);
      if (pinned === undefined) {
        sids.set(uid, st.sid);
      } else if (pinned !== st.sid) {
        attestFailure = `enclaweder ${mem.serial}'s host session changed: another process holds it now`;
        return attestFailure;
      }
    }
    const o = r.owner as RootHealth | undefined;
    if (o?.status === "DIRTY") {
      health = {
        status: "DIRTY",
        reason: typeof o.reason === "string" ? o.reason : "the owner reports DIRTY",
      };
      return null;
    }
    if (o?.status !== "CLEAN") {
      health = {
        status: "UNAVAILABLE",
        reason:
          o && "reason" in o && typeof o.reason === "string" ? o.reason : "the owner is not CLEAN",
      };
      return null;
    }
    health = { status: "CLEAN" };
    freshAt = performance.now();
    return null;
  };

  const first = await attestRound(randomBytes(32), false);
  const fatal = apply(first);
  if (fatal) {
    sock.destroy();
    throw new RootAttestError(fatal);
  }
  if (!first.ok) {
    // Nothing verifiable in time: not a counterfeit proven, but nothing to trust either.
    sock.destroy();
    return null;
  }

  const poll = async () => {
    if (polling || health.status === "DIRTY" || attestFailure) {
      return; // one poll at a time: a frozen owner must not pile up requests (finding H3)
    }
    polling = true;
    try {
      apply(await attestRound(randomBytes(32), true));
    } finally {
      polling = false;
    }
  };
  const timer = setInterval(() => void poll(), healthMs);
  timer.unref();
  void lost.then(() => {
    clearInterval(timer);
    if (health.status !== "DIRTY") {
      health = { status: "UNAVAILABLE", reason: lostReason ?? "the hardware root's owner is gone" };
    }
  });
  /** This client's view now: CLEAN only while a device-signed answer is fresh. */
  const current = (): RootHealth => {
    if (health.status === "DIRTY") {
      return health;
    }
    if (attestFailure) {
      return { status: "UNAVAILABLE", reason: attestFailure };
    }
    if (health.status === "CLEAN" && performance.now() - freshAt > staleMs) {
      return {
        status: "UNAVAILABLE",
        reason: `no device-signed answer from the hardware root's owner for ${Math.round(performance.now() - freshAt)} ms (limit ${staleMs} ms)`,
      };
    }
    return health;
  };
  const primary = members[0];
  const device: SigningDevice & { getCert(): Promise<Buffer> } = {
    getIdentity: async () => ({
      uid: Buffer.from(primary.uid, "hex"),
      pubkeyRaw: Buffer.from(primary.pubkey, "hex"),
    }),
    getCert: async () => Buffer.from(primary.cert, "hex"),
    challenge: async (nonce32) => {
      const h = current();
      if (h.status !== "CLEAN") {
        throw new Error(`hardware root ${h.status}: ${h.reason}`);
      }
      const r = await ask(
        { op: "sign", digest: nonce32.toString("hex"), deadlineMs: signTimeoutMs },
        signTimeoutMs,
      );
      if (!r.ok) {
        throw new Error(typeof r.error === "string" ? r.error : "signing failed");
      }
      const uid = Buffer.from(String(r.uid), "hex");
      const sig = Buffer.from(String(r.sig), "hex");
      // Verified before it is handed on (finding H1): only an attested member's key counts.
      const mem = byUid.get(uid.toString("hex"));
      if (
        !mem ||
        sig.length !== 64 ||
        !verifyChallenge(Buffer.from(mem.pubkey, "hex"), nonce32, uid, sig)
      ) {
        attestFailure =
          "the hardware root's owner returned a signature that no attested member made";
        throw new RootAttestError(attestFailure);
      }
      return { uid, sig };
    },
  };
  return {
    members,
    health: current,
    device: () => device,
    attest: async (nonce32) => {
      const r = await attestRound(nonce32, false);
      if (!r.ok) {
        throw r.fatal ? new RootAttestError(r.reason) : new Error(r.reason);
      }
      const fatalNow = apply(r);
      if (fatalNow) {
        throw new RootAttestError(fatalNow);
      }
      return {
        nonce: nonce32.toString("hex"),
        nonces: r.att.nonces,
        members: members.map((mm) => ({
          uid: mm.uid,
          pubkey: mm.pubkey,
          cert: mm.cert,
          sku: mm.sku,
          latch: r.att.members.find((x) => x.uid === mm.uid)!.latch,
        })),
      };
    },
    relaySealed: async (type, payload) => {
      const r = await ask(
        { op: "sealed", type, frame: payload.toString("hex") },
        signTimeoutMs * 3,
      );
      if (!r.ok || typeof r.payload !== "string" || !/^([0-9a-f]{2})*$/.test(r.payload)) {
        throw new Error(
          typeof r.error === "string" ? r.error : "the owner did not relay the sealed frame",
        );
      }
      return Buffer.from(r.payload, "hex");
    },
    relayUnlockUse: async (payload) => {
      const r = await ask({ op: "unlock-use", frame: payload.toString("hex") }, signTimeoutMs * 2);
      if (!r.ok || typeof r.payload !== "string" || !/^([0-9a-f]{2})*$/.test(r.payload)) {
        throw new Error(
          typeof r.error === "string" ? r.error : "the owner did not relay the unlock use",
        );
      }
      return Buffer.from(r.payload, "hex");
    },
    relayAnchor: async (type, payload) => {
      // An open may take the device up to 10 s; the rest answer at once.
      const r = await ask(
        { op: "anchor", type, frame: payload.toString("hex") },
        type === 0x19 ? Math.max(signTimeoutMs * 3, 12_000) : signTimeoutMs * 3,
      );
      if (!r.ok || typeof r.payload !== "string" || !/^([0-9a-f]{2})*$/.test(r.payload)) {
        throw new Error(
          typeof r.error === "string" ? r.error : "the owner did not relay the anchor frame",
        );
      }
      return Buffer.from(r.payload, "hex");
    },
    entropy: async (n) => {
      const r = await ask({ op: "entropy", n }, askTimeoutMs);
      if (
        !r.ok ||
        typeof r.payload !== "string" ||
        r.payload.length !== n * 2 ||
        !/^[0-9a-f]*$/.test(r.payload)
      ) {
        throw new Error(typeof r.error === "string" ? r.error : "the owner sent no entropy");
      }
      return Buffer.from(r.payload, "hex");
    },
    lost,
    close: () => {
      clearInterval(timer);
      sock.destroy();
    },
  };
}
