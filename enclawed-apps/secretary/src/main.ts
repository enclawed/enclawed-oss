#!/usr/bin/env node
// CLI entrypoint. Parses argv, calls runDemo(). See README.md for flags.

import { parseArgs } from "node:util";
import { runDemo } from "./runDemo.js";

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    flavor: { type: "string", default: "enclaved" },
    hitl: { type: "string", default: "bicriterion" },
    "eod-summary-at": { type: "string", default: "23:55" },
    "eod-trash-at": { type: "string", default: "23:59" },
    "inbox-poll-ms": { type: "string", default: "60000" },
    "max-runtime-sec": { type: "string", default: "0" },
    "audit-path": { type: "string" },
  },
});

if (values.flavor !== "enclaved" && values.flavor !== "open") {
  throw new Error(`--flavor must be "enclaved" or "open"`);
}
if (values.hitl !== "bicriterion" && values.hitl !== "always" && values.hitl !== "off") {
  throw new Error(`--hitl must be "bicriterion", "always", or "off"`);
}
const inboxPollMs = Number.parseInt(values["inbox-poll-ms"], 10);
if (!Number.isFinite(inboxPollMs) || inboxPollMs < 1000) {
  throw new Error(`--inbox-poll-ms must be an integer >= 1000`);
}
const maxRuntimeSec = Number.parseInt(values["max-runtime-sec"], 10);
if (!Number.isFinite(maxRuntimeSec) || maxRuntimeSec < 0) {
  throw new Error(`--max-runtime-sec must be a non-negative integer`);
}

process.env.ENCLAWED_FLAVOR = values.flavor;

process.exit(
  await runDemo({
    flavor: values.flavor,
    hitl: values.hitl,
    eodSummaryAt: values["eod-summary-at"],
    eodTrashAt: values["eod-trash-at"],
    inboxPollMs,
    maxRuntimeSec,
    ...(values["audit-path"] ? { auditPath: values["audit-path"] } : {}),
  }),
);
