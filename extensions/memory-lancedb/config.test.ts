import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { validateJsonSchemaValue } from "../../src/plugins/schema-validator.js";
import { memoryConfigSchema } from "./config.js";

const manifest = JSON.parse(
  fs.readFileSync(new URL("./enclawed.plugin.json", import.meta.url), "utf-8"),
) as { configSchema: Record<string, unknown> };

describe("memory-lancedb config", () => {
  it("accepts dreaming in the manifest schema and preserves it in runtime parsing", () => {
    const manifestResult = validateJsonSchemaValue({
      schema: manifest.configSchema,
      cacheKey: "memory-lancedb.manifest.dreaming",
      value: {
        embedding: {
          apiKey: "sk-test",
        },
        dreaming: {
          enabled: true,
        },
      },
    });

    const parsed = memoryConfigSchema.parse({
      embedding: {
        apiKey: "sk-test",
      },
      dreaming: {
        enabled: true,
      },
    });

    expect(manifestResult.ok).toBe(true);
    expect(parsed.dreaming).toEqual({
      enabled: true,
    });
  });

  it("still rejects unrelated unknown top-level config keys", () => {
    expect(() => {
      memoryConfigSchema.parse({
        embedding: {
          apiKey: "sk-test",
        },
        dreaming: {
          enabled: true,
        },
        unexpected: true,
      });
    }).toThrow("memory config has unknown keys: unexpected");
  });

  it("rejects non-object dreaming values in runtime parsing", () => {
    expect(() => {
      memoryConfigSchema.parse({
        embedding: {
          apiKey: "sk-test",
        },
        dreaming: true,
      });
    }).toThrow("dreaming config must be an object");
  });

  describe("corpora[] config", () => {
    it("parses a single corpus", () => {
      const parsed = memoryConfigSchema.parse({
        embedding: { apiKey: "sk-test" },
        corpora: [
          {
            id: "research-papers",
            path: "/srv/corpora/papers",
            chunkSize: 1200,
            chunkOverlap: 200,
          },
        ],
      });
      expect(parsed.corpora).toBeDefined();
      expect(parsed.corpora?.length).toBe(1);
      expect(parsed.corpora?.[0]?.id).toBe("research-papers");
      expect(parsed.corpora?.[0]?.chunkSize).toBe(1200);
      expect(parsed.corpora?.[0]?.chunkOverlap).toBe(200);
    });

    it("applies default chunkSize/chunkOverlap", () => {
      const parsed = memoryConfigSchema.parse({
        embedding: { apiKey: "sk-test" },
        corpora: [{ id: "c", path: "/p" }],
      });
      expect(parsed.corpora?.[0]?.chunkSize).toBe(1000);
      expect(parsed.corpora?.[0]?.chunkOverlap).toBe(100);
    });

    it("rejects duplicate ids", () => {
      expect(() =>
        memoryConfigSchema.parse({
          embedding: { apiKey: "sk-test" },
          corpora: [
            { id: "x", path: "/a" },
            { id: "x", path: "/b" },
          ],
        }),
      ).toThrow(/duplicate id/);
    });

    it("rejects chunkOverlap >= chunkSize", () => {
      expect(() =>
        memoryConfigSchema.parse({
          embedding: { apiKey: "sk-test" },
          corpora: [{ id: "c", path: "/p", chunkSize: 100, chunkOverlap: 100 }],
        }),
      ).toThrow(/chunkOverlap/);
    });

    it("rejects unknown keys inside a corpus entry", () => {
      expect(() =>
        memoryConfigSchema.parse({
          embedding: { apiKey: "sk-test" },
          corpora: [{ id: "c", path: "/p", extra: 1 }],
        }),
      ).toThrow(/unknown key/);
    });

    it("rejects non-array corpora", () => {
      expect(() =>
        memoryConfigSchema.parse({
          embedding: { apiKey: "sk-test" },
          corpora: "not-an-array",
        }),
      ).toThrow(/corpora/);
    });
  });
});
