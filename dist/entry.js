#!/usr/bin/env node
import { t as isMainModule } from "./is-main-C_eE8dOT.js";
import { N as isRootHelpInvocation, P as isRootVersionInvocation } from "./logger-wuQoU2z2.js";
import { t as resolveCliArgvInvocation } from "./argv-invocation-L1bu69lF.js";
import { a as parseCliContainerArgs, n as applyCliProfileEnv, o as resolveCliContainerTarget, r as parseCliProfileArgs, t as normalizeWindowsArgv } from "./windows-argv-Bs3b9ucU.js";
import { t as resolveNodeStartupTlsEnvironment } from "./node-startup-env-BRa4mYVi.js";
import { r as resolveWorkspaceDirInfo, t as logWorkspaceDirResolution } from "./workspace-dir-BFXVbXDc.js";
import { r as normalizeEnv, t as isTruthyEnvValue } from "./env-Cb5sXvy0.js";
import { t as ensureEnclawedExecMarkerOnProcess } from "./enclawed-exec-env-DnJET5Xz.js";
import { t as installProcessWarningFilter } from "./warning-filter-D_30K1_u.js";
import { enableCompileCache } from "node:module";
import process$1 from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
//#region src/cli/respawn-policy.ts
function shouldSkipRespawnForArgv(argv) {
	return resolveCliArgvInvocation(argv).hasHelpOrVersion;
}
//#endregion
//#region src/entry.respawn.ts
const EXPERIMENTAL_WARNING_FLAG = "--disable-warning=ExperimentalWarning";
const ENCLAWED_NODE_OPTIONS_READY = "ENCLAWED_NODE_OPTIONS_READY";
const ENCLAWED_NODE_EXTRA_CA_CERTS_READY = "ENCLAWED_NODE_EXTRA_CA_CERTS_READY";
function hasExperimentalWarningSuppressed(params = {}) {
	const env = params.env ?? process.env;
	const execArgv = params.execArgv ?? process.execArgv;
	const nodeOptions = env.NODE_OPTIONS ?? "";
	if (nodeOptions.includes("--disable-warning=ExperimentalWarning") || nodeOptions.includes("--no-warnings")) return true;
	return execArgv.some((arg) => arg === "--disable-warning=ExperimentalWarning" || arg === "--no-warnings");
}
function buildCliRespawnPlan(params = {}) {
	const argv = params.argv ?? process.argv;
	const env = params.env ?? process.env;
	const execArgv = params.execArgv ?? process.execArgv;
	const execPath = params.execPath ?? process.execPath;
	if (shouldSkipRespawnForArgv(argv) || isTruthyEnvValue(env.ENCLAWED_NO_RESPAWN)) return null;
	const childEnv = { ...env };
	const childExecArgv = [...execArgv];
	let needsRespawn = false;
	const autoNodeExtraCaCerts = params.autoNodeExtraCaCerts ?? resolveNodeStartupTlsEnvironment({
		env,
		execPath,
		includeDarwinDefaults: false
	}).NODE_EXTRA_CA_CERTS;
	if (autoNodeExtraCaCerts && !isTruthyEnvValue(env["ENCLAWED_NODE_EXTRA_CA_CERTS_READY"]) && !env.NODE_EXTRA_CA_CERTS) {
		childEnv.NODE_EXTRA_CA_CERTS = autoNodeExtraCaCerts;
		childEnv[ENCLAWED_NODE_EXTRA_CA_CERTS_READY] = "1";
		needsRespawn = true;
	}
	if (!isTruthyEnvValue(env["ENCLAWED_NODE_OPTIONS_READY"]) && !hasExperimentalWarningSuppressed({
		env,
		execArgv
	})) {
		childEnv[ENCLAWED_NODE_OPTIONS_READY] = "1";
		childExecArgv.unshift(EXPERIMENTAL_WARNING_FLAG);
		needsRespawn = true;
	}
	if (!needsRespawn) return null;
	return {
		argv: [...childExecArgv, ...argv.slice(1)],
		env: childEnv
	};
}
//#endregion
//#region src/infra/brand-env.ts
const OPENCLAW_PREFIX = "OPENCLAW_";
const ENCLAWED_PREFIX = "ENCLAWED_";
function mirrorPrefix(env, sourcePrefix, targetPrefix, options) {
	const sourceKeys = Object.keys(env).filter((key) => key.startsWith(sourcePrefix));
	for (const sourceKey of sourceKeys) {
		const suffix = sourceKey.slice(sourcePrefix.length);
		if (suffix.length === 0) continue;
		const value = env[sourceKey];
		if (value === void 0) continue;
		const targetKey = `${targetPrefix}${suffix}`;
		if (options.overwrite || env[targetKey] === void 0) env[targetKey] = value;
	}
}
/**
* Mirror `OPENCLAW_*` and `ENCLAWED_*` env vars in both directions so that
* existing code reading either prefix continues to work, while `ENCLAWED_*`
* wins on conflict.
*
* Call this exactly once, before any extension or plugin loads.
*
* @param env - The env object to mutate. Defaults to `process.env`.
*/
function mirrorBrandEnv(env = process.env) {
	mirrorPrefix(env, OPENCLAW_PREFIX, ENCLAWED_PREFIX, { overwrite: false });
	mirrorPrefix(env, ENCLAWED_PREFIX, OPENCLAW_PREFIX, { overwrite: true });
}
//#endregion
//#region src/process/child-process-bridge.ts
const defaultSignals = process$1.platform === "win32" ? [
	"SIGTERM",
	"SIGINT",
	"SIGBREAK"
] : [
	"SIGTERM",
	"SIGINT",
	"SIGHUP",
	"SIGQUIT"
];
function attachChildProcessBridge(child, { signals = defaultSignals, onSignal } = {}) {
	const listeners = /* @__PURE__ */ new Map();
	for (const signal of signals) {
		const listener = () => {
			onSignal?.(signal);
			try {
				child.kill(signal);
			} catch {}
		};
		try {
			process$1.on(signal, listener);
			listeners.set(signal, listener);
		} catch {}
	}
	const detach = () => {
		for (const [signal, listener] of listeners) process$1.off(signal, listener);
		listeners.clear();
	};
	child.once("exit", detach);
	child.once("error", detach);
	return { detach };
}
//#endregion
//#region src/entry.ts
const ENTRY_WRAPPER_PAIRS = [{
	wrapperBasename: "enclawed.mjs",
	entryBasename: "entry.js"
}, {
	wrapperBasename: "enclawed.js",
	entryBasename: "entry.js"
}];
function shouldForceReadOnlyAuthStore(argv) {
	const tokens = argv.slice(2).filter((token) => token.length > 0 && !token.startsWith("-"));
	for (let index = 0; index < tokens.length - 1; index += 1) if (tokens[index] === "secrets" && tokens[index + 1] === "audit") return true;
	return false;
}
if (!isMainModule({
	currentFile: fileURLToPath(import.meta.url),
	wrapperEntryPairs: [...ENTRY_WRAPPER_PAIRS]
})) {} else {
	mirrorBrandEnv();
	try {
		const resolution = resolveWorkspaceDirInfo();
		const { logInfo } = await import("./logger-jA09XE6f.js");
		logWorkspaceDirResolution(resolution, (msg) => logInfo(msg));
	} catch {}
	const { installGaxiosFetchCompat } = await import("./gaxios-fetch-compat-B8DTPK8t.js");
	await installGaxiosFetchCompat();
	const { bootstrapEnclawed } = await import("./bootstrap-CGV11FYN.js");
	const { resolveBundledPluginsDir } = await import("./bundled-dir-PfKWfdeq.js");
	await bootstrapEnclawed({ modulesRoot: resolveBundledPluginsDir() });
	process$1.title = "enclawed";
	ensureEnclawedExecMarkerOnProcess();
	installProcessWarningFilter();
	normalizeEnv();
	if (!isTruthyEnvValue(process$1.env.NODE_DISABLE_COMPILE_CACHE)) try {
		enableCompileCache();
	} catch {}
	if (shouldForceReadOnlyAuthStore(process$1.argv)) process$1.env.ENCLAWED_AUTH_STORE_READONLY = "1";
	if (process$1.argv.includes("--no-color")) {
		process$1.env.NO_COLOR = "1";
		process$1.env.FORCE_COLOR = "0";
	}
	function ensureCliRespawnReady() {
		const plan = buildCliRespawnPlan();
		if (!plan) return false;
		const child = spawn(process$1.execPath, plan.argv, {
			stdio: "inherit",
			env: plan.env
		});
		attachChildProcessBridge(child);
		child.once("exit", (code, signal) => {
			if (signal) {
				process$1.exitCode = 1;
				return;
			}
			process$1.exit(code ?? 1);
		});
		child.once("error", (error) => {
			console.error("[enclawed] Failed to respawn CLI:", error instanceof Error ? error.stack ?? error.message : error);
			process$1.exit(1);
		});
		return true;
	}
	function tryHandleRootVersionFastPath(argv) {
		if (resolveCliContainerTarget(argv)) return false;
		if (!isRootVersionInvocation(argv)) return false;
		Promise.all([import("./version-DvE3wY8s.js"), import("./git-commit-Bep0Kx3b.js")]).then(([{ VERSION }, { resolveCommitHash }]) => {
			const commit = resolveCommitHash({ moduleUrl: import.meta.url });
			console.log(commit ? `enclawed ${VERSION} (${commit})` : `enclawed ${VERSION}`);
			process$1.exit(0);
		}).catch((error) => {
			console.error("[enclawed] Failed to resolve version:", error instanceof Error ? error.stack ?? error.message : error);
			process$1.exitCode = 1;
		});
		return true;
	}
	process$1.argv = normalizeWindowsArgv(process$1.argv);
	if (!ensureCliRespawnReady()) {
		const parsedContainer = parseCliContainerArgs(process$1.argv);
		if (!parsedContainer.ok) {
			console.error(`[enclawed] ${parsedContainer.error}`);
			process$1.exit(2);
		}
		const parsed = parseCliProfileArgs(parsedContainer.argv);
		if (!parsed.ok) {
			console.error(`[enclawed] ${parsed.error}`);
			process$1.exit(2);
		}
		if (resolveCliContainerTarget(process$1.argv) && parsed.profile) {
			console.error("[enclawed] --container cannot be combined with --profile/--dev");
			process$1.exit(2);
		}
		if (parsed.profile) {
			applyCliProfileEnv({ profile: parsed.profile });
			process$1.argv = parsed.argv;
		}
		if (!tryHandleRootVersionFastPath(process$1.argv)) runMainOrRootHelp(process$1.argv);
	}
}
function tryHandleRootHelpFastPath(argv, deps = {}) {
	if (resolveCliContainerTarget(argv, deps.env)) return false;
	if (!isRootHelpInvocation(argv)) return false;
	const handleError = deps.onError ?? ((error) => {
		console.error("[enclawed] Failed to display help:", error instanceof Error ? error.stack ?? error.message : error);
		process$1.exitCode = 1;
	});
	if (deps.outputRootHelp) {
		Promise.resolve().then(() => deps.outputRootHelp?.()).catch(handleError);
		return true;
	}
	import("./root-help-metadata-BpZZF4i5.js").then(async ({ outputPrecomputedRootHelpText }) => {
		if (outputPrecomputedRootHelpText()) return;
		const { outputRootHelp } = await import("./root-help-bbDWOwFC.js");
		await outputRootHelp();
	}).catch(handleError);
	return true;
}
function runMainOrRootHelp(argv) {
	if (tryHandleRootHelpFastPath(argv)) return;
	import("./run-main-DJWcEsIB.js").then(({ runCli }) => runCli(argv)).catch((error) => {
		console.error("[enclawed] Failed to start CLI:", error instanceof Error ? error.stack ?? error.message : error);
		process$1.exitCode = 1;
	});
}
//#endregion
export { tryHandleRootHelpFastPath };
