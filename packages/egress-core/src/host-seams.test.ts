import { afterEach, describe, expect, it } from "vitest";
import {
  emitOutbound,
  hasOutboundEmitter,
  resetEgressHostSeams,
  setOutboundEmitter,
} from "./host-seams.js";

describe("egress host seams", () => {
  afterEach(() => resetEgressHostSeams());

  it("reports no outbound emitter until one is installed", async () => {
    expect(hasOutboundEmitter()).toBe(false);
    expect(await emitOutbound({ to: "u1", content: "cover" })).toBe(false);
  });

  it("routes cover traffic through an installed emitter", async () => {
    const sent: string[] = [];
    setOutboundEmitter(async (msg) => {
      sent.push(msg.content);
    });
    expect(hasOutboundEmitter()).toBe(true);
    expect(await emitOutbound({ to: "u1", content: "cover" })).toBe(true);
    expect(sent).toEqual(["cover"]);
  });
});
