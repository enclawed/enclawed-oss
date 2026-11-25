import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createServiceAccountAssertion,
  GOOGLE_JWT_CLOCK_SKEW_SECS,
  verifyGoogleSignedJwt,
} from "./google-jwt.js";

// Self-signed X.509 test certificate (CN=googlechat-test) and its key, so the
// verifier is exercised against the same PEM certificate format Google serves.
const FIXTURE_KEY_PEM = [
  "-----BEGIN PRIVATE KEY-----", // pragma: allowlist secret
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC4SG3TxbgLSHbW",
  "ZNm7E5/mkvEQ1S+RCBCxZ+LOdQivntwwFDolcY3+dilvu2k4zF1pntoYnJZbCAWu",
  "7gTwsKTJ5RuIB/7msXJv/pid/R3MZXEeiGgsWOnZ8zIBky2XWBe8e75mqSfqikP0",
  "yD51OSTWNRVKl9n2q22ocAzJ8pOPXBzN/UGq1YhX20FJoRQgke0HhH97v9R7EaWD",
  "EYuQYRxF27OM5hALK3Q/hlhlDKIDMDcClaXSEwWGpR6s5aBpA9O0Gis3QvTeb5Ta",
  "TYVLK17vJTml5Xz24qvd9aDO+9CxCANZjHSf9/lPodUCCQL84V28EjqJR1lu7Wxr",
  "8Dp98WG5AgMBAAECggEATEvkeLjUDYvXc8U2Zh9mZQKyXus8sdm6e5DM1Pice4WU",
  "mS1Os6DzjoZienmHw3XNOQUFPApcr9y+6aFvFy2zVEmQX/4beWy/OgIZMtQQicb4",
  "EhGcu7umOk/XhNJoHlBhJ26+MmfXeGH9Z7OeNE9P4oYAxizfl6J7GLEnglb14/Sl",
  "QeKuI2ONzxPHU6Gc3e2P4QZoGHO495V0cbX4ncqUVTtWGhTrF4ohwhJO4KgHXc79",
  "IqiTIwVpHRwTJtJ3nVlJnZGQLKmkAkPTmbvFI7l4loRiALD8DEercIRVIWnaoJ5O",
  "8YluIWvcDuH2a0oPdMkBT1Ba9prH8wK9+6O4b9wlnwKBgQDpUh1O1VZy/zHu/Dh/",
  "NkzLUq8y+F3euCSvId1sCVPP3mSaLILfX9NPyou8QoGaNdjF0NsjOYO9B+0KoNtA",
  "7ydLJX9ReeBUnNibcCJ8OdVY/Lu3jQ5T1B5uDahSubHMHW69NZ8OmOHFyAzhfPIq",
  "taTPpX0ocdXXOgG7/pxKoCRp7wKBgQDKMhJIff3DU/68Zd06sH8cS3BP4MjUKAjk",
  "249dREBh1lA/gOF+GL5okKj9Wg3GABtndfkydKBvNyFoA2bc+tnGKcODKxmVqp/j",
  "AaVCmL5iOD1WvkfFx6Irkws0BGHOsv+ahHrZQur0+XInGjnO2YAZHLagtEMbjFxi",
  "Mc5rUzw21wKBgDksGOhnWF6nb9nqzgFGEf1Ejo/D0mSv5LVRbAt8IaBvE2HABHWt",
  "6n7D2AfSmCVsimi2q+vuvPxGA+y1y+QWdh9w2cjiP3kcUeuMx7Z/CWtbyrfIhbk+",
  "4hH/oL5cqFem4qrUh9ww1Cn9wkJCtqiGiBMlrwyJEGhD24bwdeXHZgTbAoGAKFrF",
  "+2Hp+8oP1VofRU9kjykfSVH7wxwaalLH0j2E/AHiEkqOtrQJjKUSlT4b8aCj14pc",
  "Kg3M12WRbUkAhqoqPLqpIsy/VnevYYc6jIgft0qyM1XWzUqCu1+lpMQbIT3oddZr",
  "DmGksy/18Ifzca1HO7vXV0ui+SSSa6a1JAaAxhECgYEAoK5quvWYP5trg8dypP5v",
  "JKpp113TbjWbJLxfTNIz5tJnwdptkJ46tzMKR3EPi4SJoe9cMF43xSlORubiIofo",
  "Pwrp49T9N+T4KRu5tXfPRmVgV+zKbQExTyb592aQ65Yq4LAkUpBqz1vTjFlvxCkE",
  "kmKMaiAkbd1X4fZ4NJk6DUA=",
  "-----END PRIVATE KEY-----",
].join("\n");

const FIXTURE_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDFzCCAf+gAwIBAgIUVxj/OCtWwSxUwL7BtYEoGXYCaOkwDQYJKoZIhvcNAQEL
BQAwGjEYMBYGA1UEAwwPZ29vZ2xlY2hhdC10ZXN0MCAXDTI2MTEyNDIzMzMwNVoY
DzIxMjYxMDMxMjMzMzA1WjAaMRgwFgYDVQQDDA9nb29nbGVjaGF0LXRlc3QwggEi
MA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC4SG3TxbgLSHbWZNm7E5/mkvEQ
1S+RCBCxZ+LOdQivntwwFDolcY3+dilvu2k4zF1pntoYnJZbCAWu7gTwsKTJ5RuI
B/7msXJv/pid/R3MZXEeiGgsWOnZ8zIBky2XWBe8e75mqSfqikP0yD51OSTWNRVK
l9n2q22ocAzJ8pOPXBzN/UGq1YhX20FJoRQgke0HhH97v9R7EaWDEYuQYRxF27OM
5hALK3Q/hlhlDKIDMDcClaXSEwWGpR6s5aBpA9O0Gis3QvTeb5TaTYVLK17vJTml
5Xz24qvd9aDO+9CxCANZjHSf9/lPodUCCQL84V28EjqJR1lu7Wxr8Dp98WG5AgMB
AAGjUzBRMB0GA1UdDgQWBBQun16HhjNP7NM7Sh0+ZiWUNsg47zAfBgNVHSMEGDAW
gBQun16HhjNP7NM7Sh0+ZiWUNsg47zAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3
DQEBCwUAA4IBAQBW8qDfPx+u/MX5J4m7Xzb2kjx3duSBoBDpiXT9ha3LLyWMjdKO
kWH6kQv8os1E7px8wGVi85HDDyzA3EKrxkXatQJ3ZuU8DQHX5jPZ8AcdW2TrQMi/
BQhRsHWICBPlejUjjEbzJV0wwL5LTCq82nJeip/MxzHKHr1ExA7YMTCuWhmg5tFg
FjE8+0+Kurvu9ZDbj6xep+0Pw3uUGviJzL5vsbKcZeWhuMyTgHjj4tgbQNIcxShX
Pp3Cw/ebb3VfaOU0Z1nNGQZwLme4uEG0SmphatUSZOXLDqRCVLbj0WhggwuGRx8G
68/QNPwo4G1/fpkUQO1zyMkW/RP/aAiC4vcn
-----END CERTIFICATE-----`;

const { privateKey: rsaPrivateKey, publicKey: rsaPublicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const { privateKey: otherPrivateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: ecPrivateKey, publicKey: ecPublicKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
});

const RSA_PUBLIC_PEM = rsaPublicKey.export({ type: "spki", format: "pem" }) as string;
const AUDIENCE = "https://example.com/googlechat";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"] as const;
const NOW_MS = 1_800_000_000_000;
const NOW = NOW_MS / 1000;

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function signJwt(params: {
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  key?: crypto.KeyObject | string;
}): string {
  const header = params.header ?? { alg: "RS256", kid: "kid-1", typ: "JWT" };
  const payload = params.payload ?? validPayload();
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), params.key ?? rsaPrivateKey);
  return `${signingInput}.${b64url(signature)}`;
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aud: AUDIENCE,
    email: "chat@system.gserviceaccount.com",
    email_verified: true,
    exp: NOW + 3600,
    iat: NOW - 10,
    iss: "https://accounts.google.com",
    sub: "1234",
    ...overrides,
  };
}

function verify(jwt: string, certs: Record<string, string> = { "kid-1": RSA_PUBLIC_PEM }) {
  return verifyGoogleSignedJwt({ jwt, certs, audience: AUDIENCE, issuers: ISSUERS, nowMs: NOW_MS });
}

describe("verifyGoogleSignedJwt", () => {
  it("accepts a correctly signed token and returns its payload", () => {
    const result = verify(signJwt({}));
    expect(result.payload).toMatchObject({ email: "chat@system.gserviceaccount.com", sub: "1234" });
    expect(result.header).toMatchObject({ alg: "RS256", kid: "kid-1" });
  });

  it("accepts tokens verified against an X.509 PEM certificate", () => {
    const jwt = signJwt({ key: FIXTURE_KEY_PEM });
    expect(verify(jwt, { "kid-1": FIXTURE_CERT_PEM }).payload.iss).toBe(
      "https://accounts.google.com",
    );
  });

  it("accepts both Google ID token issuer spellings", () => {
    expect(() =>
      verify(signJwt({ payload: validPayload({ iss: "accounts.google.com" }) })),
    ).not.toThrow();
  });

  it("rejects a bad signature", () => {
    expect(() => verify(signJwt({ key: otherPrivateKey }))).toThrow("Invalid token signature");
  });

  it("rejects a tampered payload", () => {
    const [header, , signature] = signJwt({}).split(".");
    const forged = b64url(JSON.stringify(validPayload({ sub: "attacker" })));
    expect(() => verify(`${header}.${forged}.${signature}`)).toThrow("Invalid token signature");
  });

  it("rejects an unknown kid", () => {
    expect(() => verify(signJwt({ header: { alg: "RS256", kid: "kid-2" } }))).toThrow(
      "No pem found for envelope",
    );
  });

  it("rejects a missing kid and prototype keys", () => {
    expect(() => verify(signJwt({ header: { alg: "RS256" } }))).toThrow("no key id");
    expect(() => verify(signJwt({ header: { alg: "RS256", kid: "toString" } }))).toThrow(
      "No pem found for envelope",
    );
  });

  it("rejects alg none with an empty signature", () => {
    const header = b64url(JSON.stringify({ alg: "none", kid: "kid-1" }));
    const payload = b64url(JSON.stringify(validPayload()));
    expect(() => verify(`${header}.${payload}.`)).toThrow();
    expect(() => verify(`${header}.${payload}.${b64url("x")}`)).toThrow(
      "Unsupported token algorithm: none",
    );
  });

  it("rejects HS256 tokens keyed with the public certificate (key confusion)", () => {
    const header = b64url(JSON.stringify({ alg: "HS256", kid: "kid-1" }));
    const payload = b64url(JSON.stringify(validPayload()));
    const mac = crypto.createHmac("sha256", RSA_PUBLIC_PEM).update(`${header}.${payload}`).digest();
    expect(() => verify(`${header}.${payload}.${b64url(mac)}`)).toThrow(
      "Unsupported token algorithm: HS256",
    );
  });

  it("rejects ES256 tokens and non-RSA verification keys", () => {
    const ecPem = ecPublicKey.export({ type: "spki", format: "pem" }) as string;
    const header = { alg: "ES256", kid: "kid-1" };
    expect(() => verify(signJwt({ header, key: ecPrivateKey }), { "kid-1": ecPem })).toThrow(
      "Unsupported token algorithm: ES256",
    );
    expect(() => verify(signJwt({ key: ecPrivateKey }), { "kid-1": ecPem })).toThrow(
      "not an RSA key",
    );
  });

  it("rejects crit headers", () => {
    expect(() =>
      verify(signJwt({ header: { alg: "RS256", kid: "kid-1", crit: ["exp"] } })),
    ).toThrow("critical");
  });

  it("rejects the wrong audience, including array audiences", () => {
    expect(() =>
      verify(signJwt({ payload: validPayload({ aud: "https://evil.example" }) })),
    ).toThrow("Wrong recipient");
    expect(() => verify(signJwt({ payload: validPayload({ aud: [AUDIENCE] }) }))).toThrow(
      "Wrong recipient",
    );
  });

  it("rejects the wrong or missing issuer", () => {
    expect(() => verify(signJwt({ payload: validPayload({ iss: "googleapis.com" }) }))).toThrow(
      "Invalid issuer",
    );
    expect(() => verify(signJwt({ payload: validPayload({ iss: undefined }) }))).toThrow(
      "Invalid issuer",
    );
  });

  it("rejects expired tokens beyond the clock skew and accepts within it", () => {
    const skew = GOOGLE_JWT_CLOCK_SKEW_SECS;
    expect(() =>
      verify(signJwt({ payload: validPayload({ iat: NOW - 7200, exp: NOW - skew - 1 }) })),
    ).toThrow("Token used too late");
    expect(() =>
      verify(signJwt({ payload: validPayload({ iat: NOW - 7200, exp: NOW - skew + 1 }) })),
    ).not.toThrow();
  });

  it("rejects tokens issued in the future beyond the clock skew", () => {
    const skew = GOOGLE_JWT_CLOCK_SKEW_SECS;
    expect(() =>
      verify(signJwt({ payload: validPayload({ iat: NOW + skew + 1, exp: NOW + 7200 }) })),
    ).toThrow("Token used too early");
    expect(() =>
      verify(signJwt({ payload: validPayload({ iat: NOW + skew - 1, exp: NOW + 7200 }) })),
    ).not.toThrow();
  });

  it("rejects nbf beyond the clock skew", () => {
    const skew = GOOGLE_JWT_CLOCK_SKEW_SECS;
    expect(() => verify(signJwt({ payload: validPayload({ nbf: NOW + skew + 1 }) }))).toThrow(
      "Token used too early",
    );
    expect(() => verify(signJwt({ payload: validPayload({ nbf: "soon" }) }))).toThrow(
      "nbf field using invalid format",
    );
  });

  it("rejects missing, non-numeric, and over-long lifetimes", () => {
    expect(() => verify(signJwt({ payload: validPayload({ iat: undefined }) }))).toThrow(
      "No issue time",
    );
    expect(() => verify(signJwt({ payload: validPayload({ exp: undefined }) }))).toThrow(
      "No expiration time",
    );
    expect(() => verify(signJwt({ payload: validPayload({ exp: String(NOW + 60) }) }))).toThrow(
      "exp field using invalid format",
    );
    expect(() => verify(signJwt({ payload: validPayload({ exp: NOW + 86_400 }) }))).toThrow(
      "too far in future",
    );
  });

  it("rejects malformed segments", () => {
    const valid = signJwt({});
    const [header, payload, signature] = valid.split(".");
    expect(() => verify("")).toThrow("Malformed token");
    expect(() => verify(`${header}.${payload}`)).toThrow("Wrong number of segments");
    expect(() => verify(`${valid}.extra`)).toThrow("Wrong number of segments");
    expect(() => verify(`${header}.${payload}.${signature}=`)).toThrow("Malformed token signature");
    expect(() => verify(`${header}+.${payload}.${signature}`)).toThrow("Malformed token envelope");
    expect(() => verify(`${b64url("not json")}.${payload}.${signature}`)).toThrow(
      "Can't parse token envelope",
    );
    expect(() => verify(`${header}.${b64url("[1,2]")}.${signature}`)).toThrow(
      "Can't parse token payload",
    );
    expect(() => verify("a".repeat(20_000))).toThrow("Malformed token");
  });

  it("rejects certificate maps whose entry is not a usable key", () => {
    expect(() => verify(signJwt({}), { "kid-1": "not a pem" })).toThrow(
      "Invalid verification certificate",
    );
  });
});

describe("createServiceAccountAssertion", () => {
  it("builds an RS256 JWT-bearer assertion verifiable with the service account public key", () => {
    const privateKeyPem = rsaPrivateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const assertion = createServiceAccountAssertion({
      clientEmail: "bot@example.iam.gserviceaccount.com",
      privateKey: privateKeyPem,
      scope: "https://www.googleapis.com/auth/chat.bot",
      audience: "https://oauth2.googleapis.com/token",
      nowMs: NOW_MS,
    });
    const [header, payload, signature] = assertion.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(header, "base64url").toString("utf8"))).toEqual({
      alg: "RS256",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).toEqual({
      iss: "bot@example.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/chat.bot",
      aud: "https://oauth2.googleapis.com/token",
      exp: NOW + 3600,
      iat: NOW,
    });
    expect(
      crypto.verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        rsaPublicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });

  it("refuses invalid and non-RSA private keys", () => {
    const base = {
      clientEmail: "bot@example.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/chat.bot",
      audience: "https://oauth2.googleapis.com/token",
    };
    expect(() => createServiceAccountAssertion({ ...base, privateKey: "key" })).toThrow(
      "not a valid private key",
    );
    const ecPem = ecPrivateKey.export({ type: "pkcs8", format: "pem" }) as string;
    expect(() => createServiceAccountAssertion({ ...base, privateKey: ecPem })).toThrow(
      "must be an RSA key",
    );
  });
});
