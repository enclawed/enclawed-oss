import { afterEach, describe, expect, it } from "vitest";
import {
  GoogleOAuthProvider,
  _resetServerRegistryForTest,
  getServerById,
  listServers,
} from "../../mcp-attested/src/index.js";
import {
  GOOGLE_WORKSPACE_ENDPOINTS,
  GOOGLE_WORKSPACE_TOOLS,
  loadGoogleWorkspaceBridge,
} from "./index.js";

describe("mcp-google-workspace bridge load", () => {
  afterEach(() => {
    _resetServerRegistryForTest();
  });

  it("declares canonical first-party endpoints for Gmail/Calendar/Drive/Chat/People", () => {
    expect(GOOGLE_WORKSPACE_ENDPOINTS.gmail).toBe("https://gmailmcp.googleapis.com/mcp/v1");
    expect(GOOGLE_WORKSPACE_ENDPOINTS.calendar).toBe("https://calendarmcp.googleapis.com/mcp/v1");
    expect(GOOGLE_WORKSPACE_ENDPOINTS.drive).toBe("https://drivemcp.googleapis.com/mcp/v1");
    expect(GOOGLE_WORKSPACE_ENDPOINTS.chat).toBe("https://chatmcp.googleapis.com/mcp/v1");
    expect(GOOGLE_WORKSPACE_ENDPOINTS.people).toBe("https://people.googleapis.com/mcp/v1");
  });

  it("refuses to load when neither direct token nor refresh-token env is set", () => {
    const oauth = new GoogleOAuthProvider({ env: {} });
    expect(() => loadGoogleWorkspaceBridge({ oauth })).toThrow(
      /ENCLAWED_GOOGLE_OAUTH_/,
    );
  });

  it("registers Gmail+Calendar by default with the canonical tool allowlists", () => {
    const oauth = new GoogleOAuthProvider({
      env: { ENCLAWED_GOOGLE_OAUTH_TOKEN: "ya29.test" },
    });
    const result = loadGoogleWorkspaceBridge({ oauth });
    expect(result.registered.map((r) => r.id)).toEqual([
      "mcp.google.gmail",
      "mcp.google.calendar",
    ]);
    const gmail = getServerById("mcp.google.gmail")!;
    expect(gmail.endpoint).toBe("https://gmailmcp.googleapis.com/mcp/v1");
    expect(gmail.allowedTools).toEqual(GOOGLE_WORKSPACE_TOOLS.gmail);
    expect(gmail.allowedTools).toContain("create_draft");
    expect(gmail.allowedTools).toContain("search_threads");
    const calendar = getServerById("mcp.google.calendar")!;
    expect(calendar.allowedTools).toContain("create_event");
    expect(calendar.allowedTools).toContain("suggest_time");
  });

  it("registers a custom subset when services= is supplied", () => {
    const oauth = new GoogleOAuthProvider({
      env: { ENCLAWED_GOOGLE_OAUTH_TOKEN: "ya29.test" },
    });
    loadGoogleWorkspaceBridge({ oauth, services: ["drive"] });
    expect(listServers().map((s) => s.id)).toEqual(["mcp.google.drive"]);
  });
});
