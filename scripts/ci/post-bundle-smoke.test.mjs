// post-bundle-smoke.test.mjs
//
// Unit coverage for the brace-walking JSON extractor used to parse
// `enclawed plugins doctor --json` output in post-bundle-smoke.mjs.
//
// The previous implementation used a per-line `startsWith("{")` filter
// which broke on multi-line pretty JSON. This test pins the new
// brace-walking extractor against the inputs the doctor actually
// produces (multi-line pretty, interleaved status lines, braces inside
// string values, etc).

import { describe, expect, it } from "vitest";
import { extractLastJsonObject } from "./post-bundle-smoke.mjs";

describe("extractLastJsonObject", () => {
  it("returns null for empty/non-string input", () => {
    expect(extractLastJsonObject("")).toBeNull();
    expect(extractLastJsonObject(null)).toBeNull();
    expect(extractLastJsonObject(undefined)).toBeNull();
  });

  it("returns null when no balanced object exists", () => {
    expect(extractLastJsonObject("nothing-here")).toBeNull();
    expect(extractLastJsonObject("{ unbalanced ")).toBeNull();
  });

  it("extracts a single-line compact object", () => {
    const payload = '{"summary":{"ok":3,"err":0},"plugins":[]}';
    expect(JSON.parse(extractLastJsonObject(payload))).toEqual({
      summary: { ok: 3, err: 0 },
      plugins: [],
    });
  });

  it("extracts a multi-line pretty-printed object", () => {
    const pretty = JSON.stringify(
      {
        summary: { total: 12, ok: 10, error: 2 },
        plugins: [
          { id: "bonjour", status: "ok" },
          { id: "codex", status: "error", error: "peer dep missing" },
        ],
      },
      null,
      2,
    );
    const parsed = JSON.parse(extractLastJsonObject(pretty));
    expect(parsed.summary.total).toBe(12);
    expect(parsed.plugins).toHaveLength(2);
    expect(parsed.plugins[1].error).toBe("peer dep missing");
  });

  it("picks the LAST balanced object when multiple are present", () => {
    const stdout = [
      "loading…",
      JSON.stringify({ progress: 0 }),
      "...",
      JSON.stringify({ progress: 50 }),
      "done.",
      JSON.stringify({ summary: { ok: 7 }, plugins: [] }, null, 2),
    ].join("\n");
    const parsed = JSON.parse(extractLastJsonObject(stdout));
    expect(parsed.summary.ok).toBe(7);
  });

  it("ignores braces inside JSON string values", () => {
    const payload = JSON.stringify(
      {
        plugins: [
          {
            id: "x",
            error: 'unexpected "{" in body',
            stack: "at fn { brace inside string }",
          },
        ],
      },
      null,
      2,
    );
    const parsed = JSON.parse(extractLastJsonObject(payload));
    expect(parsed.plugins[0].error).toContain("{");
    expect(parsed.plugins[0].stack).toContain("brace inside string");
  });

  it("handles escaped quotes inside strings", () => {
    const payload =
      '{\n  "msg": "he said \\"{\\" and then \\"}\\"",\n  "ok": true\n}';
    const parsed = JSON.parse(extractLastJsonObject(payload));
    expect(parsed.msg).toBe('he said "{" and then "}"');
    expect(parsed.ok).toBe(true);
  });

  it("survives prelude/postlude non-JSON noise", () => {
    const stdout = [
      "[doctor] loading plugins",
      "[doctor] inspecting bonjour",
      "[doctor] done; emitting json",
      "",
      JSON.stringify({ summary: { ok: 42 }, plugins: [] }, null, 2),
      "",
      "[doctor] bye",
    ].join("\n");
    const parsed = JSON.parse(extractLastJsonObject(stdout));
    expect(parsed.summary.ok).toBe(42);
  });

  it("round-trips a known pretty-JSON doctor payload", () => {
    const original = {
      summary: { total: 5, ok: 5, error: 0 },
      plugins: [
        { id: "a", status: "ok" },
        { id: "b", status: "ok" },
        { id: "c", status: "ok" },
        { id: "d", status: "ok" },
        { id: "e", status: "ok" },
      ],
      diagnostics: [],
    };
    const stdout =
      "doctor: scanning extensions/\n" +
      "doctor: report below\n" +
      JSON.stringify(original, null, 2);
    expect(JSON.parse(extractLastJsonObject(stdout))).toEqual(original);
  });
});
