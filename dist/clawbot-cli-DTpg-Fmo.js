import { r as formatDocsLink } from "./links-CpzyPPKB.js";
import { r as theme } from "./theme-m3fOXe3B.js";
import { t as registerQrCli } from "./qr-cli-SrDegWW9.js";
//#region src/cli/clawbot-cli.ts
function registerClawbotCli(program) {
	registerQrCli(program.command("clawbot").description("Legacy clawbot command aliases").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/clawbot", "docs/cli/clawbot.md")}\n`));
}
//#endregion
export { registerClawbotCli };
