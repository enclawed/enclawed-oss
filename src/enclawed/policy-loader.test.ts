import { describe, expect, it } from "vitest";
import { LEVEL, makeLabel } from "./classification.js";
import { loadPolicyFromJson, parsePolicyJson } from "./policy-loader.js";

const DEFAULTS = {
  maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
  enforceAllowlists: true,
};

describe("parsePolicyJson", () => {
  it("returns defaults when block is undefined", () => {
    const p = parsePolicyJson(undefined, DEFAULTS);
    expect(p.enforceAllowlists).toBe(true);
    expect([...p.allowedHosts]).toEqual([]);
  });

  it("populates allowlists from JSON arrays", () => {
    const p = parsePolicyJson(
      {
        allowedHosts: ["gmail.googleapis.com", "127.0.0.1"],
        allowedChannels: ["mcp.workspace"],
        allowedProviders: ["local-model"],
        allowedTools: ["gmail.messages.list"],
      },
      DEFAULTS,
    );
    expect([...p.allowedHosts].sort()).toEqual(["127.0.0.1", "gmail.googleapis.com"]);
    expect([...p.allowedChannels]).toEqual(["mcp.workspace"]);
    expect([...p.allowedProviders]).toEqual(["local-model"]);
    expect([...p.allowedTools]).toEqual(["gmail.messages.list"]);
  });

  it("parses string clearance labels (active scheme)", () => {
    const p = parsePolicyJson(
      {
        maxOutputClearance: "UNCLASSIFIED",
        defaultDataLabel: "UNCLASSIFIED",
      },
      DEFAULTS,
    );
    expect(p.maxOutputClearance.level).toBe(0);
  });

  it("parses object label form", () => {
    const p = parsePolicyJson(
      {
        maxOutputClearance: { level: 1 },
        defaultDataLabel: { level: 1, compartments: ["RD"] },
      },
      DEFAULTS,
    );
    expect(p.maxOutputClearance.level).toBe(1);
    expect([...p.defaultDataLabel.compartments]).toEqual(["RD"]);
  });

  it("rejects non-array allowedHosts", () => {
    expect(() =>
      parsePolicyJson({ allowedHosts: "gmail.googleapis.com" } as unknown, DEFAULTS),
    ).toThrow(/allowedHosts/);
  });

  it("rejects non-boolean enforceAllowlists", () => {
    expect(() =>
      parsePolicyJson({ enforceAllowlists: "yes" } as unknown, DEFAULTS),
    ).toThrow(/enforceAllowlists/);
  });

  it("honors enforceAllowlists=false override", () => {
    const p = parsePolicyJson({ enforceAllowlists: false }, DEFAULTS);
    expect(p.enforceAllowlists).toBe(false);
  });
});

describe("loadPolicyFromJson", () => {
  it("extracts the enclawed.policy block from a top-level document", () => {
    const doc = {
      enclawed: {
        policy: {
          enforceAllowlists: true,
          allowedHosts: ["calendar.googleapis.com"],
        },
      },
      // other extension keys are ignored.
      extensions: { foo: { x: 1 } },
    };
    const p = loadPolicyFromJson(doc, DEFAULTS);
    expect([...p.allowedHosts]).toEqual(["calendar.googleapis.com"]);
  });

  it("falls back to defaults when no enclawed.policy block exists", () => {
    const p = loadPolicyFromJson({}, DEFAULTS);
    expect(p.enforceAllowlists).toBe(true);
    expect([...p.allowedHosts]).toEqual([]);
  });

  it("falls back to defaults when document is undefined", () => {
    const p = loadPolicyFromJson(undefined, DEFAULTS);
    expect(p.enforceAllowlists).toBe(true);
  });
});
