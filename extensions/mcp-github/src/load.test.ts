import { afterEach, describe, expect, it } from "vitest";
import {
  _resetServerRegistryForTest,
  getServerById,
} from "../../mcp-attested/src/index.js";
import {
  DEFAULT_GITHUB_MCP_ENDPOINT,
  GITHUB_MCP_TOOLS,
  loadGithubBridge,
} from "./index.js";

describe("mcp-github bridge load", () => {
  afterEach(() => {
    _resetServerRegistryForTest();
  });

  it("refuses to load when ENCLAWED_GITHUB_TOKEN is unset", () => {
    expect(() => loadGithubBridge({ env: {} as NodeJS.ProcessEnv })).toThrow(
      /ENCLAWED_GITHUB_TOKEN/,
    );
  });

  it("loads from ENCLAWED_GITHUB_TOKEN and registers mcp.github at the default endpoint", () => {
    const result = loadGithubBridge({
      env: { ENCLAWED_GITHUB_TOKEN: "ghp_xyz" } as NodeJS.ProcessEnv,
    });
    expect(result.registered.id).toBe("mcp.github");
    expect(result.registered.endpoint).toBe(DEFAULT_GITHUB_MCP_ENDPOINT);
    expect(result.registered.allowedTools).toEqual(GITHUB_MCP_TOOLS);
    expect(getServerById("mcp.github")?.endpoint).toBe(DEFAULT_GITHUB_MCP_ENDPOINT);
  });

  it("falls back to ENCLAWED_GITHUB_TOKEN if the ENCLAWED_ name is unset", () => {
    const result = loadGithubBridge({
      env: { ENCLAWED_GITHUB_TOKEN: "ghp_legacy" } as NodeJS.ProcessEnv,
    });
    expect(result.registered.id).toBe("mcp.github");
  });

  it("honors ENCLAWED_GITHUB_MCP_ENDPOINT", () => {
    const result = loadGithubBridge({
      env: {
        ENCLAWED_GITHUB_TOKEN: "ghp_xyz",
        ENCLAWED_GITHUB_MCP_ENDPOINT: "http://10.0.0.5:8744/mcp/v1",
      } as NodeJS.ProcessEnv,
    });
    expect(result.registered.endpoint).toBe("http://10.0.0.5:8744/mcp/v1");
  });

  it("admits canonical GitHub PR + issues + repos + search tools by default", () => {
    expect(GITHUB_MCP_TOOLS).toContain("github.pulls.get");
    expect(GITHUB_MCP_TOOLS).toContain("github.pulls.list_files");
    expect(GITHUB_MCP_TOOLS).toContain("github.pulls.create_review_comment");
    expect(GITHUB_MCP_TOOLS).toContain("github.issues.create");
    expect(GITHUB_MCP_TOOLS).toContain("github.repos.get_content");
    expect(GITHUB_MCP_TOOLS).toContain("github.search.code");
  });

  it("respects a trimmed allowedTools override", () => {
    const result = loadGithubBridge({
      env: { ENCLAWED_GITHUB_TOKEN: "ghp_xyz" } as NodeJS.ProcessEnv,
      allowedTools: ["github.pulls.get", "github.pulls.list_files"],
    });
    expect(result.registered.allowedTools).toEqual([
      "github.pulls.get",
      "github.pulls.list_files",
    ]);
  });
});
