// Sign in to mail the way an email client does: recognise the provider from
// the address, send the user to that provider's own login page, and come back
// with tokens. No app passwords.
//
// The flow is RFC 8252 (OAuth for native apps): a public client, PKCE, and a
// loopback redirect. Three details here are correctness, not preference:
//
//   - The login page opens in the SYSTEM BROWSER, never an embedded webview.
//     Google rejects embedded user-agents for OAuth outright
//     (`disallowed_useragent`), and it is also the only way the user can see
//     the real address bar and the real certificate before typing a password
//     into it. The caller supplies the "open a URL" function; this module
//     never launches anything itself.
//
//   - No client secret. A secret shipped inside a consumer app is not a
//     secret, and both providers support public clients with PKCE precisely
//     so that nothing has to be embedded.
//
//   - The redirect listener binds 127.0.0.1 explicitly, not 0.0.0.0, so the
//     authorization code cannot be captured off-machine, and it accepts
//     exactly one request before closing.
//
// Refresh tokens are long-lived credentials for the user's entire mailbox.
// They belong in the OS credential store; this module returns them and never
// writes them anywhere.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export type MailProviderId = "google" | "microsoft" | "unknown";

export type OAuthEndpoints = Readonly<{
  authorizeUrl: string;
  tokenUrl: string;
  scopes: ReadonlyArray<string>;
}>;

/**
 * Scopes are the ones that grant IMAP and SMTP, and nothing else.
 *
 * Google exposes mail access as a single coarse scope; it is classified as
 * "restricted", which means shipping this to the public requires OAuth
 * verification and an independent security assessment. That is a release
 * gate, not a code problem, but it is the reason this constant is worth
 * reading twice before anyone adds to it: every extra scope widens that
 * review.
 */
export const PROVIDER_ENDPOINTS: Readonly<Record<"google" | "microsoft", OAuthEndpoints>> =
  Object.freeze({
    google: Object.freeze({
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: Object.freeze(["https://mail.google.com/"]),
    }),
    microsoft: Object.freeze({
      authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      scopes: Object.freeze([
        "offline_access",
        "https://outlook.office.com/IMAP.AccessAsUser.All",
        "https://outlook.office.com/SMTP.Send",
      ]),
    }),
  });

const GOOGLE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
const MICROSOFT_DOMAINS = new Set([
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "passport.com",
]);

/** MX hostname fragments that identify who really runs a custom domain. */
const MX_SIGNATURES: ReadonlyArray<readonly [string, MailProviderId]> = Object.freeze([
  ["google.com", "google"],
  ["googlemail.com", "google"],
  ["outlook.com", "microsoft"],
  ["protection.outlook.com", "microsoft"],
]);

export function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at < 0
    ? ""
    : email
        .slice(at + 1)
        .trim()
        .toLowerCase();
}

/**
 * Recognise the provider from the address alone.
 *
 * Consumer domains resolve immediately. A custom domain -- which is most
 * business mail, and is invisible from the address -- needs the MX lookup in
 * `detectProvider`.
 */
export function detectProviderByDomain(email: string): MailProviderId {
  const domain = domainOf(email);
  if (GOOGLE_DOMAINS.has(domain)) {
    return "google";
  }
  if (MICROSOFT_DOMAINS.has(domain)) {
    return "microsoft";
  }
  return "unknown";
}

export type MxResolver = (hostname: string) => Promise<Array<{ exchange: string }>>;

/**
 * Recognise the provider, falling back to the domain's MX records.
 *
 * Workspace and Microsoft 365 domains look like anything at all from the
 * address, so a client that only pattern-matches the domain sends every
 * business user to a manual-setup screen. The MX records say who actually
 * receives the mail. A lookup failure is not an error -- offline, or a domain
 * that runs its own mail -- it just means "unknown", and the caller asks.
 */
export async function detectProvider(
  email: string,
  resolveMx?: MxResolver,
): Promise<MailProviderId> {
  const byDomain = detectProviderByDomain(email);
  if (byDomain !== "unknown" || !resolveMx) {
    return byDomain;
  }
  const domain = domainOf(email);
  if (!domain) {
    return "unknown";
  }
  try {
    const records = await resolveMx(domain);
    for (const { exchange } of records) {
      const host = exchange.toLowerCase().replace(/\.$/, "");
      for (const [needle, provider] of MX_SIGNATURES) {
        if (host === needle || host.endsWith(`.${needle}`)) {
          return provider;
        }
      }
    }
  } catch {
    // Offline, NXDOMAIN, or a domain with no MX. Not a failure worth
    // surfacing: the caller falls back to asking.
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

export type Pkce = Readonly<{ verifier: string; challenge: string; method: "S256" }>;

function base64url(buf: Buffer): string {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * A fresh PKCE pair. 32 random bytes base64url-encoded lands at 43
 * characters, the minimum RFC 7636 allows and comfortably beyond guessing.
 */
export function createPkce(): Pkce {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return Object.freeze({ verifier, challenge, method: "S256" as const });
}

// ---------------------------------------------------------------------------
// Authorization request
// ---------------------------------------------------------------------------

export type AuthorizeRequest = Readonly<{
  provider: "google" | "microsoft";
  clientId: string;
  redirectUri: string;
  pkce: Pkce;
  state: string;
  /** Pre-fills the account chooser so the user does not retype the address. */
  loginHint?: string;
}>;

export function buildAuthorizeUrl(req: AuthorizeRequest): string {
  const ep = PROVIDER_ENDPOINTS[req.provider];
  const url = new URL(ep.authorizeUrl);
  const params: Record<string, string> = {
    client_id: req.clientId,
    response_type: "code",
    redirect_uri: req.redirectUri,
    scope: ep.scopes.join(" "),
    state: req.state,
    code_challenge: req.pkce.challenge,
    code_challenge_method: req.pkce.method,
  };
  if (req.loginHint) {
    params.login_hint = req.loginHint;
  }
  if (req.provider === "google") {
    // Without both of these Google returns an access token and no refresh
    // token on re-authorisation, and the assistant silently stops working an
    // hour later.
    params.access_type = "offline";
    params.prompt = "consent";
  }
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export function createState(): string {
  return base64url(randomBytes(16));
}

// ---------------------------------------------------------------------------
// Loopback redirect capture
// ---------------------------------------------------------------------------

export type LoopbackCapture = Readonly<{
  /** The redirect_uri to register in the authorize request. */
  redirectUri: string;
  /** Resolves with the authorization code once the browser comes back. */
  code: Promise<string>;
  /** Stop listening; safe to call twice. */
  close: () => void;
}>;

const DONE_PAGE = (title: string, detail: string): string =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:Segoe UI Variable,Segoe UI,system-ui,sans-serif;` +
  `display:grid;place-items:center;height:100vh;margin:0;background:#f3f3f3;color:#1b1b1b">` +
  `<main style="text-align:center;max-width:28rem;padding:2rem">` +
  `<h1 style="font-size:1.25rem;font-weight:600">${title}</h1>` +
  `<p style="opacity:.75">${detail}</p></main>`;

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Listen on 127.0.0.1 for the single redirect the browser will make.
 *
 * Binding the loopback interface explicitly matters: on 0.0.0.0 anything on
 * the network could race the browser and hand us its own authorization code.
 * The state parameter is compared in constant time and a mismatch is refused
 * rather than logged, because a mismatch is the signature of exactly that.
 */
export async function startLoopbackCapture(opts: {
  expectedState: string;
  timeoutMs?: number;
  path?: string;
}): Promise<LoopbackCapture> {
  const path = opts.path ?? "/oauth/callback";
  let settle: ((code: string) => void) | null = null;
  let fail: ((err: Error) => void) | null = null;
  const code = new Promise<string>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== path) {
      res.writeHead(404).end();
      return;
    }
    const err = url.searchParams.get("error");
    const got = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? "";
    if (err) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(DONE_PAGE("Sign-in cancelled", "You can close this tab and try again."));
      fail?.(new Error(`authorization denied: ${err}`));
      return;
    }
    if (!constantTimeEquals(state, opts.expectedState)) {
      res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      res.end(DONE_PAGE("Sign-in could not be verified", "Please start again from the app."));
      fail?.(new Error("state mismatch"));
      return;
    }
    if (!got) {
      res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      res.end(DONE_PAGE("Sign-in incomplete", "No authorization code was returned."));
      fail?.(new Error("no authorization code in redirect"));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(DONE_PAGE("You're signed in", "You can close this tab and return to Enclawed."));
    settle?.(got);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const timer = setTimeout(
    () => fail?.(new Error("timed out waiting for the browser to come back")),
    opts.timeoutMs ?? 5 * 60_000,
  );
  const close = (): void => {
    clearTimeout(timer);
    server.close();
  };
  void code.then(close, close);

  return Object.freeze({
    redirectUri: `http://127.0.0.1:${port}${path}`,
    code,
    close,
  });
}

// ---------------------------------------------------------------------------
// Token exchange and refresh
// ---------------------------------------------------------------------------

export type MailTokens = Readonly<{
  accessToken: string;
  /** Absent when the provider declines to reissue one on refresh. */
  refreshToken?: string;
  /** Absolute epoch ms. Callers refresh before this, not after a failure. */
  expiresAt: number;
  scope?: string;
}>;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

/** Tokens are secrets: report the provider's error code, never the body. */
function tokenError(provider: string, status: number, j: TokenResponse): Error {
  const code = j.error ?? `HTTP ${status}`;
  return new Error(`${provider} token request failed: ${code}`);
}

async function postToken(
  provider: "google" | "microsoft",
  form: Record<string, string>,
): Promise<MailTokens> {
  const ep = PROVIDER_ENDPOINTS[provider];
  const r = await globalThis.fetch(ep.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const j = (await r.json()) as TokenResponse;
  if (!r.ok || !j.access_token) {
    throw tokenError(provider, r.status, j);
  }
  // Expire a minute early. A token that dies mid-IDLE costs a reconnect and
  // shows up as a spurious auth failure in the log.
  const lifetime = (j.expires_in ?? 3600) * 1000;
  return Object.freeze({
    accessToken: j.access_token,
    ...(j.refresh_token ? { refreshToken: j.refresh_token } : {}),
    expiresAt: Date.now() + Math.max(0, lifetime - 60_000),
    ...(j.scope ? { scope: j.scope } : {}),
  });
}

export async function exchangeCode(opts: {
  provider: "google" | "microsoft";
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<MailTokens> {
  return postToken(opts.provider, {
    client_id: opts.clientId,
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
  });
}

export async function refreshTokens(opts: {
  provider: "google" | "microsoft";
  clientId: string;
  refreshToken: string;
}): Promise<MailTokens> {
  const next = await postToken(opts.provider, {
    client_id: opts.clientId,
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
  });
  // Google reissues an access token without a refresh token; the original
  // stays valid. Carrying it forward means the caller can always persist
  // whatever it just received without losing the ability to refresh again.
  return next.refreshToken ? next : Object.freeze({ ...next, refreshToken: opts.refreshToken });
}

/** True when the token is expired or close enough that a reconnect would race it. */
export function needsRefresh(tokens: Pick<MailTokens, "expiresAt">, now = Date.now()): boolean {
  return now >= tokens.expiresAt;
}

/**
 * The SASL XOAUTH2 initial response.
 *
 * imapflow and nodemailer build this themselves when handed an accessToken,
 * so this exists for the diagnostic path and for any transport that wants the
 * raw string.
 */
export function xoauth2Token(user: string, accessToken: string): string {
  // SASL XOAUTH2 is exact: the separators are U+0001 and the value ends
  // with two of them. Written as an escape so they stay visible in review
  // and no editor or formatter can silently eat a control character.
  const SEP = "\u0001";
  return Buffer.from(`user=${user}${SEP}auth=Bearer ${accessToken}${SEP}${SEP}`, "utf8").toString(
    "base64",
  );
}
