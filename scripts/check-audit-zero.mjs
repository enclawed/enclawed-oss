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
//
// Two trees are audited, and both must be clean:
//   1. the pnpm workspace (`pnpm audit`, dev and optional peers included);
//   2. the consumer view: the published dependency set (root plus every shipped
//      bundled plugin, pinned from pnpm-lock.yaml) resolved by plain npm in a
//      scratch directory and audited with `npm audit --omit=dev`. This is the
//      tree an `npm install enclawed` gets. pnpm-workspace overrides never reach
//      it, so a floor that exists only as an override cannot make this pass.
//      It needs dist/extensions (a build); without it the check cannot run (3).
//      It may carry no deprecated package (npm's lockfile `deprecated` field)
//      and no OpenTelemetry package except the inert
//      @opentelemetry/api facade the Teams SDK depends on.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computePublishManifest,
  findDeprecatedPackages,
  findForbiddenTelemetryPackages,
  packNpm,
  resolveConsumerTree,
} from "./npm-shrinkwrap.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  process.stdout.write("audit: workspace (pnpm): 0 known vulnerabilities.\n");
  process.exit(auditConsumerView());
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
  "Fix by upgrading the dependency that pins the vulnerable version, never by ignoring\n" +
    "the advisory. A pnpm-workspace.yaml override is acceptable only when its target\n" +
    "satisfies every parent's declared range (consumers never receive overrides).\n",
);
process.exit(1);

/** Audit the consumer view (see the header). Returns the exit code. */
function auditConsumerView() {
  if (!existsSync(join(REPO_ROOT, "dist", "extensions"))) {
    process.stderr.write(
      "audit: consumer view not checked: dist/extensions is missing (run `pnpm build`).\n",
    );
    return 3;
  }
  let result;
  try {
    const { manifest } = computePublishManifest(REPO_ROOT);
    result = resolveConsumerTree(manifest, packNpm());
  } catch (err) {
    process.stderr.write(
      `audit: consumer view could not be resolved: ${String(err?.message ?? err)}\n`,
    );
    return 3;
  }
  const { audit, lock } = result;
  // No deprecated package may ship (fail closed when it cannot be determined).
  let deprecated;
  try {
    deprecated = findDeprecatedPackages(lock);
  } catch (err) {
    process.stderr.write(
      `audit: consumer view deprecation status unknown: ${String(err?.message ?? err)}\n`,
    );
    return 3;
  }
  if (deprecated.length > 0) {
    process.stderr.write(
      `audit: consumer view carries ${String(deprecated.length)} deprecated package(s):\n  ${deprecated.join("\n  ")}\n`,
    );
    return 1;
  }
  // Only the inert OpenTelemetry API facade (a Teams SDK dependency) may ship.
  const telemetry = findForbiddenTelemetryPackages(lock);
  if (telemetry.length > 0) {
    process.stderr.write(
      `audit: consumer view carries OpenTelemetry packages other than @opentelemetry/api: ${telemetry.join(", ")}\n`,
    );
    return 1;
  }
  if (audit.status === "unavailable") {
    process.stderr.write(`audit: consumer view could not be audited (${audit.detail}).\n`);
    return 3;
  }
  if (audit.status === "findings") {
    process.stderr.write(
      `audit: consumer view (npm, as installed from the registry): ${String(audit.totals.total)} vulnerable package(s) ${JSON.stringify(audit.totals)}\n  ${audit.findings.join("\n  ")}\n` +
        "Fix by upgrading the dependency that pins the vulnerable version; pnpm overrides\n" +
        "do not reach consumers.\n",
    );
    return 1;
  }
  process.stdout.write(
    "audit: consumer view (npm --omit=dev): 0 known vulnerabilities, 0 deprecated packages.\n",
  );
  return 0;
}
