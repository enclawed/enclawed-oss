import { t as formatDocsLink } from "./links-CjFnnUDy.js";
import { r as theme } from "./theme-hNdBadll.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-DWtiKVJs.js";
import "./install-B6tp4IJ3.js";
import "./lifecycle-sYsXjRj1.js";
import "./status-C5rduqWx.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.enclawed.ai/cli/gateway")}\n`), { statusDescription: "Show service install status + probe the Gateway" });
}
//#endregion
export { registerDaemonCli as t };
