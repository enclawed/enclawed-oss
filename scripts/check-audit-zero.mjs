#!/usr/bin/env node
// The dependency tree must carry ZERO known vulnerabilities. Not "no criticals",
// not "nothing new" -- zero, at every severity.
//
// Exit codes:
//   0  audit ran and found nothing
//   1  audit ran and found vulnerabilities (listed on stderr)
//   3  audit could not run (typically offline); nothing is known either way
//
// Callers choose what 3 means. Anything that ships -- the public snapshot, the
// customer tarball -- treats it as a refusal: an unverified tree does not
// leave. The pre-push hook lets it through with a warning, so working offline
// is not blocked; the release gates still catch it before anything ships.
//
// Why this exists: the private tree has no Dependabot, and its count drifted
// to 145 advisories -- one critical -- with nothing to say so. A number that
// has to stay at zero needs a gate, not a dashboard.

import { spawnSync } from "node:child_process";

const res = spawnSync("pnpm", ["audit", "--json"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === "win32",
});

let report;
try {
  report = JSON.parse(res.stdout);
} catch {
  process.stderr.write(
    "audit: could not run `pnpm audit` (no parseable report -- offline?).\n" +
      (res.stderr ? `  ${res.stderr.trim().split("\n").slice(-3).join("\n  ")}\n` : ""),
  );
  process.exit(3);
}

const totals = report?.metadata?.vulnerabilities;
if (!totals || typeof totals !== "object") {
  process.stderr.write("audit: report has no vulnerability totals; treating as not run.\n");
  process.exit(3);
}

let count = 0;
for (const n of Object.values(totals)) {
  count += Number(n) || 0;
}
if (count === 0) {
  process.stdout.write("audit: 0 known vulnerabilities.\n");
  process.exit(0);
}

process.stderr.write(
  `audit: ${String(count)} known vulnerabilit${count === 1 ? "y" : "ies"} ${JSON.stringify(totals)}\n`,
);
const seen = new Set();
for (const adv of Object.values(report.advisories ?? {})) {
  const name = String(adv.module_name);
  const range = String(adv.vulnerable_versions);
  const key = `${name}@${range}`;
  if (seen.has(key)) {
    continue;
  }
  seen.add(key);
  const via = (adv.findings ?? [])
    .flatMap((f) => f.paths ?? [])
    .slice(0, 2)
    .map(String)
    .join(" | ");
  process.stderr.write(
    `  ${String(adv.severity).padEnd(9)} ${name} ${range} ` +
      `-> patched ${String(adv.patched_versions)}  ${String(adv.github_advisory_id ?? "")}\n` +
      (via ? `            via ${via}\n` : ""),
  );
}
process.stderr.write(
  "Fix by raising the floor (pnpm-workspace.yaml overrides, or the direct dependency),\n" +
    "never by ignoring the advisory.\n",
);
process.exit(1);
