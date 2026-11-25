// Code outside the core build (the sealed accreditors' orchestrators) reaches the ONE hardware
// root through a process-wide seam, never a copy of its own.
import { describe, expect, it } from "vitest";
import {
  assertHardwareClean,
  bootHardwareRoot,
  HARDWARE_ROOT_SEAM,
  hardwareRootHealth,
  type HardwareRootSeam,
} from "./index.js";

describe("hardware root host seam", () => {
  it("is installed by loading core, frozen, and carries core's functions", () => {
    const seam = (globalThis as Record<symbol, unknown>)[HARDWARE_ROOT_SEAM] as HardwareRootSeam;
    expect(seam.version).toBe(1);
    // The first loaded instance of index.ts installs it (a shared-module test run may have loaded
    // another instance of this same file first), so compare by name, not identity.
    expect(seam.bootHardwareRoot.name).toBe(bootHardwareRoot.name);
    expect(seam.assertHardwareClean.name).toBe(assertHardwareClean.name);
    expect(seam.hardwareRootHealth.name).toBe(hardwareRootHealth.name);
    expect(typeof seam.hardwareRootHealth().status).toBe("string");
    expect(Object.isFrozen(seam)).toBe(true);
    expect(() => {
      (globalThis as Record<symbol, unknown>)[HARDWARE_ROOT_SEAM] = {};
    }).toThrow();
  });
});
