import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { wrapToolWithBeforeToolCallHook } from "./pi-tools.before-tool-call.js";
import { hostToolObservation } from "./tool-observation.js";
import { currentToolReplayCall, TOOL_OBSERVATION } from "./tool-replay.js";
import type { AnyAgentTool } from "./tools/common.js";

vi.mock("../plugins/hook-runner-global.js", async () => {
  const actual = await vi.importActual<typeof import("../plugins/hook-runner-global.js")>(
    "../plugins/hook-runner-global.js",
  );
  return { ...actual, getGlobalHookRunner: vi.fn() };
});
// The enclawed gates are out of scope: this checks the declaration plumbing.
vi.mock("../enclawed/agent-tool-guard.js", () => ({
  checkHardwareRootForToolCall: () => ({ allowed: true }),
  checkAuditLogForToolCall: async () => ({ allowed: true }),
  planIrreversibleToolCall: async () => ({ kind: "proceed" }),
  resolveIrreversibleApproval: () => true,
}));

describe("host tool observations (egress batcher keys)", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "tool-observation-")));
    await fs.mkdir(path.join(root, "notes"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("maps write to the file it writes, whatever the spelling of the path", async () => {
    const observe = hostToolObservation("write", { fsRoot: root })!;
    expect(observe).toBeTypeOf("function");
    // An alias through a symbolic link writes the same file.
    await fs.symlink(path.join(root, "notes"), path.join(root, "alias"));
    const spellings = [
      "notes/a.txt",
      "./notes/a.txt",
      "notes//x/../a.txt",
      path.join(root, "notes", "a.txt"),
      "alias/a.txt",
    ];
    const observed = await Promise.all(
      spellings.map((p, i) => observe({ path: p, content: "hello", ignored: i })),
    );
    for (const o of observed) {
      expect(o).toEqual({
        type: "file-write",
        path: path.join(root, "notes", "a.txt"),
        content: "hello",
      });
    }
  });

  it("declares an existing file's identity, so a hard link to it is the same file", async () => {
    const observe = hostToolObservation("write", { fsRoot: root })!;
    await fs.writeFile(path.join(root, "notes", "a.txt"), "old");
    await fs.link(path.join(root, "notes", "a.txt"), path.join(root, "hard.txt"));
    const a = (await observe({ path: "notes/a.txt", content: "new" })) as { identity?: string };
    const b = (await observe({ path: "hard.txt", content: "new" })) as { identity?: string };
    expect(a.identity).toMatch(/^\d+:\d+:\d+$/);
    expect(b.identity).toBe(a.identity);
    // A file that does not exist yet is named by its resolved path only.
    expect(await observe({ path: "notes/new.txt", content: "x" })).not.toHaveProperty("identity");
  });

  it("keeps the content and distinct files distinct", async () => {
    const observe = hostToolObservation("write", { fsRoot: root })!;
    const a = await observe({ path: "notes/a.txt", content: "1" });
    expect(await observe({ path: "notes/a.txt", content: "2" })).not.toEqual(a);
    expect(await observe({ path: "notes/b.txt", content: "1" })).not.toEqual(a);
  });

  it("declares nothing it cannot determine", async () => {
    const observe = hostToolObservation("write", { fsRoot: root })!;
    expect(await observe({ path: "notes/a.txt" })).toBeNull();
    expect(await observe({ content: "x" })).toBeNull();
    expect(await observe({ path: "  ", content: "x" })).toBeNull();
    // No root to resolve against, or a tool the host does not map.
    expect(hostToolObservation("write", {})).toBeUndefined();
    for (const tool of ["message", "web_search", "browser", "exec", "edit"]) {
      expect(hostToolObservation(tool, { fsRoot: root }), tool).toBeUndefined();
    }
  });
});

describe("the tool wrapper puts the declaration on the call's replay context", () => {
  async function observedBy(tool: Partial<AnyAgentTool>, fsRoot?: string, params = {}) {
    let seen: unknown = "unset";
    vi.mocked(getGlobalHookRunner).mockReturnValue({
      hasHooks: (name: string) => name === "before_tool_call",
      runBeforeToolCall: async (event: { params: Record<string, unknown> }) => {
        const observe = currentToolReplayCall()?.observe;
        seen = observe ? await observe(event.params) : undefined;
        return undefined;
      },
    } as never);
    const wrapped = wrapToolWithBeforeToolCallHook(
      {
        label: "t",
        description: "t",
        parameters: {},
        execute: async () => ({ content: [], details: {} }),
        ...tool,
      } as unknown as AnyAgentTool,
      { runId: "r1", ...(fsRoot ? { fsRoot } : {}) },
    );
    await wrapped.execute("c1", params, undefined, undefined);
    return seen;
  }

  it("uses the host's declaration for write", async () => {
    const root = await fs.realpath(os.tmpdir());
    expect(await observedBy({ name: "write" }, root, { path: "x.txt", content: "c" })).toEqual({
      type: "file-write",
      path: path.join(root, "x.txt"),
      content: "c",
    });
  });

  it("uses a tool's own declaration, and declares nothing for an undeclared tool", async () => {
    const declared = {
      name: "form",
      [TOOL_OBSERVATION]: (p: Record<string, unknown>) => ({
        type: "http",
        method: "POST",
        url: String(p.url),
        body: "v",
      }),
    } as unknown as Partial<AnyAgentTool>;
    expect(await observedBy(declared, undefined, { url: "https://a.test/f", local: 1 })).toEqual({
      type: "http",
      method: "POST",
      url: "https://a.test/f",
      body: "v",
    });
    expect(await observedBy({ name: "message" }, os.tmpdir(), { to: "u" })).toBeUndefined();
  });
});
