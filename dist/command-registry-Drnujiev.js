import { r as registerCoreCliCommands } from "./command-registry-core-DYRqgL5Z.js";
import { n as registerSubCliCommands } from "./register.subclis-3_45Lf2v.js";
//#region src/cli/program/command-registry.ts
function registerProgramCommands(program, ctx, argv = process.argv) {
	registerCoreCliCommands(program, ctx, argv);
	registerSubCliCommands(program, argv);
}
//#endregion
export { registerProgramCommands as t };
