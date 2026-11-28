import os from "node:os";
import path from "node:path";
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
    expect([...p.allowedHosts].toSorted()).toEqual(["127.0.0.1", "gmail.googleapis.com"]);
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
    expect(() => parsePolicyJson({ enforceAllowlists: "yes" } as unknown, DEFAULTS)).toThrow(
      /enforceAllowlists/,
    );
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

describe("allowlist normalization", () => {
  it("lowercases and trims allowedTools and allowedHosts like preApprovedIrreversibleTools", () => {
    const p = parsePolicyJson(
      {
        allowedTools: [" Read", "WEB_FETCH"],
        allowedHosts: ["Docs.Example.com ", "API.example.NET"],
      },
      DEFAULTS,
    );
    expect([...p.allowedTools]).toEqual(["read", "web_fetch"]);
    expect([...p.allowedHosts]).toEqual(["docs.example.com", "api.example.net"]);
    expect(p.allowedTools.has("read")).toBe(true);
    expect(p.allowedHosts.has("docs.example.com")).toBe(true);
  });
});

describe("preApprovedIrreversibleTools", () => {
  it("defaults to empty, so every irreversible tool needs approval", () => {
    expect([...parsePolicyJson({}, DEFAULTS).preApprovedIrreversibleTools]).toEqual([]);
    expect([...parsePolicyJson(undefined, DEFAULTS).preApprovedIrreversibleTools]).toEqual([]);
  });

  it("normalizes listed tool ids", () => {
    const p = parsePolicyJson({ preApprovedIrreversibleTools: [" Message", "exec"] }, DEFAULTS);
    expect([...p.preApprovedIrreversibleTools]).toEqual(["message", "exec"]);
  });

  it("refuses non-arrays, empty ids and the wildcard", () => {
    expect(() => parsePolicyJson({ preApprovedIrreversibleTools: "exec" }, DEFAULTS)).toThrow(
      /string array/,
    );
    expect(() => parsePolicyJson({ preApprovedIrreversibleTools: [" "] }, DEFAULTS)).toThrow(
      /tool ids/,
    );
    expect(() => parsePolicyJson({ preApprovedIrreversibleTools: ["*"] }, DEFAULTS)).toThrow(
      /tool ids/,
    );
  });
});

describe("scratchPaths and history", () => {
  it("defaults keep every write that can have history reversible", () => {
    const p = parsePolicyJson({}, DEFAULTS);
    expect(p.scratchPaths).toEqual([]);
    expect(p.history.noHistoryPaths).toEqual([]);
    expect([...p.history.noHistoryTools]).toEqual([]);
    expect(p.history.maxFileBytes).toBeGreaterThan(0);
    expect(p.history.maxTotalBytes).toBeGreaterThan(p.history.maxFileBytes);
    expect(p.history.maxAgeDays).toBeGreaterThan(0);
  });

  it("parses scratch paths, caps and opt-outs", () => {
    const p = parsePolicyJson(
      {
        scratchPaths: ["/srv/agent-scratch/"],
        history: {
          maxFileBytes: 1024,
          maxTotalBytes: 4096,
          maxAgeDays: 7,
          noHistoryPaths: ["/data/datasets/**", "/srv/build/out"],
          noHistoryTools: ["Apply_Patch"],
        },
      },
      DEFAULTS,
    );
    expect(p.scratchPaths).toEqual(["/srv/agent-scratch"]);
    expect(p.history).toMatchObject({ maxFileBytes: 1024, maxTotalBytes: 4096, maxAgeDays: 7 });
    expect(p.history.noHistoryPaths).toEqual(["/data/datasets/**", "/srv/build/out"]);
    expect([...p.history.noHistoryTools]).toEqual(["apply_patch"]);
  });

  it.each([
    [{ scratchPaths: ["relative/dir"] }, /absolute/],
    [{ scratchPaths: ["/"] }, /filesystem root/],
    [{ scratchPaths: ["/srv/*"] }, /wildcards/],
    [{ scratchPaths: [os.homedir()] }, /home directory/],
    [{ history: { noHistoryPaths: ["*"] } }, /absolute/],
    [{ history: { noHistoryPaths: ["/**"] } }, /filesystem root/],
    [{ history: { noHistoryPaths: [""] } }, /empty/],
    [{ history: { noHistoryPaths: [`${path.dirname(os.homedir())}/*`] } }, /home directory/],
    [{ history: { noHistoryPaths: [`${os.homedir()}/**`] } }, /home directory/],
    [{ history: { noHistoryTools: ["*"] } }, /tool ids/],
    [{ history: { maxFileBytes: 0 } }, /positive integer/],
    [{ history: { maxAgeDays: -1 } }, /from 7 to 365/],
    [{ history: { maxAgeDays: 1e-6 } }, /from 7 to 365/],
    [{ history: { maxAgeDays: 6.99 } }, /from 7 to 365/],
    [{ history: { maxAgeDays: 366 } }, /from 7 to 365/],
    [{ history: { maxAgeDays: Number.POSITIVE_INFINITY } }, /from 7 to 365/],
    [{ history: { keepForever: true } }, /not a known setting/],
    [{ history: [] }, /must be an object/],
  ])("refuses %j", (block, message) => {
    expect(() => parsePolicyJson(block, DEFAULTS)).toThrow(message);
  });
});
