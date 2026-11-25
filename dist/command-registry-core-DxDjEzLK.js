import { t as resolveCliArgvInvocation } from "./argv-invocation-CBWH8ntt.js";
import { i as registerCommandGroups, r as registerCommandGroupByName } from "./register-command-groups-CsNgic4w.js";
import { n as shouldRegisterPrimaryCommandOnly } from "./command-registration-policy-CjqvQuJS.js";
import { a as defineImportedCommandGroupSpec, i as buildCommandGroupEntries, o as defineImportedProgramCommandGroupSpecs } from "./register.subclis-core-iV1AKuCw.js";
import { n as getCoreCliCommandNames$1, t as getCoreCliCommandDescriptors } from "./core-command-descriptors-CQfqUo7Y.js";
//#region src/cli/program/command-registry-core.ts
function withProgramOnlySpecs(specs) {
	return specs.map((spec) => ({
		commandNames: spec.commandNames,
		register: async ({ program }) => {
			await spec.register(program);
		}
	}));
}
const coreEntrySpecs = [
	...withProgramOnlySpecs(defineImportedProgramCommandGroupSpecs([
		{
			commandNames: ["setup"],
			loadModule: () => import("./register.setup-BIEA8N6g.js"),
			exportName: "registerSetupCommand"
		},
		{
			commandNames: ["onboard"],
			loadModule: () => import("./register.onboard-BtJhx-Ly.js"),
			exportName: "registerOnboardCommand"
		},
		{
			commandNames: ["configure"],
			loadModule: () => import("./register.configure-YdYfXavy.js"),
			exportName: "registerConfigureCommand"
		},
		{
			commandNames: ["config"],
			loadModule: () => import("./config-cli-Bw_LDCOa.js"),
			exportName: "registerConfigCli"
		},
		{
			commandNames: ["backup"],
			loadModule: () => import("./register.backup-BvoJJCFu.js"),
			exportName: "registerBackupCommand"
		},
		{
			commandNames: [
				"doctor",
				"dashboard",
				"reset",
				"uninstall"
			],
			loadModule: () => import("./register.maintenance-CEn3-uK_.js"),
			exportName: "registerMaintenanceCommands"
		}
	])),
	defineImportedCommandGroupSpec(["message"], () => import("./register.message-OqBrQtGh.js"), (mod, { program, ctx }) => {
		mod.registerMessageCommands(program, ctx);
	}),
	...withProgramOnlySpecs(defineImportedProgramCommandGroupSpecs([{
		commandNames: ["mcp"],
		loadModule: () => import("./mcp-cli-BbwvI4Is.js"),
		exportName: "registerMcpCli"
	}])),
	defineImportedCommandGroupSpec(["agent", "agents"], () => import("./register.agent-CDEorxtu.js"), (mod, { program, ctx }) => {
		mod.registerAgentCommands(program, { agentChannelOptions: ctx.agentChannelOptions });
	}),
	...withProgramOnlySpecs(defineImportedProgramCommandGroupSpecs([
		{
			commandNames: [
				"status",
				"health",
				"sessions",
				"tasks"
			],
			loadModule: () => import("./register.status-health-sessions-Dnh236mS.js"),
			exportName: "registerStatusHealthSessionsCommands"
		},
		{
			commandNames: ["audit"],
			loadModule: () => import("./register.audit-B4tluw6c.js"),
			exportName: "registerAuditCommand"
		},
		{
			commandNames: ["history"],
			loadModule: () => import("./register.history-Cs_3wCUp.js"),
			exportName: "registerHistoryCommand"
		},
		{
			commandNames: ["trust"],
			loadModule: () => import("./register.trust-4cOoOpfl.js"),
			exportName: "registerTrustCommand"
		},
		{
			commandNames: ["auth"],
			loadModule: () => import("./register.auth-DmQQ2a9V.js"),
			exportName: "registerAuthCommand"
		},
		{
			commandNames: ["policy"],
			loadModule: () => import("./register.policy-DzZJDNiN.js"),
			exportName: "registerPolicyCommand"
		},
		{
			commandNames: ["conformance"],
			loadModule: () => import("./register.conformance-R07OuPD6.js"),
			exportName: "registerConformanceCommand"
		},
		{
			commandNames: ["run"],
			loadModule: () => import("./register.run-Cwo070-e.js"),
			exportName: "registerRunCommand"
		},
		{
			commandNames: ["swarm"],
			loadModule: () => import("./register.swarm-BVuY7-VX.js"),
			exportName: "registerSwarmCommand"
		},
		{
			commandNames: ["netcage"],
			loadModule: () => import("./register.netcage-BFyjjUC6.js"),
			exportName: "registerNetcageCommand"
		}
	]))
];
function resolveCoreCommandGroups(ctx, argv) {
	return buildCommandGroupEntries(getCoreCliCommandDescriptors(), coreEntrySpecs, (register) => async (program) => {
		await register({
			program,
			ctx,
			argv
		});
	});
}
function getCoreCliCommandNames() {
	return getCoreCliCommandNames$1();
}
async function registerCoreCliByName(program, ctx, name, argv = process.argv) {
	return registerCommandGroupByName(program, resolveCoreCommandGroups(ctx, argv), name);
}
function registerCoreCliCommands(program, ctx, argv) {
	const { primary } = resolveCliArgvInvocation(argv);
	registerCommandGroups(program, resolveCoreCommandGroups(ctx, argv), {
		eager: false,
		primary,
		registerPrimaryOnly: Boolean(primary && shouldRegisterPrimaryCommandOnly(argv))
	});
}
//#endregion
export { registerCoreCliByName as n, registerCoreCliCommands as r, getCoreCliCommandNames as t };
