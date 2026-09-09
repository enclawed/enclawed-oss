#!/usr/bin/env node
// Cross-platform secret-store helper invoked by enclawed-apps/install.mjs
// and read by the launcher at service start.
//
// Talks to the platform-native secret store via @napi-rs/keyring:
//   - macOS:   Keychain (kSecClassGenericPassword)
//   - Windows: Credential Manager (CRED_TYPE_GENERIC)
//   - Linux:   Secret Service (libsecret) over a D-Bus session
//
// Usage:
//   node keyring.mjs set    --service <s> --account <a>   < secret-on-stdin
//   node keyring.mjs get    --service <s> --account <a>   > secret-on-stdout
//   node keyring.mjs delete --service <s> --account <a>
//
// Exit codes:
//   0 — success
//   1 — keyring backend error (libsecret missing on Linux, Keychain
//       locked + decline, Credential Manager API failure)
//   64 — usage error
//   65 — `get` succeeded but the entry doesn't exist
//
// The secret is read from / written to a pipe rather than argv to keep
// it out of process-listing tools (`ps aux`, `tasklist`) and shell
// history.

import { Entry } from "@napi-rs/keyring";

function getArg(rest, name) {
  const i = rest.indexOf(name);
  if (i < 0 || i + 1 >= rest.length) {
    return null;
  }
  return rest[i + 1];
}

function usage() {
  process.stderr.write("usage: keyring.mjs <set|get|delete> --service <s> --account <a>\n");
  process.exit(64);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

async function main() {
  const argv = process.argv.slice(2);
  const op = argv[0];
  if (!op) {
    usage();
  }
  const rest = argv.slice(1);
  const service = getArg(rest, "--service");
  const account = getArg(rest, "--account");
  if (!service || !account) {
    usage();
  }

  let entry;
  try {
    entry = new Entry(service, account);
  } catch (err) {
    process.stderr.write(`keyring: backend init failed: ${err.message ?? err}\n`);
    process.exit(1);
  }

  switch (op) {
    case "set": {
      const secret = await readStdin();
      if (!secret) {
        process.stderr.write("keyring: empty secret on stdin\n");
        process.exit(64);
      }
      try {
        entry.setPassword(secret);
      } catch (err) {
        process.stderr.write(`keyring: setPassword failed: ${err.message ?? err}\n`);
        process.exit(1);
      }
      process.exit(0);
      break;
    }
    case "get": {
      let value;
      try {
        value = entry.getPassword();
      } catch (err) {
        process.stderr.write(`keyring: getPassword failed: ${err.message ?? err}\n`);
        process.exit(1);
      }
      if (value === null || value === undefined) {
        process.exit(65);
      }
      process.stdout.write(value);
      process.exit(0);
      break;
    }
    case "delete": {
      try {
        entry.deleteCredential();
      } catch (err) {
        // deleteCredential is idempotent in @napi-rs/keyring on most
        // platforms; an explicit "not found" is also fine — uninstall
        // pathways should not fail because nothing was there.
        if (!/no such|not found|missing/i.test(String(err))) {
          process.stderr.write(`keyring: deleteCredential failed: ${err.message ?? err}\n`);
          process.exit(1);
        }
      }
      process.exit(0);
      break;
    }
    default:
      usage();
  }
}

main().catch((err) => {
  process.stderr.write(`keyring: unhandled: ${err.message ?? err}\n`);
  process.exit(1);
});
