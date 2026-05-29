import { describe, expect, test } from "vitest";

import { LEVEL, makeLabel } from "./classification.js";
import { SkillLoadError, verifySkill } from "./skill-loader.js";
import { VERIFICATION } from "./skill-manifest.js";
import type { TrustedSigner } from "./trust-root.js";
import { buildSignedSkill } from "./skill-test-utils.js";

function userTopSecret() {
  return makeLabel({ level: LEVEL.TOP_SECRET });
}

function resolverFor(...signers: TrustedSigner[]) {
  return (keyId: string): TrustedSigner | undefined =>
    signers.find((s) => s.keyId === keyId);
}

describe("skill-loader", () => {
  test("happy path admits a signed declared skill", () => {
    const b = buildSignedSkill({
      id: "skill-a",
      caps: ["fs.read", "publish"],
      verification: VERIFICATION.DECLARED,
    });
    const loaded = verifySkill({
      manifestJson: b.manifestJson,
      content: b.content,
      signature: b.signature,
      userClearance: userTopSecret(),
      resolveSigner: resolverFor(b.signer),
    });
    expect(loaded.manifest.id).toBe("skill-a");
    expect(loaded.manifest.verification).toBe(VERIFICATION.DECLARED);
    expect(loaded.signerKeyId).toBe(b.signer.keyId);
  });

  test("rejects unknown signer", () => {
    const b = buildSignedSkill({ id: "x", caps: [] });
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: b.signature,
        userClearance: userTopSecret(),
        resolveSigner: () => undefined,
      }),
    ).toThrow(SkillLoadError);
  });

  test("rejects bad signature (forgery)", () => {
    const b = buildSignedSkill({ id: "x", caps: ["fs.read"] });
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: "AAAA" + b.signature.slice(4),
        userClearance: userTopSecret(),
        resolveSigner: resolverFor(b.signer),
      }),
    ).toThrow(/signature did not verify/);
  });

  test("rejects content tampering after signing", () => {
    const b = buildSignedSkill({ id: "x", caps: ["fs.read"], content: "original" });
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: "tampered",
        signature: b.signature,
        userClearance: userTopSecret(),
        resolveSigner: resolverFor(b.signer),
      }),
    ).toThrow(/signature did not verify/);
  });

  test("rejects label above signer authorized clearance", () => {
    const b = buildSignedSkill({
      id: "x",
      caps: [],
      level: LEVEL.TOP_SECRET,
      approvedClearance: ["public", "internal"],
    });
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: b.signature,
        userClearance: userTopSecret(),
        resolveSigner: resolverFor(b.signer),
      }),
    ).toThrow(/signer .* not approved/);
  });

  test("rejects label above user clearance", () => {
    const b = buildSignedSkill({ id: "x", caps: [], level: LEVEL.TOP_SECRET });
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: b.signature,
        userClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
        resolveSigner: resolverFor(b.signer),
      }),
    ).toThrow(/user clearance does not dominate/);
  });

  test("rejects manifest verification level above signer authority", () => {
    const b = buildSignedSkill({
      id: "x",
      caps: [],
      verification: VERIFICATION.TESTED,
    });
    // default signer authority caps at "declared".
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: b.signature,
        userClearance: userTopSecret(),
        resolveSigner: resolverFor(b.signer),
      }),
    ).toThrow(/not authorized for verification/);
  });

  test("admits tested skill when signer has explicit authority", () => {
    const b = buildSignedSkill({
      id: "x",
      caps: ["fs.read"],
      verification: VERIFICATION.TESTED,
    });
    const loaded = verifySkill({
      manifestJson: b.manifestJson,
      content: b.content,
      signature: b.signature,
      userClearance: userTopSecret(),
      resolveSigner: resolverFor(b.signer),
      signerVerificationAuthority: () => VERIFICATION.TESTED,
    });
    expect(loaded.manifest.verification).toBe(VERIFICATION.TESTED);
  });
});
