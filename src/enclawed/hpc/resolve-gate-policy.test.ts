import { describe, expect, it } from "vitest";
import { checkHpcCommand, NodeHourLedger } from "./gate.js";
import { resolveHpcGatePolicy } from "./index.js";

// Settings audit #2: deleting `enclawed.hpc` from the user-writable config used
// to turn the HPC launch gate off in every flavor.

function decide(command: string, policy: NonNullable<ReturnType<typeof resolveHpcGatePolicy>>) {
  return checkHpcCommand(command, policy, { cwd: "/tmp", env: {} }, new NodeHourLedger(null));
}

describe("resolveHpcGatePolicy", () => {
  it("attack: an absent block in the enclaved flavor installs the refuse-all gate", () => {
    for (const block of [undefined, null]) {
      const policy = resolveHpcGatePolicy(block, "enclaved");
      expect(policy).not.toBeNull();
      expect(policy!.enforce).toBe(true);
      expect(policy!.schedulers.size).toBe(0);
      const decision = decide("sbatch -N 2 job.sh", policy!);
      expect(decision.touchedHpc).toBe(true);
      expect(decision.allowed).toBe(false);
      expect(decide("srun -n 4 ./app", policy!).allowed).toBe(false);
    }
  });

  it("attack: an invalid block still throws (caller fails closed)", () => {
    expect(() => resolveHpcGatePolicy("off", "enclaved")).toThrow();
    expect(() => resolveHpcGatePolicy({ enforce: "no" }, "open")).toThrow();
  });

  it("FP: the refuse-all gate leaves non-scheduler commands alone", () => {
    const policy = resolveHpcGatePolicy(undefined, "enclaved")!;
    expect(decide("ls -la", policy).touchedHpc).toBe(false);
    expect(decide("git status", policy).touchedHpc).toBe(false);
  });

  it("FP: the open flavor keeps an absent block as gate off", () => {
    expect(resolveHpcGatePolicy(undefined, "open")).toBeNull();
  });

  it("FP: a present block is used as written in both flavors", () => {
    const block = { enforce: true, schedulers: ["slurm"], maxNodes: 4 };
    expect(resolveHpcGatePolicy(block, "enclaved")!.schedulers.has("slurm")).toBe(true);
    expect(resolveHpcGatePolicy(block, "open")!.maxNodes).toBe(4);
  });
});
