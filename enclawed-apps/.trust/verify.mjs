#!/usr/bin/env node
// Independent verifier invoked by the bootstrap scripts after Node lands.
//
// The bootstrap passes:
//   --script <path>   bytes of the install script (re-fetched from the
//                     canonical URL by the bootstrap so we hash what the
//                     CDN currently serves, not the locally-piped copy)
//   --url <string>    canonical install URL the script was fetched from
//   --sig <path>      96-byte artifact: 32B s2 || 64B Ed25519 signature
//   --pub <string>    base64 Ed25519 public key (embedded in the bootstrap
//                     so the trust root travels with the script the user
//                     read)
//
// Two-stage hash binding (matches the design Alfredo specified):
//   s1 = SHA256(script_bytes)
//   s2 = SHA256(hex(s1) || install_url)
// and the artifact carries:
//   bytes[0..32]  = expected_s2
//   bytes[32..96] = Ed25519_sign(expected_s2)
//
// Exit codes:
//   0  all checks passed
//   2  one or more checks failed; bootstrap MUST abort
//   64 invalid arguments

import { createHash, createPublicKey, verify as edVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    script: { type: "string" },
    url: { type: "string" },
    sig: { type: "string" },
    pub: { type: "string" },
  },
});

for (const k of ["script", "url", "sig", "pub"]) {
  if (!values[k]) {
    process.stderr.write(`verify: missing --${k}\n`);
    process.exit(64);
  }
}

let scriptBytes;
try {
  scriptBytes = readFileSync(values.script);
} catch (err) {
  process.stderr.write(`verify: cannot read script: ${err.message}\n`);
  process.exit(2);
}

let sigBytes;
try {
  sigBytes = readFileSync(values.sig);
} catch (err) {
  process.stderr.write(`verify: cannot read signature artifact: ${err.message}\n`);
  process.exit(2);
}
if (sigBytes.length !== 96) {
  process.stderr.write(`verify: signature artifact is ${sigBytes.length} bytes; expected 96\n`);
  process.exit(2);
}

const expectedS2 = sigBytes.subarray(0, 32);
const sigOnS2 = sigBytes.subarray(32, 96);

const s1 = createHash("sha256").update(scriptBytes).digest();
const s1Hex = s1.toString("hex");
const s2 = createHash("sha256")
  .update(Buffer.concat([Buffer.from(s1Hex, "utf8"), Buffer.from(values.url, "utf8")]))
  .digest();

if (!Buffer.from(s2).equals(expectedS2)) {
  process.stderr.write(
    "verify: stage-2 hash mismatch (script bytes or install URL differ from what was signed)\n",
  );
  process.exit(2);
}

// Reconstitute the Ed25519 public key from the base64 raw 32-byte form
// the bootstrap embeds, by wrapping it in the SPKI ASN.1 prefix that
// node:crypto's createPublicKey expects.
let pubKey;
try {
  const raw = Buffer.from(values.pub, "base64");
  if (raw.length !== 32) {
    throw new Error(`raw public key is ${raw.length} bytes; expected 32`);
  }
  // SPKI prefix for Ed25519 (RFC 8410): 12 bytes followed by the raw key
  const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
  const der = Buffer.concat([SPKI_PREFIX, raw]);
  pubKey = createPublicKey({ key: der, format: "der", type: "spki" });
} catch (err) {
  process.stderr.write(`verify: bad public key: ${err.message}\n`);
  process.exit(2);
}

const sigOk = edVerify(null, expectedS2, pubKey, sigOnS2);
if (!sigOk) {
  process.stderr.write("verify: Ed25519 signature did not verify against embedded public key\n");
  process.exit(2);
}

process.stdout.write("verify: ok\n");
process.exit(0);
