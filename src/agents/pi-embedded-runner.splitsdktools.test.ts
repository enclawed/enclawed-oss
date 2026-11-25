import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { InMemoryModelsStore } from "@mariozechner/pi-ai";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyPluginRegistry } from "../plugins/registry-empty.js";
import { resetPluginRuntimeStateForTest, setActivePluginRegistry } from "../plugins/runtime.js";
import { EnclawedPiCredentialStore } from "./pi-credential-store.js";
import { sdkActiveToolNames, splitSdkTools } from "./pi-embedded-runner.js";
import { createEmbeddedPiResourceLoader } from "./pi-embedded-runner/session-runtime.js";
import { createStubTool } from "./test-helpers/pi-tool-stubs.js";

describe("splitSdkTools", () => {
  const tools = [
    createStubTool("read"),
    createStubTool("exec"),
    createStubTool("edit"),
    createStubTool("write"),
    createStubTool("browser"),
  ];

  it("routes all tools to customTools when sandboxed", () => {
    const { builtInTools, customTools } = splitSdkTools({
      tools,
      sandboxEnabled: true,
    });
    expect(builtInTools).toEqual([]);
    expect(customTools.map((tool) => tool.name)).toEqual([
      "read",
      "exec",
      "edit",
      "write",
      "browser",
    ]);
  });

  it("routes all tools to customTools even when not sandboxed", () => {
    const { builtInTools, customTools } = splitSdkTools({
      tools,
      sandboxEnabled: false,
    });
    expect(builtInTools).toEqual([]);
    expect(customTools.map((tool) => tool.name)).toEqual([
      "read",
      "exec",
      "edit",
      "write",
      "browser",
    ]);
  });
});

describe("sdkActiveToolNames", () => {
  it("names every custom tool, so pi starts the session with all of them active", async () => {
    const { builtInTools, customTools } = splitSdkTools({
      tools: [createStubTool("read"), createStubTool("exec"), createStubTool("browser")],
      sandboxEnabled: false,
    });
    // Explicit, isolated sources: no pi auth.json/models.json, no disk-discovered resources.
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "enclawed-splitsdk-agent-"));
    try {
      const settingsManager = SettingsManager.inMemory();
      const modelRuntime = await ModelRuntime.create({
        credentials: new EnclawedPiCredentialStore(),
        modelsPath: null,
        modelsStore: new InMemoryModelsStore(),
      });
      const resourceLoader = await createEmbeddedPiResourceLoader({
        cwd: process.cwd(),
        agentDir,
        settingsManager,
        extensionFactories: [],
      });
      const { session } = await createAgentSession({
        cwd: process.cwd(),
        agentDir,
        modelRuntime,
        tools: sdkActiveToolNames(builtInTools, customTools),
        customTools,
        sessionManager: SessionManager.inMemory(),
        settingsManager,
        resourceLoader,
      });
      expect(session.getActiveToolNames().toSorted()).toEqual(["browser", "exec", "read"]);
    } finally {
      await fs.rm(agentDir, { recursive: true, force: true });
    }
  });

  describe("tool results are untrusted model input (conformance: mcp-untrusted-results)", () => {
    afterEach(() => {
      resetPluginRuntimeStateForTest();
    });

    it("runs the registered pi tool-result middleware on every tool result", async () => {
      const registry = createEmptyPluginRegistry();
      registry.agentToolResultMiddlewares.push({
        pluginId: "cleaner",
        source: "test",
        runtimes: ["pi"],
        handler: async (event) => ({
          result: { ...event.result, content: [{ type: "text", text: "cleaned" }] },
        }),
      });
      setActivePluginRegistry(registry);
      const hostile = {
        ...createStubTool("mcp__lookup"),
        execute: async () => ({
          content: [{ type: "text" as const, text: "hidden instruction" }],
          details: {},
        }),
      };
      const { customTools } = splitSdkTools({ tools: [hostile], sandboxEnabled: false });
      const result = await customTools[0].execute(
        "c1",
        {},
        undefined,
        undefined,
        undefined as never,
      );
      expect(result.content).toEqual([{ type: "text", text: "cleaned" }]);
    });
  });
});
