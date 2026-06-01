import { loadBundledPluginPublicSurfaceModuleSync } from "./facade-loader.js";

type CloseTrackedBrowserTabsParams = {
  sessionKeys: Array<string | undefined>;
  closeTab?: (tab: { targetId: string; baseUrl?: string; profile?: string }) => Promise<void>;
  onWarn?: (message: string) => void;
};

type BrowserMaintenanceSurface = {
  closeTrackedBrowserTabsForSessions: (params: CloseTrackedBrowserTabsParams) => Promise<number>;
};

let cachedBrowserMaintenanceSurface: BrowserMaintenanceSurface | undefined;

function hasRequestedSessionKeys(sessionKeys: Array<string | undefined>): boolean {
  return sessionKeys.some((key) => Boolean(key?.trim()));
}

function loadBrowserMaintenanceSurface(): BrowserMaintenanceSurface {
  cachedBrowserMaintenanceSurface ??=
    loadBundledPluginPublicSurfaceModuleSync<BrowserMaintenanceSurface>({
      dirName: "browser",
      artifactBasename: "browser-maintenance.js",
    });
  return cachedBrowserMaintenanceSurface;
}

export async function closeTrackedBrowserTabsForSessions(
  params: CloseTrackedBrowserTabsParams,
): Promise<number> {
  if (!hasRequestedSessionKeys(params.sessionKeys)) {
    return 0;
  }

  let surface: BrowserMaintenanceSurface;
  try {
    surface = loadBrowserMaintenanceSurface();
  } catch (error) {
    params.onWarn?.(`browser cleanup unavailable: ${String(error)}`);
    return 0;
  }
  return await surface.closeTrackedBrowserTabsForSessions(params);
}

export async function movePathToTrash(
  targetPath: string,
  options?: { allowedRoots?: readonly string[] },
): Promise<string> {
  const [
    { default: fs },
    { default: os },
    { default: path },
    { generateSecureToken },
    { runExec },
  ] = await Promise.all([
    import("node:fs"),
    import("node:os"),
    import("node:path"),
    import("../infra/secure-random.js"),
    import("../process/exec.js"),
  ]);
  const allowedRoots = options?.allowedRoots;
  if (allowedRoots && allowedRoots.length > 0) {
    const resolvedTarget = path.resolve(targetPath);
    const withinAllowedRoot = allowedRoots.some((root) => {
      const resolvedRoot = path.resolve(root);
      const relative = path.relative(resolvedRoot, resolvedTarget);
      return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
    });
    if (!withinAllowedRoot) {
      throw new Error(`movePathToTrash: target ${targetPath} is outside allowed roots`);
    }
  }
  try {
    await runExec("trash", [targetPath], { timeoutMs: 10_000 });
    return targetPath;
  } catch {
    const trashDir = path.join(os.homedir(), ".Trash");
    fs.mkdirSync(trashDir, { recursive: true });
    const base = path.basename(targetPath);
    let dest = path.join(trashDir, `${base}-${Date.now()}`);
    if (fs.existsSync(dest)) {
      dest = path.join(trashDir, `${base}-${Date.now()}-${generateSecureToken(6)}`);
    }
    fs.renameSync(targetPath, dest);
    return dest;
  }
}
