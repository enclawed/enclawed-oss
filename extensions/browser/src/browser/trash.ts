import os from "node:os";
import { movePathToTrash as movePathToTrashWithAllowedRoots } from "@enclawed/plugin-sdk/browser-config";
import { resolvePreferredEnclawedTmpDir } from "@enclawed/plugin-sdk/temp-path";

export async function movePathToTrash(targetPath: string): Promise<string> {
  return await movePathToTrashWithAllowedRoots(targetPath, {
    allowedRoots: [os.homedir(), resolvePreferredEnclawedTmpDir()],
  });
}
