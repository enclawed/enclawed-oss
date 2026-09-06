// Unit tests for the IMAP+SMTP bridge that do NOT require a live
// IMAP server. Connection-level + protocol-level behaviour is
// covered by a separate `.live.test.ts` (operator-run against a real
// IMAP fixture; skipped in CI absent ENCLAWED_LIVE_IMAP_* env vars).
//
// Each test resets the in-process server registry first so we don't
// inherit state from earlier tests running in the same node process.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetServerRegistryForTest,
  getServerById,
  isToolAdmitted,
  listServers,
} from "../../mcp-attested/src/index.js";
import { IMAP_SMTP_TOOLS, loadImapSmtpBridge } from "./index.js";

const BASE_OPTS = {
  imap: { host: "imap.example.org", port: 993, secure: true },
  smtp: { host: "smtp.example.org", port: 465, secure: true },
  username: "alice@example.org",
  password: "abcdefghijklmnop",
};

describe("mcp-imap-smtp / loadImapSmtpBridge", () => {
  beforeEach(() => {
    _resetServerRegistryForTest();
  });
  afterEach(() => {
    _resetServerRegistryForTest();
  });

  it("registers a server with id mcp.imap-smtp under a synthetic mcp+imap:// endpoint", () => {
    const { registered } = loadImapSmtpBridge(BASE_OPTS);
    expect(registered.id).toBe("mcp.imap-smtp");
    expect(registered.bridge).toBe("mcp-imap-smtp");
    expect(registered.endpoint).toBe("mcp+imap://imap.example.org/alice%40example.org");
    expect(listServers().length).toBe(1);
    expect(getServerById("mcp.imap-smtp")?.endpoint).toBe(registered.endpoint);
  });

  it("admits the full canonical tool surface (5 tools) by default", () => {
    const { registered } = loadImapSmtpBridge(BASE_OPTS);
    for (const t of IMAP_SMTP_TOOLS) {
      expect(isToolAdmitted(registered, t)).toBe(true);
    }
    expect(registered.allowedTools.length).toBe(5);
  });

  it("denies tools that are not part of the canonical list", () => {
    const { registered } = loadImapSmtpBridge(BASE_OPTS);
    expect(isToolAdmitted(registered, "delete_message")).toBe(false);
    expect(isToolAdmitted(registered, "create_label")).toBe(false);
    expect(isToolAdmitted(registered, "list_labels")).toBe(false);
  });

  it("allowedToolsOverride can narrow further but never widens beyond the canonical list", () => {
    const { registered } = loadImapSmtpBridge({
      ...BASE_OPTS,
      allowedToolsOverride: [
        "search_threads",
        "create_draft",
        "delete_message", // not canonical — must be silently dropped
        "nonexistent_tool",
      ],
    });
    expect(Array.from(registered.allowedTools)).toEqual(["search_threads", "create_draft"]);
    expect(isToolAdmitted(registered, "search_threads")).toBe(true);
    expect(isToolAdmitted(registered, "create_draft")).toBe(true);
    expect(isToolAdmitted(registered, "delete_message")).toBe(false);
    expect(isToolAdmitted(registered, "send_draft")).toBe(false);
  });

  it("rejects construction when required fields are missing", () => {
    expect(() => loadImapSmtpBridge({ ...BASE_OPTS, password: "" })).toThrow(/password required/i);
    expect(() => loadImapSmtpBridge({ ...BASE_OPTS, username: "" })).toThrow(/username required/i);
  });

  it("custom endpoint override is honoured (e.g. for Fastmail / iCloud / self-hosted IDs)", () => {
    const { registered } = loadImapSmtpBridge({
      ...BASE_OPTS,
      endpoint: "mcp+imap://fastmail.example.org/alice",
    });
    expect(registered.endpoint).toBe("mcp+imap://fastmail.example.org/alice");
  });
});

describe("mcp-imap-smtp / transport tools/call dispatch", () => {
  beforeEach(() => {
    _resetServerRegistryForTest();
  });
  afterEach(() => {
    _resetServerRegistryForTest();
  });

  it("returns ok:false with an actionable reason for non-tools/call MCP methods", async () => {
    const { registered } = loadImapSmtpBridge(BASE_OPTS);
    const res = await registered.transport.call("resources/list", {});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/unsupported MCP method/i);
    }
  });

  it("rejects unknown tool names with a clear 'unknown tool' message", async () => {
    const { registered } = loadImapSmtpBridge(BASE_OPTS);
    const res = await registered.transport.call("tools/call", {
      name: "delete_message",
      arguments: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/unknown tool/i);
    }
  });

  it("create_draft validates the `to` field before opening any IMAP connection", async () => {
    const { registered } = loadImapSmtpBridge(BASE_OPTS);
    const res = await registered.transport.call("tools/call", {
      name: "create_draft",
      arguments: { subject: "x", bodyText: "y" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/to must be an array/i);
    }
  });

  it("send_draft requires a draftId argument", async () => {
    const { registered } = loadImapSmtpBridge(BASE_OPTS);
    const res = await registered.transport.call("tools/call", {
      name: "send_draft",
      arguments: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/draftId is required/i);
    }
  });

  it("modify_thread_labels with no add/remove returns an empty applied set without connecting", async () => {
    const { registered } = loadImapSmtpBridge(BASE_OPTS);
    const res = await registered.transport.call("tools/call", {
      name: "modify_thread_labels",
      arguments: { threadId: "1234567890" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const out = res.result as {
        threadId: string;
        applied: { add: string[]; remove: string[] };
      };
      expect(out.threadId).toBe("1234567890");
      expect(out.applied.add).toEqual([]);
      expect(out.applied.remove).toEqual([]);
    }
  });
});
