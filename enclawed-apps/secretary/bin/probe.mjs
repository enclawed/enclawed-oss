#!/usr/bin/env node
// Live probe of the three protocol bridges that the secretary uses.
// Invoked by `install.mjs --probe`. Loads the bridges as compiled
// JS from dist/framework.js (which already re-exports them) and
// runs one tool call each. Reports the wire-level result, NOT a
// fake-but-happy "OK" — the whole point is to give the user a
// definitive signal about which bridge is broken and why.
//
// Env (set by install.mjs):
//   ENCLAWED_SECRETARY_PRINCIPAL_EMAIL    The IMAP/CalDAV/CardDAV login
//   ENCLAWED_IMAP_APP_PASSWORD            The 16-letter app password
//   ENCLAWED_PROBE_CONFIG                 Path to the app.config.json

import { readFileSync } from "node:fs";

const principal = process.env.ENCLAWED_SECRETARY_PRINCIPAL_EMAIL;
const password = process.env.ENCLAWED_IMAP_APP_PASSWORD;
const configPath = process.env.ENCLAWED_PROBE_CONFIG;
if (!principal || !password || !configPath) {
  process.stderr.write(
    "probe: missing env (need ENCLAWED_SECRETARY_PRINCIPAL_EMAIL, ENCLAWED_IMAP_APP_PASSWORD, ENCLAWED_PROBE_CONFIG)\n",
  );
  process.exit(64);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));

const fw = await import("enclawed/framework");
const { loadImapSmtpBridge, loadCalDavBridge, loadCardDavBridge, _resetServerRegistryForTest } = fw;
if (typeof _resetServerRegistryForTest === "function") {
  _resetServerRegistryForTest();
}

function header(s) {
  console.log(`\n\x1b[1m\x1b[34m== ${s}\x1b[0m`);
}
function ok(s) {
  console.log(`  \x1b[32m✓\x1b[0m ${s}`);
}
function fail(s) {
  console.log(`  \x1b[31m✗\x1b[0m ${s}`);
}
function info(s) {
  console.log(`    ${s}`);
}

// IMAP — list_threads: how many threads in INBOX?
header("IMAP+SMTP (mcp-imap-smtp)");
try {
  const mail = loadImapSmtpBridge({
    imap: config.provider.imap,
    smtp: config.provider.smtp,
    username: principal,
    password,
  });
  const r = await mail.registered.transport.call("tools/call", {
    name: "search_threads",
    arguments: { query: "in:inbox", maxResults: 3 },
  });
  if (r.ok) {
    const threads = r.result.threads;
    ok(`Connected. INBOX sample returned ${threads.length} thread(s).`);
    for (const t of threads) {
      info(`#${t.threadId} ${t.subject?.slice(0, 60) ?? "(no subject)"}`);
    }
  } else {
    fail(`Bridge returned error: ${r.reason}`);
  }
} catch (err) {
  fail(`Threw: ${err.message ?? err}`);
}

// CalDAV — list calendars implicitly via list_events
header("CalDAV (mcp-caldav)");
try {
  const cal = loadCalDavBridge({
    serverUrl: config.provider.caldav.serverUrl,
    username: principal,
    password,
  });
  const r = await cal.registered.transport.call("tools/call", {
    name: "list_events",
    arguments: { maxResults: 3 },
  });
  if (r.ok) {
    const events = r.result.events;
    ok(`Connected. Default window returned ${events.length} event(s).`);
    for (const e of events) {
      info(`${e.start} → ${e.end} ${e.summary?.slice(0, 60) ?? "(no title)"}`);
    }
  } else {
    fail(`Bridge returned error: ${r.reason}`);
  }
} catch (err) {
  fail(`Threw: ${err.message ?? err}`);
}

// CardDAV — list_contacts: how many contacts in the primary book?
header("CardDAV (mcp-carddav)");
try {
  const con = loadCardDavBridge({
    serverUrl: config.provider.carddav.serverUrl,
    username: principal,
    password,
  });
  const r = await con.registered.transport.call("tools/call", {
    name: "list_contacts",
    arguments: { maxResults: 5 },
  });
  if (r.ok) {
    const contacts = r.result.contacts;
    ok(
      `Connected. Primary address book has at least ${contacts.length} contact(s) (showing up to 5).`,
    );
    for (const c of contacts) {
      info(`${c.displayName} <${c.emails?.[0] ?? "no email"}>`);
    }
    if (contacts.length === 0) {
      info("(zero results from the bridge — either the address book really is empty,");
      info(" or Google's CardDAV discovery returned a different book than expected.");
      info(" Sender-address lookups will then fall through to the refusal path.)");
    }
  } else {
    fail(`Bridge returned error: ${r.reason}`);
  }
} catch (err) {
  fail(`Threw: ${err.message ?? err}`);
}

console.log("");
console.log(
  "Probe complete. Send the output above to whoever is helping you debug — it shows exactly which bridge is failing and why.",
);
