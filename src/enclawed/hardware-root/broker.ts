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

import { chmodSync, existsSync, lstatSync, mkdirSync, unlinkSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { checkpointDigest, type QueueJournal } from "./queue-journal.js";

/** What a process sees of the machine's hardware root. */
export type RootHealth =
  | { status: "CLEAN" }
  | { status: "DIRTY"; reason: string }
  /** The owner is gone or busy; not a tamper. Gated work waits or is refused. */
  | { status: "UNAVAILABLE"; reason: string };

export type RootMember = { uid: string; pubkey: string; serial: string };

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
};

/** The socket the machine's owner listens on, for this user. */
export function brokerSocketPath(): string {
  const explicit = process.env.ENCLAWEDER_BROKER;
  if (explicit) {
    return explicit;
  }
  const uid = process.getuid?.() ?? "u";
  const base = process.env.XDG_RUNTIME_DIR ?? os.tmpdir();
  return path.join(base, `enclawed-${uid}`, "enclaweder.sock");
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
    this.checkpointing = true;
    try {
      const r = await this.enqueue(CHECKPOINT_CLIENT, checkpointDigest(head), undefined, true);
      await journal.checkpoint(head, r.uid, r.sig);
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

/** The scheduler's own client id for journal checkpoints. */
const CHECKPOINT_CLIENT = -1;

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
  | { id: number; op: "members" | "health" }
  | { id: number; op: "sign"; digest: string; deadlineMs?: number };

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
    { ...limits, ...(journal ? { journal, checkpointMs: 1000 } : {}) },
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
  ready.then(
    (r) => {
      scheduler = r.scheduler;
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
        reply({ id: req.id, ok: true, health: svc.health() });
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
  readonly members: RootMember[];
  health(): RootHealth;
  device(): SigningDevice;
  /** Resolves when the connection to the owner is lost. */
  readonly lost: Promise<void>;
  close(): void;
};

export class RootHaltError extends Error {}

/**
 * Connects to the owner. Throws RootHaltError when the owner reports that the
 * devices would not bind (not genuine, latched DIRTY, a session that may not
 * continue): the client must refuse exactly as the owner did.
 */
export async function connectRoot(socketPath: string, healthMs = 500): Promise<RemoteRoot | null> {
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
  // `background` marks the periodic health polls: nobody awaits them.
  const ask = (req: Record<string, unknown>, background = false) =>
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
      waiting.set(id, (r) => {
        if (holds && --held === 0) {
          sock.unref();
        }
        resolve(r);
      });
      sock.write(JSON.stringify({ ...req, id }) + "\n");
    });

  const m = await ask({ op: "members" });
  if (!m.ok) {
    sock.destroy();
    if (m.halt) {
      throw new RootHaltError(typeof m.error === "string" ? m.error : "the devices did not bind");
    }
    return null;
  }
  const members = m.members as RootMember[];
  // DIRTY is latched: once seen, it stays, whatever comes after.
  let health: RootHealth = { status: "CLEAN" };
  const poll = async (background: boolean) => {
    if (health.status === "DIRTY") {
      return;
    }
    const h = await ask({ op: "health" }, background);
    if (!h.ok) {
      health = {
        status: "UNAVAILABLE",
        reason: typeof h.error === "string" ? h.error : "no answer",
      };
      return;
    }
    health = h.health as RootHealth;
  };
  await poll(false);
  const timer = setInterval(() => void poll(true), healthMs);
  timer.unref();
  void lost.then(() => {
    clearInterval(timer);
    if (health.status !== "DIRTY") {
      health = { status: "UNAVAILABLE", reason: lostReason ?? "the hardware root's owner is gone" };
    }
  });
  const device: SigningDevice = {
    getIdentity: async () => ({
      uid: Buffer.from(members[0].uid, "hex"),
      pubkeyRaw: Buffer.from(members[0].pubkey, "hex"),
    }),
    challenge: async (nonce32) => {
      if (health.status !== "CLEAN") {
        throw new Error(`hardware root ${health.status}: ${health.reason}`);
      }
      const r = await ask({ op: "sign", digest: nonce32.toString("hex") });
      if (!r.ok) {
        throw new Error(typeof r.error === "string" ? r.error : "signing failed");
      }
      return {
        uid: Buffer.from(String(r.uid), "hex"),
        sig: Buffer.from(String(r.sig), "hex"),
      };
    },
  };
  return {
    members,
    health: () => health,
    device: () => device,
    lost,
    close: () => {
      clearInterval(timer);
      sock.destroy();
    },
  };
}
