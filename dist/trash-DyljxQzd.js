import { n as resolvePreferredEnclawedTmpDir } from "./tmp-enclawed-dir-Dv5ezX8B.js";
import "./temp-path-BtY4V9GW.js";
import { n as movePathToTrash$1 } from "./browser-maintenance-C5m--LyT.js";
import "./browser-config-SbxkLjZ4.js";
import os from "node:os";
//#region extensions/browser/src/browser/trash.ts
async function movePathToTrash(targetPath) {
	return await movePathToTrash$1(targetPath, { allowedRoots: [os.homedir(), resolvePreferredEnclawedTmpDir()] });
}
//#endregion
export { movePathToTrash as t };
