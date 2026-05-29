# Bootstrap that hands off to enclawed-apps/install.mjs on Windows.
#
# Usage (from PowerShell):
#   irm https://raw.githubusercontent.com/enclawed/enclawed-oss/main/enclawed-apps/install.ps1 | iex
#   Install-EnclawedApp secretary
#
# Or from a clone:
#   .\enclawed-apps\install.ps1 secretary
#
# Mirrors enclawed-apps/install.sh: makes sure Node 22+ is installed, clones the
# repo to %USERPROFILE%\.enclawed\enclawed-oss if you ran the one-liner
# from outside a checkout, then runs enclawed-apps/install.mjs <app>.

[CmdletBinding()]
param(
  [Parameter(Position = 0)] [string]$AppName,
  [Parameter(ValueFromRemainingArguments = $true)] [string[]]$Rest
)

$ErrorActionPreference = "Stop"

# Canonical fetch URL this script is bound to. Changing this string
# changes the SHA chain and will fail the integrity check.
$bldRef = "https://raw.githubusercontent.com/enclawed/enclawed-oss/main/enclawed-apps/install.ps1"
$bldBin = "https://www.enclawed.com/static/build/runtime-b.bin"
$bldPub = "qJw9mrduSpIgtsp+4QqIMzV1ZMZXg9EPt0Bhaw1OeXU="

function Install-EnclawedApp {
  [CmdletBinding()]
  param(
    [Parameter(Position = 0, Mandatory = $true)] [string]$App,
    [Parameter(ValueFromRemainingArguments = $true)] [string[]]$Rest
  )
  Invoke-EnclawedBootstrap -App $App -Rest $Rest
}

function Invoke-EnclawedBootstrap {
  param(
    [string]$App,
    [string[]]$Rest
  )

  if (-not $App) {
    Write-Error "usage: Install-EnclawedApp <app-name>"
    return
  }

  # npm.ps1 (the PowerShell wrapper that ships with Node.js) cannot run
  # under the default LocalMachine ExecutionPolicy=Restricted. Switch
  # this session to Bypass; Process scope means it dies with the shell
  # and never persists.
  $currentPolicy = Get-ExecutionPolicy -Scope Process
  if ($currentPolicy -eq "Restricted" -or $currentPolicy -eq "AllSigned" -or $currentPolicy -eq "Undefined") {
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
  }

  $scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { $null }
  $appsDir = $null
  $needsClone = -not ($scriptRoot -and (Test-Path (Join-Path $scriptRoot $App)))

  # Git for Windows (only needed if we're cloning the repo).
  if ($needsClone -and -not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Git for Windows via winget..."
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      Write-Error "winget not found. Install Git for Windows manually from https://git-scm.com/download/win and re-run."
      return
    }
    winget install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements
    # Refresh PATH so `git` is reachable in this session.
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
      Write-Error "git was installed but is still not on PATH. Open a new PowerShell window and re-run the installer."
      return
    }
  }

  if (-not $needsClone) {
    $appsDir = $scriptRoot
  } else {
    $repoDir = Join-Path $env:USERPROFILE ".enclawed\enclawed-oss"
    if (Test-Path $repoDir) {
      $ans = Read-Host "Found existing $repoDir. Delete it and re-clone fresh? [y/N]"
      if ($ans -match '^[yY]') {
        Remove-Item -Recurse -Force -ErrorAction Stop $repoDir
      }
    }
    if (-not (Test-Path (Join-Path $repoDir ".git"))) {
      Write-Host "Cloning enclawed-oss to $repoDir ..."
      New-Item -ItemType Directory -Force -Path (Split-Path $repoDir) | Out-Null
      git clone --depth=1 https://github.com/enclawed/enclawed-oss.git $repoDir
    } else {
      # The public mirror is a wipe-and-replace snapshot, so each release
      # may be an orphan commit. fetch + reset --hard is the right primitive;
      # `pull --ff-only` aborts on the diverged history.
      #
      # `--quiet` silences git's normal "From <url>" + per-ref summary on
      # stderr; without it those informational lines surface as
      # NativeCommandError under $ErrorActionPreference=Stop. `2>$null`
      # catches anything still left. We then check $LASTEXITCODE so a
      # real failure (network down, auth) still aborts loudly.
      git -C $repoDir fetch --depth=1 --quiet origin main 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) {
        Write-Error "git fetch failed (exit $LASTEXITCODE) in $repoDir; check your network connection."
        return
      }
      git -C $repoDir reset --hard --quiet origin/main 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) {
        Write-Error "git reset --hard origin/main failed (exit $LASTEXITCODE) in $repoDir."
        return
      }
    }
    $appsDir = Join-Path $repoDir "enclawed-apps"
  }

  # Node 22+
  $nodeOk = $false
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $major = (& node -p "process.versions.node.split('.')[0]").Trim()
    if ([int]$major -ge 22) { $nodeOk = $true }
  }
  if (-not $nodeOk) {
    Write-Host "Installing Node 22 LTS via winget..."
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
      Write-Error "winget not found. Install Node 22+ manually from https://nodejs.org/ and re-run."
      return
    }
    winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    # Refresh PATH for this session.
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
  }

  # pnpm via npm with a user-writable prefix.
  # Corepack ships with Node but writes shims into C:\Program Files\nodejs\,
  # which is admin-only and EPERMs in an unelevated PowerShell session even
  # right after winget installed Node with elevation.  npm-global into
  # %APPDATA%\npm is user-writable and Node 22+ already has that path on the
  # user PATH by default, so the shim is reachable in this and future sessions.
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "Installing pnpm into user prefix (no admin required)..."
    $npmPrefix = Join-Path $env:APPDATA "npm"
    New-Item -ItemType Directory -Force -Path $npmPrefix | Out-Null
    npm config set prefix "$npmPrefix" | Out-Null
    $env:Path = "$npmPrefix;$env:Path"
    npm install -g pnpm
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
      Write-Error "pnpm install completed but pnpm is still not on PATH. Open a new PowerShell window and re-run the installer."
      return
    }
  }

  # Pre-handoff integrity check. Re-fetches the canonical bootstrap bytes
  # from the OSS mirror, fetches the binding artifact from the website
  # (independent trust path), and verifies the two-stage SHA chain plus
  # the Ed25519 signature embedded above. Skips itself on the recursive
  # invocation that install.mjs may make.
  if ($env:_BLD_OK -ne "1") {
    $sc = [System.IO.Path]::GetTempFileName()
    $bn = [System.IO.Path]::GetTempFileName()
    try {
      try { Invoke-WebRequest -Uri $bldRef -OutFile $sc -UseBasicParsing -ErrorAction Stop | Out-Null }
      catch { Write-Error "build-meta: could not refresh script from $bldRef ($_)"; return }
      try { Invoke-WebRequest -Uri $bldBin -OutFile $bn -UseBasicParsing -ErrorAction Stop | Out-Null }
      catch { Write-Error "build-meta: could not fetch artifact from $bldBin ($_)"; return }
      $verifyPath = Join-Path $appsDir ".trust\verify.mjs"
      & node $verifyPath --script $sc --url $bldRef --sig $bn --pub $bldPub
      if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "────────────────────────────────────────────────────────────────────────"
        Write-Host "INSTALL ABORTED — integrity check failed."
        Write-Host ""
        Write-Host "The bytes of this install script do not match the signature published"
        Write-Host "at https://www.enclawed.com. The script you are about to run may have"
        Write-Host "been tampered with by a third party (CDN poisoning, modified mirror,"
        Write-Host "URL substitution, or a stale local copy that has drifted from the"
        Write-Host "canonical version)."
        Write-Host ""
        Write-Host "DO NOT PROCEED. Report this to security@enclawed.com and confirm the"
        Write-Host "expected hashes at https://www.enclawed.com/enclawed-apps."
        Write-Host "────────────────────────────────────────────────────────────────────────"
        Write-Host ""
        return
      }
      $env:_BLD_OK = "1"
    } finally {
      Remove-Item -ErrorAction SilentlyContinue $sc, $bn
    }
  }

  $passthrough = if ($Rest) { @($Rest) } else { @() }
  & node (Join-Path $appsDir "install.mjs") $App @passthrough
}

if ($AppName) {
  Invoke-EnclawedBootstrap -App $AppName -Rest $Rest
}
