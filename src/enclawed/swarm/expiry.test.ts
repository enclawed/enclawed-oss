// Expiry: a node that renews no lease for more than the epoch's expiryBlocks
// is evicted, on the chain's own evidence. The clock is the chain: blocks, each
// certified by a quorum; no timestamp is consulted.

import { describe, expect, it } from "vitest";
import {
  applyBlock,
  applyTx,
  approvalDigest,
  blockHash,
  joinDigest,
  ChainError,
  cloneState,
  expiredNodes,
  genesisState,
  makeBlock,
  quorumSize,
  SwarmLedger,
} from "./chain.js";
import { signHeartbeat } from "./heartbeat.js";
import { Mempool } from "./mempool.js";
import { SwarmNode } from "./node.js";
import { softwareSigner, type SwarmSigner } from "./signer.js";
import { coordinators, joinTx, makeGenesis, signStatement } from "./swarm-test-utils.js";
import type { CommittedBlock, Statement, SwarmState, SwarmTx } from "./types.js";

const admin = softwareSigner("admin-0");

/** Applies one block of `txs` the way a coordinator does. */
function block(s: SwarmState, txs: SwarmTx[] = []): SwarmState {
  return applyBlock(
    s,
    makeBlock(s, {
      proposer: s.coordinators[(s.height + 1) % s.coordinators.length].id,
      round: 0,
      // Deliberately wild: the rule must not care what the clock says.
      time: s.headTime + (s.height % 2 === 0 ? 1 : 10_000_000),
      txs,
    }),
  );
}

async function lease(s: SwarmState, node: SwarmSigner, seq: number): Promise<SwarmTx> {
  const heartbeat = await signHeartbeat(node, {
    swarmId: s.swarmId,
    nodeId: node.key.id,
    epoch: s.epoch,
    seq,
    time: 0,
    status: "CLEAN",
  });
  return { type: "lease.grant", nodeId: node.key.id, epoch: s.epoch, durationMs: 6000, heartbeat };
}

async function swarmWithNode(expiryBlocks: number | undefined) {
  const genesis = makeGenesis({
    coordinators: coordinators(4),
    admins: [admin],
    leaseMs: 6000,
    heartbeatMs: 1000,
    ...(expiryBlocks !== undefined ? { expiryBlocks } : {}),
  });
  let s = genesisState(genesis);
  const node = softwareSigner("job.r0");
  s = block(s, [await joinTx(s, node, admin)]); // joined at height 1
  return { s, node };
}

const expire = (nodeId: string): SwarmTx => ({ type: "node.evict", nodeId, reason: "expired" });

describe("expiry, on the chain's own clock", () => {
  it("evicts a node only after more than expiryBlocks blocks without a renewal", async () => {
    let { s } = await swarmWithNode(3);
    // Joined at height 1; at heights 2..4 it is within 3 blocks.
    for (let h = 2; h <= 4; h++) {
      expect(expiredNodes(s)).toEqual([]);
      expect(() => applyTx(cloneState(s), expire("job.r0"))).toThrow(ChainError);
      s = block(s);
    }
    expect(expiredNodes(s)).toEqual(["job.r0"]);
    const before = s.epoch;
    s = block(s, [expire("job.r0")]);
    expect(s.nodes.has("job.r0")).toBe(false);
    expect(s.evicted.has("job.r0")).toBe(true);
    expect(s.epoch).toBe(before + 1);
  });

  it("restarts the count at every renewal", async () => {
    let { s, node } = await swarmWithNode(3);
    for (let i = 0; i < 10; i++) {
      s = block(s, [await lease(s, node, i)]);
      s = block(s);
      expect(expiredNodes(s)).toEqual([]);
    }
  });

  it("does not expire anyone while the chain makes no blocks", async () => {
    const { s } = await swarmWithNode(3);
    // However long the chain is stalled (no quorum, no blocks), the count is
    // in blocks, so it stands still: a quorum loss never turns into evictions.
    expect(expiredNodes(s)).toEqual([]);
  });

  it("never expires a coordinator, and never without the epoch's expiryBlocks", async () => {
    let { s } = await swarmWithNode(undefined);
    for (let i = 0; i < 20; i++) {
      s = block(s);
    }
    expect(expiredNodes(s)).toEqual([]);
    expect(() => applyTx(cloneState(s), expire("job.r0"))).toThrow(/blocks unrenewed/);
    expect(() => applyTx(cloneState(s), expire(s.coordinators[0].id))).toThrow(ChainError);
  });

  it("never expires a node that is also a coordinator (promoted by the growth rule)", async () => {
    let { s } = await swarmWithNode(3);
    // The state a promotion leaves: the node is in the coordinator set too.
    const promoted = s.nodes.get("job.r0")!;
    s = { ...cloneState(s), coordinators: [...s.coordinators, promoted] };
    for (let i = 0; i < 10; i++) {
      s.height += 1;
    }
    expect(expiredNodes(s)).toEqual([]);
  });

  it("is adjustable per epoch, by an admin-approved params.update, within bounds", async () => {
    let { s } = await swarmWithNode(3);
    const update = async (expiryBlocks: number, signer = admin) => {
      const tx = {
        type: "params.update" as const,
        leaseMs: 6000,
        heartbeatMs: 1000,
        expiryBlocks,
        approval: { admin: admin.key.id, sig: "" },
      };
      tx.approval.sig = await signer.sign(approvalDigest(s, tx));
      return tx;
    };
    s = block(s, [await update(50)]);
    expect(s.params.expiryBlocks).toBe(50);
    // Below the floor, or approved for another value, is refused.
    await expect(update(2).then((tx) => applyTx(cloneState(s), tx))).rejects.toThrow(
      /expiryBlocks must be/,
    );
    const approvedFor40 = await update(40);
    expect(() => applyTx(cloneState(s), { ...approvedFor40, expiryBlocks: 41 })).toThrow(
      /approval/,
    );
  });

  it("is proposed by the block builder, ahead of the leases it would otherwise void", async () => {
    let { s, node } = await swarmWithNode(3);
    const other = softwareSigner("job.r1");
    s = block(s, [await joinTx(s, other, admin)]);
    for (let i = 0; i < 4; i++) {
      s = block(s, [await lease(s, other, i)]);
    }
    const pool = new Mempool();
    pool.add(await lease(s, other, 99));
    const txs = pool.build(s, 6000, 100);
    expect(txs[0]).toEqual(expire("job.r0"));
    expect(txs.some((t) => t.type === "lease.grant" && t.nodeId === "job.r1")).toBe(true);
    s = block(s, txs);
    expect(s.evicted.has(node.key.id)).toBe(true);
    expect(s.leases.get("job.r1")?.epoch).toBe(s.epoch);
  });
});

describe("heartbeats of a node whose lease is lapsing", () => {
  it("go to every coordinator, and to one once the lease is fresh", async () => {
    const signers = coordinators(4).toSorted((a, b) => (a.key.id < b.key.id ? -1 : 1));
    const genesis = makeGenesis({
      coordinators: signers,
      admins: [admin],
      leaseMs: 6000,
      heartbeatMs: 1000,
      expiryBlocks: 12,
    });
    const node = softwareSigner("job.r0");
    const { ledger } = SwarmLedger.restore(genesis);
    /** A block certified by a quorum of finals, as coordinators commit it. */
    const commit = async (txs: SwarmTx[]): Promise<CommittedBlock> => {
      const st = ledger.state;
      const b = makeBlock(st, {
        proposer: st.coordinators[(st.height + 1) % st.coordinators.length].id,
        round: 0,
        time: st.headTime + 1000,
        txs,
      });
      const hash = blockHash(b.header);
      const votes: Statement[] = [];
      for (const v of signers.slice(0, quorumSize(signers.length))) {
        votes.push(
          await signStatement(v, {
            swarmId: st.swarmId,
            kind: "final",
            height: b.header.height,
            round: 0,
            blockHash: hash,
          }),
        );
      }
      return { block: b, hash, qc: { height: b.header.height, round: 0, blockHash: hash, votes } };
    };
    const now = 0;
    const sent: boolean[] = [];
    const n = new SwarmNode({
      ledger,
      signer: node,
      sendHeartbeat: (_hb, o) => sent.push(o?.all ?? false),
      monotonicNow: () => now,
    });
    n.ingest(await commit([await joinTx(ledger.state, node, admin)]));
    // No lease yet: to every coordinator.
    const hb = (await n.heartbeat())!;
    expect(sent.at(-1)).toBe(true);
    n.ingest(
      await commit([
        {
          type: "lease.grant",
          nodeId: node.key.id,
          epoch: ledger.state.epoch,
          durationMs: 6000,
          heartbeat: hb,
        },
      ]),
    );
    // A fresh lease: to its gateway alone.
    await n.heartbeat();
    expect(sent.at(-1)).toBe(false);
  });
});

describe("observers", () => {
  it("never expire, never hold a lease, and the role is part of the approval", async () => {
    let { s } = await swarmWithNode(3);
    const mon = softwareSigner("monitor.a");
    const join = {
      type: "node.join" as const,
      node: mon.key,
      pop: await mon.sign(joinDigest(s.swarmId, mon.key)),
      observer: true as const,
      approval: { admin: admin.key.id, sig: "" },
    };
    join.approval.sig = await admin.sign(approvalDigest(s, join));
    // Approved as an observer, it cannot be smuggled in as a node, nor back.
    expect(() => applyTx(cloneState(s), { ...join, observer: undefined } as SwarmTx)).toThrow(
      /approval/,
    );
    s = block(s, [join]);
    expect(s.observers.has("monitor.a")).toBe(true);
    for (let i = 0; i < 10; i++) {
      s = block(s);
    }
    expect(expiredNodes(s)).toEqual(["job.r0"]);
    expect(() => applyTx(cloneState(s), expire("monitor.a"))).toThrow(/blocks unrenewed/);
    const observerLease = await lease(s, mon, 0);
    expect(() => applyTx(cloneState(s), observerLease)).toThrow(/observer/);
  });
});
