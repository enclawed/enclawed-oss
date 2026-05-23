import { describe, expect, it } from "vitest";
import { resolveIrcInboundTarget } from "./monitor.js";

describe("irc monitor inbound target", () => {
  it("keeps channel target for group messages", () => {
    expect(
      resolveIrcInboundTarget({
        target: "#enclawed",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: true,
      target: "#enclawed",
      rawTarget: "#enclawed",
    });
  });

  it("maps DM target to sender nick and preserves raw target", () => {
    expect(
      resolveIrcInboundTarget({
        target: "enclawed-bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: false,
      target: "alice",
      rawTarget: "enclawed-bot",
    });
  });

  it("falls back to raw target when sender nick is empty", () => {
    expect(
      resolveIrcInboundTarget({
        target: "enclawed-bot",
        senderNick: " ",
      }),
    ).toEqual({
      isGroup: false,
      target: "enclawed-bot",
      rawTarget: "enclawed-bot",
    });
  });
});
