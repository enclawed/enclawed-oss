// Exec approvals are single use and bound to the exact command, node and
// requester (conformance: approval-replay). Uses the real ExecApprovalManager
// and the real node.invoke system.run gate.

import { describe, expect, test } from "vitest";
import { buildSystemRunApprovalBinding } from "../infra/system-run-approval-binding.js";
import { ExecApprovalManager } from "./exec-approval-manager.js";
import { sanitizeSystemRunParamsForForwarding } from "./node-invoke-system-run-approval.js";

const client = {
  connId: "conn-1",
  connect: {
    scopes: ["operator.write", "operator.approvals"],
    device: { id: "dev-1" },
    client: { id: "cli-1" },
  },
};

function setup(runId: string, timeoutMs = 60_000) {
  const manager = new ExecApprovalManager();
  const record = manager.create(
    {
      host: "node",
      nodeId: "node-1",
      command: "echo SAFE",
      commandArgv: ["echo", "SAFE"],
      systemRunBinding: buildSystemRunApprovalBinding({
        argv: ["echo", "SAFE"],
        cwd: null,
        agentId: null,
        sessionKey: null,
      }).binding,
      cwd: null,
      agentId: null,
      sessionKey: null,
    },
    timeoutMs,
    runId,
  );
  record.requestedByConnId = "conn-1";
  record.requestedByDeviceId = "dev-1";
  record.requestedByClientId = "cli-1";
  const decision = manager.register(record, timeoutMs);
  return { manager, record, decision };
}

function invoke(
  manager: ExecApprovalManager,
  runId: string,
  over: { command?: string[]; nodeId?: string; nowMs?: number } = {},
) {
  const command = over.command ?? ["echo", "SAFE"];
  return sanitizeSystemRunParamsForForwarding({
    nodeId: over.nodeId ?? "node-1",
    rawParams: {
      command,
      rawCommand: command.join(" "),
      runId,
      approved: true,
      approvalDecision: "allow-once",
    },
    client,
    execApprovalManager: manager,
    nowMs: over.nowMs ?? Date.now(),
  });
}

function code(result: ReturnType<typeof sanitizeSystemRunParamsForForwarding>) {
  return result.ok ? "ok" : result.details?.code;
}

describe("exec approval replay", () => {
  test("an allow-once runs the approved command once", async () => {
    const { manager, decision } = setup("run-ok");
    manager.resolve("run-ok", "allow-once", "operator");
    await decision;
    expect(code(invoke(manager, "run-ok"))).toBe("ok");
  });

  test("replaying a consumed allow-once is refused, whoever resolved it", async () => {
    // A resolver without a display name or client id is recorded as null;
    // the consumed record must still not pass for a timed-out one.
    const { manager, decision } = setup("run-replay");
    manager.resolve("run-replay", "allow-once", null);
    await decision;
    expect(code(invoke(manager, "run-replay"))).toBe("ok");
    expect(code(invoke(manager, "run-replay"))).toBe("APPROVAL_REQUIRED");
    expect(code(invoke(manager, "run-replay"))).toBe("APPROVAL_REQUIRED");
  });

  test("the timed-out fallback authorizes one run, not two", async () => {
    const { manager, decision } = setup("run-timeout");
    manager.expire("run-timeout");
    await decision;
    expect(code(invoke(manager, "run-timeout"))).toBe("ok");
    expect(code(invoke(manager, "run-timeout"))).toBe("APPROVAL_REQUIRED");
  });

  test("an approval for one command does not run another", async () => {
    const { manager, decision } = setup("run-args");
    manager.resolve("run-args", "allow-once", "operator");
    await decision;
    expect(invoke(manager, "run-args", { command: ["rm", "-rf", "/"] }).ok).toBe(false);
    // The refused attempt did not spend it: the approved command still runs once.
    expect(code(invoke(manager, "run-args"))).toBe("ok");
  });

  test("an approval for one node does not run on another", async () => {
    const { manager, decision } = setup("run-node");
    manager.resolve("run-node", "allow-once", "operator");
    await decision;
    expect(code(invoke(manager, "run-node", { nodeId: "node-2" }))).toBe("APPROVAL_NODE_MISMATCH");
  });

  test("an expired approval is refused", async () => {
    const { manager, record, decision } = setup("run-expired", 1_000);
    manager.resolve("run-expired", "allow-once", "operator");
    await decision;
    expect(code(invoke(manager, "run-expired", { nowMs: record.expiresAtMs + 1 }))).toBe(
      "APPROVAL_EXPIRED",
    );
  });

  test("a late resolve of an expired request is refused", async () => {
    const { manager, decision } = setup("run-late");
    manager.expire("run-late");
    await decision;
    expect(manager.resolve("run-late", "allow-once", "operator")).toBe(false);
  });

  test("an unknown approval id is refused", () => {
    const manager = new ExecApprovalManager();
    expect(code(invoke(manager, "never-issued"))).toBe("UNKNOWN_APPROVAL_ID");
  });
});
