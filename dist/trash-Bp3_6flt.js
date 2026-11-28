import { n as resolvePreferredEnclawedTmpDir } from "./tmp-enclawed-dir-Dv5ezX8B.js";
import "./temp-path-DODZR6UR.js";
import { n as movePathToTrash$1 } from "./browser-maintenance-zJ1urDBv.js";
import "./browser-config-B8sjRcJB.js";
import os from "node:os";
//#region extensions/browser/src/browser/trash.ts
async function movePathToTrash(targetPath) {
	return await movePathToTrash$1(targetPath, { allowedRoots: [os.homedir(), resolvePreferredEnclawedTmpDir()] });
}
//#endregion
export { movePathToTrash as t };
