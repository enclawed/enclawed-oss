// Package runners other than npx, measured by content, live against local
// stand-ins (an npm registry served from local tarballs, a file: Python
// index): pnpm dlx, bunx, npm exec, yarn dlx (through npx's tree), uvx, pipx
// run, uv run, deno with a lock, python -m. Each runner runs once as the
// operator would, the kit measures what it installed, the measured tree
// starts without the runner, and a tree changed after the pin is refused.
// A runner that is not installed on this machine skips its case.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localCodeLaunch, localCodeOf, localCodeProblem, measureLocalCode } from "./code-pins.js";
import { codePinProblem, type McpCodePin } from "./mcp-package-pins.js";
import { denoLockedRemote, denoRemoteCacheFile, sitePackagesIn } from "./python-env.js";
import {
  measurePackageRunner,
  runnerCacheDirs,
  simpleIndexHashes,
  yarnDlxInstallCommand,
  zipEntry,
  type RunnerCaches,
} from "./runner-pins.js";

const which = (cmd: string) => {
  for (const d of (process.env.PATH ?? "").split(path.delimiter)) {
    const p = path.join(d, cmd);
    if (d && fs.existsSync(p)) {
      return p;
    }
  }
  return null;
};
const has = (...cmds: string[]) => cmds.every((c) => which(c) !== null);

let root: string;
let home: string;
let env: Record<string, string>;
let caches: RunnerCaches;
let registry: ChildProcess;
let registryUrl: string;
let indexDir: string;
let wheel: string;

const run = (cmd: string, args: string[], cwd = root, extra: Record<string, string> = {}) =>
  spawnSync(cmd, args, { cwd, env: { ...env, ...extra }, encoding: "utf8", timeout: 120_000 });

function npmPackage(
  dir: string,
  pj: Record<string, unknown>,
  files: Record<string, string>,
): string {
  const pkg = path.join(dir, "package");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify(pj));
  for (const [f, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(pkg, f), body);
  }
  const tgz = path.join(root, "tarballs", `${String(pj.name)}-${String(pj.version)}.tgz`);
  fs.mkdirSync(path.dirname(tgz), { recursive: true });
  expect(spawnSync("tar", ["-czf", tgz, "-C", dir, "package"]).status).toBe(0);
  return tgz;
}

const REGISTRY = `
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { execFileSync } from "node:child_process";
const dir = process.argv[2];
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\\//, "");
  if (u.startsWith("-/m/")) {
    const f = path.join(dir, "..", "modules", path.basename(u));
    if (fs.existsSync(f)) { res.writeHead(200, { "content-type": "application/typescript" }).end(fs.readFileSync(f)); return; }
  }
  if (u.startsWith("-/t/")) {
    const f = path.join(dir, path.basename(u));
    if (fs.existsSync(f)) { res.writeHead(200, { "content-type": "application/octet-stream" }).end(fs.readFileSync(f)); return; }
  }
  const versions = {};
  for (const t of fs.readdirSync(dir)) {
    const m = /^(.+)-(\\d+\\.\\d+\\.\\d+)\\.tgz$/.exec(t);
    if (!m || m[1] !== u) continue;
    const b = fs.readFileSync(path.join(dir, t));
    const pj = JSON.parse(execFileSync("tar", ["-xzOf", path.join(dir, t), "package/package.json"], { encoding: "utf8" }));
    versions[m[2]] = { ...pj, dist: { tarball: "http://127.0.0.1:" + srv.address().port + "/-/t/" + t, integrity: "sha512-" + crypto.createHash("sha512").update(b).digest("base64"), shasum: crypto.createHash("sha1").update(b).digest("hex") } };
  }
  if (!Object.keys(versions).length) { res.writeHead(404).end("{}"); return; }
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name: u, "dist-tags": { latest: Object.keys(versions).at(-1) }, versions }));
});
srv.listen(0, "127.0.0.1", () => console.log(srv.address().port));
`;

const PY_WHEEL = `
import sys, zipfile, hashlib, base64
name, ver, out, body = sys.argv[1:5]
mod = name.replace("-", "_")
di = f"{mod}-{ver}.dist-info"
files = {
  f"{mod}/__init__.py": body,
  f"{mod}/__main__.py": "from . import main\\nmain()\\n",
  f"{di}/METADATA": f"Metadata-Version: 2.1\\nName: {name}\\nVersion: {ver}\\n",
  f"{di}/WHEEL": "Wheel-Version: 1.0\\nGenerator: t\\nRoot-Is-Purelib: true\\nTag: py3-none-any\\n",
  f"{di}/entry_points.txt": f"[console_scripts]\\n{name} = {mod}:main\\n",
}
rec = [f"{k},sha256={base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b'=').decode()},{len(v.encode())}" for k, v in files.items()]
files[f"{di}/RECORD"] = "\\n".join(rec + [f"{di}/RECORD,,"]) + "\\n"
p = f"{out}/{mod}-{ver}-py3-none-any.whl"
with zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as z:
    for k, v in files.items(): z.writestr(k, v)
print(p)
`;

beforeAll(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-runner-pins-")));
  home = path.join(root, "home");
  fs.mkdirSync(path.join(home, "tmp"), { recursive: true });
  // The stand-in npm registry: packuments and tarballs from local files.
  const tars = [
    npmPackage(
      path.join(root, "src-mcp"),
      {
        name: "stand-mcp",
        version: "1.2.3",
        bin: { "stand-mcp": "server.js" },
        dependencies: { "stand-dep": "1.0.0" },
      },
      {
        "server.js":
          '#!/usr/bin/env node\nconsole.log("stand-mcp " + require("stand-dep") + " " + process.argv.slice(2).join(","));\n',
      },
    ),
    npmPackage(
      path.join(root, "src-dep"),
      { name: "stand-dep", version: "1.0.0", main: "index.js" },
      { "index.js": 'module.exports = "dep-ok";\n' },
    ),
  ];
  // The registry runs in its own process: the runners are started with
  // spawnSync, which blocks this one.
  const script = path.join(root, "registry.mjs");
  fs.writeFileSync(script, REGISTRY);
  registry = spawn(process.execPath, [script, path.join(root, "tarballs")], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  registryUrl = await new Promise<string>((resolve) => {
    registry.stdout!.once("data", (d: Buffer) =>
      resolve(`http://127.0.0.1:${d.toString().trim()}/`),
    );
  });
  void tars;
  // The stand-in Python index: a file: simple index with sha256 fragments.
  indexDir = path.join(root, "pyindex");
  fs.mkdirSync(path.join(indexDir, "dist"), { recursive: true });
  wheel = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      PY_WHEEL,
      "stand-mcp",
      "1.2.3",
      path.join(indexDir, "dist"),
      'def main():\n    import sys\n    print("stand-mcp py", ",".join(sys.argv[1:]))\n',
    ],
    { encoding: "utf8" },
  ).stdout.trim();
  fs.mkdirSync(path.join(indexDir, "simple", "stand-mcp"), { recursive: true });
  const wsha = createHash("sha256").update(fs.readFileSync(wheel)).digest("hex");
  fs.writeFileSync(
    path.join(indexDir, "simple", "stand-mcp", "index.html"),
    `<a href="../../dist/${path.basename(wheel)}#sha256=${wsha}">${path.basename(wheel)}</a>\n`,
  );
  fs.writeFileSync(
    path.join(indexDir, "simple", "index.html"),
    '<a href="stand-mcp/">stand-mcp</a>\n',
  );
  env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_STATE_HOME: path.join(home, ".state"),
    TMPDIR: path.join(home, "tmp"),
    npm_config_registry: registryUrl,
    NPM_CONFIG_REGISTRY: registryUrl,
    BUN_CONFIG_REGISTRY: registryUrl,
    YARN_NPM_REGISTRY_SERVER: registryUrl,
    YARN_UNSAFE_HTTP_WHITELIST: "127.0.0.1",
    YARN_NPM_MINIMAL_AGE_GATE: "0",
    YARN_ENABLE_TELEMETRY: "0",
    COREPACK_ENABLE_STRICT: "0",
    UV_INDEX_URL: `file://${indexDir}/simple`,
    PIP_INDEX_URL: `file://${indexDir}/simple`,
    UV_PYTHON: "python3",
    UV_PYTHON_DOWNLOADS: "never",
    PIPX_DEFAULT_PYTHON: "python3",
    DENO_DIR: path.join(home, ".cache", "deno"),
    NO_COLOR: "1",
  };
  caches = runnerCacheDirs(env, home);
}, 120_000);
afterAll(async () => {
  registry.kill();
  fs.rmSync(root, { recursive: true, force: true });
});

const indexPage = () =>
  fs.readFileSync(path.join(indexDir, "simple", "stand-mcp", "index.html"), "utf8");
const startMeasured = (launch: {
  runtime: string;
  interpreter?: string;
  script: string;
  args: readonly string[];
  dir: string;
}) =>
  spawnSync(
    launch.runtime === "python"
      ? launch.interpreter!
      : launch.runtime === "bun"
        ? "bun"
        : process.execPath,
    [launch.script, ...launch.args],
    {
      cwd: launch.dir,
      env,
      encoding: "utf8",
    },
  );
const firstFile = (dir: string, name: string): string => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name === name) {
      return p;
    }
    if (e.isDirectory()) {
      const f = firstFile(p, name);
      if (f) {
        return f;
      }
    }
  }
  return "";
};

/** One npm-registry runner: install once, measure, start the tree, then the attack (a changed tree). */
async function npmRunnerCase(
  command: string,
  args: string[],
  install: () => void,
  dependency: () => string,
) {
  const def = { command, args };
  const before = measurePackageRunner(def, caches);
  expect(before).toMatchObject({ ok: false, code: "not-installed" });
  install();
  const m = measurePackageRunner(def, caches);
  expect(m.ok, JSON.stringify(m)).toBe(true);
  if (!m.ok) {
    return;
  }
  const pj = JSON.parse(
    spawnSync(
      "tar",
      ["-xzOf", path.join(root, "tarballs", "stand-mcp-1.2.3.tgz"), "package/package.json"],
      { encoding: "utf8" },
    ).stdout,
  ) as object;
  expect(pj).toBeTruthy();
  const tarball = fs.readFileSync(path.join(root, "tarballs", "stand-mcp-1.2.3.tgz"));
  expect(m.pin.integrity).toBe(`sha512-${createHash("sha512").update(tarball).digest("base64")}`);
  expect(codePinProblem(def, m.pin, m.pin)).toBeNull();
  const ran = startMeasured(m.launch);
  expect(ran.stdout.trim(), ran.stderr).toBe("stand-mcp dep-ok --flag");
  // Attack: the installed dependency changed after the pin.
  fs.appendFileSync(dependency(), 'module.exports = "backdoor";\n');
  const again = measurePackageRunner(def, caches);
  expect(again.ok).toBe(true);
  if (again.ok) {
    expect(codePinProblem(def, m.pin, again.pin)).toMatch(
      /is not the tree the admission record pins \(its files differ\)/,
    );
  }
}

describe("npm-registry runners, live", () => {
  it.skipIf(!has("pnpm"))(
    "pnpm dlx: pnpm-lock.yaml integrity and the installed tree; the measured tree starts; a changed tree is refused",
    async () => {
      await npmRunnerCase(
        "pnpm",
        ["dlx", "stand-mcp@1.2.3", "--flag"],
        () => expect(run("pnpm", ["dlx", "stand-mcp@1.2.3"]).status).toBe(0),
        () => firstFile(path.join(caches.pnpm.at(-1)!, "dlx"), "index.js"),
      );
    },
    120_000,
  );

  it.skipIf(!has("bunx"))(
    "bunx: bun.lock integrity and the installed tree; the measured tree starts; a changed tree is refused",
    async () => {
      await npmRunnerCase(
        "bunx",
        ["stand-mcp@1.2.3", "--flag"],
        () => expect(run("bunx", ["stand-mcp@1.2.3"]).status).toBe(0),
        () => firstFile(caches.bun.find((d) => fs.existsSync(d)) ?? caches.bun[0], "index.js"),
      );
    },
    120_000,
  );

  it.skipIf(!has("npm"))(
    "npm exec and yarn dlx: npx's tree (yarn keeps none); a changed tree is refused",
    async () => {
      const yarnDef = { command: "yarn", args: ["dlx", "stand-mcp@1.2.3", "--flag"] };
      expect(measurePackageRunner(yarnDef, caches)).toMatchObject({
        ok: false,
        code: "not-installed",
        reason: expect.stringMatching(/yarn dlx keeps no installed tree/),
      });
      // The adapter installs it through npx at pin time: no install scripts, npx's own cache key.
      expect(yarnDlxInstallCommand(yarnDef)).toEqual({
        command: "npm",
        args: [
          "exec",
          "--yes",
          "--ignore-scripts",
          "--package=stand-mcp@1.2.3",
          "--",
          "node",
          "-e",
          "",
        ],
      });
      expect(yarnDlxInstallCommand({ command: "yarn", args: ["dlx", "stand-mcp@^1"] })).toBeNull();
      expect(yarnDlxInstallCommand({ command: "npx", args: ["stand-mcp@1.2.3"] })).toBeNull();
      await npmRunnerCase(
        "npm",
        ["exec", "--yes", "stand-mcp@1.2.3", "--", "--flag"],
        () => {
          const c = yarnDlxInstallCommand(yarnDef)!;
          expect(run(c.command, [...c.args]).status).toBe(0);
        },
        () => firstFile(path.join(caches.npm.at(-1)!, "_npx"), "index.js"),
      );
      // yarn dlx is measured on the same tree (after the attack above: refused against the first pin).
      expect(measurePackageRunner(yarnDef, caches).ok).toBe(true);
    },
    120_000,
  );

  it.skipIf(!has("npm"))(
    "false positive: npx's cache moved by the project's .npmrc is found and measured",
    () => {
      const proj = path.join(root, "npmrc-proj");
      const moved = path.join(root, "moved-npm-cache");
      fs.mkdirSync(proj, { recursive: true });
      fs.writeFileSync(path.join(proj, "package.json"), "{}\n");
      fs.writeFileSync(path.join(proj, ".npmrc"), `cache=${moved}\n`);
      expect(run("npm", ["exec", "--yes", "stand-mcp@1.2.3", "--", "true"], proj).status).toBe(0);
      expect(fs.existsSync(path.join(moved, "_npx"))).toBe(true);
      const def = { command: "npx", args: ["-y", "stand-mcp@1.2.3"] };
      const c = runnerCacheDirs(env, home, process.platform, { cwd: proj, def });
      expect(c.npm[0]).toBe(moved);
      const m = measurePackageRunner(
        { command: "npm", args: ["exec", "--yes", "stand-mcp@1.2.3"] },
        c,
      );
      expect(m.ok && m.launch.dir.startsWith(moved), JSON.stringify(m)).toBe(true);
    },
    120_000,
  );

  it("refuses an inexact form, whatever the runner", () => {
    for (const def of [
      { command: "pnpm", args: ["dlx", "stand-mcp"] },
      { command: "bunx", args: ["stand-mcp@^1"] },
      { command: "bun", args: ["x", "stand-mcp@latest"] },
      { command: "npm", args: ["exec", "stand-mcp"] },
      { command: "yarn", args: ["dlx", "stand-mcp@1"] },
      { command: "uvx", args: ["stand-mcp"] },
      { command: "pipx", args: ["run", "stand-mcp>=1"] },
    ]) {
      expect(measurePackageRunner(def, caches), JSON.stringify(def)).toMatchObject({
        ok: false,
        code: "unpinned-form",
      });
      expect(codePinProblem(def, null, null), JSON.stringify(def)).toMatch(
        /resolved by the (registry|index) at every launch/,
      );
    }
  });
});

describe("Python runners, live", () => {
  it("simpleIndexHashes reads PEP 503 and PEP 691 pages, only for the exact release", () => {
    const h = "a".repeat(64);
    expect(
      simpleIndexHashes(
        `<a href="x/stand_mcp-1.2.3-py3-none-any.whl#sha256=${h}">w</a><a href="x/stand_mcp-1.2.30-py3-none-any.whl#sha256=${"b".repeat(64)}">w</a>`,
        "stand-mcp",
        "1.2.3",
      ),
    ).toEqual([`sha256:${h}`]);
    expect(
      simpleIndexHashes(
        JSON.stringify({ files: [{ filename: "stand_mcp-1.2.3.tar.gz", hashes: { sha256: h } }] }),
        "Stand.MCP",
        "1.2.3",
      ),
    ).toEqual([`sha256:${h}`]);
    expect(zipEntry(wheel, (n) => n.endsWith("/RECORD"))?.data.toString()).toMatch(
      /stand_mcp\/__init__\.py,sha256=/,
    );
  });

  it.skipIf(!has("uvx", "python3"))(
    "uvx: the wheel hashes, every installed file against RECORD, the environment; the measured tree starts; attacks refused",
    async () => {
      const def = { command: "uvx", args: ["stand-mcp==1.2.3", "--flag"] };
      const pinTime = { index: { page: indexPage(), wheels: [wheel] } };
      expect(measurePackageRunner(def, caches, pinTime)).toMatchObject({
        ok: false,
        code: "not-installed",
      });
      const r = run("uvx", ["stand-mcp==1.2.3"]);
      expect(r.status, r.stderr).toBe(0);
      const m = measurePackageRunner(def, caches, pinTime);
      expect(m.ok, JSON.stringify(m)).toBe(true);
      if (!m.ok) {
        return;
      }
      expect(m.pin.integrity).toBe(
        `sha256:${createHash("sha256").update(fs.readFileSync(wheel)).digest("hex")}`,
      );
      expect(codePinProblem(def, m.pin, m.pin)).toBeNull();
      expect(startMeasured(m.launch).stdout.trim()).toBe("stand-mcp py --flag");
      // False positive (launch): no index is read; the pin's hashes and the measured environment admit it.
      const launch = measurePackageRunner(def, caches, { pinned: m.pin });
      expect(launch.ok && codePinProblem(def, m.pin, launch.pin)).toBeNull();
      // False positive: exact --from forms and uvx's name@version.
      for (const form of [
        { command: "uvx", args: ["--from", "stand-mcp==1.2.3", "stand-mcp", "--flag"] },
        { command: "uvx", args: ["--from=stand-mcp==1.2.3", "stand-mcp", "--flag"] },
        {
          command: "uv",
          args: ["tool", "run", "--from", "stand-mcp==1.2.3", "stand-mcp", "--flag"],
        },
        { command: "uvx", args: ["stand-mcp@1.2.3", "--flag"] },
      ]) {
        const f = measurePackageRunner(form, caches, { pinned: m.pin });
        expect(f.ok, JSON.stringify(form)).toBe(true);
        if (f.ok) {
          expect(codePinProblem(form, m.pin, f.pin)).toBeNull();
          expect(startMeasured(f.launch).stdout.trim()).toBe("stand-mcp py --flag");
        }
      }
      // Attack: inexact --from, or --from with no command.
      for (const form of [
        { command: "uvx", args: ["--from", "stand-mcp>=1", "stand-mcp"] },
        { command: "uvx", args: ["--from", "stand-mcp==1.2.3"] },
        { command: "uvx", args: ["stand-mcp@latest"] },
      ]) {
        expect(
          measurePackageRunner(form, caches, { pinned: m.pin }),
          JSON.stringify(form),
        ).toMatchObject({
          ok: false,
          code: "unpinned-form",
        });
      }
      // Attack: a pin made without checking the wheels, or a launch with neither index nor pin.
      expect(measurePackageRunner(def, caches, { index: { page: indexPage() } })).toMatchObject({
        ok: false,
        code: "index-mismatch",
        reason: expect.stringMatching(/wheels .* were not checked/),
      });
      expect(measurePackageRunner(def, caches)).toMatchObject({
        ok: false,
        code: "index-mismatch",
      });
      // Attack: a pin for another release does not lend its hashes.
      expect(
        measurePackageRunner(def, caches, { pinned: { ...m.pin, version: "1.2.4" } }),
      ).toMatchObject({ ok: false, code: "index-mismatch" });
      // Attack: a wheel the index does not list.
      const other = path.join(root, "other.whl");
      fs.writeFileSync(other, Buffer.concat([fs.readFileSync(wheel), Buffer.from("x")]));
      expect(
        measurePackageRunner(def, caches, { index: { page: indexPage(), wheels: [other] } }),
      ).toMatchObject({ ok: false, code: "index-mismatch" });
      // Attack: the index now lists other files for the release.
      const swapped = measurePackageRunner(def, caches, {
        index: { page: indexPage().replace(/sha256=[0-9a-f]{64}/, `sha256=${"0".repeat(64)}`) },
        pinned: m.pin,
      });
      expect(swapped.ok).toBe(true);
      if (swapped.ok) {
        expect(codePinProblem(def, m.pin, swapped.pin)).toMatch(/integrity differs/);
      }
      // Attack: a .pth file dropped into the environment (it runs at startup).
      const site = sitePackagesIn(m.launch.dir)!;
      fs.writeFileSync(path.join(site, "evil.pth"), "import os\n");
      expect(measurePackageRunner(def, caches, { pinned: m.pin })).toMatchObject({
        ok: false,
        code: "tree-changed",
        reason: expect.stringMatching(/evil\.pth/),
      });
      fs.rmSync(path.join(site, "evil.pth"));
      // Attack: an installed file changed after the pin.
      fs.appendFileSync(path.join(site, "stand_mcp", "__init__.py"), "print('backdoor')\n");
      expect(measurePackageRunner(def, caches, { pinned: m.pin })).toMatchObject({
        ok: false,
        code: "tree-changed",
        reason: expect.stringMatching(/hash differs from RECORD/),
      });
    },
    120_000,
  );

  it.skipIf(!has("uvx", "python3"))(
    "false positive: uv's cache moved by the user's uv.toml is found and measured (uvx reads no project config)",
    () => {
      const proj = path.join(root, "uvtoml-proj");
      const moved = path.join(root, "moved-uv-cache");
      const user = path.join(home, ".config", "uv", "uv.toml");
      fs.mkdirSync(proj, { recursive: true });
      fs.mkdirSync(path.dirname(user), { recursive: true });
      fs.writeFileSync(
        path.join(proj, "uv.toml"),
        `cache-dir = "${path.join(root, "not-used")}"\n`,
      );
      fs.writeFileSync(user, `cache-dir = "${moved}"\n`);
      try {
        const r = run("uvx", ["stand-mcp==1.2.3"], proj);
        expect(r.status, r.stderr).toBe(0);
        expect(fs.existsSync(path.join(root, "not-used"))).toBe(false);
        const def = { command: "uvx", args: ["stand-mcp==1.2.3"] };
        const c = runnerCacheDirs(env, home, process.platform, { cwd: proj, def });
        expect(c.uv[0]).toBe(moved);
        const m = measurePackageRunner(def, c, { index: { page: indexPage(), wheels: [wheel] } });
        expect(m.ok && m.launch.dir.startsWith(moved), JSON.stringify(m)).toBe(true);
      } finally {
        fs.rmSync(user);
      }
    },
    120_000,
  );

  it.skipIf(!has("pipx", "python3"))(
    "pipx run: measured the same way (its uv backend's or its own environment)",
    async () => {
      const def = { command: "pipx", args: ["run", "stand-mcp==1.2.3"] };
      fs.rmSync(caches.uv.at(-1)!, { recursive: true, force: true });
      const r = run("pipx", ["run", "stand-mcp==1.2.3"]);
      expect(r.status, r.stderr).toBe(0);
      const m = measurePackageRunner(def, caches, {
        index: { page: indexPage(), wheels: [wheel] },
      });
      expect(m.ok, JSON.stringify(m)).toBe(true);
      if (m.ok) {
        expect(startMeasured(m.launch).stdout.trim()).toBe("stand-mcp py");
        // False positive: --spec with an exact version, measured the same way.
        const spec = {
          command: "pipx",
          args: ["run", "--spec", "stand-mcp==1.2.3", "stand-mcp", "x"],
        };
        const s2 = measurePackageRunner(spec, caches, { pinned: m.pin });
        expect(s2.ok && codePinProblem(spec, m.pin, s2.pin)).toBeNull();
        if (s2.ok) {
          expect(startMeasured(s2.launch).stdout.trim()).toBe("stand-mcp py x");
        }
        expect(
          measurePackageRunner(
            { command: "pipx", args: ["run", "--spec", "stand-mcp", "stand-mcp"] },
            caches,
          ),
        ).toMatchObject({ ok: false, code: "unpinned-form" });
      }
    },
    120_000,
  );

  it.skipIf(!has("uv", "python3"))(
    "uv run: uv.lock and the project's tree with its environment; attacks refused",
    async () => {
      const proj = path.join(root, "uvproj");
      fs.mkdirSync(proj, { recursive: true });
      fs.writeFileSync(
        path.join(proj, "pyproject.toml"),
        '[project]\nname = "srv"\nversion = "0.1.0"\nrequires-python = ">=3.9"\ndependencies = ["stand-mcp==1.2.3"]\n\n[tool.uv]\npackage = false\n',
      );
      const def = { command: "uv", args: ["run", "--directory", proj, "stand-mcp"] };
      expect(() => measureLocalCode(def, { cwd: root, pathVar: env.PATH })).toThrow(/no uv\.lock/);
      expect(run("uv", ["lock"], proj).status).toBe(0);
      expect(() => measureLocalCode(def, { cwd: root, pathVar: env.PATH })).toThrow(
        /no environment yet/,
      );
      expect(run("uv", ["sync"], proj).status).toBe(0);
      const pin = measureLocalCode(def, { cwd: root, pathVar: env.PATH });
      expect(pin?.integrity).toMatch(/^sha256-tree:/);
      const code = localCodeOf(def, { cwd: root, pathVar: env.PATH });
      expect(localCodeProblem(code, pin, pin)).toBeNull();
      expect(run("uv", ["run", "--directory", proj, "stand-mcp"], root).stdout.trim()).toBe(
        "stand-mcp py",
      );
      // uv is bypassed: the project's own interpreter and entry start directly.
      const l = localCodeLaunch(def, { cwd: root, pathVar: env.PATH });
      expect(l?.command).toBe(path.join(proj, ".venv", "bin", "python3"));
      expect(l?.args).toEqual([path.join(proj, ".venv", "bin", "stand-mcp")]);
      expect(l?.env.VIRTUAL_ENV).toBe(path.join(proj, ".venv"));
      const direct = spawnSync(l!.command, [...l!.args], {
        cwd: l!.dir,
        env: { ...env, ...l!.envDefaults, ...l!.env },
        encoding: "utf8",
      });
      expect(direct.stdout.trim(), direct.stderr).toBe("stand-mcp py");
      // A script, a module and the interpreter itself, the same way; an env file's variables.
      fs.writeFileSync(
        path.join(proj, "srv.py"),
        "import os, stand_mcp; print('srv', os.environ.get('K'))\n",
      );
      fs.writeFileSync(path.join(proj, ".env"), "# c\nexport K='v 1'\n");
      const script = localCodeLaunch(
        { command: "uv", args: ["run", "--directory", proj, "--env-file", ".env", "srv.py"] },
        { cwd: root, pathVar: env.PATH },
      );
      expect(script?.args).toEqual([path.join(proj, "srv.py")]);
      expect(script?.envDefaults).toEqual({ K: "v 1" });
      const ranScript = spawnSync(script!.command, [...script!.args], {
        cwd: script!.dir,
        env: { ...env, ...script!.envDefaults, ...script!.env },
        encoding: "utf8",
      });
      expect(ranScript.stdout.trim(), ranScript.stderr).toBe("srv v 1");
      expect(
        localCodeLaunch(
          { command: "uv", args: ["run", "--directory", proj, "-m", "stand_mcp"] },
          { cwd: root, pathVar: env.PATH },
        )?.args,
      ).toEqual(["-m", "stand_mcp"]);
      expect(
        localCodeLaunch(
          { command: "uv", args: ["run", "--directory", proj, "python", "-c", "1"] },
          { cwd: root, pathVar: env.PATH },
        )?.args,
      ).toEqual(["-c", "1"]);
      // Attack: a program from outside the environment (PATH) is not started for uv run.
      expect(() =>
        localCodeLaunch(
          { command: "uv", args: ["run", "--directory", proj, "node", "x.js"] },
          { cwd: root, pathVar: env.PATH },
        ),
      ).toThrow(/from outside the project's environment/);
      // Attack: an env file with expansion is not guessed at.
      fs.writeFileSync(path.join(proj, ".env2"), "K=${HOME}\n");
      expect(() =>
        localCodeLaunch(
          { command: "uv", args: ["run", "--directory", proj, "--env-file", ".env2", "srv.py"] },
          { cwd: root, pathVar: env.PATH },
        ),
      ).toThrow(/not supported/);
      // Attack: a distribution installed that uv.lock does not pin (the environment is not the synced one).
      const site = sitePackagesIn(path.join(proj, ".venv"))!;
      const before = measureLocalCode(def, { cwd: root, pathVar: env.PATH });
      const extra = path.join(site, "extra_pkg-9.9.dist-info");
      fs.mkdirSync(extra);
      fs.writeFileSync(path.join(extra, "METADATA"), "Name: extra-pkg\nVersion: 9.9\n");
      fs.writeFileSync(
        path.join(extra, "RECORD"),
        "extra_pkg-9.9.dist-info/METADATA,,\nextra_pkg-9.9.dist-info/RECORD,,\n",
      );
      expect(() => measureLocalCode(def, { cwd: root, pathVar: env.PATH })).toThrow(
        /uv\.lock does not pin it/,
      );
      fs.rmSync(extra, { recursive: true });
      expect(measureLocalCode(def, { cwd: root, pathVar: env.PATH })?.integrity).toBe(
        before?.integrity,
      );
      // Attack: packages resolved for this run only.
      expect(() =>
        measureLocalCode(
          { command: "uv", args: ["run", "--with", "requests", "x.py"] },
          { cwd: proj, pathVar: env.PATH },
        ),
      ).toThrow(/resolves packages at every launch/);
      // Attack: an installed file of the environment changed.
      const init = firstFile(path.join(proj, ".venv"), "__init__.py");
      fs.appendFileSync(init, "print('backdoor')\n");
      expect(() => measureLocalCode(def, { cwd: root, pathVar: env.PATH })).toThrow(
        /hash differs from RECORD/,
      );
    },
    120_000,
  );

  it.skipIf(!has("python3"))(
    "python -m: the module's distribution files against its RECORD",
    () => {
      const venv = path.join(root, "pyvenv");
      expect(spawnSync("python3", ["-m", "venv", "--without-pip", venv]).status).toBe(0);
      const site = fs
        .readdirSync(path.join(venv, "lib"))
        .map((d) => path.join(venv, "lib", d, "site-packages"))[0];
      for (const [name, data] of [
        ["stand_mcp/__init__.py"],
        ["stand_mcp/__main__.py"],
        ["stand_mcp-1.2.3.dist-info/METADATA"],
        ["stand_mcp-1.2.3.dist-info/RECORD"],
        ["stand_mcp-1.2.3.dist-info/entry_points.txt"],
        ["stand_mcp-1.2.3.dist-info/WHEEL"],
      ].map(([n]) => [n, zipEntry(wheel, (x) => x === n)?.data])) {
        fs.mkdirSync(path.dirname(path.join(site, name as string)), { recursive: true });
        fs.writeFileSync(path.join(site, name as string), data as Buffer);
      }
      const def = { command: path.join(venv, "bin", "python3"), args: ["-m", "stand_mcp"] };
      const pin = measureLocalCode(def, { cwd: root, pathVar: env.PATH });
      expect(pin?.name).toBe("python -m stand_mcp");
      fs.appendFileSync(path.join(site, "stand_mcp", "__init__.py"), "print('backdoor')\n");
      expect(() => measureLocalCode(def, { cwd: root, pathVar: env.PATH })).toThrow(
        /hash differs from its distribution's RECORD/,
      );
    },
  );
});

describe("deno with a local entry, live", () => {
  it.skipIf(!has("deno"))(
    "deno.lock and the npm packages deno cached; a changed cache is refused; no lock is refused",
    () => {
      const proj = path.join(root, "denoproj");
      fs.mkdirSync(proj, { recursive: true });
      fs.writeFileSync(path.join(proj, "deno.json"), "{}\n");
      fs.writeFileSync(
        path.join(proj, "main.ts"),
        'import x from "npm:stand-dep@1.0.0";\nconsole.log("deno", x);\n',
      );
      const def = { command: "deno", args: ["run", "-A", path.join(proj, "main.ts")] };
      const o = { cwd: proj, pathVar: env.PATH, denoDir: caches.deno };
      expect(() => measureLocalCode(def, o)).toThrow(/lock file/);
      const r = run("deno", ["run", "-A", "main.ts"], proj);
      expect(r.stdout.trim(), r.stderr).toBe("deno dep-ok");
      const pin = measureLocalCode(def, o) as McpCodePin;
      expect(pin.integrity).toMatch(/^sha256-tree:/);
      // Attack: deno does not check its cached npm packages against the lock; the kit does.
      fs.appendFileSync(
        firstFile(path.join(caches.deno, "npm"), "index.js"),
        'module.exports = "backdoor";\n',
      );
      const now = measureLocalCode(def, o);
      expect(localCodeProblem(localCodeOf(def, o), pin, now)).toMatch(/tree digest differs/);
      // Remote (http/https) modules: measured in deno's cache against the lock, independently of deno.
      fs.mkdirSync(path.join(root, "modules"), { recursive: true });
      fs.writeFileSync(path.join(root, "modules", "rmod.ts"), 'export const r = "remote-ok";\n');
      const rproj = path.join(root, "denoremote");
      fs.mkdirSync(rproj, { recursive: true });
      fs.writeFileSync(path.join(rproj, "deno.json"), "{}\n");
      fs.writeFileSync(
        path.join(rproj, "main.ts"),
        `import { r } from "${registryUrl}-/m/rmod.ts";\nconsole.log("deno", r);\n`,
      );
      const rdef = { command: "deno", args: ["run", "-A", "main.ts"] };
      const ro = { cwd: rproj, pathVar: env.PATH, denoDir: caches.deno };
      const rr = run("deno", ["run", "-A", "main.ts"], rproj);
      expect(rr.stdout.trim(), rr.stderr).toBe("deno remote-ok");
      const rpin = measureLocalCode(rdef, ro) as McpCodePin;
      expect(rpin.integrity).toMatch(/^sha256-tree:/);
      // Started with its lock frozen and its cache only (no fetch, no V8 or transpile cache).
      const dl = localCodeLaunch(rdef, ro);
      expect(dl?.args).toEqual([
        "run",
        "--frozen",
        "--cached-only",
        "--no-code-cache",
        "-A",
        "main.ts",
      ]);
      expect(dl?.env).toEqual({ DENO_EMIT_CACHE_MODE: "disable" });
      const ranD = spawnSync("deno", [...dl!.args], {
        cwd: dl!.dir,
        env: { ...env, ...dl!.env },
        encoding: "utf8",
      });
      expect(ranD.stdout.trim(), ranD.stderr).toBe("deno remote-ok");
      // Attack: the cached remote module changed (its body; deno's metadata kept).
      const cached = denoRemoteCacheFile(caches.deno, `${registryUrl}-/m/rmod.ts`);
      const body = fs.readFileSync(cached, "utf8");
      fs.writeFileSync(cached, body.replace("remote-ok", "backdoor!"));
      expect(() => measureLocalCode(rdef, ro)).toThrow(/is not the module deno\.lock records/);
      fs.rmSync(cached);
      expect(() => measureLocalCode(rdef, ro)).toThrow(/is not in deno's cache/);
      // Remote imports switched off: no lock needed.
      const offline = {
        command: "deno",
        args: ["run", "--no-remote", "--no-npm", path.join(root, "solo.ts")],
      };
      fs.writeFileSync(path.join(root, "solo.ts"), 'console.log("solo");\n');
      expect(measureLocalCode(offline, { ...o, cwd: root })?.integrity).toMatch(/^sha256-tree:/);
    },
    120_000,
  );
});

describe("deno's jsr packages, measured against deno.lock", () => {
  it("false positive: the metadata's integrity and every cached file's checksum; attack: a changed file or metadata", () => {
    const d = path.join(root, "jsr-deno-dir");
    const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
    const put = (url: string, body: string) => {
      const f = denoRemoteCacheFile(d, url);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, `${body}\n// denoCacheMetadata={"url":${JSON.stringify(url)}}`);
    };
    const mod = "export const x = 1;\n";
    const meta = JSON.stringify({
      manifest: {
        "/mod.ts": { size: mod.length, checksum: `sha256-${sha(mod)}` },
        "/never_loaded.ts": { size: 1, checksum: `sha256-${"0".repeat(64)}` },
      },
    });
    put("https://jsr.io/@s/p/1.0.0_meta.json", meta);
    put("https://jsr.io/@s/p/1.0.0/mod.ts", mod);
    const lock = path.join(root, "jsr.lock");
    fs.writeFileSync(
      lock,
      JSON.stringify({ version: "5", jsr: { "@s/p@1.0.0": { integrity: sha(meta) } } }),
    );
    expect(denoLockedRemote(lock, d).modules).toBe(2);
    put("https://jsr.io/@s/p/1.0.0/mod.ts", "export const x = 2;\n");
    expect(() => denoLockedRemote(lock, d)).toThrow(
      /@s\/p@1\.0\.0\/mod\.ts is not the file its metadata records/,
    );
    put("https://jsr.io/@s/p/1.0.0/mod.ts", mod);
    put("https://jsr.io/@s/p/1.0.0_meta.json", meta.replace("never_loaded", "never_loadee"));
    expect(() => denoLockedRemote(lock, d)).toThrow(
      /metadata of @s\/p@1\.0\.0 is not what deno\.lock records/,
    );
    // Another jsr registry (JSR_URL), and a URL with a port: its own cache path.
    expect(denoRemoteCacheFile(d, "http://127.0.0.1:8080/a/b.ts?x=1")).toBe(
      path.join(d, "remote", "http", "127.0.0.1_PORT8080", sha("/a/b.ts?x=1")),
    );
  });
});
