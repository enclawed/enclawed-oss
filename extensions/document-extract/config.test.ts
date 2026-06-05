import { describe, expect, it } from "vitest";
import {
  admitExtractionRequest,
  DocumentExtractAdmissionError,
  DocumentExtractConfigError,
  isSourceAllowed,
  parseDocumentExtractConfig,
} from "./document-extractor.js";

describe("parseDocumentExtractConfig", () => {
  it("returns an empty config when no block exists", () => {
    expect(parseDocumentExtractConfig(undefined)).toEqual({});
    expect(parseDocumentExtractConfig(null)).toEqual({});
  });

  it("parses allowedSources and maxFileSizeMB", () => {
    const cfg = parseDocumentExtractConfig({
      allowedSources: ["/srv/uploads", "mcp://workspace/"],
      maxFileSizeMB: 25,
    });
    expect([...(cfg.allowedSources ?? [])]).toEqual(["/srv/uploads", "mcp://workspace/"]);
    expect(cfg.maxFileSizeMB).toBe(25);
  });

  it("rejects unknown keys", () => {
    expect(() =>
      parseDocumentExtractConfig({ allowedSources: ["x"], bogus: 1 }),
    ).toThrow(DocumentExtractConfigError);
  });

  it("rejects non-array allowedSources", () => {
    expect(() =>
      parseDocumentExtractConfig({ allowedSources: "x" }),
    ).toThrow(/allowedSources/);
  });

  it("rejects empty strings inside allowedSources", () => {
    expect(() =>
      parseDocumentExtractConfig({ allowedSources: ["", "ok"] }),
    ).toThrow(/allowedSources/);
  });

  it("rejects negative maxFileSizeMB", () => {
    expect(() =>
      parseDocumentExtractConfig({ maxFileSizeMB: -1 }),
    ).toThrow(/maxFileSizeMB/);
  });
});

describe("isSourceAllowed", () => {
  it("returns true when no allowlist is set", () => {
    expect(isSourceAllowed("/etc/passwd", undefined)).toBe(true);
    expect(isSourceAllowed("/etc/passwd", [])).toBe(true);
  });

  it("matches by prefix", () => {
    expect(isSourceAllowed("/srv/uploads/a.pdf", ["/srv/uploads"])).toBe(true);
    expect(isSourceAllowed("/etc/passwd", ["/srv/uploads"])).toBe(false);
  });

  it("rejects undefined sources when an allowlist is present", () => {
    expect(isSourceAllowed(undefined, ["/srv/uploads"])).toBe(false);
  });
});

describe("admitExtractionRequest", () => {
  it("passes when source and size are within limits", () => {
    expect(() =>
      admitExtractionRequest(
        { allowedSources: ["/srv/uploads"], maxFileSizeMB: 25 },
        { source: "/srv/uploads/a.pdf", byteLength: 1_000_000 },
      ),
    ).not.toThrow();
  });

  it("rejects sources outside allowedSources", () => {
    expect(() =>
      admitExtractionRequest(
        { allowedSources: ["/srv/uploads"] },
        { source: "/etc/passwd", byteLength: 100 },
      ),
    ).toThrow(DocumentExtractAdmissionError);
  });

  it("rejects oversize buffers", () => {
    expect(() =>
      admitExtractionRequest(
        { maxFileSizeMB: 1 },
        { source: "/srv/uploads/x.pdf", byteLength: 2 * 1024 * 1024 },
      ),
    ).toThrow(/maxFileSizeMB/);
  });

  it("ignores size when maxFileSizeMB is 0 or unset", () => {
    expect(() =>
      admitExtractionRequest({}, { source: "/x", byteLength: 9_999_999_999 }),
    ).not.toThrow();
  });
});
