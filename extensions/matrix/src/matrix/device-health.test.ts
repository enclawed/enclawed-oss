import { describe, expect, it } from "vitest";
import { isEnclawedManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects Enclawed-managed device names", () => {
    expect(isEnclawedManagedMatrixDevice("Enclawed Gateway")).toBe(true);
    expect(isEnclawedManagedMatrixDevice("Enclawed Debug")).toBe(true);
    expect(isEnclawedManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isEnclawedManagedMatrixDevice(null)).toBe(false);
  });

  it("summarizes stale Enclawed-managed devices separately from the current device", () => {
    const summary = summarizeMatrixDeviceHealth([
      {
        deviceId: "du314Zpw3A",
        displayName: "Enclawed Gateway",
        current: true,
      },
      {
        deviceId: "BritdXC6iL",
        displayName: "Enclawed Gateway",
        current: false,
      },
      {
        deviceId: "G6NJU9cTgs",
        displayName: "Enclawed Debug",
        current: false,
      },
      {
        deviceId: "phone123",
        displayName: "Element iPhone",
        current: false,
      },
    ]);

    expect(summary.currentDeviceId).toBe("du314Zpw3A");
    expect(summary.currentEnclawedDevices).toEqual([
      expect.objectContaining({ deviceId: "du314Zpw3A" }),
    ]);
    expect(summary.staleEnclawedDevices).toEqual([
      expect.objectContaining({ deviceId: "BritdXC6iL" }),
      expect.objectContaining({ deviceId: "G6NJU9cTgs" }),
    ]);
  });
});
