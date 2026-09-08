#!/usr/bin/env node
// Re-sign the enclawed-apps install bootstraps.
//
// Run this whenever install.sh or install.ps1 changes, before publishing
// the website. Without it the bootstraps keep pointing at an artifact that
// signs the previous bytes, and every install aborts with the tampering
// warning from enclawed-apps/.trust/verify.mjs.
//
//   pnpm sign:install-bootstraps --key <path to Ed25519 signing key>
//
// The key may be a PKCS#8 PEM or a bare 32-byte seed (raw, hex, or
// base64). The derived public key must match enclawed-apps/.trust/pub.b64
// and the key embedded in each bootstrap; anything else aborts without
// writing, so a wrong key cannot quietly re-root the trust chain.
//
// Pass --check to report what would change without writing.

import { sign as edSign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  REPO_ROOT,
  computeStageTwo,
  loadBootstrapTargets,
  privateKeyFromFile,
  publicKeyB64From,
  readTrustedPublicKeyB64,
} from "./lib/install-bootstrap-trust.mjs";

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    key: { type: "string" },
    check: { type: "boolean", default: false },
    tree: { type: "string" },
  },
});

// These files live in both trees that carry enclawed-apps/; --tree
// points the signer at whichever one is not the working directory.
const repoRoot = values.tree ? path.resolve(values.tree) : REPO_ROOT;

if (!values.key) {
  process.stderr.write("sign-install-bootstrap: missing --key <path>\n");
  process.exit(64);
}

let privateKey;
try {
  privateKey = privateKeyFromFile(values.key);
} catch (error) {
  process.stderr.write(`sign-install-bootstrap: cannot load signing key: ${error.message}\n`);
  process.exit(2);
}

const derivedPublicKeyB64 = publicKeyB64From(privateKey);
const targets = loadBootstrapTargets(repoRoot);
const trustedPublicKeyB64 = readTrustedPublicKeyB64(repoRoot);

if (derivedPublicKeyB64 !== trustedPublicKeyB64) {
  process.stderr.write(
    `sign-install-bootstrap: this key derives ${derivedPublicKeyB64}, but the published trust root is ${trustedPublicKeyB64}.\n` +
      "Signing with it would produce artifacts no installed checkout can verify. Aborting without writing.\n",
  );
  process.exit(2);
}
for (const target of targets) {
  if (target.publicKeyB64 !== trustedPublicKeyB64) {
    process.stderr.write(
      `sign-install-bootstrap: ${target.source} embeds trust root ${target.publicKeyB64}, which is not enclawed-apps/.trust/pub.b64. Fix the bootstrap before signing.\n`,
    );
    process.exit(2);
  }
}

let rewrote = 0;

for (const target of targets) {
  const scriptBytes = fs.readFileSync(path.join(repoRoot, target.source));

  // Every published copy of the script must carry the bytes we are about
  // to sign, or the signature only covers whichever copy the site serves.
  for (const relativePath of target.scriptCopies) {
    const absolute = path.join(repoRoot, relativePath);
    if (fs.existsSync(absolute) && fs.readFileSync(absolute).equals(scriptBytes)) {
      continue;
    }
    if (values.check) {
      process.stdout.write(`would sync ${relativePath} from ${target.source}\n`);
      continue;
    }
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, scriptBytes);
    process.stdout.write(`synced ${relativePath} from ${target.source}\n`);
  }

  const stageTwo = computeStageTwo(scriptBytes, target.url);
  const artifact = Buffer.concat([stageTwo, edSign(null, stageTwo, privateKey)]);

  for (const relativePath of target.artifactCopies) {
    const absolute = path.join(repoRoot, relativePath);
    const current = fs.existsSync(absolute) ? fs.readFileSync(absolute) : null;
    // Ed25519 is deterministic, so an unchanged bootstrap re-signs to the
    // identical 96 bytes and this stays a no-op.
    if (current?.equals(artifact)) {
      continue;
    }
    if (values.check) {
      process.stdout.write(`would re-sign ${relativePath} (${target.name})\n`);
      rewrote += 1;
      continue;
    }
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, artifact);
    process.stdout.write(`re-signed ${relativePath} (${target.name})\n`);
    rewrote += 1;
  }

  process.stdout.write(`  ${target.name}: s2=${stageTwo.toString("hex")} url=${target.url}\n`);
}

if (rewrote === 0) {
  process.stdout.write("Install bootstrap signatures were already current.\n");
} else if (values.check) {
  process.stdout.write("\nRun without --check to write the artifacts.\n");
  process.exit(1);
} else {
  process.stdout.write(
    "\nSignatures written. Publish website/ so the site serves these bytes, then confirm with:\n" +
      "  node scripts/check-install-bootstrap-signatures.mjs --remote\n",
  );
}
