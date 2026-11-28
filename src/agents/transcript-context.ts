import {
  collapseSystemMessages,
  getCurrentSystemPrompt,
  getCurrentTools,
  normalizeContext,
  type Context,
  type Message,
  type SystemMessage,
  type TextContent,
  type Tool,
  type TranscriptContext,
} from "@mariozechner/pi-ai";

/**
 * Helpers for pi-ai's normalized `TranscriptContext` (pi-ai >= 0.86).
 *
 * Stream inputs no longer carry `systemPrompt`/`tools` fields: the prompt and
 * tool declarations live in the transcript's `role: "system"` messages (a
 * leading one, plus later patches that append instructions, replace named
 * sections, or add/remove tools). Replaying them in order yields the current
 * prompt and tool set (`getCurrentSystemPrompt` / `getCurrentTools`).
 *
 * Only `normalizeContext()` produces the branded type, so every rewrite below
 * rebuilds the message list and re-brands it through `normalizeContext()`
 * with no `systemPrompt`/`tools` shorthand (which passes the messages through
 * unchanged), keeping the documented construction path.
 */

/** Current system prompt text, or undefined when the transcript declares none. */
export function getTranscriptSystemPrompt(context: TranscriptContext): string | undefined {
  const prompt = getCurrentSystemPrompt(context.messages);
  return prompt.length > 0 ? prompt : undefined;
}

/** Current tool declarations, or undefined when the transcript declares none. */
export function getTranscriptTools(context: TranscriptContext): Tool[] | undefined {
  const tools = getCurrentTools(context.messages);
  return tools.length > 0 ? tools : undefined;
}

/** Conversation messages without any system message (prompt/tool state). */
export function getTranscriptConversationMessages(context: TranscriptContext): Message[] {
  return context.messages.filter((message) => message.role !== "system");
}

/**
 * Collapsed request view for transports that carry the prompt and tool list
 * outside the message list (every Enclawed-owned transport): the replayed
 * current prompt, the current tools, and the non-system messages. This is the
 * exact shape pi-ai <= 0.85 handed to stream functions, so request assembly
 * from it is byte-identical to the pre-transcript behavior.
 */
export function toRequestContext(context: TranscriptContext): Context {
  const systemPrompt = getTranscriptSystemPrompt(context);
  const tools = getTranscriptTools(context);
  return {
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    messages: getTranscriptConversationMessages(context),
    ...(tools !== undefined ? { tools } : {}),
  };
}

function mapTextContent(
  content: SystemMessage["content"],
  transform: (text: string) => string,
): SystemMessage["content"] {
  if (typeof content === "string") {
    return transform(content);
  }
  return content.map((part): TextContent => ({
    ...part,
    text: transform(part.text),
  }));
}

function mapSystemMessageText(
  message: SystemMessage,
  transform: (text: string) => string,
): SystemMessage {
  const sections = message.sections
    ? Object.fromEntries(
        Object.entries(message.sections).map(([name, value]) => [
          name,
          value === null ? null : transform(value),
        ]),
      )
    : undefined;
  return {
    ...message,
    content: mapTextContent(message.content, transform),
    ...(sections ? { sections } : {}),
  };
}

/**
 * Apply a text transform to every piece of system-prompt text (base content,
 * appended instructions, and section bodies) without changing the transcript
 * structure or tool declarations. Returns the input unchanged when it has no
 * system messages.
 */
export function mapTranscriptSystemPromptText(
  context: TranscriptContext,
  transform: (text: string) => string,
): TranscriptContext {
  if (!context.messages.some((message) => message.role === "system")) {
    return context;
  }
  return normalizeContext({
    messages: context.messages.map((message) =>
      message.role === "system" ? mapSystemMessageText(message, transform) : message,
    ),
  });
}

/**
 * Collapse the system messages into one leading message holding `systemPrompt`
 * (exactly) and the current tools. Used where a caller owns the whole prompt.
 */
export function replaceTranscriptSystemPrompt(
  context: TranscriptContext,
  systemPrompt: string | undefined,
): TranscriptContext {
  const tools = getTranscriptTools(context);
  return normalizeContext({
    ...(systemPrompt ? { systemPrompt } : {}),
    ...(tools ? { tools } : {}),
    messages: getTranscriptConversationMessages(context),
  });
}

/** Collapse mid-conversation system messages into the leading one (see pi-ai `collapseSystemMessages`). */
export function collapseTranscriptSystemMessages(context: TranscriptContext): TranscriptContext {
  return collapseSystemMessages(context);
}
