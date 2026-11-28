import { t as resolveCliArgvInvocation } from "./argv-invocation-CBWH8ntt.js";
import { i as registerCommandGroups, r as registerCommandGroupByName } from "./register-command-groups-DeDm-O0A.js";
import { n as shouldRegisterPrimaryCommandOnly } from "./command-registration-policy-D5mxphu4.js";
import { a as defineImportedCommandGroupSpec, i as buildCommandGroupEntries, o as defineImportedProgramCommandGroupSpecs } from "./register.subclis-core-C9BDO4ol.js";
import { n as getCoreCliCommandNames$1, t as getCoreCliCommandDescriptors } from "./core-command-descriptors-D6FFRujd.js";
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
			loadModule: () => import("./register.setup-DH6Gy0Ri.js"),
			exportName: "registerSetupCommand"
		},
		{
			commandNames: ["onboard"],
			loadModule: () => import("./register.onboard-DWWXyJfR.js"),
			exportName: "registerOnboardCommand"
		},
		{
			commandNames: ["configure"],
			loadModule: () => import("./register.configure-DcpEtfY7.js"),
			exportName: "registerConfigureCommand"
		},
		{
			commandNames: ["config"],
			loadModule: () => import("./config-cli-DLWMWa94.js"),
			exportName: "registerConfigCli"
		},
		{
			commandNames: ["backup"],
			loadModule: () => import("./register.backup-BK8UOOHx.js"),
			exportName: "registerBackupCommand"
		},
		{
			commandNames: [
				"doctor",
				"dashboard",
				"reset",
				"uninstall"
			],
			loadModule: () => import("./register.maintenance-a9KdTND-.js"),
			exportName: "registerMaintenanceCommands"
		}
	])),
	defineImportedCommandGroupSpec(["message"], () => import("./register.message-DvGP7VU-.js"), (mod, { program, ctx }) => {
		mod.registerMessageCommands(program, ctx);
	}),
	...withProgramOnlySpecs(defineImportedProgramCommandGroupSpecs([{
		commandNames: ["mcp"],
		loadModule: () => import("./mcp-cli-CCabkys8.js"),
		exportName: "registerMcpCli"
	}])),
	defineImportedCommandGroupSpec(["agent", "agents"], () => import("./register.agent-C82TGoXF.js"), (mod, { program, ctx }) => {
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
			loadModule: () => import("./register.status-health-sessions-D7PKHYfR.js"),
			exportName: "registerStatusHealthSessionsCommands"
		},
		{
			commandNames: ["audit"],
			loadModule: () => import("./register.audit-Dg1-OhGx.js"),
			exportName: "registerAuditCommand"
		},
		{
			commandNames: ["history"],
			loadModule: () => import("./register.history-Dho_SfWC.js"),
			exportName: "registerHistoryCommand"
		},
		{
			commandNames: ["trust"],
			loadModule: () => import("./register.trust-CKpXgNa2.js"),
			exportName: "registerTrustCommand"
		},
		{
			commandNames: ["auth"],
			loadModule: () => import("./register.auth-D3exn3w1.js"),
			exportName: "registerAuthCommand"
		},
		{
			commandNames: ["policy"],
			loadModule: () => import("./register.policy-CM9poe39.js"),
			exportName: "registerPolicyCommand"
		},
		{
			commandNames: ["conformance"],
			loadModule: () => import("./register.conformance-_iZzGvTO.js"),
			exportName: "registerConformanceCommand"
		},
		{
			commandNames: ["run"],
			loadModule: () => import("./register.run-YBS-MFtr.js"),
			exportName: "registerRunCommand"
		},
		{
			commandNames: ["swarm"],
			loadModule: () => import("./register.swarm-FOAsM2_7.js"),
			exportName: "registerSwarmCommand"
		},
		{
			commandNames: ["netcage"],
			loadModule: () => import("./register.netcage-wh1wsEh6.js"),
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
