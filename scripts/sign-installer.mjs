#!/usr/bin/env node
// Re-sign the install scripts.
//
//   node scripts/sign-installer.mjs
//
// First run generates an Ed25519 keypair under ~/.enclawed/keys/
// (chmod 600) and emits the raw 32-byte base64 public key on stdout
// for embedding in the bootstrap scripts. Subsequent runs reuse the
// existing private key and just re-emit the .bin artifacts.
//
// What it produces, per install script:
//   1. s1 = SHA256(install_script_bytes)
//   2. s2 = SHA256(hex(s1) || canonical_install_url)
//   3. artifact = s2 || Ed25519_sign(s2)         (96 bytes)
//
// Output paths:
//   enclawed-apps/static/build/runtime-a.bin   (bash bootstrap)
//   enclawed-apps/static/build/runtime-b.bin   (powershell bootstrap)
//
// After running, copy the two .bin files to enclawed-enclaved/
// website/static/build/ so the website is the independent trust path.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
} from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const keyDir = join(homedir(), ".enclawed", "keys");
const privPath = join(keyDir, "installer-signing.key.pem");
const pubPath = join(repoRoot, "enclawed-apps", ".trust", "pub.b64");

// Canonical install URLs the bootstrap scripts are bound to. These
// must match _BLD_REF / $bldRef inside the scripts byte-for-byte:
// the two-stage SHA chain hashes (sha256(script_bytes) || URL), so a
// drift between the script's embedded URL and the URL the signer
// signed against will fail every integrity check.
const BUNDLES = [
  {
    label: "bash",
    scriptPath: join(repoRoot, "enclawed-apps", "install.sh"),
    installUrl: "https://www.enclawed.com/enclawed-apps/install.sh",
    outPath: join(repoRoot, "enclawed-apps", "static", "build", "runtime-a.bin"),
  },
  {
    label: "powershell",
    scriptPath: join(repoRoot, "enclawed-apps", "install.ps1"),
    installUrl: "https://www.enclawed.com/enclawed-apps/install.ps1",
    outPath: join(repoRoot, "enclawed-apps", "static", "build", "runtime-b.bin"),
  },
];

mkdirSync(keyDir, { recursive: true });
mkdirSync(dirname(pubPath), { recursive: true });

let privateKey;
let publicKeyRawBase64;
if (!existsSync(privPath)) {
  console.log(`Generating new Ed25519 signing keypair at ${privPath}`);
  const { publicKey: pub, privateKey: priv } = generateKeyPairSync("ed25519");
  writeFileSync(privPath, priv.export({ format: "pem", type: "pkcs8" }), "utf8");
  chmodSync(privPath, 0o600);
  privateKey = priv;
  // The raw 32-byte public key lives at the tail of the SPKI DER.
  const spki = pub.export({ format: "der", type: "spki" });
  publicKeyRawBase64 = spki.subarray(spki.length - 32).toString("base64");
  writeFileSync(pubPath, publicKeyRawBase64 + "\n", "utf8");
  console.log(`Wrote public key (base64 raw, 32B) to ${pubPath}`);
} else {
  const pem = readFileSync(privPath, "utf8");
  privateKey = createPrivateKey({ key: pem, format: "pem" });
  if (existsSync(pubPath)) {
    publicKeyRawBase64 = readFileSync(pubPath, "utf8").trim();
  } else {
    const pub = createPublicKey(privateKey);
    const spki = pub.export({ format: "der", type: "spki" });
    publicKeyRawBase64 = spki.subarray(spki.length - 32).toString("base64");
    writeFileSync(pubPath, publicKeyRawBase64 + "\n", "utf8");
  }
}

console.log(`Public key (raw, base64): ${publicKeyRawBase64}`);
console.log("");
console.log("Embed this value as the _BLD_PUB / $bldPub constant in both");
console.log("install.sh and install.ps1, then re-run this script so the .bin");
console.log("artifacts cover the updated bootstrap bytes.");
console.log("");

function sha256(buf) {
  return createHash("sha256").update(buf).digest();
}

for (const b of BUNDLES) {
  const scriptBytes = readFileSync(b.scriptPath);
  const s1 = sha256(scriptBytes);
  const s1Hex = s1.toString("hex");
  const s2 = sha256(Buffer.concat([Buffer.from(s1Hex, "utf8"), Buffer.from(b.installUrl, "utf8")]));
  const sig = edSign(null, s2, privateKey);
  if (sig.length !== 64) {
    throw new Error(`unexpected Ed25519 signature length ${sig.length}`);
  }
  const artifact = Buffer.concat([s2, sig]);
  if (artifact.length !== 96) {
    throw new Error(`assembled artifact is ${artifact.length} bytes; expected 96`);
  }
  mkdirSync(dirname(b.outPath), { recursive: true });
  writeFileSync(b.outPath, artifact);
  console.log(
    `${b.label.padEnd(11)} s1=${s1Hex.slice(0, 16)}…  s2=${s2.toString("hex").slice(0, 16)}…  -> ${b.outPath}`,
  );
}

console.log("");
console.log("Copy the two .bin files to enclawed-enclaved/website/static/build/");
console.log("so the website acts as an independent trust path:");
for (const b of BUNDLES) {
  console.log(
    `  cp ${b.outPath.replace(repoRoot + "/", "")} <enclaved>/website/${b.outPath.split("/").slice(-3).join("/")}`,
  );
}
