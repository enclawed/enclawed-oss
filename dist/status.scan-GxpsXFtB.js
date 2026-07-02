import { t as hasPotentialConfiguredChannels } from "./config-presence-CEgE5QUB.js";
import { n as withProgress } from "./progress-Bnz7HAqX.js";
import { n as buildPluginCompatibilityNotices } from "./status-BSwGNVSk.js";
import { t as collectStatusScanOverview } from "./status.scan-overview-23C7nu5X.js";
import { i as executeStatusScanFromOverview, n as scanStatusJsonWithPolicy, r as resolveStatusMemoryStatusSnapshot } from "./status.scan.fast-json-CkEt5ZZz.js";
//#region src/commands/status.scan.ts
async function scanStatus(opts, _runtime) {
	if (opts.json) return await scanStatusJsonWithPolicy({
		timeoutMs: opts.timeoutMs,
		all: opts.all
	}, _runtime, {
		commandName: "status --json",
		resolveHasConfiguredChannels: (cfg) => hasPotentialConfiguredChannels(cfg),
		resolveMemory: async ({ cfg, agentStatus, memoryPlugin }) => await resolveStatusMemoryStatusSnapshot({
			cfg,
			agentStatus,
			memoryPlugin
		})
	});
	return await withProgress({
		label: "Scanning status…",
		total: 10,
		enabled: true
	}, async (progress) => {
		const overview = await collectStatusScanOverview({
			commandName: "status",
			opts,
			showSecrets: process.env.ENCLAWED_SHOW_SECRETS?.trim() !== "0",
			progress,
			labels: {
				loadingConfig: "Loading config…",
				checkingTailscale: "Checking Tailscale…",
				checkingForUpdates: "Checking for updates…",
				resolvingAgents: "Resolving agents…",
				probingGateway: "Probing gateway…",
				queryingChannelStatus: "Querying channel status…",
				summarizingChannels: "Summarizing channels…"
			}
		});
		progress.setLabel("Checking plugins…");
		const pluginCompatibility = buildPluginCompatibilityNotices({ config: overview.cfg });
		progress.tick();
		progress.setLabel("Checking memory and sessions…");
		const result = await executeStatusScanFromOverview({
			overview,
			resolveMemory: async ({ cfg, agentStatus, memoryPlugin }) => await resolveStatusMemoryStatusSnapshot({
				cfg,
				agentStatus,
				memoryPlugin
			}),
			channelIssues: overview.channelIssues,
			channels: overview.channels,
			pluginCompatibility
		});
		progress.tick();
		progress.setLabel("Rendering…");
		progress.tick();
		return result;
	});
}
//#endregion
export { scanStatus };
