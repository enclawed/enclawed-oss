import { type Context, type Message, type Tool, type TranscriptContext } from "@mariozechner/pi-ai";
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
export declare function getTranscriptSystemPrompt(context: TranscriptContext): string | undefined;
/** Current tool declarations, or undefined when the transcript declares none. */
export declare function getTranscriptTools(context: TranscriptContext): Tool[] | undefined;
/** Conversation messages without any system message (prompt/tool state). */
export declare function getTranscriptConversationMessages(context: TranscriptContext): Message[];
/**
 * Collapsed request view for transports that carry the prompt and tool list
 * outside the message list (every Enclawed-owned transport): the replayed
 * current prompt, the current tools, and the non-system messages. This is the
 * exact shape pi-ai <= 0.85 handed to stream functions, so request assembly
 * from it is byte-identical to the pre-transcript behavior.
 */
export declare function toRequestContext(context: TranscriptContext): Context;
/**
 * Apply a text transform to every piece of system-prompt text (base content,
 * appended instructions, and section bodies) without changing the transcript
 * structure or tool declarations. Returns the input unchanged when it has no
 * system messages.
 */
export declare function mapTranscriptSystemPromptText(context: TranscriptContext, transform: (text: string) => string): TranscriptContext;
/**
 * Collapse the system messages into one leading message holding `systemPrompt`
 * (exactly) and the current tools. Used where a caller owns the whole prompt.
 */
export declare function replaceTranscriptSystemPrompt(context: TranscriptContext, systemPrompt: string | undefined): TranscriptContext;
/** Collapse mid-conversation system messages into the leading one (see pi-ai `collapseSystemMessages`). */
export declare function collapseTranscriptSystemMessages(context: TranscriptContext): TranscriptContext;
