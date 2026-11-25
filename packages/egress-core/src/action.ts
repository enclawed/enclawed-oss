// Outbound actions and their deterministic idempotency classification, for
// the action batcher (`action-batcher.ts`).
//
// A choice-type covert channel carries information in WHICH allowed actions
// an agent takes, in what ORDER, and HOW MANY times. The batcher shrinks it by
// releasing a window of independent actions in a canonical order and by
// collapsing repeats of idempotent actions. Collapsing is only sound when
// repeating the action has the same effect as doing it once, so idempotency
// comes from a fixed classification, never from a heuristic guess:
//
//   http        GET, HEAD, OPTIONS  -> cacheable (collapse in-window + TTL cache)
//               PUT, DELETE         -> window-only (side effects: no cache)
//               POST, anything else -> never
//   tool        read-only per the host's tool capability map -> cacheable
//               everything else, and every tool when no map is installed -> never
//   file-write  identical target and content -> window-only
//   send        never (each message is an overt act)
//
// Unknown actions are never collapsed: classification fails toward overt.

import { createHash } from "node:crypto";

/** One outbound action, described in a chokepoint-independent way. */
export type EgressAction =
  | { type: "http"; method: string; url: string; body?: string }
  | { type: "tool"; toolName: string; params?: unknown }
  | { type: "file-write"; path: string; content: string }
  | { type: "send"; target: string; content: string };

/**
 * - `cacheable`: idempotent and side-effect free. Repeats collapse within a
 *   window and are answered from a short-TTL response cache across windows.
 * - `window-only`: idempotent with side effects. Repeats collapse within a
 *   window only; a later window re-issues the action.
 * - `never`: not known to be idempotent. Every repeat is released.
 */
export type ActionIdempotency = "cacheable" | "window-only" | "never";

/**
 * Capability class of a tool, as published by the host's tool capability map
 * (the open core's `src/enclawed/tool-capability-map.ts`).
 */
export type ToolCapabilityInfo = {
  capability: string;
  reversible: boolean;
  exemption?: string;
};

export type ToolCapabilityClassifier = (toolName: string) => ToolCapabilityInfo;

// Shared, host-populated slot. The open core publishes its tool capability
// map here at boot; egress-core only reads it. The key is part of the
// contract between the two and must not change.
const TOOL_CLASSIFIER_KEY = Symbol.for("enclawed.tool-capability-classifier");

type ClassifierSlot = { classify: ToolCapabilityClassifier | null };

function classifierSlot(): ClassifierSlot {
  const globals = globalThis as unknown as Record<symbol, ClassifierSlot | undefined>;
  let slot = globals[TOOL_CLASSIFIER_KEY];
  if (!slot) {
    slot = { classify: null };
    globals[TOOL_CLASSIFIER_KEY] = slot;
  }
  return slot;
}

/** Install a tool capability classifier (the host does this at boot). */
export function setToolCapabilityClassifier(classify: ToolCapabilityClassifier | null): void {
  classifierSlot().classify = classify;
}

/** Whether a tool capability classifier is installed. */
export function hasToolCapabilityClassifier(): boolean {
  return classifierSlot().classify !== null;
}

const CACHEABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const WINDOW_ONLY_METHODS = new Set(["PUT", "DELETE"]);

/** True when the HTTP method is safe to issue as padding (no side effects). */
export function isSafeHttpMethod(method: string): boolean {
  return CACHEABLE_METHODS.has(method.trim().toUpperCase());
}

function classifyTool(toolName: string): ActionIdempotency {
  const { classify } = classifierSlot();
  if (!classify) {
    return "never";
  }
  try {
    const info = classify(toolName);
    // Read-only means the capability is a read, or the map grants the
    // explicit read-only-retrieval exemption (web_search, web_fetch, ...).
    if (info.capability === "fs.read" || info.exemption === "read-only-retrieval") {
      return "cacheable";
    }
  } catch {
    // A failing classifier must not make anything collapsible.
  }
  return "never";
}

/** Deterministic idempotency class of an action. */
export function classifyActionIdempotency(action: EgressAction): ActionIdempotency {
  switch (action.type) {
    case "http": {
      const method = action.method.trim().toUpperCase();
      if (CACHEABLE_METHODS.has(method)) {
        return "cacheable";
      }
      return WINDOW_ONLY_METHODS.has(method) ? "window-only" : "never";
    }
    case "tool":
      return classifyTool(action.toolName.trim().toLowerCase());
    case "file-write":
      return "window-only";
    case "send":
      return "never";
  }
  return "never";
}

/** JSON with object keys sorted at every depth, so equal values encode equally. */
function stableJson(value: unknown, depth = 0): string {
  if (depth > 32) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableJson(v, depth + 1)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).toSorted();
    const parts = keys
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k], depth + 1)}`,
      );
    return `{${parts.join(",")}}`;
  }
  const json = JSON.stringify(value);
  return json === undefined ? "null" : json;
}

/**
 * The URL exactly as an HTTP client puts it on the wire (C1: key on the
 * request actually sent, not on the string the agent typed).
 *
 * WHATWG parsing already performs every normalization the client applies:
 * lower-case scheme and host, default port dropped, IDN to punycode, dot
 * segments resolved, `\` read as `/`, an empty path read as `/`, and
 * characters outside the URL code points percent-encoded. On top of that,
 * two parts of the string never reach the wire:
 *   - the fragment (`#...`): fetch never sends it;
 *   - an empty query (a bare `?`): fetch sends `pathname + search`, and
 *     `search` is "" for an empty query, so `/a?` and `/a` are the same
 *     request line.
 * Both are removed here. Nothing else is: percent-encoding case (`%2f` vs
 * `%2F`) and percent-encoded unreserved characters (`%41` vs `A`) are sent
 * as written, so they are different requests on the wire and stay different
 * keys (merging them would merge requests that differ on the wire). The
 * user-info part is kept as well: fetch refuses such URLs, so they never
 * leave, and must not be merged with one that does.
 *
 * Unparseable strings are returned trimmed: they are never sent.
 */
export function wireRequestUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  url.hash = "";
  if (url.search === "") {
    // Drops a bare "?" (WHATWG keeps it in href; the request line does not).
    url.search = "";
  }
  return url.href;
}

/** Origin (scheme, host, port) of an HTTP URL, or null when it has none. */
export function httpOrigin(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Canonical encoding of an action: equal effects encode to equal strings.
 * HTTP methods are upper-cased and URLs reduced to the request that goes on
 * the wire (`wireRequestUrl`), tool names lower-cased, and structured
 * parameters key-sorted.
 */
export function canonicalActionEncoding(action: EgressAction): string {
  switch (action.type) {
    case "http":
      return stableJson({
        t: "http",
        m: action.method.trim().toUpperCase(),
        u: wireRequestUrl(action.url),
        b: action.body ?? "",
      });
    case "tool":
      return stableJson({
        t: "tool",
        n: action.toolName.trim().toLowerCase(),
        p: action.params ?? null,
      });
    case "file-write":
      return stableJson({ t: "file-write", p: action.path, c: action.content });
    case "send":
      return stableJson({ t: "send", to: action.target, c: action.content });
  }
  return stableJson(action);
}

/** SHA-256 hex of the canonical encoding: the batcher's sort and dedup key. */
export function actionKey(action: EgressAction): string {
  return createHash("sha256").update(canonicalActionEncoding(action)).digest("hex");
}

// --- Tool request clients ------------------------------------------------
//
// Padding must be indistinguishable from the real actions it hides: same
// client, same headers, same SSRF guard, same egress path. So a tool whose
// calls leave the host as plain HTTP GETs (the open core's `web_fetch`)
// publishes its own request client on this shared slot, and the batcher
// sends every dummy through it. The open core also reports here each time
// the tool issues a real request, so a padded window can dispatch real and
// dummy requests in one lockstep canonical sequence. The key is part of the
// contract with the open core (`src/agents/tools/web-fetch.ts`) and must not
// change.

const TOOL_REQUEST_CLIENT_KEY = Symbol.for("enclawed.tool-request-client");

/** Whether a tool's client would send a GET, from policy alone (nothing is sent). */
export type ToolRequestCheck = { ok: true } | { ok: false; reason: string };

export type ToolRequestClient = {
  /** Would the tool send this GET? Runs the tool's own SSRF/egress policy; sends nothing. */
  check(url: string): Promise<ToolRequestCheck>;
  /**
   * Perform the tool's whole request path for this URL exactly as a real
   * call does (same headers, SSRF guard, byte limit and cancel, error-body
   * limit, provider fallback), and discard the result. Resolves once the
   * request has been attempted, whatever the response; rejects only when the
   * tool refused it before anything could leave (for example an invalid URL),
   * which a real call of the same URL would hit identically.
   */
  send(url: string): Promise<void>;
};

/**
 * Called by a tool just before a real request leaves (`requestToolIssueSlot`).
 * A listener may return a promise: the request waits for it, which is how the
 * batcher holds real requests to their slot in a lockstep dispatch. A
 * rejected promise means the slot is gone; the tool must not send.
 */
export type ToolIssueListener = (
  toolName: string,
  url: string,
  callId?: string,
) => void | Promise<void>;

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

/** Install (or, with `null`, remove) a tool's request client. The host does this. */
export function setToolRequestClient(toolName: string, client: ToolRequestClient | null): void {
  const name = toolName.trim().toLowerCase();
  if (client) {
    toolRequestSlot().clients.set(name, client);
  } else {
    toolRequestSlot().clients.delete(name);
  }
}

/** The request client a tool published, or null. */
export function getToolRequestClient(toolName: string): ToolRequestClient | null {
  return toolRequestSlot().clients.get(toolName.trim().toLowerCase()) ?? null;
}

/** Listen for real requests a tool issues. Returns an unsubscribe function. */
export function onToolRequestIssued(listener: ToolIssueListener): () => void {
  const slot = toolRequestSlot();
  slot.listeners.add(listener);
  return () => {
    slot.listeners.delete(listener);
  };
}

/**
 * A tool is about to send a real request: wait for its slot. Resolves when
 * the request may leave; rejects when it must not (its slot expired and a
 * substitute already went out). The host's web_fetch does this; tests and
 * the benchmark play the tool with it.
 */
export async function requestToolIssueSlot(
  toolName: string,
  url: string,
  callId?: string,
): Promise<void> {
  const waits: Array<Promise<void>> = [];
  for (const listener of toolRequestSlot().listeners) {
    try {
      const wait = listener(toolName.trim().toLowerCase(), url, callId);
      if (wait && typeof wait.then === "function") {
        waits.push(wait);
      }
    } catch {
      // A failing listener must not break the tool's request.
    }
  }
  await Promise.all(waits);
}

/** Report that a tool issued a real request without waiting for a slot. */
export function notifyToolRequestIssued(toolName: string, url: string, callId?: string): void {
  requestToolIssueSlot(toolName, url, callId).catch(() => {});
}

// --- Tool-call replay ----------------------------------------------------
//
// A repeat the batcher answers without re-sending must reach the agent as
// the result the call would have had, not as a refusal (zero false
// positives). The open core runs every tool call inside a replay context
// (`src/agents/tool-replay.ts`), published on this shared slot: the
// mediator's before_tool_call hook reads the call's context and sets a
// directive, and the host's tool wrapper then either records the call's
// outcome or reproduces a recorded one without executing the tool. The key
// and shape are a contract with the open core and must not change.

const TOOL_REPLAY_KEY = Symbol.for("enclawed.tool-replay");

/** A recorded tool-call outcome. `wire` is a tool-private record of its exchange. */
export type ToolReplayOutcome =
  | { ok: true; result: unknown; wire?: unknown }
  | { ok: false; error: unknown; wire?: unknown };

export type ToolReplayDirective =
  /** Execute, and record the outcome (and the wire exchange, if the tool can). */
  | { kind: "record"; refresh?: boolean }
  /** Do not send: reproduce this outcome (re-running the tool on its wire record when it can). */
  | { kind: "replay"; outcome: ToolReplayOutcome };

/** One tool call's replay context, as the host's tool wrapper creates it. */
export type ToolReplayCall = {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly runId?: string;
  /** The tool can re-run itself on a recorded wire exchange (web_fetch). */
  readonly wireReplay: boolean;
  directive?: ToolReplayDirective;
  /** Set by the wrapper when the tool's execute was entered. */
  executed: boolean;
  /** Set by the wrapper when execute settled. */
  outcome?: ToolReplayOutcome;
  /** Set by the wrapper on a recorded call: re-issue it, for the batcher's refresh. */
  rerun?: () => Promise<ToolReplayOutcome | null>;
};

type ToolReplaySlot = {
  als?: { getStore(): ToolReplayCall | undefined };
};

/** The replay context of the tool call running now, or undefined (no host support). */
export function currentToolReplayCall(): ToolReplayCall | undefined {
  const slot = (globalThis as unknown as Record<symbol, ToolReplaySlot | undefined>)[
    TOOL_REPLAY_KEY
  ];
  try {
    return slot?.als?.getStore();
  } catch {
    return undefined;
  }
}

/** The URL of the outbound GET an action stands for, or null when it is not one. */
export function outboundGetUrl(action: EgressAction): string | null {
  if (action.type === "http" && action.method.trim().toUpperCase() === "GET") {
    return action.url;
  }
  return null;
}
