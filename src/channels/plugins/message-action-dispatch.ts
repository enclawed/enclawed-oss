import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import {
  mediateMessageActionArgs,
  shouldMediateMessageAction,
} from "../../infra/outbound/message-action-sending-hooks.js";
import { runAsMediatedOutboundSend } from "../../infra/outbound/sending-scope.js";
import { getChannelPlugin } from "./index.js";
import type { ChannelMessageActionContext } from "./types.public.js";

function requiresTrustedRequesterSender(ctx: ChannelMessageActionContext): boolean {
  const plugin = getChannelPlugin(ctx.channel);
  return Boolean(
    plugin?.actions?.requiresTrustedRequesterSender?.({
      action: ctx.action,
      toolContext: ctx.toolContext,
    }),
  );
}

export async function dispatchChannelMessageAction(
  ctx: ChannelMessageActionContext,
): Promise<AgentToolResult<unknown> | null> {
  if (requiresTrustedRequesterSender(ctx) && !ctx.requesterSenderId?.trim()) {
    throw new Error(
      `Trusted sender identity is required for ${ctx.channel}:${ctx.action} in tool-driven contexts.`,
    );
  }
  const plugin = getChannelPlugin(ctx.channel);
  if (!plugin?.actions?.handleAction) {
    return null;
  }
  if (plugin.actions.supportsAction && !plugin.actions.supportsAction({ action: ctx.action })) {
    return null;
  }
  // Every plugin-handled message action passes here (agent message tool,
  // CLI, gateway `message.action`), so the outbound sending hooks run here for
  // the message-carrying ones. A caller that already mediated (the core send
  // action) runs this inside the mediated scope and is not mediated twice.
  if (!shouldMediateMessageAction(ctx.action)) {
    return await plugin.actions.handleAction(ctx);
  }
  await mediateMessageActionArgs({
    cfg: ctx.cfg,
    channel: ctx.channel,
    action: ctx.action,
    args: ctx.params,
    accountId: ctx.accountId ?? undefined,
    agentId: ctx.agentId ?? undefined,
    mediaAccess: ctx.mediaAccess,
  });
  const handleAction = plugin.actions.handleAction;
  return await runAsMediatedOutboundSend(() => handleAction(ctx));
}
