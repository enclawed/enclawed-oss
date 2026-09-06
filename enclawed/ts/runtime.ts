// Process-wide enclawed runtime. Stored on a globalThis symbol so the
// callers in mcp-attested and other audit-aware modules can consult it
// without creating an import cycle. The runtime is set after bootstrap
// (in the enclaved flavor); in the open OSS flavor it remains null and
// callers degrade gracefully (see mcp-attested/src/client.ts).
//
// Mirrors the upstream enclaved-flavor runtime shape so the same import
// path works whether or not enclawed.bootstrap() has been invoked.

const RUNTIME_KEY = Symbol.for("enclawed.runtime");

export type EnclawedFlavor = "open" | "enclaved";

export type AuditEvent = {
  type: string;
  actor: string;
  level?: string;
  payload?: unknown;
};

export type AuditLogger = Readonly<{
  append(event: AuditEvent): Promise<void>;
}>;

export type EnclawedRuntime = Readonly<{
  flavor: EnclawedFlavor;
  audit: AuditLogger;
  // Optional fields are present in the enclaved-flavor runtime but not
  // required by oss callers. Kept loose-typed so a future runtime that
  // adds more surface doesn't have to re-mint this file.
  fipsRequired?: boolean;
  moduleDecisions?: ReadonlyMap<string, unknown> | null;
  restoreFetch?: () => void;
  policy?: unknown;
}>;

type GlobalWithRuntime = typeof globalThis & {
  [RUNTIME_KEY]?: EnclawedRuntime;
};

export function getRuntime(): EnclawedRuntime | null {
  return (globalThis as GlobalWithRuntime)[RUNTIME_KEY] ?? null;
}

export function setRuntime(runtime: EnclawedRuntime): void {
  (globalThis as GlobalWithRuntime)[RUNTIME_KEY] = runtime;
}

export function clearRuntime(): void {
  delete (globalThis as GlobalWithRuntime)[RUNTIME_KEY];
}
