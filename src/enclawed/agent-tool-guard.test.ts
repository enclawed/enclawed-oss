import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runBeforeToolCallHook,
  wrapToolWithBeforeToolCallHook,
} from "../agents/pi-tools.before-tool-call.js";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { callGatewayTool } from "../agents/tools/gateway.js";
import { resetAgentToolGuardForTest } from "./agent-tool-guard.js";
import { makeLabel, LEVEL } from "./classification.js";
import {
  hardwareRootHealth,
  hardwareRootPresent,
  hardwareRootRequired,
} from "./hardware-root/index.js";
import { createPolicy } from "./policy.js";
import { clearRuntime, setRuntime, type EnclawedRuntime } from "./runtime.js";
import { classifyToolCall } from "./tool-capability-map.js";

vi.mock("./hardware-root/index.js", () => ({
  hardwareRootPresent: vi.fn(() => false),
  hardwareRootRequired: vi.fn(() => false),
  hardwareRootHealth: vi.fn(() => ({ status: "UNAVAILABLE", reason: "no Enclaweder is bound" })),
  hardwareRootInfo: vi.fn(() => ({
    anchored: true,
    serial: "EC-TEST",
    pubkey: null,
    status: "DIRTY",
  })),
}));
vi.mock("../agents/tools/gateway.js", () => ({ callGatewayTool: vi.fn() }));

const mockPresent = vi.mocked(hardwareRootPresent);
const mockRequired = vi.mocked(hardwareRootRequired);
const mockHealth = vi.mocked(hardwareRootHealth);
const mockGateway = vi.mocked(callGatewayTool);

type AuditRecord = { type: string; actor: string; payload: Record<string, unknown> };

function installRuntime(opts: {
  flavor: "open" | "enclaved";
  allowedTools?: string[];
  preApproved?: string[];
}): AuditRecord[] {
  const records: AuditRecord[] = [];
  setRuntime({
    flavor: opts.flavor,
    policy: createPolicy({
      enforceAllowlists: opts.flavor === "enclaved",
      allowedTools: opts.allowedTools ?? ["read", "exec", "message", "web_fetch", "mystery_tool"],
      preApprovedIrreversibleTools: opts.preApproved,
      maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    }),
    audit: {
      append: async (r: AuditRecord) => {
        records.push(r);
      },
    },
    restoreFetch: () => {},
    fipsRequired: false,
    moduleDecisions: null,
  } as unknown as EnclawedRuntime);
  return records;
}

/** Make the gateway answer the next approval request with `decision`. */
function answerApproval(decision: string | null) {
  mockGateway.mockImplementation((async (method: string) => {
    if (method === "plugin.approval.request") {
      return { id: "plugin:1" };
    }
    return { id: "plugin:1", decision };
  }) as unknown as typeof callGatewayTool);
}

function wrapped(name: string) {
  const execute = vi.fn(async () => ({ content: [], details: {} }));
  const tool = wrapToolWithBeforeToolCallHook({ name, execute } as unknown as AnyAgentTool, {
    agentId: "main",
    sessionKey: "s1",
  });
  return { tool, execute };
}

const ctx = { agentId: "main", sessionKey: "s1" };

beforeEach(() => {
  mockPresent.mockReturnValue(false);
  mockRequired.mockReturnValue(false);
  mockHealth.mockReturnValue({ status: "UNAVAILABLE", reason: "no Enclaweder is bound" });
  mockHealth.mockClear();
  mockGateway.mockReset();
});

afterEach(() => {
  clearRuntime();
  resetAgentToolGuardForTest();
});

describe("hardware root halt on the gateway tool path", () => {
  it("refuses and audits every call while the bound root is DIRTY, in both flavors", async () => {
    for (const flavor of ["open", "enclaved"] as const) {
      const records = installRuntime({ flavor });
      mockPresent.mockReturnValue(true);
      mockHealth.mockReturnValue({ status: "DIRTY", reason: "device removed" });
      const { tool, execute } = wrapped("read");
      await expect(tool.execute("c1", {}, undefined, undefined)).rejects.toThrow(
        /hardware root DIRTY: device removed/,
      );
      expect(execute).not.toHaveBeenCalled();
      expect(records).toContainEqual(
        expect.objectContaining({
          type: "tool.hardware.halt",
          actor: "main",
          payload: expect.objectContaining({ tool: "read", code: "hardware-dirty" }),
        }),
      );
      clearRuntime();
    }
  });

  it("allows calls while the bound root is CLEAN", async () => {
    installRuntime({ flavor: "open" });
    mockPresent.mockReturnValue(true);
    mockHealth.mockReturnValue({ status: "CLEAN" });
    const { tool, execute } = wrapped("exec");
    await tool.execute("c1", {}, undefined, undefined);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("changes nothing when no device is bound and none is required", async () => {
    const records = installRuntime({ flavor: "open" });
    const { tool, execute } = wrapped("exec");
    await tool.execute("c1", {}, undefined, undefined);
    expect(execute).toHaveBeenCalledOnce();
    expect(records).toEqual([]);
    expect(mockHealth).not.toHaveBeenCalled();
  });

  it("refuses when ENCLAWEDER_ROOT=required and no device is bound", async () => {
    const records = installRuntime({ flavor: "open" });
    mockRequired.mockReturnValue(true);
    const outcome = await runBeforeToolCallHook({ toolName: "read", params: {}, ctx });
    expect(outcome).toMatchObject({ blocked: true });
    expect(records[0]).toMatchObject({
      type: "tool.hardware.halt",
      payload: { code: "hardware-required-missing" },
    });
  });

  it("halts before the allowlist and before any approval prompt", async () => {
    installRuntime({ flavor: "enclaved" });
    mockPresent.mockReturnValue(true);
    mockHealth.mockReturnValue({ status: "DIRTY", reason: "zeroized" });
    const outcome = await runBeforeToolCallHook({ toolName: "exec", params: {}, ctx });
    expect(outcome).toMatchObject({ blocked: true });
    expect(mockGateway).not.toHaveBeenCalled();
  });
});

describe("irreversible-action approval (enclaved flavor)", () => {
  it("asks a person; a denial means the tool never runs", async () => {
    const records = installRuntime({ flavor: "enclaved" });
    answerApproval("deny");
    const { tool, execute } = wrapped("exec");
    await expect(tool.execute("c1", {}, undefined, undefined)).rejects.toThrow(/not approved/);
    expect(execute).not.toHaveBeenCalled();
    expect(mockGateway).toHaveBeenCalledWith(
      "plugin.approval.request",
      expect.anything(),
      expect.objectContaining({ pluginId: "enclawed", toolName: "exec", twoPhase: true }),
      expect.anything(),
    );
    expect(records.map((r) => [r.type, r.payload.decision])).toEqual([
      ["tool.irreversible.request", undefined],
      ["tool.irreversible.decision", "denied:deny"],
    ]);
  });

  it("runs the tool once a person approves", async () => {
    const records = installRuntime({ flavor: "enclaved" });
    answerApproval("allow-once");
    const { tool, execute } = wrapped("message");
    await tool.execute("c1", {}, undefined, undefined);
    expect(execute).toHaveBeenCalledOnce();
    expect(records.at(-1)).toMatchObject({
      type: "tool.irreversible.decision",
      payload: { tool: "message", capability: "publish", decision: "approved:allow-once" },
    });
  });

  it("refuses on timeout, no approval route, or an unreachable gateway", async () => {
    installRuntime({ flavor: "enclaved" });
    answerApproval("timeout");
    expect(await runBeforeToolCallHook({ toolName: "exec", params: {}, ctx })).toMatchObject({
      blocked: true,
    });
    mockGateway.mockResolvedValueOnce({ id: "plugin:2", decision: null });
    expect(await runBeforeToolCallHook({ toolName: "exec", params: {}, ctx })).toMatchObject({
      blocked: true,
      reason: expect.stringContaining("no-route"),
    });
    mockGateway.mockRejectedValueOnce(new Error("gateway down"));
    expect(await runBeforeToolCallHook({ toolName: "exec", params: {}, ctx })).toMatchObject({
      blocked: true,
      reason: expect.stringContaining("unavailable"),
    });
  });

  it("runs a pre-approved tool without asking, and audits the pre-approval", async () => {
    const records = installRuntime({ flavor: "enclaved", preApproved: ["exec"] });
    const { tool, execute } = wrapped("exec");
    await tool.execute("c1", {}, undefined, undefined);
    expect(execute).toHaveBeenCalledOnce();
    expect(mockGateway).not.toHaveBeenCalled();
    expect(records).toContainEqual(
      expect.objectContaining({
        type: "tool.irreversible.decision",
        payload: expect.objectContaining({ tool: "exec", decision: "pre-approved" }),
      }),
    );
  });

  it("does not ask about reversible calls", async () => {
    const records = installRuntime({ flavor: "enclaved" });
    for (const name of ["read", "web_fetch"]) {
      const { tool, execute } = wrapped(name);
      await tool.execute("c1", {}, undefined, undefined);
      expect(execute).toHaveBeenCalledOnce();
    }
    expect(mockGateway).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });

  it("treats an unknown tool as irreversible", async () => {
    installRuntime({ flavor: "enclaved" });
    answerApproval("deny");
    const { tool, execute } = wrapped("mystery_tool");
    await expect(tool.execute("c1", {}, undefined, undefined)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    expect(classifyToolCall("mystery_tool")).toEqual({
      capability: "tool.invoke",
      reversible: false,
    });
  });

  it("remembers allow-always for the rest of the session only", async () => {
    const records = installRuntime({ flavor: "enclaved" });
    answerApproval("allow-always");
    await runBeforeToolCallHook({ toolName: "exec", params: {}, ctx });
    mockGateway.mockReset();
    expect(await runBeforeToolCallHook({ toolName: "exec", params: {}, ctx })).toMatchObject({
      blocked: false,
    });
    expect(mockGateway).not.toHaveBeenCalled();
    expect(records.at(-1)?.payload.decision).toBe("session-approved");
    answerApproval("deny");
    expect(
      await runBeforeToolCallHook({
        toolName: "exec",
        params: {},
        ctx: { ...ctx, sessionKey: "s2" },
      }),
    ).toMatchObject({ blocked: true });
  });

  it("leaves the open flavor unchanged", async () => {
    const records = installRuntime({ flavor: "open" });
    for (const name of ["exec", "message", "mystery_tool"]) {
      const { tool, execute } = wrapped(name);
      await tool.execute("c1", {}, undefined, undefined);
      expect(execute).toHaveBeenCalledOnce();
    }
    expect(mockGateway).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });

  it("changes nothing before bootstrap (no runtime)", async () => {
    const { tool, execute } = wrapped("exec");
    await tool.execute("c1", {}, undefined, undefined);
    expect(execute).toHaveBeenCalledOnce();
  });
});
