// Protocol-generic provider: IMAP + SMTP + CalDAV + CardDAV under a
// single app-specific password.
//
// Activated when an app's app.config.json has
// `provider.type: "imap-caldav-carddav"`.
//
// We deliberately do NOT use OAuth here. Every OAuth path to Gmail
// for a third-party desktop app now requires either (a) a verified
// OAuth client owned by the app publisher (multi-week verification +
// CASA Tier 2 audit for gmail.modify) or (b) a Cloud-Console-driven
// per-user OAuth client (the ten-minute consent-screen + Test-users
// dance that ships unverified-app warnings to the end user). gcloud's
// pre-verified ADC client used to be a third path, but Google is
// blocking calendar / contacts / gmail scopes on the default ADC
// client. The OAuth shortcut is gone.
//
// IETF protocols (IMAP, SMTP, CalDAV, CardDAV) are not on that
// upgrade path — Google still supports them via app-specific
// passwords, an out-of-band 2FA mechanism the user provisions once at
// myaccount.google.com/apppasswords. The same password authenticates
// against all four protocols. The user clicks one button on their
// account-security page; nothing else is required.
//
// Side benefits:
//   - The same provider works against any IMAP/CalDAV/CardDAV host
//     (Fastmail, iCloud, Proton via Bridge, self-hosted Dovecot +
//     Radicale). app.config.json declares the per-host endpoints.
//   - No long-lived OAuth refresh tokens on disk.
//   - No Cloud Console state to drift out from under us.

const APP_PASSWORD_RE = /^[a-z]{16}$/;
const APP_PASSWORD_WITH_SPACES_RE = /^[a-z]{4}(?: [a-z]{4}){3}$/;

function normalizeAppPassword(raw) {
  const trimmed = raw.trim();
  if (APP_PASSWORD_RE.test(trimmed)) {
    return trimmed;
  }
  // Google displays the password as "abcd efgh ijkl mnop"; accept that
  // form and collapse the spaces so the wire payload is always 16
  // unbroken lowercase letters.
  if (APP_PASSWORD_WITH_SPACES_RE.test(trimmed)) {
    return trimmed.replace(/ /g, "");
  }
  return null;
}

export async function acquireCredentials({ config, principal, ask, ok, warn, fail }) {
  const okFn = ok ?? ((s) => console.log(`  ${s}`));
  const warnFn = warn ?? ((s) => console.log(`  ${s}`));
  const failFn = fail ?? ((s) => console.error(`  ${s}`));

  if (!principal) {
    failFn(
      "imap-caldav-carddav provider requires a principal email address. " +
        "Set `principal.envVar` in app.config.json and collect the email before authorizing.",
    );
    throw new Error("missing principal");
  }

  const url = config.appPasswordUrl ?? "https://myaccount.google.com/apppasswords";
  console.log("");
  console.log("To grant the secretary access, generate an app-specific password:");
  console.log("");
  console.log(`  1. Open ${url} in your browser.`);
  console.log("  2. If prompted, finish enabling 2-Step Verification on your Google account.");
  console.log("     (App passwords are 2FA-only. The page will guide you.)");
  console.log('  3. In "App name", type "Enclawed Secretary" and click Create.');
  console.log("  4. Google shows a 16-letter password in a yellow box, formatted as four");
  console.log('     four-letter groups (e.g. "abcd efgh ijkl mnop"). Copy it.');
  console.log("");
  warnFn(
    "The password will be visible while you paste it. Clear your terminal scrollback " +
      "after the installer finishes (Ctrl+L on macOS/Linux, `cls` on Windows).",
  );
  console.log("");

  let appPassword = null;
  for (let attempt = 0; attempt < 3 && !appPassword; attempt++) {
    const raw = await ask("Paste the 16-letter app password: ");
    const normalized = normalizeAppPassword(raw);
    if (normalized) {
      appPassword = normalized;
      break;
    }
    failFn(
      "That does not look like a Google app password. Expected 16 lowercase letters, " +
        'either as "abcdefghijklmnop" or as "abcd efgh ijkl mnop". Try again.',
    );
  }
  if (!appPassword) {
    throw new Error("app password not provided after 3 attempts");
  }

  okFn(`App password captured for ${principal}.`);
  return { principal, appPassword };
}

// Re-hydrate credentials from the platform keyring so a re-install
// does not force the user to re-generate an app password. The
// mailbox identity comes back via the env file (it's the keyring
// lookup key, not a secret).
//
// After the principal/mailbox rename, the canonical env var holding
// the SMTP/IMAP login is ENCLAWED_SECRETARY_MAILBOX_EMAIL. The legacy
// ENCLAWED_SECRETARY_PRINCIPAL_EMAIL (which, pre-rename, held the
// mailbox value despite the misleading name) is honoured as a
// fallback so pre-rename .env files keep their credentials reusable
// on first re-install. Without this fallback the post-rename
// installer never finds the app-password keyring entry and prompts
// the operator to re-enter it on every install — exactly what
// happened in the field.
//
// The variable is still returned as `principal` in the result object
// because the rest of the install path consumes it under that name.
// Value-wise it's the MAILBOX address; consumers pass it straight
// through to keyring.set / SMTP auth, both of which expect the
// mailbox identity.
export function reuseCredentials(existingEnv, opts = {}) {
  const mailbox =
    existingEnv?.ENCLAWED_SECRETARY_MAILBOX_EMAIL ??
    existingEnv?.ENCLAWED_SECRETARY_PRINCIPAL_EMAIL;
  if (!mailbox) {
    return null;
  }
  const lookup = opts.lookupSecret;
  if (typeof lookup !== "function") {
    return null;
  }
  const appPassword = lookup({ service: opts.service, account: mailbox });
  if (!appPassword || !APP_PASSWORD_RE.test(appPassword)) {
    return null;
  }
  return { principal: mailbox, appPassword };
}

// No env vars are owned by this provider. The principal email is
// already written by install.mjs from config.principal.envVar; the
// 16-letter app password lives in the platform keyring. We
// deliberately do NOT echo the password into the process environment
// at install time — it stays in the keyring until the launcher reads
// it at service start.
export function envVars() {
  return {};
}

// True when the secret backing this provider lives in the platform
// keyring (i.e. install.mjs should consult the keyring helper rather
// than just write the secret to .env).
export const usesKeyring = true;

// Service name install.mjs and the launcher use to address the keyring
// entry. Pinning it here keeps the lookup key identical across the
// installer, the launcher template, and the uninstall path.
export function keyringService(appId) {
  return `enclawed-${appId}`;
}

// No post-auth setup yet. Gmail label provisioning previously lived
// here (against the Gmail REST API + an OAuth access token). With
// app passwords, label provisioning will move into the IMAP MCP
// server's startup path — IMAP creates labels by APPENDing to a
// well-named folder, but the MCP server doesn't exist yet (PR2).
export async function postAuthSetup() {
  // intentionally empty until the IMAP+SMTP MCP server ships.
}
