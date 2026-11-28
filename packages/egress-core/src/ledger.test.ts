import { describe, expect, it } from "vitest";
import { createCapacityLedger, createLedgerStore } from "./ledger.js";

describe("capacity ledger", () => {
  it("consumes from the bucket until exhausted", () => {
    const ledger = createCapacityLedger({
      capacityBits: 100,
      refillBitsPerSec: 0,
      now: () => 0,
    });
    expect(ledger.tryConsume(60)).toBe(true);
    expect(ledger.tryConsume(60)).toBe(false); // only 40 left
    expect(ledger.tryConsume(40)).toBe(true);
    expect(ledger.available()).toBe(0);
  });

  it("refills at the configured rate over time", () => {
    let clock = 0;
    const ledger = createCapacityLedger({
      capacityBits: 100,
      refillBitsPerSec: 10,
      now: () => clock,
    });
    expect(ledger.tryConsume(100)).toBe(true);
    expect(ledger.available()).toBe(0);
    clock = 5000; // 5s × 10 bits/s = 50 bits
    expect(ledger.available()).toBe(50);
    expect(ledger.tryConsume(50)).toBe(true);
  });

  it("never refills beyond capacity", () => {
    let clock = 0;
    const ledger = createCapacityLedger({
      capacityBits: 100,
      refillBitsPerSec: 1000,
      now: () => clock,
    });
    clock = 1_000_000;
    expect(ledger.available()).toBe(100);
  });

  it("observe accumulates without consuming", () => {
    const ledger = createCapacityLedger({ capacityBits: 100, refillBitsPerSec: 0, now: () => 0 });
    ledger.observe(30);
    ledger.observe(20);
    expect(ledger.observedTotal()).toBe(50);
    expect(ledger.available()).toBe(100);
  });

  it("ledger store is bounded against unbounded sink ids", () => {
    const store = createLedgerStore({
      capacityBits: 10,
      refillBitsPerSec: 0,
      now: () => 0,
      maxSinks: 4,
    });
    for (let i = 0; i < 10; i++) {
      store.get(`sink-${i}`);
    }
    expect(store.size()).toBeLessThanOrEqual(4);
  });

  it("flooding the store with new sinks never refunds a drained sink", () => {
    const store = createLedgerStore({
      capacityBits: 10,
      refillBitsPerSec: 0,
      now: () => 0,
      maxSinks: 4,
    });
    expect(store.get("victim").tryConsume(10)).toBe(true);
    for (let i = 0; i < 100; i++) {
      store.get(`junk-${i}`).tryConsume(1);
    }
    expect(store.get("victim").available()).toBe(0);
    expect(store.size()).toBeLessThanOrEqual(4);
  });

  it("overflow sinks share one budget", () => {
    const store = createLedgerStore({
      capacityBits: 10,
      refillBitsPerSec: 0,
      now: () => 0,
      maxSinks: 2,
    });
    store.get("a").tryConsume(5);
    store.get("b").tryConsume(5);
    expect(store.get("c").tryConsume(6)).toBe(true);
    expect(store.get("d").tryConsume(6)).toBe(false);
  });

  it("evicts only ledgers that have fully refilled", () => {
    let t = 0;
    const store = createLedgerStore({
      capacityBits: 10,
      refillBitsPerSec: 10,
      now: () => t,
      maxSinks: 2,
    });
    store.get("a").tryConsume(10);
    store.get("b").tryConsume(1);
    t = 1000;
    const fresh = store.get("c");
    expect(fresh.available()).toBe(10);
    expect(store.size()).toBe(2);
  });
});
