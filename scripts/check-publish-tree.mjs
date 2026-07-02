#!/usr/bin/env node
// prepublishOnly guard: refuses `npm publish` unless the cwd is the
// enclawed-oss tree (not the closed enclawed-enclaved tree, and not
// some other tree masquerading as OSS).
//
// Three independent checks; any failure aborts the publish:
//   1. Identity: package.json must say name === "enclawed" and must
//      NOT carry `private: true`.
//   2. Description match: the description must start with the known
//      OSS-tree description string. The closed-tree description
//      starts differently, so a tree swap is caught here.
//   3. Negative markers: closed-tree-only paths (the user guide LaTeX
//      file, mcp-attested + enclaved-secmon extensions, and the
//      enclawed-enclaved/ directory) MUST NOT exist in the cwd. A
//      copy-from-closed accident is caught here.
//
// The structural guard against publishing the closed tree itself is
// `private: true` in enclawed-enclaved/package.json — npm refuses with
// EPRIVATE before any bytes leave the machine. This script is the
// belt over those suspenders.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const OSS_DESCRIPTION_PREFIX =
  "Hardened single-user AI gateway for classified-enclave deployment";

const CLOSED_TREE_ONLY_PATHS = [
  "enclawed-enclaved-user-guide.tex",
  "enclawed-enclaved-user-guide.pdf",
  // extensions/mcp-attested moved out of the closed-tree-only list when the
  // bridge transport (HTTP + OAuth + per-bridge admission gate) was ported
  // into the OSS tree alongside the mcp-google-workspace and mcp-github
  // bundled bridges. It is now an OSS-tree extension.
  "extensions/enclaved-secmon",
];

function fail(reason) {
  process.stderr.write(`\nrefusing to publish: ${reason}\n\n`);
  process.exit(1);
}

let pkg;
try {
  pkg = JSON.parse(readFileSync(`${REPO_ROOT}/package.json`, "utf8"));
} catch (e) {
  fail(`could not read package.json: ${e.message}`);
}

if (pkg.name !== "enclawed") {
  fail(
    `package.json name is ${JSON.stringify(pkg.name)}, not "enclawed".\n` +
    `This is either the closed enclawed-enclaved tree (name: "enclawed-enclaved")\n` +
    `or some other tree. npm publish must run from the OSS tree only.`,
  );
}

if (pkg.private === true) {
  fail(`package.json has "private": true. npm publish is blocked by spec.`);
}

if (typeof pkg.description !== "string" || !pkg.description.startsWith(OSS_DESCRIPTION_PREFIX)) {
  fail(
    `package.json description does not match the known OSS-tree string.\n` +
    `expected to start with: ${JSON.stringify(OSS_DESCRIPTION_PREFIX)}\n` +
    `got:                    ${JSON.stringify((pkg.description ?? "").slice(0, 80))}\n` +
    `If you are intentionally rebranding, update OSS_DESCRIPTION_PREFIX in\n` +
    `scripts/check-publish-tree.mjs first.`,
  );
}

const leaked = [];
for (const m of CLOSED_TREE_ONLY_PATHS) {
  if (existsSync(`${REPO_ROOT}/${m}`)) leaked.push(m);
}
if (leaked.length > 0) {
  fail(
    `closed-tree-only paths are present in this tree:\n` +
    leaked.map((m) => `  - ${m}`).join("\n") +
    `\nThis looks like a copy-from-closed contamination. Remove those paths\n` +
    `or run publish from a clean enclawed-oss checkout.`,
  );
}

console.error(
  `publish-tree check OK:\n` +
  `  name:        ${pkg.name}\n` +
  `  version:     ${pkg.version}\n` +
  `  private:     ${pkg.private ?? false}\n` +
  `  description: ${pkg.description.slice(0, 80)}...\n` +
  `  closed-only paths present: 0\n`,
);
