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
