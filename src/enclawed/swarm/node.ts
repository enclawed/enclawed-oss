// The node side of the swarm: heartbeats out, committed blocks in, and the
// lease check that gates irreversible actions.
//
// The per-action fast path stays local. check() reads only in-memory state and
// a monotonic clock, so an agent never waits on the network to act; the network
// only decides whether this node still holds a lease. Without a valid lease the
// node keeps running reversible work and refuses irreversible actions (fail
// closed), the same way an unplugged Enclaweder halts a single host.

import { performance } from "node:perf_hooks";
import type { SwarmLedger } from "./chain.js";
import { signHeartbeat } from "./heartbeat.js";
import type { SwarmSigner } from "./signer.js";
import type { CommittedBlock, HeartbeatStatus, SignedHeartbeat } from "./types.js";

export type ActionClass = "reversible" | "irreversible";

export type LeaseDenyCode =
  | "not-member"
  | "evicted"
  | "halted"
  | "device-dirty"
  | "no-lease"
  | "stale-epoch"
  | "expired";

export type LeaseDecision =
  | { allowed: true }
  | { allowed: false; code: LeaseDenyCode; reason: string };

export type SwarmNodeOptions = {
  ledger: SwarmLedger;
  signer: SwarmSigner;
  /**
   * Delivers a heartbeat to this node's gateway coordinator, or, with `all`,
   * to every coordinator it reaches: a node whose lease is lapsing does not
   * rely on one coordinator, so a single faulty one cannot starve it of leases
   * until it expires.
   */
  sendHeartbeat: (hb: SignedHeartbeat, opts?: { all: boolean }) => void;
  /** Called when the node has fallen behind and needs blocks from `fromHeight`. */
  requestSync?: (fromHeight: number) => void;
  /**
   * Local device state. DIRTY is reported on chain and refuses irreversible
   * actions. UNAVAILABLE (the device's owner is gone or busy) sends no
   * heartbeat: the lease lapses and the rank pauses, nothing is evicted.
   */
  deviceStatus?: () => { status: HeartbeatStatus | "UNAVAILABLE"; reason?: string };
  /** Monotonic milliseconds. Leases are timed against this, never against wall clocks. */
  monotonicNow?: () => number;
  wallNow?: () => number;
  /** Subtracted from every lease so drift and delivery delay land on the safe side. */
  safetyMarginMs?: number;
};

export class SwarmNode {
  private readonly opts: SwarmNodeOptions;
  private readonly ledger: SwarmLedger;
  private readonly mono: () => number;
  private seq: number;
  /** heartbeat seq -> local monotonic time it was sent. */
  private readonly sentAt = new Map<number, number>();
  /** Local monotonic time the current lease runs out; -Infinity when there is none. */
  private leaseUntil = Number.NEGATIVE_INFINITY;
  private leaseEpoch = -1;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: SwarmNodeOptions) {
    this.opts = opts;
    this.ledger = opts.ledger;
    this.mono = opts.monotonicNow ?? (() => performance.now());
    // Resume above any seq already used on chain, or the next lease would be refused.
    this.seq = (this.ledger.state.lastHeartbeatSeq.get(this.id) ?? -1) + 1;
  }

  get id(): string {
    return this.opts.signer.key.id;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    void this.heartbeat();
    this.schedule();
  }

  private timerMs = 0;

  private schedule(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timerMs = this.ledger.state.params.heartbeatMs;
    this.timer = setInterval(() => void this.heartbeat(), this.timerMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Signs and sends one heartbeat. Returns null, sending nothing, when the
   * device is UNAVAILABLE or the signature cannot be had: a missed heartbeat
   * only lets the lease lapse, while a thrown one would take this supervisor
   * down with an unhandled rejection.
   */
  async heartbeat(): Promise<SignedHeartbeat | null> {
    const state = this.ledger.state;
    const dev = this.opts.deviceStatus?.() ?? { status: "CLEAN" as const };
    if (dev.status === "UNAVAILABLE") {
      return null;
    }
    const seq = this.seq++;
    this.sentAt.set(seq, this.mono());
    // Only the newest few sends can still be answered; forget the rest.
    for (const old of this.sentAt.keys()) {
      if (old < seq - 64) {
        this.sentAt.delete(old);
      }
    }
    let hb: SignedHeartbeat;
    try {
      hb = await signHeartbeat(this.opts.signer, {
        swarmId: state.swarmId,
        nodeId: this.id,
        epoch: state.epoch,
        seq,
        time: (this.opts.wallNow ?? Date.now)(),
        status: dev.status,
        ...(dev.reason ? { reason: dev.reason } : {}),
      });
    } catch {
      return null;
    }
    // Lapsing (less than two heartbeats of lease left, or none): send to all.
    const lapsing = this.mono() + 2 * state.params.heartbeatMs > this.leaseUntil;
    this.opts.sendHeartbeat(hb, { all: lapsing });
    return hb;
  }

  /** Feed a committed block from any coordinator; its certificate is checked here. */
  ingest(cb: CommittedBlock): void {
    const r = this.ledger.commit(cb);
    if (!r.ok) {
      if (r.code === "gap") {
        this.opts.requestSync?.(this.ledger.height + 1);
      }
      return;
    }
    if (!r.applied) {
      return;
    }
    // params.update can change the interval; follow it from the next beat.
    if (this.timer && this.ledger.state.params.heartbeatMs !== this.timerMs) {
      this.schedule();
    }
    const lease = this.ledger.state.leases.get(this.id);
    if (lease && lease.height === this.ledger.height) {
      const sent = this.sentAt.get(lease.heartbeatSeq);
      if (sent !== undefined) {
        // The lease runs from when we SENT the heartbeat it answers: earlier than
        // any coordinator could have granted it, so the node always gives up first.
        this.leaseUntil = sent + lease.durationMs - (this.opts.safetyMarginMs ?? 1000);
        this.leaseEpoch = lease.epoch;
      }
    }
  }

  check(action: ActionClass): LeaseDecision {
    if (action === "reversible") {
      return { allowed: true };
    }
    const state = this.ledger.state;
    if (state.halted) {
      return { allowed: false, code: "halted", reason: `swarm chain halted: ${state.halted}` };
    }
    if (state.evicted.has(this.id)) {
      return { allowed: false, code: "evicted", reason: "this node was evicted from the swarm" };
    }
    if (!state.nodes.has(this.id)) {
      return { allowed: false, code: "not-member", reason: "this node has not joined the swarm" };
    }
    if (this.opts.deviceStatus?.().status === "DIRTY") {
      return {
        allowed: false,
        code: "device-dirty",
        reason: "the Enclaweder on this node is DIRTY",
      };
    }
    if (this.leaseEpoch < 0) {
      return { allowed: false, code: "no-lease", reason: "no lease granted yet" };
    }
    if (this.leaseEpoch !== state.epoch) {
      return {
        allowed: false,
        code: "stale-epoch",
        reason: `lease is for epoch ${this.leaseEpoch}, swarm is at ${state.epoch}`,
      };
    }
    if (this.mono() >= this.leaseUntil) {
      return { allowed: false, code: "expired", reason: "lease expired; waiting for renewal" };
    }
    return { allowed: true };
  }
}
