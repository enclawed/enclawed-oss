import { afterEach, describe, expect, it, vi } from "vitest";
import { createActionBatcher, DEFAULT_ACTION_BATCHER_OPTIONS } from "./action-batcher.js";
import {
  createSeededRandomInt,
  deriveScopeSeed,
  EXTRA_ENTROPY_TIMEOUT_MS,
  setRefreshEntropySource,
} from "./refresh-entropy.js";

// The per-scope seed of the batcher's refresh spacing: host CSPRNG bytes,
// with optional extra entropy mixed in (never a replacement), and the scope
// id. Nothing the agent controls is an input.

afterEach(() => setRefreshEntropySource(null));

const fixedHost = (byte: number) => () => new Uint8Array(32).fill(byte);

describe("refresh seed", () => {
  it("changes when extra bytes are present", async () => {
    const without = await deriveScopeSeed("run-1", { hostBytes: fixedHost(1), extra: null });
    const withExtra = await deriveScopeSeed("run-1", {
      hostBytes: fixedHost(1),
      extra: async () => new Uint8Array([9, 9, 9]),
    });
    expect(withExtra.equals(without)).toBe(false);
    // The bytes themselves are mixed in, not only their count.
    const other = await deriveScopeSeed("run-1", {
      hostBytes: fixedHost(1),
      extra: async () => new Uint8Array([9, 9, 8]),
    });
    expect(other.equals(withExtra)).toBe(false);
  });

  it("falls back to the host bytes alone when the extra source is absent, throws, or is slow", async () => {
    const host = fixedHost(2);
    const alone = await deriveScopeSeed("run-1", { hostBytes: host, extra: null });
    const throwing = await deriveScopeSeed("run-1", {
      hostBytes: host,
      extra: async () => {
        throw new Error("busy");
      },
    });
    expect(throwing.equals(alone)).toBe(true);
    const nullAnswer = await deriveScopeSeed("run-1", { hostBytes: host, extra: async () => null });
    expect(nullAnswer.equals(alone)).toBe(true);
    const started = Date.now();
    const slow = await deriveScopeSeed("run-1", {
      hostBytes: host,
      extra: () => new Promise(() => {}),
    });
    expect(slow.equals(alone)).toBe(true);
    expect(Date.now() - started).toBeLessThan(EXTRA_ENTROPY_TIMEOUT_MS + 500);
  });

  it("a constant extra source does not make the seed predictable (the host part dominates)", async () => {
    setRefreshEntropySource(async () => new Uint8Array(64).fill(0x42));
    const seeds = await Promise.all(Array.from({ length: 16 }, () => deriveScopeSeed("run-1")));
    expect(new Set(seeds.map((s) => s.toString("hex"))).size).toBe(16);
  });

  it("separates scopes and gives uniform draws in range", async () => {
    const host = fixedHost(3);
    const a = await deriveScopeSeed("run-a", { hostBytes: host, extra: null });
    const b = await deriveScopeSeed("run-b", { hostBytes: host, extra: null });
    expect(a.equals(b)).toBe(false);
    const draw = createSeededRandomInt(a);
    const counts = new Map<number, number>();
    for (let i = 0; i < 3_000; i++) {
      const v = draw(10, 13);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(13);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect(counts.size).toBe(3);
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(800);
    }
  });

  it("agent input never reaches the seed: the batcher seeds from the scope id alone", async () => {
    const seen: string[] = [];
    const scopeSeed = vi.fn(async (scope: string) => {
      seen.push(scope);
      return new Uint8Array(32);
    });
    const batcher = createActionBatcher(DEFAULT_ACTION_BATCHER_OPTIONS, {
      setTimer: () => null,
      clearTimer: () => {},
      scopeSeed,
    });
    const action = {
      type: "http" as const,
      method: "GET",
      url: "https://r.test/secret-0110?token=agent-chosen#frag",
    };
    const p = batcher.submit({ id: "a1", action, scope: "run-42" });
    batcher.flush("run-42");
    await p;
    batcher.complete("a1", { body: "agent-visible content" }, undefined, async () => null);
    await new Promise((r) => setTimeout(r, 5));
    batcher.dispose();
    expect(seen).toEqual(["run-42"]);
    expect(scopeSeed.mock.calls.every((args) => args.length === 1)).toBe(true);
  });
});
