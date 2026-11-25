#!/usr/bin/env node
// `pnpm test:conformance`: run every test listed in conformance/invariants.json
// through the repo's normal test routing (scripts/test-projects.mjs).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(
  fs.readFileSync(path.join(root, "conformance", "invariants.json"), "utf8"),
);
const files = [...new Set(index.invariants.flatMap((i) => i.tests))].toSorted((a, b) =>
  a.localeCompare(b),
);
const missing = files.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length > 0) {
  console.error(`test:conformance: listed test files do not exist:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "test-projects.mjs"), ...files, ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit" },
);
process.exit(result.status ?? 1);
