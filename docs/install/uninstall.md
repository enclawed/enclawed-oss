---
summary: "Uninstall Enclawed completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Enclawed from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `enclawed` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
enclawed uninstall
```

Non-interactive (automation / npx):

```bash
enclawed uninstall --all --yes --non-interactive
npx -y enclawed uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
enclawed gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
enclawed gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${ENCLAWED_STATE_DIR:-$HOME/.enclawed}"
```

If you set `ENCLAWED_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.enclawed/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g enclawed
pnpm remove -g enclawed
bun remove -g enclawed
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/Enclawed.app
```

Notes:

- If you used profiles (`--profile` / `ENCLAWED_PROFILE`), repeat step 3 for each state dir (defaults are `~/.enclawed-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `enclawed` is missing.

### macOS (launchd)

Default label is `ai.enclawed.gateway` (or `ai.enclawed.<profile>`; legacy `com.enclawed.*` may still exist):

```bash
launchctl bootout gui/$UID/ai.enclawed.gateway
rm -f ~/Library/LaunchAgents/ai.enclawed.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.enclawed.<profile>`. Remove any legacy `com.enclawed.*` plists if present.

### Linux (systemd user unit)

Default unit name is `enclawed-gateway.service` (or `enclawed-gateway-<profile>.service`):

```bash
systemctl --user disable --now enclawed-gateway.service
rm -f ~/.config/systemd/user/enclawed-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Enclawed Gateway` (or `Enclawed Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Enclawed Gateway"
Remove-Item -Force "$env:USERPROFILE\.enclawed\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.enclawed-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://enclawed.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g enclawed@latest`.
Remove it with `npm rm -g enclawed` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `enclawed ...` / `bun run enclawed ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
