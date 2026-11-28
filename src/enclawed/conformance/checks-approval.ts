// Conformance: approvals are single use, bound to the exact call, and the
// resources they name are re-resolved at execution.

import fs from "node:fs";
import path from "node:path";
import { runBeforeToolCallHook } from "../../agents/pi-tools.before-tool-call.js";
import {
  runWithToolCallApprover,
  type ToolCallApprovalRequest,
} from "../../agents/tool-call-approval.js";
import { ExecApprovalManager } from "../../gateway/exec-approval-manager.js";
import { sanitizeSystemRunParamsForForwarding } from "../../gateway/node-invoke-system-run-approval.js";
import { buildSystemRunApprovalBinding } from "../../infra/system-run-approval-binding.js";
import { resetAgentToolGuardForTest } from "../agent-tool-guard.js";
import { ApprovalGrantLedger } from "../approval-binding.js";
import {
  expectThat,
  installSandboxRuntime,
  withEnv,
  withTempDir,
  type ConformanceCheck,
} from "./types.js";

const client = {
  connId: "conn-1",
  connect: {
    scopes: ["operator.write", "operator.approvals"],
    device: { id: "dev-1" },
    client: { id: "cli-1" },
  },
};

function execApproval(runId: string) {
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
    60_000,
    runId,
  );
  record.requestedByConnId = "conn-1";
  record.requestedByDeviceId = "dev-1";
  record.requestedByClientId = "cli-1";
  const decision = manager.register(record, 60_000);
  const invoke = (over: { command?: string[]; nodeId?: string; nowMs?: number } = {}) => {
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
  };
  return { manager, record, decision, invoke };
}

const DENY = { kind: "decision" as const, decision: "deny" as const };
const ALLOW_ONCE = { kind: "decision" as const, decision: "allow-once" as const };

/** Gate one irreversible write in `workspace`; `during` runs while the person decides. */
async function gateWrite(
  workspace: string,
  params: Record<string, unknown>,
  during: () => void = () => {},
  toolCallId = "c1",
) {
  let asked = 0;
  const outcome = await runWithToolCallApprover(
    async (_req: ToolCallApprovalRequest) => {
      asked += 1;
      during();
      return ALLOW_ONCE;
    },
    () =>
      runBeforeToolCallHook({
        toolName: "write",
        params,
        toolCallId,
        ctx: { agentId: "conformance", sessionKey: "conformance", fsRoot: workspace },
      }),
  );
  return { blocked: outcome.blocked, asked };
}

function enclavedWritesNeedAPerson() {
  return installSandboxRuntime("enclaved", {
    history: { noHistoryTools: ["write", "edit", "apply_patch"] },
  });
}

const singleUse: ConformanceCheck = {
  id: "approval-replay",
  title: "Approval single use and binding",
  proves:
    "an approval runs one execution of the exact tool, arguments and target it was given for; a replay, other arguments, another target or a late answer is refused",
  remedy:
    "do not rely on approvals on this installation; reinstall it and report the failure to your Enclawed contact",
  async run() {
    // Exec approvals.
    const once = execApproval("conf-once");
    once.manager.resolve("conf-once", "allow-once", null);
    await once.decision;
    expectThat(once.invoke().ok, "an approved command did not run");
    expectThat(!once.invoke().ok, "a used exec approval ran a second time");
    const fallback = execApproval("conf-fallback");
    fallback.manager.expire("conf-fallback");
    await fallback.decision;
    expectThat(fallback.invoke().ok && !fallback.invoke().ok, "a timed-out fallback ran twice");
    const other = execApproval("conf-other");
    other.manager.resolve("conf-other", "allow-once", "operator");
    await other.decision;
    expectThat(
      !other.invoke({ command: ["rm", "-rf", "/"] }).ok,
      "an approval ran another command",
    );
    expectThat(!other.invoke({ nodeId: "node-2" }).ok, "an approval ran on another machine");
    expectThat(
      !other.invoke({ nowMs: other.record.expiresAtMs + 1 }).ok,
      "an expired exec approval ran",
    );

    // Grants (the tool-call path).
    let now = 1_000;
    const ledger = new ApprovalGrantLedger(() => now);
    const g = ledger.issue({ tool: "write", args: { path: "a" } }, { ttlMs: 1_000 });
    ledger.approve(g.id);
    expectThat(
      ledger.consume(g.id, { tool: "write", args: { path: "a" } }).ok,
      "a grant was refused",
    );
    expectThat(
      !ledger.consume(g.id, { tool: "write", args: { path: "a" } }).ok,
      "a grant was used twice",
    );
    const g2 = ledger.issue({ tool: "write", args: { path: "a" } }, { ttlMs: 1_000 });
    ledger.approve(g2.id);
    expectThat(
      !ledger.consume(g2.id, { tool: "write", args: { path: "b" } }).ok,
      "a grant covered other arguments",
    );
    const g3 = ledger.issue({ tool: "write", args: {} }, { ttlMs: 1_000 });
    ledger.approve(g3.id);
    now += 5_000;
    expectThat(!ledger.consume(g3.id, { tool: "write", args: {} }).ok, "an expired grant was used");

    // The gate itself: each call is asked about; arguments edited while the
    // person decides are refused.
    enclavedWritesNeedAPerson();
    try {
      await withEnv({ ENCLAWEDER_ROOT: undefined }, async () => {
        await withTempDir("approval", async (ws) => {
          const a = await gateWrite(ws, { path: "n.txt", content: "x" }, () => {}, "c1");
          const b = await gateWrite(ws, { path: "n.txt", content: "x" }, () => {}, "c2");
          expectThat(!a.blocked && !b.blocked, "an approved write was refused");
          expectThat(a.asked === 1 && b.asked === 1, "one approval covered two calls");
          const params: Record<string, unknown> = { path: "n.txt", content: "approved" };
          const edited = await gateWrite(ws, params, () => {
            params.content = "something else";
          });
          expectThat(edited.blocked, "arguments changed after approval still ran");
          const denied = await runWithToolCallApprover(
            async () => DENY,
            () =>
              runBeforeToolCallHook({
                toolName: "write",
                params: { path: "n.txt", content: "x" },
                ctx: { agentId: "conformance", sessionKey: "conformance", fsRoot: ws },
              }),
          );
          expectThat(denied.blocked, "a denied write ran");
        });
      });
    } finally {
      resetAgentToolGuardForTest();
    }
  },
};

const resourceChange: ConformanceCheck = {
  id: "approval-toctou",
  title: "Approval-to-execution resource changes",
  proves:
    "if the approved file or directory is swapped for a symlink, replaced, hard-linked or renamed before the action runs, the action is refused and must be approved again",
  remedy:
    "do not approve file writes on this installation until it is reinstalled; report the failure to your Enclawed contact",
  async run() {
    enclavedWritesNeedAPerson();
    try {
      await withEnv({ ENCLAWEDER_ROOT: undefined }, async () => {
        await withTempDir("toctou", async (root) => {
          const ws = path.join(root, "ws");
          const protectedDir = path.join(root, "protected");
          fs.mkdirSync(ws);
          fs.mkdirSync(protectedDir);
          const secret = path.join(protectedDir, "secret");
          fs.writeFileSync(secret, "s");
          const p = path.join(ws, "notes.txt");
          fs.writeFileSync(p, "v1");

          const unchanged = await gateWrite(ws, { path: "notes.txt", content: "v2" }, () => {
            fs.appendFileSync(p, "+");
          });
          expectThat(!unchanged.blocked, "an approved write to an unchanged file was refused");

          const cases: Array<[string, () => void]> = [
            [
              "swapped for a symlink",
              () => {
                fs.rmSync(p, { force: true });
                fs.symlinkSync(secret, p);
              },
            ],
            [
              "replaced by another file",
              () => {
                fs.rmSync(p, { force: true });
                fs.writeFileSync(`${p}.n`, "o");
                fs.renameSync(`${p}.n`, p);
              },
            ],
            [
              "replaced by a hard link",
              () => {
                fs.rmSync(p, { force: true });
                fs.linkSync(secret, p);
              },
            ],
          ];
          for (const [what, attack] of cases) {
            fs.rmSync(p, { force: true });
            fs.writeFileSync(p, "v1");
            const r = await gateWrite(ws, { path: "notes.txt", content: "pwned" }, attack);
            expectThat(r.blocked, `a write ran although its target was ${what} after approval`);
          }
          const dir = path.join(ws, "docs");
          fs.mkdirSync(dir);
          fs.writeFileSync(path.join(dir, "a.txt"), "v1");
          const renamed = await gateWrite(ws, { path: "docs/a.txt", content: "v2" }, () => {
            fs.renameSync(dir, path.join(ws, "docs-old"));
            fs.mkdirSync(dir);
            fs.writeFileSync(path.join(dir, "a.txt"), "decoy");
          });
          expectThat(
            renamed.blocked,
            "a write ran although its directory was replaced after approval",
          );
        });
      });
    } finally {
      resetAgentToolGuardForTest();
    }
  },
};

export const CHECKS: readonly ConformanceCheck[] = [singleUse, resourceChange];
