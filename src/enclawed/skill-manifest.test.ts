import { describe, expect, test } from "vitest";

import {
  VERIFICATION,
  canonicalSkillBytes,
  contentSha256,
  isVerificationLevel,
  parseSkillManifest,
  verificationRank,
} from "./skill-manifest.js";

const goodJson = {
  v: 1,
  id: "skill-x",
  label: { level: 0, compartments: [], releasability: [] },
  caps: ["fs.read", "publish"],
  signer: "test-signer",
  version: 1,
  verification: "declared",
};

describe("skill-manifest", () => {
  test("parses a well-formed manifest", () => {
    const m = parseSkillManifest(goodJson);
    expect(m.id).toBe("skill-x");
    expect(m.verification).toBe("declared");
    expect([...m.caps]).toEqual(["fs.read", "publish"]);
  });

  test("verification defaults to unverified when omitted", () => {
    const j = { ...goodJson } as Record<string, unknown>;
    delete j.verification;
    expect(parseSkillManifest(j).verification).toBe(VERIFICATION.UNVERIFIED);
  });

  test("rejects unknown capability tokens", () => {
    const bad = { ...goodJson, caps: ["fs.read", "totally.fake"] };
    expect(() => parseSkillManifest(bad)).toThrow(/unknown capability/);
  });

  test("rejects unknown manifest field", () => {
    const bad = { ...goodJson, extraneous: 1 } as unknown;
    expect(() => parseSkillManifest(bad)).toThrow(/unknown field/);
  });

  test("rejects __proto__ smuggling via JSON.parse (the realistic attack vector)", () => {
    const polluted = JSON.parse(
      `{"v":1,"id":"x","label":{"level":0},"caps":[],"signer":"x","version":1,"verification":"unverified","__proto__":{"polluted":true}}`,
    );
    expect(() => parseSkillManifest(polluted)).toThrow(/forbidden key/);
  });

  test("rejects negative version", () => {
    expect(() => parseSkillManifest({ ...goodJson, version: -1 })).toThrow(/non-negative integer/);
  });

  test("verification rank is monotone", () => {
    expect(verificationRank("unverified")).toBe(0);
    expect(verificationRank("declared")).toBe(1);
    expect(verificationRank("tested")).toBe(2);
    expect(verificationRank("formal")).toBe(3);
    expect(isVerificationLevel("unverified")).toBe(true);
    expect(isVerificationLevel("hand-wavy")).toBe(false);
  });

  test("canonical bytes are stable under key reordering and depend on content hash", () => {
    const m = parseSkillManifest(goodJson);
    const sameOrder = parseSkillManifest({
      verification: "declared",
      version: 1,
      signer: "test-signer",
      caps: ["publish", "fs.read"],
      label: { level: 0, compartments: [], releasability: [] },
      id: "skill-x",
      v: 1,
    });
    const h1 = contentSha256("hello");
    expect(canonicalSkillBytes(m, h1).toString("utf8")).toBe(
      canonicalSkillBytes(sameOrder, h1).toString("utf8"),
    );
    const h2 = contentSha256("hello!");
    expect(canonicalSkillBytes(m, h1).toString("utf8")).not.toBe(
      canonicalSkillBytes(m, h2).toString("utf8"),
    );
  });
});
