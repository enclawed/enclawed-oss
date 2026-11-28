// What a sessions_send call sends, shared by its execute and by its declared
// observation (the egress action batcher's key, `TOOL_OBSERVATION`), so the
// two cannot drift apart.

import type { EnclawedConfig } from "../../config/types.enclawed.js";
import { callGateway } from "../../gateway/call.js";
import { resolveSessionStoreKey } from "../../gateway/session-store-key.js";
import { formatErrorMessage } from "../../infra/errors.js";
import { normalizeAgentId, resolveAgentIdFromSessionKey } from "../../routing/session-key.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import {
  type GatewayMessageChannel,
  INTERNAL_MESSAGE_CHANNEL,
} from "../../utils/message-channel.js";
import { AGENT_LANE_NESTED } from "../lanes.js";
import { stableStringify } from "../stable-stringify.js";
import type { ToolObservation } from "../tool-replay.js";
import { readStringParam } from "./common.js";
import {
  createAgentToAgentPolicy,
  createSessionVisibilityGuard,
  resolveEffectiveSessionToolsVisibility,
  resolveSessionReference,
  resolveSessionToolContext,
  resolveVisibleSessionReference,
} from "./sessions-helpers.js";
import { buildAgentToAgentMessageContext, resolvePingPongTurns } from "./sessions-send-helpers.js";

type GatewayCaller = typeof callGateway;

export type SessionsSendToolOptions = {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  sandboxed?: boolean;
  config?: EnclawedConfig;
  callGateway?: GatewayCaller;
};

export type SessionsSendTarget =
  | {
      ok: true;
      /** The key execute sends to the gateway (as resolved, not store-canonical). */
      key: string;
      /** The name the prompts and the result use for the target. */
      displayKey: string;
      /** The gateway's session store key: the session that receives the message. */
      canonicalKey: string;
    }
  | {
      ok: false;
      status: "error" | "forbidden";
      error: string;
      /** Present when the failure names the resolved target. */
      sessionKey?: string;
    };

/**
 * Resolve the session a sessions_send call targets, exactly as execute does:
 * sessionKey or label (+ agentId), sessionId inputs, the `main`/`current`
 * aliases, sandbox (spawned-only) restrictions, the agent-to-agent policy and
 * the session visibility guard. A failure here means execute sends nothing.
 */
export async function resolveSessionsSendTarget(
  params: Record<string, unknown>,
  opts: SessionsSendToolOptions | undefined,
  ctx: ReturnType<typeof resolveSessionToolContext>,
): Promise<SessionsSendTarget> {
  const gatewayCall = opts?.callGateway ?? callGateway;
  const { cfg, mainKey, alias, effectiveRequesterKey, restrictToSpawned } = ctx;
  const a2aPolicy = createAgentToAgentPolicy(cfg);
  const sessionVisibility = resolveEffectiveSessionToolsVisibility({
    cfg,
    sandboxed: opts?.sandboxed === true,
  });

  const sessionKeyParam = readStringParam(params, "sessionKey");
  const labelParam = normalizeOptionalString(readStringParam(params, "label"));
  const labelAgentIdParam = normalizeOptionalString(readStringParam(params, "agentId"));
  if (sessionKeyParam && labelParam) {
    return { ok: false, status: "error", error: "Provide either sessionKey or label (not both)." };
  }

  let sessionKey = sessionKeyParam;
  if (!sessionKey && labelParam) {
    const requesterAgentId = resolveAgentIdFromSessionKey(effectiveRequesterKey);
    const requestedAgentId = labelAgentIdParam ? normalizeAgentId(labelAgentIdParam) : undefined;

    if (restrictToSpawned && requestedAgentId && requestedAgentId !== requesterAgentId) {
      return {
        ok: false,
        status: "forbidden",
        error: "Sandboxed sessions_send label lookup is limited to this agent",
      };
    }

    if (requesterAgentId && requestedAgentId && requestedAgentId !== requesterAgentId) {
      if (!a2aPolicy.enabled) {
        return {
          ok: false,
          status: "forbidden",
          error:
            "Agent-to-agent messaging is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent sends.",
        };
      }
      if (!a2aPolicy.isAllowed(requesterAgentId, requestedAgentId)) {
        return {
          ok: false,
          status: "forbidden",
          error: "Agent-to-agent messaging denied by tools.agentToAgent.allow.",
        };
      }
    }

    const resolveParams: Record<string, unknown> = {
      label: labelParam,
      ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
      ...(restrictToSpawned ? { spawnedBy: effectiveRequesterKey } : {}),
    };
    const notVisible = {
      ok: false,
      status: "forbidden",
      error: "Session not visible from this sandboxed agent session.",
    } as const;
    let resolvedKey = "";
    try {
      const resolved = await gatewayCall<{ key: string }>({
        method: "sessions.resolve",
        params: resolveParams,
        timeoutMs: 10_000,
      });
      resolvedKey = normalizeOptionalString(resolved?.key) ?? "";
    } catch (err) {
      if (restrictToSpawned) {
        return notVisible;
      }
      const msg = formatErrorMessage(err);
      return {
        ok: false,
        status: "error",
        error: msg || `No session found with label: ${labelParam}`,
      };
    }
    if (!resolvedKey) {
      if (restrictToSpawned) {
        return notVisible;
      }
      return { ok: false, status: "error", error: `No session found with label: ${labelParam}` };
    }
    sessionKey = resolvedKey;
  }

  if (!sessionKey) {
    return { ok: false, status: "error", error: "Either sessionKey or label is required" };
  }
  const resolvedSession = await resolveSessionReference({
    sessionKey,
    alias,
    mainKey,
    requesterInternalKey: effectiveRequesterKey,
    restrictToSpawned,
  });
  if (!resolvedSession.ok) {
    return { ok: false, status: resolvedSession.status, error: resolvedSession.error };
  }
  const visibleSession = await resolveVisibleSessionReference({
    resolvedSession,
    requesterSessionKey: effectiveRequesterKey,
    restrictToSpawned,
    visibilitySessionKey: sessionKey,
  });
  if (!visibleSession.ok) {
    return {
      ok: false,
      status: visibleSession.status,
      error: visibleSession.error,
      sessionKey: visibleSession.displayKey,
    };
  }
  // Normalize sessionKey/sessionId input into a canonical session key.
  const key = visibleSession.key;
  const displayKey = visibleSession.displayKey;
  const visibilityGuard = await createSessionVisibilityGuard({
    action: "send",
    requesterSessionKey: effectiveRequesterKey,
    visibility: sessionVisibility,
    a2aPolicy,
  });
  const access = visibilityGuard.check(key);
  if (!access.allowed) {
    return { ok: false, status: access.status, error: access.error, sessionKey: displayKey };
  }
  return {
    ok: true,
    key,
    displayKey,
    canonicalKey: resolveSessionStoreKey({ cfg, sessionKey: key }),
  };
}

/** `timeoutSeconds` as execute uses it: floored, at least 0, 30 when absent. */
export function resolveSessionsSendTimeoutSeconds(params: Record<string, unknown>): number {
  return typeof params.timeoutSeconds === "number" && Number.isFinite(params.timeoutSeconds)
    ? Math.max(0, Math.floor(params.timeoutSeconds))
    : 30;
}

/** The gateway `agent` request execute sends, without its per-call idempotency key. */
export function buildSessionsSendRequest(params: {
  message: string;
  target: Extract<SessionsSendTarget, { ok: true }>;
  opts: SessionsSendToolOptions | undefined;
}) {
  return {
    message: params.message,
    sessionKey: params.target.key,
    deliver: false,
    channel: INTERNAL_MESSAGE_CHANNEL,
    lane: AGENT_LANE_NESTED,
    extraSystemPrompt: buildAgentToAgentMessageContext({
      requesterSessionKey: params.opts?.agentSessionKey,
      requesterChannel: params.opts?.agentChannel,
      targetSessionKey: params.target.displayKey,
    }),
    inputProvenance: {
      kind: "inter_session",
      sourceSessionKey: params.opts?.agentSessionKey,
      sourceChannel: params.opts?.agentChannel,
      sourceTool: "sessions_send",
    },
  };
}

/**
 * The observation of a sessions_send call: `{ type: "send", target, content }`.
 *
 * target: the gateway's session store key of the receiving session
 * (`resolveSessionStoreKey`, the key the gateway's `agent` method files the
 * run under), so sessionKey vs label, sessionId vs key, `main` vs the
 * configured main key, `current` vs the requester's own key and surrounding
 * whitespace all name one target.
 *
 * content: the canonical (key-sorted) JSON of
 *   - `request`: the gateway `agent` request exactly as execute sends it,
 *     minus the random idempotency key (a fresh UUID per call that only
 *     de-duplicates transport retries; the receiving session never sees
 *     it). It carries the message as delivered (trimmed by readStringParam),
 *     the system-prompt context the receiver reads (requester session and
 *     channel, and the target's display name), the input provenance, and the
 *     resolved key spelling. The spelling stays because it leaves: the
 *     context line names the target by it (`main` and `agent:main:main` are
 *     one session but give the receiver different text), and the follow-up
 *     flow compares it with the requester key and derives the announce
 *     target from it.
 *   - `followUp.timeoutSeconds`, normalized as execute does (floor, at least
 *     0, default 30). It does not only bound the sender's wait; it changes
 *     what is sent afterwards:
 *       0   fire and forget. No baseline read; the follow-up flow waits up to
 *           30 s for the run, then runs the ping-pong and announce steps with
 *           30 s step timeouts.
 *       T>0 the call waits T s. If the run does not finish in time (or
 *           fails) no follow-up is sent at all: no ping-pong into the
 *           requester's session, no announce step into the target session,
 *           no post to the target's channel. Otherwise the flow runs with
 *           step timeouts of min(T, 60) s, which decide whether each reply
 *           arrives and so whether the exchange continues and is announced.
 *     So every normalized value can change the follow-up messages; none are
 *     merged. The 10 s gateway transport timeouts are constants.
 *   - `followUp.maxPingPongTurns` (config `session.agentToAgent`), which
 *     bounds the follow-up exchange.
 *
 * What cannot be in the key: the follow-up messages' text (ping-pong turns,
 * the announce prompt, the channel post) is the agents' replies, produced at
 * run time by the receiving and requesting sessions, not chosen by the
 * call's parameters. Everything the caller chooses is in the key, so two
 * calls with one key differ only in what other agents answer; keying on it
 * never merges calls whose caller-chosen sends differ.
 *
 * Never null: every call execute accepts sends the request. Throws where
 * execute fails before sending (missing message, both sessionKey and label,
 * an unresolvable or forbidden target).
 */
export async function observeSessionsSend(
  params: Record<string, unknown>,
  opts: SessionsSendToolOptions | undefined,
): Promise<ToolObservation> {
  const message = readStringParam(params, "message", { required: true });
  const ctx = resolveSessionToolContext(opts);
  const target = await resolveSessionsSendTarget(params, opts, ctx);
  if (!target.ok) {
    throw new Error(`sessions_send sends nothing (${target.status}): ${target.error}`);
  }
  const request = buildSessionsSendRequest({ message, target, opts });
  return {
    type: "send",
    target: target.canonicalKey,
    content: stableStringify({
      request,
      followUp: {
        timeoutSeconds: resolveSessionsSendTimeoutSeconds(params),
        maxPingPongTurns: resolvePingPongTurns(ctx.cfg),
      },
    }),
  };
}
