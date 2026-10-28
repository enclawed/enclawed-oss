// Unit tests for the CalDAV bridge that do NOT require a live
// server. Live coverage moves to a .live.test.ts under an
// operator-supplied CalDAV fixture.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetServerRegistryForTest,
  getServerById,
  isToolAdmitted,
  listServers,
} from "../../mcp-attested/src/index.js";
import { CALDAV_TOOLS, loadCalDavBridge } from "./index.js";

const BASE_OPTS = {
  serverUrl: "https://caldav.example.org/caldav/v2/",
  username: "alice@example.org",
  password: "abcdefghijklmnop",
};

describe("mcp-caldav / loadCalDavBridge", () => {
  beforeEach(() => {
    _resetServerRegistryForTest();
  });
  afterEach(() => {
    _resetServerRegistryForTest();
  });

  it("registers a server with id mcp.caldav under a synthetic mcp+caldav:// endpoint", () => {
    const { registered } = loadCalDavBridge(BASE_OPTS);
    expect(registered.id).toBe("mcp.caldav");
    expect(registered.bridge).toBe("mcp-caldav");
    expect(registered.endpoint).toBe("mcp+caldav://caldav.example.org/alice%40example.org");
    expect(listServers().length).toBe(1);
    expect(getServerById("mcp.caldav")?.endpoint).toBe(registered.endpoint);
  });

  // These three used to assume CALDAV_TOOLS was the read-only pair
  // (list_events, get_event) and asserted create/update/delete were never
  // admissible. The canonical list has since grown to include the write
  // operations -- the transport implements them and the executive-assistant app
  // asks for all five by name via allowedToolsOverride -- so the old
  // expectations described a bridge that no longer exists and had been failing
  // unnoticed, because extension tests do not run in the default lane.
  //
  // The property worth keeping is the one about the ceiling: an override may
  // NARROW the canonical list and can never widen past it. That is asserted
  // below with a name that is genuinely outside the list.
  it("admits the canonical CalDAV tools by default", () => {
    const { registered } = loadCalDavBridge(BASE_OPTS);
    for (const t of CALDAV_TOOLS) {
      expect(isToolAdmitted(registered, t)).toBe(true);
    }
    expect(registered.allowedTools.length).toBe(CALDAV_TOOLS.length);
  });

  it("denies tools outside the canonical list", () => {
    const { registered } = loadCalDavBridge(BASE_OPTS);
    expect(isToolAdmitted(registered, "drop_calendar")).toBe(false);
    expect(isToolAdmitted(registered, "list_calendars")).toBe(false);
    expect(isToolAdmitted(registered, "")).toBe(false);
  });

  it("allowedToolsOverride narrows without widening past CALDAV_TOOLS", () => {
    const { registered } = loadCalDavBridge({
      ...BASE_OPTS,
      allowedToolsOverride: ["list_events", "create_event", "nope"],
    });
    // "nope" is not in the canonical list, so the override cannot introduce it.
    expect(Array.from(registered.allowedTools)).toEqual(["list_events", "create_event"]);
    expect(isToolAdmitted(registered, "list_events")).toBe(true);
    expect(isToolAdmitted(registered, "create_event")).toBe(true);
    expect(isToolAdmitted(registered, "get_event")).toBe(false);
    expect(isToolAdmitted(registered, "nope")).toBe(false);
  });

  it("rejects construction when required fields are missing", () => {
    expect(() => loadCalDavBridge({ ...BASE_OPTS, serverUrl: "" })).toThrow(/serverUrl required/i);
    expect(() => loadCalDavBridge({ ...BASE_OPTS, password: "" })).toThrow(/password required/i);
    expect(() => loadCalDavBridge({ ...BASE_OPTS, username: "" })).toThrow(/username required/i);
  });

  it("custom endpoint override is honoured", () => {
    const { registered } = loadCalDavBridge({
      ...BASE_OPTS,
      endpoint: "mcp+caldav://fastmail.example.org/alice",
    });
    expect(registered.endpoint).toBe("mcp+caldav://fastmail.example.org/alice");
  });
});

describe("mcp-caldav / transport tools/call dispatch", () => {
  beforeEach(() => {
    _resetServerRegistryForTest();
  });
  afterEach(() => {
    _resetServerRegistryForTest();
  });

  it("returns ok:false with an actionable reason for non-tools/call MCP methods", async () => {
    const { registered } = loadCalDavBridge(BASE_OPTS);
    const res = await registered.transport.call("resources/list", {});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/unsupported MCP method/i);
    }
  });

  it("rejects unknown tool names", async () => {
    const { registered } = loadCalDavBridge(BASE_OPTS);
    // delete_event used to serve as the "unknown tool" here, from when it was
    // outside the canonical list. It is a real tool now, so this needs a name
    // that genuinely is not one.
    const res = await registered.transport.call("tools/call", {
      name: "drop_calendar",
      arguments: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/unknown tool/i);
    }
  });

  it("get_event requires an eventId argument", async () => {
    const { registered } = loadCalDavBridge(BASE_OPTS);
    const res = await registered.transport.call("tools/call", {
      name: "get_event",
      arguments: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/eventId is required/i);
    }
  });

  it("list_events rejects malformed time-range arguments before connecting", async () => {
    const { registered } = loadCalDavBridge(BASE_OPTS);
    const res = await registered.transport.call("tools/call", {
      name: "list_events",
      arguments: { start: "not-a-date" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/not a valid ISO-8601/i);
    }
  });
});
