import { fileURLToPath } from "node:url";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
//#region node_modules/tokenjuice/dist/core/command-shell.js
const COMPOUND_SHELL_OPERATORS = new Set([
	";",
	"\n",
	"|",
	"&&",
	"||"
]);
const SEQUENTIAL_SHELL_OPERATORS = new Set([
	";",
	"\n",
	"&&",
	"||"
]);
const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.*/u;
function tokenizeCommand(command) {
	const tokens = [];
	let current = "";
	let quote = null;
	let escaping = false;
	for (const char of command.trim()) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (char === quote) quote = null;
			else current += char;
			continue;
		}
		if (char === "'" || char === "\"") {
			quote = char;
			continue;
		}
		if (/\s/u.test(char)) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}
	if (escaping) current += "\\";
	if (current) tokens.push(current);
	return tokens;
}
function hasUnquotedShellOperator(command, operators) {
	let quote = null;
	let escaping = false;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index];
		if (escaping) {
			escaping = false;
			continue;
		}
		if (char === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === "\"") {
			quote = char;
			continue;
		}
		if ((char === ";" || char === "\n" || char === "|") && operators.has(char)) return true;
		if (char === "&" && command[index + 1] === "&" && operators.has("&&")) return true;
		if (char === "|" && command[index + 1] === "|" && operators.has("||")) return true;
	}
	return false;
}
function splitTopLevelCommandChain(command) {
	const trimmed = command.trim();
	if (!trimmed) return [];
	const segments = [];
	let current = "";
	let quote = null;
	let escaping = false;
	for (let index = 0; index < trimmed.length; index += 1) {
		const char = trimmed[index];
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			current += char;
			escaping = true;
			continue;
		}
		if (quote) {
			current += char;
			if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === "\"") {
			current += char;
			quote = char;
			continue;
		}
		if (char === "&" && trimmed[index + 1] === "&") {
			const segment = current.trim();
			if (segment) segments.push(segment);
			current = "";
			index += 1;
			continue;
		}
		if (char === ";" || char === "\n") {
			const segment = current.trim();
			if (segment) segments.push(segment);
			current = "";
			continue;
		}
		current += char;
	}
	if (quote || escaping) return [trimmed];
	const segment = current.trim();
	if (segment) segments.push(segment);
	return segments;
}
function isCompoundShellCommand(command) {
	return hasUnquotedShellOperator(command, COMPOUND_SHELL_OPERATORS);
}
function hasSequentialShellCommands(command) {
	return hasUnquotedShellOperator(command, SEQUENTIAL_SHELL_OPERATORS);
}
function stripLeadingEnvAssignmentsFromCommand(command) {
	const trimmed = command.trim();
	if (!trimmed) return null;
	let index = 0;
	while (index < trimmed.length) {
		while (/\s/u.test(trimmed[index] ?? "")) index += 1;
		if (index >= trimmed.length) return null;
		const tokenStart = index;
		let quote = null;
		let escaping = false;
		while (index < trimmed.length) {
			const char = trimmed[index];
			if (escaping) {
				escaping = false;
				index += 1;
				continue;
			}
			if (char === "\\") {
				escaping = true;
				index += 1;
				continue;
			}
			if (quote) {
				if (char === quote) quote = null;
				index += 1;
				continue;
			}
			if (char === "'" || char === "\"") {
				quote = char;
				index += 1;
				continue;
			}
			if (/\s/u.test(char)) break;
			index += 1;
		}
		if (quote || escaping) return trimmed;
		const token = trimmed.slice(tokenStart, index);
		if (!ENV_ASSIGNMENT_PATTERN.test(token)) return trimmed.slice(tokenStart).trim();
	}
	return null;
}
/**
* Strip trivial leading `cd <dir> && ` (or `pushd`) prefixes from a shell
* command. Models sometimes emit `cd /path && git status` even when the
* harness provides a cwd, which causes downstream compound-command heuristics
* to skip compaction. Stripping the prefix lets classification and the
* rewrite policy reason about the effective command.
*
* Only handles trivially safe chains — a single shell token argument, no
* redirections, no nested pipelines. Anything fancier returns the input
* unchanged.
*/
function stripLeadingCdPrefix(command) {
	let current = command.trim();
	for (let iteration = 0; iteration < 8; iteration += 1) {
		const next = matchLeadingCdChain(current);
		if (next === null) return current;
		current = next;
	}
	return current;
}
function matchLeadingCdChain(command) {
	const keywordMatch = /^\s*(cd|pushd)(\s+)/u.exec(command);
	if (!keywordMatch) return null;
	let index = keywordMatch[0].length;
	const length = command.length;
	let quote = null;
	let escaping = false;
	let sawArg = false;
	while (index < length) {
		const char = command[index];
		if (escaping) {
			escaping = false;
			index += 1;
			sawArg = true;
			continue;
		}
		if (char === "\\") {
			escaping = true;
			index += 1;
			sawArg = true;
			continue;
		}
		if (quote) {
			if (char === quote) quote = null;
			index += 1;
			sawArg = true;
			continue;
		}
		if (char === "'" || char === "\"") {
			quote = char;
			index += 1;
			sawArg = true;
			continue;
		}
		if (/\s/u.test(char)) break;
		if (char === "&" || char === "|" || char === ";" || char === "<" || char === ">" || char === "\n") return null;
		sawArg = true;
		index += 1;
	}
	if (!sawArg) return null;
	while (index < length && /[ \t]/u.test(command[index])) index += 1;
	if (command[index] === "&" && command[index + 1] === "&") {
		const tail = command.slice(index + 2).trim();
		return tail.length > 0 ? tail : null;
	}
	return null;
}
//#endregion
//#region node_modules/tokenjuice/dist/core/command-match.js
const SETUP_WRAPPER_COMMANDS = new Set([
	"cd",
	"pwd",
	"set",
	"source",
	".",
	"export",
	"unset",
	"trap"
]);
const SHELL_COMMAND_LAUNCHERS = new Set([
	"bash",
	"sh",
	"zsh",
	"fish"
]);
const ENV_FLAGS_WITH_VALUES = new Set([
	"-u",
	"--unset",
	"-C",
	"--chdir",
	"-S",
	"--split-string"
]);
const ENV_FLAGS = new Set([
	"-i",
	"--ignore-environment",
	"-0",
	"--null",
	"--debug"
]);
function getArgv0Name(argv) {
	const first = argv[0];
	if (!first) return null;
	const normalized = first.replace(/^["']|["']$/gu, "");
	const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
	return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}
function getNormalizedArgv(input) {
	if (input.argv?.length) return input.argv;
	if (!input.command) return [];
	return tokenizeCommand(input.command);
}
function isShellCommandStringOption(token) {
	return /^-[A-Za-z]*c[A-Za-z]*$/u.test(token);
}
function getSourcePriority(source) {
	switch (source) {
		case "effective": return 2;
		case "shell-body": return 1;
		default: return 0;
	}
}
function getCandidateArgv(input) {
	if (input.argv?.length) return input.argv;
	const command = typeof input.command === "string" ? input.command.trim() : "";
	if (!command || isCompoundShellCommand(command)) return [];
	return tokenizeCommand(command);
}
function buildCandidate(input, source) {
	return {
		...typeof input.command === "string" && input.command.trim() ? { command: input.command.trim() } : {},
		argv: getCandidateArgv(input),
		source
	};
}
function dedupeCandidates(candidates) {
	const deduped = [];
	const indexes = /* @__PURE__ */ new Map();
	for (const candidate of candidates) {
		const key = `${candidate.command ?? ""}\0${candidate.argv.join("\0")}`;
		const existingIndex = indexes.get(key);
		if (existingIndex === void 0) {
			indexes.set(key, deduped.length);
			deduped.push(candidate);
			continue;
		}
		const existing = deduped[existingIndex];
		if (getSourcePriority(candidate.source) > getSourcePriority(existing.source)) deduped[existingIndex] = candidate;
	}
	return deduped;
}
function isLikelyShellLauncher(launcherName, launcherPath) {
	const normalized = launcherName.toLowerCase().replace(/\.exe$/u, "");
	if (SHELL_COMMAND_LAUNCHERS.has(normalized)) return true;
	if (normalized === "dash" || normalized === "ksh" || normalized === "mksh" || normalized === "ash" || normalized === "csh" || normalized === "tcsh") return true;
	const pathNormalized = launcherPath?.toLowerCase().replace(/\\/gu, "/");
	if (!pathNormalized) return false;
	if (!pathNormalized.includes("/bin/")) return false;
	return pathNormalized.endsWith("/bash") || pathNormalized.endsWith("/sh") || pathNormalized.endsWith("/zsh") || pathNormalized.endsWith("/fish") || pathNormalized.endsWith("/dash") || pathNormalized.endsWith("/ksh") || pathNormalized.endsWith("/mksh") || pathNormalized.endsWith("/ash") || pathNormalized.endsWith("/csh") || pathNormalized.endsWith("/tcsh") || pathNormalized.endsWith("/bash.exe") || pathNormalized.endsWith("/sh.exe") || pathNormalized.endsWith("/zsh.exe") || pathNormalized.endsWith("/fish.exe");
}
function unwrapShellRunner(input) {
	const argv = getNormalizedArgv(input);
	const argv0 = getArgv0Name(argv);
	if (!argv0 || !isLikelyShellLauncher(argv0, argv[0])) return null;
	for (let index = 1; index < argv.length - 1; index += 1) {
		if (!isShellCommandStringOption(argv[index] ?? "")) continue;
		const shellBody = argv[index + 1]?.trim();
		return shellBody ? shellBody : null;
	}
	return null;
}
function stripLeadingEnvAssignments(argv) {
	let index = 0;
	while (index < argv.length && ENV_ASSIGNMENT_PATTERN.test(argv[index] ?? "")) index += 1;
	if (getArgv0Name(argv.slice(index)) !== "env") return argv.slice(index);
	index += 1;
	while (index < argv.length) {
		const arg = argv[index] ?? "";
		if (arg === "--") {
			index += 1;
			break;
		}
		if (ENV_ASSIGNMENT_PATTERN.test(arg)) {
			index += 1;
			continue;
		}
		if (ENV_FLAGS.has(arg)) {
			index += 1;
			continue;
		}
		if (ENV_FLAGS_WITH_VALUES.has(arg)) {
			index += 2;
			continue;
		}
		if (arg.startsWith("--unset=") || arg.startsWith("--chdir=") || arg.startsWith("--split-string=")) {
			index += 1;
			continue;
		}
		break;
	}
	return argv.slice(index);
}
function isSetupWrapperSegment(argv) {
	if (argv.length === 0) return true;
	const argv0 = getArgv0Name(argv);
	if (!argv0) return true;
	return SETUP_WRAPPER_COMMANDS.has(argv0);
}
function buildEffectiveCandidate(argv, transformed, command) {
	const strippedArgv = stripLeadingEnvAssignments(argv);
	if (strippedArgv.length === 0 || isSetupWrapperSegment(strippedArgv)) return null;
	if (!transformed && strippedArgv.length === argv.length) return null;
	return {
		...command ? { command: strippedArgv.length === argv.length ? command : strippedArgv.join(" ") } : {},
		argv: strippedArgv,
		source: "effective"
	};
}
function resolveEffectiveCommand(input) {
	const command = typeof input.command === "string" ? input.command.trim() : "";
	const argv = getNormalizedArgv(input);
	if (!command && argv.length === 0) return null;
	if (!command) return buildEffectiveCandidate(argv, false);
	const segments = splitTopLevelCommandChain(command);
	const transformedByChain = segments.length > 1;
	for (const segment of segments) {
		const trimmedSegment = segment.trim();
		const segmentArgv = tokenizeCommand(trimmedSegment);
		if (segmentArgv.length === 0) continue;
		const candidate = buildEffectiveCandidate(segmentArgv, transformedByChain, stripLeadingEnvAssignmentsFromCommand(trimmedSegment) ?? void 0);
		if (candidate) return candidate;
	}
	return null;
}
function getEffectiveCommandArgv(input) {
	return resolveEffectiveCommand(input)?.argv ?? getCandidateArgv(input);
}
function deriveCommandMatchCandidates(input) {
	const candidates = [buildCandidate(input, "original")];
	const shellBody = unwrapShellRunner(input);
	if (shellBody) candidates.push(buildCandidate({ command: shellBody }, "shell-body"));
	const effective = resolveEffectiveCommand(shellBody ? { command: shellBody } : input);
	if (effective) candidates.push(effective);
	return dedupeCandidates(candidates);
}
//#endregion
//#region node_modules/tokenjuice/dist/core/command-identity.js
const FILE_CONTENT_INSPECTION_COMMANDS = new Set([
	"cat",
	"sed",
	"head",
	"tail",
	"nl",
	"bat",
	"batcat",
	"jq",
	"yq"
]);
function getCommandName(argv) {
	const first = argv[0];
	if (!first) return null;
	return basename(first.replace(/^["']|["']$/gu, ""));
}
function gitGlobalOptionTakesValue(option) {
	return option === "-C" || option === "-c" || option === "--git-dir" || option === "--work-tree" || option === "--namespace" || option === "--exec-path" || option === "--super-prefix" || option === "--config-env";
}
function isGitGlobalOptionWithInlineValue(option) {
	return option.startsWith("--git-dir=") || option.startsWith("--work-tree=") || option.startsWith("--namespace=") || option.startsWith("--exec-path=") || option.startsWith("--super-prefix=") || option.startsWith("--config-env=");
}
function getGitSubcommand(argv) {
	const index = getGitSubcommandIndex(argv);
	return index === null ? null : argv[index] ?? null;
}
function getGitSubcommandIndex(argv) {
	if (getCommandName(argv) !== "git") return null;
	for (let index = 1; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg) continue;
		if (gitGlobalOptionTakesValue(arg)) {
			index += 1;
			continue;
		}
		if (isGitGlobalOptionWithInlineValue(arg)) continue;
		if (arg.startsWith("-")) continue;
		return index;
	}
	return null;
}
function isGitBlobSpecifier(arg) {
	return /^[^:]+:.+/u.test(arg);
}
function isGitShowFileContentArgv(argv) {
	const subcommandIndex = getGitSubcommandIndex(argv);
	if (subcommandIndex === null || argv[subcommandIndex] !== "show") return false;
	for (let index = subcommandIndex + 1; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg) continue;
		if (arg === "--") return false;
		if (arg.startsWith("-")) continue;
		if (isGitBlobSpecifier(arg)) return true;
	}
	return false;
}
function isFileContentInspectionArgv(argv) {
	const argv0 = getCommandName(argv);
	if (!argv0) return false;
	return FILE_CONTENT_INSPECTION_COMMANDS.has(argv0) || isGitShowFileContentArgv(argv);
}
function isGhApiContentsDecodeCommand(command) {
	if (!command) return false;
	return /\bgh\s+api\b/u.test(command) && /\/contents\//u.test(command) && /--jq(?:=|\s+)['"]?\.content['"]?/u.test(command) && /\|\s*base64\s+(?:-[dD]\b|--decode\b)/u.test(command);
}
function getMostDerivedCandidate(input) {
	return deriveCommandMatchCandidates(input).reduce((best, candidate) => getSourcePriority(candidate.source) >= getSourcePriority(best.source) ? candidate : best);
}
function extractPipelineSourceCommand(command) {
	let current = "";
	let quote = null;
	let escaping = false;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index];
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			current += char;
			escaping = true;
			continue;
		}
		if (quote) {
			current += char;
			if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === "\"") {
			current += char;
			quote = char;
			continue;
		}
		if (char === "|" && command[index + 1] !== "|") break;
		current += char;
	}
	return current.trim();
}
function getInspectionArgv(input) {
	const candidate = getMostDerivedCandidate(input);
	if (candidate.argv.length > 0) return candidate.argv;
	if (typeof input.command !== "string") return [];
	const sourceCommand = extractPipelineSourceCommand(stripLeadingCdPrefix(input.command));
	return sourceCommand ? tokenizeCommand(sourceCommand) : [];
}
function isFileContentInspectionCommand(input) {
	return isFileContentInspectionArgv(getInspectionArgv(input)) || deriveCommandMatchCandidates(input).some((candidate) => isGhApiContentsDecodeCommand(candidate.command));
}
//#endregion
//#region node_modules/tokenjuice/dist/core/inventory-safety.js
const REPO_INVENTORY_COMMANDS = new Set([
	"find",
	"fd",
	"fdfind",
	"ls"
]);
const REPO_INSPECTION_ONLY_COMMANDS = new Set(["tree"]);
const FIND_EXEC_ACTIONS = new Set([
	"-exec",
	"-execdir",
	"-ok",
	"-okdir"
]);
const FD_EXEC_OPTIONS = new Set([
	"-x",
	"--exec",
	"-X",
	"--exec-batch"
]);
const REPO_INVENTORY_PIPE_FILTERS = new Map([
	["head", {
		flags: [
			"-q",
			"-v",
			"-z"
		],
		valueFlags: [
			"-n",
			"-c",
			"--lines",
			"--bytes"
		],
		inlineValuePrefixes: ["--lines=", "--bytes="],
		compactValueFlags: [/^-[0-9]+$/u, /^-[nc].+/u]
	}],
	["sort", {
		flags: [
			"-b",
			"-d",
			"-f",
			"-g",
			"-h",
			"-i",
			"-M",
			"-m",
			"-n",
			"-R",
			"-r",
			"-s",
			"-u",
			"-V",
			"-z",
			"--check",
			"--debug",
			"--dictionary-order",
			"--general-numeric-sort",
			"--human-numeric-sort",
			"--ignore-case",
			"--ignore-leading-blanks",
			"--ignore-nonprinting",
			"--merge",
			"--month-sort",
			"--numeric-sort",
			"--random-sort",
			"--reverse",
			"--stable",
			"--unique",
			"--version-sort",
			"--zero-terminated"
		],
		valueFlags: [
			"-k",
			"-S",
			"-t",
			"--batch-size",
			"--key",
			"--sort"
		],
		inlineValuePrefixes: [
			"--batch-size=",
			"--key=",
			"--sort="
		],
		compactValueFlags: [
			/^-[bdfghinMmrRsuVz]*k.+/u,
			/^-[bdfghinMmrRsuVz]*S.+/u,
			/^-[bdfghinMmrRsuVz]*t.+/u
		]
	}],
	["tail", {
		flags: [
			"-q",
			"-v",
			"-z",
			"-f",
			"-F",
			"-r"
		],
		valueFlags: [
			"-n",
			"-c",
			"--lines",
			"--bytes",
			"--pid",
			"-s",
			"--sleep-interval"
		],
		inlineValuePrefixes: [
			"--lines=",
			"--bytes=",
			"--pid=",
			"--sleep-interval="
		],
		compactValueFlags: [/^-[0-9]+$/u, /^-[nc].+/u]
	}],
	["uniq", {
		flags: [
			"-c",
			"-d",
			"-D",
			"-i",
			"-u",
			"-z",
			"--all-repeated",
			"--count",
			"--ignore-case",
			"--repeated",
			"--unique",
			"--zero-terminated"
		],
		valueFlags: [
			"-f",
			"-s",
			"-w",
			"--skip-fields",
			"--skip-chars",
			"--check-chars"
		],
		inlineValuePrefixes: [
			"--skip-fields=",
			"--skip-chars=",
			"--check-chars=",
			"--all-repeated="
		],
		compactValueFlags: [/^-[fsw].+/u]
	}],
	["wc", { flags: ["-l", "--lines"] }]
]);
function getRepositoryInventorySourceArgv(command) {
	const leadingCommand = getLeadingSequentialSegment(stripLeadingCdPrefix(command));
	return getEffectiveCommandArgv({ command: splitUnquotedPipes(leadingCommand)[0] ?? leadingCommand });
}
function getLeadingSequentialSegment(command) {
	let current = "";
	let quote = null;
	let escaping = false;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index];
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			current += char;
			escaping = true;
			continue;
		}
		if (quote) {
			current += char;
			if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === "\"") {
			current += char;
			quote = char;
			continue;
		}
		if (char === ";" || char === "\n" || char === "&" && command[index + 1] === "&" || char === "|" && command[index + 1] === "|") return current.trim();
		current += char;
	}
	return current.trim();
}
function splitUnquotedPipes(command) {
	const segments = [];
	let current = "";
	let quote = null;
	let escaping = false;
	for (let index = 0; index < command.length; index += 1) {
		const char = command[index];
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\") {
			current += char;
			escaping = true;
			continue;
		}
		if (quote) {
			current += char;
			if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === "\"") {
			current += char;
			quote = char;
			continue;
		}
		if (char === "|" && command[index + 1] !== "|") {
			if (current.trim()) segments.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim()) segments.push(current.trim());
	return segments;
}
function isKnownFlag(arg, spec) {
	return (spec.flags?.includes(arg) ?? false) || (spec.inlineValuePrefixes?.some((prefix) => arg.startsWith(prefix)) ?? false) || (spec.compactValueFlags?.some((pattern) => pattern.test(arg)) ?? false);
}
function isStdinOnlyFilter(argv, spec) {
	for (let index = 1; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "-") continue;
		if (arg === "--") return argv.slice(index + 1).every((operand) => operand === "-");
		if (spec.valueFlags?.includes(arg)) {
			index += 1;
			if (index >= argv.length) return false;
			continue;
		}
		if (isKnownFlag(arg, spec)) continue;
		return false;
	}
	return true;
}
function isSafeRepositoryInventoryPipeSegment(commandName, argv) {
	if (commandName === "sed") return isSafeSedInventoryFilter(argv);
	const spec = REPO_INVENTORY_PIPE_FILTERS.get(commandName);
	if (!spec) return false;
	return isStdinOnlyFilter(argv, spec);
}
function isSafeSedInventoryFilter(argv) {
	const scripts = [];
	for (let index = 1; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "-") continue;
		if (arg === "-n" || arg === "-E" || arg === "-r") continue;
		if (arg === "-e") {
			index += 1;
			if (index >= argv.length) return false;
			scripts.push(argv[index]);
			continue;
		}
		if (arg.startsWith("-")) return false;
		scripts.push(arg);
	}
	if (scripts.length === 0 || scripts.length > 2) return false;
	return scripts.every((script) => {
		if (/^(?:\d+|\$)?(?:,\s*(?:\d+|\$))?p$/u.test(script)) return true;
		return /^s(.)(?:\^?[^\\\n]*)\1(?:[^\\\n]*)\1[gIp]*$/u.test(script);
	});
}
function isSafeRepositoryInventorySource(argv) {
	const commandName = getCommandName(argv);
	if (commandName === "find") return argv.every((arg) => !FIND_EXEC_ACTIONS.has(arg));
	if (commandName === "fd" || commandName === "fdfind") return argv.every((arg) => !FD_EXEC_OPTIONS.has(arg) && !arg.startsWith("--exec=") && !arg.startsWith("--exec-batch="));
	return true;
}
function isRepositoryInventoryCommand(input) {
	const argv = input.argv?.length ? getEffectiveCommandArgv(input) : getRepositoryInventorySourceArgv(input.command ?? "");
	const argv0 = getCommandName(argv);
	if (!argv0) return false;
	if (REPO_INVENTORY_COMMANDS.has(argv0)) return true;
	if (argv0 === "rg" && argv.includes("--files")) return true;
	if (argv0 === "git" && getGitSubcommand(argv) === "ls-files") return true;
	return false;
}
function getRepositoryInventorySafety(command) {
	const effectiveCommand = stripLeadingCdPrefix(command);
	const sourceArgv = getRepositoryInventorySourceArgv(effectiveCommand);
	if (!isRepositoryInventoryCommand({ argv: sourceArgv })) return "not-inventory";
	if (!isSafeRepositoryInventorySource(sourceArgv)) return "unsafe-pipeline";
	if (hasSequentialShellCommands(effectiveCommand)) return "sequential-command";
	const segments = splitUnquotedPipes(effectiveCommand);
	if (segments.length <= 1) return "safe";
	return segments.slice(1).every((segment) => {
		const argv = tokenizeCommand(segment);
		const commandName = getCommandName(argv);
		return commandName !== null && isSafeRepositoryInventoryPipeSegment(commandName, argv);
	}) ? "safe" : "unsafe-pipeline";
}
function isRepositoryInspectionCommand(input) {
	const argv0 = getCommandName(input.argv?.length ? getEffectiveCommandArgv(input) : getRepositoryInventorySourceArgv(input.command ?? ""));
	if (isFileContentInspectionCommand(input)) return true;
	if (isRepositoryInventoryCommand(input)) return true;
	if (argv0 && REPO_INSPECTION_ONLY_COMMANDS.has(argv0)) return true;
	return false;
}
function hasCommandOnlyFileContentSummary(command) {
	const effectiveCommand = stripLeadingCdPrefix(command);
	return /\bpackage-lock\.json\b/u.test(effectiveCommand);
}
function getSafeRepositoryInventorySourceArgv(command) {
	return getRepositoryInventorySafety(command) === "safe" ? getRepositoryInventorySourceArgv(command) : null;
}
function getInspectionCommandSkipReason(command, policy) {
	if (policy === "compact-all") return null;
	if (policy === "skip-all") return isRepositoryInspectionCommand({ command }) ? "inspection-command" : null;
	if (isFileContentInspectionCommand({ command }) && !hasCommandOnlyFileContentSummary(command)) return "file-content-inspection-command";
	if (policy === "skip-file-content") return null;
	if (isRepositoryInspectionCommand({ command })) {
		const argv0 = getCommandName(getRepositoryInventorySourceArgv(command));
		if (argv0 && REPO_INSPECTION_ONLY_COMMANDS.has(argv0)) return "inspection-command";
	}
	const inventorySafety = getRepositoryInventorySafety(command);
	if (inventorySafety === "sequential-command") return "sequential-inventory-command";
	if (inventorySafety === "unsafe-pipeline") return "unsafe-inventory-pipeline";
	return null;
}
//#endregion
//#region node_modules/tokenjuice/dist/core/compaction-metadata.js
const NO_COMPACTION_METADATA = {
	authoritative: false,
	kinds: []
};
function createCompactionMetadata(...kinds) {
	if (kinds.length === 0) return NO_COMPACTION_METADATA;
	return {
		authoritative: true,
		kinds: Array.from(new Set(kinds))
	};
}
function mergeCompactionMetadata(...values) {
	return createCompactionMetadata(...values.flatMap((value) => value?.kinds ?? []));
}
//#endregion
//#region node_modules/tokenjuice/dist/core/text.js
const ANSI_CSI_PATTERN = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, "g");
const ANSI_OSC_PATTERN = new RegExp(String.raw`\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)`, "g");
const ANSI_CSI_INCOMPLETE_PATTERN = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*$`, "g");
const ANSI_OSC_INCOMPLETE_PATTERN = new RegExp(String.raw`\u001B\][^\u0007\u001B]*$`, "g");
const ANSI_SINGLE_PATTERN = new RegExp(String.raw`\u001B[@-_]`, "g");
const TRUNCATION_SUFFIX = "\n... truncated ...";
const MIDDLE_TRUNCATION_MARKER = "\n... omitted ...\n";
const graphemeSegmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : null;
function graphemes(text) {
	if (!graphemeSegmenter) return Array.from(text);
	return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
}
function trimHeadToLineBoundary(text) {
	const lastNewline = text.lastIndexOf("\n");
	if (lastNewline === -1 || lastNewline < Math.floor(text.length * .5)) return text;
	return text.slice(0, lastNewline);
}
function trimTailToLineBoundary(text) {
	const firstNewline = text.indexOf("\n");
	if (firstNewline === -1 || firstNewline > Math.ceil(text.length * .5)) return text;
	return text.slice(firstNewline + 1);
}
function stripAnsi(text) {
	return text.replaceAll(ANSI_OSC_PATTERN, "").replaceAll(ANSI_CSI_PATTERN, "").replaceAll(ANSI_OSC_INCOMPLETE_PATTERN, "").replaceAll(ANSI_CSI_INCOMPLETE_PATTERN, "").replaceAll(ANSI_SINGLE_PATTERN, "").replaceAll("\x1B", "");
}
function countTextChars(text) {
	return graphemes(text).length;
}
function sliceTextChars(text, start, end) {
	return graphemes(text).slice(start, end).join("");
}
function normalizeLines(text) {
	return text.replaceAll("\r\n", "\n").split("\n").map((line) => line.replace(/\s+$/u, ""));
}
function trimEmptyEdges(lines) {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start]?.trim() === "") start += 1;
	while (end > start && lines[end - 1]?.trim() === "") end -= 1;
	return lines.slice(start, end);
}
function dedupeAdjacent$1(lines) {
	const next = [];
	for (const line of lines) if (next[next.length - 1] !== line) next.push(line);
	return next;
}
function headTail(lines, head, tail) {
	const safeHead = Math.max(0, head);
	const safeTail = Math.max(0, tail);
	if (safeHead === 0 && safeTail === 0) return { lines };
	if (lines.length <= safeHead + safeTail) return { lines };
	return {
		lines: [
			...lines.slice(0, safeHead),
			`... ${lines.length - safeHead - safeTail} lines omitted ...`,
			...lines.slice(-safeTail)
		],
		compaction: createCompactionMetadata("head-tail-omission")
	};
}
function clampText(text, maxChars) {
	if (countTextChars(text) <= maxChars) return text;
	const bodyChars = Math.max(0, maxChars - countTextChars(TRUNCATION_SUFFIX));
	return `${trimHeadToLineBoundary(graphemes(text).slice(0, bodyChars).join(""))}${TRUNCATION_SUFFIX}`;
}
function clampTextWithMetadata(text, maxChars) {
	if (countTextChars(text) <= maxChars) return { text };
	return {
		text: clampText(text, maxChars),
		compaction: createCompactionMetadata("tail-truncation")
	};
}
function clampTextMiddleWithMetadata(text, maxChars) {
	if (countTextChars(text) <= maxChars) return { text };
	const markerChars = countTextChars(MIDDLE_TRUNCATION_MARKER);
	const bodyChars = Math.max(0, maxChars - markerChars);
	const headChars = Math.ceil(bodyChars * .7);
	const tailChars = Math.max(0, bodyChars - headChars);
	const segments = graphemes(text);
	return {
		text: `${trimHeadToLineBoundary(segments.slice(0, headChars).join(""))}${MIDDLE_TRUNCATION_MARKER}${trimTailToLineBoundary(segments.slice(-tailChars).join(""))}`,
		compaction: createCompactionMetadata("middle-truncation")
	};
}
function pluralize(count, noun) {
	if (/(?:passed|failed|skipped)$/u.test(noun)) return `${count} ${noun}`;
	if (count === 1) return `${count} ${noun}`;
	if (/[sxz]$/u.test(noun) || /(sh|ch)$/u.test(noun)) return `${count} ${noun}es`;
	if (/[^aeiou]y$/u.test(noun)) return `${count} ${noun.slice(0, -1)}ies`;
	return `${count} ${noun}s`;
}
//#endregion
//#region node_modules/tokenjuice/dist/core/reduce-utils.js
function compactWhitespace(text) {
	return text.replace(/\s+/gu, " ").trim();
}
function shortHash(text) {
	return createHash("sha256").update(text).digest("hex").slice(0, 12);
}
function clipMiddleWithHash(text, maxChars) {
	if (countTextChars(text) <= maxChars) return { text };
	const omitted = countTextChars(text) - maxChars;
	const headChars = Math.max(20, Math.floor(maxChars * .55));
	const tailChars = Math.max(20, maxChars - headChars);
	return {
		text: `${sliceTextChars(text, 0, headChars)} ...[${omitted} chars omitted, sha256:${shortHash(text)}]... ${sliceTextChars(text, -tailChars)}`,
		compaction: createCompactionMetadata("hashed-middle-clip")
	};
}
function parseJsonObjectLine(line) {
	const trimmed = line.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
	try {
		const parsed = JSON.parse(trimmed);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
function parseJsonValue(text) {
	const trimmed = text.trim();
	if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
	try {
		return JSON.parse(trimmed);
	} catch {
		return null;
	}
}
//#endregion
//#region node_modules/tokenjuice/dist/core/reduce-inspection-summary.js
const LARGE_INSPECTION_MIN_CHARS = 4e3;
const LARGE_INSPECTION_MIN_LINES = 40;
const PACKAGE_LOCK_RE = /\bpackage-lock\.json\b/u;
function buildPackageLockSummary(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
	const record = value;
	const packages = typeof record.packages === "object" && record.packages !== null && !Array.isArray(record.packages) ? Object.keys(record.packages) : [];
	const dependencies = typeof record.dependencies === "object" && record.dependencies !== null && !Array.isArray(record.dependencies) ? Object.keys(record.dependencies) : [];
	const lines = [
		"package-lock summary",
		typeof record.name === "string" ? `name: ${record.name}` : null,
		typeof record.version === "string" ? `version: ${record.version}` : null,
		typeof record.lockfileVersion === "number" ? `lockfileVersion: ${record.lockfileVersion}` : null,
		`packages: ${packages.length}`,
		`dependencies: ${dependencies.length}`
	].filter((line) => line !== null);
	const packageSamples = packages.filter(Boolean).slice(0, 12);
	if (packageSamples.length > 0) lines.push(`sample packages: ${packageSamples.join(", ")}`);
	return lines;
}
function buildLargeDocumentSummary(lines, rawText) {
	const headings = lines.map((line) => line.trim()).filter((line) => /^#{1,6}\s+\S/u.test(line)).slice(0, 24);
	const excerpt = headTail(lines, 6, 6);
	const clippedHeadingCompactions = [];
	const clippedHeadings = headings.map((line) => {
		const clipped = clipMiddleWithHash(line, 180);
		if (clipped.compaction) clippedHeadingCompactions.push(clipped.compaction);
		return `- ${clipped.text}`;
	});
	const clippedExcerptCompactions = [];
	const excerptLines = excerpt.lines.map((line) => {
		const clipped = clipMiddleWithHash(line, 180);
		if (clipped.compaction) clippedExcerptCompactions.push(clipped.compaction);
		return clipped.text;
	});
	return {
		lines: [
			`large document summary: ${lines.length} lines, ${countTextChars(rawText)} chars`,
			...clippedHeadings.length > 0 ? ["headings:", ...clippedHeadings] : [],
			"excerpt:",
			...excerptLines
		],
		compaction: mergeCompactionMetadata(createCompactionMetadata("inspection-large-document-summary"), excerpt.compaction, ...clippedHeadingCompactions, ...clippedExcerptCompactions)
	};
}
function isLikelyDocumentLine(line) {
	const trimmed = line.trim();
	if (trimmed.length < 50) return false;
	if (/^(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|case|try|catch)\b/u.test(trimmed)) return false;
	if (/^[{}()[\].,;:]/u.test(trimmed) || /[{};]$/u.test(trimmed)) return false;
	return /\s/u.test(trimmed);
}
function isLikelyCodeLine(line) {
	const trimmed = line.trim();
	if (!trimmed) return false;
	return /^(?:import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|case|try|catch|\}|\{|\)|\])/u.test(trimmed) || /[{};]$/u.test(trimmed);
}
function isLargeDocumentOutput(lines, rawChars) {
	if (rawChars < LARGE_INSPECTION_MIN_CHARS) return false;
	if (lines.length < LARGE_INSPECTION_MIN_LINES) return false;
	const nonEmptyLines = lines.filter((line) => line.trim() !== "");
	const headingCount = nonEmptyLines.filter((line) => /^#{1,6}\s+\S/u.test(line.trim())).length;
	const hasFrontmatter = nonEmptyLines[0]?.trim() === "---" && nonEmptyLines.slice(1, 20).some((line) => line.trim() === "---");
	if (headingCount >= 2 || hasFrontmatter && headingCount >= 1) return true;
	const documentLines = nonEmptyLines.filter(isLikelyDocumentLine).length;
	const codeLines = nonEmptyLines.filter(isLikelyCodeLine).length;
	return documentLines >= 20 && documentLines / nonEmptyLines.length >= .5 && codeLines / nonEmptyLines.length < .25;
}
function buildInspectionSummary(input, rawText) {
	const command = input.command ?? "";
	if (PACKAGE_LOCK_RE.test(command)) {
		const lines = buildPackageLockSummary(parseJsonValue(rawText));
		return lines.length > 0 ? {
			lines,
			matchedReducer: "generic/package-lock-summary",
			compaction: createCompactionMetadata("inspection-package-lock-summary")
		} : null;
	}
	const rawChars = countTextChars(rawText);
	const lines = trimEmptyEdges(normalizeLines(stripAnsi(rawText)));
	if (!isFileContentInspectionCommand(input) || !isLargeDocumentOutput(lines, rawChars)) return null;
	const summary = buildLargeDocumentSummary(lines, rawText);
	return {
		lines: summary.lines,
		matchedReducer: "generic/large-document-summary",
		compaction: summary.compaction
	};
}
//#endregion
//#region node_modules/tokenjuice/dist/core/builtin-rules.generated.js
const BUNDLED_BUILTIN_RULES = [
	{
		id: "archive/tar",
		family: "archive-cli",
		description: "Compact tar output while preserving archive paths and error lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["tar"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|cannot",
			"flags": "i"
		}]
	},
	{
		id: "archive/unzip",
		family: "archive-cli",
		description: "Compact unzip output while preserving extracted paths and conflict lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["unzip"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "inflating|extracting|replace|error",
			"flags": "i"
		}]
	},
	{
		id: "archive/zip",
		family: "archive-cli",
		description: "Compact zip output while preserving archived paths and warnings.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["zip"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "adding|updating|warning|error",
			"flags": "i"
		}]
	},
	{
		id: "build/cmake",
		family: "build-native",
		description: "Compact cmake output while preserving configure errors, build failures, and final status.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["cmake"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "error",
			"pattern": "CMake Error|error:|failed|FAILED",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "CMake Warning|warning:",
			"flags": "i"
		}]
	},
	{
		id: "build/dotnet",
		family: "build-dotnet",
		description: "Compact dotnet build and restore output while preserving diagnostics and final summaries.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["dotnet"],
			"argvIncludesAny": [
				["build"],
				["restore"],
				["publish"]
			]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "error",
			"pattern": "error [A-Z]+\\d+|Build FAILED|failed",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "warning [A-Z]+\\d+|warning",
			"flags": "i"
		}]
	},
	{
		id: "build/esbuild",
		family: "build-bundler",
		description: "Compact esbuild and tsdown-like output while preserving actual errors.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["esbuild"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "warning",
			"flags": "i"
		}]
	},
	{
		id: "build/go-build",
		family: "build-go",
		description: "Compact go build output while preserving compiler diagnostics and package failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["go"],
			"argvIncludes": [["build"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 16
		},
		counters: [{
			"name": "error",
			"pattern": "^# |\\.go:\\d+:\\d+:|cannot|undefined|failed",
			"flags": "im"
		}]
	},
	{
		id: "build/gradle",
		family: "build-jvm",
		description: "Compact Gradle output while preserving task failures, test failures, and build status.",
		match: {
			"toolNames": ["exec"],
			"argv0": [
				"gradle",
				"gradlew",
				"./gradlew"
			]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "failed task",
			"pattern": "FAILURE: Build failed|Execution failed for task|FAILED",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "Deprecated Gradle features|warning",
			"flags": "i"
		}]
	},
	{
		id: "build/maven",
		family: "build-jvm",
		description: "Compact Maven output while preserving errors, failed goals, and reactor summaries.",
		match: {
			"toolNames": ["exec"],
			"argv0": [
				"mvn",
				"mvnw",
				"./mvnw"
			]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "error",
			"pattern": "\\[ERROR\\]|BUILD FAILURE|Failed to execute goal",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "\\[WARNING\\]",
			"flags": "i"
		}]
	},
	{
		id: "build/msbuild",
		family: "build-dotnet",
		description: "Compact MSBuild output while preserving project errors, warnings, and build status.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["msbuild"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "error",
			"pattern": "error [A-Z]+\\d+|Build FAILED|failed",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "warning [A-Z]+\\d+|warning",
			"flags": "i"
		}]
	},
	{
		id: "build/pnpm-build",
		family: "build-script",
		description: "Compact pnpm build script output while preserving downstream warnings and failures.",
		onEmpty: "pnpm build: ok",
		match: {
			"toolNames": ["exec"],
			"argv0": ["pnpm"],
			"argvIncludes": [["build"]],
			"commandIncludes": ["pnpm build"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "skipPatterns": ["^> .+$", "^\\s*Done in .+$"] },
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "warning|warn",
			"flags": "i"
		}]
	},
	{
		id: "build/swift-build",
		family: "build",
		description: "Compact swift build output while preserving compile diagnostics, contention messages, and final build status.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["swift"],
			"argvIncludes": [["build"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^\\[\\d+/\\d+\\]\\s+.+$",
				"^Building for .+\\.\\.\\.$",
				"^Planning build$"
			],
			"keepPatterns": [
				"^.+:\\d+:\\d+: error: .+",
				"^.+:\\d+:\\d+: warning: .+",
				"^.+:\\d+: error: .+",
				"^.+:\\d+: warning: .+",
				"^error: .+",
				"^warning: .+",
				"^note: .+",
				"^Another instance of SwiftPM.+$",
				"^Build complete!.+$",
				"^Build complete!$",
				"^Build failed.+$"
			]
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 16
		},
		counters: [{
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "warning",
			"flags": "i"
		}]
	},
	{
		id: "build/tsc",
		family: "build-typescript",
		description: "Compact TypeScript compiler output while preserving real diagnostics.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["tsc"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^Files:\\s+\\d+",
				"^Lines of Library:\\s+\\d+",
				"^Lines of Definitions:\\s+\\d+",
				"^Lines of TypeScript:\\s+\\d+",
				"^Lines of JavaScript:\\s+\\d+",
				"^Lines of JSON:\\s+\\d+",
				"^Lines of Other:\\s+\\d+",
				"^Identifiers:\\s+\\d+",
				"^Symbols:\\s+\\d+",
				"^Types:\\s+\\d+",
				"^Instantiations:\\s+\\d+",
				"^Memory used:\\s+.+",
				"^Assignability cache size:\\s+\\d+",
				"^Identity cache size:\\s+\\d+",
				"^Subtype cache size:\\s+\\d+",
				"^Strict subtype cache size:\\s+\\d+",
				"^I/O Read time:\\s+.+",
				"^Parse time:\\s+.+",
				"^ResolveModule time:\\s+.+",
				"^ResolveLibrary time:\\s+.+",
				"^Program time:\\s+.+",
				"^Bind time:\\s+.+",
				"^Check time:\\s+.+",
				"^transformTime time:\\s+.+",
				"^commentTime time:\\s+.+",
				"^I/O Write time:\\s+.+",
				"^printTime time:\\s+.+",
				"^Emit time:\\s+.+",
				"^Total time:\\s+.+",
				"^Watching for file changes\\."
			],
			"keepPatterns": [
				"^.+\\(\\d+,\\d+\\):\\s+error TS\\d+: .+",
				"^.+\\(\\d+,\\d+\\):\\s+warning TS\\d+: .+",
				"^Found \\d+ errors?.+",
				"^error TS\\d+: .+"
			]
		},
		summarize: {
			"head": 4,
			"tail": 4
		},
		failure: {
			"preserveOnFailure": true,
			"head": 4,
			"tail": 6
		},
		counters: [{
			"name": "typescript error",
			"pattern": "TS\\d+"
		}, {
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}]
	},
	{
		id: "build/tsdown",
		family: "build-bundler",
		description: "Compact tsdown build output while preserving warnings and failures.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["tsdown"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "warning",
			"flags": "i"
		}]
	},
	{
		id: "build/vite",
		family: "build-bundler",
		description: "Compact vite build output while preserving warnings and failures.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["vite", "build"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "skipPatterns": [
			"^transforming \\(.+\\) .+",
			"^rendering chunks \\(.+\\) .+",
			"^computing gzip size \\(.+\\) .+"
		] },
		summarize: {
			"head": 12,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "warning",
			"flags": "i"
		}]
	},
	{
		id: "build/webpack",
		family: "build-bundler",
		description: "Compact webpack output while preserving module errors and warnings.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["webpack"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"^Entrypoint\\s+.+",
			"^ERROR in .+",
			"^WARNING in .+",
			"^Module .+",
			"^\\s*ERROR\\s+in\\s+.+",
			"^\\s*webpack\\s+\\d+\\.\\d+\\.\\d+ compiled .+",
			"^\\s*\\d+ errors? have detailed information.+"
		] },
		summarize: {
			"head": 4,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 4,
			"tail": 8
		},
		counters: [
			{
				"name": "asset",
				"pattern": "^asset\\s+.+",
				"flags": "m"
			},
			{
				"name": "error",
				"pattern": "error",
				"flags": "i"
			},
			{
				"name": "warning",
				"pattern": "warning",
				"flags": "i"
			}
		]
	},
	{
		id: "build/xcodebuild",
		family: "build-xcode",
		description: "Compact xcodebuild output while preserving real diagnostics, failed commands, and final status.",
		match: {
			"toolNames": ["exec"],
			"commandIncludesAny": [
				"xcodebuild ",
				"&& xcodebuild ",
				"; xcodebuild ",
				"\nxcodebuild "
			]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^Fetching from https?://.+",
				"^Resolve Package Graph$",
				"^Resolved source packages:$",
				"^Command line invocation:$",
				"^\\s+/Applications/Xcode\\.app/.+/xcodebuild .+$",
				"^Prepare packages$",
				"^CreateBuildRequest$",
				"^SendProjectDescription$",
				"^CreateBuildOperation$",
				"^Build description signature: .+$",
				"^Build description path: .+$",
				"^note: Building targets in dependency order$",
				"^note: Target dependency graph \\(.+ targets\\)$",
				"^\\s*Target '.+' in project '.+'.*$",
				"^\\s*➜ .+$",
				"^SwiftDriver(?:JobDiscovery| Compilation)? normal .+$",
				"^SwiftCompile normal .+$",
				"^CompileSwift(?:Sources)? normal .+$",
				"^Ld .+$",
				"^CodeSign .+$",
				"^ProcessProductPackaging .+$",
				"^CompileAssetCatalog .+$"
			],
			"keepPatterns": [
				"^.+:\\d+:\\d+: error: .+",
				"^.+:\\d+:\\d+: warning: .+",
				"^.+:\\d+: error: .+",
				"^.+:\\d+: warning: .+",
				"^error: .+",
				"^warning: .+",
				"^note: .+",
				"^The following build commands failed:$",
				"^\\t.+$",
				"^\\*\\* BUILD (?:SUCCEEDED|FAILED) \\*\\*$",
				"^\\*\\* TEST (?:SUCCEEDED|FAILED) \\*\\*$",
				"^Testing failed:$"
			]
		},
		summarize: {
			"head": 18,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 24,
			"tail": 18
		},
		counters: [
			{
				"name": "error",
				"pattern": "error",
				"flags": "i"
			},
			{
				"name": "warning",
				"pattern": "warning",
				"flags": "i"
			},
			{
				"name": "failed command",
				"pattern": "^\\t.+$",
				"flags": "m"
			}
		]
	},
	{
		id: "cloud/aws",
		family: "cloud-cli",
		description: "Compact AWS CLI output while preserving result rows and service errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["aws"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|exception|denied|not found",
			"flags": "i"
		}]
	},
	{
		id: "cloud/az",
		family: "cloud-cli",
		description: "Compact Azure CLI output while preserving key resource rows and deployment failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["az"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|forbidden|not found",
			"flags": "i"
		}]
	},
	{
		id: "cloud/flyctl",
		family: "deploy-cli",
		description: "Compact Fly output while preserving machine, app, and rollout status lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["fly", "flyctl"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|unhealthy|warning",
			"flags": "i"
		}]
	},
	{
		id: "cloud/gcloud",
		family: "cloud-cli",
		description: "Compact gcloud output while preserving resource tables and API failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["gcloud"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|permission|denied",
			"flags": "i"
		}]
	},
	{
		id: "cloud/gh",
		family: "developer-cli",
		description: "Compact GitHub CLI output while preserving issue, PR, and workflow result lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["gh", "ghx"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|not found|forbidden",
			"flags": "i"
		}]
	},
	{
		id: "cloud/vercel",
		family: "deploy-cli",
		description: "Compact Vercel CLI output while preserving deployment URLs and error details.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["vercel"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|canceled|timed out",
			"flags": "i"
		}]
	},
	{
		id: "database/mongosh",
		family: "database-cli",
		description: "Compact mongosh output while preserving collection results and query errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["mongosh"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|exception",
			"flags": "i"
		}]
	},
	{
		id: "database/mysql",
		family: "database-cli",
		description: "Compact mysql output while preserving query rows and SQL errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["mysql"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|denied|unknown",
			"flags": "i"
		}]
	},
	{
		id: "database/psql",
		family: "database-cli",
		description: "Compact psql output while preserving result tables and query errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["psql"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|permission denied",
			"flags": "i"
		}]
	},
	{
		id: "database/redis-cli",
		family: "database-cli",
		description: "Compact redis-cli output while preserving command replies and connection failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["redis-cli"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "error",
			"pattern": "error|denied|could not connect",
			"flags": "i"
		}]
	},
	{
		id: "database/sqlite3",
		family: "database-cli",
		description: "Compact sqlite3 output while preserving query rows and parse errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["sqlite3"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|no such table",
			"flags": "i"
		}]
	},
	{
		id: "devops/docker-build",
		family: "container-build",
		description: "Compact docker build output while preserving real failures and final stages.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["docker"],
			"argvIncludes": [["build"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^#\\d+\\s+[0-9.]+\\s",
				"^#\\d+\\s+extracting\\s",
				"^#\\d+\\s+sha256:"
			],
			"keepPatterns": [
				"^#\\d+\\s+\\[",
				"^#\\d+\\s+DONE\\s",
				"^#\\d+\\s+ERROR:",
				"^ERROR:",
				"^ => ",
				"^exporting to image$",
				"^writing image",
				"^naming to "
			]
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "step",
			"pattern": "^#\\d+\\s+\\[",
			"flags": "m"
		}, {
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}]
	},
	{
		id: "devops/docker-compose",
		family: "container-compose",
		description: "Compact docker compose output while preserving service rows, status, and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["docker"],
			"argvIncludes": [["compose"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"error|warn|failed|unhealthy|exited|orphan",
			"^(NAME|SERVICE|CONTAINER ID)\\s+",
			"^[-a-zA-Z0-9_.]+\\s+.+",
			"^\\s*\\d+ services?\\s+",
			"^\\s*\\d+ containers?\\s+"
		] },
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "service",
			"pattern": "^(?!NAME\\s|SERVICE\\s|CONTAINER ID\\s).+\\S.*$"
		}, {
			"name": "error",
			"pattern": "error|failed|unhealthy|exited",
			"flags": "i"
		}]
	},
	{
		id: "devops/docker-images",
		family: "container-images",
		description: "Compact docker images output while preserving image rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["docker"],
			"argvIncludes": [["images"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [{
			"name": "image",
			"pattern": "^(?!REPOSITORY\\s).+\\S.*$"
		}]
	},
	{
		id: "devops/docker-logs",
		family: "container-logs",
		description: "Compact docker logs output while preserving early and late log lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["docker"],
			"argvIncludes": [["logs"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"error|warn|fatal|panic|exception|traceback|timeout|refused|fail",
			"^Caused by:",
			"^Traceback"
		] },
		summarize: {
			"head": 8,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "warn",
			"flags": "i"
		}]
	},
	{
		id: "devops/docker-ps",
		family: "container-list",
		description: "Compact docker ps output while preserving container rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["docker"],
			"argvIncludes": [["ps"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [{
			"name": "container",
			"pattern": "^(?!CONTAINER ID\\s).+\\S.*$"
		}]
	},
	{
		id: "devops/helm",
		family: "devops-cli",
		description: "Compact Helm output while preserving rendered-resource errors, release status, and upgrade failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["helm"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 14,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 20,
			"tail": 20
		},
		counters: [{
			"name": "resource",
			"pattern": "^kind: |^# Source:",
			"flags": "m"
		}, {
			"name": "error",
			"pattern": "Error:|failed|UPGRADE FAILED|INSTALLATION FAILED",
			"flags": "i"
		}]
	},
	{
		id: "devops/kubectl-describe",
		family: "kubernetes-describe",
		description: "Compact kubectl describe output while preserving metadata, status, events, and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["kubectl"],
			"argvIncludes": [["describe"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"^(Name|Namespace|Priority|Node|Status|IP|Controlled By|Containers|Conditions|Events):",
			"^\\s*(Type|Reason|Age|From|Message)\\s+",
			"error|warn|failed|back-off|crashloop|unhealthy|timeout",
			"^\\s*Warning\\s+",
			"^\\s*Normal\\s+"
		] },
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [{
			"name": "warning",
			"pattern": "warning|back-off|failed|unhealthy",
			"flags": "i"
		}, {
			"name": "event",
			"pattern": "^\\s*(Warning|Normal)\\s+",
			"flags": "m"
		}]
	},
	{
		id: "devops/kubectl-get",
		family: "kubernetes-list",
		description: "Compact kubectl get output while preserving resource rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["kubectl"],
			"argvIncludes": [["get"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "skipPatterns": ["^No resources found"] },
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [{
			"name": "resource",
			"pattern": "^(?!NAME\\s).+\\S.*$"
		}]
	},
	{
		id: "devops/kubectl-logs",
		family: "kubernetes-logs",
		description: "Compact kubectl logs output while preserving key log lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["kubectl"],
			"argvIncludes": [["logs"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"error|warn|fatal|panic|exception|traceback|timeout|refused|fail",
			"^Caused by:",
			"^Traceback"
		] },
		summarize: {
			"head": 8,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "warn",
			"flags": "i"
		}]
	},
	{
		id: "devops/pulumi",
		family: "iac-cli",
		description: "Compact Pulumi output while preserving resource changes, diagnostics, and deployment failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["pulumi"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "change",
			"pattern": "\\+|~|-|Resources:",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "error:|failed|Diagnostics:",
			"flags": "i"
		}]
	},
	{
		id: "devops/terraform",
		family: "iac-cli",
		description: "Compact Terraform output while preserving plan changes, diagnostics, and apply failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["terraform"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "change",
			"pattern": "Plan:|Apply complete|No changes|will be created|will be updated|will be destroyed",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "Error:|failed|Invalid|denied",
			"flags": "i"
		}]
	},
	{
		id: "devops/terragrunt",
		family: "iac-cli",
		description: "Compact Terragrunt output while preserving Terraform diagnostics, module paths, and failed runs.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["terragrunt"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "module",
			"pattern": "Working dir|Downloading Terraform configurations|Plan:",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "ERRO|Error:|failed|Invalid",
			"flags": "i"
		}]
	},
	{
		id: "filesystem/fd",
		family: "filesystem-inventory",
		description: "Compact fd output while preserving matching paths and errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["fd", "fdfind"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 10
		},
		counters: [{
			"name": "path",
			"pattern": "^(?!(fd: |\\[fd error\\]: )).+\\S.*$"
		}, {
			"name": "error",
			"pattern": "^(fd: |\\[fd error\\]: )"
		}]
	},
	{
		id: "filesystem/find",
		family: "filesystem-find",
		description: "Compact find output while preserving matches and failure context.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["find"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"^\\./.+",
			"^/.+",
			"Permission denied",
			"No such file"
		] },
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 10
		},
		counters: [{
			"name": "match",
			"pattern": "^(?!find: ).+\\S.*$"
		}, {
			"name": "permission denied",
			"pattern": "Permission denied",
			"flags": "i"
		}]
	},
	{
		id: "filesystem/git-ls-files",
		family: "filesystem-inventory",
		description: "Compact git ls-files output while preserving tracked path samples.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["git"],
			"gitSubcommands": ["ls-files"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 10
		},
		counters: [{
			"name": "path",
			"pattern": "^(?!fatal: ).+\\S.*$"
		}, {
			"name": "error",
			"pattern": "fatal:|error:",
			"flags": "i"
		}]
	},
	{
		id: "filesystem/ls",
		family: "filesystem-listing",
		description: "Compact ls output for directory listings.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["ls"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 10
		},
		counters: [{
			"name": "item",
			"pattern": "^(?!total\\s+\\d+).+\\S.*$"
		}]
	},
	{
		id: "filesystem/rg-files",
		family: "filesystem-inventory",
		description: "Compact rg --files output while preserving path samples and errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["rg"],
			"argvIncludes": [["--files"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 10
		},
		counters: [{
			"name": "path",
			"pattern": "^(?!rg: ).+\\S.*$"
		}, {
			"name": "error",
			"pattern": "^rg: "
		}]
	},
	{
		id: "generic/fallback",
		family: "generic",
		description: "Generic fallback reducer for line-oriented output.",
		match: {},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 20
		},
		counters: [{
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "warning",
			"flags": "i"
		}]
	},
	{
		id: "generic/help",
		family: "help",
		description: "Preserve command help output so agents can inspect available commands and flags.",
		priority: 25,
		match: {
			"toolNames": ["exec"],
			"argvIncludesAny": [["--help"], ["help"]],
			"commandIncludesAny": [" --help", " help"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 80,
			"tail": 40
		},
		failure: {
			"preserveOnFailure": true,
			"head": 80,
			"tail": 40
		}
	},
	{
		id: "git/branch",
		family: "git-branches",
		description: "Compact git branch output while preserving branch names and current branch context.",
		match: {
			"argv0": ["git"],
			"argvIncludes": [["branch"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 14,
			"tail": 4
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 12
		},
		counters: [{
			"name": "branch",
			"pattern": ".+"
		}]
	},
	{
		id: "git/diff-name-only",
		family: "git-diff",
		description: "Compact git diff --name-only output.",
		match: {
			"argv0": ["git"],
			"argvIncludes": [["diff"], ["--name-only"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 16,
			"tail": 4
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 12
		},
		counters: [{
			"name": "file",
			"pattern": ".+"
		}]
	},
	{
		id: "git/diff-stat",
		family: "git-diff",
		description: "Compact git diff --stat output.",
		match: {
			"argv0": ["git"],
			"argvIncludes": [["diff"], ["--stat"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 12
		},
		counters: [
			{
				"name": "file",
				"pattern": "\\|"
			},
			{
				"name": "insertion",
				"pattern": "insertions?\\(\\+\\)"
			},
			{
				"name": "deletion",
				"pattern": "deletions?\\(-\\)"
			}
		]
	},
	{
		id: "git/diff",
		family: "git-diff",
		description: "Compact full git diff patch output while preserving file and hunk headers plus changed lines.",
		match: {
			"toolNames": ["exec"],
			"commandIncludesAny": [
				"git diff ",
				"&& git diff ",
				"; git diff ",
				"\ngit diff "
			]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"^diff --git\\s+.+",
			"^new file mode\\s+.+",
			"^deleted file mode\\s+.+",
			"^similarity index\\s+.+",
			"^rename from\\s+.+",
			"^rename to\\s+.+",
			"^Binary files .+ differ$",
			"^---\\s+.+",
			"^\\+\\+\\+\\s+.+",
			"^@@\\s+.+",
			"^\\+(?!\\+\\+\\+).+",
			"^-(?!---).+",
			"^\\\\ No newline at end of file$",
			"^\\s*\\d+ files? changed.+",
			"^\\s*create mode .+",
			"^\\s*delete mode .+"
		] },
		summarize: {
			"head": 20,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 24,
			"tail": 16
		},
		counters: [
			{
				"name": "changed file",
				"pattern": "^diff --git\\s",
				"flags": "m"
			},
			{
				"name": "hunk",
				"pattern": "^@@\\s",
				"flags": "m"
			},
			{
				"name": "added line",
				"pattern": "^\\+(?!\\+\\+\\+).+",
				"flags": "m"
			},
			{
				"name": "removed line",
				"pattern": "^-(?!---).+",
				"flags": "m"
			}
		]
	},
	{
		id: "git/log-oneline",
		family: "git-history",
		description: "Compact git log --oneline output while preserving commits.",
		match: {
			"argv0": ["git"],
			"argvIncludes": [["log"], ["--oneline"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "commit",
			"pattern": "^[a-f0-9]{7,}\\s",
			"flags": "m"
		}]
	},
	{
		id: "git/remote-v",
		family: "git-remote",
		description: "Compact git remote -v output while preserving fetch/push remotes.",
		match: {
			"argv0": ["git"],
			"argvIncludes": [["remote"], ["-v"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 4
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 10
		},
		counters: [{
			"name": "remote",
			"pattern": "\\((fetch|push)\\)"
		}]
	},
	{
		id: "git/show",
		family: "git-show",
		description: "Compact git show output while preserving commit summary and diff stat.",
		match: {
			"argv0": ["git"],
			"argvIncludes": [["show"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"^commit\\s+.+",
			"^Author:\\s+.+",
			"^Date:\\s+.+",
			"^\\s{4}.+",
			"^diff --git\\s+.+",
			"^index\\s+[a-f0-9]+\\.[a-f0-9]+",
			"^---\\s+.+",
			"^\\+\\+\\+\\s+.+",
			"^@@\\s+.+",
			"^\\s*\\d+ files? changed.+",
			"^\\s*create mode .+",
			"^\\s*delete mode .+"
		] },
		summarize: {
			"head": 8,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "file",
			"pattern": "\\|"
		}, {
			"name": "commit",
			"pattern": "^commit\\s",
			"flags": "m"
		}]
	},
	{
		id: "git/stash-list",
		family: "git-stash",
		description: "Compact git stash list output while preserving stash entries.",
		match: {
			"argv0": ["git"],
			"argvIncludes": [["stash"], ["list"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 4
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 12
		},
		counters: [{
			"name": "stash",
			"pattern": "^stash@\\{\\d+\\}:",
			"flags": "m"
		}]
	},
	{
		id: "git/status",
		family: "git-status",
		description: "Compact human-readable git status output.",
		onEmpty: "working tree clean",
		match: {
			"argv0": ["git"],
			"argvIncludes": [["status"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "skipPatterns": [
			"^On branch ",
			"^Your branch is ",
			"^and have \\d+ and \\d+ different commits each.*$",
			"^\\(use \"git .+\" to .+\\)$",
			"^no changes added to commit.*$",
			"^nothing added to commit but untracked files present.*$",
			"^nothing to commit, working tree clean$",
			"^use \"git .+\" to .+"
		] },
		summarize: {
			"head": 10,
			"tail": 4
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [
			{
				"name": "modified file",
				"pattern": "^(?:M:|\\s*modified:|[ MTRU][MTRU]\\s+|[MTRU][ MTRU]\\s+)"
			},
			{
				"name": "new file",
				"pattern": "^(?:A:|\\s*new file:|A.\\s+|.A\\s+)"
			},
			{
				"name": "deleted file",
				"pattern": "^(?:D:|\\s*deleted:|D.\\s+|.D\\s+)"
			},
			{
				"name": "untracked file",
				"pattern": "^(?:\\?\\?:|\\?\\?\\s+|\\s*untracked files:)"
			}
		]
	},
	{
		id: "git/worktree-list",
		family: "git-worktree",
		description: "Compact git worktree list output while preserving worktree entries.",
		match: {
			"argv0": ["git"],
			"gitSubcommands": ["worktree"],
			"argvIncludes": [["list"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 4
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 10
		},
		counters: [{
			"name": "worktree",
			"pattern": "^/\\S",
			"flags": "m"
		}]
	},
	{
		id: "install/bun-install",
		family: "dependency-install",
		description: "Compact bun install output while preserving warnings and package counts.",
		matchOutput: [{
			"pattern": "Checked \\d+ installs? across \\d+ packages? \\(no changes\\)",
			"message": "bun install: up to date",
			"flags": "i"
		}],
		match: {
			"toolNames": ["exec"],
			"argv0": ["bun"],
			"argvIncludes": [["install"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "warning",
			"flags": "i"
		}, {
			"name": "package",
			"pattern": "\\bpackage(s)?\\b",
			"flags": "i"
		}]
	},
	{
		id: "install/npm-ci",
		family: "dependency-install",
		description: "Compact npm ci output while preserving warnings and audit summaries.",
		onEmpty: "npm ci: ok",
		matchOutput: [{
			"pattern": "up to date, audited \\d+ package",
			"message": "npm ci: up to date",
			"flags": "i"
		}],
		match: {
			"toolNames": ["exec"],
			"argv0": ["npm"],
			"argvIncludes": [["ci"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "skipPatterns": ["^npm notice .+"] },
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "warn",
			"flags": "i"
		}, {
			"name": "vulnerability",
			"pattern": "vulnerabilit",
			"flags": "i"
		}]
	},
	{
		id: "install/npm-install",
		family: "dependency-install",
		description: "Compact npm install output while preserving warnings and audit summaries.",
		onEmpty: "npm install: ok",
		matchOutput: [{
			"pattern": "up to date, audited \\d+ package",
			"message": "npm install: up to date",
			"flags": "i"
		}],
		match: {
			"toolNames": ["exec"],
			"argv0": ["npm"],
			"argvIncludes": [["install"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "skipPatterns": ["^npm notice .+"] },
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "warn",
			"flags": "i"
		}, {
			"name": "vulnerability",
			"pattern": "vulnerabilit",
			"flags": "i"
		}]
	},
	{
		id: "install/pnpm-install",
		family: "dependency-install",
		description: "Compact pnpm install output while preserving warnings and summary lines.",
		matchOutput: [{
			"pattern": "Already up to date",
			"message": "pnpm install: up to date",
			"flags": "i"
		}],
		match: {
			"toolNames": ["exec"],
			"argv0": ["pnpm"],
			"argvIncludes": [["install"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "warn",
			"flags": "i"
		}, {
			"name": "package",
			"pattern": "\\bpackages?\\b",
			"flags": "i"
		}]
	},
	{
		id: "install/yarn-install",
		family: "dependency-install",
		description: "Compact yarn install output while preserving warnings and summary lines.",
		matchOutput: [{
			"pattern": "Already up-to-date\\.",
			"message": "yarn install: up to date"
		}],
		match: {
			"toolNames": ["exec"],
			"argv0": ["yarn"],
			"argvIncludes": [["install"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "warning",
			"flags": "i"
		}, {
			"name": "package",
			"pattern": "\\bpackages?\\b",
			"flags": "i"
		}]
	},
	{
		id: "lint/biome",
		family: "lint-results",
		description: "Compact Biome output while preserving diagnostics.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["biome"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 14,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "error",
			"pattern": "\\berror\\b",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "\\bwarning\\b",
			"flags": "i"
		}]
	},
	{
		id: "lint/eslint",
		family: "lint-results",
		description: "Compact ESLint output while preserving file diagnostics and summary counts.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["eslint"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"^.+\\.(ts|tsx|js|jsx|mjs|cjs)$",
			"^\\s*\\d+:\\d+\\s+(error|warning)\\s+.+",
			"^✖\\s+.+",
			"^\\d+ problems?\\s+\\(.+\\)$",
			"^\\s*error\\s+.+",
			"^\\s*warning\\s+.+"
		] },
		summarize: {
			"head": 10,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "\\berror\\b",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "\\bwarning\\b",
			"flags": "i"
		}]
	},
	{
		id: "lint/oxlint",
		family: "lint-results",
		description: "Compact Oxlint output while preserving diagnostics.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["oxlint"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 14,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "error",
			"pattern": "\\berror\\b",
			"flags": "i"
		}, {
			"name": "warning",
			"pattern": "\\bwarning\\b",
			"flags": "i"
		}]
	},
	{
		id: "lint/prettier-check",
		family: "lint-results",
		description: "Compact Prettier check output while preserving unformatted files.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["prettier", "--check"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "warn",
			"flags": "i"
		}, {
			"name": "file",
			"pattern": "\\[[^\\]]+\\]"
		}]
	},
	{
		id: "media/ffmpeg",
		family: "media-cli",
		description: "Compact ffmpeg output while preserving stream mapping, progress, and terminal errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["ffmpeg"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|invalid|failed|frame=",
			"flags": "i"
		}]
	},
	{
		id: "media/mediainfo",
		family: "media-cli",
		description: "Compact mediainfo output while preserving format, duration, and stream details.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["mediainfo"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "error|failed|duration|format",
			"flags": "i"
		}]
	},
	{
		id: "network/curl",
		family: "network-http",
		description: "Compact curl output while preserving response or failure details.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["curl"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|timed out",
			"flags": "i"
		}]
	},
	{
		id: "network/dig",
		family: "network-dns",
		description: "Compact dig output while preserving answer sections and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["dig"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "answer",
			"pattern": "ANSWER SECTION|\\sIN\\sA\\s|\\sIN\\sAAAA\\s",
			"flags": "i"
		}]
	},
	{
		id: "network/nslookup",
		family: "network-dns",
		description: "Compact nslookup output while preserving server and answer rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["nslookup"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "server",
			"pattern": "^Server:",
			"flags": "m"
		}]
	},
	{
		id: "network/ping",
		family: "network-probe",
		description: "Compact ping output while preserving packet loss and latency summary.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["ping"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [{
			"name": "reply",
			"pattern": "bytes from",
			"flags": "i"
		}, {
			"name": "packet loss",
			"pattern": "packet loss",
			"flags": "i"
		}]
	},
	{
		id: "network/ssh",
		family: "network-remote-shell",
		description: "Compact ssh output while preserving authentication and connection errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["ssh"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "permission denied|connection refused|timed out|host key verification failed",
			"flags": "i"
		}]
	},
	{
		id: "network/traceroute",
		family: "network-route",
		description: "Compact traceroute output while preserving hop rows and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["traceroute"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 12
		},
		counters: [{
			"name": "hop",
			"pattern": "^\\s*\\d+\\s",
			"flags": "m"
		}]
	},
	{
		id: "network/wget",
		family: "network-http",
		description: "Compact wget output while preserving transfer summary and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["wget"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed",
			"flags": "i"
		}]
	},
	{
		id: "observability/free",
		family: "resource-memory",
		description: "Compact free output while preserving memory and swap totals.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["free"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "warning",
			"pattern": "error|failed",
			"flags": "i"
		}]
	},
	{
		id: "observability/htop",
		family: "resource-processes",
		description: "Compact htop output while preserving load, tasks, and top process lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["htop"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [{
			"name": "warning",
			"pattern": "load average|tasks|zombie",
			"flags": "i"
		}]
	},
	{
		id: "observability/iostat",
		family: "resource-io",
		description: "Compact iostat output while preserving CPU averages and busy devices.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["iostat"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [{
			"name": "busy",
			"pattern": "%util|Device",
			"flags": "i"
		}]
	},
	{
		id: "observability/top",
		family: "resource-processes",
		description: "Compact top output while preserving load, task counts, and leading process rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["top"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [{
			"name": "warning",
			"pattern": "load average|zombie|stopped",
			"flags": "i"
		}]
	},
	{
		id: "observability/vmstat",
		family: "resource-vm",
		description: "Compact vmstat output while preserving run queue, memory, swap, and io columns.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["vmstat"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "warning",
			"pattern": "swpd|cache|wa|st",
			"flags": "i"
		}]
	},
	{
		id: "openclaw/sessions-history",
		family: "openclaw",
		description: "Reduce OpenClaw sessions_history tool output by stripping internal metadata (api, provider, model, responseId, __openclaw, thinking blocks) while preserving message content, roles, timestamps, and provenance.",
		priority: 100,
		match: { "toolNames": ["sessions_history"] },
		filters: { "skipPatterns": [
			"^\\s*\"api\":",
			"^\\s*\"provider\":",
			"^\\s*\"model\":",
			"^\\s*\"stopReason\":",
			"^\\s*\"responseId\":",
			"^\\s*\"__openclaw\":",
			"^\\s*\"id\": \"[a-f0-9]{8}\"\\s*,?\\s*$",
			"^\\s*\"seq\":",
			"^\\s*\"contentTruncated\":",
			"^\\s*\"contentRedacted\":",
			"^\\s*\"droppedMessages\":",
			"^\\s*\"bytes\":",
			"^\\s*\"partialJson\":",
			"^\\s*\"toolCallId\":",
			"^\\s*\"type\": \"thinking\"",
			"^\\s*\"thinking\":",
			"^\\s*\\{\\s*$",
			"^\\s*\\}\\s*,?\\s*$",
			"^\\s*\\[\\s*$",
			"^\\s*\\]\\s*,?\\s*$"
		] },
		transforms: {
			"prettyPrintJson": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 40,
			"tail": 20
		},
		failure: {
			"preserveOnFailure": true,
			"head": 60,
			"tail": 30
		},
		counters: [{
			"name": "message",
			"pattern": "\"role\":",
			"flags": "i"
		}, {
			"name": "blocker",
			"pattern": "BLOCK|blocked",
			"flags": "i"
		}]
	},
	{
		id: "package/apt-install",
		family: "system-package-install",
		description: "Compact apt install output while preserving package counts, fetch summaries, and errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["apt", "apt-get"],
			"argvIncludes": [["install"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "skipPatterns": ["^Reading database \\.{3}.+$"] },
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|unable to",
			"flags": "i"
		}]
	},
	{
		id: "package/apt-upgrade",
		family: "system-package-upgrade",
		description: "Compact apt upgrade output while preserving upgraded package counts and blocking errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["apt", "apt-get"],
			"argvIncludes": [["upgrade"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "skipPatterns": ["^Reading database \\.{3}.+$"] },
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|kept back",
			"flags": "i"
		}]
	},
	{
		id: "package/brew-install",
		family: "system-package-install",
		description: "Compact brew install output while preserving taps, installs, and failure details.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["brew"],
			"argvIncludes": [["install"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "warning|error|failed",
			"flags": "i"
		}]
	},
	{
		id: "package/brew-upgrade",
		family: "system-package-upgrade",
		description: "Compact brew upgrade output while preserving upgraded formulae and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["brew"],
			"argvIncludes": [["upgrade"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "warning|error|failed",
			"flags": "i"
		}]
	},
	{
		id: "package/composer",
		family: "package-manager",
		description: "Compact Composer output while preserving package operations, solver failures, and script errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["composer"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "package",
			"pattern": "Installing|Updating|Locking|Removing|Generating autoload",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "Your requirements could not be resolved|Script .* returned with error|failed|error",
			"flags": "i"
		}]
	},
	{
		id: "package/dnf-install",
		family: "system-package-install",
		description: "Compact dnf install output while preserving transaction summaries and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["dnf"],
			"argvIncludes": [["install"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|nothing to do",
			"flags": "i"
		}]
	},
	{
		id: "package/fnm",
		family: "runtime-manager",
		description: "Compact fnm output while preserving installs, selected versions, and lookup failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["fnm"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "version",
			"pattern": "Installing|Using|Downloading|v\\d+\\.\\d+\\.\\d+",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "error|failed|not found",
			"flags": "i"
		}]
	},
	{
		id: "package/npm-ls",
		family: "package-manager",
		description: "Compact npm ls output while preserving dependency tree roots, invalid packages, and missing peers.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["npm"],
			"argvIncludesAny": [["ls"], ["list"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "problem",
			"pattern": "UNMET|invalid|extraneous|missing|npm ERR!",
			"flags": "i"
		}]
	},
	{
		id: "package/yum-install",
		family: "system-package-install",
		description: "Compact yum install output while preserving dependency summaries and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["yum"],
			"argvIncludes": [["install"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|nothing to do",
			"flags": "i"
		}]
	},
	{
		id: "search/git-grep",
		family: "search",
		description: "Compact git grep output while preserving matches.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["git"],
			"argvIncludes": [["grep"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 4
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 10
		},
		counters: [{
			"name": "match",
			"pattern": ".+:.+"
		}]
	},
	{
		id: "search/grep",
		family: "search",
		description: "Compact grep output while preserving matching lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["grep"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"^.+:\\d+[: -].+",
			"^.+:.+",
			"error|warn|binary file|permission denied|no such file",
			"^\\d+ matches?$",
			"^\\d+ files? matched$"
		] },
		summarize: {
			"head": 10,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [{
			"name": "match",
			"pattern": ".+:.+"
		}]
	},
	{
		id: "search/rg",
		family: "search",
		description: "Compact ripgrep output while preserving match lines.",
		match: {
			"argv0": ["rg"],
			"toolNames": ["exec"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"^.+:\\d+[: -].+",
			"^.+:.+",
			"error|warn|binary file|permission denied|no such file",
			"^\\d+ matches?$",
			"^\\d+ files? matched$"
		] },
		summarize: {
			"head": 10,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 12
		},
		counters: [{
			"name": "match",
			"pattern": ".+:.+"
		}]
	},
	{
		id: "service/journalctl",
		family: "service-logs",
		description: "Compact journalctl output while preserving key log lines and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["journalctl"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"error|warn|fatal|panic|exception|traceback|timeout|refused|fail",
			"^Caused by:",
			"^Traceback"
		] },
		summarize: {
			"head": 8,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "warning",
			"pattern": "warn",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "error|failed",
			"flags": "i"
		}]
	},
	{
		id: "service/launchctl",
		family: "service-state",
		description: "Compact launchctl output while preserving labels and status rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["launchctl"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"^-?\\d+\\s+\\S+\\s+.+",
			"^PID\\s+Status\\s+Label$",
			"error|failed|stopped|disabled"
		] },
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "service",
			"pattern": "^(?!PID\\s+Status\\s+Label$).+\\S.*$"
		}, {
			"name": "error",
			"pattern": "error|failed|stopped|disabled",
			"flags": "i"
		}]
	},
	{
		id: "service/lsof",
		family: "service-open-files",
		description: "Compact lsof output while preserving open-file rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["lsof"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "entry",
			"pattern": "^(?!COMMAND\\s+PID\\s+USER\\s).+\\S.*$"
		}]
	},
	{
		id: "service/netstat",
		family: "service-network-state",
		description: "Compact netstat output while preserving socket rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["netstat"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "socket",
			"pattern": "^(?!Proto\\s|Active\\s).+\\S.*$"
		}]
	},
	{
		id: "service/pm2",
		family: "service-process-manager",
		description: "Compact pm2 output while preserving process state, log errors, and restart failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["pm2"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 16
		},
		counters: [{
			"name": "process",
			"pattern": "online|stopped|errored|restarting|launching",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "error|failed|exception|EADDRINUSE",
			"flags": "i"
		}]
	},
	{
		id: "service/service",
		family: "service-state",
		description: "Compact service command output while preserving status and failure lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["service"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"error|failed|inactive|stopped|warning|refused|timeout",
			"is running",
			"is stopped",
			"start/running",
			"stop/waiting",
			"^\\s*Active:\\s+.+",
			"^\\s*Status:\\s+.+"
		] },
		summarize: {
			"head": 8,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "warning",
			"pattern": "warning|refused|timeout",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "error|failed|inactive|stopped",
			"flags": "i"
		}]
	},
	{
		id: "service/ss",
		family: "service-network-state",
		description: "Compact ss output while preserving socket rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["ss"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "socket",
			"pattern": "^(?!Netid\\s|State\\s).+\\S.*$"
		}]
	},
	{
		id: "service/systemctl-status",
		family: "service-state",
		description: "Compact systemctl status output while preserving active state and failure lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["systemctl"],
			"argvIncludes": [["status"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "keepPatterns": [
			"^●\\s+.+",
			"^\\s*(Loaded|Active|Main PID|Tasks|Memory|CPU):",
			"error|failed|inactive|dead|back-off|timeout|refused|warning",
			"^\\s*Process:\\s+.+",
			"^\\s*Docs:\\s+.+"
		] },
		summarize: {
			"head": 8,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "warning",
			"pattern": "warning|back-off|timeout|refused",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "failed|inactive|dead|error",
			"flags": "i"
		}]
	},
	{
		id: "system/df",
		family: "system-disk",
		description: "Compact df output while preserving filesystem rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["df"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 4
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 12
		},
		counters: [{
			"name": "filesystem",
			"pattern": ".+"
		}]
	},
	{
		id: "system/du",
		family: "system-disk",
		description: "Compact du output while preserving size rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["du"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 10
		},
		counters: [{
			"name": "entry",
			"pattern": "^\\S+\\s+.+"
		}]
	},
	{
		id: "system/file",
		family: "file-inspection",
		description: "Compact file output while preserving the detected file type.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["file"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "warning",
			"pattern": "cannot open|error",
			"flags": "i"
		}]
	},
	{
		id: "system/ps",
		family: "system-processes",
		description: "Compact ps output while preserving process rows.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["ps"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 12,
			"tail": 10
		},
		counters: [{
			"name": "process",
			"pattern": "^(?!USER\\s|PID\\s).+\\S.*$"
		}]
	},
	{
		id: "task/env",
		family: "shell-runner",
		description: "Compact env-prefixed command output while preserving wrapped command failures.",
		priority: 1,
		match: {
			"toolNames": ["exec"],
			"argv0": ["env"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "error",
			"pattern": "env:|error|failed|not found|permission denied",
			"flags": "i"
		}]
	},
	{
		id: "task/just",
		family: "task-runner",
		description: "Compact just output while preserving task results and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["just"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 16
		},
		counters: [{
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}]
	},
	{
		id: "task/make",
		family: "task-runner",
		description: "Compact make output while preserving target failures and summaries.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["make"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 16
		},
		counters: [{
			"name": "error",
			"pattern": "error",
			"flags": "i"
		}]
	},
	{
		id: "task/mise",
		family: "task-runner",
		description: "Compact mise output while preserving task results, tool installs, and failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["mise"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "install",
			"pattern": "Downloading|Extracting|Installing|Installed",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "error|failed|not found|exit status",
			"flags": "i"
		}]
	},
	{
		id: "task/node",
		family: "runtime-cli",
		description: "Compact node output while preserving stack traces, uncaught errors, and process failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["node"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 20,
			"tail": 20
		},
		counters: [{
			"name": "error",
			"pattern": "Error:|TypeError:|ReferenceError:|SyntaxError:|UnhandledPromiseRejection|ERR_",
			"flags": "i"
		}]
	},
	{
		id: "task/php",
		family: "runtime-cli",
		description: "Compact php output while preserving fatal errors, warnings, and failed scripts.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["php"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 20,
			"tail": 20
		},
		counters: [{
			"name": "error",
			"pattern": "PHP Fatal error|PHP Warning|Parse error|Exception|failed",
			"flags": "i"
		}]
	},
	{
		id: "task/python",
		family: "runtime-cli",
		description: "Compact Python output while preserving tracebacks, exceptions, and failed scripts.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["python", "python3"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 20,
			"tail": 20
		},
		counters: [{
			"name": "error",
			"pattern": "Traceback|Error:|Exception|SyntaxError|ModuleNotFoundError|FAILED",
			"flags": "i"
		}]
	},
	{
		id: "task/ruby",
		family: "runtime-cli",
		description: "Compact ruby output while preserving exceptions, load errors, and failed scripts.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["ruby"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 20,
			"tail": 20
		},
		counters: [{
			"name": "error",
			"pattern": "Traceback|Error|Exception|LoadError|NoMethodError|failed",
			"flags": "i"
		}]
	},
	{
		id: "task/uv",
		family: "python-task-runner",
		description: "Compact uv output while preserving environment setup, package changes, and command failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["uv"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "package",
			"pattern": "Resolved|Prepared|Installed|Uninstalled|Audited",
			"flags": "i"
		}, {
			"name": "error",
			"pattern": "error|failed|Traceback|FAILED|exit code",
			"flags": "i"
		}]
	},
	{
		id: "tests/bun-test",
		family: "test-results",
		description: "Compact bun test output while preserving failures and summary lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["bun"],
			"argvIncludes": [["test"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^> .+$",
				"^\\s*RUN\\s+.+$",
				"^\\s*Start at\\s+.+$"
			],
			"keepPatterns": [
				"^\\s*❯\\s+.+",
				"^\\s*✓\\s+.+",
				"^\\s*FAIL\\s+.+",
				"^\\s*PASS\\s+.+",
				"^AssertionError: .+",
				"^Error: .+",
				"^Caused by: .+",
				"^\\s*Test Files\\s+.+",
				"^\\s*Tests\\s+.+",
				"^\\s*Duration\\s+.+",
				"^⎯⎯⎯.+"
			]
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "failed",
			"pattern": "fail",
			"flags": "i"
		}, {
			"name": "passed",
			"pattern": "pass",
			"flags": "i"
		}]
	},
	{
		id: "tests/cargo-test",
		family: "test-results",
		description: "Compact cargo test output while preserving failures and final summary.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["cargo"],
			"argvIncludes": [["test"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "skipPatterns": [
			"^\\s*Compiling .+",
			"^\\s*Finished .+",
			"^\\s*Running .+"
		] },
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "failed test",
			"pattern": "FAILED"
		}, {
			"name": "passed test",
			"pattern": "ok"
		}]
	},
	{
		id: "tests/go-test",
		family: "test-results",
		description: "Compact go test output while preserving failing packages and summaries.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["go"],
			"argvIncludes": [["test"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": ["^ok\\s.+"],
			"keepPatterns": [
				"^FAIL\\s.+",
				"^--- FAIL: .+",
				"^panic: .+",
				"^\\s+.+_test\\.go:\\d+: .+",
				"^\\s+Error Trace: .+",
				"^\\s+Error: .+"
			]
		},
		summarize: {
			"head": 10,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "failed package",
			"pattern": "^FAIL\\s",
			"flags": "m"
		}, {
			"name": "passed package",
			"pattern": "^ok\\s",
			"flags": "m"
		}]
	},
	{
		id: "tests/jest",
		family: "test-results",
		description: "Compact Jest output while preserving failures and summary counts.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["jest"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: { "skipPatterns": ["^\\s*at .+", "^Ran all test suites.*$"] },
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 16
		},
		counters: [{
			"name": "failed test",
			"pattern": "^FAIL\\s",
			"flags": "m"
		}, {
			"name": "passed suite",
			"pattern": "^PASS\\s",
			"flags": "m"
		}]
	},
	{
		id: "tests/mocha",
		family: "test-results",
		description: "Compact Mocha output while preserving failing tests and summary counts.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["mocha"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "failing",
			"pattern": "\\bfailing\\b",
			"flags": "i"
		}, {
			"name": "passing",
			"pattern": "\\bpassing\\b",
			"flags": "i"
		}]
	},
	{
		id: "tests/npm-test",
		family: "test-results",
		description: "Catch common npm test runs when the underlying runner is not explicit.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["npm"],
			"argvIncludes": [["test"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^> .+$",
				"^\\s*RUN\\s+.+$",
				"^\\s*Start at\\s+.+$"
			],
			"keepPatterns": [
				"^\\s*❯\\s+.+",
				"^\\s*✓\\s+.+",
				"^\\s*FAIL\\s+.+",
				"^\\s*PASS\\s+.+",
				"^AssertionError: .+",
				"^Error: .+",
				"^Caused by: .+",
				"^\\s*Test Files\\s+.+",
				"^\\s*Tests\\s+.+",
				"^\\s*Duration\\s+.+",
				"^⎯⎯⎯.+"
			]
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 16
		},
		counters: [{
			"name": "failed",
			"pattern": "fail",
			"flags": "i"
		}, {
			"name": "passed",
			"pattern": "pass",
			"flags": "i"
		}]
	},
	{
		id: "tests/playwright",
		family: "test-results",
		description: "Compact Playwright test output while preserving failing specs and summary lines.",
		match: {
			"toolNames": ["exec"],
			"argv0": [
				"playwright",
				"pnpm",
				"npx",
				"bunx",
				"yarn",
				"npm"
			],
			"argvIncludes": [["playwright"], ["test"]],
			"commandIncludes": ["playwright", "test"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 18
		},
		counters: [{
			"name": "failed",
			"pattern": "\\bfailed\\b",
			"flags": "i"
		}, {
			"name": "passed",
			"pattern": "\\bpassed\\b",
			"flags": "i"
		}]
	},
	{
		id: "tests/pnpm-test",
		family: "test-results",
		description: "Catch common pnpm test runs when the underlying runner is not explicit.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["pnpm"],
			"argvIncludes": [["test"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^> .+$",
				"^\\s*RUN\\s+.+$",
				"^\\s*Start at\\s+.+$"
			],
			"keepPatterns": [
				"^\\s*❯\\s+.+",
				"^\\s*✓\\s+.+",
				"^\\s*FAIL\\s+.+",
				"^\\s*PASS\\s+.+",
				"^AssertionError: .+",
				"^Error: .+",
				"^Caused by: .+",
				"^\\s*Test Files\\s+.+",
				"^\\s*Tests\\s+.+",
				"^\\s*Duration\\s+.+",
				"^⎯⎯⎯.+"
			]
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 16
		},
		counters: [{
			"name": "failed",
			"pattern": "fail",
			"flags": "i"
		}, {
			"name": "passed",
			"pattern": "pass",
			"flags": "i"
		}]
	},
	{
		id: "tests/pytest",
		family: "test-results",
		description: "Compact pytest output while preserving failures and final summary.",
		counterSource: "preKeep",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["pytest"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^platform .+",
				"^rootdir: .+",
				"^plugins: .+",
				"^collected \\d+ items$"
			],
			"keepPatterns": [
				"^=+.+(failed|passed|error).+=+$",
				"^_{2,}.+_{2,}$",
				"^FAILED .+",
				"^ERROR .+",
				"^E\\s+.+",
				"AssertionError",
				"^.+::.+ (FAILED|ERROR)$",
				"^>\\s+.+"
			]
		},
		summarize: {
			"head": 10,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "failed test",
			"pattern": "^.+::.+ (FAILED|ERROR)$",
			"flags": "i"
		}, {
			"name": "passed test",
			"pattern": "^.+::.+ PASSED$",
			"flags": "i"
		}]
	},
	{
		id: "tests/rspec",
		family: "test-results",
		description: "Compact RSpec output while preserving examples, failures, and summary counts.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["rspec", "bundle"],
			"commandIncludesAny": ["rspec"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 12
		},
		failure: {
			"preserveOnFailure": true,
			"head": 20,
			"tail": 20
		},
		counters: [{
			"name": "failing",
			"pattern": "Failures:|\\d+\\) |failed|examples?, \\d+ failures?",
			"flags": "i"
		}]
	},
	{
		id: "tests/swift-test",
		family: "test-results",
		description: "Compact swift test output while preserving compile diagnostics, failing tests, and final summaries.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["swift"],
			"argvIncludes": [["test"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^\\[\\d+/\\d+\\]\\s+.+$",
				"^Building for .+\\.\\.\\.$",
				"^Planning build$",
				"^Test Case '.+' started\\.$",
				"^Test Case '.+' passed .+$",
				"^Test Suite '.+' started at .+$"
			],
			"keepPatterns": [
				"^.+:\\d+:\\d+: error: .+",
				"^.+:\\d+:\\d+: warning: .+",
				"^.+:\\d+: error: .+",
				"^.+:\\d+: warning: .+",
				"^error: .+",
				"^warning: .+",
				"^note: .+",
				"^Test Case '.+' failed .+$",
				"^Test Suite '.+' failed at .+$",
				"^\\s*Executed \\d+ tests?, with \\d+ failures?.+$",
				"^Test run with .+ failed.+$",
				"^[✘✖✗] .+$",
				"^.+(?:Assertion|Expectation) failed:.+$"
			]
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 18,
			"tail": 16
		},
		counters: [
			{
				"name": "error",
				"pattern": "error",
				"flags": "i"
			},
			{
				"name": "warning",
				"pattern": "warning",
				"flags": "i"
			},
			{
				"name": "failed test",
				"pattern": "(?:^Test Case '.+' failed .+$|^[✘✖✗] .+$)",
				"flags": "m"
			}
		]
	},
	{
		id: "tests/vitest",
		family: "test-results",
		description: "Compact Vitest output while preserving failures and summary lines.",
		match: {
			"toolNames": ["exec"],
			"commandIncludes": ["vitest"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^\\s*at .+",
				"^\\s*❯ .+node_modules.+",
				"^\\s*✓ .+"
			],
			"keepPatterns": [
				"^\\s*RUN\\s+",
				"^\\s*❯\\s+.+",
				"^\\s*FAIL\\s+.+",
				"^AssertionError: .+",
				"^Error: .+",
				"^Caused by: .+",
				"^\\s*Test Files\\s+.+",
				"^\\s*Tests\\s+.+",
				"^   Start at\\s+.+",
				"^   Duration\\s+.+",
				"^⎯⎯⎯.+"
			]
		},
		summarize: {
			"head": 10,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "failed suite",
			"pattern": "^\\s*❯\\s.+",
			"flags": "m"
		}, {
			"name": "failure",
			"pattern": "failed",
			"flags": "i"
		}]
	},
	{
		id: "tests/yarn-test",
		family: "test-results",
		description: "Catch common yarn test runs when the underlying runner is not explicit.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["yarn"],
			"argvIncludes": [["test"]]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		filters: {
			"skipPatterns": [
				"^> .+$",
				"^\\s*RUN\\s+.+$",
				"^\\s*Start at\\s+.+$"
			],
			"keepPatterns": [
				"^\\s*❯\\s+.+",
				"^\\s*✓\\s+.+",
				"^\\s*FAIL\\s+.+",
				"^\\s*PASS\\s+.+",
				"^AssertionError: .+",
				"^Error: .+",
				"^Caused by: .+",
				"^\\s*Test Files\\s+.+",
				"^\\s*Tests\\s+.+",
				"^\\s*Duration\\s+.+",
				"^⎯⎯⎯.+"
			]
		},
		summarize: {
			"head": 12,
			"tail": 10
		},
		failure: {
			"preserveOnFailure": true,
			"head": 16,
			"tail": 16
		},
		counters: [{
			"name": "failed",
			"pattern": "fail",
			"flags": "i"
		}, {
			"name": "passed",
			"pattern": "pass",
			"flags": "i"
		}]
	},
	{
		id: "text/wc",
		family: "text-processing",
		description: "Compact wc output while preserving counts and read errors.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["wc"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 12,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "count",
			"pattern": "^\\s*\\d+",
			"flags": "m"
		}, {
			"name": "error",
			"pattern": "No such file|Permission denied|cannot open",
			"flags": "i"
		}]
	},
	{
		id: "transfer/rsync",
		family: "file-transfer",
		description: "Compact rsync output while preserving changed paths, stats, and sync failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["rsync"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 10,
			"tail": 8
		},
		failure: {
			"preserveOnFailure": true,
			"head": 14,
			"tail": 14
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|connection|sent ",
			"flags": "i"
		}]
	},
	{
		id: "transfer/scp",
		family: "file-transfer",
		description: "Compact scp output while preserving transferred paths, throughput, and ssh failures.",
		match: {
			"toolNames": ["exec"],
			"argv0": ["scp"]
		},
		transforms: {
			"stripAnsi": true,
			"dedupeAdjacent": true,
			"trimEmptyEdges": true
		},
		summarize: {
			"head": 8,
			"tail": 6
		},
		failure: {
			"preserveOnFailure": true,
			"head": 10,
			"tail": 10
		},
		counters: [{
			"name": "error",
			"pattern": "error|failed|permission denied|lost connection",
			"flags": "i"
		}]
	}
];
//#endregion
//#region node_modules/tokenjuice/dist/core/validate-rules.js
function hasNulByte(value) {
	return value.includes("\0");
}
function validateSafeString(value, path, errors, { allowEmpty = false } = {}) {
	if (typeof value !== "string") {
		errors.push(`${path} must be a string`);
		return;
	}
	if (!allowEmpty && value.length === 0) errors.push(`${path} must be a non-empty string`);
	if (hasNulByte(value)) errors.push(`${path} must not contain NUL bytes`);
}
function validatePositiveInteger(value, path, errors) {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) errors.push(`${path} must be a non-negative integer`);
}
function isRecord$2(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStringArray(value) {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function validateMatch(value, path) {
	if (!isRecord$2(value)) return [`${path} must be an object`];
	const errors = [];
	if ("toolNames" in value && !isStringArray(value.toolNames)) errors.push(`${path}.toolNames must be an array of strings`);
	if ("argv0" in value && !isStringArray(value.argv0)) errors.push(`${path}.argv0 must be an array of strings`);
	if ("gitSubcommands" in value && !isStringArray(value.gitSubcommands)) errors.push(`${path}.gitSubcommands must be an array of strings`);
	if ("commandIncludes" in value && !isStringArray(value.commandIncludes)) errors.push(`${path}.commandIncludes must be an array of strings`);
	if ("commandIncludesAny" in value && !isStringArray(value.commandIncludesAny)) errors.push(`${path}.commandIncludesAny must be an array of strings`);
	if ("argvIncludes" in value) {
		if (!Array.isArray(value.argvIncludes) || !value.argvIncludes.every(isStringArray)) errors.push(`${path}.argvIncludes must be an array of string arrays`);
	}
	if ("argvIncludesAny" in value) {
		if (!Array.isArray(value.argvIncludesAny) || !value.argvIncludesAny.every(isStringArray)) errors.push(`${path}.argvIncludesAny must be an array of string arrays`);
	}
	return errors;
}
function validateCounter(value, path) {
	if (!isRecord$2(value)) return [`${path} must be an object`];
	const errors = [];
	validateSafeString(value.name, `${path}.name`, errors);
	validateSafeString(value.pattern, `${path}.pattern`, errors);
	if ("flags" in value) validateSafeString(value.flags, `${path}.flags`, errors, { allowEmpty: true });
	return errors;
}
function validateOutputMatch(value, path) {
	if (!isRecord$2(value)) return [`${path} must be an object`];
	const errors = [];
	validateSafeString(value.pattern, `${path}.pattern`, errors);
	validateSafeString(value.message, `${path}.message`, errors);
	if ("flags" in value) validateSafeString(value.flags, `${path}.flags`, errors, { allowEmpty: true });
	return errors;
}
function validateOptionalStringArrayObject(value, path, keys) {
	if (!isRecord$2(value)) return [`${path} must be an object`];
	const errors = [];
	for (const key of keys) if (key in value && !isStringArray(value[key])) errors.push(`${path}.${key} must be an array of strings`);
	return errors;
}
function validateOptionalNumberObject(value, path, keys) {
	if (!isRecord$2(value)) return [`${path} must be an object`];
	const errors = [];
	for (const key of keys) if (key in value) validatePositiveInteger(value[key], `${path}.${key}`, errors);
	return errors;
}
function validateOptionalBooleanObject(value, path, keys) {
	if (!isRecord$2(value)) return [`${path} must be an object`];
	const errors = [];
	for (const key of keys) if (key in value && typeof value[key] !== "boolean") errors.push(`${path}.${key} must be a boolean`);
	return errors;
}
function validateRule(raw) {
	if (!isRecord$2(raw)) return {
		ok: false,
		errors: ["rule must be an object"]
	};
	const errors = [];
	validateSafeString(raw.id, "id", errors);
	validateSafeString(raw.family, "family", errors);
	if ("description" in raw) validateSafeString(raw.description, "description", errors, { allowEmpty: true });
	if ("onEmpty" in raw) validateSafeString(raw.onEmpty, "onEmpty", errors);
	if ("counterSource" in raw && raw.counterSource !== "postKeep" && raw.counterSource !== "preKeep") errors.push("counterSource must be one of: postKeep, preKeep");
	if ("priority" in raw && (typeof raw.priority !== "number" || !Number.isFinite(raw.priority))) errors.push("priority must be a finite number");
	if (!("match" in raw)) errors.push("match is required");
	else errors.push(...validateMatch(raw.match, "match"));
	if ("filters" in raw) errors.push(...validateOptionalStringArrayObject(raw.filters, "filters", ["skipPatterns", "keepPatterns"]));
	if ("transforms" in raw) errors.push(...validateOptionalBooleanObject(raw.transforms, "transforms", [
		"stripAnsi",
		"prettyPrintJson",
		"dedupeAdjacent",
		"trimEmptyEdges"
	]));
	if ("summarize" in raw) errors.push(...validateOptionalNumberObject(raw.summarize, "summarize", ["head", "tail"]));
	if ("failure" in raw) {
		errors.push(...validateOptionalBooleanObject(raw.failure, "failure", ["preserveOnFailure"]));
		errors.push(...validateOptionalNumberObject(raw.failure, "failure", ["head", "tail"]));
	}
	if ("counters" in raw) if (!Array.isArray(raw.counters)) errors.push("counters must be an array");
	else raw.counters.forEach((counter, index) => {
		errors.push(...validateCounter(counter, `counters[${index}]`));
	});
	if ("matchOutput" in raw) if (!Array.isArray(raw.matchOutput)) errors.push("matchOutput must be an array");
	else raw.matchOutput.forEach((entry, index) => {
		errors.push(...validateOutputMatch(entry, `matchOutput[${index}]`));
	});
	if (errors.length > 0) return {
		ok: false,
		errors
	};
	return { ok: true };
}
function assertValidRule(raw) {
	const validation = validateRule(raw);
	if (!validation.ok) throw new Error(`invalid rule:\n- ${validation.errors.join("\n- ")}`);
}
//#endregion
//#region node_modules/tokenjuice/dist/core/rules.js
const ruleCache = /* @__PURE__ */ new Map();
function builtinRulesRoot() {
	return resolve(fileURLToPath(new URL("../rules", import.meta.url)));
}
function mergeRegexFlags(flags) {
	return [...new Set(`u${flags ?? ""}`.split(""))].join("");
}
function compileRule(descriptor) {
	return {
		rule: descriptor.rule,
		source: descriptor.source,
		path: descriptor.path,
		compiled: {
			skipPatterns: (descriptor.rule.filters?.skipPatterns ?? []).map((pattern) => new RegExp(pattern, "u")),
			keepPatterns: (descriptor.rule.filters?.keepPatterns ?? []).map((pattern) => new RegExp(pattern, "u")),
			counters: (descriptor.rule.counters ?? []).map((counter) => ({
				name: counter.name,
				pattern: new RegExp(counter.pattern, mergeRegexFlags(counter.flags))
			})),
			outputMatches: (descriptor.rule.matchOutput ?? []).map((entry) => ({
				pattern: new RegExp(entry.pattern, mergeRegexFlags(entry.flags)),
				message: entry.message
			}))
		}
	};
}
async function listRuleFiles(root) {
	const resolvedRoot = await realpath(root).catch(() => null);
	if (!resolvedRoot) return [];
	const rootRealPath = resolvedRoot;
	async function walk(currentDir) {
		const entries = (await readdir(currentDir, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
		return (await Promise.all(entries.map(async (entry) => {
			const fullPath = join(currentDir, entry.name);
			if (entry.isSymbolicLink()) return [];
			if (entry.isDirectory()) return await walk(fullPath);
			if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.endsWith(".schema.json") || entry.name.endsWith(".fixture.json")) return [];
			const realFilePath = await realpath(fullPath).catch(() => null);
			if (!realFilePath) return [];
			const relativePath = relative(rootRealPath, realFilePath);
			if (relativePath.startsWith("..") || isAbsolute(relativePath)) return [];
			return [realFilePath];
		}))).flat();
	}
	try {
		return await walk(root);
	} catch {
		return [];
	}
}
function userRulesRoot(customDir) {
	return customDir ?? join(homedir(), ".config", "tokenjuice", "rules");
}
function projectRulesRoot(cwd, customDir) {
	return customDir ?? join(cwd ?? process.cwd(), ".tokenjuice", "rules");
}
function sortRules(rules) {
	return [...rules].sort((left, right) => {
		if (left.rule.id === "generic/fallback") return 1;
		if (right.rule.id === "generic/fallback") return -1;
		return left.rule.id.localeCompare(right.rule.id);
	});
}
async function loadRuleDescriptorsFromRoot(root, source) {
	const files = await listRuleFiles(root);
	return await Promise.all(files.map(async (fullPath) => {
		const parsed = JSON.parse(await readFile(fullPath, "utf8"));
		assertValidRule(parsed);
		return {
			source,
			path: fullPath,
			relativePath: relative(root, fullPath),
			rule: parsed
		};
	}));
}
function loadBundledBuiltinRuleDescriptors() {
	return BUNDLED_BUILTIN_RULES.map((rule) => {
		assertValidRule(rule);
		return {
			source: "builtin",
			path: `bundled:${rule.id}`,
			relativePath: rule.id,
			rule
		};
	});
}
function cacheKey(options) {
	return JSON.stringify({
		cwd: options.cwd ?? process.cwd(),
		includeUser: options.includeUser ?? true,
		includeProject: options.includeProject ?? true,
		userRulesDir: options.userRulesDir ?? null,
		projectRulesDir: options.projectRulesDir ?? null
	});
}
function overlayRules(descriptors) {
	const byId = /* @__PURE__ */ new Map();
	for (const descriptor of descriptors) byId.set(descriptor.rule.id, descriptor);
	return sortRules([...byId.values()].map((descriptor) => compileRule(descriptor)));
}
async function loadRules(options = {}) {
	const key = cacheKey(options);
	const cached = ruleCache.get(key);
	if (cached) return cached;
	const descriptors = [];
	const builtinDescriptors = await loadRuleDescriptorsFromRoot(builtinRulesRoot(), "builtin");
	descriptors.push(...builtinDescriptors.length > 0 ? builtinDescriptors : loadBundledBuiltinRuleDescriptors());
	if (options.includeUser ?? true) descriptors.push(...await loadRuleDescriptorsFromRoot(userRulesRoot(options.userRulesDir), "user"));
	if (options.includeProject ?? true) descriptors.push(...await loadRuleDescriptorsFromRoot(projectRulesRoot(options.cwd, options.projectRulesDir), "project"));
	const compiled = overlayRules(descriptors);
	ruleCache.set(key, compiled);
	return compiled;
}
//#endregion
//#region node_modules/tokenjuice/dist/core/classify.js
function includesAll(argv, expected) {
	return expected.every((part) => argv.includes(part));
}
function isWordLikeChar(char) {
	return typeof char === "string" && /[A-Za-z0-9_]/u.test(char);
}
function includesCommandPart(command, part) {
	if (!part) return true;
	let fromIndex = 0;
	while (fromIndex <= command.length) {
		const index = command.indexOf(part, fromIndex);
		if (index === -1) return false;
		const end = index + part.length;
		const partStartsWord = isWordLikeChar(part[0]);
		const partEndsWord = isWordLikeChar(part.at(-1));
		const prev = index > 0 ? command[index - 1] : void 0;
		const next = end < command.length ? command[end] : void 0;
		const leftBoundaryOk = !partStartsWord || !isWordLikeChar(prev);
		const rightBoundaryOk = !partEndsWord || !isWordLikeChar(next);
		if (leftBoundaryOk && rightBoundaryOk) return true;
		fromIndex = index + 1;
	}
	return false;
}
function getJsonRule(rule) {
	return "rule" in rule ? rule.rule : rule;
}
function getCandidatePriority(candidate) {
	switch (candidate.source) {
		case "effective": return 2;
		case "shell-body": return 1;
		default: return 0;
	}
}
function applyCommandMatchCandidate(input, candidate) {
	const { command: _command, ...rest } = input;
	return {
		...rest,
		...candidate.command ? { command: candidate.command } : {},
		argv: candidate.argv
	};
}
function matchesRule(ruleLike, input) {
	const rule = getJsonRule(ruleLike);
	const argv = input.argv ?? [];
	const command = input.command ?? "";
	const toolName = input.toolName;
	if (rule.match.toolNames && !rule.match.toolNames.includes(toolName)) return false;
	if (rule.match.argv0 && !rule.match.argv0.includes(argv[0] ?? "")) return false;
	if (rule.match.gitSubcommands && !rule.match.gitSubcommands.includes(getGitSubcommand(argv) ?? "")) return false;
	if (rule.match.argvIncludes && !rule.match.argvIncludes.every((parts) => includesAll(argv, parts))) return false;
	if (rule.match.argvIncludesAny && !rule.match.argvIncludesAny.some((parts) => includesAll(argv, parts))) return false;
	if (rule.match.commandIncludes && !rule.match.commandIncludes.every((part) => includesCommandPart(command, part))) return false;
	if (rule.match.commandIncludesAny && !rule.match.commandIncludesAny.some((part) => includesCommandPart(command, part))) return false;
	return true;
}
function scoreRule(ruleLike) {
	const rule = getJsonRule(ruleLike);
	return (rule.priority ?? 0) * 1e3 + (rule.match.argv0?.length ?? 0) * 100 + (rule.match.gitSubcommands?.length ?? 0) * 60 + (rule.match.argvIncludes?.reduce((sum, parts) => sum + parts.length, 0) ?? 0) * 40 + (rule.match.argvIncludesAny?.reduce((sum, parts) => sum + parts.length, 0) ?? 0) * 35 + (rule.match.commandIncludes?.length ?? 0) * 25 + (rule.match.commandIncludesAny?.length ?? 0) * 20 + (rule.match.toolNames?.length ?? 0) * 10;
}
function compareSelections(left, right) {
	const scoreDiff = scoreRule(right.rule) - scoreRule(left.rule);
	if (scoreDiff !== 0) return scoreDiff;
	const candidateDiff = getCandidatePriority(right.candidate) - getCandidatePriority(left.candidate);
	if (candidateDiff !== 0) return candidateDiff;
	return getJsonRule(left.rule).id.localeCompare(getJsonRule(right.rule).id);
}
function findBestRuleMatch(input, rules) {
	const candidates = deriveCommandMatchCandidates(input);
	const specificMatches = [];
	let fallbackSelection;
	for (const candidate of candidates) {
		const candidateInput = applyCommandMatchCandidate(input, candidate);
		for (const rule of rules) {
			if (!matchesRule(rule, candidateInput)) continue;
			if (getJsonRule(rule).id === "generic/fallback") {
				fallbackSelection ??= {
					rule,
					candidate
				};
				continue;
			}
			specificMatches.push({
				rule,
				candidate
			});
		}
	}
	if (specificMatches.length > 0) return [...specificMatches].sort(compareSelections)[0];
	return fallbackSelection;
}
function buildClassificationResult(ruleLike, candidate) {
	const rule = getJsonRule(ruleLike);
	return {
		family: rule.family,
		confidence: rule.id === "generic/fallback" ? .2 : .9,
		matchedReducer: rule.id,
		matchedVia: candidate.source,
		matchedCommand: candidate.command ?? candidate.argv.join(" ")
	};
}
function resolveRuleMatch(input, rules) {
	const match = findBestRuleMatch(input, rules);
	if (!match) return;
	const candidateInput = applyCommandMatchCandidate(input, match.candidate);
	return {
		rule: match.rule,
		candidate: match.candidate,
		candidateInput,
		classification: buildClassificationResult(match.rule, match.candidate)
	};
}
function classifyExecution(input, rules, forcedRuleId) {
	if (forcedRuleId) {
		const forcedRule = rules.find((rule) => getJsonRule(rule).id === forcedRuleId);
		if (forcedRule) {
			const forced = getJsonRule(forcedRule);
			return {
				family: forced.family,
				confidence: 1,
				matchedReducer: forced.id
			};
		}
	}
	const resolved = resolveRuleMatch(input, rules);
	if (!resolved) return {
		family: "generic",
		confidence: .2
	};
	return resolved.classification;
}
//#endregion
//#region node_modules/tokenjuice/dist/core/execution-input.js
function normalizeExecutionInput(input) {
	const shellWrapped = unwrapShellRunner(input);
	if (shellWrapped) {
		const effectiveCommand = stripLeadingCdPrefix(shellWrapped);
		if (isCompoundShellCommand(effectiveCommand)) {
			const { argv: _argv, ...restInput } = input;
			return {
				...restInput,
				command: effectiveCommand
			};
		}
		const argv = resolveEffectiveCommand({ command: effectiveCommand })?.argv ?? tokenizeCommand(effectiveCommand);
		if (argv.length === 0) return {
			...input,
			command: effectiveCommand
		};
		return {
			...input,
			command: argv.join(" "),
			argv
		};
	}
	const effective = resolveEffectiveCommand(input);
	if (effective?.argv.length) return {
		...input,
		...effective.command ? { command: effective.command } : {},
		argv: effective.argv
	};
	if (input.argv?.length || !input.command) return input;
	const effectiveCommand = stripLeadingCdPrefix(input.command);
	if (isCompoundShellCommand(effectiveCommand)) return input;
	const argv = tokenizeCommand(effectiveCommand);
	if (argv.length === 0) return input;
	return {
		...input,
		command: argv.join(" "),
		argv
	};
}
function normalizeArtifactSource(value) {
	if (typeof value !== "string") return null;
	const source = value.trim().toLowerCase().replace(/[_\s]+/gu, "-").replace(/[^a-z0-9.-]+/gu, "-").replace(/^-+|-+$/gu, "");
	if (!source) return null;
	if (source.startsWith("claude-code") || source === "claude") return "claude-code";
	if (source.startsWith("cline")) return "cline";
	if (source.startsWith("codex")) return "codex";
	if (source.startsWith("cursor")) return "cursor";
	if (source.startsWith("gemini")) return "gemini-cli";
	if (source.startsWith("openclaw")) return "openclaw";
	if (source.startsWith("openhands")) return "openhands";
	if (source.startsWith("opencode") || source.startsWith("open-code")) return "opencode";
	if (source.startsWith("pi")) return "pi";
	if (source === "direct" || source === "tokenjuice" || source === "wrap") return "cli";
	return source;
}
function resolveArtifactSource(input) {
	return normalizeArtifactSource(input.metadata?.source) ?? "cli";
}
//#endregion
//#region node_modules/tokenjuice/dist/core/artifacts.js
const ARTIFACT_ID_PATTERN = /^tj_[0-9a-f-]{12}$/iu;
const ARTIFACT_DIR_ENV = "TOKENJUICE_ARTIFACT_DIR";
function extractCaptureTruncatedFlag(input) {
	const value = input.metadata?.tokenjuiceCaptureTruncated;
	return typeof value === "boolean" ? value : void 0;
}
function getDefaultArtifactDir() {
	const artifactDir = process.env[ARTIFACT_DIR_ENV];
	if (typeof artifactDir === "string" && artifactDir.trim()) return artifactDir.trim();
	return join(homedir(), ".tokenjuice", "artifacts");
}
function resolveArtifactBaseDir(storeDir) {
	return storeDir ?? getDefaultArtifactDir();
}
function isValidArtifactId(id) {
	return ARTIFACT_ID_PATTERN.test(id);
}
function buildArtifactPaths(id, storeDir) {
	if (!isValidArtifactId(id)) throw new Error(`invalid artifact id: ${id}`);
	const base = resolveArtifactBaseDir(storeDir);
	return {
		id,
		storage: "file",
		path: join(base, `${id}.txt`),
		metadataPath: join(base, `${id}.json`)
	};
}
function buildMetadataOnlyPath(id, storeDir) {
	if (!isValidArtifactId(id)) throw new Error(`invalid artifact id: ${id}`);
	return join(resolveArtifactBaseDir(storeDir), `${id}.meta.json`);
}
async function storeArtifact(input, storeDir) {
	const id = `tj_${randomUUID().slice(0, 12)}`;
	const ref = buildArtifactPaths(id, storeDir);
	await mkdir(resolveArtifactBaseDir(storeDir), {
		recursive: true,
		mode: 448
	});
	const captureTruncated = extractCaptureTruncatedFlag(input.input);
	const artifact = {
		id,
		rawText: input.rawText,
		metadata: {
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			source: resolveArtifactSource(input.input),
			classification: input.classification,
			rawChars: input.stats?.rawChars ?? countTextChars(stripAnsi(input.rawText)),
			...input.input.toolName ? { toolName: input.input.toolName } : {},
			...input.input.command ? { command: input.input.command } : {},
			...typeof input.input.exitCode === "number" ? { exitCode: input.input.exitCode } : {},
			...captureTruncated !== void 0 ? { captureTruncated } : {},
			...input.stats ? {
				reducedChars: input.stats.reducedChars,
				ratio: input.stats.ratio
			} : {}
		}
	};
	await Promise.all([writeFile(ref.path, input.rawText, {
		encoding: "utf8",
		mode: 384
	}), writeFile(ref.metadataPath, JSON.stringify(artifact.metadata, null, 2), {
		encoding: "utf8",
		mode: 384
	})]);
	return ref;
}
async function storeArtifactMetadata(input, storeDir) {
	const id = `tj_${randomUUID().slice(0, 12)}`;
	const metadataPath = buildMetadataOnlyPath(id, storeDir);
	const captureTruncated = extractCaptureTruncatedFlag(input.input);
	const metadata = {
		createdAt: (/* @__PURE__ */ new Date()).toISOString(),
		source: resolveArtifactSource(input.input),
		classification: input.classification,
		rawChars: input.stats?.rawChars ?? countTextChars(stripAnsi(input.rawText)),
		...input.input.toolName ? { toolName: input.input.toolName } : {},
		...input.input.command ? { command: input.input.command } : {},
		...typeof input.input.exitCode === "number" ? { exitCode: input.input.exitCode } : {},
		...captureTruncated !== void 0 ? { captureTruncated } : {},
		...input.stats ? {
			reducedChars: input.stats.reducedChars,
			ratio: input.stats.ratio
		} : {}
	};
	await mkdir(resolveArtifactBaseDir(storeDir), {
		recursive: true,
		mode: 448
	});
	await writeFile(metadataPath, JSON.stringify(metadata, null, 2), {
		encoding: "utf8",
		mode: 384
	});
	return {
		id,
		storage: "file",
		metadataPath,
		metadata
	};
}
//#endregion
//#region node_modules/tokenjuice/dist/core/github-actions-summary.js
const GITHUB_ACTIONS_EXIT_PATTERN = /^Error: Process completed with exit code (\d+)\.?$/u;
const GITHUB_ACTIONS_RUN_PATTERN = /^(?:##\[group\]|::group::)?Run\s+(.+)$/u;
const MAX_LISTED_COMMANDS = 24;
function isGithubActionsMetadataLine(line) {
	return line === "##[endgroup]" || line.startsWith("shell:") || line.startsWith("env:") || line.startsWith("Error: Process completed with exit code ");
}
function isShellSetupLine(line) {
	return line === "set -e" || line === "set -eo pipefail" || line === "set -euo pipefail" || /^set\s+-[A-Za-z]*e[A-Za-z]*$/u.test(line);
}
function stripGithubActionsScriptPrefix(line) {
	return line.replace(/^\s{2}/u, "").replace(/^\t/u, "").trim();
}
function dedupeAdjacent(values) {
	const deduped = [];
	for (const value of values) if (deduped[deduped.length - 1] !== value) deduped.push(value);
	return deduped;
}
function extractRunCommands(lines) {
	const runIndex = lines.findIndex((line) => GITHUB_ACTIONS_RUN_PATTERN.test(stripGithubActionsScriptPrefix(line)));
	if (runIndex === -1) return [];
	const commands = [];
	const runMatch = stripGithubActionsScriptPrefix(lines[runIndex] ?? "").match(GITHUB_ACTIONS_RUN_PATTERN);
	if (runMatch?.[1]) commands.push(runMatch[1].trim());
	const bodyLines = lines.slice(runIndex + 1);
	const hasIndentedScriptBody = bodyLines.some((line) => /^(?:\s{2}|\t)\S/u.test(line));
	for (const rawLine of bodyLines) {
		if (hasIndentedScriptBody && !/^(?:\s{2}|\t)/u.test(rawLine)) break;
		const line = stripGithubActionsScriptPrefix(rawLine);
		if (!line || isGithubActionsMetadataLine(line)) break;
		commands.push(line);
	}
	return dedupeAdjacent(commands).filter((line) => !isShellSetupLine(line));
}
function formatCommandList(commands) {
	if (commands.length <= MAX_LISTED_COMMANDS) return { lines: commands.map((command) => `- ${command}`) };
	const headCount = Math.floor(MAX_LISTED_COMMANDS * .65);
	const tailCount = MAX_LISTED_COMMANDS - headCount;
	const omitted = commands.length - headCount - tailCount;
	return {
		lines: [
			...commands.slice(0, headCount).map((command) => `- ${command}`),
			`... ${omitted} commands omitted ...`,
			...commands.slice(-tailCount).map((command) => `- ${command}`)
		],
		compaction: createCompactionMetadata("github-actions-command-list-omission")
	};
}
function buildGithubActionsFailureSummary(input, rawText) {
	const lines = trimEmptyEdges(normalizeLines(stripAnsi(rawText))).map((line) => line.trimEnd());
	const exitLine = [...lines].reverse().find((line) => GITHUB_ACTIONS_EXIT_PATTERN.test(stripGithubActionsScriptPrefix(line)));
	const exitCode = exitLine?.match(GITHUB_ACTIONS_EXIT_PATTERN)?.[1] ?? (input.exitCode && input.exitCode !== 0 ? String(input.exitCode) : null);
	if (!exitLine || !exitCode) return null;
	const commands = extractRunCommands(lines);
	if (commands.length === 0) return null;
	const commandList = formatCommandList(commands);
	const summary = [`GitHub Actions shell step failed (exit ${exitCode}).`];
	if (commands.length === 1) summary.push(`Failing command: ${commands[0]}`);
	else {
		summary.push(`Failing command: not visible; this shell step ran ${commands.length} commands without per-command failure markers.`);
		summary.push("Commands in step:");
		summary.push(...commandList.lines);
	}
	summary.push(stripGithubActionsScriptPrefix(exitLine));
	return {
		text: summary.join("\n"),
		...commandList.compaction ? { compaction: commandList.compaction } : {}
	};
}
//#endregion
//#region node_modules/tokenjuice/dist/core/reduce-formatters.js
const LONG_SEARCH_LINE_MAX_CHARS = 420;
const LONG_CHANGED_LINE_MAX_CHARS = 260;
const GIT_DIFF_CHANGED_LINES_PER_HUNK = 8;
const GH_RUN_LOG_SIGNAL_CONTEXT_LINES = 1;
const GH_RUN_LOG_SIGNAL_PATTERN = /(?:##\[error\]|::error|(?:^|[\s|])(?:FAIL|FAILED|FAILURE)(?:[\s|:]|$)|\bAssertionError\b|\bError:\s+Process completed with exit code\b|\berror\s+TS\d+\b|\bELIFECYCLE\b|\bCommand failed\b|\bfailed with exit code\b|\bfailed in build-artifacts\b|\bERR_[A-Z0-9_]+\b)/iu;
const MAX_GH_STATUS_CHECK_ATTENTION_LINES = 12;
function rewriteGitStatusLine(line) {
	const trimmed = line.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("On branch ")) return null;
	if (/^and have \d+ and \d+ different commits each/u.test(trimmed)) return null;
	if (/^(?:no changes added to commit|nothing added to commit but untracked files present)/u.test(trimmed)) return null;
	if (/^\(use "git .+"\)$/u.test(trimmed) || /^use "git .+" to .+/u.test(trimmed)) return null;
	if (trimmed === "Changes not staged for commit:") return "Changes not staged:";
	if (trimmed === "Changes to be committed:") return "Staged changes:";
	if (trimmed === "Untracked files:") return "Untracked files:";
	if (/^\s*modified:\s+/u.test(line)) return `M: ${line.replace(/^\s*modified:\s+/u, "").trim()}`;
	if (/^\s*new file:\s+/u.test(line)) return `A: ${line.replace(/^\s*new file:\s+/u, "").trim()}`;
	if (/^\s*deleted:\s+/u.test(line)) return `D: ${line.replace(/^\s*deleted:\s+/u, "").trim()}`;
	if (/^\s*renamed:\s+/u.test(line)) return `R: ${line.replace(/^\s*renamed:\s+/u, "").trim()}`;
	if (/^\?\?\s+/u.test(trimmed)) return `?? ${trimmed.replace(/^\?\?\s+/u, "").trim()}`;
	const porcelainMatch = line.match(/^([ MADRCU?!]{2})\s+(.+)$/u);
	if (porcelainMatch) {
		const status = porcelainMatch[1].trim().replace(/\?/gu, "??");
		const path = porcelainMatch[2].trim();
		return `${status === "" ? "M" : status[0] === "?" ? "??" : status[0]}: ${path}`;
	}
	return trimmed;
}
function rewriteGitStatusLines(lines) {
	let section = null;
	const rewritten = lines.map((line) => {
		const trimmed = line.trim();
		if (trimmed === "Changes not staged for commit:") section = "unstaged";
		else if (trimmed === "Changes to be committed:") section = "staged";
		else if (trimmed === "Untracked files:") section = "untracked";
		if (section === "untracked" && /^\s{2,}\S/u.test(line) && !/^\s*(?:modified:|new file:|deleted:|renamed:)/u.test(line)) return `?? ${trimmed}`;
		return rewriteGitStatusLine(line);
	}).filter((line) => line !== null);
	const collapsed = [];
	for (const line of rewritten) {
		if (line === "" && collapsed[collapsed.length - 1] === "") continue;
		collapsed.push(line);
	}
	return collapsed;
}
function extractGhLabelNames(value) {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (typeof entry === "string") return entry ? [entry] : [];
		if (typeof entry === "object" && entry !== null && "name" in entry && typeof entry.name === "string") return entry.name ? [entry.name] : [];
		return [];
	});
}
function extractGhCommentCount(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (Array.isArray(value)) return value.length;
	if (typeof value === "object" && value !== null && "totalCount" in value && typeof value.totalCount === "number") return value.totalCount;
	return null;
}
function parseIsoTimestamp(value) {
	if (typeof value !== "string") return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}
function formatDuration(seconds) {
	if (!Number.isFinite(seconds) || seconds < 0) return "";
	if (seconds < 60) return `${Math.round(seconds)}s`;
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor(seconds % 3600 / 60);
	const remainingSeconds = Math.round(seconds % 60);
	if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
	return `${minutes}m${String(remainingSeconds).padStart(2, "0")}s`;
}
function extractGhDuration(record) {
	if (typeof record.durationSec === "number" && Number.isFinite(record.durationSec) && record.durationSec >= 0) return formatDuration(record.durationSec);
	if (typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds) && record.durationSeconds >= 0) return formatDuration(record.durationSeconds);
	const startedAt = parseIsoTimestamp(record.startedAt);
	const completedAt = parseIsoTimestamp(record.completedAt);
	if (startedAt !== null && completedAt !== null && completedAt >= startedAt) return formatDuration((completedAt - startedAt) / 1e3);
	const createdAt = parseIsoTimestamp(record.createdAt);
	const updatedAt = parseIsoTimestamp(record.updatedAt);
	if (createdAt !== null && updatedAt !== null && updatedAt >= createdAt) return formatDuration((updatedAt - createdAt) / 1e3);
	return null;
}
function formatGhJsonRecord(record) {
	const comment = formatGhCommentJsonRecord(record);
	if (comment) return comment;
	const numericId = typeof record.number === "number" ? record.number : typeof record.databaseId === "number" ? record.databaseId : null;
	const title = typeof record.title === "string" ? record.title : typeof record.displayTitle === "string" ? record.displayTitle : typeof record.name === "string" ? record.name : typeof record.workflowName === "string" ? record.workflowName : null;
	if (!title) return null;
	const labels = extractGhLabelNames(record.labels).slice(0, 3);
	const comments = extractGhCommentCount(record.comments);
	const branch = typeof record.headBranch === "string" ? record.headBranch : typeof record.headRefName === "string" ? record.headRefName : null;
	const status = typeof record.state === "string" ? record.state : typeof record.status === "string" ? record.status : typeof record.conclusion === "string" ? record.conclusion : null;
	const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt.slice(0, 10) : null;
	const duration = extractGhDuration(record);
	const parts = [];
	if (numericId !== null) parts.push(`#${numericId}`);
	parts.push(compactWhitespace(title));
	if (status) parts.push(`[${status}]`);
	if (branch) parts.push(`(${compactWhitespace(branch)})`);
	if (duration) parts.push(duration);
	if (typeof comments === "number" && comments > 0) parts.push(`${comments}c`);
	if (labels.length > 0) parts.push(`{${labels.join(", ")}}`);
	if (updatedAt) parts.push(updatedAt);
	return { line: parts.join(" ") };
}
function getNestedLogin(value) {
	if (typeof value === "string") return value;
	if (typeof value === "object" && value !== null && "login" in value && typeof value.login === "string") return value.login;
	return null;
}
function formatGhCommentJsonRecord(record) {
	const body = typeof record.body === "string" ? record.body : typeof record.bodyText === "string" ? record.bodyText : null;
	if (!body) return null;
	const id = typeof record.id === "string" ? record.id : typeof record.id === "number" ? String(record.id) : typeof record.databaseId === "number" ? String(record.databaseId) : typeof record.node_id === "string" ? record.node_id : null;
	const author = getNestedLogin(record.author) ?? getNestedLogin(record.user) ?? getNestedLogin(record.actor);
	const path = typeof record.path === "string" ? record.path : null;
	const line = typeof record.line === "number" ? record.line : typeof record.originalLine === "number" ? record.originalLine : typeof record.startLine === "number" ? record.startLine : null;
	const state = typeof record.state === "string" ? record.state : null;
	const createdAt = typeof record.createdAt === "string" ? record.createdAt.slice(0, 10) : typeof record.created_at === "string" ? record.created_at.slice(0, 10) : null;
	const clippedBody = clipMiddleWithHash(compactWhitespace(body), 180);
	const location = path ? `${path}${line !== null ? `:${line}` : ""}` : null;
	return {
		line: [
			"comment",
			id ? `#${id}` : null,
			author ? `@${author}` : null,
			location,
			state ? `[${state}]` : null,
			createdAt,
			`body=${clippedBody.text}`
		].filter((part) => Boolean(part)).join(" "),
		...clippedBody.compaction ? { compaction: clippedBody.compaction } : {}
	};
}
function getGhCollection(value) {
	if (Array.isArray(value)) return value;
	if (typeof value === "object" && value !== null && "nodes" in value && Array.isArray(value.nodes)) return value.nodes;
	return [];
}
function getGhString(record, ...keys) {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value;
	}
	return null;
}
function normalizeGhStatus(value) {
	return value ? value.trim().toUpperCase().replace(/-/gu, "_") : null;
}
function isGhStatusCheckOk(record) {
	const conclusion = normalizeGhStatus(getGhString(record, "conclusion"));
	if (conclusion) return conclusion === "SUCCESS" || conclusion === "SKIPPED" || conclusion === "NEUTRAL";
	const state = normalizeGhStatus(getGhString(record, "state"));
	if (state) return state === "SUCCESS";
	return false;
}
function formatGhStatusCheckLine(record) {
	const name = getGhString(record, "name", "context", "workflowName");
	if (!name) return null;
	const conclusion = normalizeGhStatus(getGhString(record, "conclusion", "state"));
	const status = normalizeGhStatus(getGhString(record, "status"));
	const workflow = getGhString(record, "workflowName");
	const duration = extractGhDuration(record);
	const detailsUrl = getGhString(record, "detailsUrl", "targetUrl");
	return [
		"check",
		compactWhitespace(name),
		conclusion ? `[${conclusion}]` : status ? `[${status}]` : null,
		workflow && workflow !== name ? `workflow=${compactWhitespace(workflow)}` : null,
		duration ? `duration=${duration}` : null,
		detailsUrl ? `url=${detailsUrl}` : null
	].filter((part) => Boolean(part)).join(" ");
}
function formatGhStatusCheckRollup(value) {
	const records = getGhCollection(value).filter((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry));
	if (records.length === 0) return { lines: [] };
	const attention = records.filter((record) => !isGhStatusCheckOk(record));
	const okCount = records.length - attention.length;
	const lines = [`status checks: ${okCount} ok, ${attention.length} attention`];
	const listed = attention.slice(0, MAX_GH_STATUS_CHECK_ATTENTION_LINES);
	for (const record of listed) {
		const line = formatGhStatusCheckLine(record);
		if (line) lines.push(line);
	}
	const omittedAttention = attention.length - listed.length;
	if (omittedAttention > 0) lines.push(`... ${omittedAttention} attention checks omitted ...`);
	return {
		lines,
		...okCount > 0 || omittedAttention > 0 ? { compaction: createCompactionMetadata("github-status-check-rollup-omission") } : {}
	};
}
function formatGhJsonValue(value) {
	const compactions = [];
	if (Array.isArray(value)) return {
		lines: value.flatMap((entry) => {
			if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
			const formatted = formatGhJsonRecord(entry);
			if (!formatted) return [];
			if (formatted.compaction) compactions.push(formatted.compaction);
			return [formatted.line];
		}),
		...compactions.length > 0 ? { compaction: mergeCompactionMetadata(...compactions) } : {}
	};
	if (typeof value !== "object" || value === null) return { lines: [] };
	const record = value;
	const lines = [];
	const header = formatGhJsonRecord(record);
	if (header) {
		lines.push(header.line);
		if (header.compaction) compactions.push(header.compaction);
	}
	const statusCheckRollup = formatGhStatusCheckRollup(record.statusCheckRollup);
	if (statusCheckRollup.lines.length > 0) {
		lines.push(...statusCheckRollup.lines);
		if (statusCheckRollup.compaction) compactions.push(statusCheckRollup.compaction);
	}
	for (const collectionKey of [
		"jobs",
		"workflowRuns",
		"items",
		"artifacts",
		"comments",
		"reviews",
		"reviewThreads"
	]) {
		const collection = getGhCollection(record[collectionKey]);
		if (collection.length === 0) continue;
		for (const entry of collection) {
			if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
			const formatted = formatGhJsonRecord(entry);
			if (formatted) {
				lines.push(formatted.line);
				if (formatted.compaction) compactions.push(formatted.compaction);
			}
		}
	}
	return {
		lines,
		...compactions.length > 0 ? { compaction: mergeCompactionMetadata(...compactions) } : {}
	};
}
function rewriteSearchLines(lines) {
	const compactions = [];
	return {
		lines: lines.map((line) => {
			const match = /^(.+?:\d+(?::|-))(.*)$/u.exec(line);
			if (!match) {
				const clipped = clipMiddleWithHash(line, LONG_SEARCH_LINE_MAX_CHARS);
				if (clipped.compaction) compactions.push(clipped.compaction);
				return clipped.text;
			}
			const [, prefix, rest] = match;
			const clipped = clipMiddleWithHash(rest ?? "", LONG_SEARCH_LINE_MAX_CHARS);
			if (clipped.compaction) compactions.push(clipped.compaction);
			return `${prefix}${clipped.text}`;
		}),
		...compactions.length > 0 ? { compaction: mergeCompactionMetadata(...compactions) } : {}
	};
}
function rewriteGitDiffLines(lines) {
	const rewritten = [];
	const compactions = [];
	let emittedChangedLinesInHunk = 0;
	let omittedAdded = 0;
	let omittedRemoved = 0;
	const flushOmitted = () => {
		if (omittedAdded > 0 || omittedRemoved > 0) {
			rewritten.push(`... hunk clipped: ${omittedAdded} added, ${omittedRemoved} removed lines omitted`);
			compactions.push(createCompactionMetadata("git-diff-hunk-clip"));
			omittedAdded = 0;
			omittedRemoved = 0;
		}
	};
	for (const line of lines) {
		if (line.startsWith("@@ ")) {
			flushOmitted();
			emittedChangedLinesInHunk = 0;
			rewritten.push(line);
			continue;
		}
		if (line.startsWith("diff --git ")) {
			flushOmitted();
			emittedChangedLinesInHunk = 0;
			rewritten.push(line);
			continue;
		}
		if (!(line.startsWith("+") || line.startsWith("-")) || line.startsWith("+++") || line.startsWith("---")) {
			rewritten.push(line);
			continue;
		}
		if (emittedChangedLinesInHunk < GIT_DIFF_CHANGED_LINES_PER_HUNK) {
			emittedChangedLinesInHunk += 1;
			const clipped = clipMiddleWithHash(line, LONG_CHANGED_LINE_MAX_CHARS);
			if (clipped.compaction) compactions.push(clipped.compaction);
			rewritten.push(clipped.text);
			continue;
		}
		if (line.startsWith("+")) omittedAdded += 1;
		else omittedRemoved += 1;
	}
	flushOmitted();
	return {
		lines: rewritten,
		...compactions.length > 0 ? { compaction: mergeCompactionMetadata(...compactions) } : {}
	};
}
function formatGhTableLine(line) {
	const trimmed = line.trim();
	if (!trimmed) return "";
	const tabColumns = line.split("	").map((part) => compactWhitespace(part)).filter(Boolean);
	if (tabColumns.length >= 4 && /^\d{4}-\d{2}-\d{2}T/u.test(tabColumns[2] ?? "")) {
		const [job, step, , ...rest] = tabColumns;
		return [
			job,
			step,
			compactWhitespace(rest.join(" "))
		].filter(Boolean).join(" | ");
	}
	const columns = trimmed.split(/\s{2,}|\t+/u).map((part) => compactWhitespace(part)).filter(Boolean);
	if (columns.length >= 2 && /^\d+$/u.test(columns[0] ?? "")) {
		const number = columns[0];
		const title = columns[1];
		const state = columns.length >= 4 ? columns.at(-1) : null;
		const context = columns.length >= 3 ? columns.slice(2, state ? -1 : void 0).join(" ") : null;
		const parts = [`#${number}`, title];
		if (state) parts.push(`[${state}]`);
		if (context) parts.push(`(${context})`);
		return parts.join(" ");
	}
	return compactWhitespace(trimmed);
}
function isGhRunLogCommand(input) {
	const argv = input.argv ?? [];
	return argv[0] === "gh" && argv.includes("run") && argv.includes("view") && argv.some((arg) => arg === "--log" || arg === "--log-failed" || arg.startsWith("--log="));
}
function formatOmittedGhLogLines(count) {
	return `... ${count} non-signal log lines omitted ...`;
}
function filterGhRunLogSignalLines(lines) {
	const signalIndexes = lines.map((line, index) => GH_RUN_LOG_SIGNAL_PATTERN.test(line) ? index : -1).filter((index) => index >= 0);
	if (signalIndexes.length === 0) return { lines };
	const ranges = [];
	for (const index of signalIndexes) {
		const start = Math.max(0, index - GH_RUN_LOG_SIGNAL_CONTEXT_LINES);
		const end = Math.min(lines.length - 1, index + GH_RUN_LOG_SIGNAL_CONTEXT_LINES);
		const previous = ranges.at(-1);
		if (previous && start <= previous.end + 1) {
			previous.end = Math.max(previous.end, end);
			continue;
		}
		ranges.push({
			start,
			end
		});
	}
	const rewritten = [];
	let cursor = 0;
	for (const range of ranges) {
		const omittedBefore = range.start - cursor;
		if (omittedBefore > 0) rewritten.push(formatOmittedGhLogLines(omittedBefore));
		rewritten.push(...lines.slice(range.start, range.end + 1));
		cursor = range.end + 1;
	}
	const omittedAfter = lines.length - cursor;
	if (omittedAfter > 0) rewritten.push(formatOmittedGhLogLines(omittedAfter));
	if (rewritten.length >= lines.length) return { lines };
	return {
		lines: rewritten,
		compaction: createCompactionMetadata("github-actions-log-signal-filter")
	};
}
function rewriteGhLines(lines, input) {
	const nonEmpty = lines.filter((line) => line.trim() !== "");
	if (nonEmpty.length === 0) return { lines: [] };
	const parsedWholeJson = parseJsonValue(nonEmpty.join("\n"));
	if (parsedWholeJson !== null) {
		const rewrittenWholeJson = formatGhJsonValue(parsedWholeJson);
		if (rewrittenWholeJson.lines.length > 0) return rewrittenWholeJson;
	}
	const parsedJsonLines = nonEmpty.map(parseJsonObjectLine);
	if (parsedJsonLines.every((entry) => entry !== null)) {
		const compactions = [];
		const rewritten = parsedJsonLines.map((entry) => formatGhJsonRecord(entry)).flatMap((line) => {
			if (!line || line.line.length === 0) return [];
			if (line.compaction) compactions.push(line.compaction);
			return [line.line];
		});
		if (rewritten.length > 0) return {
			lines: rewritten,
			...compactions.length > 0 ? { compaction: mergeCompactionMetadata(...compactions) } : {}
		};
	}
	if (isGithubCliCommand((input.argv ?? [])[0])) {
		const formattedLines = lines.map(formatGhTableLine);
		if (isGhRunLogCommand(input)) return filterGhRunLogSignalLines(formattedLines);
		return { lines: formattedLines };
	}
	return { lines };
}
function isGithubCliCommand(command) {
	return command === "gh" || command === "ghx";
}
//#endregion
//#region node_modules/tokenjuice/dist/core/reduce.js
const TINY_OUTPUT_MAX_CHARS = 240;
const SMALL_OUTPUT_PASSTHROUGH_MIN_SAVED_CHARS = 120;
const SMALL_OUTPUT_PASSTHROUGH_MAX_RATIO = .75;
function buildRawText(input) {
	if (input.combinedText) return input.combinedText;
	const stdout = input.stdout ?? "";
	const stderr = input.stderr ?? "";
	if (!stdout) return stderr;
	if (!stderr) return stdout;
	return `${stdout}\n${stderr}`;
}
function prettyPrintJsonIfPossible(text) {
	const trimmed = text.trim();
	if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return text;
	try {
		const parsed = JSON.parse(trimmed);
		if (typeof parsed === "object" && parsed !== null) return JSON.stringify(parsed, null, 2);
	} catch {
		return text;
	}
	return text;
}
function applyRule(compiledRule, input, rawText) {
	const rule = compiledRule.rule;
	if (rule.transforms?.prettyPrintJson) rawText = prettyPrintJsonIfPossible(rawText);
	let lines = normalizeLines(rawText);
	const facts = {};
	if (rule.transforms?.stripAnsi) lines = normalizeLines(stripAnsi(lines.join("\n")));
	const outputMatchText = trimEmptyEdges(lines).join("\n");
	const matchedOutput = compiledRule.compiled.outputMatches.find((entry) => entry.pattern.test(outputMatchText));
	if (matchedOutput) return {
		summary: matchedOutput.message,
		facts,
		compaction: NO_COMPACTION_METADATA
	};
	if (rule.filters?.skipPatterns?.length) lines = lines.filter((line) => !compiledRule.compiled.skipPatterns.some((pattern) => pattern.test(line)));
	let counterLines = [...lines];
	if (rule.filters?.keepPatterns?.length) {
		const kept = lines.filter((line) => compiledRule.compiled.keepPatterns.some((pattern) => pattern.test(line)));
		if (kept.length > 0) lines = kept;
	}
	if (rule.transforms?.trimEmptyEdges) {
		counterLines = trimEmptyEdges(counterLines);
		lines = trimEmptyEdges(lines);
	}
	if (rule.transforms?.dedupeAdjacent) {
		counterLines = dedupeAdjacent$1(counterLines);
		lines = dedupeAdjacent$1(lines);
	}
	if (rule.id === "git/status") {
		counterLines = rewriteGitStatusLines(counterLines);
		lines = rewriteGitStatusLines(lines);
	}
	const preRewriteLines = [...lines];
	let rewriteCompaction;
	if (rule.id === "cloud/gh") {
		counterLines = rewriteGhLines(counterLines, input).lines;
		const rewritten = rewriteGhLines(lines, input);
		lines = rewritten.lines;
		rewriteCompaction = mergeCompactionMetadata(rewriteCompaction, rewritten.compaction);
	}
	if (rule.id === "search/rg") {
		const rewritten = rewriteSearchLines(lines);
		lines = rewritten.lines;
		rewriteCompaction = mergeCompactionMetadata(rewriteCompaction, rewritten.compaction);
	}
	if (rule.id === "git/diff") {
		const rewritten = rewriteGitDiffLines(lines);
		lines = rewritten.lines;
		rewriteCompaction = mergeCompactionMetadata(rewriteCompaction, rewritten.compaction);
	}
	for (const counter of compiledRule.compiled.counters) {
		const pattern = counter.pattern;
		let factLines = rule.counterSource === "preKeep" ? counterLines : rule.id === "git/diff" ? preRewriteLines : lines;
		if (rule.id === "git/diff" && (counter.name === "added line" || counter.name === "removed line")) factLines = factLines.filter((line) => !line.startsWith("+++") && !line.startsWith("---"));
		facts[counter.name] = factLines.filter((line) => pattern.test(line)).length;
	}
	if (lines.length === 0 && rule.onEmpty) return {
		summary: rule.onEmpty,
		facts,
		compaction: rewriteCompaction ?? NO_COMPACTION_METADATA
	};
	const summarize = input.exitCode && input.exitCode !== 0 && rule.failure?.preserveOnFailure ? {
		head: rule.failure.head ?? 6,
		tail: rule.failure.tail ?? 12
	} : {
		head: rule.summarize?.head ?? 6,
		tail: rule.summarize?.tail ?? 6
	};
	const compacted = headTail(lines, summarize.head, summarize.tail);
	return {
		summary: compacted.lines.join("\n").trim(),
		facts,
		compaction: mergeCompactionMetadata(rewriteCompaction, compacted.compaction)
	};
}
function buildPassthroughText(input, rawText) {
	const normalized = trimEmptyEdges(normalizeLines(stripAnsi(rawText))).join("\n").trim();
	if (!normalized) return "(no output)";
	if (input.exitCode && input.exitCode !== 0) return `exit ${input.exitCode}\n${normalized}`;
	return normalized;
}
function buildLiteralPassthroughText(input, rawText) {
	const normalized = stripAnsi(rawText).trimEnd();
	if (!normalized) return buildPassthroughText(input, rawText);
	if (input.exitCode && input.exitCode !== 0) return `exit ${input.exitCode}\n${normalized}`;
	return normalized;
}
function shouldKeepSmallOutput(classification, input, rawChars, compactChars, maxInlineChars) {
	if (rawChars === 0 || rawChars > maxInlineChars || (input.exitCode ?? 0) !== 0) return false;
	if (!isTerseDiscoveryCommand(classification, input)) return false;
	const savedChars = rawChars - compactChars;
	const ratio = rawChars === 0 ? 1 : compactChars / rawChars;
	return savedChars < SMALL_OUTPUT_PASSTHROUGH_MIN_SAVED_CHARS || ratio > SMALL_OUTPUT_PASSTHROUGH_MAX_RATIO;
}
function isTerseDiscoveryCommand(classification, input) {
	const argv = input.argv ?? [];
	if (classification.family === "git-status") return argv.some((arg) => arg === "--short" || arg === "-s" || arg.startsWith("--porcelain"));
	if (classification.family === "git-remote") return argv.includes("-v") || argv.includes("--verbose");
	if (classification.family === "git-worktree") return argv.includes("--porcelain");
	return false;
}
function formatInline(classification, input, summary, facts) {
	const factParts = Object.entries(facts).filter(([, count]) => count > 0).map(([name, count]) => pluralize(count, name));
	const lines = [];
	if (input.exitCode && input.exitCode !== 0) lines.push(`exit ${input.exitCode}`);
	if ((classification.family === "search" || classification.family !== "git-status" && classification.family !== "help" && summary.includes("omitted") || classification.family === "test-results" && (input.exitCode ?? 0) !== 0) && factParts.length > 0) lines.push(factParts.join(", "));
	lines.push(summary);
	return lines.join("\n").trim();
}
function selectInlineText(classification, input, rawText, compactText, maxInlineChars, compactCompaction) {
	const passthroughText = buildPassthroughText(input, rawText);
	const rawChars = countTextChars(stripAnsi(rawText));
	const compactChars = countTextChars(compactText);
	if (shouldKeepSmallOutput(classification, input, rawChars, compactChars, maxInlineChars)) return {
		text: buildLiteralPassthroughText(input, rawText),
		compaction: NO_COMPACTION_METADATA
	};
	if (classification.family === "git-status") return {
		text: compactText,
		compaction: compactCompaction
	};
	if (rawChars <= maxInlineChars && compactChars >= rawChars) return {
		text: passthroughText,
		compaction: NO_COMPACTION_METADATA
	};
	const passthroughLimit = classification.family === "help" ? maxInlineChars : TINY_OUTPUT_MAX_CHARS;
	if (countTextChars(passthroughText) > passthroughLimit) return {
		text: compactText,
		compaction: compactCompaction
	};
	if (countTextChars(passthroughText) <= countTextChars(compactText)) return {
		text: passthroughText,
		compaction: NO_COMPACTION_METADATA
	};
	return {
		text: compactText,
		compaction: compactCompaction
	};
}
async function reduceExecution(input, opts = {}) {
	return reduceExecutionWithRules(input, await loadRules(opts.cwd ? { cwd: opts.cwd } : void 0), opts);
}
async function reduceExecutionWithRules(input, rules, opts = {}) {
	const normalizedInput = normalizeExecutionInput(input);
	const rawText = buildRawText(normalizedInput);
	const measuredRawChars = countTextChars(stripAnsi(rawText));
	const resolvedMatch = opts.classifier ? void 0 : resolveRuleMatch(input, rules);
	const classification = resolvedMatch?.classification ?? classifyExecution(input, rules, opts.classifier);
	const reducerInput = resolvedMatch?.candidateInput ?? normalizedInput;
	const trace = opts.trace ? {
		...normalizedInput.command ? { normalizedCommand: normalizedInput.command } : {},
		...normalizedInput.argv?.length ? { normalizedArgv: normalizedInput.argv } : {},
		...reducerInput.command && reducerInput.command !== normalizedInput.command ? { reducerCommand: reducerInput.command } : {},
		...reducerInput.argv?.length && reducerInput.argv !== normalizedInput.argv ? { reducerArgv: reducerInput.argv } : {},
		...classification.matchedReducer ? { matchedReducer: classification.matchedReducer } : {},
		family: classification.family
	} : void 0;
	if (opts.raw) {
		const rawRef = opts.store ? await storeArtifact({
			input: normalizedInput,
			rawText,
			classification,
			stats: {
				rawChars: measuredRawChars,
				reducedChars: measuredRawChars,
				ratio: 1
			}
		}, opts.storeDir) : void 0;
		if (!opts.store && opts.recordStats) await storeArtifactMetadata({
			input: normalizedInput,
			rawText,
			classification,
			stats: {
				rawChars: measuredRawChars,
				reducedChars: measuredRawChars,
				ratio: 1
			}
		}, opts.storeDir);
		return {
			inlineText: rawText,
			compaction: NO_COMPACTION_METADATA,
			...trace ? { trace } : {},
			...rawRef ? { rawRef } : {},
			stats: {
				rawChars: measuredRawChars,
				reducedChars: measuredRawChars,
				ratio: 1
			},
			classification
		};
	}
	const inspectionSummary = buildInspectionSummary(normalizedInput, rawText);
	if (inspectionSummary) {
		const summaryText = inspectionSummary.lines.join("\n").trim();
		const selectedText = clampTextMiddleWithMetadata(summaryText, opts.maxInlineChars ?? 1200);
		const reducedChars = countTextChars(selectedText.text);
		const summaryClassification = {
			family: "structured-summary",
			confidence: .9,
			matchedReducer: inspectionSummary.matchedReducer
		};
		const stats = {
			rawChars: measuredRawChars,
			reducedChars,
			ratio: measuredRawChars === 0 ? 1 : reducedChars / measuredRawChars
		};
		const rawRef = opts.store ? await storeArtifact({
			input: normalizedInput,
			rawText,
			classification: summaryClassification,
			stats
		}, opts.storeDir) : void 0;
		if (!opts.store && opts.recordStats) await storeArtifactMetadata({
			input: normalizedInput,
			rawText,
			classification: summaryClassification,
			stats
		}, opts.storeDir);
		return {
			inlineText: selectedText.text,
			previewText: summaryText,
			compaction: mergeCompactionMetadata(inspectionSummary.compaction, selectedText.compaction),
			...trace ? { trace } : {},
			...rawRef ? { rawRef } : {},
			stats,
			classification: summaryClassification
		};
	}
	if (classification.matchedReducer === "generic/fallback" && isFileContentInspectionCommand(normalizedInput)) {
		if (!opts.store && opts.recordStats) await storeArtifactMetadata({
			input: normalizedInput,
			rawText,
			classification,
			stats: {
				rawChars: measuredRawChars,
				reducedChars: measuredRawChars,
				ratio: 1
			}
		}, opts.storeDir);
		return {
			inlineText: rawText,
			compaction: NO_COMPACTION_METADATA,
			...trace ? { trace } : {},
			stats: {
				rawChars: measuredRawChars,
				reducedChars: measuredRawChars,
				ratio: 1
			},
			classification
		};
	}
	const matchedRule = rules.find((rule) => rule.rule.id === classification.matchedReducer) ?? rules.find((rule) => rule.rule.id === "generic/fallback");
	if (!matchedRule) throw new Error("missing generic fallback rule");
	const githubActionsFailureSummary = classification.matchedReducer === "generic/fallback" ? buildGithubActionsFailureSummary(reducerInput, rawText) : null;
	if (githubActionsFailureSummary) {
		const maxInlineChars = opts.maxInlineChars ?? 1200;
		const inlineText = clampTextMiddleWithMetadata(githubActionsFailureSummary.text, maxInlineChars);
		const reducedChars = countTextChars(inlineText.text);
		const stats = {
			rawChars: measuredRawChars,
			reducedChars,
			ratio: measuredRawChars === 0 ? 1 : reducedChars / measuredRawChars
		};
		const rawRef = opts.store ? await storeArtifact({
			input: normalizedInput,
			rawText,
			classification,
			stats
		}, opts.storeDir) : void 0;
		if (!opts.store && opts.recordStats) await storeArtifactMetadata({
			input: normalizedInput,
			rawText,
			classification,
			stats
		}, opts.storeDir);
		return {
			inlineText: inlineText.text,
			previewText: githubActionsFailureSummary.text,
			compaction: mergeCompactionMetadata(githubActionsFailureSummary.compaction, inlineText.compaction),
			...trace ? { trace } : {},
			...rawRef ? { rawRef } : {},
			stats,
			classification
		};
	}
	const { summary, facts, compaction } = applyRule(matchedRule, reducerInput, rawText);
	const compactText = formatInline(classification, reducerInput, summary || "(no output)", facts);
	const maxInlineChars = opts.maxInlineChars ?? 1200;
	const selectedText = selectInlineText(classification, reducerInput, rawText, compactText, maxInlineChars, compaction);
	const clamp = classification.family === "help" || selectedText.text.includes("\n") ? clampTextMiddleWithMetadata : clampTextWithMetadata;
	const provisionalReducedChars = countTextChars(clamp(selectedText.text, maxInlineChars).text);
	const provisionalStats = {
		rawChars: measuredRawChars,
		reducedChars: provisionalReducedChars,
		ratio: measuredRawChars === 0 ? 1 : provisionalReducedChars / measuredRawChars
	};
	const rawRef = opts.store ? await storeArtifact({
		input: normalizedInput,
		rawText,
		classification,
		stats: {
			rawChars: provisionalStats.rawChars,
			reducedChars: provisionalStats.reducedChars,
			ratio: provisionalStats.ratio
		}
	}, opts.storeDir) : void 0;
	const inlineText = clamp(selectedText.text, maxInlineChars);
	const reducedChars = countTextChars(inlineText.text);
	const stats = {
		rawChars: measuredRawChars,
		reducedChars,
		ratio: measuredRawChars === 0 ? 1 : reducedChars / measuredRawChars
	};
	if (!opts.store && opts.recordStats) await storeArtifactMetadata({
		input: normalizedInput,
		rawText,
		classification,
		stats
	}, opts.storeDir);
	return {
		inlineText: inlineText.text,
		...summary ? { previewText: summary } : {},
		...Object.keys(facts).length > 0 ? { facts } : {},
		compaction: mergeCompactionMetadata(selectedText.compaction, inlineText.compaction),
		...trace ? { trace } : {},
		...rawRef ? { rawRef } : {},
		stats,
		classification
	};
}
//#endregion
//#region node_modules/tokenjuice/dist/core/integrations/rewrite-policy.js
function getCompactionSkipReason(command, rawText, result, options) {
	const inlineText = typeof result.inlineText === "string" ? result.inlineText.trim() : "";
	const normalizedRaw = rawText.trim();
	const rawChars = typeof result.stats?.rawChars === "number" ? result.stats.rawChars : normalizedRaw.length;
	const reducedChars = typeof result.stats?.reducedChars === "number" ? result.stats.reducedChars : inlineText.length;
	const savedChars = rawChars - reducedChars;
	if (!inlineText || inlineText === normalizedRaw || reducedChars >= rawChars) return "no-compaction";
	if (typeof options.minSavedCharsAny === "number" && savedChars < options.minSavedCharsAny) return "low-savings-compaction";
	if (result.classification?.matchedReducer !== "generic/fallback") return null;
	if (options.skipGenericFallbackForCompoundCommands && isCompoundShellCommand(stripLeadingCdPrefix(command))) return "generic-compound-command";
	const ratio = rawChars === 0 ? 1 : reducedChars / rawChars;
	if (savedChars < options.genericFallbackMinSavedChars || ratio > options.genericFallbackMaxRatio) return "generic-weak-compaction";
	return null;
}
//#endregion
//#region node_modules/tokenjuice/dist/core/integrations/compact-bash-result.js
function resolveInspectionPolicy(input) {
	if (input.inspectionPolicy) return input.inspectionPolicy;
	return input.skipInspectionCommands ? "skip-all" : "compact-all";
}
function getOutputAwareInspectionSkipReason(policy, executionInput) {
	const command = executionInput.command ?? "";
	const rawText = executionInput.combinedText ?? "";
	const inspectionSkipReason = getInspectionCommandSkipReason(command, policy);
	if (inspectionSkipReason === "file-content-inspection-command" && buildInspectionSummary(executionInput, rawText)) return null;
	return inspectionSkipReason;
}
async function compactBashResult(input) {
	const command = input.command.trim();
	if (!command) return {
		action: "keep",
		reason: "unsupported",
		rawText: "",
		usedTrustedFullText: false
	};
	const rawText = input.trustedFullText ?? input.visibleText;
	const usedTrustedFullText = typeof input.trustedFullText === "string";
	if (!rawText.trim()) return {
		action: "keep",
		reason: "empty-output",
		rawText,
		usedTrustedFullText
	};
	const safeInventoryArgv = getSafeRepositoryInventorySourceArgv(command);
	const executionInput = {
		toolName: "exec",
		command,
		combinedText: rawText,
		...safeInventoryArgv ? { argv: safeInventoryArgv } : {},
		...typeof input.cwd === "string" && input.cwd.trim() ? { cwd: input.cwd } : {},
		...typeof input.exitCode === "number" ? { exitCode: input.exitCode } : {},
		...input.metadata ? { metadata: input.metadata } : {}
	};
	const inspectionSkipReason = getOutputAwareInspectionSkipReason(resolveInspectionPolicy(input), executionInput);
	if (inspectionSkipReason) return {
		action: "keep",
		reason: inspectionSkipReason,
		rawText,
		usedTrustedFullText
	};
	const result = await reduceExecution(executionInput, {
		...typeof input.cwd === "string" && input.cwd.trim() ? { cwd: input.cwd } : {},
		...typeof input.maxInlineChars === "number" ? { maxInlineChars: input.maxInlineChars } : {},
		recordStats: true,
		...input.storeRaw ? { store: true } : {}
	});
	const skipReason = getCompactionSkipReason(command, rawText, result, input);
	if (skipReason) return {
		action: "keep",
		reason: skipReason,
		rawText,
		usedTrustedFullText,
		result
	};
	return {
		action: "rewrite",
		rawText,
		usedTrustedFullText,
		result
	};
}
//#endregion
//#region node_modules/tokenjuice/dist/hosts/shared/tool-result.js
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function extractTextContent(content) {
	if (!Array.isArray(content)) return "";
	return content.filter((part) => isRecord$1(part) && part.type === "text" && typeof part.text === "string").map((part) => String(part.text)).join("\n");
}
function buildCompactionNotice(result, fullOutputPath) {
	const hints = [];
	if (result.rawRef?.id) hints.push(`raw artifact: ${result.rawRef.id}`);
	if (fullOutputPath) hints.push(`full output: ${fullOutputPath}`);
	return `tokenjuice compacted bash output${hints.length > 0 ? ` (${hints.join(", ")})` : ""}`;
}
function buildTokenjuiceDetails(result) {
	const rawChars = typeof result.stats?.rawChars === "number" ? result.stats.rawChars : 0;
	const reducedChars = typeof result.stats?.reducedChars === "number" ? result.stats.reducedChars : 0;
	return {
		compacted: true,
		rawChars,
		reducedChars,
		savedChars: Math.max(0, rawChars - reducedChars),
		...typeof result.classification?.matchedReducer === "string" ? { reducer: result.classification.matchedReducer } : {}
	};
}
function mergeDetails(existingDetails, tokenjuiceDetails) {
	if (isRecord$1(existingDetails)) return {
		...existingDetails,
		tokenjuice: tokenjuiceDetails
	};
	return { tokenjuice: tokenjuiceDetails };
}
//#endregion
//#region node_modules/tokenjuice/dist/hosts/pi/extension/utils.js
function formatErrorMessage(error) {
	if (error instanceof Error && error.message) return error.message;
	return String(error);
}
//#endregion
//#region node_modules/tokenjuice/dist/hosts/openclaw/extension.js
const DEFAULT_MAX_INLINE_CHARS = 1200;
const GENERIC_FALLBACK_MIN_SAVED_CHARS = 120;
const GENERIC_FALLBACK_MAX_RATIO = .75;
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isExecLikeToolName(toolName) {
	return toolName === "exec" || toolName === "bash";
}
function readCommand(input) {
	return isRecord(input) && typeof input.command === "string" ? input.command : "";
}
function readCwd(input, details, fallback) {
	if (isRecord(input) && typeof input.workdir === "string" && input.workdir.trim()) return input.workdir;
	if (isRecord(details) && typeof details.cwd === "string" && details.cwd.trim()) return details.cwd;
	return fallback;
}
function readAggregatedText(details, content) {
	if (isRecord(details) && typeof details.aggregated === "string") return details.aggregated;
	return extractTextContent(content);
}
function readExitCode(details, isError) {
	if (isRecord(details) && typeof details.exitCode === "number") return details.exitCode;
	return isError ? 1 : 0;
}
function isCompletedExecDetails(details) {
	if (!isRecord(details)) return false;
	return details.status === "completed" || details.status === "failed";
}
function createTokenjuiceOpenClawEmbeddedExtension() {
	return function tokenjuiceOpenClawExtension(pi) {
		pi.on("tool_result", async (rawEvent, ctx) => {
			const event = rawEvent;
			if (!isExecLikeToolName(event.toolName)) return;
			if (!isCompletedExecDetails(event.details)) return;
			const command = readCommand(event.input);
			if (!command) return;
			const outputText = readAggregatedText(event.details, event.content);
			if (!outputText.trim()) return;
			if (getOutputAwareInspectionSkipReason("allow-safe-inventory", {
				toolName: "exec",
				command,
				combinedText: outputText
			})) return;
			try {
				const outcome = await compactBashResult({
					source: "openclaw",
					command,
					cwd: readCwd(event.input, event.details, ctx.cwd),
					visibleText: outputText,
					exitCode: readExitCode(event.details, Boolean(event.isError)),
					maxInlineChars: DEFAULT_MAX_INLINE_CHARS,
					inspectionPolicy: "allow-safe-inventory",
					minSavedCharsAny: 8,
					genericFallbackMinSavedChars: GENERIC_FALLBACK_MIN_SAVED_CHARS,
					genericFallbackMaxRatio: GENERIC_FALLBACK_MAX_RATIO,
					skipGenericFallbackForCompoundCommands: true,
					metadata: { source: "openclaw-tool-result" }
				});
				if (outcome.action === "keep") return;
				return {
					content: [{
						type: "text",
						text: `${outcome.result.inlineText}\n\n[${buildCompactionNotice(outcome.result)}]`
					}],
					details: mergeDetails(event.details, buildTokenjuiceDetails(outcome.result))
				};
			} catch (error) {
				throw new Error(`tokenjuice failed to compact OpenClaw exec output: ${formatErrorMessage(error)}`);
			}
		});
	};
}
//#endregion
export { createTokenjuiceOpenClawEmbeddedExtension as t };
