// Minimal Ollama client for the secretary's draft-composition step.
//
// Goes through the egress-guarded global fetch — the allowlist must
// include the loopback host the Ollama daemon binds to (default
// 127.0.0.1, override via OLLAMA_HOST). If the operator has an Ollama
// running on a remote machine they must add that hostname to
// policy.allowedHosts AND accept the egress audit trail.
//
// We deliberately do NOT route the LLM call through the SkillGate.
// Ollama is a model provider, not a tool with corpus side-effects; the
// paper's biconditional projection is over capabilities that mutate
// external state, not over inference calls. The LLM is treated as a
// pure function for projection purposes — the secretary's tool wrappers
// are what cross the gate.

const DEFAULT_HOST = "127.0.0.1:11434";

function resolveBase(env: NodeJS.ProcessEnv): string {
  const raw =
    env.ENCLAWED_OLLAMA_API_BASE ?? env.OPENCLAW_OLLAMA_API_BASE ?? env.OLLAMA_HOST ?? DEFAULT_HOST;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }
  return `http://${raw}`;
}

export type OllamaChatMessage = Readonly<{
  role: "system" | "user" | "assistant";
  content: string;
}>;

// Tool-use types. Mirrors Ollama's /api/chat tools contract; the
// secretary's daily loop hands the model a list of these and parses
// any tool_calls returned in the response.
export type OllamaToolSchema = Readonly<{
  type: "function";
  function: Readonly<{
    name: string;
    description: string;
    parameters: object;
  }>;
}>;

export type OllamaToolCall = Readonly<{
  /** Optional Ollama-assigned id. May be absent on local models. */
  id?: string;
  function: Readonly<{
    name: string;
    /**
     * Parsed argument object. Ollama returns this as either a JSON
     * object directly OR a JSON-string; chatWithTools normalises to
     * an object before returning so callers never have to re-parse.
     */
    arguments: Record<string, unknown>;
  }>;
}>;

export type OllamaToolResultMessage = Readonly<{
  role: "tool";
  /** The tool's name; Ollama uses this to pair the result with the call. */
  name?: string;
  /** Free-form string result the model will see on the next pass. */
  content: string;
}>;

export type OllamaAssistantWithToolCalls = Readonly<{
  role: "assistant";
  content: string;
  tool_calls?: ReadonlyArray<OllamaToolCall>;
}>;

export type OllamaMessage =
  | OllamaChatMessage
  | OllamaAssistantWithToolCalls
  | OllamaToolResultMessage;

export type OllamaChatOptions = Readonly<{
  model: string;
  messages: ReadonlyArray<OllamaChatMessage>;
  /** Sampling temperature. Default 0.2 (the secretary wants reproducible drafts). */
  temperature?: number;
  /** Hard cap on response tokens. Default 512 — drafts are short. */
  numPredict?: number;
  /** Per-request timeout. Default 60s. */
  timeoutMs?: number;
}>;

export type OllamaChatWithToolsOptions = Readonly<{
  model: string;
  messages: ReadonlyArray<OllamaMessage>;
  tools: ReadonlyArray<OllamaToolSchema>;
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
}>;

export type OllamaToolChatResult = Readonly<{
  content: string;
  toolCalls: ReadonlyArray<OllamaToolCall>;
}>;

export class OllamaClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {}) {
    this.base = resolveBase(opts.env ?? process.env);
    // We do NOT capture an unguarded fetch here — using globalThis.fetch
    // means we go through whatever guard installEgressGuard() pinned.
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  apiBase(): string {
    return this.base;
  }

  async ping(timeoutMs = 5_000): Promise<{ ok: boolean; version: string | null; reason?: string }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await this.fetchImpl(`${this.base}/api/version`, { signal: ctrl.signal });
      if (!r.ok) {
        return { ok: false, version: null, reason: `HTTP ${r.status}` };
      }
      const body = (await r.json()) as { version?: unknown };
      const v = typeof body.version === "string" ? body.version : null;
      return { ok: true, version: v };
    } catch (err) {
      return { ok: false, version: null, reason: (err as Error).message };
    } finally {
      clearTimeout(t);
    }
  }

  async chatWithTools(opts: OllamaChatWithToolsOptions): Promise<OllamaToolChatResult> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 90_000);
    try {
      const r = await this.fetchImpl(`${this.base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          tools: opts.tools,
          stream: false,
          options: {
            temperature: opts.temperature ?? 0.2,
            num_predict: opts.numPredict ?? 1024,
          },
        }),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`ollama chatWithTools HTTP ${r.status}: ${text.slice(0, 200)}`);
      }
      const body = (await r.json()) as {
        message?: {
          content?: unknown;
          tool_calls?: unknown;
        };
      };
      const content = typeof body.message?.content === "string" ? body.message.content : "";
      const rawCalls = Array.isArray(body.message?.tool_calls)
        ? (body.message?.tool_calls as unknown[])
        : [];
      const toolCalls: OllamaToolCall[] = [];
      for (const raw of rawCalls) {
        if (!raw || typeof raw !== "object") {
          continue;
        }
        const rec = raw as { id?: unknown; function?: unknown };
        const fn = rec.function as { name?: unknown; arguments?: unknown } | undefined;
        if (!fn || typeof fn.name !== "string") {
          continue;
        }
        // Ollama returns arguments as either a parsed object or a
        // JSON string (depending on model + version). Normalise to
        // a Record so callers don't have to branch.
        let args: Record<string, unknown> = {};
        if (fn.arguments && typeof fn.arguments === "object") {
          args = fn.arguments as Record<string, unknown>;
        } else if (typeof fn.arguments === "string") {
          try {
            const parsed = JSON.parse(fn.arguments);
            if (parsed && typeof parsed === "object") {
              args = parsed as Record<string, unknown>;
            }
          } catch {
            // Leave args empty; downstream validation will reject the call.
          }
        }
        toolCalls.push(
          Object.freeze({
            ...(typeof rec.id === "string" ? { id: rec.id } : {}),
            function: Object.freeze({ name: fn.name, arguments: Object.freeze(args) }),
          }),
        );
      }
      return Object.freeze({ content, toolCalls: Object.freeze(toolCalls) });
    } finally {
      clearTimeout(t);
    }
  }

  async chat(opts: OllamaChatOptions): Promise<string> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
    try {
      const r = await this.fetchImpl(`${this.base}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          messages: [...opts.messages],
          stream: false,
          options: {
            temperature: opts.temperature ?? 0.2,
            num_predict: opts.numPredict ?? 512,
          },
        }),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`ollama chat HTTP ${r.status}: ${text.slice(0, 200)}`);
      }
      const body = (await r.json()) as {
        message?: { content?: unknown };
        response?: unknown;
      };
      const content =
        typeof body.message?.content === "string"
          ? body.message.content
          : typeof body.response === "string"
            ? body.response
            : "";
      if (!content) {
        throw new Error("ollama chat returned empty content");
      }
      return content;
    } finally {
      clearTimeout(t);
    }
  }
}
