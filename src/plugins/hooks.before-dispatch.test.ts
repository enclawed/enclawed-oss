import { describe, expect, it } from "vitest";
import { createHookRunner } from "./hooks.js";
import { createMockPluginRegistry } from "./hooks.test-helpers.js";

const event = { content: "raw", body: "raw" };
const ctx = { channelId: "c1" };

describe("before_dispatch hook runner", () => {
  it("returns undefined when no handler claims or rewrites", async () => {
    const runner = createHookRunner(
      createMockPluginRegistry([
        { hookName: "before_dispatch", pluginId: "a", handler: async () => ({ handled: false }) },
      ]),
    );
    expect(await runner.runBeforeDispatch(event, ctx)).toBeUndefined();
  });

  it("chains body rewrites and reports the last one", async () => {
    const seen: Array<string | undefined> = [];
    const runner = createHookRunner(
      createMockPluginRegistry([
        {
          hookName: "before_dispatch",
          pluginId: "a",
          handler: async (...args: unknown[]) => {
            const e = args[0] as { body?: string };
            seen.push(e.body);
            return { handled: false, body: `${e.body}-a` };
          },
        },
        {
          hookName: "before_dispatch",
          pluginId: "b",
          handler: async (...args: unknown[]) => {
            const e = args[0] as { body?: string };
            seen.push(e.body);
            return { handled: false, body: `${e.body}-b` };
          },
        },
      ]),
    );
    expect(await runner.runBeforeDispatch(event, ctx)).toEqual({
      handled: false,
      body: "raw-a-b",
    });
    expect(seen).toEqual(["raw", "raw-a"]);
  });

  it("lets the first claim win over earlier rewrites", async () => {
    const runner = createHookRunner(
      createMockPluginRegistry([
        {
          hookName: "before_dispatch",
          pluginId: "a",
          handler: async () => ({ handled: false, body: "x" }),
        },
        {
          hookName: "before_dispatch",
          pluginId: "b",
          handler: async () => ({ handled: true, text: "stop" }),
        },
      ]),
    );
    expect(await runner.runBeforeDispatch(event, ctx)).toEqual({ handled: true, text: "stop" });
  });

  it("isolates a throwing handler", async () => {
    const runner = createHookRunner(
      createMockPluginRegistry([
        {
          hookName: "before_dispatch",
          pluginId: "a",
          handler: async () => {
            throw new Error("boom");
          },
        },
        {
          hookName: "before_dispatch",
          pluginId: "b",
          handler: async () => ({ handled: false, body: "ok" }),
        },
      ]),
    );
    expect(await runner.runBeforeDispatch(event, ctx)).toEqual({ handled: false, body: "ok" });
  });
});
