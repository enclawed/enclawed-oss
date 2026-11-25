import { describe, expect, it } from "vitest";
import { assessHost } from "./host.js";
import type { HostCapabilities } from "./types.js";

// A host with a denying pre-tool hook over every tool and subagent (a
// configured fail-closed), settings injected above the repository, and an
// on-disk transcript with stable call ids whose format is not stable. Each
// adapter declares its own host's profile; this one is a test fixture.
const FULL_HOST: HostCapabilities = {
  host: "test-host",
  preToolHook: {
    canDeny: true,
    coversAllTools: true,
    coversSubagents: "yes",
    onFailure: "blocks-when-configured",
    delivery: "external-program",
  },
  outputRewrite: "full",
  settingsInjection: { channel: "flag", ranksAboveRepository: "yes", projectHooksVisible: "yes" },
  transcript: { onDisk: "yes", stableCallIds: "yes", formatStable: "no" },
};

describe("host capabilities", () => {
  it("a full host meets R1 to R4; its gaps are the configured fail-closed and the unstable transcript", () => {
    const a = assessHost(FULL_HOST);
    expect(a.supported).toBe(true);
    expect(a.met).toEqual(["R1", "R2", "R3", "R4"]);
    expect(a.cleanerApplies).toBe(true);
    expect(a.gaps).toHaveLength(2);
  });

  it("a host without a denying pre-tool hook is not supported", () => {
    const a = assessHost({
      ...FULL_HOST,
      host: "no-hooks",
      preToolHook: { ...FULL_HOST.preToolHook, canDeny: false },
      outputRewrite: "none",
    });
    expect(a.supported).toBe(false);
    expect(a.cleanerApplies).toBe(false);
    expect(a.met).not.toContain("R1");
  });

  it("a fail-open, plugin-delivered hook without subagent coverage is supported with stated gaps", () => {
    const a = assessHost({
      ...FULL_HOST,
      preToolHook: {
        canDeny: true,
        coversAllTools: true,
        coversSubagents: "not-documented",
        onFailure: "continues",
        delivery: "in-process-plugin",
      },
      settingsInjection: {
        channel: "none",
        ranksAboveRepository: "no",
        projectHooksVisible: "not-documented",
      },
    });
    expect(a.supported).toBe(true);
    expect(a.met).toEqual(["R1", "R2", "R4"]);
    expect(a.gaps.join(" ")).toMatch(/lets the call run/);
    expect(a.gaps.join(" ")).toMatch(/subagents/);
    expect(a.gaps.join(" ")).toMatch(/plugin inside the host process/);
  });
});
