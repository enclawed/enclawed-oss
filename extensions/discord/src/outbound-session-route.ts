import { buildThreadAwareOutboundSessionRoute } from "@enclawed/plugin-sdk/channel-core";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { buildOutboundBaseSessionKey, type RoutePeer } from "@enclawed/plugin-sdk/routing";
import { parseDiscordTarget } from "./target-parsing.js";

export type ResolveDiscordOutboundSessionRouteParams = {
  cfg: EnclawedConfig;
  agentId: string;
  accountId?: string | null;
  target: string;
  resolvedTarget?: { kind: string };
  replyToId?: string | null;
  threadId?: string | number | null;
};

export function resolveDiscordOutboundSessionRoute(
  params: ResolveDiscordOutboundSessionRouteParams,
) {
  const parsed = parseDiscordTarget(params.target, {
    defaultKind: resolveDiscordOutboundTargetKindHint(params),
  });
  if (!parsed) {
    return null;
  }
  const isDm = parsed.kind === "user";
  const peer: RoutePeer = {
    kind: isDm ? "direct" : "channel",
    id: parsed.id,
  };
  const baseSessionKey = buildOutboundBaseSessionKey({
    cfg: params.cfg,
    agentId: params.agentId,
    channel: "discord",
    accountId: params.accountId,
    peer,
  });
  return buildThreadAwareOutboundSessionRoute({
    route: {
      sessionKey: baseSessionKey,
      baseSessionKey,
      peer,
      chatType: isDm ? ("direct" as const) : ("channel" as const),
      from: isDm ? `discord:${parsed.id}` : `discord:channel:${parsed.id}`,
      to: isDm ? `user:${parsed.id}` : `channel:${parsed.id}`,
    },
    threadId: params.threadId,
    precedence: ["threadId"],
    useSuffix: false,
  });
}

function resolveDiscordOutboundTargetKindHint(params: {
  target: string;
  resolvedTarget?: { kind: string };
}): "user" | "channel" | undefined {
  const resolvedKind = params.resolvedTarget?.kind;
  if (resolvedKind === "user") {
    return "user";
  }
  if (resolvedKind === "group" || resolvedKind === "channel") {
    return "channel";
  }

  const target = params.target.trim();
  if (/^channel:/i.test(target)) {
    return "channel";
  }
  if (/^(user:|discord:|@|<@!?)/i.test(target)) {
    return "user";
  }
  return undefined;
}
