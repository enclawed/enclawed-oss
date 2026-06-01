#!/usr/bin/env node
// CLI entrypoint. Parses argv, calls runApp(). See README.md for flags.

import { parseArgs } from "node:util";
import { runApp } from "./runApp.js";

// CLI defaults fall back to env vars baked into .env by the installer
// (ENCLAWED_SECRETARY_HITL_CHANNEL, ENCLAWED_SECRETARY_HITL_EMAIL_TIMEOUT_MIN)
// so the background launcher does not need to pass any args — the user's
// install-time choice survives every restart of the scheduled service.
// An explicit --hitl-channel still wins, because parseArgs sees it
// before the env default applies.
const env = process.env;
const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    flavor: { type: "string", default: "enclaved" },
    hitl: { type: "string", default: "bicriterion" },
    "hitl-channel": {
      type: "string",
      default: env.ENCLAWED_SECRETARY_HITL_CHANNEL ?? "auto",
    },
    "hitl-email-timeout-min": {
      type: "string",
      default: env.ENCLAWED_SECRETARY_HITL_EMAIL_TIMEOUT_MIN ?? "30",
    },
    "eod-summary-at": { type: "string", default: "23:55" },
    "eod-trash-at": { type: "string", default: "23:59" },
    "inbox-poll-ms": {
      type: "string",
      default: env.ENCLAWED_SECRETARY_INBOX_POLL_MS ?? "5000",
    },
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
const hitlChannel = values["hitl-channel"];
if (
  hitlChannel !== "auto" &&
  hitlChannel !== "stdin" &&
  hitlChannel !== "dialog" &&
  hitlChannel !== "email"
) {
  throw new Error(`--hitl-channel must be "auto", "stdin", "dialog", or "email"`);
}
const hitlEmailTimeoutMin = Number.parseInt(values["hitl-email-timeout-min"], 10);
if (!Number.isFinite(hitlEmailTimeoutMin) || hitlEmailTimeoutMin < 1) {
  throw new Error(`--hitl-email-timeout-min must be a positive integer`);
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
  await runApp({
    flavor: values.flavor,
    hitl: values.hitl,
    hitlChannel,
    hitlEmailTimeoutMs: hitlEmailTimeoutMin * 60_000,
    // ENCLAWED_SECRETARY_PRINCIPAL_EMAIL (post-rename: the human
    // administrator's address) is populated by the launcher from the
    // OS keyring; never from .env. The legacy env var of the same
    // name (pre-rename installs) held the mailbox value, not the
    // human principal — runApp distinguishes the two by also reading
    // ENCLAWED_SECRETARY_MAILBOX_EMAIL.
    ...(env.ENCLAWED_SECRETARY_PRINCIPAL_EMAIL
      ? { principalEmailFromEnv: env.ENCLAWED_SECRETARY_PRINCIPAL_EMAIL }
      : {}),
    eodSummaryAt: values["eod-summary-at"],
    eodTrashAt: values["eod-trash-at"],
    inboxPollMs,
    maxRuntimeSec,
    ...(values["audit-path"] ? { auditPath: values["audit-path"] } : {}),
  }),
);
