type CloseTrackedBrowserTabsParams = {
    sessionKeys: Array<string | undefined>;
    closeTab?: (tab: {
        targetId: string;
        baseUrl?: string;
        profile?: string;
    }) => Promise<void>;
    onWarn?: (message: string) => void;
};
export declare function closeTrackedBrowserTabsForSessions(params: CloseTrackedBrowserTabsParams): Promise<number>;
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
export declare function movePathToTrash(targetPath: string, options?: {
    allowedRoots?: readonly string[];
}): Promise<string>;
export {};
