import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CborError, decodeCbor } from "./cbor.js";
import {
  FLAGS,
  authData,
  coseFor,
  newCredentialKey,
  signWith,
  testLeafDer,
  testLeafKey,
} from "./fixtures.test-support.js";
import {
  OKP_REG_ATTESTATION_OBJECT,
  OKP_REG_CHALLENGE,
  OKP_REG_CLIENT_DATA_JSON,
  PY_WEBAUTHN_ASSERT_EC2,
  PY_WEBAUTHN_ASSERT_OKP,
  PY_WEBAUTHN_ASSERT_RSA,
  PY_WEBAUTHN_ORIGIN,
  PY_WEBAUTHN_RP_ID,
  TEST_AAGUID,
  TEST_CA_PEM,
  YUBICO_U2F_ROOT_PEM,
  YUBIKEY_REG_ATTESTATION_OBJECT,
  YUBIKEY_REG_CHALLENGE,
  YUBIKEY_REG_CLIENT_DATA_JSON,
} from "./vectors.test-support.js";
import {
  WebAuthnError,
  coseToPublicKey,
  decodeAttestationObject,
  fromB64url,
  parseAuthenticatorData,
  sha256,
  verifyAssertion,
  verifyClientData,
  verifyRegistration,
  verifyWithCredentialKey,
} from "./webauthn.js";

const YUBIKEY_AAGUID = "6d44ba9b-f6ec-2e49-b930-0c8fe920cb73";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof WebAuthnError) {
      return err.code;
    }
    throw err;
  }
  return "no-error";
}

function yubikeyRegistration() {
  const cdh = verifyClientData(fromB64url(YUBIKEY_REG_CLIENT_DATA_JSON), {
    type: "webauthn.create",
    challenge: fromB64url(YUBIKEY_REG_CHALLENGE),
    origin: PY_WEBAUTHN_ORIGIN,
  });
  return { cdh, ...decodeAttestationObject(fromB64url(YUBIKEY_REG_ATTESTATION_OBJECT)) };
}

describe("cbor", () => {
  it("rejects indefinite lengths, trailing bytes and duplicate map keys", () => {
    expect(() => decodeCbor(Uint8Array.of(0x5f, 0xff))).toThrow(CborError);
    expect(() => decodeCbor(Uint8Array.of(0x01, 0x02))).toThrow(/trailing/);
    expect(() => decodeCbor(Uint8Array.of(0xa2, 0x01, 0x01, 0x01, 0x02))).toThrow(/duplicate/);
    expect(() => decodeCbor(Uint8Array.of(0xfb, 0, 0, 0, 0, 0, 0, 0, 0))).toThrow(CborError);
  });
});

describe("registration: real YubiKey packed attestation (py_webauthn vector)", () => {
  it("verifies: UP+UV, ES256 key, basic attestation, AAGUID and counter", () => {
    const r = yubikeyRegistration();
    const reg = verifyRegistration({
      rpId: PY_WEBAUTHN_RP_ID,
      clientDataHash: r.cdh,
      fmt: r.fmt,
      authDataRaw: r.authDataRaw,
      stmt: r.stmt,
      policy: { allowedAuthenticators: [] },
    });
    expect(reg.aaguid).toBe(YUBIKEY_AAGUID);
    expect(reg.publicKey.alg).toBe(-7);
    expect(reg.signCount).toBe(52);
    expect(reg.attestation.certSubject).toContain("OU=Authenticator Attestation");
    expect(reg.attestation.certIssuer).toContain("Yubico U2F Root CA Serial 457200631");
  });

  it("chains to Yubico's published root when the allowlist names the model", () => {
    const r = yubikeyRegistration();
    const reg = verifyRegistration({
      rpId: PY_WEBAUTHN_RP_ID,
      clientDataHash: r.cdh,
      fmt: r.fmt,
      authDataRaw: r.authDataRaw,
      stmt: r.stmt,
      policy: {
        allowedAuthenticators: [
          {
            aaguid: YUBIKEY_AAGUID,
            description: "YubiKey (test)",
            attestationCas: [YUBICO_U2F_ROOT_PEM],
          },
        ],
      },
    });
    expect(reg.attestation.allowedAs).toBe("YubiKey (test)");
  });

  it("refuses a model not on the allowlist, or one that does not chain to the configured CA", () => {
    const r = yubikeyRegistration();
    const base = {
      rpId: PY_WEBAUTHN_RP_ID,
      clientDataHash: r.cdh,
      fmt: r.fmt,
      authDataRaw: r.authDataRaw,
      stmt: r.stmt,
    };
    expect(
      codeOf(() =>
        verifyRegistration({
          ...base,
          policy: {
            allowedAuthenticators: [{ aaguid: TEST_AAGUID, attestationCas: [TEST_CA_PEM] }],
          },
        }),
      ),
    ).toBe("attestation-not-allowed");
    expect(
      codeOf(() =>
        verifyRegistration({
          ...base,
          policy: {
            allowedAuthenticators: [{ aaguid: YUBIKEY_AAGUID, attestationCas: [TEST_CA_PEM] }],
          },
        }),
      ),
    ).toBe("attestation-not-allowed");
  });

  it("refuses the wrong relying party, a tampered signature, and a client data hash for another challenge", () => {
    const r = yubikeyRegistration();
    const policy = { allowedAuthenticators: [] };
    expect(
      codeOf(() =>
        verifyRegistration({
          rpId: "example.com",
          clientDataHash: r.cdh,
          fmt: r.fmt,
          authDataRaw: r.authDataRaw,
          stmt: r.stmt,
          policy,
        }),
      ),
    ).toBe("rp-mismatch");
    const sig = new Uint8Array(r.stmt.sig);
    sig[10] ^= 0x01;
    expect(
      codeOf(() =>
        verifyRegistration({
          rpId: PY_WEBAUTHN_RP_ID,
          clientDataHash: r.cdh,
          fmt: r.fmt,
          authDataRaw: r.authDataRaw,
          stmt: { ...r.stmt, sig },
          policy,
        }),
      ),
    ).toBe("attestation-invalid");
    expect(
      codeOf(() =>
        verifyRegistration({
          rpId: PY_WEBAUTHN_RP_ID,
          clientDataHash: sha256("other"),
          fmt: r.fmt,
          authDataRaw: r.authDataRaw,
          stmt: r.stmt,
          policy,
        }),
      ),
    ).toBe("attestation-invalid");
  });

  it("refuses self attestation and the none format", () => {
    const r = yubikeyRegistration();
    const policy = { allowedAuthenticators: [] };
    expect(
      codeOf(() =>
        verifyRegistration({
          rpId: PY_WEBAUTHN_RP_ID,
          clientDataHash: r.cdh,
          fmt: r.fmt,
          authDataRaw: r.authDataRaw,
          stmt: { ...r.stmt, x5c: [] },
          policy,
        }),
      ),
    ).toBe("attestation-missing");
    expect(
      codeOf(() =>
        verifyRegistration({
          rpId: PY_WEBAUTHN_RP_ID,
          clientDataHash: r.cdh,
          fmt: "none",
          authDataRaw: r.authDataRaw,
          stmt: r.stmt,
          policy,
        }),
      ),
    ).toBe("attestation-missing");
  });

  it("refuses a real registration made without user verification (UV=0)", () => {
    const cdh = verifyClientData(fromB64url(OKP_REG_CLIENT_DATA_JSON), {
      type: "webauthn.create",
      challenge: fromB64url(OKP_REG_CHALLENGE),
      origin: PY_WEBAUTHN_ORIGIN,
    });
    const d = decodeAttestationObject(fromB64url(OKP_REG_ATTESTATION_OBJECT));
    expect(parseAuthenticatorData(d.authDataRaw).flags.uv).toBe(false);
    expect(
      codeOf(() =>
        verifyRegistration({
          rpId: PY_WEBAUTHN_RP_ID,
          clientDataHash: cdh,
          ...d,
          policy: { allowedAuthenticators: [] },
        }),
      ),
    ).toBe("no-user-verification");
  });
});

describe("assertions: real authenticator vectors (py_webauthn)", () => {
  for (const [name, v] of [
    ["ES256", PY_WEBAUTHN_ASSERT_EC2],
    ["EdDSA", PY_WEBAUTHN_ASSERT_OKP],
  ] as const) {
    it(`${name}: the signature is genuine, and the policy still refuses it because UV=0`, () => {
      const cdh = verifyClientData(fromB64url(v.clientDataJSON), {
        type: "webauthn.get",
        challenge: fromB64url(v.challenge),
        origin: PY_WEBAUTHN_ORIGIN,
      });
      const raw = fromB64url(v.authenticatorData);
      const pub = coseToPublicKey(fromB64url(v.publicKey));
      expect(verifyWithCredentialKey(pub, Buffer.concat([raw, cdh]), fromB64url(v.signature))).toBe(
        true,
      );
      const tampered = new Uint8Array(raw);
      tampered[36] ^= 0x01;
      expect(
        verifyWithCredentialKey(pub, Buffer.concat([tampered, cdh]), fromB64url(v.signature)),
      ).toBe(false);
      expect(
        codeOf(() =>
          verifyAssertion({
            rpId: PY_WEBAUTHN_RP_ID,
            clientDataHash: cdh,
            authDataRaw: raw,
            signature: fromB64url(v.signature),
            credentialPublicKey: fromB64url(v.publicKey),
            storedSignCount: v.count,
          }),
        ),
      ).toBe("no-user-verification");
    });
  }

  it("RS256 (a real UV=1 assertion): accepted past its stored counter, refused at it or with a changed signature", () => {
    const v = PY_WEBAUTHN_ASSERT_RSA;
    expect(parseAuthenticatorData(fromB64url(v.authenticatorData)).flags.uv).toBe(true);
    expect(coseToPublicKey(fromB64url(v.publicKey)).alg).toBe(-257);
    const cdh = verifyClientData(fromB64url(v.clientDataJSON), {
      type: "webauthn.get",
      challenge: fromB64url(v.challenge),
      origin: PY_WEBAUTHN_ORIGIN,
    });
    const run =
      (storedSignCount: number, signature = fromB64url(v.signature)) =>
      () =>
        verifyAssertion({
          rpId: PY_WEBAUTHN_RP_ID,
          clientDataHash: cdh,
          authDataRaw: fromB64url(v.authenticatorData),
          signature,
          credentialPublicKey: fromB64url(v.publicKey),
          storedSignCount,
        });
    expect(run(0)().signCount).toBe(1);
    expect(codeOf(run(1))).toBe("counter-regressed");
    const bad = fromB64url(v.signature);
    bad[10] ^= 1;
    expect(codeOf(run(0, bad))).toBe("bad-signature");
  });

  it("checks clientDataJSON type, challenge and origin", () => {
    const v = PY_WEBAUTHN_ASSERT_EC2;
    const json = fromB64url(v.clientDataJSON);
    const challenge = fromB64url(v.challenge);
    expect(
      codeOf(() =>
        verifyClientData(json, { type: "webauthn.create", challenge, origin: PY_WEBAUTHN_ORIGIN }),
      ),
    ).toBe("type-mismatch");
    expect(
      codeOf(() =>
        verifyClientData(json, {
          type: "webauthn.get",
          challenge: sha256("x"),
          origin: PY_WEBAUTHN_ORIGIN,
        }),
      ),
    ).toBe("challenge-mismatch");
    expect(
      codeOf(() =>
        verifyClientData(json, { type: "webauthn.get", challenge, origin: "http://evil" }),
      ),
    ).toBe("origin-mismatch");
  });
});

describe("assertions: policy over real ES256 / Ed25519 signatures with UV=1", () => {
  const rpId = "enclawed.local";
  const cdh = new Uint8Array(createHash("sha256").update("challenge").digest());
  for (const alg of ["es256", "eddsa"] as const) {
    const key = newCredentialKey(alg);
    const cose = coseFor(key.publicKey);
    const assertion = (flags: number, signCount: number, signRp = rpId) => {
      const raw = authData({ rpId: signRp, flags, signCount });
      return { raw, sig: signWith(key.privateKey, Buffer.concat([raw, cdh])) };
    };
    const verify = (a: { raw: Uint8Array; sig: Uint8Array }, stored: number) =>
      codeOf(() =>
        verifyAssertion({
          rpId,
          clientDataHash: cdh,
          authDataRaw: a.raw,
          signature: a.sig,
          credentialPublicKey: cose,
          storedSignCount: stored,
        }),
      );

    it(`${alg}: accepts UP+UV with a counter that increases`, () => {
      expect(verify(assertion(FLAGS.UP | FLAGS.UV, 8), 7)).toBe("no-error");
    });
    it(`${alg}: refuses UP=0, UV=0, backup-eligible and another rpId`, () => {
      expect(verify(assertion(FLAGS.UV, 8), 7)).toBe("no-user-presence");
      expect(verify(assertion(FLAGS.UP, 8), 7)).toBe("no-user-verification");
      expect(verify(assertion(FLAGS.UP | FLAGS.UV | FLAGS.BE, 8), 7)).toBe("backup-eligible");
      expect(verify(assertion(FLAGS.UP | FLAGS.UV, 8, "evil.example"), 7)).toBe("rp-mismatch");
    });
    it(`${alg}: refuses a counter that repeats, goes backwards, or is never kept`, () => {
      expect(verify(assertion(FLAGS.UP | FLAGS.UV, 7), 7)).toBe("counter-regressed");
      expect(verify(assertion(FLAGS.UP | FLAGS.UV, 3), 7)).toBe("counter-regressed");
      expect(verify(assertion(FLAGS.UP | FLAGS.UV, 0), 0)).toBe("counter-unsupported");
    });
    it(`${alg}: refuses a signature over a different challenge`, () => {
      const a = assertion(FLAGS.UP | FLAGS.UV, 8);
      expect(
        codeOf(() =>
          verifyAssertion({
            rpId,
            clientDataHash: sha256("other"),
            authDataRaw: a.raw,
            signature: a.sig,
            credentialPublicKey: cose,
            storedSignCount: 7,
          }),
        ),
      ).toBe("bad-signature");
    });
  }
});

describe("registration: zero AAGUID", () => {
  it("refuses an authenticator that does not identify its model", () => {
    const key = newCredentialKey("es256");
    const cdh = sha256("c");
    const raw = authData({
      rpId: "enclawed.local",
      flags: FLAGS.UP | FLAGS.UV | FLAGS.AT,
      signCount: 0,
      attested: {
        aaguid: "00000000-0000-0000-0000-000000000000",
        credentialId: Uint8Array.of(1, 2, 3),
        cose: coseFor(key.publicKey),
      },
    });
    const sig = signWith(testLeafKey(), Buffer.concat([raw, cdh]));
    // The test leaf certificate carries a non-zero AAGUID extension, so the mismatch is caught first.
    expect(
      codeOf(() =>
        verifyRegistration({
          rpId: "enclawed.local",
          clientDataHash: cdh,
          fmt: "packed",
          authDataRaw: raw,
          stmt: { sig, x5c: [testLeafDer()] },
          policy: { allowedAuthenticators: [] },
        }),
      ),
    ).toBe("attestation-invalid");
  });
});
