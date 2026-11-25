// enclawed adapter kit: credentials of remote MCP servers (type http / sse).
//
//   OAuth          a server that answers 401 is authorized once, by a person:
//                  the client id comes from the signed admission record
//                  (`oauth.clientId`) or, when the server's metadata offers it,
//                  from dynamic client registration (RFC 7591); PKCE S256; the
//                  redirect goes to a loopback listener (RFC 8252) that only
//                  accepts this request's state (and, when the server sends it,
//                  this issuer: RFC 9207); the authorization URL is SHOWN to
//                  the person through the adapter's UI and never opened here.
//                  Every endpoint passes the containment's origin rule
//                  (checkOAuthEndpoint: https, same site as the admitted server
//                  or an origin the record names); redirects are never
//                  followed.
//   tokens         kept in Enclawed's credential store (one 0600 file per
//                  admitted server URL in a 0700 directory of the adapter's
//                  protected state), sealed at rest (AES-256-GCM) with a key
//                  Enclawed holds apart from them (./credential-keys.ts: the
//                  bound Enclaweder's, else the OS keyring's, else a key
//                  file's), bound to the server's origin and URL; a record
//                  read for another server is refused. They reach the
//                  server only through the remote client's requestHeaders seam
//                  (called for the admitted server's own requests, never for
//                  metadata, token or registration endpoints), never the
//                  agent's environment, its transcript or a tool result.
//                  An expired access token is refreshed with the refresh token.
//   headers        a definition's headers (digest-covered) are sent the same
//                  way. A value that is a secret (an authorization, key, token
//                  or cookie header, a value taken from the environment, or a
//                  credential-shaped value) becomes a credential handle bound
//                  to the server's host: sent only to that server, and removed
//                  from every result before the model reads it.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import {
  RemoteMcpError,
  checkOAuthEndpoint,
  checkServerUrl,
  createRemoteMcpClient,
  type AuthorizationEndpoints,
  type RemoteMcpOptions,
} from "../containment/index.js";
import type { McpServerDefinition } from "./contracts.js";
import { type CredentialKeys, deviceKeyIdForm } from "./credential-keys.js";
import { credentialFindings } from "./credentials.js";
import type { RemoteCredentials } from "./remote-credentials.js";
import type { McpRemoteRecord, RemoteRefusal } from "./remote-launch.js";

type RemoteConnect = NonNullable<RemoteMcpOptions["connect"]>;

export type RemoteAuthCode =
  | "oauth-no-client"
  | "oauth-registration-failed"
  | "oauth-denied"
  | "oauth-state-mismatch"
  | "oauth-issuer-mismatch"
  | "oauth-timeout"
  | "oauth-token-invalid"
  | "oauth-redirect-not-loopback"
  | "remote-credential-mismatch"
  | "remote-credential-locked"
  | "mcp-remote-header-invalid"
  | "mcp-remote-header-unresolved";

export class RemoteAuthError extends Error {
  override name = "RemoteAuthError";
  constructor(
    readonly code: RemoteAuthCode,
    message: string,
  ) {
    super(`Enclawed remote MCP: ${message}`);
  }
}

/** How long the person has to authorize in the browser. */
const AUTHORIZATION_WAIT_MS = 5 * 60 * 1000;
/** An access token this close to its expiry is refreshed first. */
const EXPIRY_SKEW_MS = 30_000;
const MAX_BODY = 1024 * 1024;
const TOKEN = /^[\x21-\x7e]{1,8192}$/;

// ─── The credential store ───────────────────────────────────────────────

export type RemoteCredentialRecord = Readonly<{
  v: 1;
  /** The admitted server URL and its origin: the only server these credentials go to. */
  resource: string;
  origin: string;
  issuer: string;
  tokenEndpoint: string;
  client: Readonly<{
    clientId: string;
    clientSecret?: string;
    redirectUri?: string;
    registered: boolean;
  }>;
  tokens: Readonly<{
    accessToken: string;
    refreshToken?: string;
    expiresAt: number | null;
    scope?: string;
  }> | null;
}>;

export interface RemoteCredentialStore {
  get(url: string): RemoteCredentialRecord | null;
  set(url: string, rec: RemoteCredentialRecord | null): void;
  /** Resolves when every refusal audited so far has been written (remoteCredentialStore's audit). */
  settled?(): Promise<void>;
}

/** The audit record of a stored credential the store refused to open (never a secret). */
export type RemoteCredentialRefusalRecord = Readonly<{
  type: "auth.remote-credential.refused";
  payload: Readonly<{
    origin: string;
    code: "remote-credential-locked" | "remote-credential-mismatch";
    /**
     * Why: "legacy-device-challenge" (sealed under the CHALLENGE-derived device key of firmware
     * before command set 0.5, which a device proving 0.5 never gives again: log in to the server
     * again), "key-unavailable", "does-not-open" or "other-server".
     */
    reason: "legacy-device-challenge" | "key-unavailable" | "does-not-open" | "other-server";
    /** The kind of key the record names (device-challenge, device-key-derive, keyring, file). */
    keyKind: string | null;
  }>;
}>;

const keyOf = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 32);

type SealedRecord = Readonly<{
  v: 2;
  resource: string;
  origin: string;
  /** The key that sealed it (credential-keys.ts: its source and fingerprint). */
  key: string;
  iv: string;
  tag: string;
  data: string;
}>;

const aad = (resource: string, origin: string, key: string) =>
  Buffer.from(`enclawed.remote-credential.v2\n${resource}\n${origin}\n${key}`, "utf8");

function seal(rec: RemoteCredentialRecord, keys: CredentialKeys): SealedRecord {
  if (keys.write.key.every((b) => b === 0)) {
    // A launch key wiped by forgetLaunchCredentialKeys: never a sealing key.
    throw new RemoteAuthError(
      "remote-credential-locked",
      "the credential store's key was forgotten",
    );
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keys.write.key, iv);
  c.setAAD(aad(rec.resource, rec.origin, keys.write.id));
  const data = Buffer.concat([c.update(JSON.stringify(rec), "utf8"), c.final()]);
  return {
    v: 2,
    resource: rec.resource,
    origin: rec.origin,
    key: keys.write.id,
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

/**
 * Enclawed's credential store for remote servers: `dir` is in the adapter's
 * protected state (made 0700; each file 0600, written atomically); every
 * record is sealed with `keys` (credentialStoreKeys: the device's, the OS
 * keyring's or a key file's, never kept in `dir`). A file whose record names
 * another server than the one asked for is refused; a record sealed with a
 * key that is not available here is refused by name; a plaintext record from
 * before is sealed when it is first read.
 */
export function remoteCredentialStore(
  dir: string,
  keys: CredentialKeys,
  o: Readonly<{
    /** Every refusal, for the adapter's tamper-evident audit log (await `settled()` before going on). */
    audit?: (record: RemoteCredentialRefusalRecord) => Promise<unknown>;
  }> = {},
): RemoteCredentialStore {
  if (!keys?.write?.key || keys.write.key.length !== 32) {
    throw new RemoteAuthError("remote-credential-locked", "the credential store has no key");
  }
  const rel = path.relative(path.resolve(dir), keys.keyFile);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    throw new RemoteAuthError(
      "remote-credential-locked",
      "the credential key file must not be kept with the records it seals",
    );
  }
  const file = (url: string) => path.join(dir, `${keyOf(url)}.json`);
  const write = (f: string, body: unknown) => {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);
    const tmp = `${f}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    fs.renameSync(tmp, f);
  };
  let pending: Promise<void> = Promise.resolve();
  let auditFailures = 0;
  const keyKindOf = (id: unknown): string | null => {
    if (typeof id !== "string") {
      return null;
    }
    const f = deviceKeyIdForm(id);
    return f === "challenge"
      ? "device-challenge"
      : f === "key-derive"
        ? "device-key-derive"
        : (id.split(":")[0] ?? null);
  };
  /** Audit a refusal (queued; `settled()` waits for it), then hand back the error to throw. */
  const refused = (
    server: URL,
    err: RemoteAuthError,
    reason: RemoteCredentialRefusalRecord["payload"]["reason"],
    keyId: unknown = null,
  ): RemoteAuthError => {
    if (o.audit) {
      const record: RemoteCredentialRefusalRecord = {
        type: "auth.remote-credential.refused",
        payload: {
          origin: server.origin,
          code: err.code as RemoteCredentialRefusalRecord["payload"]["code"],
          reason,
          keyKind: keyKindOf(keyId),
        },
      };
      const audit = o.audit;
      pending = pending
        .then(() => audit(record))
        .then(
          () => undefined,
          () => {
            auditFailures++;
          },
        );
    }
    return err;
  };
  const mismatch = (server: URL) =>
    refused(
      server,
      new RemoteAuthError(
        "remote-credential-mismatch",
        `the stored credentials are not for ${server.origin}; they are not used`,
      ),
      "other-server",
    );
  const store: RemoteCredentialStore = {
    get(url) {
      const server = checkServerUrl(url);
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(fs.readFileSync(file(server.href), "utf8")) as Record<string, unknown>;
      } catch {
        return null;
      }
      if (raw?.resource !== server.href || raw?.origin !== server.origin) {
        throw mismatch(server);
      }
      if (raw.v === 1) {
        // A record kept in plaintext before sealing existed: sealed now.
        const rec = raw as unknown as RemoteCredentialRecord;
        store.set(url, rec);
        return rec;
      }
      const sealed = raw as unknown as SealedRecord;
      if (
        sealed.v !== 2 ||
        typeof sealed.key !== "string" ||
        typeof sealed.iv !== "string" ||
        typeof sealed.tag !== "string" ||
        typeof sealed.data !== "string"
      ) {
        throw mismatch(server);
      }
      const key = keys.read(sealed.key);
      if (!key) {
        // Command set 0.5: a record sealed under the CHALLENGE-derived device key is refused by name
        // (that key is never derived again), and the refusal is audited.
        const legacy =
          deviceKeyIdForm(sealed.key) === "challenge" && keys.device?.derivation === "key-derive";
        throw refused(
          server,
          new RemoteAuthError(
            "remote-credential-locked",
            legacy
              ? `the stored credentials of ${server.origin} are sealed under the Enclaweder's earlier (CHALLENGE-derived) key, which this device no longer gives (command set 0.5); log in to the server again`
              : `the stored credentials of ${server.origin} are sealed with a key that is not available here (${sealed.key.split(":")[0]}); bind that key's device or log in to the server again`,
          ),
          legacy ? "legacy-device-challenge" : "key-unavailable",
          sealed.key,
        );
      }
      let rec: RemoteCredentialRecord;
      try {
        const d = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
        d.setAAD(aad(sealed.resource, sealed.origin, sealed.key));
        d.setAuthTag(Buffer.from(sealed.tag, "base64"));
        rec = JSON.parse(
          Buffer.concat([d.update(Buffer.from(sealed.data, "base64")), d.final()]).toString("utf8"),
        ) as RemoteCredentialRecord;
      } catch {
        throw refused(
          server,
          new RemoteAuthError(
            "remote-credential-mismatch",
            `the stored credentials of ${server.origin} do not open with their key (changed after they were stored); they are not used`,
          ),
          "does-not-open",
          sealed.key,
        );
      }
      if (rec?.v !== 1 || rec.resource !== server.href || rec.origin !== server.origin) {
        throw mismatch(server);
      }
      // Sealed with an older key (a device bound since): sealed again with the best one.
      if (sealed.key !== keys.write.id) {
        write(file(server.href), seal(rec, keys));
      }
      return rec;
    },
    set(url, rec) {
      const server = checkServerUrl(url);
      const f = file(server.href);
      if (rec === null) {
        fs.rmSync(f, { force: true });
        return;
      }
      if (rec.resource !== server.href || rec.origin !== server.origin) {
        throw new RemoteAuthError(
          "remote-credential-mismatch",
          "credentials are stored only under their own server",
        );
      }
      write(f, seal(rec, keys));
    },
    settled: async () => {
      await pending;
      if (auditFailures > 0) {
        throw new RemoteAuthError(
          "remote-credential-locked",
          `${auditFailures} refusal(s) of stored credentials could not be written to the audit log`,
        );
      }
    },
  };
  return store;
}

// ─── HTTP for the token and registration endpoints ──────────────────────

function postTo(
  url: URL,
  body: string,
  contentType: string,
  connect: RemoteConnect | undefined,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port) || 443;
  const target = connect?.(host, port) ?? { host, port };
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: target.host,
      port: target.port,
      method: "POST",
      path: `${url.pathname}${url.search}`,
      headers: {
        host: url.host,
        "content-type": contentType,
        accept: "application/json",
        "content-length": Buffer.byteLength(body),
      },
      servername: net.isIP(host) ? undefined : host,
      ...(target.ca ? { ca: target.ca } : {}),
      agent: false,
      timeout: timeoutMs,
    });
    req.on("response", (res) => {
      if ((res.statusCode ?? 0) >= 300 && (res.statusCode ?? 0) < 400) {
        res.resume();
        reject(
          new RemoteMcpError(
            "redirect-refused",
            `${url.origin} answered with a redirect; redirects are not followed`,
          ),
        );
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          res.destroy(new Error("response too large"));
          return;
        }
        chunks.push(c);
      });
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }),
      );
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error(`timed out after ${timeoutMs} ms`)));
    req.on("error", reject);
    req.end(body);
  });
}

type TokenAnswer = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
};

function parseToken(status: number, text: string): TokenAnswer {
  let t: Record<string, unknown>;
  try {
    t = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new RemoteAuthError(
      "oauth-token-invalid",
      `the token endpoint answered HTTP ${status} without JSON`,
    );
  }
  if (status !== 200) {
    const e = typeof t?.error === "string" ? t.error.slice(0, 80) : `HTTP ${status}`;
    throw new RemoteAuthError("oauth-token-invalid", `the token endpoint refused: ${e}`);
  }
  if (typeof t.access_token !== "string" || !TOKEN.test(t.access_token)) {
    throw new RemoteAuthError("oauth-token-invalid", "the token answer has no usable access_token");
  }
  if (
    t.token_type !== undefined &&
    (typeof t.token_type !== "string" || t.token_type.toLowerCase() !== "bearer")
  ) {
    throw new RemoteAuthError("oauth-token-invalid", "the token is not a bearer token");
  }
  if (
    t.refresh_token !== undefined &&
    (typeof t.refresh_token !== "string" || !TOKEN.test(t.refresh_token))
  ) {
    throw new RemoteAuthError("oauth-token-invalid", "the refresh token is malformed");
  }
  return {
    accessToken: t.access_token,
    ...(typeof t.refresh_token === "string" ? { refreshToken: t.refresh_token } : {}),
    ...(typeof t.expires_in === "number" && t.expires_in > 0 ? { expiresIn: t.expires_in } : {}),
    ...(typeof t.scope === "string" ? { scope: t.scope.slice(0, 1000) } : {}),
  };
}

// ─── The loopback redirect ──────────────────────────────────────────────

export type LoopbackRedirect = Readonly<{
  redirectUri: string;
  /** The authorization code for this state (and issuer, when the server sends one). */
  wait(state: string, issuer: string, ms?: number): Promise<string>;
  close(): void;
}>;

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Is `uri` a loopback redirect (RFC 8252 7.3: http, 127.0.0.1 or [::1], any port)? */
export function isLoopbackRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    return (
      u.protocol === "http:" &&
      (u.hostname === "127.0.0.1" || u.hostname === "[::1]") &&
      !u.username &&
      !u.password &&
      u.hash === ""
    );
  } catch {
    return false;
  }
}

/**
 * The loopback listener the adapter opens for one authorization: 127.0.0.1,
 * an ephemeral port, an unguessable path. It answers only GET on that path,
 * takes one answer whose state is this authorization's, and closes.
 */
export async function openLoopbackRedirect(): Promise<LoopbackRedirect> {
  const callbackPath = `/callback/${randomBytes(12).toString("hex")}`;
  let pending: {
    state: string;
    issuer: string;
    resolve: (c: string) => void;
    reject: (e: Error) => void;
  } | null = null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET" || u.pathname !== callbackPath || !pending) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found\n");
      return;
    }
    const p = pending;
    const state = u.searchParams.get("state") ?? "";
    if (!sameText(state, p.state)) {
      // Not this authorization's answer (a forged or stale redirect): ignored.
      res.writeHead(400, { "content-type": "text/plain" }).end("unexpected state\n");
      return;
    }
    pending = null;
    const iss = u.searchParams.get("iss");
    const done = (status: number, text: string) =>
      res.writeHead(status, { "content-type": "text/plain" }).end(`${text}\n`);
    if (iss !== null && iss.replace(/\/$/, "") !== p.issuer.replace(/\/$/, "")) {
      done(400, "the authorization answer came from another issuer; it was refused");
      p.reject(
        new RemoteAuthError(
          "oauth-issuer-mismatch",
          `the answer names the issuer ${iss.slice(0, 200)}, not ${p.issuer}`,
        ),
      );
      return;
    }
    const error = u.searchParams.get("error");
    const code = u.searchParams.get("code");
    if (error || !code || !TOKEN.test(code)) {
      done(400, "authorization was not granted");
      p.reject(
        new RemoteAuthError(
          "oauth-denied",
          `authorization was not granted (${(error ?? "no code").slice(0, 80)})`,
        ),
      );
      return;
    }
    done(200, "Authorization received. You can close this window.");
    p.resolve(code);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as net.AddressInfo).port;
  return {
    redirectUri: `http://127.0.0.1:${port}${callbackPath}`,
    wait(state, issuer, ms = AUTHORIZATION_WAIT_MS) {
      return new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => {
          pending = null;
          reject(new RemoteAuthError("oauth-timeout", "no authorization arrived in time"));
        }, ms);
        t.unref();
        pending = {
          state,
          issuer,
          resolve: (c) => {
            clearTimeout(t);
            resolve(c);
          },
          reject: (e) => {
            clearTimeout(t);
            reject(e);
          },
        };
      });
    },
    close() {
      server.close();
      server.closeAllConnections?.();
    },
  };
}

// ─── The authorization ──────────────────────────────────────────────────

export type RemoteAuthOptions = Readonly<{
  store: RemoteCredentialStore;
  /** Show the authorization URL to the person (never open it). */
  show: (url: string) => void | Promise<void>;
  /** The loopback listener (default: openLoopbackRedirect()). */
  redirect?: LoopbackRedirect;
  connect?: RemoteConnect;
  timeoutMs?: number;
  waitMs?: number;
  clientName?: string;
  now?: () => number;
  /** The environment the definition's header variables come from. */
  env?: Readonly<Record<string, string | undefined>>;
}>;

export type RemoteAuthOutcome =
  | Readonly<{ ok: true; action: "not-required" | "authorized"; registered: boolean }>
  | RemoteRefusal;

const refusal = (err: unknown): RemoteRefusal => ({
  ok: false,
  code: err instanceof RemoteAuthError || err instanceof RemoteMcpError ? err.code : "oauth-failed",
  message: err instanceof Error ? err.message : String(err),
});

async function registerClient(
  server: URL,
  endpoints: AuthorizationEndpoints,
  extra: readonly string[],
  redirectUri: string,
  o: RemoteAuthOptions,
): Promise<RemoteCredentialRecord["client"]> {
  if (!endpoints.registrationEndpoint) {
    throw new RemoteAuthError(
      "oauth-no-client",
      `${server.origin} offers no client registration, and the admission record names no client id; pin it again with the client id the service issued`,
    );
  }
  const ep = checkOAuthEndpoint(
    server,
    "registration_endpoint",
    endpoints.registrationEndpoint,
    extra,
  );
  const r = await postTo(
    ep,
    JSON.stringify({
      client_name: o.clientName ?? "Enclawed",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    "application/json",
    o.connect,
    o.timeoutMs ?? 30_000,
  );
  let c: Record<string, unknown> = {};
  try {
    c = JSON.parse(r.text) as Record<string, unknown>;
  } catch {
    /* refused below */
  }
  if (
    (r.status !== 201 && r.status !== 200) ||
    typeof c.client_id !== "string" ||
    !TOKEN.test(c.client_id)
  ) {
    throw new RemoteAuthError(
      "oauth-registration-failed",
      `client registration at ${ep.origin} failed (HTTP ${r.status})`,
    );
  }
  return {
    clientId: c.client_id,
    ...(typeof c.client_secret === "string" && TOKEN.test(c.client_secret)
      ? { clientSecret: c.client_secret }
      : {}),
    redirectUri,
    registered: true,
  };
}

/**
 * Authorize the adapter for one admitted remote server, with a person: the
 * URL is handed to `show`, the code comes back to the loopback listener, and
 * the tokens go to the credential store (never returned).
 */
export async function authorizeRemoteMcpServer(
  def: McpServerDefinition & Readonly<{ name: string }>,
  record: McpRemoteRecord,
  o: RemoteAuthOptions,
): Promise<RemoteAuthOutcome> {
  let redirect = o.redirect ?? null;
  try {
    if (record.url !== def.url) {
      return {
        ok: false,
        code: "mcp-remote-url-mismatch",
        message: `${def.name}: the definition's URL is not the admitted one`,
      };
    }
    const server = checkServerUrl(record.url);
    const extra = (record.authorizationOrigins ?? []).map((x) => checkServerUrl(x).origin);
    // The probe sends what a connection would (stored token, headers): a
    // server that already accepts them needs nobody.
    const current = remoteCredentials(def, record, { store: o.store, env: o.env ?? {} });
    const client = createRemoteMcpClient({
      url: record.url,
      transport: record.transport,
      ...(record.authorizationOrigins ? { authorizationOrigins: record.authorizationOrigins } : {}),
      ...(o.connect ? { connect: o.connect } : {}),
      ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
      requestHeaders: () => current.headers(),
    });
    let endpoints: AuthorizationEndpoints;
    try {
      await client.initialize();
      client.close();
      return { ok: true, action: "not-required", registered: false };
    } catch (err) {
      client.close();
      if (!(err instanceof RemoteMcpError) || err.code !== "oauth-required") {
        throw err;
      }
      endpoints = (err as RemoteMcpError & { endpoints: AuthorizationEndpoints }).endpoints;
    }
    redirect ??= await openLoopbackRedirect();
    if (!isLoopbackRedirect(redirect.redirectUri)) {
      throw new RemoteAuthError(
        "oauth-redirect-not-loopback",
        "the redirect is not a loopback address",
      );
    }
    const prev = (() => {
      try {
        return o.store.get(record.url);
      } catch {
        return null;
      }
    })();
    const signed = record.oauth?.clientId;
    const clientInfo: RemoteCredentialRecord["client"] = signed
      ? { clientId: signed, registered: false }
      : prev?.client.registered &&
          prev.issuer === endpoints.issuer &&
          prev.client.redirectUri === redirect.redirectUri
        ? prev.client
        : await registerClient(server, endpoints, extra, redirect.redirectUri, o);
    const a = client.authorizationUrl(endpoints, {
      clientId: clientInfo.clientId,
      redirectUri: redirect.redirectUri,
      ...(record.oauth?.scope ? { scope: record.oauth.scope } : {}),
    });
    await o.show(a.url);
    const code = await redirect.wait(a.state, endpoints.issuer, o.waitMs);
    const tokenEndpoint = checkOAuthEndpoint(
      server,
      "token_endpoint",
      endpoints.tokenEndpoint,
      extra,
    );
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect.redirectUri,
      client_id: clientInfo.clientId,
      code_verifier: a.verifier,
      resource: server.href,
      ...(clientInfo.clientSecret ? { client_secret: clientInfo.clientSecret } : {}),
    });
    const r = await postTo(
      tokenEndpoint,
      form.toString(),
      "application/x-www-form-urlencoded",
      o.connect,
      o.timeoutMs ?? 30_000,
    );
    const t = parseToken(r.status, r.text);
    const now = (o.now ?? Date.now)();
    o.store.set(record.url, {
      v: 1,
      resource: server.href,
      origin: server.origin,
      issuer: endpoints.issuer,
      tokenEndpoint: tokenEndpoint.href,
      client: clientInfo,
      tokens: {
        accessToken: t.accessToken,
        ...(t.refreshToken ? { refreshToken: t.refreshToken } : {}),
        expiresAt: t.expiresIn ? now + t.expiresIn * 1000 : null,
        ...(t.scope ? { scope: t.scope } : {}),
      },
    });
    return { ok: true, action: "authorized", registered: clientInfo.registered && !signed };
  } catch (err) {
    return refusal(err);
  } finally {
    if (!o.redirect) {
      redirect?.close();
    }
  }
}

// ─── What a connection sends ────────────────────────────────────────────

const SECRET_HEADER =
  /^(authorization|proxy-authorization|cookie)$|api[-_]?key|token|secret|auth|password|session|credential|(^|-)key$/i;

/**
 * A definition's header values with `${VAR}` / `${VAR:-default}` expanded
 * from `env` (the host's syntax), and which of them are secrets.
 */
export function remoteHeaders(
  def: McpServerDefinition,
  env: Readonly<Record<string, string | undefined>>,
): { name: string; value: string; secret: boolean }[] {
  const raw = def.headers ?? {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new RemoteAuthError(
      "mcp-remote-header-invalid",
      "the definition's headers are not an object",
    );
  }
  return Object.entries(raw)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, v]) => {
      if (typeof v !== "string") {
        throw new RemoteAuthError(
          "mcp-remote-header-invalid",
          `the header ${JSON.stringify(name).slice(0, 80)} is not a string`,
        );
      }
      let fromEnv = false;
      const value = v.replace(
        /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
        (_m, n: string, dflt?: string) => {
          const e = env[n];
          if (e !== undefined && e !== "") {
            fromEnv = true;
            return e;
          }
          if (dflt !== undefined) {
            return dflt;
          }
          throw new RemoteAuthError(
            "mcp-remote-header-unresolved",
            `the header ${name} names the variable ${n}, which is not set`,
          );
        },
      );
      const secret = fromEnv || SECRET_HEADER.test(name) || credentialFindings(value).length > 0;
      return { name, value, secret };
    });
}

export type { RemoteCredentials } from "./remote-credentials.js";

/**
 * The credentials a connection to one admitted remote server sends: the
 * definition's headers (secret values as handles) and the stored OAuth
 * access token, refreshed when it expires. Throws a RemoteAuthError (closed
 * code) for a header that cannot be sent.
 */
export function remoteCredentials(
  def: McpServerDefinition & Readonly<{ name: string }>,
  record: McpRemoteRecord,
  o: Readonly<{
    store?: RemoteCredentialStore | null;
    env?: Readonly<Record<string, string | undefined>>;
    connect?: RemoteConnect;
    timeoutMs?: number;
    now?: () => number;
  }> = {},
): RemoteCredentials {
  const server = checkServerUrl(record.url);
  const extra = (record.authorizationOrigins ?? []).map((x) => checkServerUrl(x).origin);
  const now = o.now ?? Date.now;
  const fixed = remoteHeaders(def, o.env ?? {});
  const hasAuthorization = fixed.some((h) => h.name.toLowerCase() === "authorization");
  const host = server.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const stored = () => (o.store ? o.store.get(record.url) : null);
  const refresh = async (force = false): Promise<boolean> => {
    const rec = stored();
    const t = rec?.tokens;
    if (!rec || !t) {
      return false;
    }
    const expired = t.expiresAt !== null && t.expiresAt - EXPIRY_SKEW_MS <= now();
    if (!force && !expired) {
      return true;
    }
    if (!t.refreshToken) {
      return false;
    }
    const ep = checkOAuthEndpoint(server, "token_endpoint", rec.tokenEndpoint, extra);
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: t.refreshToken,
      client_id: rec.client.clientId,
      resource: server.href,
      ...(rec.client.clientSecret ? { client_secret: rec.client.clientSecret } : {}),
    });
    let a: TokenAnswer;
    try {
      const r = await postTo(
        ep,
        form.toString(),
        "application/x-www-form-urlencoded",
        o.connect,
        o.timeoutMs ?? 30_000,
      );
      a = parseToken(r.status, r.text);
    } catch (err) {
      // A refresh token the endpoint refused is spent: the next connection
      // needs a person. A network failure keeps it for the next attempt.
      if (err instanceof RemoteAuthError) {
        o.store?.set(record.url, { ...rec, tokens: null });
      }
      return false;
    }
    o.store?.set(record.url, {
      ...rec,
      tokens: {
        accessToken: a.accessToken,
        refreshToken: a.refreshToken ?? t.refreshToken,
        expiresAt: a.expiresIn ? now() + a.expiresIn * 1000 : null,
        ...(a.scope ? { scope: a.scope } : {}),
      },
    });
    return true;
  };
  return {
    origin: server.origin,
    headers() {
      const out: Record<string, string> = {};
      for (const h of fixed) {
        out[h.name] = h.value;
      }
      const t = hasAuthorization ? null : stored()?.tokens;
      if (t) {
        out.Authorization = `Bearer ${t.accessToken}`;
      }
      return out;
    },
    refresh,
    handles() {
      const t = stored()?.tokens;
      return [
        ...fixed
          .filter((h) => h.secret)
          // An authorization value is matched without its scheme too ("Bearer x" and "x").
          .flatMap((h) => {
            const bare = /^authorization$/i.test(h.name) ? h.value.replace(/^\S+\s+/, "") : h.value;
            return [h.value, ...(bare !== h.value ? [bare] : [])].map((value) => ({
              name: `mcp-header:${def.name}:${h.name}`,
              value,
              destinations: [host],
            }));
          }),
        ...(t
          ? [
              { name: `mcp-oauth:${def.name}:access`, value: t.accessToken, destinations: [host] },
              ...(t.refreshToken
                ? [
                    {
                      name: `mcp-oauth:${def.name}:refresh`,
                      value: t.refreshToken,
                      destinations: [host],
                    },
                  ]
                : []),
            ]
          : []),
      ];
    },
  };
}
