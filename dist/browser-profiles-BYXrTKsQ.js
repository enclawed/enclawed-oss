import { n as resolvePreferredEnclawedTmpDir } from "./tmp-enclawed-dir-BTrLrKyp.js";
import { r as loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader-DS0Agzvt.js";
import path from "node:path";
//#region src/plugin-sdk/browser-profiles.ts
const DEFAULT_ENCLAWED_BROWSER_ENABLED = true;
const DEFAULT_BROWSER_EVALUATE_ENABLED = true;
const DEFAULT_ENCLAWED_BROWSER_COLOR = "#FF4500";
const DEFAULT_ENCLAWED_BROWSER_PROFILE_NAME = "enclawed";
const DEFAULT_BROWSER_DEFAULT_PROFILE_NAME = "enclawed";
const DEFAULT_AI_SNAPSHOT_MAX_CHARS = 8e4;
const DEFAULT_UPLOAD_DIR = path.join(resolvePreferredEnclawedTmpDir(), "uploads");
let cachedBrowserProfilesSurface;
function loadBrowserProfilesSurface() {
	cachedBrowserProfilesSurface ??= loadBundledPluginPublicSurfaceModuleSync({
		dirName: "browser",
		artifactBasename: "browser-profiles.js"
	});
	return cachedBrowserProfilesSurface;
}
function resolveBrowserConfig(cfg, rootConfig) {
	return loadBrowserProfilesSurface().resolveBrowserConfig(cfg, rootConfig);
}
function resolveProfile(resolved, profileName) {
	return loadBrowserProfilesSurface().resolveProfile(resolved, profileName);
}
//#endregion
export { DEFAULT_ENCLAWED_BROWSER_ENABLED as a, resolveBrowserConfig as c, DEFAULT_ENCLAWED_BROWSER_COLOR as i, resolveProfile as l, DEFAULT_BROWSER_DEFAULT_PROFILE_NAME as n, DEFAULT_ENCLAWED_BROWSER_PROFILE_NAME as o, DEFAULT_BROWSER_EVALUATE_ENABLED as r, DEFAULT_UPLOAD_DIR as s, DEFAULT_AI_SNAPSHOT_MAX_CHARS as t };
