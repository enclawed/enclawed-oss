// Egress observation of a message action: what the call produces outside the
// host, for the egress action batcher's key (`src/agents/tool-replay.ts`).
//
// The arguments are resolved by the run's own code
// (`resolveMessageActionHandoff`: aliases, `targets`, current-conversation
// defaults, channel, account and target resolution, media and flag
// normalization), so every spelling of one send reaches this module as the
// same hand-off. What leaves from there is up to the channel, and only the
// channel knows which fields of that hand-off reach its platform. So the
// observation is the channel's own declaration of its wire content:
//
//   plugin-handled action   `actions.observeAction(ctx)` with the context
//                           `handleAction` would receive;
//   core send path          `outbound.observeSend(call)` for each adapter
//                           call the delivery would make (planned by the
//                           delivery code itself, with recorders in place of
//                           the adapter's send methods);
//   core poll path          `outbound.observePoll(poll)`.
//
// There is no core fallback. Keeping a field the channel ignores would let a
// sender vary it to choose the order of its sends; dropping a field the
// channel sends would merge different sends. Core cannot know either for a
// channel, so a channel (or one of its calls) without a declaration gives no
// observation, and the batcher refuses the call while it enforces.
//
// Not covered here: the outbound sending hooks (`message_sending`,
// `media_sending`) run after this point and may rewrite the text or media;
// the observation is of the arguments the hooks receive.

import { stableStringify } from "../../agents/stable-stringify.js";
import type { ToolObservation } from "../../agents/tool-replay.js";
import { getChannelPlugin } from "../../channels/plugins/index.js";
import type { ChannelMessageObservation } from "../../channels/plugins/types.public.js";
import { resolveOutboundChannelPlugin } from "./channel-resolution.js";
import {
  resolveMessageActionHandoff,
  type MessageActionHandoff,
  type RunMessageActionParams,
} from "./message-action-runner.js";
import { planSendMessageDelivery, planSendPoll } from "./message.js";

/** The batcher's `send` observation shape. */
export type MessageSendObservation = Extract<ToolObservation, { type: "send" }>;

/** Returned for a call that sends nothing; the batcher has nothing to key. */
export const MESSAGE_ACTION_SENDS_NOTHING: { type: "none" } = { type: "none" };

function validChannelObservation(value: unknown): ChannelMessageObservation | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const { target, content } = value as { target?: unknown; content?: unknown };
  if (typeof target !== "string" || !target || content === undefined) {
    return null;
  }
  // As JSON: an absent field and an undefined one are the same declaration.
  let json: unknown;
  try {
    const text = JSON.stringify(content);
    json = text === undefined ? undefined : JSON.parse(text);
  } catch {
    return null;
  }
  return json === undefined ? null : { target, content: json };
}

/** Combine one or more channel observations into the batcher's `send` shape. */
export function combineChannelObservations(
  channel: string,
  observations: readonly ChannelMessageObservation[],
): MessageSendObservation | null {
  if (observations.length === 0) {
    return null;
  }
  const targets: string[] = [];
  for (const observation of observations) {
    if (!targets.includes(observation.target)) {
      targets.push(observation.target);
    }
  }
  return {
    type: "send",
    target: stableStringify({ channel, to: targets }),
    content: stableStringify(
      observations.map((observation) => ({ to: observation.target, c: observation.content })),
    ),
  };
}

/** The observation of one resolved hand-off, or null when it is not declared. */
export async function observeMessageActionHandoff(
  handoff: MessageActionHandoff,
): Promise<MessageSendObservation | { type: "none" } | null> {
  switch (handoff.kind) {
    case "none":
      return MESSAGE_ACTION_SENDS_NOTHING;
    case "broadcast":
      // Per-target outcomes (a failure on one target does not stop the
      // others); not described as one observation.
      return null;
    case "plugin": {
      const plugin =
        handoff.ctx.action === "send" || handoff.ctx.action === "poll"
          ? getChannelPlugin(handoff.channel)
          : resolveOutboundChannelPlugin({ channel: handoff.channel, cfg: handoff.ctx.cfg });
      const observeAction = plugin?.actions?.observeAction;
      if (!observeAction) {
        return null;
      }
      const observed = validChannelObservation(await observeAction(handoff.ctx));
      return observed ? combineChannelObservations(handoff.channel, [observed]) : null;
    }
    case "core-send": {
      const planned = await planSendMessageDelivery({
        cfg: handoff.cfg,
        channel: handoff.channel,
        ...handoff.send,
      });
      const observeSend = planned?.outbound.observeSend;
      if (!planned || !observeSend || planned.calls.length === 0) {
        return null;
      }
      const observations: ChannelMessageObservation[] = [];
      for (const call of planned.calls) {
        const observed = validChannelObservation(await observeSend(call));
        if (!observed) {
          // One undeclared call leaves the whole send undeclared.
          return null;
        }
        observations.push(observed);
      }
      return combineChannelObservations(handoff.channel, observations);
    }
    case "core-poll": {
      const planned = await planSendPoll({
        cfg: handoff.cfg,
        channel: handoff.channel,
        ...handoff.poll,
      });
      const observePoll = planned?.outbound.observePoll;
      if (!planned || !observePoll) {
        return null;
      }
      const observed = validChannelObservation(await observePoll(planned.poll));
      return observed ? combineChannelObservations(handoff.channel, [observed]) : null;
    }
  }
  return null;
}

/**
 * The egress observation of a message action, or null when the call sends
 * nothing (dry run) or its channel does not declare what it sends. A call
 * that would fail before sending also gives null (it sends nothing).
 */
export async function observeMessageAction(
  input: RunMessageActionParams,
): Promise<MessageSendObservation | { type: "none" } | null> {
  let handoff: MessageActionHandoff;
  try {
    handoff = await resolveMessageActionHandoff(input);
  } catch {
    return null;
  }
  return await observeMessageActionHandoff(handoff);
}
