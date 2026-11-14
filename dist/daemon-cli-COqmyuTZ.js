import { t as formatDocsLink } from "./links-CgfBdVgk.js";
import { r as theme } from "./theme-Cggjth0b.js";
import { t as addGatewayServiceCommands } from "./register-service-commands-Crk1xRTj.js";
import "./install-z26j9n8s.js";
import "./lifecycle-BFJHFgYP.js";
import "./status-DOQjoZuw.js";
//#region src/cli/daemon-cli/register.ts
function registerDaemonCli(program) {
	addGatewayServiceCommands(program.command("daemon").description("Manage the Gateway service (launchd/systemd/schtasks)").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.enclawed.ai/cli/gateway")}\n`), { statusDescription: "Show service install status + probe the Gateway" });
}
//#endregion
export { registerDaemonCli as t };
