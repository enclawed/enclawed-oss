import { describe, expect, it } from "vitest";
import {
  buildReadPermissions,
  normalizeRepo,
  parsePermissionKeys,
  parseRepoArg,
} from "../../scripts/gh-read.js";

describe("gh-read helpers", () => {
  it("finds repo from gh args", () => {
    expect(parseRepoArg(["pr", "view", "42", "-R", "enclawed/enclawed"])).toBe("enclawed/enclawed");
    expect(parseRepoArg(["run", "list", "--repo=enclawed/docs"])).toBe("enclawed/docs");
    expect(parseRepoArg(["pr", "view", "42"])).toBeNull();
  });

  it("normalizes repo strings from common git formats", () => {
    expect(normalizeRepo("enclawed/enclawed")).toBe("enclawed/enclawed");
    expect(normalizeRepo("github.com/enclawed/enclawed")).toBe("enclawed/enclawed");
    expect(normalizeRepo("https://github.com/enclawed/enclawed.git")).toBe("enclawed/enclawed");
    expect(normalizeRepo("git@github.com:enclawed/enclawed.git")).toBe("enclawed/enclawed");
    expect(normalizeRepo("invalid")).toBeNull();
  });

  it("builds a read-only permission subset from granted permissions", () => {
    expect(
      buildReadPermissions(
        {
          actions: "write",
          issues: "read",
          administration: "write",
          metadata: "read",
          statuses: null,
        },
        ["actions", "issues", "metadata", "statuses", "administration"],
      ),
    ).toEqual({
      administration: "read",
      actions: "read",
      issues: "read",
      metadata: "read",
    });
  });

  it("parses permission key overrides", () => {
    expect(parsePermissionKeys(undefined)).toContain("pull_requests");
    expect(parsePermissionKeys("actions, contents ,issues")).toEqual([
      "actions",
      "contents",
      "issues",
    ]);
  });
});
