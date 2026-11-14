import { n as VERSION } from "./version-Zw5FG34x.js";
import { n as collectUniqueCommandDescriptors, t as addCommandDescriptorsToProgram } from "./command-descriptor-utils-TRzMuRVs.js";
import { t as getCoreCliCommandDescriptors } from "./core-command-descriptors-CgulG0TG.js";
import { n as getSubCliEntries } from "./subcli-descriptors-C6F5H_aA.js";
import { t as configureProgramHelp } from "./help-BHeSoUwl.js";
import { t as getPluginCliCommandDescriptors } from "./cli-D68T43Tu.js";
import { Command } from "commander";
//#region src/cli/program/root-help.ts
async function buildRootHelpProgram(renderOptions) {
	const program = new Command();
	configureProgramHelp(program, {
		programVersion: VERSION,
		channelOptions: [],
		messageChannelOptions: "",
		agentChannelOptions: ""
	});
	addCommandDescriptorsToProgram(program, collectUniqueCommandDescriptors([
		getCoreCliCommandDescriptors(),
		getSubCliEntries(),
		await getPluginCliCommandDescriptors(renderOptions?.config, renderOptions?.env, { pluginSdkResolution: renderOptions?.pluginSdkResolution })
	]));
	return program;
}
async function renderRootHelpText(renderOptions) {
	const program = await buildRootHelpProgram(renderOptions);
	let output = "";
	const originalWrite = process.stdout.write.bind(process.stdout);
	const captureWrite = ((chunk) => {
		output += String(chunk);
		return true;
	});
	process.stdout.write = captureWrite;
	try {
		program.outputHelp();
	} finally {
		process.stdout.write = originalWrite;
	}
	return output;
}
async function outputRootHelp(renderOptions) {
	process.stdout.write(await renderRootHelpText(renderOptions));
}
//#endregion
export { outputRootHelp };
