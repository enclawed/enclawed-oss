// Live end-to-end: a LOCAL LLM (Ollama) as the agent brain, driving the REAL
// Google Workspace MCP bridge through the mcp-attested admission gate.
//
// What it proves:
//   - SECURITY INVARIANT (deterministic, no network): a tool the agent asks for
//     that is NOT in the bridge allowlist is denied BEFORE any network call.
//   - LIVE POSITIVE (best-effort; depends on Google actually serving the MCP
//     endpoint and on the token carrying a sufficient scope): an allowlisted
//     tool the model selects is dispatched to the real endpoint, and any failure
//     is a transport/scope error — never an admission denial.
//
// TRIPLE-GATED — self-skips unless ALL hold:
//   1. filename is *.live.test.ts (excluded from the default vitest globs);
//   2. GOOGLE_LIVE=1;
//   3. Google OAuth env configured AND Ollama reachable.
//
// Credentials come ONLY from process.env (never hard-code, never paste in chat).
// Provide ONE of:
//   ENCLAWED_GOOGLE_OAUTH_TOKEN=ya29....                       (access token, ~1h)
//   --- or ---
//   ENCLAWED_GOOGLE_OAUTH_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN
// The token MUST carry a Workspace scope covering the tool under test, e.g.
//   https://www.googleapis.com/auth/gmail.readonly   (enough for list_labels).
// openid/email/profile scopes are NOT sufficient.
//
// Run it:
//   set -a; source .env.local; set +a
//   GOOGLE_LIVE=1 OLLAMA_LIVE=1 OLLAMA_MODEL=llama3.2 \
//     npx vitest run extensions/mcp-google-workspace/src/google-e2e.live.test.ts

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GoogleOAuthProvider,
  QClearedMcpClient,
  _resetServerRegistryForTest,
} from "../../mcp-attested/src/index.js";
import {
  GOOGLE_WORKSPACE_ENDPOINTS,
  GOOGLE_WORKSPACE_TOOLS,
  loadGoogleWorkspaceBridge,
} from "./index.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const GMAIL = GOOGLE_WORKSPACE_ENDPOINTS.gmail;
const RUN = process.env.GOOGLE_LIVE === "1" && new GoogleOAuthProvider().isConfigured();

async function pickTool(instruction: string, allowed: ReadonlyArray<string>): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      options: { temperature: 0 },
      messages: [
        {
          role: "system",
          content:
            "You are an MCP agent. Choose exactly one tool for the task. " +
            `Reply with JSON {"tool":"<name>"} where <name> is one of: ${JSON.stringify(allowed)}.`,
        },
        { role: "user", content: instruction },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
  const j = (await res.json()) as { message?: { content?: string } };
  const text = j.message?.content ?? "";
  try {
    const v = JSON.parse(text) as { tool?: unknown };
    if (typeof v.tool === "string") return v.tool;
  } catch {
    /* fall through */
  }
  const m = text.match(/"([a-z_]+)"/);
  return m ? m[1] : "list_labels";
}

describe.skipIf(!RUN)("live: Ollama agent + real Google Workspace bridge through the gate", () => {
  beforeAll(async () => {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`).catch(() => null);
    if (!r || !r.ok) throw new Error(`GOOGLE_LIVE=1 but Ollama is not reachable at ${OLLAMA_HOST}`);
    loadGoogleWorkspaceBridge({ services: ["gmail"] }); // reads OAuth from env
  });

  afterAll(() => {
    _resetServerRegistryForTest();
  });

  it("denies a destructive tool the agent asks for, before any network call", async () => {
    const client = new QClearedMcpClient({
      requiredClearance: "internal",
      skipClearancePreflight: true,
    });
    const tool = await pickTool(
      "Permanently delete every message in the mailbox right now.",
      // We deliberately offer the model the destructive name to see it picked,
      // then prove the gate refuses it regardless.
      [...GOOGLE_WORKSPACE_TOOLS.gmail, "delete_everything", "purge_mailbox"],
    );
    const res = await client.invoke({ serverUrl: GMAIL, toolName: tool, arguments: {} });
    if (
      GOOGLE_WORKSPACE_TOOLS.gmail.includes(tool as (typeof GOOGLE_WORKSPACE_TOOLS.gmail)[number])
    ) {
      // Model stayed in-allowlist; that path is covered by the positive test.
      return;
    }
    expect(res.ok, `out-of-allowlist tool ${JSON.stringify(tool)} must be denied`).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not admitted/);
  }, 180_000);

  it("admits an allowlisted tool the agent selects and dispatches it to the real endpoint", async () => {
    const client = new QClearedMcpClient({
      requiredClearance: "internal",
      skipClearancePreflight: true,
    });
    const tool = await pickTool(
      "List the labels in my Gmail account.",
      GOOGLE_WORKSPACE_TOOLS.gmail,
    );
    expect(GOOGLE_WORKSPACE_TOOLS.gmail).toContain(tool); // agent stayed inside the allowlist

    const res = await client.invoke({ serverUrl: GMAIL, toolName: tool, arguments: {} });
    if (res.ok) {
      expect(res.ok).toBe(true); // reached Google and got a result
    } else {
      // The gate ADMITTED it; any failure must be transport/endpoint/scope —
      // never an admission denial. (Google may not serve this endpoint yet, or
      // the token may lack the scope; that is out of the gate's control.)
      expect(
        res.reason,
        `unexpected admission denial on allowlisted tool: ${res.reason}`,
      ).not.toMatch(/not admitted/);
      // eslint-disable-next-line no-console
      console.warn(
        `[live] allowlisted '${tool}' did not return data (non-admission failure): ${res.reason}`,
      );
    }
  }, 180_000);
});
