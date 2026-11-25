// web_fetch's request path, published for the egress action batcher.
//
// The batcher (egress-core, a plugin-side package) pads a window of fetches
// with dummy GETs. A dummy is only cover if it is indistinguishable from a
// real fetch, so it must run web_fetch's own request path: same headers, same
// SSRF guard and egress path, and the same read behavior (the same byte limit
// and cancel, the same error-body limit, the same provider fallback). The
// open core cannot import the plugin package, so it publishes that path on a
// shared, host-populated slot, following the tool capability classifier
// pattern. Each real fetch also asks for its issue slot just before it
// leaves (`awaitWebFetchIssueSlot`), so a window can send real and dummy
// requests in one canonical lockstep sequence. The slot key and shape are a
// contract with `packages/egress-core/src/action.ts` and must not change.

import { resolvePinnedHostnameWithPolicy, type LookupFn } from "../../infra/net/ssrf.js";

const TOOL_REQUEST_CLIENT_KEY = Symbol.for("enclawed.tool-request-client");

type ToolRequestCheck = { ok: true } | { ok: false; reason: string };
type ToolRequestClient = {
  check(url: string): Promise<ToolRequestCheck>;
  send(url: string): Promise<void>;
};
type ToolIssueListener = (toolName: string, url: string, callId?: string) => void | Promise<void>;
type ToolRequestSlot = {
  clients: Map<string, ToolRequestClient>;
  listeners: Set<ToolIssueListener>;
};

function toolRequestSlot(): ToolRequestSlot {
  const globals = globalThis as unknown as Record<symbol, ToolRequestSlot | undefined>;
  let slot = globals[TOOL_REQUEST_CLIENT_KEY];
  if (!slot) {
    slot = { clients: new Map(), listeners: new Set() };
    globals[TOOL_REQUEST_CLIENT_KEY] = slot;
  }
  return slot;
}

/** The headers every web_fetch request carries (real fetches and padding alike). */
export function webFetchRequestHeaders(userAgent: string): Record<string, string> {
  return {
    Accept: "text/markdown, text/html;q=0.9, */*;q=0.1",
    "User-Agent": userAgent,
    "Accept-Language": "en-US,en;q=0.9",
  };
}

export type WebFetchRequestSettings = {
  userAgent: string;
  maxRedirects: number;
  timeoutSeconds: number;
  allowRfc2544BenchmarkRange: boolean;
  lookupFn?: LookupFn;
};

/**
 * A real web_fetch request for `url` is about to leave: wait for its slot.
 * Resolves at once unless the egress action batcher holds this request for a
 * lockstep window; rejects when the slot expired (a substitute was already
 * sent in its place), in which case the request must not be sent.
 */
export async function awaitWebFetchIssueSlot(url: string, callId?: string): Promise<void> {
  const waits: Array<Promise<void>> = [];
  for (const listener of toolRequestSlot().listeners) {
    try {
      const wait = listener("web_fetch", url, callId);
      if (wait && typeof wait.then === "function") {
        waits.push(wait);
      }
    } catch {
      // A failing listener must not break the fetch.
    }
  }
  await Promise.all(waits);
}

/** Report that web_fetch is issuing a real request for `url` (no slot wait). */
export function notifyWebFetchIssued(url: string, callId?: string): void {
  awaitWebFetchIssueSlot(url, callId).catch(() => {});
}

/**
 * Build web_fetch's request client. `send` must be web_fetch's own complete
 * request path for a URL (the tool passes it in), so a dummy reads, cancels
 * and falls back exactly as a real fetch does.
 */
export function createWebFetchRequestClient(
  settings: WebFetchRequestSettings,
  send: (url: string) => Promise<void>,
): ToolRequestClient {
  const policy = settings.allowRfc2544BenchmarkRange
    ? { allowRfc2544BenchmarkRange: true }
    : undefined;
  return {
    async check(url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { ok: false, reason: "invalid URL" };
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { ok: false, reason: "not http or https" };
      }
      try {
        await resolvePinnedHostnameWithPolicy(parsed.hostname, {
          lookupFn: settings.lookupFn,
          policy,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : String(err) };
      }
    },
    send,
  };
}

/** Publish web_fetch's request client (each web_fetch tool build does this). */
export function publishWebFetchRequestClient(
  settings: WebFetchRequestSettings,
  send: (url: string) => Promise<void>,
): void {
  toolRequestSlot().clients.set("web_fetch", createWebFetchRequestClient(settings, send));
}
