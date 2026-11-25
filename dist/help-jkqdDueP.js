import { F as hasRootVersionAlias, N as hasFlag, g as ALLOWED_LOG_LEVELS, y as tryParseLogLevel } from "./logger-K1GaCajM.js";
import { c as escapeRegExp } from "./utils-BcQ7uNrT.js";
import { r as formatDocsLink } from "./links-CpzyPPKB.js";
import { n as isRich, r as theme } from "./theme-m3fOXe3B.js";
import { n as resolveCliName, t as replaceCliName } from "./cli-name-5jGzqIc2.js";
import { n as resolveCommitHash } from "./git-commit-OUPazS-5.js";
import { n as formatCliBannerLine, r as hasEmittedCliBanner } from "./banner-bZnuwFyM.js";
import { r as getCoreCliCommandsWithSubcommands } from "./core-command-descriptors-CQfqUo7Y.js";
import { t as getSubCliCommandsWithSubcommands } from "./subcli-descriptors-CRytb6QI.js";
import { InvalidArgumentError } from "commander";
//#region src/cli/log-level-option.ts
const CLI_LOG_LEVEL_VALUES = ALLOWED_LOG_LEVELS.join("|");
function parseCliLogLevelOption(value) {
	const parsed = tryParseLogLevel(value);
	if (!parsed) throw new InvalidArgumentError(`Invalid --log-level (use ${CLI_LOG_LEVEL_VALUES})`);
	return parsed;
}
//#endregion
//#region src/cli/program/help.ts
const CLI_NAME = resolveCliName();
const CLI_NAME_PATTERN = escapeRegExp(CLI_NAME);
const ROOT_COMMANDS_WITH_SUBCOMMANDS = new Set([...getCoreCliCommandsWithSubcommands(), ...getSubCliCommandsWithSubcommands()]);
const ROOT_COMMANDS_HINT = "Hint: commands suffixed with * have subcommands. Run <command> --help for details.";
const EXAMPLES = [
	["enclawed models --help", "Show detailed help for the models command."],
	["enclawed channels login --verbose", "Link personal WhatsApp Web and show QR + connection logs."],
	["enclawed message send --target +15555550123 --message \"Hi\" --json", "Send via your web session and print JSON result."],
	["enclawed gateway --port 18789", "Run the WebSocket Gateway locally."],
	["enclawed --dev gateway", "Run a dev Gateway (isolated state/config) on ws://127.0.0.1:19001."],
	["enclawed gateway --force", "Kill anything bound to the default gateway port, then start it."],
	["enclawed gateway ...", "Gateway control via WebSocket."],
	["enclawed agent --to +15555550123 --message \"Run summary\" --deliver", "Talk directly to the agent using the Gateway; optionally send the WhatsApp reply."],
	["enclawed message send --channel telegram --target @mychat --message \"Hi\"", "Send via your Telegram bot."]
];
function configureProgramHelp(program, ctx) {
	program.name(CLI_NAME).description("").version(ctx.programVersion).option("--container <name>", "Run the CLI inside a running Podman/Docker container named <name> (default: env ENCLAWED_CONTAINER)").option("--dev", "Dev profile: isolate state under ~/.enclawed-dev, default gateway port 19001, and shift derived ports (browser/canvas)").option("--profile <name>", "Use a named profile (isolates ENCLAWED_STATE_DIR/ENCLAWED_CONFIG_PATH under ~/.enclawed-<name>)").option("--log-level <level>", `Global log level override for file + console (${CLI_LOG_LEVEL_VALUES})`, parseCliLogLevelOption);
	program.option("--no-color", "Disable ANSI colors", false);
	program.helpOption("-h, --help", "Display help for command");
	program.helpCommand("help [command]", "Display help for command");
	program.configureHelp({
		sortSubcommands: true,
		sortOptions: true,
		optionTerm: (option) => theme.option(option.flags),
		subcommandTerm: (cmd) => {
			const hasSubcommands = cmd.parent === program && ROOT_COMMANDS_WITH_SUBCOMMANDS.has(cmd.name());
			return theme.command(hasSubcommands ? `${cmd.name()} *` : cmd.name());
		}
	});
	const formatHelpOutput = (str) => {
		let output = str;
		if (new RegExp(`^Usage:\\s+${CLI_NAME_PATTERN}\\s+\\[options\\]\\s+\\[command\\]\\s*$`, "m").test(output) && /^Commands:/m.test(output)) output = output.replace(/^Commands:/m, `Commands:\n  ${theme.muted(ROOT_COMMANDS_HINT)}`);
		return output.replace(/^Usage:/gm, theme.heading("Usage:")).replace(/^Options:/gm, theme.heading("Options:")).replace(/^Commands:/gm, theme.heading("Commands:"));
	};
	program.configureOutput({
		writeOut: (str) => {
			process.stdout.write(formatHelpOutput(str));
		},
		writeErr: (str) => {
			process.stderr.write(formatHelpOutput(str));
		},
		outputError: (str, write) => write(theme.error(str))
	});
	if (hasFlag(process.argv, "-V") || hasFlag(process.argv, "--version") || hasRootVersionAlias(process.argv)) {
		const commit = resolveCommitHash({ moduleUrl: import.meta.url });
		console.log(commit ? `enclawed ${ctx.programVersion} (${commit})` : `enclawed ${ctx.programVersion}`);
		process.exit(0);
	}
	program.addHelpText("beforeAll", () => {
		if (hasEmittedCliBanner()) return "";
		const rich = isRich();
		return `\n${formatCliBannerLine(ctx.programVersion, { richTty: rich })}\n`;
	});
	const fmtExamples = EXAMPLES.map(([cmd, desc]) => `  ${theme.command(replaceCliName(cmd, CLI_NAME))}\n    ${theme.muted(desc)}`).join("\n");
	program.addHelpText("afterAll", ({ command }) => {
		if (command !== program) return "";
		const docs = formatDocsLink("/cli", "docs/cli/index.md");
		return `\n${theme.heading("Examples:")}\n${fmtExamples}\n\n${theme.muted("Docs:")} ${docs}\n`;
	});
}
//#endregion
export { configureProgramHelp as t };
