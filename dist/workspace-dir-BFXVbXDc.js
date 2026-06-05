import { o as resolveRequiredHomeDir, r as resolveHomeRelativePath } from "./home-dir-yzjXRaUx.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
//#region src/infra/plain-object.ts
/**
* Strict plain-object guard (excludes arrays and host objects).
*/
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) && Object.prototype.toString.call(value) === "[object Object]";
}
//#endregion
//#region src/infra/workspace-dir.ts
const ENCLAWED_DIR_NAME = ".enclawed";
const OPENCLAW_DIR_NAME = ".openclaw";
const ENCLAWED_CONFIG_FILENAME = "enclawed.json";
const OPENCLAW_CONFIG_FILENAME = "openclaw.json";
function readEnv(env, key) {
	const value = env[key];
	if (typeof value !== "string") return;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : void 0;
}
function expand(value, env, homedir) {
	return resolveHomeRelativePath(value, {
		env,
		homedir
	});
}
function readWorkspaceFromConfig(configPath, readFileSync) {
	let raw;
	try {
		raw = readFileSync(configPath, "utf8");
	} catch {
		return;
	}
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return;
	}
	if (!isPlainObject(parsed)) return;
	const agent = parsed.agent;
	if (isPlainObject(agent)) {
		const candidate = agent.workspace;
		if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
	}
	const topLevel = parsed.workspace;
	if (typeof topLevel === "string" && topLevel.trim()) return topLevel.trim();
}
/**
* Resolve the user workspace / state directory. Returns the chosen absolute
* path together with the rule that fired, so callers can log the decision.
*
* This function does not create the directory; if rule `new_install_default`
* fires, the caller is responsible for creating `~/.enclawed/` on first use.
*/
function resolveWorkspaceDirInfo(options = {}) {
	const env = options.env ?? process.env;
	const homedir = options.homedir ?? os.homedir;
	const existsSync = options.existsSync ?? fs.existsSync;
	const readFileSync = options.readFileSync ?? ((target, encoding) => fs.readFileSync(target, encoding));
	const stateEnv = readEnv(env, "ENCLAWED_STATE_DIR") ?? readEnv(env, "OPENCLAW_STATE_DIR");
	if (stateEnv) return {
		path: expand(stateEnv, env, homedir),
		rule: "env_state_dir",
		usingLegacyDir: false
	};
	const configPathEnv = readEnv(env, "ENCLAWED_CONFIG_PATH") ?? readEnv(env, "OPENCLAW_CONFIG_PATH");
	if (configPathEnv) return {
		path: path.dirname(expand(configPathEnv, env, homedir)),
		rule: "env_config_path",
		usingLegacyDir: false
	};
	const home = resolveRequiredHomeDir(env, homedir);
	const enclawedDir = path.join(home, ENCLAWED_DIR_NAME);
	const openclawDir = path.join(home, OPENCLAW_DIR_NAME);
	const enclawedConfig = path.join(enclawedDir, ENCLAWED_CONFIG_FILENAME);
	const openclawConfig = path.join(openclawDir, OPENCLAW_CONFIG_FILENAME);
	const configForKey = safeExists(existsSync, enclawedConfig) ? enclawedConfig : safeExists(existsSync, openclawConfig) ? openclawConfig : void 0;
	if (configForKey) {
		const fromConfig = readWorkspaceFromConfig(configForKey, readFileSync);
		if (fromConfig) return {
			path: expand(fromConfig, env, homedir),
			rule: "config_key",
			usingLegacyDir: false
		};
	}
	if (safeExists(existsSync, enclawedDir)) return {
		path: enclawedDir,
		rule: "enclawed_exists",
		usingLegacyDir: false
	};
	if (safeExists(existsSync, openclawDir)) return {
		path: openclawDir,
		rule: "openclaw_fallback",
		usingLegacyDir: true
	};
	return {
		path: enclawedDir,
		rule: "new_install_default",
		usingLegacyDir: false
	};
}
function safeExists(existsSync, target) {
	try {
		return existsSync(target);
	} catch {
		return false;
	}
}
/**
* Resolve the path to the default config file (`enclawed.json` in the new
* tree, falling back to `openclaw.json` in the legacy `~/.openclaw` dir if
* present). The chosen filename matches the directory: `~/.enclawed/` ->
* `enclawed.json`, `~/.openclaw/` -> `openclaw.json`.
*
* Precedence:
*   1. `~/.enclawed/enclawed.json` if it exists on disk.
*   2. `~/.openclaw/openclaw.json` if it exists on disk and (1) does not.
*   3. `<resolved workspace dir>/enclawed.json` (new-install default; same
*      filename also applies if the resolver picked a custom directory via
*      env var, since that directory does not commit to a legacy filename).
*   4. If the resolved workspace is the legacy `~/.openclaw/` dir, prefer
*      `openclaw.json` inside it so legacy installs keep their filename.
*/
function resolveDefaultConfigPath(options = {}) {
	const env = options.env ?? process.env;
	const homedir = options.homedir ?? os.homedir;
	const existsSync = options.existsSync ?? fs.existsSync;
	const home = resolveRequiredHomeDir(env, homedir);
	const enclawedConfig = path.join(home, ENCLAWED_DIR_NAME, ENCLAWED_CONFIG_FILENAME);
	const openclawConfig = path.join(home, OPENCLAW_DIR_NAME, OPENCLAW_CONFIG_FILENAME);
	const configPathEnv = readEnv(env, "ENCLAWED_CONFIG_PATH") ?? readEnv(env, "OPENCLAW_CONFIG_PATH");
	if (configPathEnv) return {
		path: expand(configPathEnv, env, homedir),
		rule: "env_config_path"
	};
	if (safeExists(existsSync, enclawedConfig)) return {
		path: enclawedConfig,
		rule: "explicit_enclawed_config"
	};
	if (safeExists(existsSync, openclawConfig)) return {
		path: openclawConfig,
		rule: "explicit_openclaw_config"
	};
	const workspace = resolveWorkspaceDirInfo(options);
	const filename = workspace.usingLegacyDir ? OPENCLAW_CONFIG_FILENAME : ENCLAWED_CONFIG_FILENAME;
	return {
		path: path.join(workspace.path, filename),
		rule: workspace.rule
	};
}
/** Human-readable rule -> short reason string for log messages. */
function formatRuleReason(rule) {
	switch (rule) {
		case "env_state_dir": return "$ENCLAWED_STATE_DIR set";
		case "env_config_path": return "$ENCLAWED_CONFIG_PATH set";
		case "config_key": return "agent.workspace key in config";
		case "enclawed_exists": return "~/.enclawed/ exists";
		case "openclaw_fallback": return "~/.enclawed/ missing, ~/.openclaw/ present (legacy fallback)";
		case "new_install_default": return "new install — defaulting to ~/.enclawed/";
	}
}
let resolutionLogged = false;
/**
* Emit an info-level log line describing which workspace dir was chosen and
* which rule fired. Idempotent: a second call is a no-op so we don't spam
* downstream subsystems that import `utils.ts` lazily.
*
* The actual logger is injected to avoid a static circular import between
* `utils.ts` (which exposes the resolver) and `logger.ts` (which imports
* widely from the project).
*/
function logWorkspaceDirResolution(resolution, logInfo) {
	if (resolutionLogged) return;
	resolutionLogged = true;
	const legacy = resolution.usingLegacyDir ? " [legacy fallback]" : "";
	logInfo(`workspace-dir: using ${resolution.path}${legacy} (${formatRuleReason(resolution.rule)})`);
}
//#endregion
export { isPlainObject as i, resolveDefaultConfigPath as n, resolveWorkspaceDirInfo as r, logWorkspaceDirResolution as t };
