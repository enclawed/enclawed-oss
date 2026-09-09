// Regression: a connection-level 'error' event must not kill the process.
//
// ImapFlow is an EventEmitter. A socket timeout or peer reset is
// delivered as an 'error' EVENT, not as a rejection of whatever command
// is currently awaited. Node treats an 'error' event with no listener as
// fatal and terminates the process. In the field that turned an IMAP
// server rejecting our credentials into a service restart loop: each
// poll logged AUTHENTICATIONFAILED and continued, then the idle socket
// timed out, the unhandled 'error' killed the service, the supervisor
// restarted it, and the cycle repeated (observed: 235 polls, a 524KB
// service log, and a doubling audit log).
//
// If the listener is ever removed, this test does not merely fail — the
// unhandled 'error' takes the vitest worker down with it, which is
// exactly the blast radius being pinned.

import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ImapSmtpTransport } from "./imap-smtp-transport.ts";

class FakeImap extends EventEmitter {
  usable = true;
  connectCalls = 0;
  async connect(): Promise<void> {
    this.connectCalls += 1;
  }
  async noop(): Promise<void> {}
  async logout(): Promise<void> {
    this.usable = false;
  }
}

function makeTransport(clients: FakeImap[]) {
  return new ImapSmtpTransport({
    imap: { host: "imap.example.com", port: 993, secure: true },
    smtp: { host: "smtp.example.com", port: 465, secure: true },
    username: "user@example.com",
    password: "app-password",
    imapFactory: (() => {
      const c = new FakeImap();
      clients.push(c);
      return c;
    }) as never,
    smtpFactory: (() => ({ sendMail: async () => ({}) })) as never,
  });
}

describe("imap transport: connection-level error events", () => {
  it("absorbs an 'error' event instead of letting it terminate the process", async () => {
    const clients: FakeImap[] = [];
    const transport = makeTransport(clients);
    // Force a connection to exist.
    await transport.call("tools/call", { name: "search_threads", arguments: {} }).catch(() => {});
    expect(clients.length).toBeGreaterThan(0);

    const client = clients[0];
    expect(
      client.listenerCount("error"),
      "no 'error' listener attached: an emitted error would crash the process",
    ).toBeGreaterThan(0);

    // The real failure mode. Without a listener this line is fatal.
    expect(() =>
      client.emit(
        "error",
        Object.assign(new Error("Socket timeout"), {
          code: "ETIMEOUT",
        }),
      ),
    ).not.toThrow();
  });

  it("drops the dead client so the next call rebuilds the connection", async () => {
    const clients: FakeImap[] = [];
    const transport = makeTransport(clients);
    await transport.call("tools/call", { name: "search_threads", arguments: {} }).catch(() => {});
    const first = clients[0];

    first.emit("error", Object.assign(new Error("Socket timeout"), { code: "ETIMEOUT" }));

    await transport.call("tools/call", { name: "search_threads", arguments: {} }).catch(() => {});
    expect(
      clients.length,
      "the errored client was reused instead of being replaced",
    ).toBeGreaterThan(1);
  });
});
