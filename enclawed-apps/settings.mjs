#!/usr/bin/env node
// Review and change an installed app's settings without reinstalling.
//
// install.mjs is the wrong tool for "I want to change the poll interval":
// it re-runs credential acquisition, workspace install, build, launcher
// regeneration and the adversarial gate -- minutes of work, a service
// restart, and a credential prompt -- to edit one line of .env. Worse,
// answering its "reuse existing credentials?" prompt wrongly is how an
// operator loses a working app password.
//
//   node enclawed-apps/settings.mjs <app-id>            # walk every setting
//   node enclawed-apps/settings.mjs <app-id> --list     # print, change nothing
//   node enclawed-apps/settings.mjs <app-id> --set K=V  # set one, non-interactive
//
// Secrets are NOT handled here. They live in the OS keyring, never in
// .env, and re-provisioning them is install.mjs's job.

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const appId = argv.find((a) => !a.startsWith("--"));
const listOnly = argv.includes("--list");
const setArg = argv.find((a) => a.startsWith("--set="))?.slice("--set=".length);
const promptFileArg = argv
  .find((a) => a.startsWith("--set-prompt-file="))
  ?.slice("--set-prompt-file=".length);

const APP_ID_ALIASES = { secretary: "executive-assistant" };
const resolvedAppId = APP_ID_ALIASES[appId] ?? appId;

if (argv.includes("--help") || argv.includes("-h") || !resolvedAppId) {
  const out = resolvedAppId ? process.stdout : process.stderr;
  out.write(
    [
      "",
      "Review or change an installed app's settings. No reinstall, and",
      "credentials are untouched (they live in the OS keyring).",
      "",
      "  settings.mjs <app> [--list | --set=KEY=VALUE]",
      "",
      "    (none)           walk every setting, each one explained",
      "    --list           print current values, change nothing",
      "    --set=KEY=VALUE  change one setting, non-interactive",
      "    --set-prompt-file=PATH",
      "                     read the system prompt from a file (paragraphs are",
      "                     preserved) and delete the file once it is stored",
      "    --help           this message",
      "",
      "  Changes take effect on restart; the exact command is printed after a change.",
      "",
    ].join("\n"),
  );
  process.exit(resolvedAppId ? 0 : 64);
}

const configPath = join(here, resolvedAppId, "app.config.json");
if (!existsSync(configPath)) {
  process.stderr.write(`settings: no app at ${join(here, resolvedAppId)}\n`);
  process.exit(2);
}
const config = JSON.parse(readFileSync(configPath, "utf8"));
const envPath = join(homedir(), ".enclawed", "enclawed-apps", config.id, ".env");
if (!existsSync(envPath)) {
  process.stderr.write(
    `settings: ${config.name} is not installed (no ${envPath}).\n` +
      `  Run the installer first; this tool only edits an existing install.\n`,
  );
  process.exit(2);
}

const P = "ENCLAWED_EXECUTIVE_ASSISTANT_";

/**
 * Every operator-tunable setting, with the validation the installer
 * applies. Kept declarative so the prompt loop, --list and --set all
 * enforce exactly the same rules.
 */
/**
 * Deliberately NOT here:
 *
 *   MAILBOX_EMAIL, PRINCIPAL_EMAIL, PRINCIPAL_ALIASES -- identity, not
 *   preference. They live in the OS keyring and the launcher injects
 *   them into the environment at start, so editing .env would be
 *   overwritten on the next run and, worse, would silently disagree
 *   with the account the app authenticates as. Re-provision through the
 *   installer.
 *
 *   The app password and any other secret -- keyring only, never .env.
 */
const SETTINGS = [
  {
    key: `${P}SYSTEM_PROMPT`,
    label: "System prompt",
    help: "The standing instruction the assistant works under: who it is acting for, what it should and should not do, tone. This is the single biggest lever on its behaviour. One line -- the prompt is stored as one .env value.",
  },
  {
    key: `${P}INBOX_POLL_MS`,
    label: "Inbox poll interval (ms)",
    help: "How often to check for new mail. Lower = more responsive, more IMAP traffic. Minimum 1000.",
    validate: (v) => (/^\d+$/.test(v) && Number(v) >= 1000 ? null : "an integer >= 1000"),
  },
  {
    key: "ENCLAWEDER_ROOT",
    label: "Hardware-root policy",
    help: "What happens when NO enclaweder is connected. A connected one is always used and enforced, and a session it accredited never continues without it. required = refuse to start; default = start software-only; optional = start software-only even when resuming such a session.",
    choices: ["required", "default", "optional"],
    // "default" is the absence of the variable.
    omitWhen: "default",
  },
  {
    key: `${P}NON_CONTACT_POLICY`,
    label: "Mail from non-contacts",
    help: "How mail from people outside your address book is handled. All three run the full inbound filter stack first -- nothing reaches the model unscreened. refuse = they get a fixed refusal notice; triage-silent = they get nothing and the mail is recorded for you, so a public mailbox never becomes an always-answering oracle; process = the assistant reads and answers them like anyone else, but at a higher bar: outbound checks stay strict and it cannot touch your calendar or contacts on a stranger's say-so.",
    choices: ["refuse", "triage-silent", "process"],
    omitWhen: "refuse",
  },
  {
    key: `${P}HITL_CHANNEL`,
    label: "Approval channel",
    help: "How you are asked to approve a sensitive action. auto = a dialog, or the terminal if one is attached; dialog = native popup; email = the assistant emails you and waits; stdin = keypress in the terminal.",
    choices: ["auto", "dialog", "email", "stdin"],
  },
  {
    key: `${P}HITL_EMAIL_TIMEOUT_MIN`,
    label: "Email approval timeout (minutes)",
    help: "How long an emailed approval request waits for your YES/NO before it gives up and does nothing.",
    validate: (v) => (/^\d+$/.test(v) && Number(v) > 0 ? null : "a positive integer"),
  },
  {
    key: `${P}DRAFT_MODE`,
    label: "Draft mode",
    help: "auto = send replies once they pass the checks; review = always leave them as drafts for you to send.",
    choices: ["auto", "review"],
  },
  {
    key: `${P}QUIET_HOURS`,
    label: "Quiet hours (HH:MM-HH:MM, empty = off)",
    help: "A window in which the assistant stops processing mail. Anything arriving waits until the window ends.",
  },
  {
    key: `${P}DISPLAY_NAME`,
    label: "Persona display name",
    help: "The name the assistant signs replies with and puts in the From: header.",
  },
  {
    key: `${P}CLASSIFIER_MODEL`,
    label: "Stage-0 classifier model",
    help: "Local model that screens inbound mail for prompt injection before the reply model ever sees it. Smaller = faster but more false positives.",
  },
  {
    key: `${P}CLASSIFIER_TIMEOUT_MS`,
    label: "Classifier timeout (ms)",
    help: "How long to wait for that screening. Too short and it never runs: a cold model load alone can take 30s+.",
  },
  {
    key: `${P}VISION_MODEL`,
    label: "Vision model (image attachments)",
    help: "Multimodal model that recognises image attachments, e.g. a screenshot of an error. Images are sanitised first (metadata stripped, pixels scrambled) and the description is screened before the reply model sees it. Empty = images are accepted but not read.",
  },
  {
    key: `${P}MAX_CONCURRENT`,
    label: "Max threads handled at once",
    help: "How many mail threads the assistant works on in parallel. Higher finishes a backlog sooner and puts more load on the model.",
    validate: (v) => (/^\d+$/.test(v) && Number(v) >= 1 ? null : "a positive integer"),
  },
  {
    key: `${P}UPDATE_CHECK_INTERVAL_MS`,
    label: "Self-update check interval (ms)",
    help: "How often to look for a newer version. 0 disables the check entirely.",
    validate: (v) => (/^\d+$/.test(v) ? null : "a non-negative integer"),
  },
  {
    key: "ENCLAWED_OLLAMA_API_BASE",
    label: "Ollama server address",
    help: "Where the local model server is, e.g. http://127.0.0.1:11434. Empty uses the default. This is the highest-precedence of the several variables the client accepts, so setting it here always wins -- OLLAMA_HOST would be ignored whenever this one is present.",
  },
  {
    key: `${P}OLLAMA_MODEL`,
    label: "Reply model (app override)",
    help: "Overrides OLLAMA_MODEL for this app only. Leave empty to use the shared setting below.",
  },
  {
    key: "OLLAMA_MODEL",
    label: "Reply model",
    help: "Local model that reads mail and composes replies. Larger = better judgement, slower.",
  },
  {
    key: "TZ",
    label: "Time zone",
    help: 'IANA name (e.g. "America/Los_Angeles"). Used for quiet hours, the end-of-day summary, and any date the assistant reads or writes.',
  },
];

function readEnv(path) {
  const out = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) {
      continue;
    }
    let v = m[2].trim();
    if (v.length > 1 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) {
      v = v.slice(1, -1);
    }
    out.set(m[1], v);
  }
  return out;
}

/**
 * Rewrite in place, preserving every line the tool does not manage --
 * comments, ordering, and any key not in SETTINGS (provider variables,
 * audit paths) survive untouched.
 */
function writeEnv(path, env) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const key = m[1];
    seen.add(key);
    if (!env.has(key)) {
      continue; // removed (e.g. set back to its default)
    }
    out.push(`export ${key}="${String(env.get(key)).replace(/"/g, '\\"')}"`);
  }
  for (const [k, v] of env) {
    if (!seen.has(k)) {
      out.push(`export ${k}="${String(v).replace(/"/g, '\\"')}"`);
    }
  }
  writeFileSync(path, out.join("\n").replace(/\n+$/, "") + "\n", "utf8");
}

/**
 * The actual restart command for THIS machine. "Restart the app" is not
 * an instruction: the operator is on Windows or they are not, and the
 * two invocations share nothing. Printing the wrong shell's syntax, or
 * none, is how a setting gets changed and never takes effect.
 */
function restartHint() {
  const lines =
    platform() === "win32"
      ? [`  Stop-EnclawedApp ${config.id}`, `  Start-EnclawedApp ${config.id}`]
      : [
          `  node ${join(here, "install.mjs")} ${config.id} --stop`,
          `  node ${join(here, "install.mjs")} ${config.id} --start`,
        ];
  return [`Restart ${config.name} for the change to take effect:`, ...lines].join("\n");
}

const env = readEnv(envPath);

if (listOnly) {
  process.stdout.write(`${config.name} — ${envPath}\n\n`);
  for (const s of SETTINGS) {
    const v = env.get(s.key);
    process.stdout.write(`  ${s.label.padEnd(34)} ${v ?? "(default)"}\n`);
  }
  process.exit(0);
}

// --set-prompt-file: the walkthrough is line-based, so a prompt with
// paragraphs cannot be typed into it. Write the prompt in a file, hand
// the file over, and it is removed once the value is safely stored --
// the operator asked for the draft not to linger on disk.
if (promptFileArg) {
  const spec = SETTINGS.find((x) => x.key === `${P}SYSTEM_PROMPT`);
  let text;
  try {
    text = readFileSync(promptFileArg, "utf8");
  } catch (err) {
    process.stderr.write(
      `settings: cannot read ${promptFileArg}: ${(err && err.message) || err}\n`,
    );
    process.exit(2);
  }
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (trimmed.length === 0) {
    process.stderr.write(
      `settings: ${promptFileArg} is empty; nothing was changed and the file was kept\n`,
    );
    process.exit(64);
  }
  // Escape so the whole prompt survives as one .env value; runApp
  // unescapes on read.
  const encoded = trimmed.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
  env.set(spec.key, encoded);
  writeEnv(envPath, env);

  // Only after the value is on disk. A prompt deleted because the write
  // "probably worked" is a prompt the operator has to write again.
  let removed = false;
  try {
    unlinkSync(promptFileArg);
    removed = true;
  } catch (err) {
    process.stdout.write(
      `  note: could not delete ${promptFileArg} (${(err && err.message) || err})\n`,
    );
  }
  const lines = trimmed.split("\n").length;
  process.stdout.write(
    `set system prompt from ${promptFileArg} (${trimmed.length} chars, ${lines} line(s))` +
      `${removed ? "; file deleted" : "; FILE NOT DELETED"}\n`,
  );
  process.stdout.write(`${restartHint()}\n`);
  process.exit(0);
}

if (setArg) {
  const eq = setArg.indexOf("=");
  const key = eq === -1 ? setArg : setArg.slice(0, eq);
  const value = eq === -1 ? "" : setArg.slice(eq + 1);
  const spec = SETTINGS.find((s) => s.key === key);
  if (!spec) {
    process.stderr.write(`settings: unknown setting ${key}\n`);
    process.exit(64);
  }
  const bad = validateValue(spec, value);
  if (bad) {
    process.stderr.write(`settings: ${key} must be ${bad}\n`);
    process.exit(64);
  }
  applyValue(env, spec, value);
  writeEnv(envPath, env);
  process.stdout.write(`set ${key}=${value || "(default)"}\n`);
  process.stdout.write(`${restartHint()}\n`);
  process.exit(0);
}

function validateValue(spec, value) {
  if (value === "") {
    return null;
  } // clearing is always allowed
  if (spec.choices && !spec.choices.includes(value)) {
    return `one of: ${spec.choices.join(", ")}`;
  }
  return spec.validate ? spec.validate(value) : null;
}

function applyValue(env, spec, value) {
  if (value === "" || (spec.omitWhen && value === spec.omitWhen)) {
    env.delete(spec.key);
  } else {
    env.set(spec.key, value);
  }
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
// readline's question() never settles once stdin has closed, so a piped
// or redirected run would hang on the first prompt with no output and no
// exit. Treat a closed input as "keep the current value" and finish.
let stdinClosed = false;
// ONE close listener, resolved once and shared by every prompt. The
// obvious shape -- racing each question against its own rl.once("close")
// -- adds a listener per question and never removes it while the stream
// stays open, so the twelfth setting trips Node's
// MaxListenersExceededWarning about a leak. There is only ever one close
// event; there only needs to be one listener waiting for it.
let markClosed;
const closed = new Promise((resolve) => {
  markClosed = resolve;
});
rl.on("close", () => {
  stdinClosed = true;
  markClosed("");
});
const ask = async (q) => {
  if (stdinClosed) {
    return "";
  }
  return (await Promise.race([rl.question(q), closed])) ?? "";
};

process.stdout.write(`\n${config.name} settings — ${envPath}\n`);
process.stdout.write("Enter to keep the current value.\n\n");
if (!process.stdin.isTTY) {
  process.stdout.write(
    "  (no terminal attached — every prompt keeps its current value.\n" +
      "   Use --list to review, or --set KEY=VALUE to change one.)\n\n",
  );
}
let changed = 0;
for (const spec of SETTINGS) {
  const current = env.get(spec.key);
  if (spec.help) {
    process.stdout.write(`  ${spec.help}\n`);
  }
  if (spec.choices) {
    process.stdout.write(`  choices: ${spec.choices.join(" | ")}\n`);
  }
  const shown = current ?? "(default)";
  const raw = (await ask(`  ${spec.label} [${shown}]: `)).trim();
  process.stdout.write("\n");
  if (raw.length === 0) {
    continue;
  }
  const bad = validateValue(spec, raw);
  if (bad) {
    process.stdout.write(`  ! ${spec.label} must be ${bad} — left unchanged.\n\n`);
    continue;
  }
  applyValue(env, spec, raw);
  changed += 1;
}
rl.close();

if (changed === 0) {
  process.stdout.write("No changes.\n");
  process.exit(0);
}
writeEnv(envPath, env);
process.stdout.write(`\nWrote ${changed} change(s) to ${envPath}.\n`);
process.stdout.write(`${restartHint()}\n`);
