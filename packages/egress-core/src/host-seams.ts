// Host-injected capability seams.
//
// The egress extensions stay pure: they never import host internals
// (`src/infra/outbound/*`, the model runtime). Instead the host — in the
// open build that is the egress-mediator plugin, which holds the plugin
// runtime — injects real implementations at startup. The egress extensions
// consume only this package.
//
// State is held on a `globalThis` `Symbol.for` slot so a host injection is
// visible to every extension regardless of how the package is bundled.

export type CoverTrafficMessage = {
  to: string;
  content: string;
  channel?: string;
  /**
   * A padding action from the action batcher instead of a channel message:
   * a side-effect-free HTTP request whose response is discarded. Only safe
   * methods are ever emitted.
   */
  action?: { type: "http"; method: string; url: string };
};

/** Host-provided model completion: (fixed system prompt, user text) -> text. */
export type LlmCompleter = (system: string, user: string) => Promise<string>;

type HostSeamState = {
  outboundEmitter: ((msg: CoverTrafficMessage) => Promise<void>) | null;
  llmCompleter: LlmCompleter | null;
};

const SEAM_KEY = Symbol.for("enclawed.egress-core.host-seams");

function getState(): HostSeamState {
  const globals = globalThis as unknown as Record<symbol, HostSeamState | undefined>;
  let state = globals[SEAM_KEY];
  if (!state) {
    state = { outboundEmitter: null, llmCompleter: null };
    globals[SEAM_KEY] = state;
  }
  return state;
}

/**
 * Host injects an outbound emitter so the cover-traffic extension can send
 * dummy messages. Without it, cover traffic runs in schedule-only mode.
 */
export function setOutboundEmitter(emitter: (msg: CoverTrafficMessage) => Promise<void>): void {
  getState().outboundEmitter = emitter;
}

/** Whether a host outbound emitter is available for cover traffic. */
export function hasOutboundEmitter(): boolean {
  return getState().outboundEmitter !== null;
}

/** Emit one cover-traffic message; returns false if no emitter is installed. */
export async function emitOutbound(msg: CoverTrafficMessage): Promise<boolean> {
  const { outboundEmitter } = getState();
  if (!outboundEmitter) {
    return false;
  }
  await outboundEmitter(msg);
  return true;
}

/**
 * Host injects a model-completion function so the LLM-scrambler extension can
 * rephrase outbound text. The extension supplies its own fixed system prompt;
 * the host only supplies the model transport. Without an injected completer
 * the LLM scrambler is inert (pass-through).
 */
export function setLlmCompleter(completer: LlmCompleter): void {
  getState().llmCompleter = completer;
}

/** Whether a host LLM completer is available for the LLM scrambler. */
export function hasLlmCompleter(): boolean {
  return getState().llmCompleter !== null;
}

/**
 * Run a model completion through the host-injected completer. Returns null if
 * no completer is installed. Errors from the completer (including its
 * timeout) propagate to the caller; the LLM-scrambler stage catches them and,
 * in enforce mode, blocks the payload instead of passing it unscrambled.
 */
export async function llmComplete(system: string, user: string): Promise<string | null> {
  const { llmCompleter } = getState();
  if (!llmCompleter) {
    return null;
  }
  return llmCompleter(system, user);
}

/** Test-only: clear injected seams. */
export function resetEgressHostSeams(): void {
  const state = getState();
  state.outboundEmitter = null;
  state.llmCompleter = null;
}
