import { describe, expect, it } from "vitest";
import { DOCS_ROOT_URL, formatDocsLink, resolveDocsFile, resolveDocsUrl } from "./links.js";

const BLOB = "https://github.com/enclawed/enclawed-oss/blob/main/docs";

describe("formatDocsLink", () => {
  it("maps a relative path to the Markdown file in the public repo", () => {
    const out = formatDocsLink("/channels/telegram", "telegram");
    expect(out).toContain(`${BLOB}/channels/telegram.md`);
  });

  it("maps a section path to its index page and keeps anchors", () => {
    expect(resolveDocsUrl("/cli")).toBe(`${BLOB}/cli/index.md`);
    expect(resolveDocsUrl("/gateway/security#audit")).toBe(
      `${BLOB}/gateway/security/index.md#audit`,
    );
  });

  it("resolves legacy short paths through the alias table", () => {
    expect(resolveDocsFile("/telegram")).toEqual({ file: "channels/telegram.md", anchor: "" });
    expect(resolveDocsFile("/start/faq#x")).toEqual({ file: "help/faq.md", anchor: "#x" });
  });

  it("preserves an absolute http url", () => {
    const out = formatDocsLink("https://example.com/page", "page");
    expect(out).toContain("https://example.com/page");
  });

  it("treats whitespace-only path like an empty path and falls back to docs root", () => {
    const out = formatDocsLink("   ", "root");
    expect(out).toContain(DOCS_ROOT_URL);
    expect(formatDocsLink("/", "root")).toContain(DOCS_ROOT_URL);
  });

  it("does not crash when path is undefined (regression: #67076, #67074)", () => {
    expect(() => formatDocsLink(undefined as unknown as string, "label")).not.toThrow();
    const out = formatDocsLink(undefined as unknown as string, "label");
    expect(out).toContain(DOCS_ROOT_URL);
  });

  it("does not crash when path is null", () => {
    expect(() => formatDocsLink(null as unknown as string)).not.toThrow();
  });
});
