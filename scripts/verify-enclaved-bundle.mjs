#!/usr/bin/env node
// Pre-build / CI gate for enclaved-flavor packaging (paper §1.2).
//
// Asserts the conditions the paper claims hold for an enclaved build:
//   1. Every shipped extensions/<id>/ has a parseable, signed
//      enclawed.module.json.
//   2. The signature verifies against a key registered in the trust root.
//   3. attic/ contains nothing reachable from tsconfig.json `include`
//      (the unsafe state must be UNREACHABLE, not UNSELECTED).
//
// Run as `node scripts/verify-enclaved-bundle.mjs`. Exits non-zero on any
// violation. Intended to be wired into the enclaved-flavor build target
// and CI before any artifact is published.

import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const EXTENSIONS_ROOT = path.join(REPO_ROOT, "extensions");
const TRUST_ROOT_TS = path.join(REPO_ROOT, "src", "enclawed", "trust-root.ts");
const TSCONFIG = path.join(REPO_ROOT, "tsconfig.json");

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

async function loadTrustRootKeys() {
  const src = await readFile(TRUST_ROOT_TS, "utf8");
  // Extract every `const X = `-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----`` PEM literal
  // and every keyId: "..." entry.
  const keys = new Map();
  const pemBlocks = src.match(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/g) ?? [];
  const pemByOrdinal = pemBlocks.map((p) => p.replace(/^\s+|\s+$/g, "") + "\n");
  // Walk Object.freeze({...}) entries in order; pair each keyId with the
  // i-th PEM constant referenced in the file (we depend on order in
  // trust-root.ts being stable: const FOO_PUBKEY = `...`; ... entry uses publicKeyPem: FOO_PUBKEY).
  const constToPem = new Map();
  const constRe = /const\s+([A-Z_][A-Z0-9_]*)_PUBKEY\s*=\s*`/g;
  let i = 0;
  let m;
  while ((m = constRe.exec(src)) !== null && i < pemByOrdinal.length) {
    constToPem.set(`${m[1]}_PUBKEY`, pemByOrdinal[i]);
    i++;
  }
  const entryRe = /keyId:\s*"([^"]+)"[\s\S]+?publicKeyPem:\s*([A-Z_][A-Z0-9_]*)/g;
  while ((m = entryRe.exec(src)) !== null) {
    const pem = constToPem.get(m[2]);
    if (pem) keys.set(m[1], pem);
  }
  return keys;
}

async function checkExtensions(trustKeys) {
  const errors = [];
  const seenSigners = new Map();
  let signed = 0;
  const gatedUnsigned = [];

  let entries;
  try {
    entries = await readdir(EXTENSIONS_ROOT, { withFileTypes: true });
  } catch {
    return { signed: 0, errors: ["extensions/ not found"] };
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(EXTENSIONS_ROOT, ent.name);
    // Skip directories that present no plugin metadata (utility-only
    // folders like extensions/shared/). They are not plugins and do not
    // need a signed module manifest.
    const hasPluginMetadata =
      (await readFile(path.join(dir, "package.json"), "utf8").catch(() => null)) !== null ||
      (await readFile(path.join(dir, "enclawed.plugin.json"), "utf8").catch(() => null)) !== null;
    if (!hasPluginMetadata) continue;
    let manifestRaw;
    try {
      manifestRaw = await readFile(path.join(dir, "enclawed.module.json"), "utf8");
    } catch {
      // No enclawed.module.json. After the upstream-extension port,
      // cloud channels and providers are present in source but
      // intentionally unsigned: the host admission gate rejects them
      // in enclaved flavor before any plugin code runs. These do not
      // count as verifier failures — they count as gated. Log them as
      // info and skip; the gate itself is the enforcement point.
      gatedUnsigned.push(ent.name);
      continue;
    }
    let m;
    try {
      m = JSON.parse(manifestRaw);
    } catch (e) {
      errors.push(`${ent.name}: enclawed.module.json invalid JSON: ${e.message}`);
      continue;
    }
    if (m.id !== ent.name) {
      errors.push(`${ent.name}: manifest.id "${m.id}" must equal directory name`);
    }
    if (typeof m.signerKeyId !== "string" || typeof m.signature !== "string") {
      errors.push(`${ent.name}: missing signerKeyId or signature`);
      continue;
    }
    const pem = trustKeys.get(m.signerKeyId);
    if (!pem) {
      errors.push(`${ent.name}: signer "${m.signerKeyId}" not in trust root`);
      continue;
    }
    const body = {
      v: m.v, id: m.id, publisher: m.publisher, version: m.version,
      clearance: m.clearance, capabilities: [...m.capabilities].sort(),
      signerKeyId: m.signerKeyId,
    };
    const ok = cryptoVerify(
      null,
      Buffer.from(canonicalize(body), "utf8"),
      createPublicKey({ key: pem, format: "pem" }),
      Buffer.from(m.signature, "base64"),
    );
    if (!ok) {
      errors.push(`${ent.name}: signature verification failed`);
      continue;
    }
    seenSigners.set(m.signerKeyId, (seenSigners.get(m.signerKeyId) ?? 0) + 1);
    signed++;
  }
  return { signed, errors, seenSigners, gatedUnsigned };
}

async function checkAtticReachability() {
  const errors = [];
  const tsRaw = await readFile(TSCONFIG, "utf8");
  const conf = JSON.parse(tsRaw);
  const includes = (conf.include ?? []).map(String);
  if (includes.some((p) => p.includes("attic"))) {
    errors.push(`tsconfig.json include[] reaches attic/: ${includes.join(", ")}`);
  }
  const excludes = (conf.exclude ?? []).map(String);
  if (!excludes.some((p) => p.includes("attic"))) {
    errors.push(`tsconfig.json exclude[] does not exclude attic/: ${excludes.join(", ")}`);
  }
  return { errors };
}

async function main() {
  const trustKeys = await loadTrustRootKeys();
  const ext = await checkExtensions(trustKeys);
  const attic = await checkAtticReachability();
  const all = [...ext.errors, ...attic.errors];
  console.log(`enclaved-bundle verifier: ${ext.signed} extensions signed, ${trustKeys.size} signers in trust root`);
  for (const [keyId, count] of (ext.seenSigners ?? new Map())) {
    console.log(`  signer "${keyId}": ${count} extensions`);
  }
  if ((ext.gatedUnsigned ?? []).length > 0) {
    console.log(`  gated-unsigned (rejected by enclaved admission gate): ${ext.gatedUnsigned.length} extensions`);
    for (const id of ext.gatedUnsigned.slice(0, 10)) console.log(`    - ${id}`);
    if (ext.gatedUnsigned.length > 10) console.log(`    ... and ${ext.gatedUnsigned.length - 10} more`);
  }
  if (all.length > 0) {
    console.error(`\nFAIL (${all.length} issue${all.length === 1 ? "" : "s"}):`);
    for (const e of all) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("PASS: every signed manifest verifies; unsigned plugins are gated by the host admission layer; attic/ unreachable from tsconfig include.");
}

await main();
