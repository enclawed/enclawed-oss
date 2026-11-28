import type {
  ChannelOutboundAdapter,
  ChannelOutboundObservedPoll,
} from "../../channels/plugins/types.adapters.js";
import type { EnclawedConfig } from "../../config/types.enclawed.js";
import type { PollInput } from "../../polls.js";
import { normalizePollInput } from "../../polls.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import {
  GATEWAY_CLIENT_MODES,
  GATEWAY_CLIENT_NAMES,
  type GatewayClientMode,
  type GatewayClientName,
} from "../../utils/message-channel.js";
import { resolveOutboundChannelPlugin } from "./channel-resolution.js";
import { resolveMessageChannelSelection } from "./channel-selection.js";
import {
  deliverOutboundPayloads,
  planOutboundDeliveryCalls,
  type OutboundDeliveryResult,
  type OutboundSendDeps,
  type PlannedOutboundDelivery,
} from "./deliver.js";
import type { OutboundMirror } from "./mirror.js";
import {
  createOutboundPayloadPlan,
  projectOutboundPayloadPlanForDelivery,
  projectOutboundPayloadPlanForMirror,
} from "./payloads.js";
import { buildOutboundSessionContext } from "./session-context.js";
import { resolveOutboundTarget } from "./targets.js";

let messageConfigRuntimePromise: Promise<typeof import("./message.config.runtime.js")> | null =
  null;
let messageGatewayRuntimePromise: Promise<typeof import("./message.gateway.runtime.js")> | null =
  null;

function loadMessageConfigRuntime() {
  messageConfigRuntimePromise ??= import("./message.config.runtime.js");
  return messageConfigRuntimePromise;
}

function loadMessageGatewayRuntime() {
  messageGatewayRuntimePromise ??= import("./message.gateway.runtime.js");
  return messageGatewayRuntimePromise;
}

export type MessageGatewayOptions = {
  url?: string;
  token?: string;
  timeoutMs?: number;
  clientName?: GatewayClientName;
  clientDisplayName?: string;
  mode?: GatewayClientMode;
};

type MessageSendParams = {
  to: string;
  content: string;
  /** Active agent id for per-agent outbound media root scoping. */
  agentId?: string;
  /** Originating session key used for requester-scoped outbound media policy. */
  requesterSessionKey?: string;
  /** Originating account id used for requester-scoped outbound media policy. */
  requesterAccountId?: string;
  /** Originating sender id used for sender-scoped outbound media policy. */
  requesterSenderId?: string;
  /** Originating sender display name for name-keyed sender policy matching. */
  requesterSenderName?: string;
  /** Originating sender username for username-keyed sender policy matching. */
  requesterSenderUsername?: string;
  /** Originating sender E.164 phone number for e164-keyed sender policy matching. */
  requesterSenderE164?: string;
  channel?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  gifPlayback?: boolean;
  forceDocument?: boolean;
  accountId?: string;
  replyToId?: string;
  threadId?: string | number;
  dryRun?: boolean;
  bestEffort?: boolean;
  deps?: OutboundSendDeps;
  cfg?: EnclawedConfig;
  gateway?: MessageGatewayOptions;
  idempotencyKey?: string;
  mirror?: OutboundMirror;
  abortSignal?: AbortSignal;
  silent?: boolean;
};

export type MessageSendResult = {
  channel: string;
  to: string;
  via: "direct" | "gateway";
  mediaUrl: string | null;
  mediaUrls?: string[];
  result?: OutboundDeliveryResult | { messageId: string };
  dryRun?: boolean;
};

type MessagePollParams = {
  to: string;
  question: string;
  options: string[];
  maxSelections?: number;
  durationSeconds?: number;
  durationHours?: number;
  channel?: string;
  accountId?: string;
  threadId?: string;
  silent?: boolean;
  isAnonymous?: boolean;
  dryRun?: boolean;
  cfg?: EnclawedConfig;
  gateway?: MessageGatewayOptions;
  idempotencyKey?: string;
};

export type MessagePollResult = {
  channel: string;
  to: string;
  question: string;
  options: string[];
  maxSelections: number;
  durationSeconds: number | null;
  durationHours: number | null;
  via: "gateway";
  result?: {
    messageId: string;
    toJid?: string;
    channelId?: string;
    conversationId?: string;
    pollId?: string;
  };
  dryRun?: boolean;
};

function buildMessagePollResult(params: {
  channel: string;
  to: string;
  normalized: {
    question: string;
    options: string[];
    maxSelections: number;
    durationSeconds?: number | null;
    durationHours?: number | null;
  };
  result?: MessagePollResult["result"];
  dryRun?: boolean;
}): MessagePollResult {
  return {
    channel: params.channel,
    to: params.to,
    question: params.normalized.question,
    options: params.normalized.options,
    maxSelections: params.normalized.maxSelections,
    durationSeconds: params.normalized.durationSeconds ?? null,
    durationHours: params.normalized.durationHours ?? null,
    via: "gateway",
    ...(params.dryRun ? { dryRun: true } : { result: params.result }),
  };
}

async function resolveRequiredChannel(params: {
  cfg: EnclawedConfig;
  channel?: string;
}): Promise<string> {
  return (
    await resolveMessageChannelSelection({
      cfg: params.cfg,
      channel: params.channel,
    })
  ).channel;
}

function resolveRequiredPlugin(channel: string, cfg: EnclawedConfig) {
  const plugin = resolveOutboundChannelPlugin({ channel, cfg });
  if (!plugin) {
    throw new Error(`Unknown channel: ${channel}`);
  }
  return plugin;
}

function resolveGatewayOptions(opts?: MessageGatewayOptions) {
  // Security: backend callers (tools/agents) must not accept user-controlled gateway URLs.
  // Use config-derived gateway target only.
  const url =
    opts?.mode === GATEWAY_CLIENT_MODES.BACKEND ||
    opts?.clientName === GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT
      ? undefined
      : opts?.url;
  return {
    url,
    token: opts?.token,
    timeoutMs:
      typeof opts?.timeoutMs === "number" && Number.isFinite(opts.timeoutMs)
        ? Math.max(1, Math.floor(opts.timeoutMs))
        : 10_000,
    clientName: opts?.clientName ?? GATEWAY_CLIENT_NAMES.CLI,
    clientDisplayName: opts?.clientDisplayName,
    mode: opts?.mode ?? GATEWAY_CLIENT_MODES.CLI,
  };
}

async function callMessageGateway<T>(params: {
  gateway?: MessageGatewayOptions;
  method: string;
  params: Record<string, unknown>;
}): Promise<T> {
  const { callGatewayLeastPrivilege } = await loadMessageGatewayRuntime();
  const gateway = resolveGatewayOptions(params.gateway);
  return await callGatewayLeastPrivilege<T>({
    url: gateway.url,
    token: gateway.token,
    method: params.method,
    params: params.params,
    timeoutMs: gateway.timeoutMs,
    clientName: gateway.clientName,
    clientDisplayName: gateway.clientDisplayName,
    mode: gateway.mode,
  });
}

async function resolveMessageConfig(cfg?: EnclawedConfig): Promise<EnclawedConfig> {
  if (cfg) {
    return cfg;
  }
  const { loadConfig } = await loadMessageConfigRuntime();
  return loadConfig();
}

async function resolveGatewayIdempotencyKey(idempotencyKey?: string): Promise<string> {
  if (idempotencyKey) {
    return idempotencyKey;
  }
  const { randomIdempotencyKey } = await loadMessageGatewayRuntime();
  return randomIdempotencyKey();
}

function resolveDirectSendTarget(params: {
  cfg: EnclawedConfig;
  channel: string;
  to: string;
  accountId?: string;
}): { ok: true; to: string } {
  const resolvedTarget = resolveOutboundTarget({
    channel: params.channel,
    to: params.to,
    cfg: params.cfg,
    accountId: params.accountId,
    mode: "explicit",
  });
  if (!resolvedTarget.ok) {
    throw resolvedTarget.error;
  }
  return resolvedTarget;
}

/**
 * The adapter calls `sendMessage` would make on a direct-delivery channel,
 * without making them (`planOutboundDeliveryCalls`): the same channel,
 * target resolution and payload normalization. Null on a channel that
 * delivers through the gateway's send method (its calls are made there).
 */
export async function planSendMessageDelivery(
  params: Pick<
    MessageSendParams,
    | "to"
    | "content"
    | "channel"
    | "mediaUrl"
    | "mediaUrls"
    | "gifPlayback"
    | "forceDocument"
    | "accountId"
    | "replyToId"
    | "threadId"
    | "silent"
  > & { cfg: EnclawedConfig },
): Promise<PlannedOutboundDelivery | null> {
  const cfg = params.cfg;
  const channel = await resolveRequiredChannel({ cfg, channel: params.channel });
  const plugin = resolveRequiredPlugin(channel, cfg);
  if ((plugin.outbound?.deliveryMode ?? "direct") === "gateway") {
    return null;
  }
  const normalizedPayloads = projectOutboundPayloadPlanForDelivery(
    createOutboundPayloadPlan([
      { text: params.content, mediaUrl: params.mediaUrl, mediaUrls: params.mediaUrls },
    ]),
  );
  const resolvedTarget = resolveDirectSendTarget({
    cfg,
    channel,
    to: params.to,
    accountId: params.accountId,
  });
  return await planOutboundDeliveryCalls({
    cfg,
    channel,
    to: resolvedTarget.to,
    accountId: params.accountId,
    payloads: normalizedPayloads,
    replyToId: params.replyToId,
    threadId: params.threadId,
    gifPlayback: params.gifPlayback,
    forceDocument: params.forceDocument,
    silent: params.silent,
  });
}

export async function sendMessage(params: MessageSendParams): Promise<MessageSendResult> {
  const cfg = await resolveMessageConfig(params.cfg);
  const channel = await resolveRequiredChannel({ cfg, channel: params.channel });
  const plugin = resolveRequiredPlugin(channel, cfg);
  const deliveryMode = plugin.outbound?.deliveryMode ?? "direct";
  const outboundPlan = createOutboundPayloadPlan([
    {
      text: params.content,
      mediaUrl: params.mediaUrl,
      mediaUrls: params.mediaUrls,
    },
  ]);
  const normalizedPayloads = projectOutboundPayloadPlanForDelivery(outboundPlan);
  const mirrorProjection = projectOutboundPayloadPlanForMirror(outboundPlan);
  const mirrorText = mirrorProjection.text;
  const mirrorMediaUrls = mirrorProjection.mediaUrls;
  const primaryMediaUrl = mirrorMediaUrls[0] ?? params.mediaUrl ?? null;

  if (params.dryRun) {
    return {
      channel,
      to: params.to,
      via: deliveryMode === "gateway" ? "gateway" : "direct",
      mediaUrl: primaryMediaUrl,
      mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : undefined,
      dryRun: true,
    };
  }

  if (deliveryMode !== "gateway") {
    const outboundChannel = channel;
    const resolvedTarget = resolveDirectSendTarget({
      cfg,
      channel: outboundChannel,
      to: params.to,
      accountId: params.accountId,
    });

    const outboundSession = buildOutboundSessionContext({
      cfg,
      agentId: params.agentId,
      sessionKey: params.requesterSessionKey ?? params.mirror?.sessionKey,
      requesterAccountId: params.requesterAccountId ?? params.accountId,
      requesterSenderId: params.requesterSenderId,
      requesterSenderName: params.requesterSenderName,
      requesterSenderUsername: params.requesterSenderUsername,
      requesterSenderE164: params.requesterSenderE164,
    });
    const results = await deliverOutboundPayloads({
      cfg,
      channel: outboundChannel,
      to: resolvedTarget.to,
      session: outboundSession,
      accountId: params.accountId,
      payloads: normalizedPayloads,
      replyToId: params.replyToId,
      threadId: params.threadId,
      gifPlayback: params.gifPlayback,
      forceDocument: params.forceDocument,
      deps: params.deps,
      bestEffort: params.bestEffort,
      abortSignal: params.abortSignal,
      silent: params.silent,
      mirror: params.mirror
        ? {
            ...params.mirror,
            text: mirrorText || params.content,
            mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : undefined,
            idempotencyKey: params.mirror.idempotencyKey ?? params.idempotencyKey,
          }
        : undefined,
    });

    return {
      channel,
      to: params.to,
      via: "direct",
      mediaUrl: primaryMediaUrl,
      mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : undefined,
      result: results.at(-1),
    };
  }

  const result = await callMessageGateway<{ messageId: string }>({
    gateway: params.gateway,
    method: "send",
    params: {
      to: params.to,
      message: params.content,
      mediaUrl: params.mediaUrl,
      mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : params.mediaUrls,
      gifPlayback: params.gifPlayback,
      accountId: params.accountId,
      agentId: params.agentId,
      channel,
      sessionKey: params.mirror?.sessionKey,
      idempotencyKey: await resolveGatewayIdempotencyKey(params.idempotencyKey),
    },
  });

  return {
    channel,
    to: params.to,
    via: "gateway",
    mediaUrl: primaryMediaUrl,
    mediaUrls: mirrorMediaUrls.length ? mirrorMediaUrls : undefined,
    result,
  };
}

/**
 * The `sendPoll` call the gateway's poll method would make for `sendPoll`
 * (same target resolution and poll normalization), without making it, or
 * null when the channel has no core poll path or the gateway would refuse
 * the request.
 */
export async function planSendPoll(
  params: Omit<MessagePollParams, "dryRun" | "gateway" | "idempotencyKey"> & {
    cfg: EnclawedConfig;
  },
): Promise<{ outbound: ChannelOutboundAdapter; poll: ChannelOutboundObservedPoll } | null> {
  const cfg = params.cfg;
  const channel = await resolveRequiredChannel({ cfg, channel: params.channel });
  const outbound = resolveRequiredPlugin(channel, cfg).outbound;
  if (!outbound?.sendPoll) {
    return null;
  }
  if (
    (typeof params.durationSeconds === "number" && outbound.supportsPollDurationSeconds !== true) ||
    (typeof params.isAnonymous === "boolean" && outbound.supportsAnonymousPolls !== true)
  ) {
    return null;
  }
  const pollInput: PollInput = {
    question: params.question,
    options: params.options,
    maxSelections: params.maxSelections,
    durationSeconds: params.durationSeconds,
    durationHours: params.durationHours,
  };
  // As the client normalizes, then the gateway again on the result.
  const clientSide = outbound.pollMaxOptions
    ? normalizePollInput(pollInput, { maxOptions: outbound.pollMaxOptions })
    : normalizePollInput(pollInput);
  const sent: PollInput = {
    question: clientSide.question,
    options: clientSide.options,
    maxSelections: clientSide.maxSelections,
    durationSeconds: clientSide.durationSeconds,
    durationHours: clientSide.durationHours,
  };
  const normalized = outbound.pollMaxOptions
    ? normalizePollInput(sent, { maxOptions: outbound.pollMaxOptions })
    : normalizePollInput(sent);
  const accountId = normalizeOptionalString(params.accountId);
  const resolvedTarget = resolveDirectSendTarget({
    cfg,
    channel,
    to: params.to.trim(),
    accountId,
  });
  return {
    outbound,
    poll: {
      cfg,
      to: resolvedTarget.to,
      poll: normalized,
      accountId,
      threadId: normalizeOptionalString(params.threadId),
      silent: params.silent,
      isAnonymous: params.isAnonymous,
    },
  };
}

export async function sendPoll(params: MessagePollParams): Promise<MessagePollResult> {
  const cfg = await resolveMessageConfig(params.cfg);
  const channel = await resolveRequiredChannel({ cfg, channel: params.channel });

  const pollInput: PollInput = {
    question: params.question,
    options: params.options,
    maxSelections: params.maxSelections,
    durationSeconds: params.durationSeconds,
    durationHours: params.durationHours,
  };
  const plugin = resolveRequiredPlugin(channel, cfg);
  const outbound = plugin?.outbound;
  if (!outbound?.sendPoll) {
    throw new Error(`Unsupported poll channel: ${channel}`);
  }
  const normalized = outbound.pollMaxOptions
    ? normalizePollInput(pollInput, { maxOptions: outbound.pollMaxOptions })
    : normalizePollInput(pollInput);

  if (params.dryRun) {
    return buildMessagePollResult({
      channel,
      to: params.to,
      normalized,
      dryRun: true,
    });
  }

  const result = await callMessageGateway<{
    messageId: string;
    toJid?: string;
    channelId?: string;
    conversationId?: string;
    pollId?: string;
  }>({
    gateway: params.gateway,
    method: "poll",
    params: {
      to: params.to,
      question: normalized.question,
      options: normalized.options,
      maxSelections: normalized.maxSelections,
      durationSeconds: normalized.durationSeconds,
      durationHours: normalized.durationHours,
      threadId: params.threadId,
      silent: params.silent,
      isAnonymous: params.isAnonymous,
      channel,
      accountId: params.accountId,
      idempotencyKey: await resolveGatewayIdempotencyKey(params.idempotencyKey),
    },
  });

  return buildMessagePollResult({
    channel,
    to: params.to,
    normalized,
    result,
  });
}
