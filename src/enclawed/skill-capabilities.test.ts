import { describe, expect, test } from "vitest";

import {
  ALL_CAPABILITIES,
  CAPABILITY,
  isCapabilityToken,
  isIrreversible,
  isReversible,
  makeCall,
  projectionKey,
} from "./skill-capabilities.js";

describe("skill-capabilities", () => {
  test("vocabulary matches paper Table 1", () => {
    expect(new Set(ALL_CAPABILITIES)).toEqual(
      new Set([
        "net.egress",
        "fs.read",
        "fs.write.rev",
        "fs.write.irrev",
        "tool.invoke",
        "spawn.proc",
        "publish",
        "pay",
        "mutate.schema",
      ]),
    );
  });

  test("only fs.read and fs.write.rev are reversible", () => {
    const reversible = ALL_CAPABILITIES.filter(isReversible);
    expect(reversible.sort()).toEqual(["fs.read", "fs.write.rev"].sort());
    for (const c of ALL_CAPABILITIES) {
      expect(isIrreversible(c)).toBe(!isReversible(c));
    }
  });

  test("rejects unknown tokens", () => {
    expect(isCapabilityToken("net.egress")).toBe(true);
    expect(isCapabilityToken("invalid")).toBe(false);
    expect(() =>
      makeCall({
        cap: "made.up" as never,
        target: "x",
      }),
    ).toThrow(/unknown capability/);
  });

  test("makeCall freezes args", () => {
    const c = makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#ops", args: { msg: "hi" } });
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c.args)).toBe(true);
  });

  test("projection key includes both cap and target", () => {
    const a = projectionKey({ cap: "fs.write.irrev", target: "/etc/passwd" });
    const b = projectionKey({ cap: "fs.write.irrev", target: "/etc/shadow" });
    expect(a).not.toBe(b);
  });
});
