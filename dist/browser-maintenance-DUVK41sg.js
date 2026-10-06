import { r as loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader-C3J-_dvo.js";
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
/**
* Move a path into the user's trash.
*
* This is deliberately hand-rolled rather than delegating to a `trash` binary.
* The previous implementation shelled out to `runExec("trash", ...)` -- a
* PATH-resolved command, so anything that could prepend to PATH chose what ran
* with the user's privileges against a path of its choosing -- and on failure
* fell back to a destination it computed itself and then checked with
* existsSync, which is a check-then-use race on a directory other users may be
* able to write.
*
* The properties below are asserted by extensions/browser/src/browser/trash.test.ts,
* which had been failing against that implementation. In order:
*
*   - never the filesystem root, and never outside the caller's allowed roots;
*   - the trash directory is created 0700 and resolved through realpath, then
*     rejected if it is a symlink or not a directory, so the destination cannot
*     be redirected by swapping ~/.Trash;
*   - the destination is an mkdtemp container, which the OS creates atomically
*     and exclusively -- there is no window between choosing the name and
*     owning it;
*   - a collision retries into a NEW container rather than reusing the name,
*     and keeps the original timestamp so the retry is still attributable to
*     one operation;
*   - rename first; copy+remove only for EXDEV, with errorOnExist so a
*     concurrently created destination is never silently overwritten.
*/
async function movePathToTrash(targetPath, options) {
	const [{ default: fs }, { default: os }, { default: path }] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path")
	]);
	const resolvedTarget = path.resolve(targetPath);
	if (resolvedTarget === path.parse(resolvedTarget).root) throw new Error(`movePathToTrash: Refusing to trash root path ${targetPath}`);
	const allowedRoots = options?.allowedRoots;
	if (allowedRoots && allowedRoots.length > 0) {
		if (!allowedRoots.some((root) => {
			const resolvedRoot = path.resolve(root);
			const relative = path.relative(resolvedRoot, resolvedTarget);
			return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
		})) throw new Error(`movePathToTrash: Refusing to trash path outside allowed roots: ${targetPath}`);
	}
	const trashDir = path.join(os.homedir(), ".Trash");
	fs.mkdirSync(trashDir, {
		recursive: true,
		mode: 448
	});
	const resolvedTrashDir = fs.realpathSync.native(trashDir);
	const trashStat = fs.lstatSync(trashDir);
	if (!trashStat.isDirectory() || trashStat.isSymbolicLink()) throw new Error(`movePathToTrash: Refusing to use non-directory/symlink trash directory ${trashDir}`);
	const base = path.basename(resolvedTarget);
	const stamp = Date.now();
	const reserve = () => path.join(fs.mkdtempSync(path.join(resolvedTrashDir, `${base}-${stamp}-`)), base);
	const isCollision = (error, ...codes) => typeof error?.code === "string" && codes.includes(error.code);
	for (let attempt = 0; attempt < 2; attempt++) {
		const dest = reserve();
		try {
			fs.renameSync(resolvedTarget, dest);
			return dest;
		} catch (error) {
			if (isCollision(error, "EEXIST")) continue;
			if (!isCollision(error, "EXDEV")) throw error;
		}
		try {
			fs.cpSync(resolvedTarget, dest, {
				recursive: true,
				force: false,
				errorOnExist: true
			});
		} catch (error) {
			if (isCollision(error, "ERR_FS_CP_EEXIST", "EEXIST")) continue;
			throw error;
		}
		fs.rmSync(resolvedTarget, {
			recursive: true,
			force: false
		});
		return dest;
	}
	throw new Error(`movePathToTrash: could not reserve a trash destination for ${targetPath}`);
}
//#endregion
export { movePathToTrash as n, closeTrackedBrowserTabsForSessions as t };
