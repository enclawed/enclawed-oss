import { t as resolveCliArgvInvocation } from "./argv-invocation-L1bu69lF.js";
import { i as registerCommandGroups, r as registerCommandGroupByName } from "./register-command-groups-CzDI8f09.js";
import { n as shouldRegisterPrimaryCommandOnly } from "./command-registration-policy-Bwj-Zwso.js";
import { a as defineImportedCommandGroupSpec, i as buildCommandGroupEntries, o as defineImportedProgramCommandGroupSpecs } from "./register.subclis-core-CWiozsHv.js";
import { n as getCoreCliCommandNames$1, t as getCoreCliCommandDescriptors } from "./core-command-descriptors-CgulG0TG.js";
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
			loadModule: () => import("./register.setup-DPrjiIeY.js"),
			exportName: "registerSetupCommand"
		},
		{
			commandNames: ["onboard"],
			loadModule: () => import("./register.onboard-DGVgbmCT.js"),
			exportName: "registerOnboardCommand"
		},
		{
			commandNames: ["configure"],
			loadModule: () => import("./register.configure-CLCWvuYL.js"),
			exportName: "registerConfigureCommand"
		},
		{
			commandNames: ["config"],
			loadModule: () => import("./config-cli-CHmxpZ3W.js"),
			exportName: "registerConfigCli"
		},
		{
			commandNames: ["backup"],
			loadModule: () => import("./register.backup-BhyDkMxx.js"),
			exportName: "registerBackupCommand"
		},
		{
			commandNames: [
				"doctor",
				"dashboard",
				"reset",
				"uninstall"
			],
			loadModule: () => import("./register.maintenance-CwihUD9t.js"),
			exportName: "registerMaintenanceCommands"
		}
	])),
	defineImportedCommandGroupSpec(["message"], () => import("./register.message-QpHI0M4V.js"), (mod, { program, ctx }) => {
		mod.registerMessageCommands(program, ctx);
	}),
	...withProgramOnlySpecs(defineImportedProgramCommandGroupSpecs([{
		commandNames: ["mcp"],
		loadModule: () => import("./mcp-cli-CFJwd0Ua.js"),
		exportName: "registerMcpCli"
	}])),
	defineImportedCommandGroupSpec(["agent", "agents"], () => import("./register.agent-n1dWfXRK.js"), (mod, { program, ctx }) => {
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
			loadModule: () => import("./register.status-health-sessions-DItzhIvS.js"),
			exportName: "registerStatusHealthSessionsCommands"
		},
		{
			commandNames: ["audit"],
			loadModule: () => import("./register.audit-BmkSkch2.js"),
			exportName: "registerAuditCommand"
		},
		{
			commandNames: ["trust"],
			loadModule: () => import("./register.trust-DUP_aEXS.js"),
			exportName: "registerTrustCommand"
		},
		{
			commandNames: ["policy"],
			loadModule: () => import("./register.policy-CSAUkEIA.js"),
			exportName: "registerPolicyCommand"
		},
		{
			commandNames: ["run"],
			loadModule: () => import("./register.run-DDnITvlk.js"),
			exportName: "registerRunCommand"
		},
		{
			commandNames: ["swarm"],
			loadModule: () => import("./register.swarm-CunjwCad.js"),
			exportName: "registerSwarmCommand"
		},
		{
			commandNames: ["netcage"],
			loadModule: () => import("./register.netcage-1jyOp1nA.js"),
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
