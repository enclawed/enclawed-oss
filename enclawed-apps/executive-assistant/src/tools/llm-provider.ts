// The seam between the executive assistant and whatever model answers it.
//
// The app was written against OllamaClient directly, but the coupling turned
// out to be four methods -- chat, chatWithTools, ping, apiBase -- so provider
// support is an interface, not a rewrite. OllamaClient already satisfies this
// shape structurally; the cloud providers below implement the same contract
// over their own wire formats.
//
// Two properties this seam must preserve, because the security posture rests
// on them:
//
//   1. `chat()` has NO tool-call surface. Stage-0, the prompt-injection
//      judge, calls it precisely because a hijacked classifier then cannot
//      send mail, touch the calendar, or fetch a URL -- there is no
//      mechanism, not merely no permission. A provider that quietly enables
//      tools inside chat() would remove that guarantee without any call site
//      changing.
//
//   2. Every request goes through `globalThis.fetch` at call time, never a
//      reference captured at construction. The egress guard installs itself
//      by replacing that global; capturing it early would route provider
//      traffic around the allowlist.
//
// A cloud provider is a posture change, not a setting. Choosing Anthropic or
// OpenAI means inbound mail leaves the machine -- including the text Stage-0
// exists to screen, since the judge is itself a model call. That belongs in
// front of the user in the setup flow, not in a config file.

import type {
  OllamaChatMessage,
  OllamaChatOptions,
  OllamaChatWithToolsOptions,
  OllamaToolCall,
  OllamaToolChatResult,
} from "./ollama-client.js";

/** Where a provider's traffic goes, and whether that is off-machine. */
export type ProviderLocality = "local" | "cloud";

export type ProviderHealth = Readonly<{
  ok: boolean;
  /** Version or model-family string when the provider reports one. */
  version: string | null;
  reason?: string;
}>;

/**
 * The whole surface the executive assistant uses. Deliberately small: every
 * method here is one the app already called on OllamaClient.
 */
export interface LlmProvider {
  /** Stable id for logs, audit records and settings. */
  readonly id: string;
  /** Shown to the user, and the basis of the warning when it is "cloud". */
  readonly locality: ProviderLocality;
  /** Endpoint being talked to, for diagnostics and the status panel. */
  apiBase(): string;
  /** Reachability check for setup and status. Never throws. */
  ping(timeoutMs?: number): Promise<ProviderHealth>;
  /** Single-turn completion with no tool surface. */
  chat(opts: OllamaChatOptions): Promise<string>;
  /** Tool-calling completion. Never used by the classifier. */
  chatWithTools(opts: OllamaChatWithToolsOptions): Promise<OllamaToolChatResult>;
}

/** Thrown for a provider-side failure the caller may want to report verbatim. */
export class ProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  constructor(provider: string, message: string, status?: number) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }
}

function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/**
 * Split the leading system messages from the rest.
 *
 * Ollama takes the system turn inline in the message list; Anthropic takes it
 * as a top-level field and rejects a system role in `messages`. The app
 * always puts its system prompt first, so this is a partition rather than a
 * filter -- a system message appearing later would be an injection attempt or
 * a bug, and either way is not silently moved to the front.
 */
function splitSystem(messages: ReadonlyArray<OllamaChatMessage>): {
  system: string;
  rest: ReadonlyArray<OllamaChatMessage>;
} {
  let i = 0;
  const system: string[] = [];
  while (i < messages.length && messages[i].role === "system") {
    system.push(messages[i].content);
    i++;
  }
  return { system: system.join("\n\n"), rest: messages.slice(i) };
}

/** Anthropic wants a media type with the base64 body; sanitised output is PNG. */
const SANITISED_IMAGE_MEDIA_TYPE = "image/png";

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

export type AnthropicOptions = {
  apiKey: string;
  /** Override for testing or a proxy. */
  baseUrl?: string;
  /** Anthropic requires an explicit max_tokens; the app's cap is per call. */
  defaultMaxTokens?: number;
};

export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";
  readonly locality: ProviderLocality = "cloud";
  private readonly apiKey: string;
  private readonly base: string;
  private readonly defaultMaxTokens: number;

  constructor(opts: AnthropicOptions) {
    this.apiKey = opts.apiKey;
    this.base = (opts.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
    this.defaultMaxTokens = opts.defaultMaxTokens ?? 1024;
  }

  apiBase(): string {
    return this.base;
  }

  async ping(timeoutMs = 5_000): Promise<ProviderHealth> {
    // There is no unauthenticated health endpoint, and a models list is the
    // cheapest call that proves the key works as well as that the host is
    // reachable -- which is what setup actually needs to know.
    const { signal, done } = timeoutSignal(timeoutMs);
    try {
      const r = await globalThis.fetch(`${this.base}/v1/models`, {
        method: "GET",
        headers: this.headers(),
        signal,
      });
      if (!r.ok) {
        return { ok: false, version: null, reason: `HTTP ${r.status}` };
      }
      return { ok: true, version: "anthropic" };
    } catch (err) {
      return { ok: false, version: null, reason: (err as Error).message };
    } finally {
      done();
    }
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  private body(opts: {
    model: string;
    messages: ReadonlyArray<OllamaChatMessage>;
    temperature?: number;
    numPredict?: number;
  }): Record<string, unknown> {
    const { system, rest } = splitSystem(opts.messages);
    return {
      model: opts.model,
      max_tokens: opts.numPredict ?? this.defaultMaxTokens,
      temperature: opts.temperature ?? 0.2,
      ...(system ? { system } : {}),
      messages: rest.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: [
          ...(m.images ?? []).map((data) => ({
            type: "image",
            source: { type: "base64", media_type: SANITISED_IMAGE_MEDIA_TYPE, data },
          })),
          { type: "text", text: m.content },
        ],
      })),
    };
  }

  async chat(opts: OllamaChatOptions): Promise<string> {
    const { signal, done } = timeoutSignal(opts.timeoutMs ?? 60_000);
    try {
      const r = await globalThis.fetch(`${this.base}/v1/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.body(opts)),
        signal,
      });
      if (!r.ok) {
        throw new ProviderError(this.id, await errorText(r), r.status);
      }
      const j = (await r.json()) as { content?: Array<{ type: string; text?: string }> };
      return (j.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
    } finally {
      done();
    }
  }

  async chatWithTools(opts: OllamaChatWithToolsOptions): Promise<OllamaToolChatResult> {
    const { signal, done } = timeoutSignal(opts.timeoutMs ?? 90_000);
    try {
      // The app's tool schemas are OpenAI-shaped ({type:"function",function:
      // {name,description,parameters}}); Anthropic takes the same JSON Schema
      // under different key names.
      const tools = opts.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
      const chatMessages = opts.messages.filter(
        (m): m is OllamaChatMessage =>
          m.role === "system" || m.role === "user" || m.role === "assistant",
      );
      const r = await globalThis.fetch(`${this.base}/v1/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          ...this.body({
            model: opts.model,
            messages: chatMessages,
            temperature: opts.temperature,
            numPredict: opts.numPredict,
          }),
          tools,
        }),
        signal,
      });
      if (!r.ok) {
        throw new ProviderError(this.id, await errorText(r), r.status);
      }
      const j = (await r.json()) as {
        content?: Array<{
          type: string;
          text?: string;
          name?: string;
          input?: Record<string, unknown>;
        }>;
      };
      const blocks = j.content ?? [];
      const toolCalls: OllamaToolCall[] = blocks
        .filter((b) => b.type === "tool_use" && typeof b.name === "string")
        .map((b) => ({ function: { name: b.name as string, arguments: b.input ?? {} } }));
      const content = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      return Object.freeze({ content, toolCalls: Object.freeze(toolCalls) });
    } finally {
      done();
    }
  }
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

export type OpenAiOptions = {
  apiKey: string;
  baseUrl?: string;
  /** Sent as OpenAI-Organization when present. */
  organization?: string;
};

export class OpenAiProvider implements LlmProvider {
  readonly id = "openai";
  readonly locality: ProviderLocality = "cloud";
  private readonly apiKey: string;
  private readonly base: string;
  private readonly organization?: string;

  constructor(opts: OpenAiOptions) {
    this.apiKey = opts.apiKey;
    this.base = (opts.baseUrl ?? "https://api.openai.com").replace(/\/+$/, "");
    if (opts.organization) {
      this.organization = opts.organization;
    }
  }

  apiBase(): string {
    return this.base;
  }

  async ping(timeoutMs = 5_000): Promise<ProviderHealth> {
    const { signal, done } = timeoutSignal(timeoutMs);
    try {
      const r = await globalThis.fetch(`${this.base}/v1/models`, {
        method: "GET",
        headers: this.headers(),
        signal,
      });
      if (!r.ok) {
        return { ok: false, version: null, reason: `HTTP ${r.status}` };
      }
      return { ok: true, version: "openai" };
    } catch (err) {
      return { ok: false, version: null, reason: (err as Error).message };
    } finally {
      done();
    }
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
      ...(this.organization ? { "openai-organization": this.organization } : {}),
    };
  }

  private messages(messages: ReadonlyArray<OllamaChatMessage>): Array<Record<string, unknown>> {
    return messages.map((m) => {
      if (!m.images || m.images.length === 0) {
        return { role: m.role, content: m.content };
      }
      return {
        role: m.role,
        content: [
          { type: "text", text: m.content },
          ...m.images.map((data) => ({
            type: "image_url",
            image_url: { url: `data:${SANITISED_IMAGE_MEDIA_TYPE};base64,${data}` },
          })),
        ],
      };
    });
  }

  async chat(opts: OllamaChatOptions): Promise<string> {
    const { signal, done } = timeoutSignal(opts.timeoutMs ?? 60_000);
    try {
      const r = await globalThis.fetch(`${this.base}/v1/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: opts.model,
          messages: this.messages(opts.messages),
          temperature: opts.temperature ?? 0.2,
          max_completion_tokens: opts.numPredict ?? 512,
        }),
        signal,
      });
      if (!r.ok) {
        throw new ProviderError(this.id, await errorText(r), r.status);
      }
      const j = (await r.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      return j.choices?.[0]?.message?.content ?? "";
    } finally {
      done();
    }
  }

  async chatWithTools(opts: OllamaChatWithToolsOptions): Promise<OllamaToolChatResult> {
    const { signal, done } = timeoutSignal(opts.timeoutMs ?? 90_000);
    try {
      const chatMessages = opts.messages.filter(
        (m): m is OllamaChatMessage =>
          m.role === "system" || m.role === "user" || m.role === "assistant",
      );
      const r = await globalThis.fetch(`${this.base}/v1/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: opts.model,
          messages: this.messages(chatMessages),
          temperature: opts.temperature ?? 0.2,
          max_completion_tokens: opts.numPredict ?? 1024,
          // The app's schemas are already OpenAI-shaped.
          tools: opts.tools,
        }),
        signal,
      });
      if (!r.ok) {
        throw new ProviderError(this.id, await errorText(r), r.status);
      }
      const j = (await r.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
          };
        }>;
      };
      const msg = j.choices?.[0]?.message;
      const toolCalls: OllamaToolCall[] = (msg?.tool_calls ?? []).flatMap((c) => {
        const name = c.function?.name;
        if (!name) {
          return [];
        }
        // OpenAI returns arguments as a JSON *string*; Ollama returns an
        // object. Normalising here keeps the call sites provider-blind, and a
        // model that emits malformed JSON yields no call rather than a throw.
        let args: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(c.function?.arguments ?? "{}");
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
          return [];
        }
        return [{ function: { name, arguments: args } }];
      });
      return Object.freeze({ content: msg?.content ?? "", toolCalls: Object.freeze(toolCalls) });
    } finally {
      done();
    }
  }
}

async function errorText(r: Response): Promise<string> {
  let detail = "";
  try {
    detail = (await r.text()).slice(0, 300).replace(/\s+/g, " ");
  } catch {
    /* body already consumed or unreadable; the status carries enough */
  }
  return detail ? `HTTP ${r.status}: ${detail}` : `HTTP ${r.status}`;
}
