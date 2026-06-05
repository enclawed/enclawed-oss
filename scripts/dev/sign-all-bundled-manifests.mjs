#!/usr/bin/env node
// Bulk-generate enclawed.module.json for every shipped extension under
// extensions/. Each is signed with the same dev keypair created here.
// Output: a JSON file with the signer's public key (paste into trust-root.ts).
//
// In a real classified deployment the operator regenerates this with
// HSM-resident keys and overwrites the trust-root entry. For dev/CI the
// bundled signer is enough to make the host-level gate non-trivial.

import {
  createHash,
  generateKeyPairSync,
  sign as cryptoSign,
} from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const EXTENSIONS_ROOT = path.join(REPO_ROOT, "extensions");
const SIGNER_KEY_ID = "enclawed-bundled-dev-2026";
const SIGNER_OUT = path.join(REPO_ROOT, "scripts", "dev", "bundled-signer.json");
const TRUST_ROOT_TS = path.join(REPO_ROOT, "src", "enclawed", "trust-root.ts");
const TRUST_ROOT_MJS = path.join(REPO_ROOT, "enclawed", "src", "trust-root.mjs");

// All bundled extensions are signed — including cloud channels and cloud
// LLM providers. The §3.2 unreachability property still holds: an unsigned
// module is unreachable in the enclaved flavor, and signing is precisely the
// sanctioned act that grants reachability. Signing the vetted, ships-with-the-
// distro modules is an intentional trust decision; deny-by-default continues
// to gate any NON-bundled / third-party plugin (no trusted signature → rejected
// in enclaved), and runtime egress/DLP/classification controls enforce cloud
// safety at execution. The paper-conformance test (§3.2) asserts the new
// invariant accordingly. Empty by design — nothing is excluded from signing.
const UNSIGNED_BY_DESIGN = new Set([]);

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

// Enclawed capability vocabulary (matches src/enclawed/skill-capabilities.ts
// and enclawed/src/extension-admission.mjs). Only these tokens pass
// parseExtensionManifest; anything else is rejected as "unknown_capability".
const ENCLAWED_CAPS = {
  NET_EGRESS: "net.egress", FS_READ: "fs.read",
  FS_WRITE_REV: "fs.write.rev", FS_WRITE_IRREV: "fs.write.irrev",
  TOOL_INVOKE: "tool.invoke", SPAWN_PROC: "spawn.proc",
  PUBLISH: "publish", PAY: "pay", MUTATE_SCHEMA: "mutate.schema",
};

function deriveCapabilitiesFromPlugin(pkg, plugin) {
  const caps = new Set();
  if (Array.isArray(plugin?.providers) && plugin.providers.length > 0) caps.add(ENCLAWED_CAPS.TOOL_INVOKE);
  if (Array.isArray(plugin?.channels)  && plugin.channels.length  > 0) caps.add(ENCLAWED_CAPS.PUBLISH);
  if (Array.isArray(plugin?.tools)     && plugin.tools.length     > 0) caps.add(ENCLAWED_CAPS.TOOL_INVOKE);
  if (Array.isArray(plugin?.skills)    && plugin.skills.length    > 0) caps.add(ENCLAWED_CAPS.TOOL_INVOKE);
  if (typeof plugin?.runtime === "object") caps.add(ENCLAWED_CAPS.FS_READ);
  if (caps.size === 0) caps.add(ENCLAWED_CAPS.FS_READ);
  return [...caps].sort();
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (e) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

async function main() {
  // Generate the bundled signer once.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();

  const entries = await readdir(EXTENSIONS_ROOT, { withFileTypes: true });
  const written = [];
  const skipped = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (UNSIGNED_BY_DESIGN.has(ent.name)) {
      // Cloud channels and cloud LLM providers must remain unsigned in
      // the OSS tree (the load-time gate is what gates them in enclaved).
      // Skip silently; the paper-conformance test enforces this invariant.
      skipped.push(ent.name);
      continue;
    }
    const dir = path.join(EXTENSIONS_ROOT, ent.name);
    const pkgJson = await readJsonIfExists(path.join(dir, "package.json"));
    const enclawedPluginJson = await readJsonIfExists(path.join(dir, "enclawed.plugin.json"));
    // Only sign directories that present at least one form of plugin
    // metadata. Pure utility folders (no package.json, no plugin manifest)
    // are not plugins and don't need a signed module manifest.
    if (!pkgJson && !enclawedPluginJson) continue;

    const id = ent.name;
    const version = String(pkgJson?.version ?? "0.0.0");
    const publisher = "enclawed-bundled";
    const clearance = "internal";
    const capabilities = deriveCapabilitiesFromPlugin(pkgJson, enclawedPluginJson ?? {});

    // Net-capable extensions need an explicit netAllowedHosts list. Derive
    // a reasonable default per extension category; deploying organizations
    // would replace these with the exact hosts the extension talks to.
    const isPublish = capabilities.includes("publish");
    const isToolInvoke = capabilities.includes("tool.invoke");
    const declaresNet = capabilities.includes("net.egress");
    const netAllowedHosts = declaresNet
      ? (isPublish ? [`${id}.local`] : isToolInvoke ? [`${id}-api.local`] : [])
      : [];

    const manifestBody = {
      v: 1,
      id,
      publisher,
      version,
      clearance,
      capabilities: [...capabilities].sort(),
      signerKeyId: SIGNER_KEY_ID,
      verification: "tested",   // bundled extensions ship at verification=tested
      netAllowedHosts: [...netAllowedHosts].sort(),
    };
    // Canonical bytes MUST match canonicalExtensionManifestBytes() in
    // enclawed/src/extension-admission.mjs; that function commits v, id,
    // publisher, version, clearance, capabilities, signerKeyId,
    // verification, and netAllowedHosts. Anything missing here causes
    // admitExtension() to reject the signature as invalid.
    const canonicalBytes = Buffer.from(canonicalize(manifestBody), "utf8");
    const signature = cryptoSign(null, canonicalBytes, privateKey).toString("base64");

    const out = path.join(dir, "enclawed.module.json");
    await writeFile(
      out,
      JSON.stringify({ ...manifestBody, signature }, null, 2) + "\n",
    );
    written.push({
      id,
      path: path.relative(REPO_ROOT, out),
      capabilities,
      hash: createHash("sha256").update(canonicalBytes).digest("hex"),
    });
  }

  // Persist the signer pubkey + key id for trust-root.ts to consume.
  await writeFile(
    SIGNER_OUT,
    JSON.stringify(
      {
        keyId: SIGNER_KEY_ID,
        publicKeyPem: publicPem,
        approvedClearance: ["public", "internal"],
        description: "Bundled dev signer used for the shipped extension set. Replace with an HSM-anchored signer for any non-dev deployment.",
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );

  // Patch BUNDLED_DEV_PUBKEY in BOTH trust-root files so the runtime,
  // CI verifier, and per-extension signatures stay in sync. The TS twin
  // (src/enclawed/trust-root.ts) drives the bundled vitest tests; the
  // .mjs canonical (enclawed/src/trust-root.mjs) drives the canonical
  // .mjs suite + any CI step that imports module-loader.mjs to check
  // signatures.
  for (const target of [TRUST_ROOT_TS, TRUST_ROOT_MJS]) {
    let src;
    try {
      src = await readFile(target, "utf8");
    } catch {
      continue;
    }
    const patched = src.replace(
      /const BUNDLED_DEV_PUBKEY = `[\s\S]+?`;/,
      `const BUNDLED_DEV_PUBKEY = \`${publicPem.trim()}\n\`;`,
    );
    if (patched === src) {
      console.warn(`WARN: BUNDLED_DEV_PUBKEY not found in ${path.relative(REPO_ROOT, target)}; skipping`);
    } else {
      await writeFile(target, patched);
      console.log(`patched BUNDLED_DEV_PUBKEY in ${path.relative(REPO_ROOT, target)}`);
    }
  }

  console.log(`signed ${written.length} extensions`);
  for (const w of written) {
    console.log(`  ${w.id}  caps=[${w.capabilities.join(",")}]  hash=${w.hash.slice(0, 12)}...`);
  }
  if (skipped.length > 0) {
    console.log(`\nskipped ${skipped.length} unsigned-by-design extensions (cloud channels / cloud providers; gated by enclaved-flavor admission, not by deletion):`);
    for (const id of skipped.sort()) console.log(`  ${id}`);
  }
  console.log(`\nbundled signer pubkey written to ${path.relative(REPO_ROOT, SIGNER_OUT)}`);
  console.log("Bundled signer private key was generated in-memory and discarded; re-run to regenerate.");
}

await main();
