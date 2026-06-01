import { r as loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader-DS0Agzvt.js";
//#region src/plugin-sdk/browser-maintenance.ts
let cachedBrowserMaintenanceSurface;
function hasRequestedSessionKeys(sessionKeys) {
	return sessionKeys.some((key) => Boolean(key?.trim()));
}
function loadBrowserMaintenanceSurface() {
	cachedBrowserMaintenanceSurface ??= loadBundledPluginPublicSurfaceModuleSync({
		dirName: "browser",
		artifactBasename: "browser-maintenance.js"
	});
	return cachedBrowserMaintenanceSurface;
}
async function closeTrackedBrowserTabsForSessions(params) {
	if (!hasRequestedSessionKeys(params.sessionKeys)) return 0;
	let surface;
	try {
		surface = loadBrowserMaintenanceSurface();
	} catch (error) {
		params.onWarn?.(`browser cleanup unavailable: ${String(error)}`);
		return 0;
	}
	return await surface.closeTrackedBrowserTabsForSessions(params);
}
async function movePathToTrash(targetPath, options) {
	const [{ default: fs }, { default: os }, { default: path }, { generateSecureToken }, { runExec }] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
		import("./secure-random-BVcWnSTL.js"),
		import("./exec-BwOAWN7z.js")
	]);
	const allowedRoots = options?.allowedRoots;
	if (allowedRoots && allowedRoots.length > 0) {
		const resolvedTarget = path.resolve(targetPath);
		if (!allowedRoots.some((root) => {
			const resolvedRoot = path.resolve(root);
			const relative = path.relative(resolvedRoot, resolvedTarget);
			return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
		})) throw new Error(`movePathToTrash: target ${targetPath} is outside allowed roots`);
	}
	try {
		await runExec("trash", [targetPath], { timeoutMs: 1e4 });
		return targetPath;
	} catch {
		const trashDir = path.join(os.homedir(), ".Trash");
		fs.mkdirSync(trashDir, { recursive: true });
		const base = path.basename(targetPath);
		let dest = path.join(trashDir, `${base}-${Date.now()}`);
		if (fs.existsSync(dest)) dest = path.join(trashDir, `${base}-${Date.now()}-${generateSecureToken(6)}`);
		fs.renameSync(targetPath, dest);
		return dest;
	}
}
//#endregion
export { movePathToTrash as n, closeTrackedBrowserTabsForSessions as t };
