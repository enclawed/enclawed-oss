// `enclawed swarm` — the distributed runtime for parallel HPC jobs and agent
// swarms: create a swarm, run its coordinators, admit and launch MPI jobs with
// every rank supervised, share this machine's Enclaweders, and read the chain.
//
// Every argument after `swarm` goes to the swarm's own command line unchanged,
// a launched program's arguments after `--` included. `swarm launch` starts
// each rank through ENCLAWED_SWARM_BIN; unless the operator set it, that is the
// package's own `enclawed-swarm` executable.
import { fileURLToPath } from "node:url";
import type { Command } from "commander";

/** The executable MPI launchers start for each rank. */
export function swarmRankBin(): string {
  return fileURLToPath(new URL("../enclawed-swarm.mjs", import.meta.url));
}

export function registerSwarmCommand(program: Command) {
  program
    .command("swarm")
    .description("Run the distributed runtime for HPC jobs and agent swarms")
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument("[args...]", "a swarm command and its flags (run with no arguments for the list)")
    .action(async (args: string[] | undefined) => {
      process.env.ENCLAWED_SWARM_BIN ??= swarmRankBin();
      const { main } = await import("../../enclawed/swarm/cli.js");
      const code = await main(args ?? []);
      // Coordinators, hosts and the device owner keep running (-1).
      if (code >= 0) {
        process.exit(code);
      }
    });
}
