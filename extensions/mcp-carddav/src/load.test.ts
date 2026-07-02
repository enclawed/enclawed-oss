// Unit tests for the CardDAV bridge that do NOT require a live
// server. Live coverage moves to a .live.test.ts under an
// operator-supplied CardDAV fixture.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetServerRegistryForTest,
  getServerById,
  isToolAdmitted,
  listServers,
} from "../../mcp-attested/src/index.js";
import { CARDDAV_TOOLS, loadCardDavBridge, parseVCard } from "./index.js";

const BASE_OPTS = {
  serverUrl: "https://carddav.example.org/dav/",
  username: "alice@example.org",
  password: "abcdefghijklmnop",
};

describe("mcp-carddav / loadCardDavBridge", () => {
  beforeEach(() => {
    _resetServerRegistryForTest();
  });
  afterEach(() => {
    _resetServerRegistryForTest();
  });

  it("registers a server with id mcp.carddav under a synthetic mcp+carddav:// endpoint", () => {
    const { registered } = loadCardDavBridge(BASE_OPTS);
    expect(registered.id).toBe("mcp.carddav");
    expect(registered.bridge).toBe("mcp-carddav");
    expect(registered.endpoint).toBe("mcp+carddav://carddav.example.org/alice%40example.org");
    expect(listServers().length).toBe(1);
    expect(getServerById("mcp.carddav")?.endpoint).toBe(registered.endpoint);
  });

  it("admits the canonical CardDAV tools by default", () => {
    const { registered } = loadCardDavBridge(BASE_OPTS);
    for (const t of CARDDAV_TOOLS) {
      expect(isToolAdmitted(registered, t)).toBe(true);
    }
    expect(registered.allowedTools.length).toBe(2);
  });

  it("denies tools outside the canonical list", () => {
    const { registered } = loadCardDavBridge(BASE_OPTS);
    expect(isToolAdmitted(registered, "create_contact")).toBe(false);
    expect(isToolAdmitted(registered, "delete_contact")).toBe(false);
    expect(isToolAdmitted(registered, "update_contact")).toBe(false);
  });

  it("allowedToolsOverride narrows without widening past CARDDAV_TOOLS", () => {
    const { registered } = loadCardDavBridge({
      ...BASE_OPTS,
      allowedToolsOverride: ["search_contacts", "create_contact", "nope"],
    });
    expect(Array.from(registered.allowedTools)).toEqual(["search_contacts"]);
    expect(isToolAdmitted(registered, "search_contacts")).toBe(true);
    expect(isToolAdmitted(registered, "list_contacts")).toBe(false);
    expect(isToolAdmitted(registered, "create_contact")).toBe(false);
  });

  it("rejects construction when required fields are missing", () => {
    expect(() => loadCardDavBridge({ ...BASE_OPTS, serverUrl: "" })).toThrow(/serverUrl required/i);
    expect(() => loadCardDavBridge({ ...BASE_OPTS, password: "" })).toThrow(/password required/i);
    expect(() => loadCardDavBridge({ ...BASE_OPTS, username: "" })).toThrow(/username required/i);
  });
});

describe("mcp-carddav / transport tools/call dispatch", () => {
  beforeEach(() => {
    _resetServerRegistryForTest();
  });
  afterEach(() => {
    _resetServerRegistryForTest();
  });

  it("rejects non tools/call MCP methods", async () => {
    const { registered } = loadCardDavBridge(BASE_OPTS);
    const res = await registered.transport.call("resources/list", {});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/unsupported MCP method/i);
    }
  });

  it("rejects unknown tool names", async () => {
    const { registered } = loadCardDavBridge(BASE_OPTS);
    const res = await registered.transport.call("tools/call", {
      name: "delete_contact",
      arguments: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/unknown tool/i);
    }
  });

  it("search_contacts requires a query argument", async () => {
    const { registered } = loadCardDavBridge(BASE_OPTS);
    const res = await registered.transport.call("tools/call", {
      name: "search_contacts",
      arguments: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/query.*is required/i);
    }
  });
});

describe("mcp-carddav / vCard parsing", () => {
  it("extracts uid, FN, emails and phones from a vCard 3.0", () => {
    const raw = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:abc-123",
      "FN:Alice Smith",
      "EMAIL;TYPE=INTERNET:alice@example.com",
      "EMAIL;TYPE=WORK:alice.work@example.org",
      "TEL;TYPE=CELL:+1-555-0123",
      "END:VCARD",
    ].join("\r\n");
    const c = parseVCard(raw);
    expect(c).not.toBeNull();
    expect(c?.uid).toBe("abc-123");
    expect(c?.displayName).toBe("Alice Smith");
    expect(c?.emails).toEqual(["alice@example.com", "alice.work@example.org"]);
    expect(c?.phones).toEqual(["+1-555-0123"]);
  });

  it("falls back to the assembled N components when FN is missing", () => {
    const raw = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:bob-9",
      "N:Doe;John;;;",
      "EMAIL:john@example.com",
      "END:VCARD",
    ].join("\r\n");
    const c = parseVCard(raw);
    expect(c?.displayName).toBe("John Doe");
  });

  it("unfolds line continuations (RFC 6350 §3.2)", () => {
    const raw = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "UID:c-1",
      "FN:Charlotte de la",
      "  Cruz",
      "EMAIL:c@example.com",
      "END:VCARD",
    ].join("\r\n");
    const c = parseVCard(raw);
    expect(c?.displayName).toBe("Charlotte de la Cruz");
  });

  it("returns null on completely empty input", () => {
    expect(parseVCard("")).toBeNull();
    expect(parseVCard("not a vcard")).toBeNull();
  });

  it("survives a malformed entry without throwing", () => {
    const raw = "BEGIN:VCARD\r\nVERSION:3.0\r\nUID:x\r\nbogus-line-no-colon\r\nFN:X\r\nEND:VCARD";
    const c = parseVCard(raw);
    expect(c?.displayName).toBe("X");
  });
});
