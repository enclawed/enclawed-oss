// Swarm messages between processes: newline-delimited JSON over TCP.
//
// The transport carries no authority of its own. Every consensus statement,
// heartbeat and committed block is signed and checked on receipt, so a peer
// that lies, replays or injects messages can waste bandwidth but cannot
// change what the chain decides. That is why plain TCP is acceptable here;
// deployments that also want confidentiality run it over the gateway's TLS.
//
// A peer can also be any byte stream. At sites where SSH to a login node is
// the only way in, the operator's laptop reaches coordinators through SSH
// sessions that run `swarm relay` on the login node (see dialers below and
// relay in daemon.ts): no port beyond SSH is opened or forwarded.

import net from "node:net";
import type { Duplex } from "node:stream";
import type { SwarmLedger } from "./chain.js";
import type { ConsensusMessage } from "./consensus.js";
import type { CommittedBlock, SignedHeartbeat, SwarmTx } from "./types.js";

export type SwarmRole = "coordinator" | "node" | "monitor";

export type Envelope =
  | { kind: "hello"; from: string; role: SwarmRole }
  | { kind: "tx"; tx: SwarmTx }
  | { kind: "consensus"; msg: ConsensusMessage }
  | { kind: "sync"; fromHeight: number }
  | { kind: "heartbeat"; hb: SignedHeartbeat }
  | { kind: "commit"; committed: CommittedBlock };

/** Largest single message accepted; a block of thousands of leases fits easily. */
const MAX_LINE_BYTES = 8 * 1024 * 1024;
const SYNC_BATCH = 256;

export class Peer {
  private buf = "";
  remoteId: string | null = null;
  role: SwarmRole | null = null;

  constructor(
    readonly socket: Duplex,
    private readonly onEnvelope: (peer: Peer, env: Envelope) => void,
    private readonly onClose: (peer: Peer) => void,
  ) {
    socket.setEncoding("utf8");
    if (socket instanceof net.Socket) {
      socket.setNoDelay(true);
    }
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("close", () => this.onClose(this));
    socket.on("error", () => socket.destroy());
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    if (this.buf.length > MAX_LINE_BYTES) {
      this.socket.destroy(); // a peer that never ends a line is not a peer
      return;
    }
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (!line) {
        continue;
      }
      let env: Envelope;
      try {
        env = JSON.parse(line) as Envelope;
      } catch {
        continue; // garbage is dropped, never acted on
      }
      if (env && typeof env === "object" && typeof env.kind === "string") {
        if (env.kind === "hello" && typeof env.from === "string") {
          this.remoteId = env.from;
          this.role = env.role;
        }
        this.onEnvelope(this, env);
      }
    }
  }

  send(env: Envelope): void {
    if (!this.socket.destroyed && this.socket.writable) {
      this.socket.write(JSON.stringify(env) + "\n");
    }
  }
}

export type StreamDialer = { key: string; open: () => Duplex };

export type HubOptions = {
  id: string;
  role: SwarmRole;
  /** Listen here (coordinators). Omit for clients. */
  listen?: { host: string; port: number };
  /** Peers to keep connections to. */
  connect?: { host: string; port: number }[];
  /**
   * Peers reached through a stream instead of TCP, for example an SSH session
   * to a login node. `open` is called again whenever the stream ends.
   */
  dialers?: StreamDialer[];
  ledger: SwarmLedger;
  onConsensus?: (msg: ConsensusMessage, from: Peer) => void;
  onHeartbeat?: (hb: SignedHeartbeat, from: Peer) => void;
  onCommit?: (cb: CommittedBlock, from: Peer) => void;
  /** A transaction from an admin tool or a peer (coordinators only). */
  onTx?: (tx: SwarmTx, from: Peer) => void;
};

/**
 * One process's view of the swarm network: a listening socket for inbound
 * peers, persistent outbound connections that redial on loss, and sync
 * answers served straight from the local ledger.
 */
export class SwarmHub {
  private readonly peers = new Set<Peer>();
  private server: net.Server | null = null;
  private closed = false;
  private readonly redial = new Map<string, ReturnType<typeof setTimeout>>();
  /** Outbound targets we keep connected, and the live socket for each. */
  private readonly targets = new Map<string, net.Socket | null>();

  constructor(private readonly opts: HubOptions) {}

  async start(): Promise<void> {
    if (this.opts.listen) {
      const { host, port } = this.opts.listen;
      this.server = net.createServer((s) => this.adopt(s));
      await new Promise<void>((resolve, reject) => {
        this.server!.once("error", reject);
        this.server!.listen(port, host, () => resolve());
      });
    }
    this.setTargets(this.opts.connect ?? []);
    for (const d of this.opts.dialers ?? []) {
      this.dialStream(d);
    }
  }

  private dialStream(d: StreamDialer): void {
    if (this.closed) {
      return;
    }
    let stream: Duplex;
    try {
      stream = d.open();
    } catch {
      this.retryStream(d);
      return;
    }
    const peer = this.adopt(stream);
    stream.once("close", () => this.retryStream(d));
    peer.send({ kind: "sync", fromHeight: this.opts.ledger.height + 1 });
  }

  private retryStream(d: StreamDialer): void {
    const key = `stream:${d.key}`;
    if (this.closed || this.redial.has(key)) {
      return;
    }
    // Slower than TCP: each retry may start an SSH session.
    const t = setTimeout(() => {
      this.redial.delete(key);
      this.dialStream(d);
    }, 2000);
    t.unref?.();
    this.redial.set(key, t);
  }

  /**
   * Keeps outbound connections to exactly these peers: dials new ones, and
   * drops ones no longer listed (a retired or evicted coordinator). Called as
   * the chain's coordinator set changes.
   */
  setTargets(list: { host: string; port: number }[]): void {
    const want = new Map(list.map((t) => [`${t.host}:${t.port}`, t]));
    for (const [key, socket] of this.targets) {
      if (!want.has(key)) {
        this.targets.delete(key);
        clearTimeout(this.redial.get(key));
        this.redial.delete(key);
        socket?.destroy();
      }
    }
    for (const [key, target] of want) {
      if (!this.targets.has(key)) {
        this.targets.set(key, null);
        this.dial(target);
      }
    }
  }

  get address(): net.AddressInfo | null {
    const a = this.server?.address();
    return a && typeof a === "object" ? a : null;
  }

  private adopt(socket: Duplex): Peer {
    const peer = new Peer(
      socket,
      (p, env) => this.onEnvelope(p, env),
      (p) => this.peers.delete(p),
    );
    this.peers.add(peer);
    peer.send({ kind: "hello", from: this.opts.id, role: this.opts.role });
    return peer;
  }

  private dial(target: { host: string; port: number }): void {
    const key = `${target.host}:${target.port}`;
    if (this.closed || !this.targets.has(key)) {
      return;
    }
    const socket = net.connect(target.port, target.host);
    this.targets.set(key, socket);
    const retry = () => {
      if (this.closed || this.redial.has(key) || !this.targets.has(key)) {
        return;
      }
      const t = setTimeout(() => {
        this.redial.delete(key);
        this.dial(target);
      }, 250);
      t.unref?.();
      this.redial.set(key, t);
    };
    socket.once("connect", () => {
      const peer = this.adopt(socket);
      socket.once("close", retry);
      // Ask for anything we missed while disconnected.
      peer.send({ kind: "sync", fromHeight: this.opts.ledger.height + 1 });
    });
    socket.once("error", () => {
      socket.destroy();
      retry();
    });
  }

  private onEnvelope(peer: Peer, env: Envelope): void {
    switch (env.kind) {
      case "consensus":
        // Only coordinators take part in consensus; nodes just listen.
        if (peer.role === "coordinator") {
          this.opts.onConsensus?.(env.msg, peer);
        }
        return;
      case "sync": {
        // From the wire: check the type, do not coerce.
        const from: unknown = env.fromHeight;
        if (typeof from !== "number" || !Number.isSafeInteger(from) || from < 1) {
          return;
        }
        for (const committed of this.opts.ledger.blocksFrom(from, SYNC_BATCH)) {
          peer.send({ kind: "commit", committed });
        }
        return;
      }
      case "heartbeat":
        this.opts.onHeartbeat?.(env.hb, peer);
        return;
      case "commit":
        this.opts.onCommit?.(env.committed, peer);
        return;
      case "tx":
        this.opts.onTx?.(env.tx, peer);
        return;
      default:
        return;
    }
  }

  /** To every connected coordinator. */
  broadcastConsensus(msg: ConsensusMessage): void {
    for (const p of this.peers) {
      if (p.role === "coordinator") {
        p.send({ kind: "consensus", msg });
      }
    }
  }

  /** New blocks go to everyone: coordinators, nodes and monitors. */
  publishCommit(committed: CommittedBlock): void {
    for (const p of this.peers) {
      p.send({ kind: "commit", committed });
    }
  }

  requestSync(fromHeight: number): void {
    for (const p of this.peers) {
      if (p.role === "coordinator") {
        p.send({ kind: "sync", fromHeight });
      }
    }
  }

  /** Hands a transaction to one coordinator, which gossips it on. */
  submitTx(tx: SwarmTx): boolean {
    for (const p of this.peers) {
      if (p.role === "coordinator") {
        p.send({ kind: "tx", tx });
        return true;
      }
    }
    return false;
  }

  /** To one coordinator, which gossips it to the rest; with `all`, to every one. */
  sendHeartbeat(hb: SignedHeartbeat, opts?: { all: boolean }): void {
    for (const p of this.peers) {
      if (p.role === "coordinator") {
        p.send({ kind: "heartbeat", hb });
        if (!opts?.all) {
          return;
        }
      }
    }
  }

  peerCount(role?: string): number {
    return [...this.peers].filter((p) => !role || p.role === role).length;
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const t of this.redial.values()) {
      clearTimeout(t);
    }
    for (const p of this.peers) {
      p.socket.destroy();
    }
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
  }
}
