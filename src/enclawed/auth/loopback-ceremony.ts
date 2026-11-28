// A one-time loopback page that runs one WebAuthn ceremony in the person's
// browser, for authenticators a terminal cannot reach (a platform passkey:
// Windows Hello, a Mac's or a phone's secure hardware). The page only
// carries bytes: it calls navigator.credentials.create or .get and posts the
// browser's answer back. Enclawed verifies the answer with the same code as
// a security key's (webauthn.ts), against the challenge it issued and the
// exact origin of this page.
//
// The server:
//   - listens on 127.0.0.1 at a port the OS picks, as http://localhost:<port>
//     (the RP ID is "localhost", a secure context for WebAuthn);
//   - answers only connections from 127.0.0.1 or ::1, and only requests
//     whose Host is exactly localhost:<port>;
//   - serves the page once, at a path made of 32 random bytes, and accepts
//     one POST of the result at the same path, carrying exactly this
//     page's Origin; every other request gets a bare 404 or 403;
//   - closes after that one result, or when the ceremony times out.
//
// A local process that learns the path can at most spend it (the ceremony
// then fails, and nothing is accepted): an answer is only accepted when the
// authenticator signed this ceremony's challenge for this page's origin
// with the person's verification, which no other page can obtain.

import { randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";

export const PASSKEY_RP_ID = "localhost";
const MAX_BODY = 64 * 1024;

export type LoopbackCeremonyRequest =
  | {
      kind: "create";
      challenge: Uint8Array;
      userId: Uint8Array;
      userName: string;
      excludeCredentialIds: readonly Uint8Array[];
      /** What the person is approving, shown on the page. */
      title: string;
    }
  | {
      kind: "get";
      challenge: Uint8Array;
      allowCredentialIds: readonly Uint8Array[];
      title: string;
    };

export type LoopbackCeremonyResult = {
  kind: "create" | "get";
  /** The exact origin of the page that ran the ceremony (http://localhost:<port>). */
  origin: string;
  credentialId: Uint8Array;
  clientDataJSON: Uint8Array;
  attestationObject?: Uint8Array;
  authenticatorData?: Uint8Array;
  signature?: Uint8Array;
};

export type CeremonyErrorCode = "timeout" | "cancelled" | "bad-result" | "closed";

export class CeremonyError extends Error {
  constructor(
    readonly code: CeremonyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CeremonyError";
  }
}

export type LoopbackServer = {
  /** The page to open: http://localhost:<port>/<token>. */
  url: string;
  origin: string;
  port: number;
  result: Promise<LoopbackCeremonyResult>;
  close(): void;
};

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Exactly http://localhost:<port> with a port in 1..65535 (no path, no default-port forms). */
export function isLoopbackOrigin(origin: string): boolean {
  const m = /^http:\/\/localhost:([1-9][0-9]{0,4})$/.exec(origin);
  return m !== null && Number(m[1]) <= 65535;
}

function b64url(b: Uint8Array): string {
  return Buffer.from(b).toString("base64url");
}

function fromB64urlField(v: unknown, what: string): Uint8Array {
  if (typeof v !== "string" || v.length === 0 || !/^[A-Za-z0-9_-]+$/.test(v)) {
    throw new CeremonyError("bad-result", `${what} is not base64url`);
  }
  return new Uint8Array(Buffer.from(v, "base64url"));
}

/** Parse the page's POST body into a ceremony result for `kind`. */
export function parseCeremonyPost(
  body: string,
  kind: "create" | "get",
  origin: string,
): LoopbackCeremonyResult {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    throw new CeremonyError("bad-result", "the page's answer is not JSON");
  }
  if (!v || typeof v !== "object") {
    throw new CeremonyError("bad-result", "the page's answer is not an object");
  }
  const o = v as Record<string, unknown>;
  if (o.kind === "error") {
    const name = typeof o.name === "string" ? o.name.slice(0, 64).replace(/[^\w.-]/g, "") : "";
    throw new CeremonyError(
      "cancelled",
      `the browser did not complete the passkey ceremony${name ? ` (${name})` : ""}`,
    );
  }
  if (o.kind !== kind) {
    throw new CeremonyError("bad-result", "the page answered a different ceremony");
  }
  const base = {
    kind,
    origin,
    credentialId: fromB64urlField(o.id, "id"),
    clientDataJSON: fromB64urlField(o.clientDataJSON, "clientDataJSON"),
  };
  if (kind === "create") {
    return {
      ...base,
      attestationObject: fromB64urlField(o.attestationObject, "attestationObject"),
    };
  }
  return {
    ...base,
    authenticatorData: fromB64urlField(o.authenticatorData, "authenticatorData"),
    signature: fromB64urlField(o.signature, "signature"),
  };
}

function header(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v.join(",") : v;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The ceremony page. Options travel as JSON in a data block; the script runs under a CSP nonce. */
export function ceremonyPage(
  req: LoopbackCeremonyRequest,
  nonce: string,
  timeoutMs: number,
): string {
  const opts =
    req.kind === "create"
      ? {
          kind: "create",
          challenge: b64url(req.challenge),
          userId: b64url(req.userId),
          userName: req.userName,
          exclude: req.excludeCredentialIds.map(b64url),
          timeout: timeoutMs,
        }
      : {
          kind: "get",
          challenge: b64url(req.challenge),
          allow: req.allowCredentialIds.map(b64url),
          timeout: timeoutMs,
        };
  // `<` escaped so the data block cannot close its script element.
  const data = JSON.stringify(opts).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Enclawed passkey</title>
<style nonce="${nonce}">body{font:16px system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#111;background:#fff}button{font:inherit;padding:.6rem 1.2rem}#s{margin-top:1rem}@media (prefers-color-scheme:dark){body{color:#eee;background:#111}}</style>
</head><body>
<h1>Enclawed</h1>
<p>${escapeHtml(req.title)}</p>
<p>${req.kind === "create" ? "Create a passkey on this device. Your device asks for your PIN, fingerprint or face." : "Confirm with this device's passkey. Your device asks for your PIN, fingerprint or face."}</p>
<button id="go" type="button">Continue</button>
<p id="s" role="status"></p>
<script type="application/json" id="o">${data}</script>
<script nonce="${nonce}">
(function () {
  var o = JSON.parse(document.getElementById("o").textContent);
  function dec(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function enc(buf) { var u = new Uint8Array(buf), s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, ""); }
  var st = document.getElementById("s"), go = document.getElementById("go"), sent = false;
  function post(body) {
    if (sent) return; sent = true; go.disabled = true;
    fetch(location.pathname, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "omit", cache: "no-store", redirect: "error" })
      .then(function (r) { st.textContent = r.ok ? "Done. You can close this tab and return to the terminal." : "Enclawed refused this answer. Return to the terminal."; })
      .catch(function () { st.textContent = "Could not reach Enclawed. Return to the terminal."; });
  }
  function run() {
    go.disabled = true; st.textContent = "Waiting for your device...";
    var p;
    if (o.kind === "create") {
      p = navigator.credentials.create({ publicKey: {
        rp: { id: "localhost", name: "Enclawed" },
        user: { id: dec(o.userId), name: o.userName, displayName: o.userName },
        challenge: dec(o.challenge),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }, { type: "public-key", alg: -8 }],
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "discouraged", requireResidentKey: false, userVerification: "required" },
        attestation: "direct",
        timeout: o.timeout,
        excludeCredentials: o.exclude.map(function (id) { return { type: "public-key", id: dec(id) }; })
      } }).then(function (c) {
        post({ kind: "create", id: enc(c.rawId), clientDataJSON: enc(c.response.clientDataJSON), attestationObject: enc(c.response.attestationObject) });
      });
    } else {
      p = navigator.credentials.get({ publicKey: {
        rpId: "localhost",
        challenge: dec(o.challenge),
        allowCredentials: o.allow.map(function (id) { return { type: "public-key", id: dec(id) }; }),
        userVerification: "required",
        timeout: o.timeout
      } }).then(function (c) {
        post({ kind: "get", id: enc(c.rawId), clientDataJSON: enc(c.response.clientDataJSON), authenticatorData: enc(c.response.authenticatorData), signature: enc(c.response.signature) });
      });
    }
    p.catch(function (e) { post({ kind: "error", name: (e && e.name) || "Error" }); });
  }
  go.addEventListener("click", run);
})();
</script>
</body></html>
`;
}

function securityHeaders(nonce?: string): Record<string, string> {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": nonce
      ? `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      : "default-src 'none'; frame-ancestors 'none'",
  };
}

function isLoopbackPeer(socket: Socket): boolean {
  return LOOPBACK.has(socket.remoteAddress ?? "");
}

export type RequestFacts = {
  remoteAddress: string | undefined;
  method: string | undefined;
  url: string | undefined;
  host: string | undefined;
  origin: string | undefined;
  secFetchSite: string | undefined;
  contentType: string | undefined;
};

export type RequestDecision =
  | { action: "drop" }
  | { action: "deny"; status: 403 | 404 }
  | { action: "page" }
  | { action: "accept-post" };

/**
 * What the one-time server does with a request, given its state: a
 * non-loopback peer is dropped; a foreign Host, a cross-site fetch, a
 * second page load, a POST before the page or after the answer, a POST
 * with another Origin or another content type are refused.
 */
export function decideRequest(
  r: RequestFacts,
  state: { path: string; host: string; origin: string; served: boolean; posted: boolean },
): RequestDecision {
  if (!LOOPBACK.has(r.remoteAddress ?? "")) {
    return { action: "drop" };
  }
  if (r.host !== state.host) {
    return { action: "deny", status: 403 };
  }
  if (r.url !== state.path) {
    return { action: "deny", status: 404 };
  }
  const site = r.secFetchSite;
  if (r.method === "GET") {
    if (state.served) {
      return { action: "deny", status: 404 };
    }
    if (site !== undefined && site !== "none" && site !== "same-origin") {
      return { action: "deny", status: 403 };
    }
    return { action: "page" };
  }
  if (r.method !== "POST") {
    return { action: "deny", status: 404 };
  }
  if (
    !state.served ||
    state.posted ||
    r.origin !== state.origin ||
    (site !== undefined && site !== "same-origin") ||
    !/^application\/json(;|$)/.test(r.contentType ?? "")
  ) {
    return { action: "deny", status: 403 };
  }
  return { action: "accept-post" };
}

/**
 * Start the one-time page for one ceremony. Resolves once listening; the
 * ceremony's answer (or its failure) arrives on `result`.
 */
export async function startLoopbackCeremony(
  req: LoopbackCeremonyRequest,
  opts: { timeoutMs: number },
): Promise<LoopbackServer> {
  const token = randomBytes(32).toString("base64url");
  const path = `/${token}`;
  const nonce = randomBytes(18).toString("base64");
  let served = false;
  let posted = false;
  let settle: { resolve: (r: LoopbackCeremonyResult) => void; reject: (e: Error) => void };
  const result = new Promise<LoopbackCeremonyResult>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // Nobody may be left waiting on a result nobody reads.
  result.catch(() => {});
  let origin = "";
  let host = "";
  const server = http.createServer();
  let timer: NodeJS.Timeout | null = null;
  let closed = false;
  const close = (err?: Error, value?: LoopbackCeremonyResult) => {
    if (closed) {
      return;
    }
    closed = true;
    if (timer) {
      clearTimeout(timer);
    }
    server.close();
    server.closeAllConnections();
    if (value) {
      settle.resolve(value);
    } else {
      settle.reject(err ?? new CeremonyError("closed", "the passkey page was closed"));
    }
  };
  const deny = (res: http.ServerResponse, status: number) => {
    res.writeHead(status, {
      ...securityHeaders(),
      "content-type": "text/plain",
      connection: "close",
    });
    res.end(status === 404 ? "not found\n" : "refused\n");
  };
  server.on("connection", (socket: Socket) => {
    if (!isLoopbackPeer(socket)) {
      socket.destroy();
    }
  });
  server.on("request", (req2: http.IncomingMessage, res: http.ServerResponse) => {
    const decision = decideRequest(
      {
        remoteAddress: req2.socket.remoteAddress,
        method: req2.method,
        url: req2.url,
        host: req2.headers.host,
        origin: req2.headers.origin,
        secFetchSite: header(req2.headers["sec-fetch-site"]),
        contentType: req2.headers["content-type"],
      },
      { path, host, origin, served, posted },
    );
    if (decision.action === "drop") {
      req2.socket.destroy();
      return;
    }
    if (decision.action === "deny") {
      deny(res, decision.status);
      return;
    }
    if (decision.action === "page") {
      served = true;
      res.writeHead(200, {
        ...securityHeaders(nonce),
        "content-type": "text/html; charset=utf-8",
      });
      res.end(ceremonyPage(req, nonce, opts.timeoutMs));
      return;
    }
    posted = true;
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req2.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        over = true;
        req2.destroy();
        close(new CeremonyError("bad-result", "the page's answer is too large"));
        return;
      }
      chunks.push(c);
    });
    req2.on("end", () => {
      if (over) {
        return;
      }
      let parsed: LoopbackCeremonyResult | null = null;
      let failure: Error | null = null;
      try {
        parsed = parseCeremonyPost(Buffer.concat(chunks).toString("utf8"), req.kind, origin);
      } catch (err) {
        failure = err as Error;
      }
      res.writeHead(parsed ? 200 : 400, {
        ...securityHeaders(),
        "content-type": "text/plain",
        connection: "close",
      });
      res.end(parsed ? "ok\n" : "refused\n", () => {
        if (parsed) {
          close(undefined, parsed);
        } else {
          close(failure ?? new CeremonyError("bad-result", "the page's answer was refused"));
        }
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;
  origin = `http://localhost:${port}`;
  host = `localhost:${port}`;
  timer = setTimeout(
    () => close(new CeremonyError("timeout", "the passkey ceremony timed out")),
    opts.timeoutMs,
  );
  timer.unref?.();
  return { url: `${origin}${path}`, origin, port, result, close: () => close() };
}
