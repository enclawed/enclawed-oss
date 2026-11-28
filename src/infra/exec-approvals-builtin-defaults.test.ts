import { afterEach, describe, expect, it } from "vitest";
import { resolveBaseExecApprovalDecision } from "../agents/bash-tools.exec-host-shared.js";
import { clearRuntime, setRuntime, type EnclawedRuntime } from "../enclawed/runtime.js";
import {
  DEFAULT_EXEC_APPROVAL_ASK_FALLBACK,
  resolveBuiltinExecDefaults,
  resolveExecApprovalsFromFile,
} from "./exec-approvals.js";

function withFlavor(flavor: "open" | "enclaved") {
  setRuntime({ flavor } as unknown as EnclawedRuntime);
}

describe("built-in exec approval defaults", () => {
  afterEach(() => {
    clearRuntime();
  });

  it("denies when an approval prompt times out by default (every flavor)", () => {
    expect(DEFAULT_EXEC_APPROVAL_ASK_FALLBACK).toBe("deny");
    for (const flavor of ["open", "enclaved"] as const) {
      withFlavor(flavor);
      const resolved = resolveExecApprovalsFromFile({ file: { version: 1 } });
      expect(resolved.agent.askFallback).toBe("deny");
      const decision = resolveBaseExecApprovalDecision({
        decision: null,
        askFallback: resolved.agent.askFallback,
      });
      expect(decision).toEqual({
        approvedByAsk: false,
        deniedReason: "approval-timeout",
        timedOut: true,
      });
    }
  });

  it("uses allowlist + on-miss in the enclaved flavor", () => {
    withFlavor("enclaved");
    expect(resolveBuiltinExecDefaults()).toEqual({ security: "allowlist", ask: "on-miss" });
    const resolved = resolveExecApprovalsFromFile({ file: { version: 1 } });
    expect(resolved.agent.security).toBe("allowlist");
    expect(resolved.agent.ask).toBe("on-miss");
  });

  it("keeps full + off in the open flavor", () => {
    withFlavor("open");
    expect(resolveBuiltinExecDefaults()).toEqual({ security: "full", ask: "off" });
  });
});
