# enclawed Installer for Windows (PowerShell)
#
# Recommended (verify before you run anything):
#   iwr -useb https://www.enclawed.com/install.ps1 -OutFile install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
# Piped (convenience):
#   iwr -useb https://www.enclawed.com/install.ps1 | iex
#
# Security model (see docs/install/installer.md):
#   - This script is signed (install-bootstrap Ed25519 key, pinned below as
#     $bldPub). It verifies the bytes of the file it RUNS FROM, with a verifier
#     embedded here, before git, npm or any build step runs. Piped runs first
#     save the canonical script to a private temp file and re-run that file.
#     No environment variable skips the check.
#   - It installs only the release pinned in this signed file (exact version
#     plus SHA-256 of the tarball, or tag plus commit for -InstallMethod git).
#   - "update" (the -Action parameter) is the only path to a newer release: it
#     verifies the signed release manifest, then the tarball hash.
#   - Node.js comes from the official nodejs.org zip at a pinned version and
#     SHA-256 (no winget/choco/scoop for Node).

param(
    [Parameter(Position = 0)]
    [ValidateSet("install", "update")]
    [string]$Action = "install",
    [ValidateSet("oss", "enclaved")]
    [string]$Edition = "oss",
    [string]$Tarball = "",
    [string]$TarballSha256 = "",
    [string]$InstallMethod = "npm",
    [string]$Tag = "pinned",
    [switch]$DevChannel,
    [switch]$ForcePinned,
    [string]$GitDir = "$env:USERPROFILE\enclawed",
    [switch]$NoOnboard,
    [switch]$NoGitUpdate,
    [switch]$DryRun
)

# ---- Pinned trust (changing any byte of this file requires re-signing) ----
$bldRef = "https://www.enclawed.com/install.ps1"
$bldBin = "https://www.enclawed.com/static/build/runtime-d.bin"
$bldPub = "db6RgWCvz88kRfsCiNeTI8U0TJsDMA0tOGMxbkjJwIk="

$ReleaseManifestUrl = "https://www.enclawed.com/releases/oss/release.json"
$ReleaseManifestSigUrl = "https://www.enclawed.com/releases/oss/release.json.bin"

$PinnedPackage = "enclawed"
$PinnedVersion = "1.0.1"
$PinnedTarballUrl = "https://registry.npmjs.org/enclawed/-/enclawed-1.0.1.tgz"
$PinnedTarballSha256 = "b3ad59f2363686cedf276b8a356a25622fc84a9470a0c8b61a4ab3c2337779ab"
# Empty means -InstallMethod git refuses (fail closed) until a release fills them in.
$PinnedGitRepo = "https://github.com/enclawed/enclawed-oss.git"
$PinnedGitTag = ""
$PinnedGitCommit = ""

# From the GPG-signed SHASUMS256.txt of the release (checked against
# github.com/nodejs/release-keys).
$NodePinnedVersion = "24.22.3"
$NodeSha256 = @{
    "win-x64" = "e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f"
    "win-arm64" = "b3cc74a295b39d4f273271e96f58c06dd2b35757ca12abec64c7d0598b434f14"
}
$PnpmPinnedVersion = "10.32.1"
# npm installs use --ignore-scripts, then rebuild only these packages.
$NpmBuildAllowlist = @("sharp", "@lydell/node-pty", "@matrix-org/matrix-sdk-crypto-nodejs", "protobufjs", "@whiskeysockets/baileys")

# ---- Run from a file, never from a pipe ----
if (-not $PSCommandPath) {
    $selfDir = Join-Path ([System.IO.Path]::GetTempPath()) ("enclawed-install." + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $selfDir -Force | Out-Null
    $selfFile = Join-Path $selfDir "install.ps1"
    Invoke-WebRequest -Uri $bldRef -OutFile $selfFile -UseBasicParsing -ErrorAction Stop | Out-Null
    $forward = @()
    foreach ($kv in $PSBoundParameters.GetEnumerator()) {
        if ($kv.Value -is [System.Management.Automation.SwitchParameter]) {
            if ($kv.Value.IsPresent) { $forward += "-$($kv.Key)" }
        } else {
            $forward += "-$($kv.Key)"
            $forward += [string]$kv.Value
        }
    }
    $hostExe = (Get-Process -Id $PID).Path
    & $hostExe -NoProfile -ExecutionPolicy Bypass -File $selfFile @forward
    $code = $LASTEXITCODE
    Remove-Item -LiteralPath $selfDir -Recurse -Force -ErrorAction SilentlyContinue
    # `return`, not `exit`: under `iwr | iex` exit would close the user's shell.
    $global:LASTEXITCODE = $code
    return
}

# Embedded verifier (run with Node). Kept in this signed file so verification
# never depends on code fetched from the network. Arguments:
#   <file> <canonical-url> <96-byte artifact> <raw Ed25519 public key, base64>
$NodeVerifier = @'
const fs = require("node:fs");
const c = require("node:crypto");
const [file, url, art, pubB64] = process.argv.slice(1);
const a = fs.readFileSync(art);
if (a.length !== 96) { console.error("signature artifact is " + a.length + " bytes, expected 96"); process.exit(3); }
const s1 = c.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const s2 = c.createHash("sha256").update(Buffer.concat([Buffer.from(s1, "utf8"), Buffer.from(url, "utf8")])).digest();
if (!s2.equals(a.subarray(0, 32))) { console.error("hash mismatch: these bytes are not the signed release"); process.exit(4); }
const raw = Buffer.from(pubB64, "base64");
if (raw.length !== 32) { console.error("bad pinned public key"); process.exit(5); }
const key = c.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]), format: "der", type: "spki" });
if (!c.verify(null, s2, key, a.subarray(32, 96))) { console.error("signature does not verify"); process.exit(6); }
'@

$ErrorActionPreference = "Stop"

# Colors
$ACCENT = "`e[38;2;255;77;77m"    # coral-bright
$SUCCESS = "`e[38;2;0;229;204m"    # cyan-bright
$WARN = "`e[38;2;255;176;32m"     # amber
$ERROR = "`e[38;2;230;57;70m"     # coral-mid
$MUTED = "`e[38;2;90;100;128m"    # text-muted
$NC = "`e[0m"                     # No Color

function Write-Host {
    param([string]$Message, [string]$Level = "info")
    $msg = switch ($Level) {
        "success" { "$SUCCESS✓$NC $Message" }
        "warn" { "$WARN!$NC $Message" }
        "error" { "$ERROR✗$NC $Message" }
        default { "$MUTED·$NC $Message" }
    }
    Microsoft.PowerShell.Utility\Write-Host $msg
}

function Write-Banner {
    Write-Host ""
    Write-Host "${ACCENT}  🦞🔒 enclawed Installer$NC" -Level info
    Write-Host "${MUTED}  All your chats, one enclawed.$NC" -Level info
    Write-Host ""
}

function Get-ExecutionPolicyStatus {
    $policy = Get-ExecutionPolicy
    if ($policy -eq "Restricted" -or $policy -eq "AllSigned") {
        return @{ Blocked = $true; Policy = $policy }
    }
    return @{ Blocked = $false; Policy = $policy }
}

function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-ExecutionPolicy {
    $status = Get-ExecutionPolicyStatus
    if ($status.Blocked) {
        Write-Host "PowerShell execution policy is set to: $($status.Policy)" -Level warn
        Write-Host "This prevents scripts like npm.ps1 from running." -Level warn
        Write-Host ""
        
        # Try to set execution policy for current process
        try {
            Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process -ErrorAction Stop
            Write-Host "Set execution policy to RemoteSigned for current process" -Level success
            return $true
        } catch {
            Write-Host "Could not automatically set execution policy" -Level error
            Write-Host ""
            Write-Host "To fix this, run:" -Level info
            Write-Host "  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process" -Level info
            Write-Host ""
            Write-Host "Or run PowerShell as Administrator and execute:" -Level info
            Write-Host "  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine" -Level info
            return $false
        }
    }
    return $true
}

function Get-NodeVersion {
    try {
        $version = node --version 2>$null
        if ($version) {
            return $version -replace '^v', ''
        }
    } catch { }
    return $null
}

function Get-NpmVersion {
    try {
        $version = npm --version 2>$null
        if ($version) {
            return $version
        }
    } catch { }
    return $null
}

function Get-NodeRuntimeDir {
    return Join-Path $env:LOCALAPPDATA "enclawed\runtime\node-v$NodePinnedVersion"
}

function Enable-PinnedNode {
    $dir = Get-NodeRuntimeDir
    if (Test-Path (Join-Path $dir "node.exe")) {
        if ($env:Path -notlike "$dir;*") { $env:Path = "$dir;$env:Path" }
        return $true
    }
    return $false
}

function Install-Node {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "win-arm64" } else { "win-x64" }
    $expected = $NodeSha256[$arch]
    if (-not $expected) {
        Write-Host "No pinned Node.js build for $arch; install Node.js 22+ from nodejs.org and rerun" -Level error
        return $false
    }
    if (Enable-PinnedNode) {
        Write-Host "Pinned Node.js v$NodePinnedVersion already installed" -Level success
        return $true
    }
    Write-Host "Installing Node.js v$NodePinnedVersion (official zip, SHA-256 pinned)..." -Level info
    $zip = Join-Path ([System.IO.Path]::GetTempPath()) ("node-" + [guid]::NewGuid().ToString("N") + ".zip")
    try {
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodePinnedVersion/node-v$NodePinnedVersion-$arch.zip" -OutFile $zip -UseBasicParsing -ErrorAction Stop | Out-Null
        $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $expected) {
            Write-Host "Node.js zip hash mismatch (expected $expected, got $actual); refusing to install it" -Level error
            return $false
        }
        $dir = Get-NodeRuntimeDir
        $stage = "$dir.staging"
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
        $inner = Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
        Move-Item -LiteralPath $inner.FullName -Destination $dir
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    } finally {
        Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
    }
    Add-ToPath -Path (Get-NodeRuntimeDir)
    [void](Enable-PinnedNode)
    Write-Host "Node.js v$NodePinnedVersion installed" -Level success
    return $true
}

function Ensure-Node {
    [void](Enable-PinnedNode)
    $nodeVersion = Get-NodeVersion
    if ($nodeVersion) {
        $major = [int]($nodeVersion -split '\.')[0]
        if ($major -ge 22) {
            Write-Host "Node.js v$nodeVersion found" -Level success
            return $true
        }
        Write-Host "Node.js v$nodeVersion found, but need v22+" -Level warn
    }
    return Install-Node
}

function Get-GitVersion {
    try {
        $version = git --version 2>$null
        if ($version) {
            return $version
        }
    } catch { }
    return $null
}

function Install-Git {
    Write-Host "Git not found" -Level info
    
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "  Installing Git via winget..." -Level info
        try {
            winget install Git.Git --accept-package-agreements --accept-source-agreements 2>&1 | Out-Null
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Write-Host "  Git installed" -Level success
            return $true
        } catch {
            Write-Host "  Winget install failed" -Level warn
        }
    }
    
    Write-Host "Please install Git for Windows from: https://git-scm.com" -Level error
    return $false
}

function Ensure-Git {
    $gitVersion = Get-GitVersion
    if ($gitVersion) {
        Write-Host "$gitVersion found" -Level success
        return $true
    }
    return Install-Git
}

function Read-TrimmedFileText {
    param([string]$Path)

    if (!(Test-Path -LiteralPath $Path)) {
        return ""
    }

    return ((Get-Content -LiteralPath $Path -Raw) -replace "(\r?\n)+$", "")
}

function ConvertTo-PowerShellSingleQuotedLiteral {
    param([string]$Value)

    return "'" + ($Value -replace "'", "''") + "'"
}

function Invoke-NativeCommandCapture {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$Arguments = @()
    )

    $stdoutPath = [System.IO.Path]::GetTempFileName()
    $stderrPath = [System.IO.Path]::GetTempFileName()

    try {
        $startFilePath = $FilePath
        $startArguments = $Arguments

        if ($FilePath -match '(?i)\.(cmd|bat)$') {
            # Start-Process cannot directly redirect stdio for command shims like
            # npm.cmd. Run them inside a nested PowerShell so the shim executes
            # normally while stdout/stderr still flow back to these temp files.
            $commandParts = @(
                ConvertTo-PowerShellSingleQuotedLiteral -Value $FilePath
            )
            foreach ($argument in $Arguments) {
                $commandParts += ConvertTo-PowerShellSingleQuotedLiteral -Value $argument
            }
            $commandScript = "& " + ($commandParts -join " ") + "`nexit `$LASTEXITCODE"
            $startFilePath = "powershell.exe"
            $startArguments = @(
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                $commandScript
            )
        }

        $process = Start-Process -FilePath $startFilePath `
            -ArgumentList $startArguments `
            -Wait `
            -PassThru `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath

        return @{
            ExitCode = $process.ExitCode
            Stdout = Read-TrimmedFileText -Path $stdoutPath
            Stderr = Read-TrimmedFileText -Path $stderrPath
        }
    } finally {
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
}

# Verify <file> as the signed bytes published at <url>, against <artifact>.
function Test-SignedFile {
    param([string]$File, [string]$Url, [string]$Artifact)
    & node -e $NodeVerifier $File $Url $Artifact $bldPub
    return ($LASTEXITCODE -eq 0)
}

function Assert-SelfVerified {
    $art = [System.IO.Path]::GetTempFileName()
    try {
        try { Invoke-WebRequest -Uri $bldBin -OutFile $art -UseBasicParsing -ErrorAction Stop | Out-Null }
        catch { Write-Host "Cannot fetch the installer signature ($bldBin); refusing to continue" -Level error; exit 1 }
        if (-not (Test-SignedFile -File $PSCommandPath -Url $bldRef -Artifact $art)) {
            Write-Host ""
            Write-Host "INSTALL ABORTED -- integrity check failed." -Level error
            Write-Host "This installer's bytes are not the release signed by Enclawed, Inc." -Level error
            Write-Host "Download it again from $bldRef; if this repeats, report it to security@enclawed.com." -Level error
            exit 1
        }
        Write-Host "Installer signature verified" -Level success
    } finally {
        Remove-Item -LiteralPath $art -Force -ErrorAction SilentlyContinue
    }
}

# Copy or download a tarball and check its SHA-256. Returns the verified path.
function Get-VerifiedTarball {
    param([string]$Source, [string]$Expected)
    if ($Expected -notmatch '^[0-9a-f]{64}$') {
        Write-Host "No valid SHA-256 for $Source; refusing to install it" -Level error
        exit 1
    }
    $out = Join-Path ([System.IO.Path]::GetTempPath()) ("enclawed-" + [guid]::NewGuid().ToString("N") + ".tgz")
    if ($Source -like "https://*") {
        Invoke-WebRequest -Uri $Source -OutFile $out -UseBasicParsing -ErrorAction Stop | Out-Null
    } elseif (Test-Path -LiteralPath $Source -PathType Leaf) {
        Copy-Item -LiteralPath $Source -Destination $out
    } else {
        Write-Host "Tarball not found (or not https): $Source" -Level error
        exit 1
    }
    $actual = (Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $Expected.ToLowerInvariant()) {
        Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue
        Write-Host "Tarball hash mismatch for $Source (expected $Expected, got $actual); refusing to install it" -Level error
        exit 1
    }
    return $out
}

function Get-TarballPackageName {
    param([string]$Path)
    $json = & tar.exe -xzOf $Path package/package.json
    return ((($json -join "`n") | ConvertFrom-Json).name)
}

# "update": the newest release, only from the signed manifest.
function Resolve-SignedUpdate {
    $manifest = [System.IO.Path]::GetTempFileName()
    $sig = [System.IO.Path]::GetTempFileName()
    try {
        Invoke-WebRequest -Uri $ReleaseManifestUrl -OutFile $manifest -UseBasicParsing -ErrorAction Stop | Out-Null
        Invoke-WebRequest -Uri $ReleaseManifestSigUrl -OutFile $sig -UseBasicParsing -ErrorAction Stop | Out-Null
        if (-not (Test-SignedFile -File $manifest -Url $ReleaseManifestUrl -Artifact $sig)) {
            Write-Host "The release manifest at $ReleaseManifestUrl does not verify; refusing to update" -Level error
            exit 1
        }
        $m = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
        $ok = ($m.schema -eq 1) -and ($m.edition -eq "oss") -and ($m.package -is [string]) -and
            ($m.version -match '^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$') -and ([string]$m.tag).Length -gt 0 -and
            ($m.commit -match '^[0-9a-f]{40}$') -and ($m.tarballUrl -like "https://*") -and
            ($m.tarballSha256 -match '^[0-9a-f]{64}$')
        if (-not $ok) {
            Write-Host "The signed release manifest is malformed; refusing to update" -Level error
            exit 1
        }
        $script:PinnedPackage = $m.package
        $script:PinnedVersion = $m.version
        $script:PinnedGitTag = $m.tag
        $script:PinnedGitCommit = $m.commit
        $script:PinnedTarballUrl = $m.tarballUrl
        $script:PinnedTarballSha256 = $m.tarballSha256
        Write-Host "Signed release: $($m.package)@$($m.version) ($($m.tag) @ $($m.commit))" -Level success
    } finally {
        Remove-Item -LiteralPath $manifest, $sig -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-AllowedInstallScripts {
    param([string]$PackageName)
    $root = (Invoke-NativeCommandCapture -FilePath "npm.cmd" -Arguments @("root", "-g")).Stdout
    $pkgDir = Join-Path $root $PackageName
    if (!(Test-Path -LiteralPath $pkgDir)) { return }
    $present = @($NpmBuildAllowlist | Where-Object { Test-Path -LiteralPath (Join-Path $pkgDir "node_modules\$_") })
    if ($present.Count -gt 0) {
        Push-Location $pkgDir
        try { & npm.cmd rebuild --no-audit --no-fund @present 2>&1 | Out-Null } finally { Pop-Location }
    }
    $post = Join-Path $pkgDir "scripts\postinstall-bundled-plugins.mjs"
    if (Test-Path -LiteralPath $post) {
        Push-Location $pkgDir
        try { & node $post } finally { Pop-Location }
    }
}

function Install-enclawedNpm {
    $packageName = $PinnedPackage
    if ($Edition -eq "enclaved") {
        if (-not $Tarball -or -not $TarballSha256) {
            Write-Host "The enclaved edition installs only your licensed tarball: pass -Tarball <file> -TarballSha256 <hex>" -Level error
            exit 2
        }
        $installSpec = Get-VerifiedTarball -Source $Tarball -Expected $TarballSha256
        $packageName = Get-TarballPackageName -Path $installSpec
        if ($packageName -ne "enclawed-enclaved") {
            Write-Host "That tarball contains `"$packageName`", not enclawed-enclaved; refusing to install it" -Level error
            exit 1
        }
    } elseif ($DevChannel) {
        $installSpec = Resolve-PackageInstallSpec -Target $(if ($Tag -eq "pinned") { "latest" } else { $Tag })
        $packageName = "enclawed"
        Write-Host "DEV CHANNEL: installing $installSpec without signature verification" -Level warn
    } else {
        if ($Action -eq "update") {
            Resolve-SignedUpdate
            $packageName = $script:PinnedPackage
        }
        $installSpec = Get-VerifiedTarball -Source $script:PinnedTarballUrl -Expected $script:PinnedTarballSha256
        if ((Get-TarballPackageName -Path $installSpec) -ne $packageName) {
            Write-Host "The verified tarball does not contain $packageName; refusing to install it" -Level error
            exit 1
        }
        Write-Host "Installing $packageName v$($script:PinnedVersion) (SHA-256 verified)..." -Level info
    }

    try {
        # Run npm out-of-process so warning chatter on stderr does not get
        # promoted into a terminating PowerShell error while the install succeeds.
        $installResult = Invoke-NativeCommandCapture -FilePath "npm.cmd" -Arguments @(
            "install",
            "-g",
            "--ignore-scripts",
            $installSpec,
            "--no-fund",
            "--no-audit"
        )
        if ($installResult.Stdout) {
            Microsoft.PowerShell.Utility\Write-Output $installResult.Stdout
        }
        if ($installResult.Stderr) {
            Microsoft.PowerShell.Utility\Write-Output $installResult.Stderr
        }
        if ($installResult.ExitCode -ne 0) {
            Write-Host "npm install failed with exit code $($installResult.ExitCode)" -Level error
            return $false
        }
        Invoke-AllowedInstallScripts -PackageName $packageName
        Write-Host "enclawed installed" -Level success
        return $true
    } catch {
        Write-Host "npm install failed: $_" -Level error
        return $false
    }
}

function Install-enclawedGit {
    param([string]$RepoDir)

    $ref = $script:PinnedGitTag
    $commit = $script:PinnedGitCommit
    if ($DevChannel) {
        Write-Host "DEV CHANNEL: building unsigned main HEAD of $PinnedGitRepo" -Level warn
        $ref = "main"
        $commit = ""
    } elseif (-not $ref -or $commit -notmatch '^[0-9a-f]{40}$') {
        Write-Host "This installer pins no source release (tag + commit); refusing -InstallMethod git" -Level error
        Write-Host "Use the default npm method (pinned, hash-verified tarball), or a newer signed installer." -Level info
        return $false
    }

    Write-Host "Installing enclawed from git ($ref)..." -Level info
    if (!(Test-Path (Join-Path $RepoDir ".git"))) {
        git clone --depth 1 --branch $ref $PinnedGitRepo $RepoDir 2>&1
    } else {
        if (git -C $RepoDir status --porcelain) {
            Write-Host "$RepoDir has local changes; refusing to build it as a pinned release" -Level error
            return $false
        }
        git -C $RepoDir fetch --depth 1 origin $ref 2>&1
        git -C $RepoDir checkout --detach FETCH_HEAD 2>&1
    }
    if ($commit) {
        $head = (git -C $RepoDir rev-parse HEAD).Trim()
        if ($head -ne $commit) {
            Write-Host "Checkout is at $head, but this installer pins $ref to $commit; refusing to build it" -Level error
            return $false
        }
        Write-Host "Source pinned: $ref @ $commit" -Level success
    }

    if (!(Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Host "  Installing pnpm $PnpmPinnedVersion..." -Level info
        npm install -g --ignore-scripts "pnpm@$PnpmPinnedVersion" 2>&1
    }

    Write-Host "  Installing dependencies..." -Level info
    pnpm install --dir $RepoDir --frozen-lockfile 2>&1

    Write-Host "  Building..." -Level info
    pnpm --dir $RepoDir build 2>&1

    $wrapperDir = "$env:USERPROFILE\.local\bin"
    if (!(Test-Path $wrapperDir)) {
        New-Item -ItemType Directory -Path $wrapperDir -Force | Out-Null
    }

    @"
@echo off
node "$RepoDir\dist\entry.js" %*
"@ | Out-File -FilePath "$wrapperDir\enclawed.cmd" -Encoding ASCII -Force

    Write-Host "enclawed installed" -Level success
    return $true
}

function Test-ExplicitPackageInstallSpec {
    param([string]$Target)

    if ([string]::IsNullOrWhiteSpace($Target)) {
        return $false
    }

    return $Target.Contains("://") -or
        $Target.Contains("#") -or
        $Target -match '^(file|github|git\+ssh|git\+https|git\+http|git\+file|npm):'
}

# DEV CHANNEL only.
function Resolve-PackageInstallSpec {
    param([string]$Target = "latest")

    $trimmed = $Target.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        return "enclawed@latest"
    }
    if ($trimmed.ToLowerInvariant() -eq "main") {
        return "github:enclawed/enclawed-oss#main"
    }
    if (Test-ExplicitPackageInstallSpec -Target $trimmed) {
        return $trimmed
    }
    return "enclawed@$trimmed"
}

function Add-ToPath {
    param([string]$Path)
    
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$Path*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$Path", "User")
        Write-Host "Added $Path to user PATH" -Level info
    }
}

# Main
function Main {
    Write-Banner

    Write-Host "Windows detected" -Level success

    if (-not $DevChannel -and $Tag -ne "pinned") {
        Write-Host "-Tag selects an unsigned target; add -DevChannel to allow that (not for deployments)" -Level error
        Write-Host "Deployments install the pinned release (default) or the newest signed release: -Action update" -Level info
        exit 2
    }
    if ($DevChannel -and $Edition -eq "enclaved") {
        Write-Host "-DevChannel is not available for the enclaved edition" -Level error
        exit 2
    }

    # Check and handle execution policy FIRST, before any npm calls
    if (!(Ensure-ExecutionPolicy)) {
        Write-Host ""
        Write-Host "Installation cannot continue due to execution policy restrictions" -Level error
        exit 1
    }

    # Node first (pinned, hash-checked zip when none is present): the embedded
    # verifier runs on it, and nothing else runs before verification.
    if (!(Ensure-Node)) {
        exit 1
    }
    Assert-SelfVerified

    if ($Action -eq "install" -and -not $DevChannel -and $Edition -eq "oss" -and -not $ForcePinned) {
        $existing = $null
        try { $existing = (& enclawed --version 2>$null | Select-Object -First 1) } catch { }
        if ($existing -and ($existing -notlike "*$PinnedVersion*")) {
            Write-Host "enclawed $existing is already installed; this installer pins $PinnedVersion. Leaving it unchanged." -Level info
            Write-Host "Use -Action update for the newest signed release, or -ForcePinned." -Level info
            exit 0
        }
    }

    if ($InstallMethod -eq "git") {
        if (!(Ensure-Git)) {
            exit 1
        }

        if ($DryRun) {
            Write-Host "[DRY RUN] Would install enclawed from git to $GitDir" -Level info
        } else {
            if ($Action -eq "update" -and -not $DevChannel) { Resolve-SignedUpdate }
            if (!(Install-enclawedGit -RepoDir $GitDir)) {
                exit 1
            }
        }
    } else {
        if ($DryRun) {
            Write-Host "[DRY RUN] Would install $PinnedPackage@$PinnedVersion (sha256 $PinnedTarballSha256), edition $Edition, action $Action" -Level info
        } else {
            if (!(Install-enclawedNpm)) {
                exit 1
            }
        }
    }

    # Try to add npm global bin to PATH
    try {
        $prefixResult = Invoke-NativeCommandCapture -FilePath "npm.cmd" -Arguments @(
            "config",
            "get",
            "prefix"
        )
        $npmPrefix = $prefixResult.Stdout
        if ($prefixResult.ExitCode -eq 0 -and $npmPrefix) {
            Add-ToPath -Path "$npmPrefix"
        }
    } catch { }

    if (!$NoOnboard -and !$DryRun) {
        Write-Host ""
        Write-Host "Run 'enclawed onboard' to complete setup" -Level info
    }

    Write-Host ""
    Write-Host "🦞🔒 enclawed installed successfully!" -Level success
}

Main
