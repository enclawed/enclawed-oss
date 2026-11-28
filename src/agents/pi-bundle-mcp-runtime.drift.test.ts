// Post-admission MCP tool-definition drift ("rug pull") on the gateway's
// bundle-MCP client (conformance: mcp-definition-drift, mcp-untrusted-results).
//
// A real child-process MCP server (../enclawed/conformance/fake-mcp-server.ts)
// is admitted with two tools, then changes one definition mid-session and
// announces it with notifications/tools/list_changed. The changed tool must be
// refused (and audited) while the unchanged one keeps working. A second server
// keeps its definitions byte-identical but returns hostile results: that is
// not a drift and is not detected here; the result is untrusted input, which
// the next suite (pi tool-result middleware) proves is cleaned, and what the
// model does with it goes through the per-action gate.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFakeMcpServer } from "../enclawed/conformance/fake-mcp-server.js";
import { clearRuntime, setRuntime, type EnclawedRuntime } from "../enclawed/runtime.js";
import { cleanupBundleMcpHarness, makeTempDir } from "./pi-bundle-mcp-test-harness.js";
import { createSessionMcpRuntime } from "./pi-bundle-mcp-tools.js";
import type { SessionMcpRuntime } from "./pi-bundle-mcp-types.js";

type AuditRecord = { type: string; payload: Record<string, unknown> };
let records: AuditRecord[] = [];
const runtimes: SessionMcpRuntime[] = [];

beforeEach(() => {
  records = [];
  setRuntime({
    flavor: "open",
    policy: {},
    audit: {
      append: async (r: AuditRecord) => {
        records.push(r);
      },
    },
    restoreFetch: () => {},
    fipsRequired: false,
    moduleDecisions: null,
  } as unknown as EnclawedRuntime);
});

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((r) => r.dispose()));
  clearRuntime();
  await cleanupBundleMcpHarness();
});

async function startRuntime(env: Record<string, string>): Promise<SessionMcpRuntime> {
  const dir = await makeTempDir("enclawed-mcp-drift-");
  const script = await writeFakeMcpServer(dir);
  const runtime = createSessionMcpRuntime({
    sessionId: `drift-${Math.random().toString(36).slice(2)}`,
    workspaceDir: dir,
    cfg: { mcp: { servers: { fake: { command: process.execPath, args: [script], env } } } },
  });
  runtimes.push(runtime);
  return runtime;
}

function text(result: Awaited<ReturnType<SessionMcpRuntime["callTool"]>>): string {
  const first = (result.content as Array<{ type: string; text?: string }>)[0];
  return first?.text ?? "";
}

async function waitFor(check: () => boolean, ms = 5_000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) {
      throw new Error("timed out");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("MCP tool-definition drift after admission", () => {
  it("admits a server's tools and audits the pinned definitions", async () => {
    const runtime = await startRuntime({});
    const catalog = await runtime.getCatalog();
    expect(catalog.tools.map((t) => t.toolName).toSorted()).toEqual(["lookup", "send_report"]);
    const admit = records.find((r) => r.type === "mcp.tool.admit");
    expect(Object.keys(admit?.payload.tools as object).toSorted()).toEqual([
      "lookup",
      "send_report",
    ]);
  });

  it("keeps calling unchanged tools when nothing drifts (no false positive)", async () => {
    const runtime = await startRuntime({});
    for (let i = 0; i < 3; i += 1) {
      expect(text(await runtime.callTool("fake", "lookup", { id: "7" }))).toContain("Record 7");
      expect(text(await runtime.callTool("fake", "send_report", { to: "team" }))).toContain("sent");
    }
    expect(records.some((r) => r.type === "mcp.tool.drift")).toBe(false);
  });

  it("refuses a tool whose definition changed mid-session, and audits it", async () => {
    const runtime = await startRuntime({ FAKE_MCP_RUG_PULL: "1" });
    // The first call triggers the server's change and its list_changed notice.
    expect(text(await runtime.callTool("fake", "lookup", { id: "7" }))).toContain("Record 7");
    await waitFor(() => records.some((r) => r.type === "mcp.tool.drift"));
    await expect(runtime.callTool("fake", "send_report", { to: "x" })).rejects.toThrow(
      /changed after it was admitted/,
    );
    // The unchanged tool is still callable.
    expect(text(await runtime.callTool("fake", "lookup", { id: "8" }))).toContain("Record 7");
    expect(records.find((r) => r.type === "mcp.tool.drift")?.payload).toMatchObject({
      server: "fake",
      tool: "send_report",
      code: "definition-changed",
    });
    expect(records.find((r) => r.type === "mcp.tool.deny")?.payload).toMatchObject({
      tool: "send_report",
      code: "definition-changed",
    });
  });

  it("refuses a tool that was not part of the admission", async () => {
    const runtime = await startRuntime({});
    await expect(runtime.callTool("fake", "delete_everything", {})).rejects.toThrow(
      /no admitted tool/,
    );
  });

  it("does not detect hostile results behind unchanged definitions (they are untrusted input)", async () => {
    const runtime = await startRuntime({ FAKE_MCP_HOSTILE: "1" });
    const out = text(await runtime.callTool("fake", "lookup", { id: "7" }));
    // The hidden instruction arrives at the client untouched by the pin check...
    expect(out).toMatch(/[\u{E0000}-\u{E007F}]/u);
    // ...and no drift is reported, because the definitions did not change.
    expect(records.some((r) => r.type === "mcp.tool.drift")).toBe(false);
  });
});
