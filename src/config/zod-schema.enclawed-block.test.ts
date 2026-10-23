import { describe, expect, it } from "vitest";
import { EnclawedSchema } from "./zod-schema.js";

describe("enclawed block in the config", () => {
  it("accepts enclawed.hpc, which the HPC launch gate reads at boot", () => {
    const r = EnclawedSchema.safeParse({
      enclawed: { hpc: { enforce: true, schedulers: ["mpi"], maxRanks: 1 } },
    });
    expect(r.success).toBe(true);
  });

  it("still refuses unknown keys under enclawed", () => {
    expect(EnclawedSchema.safeParse({ enclawed: { hpcc: {} } }).success).toBe(false);
  });
});
