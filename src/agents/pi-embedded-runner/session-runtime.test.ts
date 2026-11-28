import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { Agent, type StreamFn } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import { SettingsManager, type ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wrapStreamFnWithEnclawedClientIdentity } from "../pi-client-identity.js";
import { EnclawedPiCredentialStore } from "../pi-credential-store.js";
import { discoverModelRuntime } from "../pi-model-discovery.js";
import {
  applyEnclawedAgentIdentity,
  createEmbeddedPiResourceLoader,
  createEmbeddedSessionBaseStreamFn,
  EMBEDDED_PI_TRANSCRIPT_PREAMBLE,
} from "./session-runtime.js";

const SSE_REPLY =
  'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":"ok"},"finish_reason":"stop"}]}\n\n' +
  "data: [DONE]\n\n";

type CapturedRequest = http.IncomingHttpHeaders;

let tmpRoot: string;
let server: http.Server;
let requests: CapturedRequest[];

function mkdir(...parts: string[]): string {
  const dir = path.join(tmpRoot, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// pi's own sources Enclawed must never use: a pi agent dir with credentials,
// a models.json and settings, selected through pi's env override.
function seedPiHome(): string {
  const piHome = mkdir("pi-home");
  fs.writeFileSync(
    path.join(piHome, "auth.json"),
    JSON.stringify({ openrouter: { type: "api_key", key: "pi-home-file-key" } }),
  );
  fs.writeFileSync(
    path.join(piHome, "models.json"),
    JSON.stringify({
      providers: {
        "pi-home-provider": {
          baseUrl: "http://127.0.0.1:9/v1",
          api: "openai-completions",
          apiKey: "pi-home-models-key",
          models: [{ id: "pi-home-model" }],
        },
      },
    }),
  );
  fs.writeFileSync(path.join(piHome, "settings.json"), JSON.stringify({ packages: ["npm:x"] }));
  vi.stubEnv("PI_CODING_AGENT_DIR", piHome);
  return piHome;
}

function openRouterModel(port: number): Model<Api> {
  return {
    id: "test-model",
    name: "test-model",
    api: "openai-completions",
    // OpenRouter is where pi-ai attaches attribution headers by default.
    provider: "openrouter",
    baseUrl: `http://127.0.0.1:${port}/v1`,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 256,
  };
}

async function runAgentTurn(params: { streamFn: StreamFn; model: Model<Api>; enclawed: boolean }) {
  const agent = new Agent({
    initialState: { systemPrompt: "system", model: params.model },
    streamFn: params.streamFn,
  });
  if (params.enclawed) {
    applyEnclawedAgentIdentity(agent);
  }
  await agent.prompt("hello");
  return agent;
}

const ATTRIBUTION_HEADERS = [
  "http-referer",
  "x-openrouter-title",
  "x-openrouter-categories",
  "x-billing-invoke-origin",
  "x-opencode-client",
];

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-pi-session-runtime-"));
  requests = [];
  server = http.createServer((req, res) => {
    requests.push(req.headers);
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(SSE_REPLY);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("embedded pi session request identity", () => {
  it("sends no attribution headers and a non-fingerprinting User-Agent through the agent loop", async () => {
    seedPiHome();
    const agentDir = mkdir("enclawed-agent");
    const credentials = new EnclawedPiCredentialStore({
      openrouter: { type: "api_key", key: "enclawed-resolved-key" },
    });
    const modelRuntime = await discoverModelRuntime(credentials, agentDir);
    const port = (server.address() as AddressInfo).port;
    const baseStreamFn = createEmbeddedSessionBaseStreamFn({
      modelRuntime,
      settingsManager: SettingsManager.inMemory({}),
    });

    await runAgentTurn({
      streamFn: wrapStreamFnWithEnclawedClientIdentity(baseStreamFn),
      model: openRouterModel(port),
      enclawed: true,
    });

    expect(requests).toHaveLength(1);
    const headers = requests[0];
    expect(headers["user-agent"]).toBe("pi");
    for (const name of ATTRIBUTION_HEADERS) {
      expect(headers[name], name).toBeUndefined();
    }
    // pi got exactly the credential Enclawed resolved, not pi's own auth.json.
    expect(headers.authorization).toBe("Bearer enclawed-resolved-key");
  });

  it("control: pi's defaults on the same path would attribute the request and fingerprint the host", async () => {
    const agentDir = mkdir("enclawed-agent");
    const modelRuntime = await discoverModelRuntime(
      new EnclawedPiCredentialStore({ openrouter: { type: "api_key", key: "k" } }),
      agentDir,
    );
    const port = (server.address() as AddressInfo).port;

    await runAgentTurn({
      streamFn: (model, context, options) => modelRuntime.streamSimple(model, context, options),
      model: openRouterModel(port),
      enclawed: false,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]["http-referer"]).toBe("https://pi.dev");
    expect(requests[0]["user-agent"]).toMatch(/^pi\/\S+ \(/);
  });
});

describe("embedded pi model runtime isolation", () => {
  it("uses only Enclawed's credentials and models.json and writes nothing to disk", async () => {
    const piHome = seedPiHome();
    const piHomeBefore = fs.readdirSync(piHome).toSorted();
    const agentDir = mkdir("enclawed-agent");
    const modelRuntime = await discoverModelRuntime(
      new EnclawedPiCredentialStore({ openrouter: { type: "api_key", key: "enclawed-key" } }),
      agentDir,
    );

    const auth = await modelRuntime.getAuth("openrouter");
    expect(auth?.auth.apiKey).toBe("enclawed-key");
    // pi's own agent dir (auth.json, models.json) is never consulted.
    expect(modelRuntime.getModels("pi-home-provider")).toEqual([]);
    expect(fs.readdirSync(agentDir)).toEqual([]);
    expect(fs.readdirSync(piHome).toSorted()).toEqual(piHomeBefore);
  });
});

describe("createEmbeddedPiResourceLoader", () => {
  it("loads only Enclawed's inline extensions and nothing discovered from the workspace or agent dir", async () => {
    seedPiHome();
    const workspace = mkdir("workspace");
    const agentDir = mkdir("enclawed-agent");
    const marker = path.join(tmpRoot, "workspace-extension-loaded");
    for (const root of [path.join(workspace, ".pi"), agentDir]) {
      fs.mkdirSync(path.join(root, "extensions"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "extensions", "evil.mjs"),
        `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(marker)}, "loaded");\nexport default function () {}\n`,
      );
      fs.mkdirSync(path.join(root, "skills", "evil-skill"), { recursive: true });
      fs.writeFileSync(
        path.join(root, "skills", "evil-skill", "SKILL.md"),
        "---\nname: evil-skill\ndescription: evil\n---\nDo evil.\n",
      );
      fs.mkdirSync(path.join(root, "prompts"), { recursive: true });
      fs.writeFileSync(path.join(root, "prompts", "evil.md"), "evil prompt");
      fs.writeFileSync(path.join(root, "SYSTEM.md"), "evil system prompt");
      fs.writeFileSync(path.join(root, "APPEND_SYSTEM.md"), "evil append");
    }
    fs.writeFileSync(path.join(workspace, "AGENTS.md"), "evil project instructions");
    fs.writeFileSync(path.join(workspace, "CLAUDE.md"), "evil project instructions");

    const inlineCalls: string[] = [];
    const inlineFactory: ExtensionFactory = () => {
      inlineCalls.push("enclawed");
    };
    const loader = await createEmbeddedPiResourceLoader({
      cwd: workspace,
      agentDir,
      settingsManager: SettingsManager.inMemory({}),
      extensionFactories: [inlineFactory],
    });

    const extensions = loader.getExtensions();
    expect(extensions.extensions.map((extension) => extension.path)).toEqual(["<inline:1>"]);
    expect(extensions.errors).toEqual([]);
    expect(inlineCalls).toEqual(["enclawed"]);
    expect(fs.existsSync(marker)).toBe(false);
    expect(loader.getSkills().skills).toEqual([]);
    expect(loader.getPrompts().prompts).toEqual([]);
    expect(loader.getThemes().themes).toEqual([]);
    expect(loader.getAgentsFiles().agentsFiles).toEqual([]);
    expect(loader.getSystemPrompt()).toBe(EMBEDDED_PI_TRANSCRIPT_PREAMBLE);
    expect(loader.getAppendSystemPrompt()).toEqual([]);
  });
});
