import { afterEach, describe, expect, it } from "vitest";
import {
  approvalDigest,
  blockHash,
  joinDigest,
  makeBlock,
  quorumSize,
  READY_WINDOW,
  readyDigest,
  SwarmLedger,
} from "./chain.js";
import { signHeartbeat } from "./heartbeat.js";
import { promotionCandidate } from "./mempool.js";
import { softwareSigner, type SwarmSigner } from "./signer.js";
import {
  coordinators,
  joinTx,
  makeGenesis,
  signStatement,
  SimNetwork,
} from "./swarm-test-utils.js";
import type { Block, CommittedBlock, Statement, SwarmState, SwarmTx } from "./types.js";

const admin = softwareSigner("admin-0");
let net: SimNetwork | null = null;

afterEach(() => {
  net?.stop();
  net = null;
});

async function certify(
  ledger: SwarmLedger,
  voters: SwarmSigner[],
  txs: SwarmTx[],
  opts: { active?: string[]; round?: number } = {},
): Promise<CommittedBlock> {
  const state = ledger.state;
  const round = opts.round ?? 0;
  const active = opts.active ?? [];
  const proposer =
    round === 0 && state.active.length > 0
      ? state.active[(state.height + 1) % state.active.length]
      : state.coordinators[(state.height + 1 + round) % state.coordinators.length].id;
  const block: Block = makeBlock(state, {
    proposer,
    round,
    time: state.headTime + 1000,
    txs,
    active,
  });
  const hash = blockHash(block.header);
  const votes: Statement[] = [];
  for (const v of voters) {
    votes.push(
      await signStatement(v, {
        swarmId: state.swarmId,
        kind: "final",
        height: block.header.height,
        round: 0,
        blockHash: hash,
      }),
    );
  }
  return { block, hash, qc: { height: block.header.height, round, blockHash: hash, votes } };
}

async function addTx(state: SwarmState, key: SwarmSigner, address: string): Promise<SwarmTx> {
  const tx = {
    type: "coordinator.add" as const,
    coordinator: key.key,
    address,
    pop: await key.sign(joinDigest(state.swarmId, key.key)),
    approval: { admin: admin.key.id, sig: "" },
  };
  tx.approval.sig = await admin.sign(approvalDigest(state, tx));
  return tx;
}

async function retireTx(state: SwarmState, id: string): Promise<SwarmTx> {
  const tx = {
    type: "coordinator.retire" as const,
    coordinatorId: id,
    approval: { admin: admin.key.id, sig: "" },
  };
  tx.approval.sig = await admin.sign(approvalDigest(state, tx));
  return tx;
}

async function leaseTx(state: SwarmState, node: SwarmSigner, seq: number): Promise<SwarmTx> {
  const heartbeat = await signHeartbeat(node, {
    swarmId: state.swarmId,
    nodeId: node.key.id,
    epoch: state.epoch,
    seq,
    time: state.headTime,
    status: "CLEAN",
  });
  return {
    type: "lease.grant",
    nodeId: node.key.id,
    epoch: state.epoch,
    durationMs: state.params.leaseMs,
    heartbeat,
  };
}

async function promoteTx(
  state: SwarmState,
  host: SwarmSigner,
  height = state.height,
  signer = host,
): Promise<SwarmTx> {
  const sig = await signer.sign(readyDigest(state.swarmId, host.key.id, height));
  return { type: "coordinator.promote", nodeId: host.key.id, ready: { height, sig } };
}

function sorted(signers: SwarmSigner[]): SwarmSigner[] {
  return signers.toSorted((a, b) => (a.key.id < b.key.id ? -1 : 1));
}

describe("swarm with two coordinators", () => {
  it("needs both to finalize: neither can certify a block alone", async () => {
    const pair = sorted(coordinators(2));
    const { ledger } = SwarmLedger.restore(makeGenesis({ coordinators: pair, admins: [admin] }));
    expect(quorumSize(2)).toBe(2);
    expect(ledger.commit(await certify(ledger, [pair[0]], []))).toMatchObject({ ok: false });
    expect(ledger.commit(await certify(ledger, pair, []))).toMatchObject({ ok: true });
  });

  it("runs consensus with two, and halts when either goes down", async () => {
    const pair = coordinators(2);
    net = new SimNetwork(makeGenesis({ coordinators: pair, admins: [admin] }), pair);
    net.start();
    await net.clock.runFor(5_000);
    const h = Math.min(...net.heights());
    expect(h).toBeGreaterThanOrEqual(4);
    net.down.add(pair[1].key.id);
    await net.clock.runFor(10_000);
    // At most the block already in flight; then nothing, so every lease runs out.
    expect(net.ledgers.get(pair[0].key.id)!.height).toBeLessThanOrEqual(h + 1);
  });
});

describe("growing and shrinking the coordinator set", () => {
  it("adds a coordinator with an admin approval, raising the quorum at the next height", async () => {
    const pair = sorted(coordinators(2));
    const { ledger } = SwarmLedger.restore(makeGenesis({ coordinators: pair, admins: [admin] }));
    const third = softwareSigner("coord-2");
    expect(
      ledger.commit(await certify(ledger, pair, [await addTx(ledger.state, third, "h3:7802")])),
    ).toMatchObject({ ok: true });
    expect(ledger.state.coordinators.map((c) => c.id)).toEqual(["coord-0", "coord-1", "coord-2"]);
    expect(ledger.state.addresses.get("coord-2")).toBe("h3:7802");
    // The next block is certified by the new set: the old pair is no longer enough.
    expect(ledger.commit(await certify(ledger, pair, []))).toMatchObject({ ok: false });
    expect(ledger.commit(await certify(ledger, [...pair, third], []))).toMatchObject({ ok: true });
  });

  it("will not replay an old roster approval after the roster changed", async () => {
    const trio = sorted(coordinators(3));
    const { ledger } = SwarmLedger.restore(makeGenesis({ coordinators: trio, admins: [admin] }));
    const fourth = softwareSigner("coord-3");
    const add = await addTx(ledger.state, fourth, "h4:7803");
    ledger.commit(await certify(ledger, trio, [add]));
    const all = [...trio, fourth];
    const retire = await retireTx(ledger.state, "coord-3");
    ledger.commit(await certify(ledger, all, [retire]));
    expect(ledger.state.coordinators).toHaveLength(3);
    // The same add, approved for an earlier roster version, cannot bring it back.
    expect(ledger.commit(await certify(ledger, trio, [add]))).toMatchObject({ ok: false });
  });

  it("refuses to retire below two coordinators", async () => {
    const pair = sorted(coordinators(2));
    const { ledger } = SwarmLedger.restore(makeGenesis({ coordinators: pair, admins: [admin] }));
    const retire = await retireTx(ledger.state, "coord-1");
    expect(ledger.commit(await certify(ledger, pair, [retire]))).toMatchObject({ ok: false });
  });
});

describe("automatic growth", () => {
  async function grownSwarm() {
    const pair = sorted(coordinators(2));
    const genesis = makeGenesis({
      coordinators: pair,
      admins: [admin],
      growth: { maxCoordinators: 4, nodesPerCoordinator: 2 },
    });
    const { ledger } = SwarmLedger.restore(genesis);
    const hosts = [softwareSigner("host-a"), softwareSigner("host-b")];
    const ranks = [0, 1, 2, 3].map((i) => softwareSigner(`job.r${i}`));
    const joins: SwarmTx[] = [];
    for (const h of hosts) {
      joins.push(await joinTx(ledger.state, h, admin, `${h.key.id}:7900`));
    }
    for (const r of ranks) {
      joins.push(await joinTx(ledger.state, r, admin));
    }
    ledger.commit(await certify(ledger, pair, joins));
    return { pair, ledger, hosts, ranks };
  }

  it("promotes an eligible, leased, ready node once there are enough nodes", async () => {
    const { pair, ledger, hosts } = await grownSwarm();
    // Six nodes warrant a third coordinator (2 per coordinator), but no host holds a lease yet.
    expect(promotionCandidate(ledger.state)).toBeNull();
    const premature = await promoteTx(ledger.state, hosts[0]);
    expect(ledger.commit(await certify(ledger, pair, [premature]))).toMatchObject({ ok: false });

    ledger.commit(
      await certify(ledger, pair, [
        await leaseTx(ledger.state, hosts[0], 1),
        await leaseTx(ledger.state, hosts[1], 1),
      ]),
    );
    expect(promotionCandidate(ledger.state)).toBe("host-a");
    // Readiness must be the candidate's own, and recent.
    const forged = await promoteTx(ledger.state, hosts[0], ledger.state.height, pair[0]);
    expect(ledger.commit(await certify(ledger, pair, [forged]))).toMatchObject({ ok: false });
    const unsigned = { type: "coordinator.promote", nodeId: "host-a" } as SwarmTx;
    expect(ledger.commit(await certify(ledger, pair, [unsigned]))).toMatchObject({ ok: false });
    ledger.commit(await certify(ledger, pair, [await promoteTx(ledger.state, hosts[0])]));
    expect(ledger.state.coordinators.map((c) => c.id)).toContain("host-a");
    // A rank is never eligible, and six nodes do not warrant a fourth coordinator.
    const rank = await promoteTx(ledger.state, softwareSigner("job.r0"));
    const three = [...pair, hosts[0]];
    expect(ledger.commit(await certify(ledger, three, [rank]))).toMatchObject({ ok: false });
    // host-b is eligible and leased, but a fourth coordinator needs eight nodes.
    const hostB = await promoteTx(ledger.state, hosts[1]);
    expect(ledger.commit(await certify(ledger, three, [hostB]))).toMatchObject({ ok: false });
    expect(promotionCandidate(ledger.state)).toBeNull();
  });

  it("refuses a readiness statement older than the window", async () => {
    const { pair, ledger, hosts } = await grownSwarm();
    ledger.commit(await certify(ledger, pair, [await leaseTx(ledger.state, hosts[0], 1)]));
    const stale = await promoteTx(ledger.state, hosts[0], ledger.state.height);
    for (let i = 0; i <= READY_WINDOW; i++) {
      ledger.commit(await certify(ledger, pair, [await leaseTx(ledger.state, hosts[0], i + 2)]));
    }
    expect(ledger.commit(await certify(ledger, pair, [stale]))).toMatchObject({ ok: false });
    const fresh = await promoteTx(ledger.state, hosts[0]);
    expect(ledger.commit(await certify(ledger, pair, [fresh]))).toMatchObject({ ok: true });
    expect(ledger.state.coordinators.map((c) => c.id)).toContain("host-a");
  });

  it("cannot make a node eligible by editing its join", async () => {
    const pair = sorted(coordinators(2));
    const { ledger } = SwarmLedger.restore(
      makeGenesis({
        coordinators: pair,
        admins: [admin],
        growth: { maxCoordinators: 4, nodesPerCoordinator: 1 },
      }),
    );
    const join = await joinTx(ledger.state, softwareSigner("job.r0"), admin);
    const edited = { ...join, coordinator: { address: "evil:1" } } as SwarmTx;
    expect(ledger.commit(await certify(ledger, pair, [edited]))).toMatchObject({ ok: false });
  });

  it("drops a promoted coordinator from the roster when its device goes DIRTY", async () => {
    const { pair, ledger, hosts } = await grownSwarm();
    ledger.commit(await certify(ledger, pair, [await leaseTx(ledger.state, hosts[0], 1)]));
    ledger.commit(await certify(ledger, pair, [await promoteTx(ledger.state, hosts[0])]));
    const three = [...pair, hosts[0]];
    const dirty = await signHeartbeat(hosts[0], {
      swarmId: ledger.state.swarmId,
      nodeId: "host-a",
      epoch: ledger.state.epoch,
      seq: 2,
      time: 0,
      status: "DIRTY",
    });
    ledger.commit(
      await certify(ledger, three, [
        { type: "node.evict", nodeId: "host-a", reason: "dirty", evidence: dirty },
      ]),
    );
    expect(ledger.state.coordinators.map((c) => c.id)).toEqual(["coord-0", "coord-1"]);
    expect(ledger.state.evicted.has("host-a")).toBe(true);
    expect(ledger.state.halted).toBeNull();
  });
});

describe("proposer skipping", () => {
  it("refuses an active list that is unsorted, foreign or short of a quorum", async () => {
    const four = sorted(coordinators(4));
    const { ledger } = SwarmLedger.restore(makeGenesis({ coordinators: four, admins: [admin] }));
    ledger.commit(await certify(ledger, four.slice(0, 3), []));
    const bad = [
      ["coord-2", "coord-1", "coord-0"],
      ["coord-0", "coord-1", "coord-9"],
      ["coord-0", "coord-1"],
    ];
    for (const active of bad) {
      expect(ledger.commit(await certify(ledger, four, [], { active }))).toMatchObject({
        ok: false,
      });
    }
    expect(
      ledger.commit(await certify(ledger, four, [], { active: ["coord-0", "coord-1", "coord-2"] })),
    ).toMatchObject({ ok: true });
  });

  it("stops waiting on a crashed proposer once it has dropped out of the certificates", async () => {
    const four = coordinators(4);
    net = new SimNetwork(makeGenesis({ coordinators: four, admins: [admin] }), four);
    net.down.add(four[0].key.id);
    net.start();
    await net.clock.runFor(30_000);
    const ledger = net.ledgers.get(four[1].key.id)!;
    const recent = ledger.blocksFrom(Math.max(1, ledger.height - 20), 20);
    expect(recent.length).toBe(20);
    // Every recent block was decided in round 0: no height waited out a propose timeout.
    expect(recent.filter((b) => b.block.header.round > 0)).toEqual([]);
    expect(recent.every((b) => !b.block.header.active.includes(four[0].key.id))).toBe(true);
  });
});
