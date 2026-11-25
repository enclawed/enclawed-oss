// Remote MCP credentials (./remote-auth.ts): the OAuth flow (dynamic client
// registration or a signed client id, PKCE S256, the loopback redirect, the
// code exchange, refresh) and a definition's headers, live against local
// https stand-ins. Attack side: a mismatched issuer, endpoints and redirects
// off the server's site, a forged redirect, token replay to another origin,
// an http endpoint. False-positive side: the normal flow, refresh, a signed
// client id, plain headers.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startStandIns,
  tempTree,
  type Recorded,
  type StandInReply,
} from "../containment/test-helpers.js";
import type { McpServerDefinition } from "./contracts.js";
import {
  credentialStoreKeys,
  forgetLaunchCredentialKeys,
  type CredentialKeyDevice,
  type CredentialKeyring,
  type CredentialKeys,
} from "./credential-keys.js";
import {
  authorizeRemoteMcpServer,
  openLoopbackRedirect,
  remoteCredentialStore,
  remoteCredentials,
  remoteHeaders,
  type RemoteCredentialStore,
} from "./remote-auth.js";
import { connectRemoteMcpServer, isRemoteRecord, type McpRemoteRecord } from "./remote-launch.js";

type Meta = Record<string, unknown>;
const URL_ = "https://mcp.remote.test/mcp";
const DEF = { name: "remote", type: "http", url: URL_ } as const;
const RECORD: McpRemoteRecord = { url: URL_, transport: "streamable-http" };

/** The stand-ins: an MCP server that wants a bearer token, its authorization server, and another site. */
async function standIns(
  o: { asMeta?: () => Meta; prm?: () => Meta; tokenRedirect?: boolean; mcpRedirect?: boolean } = {},
) {
  const state = {
    tokens: new Set<string>(),
    refreshes: new Map<string, string>(),
    challenges: [] as string[],
    registrations: 0,
    issued: 0,
    refused: false,
  };
  const seen: Recorded[] = [];
  const asMeta =
    o.asMeta ??
    ((): Meta => ({
      issuer: "https://auth.remote.test",
      authorization_endpoint: "https://auth.remote.test/authorize",
      token_endpoint: "https://auth.remote.test/token",
      registration_endpoint: "https://auth.remote.test/register",
      code_challenge_methods_supported: ["S256"],
    }));
  const issue = () => {
    state.issued++;
    const t = `access-token-${state.issued}-abcdef`;
    const r = `refresh-token-${state.issued}-abcdef`;
    state.tokens.add(t);
    state.refreshes.set(r, t);
    return { access_token: t, refresh_token: r, token_type: "Bearer", expires_in: 60 };
  };
  const stand = await startStandIns({
    "mcp.remote.test": (r): StandInReply => {
      seen.push(r);
      if (r.path === "/.well-known/oauth-protected-resource") {
        return {
          status: 200,
          body: JSON.stringify(
            o.prm?.() ?? { resource: URL_, authorization_servers: ["https://auth.remote.test"] },
          ),
        };
      }
      if (o.mcpRedirect) {
        return { status: 307, headers: { location: "https://evil.test/mcp" }, body: "" };
      }
      const auth = typeof r.headers.authorization === "string" ? r.headers.authorization : "";
      if (!state.tokens.has(auth.replace(/^Bearer /, ""))) {
        return {
          status: 401,
          headers: {
            "www-authenticate":
              'Bearer resource_metadata="https://mcp.remote.test/.well-known/oauth-protected-resource"',
          },
          body: "{}",
        };
      }
      const msg = JSON.parse(r.body || "{}") as { id?: number; method?: string };
      if (msg.id === undefined) {
        return { status: 202, body: "" };
      }
      const result =
        msg.method === "initialize"
          ? {
              protocolVersion: "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "s", version: "1" },
            }
          : msg.method === "tools/list"
            ? { tools: [{ name: "echo" }] }
            : // A server that echoes what it got back (a credential must not reach the model).
              {
                content: [
                  {
                    type: "text",
                    text: `you sent ${auth} and ${typeof r.headers["x-api-key"] === "string" ? r.headers["x-api-key"] : ""}`,
                  },
                ],
              };
      return { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) };
    },
    "auth.remote.test": (r): StandInReply => {
      seen.push(r);
      if (r.path === "/.well-known/oauth-authorization-server") {
        return { status: 200, body: JSON.stringify(asMeta()) };
      }
      if (r.path === "/register") {
        state.registrations++;
        const b = JSON.parse(r.body) as { redirect_uris?: string[] };
        return {
          status: 201,
          body: JSON.stringify({ client_id: "dyn-client-1", redirect_uris: b.redirect_uris }),
        };
      }
      if (r.path === "/token") {
        if (o.tokenRedirect) {
          return { status: 302, headers: { location: "https://evil.test/token" }, body: "" };
        }
        const f = new URLSearchParams(r.body);
        if (f.get("grant_type") === "refresh_token") {
          const old = state.refreshes.get(f.get("refresh_token") ?? "");
          if (!old || state.refused) {
            return { status: 400, body: '{"error":"invalid_grant"}' };
          }
          state.refreshes.delete(f.get("refresh_token") ?? "");
          state.tokens.delete(old);
          return { status: 200, body: JSON.stringify(issue()) };
        }
        const challenge = createHash("sha256")
          .update(f.get("code_verifier") ?? "")
          .digest("base64url");
        const ok =
          f.get("code") === "code-1" &&
          f.get("resource") === URL_ &&
          state.challenges.includes(challenge) &&
          ["dyn-client-1", "signed-client"].includes(f.get("client_id") ?? "");
        return ok
          ? { status: 200, body: JSON.stringify(issue()) }
          : { status: 400, body: '{"error":"invalid_grant"}' };
      }
      return { status: 404, body: "{}" };
    },
    "evil.test": (r) => {
      seen.push(r);
      return { status: 200, body: "{}" };
    },
  });
  return { stand, seen, state, connect: stand.upstream };
}

/** The person: reads the shown URL, "authorizes" and lands on the loopback redirect. */
function person(
  state: { challenges: string[] },
  answer: (u: URL) => Record<string, string> = (u) => ({
    code: "code-1",
    state: u.searchParams.get("state") ?? "",
    iss: "https://auth.remote.test",
  }),
) {
  const shown: string[] = [];
  return {
    shown,
    show: async (url: string) => {
      shown.push(url);
      const u = new URL(url);
      state.challenges.push(u.searchParams.get("code_challenge") ?? "");
      const back = new URL(u.searchParams.get("redirect_uri") ?? "");
      for (const [k, v] of Object.entries(answer(u))) {
        back.searchParams.set(k, v);
      }
      setTimeout(() => void fetch(back).catch(() => {}), 20);
    },
  };
}

let root: string;
let keys: CredentialKeys;
let n = 0;
const newStore = (): { dir: string; store: RemoteCredentialStore } => {
  const dir = path.join(root, `store-${++n}`);
  return { dir, store: remoteCredentialStore(dir, keys) };
};
beforeAll(async () => {
  root = tempTree("remote-auth");
  keys = await credentialStoreKeys({ keyFile: path.join(root, "keys", "remote-mcp.key") });
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("OAuth: the full flow, live", () => {
  it("false positive: registration, PKCE, the loopback code, tokens in the store, an authorized call, refresh", async () => {
    const s = await standIns();
    const { dir, store } = newStore();
    const p = person(s.state);
    try {
      const r = await authorizeRemoteMcpServer(DEF, RECORD, {
        store,
        show: p.show,
        connect: s.connect,
      });
      expect(r).toEqual({ ok: true, action: "authorized", registered: true });
      expect(s.state.registrations).toBe(1);
      const u = new URL(p.shown[0]);
      expect(u.origin).toBe("https://auth.remote.test");
      expect(u.searchParams.get("code_challenge_method")).toBe("S256");
      expect(u.searchParams.get("resource")).toBe(URL_);
      expect(new URL(u.searchParams.get("redirect_uri")!).hostname).toBe("127.0.0.1");
      // Stored 0600 in a 0700 directory, bound to the server.
      const files = fs.readdirSync(dir);
      expect(files).toHaveLength(1);
      expect(fs.statSync(path.join(dir, files[0])).mode & 0o777).toBe(0o600);
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
      expect(store.get(URL_)?.tokens?.accessToken).toBe("access-token-1-abcdef");
      // Sealed at rest: no token, client secret or refresh token in the file.
      const onDisk = fs.readFileSync(path.join(dir, files[0]), "utf8");
      expect(onDisk).not.toMatch(/access-token|refresh|client_?[iI]d|accessToken/);
      expect(JSON.parse(onDisk)).toMatchObject({ v: 2, key: keys.write.id });

      let clock = Date.now();
      const cred = remoteCredentials(DEF, RECORD, { store, connect: s.connect, now: () => clock });
      const c = connectRemoteMcpServer(DEF, RECORD, {
        connect: s.connect,
        credentials: cred,
        egressRunner: null,
      });
      expect(c.ok).toBe(true);
      if (!c.ok) {
        return;
      }
      await c.client.initialize();
      const out = JSON.stringify(await c.callTool({ callId: "1", tool: "echo", arguments: {} }));
      expect(out).toContain("[credential removed by Enclawed]");
      expect(out).not.toContain("access-token-1");
      // Expired: refreshed before the next request, the new token sent.
      clock += 120_000;
      const out2 = JSON.stringify(await c.callTool({ callId: "2", tool: "echo", arguments: {} }));
      expect(out2).not.toContain("access-token-2");
      expect(store.get(URL_)?.tokens?.accessToken).toBe("access-token-2-abcdef");
      // A refused refresh token is spent: the call needs a person again.
      s.state.refused = true;
      clock += 120_000;
      await expect(c.callTool({ callId: "3", tool: "echo", arguments: {} })).rejects.toMatchObject({
        code: "oauth-required",
      });
      expect(store.get(URL_)?.tokens).toBeNull();
      // Tokens never went to the metadata, registration or token endpoints as a header.
      expect(s.seen.filter((x) => x.host !== "mcp.remote.test" && x.headers.authorization)).toEqual(
        [],
      );
      c.client.close();
    } finally {
      await s.stand.close();
    }
  });

  it("false positive: a client id from the signed record is used without registration; no 401 needs nothing", async () => {
    const s = await standIns();
    const { store } = newStore();
    const p = person(s.state);
    try {
      const rec: McpRemoteRecord = {
        ...RECORD,
        oauth: { clientId: "signed-client", scope: "mcp" },
      };
      expect(isRemoteRecord(rec)).toBe(true);
      const r = await authorizeRemoteMcpServer(DEF, rec, {
        store,
        show: p.show,
        connect: s.connect,
      });
      expect(r).toEqual({ ok: true, action: "authorized", registered: false });
      expect(s.state.registrations).toBe(0);
      expect(new URL(p.shown[0]).searchParams.get("scope")).toBe("mcp");
      // Already authorized: the server answers, nothing is asked.
      const again = await authorizeRemoteMcpServer(DEF, rec, {
        store,
        show: p.show,
        connect: s.connect,
      });
      expect(again).toEqual({ ok: true, action: "not-required", registered: false });
      expect(p.shown).toHaveLength(1);
    } finally {
      await s.stand.close();
    }
  });

  it("refuses: no registration and no signed client id", async () => {
    const s = await standIns({
      asMeta: () => ({
        issuer: "https://auth.remote.test",
        authorization_endpoint: "https://auth.remote.test/authorize",
        token_endpoint: "https://auth.remote.test/token",
        code_challenge_methods_supported: ["S256"],
      }),
    });
    const p = person(s.state);
    try {
      const r = await authorizeRemoteMcpServer(DEF, RECORD, {
        ...newStore(),
        show: p.show,
        connect: s.connect,
      });
      expect(r).toMatchObject({ ok: false, code: "oauth-no-client" });
      expect(p.shown).toEqual([]);
    } finally {
      await s.stand.close();
    }
  });
});

describe("OAuth: attacks", () => {
  it("attack: the metadata names another issuer than the protected resource's authorization server", async () => {
    const s = await standIns({
      asMeta: () => ({
        issuer: "https://other.remote.test",
        authorization_endpoint: "https://auth.remote.test/authorize",
        token_endpoint: "https://auth.remote.test/token",
        registration_endpoint: "https://auth.remote.test/register",
        code_challenge_methods_supported: ["S256"],
      }),
    });
    const p = person(s.state);
    try {
      const r = await authorizeRemoteMcpServer(DEF, RECORD, {
        ...newStore(),
        show: p.show,
        connect: s.connect,
      });
      expect(r).toMatchObject({ ok: false, code: "oauth-metadata-invalid" });
      expect(p.shown).toEqual([]);
    } finally {
      await s.stand.close();
    }
  });

  it("attack: the authorization answer names another issuer (mix-up, RFC 9207)", async () => {
    const s = await standIns();
    const { store } = newStore();
    const p = person(s.state, (u) => ({
      code: "code-1",
      state: u.searchParams.get("state") ?? "",
      iss: "https://evil.test",
    }));
    try {
      const r = await authorizeRemoteMcpServer(DEF, RECORD, {
        store,
        show: p.show,
        connect: s.connect,
      });
      expect(r).toMatchObject({ ok: false, code: "oauth-issuer-mismatch" });
      expect(store.get(URL_)).toBeNull();
      expect(s.seen.some((x) => x.path === "/token")).toBe(false);
    } finally {
      await s.stand.close();
    }
  });

  it("attack: an authorization endpoint on another site, or plain http, is refused before anything is shown", async () => {
    for (const [field, value, code] of [
      ["authorization_endpoint", "https://evil.test/authorize", "oauth-endpoint-cross-site"],
      ["token_endpoint", "http://auth.remote.test/token", "oauth-endpoint-not-https"],
      ["registration_endpoint", "https://evil.test/register", "oauth-endpoint-cross-site"],
    ] as const) {
      const s = await standIns({
        asMeta: () => ({
          issuer: "https://auth.remote.test",
          authorization_endpoint: "https://auth.remote.test/authorize",
          token_endpoint: "https://auth.remote.test/token",
          registration_endpoint: "https://auth.remote.test/register",
          code_challenge_methods_supported: ["S256"],
          [field]: value,
        }),
      });
      const p = person(s.state);
      try {
        const r = await authorizeRemoteMcpServer(DEF, RECORD, {
          ...newStore(),
          show: p.show,
          connect: s.connect,
        });
        expect(r).toMatchObject({ ok: false, code });
        expect(p.shown).toEqual([]);
        expect(s.seen.some((x) => x.host === "evil.test")).toBe(false);
      } finally {
        await s.stand.close();
      }
    }
  });

  it("attack: the token endpoint redirects to another origin; the code is not followed there", async () => {
    const s = await standIns({ tokenRedirect: true });
    const p = person(s.state);
    try {
      const r = await authorizeRemoteMcpServer(DEF, RECORD, {
        ...newStore(),
        show: p.show,
        connect: s.connect,
      });
      expect(r).toMatchObject({ ok: false, code: "redirect-refused" });
      expect(s.seen.some((x) => x.host === "evil.test")).toBe(false);
    } finally {
      await s.stand.close();
    }
  });

  it("attack: a forged redirect with another state is ignored; only this authorization's answer counts", async () => {
    const lb = await openLoopbackRedirect();
    try {
      const wait = lb.wait("the-state", "https://auth.remote.test", 2000);
      const forged = new URL(lb.redirectUri);
      forged.searchParams.set("code", "attacker-code");
      forged.searchParams.set("state", "forged");
      expect((await fetch(forged)).status).toBe(400);
      expect((await fetch(new URL("/other", lb.redirectUri))).status).toBe(404);
      const good = new URL(lb.redirectUri);
      good.searchParams.set("code", "code-ok");
      good.searchParams.set("state", "the-state");
      expect((await fetch(good)).status).toBe(200);
      expect(await wait).toBe("code-ok");
    } finally {
      lb.close();
    }
  });

  it("attack: tokens replayed to another origin: never sent, a copied record is refused", async () => {
    const s = await standIns();
    const { dir, store } = newStore();
    const p = person(s.state);
    try {
      expect(
        (await authorizeRemoteMcpServer(DEF, RECORD, { store, show: p.show, connect: s.connect }))
          .ok,
      ).toBe(true);
      // The record copied under another server's name is not used for it.
      const other = "https://evil.test/mcp";
      const key = (u: string) =>
        `${createHash("sha256").update(u).digest("hex").slice(0, 32)}.json`;
      fs.copyFileSync(
        path.join(dir, key(new URL(URL_).href)),
        path.join(dir, key(new URL(other).href)),
      );
      expect(() => store.get(other)).toThrow(/not for https:\/\/evil.test/);
      const evilDef = { name: "evil", type: "http", url: other };
      const evilRec: McpRemoteRecord = { url: other, transport: "streamable-http" };
      expect(() =>
        remoteCredentials(evilDef, evilRec, { store, connect: s.connect }).headers(),
      ).toThrow(/not for https:\/\/evil.test/);
      // Credentials made for one server are refused by a connection to another.
      const cred = remoteCredentials(DEF, RECORD, { store, connect: s.connect });
      const c = connectRemoteMcpServer(evilDef, evilRec, { connect: s.connect, credentials: cred });
      expect(c).toMatchObject({ ok: false, code: "remote-credential-mismatch" });
      expect(s.seen.filter((x) => x.host === "evil.test")).toEqual([]);
    } finally {
      await s.stand.close();
    }
  });

  it("attack: the MCP server redirects an authorized request to another origin; nothing follows it", async () => {
    const s = await standIns({ mcpRedirect: true });
    const { store } = newStore();
    try {
      store.set(URL_, {
        v: 1,
        resource: URL_,
        origin: "https://mcp.remote.test",
        issuer: "https://auth.remote.test",
        tokenEndpoint: "https://auth.remote.test/token",
        client: { clientId: "c", registered: false },
        tokens: { accessToken: "stored-token-abcdef", expiresAt: null },
      });
      const cred = remoteCredentials(DEF, RECORD, { store, connect: s.connect });
      const c = connectRemoteMcpServer(DEF, RECORD, {
        connect: s.connect,
        credentials: cred,
        egressRunner: null,
      });
      expect(c.ok).toBe(true);
      if (c.ok) {
        await expect(c.client.initialize()).rejects.toMatchObject({ code: "redirect-refused" });
      }
      expect(s.seen.filter((x) => x.host === "evil.test")).toEqual([]);
    } finally {
      await s.stand.close();
    }
  });
});

describe("headers of a remote definition", () => {
  it("false positive: headers are sent to the server (secrets as handles), never to the authorization server", async () => {
    const s = await standIns();
    const { store } = newStore();
    const p = person(s.state);
    try {
      expect(
        (await authorizeRemoteMcpServer(DEF, RECORD, { store, show: p.show, connect: s.connect }))
          .ok,
      ).toBe(true);
      const def: McpServerDefinition & { name: string } = {
        ...DEF,
        headers: { "X-API-Key": "${SERVICE_KEY}", "X-Tenant": "acme", "X-Region": "${REGION:-us}" },
      };
      const cred = remoteCredentials(def, RECORD, {
        store,
        connect: s.connect,
        env: { SERVICE_KEY: "sk-live-0123456789abcdef" },
      });
      expect(cred.handles().map((h) => h.name)).toContain("mcp-header:remote:X-API-Key");
      expect(cred.handles().every((h) => h.destinations.join() === "mcp.remote.test")).toBe(true);
      const c = connectRemoteMcpServer(def, RECORD, {
        connect: s.connect,
        credentials: cred,
        egressRunner: null,
      });
      expect(c.ok).toBe(true);
      if (!c.ok) {
        return;
      }
      const from = s.seen.length;
      await c.client.initialize();
      const out = JSON.stringify(await c.callTool({ callId: "1", tool: "echo", arguments: {} }));
      expect(out).not.toContain("sk-live-0123456789abcdef");
      const sent = s.seen
        .slice(from)
        .filter((x) => x.host === "mcp.remote.test" && x.method === "POST");
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.every((x) => x.headers["x-api-key"] === "sk-live-0123456789abcdef")).toBe(true);
      expect(
        sent.every((x) => x.headers["x-tenant"] === "acme" && x.headers["x-region"] === "us"),
      ).toBe(true);
      expect(s.seen.filter((x) => x.host !== "mcp.remote.test" && x.headers["x-api-key"])).toEqual(
        [],
      );
      c.client.close();
    } finally {
      await s.stand.close();
    }
  });

  it("classifies and refuses: secrets, unresolved variables, non-string values", async () => {
    const h = remoteHeaders(
      { headers: { Authorization: "Bearer abc", "X-Tenant": "acme", "X-Trace": "${T}" } },
      { T: "t-1" },
    );
    expect(h).toEqual([
      { name: "Authorization", value: "Bearer abc", secret: true },
      { name: "X-Tenant", value: "acme", secret: false },
      { name: "X-Trace", value: "t-1", secret: true },
    ]);
    expect(() => remoteHeaders({ headers: { "X-Key": "${MISSING}" } }, {})).toThrow(/MISSING/);
    expect(() => remoteHeaders({ headers: { "X-Key": 42 } }, {})).toThrow(/not a string/);
    // A header the transport reserves is refused by the remote client's seam.
    const cred = remoteCredentials({ ...DEF, headers: { Host: "evil.test" } }, RECORD, {});
    const c = connectRemoteMcpServer(DEF, RECORD, { credentials: cred, egressRunner: null });
    expect(c.ok).toBe(true);
    if (c.ok) {
      await expect(c.client.initialize()).rejects.toMatchObject({ code: "remote-protocol-error" });
    }
  });
});

describe("the credential store is sealed at rest", () => {
  const REC = {
    v: 1 as const,
    resource: new URL(URL_).href,
    origin: new URL(URL_).origin,
    issuer: "https://auth.remote.test",
    tokenEndpoint: "https://auth.remote.test/token",
    client: { clientId: "client-1", registered: true },
    tokens: { accessToken: "access-token-sealed-1", refreshToken: "refresh-1", expiresAt: null },
  };
  const fileOf = (dir: string) =>
    path.join(
      dir,
      fs.readdirSync(dir).find((f) => f.endsWith(".json"))!,
    );
  const ring = (): CredentialKeyring & { items: Map<string, string> } => {
    const items = new Map<string, string>();
    return { items, get: (a) => items.get(a) ?? null, set: (a, v) => (items.set(a, v), true) };
  };
  const device = (deterministic = true): CredentialKeyDevice => {
    let i = 0;
    return {
      uid: "0011223344556677",
      sign: async (m) =>
        createHash("sha512")
          .update(m)
          .update(deterministic ? "" : String(i++))
          .digest(),
    };
  };

  it("false positive: the key file is 0600 apart from the records; a record round-trips", async () => {
    const k = await credentialStoreKeys({ keyFile: path.join(root, "kf", "a.key") });
    expect(k.write.source).toBe("file");
    expect(fs.statSync(path.join(root, "kf", "a.key")).mode & 0o777).toBe(0o600);
    const dir = path.join(root, "sealed-1");
    const st = remoteCredentialStore(dir, k);
    st.set(URL_, REC);
    expect(fs.readFileSync(fileOf(dir), "utf8")).not.toContain("access-token-sealed-1");
    expect(st.get(URL_)).toEqual(REC);
    // The same key file opens it from another process (a new key object).
    const again = await credentialStoreKeys({ keyFile: path.join(root, "kf", "a.key") });
    expect(remoteCredentialStore(dir, again).get(URL_)).toEqual(REC);
  });

  it("attack: a key file kept with the records, or readable by others, is not a key", async () => {
    const dir = path.join(root, "sealed-2");
    const inside = await credentialStoreKeys({ keyFile: path.join(dir, "k.key") });
    expect(() => remoteCredentialStore(dir, inside)).toThrow(/must not be kept with the records/);
    const loose = path.join(root, "kf", "loose.key");
    fs.writeFileSync(loose, `${"ab".repeat(32)}\n`, { mode: 0o644 });
    fs.chmodSync(loose, 0o644);
    // Alone, a loose key file is refused, never used.
    await expect(credentialStoreKeys({ keyFile: loose })).rejects.toThrow(
      /not a protected key file/,
    );
    const k = await credentialStoreKeys({ keyFile: loose, keyring: ring() });
    // The loose file is ignored; the keyring seals instead.
    expect(k.write.source).toBe("keyring");
    expect(k.write.id).toMatch(/^keyring:/);
  });

  it("attack: a record changed on disk, or sealed with another key, is refused, never decrypted with this one", async () => {
    const dir = path.join(root, "sealed-3");
    const st = remoteCredentialStore(dir, keys);
    st.set(URL_, REC);
    const f = fileOf(dir);
    const sealed = JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, string>;
    const data = Buffer.from(sealed.data, "base64");
    data[0] ^= 1;
    fs.writeFileSync(f, JSON.stringify({ ...sealed, data: data.toString("base64") }));
    expect(() => st.get(URL_)).toThrow(/do not open with their key/);
    // Sealed by a device key that is not here: refused by name.
    const withDevice = await credentialStoreKeys({
      keyFile: path.join(root, "kf", "d.key"),
      device: device(),
    });
    expect(withDevice.write.source).toBe("device");
    remoteCredentialStore(dir, withDevice).set(URL_, REC);
    expect(() => st.get(URL_)).toThrow(/sealed with a key that is not available here \(device\)/);
    expect(remoteCredentialStore(dir, withDevice).get(URL_)).toEqual(REC);
  });

  it("false positive: a plaintext record from before is read once and sealed; the keyring and a device seal when present", async () => {
    const dir = path.join(root, "sealed-4");
    const st = remoteCredentialStore(dir, keys);
    st.set(URL_, REC);
    fs.writeFileSync(fileOf(dir), JSON.stringify(REC), { mode: 0o600 });
    expect(st.get(URL_)).toEqual(REC);
    expect(fs.readFileSync(fileOf(dir), "utf8")).not.toContain("access-token-sealed-1");
    // Keyring: a key made there and handed back; no key file is made.
    const r = ring();
    const kr = await credentialStoreKeys({ keyFile: path.join(root, "kf", "r.key"), keyring: r });
    expect(kr.write.source).toBe("keyring");
    expect(r.items.size).toBe(1);
    expect(fs.existsSync(path.join(root, "kf", "r.key"))).toBe(false);
    // A device whose answer varies is not a key: the next source seals.
    const varying = await credentialStoreKeys({
      keyFile: path.join(root, "kf", "v.key"),
      device: device(false),
      keyring: r,
    });
    expect(varying.write.source).toBe("keyring");
    // Bound since: a record sealed with the keyring is sealed again with the device's key.
    const dk = await credentialStoreKeys({
      keyFile: path.join(root, "kf", "r.key"),
      keyring: r,
      device: device(),
    });
    const dir5 = path.join(root, "sealed-5");
    remoteCredentialStore(dir5, kr).set(URL_, REC);
    expect(remoteCredentialStore(dir5, dk).get(URL_)).toEqual(REC);
    expect(JSON.parse(fs.readFileSync(fileOf(dir5), "utf8")).key).toBe(dk.write.id);
  });

  it("command set 0.5: a record sealed under the CHALLENGE-derived device key is refused by name and the refusal is audited (no secret); other refusals too", async () => {
    const dir = path.join(root, "sealed-6");
    const chal = device();
    const legacy = await credentialStoreKeys({
      keyFile: path.join(root, "kf", "c.key"),
      device: chal,
    });
    expect(legacy.device?.derivation).toBe("challenge");
    remoteCredentialStore(dir, legacy).set(URL_, REC);
    // The device now proves 0.5: its key is KEY_DERIVE's, the CHALLENGE key is never a store key again.
    forgetLaunchCredentialKeys();
    const kd = await credentialStoreKeys({
      keyFile: path.join(root, "kf", "c.key"),
      device: {
        ...chal,
        keyDerivation: {
          pubkey: "cd".repeat(32),
          commandSet: async () => ({ status: "proven", commandSet: "0.5" }),
          derive: async (label) => ({
            ok: true,
            key: createHash("sha256").update("kd").update(label).digest(),
            binding: Buffer.alloc(32),
            facts: { kind: "totp", step: 1, counter: 1n },
          }),
        },
      },
    });
    expect(kd.device?.derivation).toBe("key-derive");
    const audited: unknown[] = [];
    const st = remoteCredentialStore(dir, kd, { audit: async (r) => void audited.push(r) });
    expect(() => st.get(URL_)).toThrow(/earlier \(CHALLENGE-derived\) key/);
    await st.settled?.();
    expect(audited).toEqual([
      {
        type: "auth.remote-credential.refused",
        payload: {
          origin: new URL(URL_).origin,
          code: "remote-credential-locked",
          reason: "legacy-device-challenge",
          keyKind: "device-challenge",
        },
      },
    ]);
    expect(JSON.stringify(audited)).not.toContain("access-token-sealed-1");
    // A record changed on disk: refused, audited as does-not-open.
    const f = fileOf(dir);
    remoteCredentialStore(dir, kd).set(URL_, REC);
    const sealed = JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, string>;
    const data = Buffer.from(sealed.data, "base64");
    data[0] ^= 1;
    fs.writeFileSync(f, JSON.stringify({ ...sealed, data: data.toString("base64") }));
    expect(() => st.get(URL_)).toThrow(/do not open/);
    await st.settled?.();
    expect((audited.at(-1) as { payload: { reason: string } }).payload.reason).toBe(
      "does-not-open",
    );
    // An audit sink that fails is reported by settled(), never swallowed.
    const broken = remoteCredentialStore(dir, kd, {
      audit: async () => {
        throw new Error("log gone");
      },
    });
    expect(() => broken.get(URL_)).toThrow();
    await expect(broken.settled?.()).rejects.toThrow(/could not be written to the audit log/);
    forgetLaunchCredentialKeys();
  });
});
