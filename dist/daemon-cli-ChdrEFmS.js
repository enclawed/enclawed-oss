import { r as formatDocsLink } from "./links-DrliplKz.js";
import { r as theme } from "./theme-saR5plEq.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-C9dBRnIk.js";
import "./install-BpPYn-BO.js";
import "./lifecycle-DDBVdLOb.js";
import "./status-CGxJo6PA.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs/cli/gateway.md")}\n`), { statusDescription: "Show service install status + probe the Gateway" });
}
//#endregion
export { registerDaemonCli as t };
