import { afterEach, describe, expect, it, vi } from "vitest";
import { createActionBatcher, DEFAULT_ACTION_BATCHER_OPTIONS } from "./action-batcher.js";
import type { EgressAction } from "./action.js";
import { monotonicNow } from "./clock.js";
import { createCapacityLedger } from "./ledger.js";

// The host's wall clock steps (NTP, VM/WSL resyncs step it by seconds). Every
// egress timing default runs on the monotonic clock, so a step moves nothing.
// Both clocks are driven here: process.hrtime.bigint (monotonic) advances only
// when the test says so, and Date.now jumps by +/-16.6 s between windows.

const get = (url: string): EgressAction => ({ type: "http", method: "GET", url });
const STEP_MS = 16_600;

function clocks(startMonoMs: number, startWallMs: number) {
  let mono = startMonoMs;
  let wall = startWallMs;
  vi.spyOn(process.hrtime, "bigint").mockImplementation(() => BigInt(Math.round(mono * 1e6)));
  vi.spyOn(Date, "now").mockImplementation(() => wall);
  return {
    advance(ms: number) {
      mono += ms;
      wall += ms;
    },
    stepWall(ms: number) {
      wall += ms;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("monotonic egress timing", () => {
  it("monotonicNow follows process.hrtime, not Date.now", () => {
    const c = clocks(5_000.5, 1_700_000_000_000);
    expect(monotonicNow()).toBe(5_000.5);
    c.stepWall(-STEP_MS);
    expect(monotonicNow()).toBe(5_000.5);
    c.advance(10);
    expect(monotonicNow()).toBe(5_010.5);
  });

  it("the padding grid does not move when the wall clock steps", () => {
    const windowMs = DEFAULT_ACTION_BATCHER_OPTIONS.windowMs;
    // Monotonic 1_000_100 ms is 100 ms into a grid cell; the wall clock is
    // 210 ms into its own cell, so a wall-clock grid would close elsewhere.
    const c = clocks(1_000_100, 1_700_000_000_210);
    const delays: number[] = [];
    const timers: Array<() => void> = [];
    const batcher = createActionBatcher(
      {
        ...DEFAULT_ACTION_BATCHER_OPTIONS,
        padding: { enabled: true, allowedSet: [get("https://a.example/x")] },
      },
      {
        // Record when each window was scheduled to close; never fire it.
        setTimer: (fn, ms) => {
          delays.push(ms);
          timers.push(fn);
          return null;
        },
        clearTimer: () => {},
        paddingClient: () => null,
        spillDir: null,
      },
    );
    try {
      const closesAt: number[] = [];
      const open = (scope: string) => {
        const t = monotonicNow();
        void batcher.submit({ id: scope, scope, action: get("https://a.example/x") });
        closesAt.push(t + (delays.at(-1) ?? Number.NaN));
      };
      open("s1");
      c.stepWall(STEP_MS);
      c.advance(37);
      open("s2");
      c.stepWall(-2 * STEP_MS);
      c.advance(401);
      open("s3");
      c.stepWall(STEP_MS + 123);
      c.advance(1);
      open("s4");
      expect(delays).toHaveLength(4);
      // Every window closes on the monotonic grid, whatever the wall clock did.
      for (const at of closesAt) {
        expect(at % windowMs).toBe(0);
      }
      expect(closesAt).toEqual([1_000_250, 1_000_250, 1_000_750, 1_000_750]);
    } finally {
      batcher.dispose();
    }
  });

  it("a forward wall-clock step grants the capacity ledger no refill", () => {
    const c = clocks(50_000, 1_700_000_000_000);
    const ledger = createCapacityLedger({ capacityBits: 100, refillBitsPerSec: 10 });
    expect(ledger.tryConsume(100)).toBe(true);
    c.stepWall(STEP_MS); // would be 166 bits of refill on the wall clock
    expect(ledger.available()).toBe(0);
    c.advance(1_000);
    expect(ledger.available()).toBe(10);
  });
});
