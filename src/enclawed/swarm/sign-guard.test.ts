import { describe, expect, it } from "vitest";
import { memorySignGuardStore, SignGuard } from "./sign-guard.js";

const lock = { lockedRound: -1, lockedHash: null, validRound: -1, validBlock: null };
const A = "a".repeat(64);
const B = "b".repeat(64);

describe("swarm sign guard", () => {
  it("allows a final only once per height, and nothing at that height after it", () => {
    const store = memorySignGuardStore();
    const guard = new SignGuard(store);
    expect(guard.admit({ height: 5, round: 3, kind: "precommit", blockHash: A }, lock)).toBe(true);
    expect(guard.admit({ height: 5, round: 0, kind: "final", blockHash: A }, lock)).toBe(true);
    // A restart may re-send the same final.
    expect(guard.admit({ height: 5, round: 0, kind: "final", blockHash: A }, lock)).toBe(true);
    // Never a second final, nor any vote in a later round of the same height.
    expect(guard.admit({ height: 5, round: 0, kind: "final", blockHash: B }, lock)).toBe(false);
    expect(guard.admit({ height: 5, round: 9, kind: "prevote", blockHash: B }, lock)).toBe(false);
    // The next height starts fresh.
    expect(guard.admit({ height: 6, round: 0, kind: "prevote", blockHash: B }, lock)).toBe(true);
  });

  it("survives a restart through its store", () => {
    const store = memorySignGuardStore();
    new SignGuard(store).admit({ height: 2, round: 0, kind: "final", blockHash: A }, lock);
    const restarted = new SignGuard(store);
    expect(restarted.admit({ height: 2, round: 0, kind: "final", blockHash: B }, lock)).toBe(false);
  });
});
