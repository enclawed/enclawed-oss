// User-space network-egress allowlist. NOT a substitute for kernel-level
// egress controls; see enclawed/MODIFICATIONS.md §7.5.

export class EgressDeniedError extends Error {
  override name = "EgressDeniedError";
  constructor(public readonly host: string | null, public readonly reason: string) {
    super(`egress denied: ${host ?? "<unknown host>"} (${reason})`);
  }
}

function hostOf(input: unknown): string | null {
  if (typeof input === "string") {
    try {
      return new URL(input).hostname;
    } catch {
      return null;
    }
  }
  if (input && typeof input === "object") {
    const rec = input as { url?: unknown; hostname?: unknown };
    if (typeof rec.url === "string") {
      try {
        return new URL(rec.url).hostname;
      } catch {
        return null;
      }
    }
    if (typeof rec.hostname === "string") return rec.hostname;
  }
  return null;
}

export type GuardedFetch = typeof fetch & { __enclawedGuard: true };

export function createEgressGuard(opts: {
  allowedHosts: Iterable<string>;
  fetchImpl: typeof fetch;
  onDeny?: (info: { host: string | null; input: unknown; init: unknown }) => void;
}): GuardedFetch {
  const allow = new Set([...opts.allowedHosts].map(String));
  const guarded = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const host = hostOf(input);
    if (!host || !allow.has(host)) {
      const err = new EgressDeniedError(host, "host not on allowlist");
      if (opts.onDeny) {
        try {
          opts.onDeny({ host, input, init });
        } catch {
          /* swallow */
        }
      }
      throw err;
    }
    return opts.fetchImpl(input, init);
  }) as GuardedFetch;
  guarded.__enclawedGuard = true;
  return guarded;
}

export function installEgressGuard(opts: {
  allowedHosts: Iterable<string>;
  onDeny?: (info: { host: string | null; input: unknown; init: unknown }) => void;
  freeze?: boolean;
}): () => void {
  const previous = globalThis.fetch;
  const guard = createEgressGuard({ ...opts, fetchImpl: previous });
  if (opts.freeze) {
    // After this call, `globalThis.fetch = ...` throws in strict mode
    // (ESM default) and silently fails in sloppy mode. The returned
    // restorer is a no-op when the property is frozen — the host process
    // is permanently bound to the guard.
    Object.defineProperty(globalThis, "fetch", {
      value: guard, writable: false, configurable: false, enumerable: true,
    });
    return () => { /* no-op */ };
  }
  globalThis.fetch = guard;
  return () => {
    globalThis.fetch = previous;
  };
}
