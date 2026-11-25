// Regression tests for the core-product installers (scripts/install.sh and
// scripts/install.ps1, copies of the signed installers the website serves): they verify the bytes they run from, install only a
// pinned (or signed-manifest) release, never fetch-and-execute on an ordinary
// run, and have no environment variable that skips verification.
//
// The behavioral cases run a copy of install.sh in a sandbox: `curl` is a stub
// that serves local files and logs every URL, HOME is a temp dir, and the
// embedded trust root is swapped for a throwaway test key (the real key is
// never needed).

import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeStageTwo } from "../../scripts/lib/install-bootstrap-trust.mjs";

const SH = fs.readFileSync("scripts/install.sh", "utf8");
const PS1 = fs.readFileSync("scripts/install.ps1", "utf8");
const REAL_PUB = "db6RgWCvz88kRfsCiNeTI8U0TJsDMA0tOGMxbkjJwIk=";
const SELF_URL = "https://www.enclawed.com/install.sh";
const SIG_URL = "https://www.enclawed.com/static/build/runtime-c.bin";
const MANIFEST_URL = "https://www.enclawed.com/releases/oss/release.json";

function rawPubB64(key: KeyObject): string {
  const der = key.export({ format: "der", type: "spki" });
  return Buffer.from(der.subarray(der.length - 32)).toString("base64");
}

function artifactFor(bytes: Buffer, url: string, privateKey: KeyObject): Buffer {
  const s2 = computeStageTwo(bytes, url);
  return Buffer.concat([s2, sign(null, s2, privateKey)]);
}

describe("core installer: static guarantees", () => {
  it("has no environment skip of the integrity check", () => {
    expect(SH).not.toMatch(/_BLD_OK/);
    expect(PS1).not.toMatch(/_BLD_OK/);
  });

  it("never runs a vendor installer script or downloads a UI binary", () => {
    expect(SH).not.toMatch(/nodesource\.com/);
    expect(SH).not.toMatch(/Homebrew\/install/);
    expect(SH).not.toMatch(/run_remote_bash/);
    expect(SH).not.toMatch(/charmbracelet\/gum\/releases/);
    expect(PS1).not.toMatch(/OpenJS\.NodeJS/);
    expect(PS1).not.toMatch(/choco install nodejs|scoop install nodejs/);
  });

  it("pins Node.js, pnpm and the release by exact version and SHA-256", () => {
    expect(SH).toMatch(/^NODE_PINNED_VERSION="\d+\.\d+\.\d+"$/mu);
    for (const name of ["LINUX_X64", "LINUX_ARM64", "DARWIN_X64", "DARWIN_ARM64"]) {
      expect(SH).toMatch(new RegExp(`^NODE_SHA256_${name}="[0-9a-f]{64}"$`, "mu"));
    }
    expect(SH).toMatch(/^ENCLAWED_PINNED_VERSION="\d+\.\d+\.\d+"$/mu);
    expect(SH).toMatch(/^ENCLAWED_PINNED_TARBALL_SHA256="[0-9a-f]{64}"$/mu);
    expect(SH).toMatch(/^PNPM_PINNED_VERSION="\d+\.\d+\.\d+"$/mu);
    expect(SH).not.toMatch(/pnpm@10(["\s]|$)/mu);
    expect(PS1).toMatch(/"win-x64" = "[0-9a-f]{64}"/u);
    expect(PS1).toMatch(/^\$PinnedTarballSha256 = "[0-9a-f]{64}"$/mu);
    // The default target is the pin, not a dist-tag.
    expect(SH).toContain("ENCLAWED_VERSION=${ENCLAWED_VERSION:-pinned}");
    expect(PS1).toContain('[string]$Tag = "pinned"');
  });

  it("does not run dependency lifecycle scripts and never git-pulls on an ordinary run", () => {
    expect(SH).toContain('cmd+=(--no-fund --no-audit --ignore-scripts install -g "$spec")');
    expect(PS1).toMatch(/"install",\s+"-g",\s+"--ignore-scripts"/u);
    expect(SH).toContain("GIT_UPDATE=0");
    expect(SH).not.toMatch(/pull --rebase/);
    expect(PS1).not.toMatch(/pull --rebase/);
  });

  it("no longer links the dead docs.enclawed.com FAQ", () => {
    expect(SH).not.toContain("docs.enclawed.com");
  });
});

describe("core installer: embedded verifier (shared by install.sh and install.ps1)", () => {
  const shJs = /ENCLAWED_NODE_VERIFIER='\n([\s\S]*?)\n'/u.exec(SH)?.[1];
  const psJs = /\$NodeVerifier = @'\r?\n([\s\S]*?)\r?\n'@/u.exec(PS1)?.[1];

  it("is the same code in both installers", () => {
    expect(shJs).toBeTruthy();
    expect(psJs).toBe(shJs);
  });

  it("accepts the signed bytes and refuses a single changed byte", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-verifier-"));
    try {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const file = path.join(dir, "install.ps1");
      const art = path.join(dir, "sig.bin");
      const body = Buffer.from("Write-Host 'hello'\n");
      fs.writeFileSync(file, body);
      fs.writeFileSync(art, artifactFor(body, "https://www.enclawed.com/install.ps1", privateKey));
      const run = () =>
        spawnSync(
          process.execPath,
          ["-e", psJs!, file, "https://www.enclawed.com/install.ps1", art, rawPubB64(publicKey)],
          { encoding: "utf8" },
        );
      expect(run().status).toBe(0);
      fs.writeFileSync(file, Buffer.from("Write-Host 'hellO'\n"));
      expect(run().status).not.toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("core installer: behavior in a sandbox", () => {
  let dir: string;
  let privateKey: KeyObject;
  let testPub: string;

  // `curl` stub: serves <url> from $STUB_MAP (lines "<url> <file>") and logs it.
  const CURL_STUB = `#!/bin/bash
out=""; url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    --proto|--retry|--retry-delay) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
echo "$url" >> "$STUB_LOG"
src="$(awk -v u="$url" '$1==u {print $2}' "$STUB_MAP")"
[[ -n "$src" ]] || exit 22
if [[ -n "$out" ]]; then cp "$src" "$out"; else cat "$src"; fi
`;

  function write(rel: string, data: string | Buffer, mode?: number): string {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
    if (mode) {
      fs.chmodSync(p, mode);
    }
    return p;
  }

  // install.sh with the trust root swapped for the test key, plus its artifact.
  function signedScript(mutate: (s: string) => string = (s) => s) {
    const text = mutate(SH.replace(`_BLD_PUB="${REAL_PUB}"`, `_BLD_PUB="${testPub}"`));
    const bytes = Buffer.from(text);
    return { bytes, artifact: artifactFor(bytes, SELF_URL, privateKey) };
  }

  function serve(entries: Record<string, Buffer | string>) {
    const lines = Object.entries(entries).map(
      ([url, data], i) => `${url} ${write(`srv/${i}`, data)}`,
    );
    write("map", `${lines.join("\n")}\n`);
    write("log", "");
  }

  function run(
    args: string[],
    opts: { script?: string; stdin?: Buffer; env?: Record<string, string> } = {},
  ) {
    const cmd = opts.stdin ? ["-s", "--", ...args] : [opts.script!, ...args];
    const res = spawnSync("/bin/bash", cmd, {
      input: opts.stdin,
      encoding: "utf8",
      env: {
        PATH: `${path.join(dir, "bin")}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: path.join(dir, "home"),
        TMPDIR: path.join(dir, "tmp"),
        TERM: "dumb",
        STUB_MAP: path.join(dir, "map"),
        STUB_LOG: path.join(dir, "log"),
        ...opts.env,
      },
    });
    const fetched = fs.readFileSync(path.join(dir, "log"), "utf8").split("\n").filter(Boolean);
    return { ...res, out: `${res.stdout}${res.stderr}`, fetched };
  }

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-core-installer-"));
    write("bin/curl", CURL_STUB, 0o755);
    fs.mkdirSync(path.join(dir, "home"));
    fs.mkdirSync(path.join(dir, "tmp"));
    const kp = generateKeyPairSync("ed25519");
    privateKey = kp.privateKey;
    testPub = rawPubB64(kp.publicKey);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("verifies its own running bytes and an ordinary run fetches nothing but the signature", () => {
    const { bytes, artifact } = signedScript();
    const script = write("install.sh", bytes);
    serve({ [SIG_URL]: artifact });
    const r = run(["--dry-run", "--no-prompt", "--no-onboard"], { script });
    expect(r.out).toContain("Dry run complete");
    expect(r.out).toMatch(/Installer signature:\S*\s+verified/u);
    expect(r.fetched).toEqual([SIG_URL]);
  });

  it("refuses a modified copy, and _BLD_OK=1 does not skip the check", () => {
    const { artifact } = signedScript();
    const tampered = signedScript((s) => s.replace("All your chats", "All your chatz")).bytes;
    const script = write("install-tampered.sh", tampered);
    serve({ [SIG_URL]: artifact });
    const r = run(["--dry-run", "--no-prompt"], { script, env: { _BLD_OK: "1" } });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("INSTALL ABORTED -- integrity check failed");
    expect(r.out).not.toContain("Dry run complete");
  });

  it("piped: runs the canonical bytes it verified, not the piped stream", () => {
    const good = signedScript();
    // The piped stream is a tampered copy; the canonical URL serves the signed one.
    const piped = signedScript((s) => s.replace("All your chats", "All your chatz")).bytes;
    serve({ [SELF_URL]: good.bytes, [SIG_URL]: good.artifact });
    const ok = run(["--dry-run", "--no-prompt"], { stdin: piped });
    expect(ok.out).toContain("Dry run complete");
    expect(ok.fetched).toEqual([SELF_URL, SIG_URL]);

    // And a tampered canonical copy is refused even when piped.
    serve({ [SELF_URL]: piped, [SIG_URL]: good.artifact });
    const bad = run(["--dry-run", "--no-prompt"], { stdin: piped });
    expect(bad.status).not.toBe(0);
    expect(bad.out).toContain("INSTALL ABORTED");
  });

  it("refuses unsigned dev targets unless --dev-channel is explicit", () => {
    const { bytes, artifact } = signedScript();
    const script = write("install.sh", bytes);
    serve({ [SIG_URL]: artifact });
    for (const args of [["--version", "latest"], ["--version", "main"], ["--beta"]]) {
      const r = run([...args, "--dry-run", "--no-prompt"], { script });
      expect(r.status).toBe(2);
      expect(r.out).toContain("--dev-channel");
    }
    const env = run(["--dry-run", "--no-prompt"], { script, env: { ENCLAWED_VERSION: "next" } });
    expect(env.status).toBe(2);
    const dev = run(["--version", "latest", "--dev-channel", "--dry-run", "--no-prompt"], {
      script,
    });
    expect(dev.out).toContain("Dry run complete");
  });

  it("update: accepts only a release manifest signed with the embedded key", () => {
    const { bytes, artifact } = signedScript();
    const script = write("install.sh", bytes);
    const manifest = Buffer.from(
      JSON.stringify({
        schema: 1,
        edition: "oss",
        package: "enclawed",
        version: "9.9.9",
        tag: "v9.9.9",
        commit: "a".repeat(40),
        tarballUrl: "https://example.invalid/enclawed-9.9.9.tgz",
        tarballSha256: createHash("sha256").update("x").digest("hex"),
      }),
    );
    const probe = (served: Buffer, sig: Buffer) => {
      serve({ [SIG_URL]: artifact, [MANIFEST_URL]: served, [`${MANIFEST_URL}.bin`]: sig });
      // Source the installer without running main, then resolve the update.
      return spawnSync(
        "/bin/bash",
        [
          "-c",
          `source "$1"; detect_downloader; resolve_signed_update; echo "PIN=$ENCLAWED_PINNED_VERSION $ENCLAWED_PINNED_GIT_COMMIT $ENCLAWED_PINNED_TARBALL_URL"`,
          "x",
          script,
        ],
        {
          encoding: "utf8",
          env: {
            PATH: `${path.join(dir, "bin")}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
            HOME: path.join(dir, "home"),
            TMPDIR: path.join(dir, "tmp"),
            ENCLAWED_INSTALL_SH_NO_RUN: "1",
            STUB_MAP: path.join(dir, "map"),
            STUB_LOG: path.join(dir, "log"),
          },
        },
      );
    };
    const signed = artifactFor(manifest, MANIFEST_URL, privateKey);
    const ok = probe(manifest, signed);
    expect(ok.stdout).toContain(
      `PIN=9.9.9 ${"a".repeat(40)} https://example.invalid/enclawed-9.9.9.tgz`,
    );

    const forged = Buffer.from(manifest.toString().replace("9.9.9", "6.6.6"));
    const bad = probe(forged, signed);
    expect(bad.status).not.toBe(0);
    expect(bad.stdout).not.toContain("PIN=");
    expect(`${bad.stdout}${bad.stderr}`).toContain("does not verify");
  });
});
