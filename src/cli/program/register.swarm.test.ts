import { existsSync } from "node:fs";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSwarmCommand, swarmRankBin } from "./register.swarm.js";

const mocks = vi.hoisted(() => ({ main: vi.fn(async () => 0) }));
vi.mock("../../enclawed/swarm/cli.js", () => ({ main: mocks.main }));

describe("enclawed swarm", () => {
  let exit: ReturnType<typeof vi.spyOn>;
  const saved = process.env.ENCLAWED_SWARM_BIN;

  async function run(args: string[]) {
    const program = new Command();
    registerSwarmCommand(program);
    await program.parseAsync(args, { from: "user" });
  }

  beforeEach(() => {
    mocks.main.mockReset();
    mocks.main.mockResolvedValue(0);
    exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    delete process.env.ENCLAWED_SWARM_BIN;
  });
  afterEach(() => {
    exit.mockRestore();
    if (saved === undefined) {
      delete process.env.ENCLAWED_SWARM_BIN;
    } else {
      process.env.ENCLAWED_SWARM_BIN = saved;
    }
  });

  it("passes every argument through, a launched program's after -- included", async () => {
    await run([
      "swarm",
      "launch",
      "--dir",
      "/s",
      "--job",
      "J",
      "--",
      "mpiexec",
      "-n",
      "8",
      "lmp",
      "--help",
    ]);
    expect(mocks.main).toHaveBeenCalledWith([
      "launch",
      "--dir",
      "/s",
      "--job",
      "J",
      "--",
      "mpiexec",
      "-n",
      "8",
      "lmp",
      "--help",
    ]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("starts each rank through the package's own executable unless the operator chose one", async () => {
    await run(["swarm", "status", "--dir", "/s"]);
    expect(process.env.ENCLAWED_SWARM_BIN).toBe(swarmRankBin());
    expect(swarmRankBin()).toMatch(/enclawed-swarm\.mjs$/);
    process.env.ENCLAWED_SWARM_BIN = "/opt/site/swarm";
    await run(["swarm", "status", "--dir", "/s"]);
    expect(process.env.ENCLAWED_SWARM_BIN).toBe("/opt/site/swarm");
  });

  it("keeps a coordinator running, and exits with the command's code otherwise", async () => {
    mocks.main.mockResolvedValueOnce(-1);
    await run(["swarm", "coordinator", "--dir", "/s", "--index", "0"]);
    expect(exit).not.toHaveBeenCalled();
    mocks.main.mockResolvedValueOnce(2);
    await run(["swarm"]);
    expect(mocks.main).toHaveBeenLastCalledWith([]);
    expect(exit).toHaveBeenCalledWith(2);
  });

  it("ships the rank executable beside the package entry", () => {
    expect(existsSync(new URL("../../../enclawed-swarm.mjs", import.meta.url))).toBe(true);
  });
});
