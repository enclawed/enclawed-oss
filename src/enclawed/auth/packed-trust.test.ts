// Packed attestation is accepted only from recognized hardware security keys:
// a model (AAGUID) from the FIDO Metadata Service selection whose attestation
// chains to that model's pinned CA. Software and virtual authenticators
// (Chromium's included), self attestation, "none" and unknown CAs are refused.

import { X509Certificate, createHash, createPrivateKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MDS_SOURCE,
  PACKED_HARDWARE_MODELS,
  PACKED_HARDWARE_ROOTS,
} from "./attestation-roots-packed.js";
import { FLAGS, authData, coseFor, newCredentialKey, signWith } from "./fixtures.test-support.js";
import {
  CHROMIUM_AAGUID,
  CHROMIUM_LEAF_KEY_JWK,
  CHROMIUM_LEAF_PEM,
  UNKNOWN_LEAF_KEY_JWK,
  UNKNOWN_LEAF_PEM,
} from "./software-authenticators.test-support.js";
import {
  PY_WEBAUTHN_ORIGIN,
  PY_WEBAUTHN_RP_ID,
  TEST_AAGUID,
  TEST_LEAF_KEY_JWK,
  TEST_LEAF_PEM,
  YUBIKEY_REG_ATTESTATION_OBJECT,
  YUBIKEY_REG_CHALLENGE,
  YUBIKEY_REG_CLIENT_DATA_JSON,
  testPackedTrust,
} from "./vectors.test-support.js";
import {
  WebAuthnError,
  b64url,
  decodeAttestationObject,
  fromB64url,
  packedEnrollmentHolds,
  pinnedPackedTrust,
  sha256,
  verifyClientData,
  verifyRegistration,
} from "./webauthn.js";

const der = (pem: string) => new Uint8Array(new X509Certificate(pem).raw);
const RP = "enclawed.local";
const YUBICO_NFC = "6d44ba9b-f6ec-2e49-b930-0c8fe920cb73";

/** A packed registration signed by a software authenticator's leaf. */
function softwareRegistration(p: { aaguid: string; leafPem: string; leafJwk: object }) {
  const cred = newCredentialKey("es256");
  const credentialId = new Uint8Array(sha256(`cred-${p.aaguid}`));
  const cose = coseFor(cred.publicKey);
  const raw = authData({
    rpId: RP,
    flags: FLAGS.UP | FLAGS.UV | FLAGS.AT,
    signCount: 0,
    attested: { aaguid: p.aaguid, credentialId, cose },
  });
  const cdh = sha256("challenge");
  const key = createPrivateKey({ key: p.leafJwk as never, format: "jwk" });
  return {
    credentialId,
    cose,
    params: {
      rpId: RP,
      clientDataHash: cdh,
      fmt: "packed",
      authDataRaw: raw,
      stmt: { sig: signWith(key, Buffer.concat([raw, cdh])), x5c: [der(p.leafPem)], alg: -7 },
      policy: { allowedAuthenticators: [] },
    },
  };
}

function refusal(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (err) {
    if (err instanceof WebAuthnError) {
      return { code: err.code, message: err.message };
    }
    throw err;
  }
  return { code: "accepted", message: "" };
}

describe("the pinned packed trust (FIDO Metadata Service selection)", () => {
  it("every root matches its recorded SHA-256 fingerprint and is a CA; every model names pinned roots", () => {
    expect(MDS_SOURCE.url).toBe("https://mds3.fidoalliance.org/");
    expect(PACKED_HARDWARE_ROOTS.length).toBe(52);
    for (const r of PACKED_HARDWARE_ROOTS) {
      const c = new X509Certificate(r.pem);
      expect(createHash("sha256").update(c.raw).digest("hex"), r.name).toBe(r.sha256);
      expect(c.ca, r.name).toBe(true);
    }
    const fps = new Set(PACKED_HARDWARE_ROOTS.map((r) => r.sha256));
    expect(PACKED_HARDWARE_MODELS.length).toBe(118);
    for (const m of PACKED_HARDWARE_MODELS) {
      expect(m.roots.length, m.description).toBeGreaterThan(0);
      for (const f of m.roots) {
        expect(fps.has(f), `${m.description} ${f}`).toBe(true);
      }
    }
    const trust = pinnedPackedTrust();
    expect(trust.models.size).toBe(118);
    for (const [aaguid, m] of trust.models) {
      expect(m.roots.length, aaguid).toBeGreaterThan(0);
    }
  });

  it("holds the vendor roots cross-checked against the vendors' own publications", () => {
    const byFp = new Map(PACKED_HARDWARE_ROOTS.map((r) => [r.sha256, r.name]));
    // https://developers.yubico.com/U2F/yubico-u2f-ca-certs.txt
    expect(byFp.get("0fa1386f80eb8713263ae5c1d84deb455bdf08aea50ab05503cefee82b092d42")).toBe(
      "CN=Yubico U2F Root CA Serial 457200631",
    );
    // https://developers.yubico.com/PKI/yubico-ca-1.pem
    expect(byFp.get("62760c6a6ef91679f454c8902b80fd009825b3f25da90f1fbace2ec6586cd5a8")).toBe(
      "CN=Yubico Attestation Root 1",
    );
    expect([...byFp.values()].some((n) => /Titan Security Key Root/.test(n))).toBe(true);
    // No software, virtual or test CA is pinned.
    expect([...byFp.values()].some((n) => /Chromium|Enclawed|virtual/i.test(n))).toBe(false);
    expect(pinnedPackedTrust().models.has(CHROMIUM_AAGUID)).toBe(false);
    expect(pinnedPackedTrust().models.has(TEST_AAGUID)).toBe(false);
  });
});

describe("packed registration under the pinned trust", () => {
  it("accepts a real YubiKey (py_webauthn vector), chained to Yubico's root, as its MDS model", () => {
    const cdh = verifyClientData(fromB64url(YUBIKEY_REG_CLIENT_DATA_JSON), {
      type: "webauthn.create",
      challenge: fromB64url(YUBIKEY_REG_CHALLENGE),
      origin: PY_WEBAUTHN_ORIGIN,
    });
    const att = decodeAttestationObject(fromB64url(YUBIKEY_REG_ATTESTATION_OBJECT));
    const reg = verifyRegistration({
      rpId: PY_WEBAUTHN_RP_ID,
      clientDataHash: cdh,
      fmt: att.fmt,
      authDataRaw: att.authDataRaw,
      stmt: att.stmt,
      policy: { allowedAuthenticators: [] },
    });
    expect(reg.aaguid).toBe(YUBICO_NFC);
    expect(reg.attestation.allowedAs).toBe("Security Key by Yubico with NFC");
  });

  it("refuses Chromium's virtual authenticator, by its own AAGUID or a hardware key's", () => {
    for (const aaguid of [CHROMIUM_AAGUID, YUBICO_NFC]) {
      const r = softwareRegistration({
        aaguid,
        leafPem: CHROMIUM_LEAF_PEM,
        leafJwk: CHROMIUM_LEAF_KEY_JWK,
      });
      const v = refusal(() => verifyRegistration(r.params));
      if (aaguid === CHROMIUM_AAGUID) {
        expect(v.code).toBe("attestation-not-allowed");
        expect(v.message).toMatch(/virtual \(software\) authenticator/);
      } else {
        // Its certificate names its own AAGUID: refused before any trust question.
        expect(v.code).not.toBe("accepted");
      }
    }
  });

  it("refuses a packed attestation from an unknown CA, for an unknown model and for a recognized one", () => {
    for (const aaguid of ["11111111-2222-3333-4444-555555555555", YUBICO_NFC]) {
      const r = softwareRegistration({
        aaguid,
        leafPem: UNKNOWN_LEAF_PEM,
        leafJwk: UNKNOWN_LEAF_KEY_JWK,
      });
      const v = refusal(() => verifyRegistration(r.params));
      expect(v.code, aaguid).toBe("attestation-not-allowed");
      expect(v.message, aaguid).toMatch(
        aaguid === YUBICO_NFC ? /does not chain to the certificate authority/ : /not a recognized/,
      );
    }
    // The test CA's model is refused too unless a caller passes that trust (the gate tests).
    const t = softwareRegistration({
      aaguid: TEST_AAGUID,
      leafPem: TEST_LEAF_PEM,
      leafJwk: TEST_LEAF_KEY_JWK,
    });
    expect(refusal(() => verifyRegistration(t.params)).code).toBe("attestation-not-allowed");
    expect(
      refusal(() => verifyRegistration({ ...t.params, packedTrust: testPackedTrust() })).code,
    ).toBe("accepted");
  });

  it("an organization allowlist only narrows: it cannot admit a CA the pinned trust does not", () => {
    const r = softwareRegistration({
      aaguid: "11111111-2222-3333-4444-555555555555",
      leafPem: UNKNOWN_LEAF_PEM,
      leafJwk: UNKNOWN_LEAF_KEY_JWK,
    });
    const v = refusal(() =>
      verifyRegistration({
        ...r.params,
        policy: {
          allowedAuthenticators: [
            {
              aaguid: "11111111-2222-3333-4444-555555555555",
              attestationCas: [UNKNOWN_LEAF_PEM],
            },
          ],
        },
      }),
    );
    expect(v.code).toBe("attestation-not-allowed");
  });

  it("refuses self attestation (no certificate) and the none format", () => {
    const r = softwareRegistration({
      aaguid: TEST_AAGUID,
      leafPem: TEST_LEAF_PEM,
      leafJwk: TEST_LEAF_KEY_JWK,
    });
    expect(
      refusal(() =>
        verifyRegistration({
          ...r.params,
          stmt: { ...r.params.stmt, x5c: [] },
          packedTrust: testPackedTrust(),
        }),
      ).code,
    ).toBe("attestation-missing");
    expect(
      refusal(() =>
        verifyRegistration({ ...r.params, fmt: "none", packedTrust: testPackedTrust() }),
      ).code,
    ).toBe("attestation-missing");
  });
});

describe("a stored packed enrollment is verified again at every use", () => {
  it("holds only with its evidence, under a trust that recognizes it, for this very credential", () => {
    const r = softwareRegistration({
      aaguid: TEST_AAGUID,
      leafPem: TEST_LEAF_PEM,
      leafJwk: TEST_LEAF_KEY_JWK,
    });
    const evidence = {
      authData: b64url(r.params.authDataRaw),
      clientDataHash: b64url(r.params.clientDataHash),
      sig: b64url(r.params.stmt.sig),
      x5c: r.params.stmt.x5c.map((c) => b64url(c)),
      alg: -7,
    };
    const base = {
      rpId: RP,
      credentialId: r.credentialId,
      publicKeyCose: r.cose,
      enrolledAt: Date.now(),
    };
    expect(packedEnrollmentHolds({ ...base, evidence, packedTrust: testPackedTrust() })).toBe(true);
    // An enrollment from before 2.0.3 kept no evidence.
    expect(
      packedEnrollmentHolds({ ...base, evidence: undefined, packedTrust: testPackedTrust() }),
    ).toBe(false);
    // A software authenticator's evidence under the pinned trust.
    expect(packedEnrollmentHolds({ ...base, evidence })).toBe(false);
    // Evidence of another credential.
    expect(
      packedEnrollmentHolds({
        ...base,
        credentialId: new Uint8Array(32),
        evidence,
        packedTrust: testPackedTrust(),
      }),
    ).toBe(false);
  });
});
