// Cross-implementation check: libfido2's own assertion verifier
// (`fido2-assert -V`, Yubico's reference implementation) and Enclawed's
// verifier must agree on the same bytes: genuine UP+UV assertions accepted,
// UV=0 and altered ones refused. `-V` only verifies; it never opens a device.
// Skipped when libfido2's tools are not installed.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FLAGS,
  authData,
  cborEncode,
  coseFor,
  newCredentialKey,
  signWith,
} from "./fixtures.test-support.js";
import { findTool } from "./libfido2.js";
import { WebAuthnError, verifyAssertion } from "./webauthn.js";

const tool = findTool("fido2-assert");

describe.skipIf(!tool)("libfido2 fido2-assert -V agrees with Enclawed's verifier", () => {
  const rpId = "enclawed.local";
  for (const alg of ["es256", "eddsa"] as const) {
    const key = newCredentialKey(alg);
    const pem = key.publicKey.export({ type: "spki", format: "pem" });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-fido2-x-"));
    const pemFile = path.join(dir, "pub.pem");
    fs.writeFileSync(pemFile, pem);
    const run = (flags: number, tamper: boolean) => {
      const cdh = createHash("sha256").update(`challenge-${alg}-${flags}-${tamper}`).digest();
      const raw = authData({ rpId, flags, signCount: 9 });
      const sig = signWith(key.privateKey, Buffer.concat([raw, cdh]));
      const sent = Buffer.from(raw);
      if (tamper) {
        sent[36] ^= 0x01;
      }
      const input = [
        cdh.toString("base64"),
        rpId,
        Buffer.from(cborEncode(sent)).toString("base64"),
        Buffer.from(sig).toString("base64"),
        "",
      ].join("\n");
      const lib =
        spawnSync(tool!, ["-V", "-p", "-v", pemFile, alg], { input, encoding: "utf8" }).status ===
        0;
      let ours = true;
      try {
        verifyAssertion({
          rpId,
          clientDataHash: cdh,
          authDataRaw: sent,
          signature: sig,
          credentialPublicKey: coseFor(key.publicKey),
          storedSignCount: 1,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(WebAuthnError);
        ours = false;
      }
      return { lib, ours };
    };
    it(`${alg}: both accept a genuine UP+UV assertion`, () => {
      expect(run(FLAGS.UP | FLAGS.UV, false)).toEqual({ lib: true, ours: true });
    });
    it(`${alg}: both refuse UV=0 and an altered assertion`, () => {
      expect(run(FLAGS.UP, false)).toEqual({ lib: false, ours: false });
      expect(run(FLAGS.UP | FLAGS.UV, true)).toEqual({ lib: false, ours: false });
    });
  }
});
