// Shared trust plumbing for the enclawed-apps install bootstraps.
//
// The bootstraps (install.sh / install.ps1) refuse to hand off to
// install.mjs unless the bytes the website currently serves hash to the
// value signed in the companion artifact under static/build/. The chain
// is the two-stage binding implemented by enclawed-apps/.trust/verify.mjs:
//
//   s1 = SHA256(script_bytes)
//   s2 = SHA256(hex(s1) || install_url)
//   artifact = s2 (32B) || Ed25519_sign(s2) (64B)
//
// Nothing in the tree regenerated those artifacts, so editing a bootstrap
// silently invalidated every install until someone re-signed by hand. This
// module is the single source of truth both the signer and the CI guard
// read, and it deliberately derives the URLs, artifact paths, and trust
// root from the constants embedded in the bootstraps themselves rather
// than from a hand-maintained table that can drift the same way.

import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const SITE_ORIGIN = "https://www.enclawed.com/";

// RFC 8410 ASN.1 wrappers around a bare 32-byte Ed25519 key.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/** Bootstraps to sign, keyed by the file the operator actually edits. */
const BOOTSTRAP_SOURCES = [
  { name: "install.sh", source: "enclawed-apps/install.sh", flavor: "sh" },
  { name: "install.ps1", source: "enclawed-apps/install.ps1", flavor: "ps1" },
];

const CONSTANT_PATTERNS = {
  sh: {
    url: /^_BLD_REF="([^"]+)"/mu,
    artifact: /^_BLD_BIN="([^"]+)"/mu,
    publicKey: /^_BLD_PUB="([^"]+)"/mu,
  },
  ps1: {
    url: /^\$bldRef\s*=\s*"([^"]+)"/mu,
    artifact: /^\$bldBin\s*=\s*"([^"]+)"/mu,
    publicKey: /^\$bldPub\s*=\s*"([^"]+)"/mu,
  },
};

function extractConstant(text, pattern, label, source) {
  const match = pattern.exec(text);
  if (!match) {
    throw new Error(`${source}: could not find the ${label} constant`);
  }
  return match[1];
}

/**
 * These files live in two trees, both on the live install path:
 *
 *   enclaved  the enclawed-enclaved tree — `website/` is the deployed
 *             site, and `enclawed-apps/` is the copy the mirror is cut from
 *   oss       the enclawed/enclawed-oss checkout the bootstrap clones to
 *             ~/.enclawed/enclawed-oss and runs verify.mjs from
 *
 * Detect which one we are pointed at rather than guessing per file, so a
 * tree is never reported as missing a copy it is not supposed to have.
 */
export function detectTreeLayout(repoRoot) {
  return fs.existsSync(path.join(repoRoot, "website")) ? "enclaved" : "oss";
}

/** Map a canonical www.enclawed.com URL onto this tree's copies of it. */
function repoCopiesFor(url, source, layout) {
  if (!url.startsWith(SITE_ORIGIN)) {
    throw new Error(`${source}: expected a ${SITE_ORIGIN} URL, got ${url}`);
  }
  const suffix = url.slice(SITE_ORIGIN.length);
  const appsRelative = suffix.startsWith("enclawed-apps/") ? suffix : `enclawed-apps/${suffix}`;
  // The enclaved tree serves from website/ and mirrors from enclawed-apps/;
  // the OSS checkout only has the latter.
  return layout === "enclaved" ? [`website/${suffix}`, appsRelative] : [appsRelative];
}

/**
 * Every bootstrap, with its URL, trust root, and the files it binds.
 * `repoRoot` may be either tree; the layout is detected, not assumed.
 */
export function loadBootstrapTargets(repoRoot = REPO_ROOT) {
  const layout = detectTreeLayout(repoRoot);
  return BOOTSTRAP_SOURCES.map(({ name, source, flavor }) => {
    const text = fs.readFileSync(path.join(repoRoot, source), "utf8");
    const patterns = CONSTANT_PATTERNS[flavor];
    const url = extractConstant(text, patterns.url, "install URL", source);
    const artifactUrl = extractConstant(text, patterns.artifact, "artifact URL", source);
    const publicKeyB64 = extractConstant(text, patterns.publicKey, "public key", source);
    return {
      name,
      source,
      url,
      artifactUrl,
      publicKeyB64,
      layout,
      scriptCopies: repoCopiesFor(url, source, layout),
      artifactCopies: repoCopiesFor(artifactUrl, source, layout),
    };
  });
}

/** The trust root the installed checkout publishes. */
export function readTrustedPublicKeyB64(repoRoot = REPO_ROOT) {
  return fs.readFileSync(path.join(repoRoot, "enclawed-apps/.trust/pub.b64"), "utf8").trim();
}

/** s2 = SHA256(hex(SHA256(bytes)) || url) — the value the artifact carries. */
export function computeStageTwo(scriptBytes, url) {
  const s1Hex = createHash("sha256").update(scriptBytes).digest("hex");
  return createHash("sha256")
    .update(Buffer.concat([Buffer.from(s1Hex, "utf8"), Buffer.from(url, "utf8")]))
    .digest();
}

export function publicKeyFromBase64(b64) {
  const raw = Buffer.from(b64, "base64");
  if (raw.length !== 32) {
    throw new Error(`raw public key is ${raw.length} bytes; expected 32`);
  }
  return createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

/**
 * Accept the signing key in whichever shape the operator has it: a PKCS#8
 * PEM, or a bare 32-byte seed as raw bytes, base64, or hex.
 */
export function privateKeyFromFile(keyPath) {
  const bytes = fs.readFileSync(keyPath);
  const text = bytes.toString("utf8").trim();
  if (text.includes("-----BEGIN")) {
    return createPrivateKey({ key: text, format: "pem" });
  }
  const seed = decodeSeed(bytes, text);
  return createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

function decodeSeed(bytes, text) {
  if (bytes.length === 32) {
    return bytes;
  }
  if (/^[0-9a-f]{64}$/iu.test(text)) {
    return Buffer.from(text, "hex");
  }
  const b64 = Buffer.from(text, "base64");
  if (b64.length === 32) {
    return b64;
  }
  // A PKCS#8 DER seed file still carries the 16-byte prefix.
  if (bytes.length === 48 && bytes.subarray(0, 16).equals(PKCS8_PREFIX)) {
    return bytes.subarray(16);
  }
  throw new Error(
    "unrecognised key file: expected a PKCS#8 PEM, or a 32-byte Ed25519 seed as raw bytes, hex, or base64",
  );
}

export function publicKeyB64From(privateKey) {
  const der = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return Buffer.from(der.subarray(der.length - 32)).toString("base64");
}
