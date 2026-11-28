import { describe, expect, it, vi } from "vitest";
import { ircPlugin } from "./channel.js";
import type { IrcClient } from "./client.js";
import { ircPrivmsgLines } from "./protocol.js";
import { observeIrcSend, sendMessageIrc } from "./send.js";
import type { CoreConfig } from "./types.js";

const cfg = {
  channels: { irc: { host: "irc.example.com", nick: "enclawed" } },
} as CoreConfig;

function readyClient() {
  const sendPrivmsg = vi.fn();
  const client = {
    isReady: () => true,
    sendPrivmsg,
  } as unknown as IrcClient;
  return { client, sendPrivmsg };
}

describe("IRC send observation", () => {
  it("is the PRIVMSG lines the client sends, as the configured server and nick", async () => {
    const cases: Array<[string, string, string | undefined]> = [
      ["#ops", "hello", undefined],
      ["channel:ops", "deploy done", "42"],
      ["#ops", `${"word ".repeat(150)}end`, undefined],
    ];
    for (const [to, text, replyTo] of cases) {
      const { client, sendPrivmsg } = readyClient();
      await sendMessageIrc(to, text, { cfg, client, replyTo });
      const [[target, payload]] = sendPrivmsg.mock.calls as Array<[string, string]>;
      expect(observeIrcSend(to, text, { cfg, replyTo })).toEqual({
        target: "irc.example.com:6697/enclawed",
        content: { lines: ircPrivmsgLines(target, payload) },
      });
    }
    // A long text is split as the client splits it.
    const long = observeIrcSend("#ops", `${"word ".repeat(150)}end`, { cfg });
    expect(long.content.lines.length).toBeGreaterThan(1);
  });

  it("drops what never reaches the wire and keeps what does", () => {
    const base = observeIrcSend("#ops", "hello", { cfg });
    // Surrounding whitespace is trimmed; `irc:` and `channel:` prefixes name one channel.
    expect(observeIrcSend("#ops", "  hello \n", { cfg })).toEqual(base);
    expect(observeIrcSend("irc:#ops", "hello", { cfg })).toEqual(base);
    expect(observeIrcSend("channel:ops", "hello", { cfg })).toEqual(base);
    expect(observeIrcSend("#ops", "hello!", { cfg })).not.toEqual(base);
    expect(observeIrcSend("#dev", "hello", { cfg })).not.toEqual(base);
    expect(observeIrcSend("#ops", "hello", { cfg, replyTo: "1" })).not.toEqual(base);
  });

  it("declares core-path adapter calls, with media as the URL the text carries", async () => {
    const observeSend = ircPlugin.outbound?.observeSend;
    expect(observeSend).toBeTypeOf("function");
    const ctx = { cfg, to: "#ops", text: "look", accountId: null, replyToId: null };
    expect(await observeSend!({ kind: "text", ctx })).toEqual(
      observeIrcSend("#ops", "look", { cfg }),
    );
    // Thread ids and delivery flags are not part of an IRC message.
    expect(
      await observeSend!({
        kind: "text",
        ctx: { ...ctx, threadId: "t1", silent: true, forceDocument: true },
      }),
    ).toEqual(observeIrcSend("#ops", "look", { cfg }));
    expect(
      await observeSend!({ kind: "media", ctx: { ...ctx, mediaUrl: "https://x.test/a.png" } }),
    ).toEqual(observeIrcSend("#ops", "look\n\nAttachment: https://x.test/a.png", { cfg }));
    expect(await observeSend!({ kind: "payload", ctx })).toBeNull();
  });
});
