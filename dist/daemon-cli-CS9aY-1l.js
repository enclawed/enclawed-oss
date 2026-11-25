import { r as formatDocsLink } from "./links-CpzyPPKB.js";
import { r as theme } from "./theme-m3fOXe3B.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-BeL3x2Q3.js";
import "./install-DF_LE1-Y.js";
import "./lifecycle-B8M1-lTe.js";
import "./status-BOa-bBGG.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs/cli/gateway.md")}\n`), { statusDescription: "Show service install status + probe the Gateway" });
}
//#endregion
export { registerDaemonCli as t };
