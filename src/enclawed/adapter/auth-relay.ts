// enclawed adapter kit: the host reaches its model provider with no
// credential of its own.
//
// With an Enclaweder bound, the host's account login is sealed at rest
// (login-seal.ts). This relay keeps it out of every readable file and out of
// the host's memory as well: the adapter opens the sealed login into the
// launcher's memory only, starts this relay on a unix socket in a private
// directory of the session, and points the host at the socket with a fixed,
// non-secret placeholder credential (each adapter names its host's variables).
// The relay:
//
//   - terminates the host's TLS with a certificate for the provider's name,
//     signed by a CA made for this one session and constrained to that name
//     (its private key exists only in this process; the host is given the CA
//     certificate alone);
//   - forwards only the routes the adapter lists (method and path), and only
//     a request that carries the placeholder; every other request is refused;
//   - removes whatever credential the request carried and adds the real one;
//   - sends it over TLS to the pinned provider host, verifying its certificate
//     against the system's trust store;
//   - refreshes the token when it is about to expire, or once when the
//     provider answers 401, and hands the rotated login to the adapter to seal
//     again (the host never sees a real token);
//   - drops the token when it is closed (end of session, halt).
//
// What it cannot do, said plainly: a process of the same user that connects
// to the socket can have requests sent on the account while the session runs
// (it cannot learn the token); and the token is in this process's memory,
// which root, and a same-user process where the kernel's ptrace restrictions
// are off, can read (processMemoryShielded tells which).
//
// With a refresh vault (boxRefreshVault), the refresh token is not among what
// that memory holds: it is kept sealed to the launch's login box, whose
// private key the launcher no longer has, and opened only for the instant of
// a refresh, after a new device-verified activation (KEY_DERIVE answers once
// per activation). Memory then holds the short-lived access token, which a
// reader can use until it expires; no host-side measure takes that away (the
// provider-side closure is in docs/security/session-takeover-root.md).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { Duplex } from "node:stream";
import tls from "node:tls";
import { createContainerCa } from "../containment/x509.js";
import { type BoxRecord, type SealBox, sealToBox } from "./sealed-box.js";

/** A route the relay forwards: a method and an exact path pattern (query allowed when `query`). */
export type AuthRelayRoute = Readonly<{
  method: string;
  path: RegExp;
  /** Add the real credential (true), or forward without one (false). */
  credential: boolean;
}>;

/** The login the relay holds: its current access token, and how to renew it. */
export type RelayCredential = {
  /** The access token to send, or null when there is none (the request is refused). */
  current(): string | null;
  /** Renew; true when the token changed. Called before expiry and once on a 401. */
  refresh(reason: "expiry" | "rejected"): Promise<boolean>;
  /** True when the token expires within the margin (refreshed before use). */
  expiresSoon(): boolean;
  /** Forget the token (the relay is closed). */
  drop(): void;
};

export type AuthRelayOptions = Readonly<{
  /** The socket, in a directory private to the session (0700); made 0600. */
  socketPath: string;
  /** The provider host the host thinks it talks to, and where requests go. */
  upstreamHost: string;
  upstreamPort?: number;
  /** The placeholder credential header and value the host sends (never a secret). */
  placeholder: Readonly<{ header: string; value: string }>;
  /** How the real credential is sent: header name and a prefix ("Bearer "). */
  credentialHeader: Readonly<{ header: string; prefix: string }>;
  routes: readonly AuthRelayRoute[];
  credential: RelayCredential;
  /** Stand-ins only: the trust anchors for the upstream (production uses the system store). */
  upstreamTrustForTest?: string | Buffer;
  /** Stand-ins only: where the upstream really is (production: upstreamHost:upstreamPort). */
  upstreamAddressForTest?: Readonly<{ host: string; port: number }>;
  /**
   * Every forwarded, refused or failed request and every token refresh (passed or failed), for the
   * adapter's audit log (auditedAuthRelayEvents): never a credential, a body or a query string.
   */
  onEvent?: (e: AuthRelayEvent) => void;
}>;

/** One relay event: what happened to which route, never a credential. */
export type AuthRelayEvent = Readonly<{
  kind: AuthRelayEventKind;
  method: string;
  /** The request path without its query string, at most 200 characters. */
  path: string;
  status: number;
  /** For "refreshed" / "refresh-failed": a token near its expiry, or one the provider rejected. */
  reason?: "expiry" | "rejected";
}>;

export type AuthRelayEventKind =
  | "forwarded"
  | "refused-route"
  | "refused-placeholder"
  | "refused-host"
  | "refused-size"
  | "no-credential"
  | "refreshed"
  | "refresh-failed"
  | "upstream-error";

export type AuthRelay = Readonly<{
  /** The CA certificate (PEM) the host must trust for the provider's name. */
  caCertPem: string;
  socketPath: string;
  close(): Promise<void>;
}>;

/** A request body larger than this is refused (a fixed bound, not a setting). */
export const AUTH_RELAY_MAX_BODY = 64 * 1024 * 1024;

/** Headers never forwarded: hop-by-hop, any credential the host sent, and the host name. */
const DROP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "authorization",
  "x-api-key",
  "cookie",
  "content-length",
]);

/** `c` as a plain duplex stream that starts with `first`. */
function asStream(c: net.Socket, first: Buffer): Duplex {
  const d = new Duplex({
    read() {
      c.resume();
    },
    write(chunk: Buffer, _enc, cb) {
      c.write(chunk, cb);
    },
    final(cb) {
      c.end();
      cb();
    },
    destroy(err, cb) {
      c.destroy();
      cb(err);
    },
  });
  d.push(first);
  c.on("data", (x: Buffer) => {
    if (!d.push(x)) {
      c.pause();
    }
  });
  c.on("end", () => d.push(null));
  c.on("close", () => d.destroy());
  return d;
}

function routeOf(routes: readonly AuthRelayRoute[], method: string, url: string) {
  const p = url.split("?")[0] ?? "";
  if (!p.startsWith("/") || p.includes("..") || p.includes("//") || p.includes("%")) {
    return null;
  }
  return routes.find((r) => r.method === method && r.path.test(p)) ?? null;
}

/** Start the relay. Refuses a socket directory others can enter. */
export async function startAuthRelay(o: AuthRelayOptions): Promise<AuthRelay> {
  const dir = path.dirname(o.socketPath);
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || (process.platform !== "win32" && (st.mode & 0o077) !== 0)) {
    throw new Error(`the relay's directory ${dir} is not private to this user (0700)`);
  }
  const host = o.upstreamHost.toLowerCase();
  const port = o.upstreamPort ?? 443;
  const ca = createContainerCa("session auth relay", [host]);
  const leaf = ca.leafFor(host);
  const emit = (
    kind: AuthRelayEventKind,
    method: string,
    p: string,
    status: number,
    reason?: "expiry" | "rejected",
  ) => {
    try {
      o.onEvent?.({
        kind,
        method,
        path: p.split("?")[0]?.slice(0, 200) ?? "",
        status,
        ...(reason ? { reason } : {}),
      });
    } catch {
      /* an observer never breaks the relay */
    }
  };
  let closed = false;

  const forward = (body: Buffer, req: http.IncomingMessage, token: string | null) =>
    new Promise<{ status: number; headers: http.IncomingHttpHeaders; res: http.IncomingMessage }>(
      (resolve, reject) => {
        const headers: Record<string, string | string[]> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (v !== undefined && !DROP_HEADERS.has(k.toLowerCase())) {
            headers[k] = v;
          }
        }
        headers.host = port === 443 ? host : `${host}:${port}`;
        headers["content-length"] = String(body.length);
        if (token !== null) {
          headers[o.credentialHeader.header.toLowerCase()] = `${o.credentialHeader.prefix}${token}`;
        }
        const target = o.upstreamAddressForTest ?? { host, port };
        const up = https.request({
          host: target.host,
          port: target.port,
          servername: host,
          method: req.method,
          path: req.url,
          headers,
          // The provider's certificate is verified for the pinned name, always.
          rejectUnauthorized: true,
          checkServerIdentity: (_h, cert) => tls.checkServerIdentity(host, cert),
          ...(o.upstreamTrustForTest ? { ca: o.upstreamTrustForTest } : {}),
          agent: false,
        });
        up.on("response", (res) =>
          resolve({ status: res.statusCode ?? 502, headers: res.headers, res }),
        );
        up.on("error", reject);
        up.end(body);
      },
    );

  const handle = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    sni: string | null,
  ) => {
    const method = req.method ?? "";
    const url = req.url ?? "";
    const refuse = (status: number, kind: AuthRelayEventKind) => {
      emit(kind, method, url, status);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { type: "enclawed_relay", message: `refused (${kind})` } }));
    };
    // A TLS connection must name the pinned host; plain requests reach only routes without a credential.
    if (sni !== null && sni.toLowerCase() !== host) {
      refuse(421, "refused-host");
      return;
    }
    const route = routeOf(o.routes, method, url);
    if (!route) {
      refuse(403, "refused-route");
      return;
    }
    if (route.credential) {
      if (sni === null) {
        refuse(403, "refused-route");
        return;
      }
      const sent = req.headers[o.placeholder.header.toLowerCase()];
      if (sent !== o.placeholder.value) {
        refuse(401, "refused-placeholder");
        return;
      }
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > AUTH_RELAY_MAX_BODY) {
        refuse(413, "refused-size");
        return;
      }
      chunks.push(c as Buffer);
    }
    const body = Buffer.concat(chunks);
    if (route.credential && o.credential.expiresSoon()) {
      if (await o.credential.refresh("expiry").catch(() => false)) {
        emit("refreshed", method, url, 0, "expiry");
      } else {
        emit("refresh-failed", method, url, 0, "expiry");
      }
    }
    const token = route.credential ? o.credential.current() : null;
    if (route.credential && !token) {
      refuse(401, "no-credential");
      return;
    }
    try {
      let r = await forward(body, req, token);
      if (r.status === 401 && route.credential) {
        r.res.resume();
        const renewed = await o.credential.refresh("rejected").catch(() => false);
        const again = renewed ? o.credential.current() : null;
        if (again) {
          emit("refreshed", method, url, 401, "rejected");
          r = await forward(body, req, again);
        } else {
          emit("refresh-failed", method, url, 401, "rejected");
          r = await forward(body, req, token);
        }
      }
      const out: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(r.headers)) {
        if (
          v !== undefined &&
          !DROP_HEADERS.has(k.toLowerCase()) &&
          k.toLowerCase() !== "set-cookie"
        ) {
          out[k] = v;
        }
      }
      res.writeHead(r.status, out);
      r.res.pipe(res);
      emit("forwarded", method, url, r.status);
    } catch {
      refuse(502, "upstream-error");
    }
  };

  // One HTTP server for both: a request over TLS carries the name it asked for (SNI), a plain one none.
  const plain = http.createServer((req, res) => {
    const s = req.socket as tls.TLSSocket;
    const sni = s.encrypted ? (typeof s.servername === "string" ? s.servername : "") : null;
    // A connection that drops mid-request ends here, quietly.
    handle(req, res, sni).catch(() => res.destroy());
  });
  const secure = tls.createServer(
    { key: leaf.keyPem, cert: leaf.certPem, ALPNProtocols: ["http/1.1"] },
    (t) => plain.emit("connection", t),
  );
  const sockets = new Set<net.Socket>();
  const front = net.createServer((c) => {
    sockets.add(c);
    c.on("close", () => sockets.delete(c));
    c.on("error", () => c.destroy());
    c.once("data", (first: Buffer) => {
      if (closed) {
        c.destroy();
        return;
      }
      // The first byte tells TLS (a handshake record) from plain HTTP. The
      // connection is handed on as a stream (the HTTP server would otherwise
      // read the socket's handle directly and miss the byte already read).
      const d = asStream(c, first);
      if (first[0] === 0x16) {
        secure.emit("connection", d);
      } else {
        plain.emit("connection", d);
      }
    });
  });
  fs.rmSync(o.socketPath, { force: true });
  await new Promise<void>((resolve, reject) => {
    front.once("error", reject);
    front.listen(o.socketPath, () => resolve());
  });
  fs.chmodSync(o.socketPath, 0o600);
  return {
    caCertPem: ca.certPem,
    socketPath: o.socketPath,
    async close() {
      closed = true;
      o.credential.drop();
      for (const s of sockets) {
        s.destroy();
      }
      await new Promise<void>((r) => front.close(() => r()));
      plain.close();
      secure.close();
      fs.rmSync(o.socketPath, { force: true });
    },
  };
}

/** An OAuth login as the relay keeps it (in memory only). */
/** The audit record type of each refresh event (an adapter may prefix it with its own name). */
export const AUTH_RELAY_REFRESH_RECORD = Object.freeze({
  refreshed: "auth.relay.token-refreshed",
  "refresh-failed": "auth.relay.token-refresh-failed",
} as const);

/**
 * The relay's onEvent for an adapter's tamper-evident audit log: every token refresh and failed
 * refresh is appended as its own record (`AUTH_RELAY_REFRESH_RECORD`) carrying the reason, method,
 * path and status only: no token, header, body or query string reaches the log. Other events go
 * to `other` (default: not recorded). `settled()` resolves when every append so far has finished;
 * `failures()` counts appends that threw (an adapter treats any as a broken audit).
 */
export function auditedAuthRelayEvents(
  append: (
    record: Readonly<{ type: string; payload: Record<string, unknown> }>,
  ) => Promise<unknown>,
  other?: (e: AuthRelayEvent) => void,
): {
  onEvent: (e: AuthRelayEvent) => void;
  settled(): Promise<void>;
  failures(): number;
} {
  let chain: Promise<void> = Promise.resolve();
  let failed = 0;
  return {
    onEvent: (e) => {
      const kind = e.kind;
      if (kind !== "refreshed" && kind !== "refresh-failed") {
        other?.(e);
        return;
      }
      const type = AUTH_RELAY_REFRESH_RECORD[kind];
      // Rebuilt field by field from the closed event shape: nothing else can ride along.
      const payload: Record<string, unknown> = {
        reason: e.reason === "expiry" || e.reason === "rejected" ? e.reason : null,
        method: e.method.slice(0, 16),
        path: e.path.split("?")[0].slice(0, 200),
        status: Number.isInteger(e.status) ? e.status : 0,
      };
      chain = chain
        .then(() => append({ type, payload }))
        .then(
          () => undefined,
          () => {
            failed++;
          },
        );
    },
    settled: () => chain,
    failures: () => failed,
  };
}

/**
 * Where the relay keeps a refresh token when it must not be in memory: `seal` returns what is kept
 * instead (nothing that opens without the device), `open` gives the token back for one refresh, or
 * null (no activation was had: the refresh fails, and the access token runs to its expiry).
 */
export type RefreshVault = Readonly<{
  seal(token: string): unknown;
  open(sealed: unknown): Promise<string | null>;
}>;

const REFRESH_AAD = Buffer.from("enclawed.adapter.auth-relay.refresh-token.v1", "utf8");

/**
 * A refresh vault over the launch's login box (credential-keys.ts boxes.login): the token is sealed
 * to the box's public key in memory; `reopen` obtains the box again with its private key (a new
 * device-verified activation and KEY_DERIVE, the adapter's), which is closed again at once.
 */
export function boxRefreshVault(
  o: Readonly<{
    box: Pick<SealBox, "id" | "publicKey">;
    reopen: () => Promise<SealBox | null>;
    /** Called after every opening (the adapter forgets the launch keys the reopening derived). */
    forget?: () => void;
  }>,
): RefreshVault {
  return {
    seal: (token) => {
      const plain = Buffer.from(token, "utf8");
      try {
        return sealToBox(o.box, plain, REFRESH_AAD);
      } finally {
        plain.fill(0);
      }
    },
    open: async (sealed) => {
      const box = await o.reopen().catch(() => null);
      if (!box) {
        return null;
      }
      try {
        if (box.id !== o.box.id) {
          return null;
        }
        const plain = box.open(sealed as BoxRecord, REFRESH_AAD);
        if (!plain) {
          return null;
        }
        const token = plain.toString("utf8");
        plain.fill(0);
        return token;
      } finally {
        box.close();
        o.forget?.();
      }
    },
  };
}

export type OAuthLogin = {
  accessToken: string;
  refreshToken: string | null;
  /** Milliseconds since the epoch; null when unknown. */
  expiresAt: number | null;
  scopes: readonly string[];
};

/** Renew a token early by this much (a fixed margin, not a setting). */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * The relay's credential for an OAuth login: refresh_token grants against
 * the provider's token endpoint (pinned https URL, JSON body), each rotation
 * handed to `onRotate` to be sealed again before the new token is used.
 */
export function oauthRelayCredential(
  o: Readonly<{
    login: OAuthLogin;
    tokenUrl: string;
    clientId: string;
    onRotate: (login: OAuthLogin) => void;
    /**
     * Keep the refresh token sealed (boxRefreshVault): it is opened only for the instant of a
     * refresh. Absent: the refresh token is held in memory beside the access token.
     */
    refreshVault?: RefreshVault | null;
    /** Stand-ins only: the trust anchors and address for the token endpoint. */
    trustForTest?: string | Buffer;
    addressForTest?: Readonly<{ host: string; port: number }>;
    now?: () => number;
  }>,
): RelayCredential {
  const url = new URL(o.tokenUrl);
  if (url.protocol !== "https:") {
    throw new Error("the token endpoint must be https");
  }
  const vault = o.refreshVault ?? null;
  // With a vault, the held login carries no refresh token: only `sealedRefresh` stands for it.
  let sealedRefresh: unknown =
    vault && o.login.refreshToken ? vault.seal(o.login.refreshToken) : null;
  let login: OAuthLogin | null = {
    ...o.login,
    refreshToken: vault ? null : o.login.refreshToken,
    scopes: [...o.login.scopes],
  };
  let inFlight: Promise<boolean> | null = null;
  const now = o.now ?? Date.now;
  const post = (body: string) =>
    new Promise<{ status: number; text: string }>((resolve, reject) => {
      const target = o.addressForTest ?? { host: url.hostname, port: Number(url.port) || 443 };
      const r = https.request(
        {
          host: target.host,
          port: target.port,
          servername: url.hostname,
          method: "POST",
          path: `${url.pathname}${url.search}`,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
            host: url.host,
          },
          rejectUnauthorized: true,
          checkServerIdentity: (_h, cert) => tls.checkServerIdentity(url.hostname, cert),
          ...(o.trustForTest ? { ca: o.trustForTest } : {}),
          agent: false,
          timeout: 30_000,
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (d) => {
            text += d;
            if (text.length > 1024 * 1024) {
              res.destroy();
            }
          });
          res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
        },
      );
      r.on("timeout", () => r.destroy(new Error("token endpoint timed out")));
      r.on("error", reject);
      r.end(body);
    });
  const refreshOnce = async (): Promise<boolean> => {
    const cur = login;
    const sealedNow = sealedRefresh;
    const refreshToken = vault
      ? cur && sealedNow !== null
        ? await vault.open(sealedNow)
        : null
      : (cur?.refreshToken ?? null);
    if (!cur || !refreshToken || login !== cur) {
      return false;
    }
    const body = JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: o.clientId,
      ...(cur.scopes.length ? { scope: cur.scopes.join(" ") } : {}),
    });
    const r = await post(body);
    if (r.status !== 200) {
      return false;
    }
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(r.text) as Record<string, unknown>;
    } catch {
      return false;
    }
    if (typeof j.access_token !== "string" || j.access_token === "" || login !== cur) {
      return false;
    }
    const next: OAuthLogin = {
      accessToken: j.access_token,
      refreshToken:
        typeof j.refresh_token === "string" && j.refresh_token ? j.refresh_token : refreshToken,
      expiresAt: typeof j.expires_in === "number" ? now() + j.expires_in * 1000 : null,
      scopes: typeof j.scope === "string" && j.scope ? j.scope.split(" ") : cur.scopes,
    };
    // Sealed before it is used: a rotated refresh token that is not kept would lose the login.
    o.onRotate(next);
    if (vault) {
      sealedRefresh = next.refreshToken ? vault.seal(next.refreshToken) : null;
      login = { ...next, refreshToken: null };
    } else {
      login = next;
    }
    return true;
  };
  return {
    current: () => login?.accessToken ?? null,
    expiresSoon: () => login?.expiresAt != null && login.expiresAt - now() < REFRESH_MARGIN_MS,
    refresh: () => {
      inFlight ??= refreshOnce().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    drop: () => {
      login = null;
      sealedRefresh = null;
    },
  };
}

/**
 * Turn core dumps of this process off (RLIMIT_CORE 0, soft and hard), before a login is opened
 * into its memory: a dump written at a crash would be a plaintext copy of the token at rest
 * (/var/lib/systemd/coredump, a core file). Node has no setrlimit; util-linux `prlimit` lowers this
 * process's own limit (no privilege needed to lower it). Checked by reading /proc/self/limits back.
 */
export function processCoreDumpsOff(
  run: (cmd: string, args: string[]) => { status: number | null } = (cmd, args) =>
    spawnSync(cmd, args, { stdio: "ignore", timeout: 10_000 }),
  read: (p: string) => string = (p) => fs.readFileSync(p, "utf8"),
  platform: NodeJS.Platform = process.platform,
): { off: boolean; reason: string } {
  if (platform !== "linux") {
    return { off: false, reason: `core dumps are not turned off on ${platform}` };
  }
  run("prlimit", ["--core=0:0", `--pid=${process.pid}`]);
  let line = "";
  try {
    line =
      read("/proc/self/limits")
        .split("\n")
        .find((l) => l.startsWith("Max core file size")) ?? "";
  } catch {
    line = "";
  }
  const [soft, hard] = line.replace("Max core file size", "").trim().split(/\s+/);
  return soft === "0" && hard === "0"
    ? { off: true, reason: "RLIMIT_CORE is 0" }
    : {
        off: false,
        reason: `core dumps of this process could not be turned off (${line.trim() || "no limits"}); a crash could write the token to disk`,
      };
}

/**
 * Whether a process of the same user can read this process's memory: Linux's
 * Yama ptrace_scope 1 or more restricts reading another process's memory to
 * its ancestors (and CAP_SYS_PTRACE); 0, or no Yama, allows any process of
 * the same user. Root is never kept out.
 */
export function processMemoryShielded(
  read: (p: string) => string = (p) => fs.readFileSync(p, "utf8"),
  platform: NodeJS.Platform = process.platform,
): { shielded: boolean; reason: string } {
  if (platform !== "linux") {
    return { shielded: false, reason: `no Yama ptrace restriction on ${platform}` };
  }
  let scope: number;
  try {
    scope = Number(read("/proc/sys/kernel/yama/ptrace_scope").trim());
  } catch {
    return { shielded: false, reason: "the kernel has no Yama ptrace restriction" };
  }
  return scope >= 1 && Number.isInteger(scope)
    ? { shielded: true, reason: `kernel.yama.ptrace_scope=${scope}` }
    : {
        shielded: false,
        reason: `kernel.yama.ptrace_scope=${scope} lets any process of this user read another's memory`,
      };
}
