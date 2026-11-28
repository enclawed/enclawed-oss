// The egress reference monitor. Drains the stage registry and runs the
// defense pipeline at every chokepoint the plugin host exposes:
//
//   channel      `message_sending`          outbound channel text (always on)
//   tool-call    `before_tool_call`         outbound arguments of egress tools
//   model-input  tool-result middleware     tool results before the model sees them
//   model-input  `before_dispatch`          inbound channel messages before the model
//   media        `media_sending`            outbound attachments (media scramblers +
//                                           canonical media order; media-chokepoint.ts)
//
// tool-call and model-input are configuration-gated (see `config.ts`).
// Independently, when the egress-action-batcher plugin has registered a
// batcher, tool calls it covers are held per window and released in
// canonical order, and idempotent repeats are answered without re-sending
// (`after_tool_call` feeds it the results). A covered call is keyed on its
// declared observation (`toolCallObservation`), never on its parameters; one
// without a declaration is refused while the stage enforces.
//
// Design notes:
// - Hook sites fail open on a thrown handler, so every handler signals a
//   block by *returning* it (`cancel`, `block`, `handled`), never by throwing.
//   The pipeline itself converts a throwing enforcing stage into a cancel.
// - With zero stages registered every handler is a verified pass-through.
// - Delays (timing shaping) apply to observable egress only: channel sends
//   and tool calls. Model input is internal and is never delayed.
// - A tool call is mediated once, not once per string argument: its string
//   leaves run through the pipeline as one payload (see `mediateArguments`),
//   so the timing delay applies once and the call counts once toward the
//   rate and volume limits.

import {
  createAuditBuffer,
  createLedgerStore,
  currentToolReplayCall,
  getActionBatcher,
  getEgressStages,
  monotonicNow,
  runEgressPipeline,
  STAGE_IDS,
  type AuditBuffer,
  type EgressSink,
  type EgressSinkKind,
  type PipelineResult,
  type RecordedOutcome,
  type RefreshFn,
  type ToolReplayCall,
  type ToolReplayOutcome,
  unmappedToolReason,
} from "@enclawed/egress-core";
import type { AgentToolResultMiddleware } from "@enclawed/plugin-sdk/agent-harness";
import type { EnclawedPluginApi } from "@enclawed/plugin-sdk/plugin-entry";
import {
  createDependencyTracker,
  repeatBlockReason,
  NO_REQUEST,
  toolCallObservation,
  toolResultText,
} from "./action-batching.js";
import {
  effectiveStageMode,
  resolveEgressMediatorConfig,
  type EgressMediatorConfig,
} from "./config.js";
import { installEgressHostSeams } from "./host-wiring.js";
import { registerMediaChokepoint } from "./media-chokepoint.js";
import {
  isNetworkCommand,
  mediateArguments,
  mediateTextBlocks,
  type LeafOutcome,
} from "./payload.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Tools whose requests are chosen at run time, by tool identity: they are
 * released unbatched rather than refused for lacking an observation. Any
 * other tool without one is refused while the stage enforces.
 */
const RUNTIME_REQUEST_TOOLS: ReadonlySet<string> = new Set(["browser", "exec", "bash"]);

/**
 * Channel send tools, by tool identity: when the channel declares no exact
 * observation for a call, the call is released after the window as a charged
 * ordering barrier instead of being refused.
 */
const UNORDERED_SEND_TOOLS: ReadonlySet<string> = new Set(["message"]);

export type EgressMediatorDeps = {
  /** Override the resolved config — used by tests and the benchmark. */
  config?: EgressMediatorConfig;
  /** Override the delay primitive — used by tests. */
  sleep?: (ms: number) => Promise<void>;
};

export type EgressMediator = {
  /** In-memory audit trail of pipeline findings. */
  audit: AuditBuffer;
  /** Effective configuration. */
  config: EgressMediatorConfig;
  /**
   * Run the pipeline over one text payload for an arbitrary sink. This is the
   * same path every hook takes; exposed for apps that own their own
   * chokepoints.
   */
  mediate: (
    content: string,
    sink: EgressSink,
    metadata?: Record<string, unknown>,
    options?: { segmentBoundary?: string },
  ) => Promise<PipelineResult>;
};

type MediatorApi = Pick<EnclawedPluginApi, "on" | "logger"> &
  Partial<
    Pick<
      EnclawedPluginApi,
      | "pluginConfig"
      | "registerAgentToolResultMiddleware"
      | "registrationMode"
      | "runtime"
      | "config"
    >
  >;

/** How long a collapsed repeat waits for the identical call's result. */
const COLLAPSED_WAIT_MS = 120_000;

/** Resolve to the promise's value, or undefined after `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

/**
 * What the batcher records for a released call. `seam`: the host's tool
 * wrapper recorded the real outcome (and the tool its wire exchange), so a
 * repeat is reproduced exactly. `event`: only the after_tool_call event was
 * seen, so a repeat can only be answered as a refusal carrying the result.
 */
type RecordedCall =
  | { via: "seam"; outcome: ToolReplayOutcome }
  | { via: "event"; result?: unknown; error?: string };

const MAX_SEAM_CALLS = 4096;

/** Batching scope of a tool call: its agent run, else its session. */
const actionScope = (ctx: { runId?: string; sessionKey?: string } | undefined): string =>
  ctx?.runId ?? ctx?.sessionKey ?? "default";

const WITHHELD = (reason: string) => `[egress-mediator: content withheld (${reason})]`;

/**
 * Wire the egress reference monitor onto the plugin host.
 */
export function createEgressMediator(
  api: MediatorApi,
  deps: EgressMediatorDeps = {},
): EgressMediator {
  const config = deps.config ?? resolveEgressMediatorConfig(api.pluginConfig);
  const wait = deps.sleep ?? sleep;
  const ledgers = createLedgerStore(config.egress.ledger);
  const audit = createAuditBuffer();

  const mediate = async (
    content: string,
    sink: EgressSink,
    metadata?: Record<string, unknown>,
    options?: { segmentBoundary?: string },
  ): Promise<PipelineResult> => {
    const stages = getEgressStages(sink.kind);
    if (stages.length === 0) {
      return { cancelled: false, content, delayMs: 0, findings: [] };
    }
    return runEgressPipeline(
      content,
      stages,
      {
        sink,
        metadata,
        ledger: ledgers.get(sink.id),
        // Rate windows and send-time quanta measure intervals: monotonic.
        now: monotonicNow,
        segmentBoundary: options?.segmentBoundary,
      },
      {
        modeFor: (stageId) => effectiveStageMode(config, stageId),
        audit: (finding) => audit.sink(sink.id, finding),
      },
    );
  };

  /** Leaf mediator for structured payloads; accumulates the delay. */
  const leafMediator = (sink: EgressSink, delay: { ms: number }) => {
    return async (text: string, segmentBoundary?: string): Promise<LeafOutcome> => {
      const result = await mediate(text, sink, undefined, { segmentBoundary });
      if (result.cancelled) {
        return { cancelled: true, reason: result.reason };
      }
      delay.ms += result.delayMs;
      return { cancelled: false, content: result.content };
    };
  };

  const active = (kind: EgressSinkKind) =>
    config.egress.enabled && getEgressStages(kind).length > 0;

  // --- channel: outbound messages -----------------------------------------
  api.on(
    "message_sending",
    async (event, hookCtx) => {
      if (!active("channel")) {
        return undefined;
      }
      const original = typeof event.content === "string" ? event.content : "";
      const sink: EgressSink = {
        kind: "channel",
        id: hookCtx?.conversationId ?? hookCtx?.channelId ?? event.to ?? "unknown",
        channelId: hookCtx?.channelId,
        accountId: hookCtx?.accountId,
        conversationId: hookCtx?.conversationId,
      };
      const result = await mediate(original, sink, event.metadata);
      if (result.cancelled) {
        api.logger.warn(`egress-mediator: blocked outbound to ${sink.id} (${result.reason})`);
        return { cancel: true };
      }
      if (result.delayMs > 0) {
        await wait(result.delayMs);
      }
      return result.content !== original ? { content: result.content } : undefined;
    },
    { priority: 100 },
  );

  // --- tool-call: outbound tool arguments + action batching -------------
  const tools = new Set(config.toolCall.tools);
  const commandTools = new Set(config.toolCall.commandTools);
  const dependencies = createDependencyTracker();
  let anonymousCalls = 0;
  // Released calls whose outcome the host's tool wrapper records, by call id.
  const seamCalls = new Map<string, ToolReplayCall>();

  type ToolCallOutcome =
    | { block: true; blockReason: string }
    | { block?: false; params?: Record<string, unknown> };

  /** Text pipeline over the outbound arguments of egress tools. */
  const mediateToolArgs = async (
    name: string,
    params: Record<string, unknown>,
  ): Promise<ToolCallOutcome> => {
    if (!config.toolCall.enabled || !active("tool-call")) {
      return {};
    }
    if (!tools.has(name)) {
      const command = params?.command;
      if (!commandTools.has(name) || typeof command !== "string" || !isNetworkCommand(command)) {
        return {};
      }
    }
    const sink: EgressSink = { kind: "tool-call", id: `tool:${name}`, toolName: name };
    // One pipeline run per call: one delay, one rate-limit count.
    const delay = { ms: 0 };
    const walked = await mediateArguments(params, leafMediator(sink, delay));
    if (walked.cancelled) {
      api.logger.warn(`egress-mediator: blocked tool call ${name} (${walked.reason})`);
      return { block: true, blockReason: `egress-mediator: ${walked.reason}` };
    }
    if (delay.ms > 0) {
      await wait(delay.ms);
    }
    return walked.changed ? { params: walked.value as Record<string, unknown> } : {};
  };

  /** Result text for a repeat answered locally, through model-input mediation when on. */
  const repeatText = async (name: string, response: unknown): Promise<string | undefined> => {
    const text = toolResultText(response);
    if (text === undefined || !(config.modelInput.enabled && config.modelInput.toolResults)) {
      return text;
    }
    if (!active("model-input")) {
      return text;
    }
    const out = await mediate(text, {
      kind: "model-input",
      id: `tool-result:${name}`,
      toolName: name,
    });
    return out.cancelled ? WITHHELD(out.reason) : out.content;
  };

  /**
   * Answer a repeat the batcher did not re-send. With the host's replay seam
   * the call reproduces the recorded outcome exactly (same result, or the same
   * error, as the call would have had): nothing is blocked or rewritten.
   * Without it, the repeat is refused with the earlier result as its text.
   */
  const answerRepeat = async (
    name: string,
    how: "collapsed" | "cached",
    recorded: RecordedOutcome | undefined,
    call: ToolReplayCall | undefined,
  ): Promise<ToolCallOutcome | null> => {
    const rec = recorded?.response as RecordedCall | undefined;
    if (!recorded || !rec) {
      return {
        block: true,
        blockReason: `egress-action-batcher: the identical ${name} call this repeat was collapsed into was not executed; not re-sent`,
      };
    }
    if (call && rec.via === "seam") {
      call.directive = { kind: "replay", outcome: rec.outcome };
      return null;
    }
    if (rec.via === "seam") {
      const outcome = rec.outcome;
      const text = outcome.ok
        ? toolResultText(outcome.result)
        : outcome.error instanceof Error
          ? outcome.error.message
          : String(outcome.error);
      return {
        block: true,
        blockReason: repeatBlockReason(name, how, await repeatText(name, text), !outcome.ok),
      };
    }
    if (!recorded.ok || rec.error !== undefined) {
      return {
        block: true,
        blockReason: repeatBlockReason(name, how, rec.error ?? "failed", true),
      };
    }
    return {
      block: true,
      blockReason: repeatBlockReason(name, how, await repeatText(name, rec.result)),
    };
  };

  /**
   * Action batcher (choice-type covert channels): hold the call until its
   * window closes, then release it in canonical order, or answer an
   * idempotent repeat without re-sending it.
   *
   * M12: the submission never carries `dependsOn`. Nothing the agent
   * controls (its parameters, or URLs an earlier result named) can make an
   * action an ordering barrier; data-flow provenance is audit only.
   */
  const batchToolCall = async (
    name: string,
    params: Record<string, unknown>,
    hookCtx: { runId?: string; sessionKey?: string; toolCallId?: string } | undefined,
    toolCallId: string | undefined,
  ): Promise<ToolCallOutcome | null> => {
    const batcher = getActionBatcher();
    if (!config.egress.enabled || !batcher) {
      return null;
    }
    const mode = effectiveStageMode(config, STAGE_IDS.actionBatcher);
    if (mode === "off") {
      return null;
    }
    const command = params?.command;
    const inScope =
      batcher.options.tools.includes(name) ||
      (commandTools.has(name) && typeof command === "string" && isNetworkCommand(command));
    if (!inScope) {
      return null;
    }
    const scope = actionScope(hookCtx);
    const id = hookCtx?.toolCallId ?? toolCallId ?? `anonymous:${++anonymousCalls}`;
    // The host's replay context for exactly this call, when it provides one.
    const current = currentToolReplayCall();
    const call =
      current &&
      current.toolCallId === id &&
      current.toolName.trim().toLowerCase() === name.trim().toLowerCase()
        ? current
        : undefined;
    // Key on what the call produces outside the host, never on its
    // parameters. A call with no declared observation is not batched: it is
    // refused while the stage enforces (and reported in audit mode), so no
    // parameter that stays on the host can order or split released actions.
    const action = await toolCallObservation(name, params, call);
    if (action === NO_REQUEST) {
      // Its owner declares that this call sends nothing (it answers locally
      // or fails before sending): nothing reaches the observer to batch.
      return null;
    }
    // A channel send whose channel declares no exact observation: it has no
    // key that may order it, so it is released after the window's sorted
    // block as an ordering barrier, its order charged to the capacity ledger.
    // Sends are overt and never collapsed, so no key is needed for collapse.
    const unordered = !action && UNORDERED_SEND_TOOLS.has(name.trim().toLowerCase());
    if (unordered) {
      const tool = name.trim().toLowerCase();
      audit.sink(`tool:${tool}`, {
        stageId: STAGE_IDS.actionBatcher,
        severity: "low",
        code: "unordered-send",
        message: `tool ${tool} has no declared observation for this channel; released after the window, its order charged`,
        detail: { tool, scope, toolCallId: id },
      });
    }
    if (!action && RUNTIME_REQUEST_TOOLS.has(name.trim().toLowerCase())) {
      // Requests chosen at run time (a browser action, a network shell
      // command) have no observation to key on. They leave unbatched; every
      // other egress check has already run, and the origins they name lose
      // their recorded outcomes as for any side-effecting action.
      const tool = name.trim().toLowerCase();
      audit.sink(`tool:${tool}`, {
        stageId: STAGE_IDS.actionBatcher,
        severity: "low",
        code: "unbatched-runtime-request",
        message: `tool ${tool} chooses its requests at run time; released unbatched`,
        detail: { tool, scope, toolCallId: id },
      });
      batcher.noteUnbatched({ id, scope, action: { type: "tool", toolName: tool, params } });
      return null;
    }
    if (!action && !unordered) {
      const tool = name.trim().toLowerCase();
      audit.sink(`tool:${tool}`, {
        stageId: STAGE_IDS.actionBatcher,
        severity: mode === "enforce" ? "high" : "medium",
        code: "unmapped-tool",
        message: `tool ${tool} has no declared observation; ${mode === "enforce" ? "refused" : "released unbatched (audit)"}`,
        detail: { tool, scope, toolCallId: id },
      });
      if (mode !== "enforce") {
        return null;
      }
      const reason = unmappedToolReason(tool);
      api.logger.warn(`egress-mediator: batcher refused tool call ${name} (${reason})`);
      return { block: true, blockReason: `egress-action-batcher: ${reason}` };
    }
    const release = await batcher.submit({
      id,
      action: action ?? {
        type: "send",
        target: `${name.trim().toLowerCase()}:${typeof params.channel === "string" ? params.channel : ""}`,
        content: JSON.stringify(params),
      },
      ...(action ? {} : { afterWindow: true }),
      scope,
      dataFlowFrom: dependencies.dependsOn(scope, params),
      mode,
      ledger: ledgers.get(`action:${scope}`),
    });
    switch (release.outcome) {
      case "execute":
        if (release.tracked && call) {
          call.directive = { kind: "record" };
          seamCalls.set(id, call);
          if (seamCalls.size > MAX_SEAM_CALLS) {
            const oldest = seamCalls.keys().next().value;
            if (oldest !== undefined) {
              seamCalls.delete(oldest);
            }
          }
        }
        return null;
      case "blocked":
        api.logger.warn(`egress-mediator: batcher blocked tool call ${name} (${release.reason})`);
        return { block: true, blockReason: `egress-action-batcher: ${release.reason}` };
      case "collapsed":
        return await answerRepeat(
          name,
          "collapsed",
          await withTimeout(release.response, COLLAPSED_WAIT_MS),
          call,
        );
      case "cached":
        return await answerRepeat(
          name,
          "cached",
          { ok: release.ok, response: release.response },
          call,
        );
    }
    return null;
  };

  api.on(
    "before_tool_call",
    async (event, hookCtx) => {
      const name = event.toolName;
      const mediated = await mediateToolArgs(name, event.params);
      if (mediated.block) {
        return mediated;
      }
      const params = mediated.params ?? event.params;
      const batched = await batchToolCall(name, params, hookCtx, event.toolCallId);
      if (batched?.block) {
        return batched;
      }
      return mediated.params ? { params: mediated.params } : undefined;
    },
    { priority: 100 },
  );

  // Results feed the batcher (collapsed repeats, response cache) and the
  // dependency tracker. Recorded for every tool so a batched call that uses
  // any earlier result is recognized as dependent.
  api.on("after_tool_call", (event, hookCtx) => {
    const id = hookCtx?.toolCallId ?? event.toolCallId;
    const batcher = getActionBatcher();
    if (id && batcher) {
      const call = seamCalls.get(id);
      seamCalls.delete(id);
      if (call && !call.executed) {
        // Blocked downstream of the batcher: it never left. Forget it.
        batcher.abandon(id);
      } else if (call?.outcome) {
        const recorded: RecordedCall = { via: "seam", outcome: call.outcome };
        // The batcher re-issues the identical call on its own schedule, so a
        // repeat sees a recovery or a change without the agent choosing when
        // anything leaves.
        const rerun = call.rerun;
        const refresh: RefreshFn | undefined = rerun
          ? async () => {
              const outcome = await rerun();
              return outcome
                ? { ok: outcome.ok, response: { via: "seam", outcome } satisfies RecordedCall }
                : null;
            }
          : undefined;
        if (call.outcome.ok) {
          batcher.complete(id, recorded, undefined, refresh);
        } else {
          // An error is the recorded outcome too: repeats get it (until a
          // scheduled refresh records the recovery), never a re-send.
          batcher.fail(id, recorded, undefined, refresh);
        }
      } else if (event.error) {
        batcher.fail(id, { via: "event", error: event.error } satisfies RecordedCall);
      } else {
        batcher.complete(id, { via: "event", result: event.result } satisfies RecordedCall);
      }
    }
    if (id && !event.error) {
      dependencies.record(actionScope(hookCtx), id, toolResultText(event.result));
    }
  });

  // The run is over: its recorded outcomes and scheduled refreshes end with it.
  api.on("agent_end", (_event, ctx) => {
    getActionBatcher()?.endScope(actionScope(ctx));
  });

  // --- model-input: tool results ------------------------------------------
  if (
    config.modelInput.enabled &&
    config.modelInput.toolResults &&
    typeof api.registerAgentToolResultMiddleware === "function"
  ) {
    const middleware: AgentToolResultMiddleware = async (event) => {
      if (!active("model-input")) {
        return undefined;
      }
      const content = event.result?.content;
      if (!Array.isArray(content)) {
        return undefined;
      }
      const sink: EgressSink = {
        kind: "model-input",
        id: `tool-result:${event.toolName}`,
        toolName: event.toolName,
      };
      const out = await mediateTextBlocks(content, leafMediator(sink, { ms: 0 }));
      if (out.cancelled) {
        api.logger.warn(`egress-mediator: withheld ${event.toolName} result (${out.reason})`);
        return {
          result: { ...event.result, content: [{ type: "text", text: WITHHELD(out.reason) }] },
        };
      }
      return out.content ? { result: { ...event.result, content: out.content } } : undefined;
    };
    api.registerAgentToolResultMiddleware(middleware, { runtimes: ["pi", "codex"] });
  }

  // --- model-input: inbound channel messages ------------------------------
  if (config.modelInput.enabled && config.modelInput.inbound) {
    api.on(
      "before_dispatch",
      async (event, hookCtx) => {
        if (!active("model-input")) {
          return undefined;
        }
        const original = event.body ?? event.content;
        if (typeof original !== "string" || original.length === 0) {
          return undefined;
        }
        const sink: EgressSink = {
          kind: "model-input",
          id: `inbound:${hookCtx?.conversationId ?? hookCtx?.channelId ?? event.channel ?? "unknown"}`,
          channelId: hookCtx?.channelId,
          accountId: hookCtx?.accountId,
          conversationId: hookCtx?.conversationId,
        };
        const result = await mediate(original, sink);
        if (result.cancelled) {
          api.logger.warn(`egress-mediator: dropped inbound message (${result.reason})`);
          // Claim the message without a reply: it never reaches the model.
          return { handled: true };
        }
        return result.content !== original ? { handled: false, body: result.content } : undefined;
      },
      { priority: 100 },
    );
  }

  // --- media: outbound attachments ----------------------------------------
  registerMediaChokepoint(api, config, audit);

  return { audit, config, mediate };
}

/** Plugin entry wiring: hooks plus the runtime-backed host seams. */
export function registerEgressMediator(api: EnclawedPluginApi): EgressMediator {
  const mediator = createEgressMediator(api);
  installEgressHostSeams(api, mediator.config);
  return mediator;
}
