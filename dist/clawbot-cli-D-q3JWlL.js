import { t as formatDocsLink } from "./links-CgfBdVgk.js";
import { r as theme } from "./theme-Cggjth0b.js";
import { t as registerQrCli } from "./qr-cli-7jmwC2la.js";
//#region src/cli/clawbot-cli.ts
function registerClawbotCli(program) {
	registerQrCli(program.command("clawbot").description("Legacy clawbot command aliases").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/clawbot", "docs.enclawed.ai/cli/clawbot")}\n`));
}
//#endregion
export { registerClawbotCli };
