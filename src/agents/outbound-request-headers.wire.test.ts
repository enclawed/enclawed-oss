// Wire-level proof that model requests leave Enclawed without identifying
// headers: a real HTTP server on 127.0.0.1 records the headers each request
// actually carries, for every SDK path Enclawed sends model traffic through.
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { Agent, type StreamFn } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { SettingsManager } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnthropicMessagesTransportStreamFn } from "./anthropic-transport-stream.js";
import {
  createOpenAICompletionsTransportStreamFn,
  createOpenAIResponsesTransportStreamFn,
} from "./openai-transport-stream.js";
import { wrapStreamFnWithEnclawedClientIdentity } from "./pi-client-identity.js";
import { EnclawedPiCredentialStore } from "./pi-credential-store.js";
import { createOpenRouterWrapper } from "./pi-embedded-runner/proxy-stream-wrappers.js";
import {
  applyEnclawedAgentIdentity,
  createEmbeddedSessionBaseStreamFn,
} from "./pi-embedded-runner/session-runtime.js";
import { discoverModelRuntime } from "./pi-model-discovery.js";
import { attachModelProviderRequestTransport } from "./provider-request-config.js";

// The Responses transport asks the owning provider plugin for per-turn state;
// loading the bundled plugin registry for that costs seconds. On a loopback
// base URL the OpenAI plugin returns no turn state (it applies only to native
// OpenAI routes), so the seam answers exactly that.
vi.mock("../plugins/provider-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plugins/provider-runtime.js")>()),
  resolveProviderTransportTurnStateWithPlugin: () => undefined,
}));

const CHAT_COMPLETIONS_SSE =
  'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":"ok"},"finish_reason":"stop"}]}\n\n' +
  "data: [DONE]\n\n";

function sse(events: Array<Record<string, unknown> & { type: string }>): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
}

const RESPONSES_SSE = sse([
  {
    type: "response.created",
    sequence_number: 0,
    response: { id: "resp_1", object: "response", status: "in_progress", model: "m", output: [] },
  },
  {
    type: "response.completed",
    sequence_number: 1,
    response: {
      id: "resp_1",
      object: "response",
      status: "completed",
      model: "m",
      output: [
        {
          type: "message",
          id: "msg_1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "ok", annotations: [] }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    },
  },
]);

const ANTHROPIC_SSE = sse([
  {
    type: "message_start",
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "m",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 0 },
    },
  },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
  { type: "content_block_stop", index: 0 },
  {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: 1 },
  },
  { type: "message_stop" },
]);

type CapturedRequest = { path: string; headers: http.IncomingHttpHeaders };

let tmpRoot: string;
let server: http.Server;
let requests: CapturedRequest[];
let baseUrl: string;

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-outbound-headers-"));
  requests = [];
  server = http.createServer((req, res) => {
    const url = req.url ?? "";
    requests.push({ path: url, headers: req.headers });
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (url.endsWith("/responses")) {
        res.end(RESPONSES_SSE);
      } else if (url.endsWith("/messages")) {
        res.end(ANTHROPIC_SSE);
      } else {
        res.end(CHAT_COMPLETIONS_SSE);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const ATTRIBUTION_HEADERS = new Set([
  "http-referer",
  "x-title",
  "x-openrouter-title",
  "x-openrouter-categories",
  "x-billing-invoke-origin",
  "x-opencode-client",
  "originator",
  "version",
]);

/** Every check on the headers a model request actually carried. */
function expectNoIdentifyingHeaders(headers: http.IncomingHttpHeaders): void {
  const names = Object.keys(headers);
  expect(
    names.filter((name) => name.startsWith("x-stainless-")),
    "x-stainless-* headers",
  ).toEqual([]);
  expect(
    names.filter((name) => ATTRIBUTION_HEADERS.has(name) || name.startsWith("x-openrouter-")),
    "attribution headers",
  ).toEqual([]);
  for (const [name, value] of Object.entries(headers)) {
    expect(`${name}: ${String(value)}`.toLowerCase(), name).not.toContain("enclawed");
  }
  const userAgent = headers["user-agent"] ?? "";
  for (const fingerprint of [
    process.platform,
    process.arch,
    process.version,
    process.versions.node,
    "node/",
  ]) {
    expect(userAgent.toLowerCase(), "user-agent").not.toContain(fingerprint.toLowerCase());
  }
  // No version number of any client, SDK or runtime.
  expect(userAgent, "user-agent").not.toMatch(/\d+\.\d+/);
}

function model(params: { api: Api; provider: string; baseUrl: string }): Model<Api> {
  return {
    id: "test-model",
    name: "test-model",
    api: params.api,
    provider: params.provider,
    baseUrl: params.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 256,
  };
}

/** One agent turn the way the embedded runner issues it. */
async function runEmbeddedTurn(params: {
  streamFn: StreamFn;
  model: Model<Api>;
  apiKey?: string;
}): Promise<void> {
  const agent = new Agent({
    initialState: { systemPrompt: "system", model: params.model },
    // The embedded runner's outermost stream layer.
    streamFn: wrapStreamFnWithEnclawedClientIdentity(params.streamFn),
    ...(params.apiKey ? { getApiKey: () => params.apiKey } : {}),
  });
  applyEnclawedAgentIdentity(agent);
  await agent.prompt("hello");
}

async function piSessionBaseStreamFn(credentials: Record<string, string>): Promise<StreamFn> {
  const agentDir = path.join(tmpRoot, "agent");
  fs.mkdirSync(agentDir, { recursive: true });
  const modelRuntime = await discoverModelRuntime(
    new EnclawedPiCredentialStore(
      Object.fromEntries(
        Object.entries(credentials).map(([provider, key]) => [
          provider,
          { type: "api_key" as const, key },
        ]),
      ),
    ),
    agentDir,
  );
  return createEmbeddedSessionBaseStreamFn({
    modelRuntime,
    settingsManager: SettingsManager.inMemory({}),
  });
}

describe("outbound model request headers", () => {
  it("openai 6.x SDK through Enclawed's OpenAI completions transport", async () => {
    // A loopback model endpoint is an operator-configured private endpoint.
    const localModel = attachModelProviderRequestTransport(
      model({ api: "openai-completions", provider: "openai", baseUrl: `${baseUrl}/v1` }),
      { allowPrivateNetwork: true },
    );

    await runEmbeddedTurn({
      streamFn: createOpenAICompletionsTransportStreamFn(),
      model: localModel,
      apiKey: "test-key",
    });

    expect(requests.map((request) => request.path)).toEqual(["/v1/chat/completions"]);
    expect(requests[0].headers.authorization).toBe("Bearer test-key");
    expectNoIdentifyingHeaders(requests[0].headers);
    expect(requests[0].headers["user-agent"]).toBe("OpenAI/JS");
  });

  it("openai 6.x SDK through Enclawed's OpenAI Responses transport", async () => {
    const localModel = attachModelProviderRequestTransport(
      model({ api: "openai-responses", provider: "openai", baseUrl: `${baseUrl}/v1` }),
      { allowPrivateNetwork: true },
    );

    await runEmbeddedTurn({
      streamFn: createOpenAIResponsesTransportStreamFn(),
      model: localModel,
      apiKey: "test-key",
    });

    expect(requests.map((request) => request.path)).toEqual(["/v1/responses"]);
    expectNoIdentifyingHeaders(requests[0].headers);
  });

  it("Anthropic SDK through Enclawed's Anthropic messages transport", async () => {
    const localModel = attachModelProviderRequestTransport(
      model({ api: "anthropic-messages", provider: "anthropic", baseUrl }),
      { allowPrivateNetwork: true },
    );

    await runEmbeddedTurn({
      streamFn: createAnthropicMessagesTransportStreamFn(),
      model: localModel,
      apiKey: "test-key",
    });

    expect(requests.map((request) => request.path)).toEqual(["/v1/messages"]);
    expectNoIdentifyingHeaders(requests[0].headers);
  });

  it("pi-ai 1.6.0 OpenAI completions path (openai 7.x SDK) in the embedded session", async () => {
    // pi-ai routes each provider through its own API; groq is served by the
    // OpenAI completions API (pi-ai's openai 7.x client).
    const streamFn = await piSessionBaseStreamFn({ groq: "test-key" });

    await runEmbeddedTurn({
      streamFn,
      model: model({ api: "openai-completions", provider: "groq", baseUrl: `${baseUrl}/v1` }),
    });

    expect(requests.map((request) => request.path)).toEqual(["/v1/chat/completions"]);
    expect(requests[0].headers.authorization).toBe("Bearer test-key");
    expectNoIdentifyingHeaders(requests[0].headers);
  });

  it("pi-ai 1.6.0 OpenAI Responses path (openai 7.x SDK) in the embedded session", async () => {
    const streamFn = await piSessionBaseStreamFn({ openai: "test-key" });

    await runEmbeddedTurn({
      streamFn,
      model: model({ api: "openai-responses", provider: "openai", baseUrl: `${baseUrl}/v1` }),
    });

    expect(requests.map((request) => request.path)).toEqual(["/v1/responses"]);
    expectNoIdentifyingHeaders(requests[0].headers);
  });

  it("pi-ai 1.6.0 Anthropic messages path (@anthropic-ai/sdk) in the embedded session", async () => {
    const streamFn = await piSessionBaseStreamFn({ anthropic: "test-key" });

    await runEmbeddedTurn({
      streamFn,
      model: model({ api: "anthropic-messages", provider: "anthropic", baseUrl }),
    });

    // pi-ai sends Anthropic requests through the SDK's beta messages API.
    expect(requests.map((request) => request.path)).toEqual(["/v1/messages?beta=true"]);
    expect(requests[0].headers["x-api-key"]).toBe("test-key");
    expectNoIdentifyingHeaders(requests[0].headers);
  });

  it("OpenRouter wrapper on the OpenRouter route sends no app attribution", async () => {
    const piStreamFn = await piSessionBaseStreamFn({ openrouter: "test-key" });
    // The wrapper resolves its policy against the real OpenRouter route; the
    // request itself is delivered to the local server.
    const toLocalServer: StreamFn = (target, context, options) =>
      piStreamFn({ ...target, baseUrl: `${baseUrl}/api/v1` }, context, options);

    await runEmbeddedTurn({
      streamFn: createOpenRouterWrapper(toLocalServer),
      model: model({
        api: "openai-completions",
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
      }),
    });

    expect(requests.map((request) => request.path)).toEqual(["/api/v1/chat/completions"]);
    expect(requests[0].headers.authorization).toBe("Bearer test-key");
    expectNoIdentifyingHeaders(requests[0].headers);
  });

  it("control: the same pi-ai request without Enclawed's layers carries SDK telemetry", async () => {
    const agentDir = path.join(tmpRoot, "agent");
    fs.mkdirSync(agentDir, { recursive: true });
    const modelRuntime = await discoverModelRuntime(
      new EnclawedPiCredentialStore({ groq: { type: "api_key", key: "k" } }),
      agentDir,
    );
    const agent = new Agent({
      initialState: {
        systemPrompt: "system",
        model: model({ api: "openai-completions", provider: "groq", baseUrl: `${baseUrl}/v1` }),
      },
      streamFn: (target, context, options) => modelRuntime.streamSimple(target, context, options),
    });
    await agent.prompt("hello");

    // Proves the server sees what an SDK sends unfiltered, so the checks
    // above are not vacuous.
    expect(requests).toHaveLength(1);
    expect(requests[0].headers["x-stainless-os"]).toBeTruthy();
    expect(requests[0].headers["x-stainless-runtime-version"]).toBe(process.version);
    expect(requests[0].headers["user-agent"]).toMatch(/\d+\.\d+/);
  });
});
