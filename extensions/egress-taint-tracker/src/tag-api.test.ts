import { createCapacityLedger, type EgressStageContext } from "@enclawed/egress-core";
import { afterEach, describe, expect, it } from "vitest";
import { buildTaintTrackerStage } from "./stage.js";
import { sharedTaintStore, tagSensitiveValue } from "./taint-store.js";

const ctx = (conversationId?: string): EgressStageContext => ({
  sink: { kind: "channel", id: "sink-1", conversationId },
  ledger: createCapacityLedger({ capacityBits: 1, refillBitsPerSec: 0, now: () => 0 }),
  mode: "enforce",
  now: () => 0,
  audit: () => {},
});

const CANARY = "canary-7f3a91c2-session-secret";

afterEach(() => {
  sharedTaintStore().clear();
});

describe("tagSensitiveValue", () => {
  it("blocks a value tagged for every sink, wherever it goes", async () => {
    tagSensitiveValue(CANARY, { label: "canary" });
    const stage = buildTaintTrackerStage();
    for (const conversation of [undefined, "conv-a", "conv-b"]) {
      const decision = await stage.apply(`here you go: ${CANARY}`, ctx(conversation));
      expect(decision.action).toBe("cancel");
    }
    expect(await stage.apply("nothing to see", ctx("conv-a"))).toEqual({ action: "pass" });
  });

  it("scopes a value to one conversation when asked", async () => {
    tagSensitiveValue(CANARY, { scope: "conv-a" });
    const stage = buildTaintTrackerStage();
    expect((await stage.apply(CANARY, ctx("conv-a"))).action).toBe("cancel");
    expect((await stage.apply(CANARY, ctx("conv-b"))).action).toBe("pass");
  });

  it("catches a lightly reformatted value", async () => {
    tagSensitiveValue(CANARY);
    const stage = buildTaintTrackerStage();
    expect((await stage.apply(CANARY.toUpperCase(), ctx())).action).toBe("cancel");
  });
});
