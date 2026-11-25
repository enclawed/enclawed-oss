import { M as getVerboseFlag, P as hasHelpOrVersion, w as setVerbose } from "./logger-K1GaCajM.js";
import { n as defaultRuntime } from "./runtime-1ULlIz69.js";
import { n as resolveCliName } from "./cli-name-5jGzqIc2.js";
import { n as VERSION } from "./version-Dkjgwomq.js";
import "./globals-BfxXPQT_.js";
import { n as resolveCliChannelOptions } from "./channel-options-psrhzD_w.js";
import { n as setProgramContext } from "./program-context-_97B6qpD.js";
import { t as isCommandJsonOutputMode } from "./json-mode-Cr2XtIBy.js";
import { t as forceFreePort } from "./ports-BBhDOLLz.js";
import { n as resolvePluginInstallPreactionRequest, t as resolvePluginInstallInvalidConfigPolicy } from "./plugin-install-config-policy-DzVYZhGc.js";
import { t as registerProgramCommands } from "./command-registry-BtnJdSus.js";
import { t as configureProgramHelp } from "./help-jkqdDueP.js";
import { a as shouldBypassConfigGuardForCommandPath, i as resolveCliExecutionStartupContext, n as applyCliExecutionStartupPresentation, r as ensureCliExecutionBootstrap, t as enforceSecondFactorOrExit } from "./second-factor-gate-4EWRIsZ8.js";
import process$1 from "node:process";
import { Command } from "commander";
//#region src/cli/program/context.ts
function createProgramContext() {
	let cachedChannelOptions;
	const getChannelOptions = () => {
		if (cachedChannelOptions === void 0) cachedChannelOptions = resolveCliChannelOptions();
		return cachedChannelOptions;
	};
	return {
		programVersion: VERSION,
		get channelOptions() {
			return getChannelOptions();
		},
		get messageChannelOptions() {
			return getChannelOptions().join("|");
		},
		get agentChannelOptions() {
			return ["last", ...getChannelOptions()].join("|");
		}
	};
}
//#endregion
//#region src/cli/program/preaction.ts
function setProcessTitleForCommand(actionCommand) {
	let current = actionCommand;
	while (current.parent && current.parent.parent) current = current.parent;
	const name = current.name();
	const cliName = resolveCliName();
	if (!name || name === cliName) return;
	process.title = `${cliName}-${name}`;
}
function shouldAllowInvalidConfigForAction(actionCommand, commandPath) {
	return resolvePluginInstallInvalidConfigPolicy(resolvePluginInstallPreactionRequest({
		actionCommand,
		commandPath,
		argv: process.argv
	})) === "allow-bundled-recovery";
}
function getRootCommand(command) {
	let current = command;
	while (current.parent) current = current.parent;
	return current;
}
function getCliLogLevel(actionCommand) {
	const root = getRootCommand(actionCommand);
	if (typeof root.getOptionValueSource !== "function") return;
	if (root.getOptionValueSource("logLevel") !== "cli") return;
	const logLevel = root.opts().logLevel;
	return typeof logLevel === "string" ? logLevel : void 0;
}
/** The full command path of the command about to run, from commander itself (any depth). */
function actionCommandPath(actionCommand) {
	const names = [];
	let current = actionCommand;
	while (current?.parent) {
		names.unshift(current.name());
		current = current.parent;
	}
	return names;
}
function registerPreActionHooks(program, programVersion) {
	program.hook("preAction", async (_thisCommand, actionCommand) => {
		setProcessTitleForCommand(actionCommand);
		const argv = process.argv;
		await enforceSecondFactorOrExit(actionCommandPath(actionCommand), argv);
		if (hasHelpOrVersion(argv)) return;
		const { commandPath, startupPolicy } = resolveCliExecutionStartupContext({
			argv,
			jsonOutputMode: isCommandJsonOutputMode(actionCommand, argv),
			env: process.env
		});
		await applyCliExecutionStartupPresentation({
			startupPolicy,
			version: programVersion
		});
		const verbose = getVerboseFlag(argv, { includeDebug: true });
		setVerbose(verbose);
		const cliLogLevel = getCliLogLevel(actionCommand);
		if (cliLogLevel) process.env.ENCLAWED_LOG_LEVEL = cliLogLevel;
		if (!verbose) process.env.NODE_NO_WARNINGS ??= "1";
		if (shouldBypassConfigGuardForCommandPath(commandPath)) return;
		await ensureCliExecutionBootstrap({
			runtime: defaultRuntime,
			commandPath,
			startupPolicy,
			allowInvalid: shouldAllowInvalidConfigForAction(actionCommand, commandPath)
		});
	});
}
//#endregion
//#region src/cli/program/build-program.ts
function buildProgram() {
	const program = new Command();
	program.enablePositionalOptions();
	program.exitOverride((err) => {
		process$1.exitCode = typeof err.exitCode === "number" ? err.exitCode : 1;
		throw err;
	});
	const ctx = createProgramContext();
	const argv = process$1.argv;
	setProgramContext(program, ctx);
	configureProgramHelp(program, ctx);
	registerPreActionHooks(program, ctx.programVersion);
	registerProgramCommands(program, ctx, argv);
	return program;
}
//#endregion
export { buildProgram, forceFreePort };
