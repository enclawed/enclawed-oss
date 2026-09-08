#!/usr/bin/env node
// Guard: the reference apps under enclawed-apps/ must run on the feature
// set enclawed-oss ships, and nothing more.
//
// enclawed-enclaved is a proprietary superset: the accreditors and
// egress mediator under extensions/enclaved/, OSCAL artifact generation,
// the FIPS mode/allowlist and zero-trust key broker under
// src/enclawed-secure/, and hardware-root forensics. An app that reaches
// into any of it still works for the maintainer and fails for everyone
// running the open build, which is where these apps are meant to run.
//
// Checks, per app:
//   - no import of a path that exists only in enclawed-enclaved
//
// ENCLAWED_FLAVOR is deliberately NOT checked. That variable is a
// HARDENING level ("enclaved"/secure/classified vs "open"/permissive)
// and both settings ship in the open build; it says nothing about
// licensing. Conflating the two is the confusion this guard exists to
// prevent, not to spread. See docs/reference/editions-and-hardening.md.
//   - every non-relative, non-builtin import is a real dependency of the
//     app or a workspace package that exists in this tree

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Paths that exist only in the proprietary tree. Keep in step with
// docs/reference/editions-and-hardening.md.
// Released to the public tree even though the private tree still keeps a
// copy under extensions/enclaved/. Matching on path alone would report
// these as proprietary; match on the feature, not where it happens to
// sit in the superset.
const PUBLIC_EXCEPTIONS = ["mcp-attested"];

const ENCLAVED_ONLY = [
  "extensions/enclaved/",
  "src/enclawed-secure/",
  "enclawed/src/oscal/",
  "src/enclawed/hardware-root/forensics",
  "packages/egress-core/",
];

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const appsDir = path.join(repoRoot, "enclawed-apps");
const failures = [];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") {
      continue;
    }
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(p, out);
    } else if (/\.(ts|mts|mjs|js)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const apps = fs
  .readdirSync(appsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(appsDir, e.name, "app.config.json")))
  .map((e) => e.name);

for (const app of apps) {
  const appDir = path.join(appsDir, app);
  const rel = (p) => path.relative(repoRoot, p);

  for (const file of walk(appDir)) {
    const src = fs.readFileSync(file, "utf8");

    for (const m of src.matchAll(/from\s+"([^"]+)"|require\(\s*"([^"]+)"\s*\)/g)) {
      const spec = m[1] ?? m[2];
      if (!spec || spec.startsWith("node:")) {
        continue;
      }
      // A relative specifier is the realistic way an app would reach a
      // proprietary extension ("../../../extensions/enclaved/..."), so
      // resolve before judging rather than skipping anything that starts
      // with a dot.
      const resolved = spec.startsWith(".")
        ? path.relative(repoRoot, path.resolve(path.dirname(file), spec))
        : spec;
      const norm = resolved.split(path.sep).join("/");
      const hit = PUBLIC_EXCEPTIONS.some((name) => norm.includes(name))
        ? undefined
        : ENCLAVED_ONLY.find((prefix) => norm.includes(prefix));
      if (hit) {
        failures.push(
          `${rel(file)}: imports "${spec}", which exists only in enclawed-enclaved (${hit})`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  process.stderr.write("Apps must use only features present in enclawed-oss:\n\n");
  for (const f of failures) {
    process.stderr.write(`  - ${f}\n`);
  }
  process.stderr.write("\n");
  process.exit(1);
}
process.stdout.write(`Checked ${apps.length} app(s): open-source feature set only.\n`);
