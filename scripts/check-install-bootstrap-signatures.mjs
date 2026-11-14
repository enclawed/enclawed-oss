#!/usr/bin/env node
// Guard: the enclawed-apps install bootstraps must match the signature
// artifacts we publish alongside them.
//
// install.sh / install.ps1 re-fetch themselves from www.enclawed.com and
// abort the install outright when the served bytes do not hash to the
// signed value. Editing a bootstrap without re-signing therefore breaks
// every install on that platform, and the only symptom is a tampering
// warning pointed at the user. Run this before publishing the website;
// `pnpm sign:install-bootstraps --key <path>` produces the fix.
//
// Checks, per bootstrap:
//   - every published copy of the script is byte-identical
//   - every published copy of the artifact is byte-identical
//   - the artifact is 96 bytes and its stage-2 hash matches the script
//   - the embedded Ed25519 signature verifies against the trust root
//   - the trust root embedded in the script matches .trust/pub.b64
//
// With --remote, also fetch the canonical URLs and check that what the
// site actually serves matches the tree.

import { verify as edVerify } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import {
  REPO_ROOT,
  computeStageTwo,
  loadBootstrapTargets,
  publicKeyFromBase64,
  readTrustedPublicKeyB64,
} from "./lib/install-bootstrap-trust.mjs";

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    remote: { type: "boolean", default: false },
    tree: { type: "string" },
  },
});

// These files live in both trees that carry enclawed-apps/; --tree
// points the check at whichever one is not the working directory.
const repoRoot = values.tree ? path.resolve(values.tree) : REPO_ROOT;

const failures = [];
const fail = (message) => failures.push(message);

function readCopies(relativePaths, label) {
  const copies = [];
  for (const relativePath of relativePaths) {
    const absolute = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolute)) {
      fail(`${label}: missing published copy ${relativePath}`);
      continue;
    }
    copies.push({ relativePath, bytes: fs.readFileSync(absolute) });
  }
  for (const copy of copies.slice(1)) {
    if (!copy.bytes.equals(copies[0].bytes)) {
      fail(
        `${label}: ${copy.relativePath} differs from ${copies[0].relativePath}; the published copies must be byte-identical`,
      );
    }
  }
  return copies[0]?.bytes;
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

const trustedPublicKeyB64 = readTrustedPublicKeyB64(repoRoot);

for (const target of loadBootstrapTargets(repoRoot)) {
  const { name, url, publicKeyB64, scriptCopies, artifactCopies } = target;

  if (publicKeyB64 !== trustedPublicKeyB64) {
    fail(
      `${name}: embedded trust root ${publicKeyB64} does not match enclawed-apps/.trust/pub.b64 (${trustedPublicKeyB64}); the bootstrap would verify against a different key than the checkout publishes`,
    );
  }

  const scriptBytes = readCopies(scriptCopies, name);
  const artifactBytes = readCopies(artifactCopies, `${name} artifact`);
  if (!scriptBytes || !artifactBytes) {
    continue;
  }

  if (artifactBytes.length !== 96) {
    fail(`${name}: artifact is ${artifactBytes.length} bytes; expected 96`);
    continue;
  }

  const signedStageTwo = artifactBytes.subarray(0, 32);
  const actualStageTwo = computeStageTwo(scriptBytes, url);
  if (!actualStageTwo.equals(signedStageTwo)) {
    fail(
      `${name}: stage-2 hash mismatch — the artifact signs ${signedStageTwo.toString("hex")} but ${scriptCopies[0]} at ${url} hashes to ${actualStageTwo.toString("hex")}. The bootstrap changed without being re-signed; every install on this platform aborts with an integrity failure. Re-sign with: pnpm sign:install-bootstraps --key <path>`,
    );
  }

  let publicKey;
  try {
    publicKey = publicKeyFromBase64(trustedPublicKeyB64);
  } catch (error) {
    fail(`trust root: ${error.message}`);
    continue;
  }
  if (!edVerify(null, signedStageTwo, publicKey, artifactBytes.subarray(32, 96))) {
    fail(`${name}: artifact signature does not verify against the published trust root`);
  }

  if (!values.remote) {
    continue;
  }
  for (const [label, remoteUrl, expected] of [
    ["script", url, scriptBytes],
    ["artifact", target.artifactUrl, artifactBytes],
  ]) {
    try {
      const served = await fetchBytes(remoteUrl);
      if (!served.equals(expected)) {
        fail(
          `${name}: the ${label} served at ${remoteUrl} differs from the tree; the website deploy is stale`,
        );
      }
    } catch (error) {
      fail(`${name}: could not fetch ${remoteUrl} (${error.message})`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write("Install bootstrap signature check failed:\n\n");
  for (const failure of failures) {
    process.stderr.write(`  - ${failure}\n`);
  }
  process.stderr.write("\n");
  process.exit(1);
}

process.stdout.write(`Install bootstrap signatures are in sync (${repoRoot}).\n`);
