// Approval single use, binding and resource re-resolution on the gateway tool
// path (conformance: approval-replay, approval-toctou).
//
// Each test drives the real gate (runBeforeToolCallHook) in the enclaved
// flavor with file writes forced irreversible, so a person is asked. The
// person is played by a scoped approver (runWithToolCallApprover), which also
// performs the attack while the request is pending: swapping the approved
// path for a symlink, replacing the file, hard-linking it, renaming its
// directory, editing the arguments, or answering after the approval expired.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAgentToolGuardForTest } from "../enclawed/agent-tool-guard.js";
import { LEVEL, makeLabel } from "../enclawed/classification.js";
import { createPolicy } from "../enclawed/policy.js";
import { clearRuntime, setRuntime, type EnclawedRuntime } from "../enclawed/runtime.js";
import { runBeforeToolCallHook } from "./pi-tools.before-tool-call.js";
import { __testing as grantTesting } from "./tool-call-approval-grant.js";
import { runWithToolCallApprover, type ToolCallApprovalRequest } from "./tool-call-approval.js";

// Never reach a real gateway from this suite.
vi.mock("./tools/gateway.js", () => ({
  callGatewayTool: vi.fn(async () => {
    throw new Error("no gateway in this test");
  }),
}));

type AuditRecord = { type: string; payload: Record<string, unknown> };

let workspace: string;
let outside: string;
let records: AuditRecord[];

function installRuntime(): void {
  records = [];
  setRuntime({
    flavor: "enclaved",
    policy: createPolicy({
      enforceAllowlists: false,
      // No history for writes: every write needs a person.
      history: { noHistoryTools: ["write", "edit", "apply_patch"] },
      maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    }),
    audit: {
      append: async (r: AuditRecord) => {
        records.push(r);
      },
      flush: async () => {},
      failure: null,
    },
    restoreFetch: () => {},
    fipsRequired: false,
    moduleDecisions: null,
  } as unknown as EnclawedRuntime);
}

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-approval-ws-"));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-approval-protected-"));
  installRuntime();
});

afterEach(() => {
  clearRuntime();
  resetAgentToolGuardForTest();
  vi.useRealTimers();
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

const ctx = () => ({ agentId: "main", sessionKey: "s1", fsRoot: workspace });

/** A person who allows once, after `during` ran while the request was pending. */
function approver(during: (req: ToolCallApprovalRequest) => void = () => {}) {
  const asked: ToolCallApprovalRequest[] = [];
  const fn = async (req: ToolCallApprovalRequest) => {
    asked.push(req);
    during(req);
    return { kind: "decision" as const, decision: "allow-once" as const };
  };
  return { fn, asked };
}

async function gateWrite(params: Record<string, unknown>, during?: () => void) {
  const a = approver(during);
  const outcome = await runWithToolCallApprover(a.fn, () =>
    runBeforeToolCallHook({ toolName: "write", params, toolCallId: "c1", ctx: ctx() }),
  );
  return { outcome, asked: a.asked };
}

describe("approval-to-execution resource changes (TOCTOU)", () => {
  it("runs an approved write whose target did not change", async () => {
    fs.writeFileSync(path.join(workspace, "notes.txt"), "v1");
    const { outcome, asked } = await gateWrite({ path: "notes.txt", content: "v2" });
    expect(asked).toHaveLength(1);
    expect(asked[0].description).toContain(path.join(workspace, "notes.txt"));
    expect(outcome.blocked).toBe(false);
  });

  it("is not fooled by an in-place content change (same file, same approval)", async () => {
    const p = path.join(workspace, "notes.txt");
    fs.writeFileSync(p, "v1");
    const { outcome } = await gateWrite({ path: "notes.txt", content: "v2" }, () => {
      fs.appendFileSync(p, " more");
    });
    expect(outcome.blocked).toBe(false);
  });

  it("refuses when the approved path is swapped for a symlink to a protected file", async () => {
    const p = path.join(workspace, "notes.txt");
    const secret = path.join(outside, "authorized_keys");
    fs.writeFileSync(p, "v1");
    fs.writeFileSync(secret, "ssh-ed25519 AAAA");
    const { outcome } = await gateWrite({ path: "notes.txt", content: "pwned" }, () => {
      fs.rmSync(p);
      fs.symlinkSync(secret, p);
    });
    expect(outcome).toMatchObject({ blocked: true });
    expect((outcome as { reason: string }).reason).toMatch(/must be approved again/);
    expect(records.at(-1)).toMatchObject({
      type: "tool.approval.refused",
      payload: { tool: "write", code: "resource-changed" },
    });
  });

  it("refuses when a missing target appears as a symlink before execution", async () => {
    const secret = path.join(outside, "shadow");
    fs.writeFileSync(secret, "x");
    const { outcome } = await gateWrite({ path: "new.txt", content: "y" }, () => {
      fs.symlinkSync(secret, path.join(workspace, "new.txt"));
    });
    expect(outcome.blocked).toBe(true);
  });

  it("refuses when the file is replaced by another file", async () => {
    const p = path.join(workspace, "notes.txt");
    fs.writeFileSync(p, "v1");
    const { outcome } = await gateWrite({ path: "notes.txt", content: "v2" }, () => {
      fs.writeFileSync(`${p}.new`, "other");
      fs.renameSync(`${p}.new`, p);
    });
    expect(outcome.blocked).toBe(true);
  });

  it("refuses when the file is replaced by a hard link to a protected file", async () => {
    const p = path.join(workspace, "notes.txt");
    const secret = path.join(outside, "secret.txt");
    fs.writeFileSync(p, "v1");
    fs.writeFileSync(secret, "s");
    const { outcome } = await gateWrite({ path: "notes.txt", content: "v2" }, () => {
      fs.rmSync(p);
      fs.linkSync(secret, p);
    });
    expect(outcome.blocked).toBe(true);
  });

  it("refuses when the directory holding the target is renamed and replaced", async () => {
    const dir = path.join(workspace, "docs");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "v1");
    const { outcome } = await gateWrite({ path: "docs/a.txt", content: "v2" }, () => {
      fs.renameSync(dir, path.join(workspace, "docs-old"));
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "a.txt"), "decoy");
    });
    expect(outcome.blocked).toBe(true);
  });

  it("refuses when the directory is swapped for a symlink elsewhere", async () => {
    const dir = path.join(workspace, "docs");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "v1");
    fs.writeFileSync(path.join(outside, "a.txt"), "protected");
    const { outcome } = await gateWrite({ path: "docs/a.txt", content: "v2" }, () => {
      fs.rmSync(dir, { recursive: true });
      fs.symlinkSync(outside, dir);
    });
    expect(outcome.blocked).toBe(true);
  });
});

describe("approval replay and binding", () => {
  it("asks again for a second identical call: one approval runs one call", async () => {
    fs.writeFileSync(path.join(workspace, "notes.txt"), "v1");
    const a = approver();
    await runWithToolCallApprover(a.fn, async () => {
      for (const id of ["c1", "c2"]) {
        const outcome = await runBeforeToolCallHook({
          toolName: "write",
          params: { path: "notes.txt", content: "v2" },
          toolCallId: id,
          ctx: ctx(),
        });
        expect(outcome.blocked).toBe(false);
      }
    });
    expect(a.asked).toHaveLength(2);
  });

  it("refuses when the arguments are changed while the person is deciding", async () => {
    const params: Record<string, unknown> = { path: "notes.txt", content: "approved text" };
    const { outcome } = await gateWrite(params, () => {
      params.content = "something else";
    });
    expect(outcome.blocked).toBe(true);
    expect(records.at(-1)).toMatchObject({
      type: "tool.approval.refused",
      payload: { code: "args-mismatch" },
    });
  });

  it("refuses an approval that arrives after it expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { outcome } = await gateWrite({ path: "late.txt", content: "x" }, () => {
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    });
    expect(outcome.blocked).toBe(true);
    expect(records.at(-1)).toMatchObject({
      type: "tool.approval.refused",
      payload: { code: "expired" },
    });
  });

  it("refuses to spend a consumed grant twice", async () => {
    const ledger = grantTesting.ledger;
    const grant = ledger.issue({ tool: "write", args: { a: 1 } }, { ttlMs: 60_000 });
    expect(ledger.approve(grant.id)).toBe(true);
    expect(ledger.consume(grant.id, { tool: "write", args: { a: 1 } }).ok).toBe(true);
    expect(ledger.consume(grant.id, { tool: "write", args: { a: 1 } })).toMatchObject({
      ok: false,
      code: "replayed",
    });
  });
});
