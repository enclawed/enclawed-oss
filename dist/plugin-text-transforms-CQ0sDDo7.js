import { getCurrentSystemPrompt, getCurrentTools, normalizeContext } from "@mariozechner/pi-ai";
//#region src/agents/transcript-context.ts
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
function getTranscriptSystemPrompt(context) {
	const prompt = getCurrentSystemPrompt(context.messages);
	return prompt.length > 0 ? prompt : void 0;
}
/** Current tool declarations, or undefined when the transcript declares none. */
function getTranscriptTools(context) {
	const tools = getCurrentTools(context.messages);
	return tools.length > 0 ? tools : void 0;
}
/** Conversation messages without any system message (prompt/tool state). */
function getTranscriptConversationMessages(context) {
	return context.messages.filter((message) => message.role !== "system");
}
/**
* Collapsed request view for transports that carry the prompt and tool list
* outside the message list (every Enclawed-owned transport): the replayed
* current prompt, the current tools, and the non-system messages. This is the
* exact shape pi-ai <= 0.85 handed to stream functions, so request assembly
* from it is byte-identical to the pre-transcript behavior.
*/
function toRequestContext(context) {
	const systemPrompt = getTranscriptSystemPrompt(context);
	const tools = getTranscriptTools(context);
	return {
		...systemPrompt !== void 0 ? { systemPrompt } : {},
		messages: getTranscriptConversationMessages(context),
		...tools !== void 0 ? { tools } : {}
	};
}
function mapTextContent(content, transform) {
	if (typeof content === "string") return transform(content);
	return content.map((part) => ({
		...part,
		text: transform(part.text)
	}));
}
function mapSystemMessageText(message, transform) {
	const sections = message.sections ? Object.fromEntries(Object.entries(message.sections).map(([name, value]) => [name, value === null ? null : transform(value)])) : void 0;
	return {
		...message,
		content: mapTextContent(message.content, transform),
		...sections ? { sections } : {}
	};
}
/**
* Apply a text transform to every piece of system-prompt text (base content,
* appended instructions, and section bodies) without changing the transcript
* structure or tool declarations. Returns the input unchanged when it has no
* system messages.
*/
function mapTranscriptSystemPromptText(context, transform) {
	if (!context.messages.some((message) => message.role === "system")) return context;
	return normalizeContext({ messages: context.messages.map((message) => message.role === "system" ? mapSystemMessageText(message, transform) : message) });
}
/**
* Collapse the system messages into one leading message holding `systemPrompt`
* (exactly) and the current tools. Used where a caller owns the whole prompt.
*/
function replaceTranscriptSystemPrompt(context, systemPrompt) {
	const tools = getTranscriptTools(context);
	return normalizeContext({
		...systemPrompt ? { systemPrompt } : {},
		...tools ? { tools } : {},
		messages: getTranscriptConversationMessages(context)
	});
}
//#endregion
//#region src/agents/plugin-text-transforms.ts
function mergePluginTextTransforms(...transforms) {
	const input = transforms.flatMap((entry) => entry?.input ?? []);
	const output = transforms.flatMap((entry) => entry?.output ?? []);
	if (input.length === 0 && output.length === 0) return;
	return {
		...input.length > 0 ? { input } : {},
		...output.length > 0 ? { output } : {}
	};
}
function applyPluginTextReplacements(text, replacements) {
	if (!replacements || replacements.length === 0 || !text) return text;
	let next = text;
	for (const replacement of replacements) next = next.replace(replacement.from, replacement.to);
	return next;
}
function isRecord(value) {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function transformContentText(content, replacements) {
	if (typeof content === "string") return applyPluginTextReplacements(content, replacements);
	if (Array.isArray(content)) return content.map((entry) => transformContentText(entry, replacements));
	if (!isRecord(content)) return content;
	const next = { ...content };
	if (typeof next.text === "string") next.text = applyPluginTextReplacements(next.text, replacements);
	if (Object.hasOwn(next, "content")) next.content = transformContentText(next.content, replacements);
	return next;
}
function transformMessageText(message, replacements) {
	if (!isRecord(message)) return message;
	const next = { ...message };
	if (Object.hasOwn(next, "content")) next.content = transformContentText(next.content, replacements);
	if (typeof next.errorMessage === "string") next.errorMessage = applyPluginTextReplacements(next.errorMessage, replacements);
	return next;
}
function transformStreamContextText(context, replacements, options) {
	if (!replacements || replacements.length === 0) return context;
	const withMessages = normalizeContext({ messages: context.messages.map((message) => message.role === "system" ? message : transformMessageText(message, replacements)) });
	return options?.systemPrompt !== false ? mapTranscriptSystemPromptText(withMessages, (text) => applyPluginTextReplacements(text, replacements)) : withMessages;
}
function transformAssistantEventText(event, replacements) {
	if (!isRecord(event) || !replacements || replacements.length === 0) return event;
	const next = { ...event };
	if (next.type === "text_delta" && typeof next.delta === "string") next.delta = applyPluginTextReplacements(next.delta, replacements);
	if (next.type === "text_end" && typeof next.content === "string") next.content = applyPluginTextReplacements(next.content, replacements);
	if (Object.hasOwn(next, "partial")) next.partial = transformMessageText(next.partial, replacements);
	if (Object.hasOwn(next, "message")) next.message = transformMessageText(next.message, replacements);
	if (Object.hasOwn(next, "error")) next.error = transformMessageText(next.error, replacements);
	return next;
}
function wrapStreamTextTransforms(stream, replacements) {
	if (!replacements || replacements.length === 0) return stream;
	const originalResult = stream.result.bind(stream);
	stream.result = async () => transformMessageText(await originalResult(), replacements);
	const originalAsyncIterator = stream[Symbol.asyncIterator].bind(stream);
	stream[Symbol.asyncIterator] = function() {
		const iterator = originalAsyncIterator();
		return {
			async next() {
				const result = await iterator.next();
				return result.done ? result : {
					done: false,
					value: transformAssistantEventText(result.value, replacements)
				};
			},
			async return(value) {
				return iterator.return?.(value) ?? {
					done: true,
					value: void 0
				};
			},
			async throw(error) {
				return iterator.throw?.(error) ?? {
					done: true,
					value: void 0
				};
			},
			[Symbol.asyncIterator]() {
				return this;
			}
		};
	};
	return stream;
}
function wrapStreamFnTextTransforms(params) {
	return (model, context, options) => {
		const nextContext = transformStreamContextText(context, params.input, { systemPrompt: params.transformSystemPrompt });
		const maybeStream = params.streamFn(model, nextContext, options);
		if (maybeStream && typeof maybeStream === "object" && "then" in maybeStream) return Promise.resolve(maybeStream).then((stream) => wrapStreamTextTransforms(stream, params.output));
		return wrapStreamTextTransforms(maybeStream, params.output);
	};
}
//#endregion
export { mapTranscriptSystemPromptText as a, getTranscriptSystemPrompt as i, mergePluginTextTransforms as n, replaceTranscriptSystemPrompt as o, wrapStreamFnTextTransforms as r, toRequestContext as s, applyPluginTextReplacements as t };
