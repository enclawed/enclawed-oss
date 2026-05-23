#!/usr/bin/env node
// scripts/skills-formal-verify.mjs
//
// CLI for the formal-verification methods of the skills follow-up
// paper (papers/skills-formal-arxiv/paper.tex). Walks a skill
// directory, runs Methods A / B / C, optionally signs the resulting
// proof-carrying bundle with an Ed25519 key, writes the bundle to
// disk, and reports the joint verdict.
//
// Usage:
//   node scripts/skills-formal-verify.mjs <skill-dir> [options]
//
// Options:
//   --manifest <path>      Path to the skill's manifest JSON. If
//                          omitted, looks for <skill-dir>/skill.json
//                          or reads YAML front-matter from
//                          <skill-dir>/SKILL.md (caps key).
//   --out <bundle-dir>     Write the bundle to <bundle-dir>/
//                          (creates the directory). Without --out,
//                          the verdict is printed to stdout but no
//                          files are written.
//   --bound <K>            BMC bound for Method C. Default 8.
//   --gen-key              Mint an ephemeral Ed25519 keypair, sign
//                          the attestation, print the public key to
//                          stderr. Mutually exclusive with --key.
//   --key <pem-path>       Path to an Ed25519 private-key PEM. Sign
//                          the attestation with it.
//   --signer-key-id <id>   keyId for the attestation. Defaults to
//                          'skill-formal-dev-2026' when --gen-key is
//                          set.
//   --verify <bundle-dir>  Skip producing; instead read an existing
//                          bundle from <bundle-dir>/ and re-check it
//                          against the skill at <skill-dir>.
//
// Exit codes:
//   0 — bundle produced (or verified) and contained=true
//   1 — usage error / I/O error
//   2 — method failed; bundle.contained=false (still written when
//       --out is set, so operators can inspect)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { generateEd25519KeyPair } from '../enclawed/src/module-signing.mjs';
import {
  produceFormalBundle, writeFormalBundle, readFormalBundle, verifyFormalBundle,
} from '../enclawed/src/skill-formal-bundle.mjs';

function die(msg, code = 1) {
  process.stderr.write(`skills-formal-verify: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const need = () => { i += 1; if (i >= argv.length) die(`${a} expects a value`); return argv[i]; };
    switch (a) {
      case '--manifest':       out.manifestPath  = need(); break;
      case '--out':            out.outDir        = need(); break;
      case '--bound':          out.bound         = parseInt(need(), 10); break;
      case '--gen-key':        out.genKey        = true; break;
      case '--key':            out.keyPath       = need(); break;
      case '--signer-key-id':  out.signerKeyId   = need(); break;
      case '--verify':         out.verifyDir     = need(); break;
      case '--help': case '-h':
        process.stdout.write(getHelp());
        process.exit(0);
        break;
      default:
        if (a.startsWith('-')) die(`unknown flag: ${a}`);
        positional.push(a);
    }
  }
  if (positional.length !== 1) die('exactly one positional <skill-dir> argument required');
  out.skillDir = positional[0];
  return out;
}

function getHelp() {
  return `Usage: skills-formal-verify <skill-dir> [options]
  --manifest <path>      Path to the skill manifest JSON.
  --out <bundle-dir>     Write the bundle to <bundle-dir>/.
  --bound <K>            BMC bound for Method C. Default 8.
  --gen-key              Mint ephemeral Ed25519 keypair (printed to stderr).
  --key <pem-path>       Sign with the Ed25519 private key at this path.
  --signer-key-id <id>   keyId for the attestation. Default 'skill-formal-dev-2026'.
  --verify <bundle-dir>  Re-check an existing bundle against <skill-dir>.
`;
}

// Resolve the skill manifest from either an explicit --manifest path,
// a colocated skill.json, or YAML front-matter in SKILL.md. The result
// is a plain JS object with at least { id, version, caps }.
function resolveManifest(skillDir, manifestPath) {
  if (manifestPath) {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  }
  const sj = path.join(skillDir, 'skill.json');
  try {
    return JSON.parse(readFileSync(sj, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  // Fall back to SKILL.md front-matter `caps:` key. Prefer JSON-style
  // arrays; fall back to YAML-style flow lists.
  const md = path.join(skillDir, 'SKILL.md');
  let body;
  try {
    body = readFileSync(md, 'utf8');
  } catch {
    die(`no manifest: pass --manifest or add skill.json / SKILL.md to ${skillDir}`);
  }
  const fm = body.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) {
    die(`SKILL.md at ${md} has no YAML front-matter; pass --manifest`);
  }
  const front = fm[1];
  const idMatch = front.match(/^name:\s*(.+)$/m) || front.match(/^id:\s*(.+)$/m);
  const versionMatch = front.match(/^version:\s*(\d+)/m);
  const capsMatch =
    front.match(/^caps:\s*(\[[^\]]+\])/m) ||
    front.match(/^caps:\s*\n((?:[ \t]+-\s*['"]?[^'"\n]+['"]?\s*\n)+)/m);
  if (!capsMatch) {
    die(`SKILL.md at ${md} has no \`caps:\` field; pass --manifest`);
  }
  let caps;
  if (capsMatch[1].trim().startsWith('[')) {
    caps = JSON.parse(capsMatch[1].replace(/'/g, '"'));
  } else {
    caps = capsMatch[1].split(/\n/).map(line => line.trim().replace(/^-\s*/, '').replace(/^['"]/, '').replace(/['"]$/, '')).filter(Boolean);
  }
  return {
    id:      (idMatch ? idMatch[1].trim() : path.basename(skillDir)).replace(/^['"]|['"]$/g, ''),
    version: versionMatch ? parseInt(versionMatch[1], 10) : 1,
    caps,
  };
}

function resolveSigner(args) {
  if (args.keyPath && args.genKey) die('--key and --gen-key are mutually exclusive');
  if (args.keyPath) {
    return {
      privateKeyPem: readFileSync(args.keyPath, 'utf8'),
      signerKeyId: args.signerKeyId ?? 'operator-2026',
      ephemeral: false,
    };
  }
  if (args.genKey) {
    const kp = generateEd25519KeyPair();
    process.stderr.write('--- ephemeral skill-formal signing public key (ed25519, PEM) ---\n');
    process.stderr.write(kp.publicKey);
    if (!kp.publicKey.endsWith('\n')) process.stderr.write('\n');
    return {
      privateKeyPem: kp.privateKey,
      signerKeyId: args.signerKeyId ?? 'skill-formal-dev-2026',
      ephemeral: true,
    };
  }
  return null;
}

async function runVerify(args) {
  const bundle = readFormalBundle(args.verifyDir);
  const manifest = resolveManifest(args.skillDir, args.manifestPath);
  const r = verifyFormalBundle({
    skillDir: args.skillDir, manifest, bundle,
  });
  process.stderr.write(
    `skills-formal-verify (verify): admit=${r.admit} ` +
    `verificationLevel=${r.verificationLevel}\n`,
  );
  if (r.reasons.length > 0) {
    for (const reason of r.reasons) process.stderr.write(`  - ${reason}\n`);
  }
  process.exit(r.admit ? 0 : 2);
}

async function runProduce(args) {
  const manifest = resolveManifest(args.skillDir, args.manifestPath);
  const signer = resolveSigner(args);
  const bundle = produceFormalBundle({
    skillDir:        args.skillDir,
    manifest,
    bound:           args.bound ?? 8,
    signerKeyId:     signer?.signerKeyId,
    privateKeyPem:   signer?.privateKeyPem,
  });
  process.stderr.write(
    `skills-formal-verify: skill="${manifest.id}" ` +
    `caps=[${manifest.caps.join(',')}] bound=${args.bound ?? 8}\n` +
    `  Method A (static):  contained=${bundle.evidence.static.contained}` +
    (bundle.evidence.static.contained ? '' :
      ` (escaping=${bundle.evidence.static.escapingCapabilities.join(',') || 'none'}, top=${bundle.evidence.static.anyTop})`) +
    `\n` +
    `  Method B (types):   contained=${bundle.evidence.types.contained}\n` +
    `  Method C (BMC):     contained=${bundle.evidence.smt_unsat.contained} ` +
    `(traces=${bundle.evidence.smt_unsat.exploredTraces})\n` +
    `  Joint verdict:      contained=${bundle.attestation.contained}\n`,
  );
  if (args.outDir) {
    writeFormalBundle(bundle, args.outDir);
    process.stderr.write(`  wrote 4 evidence files to ${args.outDir}\n`);
  }
  process.exit(bundle.attestation.contained ? 0 : 2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.verifyDir) return runVerify(args);
  return runProduce(args);
}

main().catch((err) => die(err.stack || err.message || String(err)));
