---
summary: "Advanced setup and development workflows for Enclawed"
read_when:
  - Setting up a new machine
  - You want “latest + greatest” without breaking your personal setup
title: "Setup"
---

# Setup

<Note>
If you are setting up for the first time, start with [Getting Started](/start/getting-started).
For onboarding details, see [Onboarding (CLI)](/start/wizard).
</Note>

## TL;DR

- **Tailoring lives outside the repo:** `~/.enclawed/workspace` (workspace) + `~/.enclawed/enclawed.json` (config).
- **Stable workflow:** install the macOS app; let it run the bundled Gateway.
- **Bleeding edge workflow:** run the Gateway yourself via `pnpm gateway:watch`, then let the macOS app attach in Local mode.

## Prereqs (from source)

- Node 24 recommended (Node 22 LTS, currently `22.14+`, still supported)
- `pnpm` preferred (or Bun if you intentionally use the [Bun workflow](/install/bun))
- Docker (optional; only for containerized setup/e2e — see [Docker](/install/docker))

## Tailoring strategy (so updates do not hurt)

If you want “100% tailored to me” _and_ easy updates, keep your customization in:

- **Config:** `~/.enclawed/enclawed.json` (JSON/JSON5-ish)
- **Workspace:** `~/.enclawed/workspace` (skills, prompts, memories; make it a private git repo)

Bootstrap once:

```bash
enclawed setup
```

From inside this repo, use the local CLI entry:

```bash
enclawed setup
```

If you don’t have a global install yet, run it via `pnpm enclawed setup` (or `bun run enclawed setup` if you are using the Bun workflow).

## Run the Gateway from this repo

After `pnpm build`, you can run the packaged CLI directly:

```bash
node enclawed.mjs gateway --port 18789 --verbose
```

## Stable workflow (macOS app first)

1. Install + launch **Enclawed.app** (menu bar).
2. Complete the onboarding/permissions checklist (TCC prompts).
3. Ensure Gateway is **Local** and running (the app manages it).
4. Link surfaces (example: WhatsApp):

```bash
enclawed channels login
```

5. Sanity check:

```bash
enclawed health
```

If onboarding is not available in your build:

- Run `enclawed setup`, then `enclawed channels login`, then start the Gateway manually (`enclawed gateway`).

## Bleeding edge workflow (Gateway in a terminal)

Goal: work on the TypeScript Gateway, get hot reload, keep the macOS app UI attached.

### 0) (Optional) Run the macOS app from source too

If you also want the macOS app on the bleeding edge:

```bash
./scripts/restart-mac.sh
```

### 1) Start the dev Gateway

```bash
pnpm install
pnpm gateway:watch
```

`gateway:watch` runs the gateway in watch mode and reloads on relevant source,
config, and bundled-plugin metadata changes.

If you are intentionally using the Bun workflow, the equivalent commands are:

```bash
bun install
bun run gateway:watch
```

### 2) Point the macOS app at your running Gateway

In **Enclawed.app**:

- Connection Mode: **Local**
  The app will attach to the running gateway on the configured port.

### 3) Verify

- In-app Gateway status should read **“Using existing gateway …”**
- Or via CLI:

```bash
enclawed health
```

### Common footguns

- **Wrong port:** Gateway WS defaults to `ws://127.0.0.1:18789`; keep app + CLI on the same port.
- **Where state lives:**
  - Channel/provider state: `~/.enclawed/credentials/`
  - Model auth profiles: `~/.enclawed/agents/<agentId>/agent/auth-profiles.json`
  - Sessions: `~/.enclawed/agents/<agentId>/sessions/`
  - Logs: `/tmp/enclawed/`

## Credential storage map

Use this when debugging auth or deciding what to back up:

- **WhatsApp**: `~/.enclawed/credentials/whatsapp/<accountId>/creds.json`
- **Telegram bot token**: config/env or `channels.telegram.tokenFile` (regular file only; symlinks rejected)
- **Discord bot token**: config/env or SecretRef (env/file/exec providers)
- **Slack tokens**: config/env (`channels.slack.*`)
- **Pairing allowlists**:
  - `~/.enclawed/credentials/<channel>-allowFrom.json` (default account)
  - `~/.enclawed/credentials/<channel>-<accountId>-allowFrom.json` (non-default accounts)
- **Model auth profiles**: `~/.enclawed/agents/<agentId>/agent/auth-profiles.json`
- **File-backed secrets payload (optional)**: `~/.enclawed/secrets.json`
- **Legacy OAuth import**: `~/.enclawed/credentials/oauth.json`
  More detail: [Security](/gateway/security#credential-storage-map).

## Updating (without wrecking your setup)

- Keep `~/.enclawed/workspace` and `~/.enclawed/` as “your stuff”; don’t put personal prompts/config into the `enclawed` repo.
- Updating source: `git pull` + your chosen package-manager install step (`pnpm install` by default; `bun install` for Bun workflow) + keep using the matching `gateway:watch` command.

## Linux (systemd user service)

Linux installs use a systemd **user** service. By default, systemd stops user
services on logout/idle, which kills the Gateway. Onboarding attempts to enable
lingering for you (may prompt for sudo). If it’s still off, run:

```bash
sudo loginctl enable-linger $USER
```

For always-on or multi-user servers, consider a **system** service instead of a
user service (no lingering needed). See [Gateway runbook](/gateway) for the systemd notes.

## Related docs

- [Gateway runbook](/gateway) (flags, supervision, ports)
- [Gateway configuration](/gateway/configuration) (config schema + examples)
- [Discord](/channels/discord) and [Telegram](/channels/telegram) (reply tags + replyToMode settings)
- [Enclawed assistant setup](/start/enclawed)
- [macOS app](/platforms/macos) (gateway lifecycle)
