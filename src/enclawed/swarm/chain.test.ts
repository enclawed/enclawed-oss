import { describe, expect, it } from "vitest";
import {
  applyBlock,
  blockHash,
  ChainError,
  genesisState,
  makeBlock,
  memoryLedgerStore,
  quorumSize,
  SwarmLedger,
  verifyEquivocation,
} from "./chain.js";
import { signHeartbeat } from "./heartbeat.js";
import { softwareSigner, type SwarmSigner } from "./signer.js";
import {
  BUNDLE_1,
  bundleTx,
  coordinators,
  deviceKeyFor,
  joinTx,
  makeGenesis,
  signStatement,
} from "./swarm-test-utils.js";
import type { Block, CommittedBlock, Genesis, Statement, SwarmTx } from "./types.js";

const admin = softwareSigner("admin-0");

async function certify(
  ledger: SwarmLedger,
  signers: SwarmSigner[],
  txs: SwarmTx[],
  voters = signers.slice(0, quorumSize(signers.length)),
  kind: "final" | "precommit" = "final",
): Promise<CommittedBlock> {
  const state = ledger.state;
  const block: Block = makeBlock(state, {
    proposer: state.coordinators[(state.height + 1) % state.coordinators.length].id,
    round: 0,
    time: state.headTime + 1000,
    txs,
  });
  const hash = blockHash(block.header);
  const votes: Statement[] = [];
  for (const v of voters) {
    votes.push(
      await signStatement(v, {
        swarmId: state.swarmId,
        kind,
        height: block.header.height,
        round: 0,
        blockHash: hash,
      }),
    );
  }
  return { block, hash, qc: { height: block.header.height, round: 0, blockHash: hash, votes } };
}

function setup(n = 4): { signers: SwarmSigner[]; genesis: Genesis; ledger: SwarmLedger } {
  const signers = coordinators(n).toSorted((a, b) => (a.key.id < b.key.id ? -1 : 1));
  const genesis = makeGenesis({ coordinators: signers, admins: [admin] });
  return { signers, genesis, ledger: SwarmLedger.restore(genesis).ledger };
}

describe("swarm genesis", () => {
  it("refuses fewer than two coordinators", () => {
    const g = makeGenesis({ coordinators: coordinators(1), admins: [admin] });
    expect(() => genesisState(g)).toThrow(/at least 2 coordinators/);
    expect(() =>
      genesisState(makeGenesis({ coordinators: coordinators(2), admins: [admin] })),
    ).not.toThrow();
  });

  it("refuses software coordinator keys when device keys are required", () => {
    const g = makeGenesis({
      coordinators: coordinators(4),
      admins: [admin],
      requireDeviceKeys: true,
    });
    expect(() => genesisState(g)).toThrow(/not an Enclaweder key/);
    const devices = [1, 2, 3, 4].map((i) => deviceKeyFor(`dev-${i}`, i));
    const adminDev = deviceKeyFor("admin-dev", 9);
    expect(() =>
      genesisState(
        makeGenesis({ coordinators: devices, admins: [adminDev], requireDeviceKeys: true }),
      ),
    ).not.toThrow();
  });

  it("sizes quorums as n - f", () => {
    expect([2, 3, 4, 5, 7, 10].map(quorumSize)).toEqual([2, 3, 3, 4, 5, 7]);
  });
});

describe("swarm quorum certificates", () => {
  it("commits a block only with a quorum of genuine coordinator finals", async () => {
    const { signers, ledger } = setup();
    const short = await certify(ledger, signers, [], signers.slice(0, 2));
    expect(ledger.commit(short)).toMatchObject({ ok: false, code: "invalid" });

    const outsider = softwareSigner("coord-9");
    const padded = await certify(ledger, signers, [], [...signers.slice(0, 2), outsider]);
    expect(ledger.commit(padded)).toMatchObject({ ok: false, code: "invalid" });

    const dup = await certify(ledger, signers, [], [signers[0], signers[1], signers[1]]);
    expect(ledger.commit(dup)).toMatchObject({ ok: false, code: "invalid" });

    // Tendermint precommits alone are not a commit certificate.
    const precommits = await certify(ledger, signers, [], undefined, "precommit");
    expect(ledger.commit(precommits)).toMatchObject({ ok: false, code: "invalid" });

    const good = await certify(ledger, signers, []);
    expect(ledger.commit(good)).toEqual({ ok: true, applied: true });
    expect(ledger.commit(good)).toEqual({ ok: true, applied: false });
    expect(ledger.height).toBe(1);
  });

  it("rejects a block whose transactions were swapped after certification", async () => {
    const { signers, ledger } = setup();
    const node = softwareSigner("node-a");
    const cb = await certify(ledger, signers, []);
    cb.block.txs = [await joinTx(ledger.state, node, admin)];
    expect(ledger.commit(cb)).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("swarm membership, epochs and leases", () => {
  it("admits a node only with its proof of possession and an admin approval", async () => {
    const { signers, ledger } = setup();
    const node = softwareSigner("node-a");
    const good = (await joinTx(ledger.state, node, admin)) as Extract<
      SwarmTx,
      { type: "node.join" }
    >;
    const noApproval = { ...good, approval: { admin: admin.key.id, sig: good.pop } } as SwarmTx;
    expect(ledger.commit(await certify(ledger, signers, [noApproval]))).toMatchObject({
      ok: false,
    });
    const wrongPop = { ...good, pop: good.approval.sig } as SwarmTx;
    expect(ledger.commit(await certify(ledger, signers, [wrongPop]))).toMatchObject({ ok: false });
    expect(ledger.commit(await certify(ledger, signers, [good]))).toMatchObject({ ok: true });
    expect(ledger.state.nodes.has("node-a")).toBe(true);
    expect(ledger.state.epoch).toBe(1);
    // The same join cannot be replayed.
    expect(ledger.commit(await certify(ledger, signers, [good]))).toMatchObject({ ok: false });
  });

  it("grants leases only against fresh CLEAN heartbeats and clears them on a new epoch", async () => {
    const { signers, ledger } = setup();
    const node = softwareSigner("node-a");
    ledger.commit(await certify(ledger, signers, [await joinTx(ledger.state, node, admin)]));
    const hb0 = await signHeartbeat(node, {
      swarmId: "swarm-test",
      nodeId: "node-a",
      epoch: 1,
      seq: 0,
      time: 1,
      status: "CLEAN",
    });
    const lease = (hb: typeof hb0, epoch = ledger.state.epoch): SwarmTx => ({
      type: "lease.grant",
      nodeId: "node-a",
      epoch,
      durationMs: 30_000,
      heartbeat: hb,
    });
    expect(ledger.commit(await certify(ledger, signers, [lease(hb0)]))).toMatchObject({ ok: true });
    expect(ledger.state.leases.get("node-a")).toMatchObject({ epoch: 1, heartbeatSeq: 0 });

    // A used heartbeat cannot buy a second lease.
    expect(ledger.commit(await certify(ledger, signers, [lease(hb0)]))).toMatchObject({
      ok: false,
    });
    // A forged heartbeat cannot either.
    const forged = { ...hb0, body: { ...hb0.body, seq: 1 } };
    expect(ledger.commit(await certify(ledger, signers, [lease(forged)]))).toMatchObject({
      ok: false,
    });

    // A policy bundle publish starts a new epoch and voids every lease.
    ledger.commit(await certify(ledger, signers, [await bundleTx(ledger.state, BUNDLE_1, admin)]));
    expect(ledger.state.epoch).toBe(2);
    expect(ledger.state.bundleHash).toBe(BUNDLE_1);
    expect(ledger.state.leases.size).toBe(0);
    // ...and the old heartbeat stays spent across the epoch change.
    expect(ledger.commit(await certify(ledger, signers, [lease(hb0)]))).toMatchObject({
      ok: false,
    });
  });

  it("will not replay a bundle approval in a later epoch", async () => {
    const { signers, ledger } = setup();
    const publish = await bundleTx(ledger.state, BUNDLE_1, admin);
    ledger.commit(await certify(ledger, signers, [publish]));
    ledger.commit(
      await certify(ledger, signers, [await joinTx(ledger.state, softwareSigner("n"), admin)]),
    );
    expect(ledger.commit(await certify(ledger, signers, [publish]))).toMatchObject({ ok: false });
  });

  it("evicts a node on its own DIRTY heartbeat, permanently", async () => {
    const { signers, ledger } = setup();
    const node = softwareSigner("node-a");
    const join = await joinTx(ledger.state, node, admin);
    ledger.commit(await certify(ledger, signers, [join]));
    const dirty = await signHeartbeat(node, {
      swarmId: "swarm-test",
      nodeId: "node-a",
      epoch: 1,
      seq: 0,
      time: 1,
      status: "DIRTY",
      reason: "enclaweder removed",
    });
    const evict: SwarmTx = {
      type: "node.evict",
      nodeId: "node-a",
      reason: "dirty",
      evidence: dirty,
    };
    expect(ledger.commit(await certify(ledger, signers, [evict]))).toMatchObject({ ok: true });
    expect(ledger.state.nodes.has("node-a")).toBe(false);
    expect(ledger.state.evicted.has("node-a")).toBe(true);
    expect(ledger.commit(await certify(ledger, signers, [join]))).toMatchObject({ ok: false });
  });
});

describe("swarm coordinator accountability", () => {
  async function doubleSign(signer: SwarmSigner) {
    const base = { swarmId: "swarm-test", kind: "prevote" as const, height: 1, round: 0 };
    return {
      a: await signStatement(signer, { ...base, blockHash: "a".repeat(64) }),
      b: await signStatement(signer, { ...base, blockHash: "b".repeat(64) }),
    };
  }

  it("evicts a double-signing coordinator on its own evidence", async () => {
    const { signers, ledger } = setup();
    const cheat = signers[3];
    const evidence = await doubleSign(cheat);
    const tx: SwarmTx = { type: "coordinator.evict", coordinatorId: cheat.key.id, evidence };
    expect(ledger.commit(await certify(ledger, signers, [tx]))).toMatchObject({ ok: true });
    expect(ledger.state.coordinators.map((c) => c.id)).not.toContain(cheat.key.id);
    expect(ledger.state.halted).toBeNull();
    // Its signatures no longer count toward a quorum.
    const rest = signers.filter((s) => s !== cheat);
    const withCheat = await certify(ledger, rest, [], [rest[0], rest[1], cheat]);
    expect(ledger.commit(withCheat)).toMatchObject({ ok: false });
    expect(ledger.commit(await certify(ledger, rest, []))).toMatchObject({ ok: true });
  });

  it("refuses evidence that is not a genuine double-sign", async () => {
    const { signers, ledger } = setup();
    const ev = await doubleSign(signers[3]);
    const framed: SwarmTx = {
      type: "coordinator.evict",
      coordinatorId: signers[2].key.id,
      evidence: {
        a: { ...ev.a, signer: signers[2].key.id },
        b: { ...ev.b, signer: signers[2].key.id },
      },
    };
    expect(ledger.commit(await certify(ledger, signers, [framed]))).toMatchObject({ ok: false });
  });

  it("halts, failing closed, when fewer than two coordinators would remain", async () => {
    const { signers, ledger } = setup(2);
    const tx: SwarmTx = {
      type: "coordinator.evict",
      coordinatorId: signers[0].key.id,
      evidence: await doubleSign(signers[0]),
    };
    ledger.commit(await certify(ledger, signers, [tx]));
    expect(ledger.state.halted).toMatch(/only 1 coordinator remains/);
    const rest = signers.slice(1);
    expect(ledger.commit(await certify(ledger, rest, [], rest))).toMatchObject({ ok: false });
  });

  it("reports a fork, with the double signers, and halts", async () => {
    const { signers, ledger } = setup();
    const a = await certify(ledger, signers, [], signers.slice(0, 3));
    ledger.commit(a);
    const other = SwarmLedger.restore(ledger.genesis).ledger;
    const b = await certify(
      other,
      signers,
      [await bundleTx(other.state, BUNDLE_1, admin)],
      signers.slice(1, 4),
    );
    const r = ledger.commit(b);
    expect(r).toMatchObject({ ok: false, code: "fork" });
    if (!r.ok && r.code === "fork") {
      expect(r.fork.doubleSigners.toSorted()).toEqual(
        [signers[1].key.id, signers[2].key.id].toSorted(),
      );
    }
    expect(ledger.state.halted).toMatch(/fork at height 1/);
  });

  it("names the culprits of a fork even when they never double-voted in a round", async () => {
    // Amnesia: coordinators 2 and 3 precommit block A in round 0, then ignore
    // their lock and precommit block B in round 1. No two of their Tendermint
    // votes share a slot, so votes alone convict no one. To make both blocks
    // final they must sign a final for each, and that is a double-sign.
    const { signers, genesis, ledger } = setup();
    const [c0, c1, c2, c3] = signers;
    const other = SwarmLedger.restore(genesis).ledger;
    const a = await certify(ledger, signers, [], [c0, c2, c3]);
    const b = await certify(
      other,
      signers,
      [await bundleTx(other.state, BUNDLE_1, admin)],
      [c1, c2, c3],
    );
    expect(ledger.commit(a)).toMatchObject({ ok: true });
    const r = ledger.commit(b);
    expect(r).toMatchObject({ ok: false, code: "fork" });
    if (r.ok || r.code !== "fork") {
      return;
    }
    expect(r.fork.doubleSigners.toSorted()).toEqual([c2.key.id, c3.key.id]);
    // Each proof stands on its own: it is valid eviction evidence on any chain
    // that shares the roster, without trusting whoever reported the fork.
    const fresh = SwarmLedger.restore(genesis).ledger;
    for (const proof of r.fork.proofs) {
      expect(verifyEquivocation(fresh.state, proof)).toBe(true);
    }
    const evict: SwarmTx = {
      type: "coordinator.evict",
      coordinatorId: c2.key.id,
      evidence: r.fork.proofs.find((p) => p.a.signer === c2.key.id)!,
    };
    expect(fresh.commit(await certify(fresh, signers, [evict]))).toMatchObject({ ok: true });
    expect(fresh.state.evicted.has(c2.key.id)).toBe(true);
  });
});

describe("swarm self-correction", () => {
  it("drops a tampered tail on restart and re-syncs it from an honest peer", async () => {
    const { signers, genesis, ledger: honest } = setup();
    for (let i = 0; i < 5; i++) {
      honest.commit(await certify(honest, signers, []));
    }
    const stored = honest.blocksFrom(1).map((b) => JSON.parse(JSON.stringify(b)) as CommittedBlock);
    stored[3].block.header.time += 1; // someone edited block 4 on disk
    const store = memoryLedgerStore(stored);
    const { ledger, truncatedAt } = SwarmLedger.restore(genesis, store);
    expect(truncatedAt).toBe(4);
    expect(ledger.height).toBe(3);
    expect(store.blocks).toHaveLength(3);

    // A lying peer cannot supply the missing part...
    const lie = JSON.parse(JSON.stringify(honest.blocksFrom(4))) as CommittedBlock[];
    lie[0].block.txs = [
      {
        type: "bundle.publish",
        bundleHash: BUNDLE_1,
        approval: { admin: "admin-0", sig: "0".repeat(128) },
      },
    ];
    expect(ledger.sync(lie).applied).toBe(0);
    // ...an honest one can.
    expect(ledger.sync(honest.blocksFrom(4)).applied).toBe(2);
    expect(ledger.state.headHash).toBe(honest.state.headHash);
  });

  it("is a ChainError with a code for a block on the wrong parent", async () => {
    const { signers, ledger } = setup();
    const cb = await certify(ledger, signers, []);
    cb.block.header.prevHash = "f".repeat(64);
    try {
      applyBlock(ledger.state, cb.block);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ChainError);
      expect((err as ChainError).code).toBe("wrong-prev");
    }
  });
});
