import { r as formatDocsLink } from "./links-DrliplKz.js";
import { r as theme } from "./theme-saR5plEq.js";
import { t as registerQrCli } from "./qr-cli-DYsoySrp.js";
//#region src/cli/clawbot-cli.ts
function registerClawbotCli(program) {
	registerQrCli(program.command("clawbot").description("Legacy clawbot command aliases").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/clawbot", "docs/cli/clawbot.md")}\n`));
}
//#endregion
export { registerClawbotCli };
