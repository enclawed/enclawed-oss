// enclawed adapter kit: sign in to the host's provider without the host, the
// login going straight into the adapter's memory (and from there under the
// device's seal), never into a file.
//
// Where an administrator-managed policy makes the host unable to sign in
// (managed-login-policy.ts), the person still needs a way to give the adapter
// a login. This is the provider's OAuth authorization-code flow with PKCE and
// a pasted code (the same flow the host runs for a manual sign-in): the
// adapter prints the authorization URL, the person signs in in a browser and
// pastes back "<code>#<state>", and the code is exchanged at the pinned https
// token endpoint (verified TLS, JSON body). The state must match; the code
// verifier never leaves this process. The returned login is handed to the
// caller (which seals it before it does anything else with it).
//
// What the URLs, the client id and the scopes are is the host's (the adapter
// passes them as data, read from the host's own code).

import { createHash, randomBytes } from "node:crypto";
import https from "node:https";
import tls from "node:tls";
import type { OAuthLogin } from "./auth-relay.js";

export type OAuthCodeLoginSpec = Readonly<{
  authorizeUrl: string;
  tokenUrl: string;
  /** The provider's page that shows the code to paste. */
  redirectUri: string;
  clientId: string;
  scopes: readonly string[];
  /** Extra query parameters the provider's authorize URL takes (e.g. { code: "true" }). */
  authorizeParams?: Readonly<Record<string, string>>;
}>;

export type OAuthCodeLoginResult =
  | Readonly<{ ok: true; login: OAuthLogin; account: Readonly<Record<string, unknown>> | null }>
  | Readonly<{
      ok: false;
      code: "no-code" | "state-mismatch" | "exchange-failed" | "bad-response" | "not-https";
      message: string;
    }>;

const b64url = (b: Buffer) => b.toString("base64url");

/** The authorization URL and the secrets of one attempt (kept in memory only). */
export function startOAuthCodeLogin(spec: OAuthCodeLoginSpec): {
  url: string;
  state: string;
  verifier: string;
} {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(32));
  const u = new URL(spec.authorizeUrl);
  for (const [k, v] of Object.entries(spec.authorizeParams ?? {})) {
    u.searchParams.append(k, v);
  }
  u.searchParams.append("client_id", spec.clientId);
  u.searchParams.append("response_type", "code");
  u.searchParams.append("redirect_uri", spec.redirectUri);
  u.searchParams.append("scope", spec.scopes.join(" "));
  u.searchParams.append("code_challenge", challenge);
  u.searchParams.append("code_challenge_method", "S256");
  u.searchParams.append("state", state);
  return { url: u.toString(), state, verifier };
}

/**
 * Run the flow: `show` prints the URL, `readCode` asks the person for the
 * pasted "<code>#<state>". Test seams (stand-ins only): the token endpoint's
 * trust anchors and address.
 */
export async function oauthCodeLogin(
  spec: OAuthCodeLoginSpec,
  o: Readonly<{
    show: (url: string) => void;
    readCode: () => Promise<string>;
    trustForTest?: string | Buffer;
    addressForTest?: Readonly<{ host: string; port: number }>;
    now?: () => number;
  }>,
): Promise<OAuthCodeLoginResult> {
  const token = new URL(spec.tokenUrl);
  if (token.protocol !== "https:") {
    return { ok: false, code: "not-https", message: "the token endpoint must be https" };
  }
  const attempt = startOAuthCodeLogin(spec);
  o.show(attempt.url);
  const pasted = (await o.readCode().catch(() => "")).trim();
  const hash = pasted.lastIndexOf("#");
  const code = hash > 0 ? pasted.slice(0, hash) : pasted;
  const state = hash > 0 ? pasted.slice(hash + 1) : "";
  if (!code) {
    return { ok: false, code: "no-code", message: "no code was pasted" };
  }
  // The state is the one this attempt made (a code from another attempt, or another site, is refused).
  if (state !== attempt.state) {
    return {
      ok: false,
      code: "state-mismatch",
      message: "the pasted code is not from this sign-in (its state does not match)",
    };
  }
  const body = JSON.stringify({
    grant_type: "authorization_code",
    code,
    redirect_uri: spec.redirectUri,
    client_id: spec.clientId,
    code_verifier: attempt.verifier,
    state: attempt.state,
  });
  let r: { status: number; text: string };
  try {
    r = await new Promise((resolve, reject) => {
      const target = o.addressForTest ?? { host: token.hostname, port: Number(token.port) || 443 };
      const req = https.request(
        {
          host: target.host,
          port: target.port,
          servername: token.hostname,
          method: "POST",
          path: `${token.pathname}${token.search}`,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
            host: token.host,
          },
          rejectUnauthorized: true,
          checkServerIdentity: (_h, cert) => tls.checkServerIdentity(token.hostname, cert),
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
      req.on("timeout", () => req.destroy(new Error("the token endpoint timed out")));
      req.on("error", reject);
      req.end(body);
    });
  } catch (err) {
    return {
      ok: false,
      code: "exchange-failed",
      message: `the token endpoint could not be reached (${(err as Error).message})`,
    };
  }
  if (r.status !== 200) {
    return {
      ok: false,
      code: "exchange-failed",
      message: `the token endpoint refused the code (HTTP ${r.status})`,
    };
  }
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(r.text) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "bad-response", message: "the token endpoint's answer is not JSON" };
  }
  if (typeof j.access_token !== "string" || j.access_token === "") {
    return { ok: false, code: "bad-response", message: "the token endpoint gave no access token" };
  }
  const now = (o.now ?? Date.now)();
  const account: Record<string, unknown> = {};
  for (const k of ["account", "organization"]) {
    if (j[k] && typeof j[k] === "object") {
      account[k] = j[k];
    }
  }
  return {
    ok: true,
    login: {
      accessToken: j.access_token,
      refreshToken: typeof j.refresh_token === "string" && j.refresh_token ? j.refresh_token : null,
      expiresAt: typeof j.expires_in === "number" ? now + j.expires_in * 1000 : null,
      scopes: typeof j.scope === "string" && j.scope ? j.scope.split(" ") : [...spec.scopes],
    },
    account: Object.keys(account).length ? account : null,
  };
}
