export {
  addGatewayClientOptions,
  callGatewayFromCli,
  ensureGatewayStartupAuth,
  ErrorCodes,
  errorShape,
  isLoopbackHost,
  isNodeCommandAllowed,
  respondUnavailableOnNodeInvokeError,
  resolveGatewayAuth,
  resolveNodeCommandAllowlist,
  safeParseJson,
} from "@enclawed/plugin-sdk/gateway-runtime";
export type {
  GatewayRequestHandlers,
  GatewayRpcOpts,
  NodeSession,
} from "@enclawed/plugin-sdk/gateway-runtime";
export { runCommandWithRuntime } from "@enclawed/plugin-sdk/cli-runtime";
export type { EnclawedPluginService } from "@enclawed/plugin-sdk/plugin-entry";
export {
  startLazyPluginServiceModule,
  type LazyPluginServiceHandle,
} from "@enclawed/plugin-sdk/plugin-runtime";
export { defaultRuntime } from "@enclawed/plugin-sdk/runtime-env";

export async function withTimeout<T>(
  work: (signal: AbortSignal | undefined) => Promise<T>,
  timeoutMs?: number,
  label?: string,
): Promise<T> {
  const resolved =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs)
      ? Math.max(1, Math.floor(timeoutMs))
      : undefined;
  if (!resolved) {
    return await work(undefined);
  }

  const abortCtrl = new AbortController();
  const timeoutError = new Error(`${label ?? "request"} timed out`);
  const timer = setTimeout(() => abortCtrl.abort(timeoutError), resolved);
  timer.unref?.();

  let abortListener: (() => void) | undefined;
  const abortPromise: Promise<never> = abortCtrl.signal.aborted
    ? Promise.reject(abortCtrl.signal.reason ?? timeoutError)
    : new Promise((_, reject) => {
        abortListener = () => reject(abortCtrl.signal.reason ?? timeoutError);
        abortCtrl.signal.addEventListener("abort", abortListener, { once: true });
      });

  try {
    return await Promise.race([work(abortCtrl.signal), abortPromise]);
  } finally {
    clearTimeout(timer);
    if (abortListener) {
      abortCtrl.signal.removeEventListener("abort", abortListener);
    }
  }
}
