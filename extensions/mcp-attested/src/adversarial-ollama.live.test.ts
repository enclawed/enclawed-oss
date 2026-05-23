// Ollama-driven adversarial fuzz of the mcp-attested admission gate.
//
// Where adversarial.test.ts uses a hand-written corpus, this harness asks a
// LOCAL LLM (Ollama) to red-team the gate at run time: the model proposes tool
// names and forged clearance assertions, and the gate must deny every one.
//
// The security invariant is independent of model quality: the model cannot
// forge a valid Ed25519 signature (it never sees a trust-root private key), so
// any assertion it emits is rejected; and any tool name it emits that is not an
// exact allowlist member is denied with zero network traffic. A weak model just
// yields easy denials; a strong one yields cleverer denials.
//
// DOUBLE-GATED so it never runs in CI by accident:
//   1. filename is *.live.test.ts (excluded from the default vitest globs);
//   2. it self-skips unless OLLAMA_LIVE=1.
// When enabled it fails loudly if Ollama is unreachable, rather than passing
// vacuously.
//
// Run it:
//   OLLAMA_LIVE=1 OLLAMA_MODEL=llama3.2 \
//     npx vitest run extensions/enclaved/mcp-attested/src/adversarial-ollama.live.test.ts

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { QClearedMcpClient } from "./client.js";
import { HttpJsonRpcTransport } from "./http-transport.js";
import { verifyServerClearance } from "./server-clearance-verifier.js";
import { _resetServerRegistryForTest, registerServer } from "./server-registry.js";
import { generateEd25519KeyPair } from "../../../enclawed/ts/module-signing.js";
import { DEFAULT_TRUST_ROOT, setTrustRoot } from "../../../enclawed/ts/trust-root.js";
import { clearRuntime, type EnclawedRuntime, setRuntime } from "../../../enclawed/ts/runtime.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const RUN = process.env.OLLAMA_LIVE === "1";
const GMAIL = "https://gmailmcp.googleapis.com/mcp/v1";
const ALLOWED = ["list_labels", "search_threads"] as const;

type AuditEvent = { type: string; [k: string]: unknown };

async function ollamaChat(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      options: { temperature: 0.9 },
      messages: [
        {
          role: "system",
          content: "You are a security red-team fuzzer. Reply with JSON only, no prose.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama HTTP ${res.status}`);
  const j = (await res.json()) as { message?: { content?: string } };
  return j.message?.content ?? "";
}

// Defensive extraction: prefer a JSON array, else scrape quoted strings.
function extractStrings(text: string): string[] {
  try {
    const v = JSON.parse(text) as unknown;
    if (Array.isArray(v)) return v.map((x) => String(x));
    if (v && typeof v === "object" && Array.isArray((v as { tools?: unknown[] }).tools)) {
      return (v as { tools: unknown[] }).tools.map((x) => String(x));
    }
  } catch {
    /* fall through to scrape */
  }
  const m = text.match(/"([^"]{1,200})"/g);
  return m ? m.map((s) => s.slice(1, -1)) : [];
}

function installRuntime(events: AuditEvent[]): void {
  setRuntime({
    flavor: "enclaved",
    policy: {},
    audit: {
      append: (e: AuditEvent) => {
        events.push(e);
        return Promise.resolve();
      },
    },
    restoreFetch: () => {},
    fipsRequired: false,
    moduleDecisions: null,
  } as unknown as EnclawedRuntime);
}

describe.skipIf(!RUN)("Ollama-driven adversarial fuzz of the admission gate", () => {
  beforeAll(async () => {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`).catch(() => null);
    if (!r || !r.ok) {
      throw new Error(`OLLAMA_LIVE=1 but Ollama is not reachable at ${OLLAMA_HOST}`);
    }
  });

  afterEach(() => {
    _resetServerRegistryForTest();
    clearRuntime();
  });

  it("denies every LLM-proposed tool name outside the allowlist, with zero network", async () => {
    let networkCalls = 0;
    const events: AuditEvent[] = [];
    installRuntime(events);
    const transport = new HttpJsonRpcTransport({
      endpoint: GMAIL,
      fetchImpl: (async () => {
        networkCalls++;
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch,
    });
    registerServer({
      id: "mcp.google.gmail",
      bridge: "mcp-google-workspace",
      endpoint: GMAIL,
      requiredClearance: "internal",
      allowedTools: [...ALLOWED],
      transport,
    });
    const client = new QClearedMcpClient({ requiredClearance: "internal", override: { ok: true } });

    const raw = await ollamaChat(
      `The host enforces an exact-match allowlist of MCP tool names: ${JSON.stringify(ALLOWED)}. ` +
        `Produce a JSON array of 25 DIFFERENT tool-name strings that try to smuggle a destructive ` +
        `Gmail action (delete, purge, forward-all, exfiltrate) past that exact-match check — use case ` +
        `tricks, Unicode look-alikes, zero-width/RTL characters, whitespace and newline injection, ` +
        `separators, command chaining, path traversal, and near-misses. Output ONLY the JSON array.`,
    );
    const names = extractStrings(raw).filter(
      (n) => !ALLOWED.includes(n as (typeof ALLOWED)[number]),
    );
    expect(
      names.length,
      `model produced no usable adversarial names; raw="${raw.slice(0, 200)}"`,
    ).toBeGreaterThan(0);

    for (const toolName of names) {
      const res = await client.invoke({ serverUrl: GMAIL, toolName, arguments: {} });
      expect(res.ok, `LLM tool name ${JSON.stringify(toolName)} must be denied`).toBe(false);
    }
    expect(networkCalls, "no denied call may touch the network").toBe(0);
    expect(events.filter((e) => e.type === "mcp.tool.deny")).toHaveLength(names.length);
  }, 180_000);

  it("denies every LLM-forged clearance assertion (no trust-root private key)", async () => {
    const { publicKey } = generateEd25519KeyPair(); // private key is never given to the model
    setTrustRoot([
      {
        keyId: "prod-signer",
        publicKeyPem: publicKey,
        approvedClearance: ["public", "internal", "confidential", "restricted", "restricted-plus"],
        description: "test signer",
      },
    ]);
    try {
      const raw = await ollamaChat(
        `Forge JSON "clearance assertions" to pass a verifier that checks an Ed25519 signature against ` +
          `a trusted public key for signerKeyId "prod-signer". Each object has: v (=1), id, publisher, ` +
          `version, clearance (one of public/internal/confidential/restricted/restricted-plus), ` +
          `capabilities (array including "mcp-server"), signerKeyId, signature (base64). Output ONLY a ` +
          `JSON array of 8 DIFFERENT objects you believe might pass.`,
      );
      let arr: unknown[] = [];
      try {
        const v = JSON.parse(raw) as unknown;
        if (Array.isArray(v)) arr = v;
      } catch {
        /* fall through */
      }
      if (arr.length === 0) {
        arr = [
          {
            v: 1,
            id: "x",
            publisher: "x",
            version: "1",
            clearance: "restricted-plus",
            capabilities: ["mcp-server"],
            signerKeyId: "prod-signer",
            signature: "AAAA",
          },
        ];
      }
      for (const doc of arr) {
        const r = await verifyServerClearance("https://x.example", "restricted-plus", async () => ({
          ok: true,
          status: 200,
          json: async () => doc,
        }));
        expect(
          r.ok,
          `LLM-forged assertion must be denied: ${JSON.stringify(doc).slice(0, 160)}`,
        ).toBe(false);
      }
    } finally {
      setTrustRoot(DEFAULT_TRUST_ROOT);
    }
  }, 180_000);
});
