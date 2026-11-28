// Tool-call replay context, published for the egress action batcher.
//
// The batcher (egress-core, a plugin-side package) answers a repeat of an
// idempotent request without sending it again. Zero false positives means
// that repeat must reach the agent as the result the call would have had,
// not as a refusal. So every tool call runs inside a replay context (see
// `wrapToolWithBeforeToolCallHook`): the mediator's before_tool_call hook
// reads the context of the call it is deciding and sets a directive, and
// the wrapper then either
//   - records the call's outcome (`record`; a wire-replay tool such as
//     web_fetch also records its network exchange), or
//   - reproduces a recorded outcome without executing the tool (`replay`): a
//     wire-replay tool re-runs its own processing on the recorded exchange,
//     so different result-shaping parameters still get the right result;
//     any other tool gets the recorded result, or the recorded error thrown.
// The open core cannot import the plugin package, so the context lives on a
// shared slot. Its key and shape are a contract with
// `packages/egress-core/src/action.ts` and must not change.

import { AsyncLocalStorage } from "node:async_hooks";

const TOOL_REPLAY_KEY = Symbol.for("enclawed.tool-replay");

/** Marks a tool that can re-run itself on a recorded wire exchange. */
export const TOOL_WIRE_REPLAY = Symbol.for("enclawed.tool-replay.wire");

/**
 * A tool's own declaration of what a call produces outside it: a function
 * from the call's parameters to its observation (`ToolObservation`), or null
 * when it cannot be determined. Set on the tool object by the tool's owner,
 * which knows exactly what the tool sends; the wrapper puts it on each call's
 * replay context as `observe`. It must keep exactly what leaves the tool and
 * drop only what never does.
 */
export const TOOL_OBSERVATION = Symbol.for("enclawed.tool-observation");

export type ToolReplayOutcome =
  | { ok: true; result: unknown; wire?: unknown }
  | { ok: false; error: unknown; wire?: unknown };

export type ToolReplayDirective =
  /** `refresh`: a batcher-scheduled re-issue of a recorded call (no issue slot). */
  { kind: "record"; refresh?: boolean } | { kind: "replay"; outcome: ToolReplayOutcome };

export type ToolReplayCall = {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly runId?: string;
  readonly wireReplay: boolean;
  directive?: ToolReplayDirective;
  executed: boolean;
  outcome?: ToolReplayOutcome;
  /** Set by a wire-replay tool while it records. */
  wire?: unknown;
  /**
   * Set by the wrapper on a recorded call: re-issue the identical call
   * through the tool's own path (same parameters) and return its new
   * outcome, or null when a gate halts it. The batcher's refresh uses it.
   */
  rerun?: () => Promise<ToolReplayOutcome | null>;
  /**
   * The host's declared observation of this call (`tool-observation.ts`):
   * the action it performs outside the tool, from its final parameters, or
   * null when that cannot be determined. The egress action batcher keys the
   * call on it; a batched tool with no declaration is refused, never keyed
   * on its parameters.
   */
  readonly observe?: (params: Record<string, unknown>) => Promise<ToolObservation | null>;
};

/** An observation, in the egress action shape (`@enclawed/egress-core` EgressAction). */
export type ToolObservation =
  | { type: "http"; method: string; url: string; body?: string }
  | { type: "file-write"; path: string; content: string; identity?: string }
  | { type: "send"; target: string; content: string }
  /** The call sends nothing at all (it answers locally or fails before sending). */
  | { type: "none" };

type ToolReplaySlot = { als: AsyncLocalStorage<ToolReplayCall> };

function toolReplaySlot(): ToolReplaySlot {
  const globals = globalThis as unknown as Record<symbol, ToolReplaySlot | undefined>;
  let slot = globals[TOOL_REPLAY_KEY];
  if (!slot) {
    slot = { als: new AsyncLocalStorage<ToolReplayCall>() };
    globals[TOOL_REPLAY_KEY] = slot;
  }
  return slot;
}

/** Run `fn` as one tool call's replay context. */
export function runInToolReplayContext<T>(call: ToolReplayCall, fn: () => Promise<T>): Promise<T> {
  return toolReplaySlot().als.run(call, fn);
}

/** The replay context of the tool call running now, if any. */
export function currentToolReplayCall(): ToolReplayCall | undefined {
  return toolReplaySlot().als.getStore();
}

/**
 * The context of `toolCallId` for a wire-replay tool: what to do with its
 * network exchange. `replay` carries the recorded exchange; `record` asks the
 * tool to store it on the call (`call.wire`).
 */
export function wireReplayFor(
  toolName: string,
  toolCallId: string,
):
  | { mode: "replay"; wire: unknown }
  | { mode: "record"; call: ToolReplayCall; refresh: boolean }
  | undefined {
  const call = currentToolReplayCall();
  if (!call || call.toolCallId !== toolCallId || call.toolName !== toolName || !call.wireReplay) {
    return undefined;
  }
  const directive = call.directive;
  if (directive?.kind === "replay" && directive.outcome.wire !== undefined) {
    return { mode: "replay", wire: directive.outcome.wire };
  }
  if (directive?.kind === "record") {
    return { mode: "record", call, refresh: directive.refresh === true };
  }
  return undefined;
}

/**
 * A recorded outcome the wrapper reproduces itself (no execute), or null when
 * the tool must run (no replay directive, or a wire replay the tool performs).
 */
export function resolveDirectReplay(call: ToolReplayCall): ToolReplayOutcome | null {
  const directive = call.directive;
  if (directive?.kind !== "replay") {
    return null;
  }
  if (call.wireReplay && directive.outcome.wire !== undefined) {
    return null;
  }
  return directive.outcome;
}

/** A copy of a recorded result, so a consumer mutating it cannot alter the record. */
export function cloneReplayResult<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}
