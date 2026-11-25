import { Type } from "@sinclair/typebox";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { SsrFBlockedError, type LookupFn } from "../../infra/net/ssrf.js";
import { logDebug } from "../../logger.js";
import type { RuntimeWebFetchMetadata } from "../../secrets/runtime-web-tools.types.js";
import { wrapExternalContent, wrapWebContent } from "../../security/external-content.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../../shared/string-coerce.js";
import { isRecord } from "../../utils.js";
import { resolveWebFetchDefinition } from "../../web-fetch/runtime.js";
import { resolveWebProviderConfig } from "../../web/provider-runtime-shared.js";
import { stringEnum } from "../schema/typebox.js";
import { TOOL_WIRE_REPLAY, wireReplayFor, type ToolReplayCall } from "../tool-replay.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";
import {
  awaitWebFetchIssueSlot,
  publishWebFetchRequestClient,
  webFetchRequestHeaders,
} from "./web-fetch-request-client.js";
import {
  extractBasicHtmlContent,
  extractReadableContent,
  htmlToMarkdown,
  markdownToText,
  truncateText,
  type ExtractMode,
} from "./web-fetch-utils.js";
import { fetchWithWebToolsNetworkGuard } from "./web-guarded-fetch.js";
import {
  CacheEntry,
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  normalizeCacheKey,
  readCache,
  readResponseText,
  resolveCacheTtlMs,
  resolveTimeoutSeconds,
  writeCache,
} from "./web-shared.js";

export { extractReadableContent } from "./web-fetch-utils.js";

const EXTRACT_MODES = ["markdown", "text"] as const;

const DEFAULT_FETCH_MAX_CHARS = 20_000;
const DEFAULT_FETCH_MAX_RESPONSE_BYTES = 750_000;
const FETCH_MAX_RESPONSE_BYTES_MIN = 32_000;
const FETCH_MAX_RESPONSE_BYTES_MAX = 10_000_000;
const DEFAULT_FETCH_MAX_REDIRECTS = 3;
const DEFAULT_ERROR_MAX_CHARS = 4_000;
const DEFAULT_ERROR_MAX_BYTES = 64_000;
const DEFAULT_FETCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const FETCH_CACHE = new Map<string, CacheEntry<Record<string, unknown>>>();

const WebFetchSchema = Type.Object({
  url: Type.String({ description: "HTTP or HTTPS URL to fetch." }),
  extractMode: Type.Optional(
    stringEnum(EXTRACT_MODES, {
      description: 'Extraction mode ("markdown" or "text").',
      default: "markdown",
    }),
  ),
  maxChars: Type.Optional(
    Type.Number({
      description: "Maximum characters to return (truncates when exceeded).",
      minimum: 100,
    }),
  ),
});

type WebFetchConfig = NonNullable<EnclawedConfig["tools"]>["web"] extends infer Web
  ? Web extends { fetch?: infer Fetch }
    ? Fetch
    : undefined
  : undefined;

function resolveFetchConfig(cfg?: EnclawedConfig): WebFetchConfig {
  return resolveWebProviderConfig<"fetch", NonNullable<WebFetchConfig>>(cfg, "fetch");
}

function resolveFetchEnabled(params: { fetch?: WebFetchConfig; sandboxed?: boolean }): boolean {
  if (typeof params.fetch?.enabled === "boolean") {
    return params.fetch.enabled;
  }
  return true;
}

function resolveFetchReadabilityEnabled(fetch?: WebFetchConfig): boolean {
  if (typeof fetch?.readability === "boolean") {
    return fetch.readability;
  }
  return true;
}

function resolveFetchMaxCharsCap(fetch?: WebFetchConfig): number {
  const raw =
    fetch && "maxCharsCap" in fetch && typeof fetch.maxCharsCap === "number"
      ? fetch.maxCharsCap
      : undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_FETCH_MAX_CHARS;
  }
  return Math.max(100, Math.floor(raw));
}

function resolveFetchMaxResponseBytes(fetch?: WebFetchConfig): number {
  const raw =
    fetch && "maxResponseBytes" in fetch && typeof fetch.maxResponseBytes === "number"
      ? fetch.maxResponseBytes
      : undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_FETCH_MAX_RESPONSE_BYTES;
  }
  const value = Math.floor(raw);
  return Math.min(FETCH_MAX_RESPONSE_BYTES_MAX, Math.max(FETCH_MAX_RESPONSE_BYTES_MIN, value));
}

function resolveMaxChars(value: unknown, fallback: number, cap: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.max(100, Math.floor(parsed));
  return Math.min(clamped, cap);
}

function resolveMaxRedirects(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.floor(parsed));
}

function looksLikeHtml(value: string): boolean {
  const trimmed = value.trimStart();
  if (!trimmed) {
    return false;
  }
  const head = normalizeLowercaseStringOrEmpty(trimmed.slice(0, 256));
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

function formatWebFetchErrorDetail(params: {
  detail: string;
  contentType?: string | null;
  maxChars: number;
}): string {
  const { detail, contentType, maxChars } = params;
  if (!detail) {
    return "";
  }
  let text = detail;
  const contentTypeLower = normalizeOptionalLowercaseString(contentType);
  if (contentTypeLower?.includes("text/html") || looksLikeHtml(detail)) {
    const rendered = htmlToMarkdown(detail);
    const withTitle = rendered.title ? `${rendered.title}\n${rendered.text}` : rendered.text;
    text = markdownToText(withTitle);
  }
  const truncated = truncateText(text.trim(), maxChars);
  return truncated.text;
}

function redactUrlForDebugLog(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname && parsed.pathname !== "/" ? `${parsed.origin}/...` : parsed.origin;
  } catch {
    return "[invalid-url]";
  }
}

const WEB_FETCH_WRAPPER_WITH_WARNING_OVERHEAD = wrapWebContent("", "web_fetch").length;
const WEB_FETCH_WRAPPER_NO_WARNING_OVERHEAD = wrapExternalContent("", {
  source: "web_fetch",
  includeWarning: false,
}).length;

function wrapWebFetchContent(
  value: string,
  maxChars: number,
): {
  text: string;
  truncated: boolean;
  rawLength: number;
  wrappedLength: number;
} {
  if (maxChars <= 0) {
    return { text: "", truncated: true, rawLength: 0, wrappedLength: 0 };
  }
  const includeWarning = maxChars >= WEB_FETCH_WRAPPER_WITH_WARNING_OVERHEAD;
  const wrapperOverhead = includeWarning
    ? WEB_FETCH_WRAPPER_WITH_WARNING_OVERHEAD
    : WEB_FETCH_WRAPPER_NO_WARNING_OVERHEAD;
  if (wrapperOverhead > maxChars) {
    const minimal = includeWarning
      ? wrapWebContent("", "web_fetch")
      : wrapExternalContent("", { source: "web_fetch", includeWarning: false });
    const truncatedWrapper = truncateText(minimal, maxChars);
    return {
      text: truncatedWrapper.text,
      truncated: true,
      rawLength: 0,
      wrappedLength: truncatedWrapper.text.length,
    };
  }
  const maxInner = Math.max(0, maxChars - wrapperOverhead);
  let truncated = truncateText(value, maxInner);
  let wrappedText = includeWarning
    ? wrapWebContent(truncated.text, "web_fetch")
    : wrapExternalContent(truncated.text, { source: "web_fetch", includeWarning: false });

  if (wrappedText.length > maxChars) {
    const excess = wrappedText.length - maxChars;
    const adjustedMaxInner = Math.max(0, maxInner - excess);
    truncated = truncateText(value, adjustedMaxInner);
    wrappedText = includeWarning
      ? wrapWebContent(truncated.text, "web_fetch")
      : wrapExternalContent(truncated.text, { source: "web_fetch", includeWarning: false });
  }

  return {
    text: wrappedText,
    truncated: truncated.truncated,
    rawLength: truncated.text.length,
    wrappedLength: wrappedText.length,
  };
}

function wrapWebFetchField(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  return wrapExternalContent(value, { source: "web_fetch", includeWarning: false });
}

function normalizeContentType(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const [raw] = value.split(";");
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

/**
 * One web_fetch network exchange, recorded so the egress action batcher can
 * answer an identical repeat without sending it again: the bytes the read
 * consumed (never more), the response metadata the tool reads, and every
 * provider-fallback answer. Replaying it re-runs the tool's own processing,
 * so a repeat with other result-shaping parameters (extractMode, maxChars)
 * still gets exactly the result a fresh fetch of the same bytes would give.
 */
type WebFetchWire = {
  v: 1;
  exchange?:
    | {
        kind: "response";
        status: number;
        statusText: string;
        headers: Array<[string, string]>;
        /** Set only when the request was redirected; else the caller's own URL. */
        redirectedTo?: string;
        chunks: Uint8Array[];
      }
    | { kind: "error"; error: unknown };
  provider: Array<{ key: string; ok: boolean; value: unknown }>;
};

/** How a run treats the network: a real call, a recorded one, a replay, or padding. */
type WebFetchExchangeMode =
  | { mode: "live" }
  | { mode: "record"; call: ToolReplayCall; wire: WebFetchWire; refresh: boolean }
  | { mode: "replay"; wire: WebFetchWire }
  | { mode: "dummy"; issued: { value: boolean } };

// Only the response headers runWebFetch reads.
const RECORDED_HEADERS = ["content-type", "x-markdown-tokens"];
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

function isWebFetchWire(value: unknown): value is WebFetchWire {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { v?: unknown }).v === 1 &&
    Array.isArray((value as { provider?: unknown }).provider)
  );
}

/** Wrap a live response so the bytes the reader actually pulls are recorded. */
function recordingResponse(res: Response, chunks: Uint8Array[]): Response {
  const body = (res as { body?: unknown }).body as ReadableStream<Uint8Array> | null | undefined;
  if (!body || typeof body.getReader !== "function" || NULL_BODY_STATUSES.has(res.status)) {
    return res;
  }
  const reader = body.getReader();
  // highWaterMark 0: pull only when the consumer reads, so the upstream read
  // pattern (bytes consumed, then cancel) is exactly the unrecorded one.
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        chunks.push(value.slice());
        controller.enqueue(value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
  const wrapped = new Response(stream, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
  return wrapped;
}

function recordedHeaders(res: Response): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const name of RECORDED_HEADERS) {
    const value = res.headers.get(name);
    if (value !== null) {
      out.push([name, value]);
    }
  }
  return out;
}

/** The recorded exchange as the guarded fetch would have returned it. */
function replayedFetch(
  wire: WebFetchWire,
  requestUrl: string,
): {
  response: Response;
  finalUrl: string;
  release: () => Promise<void>;
} {
  const exchange = wire.exchange;
  if (!exchange) {
    throw new Error("web_fetch: no recorded exchange to replay");
  }
  if (exchange.kind === "error") {
    throw exchange.error;
  }
  const total = exchange.chunks.reduce((n, c) => n + c.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of exchange.chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const response = new Response(NULL_BODY_STATUSES.has(exchange.status) ? null : bytes, {
    status: exchange.status,
    statusText: exchange.statusText,
    headers: exchange.headers,
  });
  // Without a redirect the guarded fetch reports the caller's URL string as
  // the final URL (fragment included), so a replay does the same.
  return { response, finalUrl: exchange.redirectedTo ?? requestUrl, release: async () => {} };
}

type WebFetchRuntimeParams = {
  url: string;
  extractMode: ExtractMode;
  maxChars: number;
  maxResponseBytes: number;
  maxRedirects: number;
  timeoutSeconds: number;
  cacheTtlMs: number;
  userAgent: string;
  readabilityEnabled: boolean;
  ssrfPolicy?: {
    allowRfc2544BenchmarkRange?: boolean;
  };
  lookupFn?: LookupFn;
  resolveProviderFallback: () => ReturnType<typeof resolveWebFetchDefinition>;
  /** What the provider fallback is always asked for (the tool's character cap). */
  providerMaxChars: number;
  /** The tool call id, so the batcher can hold this request to its slot. */
  callId?: string;
  /** Network handling; absent means a plain live call. */
  exchange?: WebFetchExchangeMode;
};

function normalizeProviderFinalUrl(value: unknown): string | undefined {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return undefined;
  }
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f) {
      return undefined;
    }
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeProviderWebFetchPayload(params: {
  providerId: string;
  payload: unknown;
  requestedUrl: string;
  extractMode: ExtractMode;
  maxChars: number;
  tookMs: number;
}): Record<string, unknown> {
  const payload = isRecord(params.payload) ? params.payload : {};
  const rawText = typeof payload.text === "string" ? payload.text : "";
  const wrapped = wrapWebFetchContent(rawText, params.maxChars);
  const url = params.requestedUrl;
  const finalUrl = normalizeProviderFinalUrl(payload.finalUrl) ?? url;
  const status =
    typeof payload.status === "number" && Number.isFinite(payload.status)
      ? Math.max(0, Math.floor(payload.status))
      : 200;
  const contentType =
    typeof payload.contentType === "string" ? normalizeContentType(payload.contentType) : undefined;
  const title = typeof payload.title === "string" ? wrapWebFetchField(payload.title) : undefined;
  const warning =
    typeof payload.warning === "string" ? wrapWebFetchField(payload.warning) : undefined;
  const extractor =
    typeof payload.extractor === "string" && payload.extractor.trim()
      ? payload.extractor
      : params.providerId;

  return {
    url,
    finalUrl,
    ...(contentType ? { contentType } : {}),
    status,
    ...(title ? { title } : {}),
    extractMode: params.extractMode,
    extractor,
    externalContent: {
      untrusted: true,
      source: "web_fetch",
      wrapped: true,
      provider: params.providerId,
    },
    truncated: wrapped.truncated,
    length: wrapped.wrappedLength,
    rawLength: wrapped.rawLength,
    wrappedLength: wrapped.wrappedLength,
    fetchedAt:
      typeof payload.fetchedAt === "string" && payload.fetchedAt
        ? payload.fetchedAt
        : new Date().toISOString(),
    tookMs:
      typeof payload.tookMs === "number" && Number.isFinite(payload.tookMs)
        ? Math.max(0, Math.floor(payload.tookMs))
        : params.tookMs,
    text: wrapped.text,
    ...(warning ? { warning } : {}),
  };
}

/**
 * The provider-fallback request. It never carries result shaping: the
 * provider is always asked for markdown at the tool's character cap, and the
 * call's own `extractMode`/`maxChars` are applied here afterwards. So a
 * padding dummy, a batcher refresh and a real call of the same URL send the
 * provider byte-identical requests, whatever shaping the real call used. The
 * answer is recorded and replayed with the exchange.
 */
async function providerFallbackRaw(
  params: WebFetchRuntimeParams & { urlToFetch: string },
  providerFallback: NonNullable<ReturnType<WebFetchRuntimeParams["resolveProviderFallback"]>>,
): Promise<unknown> {
  const ex = params.exchange;
  const wire = ex?.mode === "record" || ex?.mode === "replay" ? ex.wire : undefined;
  const key = JSON.stringify([params.urlToFetch]);
  if (ex?.mode === "replay" && wire) {
    const hit = wire.provider.find((p) => p.key === key);
    if (hit) {
      if (!hit.ok) {
        throw hit.value;
      }
      return hit.value;
    }
  }
  try {
    const value = await providerFallback.definition.execute({
      url: params.urlToFetch,
      extractMode: "markdown",
      maxChars: params.providerMaxChars,
    });
    wire?.provider.push({ key, ok: true, value });
    return value;
  } catch (err) {
    wire?.provider.push({ key, ok: false, value: err });
    throw err;
  }
}

async function maybeFetchProviderWebFetchPayload(
  params: WebFetchRuntimeParams & {
    urlToFetch: string;
    cacheKey: string;
    tookMs: number;
  },
): Promise<Record<string, unknown> | null> {
  const providerFallback = params.resolveProviderFallback();
  if (!providerFallback) {
    return null;
  }
  const raw = await providerFallbackRaw(params, providerFallback);
  // Shape locally: the provider answered in markdown.
  const rawPayload =
    params.extractMode === "text" && isRecord(raw) && typeof raw.text === "string"
      ? { ...raw, text: markdownToText(raw.text) }
      : raw;
  const payload = normalizeProviderWebFetchPayload({
    providerId: providerFallback.provider.id,
    payload: rawPayload,
    requestedUrl: params.url,
    extractMode: params.extractMode,
    maxChars: params.maxChars,
    tookMs: params.tookMs,
  });
  if (params.exchange?.mode !== "dummy") {
    writeCache(FETCH_CACHE, params.cacheKey, payload, params.cacheTtlMs);
  }
  return payload;
}

async function runWebFetch(params: WebFetchRuntimeParams): Promise<Record<string, unknown>> {
  const allowRfc2544BenchmarkRange = params.ssrfPolicy?.allowRfc2544BenchmarkRange === true;
  const cacheKey = normalizeCacheKey(
    `fetch:${params.url}:${params.extractMode}:${params.maxChars}${allowRfc2544BenchmarkRange ? ":allow-rfc2544" : ""}`,
  );
  const mode = params.exchange?.mode ?? "live";
  // Padding never touches the tool's result cache; a call the batcher
  // records or replays must take the network path it records (or replays).
  const cached = mode === "live" ? readCache(FETCH_CACHE, cacheKey) : null;
  if (cached) {
    return { ...cached.value, cached: true };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(params.url);
  } catch {
    throw new Error("Invalid URL: must be http or https");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Invalid URL: must be http or https");
  }

  const start = Date.now();
  let res: Response;
  let release: (() => Promise<void>) | null = null;
  let finalUrl = params.url;
  const ex = params.exchange;
  if (mode === "live" || (ex?.mode === "record" && !ex.refresh)) {
    // The egress action batcher dispatches its windows in lockstep: wait for
    // this request's slot (immediate when it is not holding it).
    await awaitWebFetchIssueSlot(params.url, params.callId);
  }
  try {
    let result: Awaited<ReturnType<typeof fetchWithWebToolsNetworkGuard>>;
    if (ex?.mode === "replay") {
      result = replayedFetch(ex.wire, params.url);
    } else {
      if (ex?.mode === "dummy") {
        ex.issued.value = true;
      }
      try {
        result = await fetchWithWebToolsNetworkGuard({
          url: params.url,
          maxRedirects: params.maxRedirects,
          timeoutSeconds: params.timeoutSeconds,
          lookupFn: params.lookupFn,
          policy: allowRfc2544BenchmarkRange ? { allowRfc2544BenchmarkRange } : undefined,
          init: { headers: webFetchRequestHeaders(params.userAgent) },
        });
      } catch (error) {
        if (ex?.mode === "record") {
          ex.wire.exchange = { kind: "error", error };
          ex.call.wire = ex.wire;
        }
        throw error;
      }
      if (ex?.mode === "record") {
        const chunks: Uint8Array[] = [];
        ex.wire.exchange = {
          kind: "response",
          status: result.response.status,
          statusText: result.response.statusText,
          headers: recordedHeaders(result.response),
          ...(result.finalUrl !== params.url ? { redirectedTo: result.finalUrl } : {}),
          chunks,
        };
        ex.call.wire = ex.wire;
        result = { ...result, response: recordingResponse(result.response, chunks) };
      }
    }
    res = result.response;
    finalUrl = result.finalUrl;
    release = result.release;

    // Cloudflare Markdown for Agents — log token budget hint when present
    const markdownTokens = res.headers.get("x-markdown-tokens");
    if (markdownTokens) {
      logDebug(
        `[web-fetch] x-markdown-tokens: ${markdownTokens} (${redactUrlForDebugLog(finalUrl)})`,
      );
    }
  } catch (error) {
    if (error instanceof SsrFBlockedError) {
      throw error;
    }
    const payload = await maybeFetchProviderWebFetchPayload({
      ...params,
      urlToFetch: finalUrl,
      cacheKey,
      tookMs: Date.now() - start,
    });
    if (payload) {
      return payload;
    }
    throw error;
  }

  try {
    if (!res.ok) {
      const payload = await maybeFetchProviderWebFetchPayload({
        ...params,
        urlToFetch: params.url,
        cacheKey,
        tookMs: Date.now() - start,
      });
      if (payload) {
        return payload;
      }
      const rawDetailResult = await readResponseText(res, { maxBytes: DEFAULT_ERROR_MAX_BYTES });
      const rawDetail = rawDetailResult.text;
      const detail = formatWebFetchErrorDetail({
        detail: rawDetail,
        contentType: res.headers.get("content-type"),
        maxChars: DEFAULT_ERROR_MAX_CHARS,
      });
      const wrappedDetail = wrapWebFetchContent(detail || res.statusText, DEFAULT_ERROR_MAX_CHARS);
      throw new Error(`Web fetch failed (${res.status}): ${wrappedDetail.text}`);
    }

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const normalizedContentType = normalizeContentType(contentType) ?? "application/octet-stream";
    const bodyResult = await readResponseText(res, { maxBytes: params.maxResponseBytes });
    const body = bodyResult.text;
    const responseTruncatedWarning = bodyResult.truncated
      ? `Response body truncated after ${params.maxResponseBytes} bytes.`
      : undefined;

    let title: string | undefined;
    let extractor = "raw";
    let text = body;
    if (contentType.includes("text/markdown")) {
      // Cloudflare Markdown for Agents: server returned pre-rendered markdown
      extractor = "cf-markdown";
      if (params.extractMode === "text") {
        text = markdownToText(body);
      }
    } else if (contentType.includes("text/html")) {
      if (params.readabilityEnabled) {
        const readable = await extractReadableContent({
          html: body,
          url: finalUrl,
          extractMode: params.extractMode,
        });
        if (readable?.text) {
          text = readable.text;
          title = readable.title;
          extractor = "readability";
        } else {
          let payload: Record<string, unknown> | null = null;
          try {
            payload = await maybeFetchProviderWebFetchPayload({
              ...params,
              urlToFetch: finalUrl,
              cacheKey,
              tookMs: Date.now() - start,
            });
          } catch {
            payload = null;
          }
          if (payload) {
            return payload;
          }
          const basic = await extractBasicHtmlContent({
            html: body,
            extractMode: params.extractMode,
          });
          if (basic?.text) {
            text = basic.text;
            title = basic.title;
            extractor = "raw-html";
          } else {
            const providerLabel =
              params.resolveProviderFallback()?.provider.label ?? "provider fallback";
            throw new Error(
              `Web fetch extraction failed: Readability, ${providerLabel}, and basic HTML cleanup returned no content.`,
            );
          }
        }
      } else {
        const payload = await maybeFetchProviderWebFetchPayload({
          ...params,
          urlToFetch: finalUrl,
          cacheKey,
          tookMs: Date.now() - start,
        });
        if (payload) {
          return payload;
        }
        throw new Error(
          "Web fetch extraction failed: Readability disabled and no fetch provider is available.",
        );
      }
    } else if (contentType.includes("application/json")) {
      try {
        text = JSON.stringify(JSON.parse(body), null, 2);
        extractor = "json";
      } catch {
        text = body;
        extractor = "raw";
      }
    }

    const wrapped = wrapWebFetchContent(text, params.maxChars);
    const wrappedTitle = title ? wrapWebFetchField(title) : undefined;
    const wrappedWarning = wrapWebFetchField(responseTruncatedWarning);
    const payload = {
      url: params.url, // Keep raw for tool chaining
      finalUrl, // Keep raw
      status: res.status,
      contentType: normalizedContentType, // Protocol metadata, don't wrap
      title: wrappedTitle,
      extractMode: params.extractMode,
      extractor,
      externalContent: {
        untrusted: true,
        source: "web_fetch",
        wrapped: true,
      },
      truncated: wrapped.truncated,
      length: wrapped.wrappedLength,
      rawLength: wrapped.rawLength, // Actual content length, not wrapped
      wrappedLength: wrapped.wrappedLength,
      fetchedAt: new Date().toISOString(),
      tookMs: Date.now() - start,
      text: wrapped.text,
      warning: wrappedWarning,
    };
    if (mode !== "dummy") {
      writeCache(FETCH_CACHE, cacheKey, payload, params.cacheTtlMs);
    }
    return payload;
  } finally {
    if (release) {
      await release();
    }
  }
}

export function createWebFetchTool(options?: {
  config?: EnclawedConfig;
  sandboxed?: boolean;
  runtimeWebFetch?: RuntimeWebFetchMetadata;
  lookupFn?: LookupFn;
}): AnyAgentTool | null {
  const fetch = resolveFetchConfig(options?.config);
  if (!resolveFetchEnabled({ fetch, sandboxed: options?.sandboxed })) {
    return null;
  }
  const readabilityEnabled = resolveFetchReadabilityEnabled(fetch);
  const userAgent =
    (fetch && "userAgent" in fetch && typeof fetch.userAgent === "string" && fetch.userAgent) ||
    DEFAULT_FETCH_USER_AGENT;
  const maxResponseBytes = resolveFetchMaxResponseBytes(fetch);
  let providerFallbackResolved = false;
  let providerFallbackCache: ReturnType<typeof resolveWebFetchDefinition>;
  const resolveProviderFallback = () => {
    if (!providerFallbackResolved) {
      providerFallbackCache = resolveWebFetchDefinition({
        config: options?.config,
        sandboxed: options?.sandboxed,
        runtimeWebFetch: options?.runtimeWebFetch,
        preferRuntimeProviders: true,
      });
      providerFallbackResolved = true;
    }
    return providerFallbackCache;
  };
  const maxCharsCap = resolveFetchMaxCharsCap(fetch);
  /** The full request path for one URL; the tool and its padding share it. */
  const runParams = (
    url: string,
    shaping: { extractMode: ExtractMode; maxChars: number | undefined },
  ): WebFetchRuntimeParams => ({
    url,
    extractMode: shaping.extractMode,
    maxChars: resolveMaxChars(
      shaping.maxChars ?? fetch?.maxChars,
      DEFAULT_FETCH_MAX_CHARS,
      maxCharsCap,
    ),
    maxResponseBytes,
    maxRedirects: resolveMaxRedirects(fetch?.maxRedirects, DEFAULT_FETCH_MAX_REDIRECTS),
    timeoutSeconds: resolveTimeoutSeconds(fetch?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
    cacheTtlMs: resolveCacheTtlMs(fetch?.cacheTtlMinutes, DEFAULT_CACHE_TTL_MINUTES),
    userAgent,
    readabilityEnabled,
    ssrfPolicy: fetch?.ssrfPolicy,
    lookupFn: options?.lookupFn,
    resolveProviderFallback,
    providerMaxChars: maxCharsCap,
  });
  // Padding for the egress action batcher runs this same request path (C3):
  // the same headers, SSRF guard, byte limit and cancel, error-body limit and
  // provider fallback as a real call with default shaping. It never reads or
  // writes the result cache, never waits for a slot (the batcher sends it at
  // its slot), and resolves whatever the response; it rejects only when the
  // URL was refused before anything could leave, as a real call would be.
  publishWebFetchRequestClient(
    {
      userAgent,
      maxRedirects: resolveMaxRedirects(fetch?.maxRedirects, DEFAULT_FETCH_MAX_REDIRECTS),
      timeoutSeconds: resolveTimeoutSeconds(fetch?.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS),
      allowRfc2544BenchmarkRange: fetch?.ssrfPolicy?.allowRfc2544BenchmarkRange === true,
      lookupFn: options?.lookupFn,
    },
    async (url) => {
      const issued = { value: false };
      try {
        await runWebFetch({
          ...runParams(url, { extractMode: "markdown", maxChars: undefined }),
          exchange: { mode: "dummy", issued },
        });
      } catch (err) {
        if (!issued.value) {
          throw err;
        }
      }
    },
  );
  const tool: AnyAgentTool = {
    label: "Web Fetch",
    name: "web_fetch",
    description:
      "Fetch and extract readable content from a URL (HTML → markdown/text). Use for lightweight page access without browser automation.",
    parameters: WebFetchSchema,
    execute: async (toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const url = readStringParam(params, "url", { required: true });
      const extractMode = readStringParam(params, "extractMode") === "text" ? "text" : "markdown";
      const maxChars = readNumberParam(params, "maxChars", { integer: true });
      // The egress action batcher may ask this call to record its exchange,
      // or to replay an identical earlier call's exchange instead of sending.
      const replay = wireReplayFor("web_fetch", toolCallId);
      if (replay?.mode === "replay" && !isWebFetchWire(replay.wire)) {
        // Fail closed: a repeat that cannot be replayed is not re-sent.
        throw new Error("web_fetch: the recorded exchange for this repeat cannot be replayed");
      }
      const exchange: WebFetchExchangeMode | undefined =
        replay?.mode === "replay" && isWebFetchWire(replay.wire)
          ? { mode: "replay", wire: replay.wire }
          : replay?.mode === "record"
            ? {
                mode: "record",
                call: replay.call,
                wire: { v: 1, provider: [] },
                refresh: replay.refresh,
              }
            : undefined;
      const result = await runWebFetch({
        ...runParams(url, { extractMode, maxChars }),
        callId: toolCallId,
        exchange,
      });
      return jsonResult(result);
    },
  };
  // web_fetch can re-run itself on a recorded exchange (see `tool-replay.ts`).
  Object.defineProperty(tool, TOOL_WIRE_REPLAY, { value: true, enumerable: true });
  return tool;
}
