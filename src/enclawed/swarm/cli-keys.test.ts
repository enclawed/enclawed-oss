// The command line's device-key comparison: what a genesis or join
// registered against the devices a process can sign with.
import { describe, expect, it } from "vitest";
import { sameDeviceKey } from "./cli.js";

describe("device key comparison", () => {
  const k = (uid: string, members?: { publicKey: string; uid: string }[]) => ({
    id: "x",
    kind: "device" as const,
    publicKey: "ab".repeat(32),
    uid,
    ...(members ? { members } : {}),
  });
  const m = { publicKey: "cd".repeat(32), uid: "02".repeat(12) };

  it("matches the same devices in the same order, whatever the id", () => {
    expect(sameDeviceKey(k("01".repeat(12), [m]), { ...k("01".repeat(12), [m]), id: "y" })).toBe(
      true,
    );
  });

  it("does not match a different device, a missing member or a software key", () => {
    expect(sameDeviceKey(k("01".repeat(12)), k("03".repeat(12)))).toBe(false);
    expect(sameDeviceKey(k("01".repeat(12), [m]), k("01".repeat(12)))).toBe(false);
    expect(
      sameDeviceKey(k("01".repeat(12)), { id: "x", kind: "software", publicKey: "ab".repeat(32) }),
    ).toBe(false);
  });
});
