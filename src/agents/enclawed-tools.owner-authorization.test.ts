import { describe, expect, it } from "vitest";
import {
  isEnclawedOwnerOnlyCoreToolName,
  ENCLAWED_OWNER_ONLY_CORE_TOOL_NAMES,
} from "./tools/owner-only-tools.js";

describe("createEnclawedTools owner authorization", () => {
  it("marks owner-only core tool names", () => {
    expect(ENCLAWED_OWNER_ONLY_CORE_TOOL_NAMES).toEqual(["cron", "gateway", "nodes"]);
    expect(isEnclawedOwnerOnlyCoreToolName("cron")).toBe(true);
    expect(isEnclawedOwnerOnlyCoreToolName("gateway")).toBe(true);
    expect(isEnclawedOwnerOnlyCoreToolName("nodes")).toBe(true);
  });

  it("keeps canvas non-owner-only", () => {
    expect(isEnclawedOwnerOnlyCoreToolName("canvas")).toBe(false);
  });
});
