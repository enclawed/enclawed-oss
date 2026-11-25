import { n as defaultRuntime } from "./runtime-1ULlIz69.js";
import { r as formatDocsLink } from "./links-CpzyPPKB.js";
import { r as theme } from "./theme-m3fOXe3B.js";
import { n as runCommandWithRuntime } from "./cli-utils-0UxwpDtv.js";
import { n as configureCommandFromSectionsArg, o as CONFIGURE_WIZARD_SECTIONS } from "./configure-gKLqZe7b.js";
//#region src/cli/program/register.configure.ts
function registerConfigureCommand(program) {
	program.command("configure").description("Interactive configuration for credentials, channels, gateway, and agent defaults").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/configure", "docs/cli/configure.md")}\n`).option("--section <section>", `Configuration sections (repeatable). Options: ${CONFIGURE_WIZARD_SECTIONS.join(", ")}`, (value, previous) => [...previous, value], []).action(async (opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			await configureCommandFromSectionsArg(opts.section, defaultRuntime);
		});
	});
}
//#endregion
export { registerConfigureCommand };
