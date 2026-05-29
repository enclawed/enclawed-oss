import { resolveHumanDelayConfig } from "@enclawed/plugin-sdk/agent-runtime";
import { createChannelReplyPipeline } from "@enclawed/plugin-sdk/channel-reply-pipeline";
import { resolveChannelStreamingBlockEnabled } from "@enclawed/plugin-sdk/channel-streaming";
import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { getAgentScopedMediaLocalRoots } from "@enclawed/plugin-sdk/media-runtime";
import { resolveChunkMode, resolveTextChunkLimit } from "@enclawed/plugin-sdk/reply-chunking";
import type { createSubsystemLogger } from "@enclawed/plugin-sdk/runtime-env";
import { logVerbose } from "@enclawed/plugin-sdk/runtime-env";
import { resolveDiscordMaxLinesPerMessage } from "../accounts.js";
import type {
  ButtonInteraction,
  CommandInteraction,
  StringSelectMenuInteraction,
} from "../internal/discord.js";
import type { DiscordChannelConfigResolved } from "./allow-list.js";
import type { buildDiscordNativeCommandContext } from "./native-command-context.js";
import {
  deliverDiscordInteractionReply,
  isDiscordUnknownInteraction,
  safeDiscordInteractionCall,
} from "./native-command-reply.js";
import { nativeCommandRuntime } from "./native-command.runtime.js";
import type { DiscordConfig } from "./native-command.types.js";

type NativeCommandEffectiveRoute = {
  accountId: string;
  agentId: string;
};

export async function dispatchDiscordNativeAgentReply(params: {
  cfg: EnclawedConfig;
  discordConfig: DiscordConfig;
  accountId: string;
  interaction: CommandInteraction | ButtonInteraction | StringSelectMenuInteraction;
  ctxPayload: ReturnType<typeof buildDiscordNativeCommandContext>;
  effectiveRoute: NativeCommandEffectiveRoute;
  channelConfig: DiscordChannelConfigResolved | null;
  mediaLocalRoots: ReturnType<typeof getAgentScopedMediaLocalRoots>;
  preferFollowUp: boolean;
  responseEphemeral?: boolean;
  suppressReplies?: boolean;
  log: ReturnType<typeof createSubsystemLogger>;
}): Promise<void> {
  const { onModelSelected, ...replyPipeline } = createChannelReplyPipeline({
    cfg: params.cfg,
    agentId: params.effectiveRoute.agentId,
    channel: "discord",
    accountId: params.effectiveRoute.accountId,
  });
  const blockStreamingEnabled = resolveChannelStreamingBlockEnabled(params.discordConfig);

  let didReply = false;
  const dispatchResult = await nativeCommandRuntime.dispatchReplyWithDispatcher({
    ctx: params.ctxPayload,
    cfg: params.cfg,
    dispatcherOptions: {
      ...replyPipeline,
      humanDelay: resolveHumanDelayConfig(params.cfg, params.effectiveRoute.agentId),
      deliver: async (payload) => {
        if (params.suppressReplies) {
          return;
        }
        try {
          await deliverDiscordInteractionReply({
            interaction: params.interaction,
            payload,
            mediaLocalRoots: params.mediaLocalRoots,
            textLimit: resolveTextChunkLimit(params.cfg, "discord", params.accountId, {
              fallbackLimit: 2000,
            }),
            maxLinesPerMessage: resolveDiscordMaxLinesPerMessage({
              cfg: params.cfg,
              discordConfig: params.discordConfig,
              accountId: params.accountId,
            }),
            preferFollowUp: params.preferFollowUp || didReply,
            responseEphemeral: params.responseEphemeral,
            chunkMode: resolveChunkMode(params.cfg, "discord", params.accountId),
          });
        } catch (error) {
          if (isDiscordUnknownInteraction(error)) {
            logVerbose("discord: interaction reply skipped (interaction expired)");
            return;
          }
          throw error;
        }
        didReply = true;
      },
      onError: (err, info) => {
        const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
        params.log.error(`discord slash ${info.kind} reply failed: ${message}`);
      },
    },
    replyOptions: {
      skillFilter: params.channelConfig?.skills,
      disableBlockStreaming:
        typeof blockStreamingEnabled === "boolean" ? !blockStreamingEnabled : undefined,
      onModelSelected,
    },
  });

  if (
    params.suppressReplies ||
    didReply ||
    dispatchResult.counts.final !== 0 ||
    dispatchResult.counts.block !== 0 ||
    dispatchResult.counts.tool !== 0
  ) {
    return;
  }

  await safeDiscordInteractionCall("interaction empty fallback", async () => {
    const payload = {
      content: "✅ Done.",
      ephemeral: true,
    };
    if (params.preferFollowUp) {
      await params.interaction.followUp(payload);
      return;
    }
    await params.interaction.reply(payload);
  });
}
