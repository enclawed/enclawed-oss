import { n as resolvePreferredEnclawedTmpDir } from "./tmp-enclawed-dir-BTrLrKyp.js";
import "./temp-path-BdXZcjT-.js";
import { n as movePathToTrash$1 } from "./browser-maintenance-CphHykPo.js";
import "./browser-config-60xYyGeB.js";
import os from "node:os";
//#region extensions/browser/src/browser/trash.ts
async function movePathToTrash(targetPath) {
	return await movePathToTrash$1(targetPath, { allowedRoots: [os.homedir(), resolvePreferredEnclawedTmpDir()] });
}
//#endregion
export { movePathToTrash as t };
