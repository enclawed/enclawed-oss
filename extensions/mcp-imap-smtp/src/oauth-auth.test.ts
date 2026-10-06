// The transport must authenticate with a bearer token as readily as with a
// password, and it must fetch that token at CONNECT time.
//
// The failure this pins is a slow one: an access token lives about an hour
// while this transport holds an IMAP connection open for days. A token
// resolved once at construction works until the first reconnect after expiry
// and then fails as an authentication error -- which reads exactly like a
// wrong password, days after anyone changed anything.

import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ImapSmtpTransport } from "./imap-smtp-transport.ts";

class FakeImap extends EventEmitter {
  usable = true;
  async connect(): Promise<void> {}
  async noop(): Promise<void> {}
  async logout(): Promise<void> {
    this.usable = false;
  }
}

type AuthShape = { user?: string; pass?: string; accessToken?: string; type?: string };

function harness(opts: { password?: string; getAccessToken?: () => Promise<string> }): {
  transport: ImapSmtpTransport;
  imapAuths: AuthShape[];
  smtpAuths: AuthShape[];
  clients: FakeImap[];
} {
  const imapAuths: AuthShape[] = [];
  const smtpAuths: AuthShape[] = [];
  const clients: FakeImap[] = [];
  const transport = new ImapSmtpTransport({
    imap: { host: "imap.example.com", port: 993, secure: true },
    smtp: { host: "smtp.example.com", port: 465, secure: true },
    username: "user@example.com",
    ...(opts.password !== undefined ? { password: opts.password } : {}),
    ...(opts.getAccessToken
      ? { auth: { kind: "oauth" as const, getAccessToken: opts.getAccessToken } }
      : {}),
    imapFactory: ((cfg: { auth: AuthShape }) => {
      imapAuths.push(cfg.auth);
      const c = new FakeImap();
      clients.push(c);
      return c;
    }) as never,
    smtpFactory: ((cfg: { auth: AuthShape }) => {
      smtpAuths.push(cfg.auth);
      return { sendMail: async () => ({}) };
    }) as never,
  });
  return { transport, imapAuths, smtpAuths, clients };
}

/** Drive any call that forces the transport to open an IMAP connection. */
async function connect(transport: ImapSmtpTransport): Promise<void> {
  await transport.call("tools/call", { name: "search_threads", arguments: {} }).catch(() => {});
}

describe("password auth still works", () => {
  it("authenticates IMAP with the password", async () => {
    const h = harness({ password: "app-password" });
    await connect(h.transport);
    expect(h.imapAuths[0]?.pass).toBe("app-password");
    expect(h.imapAuths[0]?.accessToken).toBeUndefined();
  });
});

describe("oauth auth", () => {
  it("authenticates IMAP with a bearer token, not a password", async () => {
    const h = harness({ getAccessToken: async () => "TOKEN-1" });
    await connect(h.transport);
    expect(h.imapAuths[0]?.accessToken).toBe("TOKEN-1");
    expect(h.imapAuths[0]?.pass).toBeUndefined();
    expect(h.imapAuths[0]?.user).toBe("user@example.com");
  });

  it("asks for a token on every reconnect, not once at construction", async () => {
    // The whole reason the option is a function. A token captured at
    // construction survives until the first reconnect after expiry.
    let issued = 0;
    const h = harness({
      getAccessToken: async () => {
        issued += 1;
        return `TOKEN-${issued}`;
      },
    });
    await connect(h.transport);
    // Kill the connection the way a socket timeout does.
    h.clients[0]?.emit("error", Object.assign(new Error("Socket timeout"), { code: "ETIMEOUT" }));
    h.clients[0]!.usable = false;
    await connect(h.transport);

    expect(h.imapAuths.length).toBeGreaterThanOrEqual(2);
    expect(h.imapAuths[0]?.accessToken).toBe("TOKEN-1");
    expect(h.imapAuths[1]?.accessToken).toBe("TOKEN-2");
  });

  it("does not fetch a token before it connects", async () => {
    let issued = 0;
    harness({
      getAccessToken: async () => {
        issued += 1;
        return "TOKEN";
      },
    });
    // Constructing the transport must not touch the credential store; the
    // assistant builds it long before it first polls.
    expect(issued).toBe(0);
  });
});

describe("auth mode is explicit", () => {
  it("refuses to construct with neither a password nor an auth mode", () => {
    expect(() => harness({})).toThrow(/password required/i);
  });
});
