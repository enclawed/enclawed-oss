import { t as resolveCliArgvInvocation } from "./argv-invocation-CBWH8ntt.js";
import { i as registerCommandGroups, r as registerCommandGroupByName } from "./register-command-groups-DeDm-O0A.js";
import { r as shouldRegisterPrimarySubcommandOnly, t as shouldEagerRegisterSubcommands } from "./command-registration-policy-D5mxphu4.js";
import { i as buildCommandGroupEntries, n as registerSubCliByName$1, o as defineImportedProgramCommandGroupSpecs, r as registerSubCliCommands$1 } from "./register.subclis-core-C9BDO4ol.js";
import { n as getSubCliEntries } from "./subcli-descriptors-eHA3Lc1T.js";
//#region src/cli/program/register.subclis.ts
const entrySpecs = [...defineImportedProgramCommandGroupSpecs([{
	commandNames: ["completion"],
	loadModule: () => import("./completion-cli-CbElPET-.js"),
	exportName: "registerCompletionCli"
}])];
function resolveSubCliCommandGroups() {
	return buildCommandGroupEntries(getSubCliEntries(), entrySpecs, (register) => register);
}
async function registerSubCliByName(program, name) {
	if (await registerSubCliByName$1(program, name)) return true;
	return registerCommandGroupByName(program, resolveSubCliCommandGroups(), name);
}
function registerSubCliCommands(program, argv = process.argv) {
	registerSubCliCommands$1(program, argv);
	const { primary } = resolveCliArgvInvocation(argv);
	registerCommandGroups(program, resolveSubCliCommandGroups(), {
		eager: shouldEagerRegisterSubcommands(),
		primary,
		registerPrimaryOnly: Boolean(primary && shouldRegisterPrimarySubcommandOnly(argv))
	});
}
//#endregion
export { registerSubCliCommands as n, registerSubCliByName as t };
