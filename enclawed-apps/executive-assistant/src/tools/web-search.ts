// Web search for the executive assistant. Two backends, picked automatically:
//
//   1. Brave Search API — when BRAVE_SEARCH_API_KEY is configured.
//      Higher-quality results, structured JSON, official API. The
//      preferred path for operators who can pay or have a free-tier
//      key.
//
//   2. DuckDuckGo HTML — when no Brave key is set. No account, no
//      API key, no signup. Lower-quality result snippets and fragile
//      to layout changes, but it Just Works out of the box for the
//      operator who's installing the executive assistant as an end-user product
//      instead of a developer kit. This is the default for the
//      "normal folks" install path.
//
// Both backends go through the SkillGate dispatch as cap=FS_READ
// (reversible — no broker keypress). Egress hosts for each backend
// are added to the executive assistant's allowlist at startup.
//
// Prompt-injection threat: a hostile search result snippet could try
// to steer the LLM. Two mitigations live above this module:
//   1. STAGE 2 reply composition runs with NO tools, so even a
//      successfully-injected LLM can only write text.
//   2. The reply recipient is bounded to the original thread
//      participants — not attacker-chosen — by the email path itself.

import {
  CAPABILITY,
  dlpRedact,
  makeCall,
  type GateOutcome,
  type SkillGate,
} from "enclawed/framework";

const EXECUTIVE_ASSISTANT_SKILL_ID = "enclawed-app-executive-assistant";
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DDG_HTML_ENDPOINT = "https://html.duckduckgo.com/html/";
const DEFAULT_MAX_RESULTS = 5;
const HARD_MAX_RESULTS = 10;
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Hosts the web-search tool may reach. Both are always allowed
 * regardless of which backend is currently selected — the operator
 * may toggle between Brave and DDG by setting/clearing
 * BRAVE_SEARCH_API_KEY without a re-install.
 */
export const WEB_SEARCH_EGRESS_HOSTS: ReadonlyArray<string> = Object.freeze([
  "api.search.brave.com",
  "html.duckduckgo.com",
]);

/** Legacy single-host export, kept for back-compat with callers. */
export const WEB_SEARCH_EGRESS_HOST = "api.search.brave.com";

export type WebSearchResult = Readonly<{
  title: string;
  url: string;
  snippet: string;
}>;

export type WebSearchOptions = Readonly<{
  gate: SkillGate;
  /** Brave Search API key. Empty / undefined → DuckDuckGo backend. */
  apiKey?: string;
  log?: (level: "info" | "warn" | "error", msg: string) => void;
}>;

export class WebSearchToolError extends Error {
  constructor(public readonly outcome: GateOutcome) {
    super(`web-search dispatch ${outcome.kind}`);
    this.name = "WebSearchToolError";
  }
}

export class WebSearchTool {
  private readonly gate: SkillGate;
  private readonly apiKey: string;
  private readonly log: (level: "info" | "warn" | "error", msg: string) => void;

  constructor(opts: WebSearchOptions) {
    this.gate = opts.gate;
    this.apiKey = (opts.apiKey ?? "").trim();
    this.log =
      opts.log ??
      ((level, msg) => {
        const stream = level === "info" ? process.stdout : process.stderr;
        stream.write(`[web-search ${level}] ${msg}\n`);
      });
  }

  async search(
    query: string,
    maxResults: number = DEFAULT_MAX_RESULTS,
  ): Promise<ReadonlyArray<WebSearchResult>> {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return [];
    }
    if (trimmedQuery.length > 400) {
      throw new Error("web-search: query exceeds 400 chars");
    }
    const count = Math.max(1, Math.min(HARD_MAX_RESULTS, Math.floor(maxResults)));
    const backend = this.apiKey.length > 0 ? "brave" : "duckduckgo";

    const target = `web-search:${backend}/${count}?q=${encodeURIComponent(trimmedQuery.slice(0, 120))}`;
    const call = makeCall({
      cap: CAPABILITY.FS_READ,
      target,
      args: { q: trimmedQuery, count, backend },
    });

    let captured: ReadonlyArray<WebSearchResult> = [];
    const outcome = await this.gate.dispatch({
      skillId: EXECUTIVE_ASSISTANT_SKILL_ID,
      call,
      execute: async () => {
        const result =
          backend === "brave"
            ? await fetchBrave(trimmedQuery, count, this.apiKey)
            : await fetchDuckDuckGo(trimmedQuery, count);
        if (!result.ok) {
          return result;
        }
        captured = result.results;
        return { ok: true as const };
      },
    });
    if (outcome.kind !== "executed") {
      throw new WebSearchToolError(outcome);
    }
    this.log(
      "info",
      `web-search (${backend}): q=${trimmedQuery.slice(0, 60)} → ${captured.length} result(s)`,
    );
    return captured;
  }
}

type FetchResult =
  | { ok: true; results: ReadonlyArray<WebSearchResult> }
  | { ok: false; reason: string };

async function fetchBrave(query: string, count: number, apiKey: string): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let resp: Response;
  try {
    const url = new URL(BRAVE_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));
    resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
  } catch (err) {
    return { ok: false, reason: `brave-search: ${(err as Error).message ?? "fetch failed"}` };
  } finally {
    clearTimeout(timeout);
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, reason: `brave-search HTTP ${resp.status}: ${body.slice(0, 200)}` };
  }
  const parsed = parseBraveResponse(await resp.json().catch(() => null), count);
  if (!parsed) {
    return { ok: false, reason: "brave-search: malformed response" };
  }
  return { ok: true, results: parsed };
}

async function fetchDuckDuckGo(query: string, count: number): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let resp: Response;
  try {
    const params = new URLSearchParams({ q: query });
    resp = await fetch(DDG_HTML_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // DDG returns a friendlier layout to non-bot UAs; identify as a
        // generic browser so the response shape stays stable. No bot
        // evasion needed — we're well under DDG's per-IP request cap.
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
        Accept: "text/html",
      },
      body: params.toString(),
      signal: ctrl.signal,
    });
  } catch (err) {
    return { ok: false, reason: `duckduckgo: ${(err as Error).message ?? "fetch failed"}` };
  } finally {
    clearTimeout(timeout);
  }
  if (!resp.ok) {
    return { ok: false, reason: `duckduckgo HTTP ${resp.status}` };
  }
  const html = await resp.text().catch(() => "");
  const parsed = parseDuckDuckGoHtml(html, count);
  return { ok: true, results: parsed };
}

// Parse Brave's response. Tolerates missing fields and bad shapes —
// returns null on anything we can't deserialise to the strict shape.
function parseBraveResponse(raw: unknown, count: number): ReadonlyArray<WebSearchResult> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const web = (raw as { web?: unknown }).web;
  if (!web || typeof web !== "object") {
    return [];
  }
  const results = (web as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return [];
  }
  const out: WebSearchResult[] = [];
  for (const item of results.slice(0, count)) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rec = item as { title?: unknown; url?: unknown; description?: unknown };
    if (typeof rec.title !== "string" || typeof rec.url !== "string") {
      continue;
    }
    out.push(
      Object.freeze({
        title: clip(rec.title, 200),
        url: clip(rec.url, 400),
        snippet: typeof rec.description === "string" ? clip(stripHtml(rec.description), 400) : "",
      }),
    );
  }
  return Object.freeze(out);
}

/**
 * Parse DuckDuckGo's HTML result page. The structure is:
 *
 *   <div class="result results_links">
 *     <h2 class="result__title">
 *       <a class="result__a" href="<redirect URL>">Title HTML</a>
 *     </h2>
 *     ...
 *     <a class="result__snippet" href="...">Snippet HTML</a>
 *   </div>
 *
 * DDG's URLs are wrapped in a redirect proxy of the form
 * `//duckduckgo.com/l/?uddg=<encoded>&rut=...`. We unwrap them so the
 * snippet citation the LLM produces points at the actual source.
 */
function parseDuckDuckGoHtml(html: string, count: number): ReadonlyArray<WebSearchResult> {
  const out: WebSearchResult[] = [];
  // Each result block — tolerant to attribute ordering.
  const blockRe = /<div[^>]*class="[^"]*\bresult\b[^"]*results_links\b[^"]*"[\s\S]*?<\/div>/gi;
  const titleRe = /<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
  const snippetRe = /<a[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null && out.length < count) {
    const block = match[0];
    const titleM = titleRe.exec(block);
    if (!titleM) {
      continue;
    }
    const rawHref = titleM[1] ?? "";
    const titleHtml = titleM[2] ?? "";
    const snipM = snippetRe.exec(block);
    const snippetHtml = snipM?.[1] ?? "";
    const url = unwrapDuckDuckGoUrl(rawHref);
    if (!url) {
      continue;
    }
    out.push(
      Object.freeze({
        title: clip(decodeEntities(stripHtml(titleHtml)).trim(), 200),
        url: clip(url, 400),
        snippet: clip(decodeEntities(stripHtml(snippetHtml)).trim(), 400),
      }),
    );
  }
  return Object.freeze(out);
}

function unwrapDuckDuckGoUrl(raw: string): string {
  // DDG result links are of the form
  //   //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2F&rut=...
  // or just /l/?uddg=... — we extract the inner URL.
  const m = /[?&]uddg=([^&]+)/.exec(raw);
  if (m) {
    try {
      return decodeURIComponent(m[1] ?? "");
    } catch {
      return "";
    }
  }
  // Some results come back as absolute URLs already (e.g. when the
  // bang operator routed straight to a known source).
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return "";
}

function clip(s: string, max: number): string {
  // Run the framework's DLP redactor over every snippet/title before
  // the LLM sees it. The "critical" cluster includes prompt-template
  // markers, jailbreak phrases, role-takeover prefixes, and "ignore
  // previous instructions" variants — all of which are catastrophic
  // when a chat-tuned model consumes them from untrusted input.
  // Same redactor the broker uses on outbound; consistent semantics.
  const clipped = s.length > max ? s.slice(0, max) + "…" : s;
  return dlpRedact(clipped, { minSeverity: "critical", placeholder: "[REDACTED]" });
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Prompt-injection sanitization is delegated to the framework DLP
// scanner (see src/enclawed/dlp-scanner.ts). Patterns live alongside
// every other DLP rule so the broker and the inbound search tool
// share semantics; web-search just calls dlpRedact in clip() above.
