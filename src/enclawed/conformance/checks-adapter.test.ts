// The adapter conformance run: a reference adapter that hands every intent to
// the kit unchanged passes every invariant; the same adapter with the kit's
// decision stubbed to "allow" fails every attack case (it passes only
// because of Enclawed).

import path from "node:path";
import { describe, expect, it } from "vitest";
import { decidePreAction } from "../adapter/engine.js";
import { nodeFsProbe } from "../adapter/fs-probe.js";
import { NO_SHELL_DEFINITIONS } from "../adapter/shell-definitions.js";
import type { PreActionEvent } from "../adapter/types.js";
import type { HardwareGateDecision } from "../agent-tool-guard.js";
import { LEVEL, makeLabel } from "../classification.js";
import { HistoryStore } from "../history-store.js";
import { createPolicy } from "../policy.js";
import {
  ADAPTER_CASE_IDS,
  adapterChecks,
  type AdapterIntent,
  type AdapterSandbox,
  type ConformanceAdapter,
} from "./checks-adapter.js";
import { runConformanceChecks } from "./index.js";

function eventOf(i: AdapterIntent, s: AdapterSandbox): PreActionEvent {
  const base = {
    type: "pre-action" as const,
    actor: { sessionId: "conf", subagentId: null },
    callId: null,
    cwd: s.projectDir,
    approvalRoute: i.headless ? ("no-person" as const) : ("person" as const),
  };
  switch (i.action) {
    case "write":
      return {
        ...base,
        tool: "write",
        policyIds: ["write"],
        kind: "fs-write",
        params: { path: i.path },
        writes: [{ path: i.path, op: "write" }],
      };
    case "read":
      return {
        ...base,
        tool: "read",
        policyIds: ["read"],
        kind: "read",
        params: { path: i.path },
        reads: [{ path: i.path }],
      };
    case "search":
      return {
        ...base,
        tool: "search",
        policyIds: ["search"],
        kind: "read",
        params: { pattern: i.pattern, ...(i.path ? { path: i.path } : {}) },
        reads: [{ path: i.path ?? s.projectDir, recursive: true }],
        literalParams: ["pattern"],
      };
    case "shell":
      return {
        ...base,
        tool: "shell",
        policyIds: ["exec"],
        kind: "shell",
        params: { command: i.command },
        command: { text: i.command, dialect: "posix" },
      };
    case "fetch":
      return {
        ...base,
        tool: "fetch",
        policyIds: ["web_fetch"],
        kind: "fetch",
        params: { url: i.url },
        url: i.url,
      };
    default:
      return {
        ...base,
        tool: `mcp__${i.server}__${i.tool}`,
        policyIds: ["mcp"],
        kind: "mcp",
        params: i.arguments,
        mcp: { server: i.server, tool: i.tool },
      };
  }
}

function reference(decide: typeof decidePreAction): ConformanceAdapter {
  return {
    host: "reference",
    async decide(i, s) {
      const pol = createPolicy({
        enforceAllowlists: false,
        maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
        defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      });
      const { McpSession } = await import("../adapter/mcp.js");
      const d = await decide(eventOf(i, s), {
        host: "reference",
        policy: pol,
        // The reference host runs commands in a shell that defines nothing.
        shellDefinitions: NO_SHELL_DEFINITIONS,
        projectDir: s.projectDir,
        home: s.home,
        history: {
          store: new HistoryStore({ dir: path.join(s.home, ".hist"), limits: pol.history }),
        },
        hardware: (): HardwareGateDecision =>
          s.hardware === "halted"
            ? { allowed: false, code: "hardware-dirty", reason: "halted" }
            : { allowed: true },
        protected: { paths: [s.stateDir], prefixes: [] },
        secretPaths: [s.hostSecret],
        mcp: new McpSession([]),
        fs: nodeFsProbe(),
        skills: s.skills,
      });
      return { outcome: d.outcome, codes: d.codes };
    },
  };
}

describe("adapter conformance", () => {
  it("a reference adapter on the kit passes every invariant", async () => {
    const checks = adapterChecks(reference(decidePreAction));
    const r = await runConformanceChecks({ only: checks.map((c) => c.id), extraChecks: checks });
    expect(r.results.length).toBe(ADAPTER_CASE_IDS.length);
    expect(r.results.filter((x) => x.status !== "pass")).toEqual([]);
  });

  it("the same adapter with the kit's decision stubbed to allow fails every attack case", async () => {
    const stub: typeof decidePreAction = async () => ({
      outcome: "allow",
      reason: "stub",
      codes: ["read"],
      capability: null,
      reversible: true,
    });
    const checks = adapterChecks(reference(stub));
    const r = await runConformanceChecks({ only: checks.map((c) => c.id), extraChecks: checks });
    const failed = r.results.filter((x) => x.status === "fail").map((x) => x.id.split(":").at(-1));
    expect(failed.length).toBe(16);
    expect(failed.every((id) => !id?.startsWith("fp-"))).toBe(true);
    expect(r.ok).toBe(false);
  });
});
