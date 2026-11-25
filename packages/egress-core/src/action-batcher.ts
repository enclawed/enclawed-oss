// Action batcher: shrinks choice-type covert channels.
//
// An agent that may take any of N allowed actions can still signal through
// WHICH actions it takes (subset), HOW MANY times (multiset), and in what
// ORDER (sequence). For k actions drawn from N, the sequence channel carries
// up to k*log2(N) bits, the multiset channel log2(C(N+k-1, k)), and the
// subset channel N bits. The batcher removes these layer by layer:
//
//   canonicalOrder            Buffer the independent actions of one window and
//                             release them sorted by SHA-256 of their canonical
//                             encoding. The order becomes a function of the
//                             action set, so the sequence channel is gone and
//                             what is left is the multiset.
//   collapseIdempotentRepeats Repetition is only covert when the repeat has the
//                             same effect as doing it once; otherwise it is
//                             overt. So repeats of an idempotent action collapse
//                             to one within the window, and every later repeat
//                             of a side-effect-free one in the same scope is
//                             answered from the recorded outcome of the one
//                             request that left. What is left is the subset.
//   padding                   Issue the full allowed set every active window
//                             (missing members as dummy requests through the
//                             padded tool's own request path), on a fixed
//                             window grid. The observed set is constant, so the
//                             per-window choice capacity is 0 for actions in
//                             the set.
//
// Keys (C1). Actions are keyed by what leaves the host. Callers map a tool
// call to its outbound request first (web_fetch to an HTTP GET of its URL),
// and HTTP URLs are reduced to the request line actually sent
// (`wireRequestUrl`: no fragment, no bare "?"). Two calls get one key exactly
// when they send the same request; requests that differ on the wire never
// share a key. The sort key is the same wire key, so nothing that stays on
// the host can be varied to choose the release order.
//
// Repeats across windows (C2). Within a scope (one agent run), an idempotent,
// side-effect-free request leaves at most once. Its outcome is recorded, and
// every later identical request in the scope is answered from it:
//   - an error answer is an outcome too: the repeat gets the same error and is
//     not re-sent, so a receiver cannot reopen the count by failing;
//   - a request still in flight answers its repeats when it settles;
//   - time never releases a repeat: the record lives as long as the scope;
//   - capacity never releases a repeat: when a record must be dropped (scope
//     or process byte budget, see MAX_* below) its key is kept and a later
//     repeat is refused, not re-sent; a scope whose state was dropped refuses
//     its cacheable actions.
// The only thing that clears a record is an action that can change what the
// request returns, at submission and again when it settles: an HTTP request
// with an unsafe method (anything but GET, HEAD, OPTIONS) to the same origin,
// or a side-effecting action whose target the batcher cannot see (a send, a
// browser action, a network shell command) that names the origin in its
// parameters. A stale answer would be a false positive, so a possible write
// to the origin a recorded GET reads re-opens that GET. Nothing else does: a
// read, a local file write, or an action that never names the origin cannot
// change what it returns, and letting them clear the record would let the
// sender reopen the count at will (C2). Residuals, both stated: a re-send per
// side-effecting action naming the origin (FN side, at most one per such
// action, each itself an observable action), and a stale answer when the
// origin is changed by something that does not name it, or by time (FP side).
//
// Window-only repeats (M4). PUT, DELETE and identical file writes collapse
// within a window only when no other side-effecting action on the same
// resource shares the window: {PUT x=1, DELETE x, PUT x=1} is not {PUT x=1,
// DELETE x}, so such a window releases every action.
//
// Dependencies (M12). A data-flow dependent (its input contains part of an
// earlier action's result) can only point to an earlier window, because no
// action in an open window has been released, let alone completed. All of a
// window's actions are therefore concurrent, so data-flow dependents are
// sorted, collapsed and answered like any other action (`dataFlowFrom` is
// audit only). Only an explicit ordering dependency (`dependsOn`) makes a
// barrier, and the egress mediator never sets it: no agent-controlled input
// can make an action a barrier. Should a host caller ever derive it from agent
// input, the full cost is charged before anything is released: the choice of
// which d of the window's m actions are barriers, log2 C(m, d), plus their
// order, log2 d!.
//
// Padding (C3, C4). Dummies go through the request client of the tool they
// pad (`getToolRequestClient`), which runs that tool's whole real request
// path: same headers, SSRF guard, byte limit and cancel, error-body limit and
// provider fallback. A dummy that fails in flight fails exactly as a real
// request of the same URL would, so it is not a fault and blocks nothing (a
// receiver cannot latch the batcher closed by failing). Real and dummy
// requests leave in one lockstep canonical sequence: every real GET of the
// window is released, waits at its issue slot (`requestToolIssueSlot`) until
// all have arrived, and then the slots open in canonical order, real and
// dummy alike, one per event-loop turn. A released GET that never reaches its
// slot (for example a tool-side cache hit) is sent as padding at its slot, so
// the observed set stays complete.
//
// An action outside the padding set P is not hidden: its identity leaks. For
// a request whose wire form is L bytes, at most 9L + 1 bits (a prefix-free
// code for any byte string, plus one continuation bit for the set), whatever
// the size of the space it was drawn from. That charge is taken from the
// capacity ledger before the window is released; when the ledger cannot pay
// it, the window holds (up to MAX_BUDGET_HOLD_MS) and then refuses that
// action. Fail-closed: with no ledger, out-of-set requests in a padded window
// are refused.
//
// Idempotency comes only from `classifyActionIdempotency`; anything it does
// not know is never collapsed. The batcher reorders and withholds duplicates;
// it never rewrites an action.

import { randomBytes } from "node:crypto";
import {
  actionKey,
  classifyActionIdempotency,
  getToolRequestClient,
  httpOrigin,
  isSafeHttpMethod,
  onToolRequestIssued,
  outboundGetUrl,
  wireRequestUrl,
  type ActionIdempotency,
  type EgressAction,
  type ToolRequestClient,
} from "./action.js";
import { createPluginConfigReader } from "./config-validation.js";
import { STAGE_IDS } from "./config.js";
import { createSeededRandomInt, deriveScopeSeed } from "./refresh-entropy.js";
import type { CapacityLedger, EgressMode, Finding } from "./types.js";

export const ACTION_BATCHER_STAGE_ID = STAGE_IDS.actionBatcher;

export type ActionBatcherOptions = {
  /** Length of one batching window. */
  windowMs: number;
  /** Release a window's independent actions sorted by canonical hash. */
  canonicalOrder: boolean;
  /** Collapse repeats of idempotent actions (window + recorded outcomes). */
  collapseIdempotentRepeats: boolean;
  /**
   * Cross-window answering of side-effect-free repeats: 0 turns it off (every
   * later-window repeat is re-sent; an explicit operator opt-out). Any
   * positive value turns it on for the scope's whole lifetime: the value no
   * longer expires records, because a time limit would let the sender
   * re-send a repeat by waiting.
   */
  cacheTtlMs: number;
  /** Constant-set padding with safe (GET/HEAD/OPTIONS) HTTP actions. */
  padding: { enabled: boolean; allowedSet: readonly EgressAction[] };
  /** Tool names the gateway tool-call chokepoint batches. */
  tools: readonly string[];
};

/** Tools whose calls are observable outside the host, plus file writes. */
export const DEFAULT_BATCHED_TOOLS: readonly string[] = [
  "message",
  "sessions_send",
  "web_fetch",
  "web_search",
  "x_search",
  "browser",
  "write",
];

export const DEFAULT_ACTION_BATCHER_OPTIONS: ActionBatcherOptions = {
  windowMs: 250,
  canonicalOrder: true,
  collapseIdempotentRepeats: true,
  cacheTtlMs: 30_000,
  padding: { enabled: false, allowedSet: [] },
  tools: DEFAULT_BATCHED_TOOLS,
};

/**
 * Internal refresh tuning (not configuration): every recorded side-effect-free
 * outcome in a live scope is re-issued by the batcher itself in rounds whose
 * spacing is drawn from [intervalMs·(1−jitter), intervalMs·(1+jitter)], at most
 * `perInterval` refreshes per scope per round.
 */
export const REFRESH_DEFAULTS = {
  intervalMs: 30_000,
  perInterval: 64,
  jitter: 0.5,
} as const;

export type RefreshTuning = { intervalMs: number; perInterval: number; jitter: number };

/** Padding entries: a URL string (GET) or `{ method, url }` with a safe method; else null. */
function paddingAction(entry: unknown): EgressAction | null {
  if (typeof entry === "string" && entry.trim()) {
    return { type: "http", method: "GET", url: entry.trim() };
  }
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const { method, url, ...rest } = entry as { method?: unknown; url?: unknown };
    if (Object.keys(rest).length > 0) {
      return null;
    }
    const m = method === undefined ? "GET" : method;
    if (typeof m === "string" && typeof url === "string" && url.trim() && isSafeHttpMethod(m)) {
      return { type: "http", method: m.trim().toUpperCase(), url: url.trim() };
    }
  }
  return null;
}

const BATCHER_KEYS = [
  "enabled",
  "windowMs",
  "canonicalOrder",
  "collapseIdempotentRepeats",
  "cacheTtlMs",
  "padding",
  "tools",
] as const;

/** Bounds of `windowMs`: a shorter window collapses and reorders less. */
export const WINDOW_MS_RANGE = { min: 250, max: 10_000 } as const;
/** Bounds of `cacheTtlMs`: 0 (cross-window answering off) is refused. */
export const CACHE_TTL_MS_RANGE = { min: 1, max: 600_000 } as const;

/**
 * Resolve raw (plugin) config into batcher options, fail-closed: an unknown
 * key, a wrong type, an out-of-range value, or a value that would weaken the
 * batcher below its shipped guarantees throws, so the plugin config is
 * refused instead of running a weaker batcher. Accepted only:
 *   - `windowMs` in [250, 10000] (default 250);
 *   - `canonicalOrder` / `collapseIdempotentRepeats`: true (cannot be turned off);
 *   - `cacheTtlMs` in [1, 600000] (cross-window answering cannot be turned off);
 *   - `padding.allowedSet`: valid entries only (none dropped), non-empty when
 *     `padding.enabled` is true;
 *   - `tools`: the defaults plus any additions (none can be removed).
 */
export function resolveActionBatcherOptions(raw: unknown): ActionBatcherOptions {
  const r = createPluginConfigReader("egress-action-batcher", raw ?? {}, BATCHER_KEYS);
  const d = DEFAULT_ACTION_BATCHER_OPTIONS;
  r.bool("enabled", true);
  const windowMs = r.number("windowMs", d.windowMs, { integer: true, ...WINDOW_MS_RANGE });
  for (const key of ["canonicalOrder", "collapseIdempotentRepeats"] as const) {
    if (!r.bool(key, true)) {
      r.fail(`${key} cannot be turned off: it is part of the egress guarantees`);
    }
  }
  const cacheTtlMs = r.number("cacheTtlMs", d.cacheTtlMs, { integer: true, ...CACHE_TTL_MS_RANGE });
  const pad = r.section("padding", ["enabled", "allowedSet"]);
  const padEnabled = pad.bool("enabled", false);
  const rawSet = (raw as { padding?: { allowedSet?: unknown } } | null | undefined)?.padding
    ?.allowedSet;
  if (rawSet !== undefined && !Array.isArray(rawSet)) {
    r.fail("padding.allowedSet must be a list");
  }
  const allowedSet: EgressAction[] = [];
  for (const [i, entry] of ((rawSet as unknown[] | undefined) ?? []).entries()) {
    const action = paddingAction(entry);
    if (!action) {
      return r.fail(
        `padding.allowedSet[${i}] must be a URL or { method, url } with method GET, HEAD or OPTIONS`,
      );
    }
    allowedSet.push(action);
  }
  if (padEnabled && allowedSet.length === 0) {
    r.fail("padding.enabled requires a non-empty padding.allowedSet");
  }
  const tools = r.stringList("tools", d.tools);
  const missing = d.tools.filter((t) => !tools.includes(t));
  if (missing.length > 0) {
    r.fail(`tools may only add to the defaults; missing: ${missing.join(", ")}`);
  }
  return {
    windowMs,
    canonicalOrder: true,
    collapseIdempotentRepeats: true,
    cacheTtlMs,
    padding: { enabled: padEnabled, allowedSet },
    tools,
  };
}

export type ActionSubmission = {
  /** Unique id (for example the tool call id); used by `complete`/`fail`/`abandon`. */
  id: string;
  action: EgressAction;
  /** Batching scope, for example the agent run. Windows and records are per scope. */
  scope?: string;
  /**
   * Explicit ordering dependencies: ids of actions this one must be released
   * after. Each makes a barrier. Must be declared by the host, never derived
   * from agent-controlled input (the egress mediator never sets it); the
   * batcher charges log2 C(m, d) + log2 d! regardless (see header).
   */
  dependsOn?: readonly string[];
  /**
   * Data-flow provenance: ids of earlier actions whose results this action's
   * input contains. Audit only; it does not make a barrier (see header).
   */
  dataFlowFrom?: readonly string[];
  /** Resolved stage mode; `off` passes through, `audit` releases at once. */
  mode?: EgressMode;
  /** Ledger barrier order and out-of-set identities are charged to. */
  ledger?: CapacityLedger;
};

/** The outcome of the one request that left, as recorded for its repeats. */
export type RecordedOutcome = { ok: boolean; response: unknown };

/** Re-issue a recorded request through the tool's own path; null when it was skipped. */
export type RefreshFn = () => Promise<RecordedOutcome | null>;

export type ActionRelease =
  /**
   * Perform the action now. `position` is its index in the window's release
   * order. `tracked`: its outcome answers repeats, so report it with
   * `complete`/`fail` (or `abandon` if it never executed).
   */
  | { outcome: "execute"; key: string; position: number; windowSize: number; tracked: boolean }
  /**
   * An identical idempotent action was released instead (this window, or one
   * still in flight); reuse its outcome. Resolves to undefined when that
   * action never executed (blocked downstream).
   */
  | {
      outcome: "collapsed";
      key: string;
      leaderId: string;
      response: Promise<RecordedOutcome | undefined>;
    }
  /** Answered from the recorded outcome of the identical request, error included. */
  | { outcome: "cached"; key: string; ok: boolean; response: unknown }
  /** Not released (capacity ledger, budget, padding undeliverable, or repeat state dropped). */
  | { outcome: "blocked"; key: string; reason: string };

export type ActionBatcherDeps = {
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Delay primitive for budget holds. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Uniform integer in [min, max) for the refresh spacing, for every scope.
   * Tests inject a seeded source here. By default each scope has its own
   * stream keyed by a per-scope seed (`refresh-entropy.ts`: the host CSPRNG,
   * with optional extra entropy from the hardware root mixed in). It is only
   * ever called with the internal interval bounds; nothing the agent controls
   * reaches it.
   */
  randomInt?: (min: number, max: number) => number;
  /** Developer/test override of the internal refresh tuning. */
  refresh?: Partial<RefreshTuning>;
  /** Developer/test override of a scope's seed derivation (see `refresh-entropy.ts`). */
  scopeSeed?: (scope: string) => Promise<Uint8Array>;
  /**
   * Request client padding goes through. Defaults to the client the padded
   * tool published (`getToolRequestClient(PADDING_TOOL)`), looked up per window.
   */
  paddingClient?: () => ToolRequestClient | null;
  /** How long a lockstep window waits for a released real GET to reach its slot. */
  issuedTimeoutMs?: number;
  audit?: (scope: string, finding: Finding) => void;
};

export type ActionBatcher = {
  readonly options: ActionBatcherOptions;
  submit(submission: ActionSubmission): Promise<ActionRelease>;
  /**
   * Record a released action's result: answers its repeats. `bytes` sizes
   * the record. `refresh` re-issues the identical request through the tool's
   * own path and returns the new outcome (null: skipped); with it the record
   * is refreshed on the batcher's fixed schedule.
   */
  complete(id: string, response: unknown, bytes?: number, refresh?: RefreshFn): void;
  /** Record that a released action failed: its repeats get the same failure until a refresh. */
  fail(id: string, error?: unknown, bytes?: number, refresh?: RefreshFn): void;
  /** The scope (agent run) ended: drop its records and stop its refreshes. */
  endScope(scope: string): void;
  /** Run one refresh tick now (the batcher's own timer calls this on its grid). */
  refreshTick(): Promise<void>;
  /** A released action never executed (blocked downstream): forget it as if never sent. */
  abandon(id: string): void;
  /** Close the open window(s) now. */
  flush(scope?: string): void;
  /** Actions buffered in open windows. */
  pending(scope?: string): number;
  /** Close every window and drop all state. */
  dispose(): void;
  /**
   * Kept for API compatibility; always null. A dummy that fails in flight
   * fails as a real request would, so it no longer latches padding closed.
   */
  paddingFault(): string | null;
};

/** Tool whose request client carries padding (its calls are plain GETs). */
export const PADDING_TOOL = "web_fetch";

type Entry = {
  sub: ActionSubmission;
  key: string;
  idem: ActionIdempotency;
  dependent: boolean;
  resolve: (release: ActionRelease) => void;
};

type Window = { entries: Entry[]; timer: unknown };

type Leader = {
  scope: string;
  key: string;
  idem: ActionIdempotency;
  settle: (r: RecordedOutcome | undefined) => void;
};

type DoneRec = {
  state: "done";
  ok: boolean;
  response: unknown;
  bytes: number;
  origin: string | null;
  refresh?: RefreshFn;
  refreshing?: boolean;
};

type Rec =
  | { state: "pending"; leaderId: string; origin: string | null }
  | DoneRec
  | { state: "evicted"; origin: string | null };

type ScopeState = {
  recs: Map<string, Rec>;
  bytes: number;
  /** When the scope's first record was made: bounds how long it is refreshed. */
  startedAt: number;
  /** Last key refreshed, for the canonical round-robin. */
  cursor: string | null;
  /** This scope's next refresh round, when one is scheduled. */
  timer: unknown;
  scheduled: boolean;
  /** This scope's own spacing stream, once seeded. */
  rng?: (min: number, max: number) => number;
};

type Gate = {
  id: string;
  key: string;
  scope: string;
  state: "waiting" | "arrived" | "absent" | "opened" | "expired";
  arrived: Promise<boolean>;
  markArrived: (arrived: boolean) => void;
  opened: Promise<void>;
  open: () => void;
  expire: () => void;
};

const MAX_WINDOW_ENTRIES = 256;
const MAX_LEADERS = 4096;
/** Live scopes with repeat state; the least recently used beyond this is retired. */
const MAX_SCOPES = 1024;
/** Retired scope ids remembered (they refuse cacheable actions). */
const MAX_RETIRED_SCOPES = 65_536;
/** Distinct cacheable requests tracked per scope; beyond this new ones are refused. */
const MAX_KEYS_PER_SCOPE = 65_536;
/** Recorded outcome bytes kept per scope; older records beyond it are dropped (key kept). */
const MAX_SCOPE_BYTES = 64 * 1024 * 1024;
/** Recorded outcome bytes kept per process. */
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/** Longest a padded window holds for the capacity ledger before refusing. */
const MAX_BUDGET_HOLD_MS = 10_000;
/**
 * A scope is refreshed for at most this long after its first record (its run
 * normally ends, and is dropped, far sooner); a bound on background load if
 * a run's end is never reported.
 */
const MAX_REFRESH_LIFETIME_MS = 24 * 3_600_000;
const MAX_EXPIRED_GATES = 1024;

/** log2 of the binomial coefficient C(n, k). */
function log2Binomial(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }
  let bits = 0;
  for (let i = 1; i <= k; i++) {
    bits += Math.log2(n - k + i) - Math.log2(i);
  }
  return bits;
}

/**
 * Upper bound on the identity information of one request outside the padding
 * set: 9 bits per byte of its wire form (a prefix-free code for any byte
 * string) plus one continuation bit.
 */
export function outsideSetBits(action: EgressAction): number {
  if (action.type !== "http") {
    return 0;
  }
  const wire = `${action.method.trim().toUpperCase()} ${wireRequestUrl(action.url)}`;
  const body = action.body ?? "";
  const bytes = Buffer.byteLength(wire) + Buffer.byteLength(body);
  return 9 * bytes + 1;
}

/** Approximate retained size of a recorded outcome, in bytes. */
function estimateBytes(value: unknown): number {
  let total = 0;
  let nodes = 0;
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): void => {
    if (nodes++ > 200_000 || depth > 32) {
      return;
    }
    if (typeof v === "string") {
      total += v.length * 2;
    } else if (typeof v === "number" || typeof v === "boolean") {
      total += 8;
    } else if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
      total += v.byteLength;
    } else if (v && typeof v === "object") {
      if (seen.has(v)) {
        return;
      }
      seen.add(v);
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        total += k.length * 2;
        walk(child, depth + 1);
      }
    }
  };
  walk(value, 0);
  return total + 64;
}

const URL_IN_TEXT = /https?:\/\/[^\s"'<>`\\]+/gi;
const MAX_NAMED_ORIGINS = 64;

function stringLeaves(value: unknown, out: string[], depth = 0): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (value && typeof value === "object" && depth < 16) {
    for (const v of Array.isArray(value) ? value : Object.values(value)) {
      stringLeaves(v, out, depth + 1);
    }
  }
  return out;
}

/**
 * Origins whose recorded reads an action may change, so must re-open:
 *   - an HTTP request with an unsafe method: its own origin;
 *   - a side-effecting action whose target the batcher cannot see (a send,
 *     or a tool that is not read-only, such as a browser or a network shell
 *     command): every HTTP origin its parameters name;
 *   - a read, or a local file write: none (it cannot change a remote origin).
 */
function writtenOrigins(action: EgressAction, idem: ActionIdempotency): string[] {
  if (action.type === "http") {
    const origin = isSafeHttpMethod(action.method) ? null : httpOrigin(action.url);
    return origin ? [origin] : [];
  }
  if (action.type === "file-write" || idem === "cacheable") {
    return [];
  }
  const texts =
    action.type === "send" ? [action.target, action.content] : stringLeaves(action.params, []);
  const origins = new Set<string>();
  for (const text of texts) {
    for (const match of text.slice(0, 65_536).match(URL_IN_TEXT) ?? []) {
      const origin = httpOrigin(match);
      if (origin) {
        origins.add(origin);
      }
      if (origins.size >= MAX_NAMED_ORIGINS) {
        return [...origins];
      }
    }
  }
  return [...origins];
}

/** Resource a side-effecting action touches, for window-only conflicts (M4). */
function resourceOf(action: EgressAction): string | null {
  if (action.type === "http") {
    return `http ${wireRequestUrl(action.url)}`;
  }
  if (action.type === "file-write") {
    return `file ${action.path}`;
  }
  return null;
}

export function createActionBatcher(
  options: ActionBatcherOptions = DEFAULT_ACTION_BATCHER_OPTIONS,
  deps: ActionBatcherDeps = {},
): ActionBatcher {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const sleep =
    deps.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ms);
        t.unref?.();
      }));
  const paddingClient = deps.paddingClient ?? (() => getToolRequestClient(PADDING_TOOL));
  const issuedTimeoutMs = Math.max(0, deps.issuedTimeoutMs ?? 5_000);
  const audit = deps.audit ?? (() => {});
  const tuning: RefreshTuning = { ...REFRESH_DEFAULTS, ...deps.refresh };
  const scopeSeed = deps.scopeSeed ?? ((scope: string) => deriveScopeSeed(scope));
  const windowMs = Math.max(1, options.windowMs);
  const crossWindow = options.collapseIdempotentRepeats && options.cacheTtlMs > 0;
  const padding = options.padding.enabled
    ? options.padding.allowedSet
        .filter((a) => a.type === "http" && isSafeHttpMethod(a.method))
        .map((action) => ({ action, key: actionKey(action) }))
    : [];
  const paddingKeys = new Set(padding.map((p) => p.key));

  const windows = new Map<string, Window>();
  const leaders = new Map<string, Leader>();
  const leaderResponses = new Map<string, Promise<RecordedOutcome | undefined>>();
  // Repeat state per scope, least recently used first.
  const scopes = new Map<string, ScopeState>();
  const retired = new Set<string>();
  let totalBytes = 0;
  // Released side-effecting actions, so their completion re-opens the reads
  // of the origins they may have changed.
  const writes = new Map<string, { scope: string; origins: string[] }>();
  // Lockstep issue slots.
  const gatesById = new Map<string, Gate>();
  const gatesByKey = new Map<string, Gate[]>();
  const expiredGates = new Map<string, Gate>();
  // Late real GETs held for their key's slot in the scope's next window.
  const held = new Map<string, Array<{ key: string; open: () => void }>>();
  let disposed = false;
  // Audit mode: last release time per scope|key, to report collapsible repeats.
  const auditSeen = new Map<string, number>();

  const finding = (
    scope: string,
    code: string,
    message: string,
    severity: Finding["severity"] = "info",
    extra: Partial<Finding> = {},
  ) => audit(scope, { stageId: ACTION_BATCHER_STAGE_ID, severity, code, message, ...extra });

  // --- repeat records -----------------------------------------------------

  const scopeState = (scope: string, create: boolean): ScopeState | null => {
    const existing = scopes.get(scope);
    if (existing) {
      scopes.delete(scope);
      scopes.set(scope, existing);
      return existing;
    }
    if (!create || retired.has(scope)) {
      return null;
    }
    const st: ScopeState = {
      recs: new Map(),
      bytes: 0,
      startedAt: now(),
      cursor: null,
      timer: null,
      scheduled: false,
    };
    scopes.set(scope, st);
    while (scopes.size > MAX_SCOPES) {
      const oldest = scopes.keys().next().value;
      if (oldest === undefined || oldest === scope) {
        break;
      }
      const gone = scopes.get(oldest);
      totalBytes -= gone?.bytes ?? 0;
      stopRefresh(gone);
      scopes.delete(oldest);
      retired.add(oldest);
      if (retired.size > MAX_RETIRED_SCOPES) {
        const first = retired.values().next().value;
        if (first !== undefined) {
          retired.delete(first);
        }
      }
    }
    return st;
  };

  const dropRecord = (st: ScopeState, key: string, rec: Rec): void => {
    if (rec.state === "done") {
      st.bytes -= rec.bytes;
      totalBytes -= rec.bytes;
    }
    st.recs.set(key, { state: "evicted", origin: rec.origin });
  };

  /** Drop the oldest finished record in `st`; false when there is none. */
  const evictOldest = (st: ScopeState): boolean => {
    for (const [key, rec] of st.recs) {
      if (rec.state === "done") {
        dropRecord(st, key, rec);
        return true;
      }
    }
    return false;
  };

  const enforceBudgets = (st: ScopeState): void => {
    while (st.bytes > MAX_SCOPE_BYTES && evictOldest(st)) {
      // keep dropping
    }
    // evictOldest lowers totalBytes; stop when under budget or nothing is left.
    const overBudget = (): boolean => totalBytes > MAX_TOTAL_BYTES;
    while (overBudget()) {
      let dropped = false;
      for (const other of scopes.values()) {
        if (evictOldest(other)) {
          dropped = true;
          break;
        }
      }
      if (!dropped) {
        break;
      }
    }
  };

  const recordOutcome = (
    leaderId: string,
    leader: Leader,
    outcome: RecordedOutcome,
    bytes: number,
    refresh: RefreshFn | undefined,
  ) => {
    const st = scopes.get(leader.scope);
    const rec = st?.recs.get(leader.key);
    if (!st || !rec || rec.state !== "pending" || rec.leaderId !== leaderId) {
      // Invalidated by a write while in flight, or the scope was retired.
      return;
    }
    const size = Math.max(0, Math.round(bytes));
    st.recs.delete(leader.key);
    st.recs.set(leader.key, {
      state: "done",
      ok: outcome.ok,
      response: outcome.response,
      bytes: size,
      origin: rec.origin,
      ...(refresh ? { refresh } : {}),
    });
    st.bytes += size;
    totalBytes += size;
    if (refresh) {
      scheduleRefresh(leader.scope, st);
    }
    enforceBudgets(st);
  };

  /** Re-open every request to `origin` in `scope` (a write may have changed it). */
  const invalidateOrigin = (scope: string, origin: string): void => {
    const st = scopes.get(scope);
    if (!st) {
      return;
    }
    // Deleting the current entry while iterating a Map is safe.
    for (const [key, rec] of st.recs) {
      if (rec.origin === origin) {
        if (rec.state === "done") {
          st.bytes -= rec.bytes;
          totalBytes -= rec.bytes;
        }
        st.recs.delete(key);
      }
    }
  };

  const trackLeader = (entry: Entry, scope: string): void => {
    let settle: (r: RecordedOutcome | undefined) => void = () => {};
    const response = new Promise<RecordedOutcome | undefined>((resolve) => {
      settle = resolve;
    });
    leaders.set(entry.sub.id, { scope, key: entry.key, idem: entry.idem, settle });
    leaderResponses.set(entry.sub.id, response);
    if (crossWindow && entry.idem === "cacheable") {
      const st = scopeState(scope, true);
      st?.recs.delete(entry.key);
      st?.recs.set(entry.key, {
        state: "pending",
        leaderId: entry.sub.id,
        origin: entry.sub.action.type === "http" ? httpOrigin(entry.sub.action.url) : null,
      });
    }
    if (leaders.size > MAX_LEADERS) {
      // Fail closed: an evicted in-flight leader's repeats are refused, not re-sent.
      const oldest = leaders.keys().next().value;
      if (oldest !== undefined) {
        const gone = leaders.get(oldest);
        leaders.delete(oldest);
        leaderResponses.delete(oldest);
        gone?.settle(undefined);
        const st = gone ? scopes.get(gone.scope) : undefined;
        const rec = gone ? st?.recs.get(gone.key) : undefined;
        if (st && gone && rec?.state === "pending" && rec.leaderId === oldest) {
          dropRecord(st, gone.key, rec);
        }
      }
    }
  };

  /** A tracked leader will never execute: forget it as if it had never been sent. */
  const abandonLeader = (id: string): void => {
    const leader = leaders.get(id);
    if (!leader) {
      return;
    }
    leaders.delete(id);
    leaderResponses.delete(id);
    const rec = scopes.get(leader.scope)?.recs.get(leader.key);
    if (rec?.state === "pending" && rec.leaderId === id) {
      scopes.get(leader.scope)?.recs.delete(leader.key);
    }
    leader.settle(undefined);
  };

  const settleWrite = (id: string): void => {
    const write = writes.get(id);
    if (write) {
      writes.delete(id);
      for (const origin of write.origins) {
        invalidateOrigin(write.scope, origin);
      }
    }
  };

  // --- agent-independent refresh -------------------------------------------
  //
  // Every recorded side-effect-free outcome with a refresh function is
  // re-issued by the batcher itself, per scope, in rounds. A round's start is
  // drawn from the scope's own random stream, uniformly in
  // [base·(1−r), base·(1+r)] after the previous one (the first after the
  // scope's first record). The draw takes only the internal bounds: no tool
  // parameter, URL, content or agent timing ever reaches it, and each scope
  // has its own sequence of draws. A round refreshes up to K live records,
  // round-robin in canonical key order, and under padding also sends every
  // other member of the padded set as a dummy, so a round always shows the
  // full set. Within a round the order is canonical, one request per turn;
  // jitter moves whole rounds only. After the first release the trace depends
  // on the agent only through new first releases, invalidating writes, and
  // the end of its run. Staleness of an answer: at most ceil(n/K) rounds of
  // at most base·(1+r) each (r ≤ 0.5, so 1.5·base when n ≤ K), plus the time
  // the refresh takes.

  const nextRoundDelay = (st: ScopeState): number => {
    const base = tuning.intervalMs;
    const r = tuning.jitter;
    const lo = Math.max(1, Math.round(base * (1 - r)));
    const hi = Math.max(lo, Math.round(base * (1 + r)));
    const draw = deps.randomInt ?? st.rng!;
    return draw(lo, hi + 1);
  };

  function stopRefresh(st: ScopeState | undefined): void {
    if (st?.scheduled) {
      clearTimer(st.timer);
      st.timer = null;
      st.scheduled = false;
    }
  }

  const hasLive = (st: ScopeState): boolean => {
    for (const rec of st.recs.values()) {
      if (rec.state === "done" && rec.refresh) {
        return true;
      }
    }
    return false;
  };

  function scheduleRefresh(scope: string, st: ScopeState): void {
    if (st.scheduled || disposed) {
      return;
    }
    st.scheduled = true;
    if (!deps.randomInt && !st.rng) {
      // Seed this scope's own stream first (bounded wait; never fails).
      void scopeSeed(scope)
        .catch(() => randomBytes(32))
        .then((seed) => {
          st.rng = createSeededRandomInt(seed);
          st.scheduled = false;
          if (scopes.get(scope) === st) {
            scheduleRefresh(scope, st);
          }
        });
      return;
    }
    const handle = setTimer(() => {
      st.timer = null;
      st.scheduled = false;
      if (scopes.get(scope) !== st) {
        return;
      }
      void refreshScope(scope, st).finally(() => {
        if (
          scopes.get(scope) === st &&
          hasLive(st) &&
          now() - st.startedAt < MAX_REFRESH_LIFETIME_MS
        ) {
          scheduleRefresh(scope, st);
        }
      });
    }, nextRoundDelay(st));
    (handle as { unref?: () => void } | null)?.unref?.();
    st.timer = handle;
  }

  /** Replace a record with a refreshed outcome, if it is still the one refreshed. */
  const applyRefresh = (st: ScopeState, key: string, rec: DoneRec, out: RecordedOutcome): void => {
    if (st.recs.get(key) !== rec) {
      return;
    }
    const size = estimateBytes(out.response);
    st.recs.delete(key);
    st.recs.set(key, {
      ...rec,
      ok: out.ok,
      response: out.response,
      bytes: size,
      refreshing: false,
    });
    st.bytes += size - rec.bytes;
    totalBytes += size - rec.bytes;
    enforceBudgets(st);
  };

  /** One refresh round for one scope. */
  async function refreshScope(scope: string, st: ScopeState): Promise<void> {
    if (now() - st.startedAt > MAX_REFRESH_LIFETIME_MS) {
      return;
    }
    const live = [...st.recs]
      .filter(([, rec]) => rec.state === "done" && rec.refresh)
      .map(([key]) => key)
      .toSorted();
    if (live.length === 0) {
      return;
    }
    const client = padding.length > 0 ? paddingClient() : null;
    if (padding.length > 0 && !client) {
      finding(scope, "refresh-undeliverable", "no request client: padded refresh skipped", "high");
      return;
    }
    // Canonical round-robin: the next K live keys after the last one refreshed.
    const k = Math.min(tuning.perInterval, live.length);
    const startAt = st.cursor === null ? 0 : live.findIndex((key) => key > st.cursor!);
    const first = startAt < 0 ? 0 : startAt;
    const picked = Array.from({ length: k }, (_, i) => live[(first + i) % live.length]);
    st.cursor = picked[picked.length - 1] ?? null;
    const pickedSet = new Set(picked);
    type Job = { key: string; run: () => void };
    const jobs: Job[] = picked.map((key) => ({
      key,
      run: () => {
        const rec = st.recs.get(key);
        if (rec?.state !== "done" || !rec.refresh || rec.refreshing) {
          return;
        }
        rec.refreshing = true;
        rec
          .refresh()
          .then((out) => {
            rec.refreshing = false;
            if (out) {
              applyRefresh(st, key, rec, out);
            }
          })
          .catch(() => {
            rec.refreshing = false;
          });
      },
    }));
    if (client) {
      // Under padding a round shows the whole set: members not refreshed
      // here go out as dummies through the same request path.
      for (const p of padding) {
        if (!pickedSet.has(p.key)) {
          const url = (p.action as { url: string }).url;
          jobs.push({ key: p.key, run: () => void client.send(url).catch(() => {}) });
        }
      }
    }
    jobs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    finding(
      scope,
      "refresh-round",
      `refresh round: ${picked.length} refreshed, ${jobs.length - picked.length} padded`,
    );
    for (const job of jobs) {
      job.run();
      await yieldTurn();
    }
  }

  // --- lockstep issue slots -------------------------------------------------

  const createGate = (id: string, key: string, scope: string): Gate => {
    let markArrived: (arrived: boolean) => void = () => {};
    let open: () => void = () => {};
    const arrived = new Promise<boolean>((resolve) => {
      markArrived = resolve;
    });
    const opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    const gate: Gate = {
      id,
      key,
      scope,
      state: "waiting",
      arrived,
      markArrived: (value) => {
        if (gate.state === "waiting") {
          gate.state = value ? "arrived" : "absent";
        }
        markArrived(value);
      },
      opened,
      open: () => {
        gate.state = "opened";
        open();
      },
      expire: () => {
        gate.state = "expired";
        markArrived(false);
      },
    };
    gatesById.set(id, gate);
    const list = gatesByKey.get(key) ?? [];
    list.push(gate);
    gatesByKey.set(key, list);
    return gate;
  };

  const dropGate = (gate: Gate): void => {
    if (gatesById.get(gate.id) === gate) {
      gatesById.delete(gate.id);
    }
    const list = gatesByKey.get(gate.key);
    const index = list?.indexOf(gate) ?? -1;
    if (list && index >= 0) {
      list.splice(index, 1);
      if (list.length === 0) {
        gatesByKey.delete(gate.key);
      }
    }
    if (gate.state === "expired") {
      expiredGates.set(gate.id, gate);
      if (expiredGates.size > MAX_EXPIRED_GATES) {
        const oldest = expiredGates.keys().next().value;
        if (oldest !== undefined) {
          expiredGates.delete(oldest);
        }
      }
    }
  };

  const unsubscribeIssued = onToolRequestIssued((_tool, url, callId) => {
    const key = actionKey({ type: "http", method: "GET", url });
    let gate = callId !== undefined ? gatesById.get(callId) : undefined;
    if (gate && gate.key !== key) {
      gate = undefined;
    }
    gate ??= gatesByKey.get(key)?.find((g) => g.state === "waiting");
    if (!gate || gate.state === "expired") {
      const late = gate ?? (callId !== undefined ? expiredGates.get(callId) : undefined);
      return late && late.key === key ? holdForNextWindow(late) : undefined;
    }
    if (gate.state !== "waiting") {
      return undefined;
    }
    gate.markArrived(true);
    return gate.opened;
  });

  /**
   * A real GET that reached its slot after the slot expired. Never an error
   * for the honest call: without padding it leaves now; under padding (where
   * a substitute already filled its old slot) it is held for its key's slot
   * in the scope's next window, which it fills instead of that key's dummy,
   * so every padded window still shows each member exactly once.
   */
  const holdForNextWindow = (gate: Gate): Promise<void> | undefined => {
    if (padding.length === 0) {
      return undefined;
    }
    expiredGates.delete(gate.id);
    return new Promise<void>((resolve) => {
      const list = held.get(gate.scope) ?? [];
      list.push({ key: gate.key, open: resolve });
      held.set(gate.scope, list);
      if (!windows.has(gate.scope)) {
        openWindow(gate.scope);
      }
    });
  };

  /** Resolves true when the gate's tool reached its slot, false if it never will. */
  const awaitArrival = (gate: Gate): Promise<boolean> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), issuedTimeoutMs);
      timer.unref?.();
      void gate.arrived.then((value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });

  const yieldTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  // --- windows ---------------------------------------------------------------

  function flushScope(scope: string): void {
    const win = windows.get(scope);
    if (!win) {
      return;
    }
    windows.delete(scope);
    clearTimer(win.timer);
    const entries = win.entries;
    const collapse = options.collapseIdempotentRepeats;

    // M4: a resource touched by two different side-effecting actions in this
    // window does not commute, so window-only repeats on it do not collapse.
    const writesByResource = new Map<string, Set<string>>();
    for (const entry of entries) {
      if (entry.idem === "cacheable") {
        continue;
      }
      const resource = resourceOf(entry.sub.action);
      if (resource) {
        const keys = writesByResource.get(resource) ?? new Set<string>();
        keys.add(entry.key);
        writesByResource.set(resource, keys);
      }
    }
    const conflicted = (entry: Entry): boolean => {
      const resource = resourceOf(entry.sub.action);
      return resource !== null && (writesByResource.get(resource)?.size ?? 0) > 1;
    };

    type Item =
      | { kind: "real"; entry: Entry }
      | { kind: "pad"; action: EgressAction; key: string }
      | { kind: "held"; key: string; open: () => void };
    const heldHere = held.get(scope) ?? [];
    held.delete(scope);
    // Every non-barrier action of the window is concurrent with every other
    // one, data-flow dependents included (see header): one sortable block.
    const independent: Entry[] = [];
    const barriers: Entry[] = [];
    const windowLeaders = new Map<string, Entry>();
    const followers: Array<{ entry: Entry; leader: Entry }> = [];
    for (const entry of entries) {
      if (entry.dependent) {
        barriers.push(entry);
        continue;
      }
      const collapsible =
        collapse &&
        (entry.idem === "cacheable" || (entry.idem === "window-only" && !conflicted(entry)));
      if (collapsible) {
        const leader = windowLeaders.get(entry.key);
        if (leader) {
          followers.push({ entry, leader });
          continue;
        }
        windowLeaders.set(entry.key, entry);
      }
      independent.push(entry);
    }

    // Leaders are tracked now, before anything is released, so a repeat that
    // arrives in a later window while this one is still dispatching collapses
    // onto it instead of leaving again.
    for (const entry of [...independent, ...barriers]) {
      if (entry.idem !== "never") {
        trackLeader(entry, scope);
      }
    }
    for (const { entry, leader } of followers) {
      entry.resolve({
        outcome: "collapsed",
        key: entry.key,
        leaderId: leader.sub.id,
        response: leaderResponses.get(leader.sub.id) ?? Promise.resolve(undefined),
      });
    }

    const blocked = new Map<Entry, string>();
    const block = (entry: Entry, reason: string): void => {
      blocked.set(entry, reason);
    };

    // Charge the barriers before anything is released (M12): which d of the
    // m actions are barriers, log2 C(m, d), plus their order, log2 d!. In
    // enforce mode a barrier the ledger cannot pay for is blocked.
    const designationBits = log2Binomial(entries.length, barriers.length);
    barriers.forEach((entry, i) => {
      const bits = Math.log2(i + 1) + (i === 0 ? designationBits : 0);
      const ledger = entry.sub.ledger;
      if (
        bits > 0 &&
        ledger &&
        (entry.sub.mode ?? "enforce") === "enforce" &&
        !ledger.tryConsume(bits)
      ) {
        block(entry, "capacity ledger exhausted");
        finding(scope, "dependent-over-budget", "capacity ledger exhausted", "high", {
          estimatedBits: bits,
        });
        return;
      }
      ledger?.observe(bits);
      finding(scope, "ordering-barrier", "ordering dependency released after the window", "info", {
        estimatedBits: bits,
      });
    });

    const padded = padding.length > 0;
    const gatedUrl = (entry: Entry): string | null => outboundGetUrl(entry.sub.action);

    const buildPlan = (): Item[] => {
      const ordered: Array<{ item: Item; index: number }> = [
        ...independent.map((entry): Item => ({ kind: "real", entry })),
        ...heldHere.map((h): Item => ({ kind: "held", key: h.key, open: h.open })),
      ].map((item, index) => ({ item, index }));
      if (padded) {
        // Complete the observed set: every member of P that no released real
        // action of this window sends goes out as a dummy.
        const present = new Set([
          ...[...independent, ...barriers].filter((e) => !blocked.has(e)).map((e) => e.key),
          ...heldHere.map((h) => h.key),
        ]);
        for (const p of padding) {
          if (!present.has(p.key)) {
            ordered.push({
              item: { kind: "pad", action: p.action, key: p.key },
              index: ordered.length,
            });
          }
        }
      }
      if (options.canonicalOrder || padded) {
        // Deterministic total order: wire hash, then arrival (identical
        // hashes are externally indistinguishable, so the tie-break leaks
        // nothing).
        const itemKey = (item: Item) => (item.kind === "real" ? item.entry.key : item.key);
        ordered.sort((a, b) => {
          const ka = itemKey(a.item);
          const kb = itemKey(b.item);
          return ka < kb ? -1 : ka > kb ? 1 : a.index - b.index;
        });
      }
      // Barriers follow the whole block, in arrival order.
      return [
        ...ordered.map((x) => x.item),
        ...barriers.map((entry): Item => ({ kind: "real", entry })),
      ];
    };

    const releaseEntry = (entry: Entry, position: number, windowSize: number): void => {
      const reason = blocked.get(entry);
      if (reason !== undefined) {
        if (entry.idem !== "never") {
          abandonLeader(entry.sub.id);
        }
        entry.resolve({ outcome: "blocked", key: entry.key, reason });
        return;
      }
      const origins = writtenOrigins(entry.sub.action, entry.idem);
      if (origins.length > 0) {
        writes.set(entry.sub.id, { scope, origins });
        if (writes.size > MAX_LEADERS) {
          const oldest = writes.keys().next().value;
          if (oldest !== undefined) {
            settleWrite(oldest);
          }
        }
      }
      entry.resolve({
        outcome: "execute",
        key: entry.key,
        position,
        windowSize,
        tracked: entry.idem !== "never",
      });
    };

    const summary = (plan: Item[]) => {
      const realCount = plan.filter((p) => p.kind === "real" && !blocked.has(p.entry)).length;
      const padCount = plan.filter((p) => p.kind === "pad").length;
      finding(
        scope,
        "action-window",
        `window of ${entries.length}: ${realCount} released, ${followers.length} collapsed, ${padCount} padded`,
        "info",
        {
          detail: {
            actions: entries.length,
            released: realCount,
            collapsed: followers.length,
            padded: padCount,
          },
        },
      );
    };

    const gatedCount = independent.filter((e) => gatedUrl(e) !== null).length;
    if (!padded && gatedCount < 2) {
      const plan = buildPlan();
      plan.forEach((item, position) => {
        if (item.kind === "real") {
          releaseEntry(item.entry, position, plan.length);
        }
      });
      summary(plan);
      return;
    }

    // Lockstep window (padded, or several real GETs): fail closed, charge,
    // then dispatch real and dummy requests in one canonical sequence.
    void (async () => {
      const client = padded ? paddingClient() : null;
      if (padded && !client) {
        const reason = `no request client for ${PADDING_TOOL}: padding cannot be delivered`;
        finding(scope, "padding-undeliverable", reason, "high");
        for (const entry of [...independent, ...barriers]) {
          block(entry, reason);
          releaseEntry(entry, 0, 0);
        }
        return;
      }

      if (padded) {
        // C4: an HTTP request outside P leaks its identity. Charge it before
        // release; hold for the ledger, then refuse.
        const outside = independent
          .filter((e) => e.sub.action.type === "http" && !paddingKeys.has(e.key))
          .toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        const deadline = now() + MAX_BUDGET_HOLD_MS;
        let refusing = false;
        for (const entry of outside) {
          const bits = outsideSetBits(entry.sub.action);
          const ledger = entry.sub.ledger;
          if (!refusing && ledger) {
            let paid = ledger.tryConsume(bits);
            for (let i = 0; !paid && now() < deadline && i < 1_000; i++) {
              await sleep(windowMs);
              paid = ledger.tryConsume(bits);
            }
            if (paid) {
              finding(
                scope,
                "padding-outside-set",
                "a request outside the padding set leaks its identity; charged to the capacity ledger",
                "low",
                { estimatedBits: bits },
              );
              continue;
            }
          }
          refusing = true;
          block(entry, "request outside the padding set exceeds the capacity budget");
          finding(
            scope,
            "padding-outside-set-over-budget",
            ledger
              ? "a request outside the padding set could not be paid for by the capacity ledger; refused"
              : "a request outside the padding set has no capacity ledger to charge; refused",
            "high",
            { estimatedBits: bits },
          );
        }
      }

      const plan = buildPlan();
      const gates = new Map<Entry, Gate>();
      for (const [position, item] of plan.entries()) {
        if (item.kind === "real" && !blocked.has(item.entry) && gatedUrl(item.entry) !== null) {
          const gate = createGate(item.entry.sub.id, item.entry.key, scope);
          gates.set(item.entry, gate);
          releaseEntry(item.entry, position, plan.length);
        }
      }
      // Wait until every released GET is held at its slot (or will never be).
      const arrivals = new Map<Entry, boolean>();
      await Promise.all(
        [...gates].map(async ([entry, gate]) => {
          arrivals.set(entry, await awaitArrival(gate));
        }),
      );

      const sendPad = (url: string, code: string) => {
        client!.send(url).catch((err: unknown) => {
          // Refused before leaving, as a real request of this URL would be.
          finding(
            scope,
            code,
            `a padding request was not sent (${err instanceof Error ? err.message : String(err)})`,
            "low",
          );
        });
      };

      for (const [position, item] of plan.entries()) {
        if (item.kind === "pad") {
          sendPad((item.action as { url: string }).url, "padding-not-sent");
        } else if (item.kind === "held") {
          item.open();
        } else {
          const gate = gates.get(item.entry);
          if (!gate) {
            releaseEntry(item.entry, position, plan.length);
          } else if (arrivals.get(item.entry)) {
            gate.open();
          } else {
            const absent = gate.state === "absent";
            gate.expire();
            const url = gatedUrl(item.entry);
            if (padded && url !== null) {
              // The tool never reached its slot (answered locally, or failed
              // before sending): send it here so the observed set is complete.
              finding(
                scope,
                "padding-substitute",
                absent
                  ? "a released GET settled without being sent; sent it as padding"
                  : "a released GET did not reach its slot in time; sent it as padding",
              );
              sendPad(url, "padding-substitute-not-sent");
            }
          }
        }
        await yieldTurn();
      }
      for (const gate of gates.values()) {
        dropGate(gate);
      }
      summary(plan);
    })();
  }

  function openWindow(scope: string): Window {
    const t = now();
    // With padding the windows sit on a fixed grid, so release times carry
    // no information about when the first action arrived.
    const closesAt = padding.length > 0 ? (Math.floor(t / windowMs) + 1) * windowMs : t + windowMs;
    const win: Window = { entries: [], timer: null };
    win.timer = setTimer(() => flushScope(scope), Math.max(0, closesAt - t));
    windows.set(scope, win);
    return win;
  }

  const submit = (sub: ActionSubmission): Promise<ActionRelease> => {
    const scope = sub.scope ?? "default";
    const mode = sub.mode ?? "enforce";
    const key = actionKey(sub.action);
    const idem = classifyActionIdempotency(sub.action);
    const dependent = (sub.dependsOn?.length ?? 0) > 0;

    if (mode === "off") {
      return Promise.resolve({
        outcome: "execute",
        key,
        position: 0,
        windowSize: 1,
        tracked: false,
      });
    }
    if (mode === "audit") {
      const seenKey = `${scope}|${key}`;
      const last = auditSeen.get(seenKey);
      if (idem !== "never" && last !== undefined) {
        finding(scope, "collapsible-repeat", "idempotent repeat would collapse (audit)", "low", {
          estimatedBits: 1,
        });
      }
      auditSeen.set(seenKey, now());
      if (auditSeen.size > MAX_LEADERS) {
        const oldest = auditSeen.keys().next().value;
        if (oldest !== undefined) {
          auditSeen.delete(oldest);
        }
      }
      return Promise.resolve({
        outcome: "execute",
        key,
        position: 0,
        windowSize: 1,
        tracked: false,
      });
    }

    if (crossWindow && idem === "cacheable") {
      if (retired.has(scope)) {
        finding(scope, "repeat-state-dropped", "scope state was dropped; refused", "high");
        return Promise.resolve({
          outcome: "blocked",
          key,
          reason:
            "repeat state for this run was dropped (too many concurrent runs); refused rather than re-sent",
        });
      }
      const st = scopeState(scope, true);
      const rec = st?.recs.get(key);
      if (rec?.state === "done") {
        finding(scope, "cache-hit", "idempotent repeat answered from the recorded outcome");
        return Promise.resolve({ outcome: "cached", key, ok: rec.ok, response: rec.response });
      }
      if (rec?.state === "pending") {
        finding(
          scope,
          "collapsed-in-flight",
          "idempotent repeat collapsed onto the request in flight",
        );
        return Promise.resolve({
          outcome: "collapsed",
          key,
          leaderId: rec.leaderId,
          response: leaderResponses.get(rec.leaderId) ?? Promise.resolve(undefined),
        });
      }
      if (rec?.state === "evicted") {
        finding(scope, "repeat-state-dropped", "recorded outcome was dropped; refused", "high");
        return Promise.resolve({
          outcome: "blocked",
          key,
          reason:
            "the recorded outcome of this identical earlier request was dropped (memory budget); refused rather than re-sent",
        });
      }
      if (st && st.recs.size >= MAX_KEYS_PER_SCOPE) {
        finding(
          scope,
          "repeat-state-full",
          "repeat tracking for the scope is full; refused",
          "high",
        );
        return Promise.resolve({
          outcome: "blocked",
          key,
          reason: "repeat tracking for this run is full; refused rather than sent untracked",
        });
      }
    }

    // An action that may change what an origin returns re-opens its reads.
    for (const origin of writtenOrigins(sub.action, idem)) {
      invalidateOrigin(scope, origin);
    }

    return new Promise<ActionRelease>((resolve) => {
      const win = windows.get(scope) ?? openWindow(scope);
      win.entries.push({ sub, key, idem, dependent, resolve });
      if (win.entries.length >= MAX_WINDOW_ENTRIES) {
        flushScope(scope);
      }
    });
  };

  const settleLeader = (
    id: string,
    outcome: RecordedOutcome,
    bytes: number | undefined,
    refresh: RefreshFn | undefined,
  ) => {
    const leader = leaders.get(id);
    if (!leader) {
      return;
    }
    leaders.delete(id);
    leaderResponses.delete(id);
    leader.settle(outcome);
    if (leader.idem === "cacheable" && crossWindow) {
      recordOutcome(id, leader, outcome, bytes ?? estimateBytes(outcome.response), refresh);
    }
  };

  const markSettled = (id: string): void => {
    const gate = gatesById.get(id);
    if (gate && gate.state === "waiting") {
      gate.markArrived(false);
    }
  };

  return {
    options,
    submit,
    complete(id, response, bytes, refresh) {
      markSettled(id);
      settleLeader(id, { ok: true, response }, bytes, refresh);
      settleWrite(id);
    },
    fail(id, error, bytes, refresh) {
      markSettled(id);
      settleLeader(id, { ok: false, response: error }, bytes, refresh);
      settleWrite(id);
    },
    endScope(scope) {
      const st = scopes.get(scope);
      if (st) {
        stopRefresh(st);
        totalBytes -= st.bytes;
        scopes.delete(scope);
      }
    },
    async refreshTick() {
      for (const scope of [...scopes.keys()].toSorted()) {
        const st = scopes.get(scope);
        if (st) {
          await refreshScope(scope, st);
        }
      }
    },
    abandon(id) {
      markSettled(id);
      abandonLeader(id);
      writes.delete(id);
    },
    flush(scope) {
      if (scope !== undefined) {
        flushScope(scope);
        return;
      }
      for (const s of windows.keys()) {
        flushScope(s);
      }
    },
    pending(scope) {
      if (scope !== undefined) {
        return windows.get(scope)?.entries.length ?? 0;
      }
      let n = 0;
      for (const w of windows.values()) {
        n += w.entries.length;
      }
      return n;
    },
    dispose() {
      disposed = true;
      for (const s of windows.keys()) {
        flushScope(s);
      }
      for (const st of scopes.values()) {
        stopRefresh(st);
      }
      for (const list of held.values()) {
        for (const h of list) {
          h.open();
        }
      }
      held.clear();
      for (const leader of leaders.values()) {
        leader.settle(undefined);
      }
      leaders.clear();
      leaderResponses.clear();
      scopes.clear();
      retired.clear();
      totalBytes = 0;
      writes.clear();
      auditSeen.clear();
      unsubscribeIssued();
      for (const gate of gatesById.values()) {
        gate.markArrived(false);
        gate.open();
      }
      gatesById.clear();
      gatesByKey.clear();
      expiredGates.clear();
    },
    paddingFault: () => null,
  };
}

// Registry slot: the egress-action-batcher plugin registers its configured
// batcher; the egress-mediator consults it at the tool-call chokepoint.
const BATCHER_KEY = Symbol.for("enclawed.egress-core.action-batcher");

type BatcherSlot = { batcher: ActionBatcher | null };

function batcherSlot(): BatcherSlot {
  const globals = globalThis as unknown as Record<symbol, BatcherSlot | undefined>;
  let slot = globals[BATCHER_KEY];
  if (!slot) {
    slot = { batcher: null };
    globals[BATCHER_KEY] = slot;
  }
  return slot;
}

/** Register the action batcher. Returns an unregister function. */
export function registerActionBatcher(batcher: ActionBatcher): () => void {
  const slot = batcherSlot();
  slot.batcher?.dispose();
  slot.batcher = batcher;
  return () => {
    if (slot.batcher === batcher) {
      batcher.dispose();
      slot.batcher = null;
    }
  };
}

/** The registered action batcher, or null. */
export function getActionBatcher(): ActionBatcher | null {
  return batcherSlot().batcher;
}

/** Test-only: drop the registered batcher. */
export function resetActionBatcher(): void {
  const slot = batcherSlot();
  slot.batcher?.dispose();
  slot.batcher = null;
}
