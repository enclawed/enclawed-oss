// User-writable sources (env vars, ~/.enclawed config) may only tighten the
// posture; loosening needs the admin policy.

import { describe, expect, it } from "vitest";
import type { AdminPolicy } from "./admin-policy.js";
import {
  enclavedPostureWarnings,
  resolveAuditPathInputs,
  resolveBootPolicy,
  resolveFipsRequirement,
} from "./boot-posture.js";
import { createPolicy, defaultEnclavedPolicy } from "./policy.js";

const admin = (doc: Record<string, unknown>): AdminPolicy => ({
  source: { kind: "root-file", path: "/etc/enclawed/policy.json" },
  doc: { v: 1, ...doc },
});

describe("resolveBootPolicy (enclaved)", () => {
  it("refuses allowlist entries the user config adds over the flavor default", () => {
    const d = resolveBootPolicy({
      flavor: "enclaved",
      admin: null,
      userBlock: { allowedProviders: ["local-model", "openai"], allowedHosts: ["evil.example"] },
    });
    expect([...d.policy.allowedProviders]).toEqual(["local-model"]);
    expect(d.policy.allowedHosts.has("evil.example")).toBe(false);
    expect(d.refused.map((r) => r.setting)).toEqual([
      'enclawed.policy.allowedProviders += "openai"',
      'enclawed.policy.allowedHosts += "evil.example"',
    ]);
  });

  it("refuses enforceAllowlists=false and commandNetwork=host from the user config", () => {
    const d = resolveBootPolicy({
      flavor: "enclaved",
      admin: null,
      userBlock: { enforceAllowlists: false, commandNetwork: "host" },
    });
    expect(d.policy.enforceAllowlists).toBe(true);
    expect(d.policy.commandNetwork).toBe("none");
    expect(d.refused).toHaveLength(2);
  });

  it("refuses pre-approval and scratch-path additions; keeps narrowing and history opt-outs", () => {
    const d = resolveBootPolicy({
      flavor: "enclaved",
      admin: admin({
        policy: { allowedTools: ["read", "exec"], preApprovedIrreversibleTools: ["message"] },
      }),
      userBlock: {
        allowedTools: ["read"],
        preApprovedIrreversibleTools: ["exec"],
        scratchPaths: ["/srv/scratch"],
        history: { noHistoryTools: ["write"], maxAgeDays: 8 },
      },
    });
    expect([...d.policy.allowedTools]).toEqual(["read"]);
    expect([...d.policy.preApprovedIrreversibleTools]).toEqual([]);
    expect(d.policy.scratchPaths).toEqual([]);
    expect(d.policy.history.noHistoryTools.has("write")).toBe(true);
    // maxAgeDays is admin-only: a smaller user value would prune restore points sooner.
    expect(d.policy.history.maxAgeDays).toBe(30);
    expect(d.refused.map((r) => r.setting).join("\n")).toMatch(/preApprovedIrreversibleTools/);
    expect(d.refused.map((r) => r.setting).join("\n")).toMatch(/history\.maxAgeDays=8/);
  });

  it("takes allowlists from the admin policy", () => {
    const d = resolveBootPolicy({
      flavor: "enclaved",
      admin: admin({ policy: { allowedProviders: ["ollama"], enforceAllowlists: false } }),
      userBlock: undefined,
    });
    expect([...d.policy.allowedProviders]).toEqual(["ollama"]);
    expect(d.policy.enforceAllowlists).toBe(false);
    expect(enclavedPostureWarnings("enclaved", d.policy).join("\n")).toMatch(
      /enforceAllowlists is false/,
    );
  });

  it("keeps the user block authoritative in the open flavor without an admin policy", () => {
    const d = resolveBootPolicy({
      flavor: "open",
      admin: null,
      userBlock: { allowedProviders: ["openai"], enforceAllowlists: true },
    });
    expect([...d.policy.allowedProviders]).toEqual(["openai"]);
    expect(d.refused).toEqual([]);
  });

  it("refuses a higher output clearance and a lower default label", () => {
    const base = defaultEnclavedPolicy();
    const d = resolveBootPolicy({
      flavor: "enclaved",
      admin: null,
      userBlock: { maxOutputClearance: { level: 4 }, defaultDataLabel: { level: 0 } },
    });
    expect(d.policy.defaultDataLabel).toEqual(base.defaultDataLabel);
    expect(d.refused.map((r) => r.setting).join("\n")).toMatch(/defaultDataLabel/);
    void createPolicy;
  });
});

describe("resolveFipsRequirement", () => {
  it("refuses ENCLAWED_FIPS_REQUIRED=0 in the enclaved flavor", () => {
    const d = resolveFipsRequirement({
      flavor: "enclaved",
      env: { ENCLAWED_FIPS_REQUIRED: "0" },
      admin: null,
    });
    expect(d.required).toBe(true);
    expect(d.refused?.setting).toBe("ENCLAWED_FIPS_REQUIRED=0");
  });

  it("lets the admin policy drop it, and env turn it on", () => {
    expect(
      resolveFipsRequirement({
        flavor: "enclaved",
        env: {},
        admin: admin({ fipsRequired: false }),
      }),
    ).toMatchObject({ required: false, source: "admin-policy" });
    expect(
      resolveFipsRequirement({ flavor: "open", env: { ENCLAWED_FIPS_REQUIRED: "1" }, admin: null })
        .required,
    ).toBe(true);
  });
});

describe("resolveAuditPathInputs", () => {
  it("refuses ENCLAWED_AUDIT_PATH and enclawed.audit.path in the enclaved flavor", () => {
    const d = resolveAuditPathInputs({
      flavor: "enclaved",
      admin: null,
      envPath: "/dev/null",
      configPath: "/home/u/a.jsonl",
    });
    expect(d.envPath).toBeUndefined();
    expect(d.configPath).toBeUndefined();
    expect(d.allowUserFallback).toBe(false);
    expect(d.refused).toHaveLength(2);
  });

  it("uses the admin path and fallback setting", () => {
    expect(
      resolveAuditPathInputs({
        flavor: "enclaved",
        admin: admin({ audit: { path: "/srv/a.jsonl", allowUserFallback: true } }),
      }),
    ).toMatchObject({ adminPath: "/srv/a.jsonl", allowUserFallback: true, refused: [] });
  });

  it("keeps env and config in the open flavor", () => {
    expect(
      resolveAuditPathInputs({ flavor: "open", admin: null, envPath: "/tmp/a.jsonl" }),
    ).toMatchObject({ envPath: "/tmp/a.jsonl", allowUserFallback: true });
  });
});
