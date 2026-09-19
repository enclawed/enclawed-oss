import type { BaseProbeResult } from "@enclawed/plugin-sdk/channel-contract";
import { describe, expectTypeOf, it } from "vitest";
import type { SignalProbe } from "./probe.js";

describe("Signal probe contract", () => {
  it("keeps public probe aligned with base contract", () => {
    expectTypeOf<SignalProbe>().toMatchTypeOf<BaseProbeResult>();
  });
});
