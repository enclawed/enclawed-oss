import {
  createHash,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign as cryptoSign,
  X509Certificate,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import type { VendorRoots } from "./attestation-platform.js";
import { PINNED_ATTESTATION_ROOTS, loadPinnedRoot, pinnedRoots } from "./attestation-roots.js";
import { FLAGS, authData } from "./fixtures.test-support.js";
import {
  type AndroidBreak,
  type AppleBreak,
  type TestPki,
  type TpmBreak,
  buildAndroidKeyRegistration,
  buildAppleRegistration,
  buildTpmRegistration,
  coseOf,
  newTestPki,
} from "./platform-fixtures.test-support.js";
import { PLATFORM_VECTORS, type PlatformVector } from "./platform-vectors.test-support.js";
import {
  WebAuthnError,
  decodeAttestationObject,
  tpmCounterExemptionHolds,
  verifyAssertion,
  verifyClientData,
  verifyRegistration,
} from "./webauthn.js";

const b64 = (s: string) =>
  new Uint8Array(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"));

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof WebAuthnError) {
      return err.code;
    }
    throw err;
  }
  return "accepted";
}

function verifyVector(
  v: PlatformVector,
  over: {
    rpId?: string;
    origin?: string;
    now?: number;
    roots?: VendorRoots;
    authData?: (a: Uint8Array) => Uint8Array;
  } = {},
) {
  const cdj = b64(v.clientDataJSON);
  const challenge = b64(JSON.parse(Buffer.from(cdj).toString("utf8")).challenge);
  const clientDataHash = verifyClientData(cdj, {
    type: "webauthn.create",
    challenge,
    origin: over.origin ?? v.origin,
  });
  const o = decodeAttestationObject(b64(v.attestationObject));
  return verifyRegistration({
    rpId: over.rpId ?? v.rpId,
    clientDataHash,
    fmt: o.fmt,
    authDataRaw: over.authData ? over.authData(o.authDataRaw) : o.authDataRaw,
    stmt: o.stmt,
    credentialId: b64(v.credentialId),
    policy: { allowedAuthenticators: [], now: over.now ?? Date.parse(v.at) },
    ...(over.roots ? { roots: over.roots } : {}),
  });
}

describe("pinned vendor roots", () => {
  it("every pinned root matches its recorded fingerprint and is a CA", () => {
    for (const list of Object.values(PINNED_ATTESTATION_ROOTS)) {
      for (const r of list) {
        const cert = loadPinnedRoot(r);
        expect(cert, r.name).not.toBeNull();
        expect(createHash("sha256").update(cert!.raw).digest("hex")).toBe(r.sha256);
        expect(r.source).toMatch(/^https:\/\//);
      }
    }
    expect(pinnedRoots("tpm")).toHaveLength(1);
    expect(pinnedRoots("apple")).toHaveLength(1);
    expect(pinnedRoots("android-key")).toHaveLength(2);
  });

  it("a root whose PEM does not match its fingerprint is never trusted", () => {
    const r = PINNED_ATTESTATION_ROOTS.apple[0];
    expect(loadPinnedRoot({ ...r, sha256: "00".repeat(32) })).toBeNull();
    expect(loadPinnedRoot({ ...r, pem: PINNED_ATTESTATION_ROOTS.tpm[0].pem })).toBeNull();
  });
});

describe("real platform registrations against the pinned roots", () => {
  for (const [name, v] of Object.entries(PLATFORM_VECTORS)) {
    it(`${name} (${v.description}) verifies`, () => {
      const reg = verifyVector(v);
      expect(reg.attestation.fmt).toBe(v.fmt);
      expect(Buffer.from(reg.credentialId).toString("base64url")).toBe(
        Buffer.from(b64(v.credentialId)).toString("base64url"),
      );
    });

    it(`${name}: another vendor's roots, an expired chain, another RP or origin are refused`, () => {
      const wrong: VendorRoots = {
        tpm: pinnedRoots("apple"),
        apple: pinnedRoots("android-key"),
        "android-key": pinnedRoots("tpm"),
      };
      expect(code(() => verifyVector(v, { roots: wrong }))).toBe("attestation-invalid");
      expect(code(() => verifyVector(v, { now: Date.UTC(2046, 0, 1) }))).toBe(
        "attestation-invalid",
      );
      // In 2028 every vector's leaf certificate has expired while every pinned root is still valid.
      expect(code(() => verifyVector(v, { now: Date.UTC(2028, 0, 1) }))).toBe(
        "attestation-invalid",
      );
      expect(code(() => verifyVector(v, { rpId: "evil.example" }))).toBe("rp-mismatch");
      expect(code(() => verifyVector(v, { origin: "http://localhost:1" }))).toBe("origin-mismatch");
    });

    it(`${name}: any change to the authenticator data breaks the binding`, () => {
      // Flip a bit of the counter: flags stay valid, so only the attestation can catch it.
      expect(
        code(() =>
          verifyVector(v, {
            authData: (a) => {
              const c = Uint8Array.from(a);
              c[36] ^= 1;
              return c;
            },
          }),
        ),
      ).toBe("attestation-invalid");
    });
  }

  it("Windows Hello's TPM statements are signed with RS1 and still bind with SHA-256 names", () => {
    const reg = verifyVector(PLATFORM_VECTORS.TPM_SURFACE_PRO_4);
    expect(reg.attestation.alg).toBe(-65535);
    expect(reg.publicKey.alg).toBe(-257);
    expect(reg.attestation.certSubject).toMatch(/^TPM id:[0-9A-F]{8} /);
  });
});

const RP = "localhost";
const cdh = () => new Uint8Array(randomBytes(32));

function testRoots(pki: TestPki): VendorRoots {
  const c = new X509Certificate(pki.rootPem);
  return { tpm: [c], apple: [c], "android-key": [c] };
}

function verifyBuilt(
  built: {
    fmt: string;
    attestationObject: Uint8Array;
    clientDataHash: Uint8Array;
    credentialId: Uint8Array;
  },
  roots: VendorRoots,
  rpId = RP,
) {
  const o = decodeAttestationObject(built.attestationObject);
  return verifyRegistration({
    rpId,
    clientDataHash: built.clientDataHash,
    fmt: o.fmt,
    authDataRaw: o.authDataRaw,
    stmt: o.stmt,
    credentialId: built.credentialId,
    policy: { allowedAuthenticators: [] },
    roots,
  });
}

describe("platform statements built under test roots", () => {
  const pki = newTestPki("ec");
  const roots = testRoots(pki);
  const other = testRoots(newTestPki("ec"));

  const builders = {
    tpm: (brk?: TpmBreak, flags?: number) =>
      buildTpmRegistration({ pki, rpId: RP, clientDataHash: cdh(), brk, flags }),
    apple: (brk?: AppleBreak, flags?: number) =>
      buildAppleRegistration({ pki, rpId: RP, clientDataHash: cdh(), brk, flags }),
    "android-key": (brk?: AndroidBreak, flags?: number) =>
      buildAndroidKeyRegistration({ pki, rpId: RP, clientDataHash: cdh(), brk, flags }),
  };

  for (const [fmt, build] of Object.entries(builders)) {
    it(`${fmt}: a well-formed statement verifies; a foreign root, BE, missing UV or UP is refused`, () => {
      expect(verifyBuilt(build(), roots).attestation.fmt).toBe(fmt);
      expect(code(() => verifyBuilt(build(), other))).toBe("attestation-invalid");
      expect(code(() => verifyBuilt(build(undefined, FLAGS.UP | FLAGS.UV | FLAGS.BE), roots))).toBe(
        "backup-eligible",
      );
      expect(
        code(() => verifyBuilt(build(undefined, FLAGS.UP | FLAGS.UV | FLAGS.BE | FLAGS.BS), roots)),
      ).toBe("backup-eligible");
      expect(code(() => verifyBuilt(build(undefined, FLAGS.UP), roots))).toBe(
        "no-user-verification",
      );
      expect(code(() => verifyBuilt(build(undefined, FLAGS.UV), roots))).toBe("no-user-presence");
      expect(code(() => verifyBuilt(build(), roots, "enclawed.local"))).toBe("rp-mismatch");
    });
  }

  const tpmBreaks: TpmBreak[] = [
    "extra-data",
    "attested-name",
    "not-fixed-tpm",
    "pubarea-other-key",
    "magic",
    "no-eku",
    "subject-not-empty",
    "no-san",
    "aik-signature",
    "aaguid-ext-mismatch",
  ];
  for (const brk of tpmBreaks) {
    it(`tpm: ${brk} is refused`, () => {
      expect(code(() => verifyBuilt(builders.tpm(brk), roots))).toBe("attestation-invalid");
    });
  }

  const appleBreaks: AppleBreak[] = ["nonce", "no-nonce", "other-key"];
  for (const brk of appleBreaks) {
    it(`apple: ${brk} is refused`, () => {
      expect(code(() => verifyBuilt(builders.apple(brk), roots))).toBe("attestation-invalid");
    });
  }

  const androidBreaks: AndroidBreak[] = [
    "challenge",
    "software",
    "all-applications",
    "imported",
    "no-sign-purpose",
    "unlocked",
    "unverified-boot",
    "signature",
  ];
  for (const brk of androidBreaks) {
    it(`android-key: ${brk} is refused`, () => {
      expect(code(() => verifyBuilt(builders["android-key"](brk), roots))).toBe(
        "attestation-invalid",
      );
    });
  }

  it("a model not on a non-empty allowlist is refused; a listed one is accepted", () => {
    const built = builders.tpm();
    const o = decodeAttestationObject(built.attestationObject);
    const base = {
      rpId: RP,
      clientDataHash: built.clientDataHash,
      fmt: o.fmt,
      authDataRaw: o.authDataRaw,
      stmt: o.stmt,
      roots,
    };
    expect(
      code(() =>
        verifyRegistration({
          ...base,
          policy: {
            allowedAuthenticators: [
              { aaguid: "11111111-2222-3333-4444-555555555555", attestationCas: [] },
            ],
          },
        }),
      ),
    ).toBe("attestation-not-allowed");
    const ok = verifyRegistration({
      ...base,
      policy: {
        allowedAuthenticators: [
          {
            aaguid: "08987058-cadc-4b81-b6e1-30de50dcbe96",
            description: "Windows Hello",
            attestationCas: [],
          },
        ],
      },
    });
    expect(ok.attestation.allowedAs).toBe("Windows Hello");
  });

  it("a zero AAGUID is refused", () => {
    const built = buildTpmRegistration({
      pki,
      rpId: RP,
      clientDataHash: cdh(),
      aaguid: "00000000-0000-0000-0000-000000000000",
    });
    expect(code(() => verifyBuilt(built, roots))).toBe("zero-aaguid");
  });

  it('the "none" format and an unknown format are refused', () => {
    const built = builders.apple();
    const o = decodeAttestationObject(built.attestationObject);
    for (const [fmt, want] of [
      ["none", "attestation-missing"],
      ["android-safetynet", "attestation-format"],
    ] as const) {
      expect(
        code(() =>
          verifyRegistration({
            rpId: RP,
            clientDataHash: built.clientDataHash,
            fmt,
            authDataRaw: o.authDataRaw,
            stmt: o.stmt,
            policy: { allowedAuthenticators: [] },
            roots,
          }),
        ),
      ).toBe(want);
    }
  });
});

describe("RS256 credential assertions keep every assertion rule", () => {
  const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const cose = coseOf(key.publicKey);
  const assert = (signCount: number, stored: number, flags = FLAGS.UP | FLAGS.UV) => {
    const raw = authData({ rpId: RP, flags, signCount });
    const hash = cdh();
    const sig = cryptoSign("sha256", Buffer.concat([raw, hash]), key.privateKey);
    return () =>
      verifyAssertion({
        rpId: RP,
        clientDataHash: hash,
        authDataRaw: raw,
        signature: sig,
        credentialPublicKey: cose,
        storedSignCount: stored,
      });
  };

  it("a strictly increasing counter is accepted; equal, lower and never-counting are refused", () => {
    expect(assert(5, 4)().signCount).toBe(5);
    expect(code(assert(4, 4))).toBe("counter-regressed");
    expect(code(assert(3, 4))).toBe("counter-regressed");
    expect(code(assert(0, 0))).toBe("counter-unsupported");
    expect(code(assert(5, 4, FLAGS.UP))).toBe("no-user-verification");
    expect(code(assert(5, 4, FLAGS.UP | FLAGS.UV | FLAGS.BE))).toBe("backup-eligible");
  });

  it("an RSA key under 2048 bits is refused", () => {
    const small = generateKeyPairSync("rsa", { modulusLength: 1024 });
    expect(
      code(() =>
        verifyAssertion({
          rpId: RP,
          clientDataHash: cdh(),
          authDataRaw: authData({ rpId: RP, flags: FLAGS.UP | FLAGS.UV, signCount: 2 }),
          signature: new Uint8Array(128),
          credentialPublicKey: coseOf(small.publicKey),
          storedSignCount: 1,
        }),
      ),
    ).toBe("bad-public-key");
  });
});

describe("the TPM counter exemption", () => {
  const pki = newTestPki("ec");
  const roots = testRoots(pki);
  const at = Date.now();

  function enrolled(
    build: () => {
      attestationObject: Uint8Array;
      clientDataHash: Uint8Array;
      credentialId: Uint8Array;
    },
  ) {
    const b = build();
    const o = decodeAttestationObject(b.attestationObject);
    const reg = verifyRegistration({
      rpId: RP,
      clientDataHash: b.clientDataHash,
      fmt: o.fmt,
      authDataRaw: o.authDataRaw,
      stmt: o.stmt,
      credentialId: b.credentialId,
      policy: { allowedAuthenticators: [] },
      roots,
    });
    return {
      reg,
      evidence: {
        attestationObject: Buffer.from(b.attestationObject).toString("base64url"),
        clientDataHash: Buffer.from(b.clientDataHash).toString("base64url"),
      },
    };
  }

  const holds = (
    reg: { credentialId: Uint8Array; publicKey: { cose: Uint8Array } },
    evidence?: { attestationObject: string; clientDataHash: string },
  ) =>
    tpmCounterExemptionHolds({
      rpId: RP,
      credentialId: reg.credentialId,
      publicKeyCose: reg.publicKey.cose,
      evidence,
      enrolledAt: at,
      roots,
    });

  it("holds only for the credential its verified TPM statement proves", () => {
    const tpm = buildTpmRegistration({ pki, rpId: RP, clientDataHash: cdh() });
    const { reg, evidence } = enrolled(() => tpm);
    expect(holds(reg, evidence)).toBe(true);
    // No statement, another TPM credential's statement, a non-TPM statement, or another root.
    expect(holds(reg, undefined)).toBe(false);
    // The same credential id and statement, but a stored key swapped for one the TPM never held.
    const swapped = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(
      holds(
        { credentialId: reg.credentialId, publicKey: { cose: coseOf(swapped.publicKey) } },
        evidence,
      ),
    ).toBe(false);
    const other = enrolled(() => buildTpmRegistration({ pki, rpId: RP, clientDataHash: cdh() }));
    expect(holds(reg, other.evidence)).toBe(false);
    const apple = enrolled(() => buildAppleRegistration({ pki, rpId: RP, clientDataHash: cdh() }));
    expect(holds(apple.reg, apple.evidence)).toBe(false);
    expect(
      tpmCounterExemptionHolds({
        rpId: RP,
        credentialId: reg.credentialId,
        publicKeyCose: reg.publicKey.cose,
        evidence,
        enrolledAt: at,
        roots: testRoots(newTestPki("ec")),
      }),
    ).toBe(false);
    // A statement whose key lacks fixedTPM never verifies, so it cannot back the exemption.
    expect(() =>
      enrolled(() =>
        buildTpmRegistration({ pki, rpId: RP, clientDataHash: cdh(), brk: "not-fixed-tpm" }),
      ),
    ).toThrow();
  });

  it("a TPM key may keep its counter at 0; once it counts, it must strictly increase; nothing else is exempt", () => {
    const tpm = buildTpmRegistration({ pki, rpId: RP, clientDataHash: cdh() });
    const { reg, evidence } = enrolled(() => tpm);
    expect(holds(reg, evidence)).toBe(true);
    const assertWith = (
      key: KeyObject,
      cose: Uint8Array,
      signCount: number,
      stored: number,
      counterPolicy?: "strict" | "tpm-non-exportable",
    ) => {
      const raw = authData({ rpId: RP, flags: FLAGS.UP | FLAGS.UV, signCount });
      const hash = cdh();
      const sig = cryptoSign("sha256", Buffer.concat([raw, hash]), key);
      return () =>
        verifyAssertion({
          rpId: RP,
          clientDataHash: hash,
          authDataRaw: raw,
          signature: sig,
          credentialPublicKey: cose,
          storedSignCount: stored,
          counterPolicy,
        });
    };
    const k = tpm.credentialKey;
    const cose = reg.publicKey.cose;
    for (let i = 0; i < 3; i++) {
      expect(assertWith(k, cose, 0, 0, "tpm-non-exportable")().signCount).toBe(0);
    }
    expect(assertWith(k, cose, 3, 0, "tpm-non-exportable")().signCount).toBe(3);
    expect(code(assertWith(k, cose, 3, 3, "tpm-non-exportable"))).toBe("counter-regressed");
    expect(code(assertWith(k, cose, 0, 3, "tpm-non-exportable"))).toBe("counter-regressed");
    expect(code(assertWith(k, cose, 2, 3, "tpm-non-exportable"))).toBe("counter-regressed");
    // The same key without the exemption, and every other kind of credential, keeps the strict rule.
    expect(code(assertWith(k, cose, 0, 0))).toBe("counter-unsupported");
    expect(code(assertWith(k, cose, 0, 0, "strict"))).toBe("counter-unsupported");
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
    expect(code(assertWith(ec.privateKey, coseOf(ec.publicKey), 4, 4))).toBe("counter-regressed");
  });
});
