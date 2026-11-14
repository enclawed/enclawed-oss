// Epochs form a chain: each epoch's hash covers the one before and
// everything the epoch starts with, and every block's certificate signs the
// epoch it runs in. A history rewritten anywhere breaks every block after it.

import { describe, expect, it } from "vitest";
import {
  applyBlock,
  applyTx,
  approvalDigest,
  blockHash,
  ChainError,
  cloneState,
  epochHashOf,
  genesisState,
  makeBlock,
} from "./chain.js";
import { softwareSigner } from "./signer.js";
import { BUNDLE_1, bundleTx, coordinators, joinTx, makeGenesis } from "./swarm-test-utils.js";
import type { SwarmState, SwarmTx } from "./types.js";

const admin = softwareSigner("admin-0");
const genesis = makeGenesis({ coordinators: coordinators(4), admins: [admin] });

function block(s: SwarmState, txs: SwarmTx[] = []): SwarmState {
  return applyBlock(
    s,
    makeBlock(s, {
      proposer: s.coordinators[(s.height + 1) % s.coordinators.length].id,
      round: 0,
      time: s.headTime + 1000,
      txs,
    }),
  );
}

describe("the epoch chain", () => {
  it("starts from the genesis and moves with every epoch", async () => {
    let s = genesisState(genesis);
    expect(s.epochHash).toBe(epochHashOf({ ...s, epochHash: "" }, s.genesisHash));
    const seen = [s.epochHash];
    s = block(s, [await joinTx(s, softwareSigner("n1"), admin)]);
    s = block(s, [await bundleTx(s, BUNDLE_1, admin)]);
    seen.push(s.epochHash);
    expect(new Set(seen).size).toBe(2);
    expect(s.epoch).toBe(2);
  });

  it("gives the same epoch number a different hash in a different history", async () => {
    const base = genesisState(genesis);
    const a = block(base, [await joinTx(base, softwareSigner("n1"), admin)]);
    const b = block(base, [await joinTx(base, softwareSigner("n2"), admin)]);
    expect(a.epoch).toBe(b.epoch);
    expect(a.epochHash).not.toBe(b.epochHash);
  });

  it("refuses a block that claims another history of its epoch", async () => {
    const s = block(genesisState(genesis), [
      await joinTx(genesisState(genesis), softwareSigner("n1"), admin),
    ]);
    const b = makeBlock(s, {
      proposer: s.coordinators[(s.height + 1) % 4].id,
      round: 0,
      time: s.headTime + 1000,
      txs: [],
    });
    const forged = { ...b, header: { ...b.header, epochHash: "ab".repeat(32) } };
    expect(blockHash(forged.header)).not.toBe(blockHash(b.header));
    expect(() => applyBlock(s, forged)).toThrow(ChainError);
    expect(() => applyBlock(s, forged)).toThrow(/another history/);
  });

  it("refuses a policy approval made in another history of the same epoch", async () => {
    const base = genesisState(genesis);
    const a = block(base, [await joinTx(base, softwareSigner("n1"), admin)]);
    const b = block(base, [await joinTx(base, softwareSigner("n2"), admin)]);
    // Approved in history a, presented in history b at the same epoch number.
    const tx = await bundleTx(a, BUNDLE_1, admin);
    expect(() => applyTx(cloneState(a), tx)).not.toThrow();
    expect(() => applyTx(cloneState(b), tx)).toThrow(/approval/);
  });

  it("will not sign a policy approval without the epoch's hash", () => {
    const tx = {
      type: "bundle.publish" as const,
      bundleHash: BUNDLE_1,
      approval: { admin: "admin-0", sig: "" },
    };
    expect(() => approvalDigest({ swarmId: "x", epoch: 0, rosterVersion: 0 }, tx)).toThrow(
      /epoch's hash/,
    );
  });
});
