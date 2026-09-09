import type { BaseProbeResult } from "@enclawed/plugin-sdk/channel-contract";
import { describe, expectTypeOf, it } from "vitest";
import type { IMessageProbe } from "./probe.js";

describe("iMessage probe contract", () => {
  it("keeps public probe aligned with base contract", () => {
    expectTypeOf<IMessageProbe>().toMatchTypeOf<BaseProbeResult>();
  });
});
