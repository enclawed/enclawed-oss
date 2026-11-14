import { beforeEach, describe, expect, it, vi } from "vitest";

const closeTrackedBrowserTabsForSessionsImpl = vi.hoisted(() => vi.fn());
const loadBundledPluginPublicSurfaceModuleSync = vi.hoisted(() => vi.fn());
const runExec = vi.hoisted(() => vi.fn());

vi.mock("./facade-loader.js", () => ({
  loadBundledPluginPublicSurfaceModuleSync,
}));

vi.mock("../process/exec.js", () => ({
  runExec,
}));

describe("browser maintenance", () => {
  beforeEach(() => {
    closeTrackedBrowserTabsForSessionsImpl.mockReset();
    loadBundledPluginPublicSurfaceModuleSync.mockReset();
    runExec.mockReset();
    loadBundledPluginPublicSurfaceModuleSync.mockReturnValue({
      closeTrackedBrowserTabsForSessions: closeTrackedBrowserTabsForSessionsImpl,
    });
  });

  it("skips browser cleanup when no session keys are provided", async () => {
    const { closeTrackedBrowserTabsForSessions } = await import("./browser-maintenance.js");

    await expect(closeTrackedBrowserTabsForSessions({ sessionKeys: [] })).resolves.toBe(0);
    expect(loadBundledPluginPublicSurfaceModuleSync).not.toHaveBeenCalled();
  });

  it("delegates cleanup through the browser maintenance surface", async () => {
    closeTrackedBrowserTabsForSessionsImpl.mockResolvedValue(2);

    const { closeTrackedBrowserTabsForSessions } = await import("./browser-maintenance.js");

    await expect(
      closeTrackedBrowserTabsForSessions({ sessionKeys: ["agent:main:test"] }),
    ).resolves.toBe(2);
    expect(loadBundledPluginPublicSurfaceModuleSync).toHaveBeenCalledWith({
      dirName: "browser",
      artifactBasename: "browser-maintenance.js",
    });
    expect(closeTrackedBrowserTabsForSessionsImpl).toHaveBeenCalledWith({
      sessionKeys: ["agent:main:test"],
    });
  });

  // movePathToTrash used to shell out to a `trash` binary resolved through
  // PATH, which let anything earlier on PATH receive the path being deleted.
  // It now performs the move itself, so these pin the current contract: the
  // file really moves, the caller learns where it went, and no subprocess runs.
  it("moves the path into the trash and returns the new location", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");

    // Deliberately not redirecting HOME: vitest runs this in a worker thread,
    // where `process.env` is a copy that libuv never sees, so `os.homedir()`
    // would ignore it and the assertion would check the wrong path. The test
    // uses the real trash root and removes what it put there.
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-trash-work-"));
    const target = path.join(work, "demo");
    fs.writeFileSync(target, "payload");

    let dest: string | undefined;
    try {
      const { movePathToTrash } = await import("./browser-maintenance.js");
      dest = await movePathToTrash(target);

      expect(fs.existsSync(target)).toBe(false);
      expect(fs.readFileSync(dest, "utf8")).toBe("payload");
      expect(dest.startsWith(path.join(os.homedir(), ".Trash"))).toBe(true);
      // The whole point of the rewrite: nothing is resolved through PATH.
      expect(runExec).not.toHaveBeenCalled();
    } finally {
      if (dest) {
        fs.rmSync(path.dirname(dest), { recursive: true, force: true });
      }
      fs.rmSync(work, { recursive: true, force: true });
    }
  });

  it("refuses to trash a filesystem root", async () => {
    const path = await import("node:path");
    const { movePathToTrash } = await import("./browser-maintenance.js");

    await expect(movePathToTrash(path.parse(process.cwd()).root)).rejects.toThrow(
      /Refusing to trash root path/,
    );
  });
});
