#!/usr/bin/env node
// Consumer install gate: install the package the way users do, from a
// registry, with every npm we support, and refuse the release unless each
// install works.
//
//   node scripts/ci/consumer-install-check.mjs --tarball <enclawed-x.y.z.tgz> [--npm <npm|path/to/npm-cli.js>]...
//   node scripts/ci/consumer-install-check.mjs --live <x.y.z> [--npm ...]
//
// With --tarball, each npm first runs `npm publish <tarball>` to a stand-in
// registry (scripts/ci/stand-in-registry.mjs), which stores what npm uploads
// and passes everything else through to the real registry. With --live the
// published version is checked on the real registry (npm_config_registry, or
// npmjs.org). Installing a tarball file directly would hide the registry
// metadata: npm then reads the package.json inside the tarball, while
// `npm install -g` from a registry resolves the metadata npm uploaded, and
// enclawed 2.0.1 differed between the two.
//
// Without --npm it checks the npm on PATH and the latest npm 11 (fetched with
// `npm pack npm@11` into the scratch directory). For each npm:
//   0. registry metadata: the version's dependencies, optional, peer and
//      bundled dependencies, bin and engines must equal the package.json inside
//      the tarball the registry serves;
//   1. project install: `npm install enclawed@<version>` in a fresh project, then
//      `npm audit --omit=dev` must report 0 vulnerabilities, the installed
//      lockfile must carry no deprecated package and no OpenTelemetry package
//      other than the inert @opentelemetry/api, and `enclawed --version` must
//      print the package version;
//   2. global install: `npm install -g --prefix <scratch> enclawed@<version>`,
//      then the installed `enclawed --version`;
//   3. nested global install: a scratch package that depends on enclawed is
//      packed and installed globally under a scratch --prefix, so enclawed is a
//      NESTED dependency (its install scripts run inside another package's
//      node_modules -- where 2.0.0's postinstall failed to find the bundled
//      plugins' dependencies); the install must succeed and the nested
//      `enclawed --version` must print the version.
// No install may print an npm deprecation warning. Everything runs with a scratch HOME and npm cache; nothing outside the
// scratch directory is touched. Exit 0 only when every check passes.

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ALIASED_REPLACEMENTS,
  findDeprecatedPackages,
  findForbiddenTelemetryPackages,
} from "../npm-shrinkwrap.mjs";

const STAND_IN = join(dirname(fileURLToPath(import.meta.url)), "stand-in-registry.mjs");
const PACKAGE = "enclawed";

function parseArgs(argv) {
  const out = { tarball: null, live: null, npms: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tarball") {
      out.tarball = argv[++i];
    } else if (argv[i] === "--live") {
      out.live = argv[++i];
    } else if (argv[i] === "--npm") {
      out.npms.push(argv[++i]);
    } else {
      throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  if (Boolean(out.tarball) === Boolean(out.live)) {
    throw new Error("exactly one of --tarball <path> or --live <version> is required");
  }
  return out;
}

/** The environment for scratch npm runs: inherited npm settings dropped, scratch HOME and cache. */
export function scratchNpmEnv(base, home, cache) {
  const env = { ...base, HOME: home, USERPROFILE: home, npm_config_cache: cache, NO_COLOR: "1" };
  for (const key of Object.keys(env)) {
    // Keep only where packages come from (a registry mirror and its CA); drop
    // everything else npm inherited that could change the install.
    if (/^npm_config_/iu.test(key) && !/^npm_config_(cache|registry|cafile)$/iu.test(key)) {
      delete env[key];
    }
  }
  delete env.npm_execpath;
  return env;
}

function npmCommand(spec) {
  return spec.endsWith(".js") ? { cmd: process.execPath, args: [spec] } : { cmd: spec, args: [] };
}

function run(npm, args, cwd, env, label) {
  const result = spawnSync(npm.cmd, [...npm.args, ...args], {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32" && !npm.cmd.endsWith(".exe") && npm.args.length === 0,
  });
  if (result.status !== 0) {
    const tail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
      .trim()
      .split("\n")
      .slice(-15)
      .join("\n");
    throw new Error(`${label} failed (exit ${String(result.status)}):\n${tail}`);
  }
  return result.stdout ?? "";
}

/** Lines npm prints for a deprecated package (npm 9: "npm WARN deprecated", npm 10+: "npm warn deprecated"). */
export function deprecationWarnings(output) {
  return output.split("\n").filter((line) => /\bnpm (?:WARN|warn) deprecated\b/u.test(line));
}

/** Run an install; it must succeed and print no deprecation warning. */
function install(npm, args, cwd, env, label) {
  const result = spawnSync(npm.cmd, [...npm.args, ...args], {
    cwd,
    env: { ...env, npm_config_loglevel: "warn" },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32" && !npm.cmd.endsWith(".exe") && npm.args.length === 0,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (exit ${String(result.status)}):\n${output.trim().split("\n").slice(-15).join("\n")}`,
    );
  }
  const warnings = deprecationWarnings(output);
  if (warnings.length > 0) {
    throw new Error(`${label} printed deprecation warnings:\n${warnings.join("\n")}`);
  }
}

function fetchLatestNpm11(root, env) {
  const dir = join(root, "npm11");
  mkdirSync(dir, { recursive: true });
  run(
    npmCommand("npm"),
    ["pack", "npm@11", "--pack-destination", dir, "--silent"],
    dir,
    env,
    "npm pack npm@11",
  );
  const tgz = readdirSync(dir).find((name) => name.endsWith(".tgz"));
  if (!tgz) {
    throw new Error("npm pack npm@11 produced no tarball");
  }
  const tar = spawnSync("tar", ["xzf", tgz], { cwd: dir, encoding: "utf8" });
  if (tar.status !== 0) {
    throw new Error(`could not unpack ${tgz}: ${tar.stderr}`);
  }
  return join(dir, "package", "bin", "npm-cli.js");
}

/** Start the stand-in registry as its own process (the checks below block this one's event loop). */
function startStandIn(env) {
  return new Promise((resolveUrl, reject) => {
    const child = spawn(process.execPath, [STAND_IN, "--own", PACKAGE], {
      env,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      const line = out.split("\n")[0];
      if (out.includes("\n")) {
        resolveUrl({ url: line.trim(), stop: () => child.kill("SIGKILL") });
      }
    });
    child.on("exit", (code) => reject(new Error(`stand-in registry exited (${String(code)})`)));
  });
}

/** The fields of a version's registry metadata that decide what an install resolves. */
const RESOLUTION_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bundleDependencies",
  "bin",
  "engines",
  "os",
  "cpu",
];

export function metadataMismatches(registryMeta, tarballManifest) {
  const norm = (v) => JSON.stringify(v ?? null, Object.keys(v ?? {}).toSorted());
  const out = [];
  for (const field of RESOLUTION_FIELDS) {
    let a = registryMeta?.[field];
    let b = tarballManifest?.[field];
    // npm 9's publish also lists every optional dependency under dependencies;
    // npm 11's does not. Optional ones are compared on their own field below.
    if (field === "dependencies") {
      a = { ...a, ...registryMeta?.optionalDependencies };
      b = { ...b, ...tarballManifest?.optionalDependencies };
    }
    if (field === "bundleDependencies") {
      a ??= registryMeta?.bundledDependencies;
      b ??= tarballManifest?.bundledDependencies;
    }
    // npm normalizes a string bin to { <name>: <path> } and an empty object to absent.
    if (field === "bin" && typeof b === "string") {
      b = { [tarballManifest.name]: b };
    }
    const empty = (v) => v == null || (typeof v === "object" && Object.keys(v).length === 0);
    if (empty(a) && empty(b)) {
      continue;
    }
    if (norm(a) !== norm(b)) {
      const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
      const diff = [...keys].filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k]));
      out.push(
        `${field}: ${diff.length} differ (${diff.slice(0, 8).join(", ")}${diff.length > 8 ? ", ..." : ""})`,
      );
    }
  }
  return out;
}

function checkRegistryMetadata(npm, spec, version, root, env) {
  const meta = JSON.parse(run(npm, ["view", spec, "--json"], root, env, `npm view ${spec}`));
  const dir = join(root, "pack");
  mkdirSync(dir, { recursive: true });
  run(npm, ["pack", spec, "--silent", "--pack-destination", dir], dir, env, `npm pack ${spec}`);
  const tgz = readdirSync(dir).find((name) => name.endsWith(".tgz"));
  const manifest = JSON.parse(
    spawnSync("tar", ["xzf", join(dir, tgz), "-O", "package/package.json"], { encoding: "utf8" })
      .stdout,
  );
  if (meta.version !== version || manifest.version !== version) {
    throw new Error(
      `registry serves ${meta.version}, its tarball says ${manifest.version}; expected ${version}`,
    );
  }
  const mismatches = metadataMismatches(meta, manifest);
  if (mismatches.length > 0) {
    throw new Error(
      `the registry metadata differs from the package.json inside the published tarball; installs that resolve from the metadata (npm install -g) get a different dependency tree:\n  ${mismatches.join("\n  ")}`,
    );
  }
  return `metadata matches the tarball (${String(Object.keys(manifest.dependencies ?? {}).length)} dependencies)`;
}

function checkProjectInstall(npm, spec, version, root, env) {
  const dir = join(root, "project");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: "consumer", version: "1.0.0", private: true })}\n`,
  );
  install(npm, ["install", "--no-fund", spec], dir, env, `npm install ${spec}`);
  const audit = spawnSync(npm.cmd, [...npm.args, "audit", "--omit=dev", "--json"], {
    cwd: dir,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let totals;
  try {
    totals = JSON.parse(audit.stdout).metadata.vulnerabilities;
  } catch {
    throw new Error(`npm audit could not run (exit ${String(audit.status)})`);
  }
  if (typeof totals?.total !== "number" || totals.total !== 0) {
    throw new Error(`npm audit --omit=dev: ${JSON.stringify(totals)}`);
  }
  const lock = JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8"));
  const deprecated = findDeprecatedPackages(lock);
  if (deprecated.length > 0) {
    throw new Error(`deprecated packages installed:\n  ${deprecated.join("\n  ")}`);
  }
  // Every copy of an aliased name must be Enclawed's replacement, never the registry package.
  for (const [name, spec] of Object.entries(ALIASED_REPLACEMENTS)) {
    const realName = spec.slice("npm:".length, spec.lastIndexOf("@"));
    for (const [path, entry] of Object.entries(lock.packages ?? {})) {
      if (
        (path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)) &&
        entry?.name !== realName
      ) {
        throw new Error(`${path} is ${entry?.name ?? name}, not ${realName}`);
      }
    }
  }
  const telemetry = findForbiddenTelemetryPackages(lock);
  if (telemetry.length > 0) {
    throw new Error(`OpenTelemetry packages other than the API installed: ${telemetry.join(", ")}`);
  }
  const printed = run(
    { cmd: process.execPath, args: [] },
    [join(dir, "node_modules", "enclawed", "enclawed.mjs"), "--version"],
    dir,
    env,
    "enclawed --version",
  );
  if (!printed.includes(version)) {
    throw new Error(
      `enclawed --version printed ${JSON.stringify(printed.trim())}, expected ${version}`,
    );
  }
  return printed.trim().split("\n").at(-1);
}

function globalLibRoot(prefix) {
  return process.platform === "win32"
    ? join(prefix, "node_modules")
    : join(prefix, "lib", "node_modules");
}

function checkGlobalInstall(npm, spec, version, root, env) {
  const prefix = join(root, "prefix");
  install(
    npm,
    ["install", "-g", "--no-fund", "--prefix", prefix, spec],
    root,
    env,
    `npm install -g ${spec}`,
  );
  const entry = join(globalLibRoot(prefix), "enclawed", "enclawed.mjs");
  if (!existsSync(entry)) {
    throw new Error(`enclawed is not installed at ${entry}`);
  }
  const printed = run(
    { cmd: process.execPath, args: [] },
    [entry, "--version"],
    root,
    env,
    "global enclawed --version",
  );
  if (!printed.includes(version)) {
    throw new Error(
      `global enclawed --version printed ${JSON.stringify(printed.trim())}, expected ${version}`,
    );
  }
  return printed.trim().split("\n").at(-1);
}

function checkNestedGlobalInstall(npm, spec, version, root, env) {
  const wrapper = join(root, "wrapper");
  mkdirSync(wrapper, { recursive: true });
  writeFileSync(
    join(wrapper, "package.json"),
    `${JSON.stringify(
      {
        name: "enclawed-nested-consumer",
        version: "1.0.0",
        description: "scratch package that depends on enclawed",
        dependencies: { [PACKAGE]: version },
      },
      null,
      2,
    )}\n`,
  );
  run(npm, ["pack", "--ignore-scripts", "--silent"], wrapper, env, "npm pack <wrapper>");
  const wrapperTgz = readdirSync(wrapper).find((name) => name.endsWith(".tgz"));
  if (!wrapperTgz) {
    throw new Error("packing the wrapper produced no tarball");
  }
  const prefix = join(root, "prefix");
  install(
    npm,
    ["install", "-g", "--no-fund", "--prefix", prefix, join(wrapper, wrapperTgz)],
    root,
    env,
    "npm install -g --prefix <wrapper>",
  );
  const libRoot =
    process.platform === "win32"
      ? join(prefix, "node_modules")
      : join(prefix, "lib", "node_modules");
  const nested = join(
    libRoot,
    "enclawed-nested-consumer",
    "node_modules",
    "enclawed",
    "enclawed.mjs",
  );
  if (!existsSync(nested)) {
    throw new Error(`enclawed is not installed as a nested dependency at ${nested}`);
  }
  const printed = run(
    { cmd: process.execPath, args: [] },
    [nested, "--version"],
    root,
    env,
    "nested enclawed --version",
  );
  if (!printed.includes(version)) {
    throw new Error(
      `nested enclawed --version printed ${JSON.stringify(printed.trim())}, expected ${version}`,
    );
  }
  return printed.trim().split("\n").at(-1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tarball = args.tarball ? resolve(args.tarball) : null;
  if (tarball && !existsSync(tarball)) {
    throw new Error(`tarball not found: ${tarball}`);
  }
  const root = mkdtempSync(join(tmpdir(), "enclawed-consumer-check-"));
  const standIns = [];
  try {
    const cache = join(root, "npm-cache");
    const baseEnv = scratchNpmEnv(process.env, join(root, "home"), cache);
    mkdirSync(join(root, "home"), { recursive: true });
    const version = tarball
      ? JSON.parse(
          spawnSync("tar", ["xzf", tarball, "-O", "package/package.json"], { encoding: "utf8" })
            .stdout,
        ).version
      : args.live;
    const spec = `${PACKAGE}@${version}`;
    const npms = args.npms.length > 0 ? args.npms : ["npm", fetchLatestNpm11(root, baseEnv)];
    let failed = 0;
    for (const [index, npmSpec] of npms.entries()) {
      const npm = npmCommand(npmSpec);
      const npmVersion = run(npm, ["--version"], root, baseEnv, "npm --version").trim();
      const caseRoot = join(root, `npm-${String(index)}`);
      mkdirSync(caseRoot, { recursive: true });
      let caseEnv = baseEnv;
      if (tarball) {
        // A fresh stand-in per npm: this npm's own upload is what gets installed.
        const reg = await startStandIn(baseEnv);
        standIns.push(reg);
        const host = reg.url.replace(/^https?:/u, "");
        caseEnv = { ...baseEnv, npm_config_registry: reg.url };
        try {
          run(
            npm,
            ["publish", tarball, "--tag", "latest", `--${host}:_authToken=stand-in`],
            caseRoot,
            caseEnv,
            "npm publish <tarball> (stand-in registry)",
          );
        } catch (err) {
          failed++;
          console.log(
            `  FAIL  npm ${npmVersion} publish to the stand-in registry: ${String(err?.message ?? err)}`,
          );
          continue;
        }
      }
      for (const { label, check } of [
        { label: "registry metadata", check: checkRegistryMetadata },
        { label: "project install", check: checkProjectInstall },
        { label: "global install", check: checkGlobalInstall },
        { label: "nested global install", check: checkNestedGlobalInstall },
      ]) {
        const dir = join(caseRoot, label.replaceAll(" ", "-"));
        mkdirSync(join(dir, "home"), { recursive: true });
        try {
          const printed = check(
            npm,
            spec,
            version,
            dir,
            scratchNpmEnv(caseEnv, join(dir, "home"), cache),
          );
          console.log(`  ok    npm ${npmVersion} ${label}: ${printed}`);
        } catch (err) {
          failed++;
          console.log(`  FAIL  npm ${npmVersion} ${label}: ${String(err?.message ?? err)}`);
        }
        // Each install tree is large; drop it before the next one.
        rmSync(dir, { recursive: true, force: true });
      }
    }
    if (failed > 0) {
      console.log(`[consumer-install-check] FAIL: ${String(failed)} check(s) failed`);
      process.exitCode = 1;
    } else {
      console.log("[consumer-install-check] all consumer installs passed");
    }
  } finally {
    for (const reg of standIns) {
      reg.stop();
    }
    rmSync(root, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(`[consumer-install-check] ${String(err?.message ?? err)}`);
    process.exitCode = 1;
  });
}
