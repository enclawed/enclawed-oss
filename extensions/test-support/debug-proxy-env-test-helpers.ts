import { finalizeDebugProxyCapture } from "@enclawed/plugin-sdk/proxy-capture";
import { afterEach, beforeEach, vi } from "vitest";

const DEBUG_PROXY_ENV_KEYS = [
  "ENCLAWED_DEBUG_PROXY_ENABLED",
  "ENCLAWED_DEBUG_PROXY_DB_PATH",
  "ENCLAWED_DEBUG_PROXY_BLOB_DIR",
  "ENCLAWED_DEBUG_PROXY_SESSION_ID",
] as const;

type DebugProxyEnvKey = (typeof DEBUG_PROXY_ENV_KEYS)[number];
type DebugProxyEnvSnapshot = Partial<Record<DebugProxyEnvKey, string | undefined>>;

function snapshotDebugProxyEnv(): DebugProxyEnvSnapshot {
  return Object.fromEntries(
    DEBUG_PROXY_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as DebugProxyEnvSnapshot;
}

function restoreDebugProxyEnv(snapshot: DebugProxyEnvSnapshot): void {
  for (const key of DEBUG_PROXY_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export function installDebugProxyTestResetHooks() {
  let originalFetch = globalThis.fetch;
  let priorProxyEnv: DebugProxyEnvSnapshot = {};

  beforeEach(() => {
    // Re-taken per test, after tearing down any capture inherited from another
    // file. These files run without module isolation, so a global fetch patch
    // installed elsewhere would otherwise be recorded here as "the original"
    // and restored on top of every case -- which captures each request twice.
    finalizeDebugProxyCapture();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    restoreDebugProxyEnv(priorProxyEnv);
    priorProxyEnv = {};
  });

  return {
    captureProxyEnv() {
      priorProxyEnv = snapshotDebugProxyEnv();
    },
    originalFetch,
  };
}
