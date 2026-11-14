import { fileURLToPath } from "node:url";
//#region src/cli/program/register.swarm.ts
/** The executable MPI launchers start for each rank. */
function swarmRankBin() {
	return fileURLToPath(new URL("../enclawed-swarm.mjs", import.meta.url));
}
function registerSwarmCommand(program) {
	program.command("swarm").description("Run the distributed runtime for HPC jobs and agent swarms").helpOption(false).allowUnknownOption(true).allowExcessArguments(true).argument("[args...]", "a swarm command and its flags (run with no arguments for the list)").action(async (args) => {
		process.env.ENCLAWED_SWARM_BIN ??= swarmRankBin();
		const { main } = await import("./cli-BLYOfL6c.js");
		const code = await main(args ?? []);
		if (code >= 0) process.exit(code);
	});
}
//#endregion
export { registerSwarmCommand, swarmRankBin };
