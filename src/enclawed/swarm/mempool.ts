// Transactions waiting for a block. Kept apart from the consensus rules so the
// engine stays readable; the proposer asks it for a block body.

import { applyTx, cloneState, expiredNodes, coordinatorKey } from "./chain.js";
import type { SignedHeartbeat, SwarmState, SwarmTx } from "./types.js";

/** Transactions waiting for a block, keyed so duplicates from several coordinators collapse. */
export class Mempool {
  private readonly txs = new Map<string, SwarmTx>();
  /** Newest CLEAN heartbeat per node; turned into a lease at build time, at the then-current epoch. */
  private readonly heartbeats = new Map<string, SignedHeartbeat>();

  add(tx: SwarmTx): void {
    if (tx.type === "lease.grant") {
      const prev = this.heartbeats.get(tx.nodeId);
      if (!prev || tx.heartbeat.body.seq > prev.body.seq) {
        this.heartbeats.set(tx.nodeId, tx.heartbeat);
      }
      return;
    }
    this.txs.set(mempoolKey(tx), tx);
  }

  /** Builds a block body: membership and evidence first, leases last at the resulting epoch. */
  build(state: SwarmState, leaseMs: number, maxTxs: number): SwarmTx[] {
    const order: SwarmTx["type"][] = [
      "coordinator.evict",
      "node.evict",
      "coordinator.retire",
      "coordinator.add",
      "coordinator.promote",
      "node.join",
      "bundle.publish",
      "params.update",
    ];
    const candidates = [...this.txs.values()].toSorted(
      (a, b) => order.indexOf(a.type) - order.indexOf(b.type),
    );
    const out: SwarmTx[] = [];
    // Dry-run on one scratch copy so an invalid tx never reaches a proposal.
    // applyTx validates fully before it mutates, so a refused tx leaves it intact.
    const scratch = cloneState(state);
    const tryAdd = (tx: SwarmTx) => {
      if (out.length >= maxTxs) {
        return;
      }
      try {
        applyTx(scratch, tx);
        out.push(tx);
      } catch {
        // stale or invalid; prune() drops it after the next commit
      }
    };
    for (const tx of candidates) {
      tryAdd(tx);
    }
    // Nodes the chain shows unrenewed for longer than the epoch allows. Before
    // the leases: an eviction starts a new epoch, and the leases below are
    // granted at the epoch it leaves.
    for (const nodeId of expiredNodes(scratch)) {
      tryAdd({ type: "node.evict", nodeId, reason: "expired" });
    }
    for (const [nodeId, heartbeat] of [...this.heartbeats.entries()].toSorted(([a], [b]) =>
      a < b ? -1 : 1,
    )) {
      tryAdd({ type: "lease.grant", nodeId, epoch: scratch.epoch, durationMs: leaseMs, heartbeat });
    }
    return out;
  }

  /** Drops what the new state has absorbed or made impossible. */
  prune(state: SwarmState): void {
    const scratch = cloneState(state);
    for (const [key, tx] of this.txs) {
      try {
        applyTx(scratch, tx);
      } catch {
        this.txs.delete(key);
      }
    }
    for (const [nodeId, hb] of this.heartbeats) {
      if (!state.nodes.has(nodeId) || hb.body.seq <= (state.lastHeartbeatSeq.get(nodeId) ?? -1)) {
        this.heartbeats.delete(nodeId);
      }
    }
  }

  get size(): number {
    return this.txs.size + this.heartbeats.size;
  }
}

/**
 * Whether the growth rule allows another coordinator now, and the lowest-id
 * eligible node that could take the place. Hosts use this to decide when to
 * ask; the chain only checks the rule and the candidate's own readiness.
 */
export function promotionCandidate(state: SwarmState): string | null {
  return [...state.addresses.keys()].filter((id) => canPromote(state, id)).toSorted()[0] ?? null;
}

/** The growth rule's conditions for promoting `id` now, short of its readiness signature. */
export function canPromote(state: SwarmState, id: string): boolean {
  const g = state.params.growth;
  return (
    !!g &&
    state.coordinators.length < g.maxCoordinators &&
    state.nodes.size >= g.nodesPerCoordinator * (state.coordinators.length + 1) &&
    state.nodes.has(id) &&
    state.addresses.has(id) &&
    !coordinatorKey(state, id) &&
    state.leases.get(id)?.epoch === state.epoch
  );
}

function mempoolKey(tx: SwarmTx): string {
  switch (tx.type) {
    case "node.join":
      return `join:${tx.node.id}`;
    case "node.evict":
      return `evict:${tx.nodeId}`;
    case "coordinator.evict":
      return `cevict:${tx.coordinatorId}`;
    case "bundle.publish":
      return `bundle:${tx.bundleHash}`;
    case "params.update":
      return `params:${tx.leaseMs}:${tx.heartbeatMs}`;
    case "lease.grant":
      return `lease:${tx.nodeId}`;
    case "coordinator.add":
      return `cadd:${tx.coordinator.id}`;
    case "coordinator.promote":
      return `cpromote:${tx.nodeId}`;
    case "coordinator.retire":
      return `cretire:${tx.coordinatorId}`;
    default:
      throw new Error(`swarm mempool: unknown transaction type`);
  }
}
