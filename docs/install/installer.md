---
summary: "How the installer scripts work (install.sh, install.ps1): signature checks, pinned releases, update, flags, and automation"
read_when:
  - You want to understand `enclawed.com/install.sh`
  - You want to automate installs (CI / headless)
  - You want to install from a GitHub checkout
  - You want to update to a newer release
title: "Installer Internals"
---

# Installer internals

Enclawed ships two installer scripts, served from `www.enclawed.com`.

| Script                       | Platform             | What it does                                                                                                 |
| ---------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`install.sh`](#installsh)   | macOS / Linux / WSL  | Verifies itself, installs a pinned Node.js if needed, installs the pinned Enclawed release, runs onboarding. |
| [`install.ps1`](#installps1) | Windows (PowerShell) | Verifies itself, installs a pinned Node.js if needed, installs the pinned Enclawed release.                  |

## Security model

Both installers follow the same rules:

- **The installer is signed.** Each script carries the install-bootstrap Ed25519 public key and verifies the bytes of the file it is running from against a detached signature (`static/build/runtime-c.bin` for `install.sh`, `static/build/runtime-d.bin` for `install.ps1`) before it changes anything. The verifier is part of the signed script; nothing downloaded is trusted to verify itself. No environment variable or flag skips the check.
- **Piped runs execute verified bytes.** A script piped into `bash` or `iex` cannot hash itself, so it first saves the canonical script to a private temp file and runs that file, which then verifies itself. The piped stream only decides where to download from, never what runs.
- **Only pinned releases install.** An ordinary run installs the exact release pinned in the signed script: a package version plus the SHA-256 of its tarball (npm method), or a tag plus its commit hash (git method). The tarball is hash-checked before npm sees it. An ordinary run never fetches and executes anything that is not pinned.
- **Updates are explicit and signed.** `install.sh update` (or `install.ps1 -Action update`) is the only path to a newer release. It downloads the signed release manifest (`releases/oss/release.json` and its `.bin` signature), verifies it with the key embedded in the installer, and then checks the tarball hash from the manifest before installing.
- **Pinned toolchain.** Node.js is installed from the official nodejs.org archive at a pinned version and SHA-256 (taken from the release's GPG-signed `SHASUMS256.txt`), per user, with no `sudo`. The installers never run NodeSource, Homebrew, nvm, or Ollama installer scripts, and never download a helper binary for their UI. pnpm (git method only) is pinned to an exact version.
- **No dependency lifecycle scripts.** npm installs run with `--ignore-scripts`. Afterwards only an allowlist of native packages is rebuilt, and the package's own `postinstall` runs from the verified tarball.
- **Edition-correct packages.** The default edition installs the open-source `enclawed` package. The enclaved edition installs only the customer tarball delivered with your license (`--edition enclaved --tarball <file> --tarball-sha256 <hex>`); the installer checks the hash and that the tarball contains `enclawed-enclaved`. It never installs the enclaved edition from a public registry.
- **Dev channels are opt-in.** `latest`, `next`, `beta`, `main`, or any other unsigned npm target need the explicit `--dev-channel` flag (`-DevChannel` on Windows). They are not for deployments, and there is no environment variable that turns them on.

To verify the installer yourself before running it, download the script and its signature and run the script as a file:

```bash
curl -fsSLO --proto '=https' --tlsv1.2 https://www.enclawed.com/install.sh
bash install.sh --dry-run
```

The signing procedure is in [Install bootstrap signing](/reference/install-bootstrap-signing).

## Quick commands

<Tabs>
  <Tab title="install.sh">
    ```bash
    curl -fsSL --proto '=https' --tlsv1.2 https://www.enclawed.com/install.sh | bash
    ```

    ```bash
    curl -fsSL --proto '=https' --tlsv1.2 https://www.enclawed.com/install.sh | bash -s -- update
    ```

  </Tab>
  <Tab title="install.ps1">
    ```powershell
    iwr -useb https://www.enclawed.com/install.ps1 | iex
    ```

    ```powershell
    & ([scriptblock]::Create((iwr -useb https://www.enclawed.com/install.ps1))) -Action update -NoOnboard
    ```

  </Tab>
</Tabs>

<Note>
If install succeeds but `enclawed` is not found in a new terminal, see [Node.js troubleshooting](/install/node#troubleshooting).
</Note>

---

<a id="installsh"></a>

## install.sh

### Flow (install.sh)

<Steps>
  <Step title="Verify the installer">
    Hashes the running file and checks the signature with OpenSSL 1.1.1+ or Node. On a host with neither (for example stock macOS), the only step allowed before verification is installing the pinned, hash-checked Node.js; verification is then mandatory before anything else runs.
  </Step>
  <Step title="Ensure Node.js">
    Uses an existing Node.js 22.14+ if present. Otherwise installs the pinned Node.js release to `~/.enclawed/runtime/node-v<version>` and adds it to PATH.
  </Step>
  <Step title="Install Enclawed">
    - `npm` method (default): downloads the pinned tarball, checks its SHA-256, installs it with `--ignore-scripts`, then runs the allowlisted native rebuilds and the package's own postinstall.
    - `git` method: clones the pinned tag, refuses unless `HEAD` equals the pinned commit, installs with `pnpm install --frozen-lockfile`, builds, and installs a wrapper at `~/.local/bin/enclawed`. It never runs `git pull`. If the installer pins no source release, the git method refuses.
    - An existing install at another version is left unchanged (use `update`, or `--force-pinned`).
  </Step>
  <Step title="Post-install tasks">
    - Refreshes a loaded gateway service best-effort (`enclawed gateway install --force`, then restart)
    - Runs `enclawed doctor --non-interactive` on upgrades and git installs (best effort)
    - Attempts onboarding when appropriate (TTY available, onboarding not disabled, and bootstrap/config checks pass)
  </Step>
</Steps>

### Examples (install.sh)

<Tabs>
  <Tab title="Default">
    ```bash
    curl -fsSL --proto '=https' --tlsv1.2 https://www.enclawed.com/install.sh | bash
    ```
  </Tab>
  <Tab title="Update to the newest signed release">
    ```bash
    curl -fsSL --proto '=https' --tlsv1.2 https://www.enclawed.com/install.sh | bash -s -- update
    ```
  </Tab>
  <Tab title="Enclaved edition (licensed tarball)">
    ```bash
    bash install.sh --edition enclaved --tarball ./enclawed-enclaved-<version>.tgz --tarball-sha256 <hex>
    ```
  </Tab>
  <Tab title="Dry run">
    ```bash
    curl -fsSL --proto '=https' --tlsv1.2 https://www.enclawed.com/install.sh | bash -s -- --dry-run
    ```
  </Tab>
  <Tab title="Dev channel (not for deployments)">
    ```bash
    curl -fsSL --proto '=https' --tlsv1.2 https://www.enclawed.com/install.sh | bash -s -- --version main --dev-channel
    ```
  </Tab>
</Tabs>

<AccordionGroup>
  <Accordion title="Flags reference">

| Flag                                  | Description                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `install` / `update`                  | Action: install the pinned release (default), or the newest signed release         |
| `--edition oss\|enclaved`             | Package edition (default: `oss`)                                                   |
| `--tarball <path\|https-url>`         | Licensed tarball (enclaved edition)                                                |
| `--tarball-sha256 <hex>`              | SHA-256 of that tarball                                                            |
| `--install-method npm\|git`           | Choose install method (default: `npm`). Alias: `--method`                          |
| `--npm`                               | Shortcut for npm method                                                            |
| `--git`                               | Shortcut for git method (pinned tag + commit). Alias: `--github`                   |
| `--git-dir <path>`                    | Checkout directory (default: `~/enclawed`). Alias: `--dir`                         |
| `--force-pinned`                      | Replace an existing install that is at another version                             |
| `--dev-channel`                       | Allow unsigned targets (`--version`, `--beta`, git `main`). Not for deployments    |
| `--version <version\|dist-tag\|spec>` | Dev channel only: npm version, dist-tag, or package spec                           |
| `--beta`                              | Dev channel only: beta dist-tag                                                    |
| `--no-prompt`                         | Disable prompts                                                                    |
| `--no-onboard`                        | Skip onboarding                                                                    |
| `--onboard`                           | Enable onboarding                                                                  |
| `--dry-run`                           | Print actions without applying changes (the installer signature is still verified) |
| `--verbose`                           | Enable debug output (`set -x`, npm notice-level logs)                              |
| `--help`                              | Show usage (`-h`)                                                                  |

Unknown arguments are an error (exit code `2`).

  </Accordion>

  <Accordion title="Environment variables reference">

| Variable                                    | Description                                        |
| ------------------------------------------- | -------------------------------------------------- |
| `ENCLAWED_INSTALL_METHOD=git\|npm`          | Install method                                     |
| `ENCLAWED_VERSION=<target>`                 | Dev channel only (refused without `--dev-channel`) |
| `ENCLAWED_BETA=1`                           | Dev channel only (refused without `--dev-channel`) |
| `ENCLAWED_GIT_DIR=<path>`                   | Checkout directory                                 |
| `ENCLAWED_NO_PROMPT=1`                      | Disable prompts                                    |
| `ENCLAWED_NO_ONBOARD=1`                     | Skip onboarding                                    |
| `ENCLAWED_DRY_RUN=1`                        | Dry run mode                                       |
| `ENCLAWED_VERBOSE=1`                        | Debug mode                                         |
| `ENCLAWED_NPM_LOGLEVEL=error\|warn\|notice` | npm log level                                      |
| `SHARP_IGNORE_GLOBAL_LIBVIPS=0\|1`          | Control sharp/libvips behavior (default: `1`)      |

`ENCLAWED_GIT_UPDATE` was removed: the installer never runs `git pull`.

  </Accordion>
</AccordionGroup>

---

<a id="installps1"></a>

## install.ps1

### Flow (install.ps1)

<Steps>
  <Step title="Ensure PowerShell + Windows environment">
    Requires PowerShell 5+.
  </Step>
  <Step title="Ensure Node.js">
    Uses an existing Node.js 22+. Otherwise installs the pinned Node.js zip (SHA-256 checked) to `%LOCALAPPDATA%\enclawed\runtime\node-v<version>`. It does not use winget, Chocolatey, or Scoop for Node.
  </Step>
  <Step title="Verify the installer">
    Checks the running file's signature with the verifier embedded in the script, before Git, npm, or any build step runs.
  </Step>
  <Step title="Install Enclawed">
    - `npm` method (default): pinned tarball, SHA-256 checked, installed with `--ignore-scripts`
    - `git` method: pinned tag + commit (refuses when none is pinned), `pnpm install --frozen-lockfile`, build, wrapper at `%USERPROFILE%\.local\bin\enclawed.cmd`
  </Step>
  <Step title="Post-install tasks">
    - Adds needed bin directory to user PATH when possible
  </Step>
</Steps>

### Examples (install.ps1)

<Tabs>
  <Tab title="Default">
    ```powershell
    iwr -useb https://www.enclawed.com/install.ps1 | iex
    ```
  </Tab>
  <Tab title="Update to the newest signed release">
    ```powershell
    & ([scriptblock]::Create((iwr -useb https://www.enclawed.com/install.ps1))) -Action update
    ```
  </Tab>
  <Tab title="Enclaved edition (licensed tarball)">
    ```powershell
    .\install.ps1 -Edition enclaved -Tarball .\enclawed-enclaved-<version>.tgz -TarballSha256 <hex>
    ```
  </Tab>
  <Tab title="Dry run">
    ```powershell
    & ([scriptblock]::Create((iwr -useb https://www.enclawed.com/install.ps1))) -DryRun
    ```
  </Tab>
</Tabs>

<AccordionGroup>
  <Accordion title="Flags reference">

| Flag                        | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `-Action install\|update`   | Pinned release (default), or the newest signed release           |
| `-Edition oss\|enclaved`    | Package edition (default: `oss`)                                 |
| `-Tarball <path\|url>`      | Licensed tarball (enclaved edition)                              |
| `-TarballSha256 <hex>`      | SHA-256 of that tarball                                          |
| `-InstallMethod npm\|git`   | Install method (default: `npm`)                                  |
| `-ForcePinned`              | Replace an existing install that is at another version           |
| `-DevChannel`               | Allow unsigned targets (`-Tag`, git `main`). Not for deployments |
| `-Tag <tag\|version\|spec>` | Dev channel only: npm dist-tag, version, or package spec         |
| `-GitDir <path>`            | Checkout directory (default: `%USERPROFILE%\enclawed`)           |
| `-NoOnboard`                | Skip onboarding                                                  |
| `-NoGitUpdate`              | Accepted for compatibility; the installer never runs `git pull`  |
| `-DryRun`                   | Print actions only (the installer signature is still verified)   |

  </Accordion>
</AccordionGroup>

<Note>
If `-InstallMethod git` is used and Git is missing, the script exits and prints the Git for Windows link.
</Note>

---

## CI and automation

Use non-interactive flags/env vars for predictable runs.

<Tabs>
  <Tab title="install.sh (non-interactive npm)">
    ```bash
    curl -fsSL --proto '=https' --tlsv1.2 https://www.enclawed.com/install.sh | bash -s -- --no-prompt --no-onboard
    ```
  </Tab>
  <Tab title="install.sh (non-interactive git)">
    ```bash
    curl -fsSL --proto '=https' --tlsv1.2 https://www.enclawed.com/install.sh | bash -s -- --install-method git --no-prompt
    ```
  </Tab>
  <Tab title="install.ps1 (skip onboarding)">
    ```powershell
    & ([scriptblock]::Create((iwr -useb https://www.enclawed.com/install.ps1))) -NoOnboard
    ```
  </Tab>
</Tabs>

---

## Troubleshooting

<AccordionGroup>
  <Accordion title="Why is Git required?">
    Git is required for `git` install method. For `npm` installs, Git is still checked/installed to avoid `spawn git ENOENT` failures when dependencies use git URLs.
  </Accordion>

  <Accordion title="Why does npm hit EACCES on Linux?">
    Some Linux setups point npm global prefix to root-owned paths. `install.sh` can switch prefix to `~/.npm-global` and append PATH exports to shell rc files (when those files exist). When the installer installs its pinned Node.js, the npm prefix is inside `~/.enclawed/runtime` and is already user-writable.
  </Accordion>

  <Accordion title="sharp/libvips issues">
    The scripts default `SHARP_IGNORE_GLOBAL_LIBVIPS=1` to avoid sharp building against system libvips. To override:

    ```bash
    SHARP_IGNORE_GLOBAL_LIBVIPS=0 curl -fsSL --proto '=https' --tlsv1.2 https://www.enclawed.com/install.sh | bash
    ```

  </Accordion>

  <Accordion title='Windows: "npm error spawn git / ENOENT"'>
    Install Git for Windows, reopen PowerShell, rerun installer.
  </Accordion>

  <Accordion title='Windows: "enclawed is not recognized"'>
    Run `npm config get prefix` and add that directory to your user PATH (no `\bin` suffix needed on Windows), then reopen PowerShell.
  </Accordion>

  <Accordion title="Windows: how to get verbose installer output">
    `install.ps1` does not currently expose a `-Verbose` switch.
    Use PowerShell tracing for script-level diagnostics:

    ```powershell
    Set-PSDebug -Trace 1
    & ([scriptblock]::Create((iwr -useb https://www.enclawed.com/install.ps1))) -NoOnboard
    Set-PSDebug -Trace 0
    ```

  </Accordion>

  <Accordion title="enclawed not found after install">
    Usually a PATH issue. See [Node.js troubleshooting](/install/node#troubleshooting).
  </Accordion>
</AccordionGroup>
