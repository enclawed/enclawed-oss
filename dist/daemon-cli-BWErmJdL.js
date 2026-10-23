import { t as formatDocsLink } from "./links-CQmuHMWu.js";
import { r as theme } from "./theme-BVnTyzuE.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-BPODG8hs.js";
import "./install-CrKkJJQ8.js";
import "./lifecycle-Cyqkiqha.js";
import "./status-DF7cYngv.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.enclawed.ai/cli/gateway")}\n`), { statusDescription: "Show service install status + probe the Gateway" });
}
//#endregion
export { registerDaemonCli as t };
