import { n as resolvePreferredEnclawedTmpDir } from "./tmp-enclawed-dir-BTrLrKyp.js";
import "./temp-path-CGkochzA.js";
import { n as movePathToTrash$1 } from "./browser-maintenance-CqiZnXA4.js";
import "./browser-config-mGm9tCMt.js";
import os from "node:os";
//#region extensions/browser/src/browser/trash.ts
async function movePathToTrash(targetPath) {
	return await movePathToTrash$1(targetPath, { allowedRoots: [os.homedir(), resolvePreferredEnclawedTmpDir()] });
}
//#endregion
export { movePathToTrash as t };
