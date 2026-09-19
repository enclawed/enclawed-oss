import { C as buildParseArgv } from "./logger-wuQoU2z2.js";
import { r as resolveActionArgs } from "./helpers-CZiCYYWJ.js";
//#region src/cli/program/command-tree.ts
function removeCommand(program, command) {
	const commands = program.commands;
	const index = commands.indexOf(command);
	if (index < 0) return false;
	commands.splice(index, 1);
	return true;
}
function removeCommandByName(program, name) {
	const existing = program.commands.find((command) => command.name() === name);
	if (!existing) return false;
	return removeCommand(program, existing);
}
//#endregion
//#region src/cli/program/action-reparse.ts
/**
* Rebuild the flags a command actually received on the command line.
*
* Only options whose value came from the CLI are re-emitted; defaults are
* skipped, so a `--json` that defaulted to false does not reappear as if the
* user had typed it.
*/
function reEmitCliOptions(cmd) {
	if (!cmd) return [];
	const withOptions = cmd;
	const values = cmd.opts();
	const out = [];
	for (const option of withOptions.options ?? []) {
		const long = option.long;
		const attr = option.attributeName?.();
		if (!long || !attr || withOptions.getOptionValueSource?.(attr) !== "cli") continue;
		const value = values[attr];
		if (value === true) out.push(long);
		else if (typeof value === "string" || typeof value === "number") out.push(long, String(value));
		else if (Array.isArray(value)) for (const entry of value) out.push(long, String(entry));
	}
	return out;
}
async function reparseProgramFromActionArgs(program, actionArgs, placeholderArgs = []) {
	const actionCommand = actionArgs.at(-1);
	const root = actionCommand?.parent ?? program;
	const rawArgs = root.rawArgs;
	const actionArgsList = resolveActionArgs(actionCommand);
	const parentArgs = reEmitCliOptions(root);
	const fallbackArgv = actionCommand?.name() ? [
		...parentArgs,
		actionCommand.name(),
		...placeholderArgs,
		...actionArgsList
	] : [
		...parentArgs,
		...placeholderArgs,
		...actionArgsList
	];
	const parseArgv = buildParseArgv({
		programName: program.name(),
		rawArgs,
		fallbackArgv
	});
	await program.parseAsync(parseArgv);
}
//#endregion
//#region src/cli/program/register-lazy-command.ts
function registerLazyCommand({ program, name, description, removeNames, options, register }) {
	const placeholder = program.command(name).description(description);
	for (const option of options ?? []) placeholder.option(option.flags, option.description ?? "");
	placeholder.allowUnknownOption(true);
	placeholder.allowExcessArguments(true);
	placeholder.action(async (...actionArgs) => {
		const parsed = placeholder.opts();
		const placeholderArgs = [];
		for (const option of options ?? []) {
			const long = /--([\w-]+)/.exec(option.flags)?.[1];
			if (!long) continue;
			const value = parsed[long.replaceAll(/-([a-z])/g, (_, c) => c.toUpperCase())];
			if (value === true) placeholderArgs.push(`--${long}`);
			else if (typeof value === "string") placeholderArgs.push(`--${long}`, value);
		}
		for (const commandName of new Set(removeNames ?? [name])) removeCommandByName(program, commandName);
		await register();
		await reparseProgramFromActionArgs(program, actionArgs, placeholderArgs);
	});
}
//#endregion
//#region src/cli/program/register-command-groups.ts
function getCommandGroupNames(entry) {
	return entry.names ?? entry.placeholders.map((placeholder) => placeholder.name);
}
function findCommandGroupEntry(entries, name) {
	return entries.find((entry) => getCommandGroupNames(entry).includes(name));
}
function removeCommandGroupNames(program, entry) {
	for (const name of new Set(getCommandGroupNames(entry))) removeCommandByName(program, name);
}
async function registerCommandGroupByName(program, entries, name) {
	const entry = findCommandGroupEntry(entries, name);
	if (!entry) return false;
	removeCommandGroupNames(program, entry);
	await entry.register(program);
	return true;
}
function registerLazyCommandGroup(program, entry, placeholder) {
	registerLazyCommand({
		program,
		name: placeholder.name,
		description: placeholder.description,
		removeNames: [...new Set(getCommandGroupNames(entry))],
		...placeholder.options ? { options: placeholder.options } : {},
		register: async () => {
			await entry.register(program);
		}
	});
}
function registerCommandGroups(program, entries, params) {
	if (params.eager) {
		for (const entry of entries) entry.register(program);
		return;
	}
	if (params.primary && params.registerPrimaryOnly) {
		const entry = findCommandGroupEntry(entries, params.primary);
		if (entry) {
			const placeholder = entry.placeholders.find((candidate) => candidate.name === params.primary);
			if (placeholder) registerLazyCommandGroup(program, entry, placeholder);
			return;
		}
	}
	for (const entry of entries) for (const placeholder of entry.placeholders) registerLazyCommandGroup(program, entry, placeholder);
}
//#endregion
export { registerLazyCommandGroup as a, registerCommandGroups as i, getCommandGroupNames as n, removeCommandGroupNames as o, registerCommandGroupByName as r, findCommandGroupEntry as t };
