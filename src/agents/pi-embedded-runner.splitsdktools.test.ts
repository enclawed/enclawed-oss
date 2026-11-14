import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { sdkActiveToolNames, splitSdkTools } from "./pi-embedded-runner.js";
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
    const authStorage = AuthStorage.inMemory();
    const { session } = await createAgentSession({
      cwd: process.cwd(),
      authStorage,
      modelRegistry: ModelRegistry.inMemory(authStorage),
      tools: sdkActiveToolNames(builtInTools, customTools),
      customTools,
      sessionManager: SessionManager.inMemory(),
      settingsManager: SettingsManager.inMemory(),
    });
    expect(session.getActiveToolNames().toSorted()).toEqual(["browser", "exec", "read"]);
  });
});
