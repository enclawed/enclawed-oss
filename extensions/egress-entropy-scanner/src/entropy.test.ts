import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { compressionRatio, scanEntropy } from "./entropy.js";

const base64Blob = Buffer.from("exfiltrated secret payload bytes ".repeat(8)).toString("base64");
const hexBlob = Buffer.from("another secret payload here ".repeat(6)).toString("hex");
// Genuinely incompressible: base64 of cryptographically random bytes.
const randomBlob = randomBytes(400).toString("base64");

describe("compressionRatio", () => {
  it("is low for highly repetitive text", () => {
    expect(compressionRatio("ab".repeat(500))).toBeLessThan(0.2);
  });

  it("is high for an incompressible (random) blob", () => {
    expect(compressionRatio(randomBlob)).toBeGreaterThan(0.6);
  });
});

describe("scanEntropy", () => {
  it("reports nothing for an ordinary short message", () => {
    const report = scanEntropy("hey, can you check the build status please?");
    expect(report.estimatedCovertBits).toBe(0);
    expect(report.findings).toHaveLength(0);
  });

  it("flags an embedded base64 blob", () => {
    const report = scanEntropy(`here is the file: ${base64Blob}`);
    const finding = report.findings.find((f) => f.code === "base64-blob");
    expect(finding).toBeDefined();
    expect(report.estimatedCovertBits).toBeGreaterThan(0);
  });

  it("flags an embedded hex blob", () => {
    const report = scanEntropy(`digest ${hexBlob}`);
    expect(report.findings.some((f) => f.code === "hex-blob")).toBe(true);
  });

  it("estimates more covert bits for a longer blob", () => {
    const short = scanEntropy(Buffer.from("x".repeat(80)).toString("base64"));
    const long = scanEntropy(Buffer.from("x".repeat(800)).toString("base64"));
    expect(long.estimatedCovertBits).toBeGreaterThan(short.estimatedCovertBits);
  });

  it("respects a raised minimum blob length", () => {
    const report = scanEntropy(base64Blob, { minBlobLength: 100_000 });
    expect(report.findings.some((f) => f.code === "base64-blob")).toBe(false);
  });
});
