import { afterEach, describe, expect, it } from "vitest";
import { runBeforeToolCallHook } from "../agents/pi-tools.before-tool-call.js";
import type { AnyAgentTool } from "../agents/pi-tools.types.js";
import { applyToolPolicyPipeline } from "../agents/tool-policy-pipeline.js";
import { makeLabel, LEVEL } from "./classification.js";
import { createPolicy } from "./policy.js";
import { clearRuntime, setRuntime, type EnclawedRuntime } from "./runtime.js";
import {
  checkEnclawedToolCall,
  filterToolsByEnclawedPolicy,
  resetToolGateForTest,
} from "./tool-gate.js";

type AuditRecord = { type: string; payload: unknown };

function installRuntime(opts: { enforce: boolean; allowedTools: string[] }): AuditRecord[] {
  const records: AuditRecord[] = [];
  const policy = createPolicy({
    enforceAllowlists: opts.enforce,
    allowedTools: opts.allowedTools,
    maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
    defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  });
  const audit = {
    append: async (record: AuditRecord) => {
      records.push(record);
    },
  };
  setRuntime({
    flavor: opts.enforce ? "enclaved" : "open",
    policy,
    audit,
    restoreFetch: () => {},
    fipsRequired: false,
    moduleDecisions: null,
  } as unknown as EnclawedRuntime);
  return records;
}

const tool = (name: string) => ({ name }) as unknown as AnyAgentTool;
const names = (tools: { name: string }[]) => tools.map((t) => t.name);
const identity = (name: string) => name;

afterEach(() => {
  clearRuntime();
  resetToolGateForTest();
});

describe("enclawed tool gate", () => {
  it("allows everything before bootstrap", () => {
    expect(names(filterToolsByEnclawedPolicy([tool("exec")], identity))).toEqual(["exec"]);
    expect(checkEnclawedToolCall("exec").allowed).toBe(true);
  });

  it("allows everything when the flavor does not enforce allowlists", () => {
    installRuntime({ enforce: false, allowedTools: [] });
    expect(names(filterToolsByEnclawedPolicy([tool("exec"), tool("read")], identity))).toEqual([
      "exec",
      "read",
    ]);
    expect(checkEnclawedToolCall("exec").allowed).toBe(true);
  });

  it("removes tools outside the allowlist and audits each once", () => {
    const records = installRuntime({ enforce: true, allowedTools: ["read"] });
    const warnings: string[] = [];
    const offered = [tool("read"), tool("exec"), tool("write")];
    expect(names(filterToolsByEnclawedPolicy(offered, identity, (w) => warnings.push(w)))).toEqual([
      "read",
    ]);
    filterToolsByEnclawedPolicy(offered, identity, (w) => warnings.push(w));
    expect(warnings).toHaveLength(1);
    expect(records).toEqual([
      {
        type: "policy.deny.tool",
        actor: "process",
        level: null,
        payload: { stage: "offer", ids: ["exec", "write"] },
      },
    ]);
  });

  it("denies everything when enforcing with an empty allowlist", () => {
    installRuntime({ enforce: true, allowedTools: [] });
    expect(filterToolsByEnclawedPolicy([tool("read")], identity)).toEqual([]);
  });

  it("applies after the config tool policy pipeline", () => {
    installRuntime({ enforce: true, allowedTools: ["read"] });
    const filtered = applyToolPolicyPipeline({
      tools: [tool("read"), tool("exec")],
      toolMeta: () => undefined,
      warn: () => {},
      steps: [],
    });
    expect(names(filtered)).toEqual(["read"]);
  });

  it("blocks a denied tool at call time and audits the attempt", async () => {
    const records = installRuntime({ enforce: true, allowedTools: ["read"] });
    const outcome = await runBeforeToolCallHook({ toolName: "exec", params: {} });
    expect(outcome).toMatchObject({ blocked: true });
    expect(records).toContainEqual({
      type: "policy.deny.tool",
      actor: "process",
      level: null,
      payload: { stage: "call", id: "exec" },
    });
    const allowed = await runBeforeToolCallHook({ toolName: "read", params: {} });
    expect(allowed).toMatchObject({ blocked: false });
  });
});
