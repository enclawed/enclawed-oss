// Settings audit Table 1 rows 37-69: the egress stages' manifest schemas are the
// first gate (config validation), so they must refuse the same weakening values
// the plugins' runtime readers refuse, and accept the shipped defaults and
// stricter values. Reads only the manifests (plugin metadata).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateJsonSchemaValue } from "../src/plugins/schema-validator.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXT = fs.existsSync(path.join(ROOT, "extensions", "enclaved", "egress-canonicalizer"))
  ? path.join(ROOT, "extensions", "enclaved")
  : path.join(ROOT, "extensions");

function schemaOf(id: string): Record<string, unknown> {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, id, "enclawed.plugin.json"), "utf8"));
  expect(manifest.securityStage).toBe(true);
  return manifest.configSchema;
}

function ok(id: string, value: unknown): boolean {
  return validateJsonSchemaValue({ schema: schemaOf(id), cacheKey: `${id}-bounds`, value }).ok;
}

const ATTACKS: Array<[string, Record<string, unknown>]> = [
  ["egress-llm-scrambler", { maxChars: 1 }],
  ["egress-llm-scrambler", { maxChars: 1_000_000 }],
  ["egress-canonicalizer", { stripInvisible: false }],
  ["egress-canonicalizer", { canonicalizeJson: false }],
  ["egress-noise-injector", { collapseWhitespaceRuns: false }],
  ["egress-semantic-scrambler", { canonicalizeSynonyms: false }],
  ["egress-taint-tracker", { enabled: false }],
  ["egress-image-scrambler", { luminanceBuckets: 1 }],
  ["egress-image-scrambler", { luminanceBuckets: 256 }],
  ["egress-image-scrambler", { depthLevels: 256 }],
  ["egress-audio-scrambler", { maxHz: 96_000 }],
  ["egress-audio-scrambler", { minHz: 0 }],
  ["egress-audio-scrambler", { perceptualFloor: 0 }],
  ["egress-audio-scrambler", { perceptualFloorDb: -1000 }],
  ["egress-timing-scrambler", { maxDelayMs: 0 }],
  ["egress-behavioral-invariants", { maxMessagesPerWindow: 1e9 }],
  ["egress-behavioral-invariants", { maxBytesPerWindow: 1e12 }],
  ["egress-behavioral-invariants", { windowMs: 1 }],
  ["egress-entropy-scanner", { minBlobLength: 65_536 }],
  ["egress-entropy-scanner", { entropyThresholdBits: 6 }],
  ["egress-entropy-scanner", { incompressibleRatio: 1 }],
  ["egress-replay-sentinel", { historyPerSink: 1 }],
  ["egress-cover-traffic", { meanIntervalMs: 86_400_000 }],
];

const ACCEPTED: Array<[string, Record<string, unknown>]> = [
  ["egress-llm-scrambler", { enabled: false }],
  ["egress-canonicalizer", { stripInvisible: true, canonicalizeJson: true }],
  ["egress-noise-injector", { normalizeTypography: true }],
  ["egress-semantic-scrambler", { enabled: false, passiveToActive: true }],
  ["egress-taint-tracker", { enabled: true }],
  ["egress-image-scrambler", { depthLevels: 64, luminanceBuckets: 8, colorSpace: "cmyk" }],
  ["egress-image-scrambler", { depthLevels: 2, luminanceBuckets: 2 }],
  ["egress-audio-scrambler", { minHz: 50, maxHz: 16_000, perceptualFloorDb: -40 }],
  ["egress-timing-scrambler", { minDelayMs: 0, maxDelayMs: 750 }],
  ["egress-timing-scrambler", { maxDelayMs: 5_000 }],
  ["egress-behavioral-invariants", { windowMs: 120_000, maxMessagesPerWindow: 10 }],
  ["egress-entropy-scanner", { minBlobLength: 32, entropyThresholdBits: 4 }],
  ["egress-replay-sentinel", { historyPerSink: 64 }],
  ["egress-cover-traffic", { meanIntervalMs: 30_000, coverContent: "ok" }],
];

describe("egress manifest schemas refuse weakening values", () => {
  it.each(ATTACKS)("attack: %s refuses %o", (id, value) => {
    expect(ok(id, value)).toBe(false);
  });
  it.each(ACCEPTED)("FP: %s accepts %o", (id, value) => {
    expect(ok(id, value)).toBe(true);
  });
});
