---
summary: "Where Enclawed loads environment variables and the precedence order"
read_when:
  - You need to know which env vars are loaded, and in what order
  - You are debugging missing API keys in the Gateway
  - You are documenting provider auth or deployment environments
title: "Environment Variables"
---

# Environment variables

Enclawed pulls environment variables from multiple sources. The rule is **never override existing values**.

## Precedence (highest → lowest)

1. **Process environment** (what the Gateway process already has from the parent shell/daemon).
2. **`.env` in the current working directory** (dotenv default; does not override).
3. **Global `.env`** at `~/.enclawed/.env` (aka `$ENCLAWED_STATE_DIR/.env`; does not override).
4. **Config `env` block** in `~/.enclawed/enclawed.json` (applied only if missing).
5. **Optional login-shell import** (`env.shellEnv.enabled` or `ENCLAWED_LOAD_SHELL_ENV=1`), applied only for missing expected keys.

On Ubuntu fresh installs that use the default state dir, Enclawed also treats `~/.config/enclawed/gateway.env` as a compatibility fallback after the global `.env`. If both files exist and disagree, Enclawed keeps `~/.enclawed/.env` and prints a warning.

If the config file is missing entirely, step 4 is skipped; shell import still runs if enabled.

## Config `env` block

Two equivalent ways to set inline env vars (both are non-overriding):

```json5
{
  env: {
    OPENROUTER_API_KEY: "sk-or-...",
    vars: {
      GROQ_API_KEY: "gsk-...",
    },
  },
}
```

## Shell env import

`env.shellEnv` runs your login shell and imports only **missing** expected keys:

```json5
{
  env: {
    shellEnv: {
      enabled: true,
      timeoutMs: 15000,
    },
  },
}
```

Env var equivalents:

- `ENCLAWED_LOAD_SHELL_ENV=1`
- `ENCLAWED_SHELL_ENV_TIMEOUT_MS=15000`

## Runtime-injected env vars

Enclawed also injects context markers into spawned child processes:

- `ENCLAWED_SHELL=exec`: set for commands run through the `exec` tool.
- `ENCLAWED_SHELL=acp`: set for ACP runtime backend process spawns (for example `acpx`).
- `ENCLAWED_SHELL=acp-client`: set for `enclawed acp client` when it spawns the ACP bridge process.
- `ENCLAWED_SHELL=tui-local`: set for local TUI `!` shell commands.

These are runtime markers (not required user config). They can be used in shell/profile logic
to apply context-specific rules.

## UI env vars

- `ENCLAWED_THEME=light`: force the light TUI palette when your terminal has a light background.
- `ENCLAWED_THEME=dark`: force the dark TUI palette.
- `COLORFGBG`: if your terminal exports it, Enclawed uses the background color hint to auto-pick the TUI palette.

## Env var substitution in config

You can reference env vars directly in config string values using `${VAR_NAME}` syntax:

```json5
{
  models: {
    providers: {
      "vercel-gateway": {
        apiKey: "${VERCEL_GATEWAY_API_KEY}",
      },
    },
  },
}
```

See [Configuration: Env var substitution](/gateway/configuration-reference#env-var-substitution) for full details.

## Secret refs vs `${ENV}` strings

Enclawed supports two env-driven patterns:

- `${VAR}` string substitution in config values.
- SecretRef objects (`{ source: "env", provider: "default", id: "VAR" }`) for fields that support secrets references.

Both resolve from process env at activation time. SecretRef details are documented in [Secrets Management](/gateway/secrets).

## Path-related env vars

| Variable               | Purpose                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCLAWED_HOME`        | Override the home directory used for all internal path resolution (`~/.enclawed/`, agent dirs, sessions, credentials). Useful when running Enclawed as a dedicated service user. |
| `ENCLAWED_STATE_DIR`   | Override the state directory (default `~/.enclawed`).                                                                                                                            |
| `ENCLAWED_CONFIG_PATH` | Override the config file path (default `~/.enclawed/enclawed.json`).                                                                                                             |

## Logging

| Variable             | Purpose                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCLAWED_LOG_LEVEL` | Override log level for both file and console (e.g. `debug`, `trace`). Takes precedence over `logging.level` and `logging.consoleLevel` in config. Invalid values are ignored with a warning. |

### `ENCLAWED_HOME`

When set, `ENCLAWED_HOME` replaces the system home directory (`$HOME` / `os.homedir()`) for all internal path resolution. This enables full filesystem isolation for headless service accounts.

**Precedence:** `ENCLAWED_HOME` > `$HOME` > `USERPROFILE` > `os.homedir()`

**Example** (macOS LaunchDaemon):

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>ENCLAWED_HOME</key>
  <string>/Users/user</string>
</dict>
```

`ENCLAWED_HOME` can also be set to a tilde path (e.g. `~/svc`), which gets expanded using `$HOME` before use.

## nvm users: web_fetch TLS failures

If Node.js was installed via **nvm** (not the system package manager), the built-in `fetch()` uses
nvm's bundled CA store, which may be missing modern root CAs (ISRG Root X1/X2 for Let's Encrypt,
DigiCert Global Root G2, etc.). This causes `web_fetch` to fail with `"fetch failed"` on most HTTPS sites.

On Linux, Enclawed automatically detects nvm and applies the fix in the actual startup environment:

- `enclawed gateway install` writes `NODE_EXTRA_CA_CERTS` into the systemd service environment
- the `enclawed` CLI entrypoint re-execs itself with `NODE_EXTRA_CA_CERTS` set before Node startup

**Manual fix (for older versions or direct `node ...` launches):**

Export the variable before starting Enclawed:

```bash
export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
enclawed gateway run
```

Do not rely on writing only to `~/.enclawed/.env` for this variable; Node reads
`NODE_EXTRA_CA_CERTS` at process startup.

## Related

- [Gateway configuration](/gateway/configuration)
- [FAQ: env vars and .env loading](/help/faq#env-vars-and-env-loading)
- [Models overview](/concepts/models)
