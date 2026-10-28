import { afterEach, describe, expect, it } from "vitest";
import { SwarmLedger } from "./chain.js";
import type { ConsensusMessage } from "./consensus.js";
import { SwarmNode } from "./node.js";
import { softwareSigner, type SwarmSigner } from "./signer.js";
import {
  BUNDLE_1,
  bundleTx,
  coordinators,
  joinTx,
  makeGenesis,
  signStatement,
  SimNetwork,
} from "./swarm-test-utils.js";
import type { CommittedBlock, SignedHeartbeat } from "./types.js";

const admin = softwareSigner("admin-0");
let net: SimNetwork | null = null;

function swarm(n = 4, leaseMs = 30_000) {
  const signers = coordinators(n);
  net = new SimNetwork(makeGenesis({ coordinators: signers, admins: [admin], leaseMs }), signers);
  return { net, signers };
}

afterEach(() => {
  net?.stop();
  net = null;
});

function sameChain(sim: SimNetwork, ids?: string[]): boolean {
  const ledgers = [...sim.ledgers.entries()]
    .filter(([id]) => !ids || ids.includes(id))
    .map(([, l]) => l);
  const h = Math.min(...ledgers.map((l) => l.height));
  return ledgers.every((l) => l.block(h)?.hash === ledgers[0].block(h)?.hash);
}

describe("coordinator consensus", () => {
  it("four coordinators agree on one chain", async () => {
    const { net } = swarm();
    net.start();
    await net.clock.runFor(5_000);
    expect(Math.min(...net.heights())).toBeGreaterThanOrEqual(5);
    expect(sameChain(net)).toBe(true);
    expect(net.alerts).toEqual([]);
  });

  it("keeps going with one coordinator down, and stops safely with two", async () => {
    const { net, signers } = swarm();
    net.down.add(signers[0].key.id);
    net.start();
    await net.clock.runFor(10_000);
    const live = signers.slice(1).map((s) => s.key.id);
    const h1 = Math.min(...live.map((id) => net.ledgers.get(id)!.height));
    expect(h1).toBeGreaterThanOrEqual(3);

    net.down.add(signers[1].key.id);
    await net.clock.runFor(10_000);
    const h2 = Math.max(...live.map((id) => net.ledgers.get(id)!.height));
    // Two of four is below quorum: no block may be finalized, at most the one in flight.
    expect(h2).toBeLessThanOrEqual(h1 + 1);

    // Both return; the one that was down the whole time catches up from its peers.
    net.down.clear();
    net.add(signers[0]).start();
    net.add(signers[1]).start();
    await net.clock.runFor(20_000);
    expect(Math.min(...net.heights())).toBeGreaterThan(h2);
    expect(sameChain(net)).toBe(true);
  });

  it("catches a coordinator that double-signs and evicts it on chain", async () => {
    const { net, signers } = swarm();
    const cheat = signers[3];
    // The cheat sends a second, conflicting prevote after every genuine one.
    net.tamper = (from, _to, msg: ConsensusMessage) => {
      if (from !== cheat.key.id || msg.type !== "vote" || msg.statement.kind !== "prevote") {
        return [msg];
      }
      const st = msg.statement;
      const conflicting = signStatement(cheat, {
        swarmId: st.swarmId,
        kind: "prevote",
        height: st.height,
        round: st.round,
        blockHash: st.blockHash ? null : "e".repeat(64),
      });
      void conflicting.then((c) => {
        for (const to of net.engines.keys()) {
          if (to !== cheat.key.id) {
            net.engines.get(to)!.receive({ type: "vote", statement: c });
          }
        }
      });
      return [msg];
    };
    net.start();
    await net.clock.runFor(15_000);
    const honest = signers.slice(0, 3).map((s) => s.key.id);
    for (const id of honest) {
      const state = net.ledgers.get(id)!.state;
      expect(state.coordinators.map((c) => c.id)).not.toContain(cheat.key.id);
      expect(state.evicted.has(cheat.key.id)).toBe(true);
      expect(state.halted).toBeNull();
    }
    // The three honest coordinators keep producing blocks after the eviction.
    const h = Math.min(...honest.map((id) => net.ledgers.get(id)!.height));
    await net.clock.runFor(5_000);
    expect(Math.min(...honest.map((id) => net.ledgers.get(id)!.height))).toBeGreaterThan(h);
    expect(sameChain(net, honest)).toBe(true);
  });

  it("a coordinator restarted mid-height never contradicts its own votes", async () => {
    const { net, signers } = swarm();
    net.start();
    // Restart one coordinator many times at awkward moments.
    for (let i = 0; i < 12; i++) {
      await net.clock.runFor(137 + i * 61);
      net.add(signers[i % 4]).start();
    }
    await net.clock.runFor(10_000);
    for (const l of net.ledgers.values()) {
      expect(l.state.evicted.size).toBe(0);
      expect(l.state.coordinators).toHaveLength(4);
    }
    expect(Math.min(...net.heights())).toBeGreaterThanOrEqual(5);
    expect(sameChain(net)).toBe(true);
  });

  it("finalizes from finals alone, and a coordinator restarted after its final re-sends it", async () => {
    const { net, signers } = swarm();
    const target = signers[1];
    const restartedAt = new Set<number>();
    // No commit messages at all: blocks must be finalized by each coordinator
    // from the finals it receives. Restart one coordinator right after it signs
    // each final, before it could have committed.
    net.tamper = (from, _to, msg: ConsensusMessage) => {
      if (msg.type === "commit") {
        return null;
      }
      if (
        from === target.key.id &&
        msg.type === "vote" &&
        msg.statement.kind === "final" &&
        !restartedAt.has(msg.statement.height)
      ) {
        restartedAt.add(msg.statement.height);
        net.clock.setTimeout(() => net.add(target).start(), 0);
      }
      return [msg];
    };
    net.start();
    await net.clock.runFor(15_000);
    expect(restartedAt.size).toBeGreaterThanOrEqual(3);
    expect(Math.min(...net.heights())).toBeGreaterThanOrEqual(5);
    expect(sameChain(net)).toBe(true);
    for (const l of net.ledgers.values()) {
      expect(l.state.evicted.size).toBe(0);
    }
    expect(net.alerts.filter((a) => /refused to sign|FORK/.test(a))).toEqual([]);
  });

  it("ignores consensus messages forged by an outsider", async () => {
    const { net, signers } = swarm();
    const outsider = softwareSigner(signers[0].key.id); // same id, different key
    net.start();
    await net.clock.runFor(1_000);
    const before = net.heights();
    const forged = await signStatement(outsider, {
      swarmId: "swarm-test",
      kind: "precommit",
      height: Math.max(...before) + 1,
      round: 0,
      blockHash: "d".repeat(64),
    });
    for (const e of net.engines.values()) {
      e.receive({ type: "vote", statement: forged });
    }
    await net.clock.runFor(3_000);
    expect(sameChain(net)).toBe(true);
    for (const l of net.ledgers.values()) {
      expect(l.state.evicted.size).toBe(0);
    }
  });
});

describe("swarm node leases", () => {
  async function joinedNode(sim: SimNetwork, signers: SwarmSigner[]) {
    const node = softwareSigner("node-a");
    const nodeLedger = SwarmLedger.restore(sim.genesis).ledger;
    const gateway = sim.engines.get(signers[0].key.id)!;
    let deviceDirty = false;
    let mono = 0;
    const sent: SignedHeartbeat[] = [];
    const swarmNode = new SwarmNode({
      ledger: nodeLedger,
      signer: node,
      sendHeartbeat: (hb) => {
        sent.push(hb);
        gateway.acceptHeartbeat(hb);
      },
      deviceStatus: () =>
        deviceDirty ? { status: "DIRTY", reason: "removed" } : { status: "CLEAN" },
      monotonicNow: () => mono,
      safetyMarginMs: 1_000,
    });
    // The node follows the chain by verifying committed blocks from its gateway.
    const ledger0 = sim.ledgers.get(signers[0].key.id)!;
    const follow = () => {
      for (const cb of ledger0.blocksFrom(nodeLedger.height + 1)) {
        swarmNode.ingest(JSON.parse(JSON.stringify(cb)) as CommittedBlock);
      }
    };
    gateway.submit(await joinTx(ledger0.state, node, admin));
    sim.start();
    await sim.clock.runFor(3_000);
    follow();
    return {
      swarmNode,
      follow,
      sent,
      setDirty: (v: boolean) => (deviceDirty = v),
      setMono: (t: number) => (mono = t),
    };
  }

  it("allows irreversible actions only while a lease for the current epoch is valid", async () => {
    const { net, signers } = swarm(4, 30_000);
    const n = await joinedNode(net, signers);
    expect(n.swarmNode.check("irreversible")).toMatchObject({ allowed: false, code: "no-lease" });
    expect(n.swarmNode.check("reversible")).toEqual({ allowed: true });

    n.setMono(1_000);
    await n.swarmNode.heartbeat();
    await net.clock.runFor(3_000);
    n.follow();
    expect(n.swarmNode.check("irreversible")).toEqual({ allowed: true });

    // The lease runs from the heartbeat send time minus the margin: 1000 + 30000 - 1000.
    n.setMono(29_999);
    expect(n.swarmNode.check("irreversible")).toEqual({ allowed: true });
    n.setMono(30_000);
    expect(n.swarmNode.check("irreversible")).toMatchObject({ allowed: false, code: "expired" });

    // Renewal brings it back.
    await n.swarmNode.heartbeat();
    await net.clock.runFor(3_000);
    n.follow();
    expect(n.swarmNode.check("irreversible")).toEqual({ allowed: true });

    // A new policy bundle starts a new epoch: the lease is void until renewed.
    const gw = net.engines.get(signers[0].key.id)!;
    gw.submit(await bundleTx(net.ledgers.get(signers[0].key.id)!.state, BUNDLE_1, admin));
    await net.clock.runFor(3_000);
    n.follow();
    expect(n.swarmNode.check("irreversible")).toMatchObject({
      allowed: false,
      code: "stale-epoch",
    });
    await n.swarmNode.heartbeat();
    await net.clock.runFor(3_000);
    n.follow();
    expect(n.swarmNode.check("irreversible")).toEqual({ allowed: true });
  });

  it("is evicted swarm-wide when its Enclaweder goes DIRTY", async () => {
    const { net, signers } = swarm();
    const n = await joinedNode(net, signers);
    n.setDirty(true);
    expect(n.swarmNode.check("irreversible")).toMatchObject({ allowed: false });
    await n.swarmNode.heartbeat();
    await net.clock.runFor(3_000);
    n.follow();
    for (const l of net.ledgers.values()) {
      expect(l.state.evicted.has("node-a")).toBe(true);
    }
    n.setDirty(false);
    expect(n.swarmNode.check("irreversible")).toMatchObject({ allowed: false, code: "evicted" });
  });
});
