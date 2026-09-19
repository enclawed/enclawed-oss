import type { EnclawedConfig } from "../config/types.enclawed.js";

export type DiagnosticSessionState = "idle" | "processing" | "waiting";

type DiagnosticBaseEvent = {
  ts: number;
  seq: number;
};

export type DiagnosticUsageEvent = DiagnosticBaseEvent & {
  type: "model.usage";
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  channel?: string;
  provider?: string;
  model?: string;
  usage: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    promptTokens?: number;
    total?: number;
  };
  lastCallUsage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  context?: {
    limit?: number;
    used?: number;
  };
  costUsd?: number;
  durationMs?: number;
};

export type DiagnosticWebhookReceivedEvent = DiagnosticBaseEvent & {
  type: "webhook.received";
  channel: string;
  updateType?: string;
  chatId?: number | string;
};

export type DiagnosticWebhookProcessedEvent = DiagnosticBaseEvent & {
  type: "webhook.processed";
  channel: string;
  updateType?: string;
  chatId?: number | string;
  durationMs?: number;
};

export type DiagnosticWebhookErrorEvent = DiagnosticBaseEvent & {
  type: "webhook.error";
  channel: string;
  updateType?: string;
  chatId?: number | string;
  error: string;
};

export type DiagnosticMessageQueuedEvent = DiagnosticBaseEvent & {
  type: "message.queued";
  sessionKey?: string;
  sessionId?: string;
  channel?: string;
  source: string;
  queueDepth?: number;
};

export type DiagnosticMessageProcessedEvent = DiagnosticBaseEvent & {
  type: "message.processed";
  channel: string;
  messageId?: number | string;
  chatId?: number | string;
  sessionKey?: string;
  sessionId?: string;
  durationMs?: number;
  outcome: "completed" | "skipped" | "error";
  reason?: string;
  error?: string;
};

export type DiagnosticSessionStateEvent = DiagnosticBaseEvent & {
  type: "session.state";
  sessionKey?: string;
  sessionId?: string;
  prevState?: DiagnosticSessionState;
  state: DiagnosticSessionState;
  reason?: string;
  queueDepth?: number;
};

export type DiagnosticSessionStuckEvent = DiagnosticBaseEvent & {
  type: "session.stuck";
  sessionKey?: string;
  sessionId?: string;
  state: DiagnosticSessionState;
  ageMs: number;
  queueDepth?: number;
};

export type DiagnosticLaneEnqueueEvent = DiagnosticBaseEvent & {
  type: "queue.lane.enqueue";
  lane: string;
  queueSize: number;
};

export type DiagnosticLaneDequeueEvent = DiagnosticBaseEvent & {
  type: "queue.lane.dequeue";
  lane: string;
  queueSize: number;
  waitMs: number;
};

export type DiagnosticRunAttemptEvent = DiagnosticBaseEvent & {
  type: "run.attempt";
  sessionKey?: string;
  sessionId?: string;
  runId: string;
  attempt: number;
};

export type DiagnosticHeartbeatEvent = DiagnosticBaseEvent & {
  type: "diagnostic.heartbeat";
  webhooks: {
    received: number;
    processed: number;
    errors: number;
  };
  active: number;
  waiting: number;
  queued: number;
};

export type DiagnosticToolLoopEvent = DiagnosticBaseEvent & {
  type: "tool.loop";
  sessionKey?: string;
  sessionId?: string;
  toolName: string;
  level: "warning" | "critical";
  action: "warn" | "block";
  detector:
    | "generic_repeat"
    | "unknown_tool_repeat"
    | "known_poll_no_progress"
    | "global_circuit_breaker"
    | "ping_pong";
  count: number;
  message: string;
  pairedToolName?: string;
};

export type DiagnosticRunCompletedEvent = DiagnosticBaseEvent & {
  type: "run.completed";
  runId: string;
  sessionKey?: string;
  sessionId?: string;
  channel?: string;
  provider?: string;
  model?: string;
  trigger?: string;
  outcome?: string;
  durationMs?: number;
};

export type DiagnosticModelCallCompletedEvent = DiagnosticBaseEvent & {
  type: "model.call.completed";
  runId?: string;
  callId?: string;
  api?: string;
  provider?: string;
  model?: string;
  transport?: string;
  durationMs?: number;
};

export type DiagnosticModelCallErrorEvent = DiagnosticBaseEvent & {
  type: "model.call.error";
  runId?: string;
  callId?: string;
  api?: string;
  provider?: string;
  model?: string;
  transport?: string;
  durationMs?: number;
  errorCategory?: string;
  error?: string;
};

export type DiagnosticToolExecutionCompletedEvent = DiagnosticBaseEvent & {
  type: "tool.execution.completed";
  toolName: string;
  durationMs?: number;
  paramsSummary?: { kind: string };
};

export type DiagnosticToolExecutionErrorEvent = DiagnosticBaseEvent & {
  type: "tool.execution.error";
  toolName: string;
  durationMs?: number;
  paramsSummary?: { kind: string };
  errorCategory?: string;
  error?: string;
};

export type DiagnosticHarnessRunCompletedEvent = DiagnosticBaseEvent & {
  type: "harness.run.completed";
  harnessId: string;
  channel?: string;
  model?: string;
  outcome?: string;
  pluginId?: string;
  provider?: string;
  durationMs?: number;
};

export type DiagnosticHarnessRunErrorEvent = DiagnosticBaseEvent & {
  type: "harness.run.error";
  harnessId: string;
  channel?: string;
  model?: string;
  pluginId?: string;
  provider?: string;
  durationMs?: number;
  errorCategory?: string;
  phase?: string;
  error?: string;
};

export type DiagnosticMessageDeliveryCompletedEvent = DiagnosticBaseEvent & {
  type: "message.delivery.completed";
  channel: string;
  deliveryKind: string;
  durationMs?: number;
};

export type DiagnosticMessageDeliveryErrorEvent = DiagnosticBaseEvent & {
  type: "message.delivery.error";
  channel: string;
  deliveryKind: string;
  durationMs?: number;
  errorCategory?: string;
  error?: string;
};

export type DiagnosticMemorySampleEvent = DiagnosticBaseEvent & {
  type: "diagnostic.memory.sample";
  memory: {
    rssBytes: number;
    heapTotalBytes: number;
    heapUsedBytes: number;
  };
};

export type DiagnosticMemoryPressureEvent = DiagnosticBaseEvent & {
  type: "diagnostic.memory.pressure";
  level: "warning" | "critical";
  reason: string;
};

export type DiagnosticLivenessWarningEvent = DiagnosticBaseEvent & {
  type: "diagnostic.liveness.warning";
  reason?: string;
  detail?: string;
};

export type DiagnosticTelemetryExporterEvent = DiagnosticBaseEvent & {
  type: "telemetry.exporter";
  exporter: string;
  signal: string;
  status: "started" | "stopped" | "error";
  reason?: string;
};

export type DiagnosticEventPayload =
  | DiagnosticUsageEvent
  | DiagnosticWebhookReceivedEvent
  | DiagnosticWebhookProcessedEvent
  | DiagnosticWebhookErrorEvent
  | DiagnosticMessageQueuedEvent
  | DiagnosticMessageProcessedEvent
  | DiagnosticSessionStateEvent
  | DiagnosticSessionStuckEvent
  | DiagnosticLaneEnqueueEvent
  | DiagnosticLaneDequeueEvent
  | DiagnosticRunAttemptEvent
  | DiagnosticHeartbeatEvent
  | DiagnosticToolLoopEvent
  | DiagnosticRunCompletedEvent
  | DiagnosticModelCallCompletedEvent
  | DiagnosticModelCallErrorEvent
  | DiagnosticToolExecutionCompletedEvent
  | DiagnosticToolExecutionErrorEvent
  | DiagnosticHarnessRunCompletedEvent
  | DiagnosticHarnessRunErrorEvent
  | DiagnosticMessageDeliveryCompletedEvent
  | DiagnosticMessageDeliveryErrorEvent
  | DiagnosticMemorySampleEvent
  | DiagnosticMemoryPressureEvent
  | DiagnosticLivenessWarningEvent
  | DiagnosticTelemetryExporterEvent;

export type DiagnosticEventInput = DiagnosticEventPayload extends infer Event
  ? Event extends DiagnosticEventPayload
    ? Omit<Event, "seq" | "ts">
    : never
  : never;

type DiagnosticEventsGlobalState = {
  seq: number;
  listeners: Set<(evt: DiagnosticEventPayload) => void>;
  dispatchDepth: number;
};

function getDiagnosticEventsState(): DiagnosticEventsGlobalState {
  const globalStore = globalThis as typeof globalThis & {
    __enclawedDiagnosticEventsState?: DiagnosticEventsGlobalState;
  };
  if (!globalStore.__enclawedDiagnosticEventsState) {
    globalStore.__enclawedDiagnosticEventsState = {
      seq: 0,
      listeners: new Set<(evt: DiagnosticEventPayload) => void>(),
      dispatchDepth: 0,
    };
  }
  return globalStore.__enclawedDiagnosticEventsState;
}

export function isDiagnosticsEnabled(config?: EnclawedConfig): boolean {
  return config?.diagnostics?.enabled === true;
}

export function emitDiagnosticEvent(event: DiagnosticEventInput) {
  const state = getDiagnosticEventsState();
  if (state.dispatchDepth > 100) {
    console.error(
      `[diagnostic-events] recursion guard tripped at depth=${state.dispatchDepth}, dropping type=${event.type}`,
    );
    return;
  }

  const enriched = {
    ...event,
    seq: (state.seq += 1),
    ts: Date.now(),
  } satisfies DiagnosticEventPayload;
  state.dispatchDepth += 1;
  for (const listener of state.listeners) {
    try {
      listener(enriched);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? (err.stack ?? err.message)
          : typeof err === "string"
            ? err
            : String(err);
      console.error(
        `[diagnostic-events] listener error type=${enriched.type} seq=${enriched.seq}: ${errorMessage}`,
      );
      // Ignore listener failures.
    }
  }
  state.dispatchDepth -= 1;
}

export function onDiagnosticEvent(listener: (evt: DiagnosticEventPayload) => void): () => void {
  const state = getDiagnosticEventsState();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function resetDiagnosticEventsForTest(): void {
  const state = getDiagnosticEventsState();
  state.seq = 0;
  state.listeners.clear();
  state.dispatchDepth = 0;
}
