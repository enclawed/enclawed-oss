import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computePublishDependencyPins,
  lockVersionToExact,
  lockVersionToSpec,
  validateShrinkwrap,
} from "../../scripts/lib/publish-dependency-pins.mjs";
import {
  assertAuditClean,
  assertNoDeprecatedPackages,
  assertNoTelemetryPackages,
  findDeprecatedPackages,
  findForbiddenTelemetryPackages,
  auditResolvedTree,
  buildPublishManifest,
  checkShrinkwrapFiles,
  consumerResolutionEnv,
  excludedDistPluginIds,
  fillMissingIntegrity,
  packNpm,
  postpack,
  prepack,
  resolveConsumerTree,
} from "../../scripts/npm-shrinkwrap.mjs";
import { createScriptTestHarness } from "./test-helpers.js";

const { createTempDir } = createScriptTestHarness();

const LOCK = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      yaml:
        specifier: ^2.8.3
        version: 2.8.3
      grammy:
        specifier: ^1.42.0
        version: 1.42.0
      '@mariozechner/pi-ai':
        specifier: npm:@earendil-works/pi-ai@0.80.2
        version: '@earendil-works/pi-ai@0.80.2(ws@8.21.0)(zod@4.6.7)'
  extensions/msteams:
    dependencies:
      '@azure/identity':
        specifier: 4.14.1
        version: 4.14.1
      '@microsoft/teams.apps':
        specifier: 2.2.1
        version: 2.2.1(@azure/identity@4.14.1)
  extensions/telegram:
    dependencies:
      grammy:
        specifier: ^1.40.0
        version: 1.40.0
`;

const sha = "sha512-" + "A".repeat(86) + "==";

function entry(version: string) {
  return {
    version,
    resolved: `https://registry.npmjs.org/x/-/x-${version}.tgz`,
    integrity: sha,
  };
}

describe("publish dependency pins", () => {
  it("strips pnpm peer suffixes and rejects non-exact versions", () => {
    expect(lockVersionToExact("2.2.1(@azure/identity@4.14.1)")).toBe("2.2.1");
    expect(lockVersionToExact("link:../foo")).toBeNull();
    expect(lockVersionToExact("^1.0.0")).toBeNull();
    expect(lockVersionToSpec("@scope/real@1.2.3(peer@1.0.0)")?.spec).toBe("npm:@scope/real@1.2.3");
  });

  it("pins root and bundled plugin runtime deps to exact lockfile versions", () => {
    const pins = computePublishDependencyPins({
      rootPackageJson: {
        dependencies: {
          yaml: "^2.8.3",
          grammy: "^1.42.0",
          "@mariozechner/pi-ai": "npm:@earendil-works/pi-ai@0.80.2",
        },
      },
      lockText: LOCK,
      plugins: [
        {
          id: "msteams",
          importer: "extensions/msteams",
          packageJson: {
            dependencies: {
              "@azure/identity": "4.14.1",
              "@microsoft/teams.apps": "2.2.1",
              enclawed: "workspace:*",
            },
          },
        },
        {
          id: "telegram",
          importer: "extensions/telegram",
          packageJson: { dependencies: { grammy: "^1.40.0" } },
        },
      ],
    });
    expect(pins.errors).toEqual([]);
    // The root pin wins over a plugin's differing version (flat install).
    expect(pins.warnings).toEqual([
      "plugin telegram: grammy wants 1.40.0; the tarball ships 1.42.0",
    ]);
    expect(pins.dependencies).toEqual({
      "@mariozechner/pi-ai": "npm:@earendil-works/pi-ai@0.80.2",
      "@azure/identity": "4.14.1",
      "@microsoft/teams.apps": "2.2.1",
      grammy: "1.42.0",
      yaml: "2.8.3",
    });
  });

  it("fails when a plugin dependency has no exact lockfile version", () => {
    const pins = computePublishDependencyPins({
      rootPackageJson: { dependencies: {} },
      lockText: LOCK,
      plugins: [
        {
          id: "twitch",
          importer: "extensions/twitch",
          packageJson: { dependencies: { "@twurple/api": "^8.1.3" } },
        },
      ],
    });
    expect(pins.errors.join("\n")).toContain("@twurple/api@^8.1.3 has no exact registry version");
  });

  it("reads tarball exclusions from the files list", () => {
    expect([
      ...excludedDistPluginIds(["dist/", "!dist/extensions/qa-lab/**", "!dist/**/*.map"]),
    ]).toEqual(["qa-lab"]);
  });

  it("drops devDependencies from the publish manifest", () => {
    const manifest = buildPublishManifest(
      { name: "enclawed", devDependencies: { vitest: "^4" }, dependencies: { yaml: "^2" } },
      { dependencies: { yaml: "2.8.3" }, optionalDependencies: {} },
    );
    expect(manifest).toEqual({
      name: "enclawed",
      dependencies: { "node-domexception": "npm:@enclawed/node-domexception@1.0.0", yaml: "2.8.3" },
    });
  });

  it("ships no overrides: consumers never receive them, so the resolution must not use them", () => {
    const manifest = buildPublishManifest(
      { name: "enclawed", overrides: { "follow-redirects": "1.16.1" }, dependencies: {} },
      { dependencies: { yaml: "2.8.3" }, optionalDependencies: {} },
    );
    expect(manifest).not.toHaveProperty("overrides");
  });
});

// A stand-in for npm: `install` records the package.json it was given as the lock's
// root entry; `audit` prints the report named by FAKE_NPM_AUDIT.
const FAKE_NPM = `
const fs = require("node:fs");
const cmd = process.argv[2];
if (cmd === "install") {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  fs.writeFileSync("package-lock.json", JSON.stringify({
    name: pkg.name, version: pkg.version, lockfileVersion: 3,
    packages: { "": pkg, "node_modules/yaml": {
      version: "2.8.3",
      resolved: "https://registry.npmjs.org/yaml/-/yaml-2.8.3.tgz",
      integrity: "sha512-x",
    } },
  }));
  process.exit(0);
}
if (cmd === "audit") {
  const mode = process.env.FAKE_NPM_AUDIT;
  if (mode === "garbage") { process.stdout.write("not json"); process.exit(1); }
  const total = mode === "findings" ? 1 : 0;
  process.stdout.write(JSON.stringify({
    vulnerabilities: total ? { zod: { name: "zod", severity: "high", range: "<4.6.6" } } : {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: total, critical: 0, total } },
  }));
  process.exit(total ? 1 : 0);
}
process.exit(2);
`;

describe("consumer-view resolution and audit", () => {
  function fakeNpm() {
    const dir = createTempDir("enclawed-fake-npm-");
    const script = path.join(dir, "npm.cjs");
    fs.writeFileSync(script, FAKE_NPM);
    return { cmd: process.execPath, args: [script] };
  }

  function withAuditMode<T>(mode: string, fn: () => T): T {
    const previous = process.env.FAKE_NPM_AUDIT;
    process.env.FAKE_NPM_AUDIT = mode;
    try {
      return fn();
    } finally {
      if (previous === undefined) {
        delete process.env.FAKE_NPM_AUDIT;
      } else {
        process.env.FAKE_NPM_AUDIT = previous;
      }
    }
  }

  it("resolves the bare dependency set, without the manifest's overrides", () => {
    const { lock, audit } = withAuditMode("clean", () =>
      resolveConsumerTree(
        {
          name: "enclawed",
          version: "2.0.1",
          dependencies: { yaml: "2.8.3" },
          overrides: { yaml: "2.9.0" },
        },
        fakeNpm(),
      ),
    );
    expect(lock.packages[""]).toEqual({
      name: "enclawed",
      version: "2.0.1",
      dependencies: { yaml: "2.8.3" },
    });
    expect(audit.status).toBe("clean");
  });

  it("reports findings of any severity and refuses them", () => {
    const dir = createTempDir("enclawed-audit-findings-");
    const audit = withAuditMode("findings", () => auditResolvedTree(fakeNpm(), dir));
    expect(audit).toMatchObject({ status: "findings", findings: ["high zod <4.6.6"] });
    expect(() => assertAuditClean(audit)).toThrow(/1 vulnerable package/);
  });

  it("fails closed when the audit cannot run", () => {
    const dir = createTempDir("enclawed-audit-garbage-");
    const audit = withAuditMode("garbage", () => auditResolvedTree(fakeNpm(), dir));
    expect(audit.status).toBe("unavailable");
    expect(() => assertAuditClean(audit)).toThrow(/could not run/);
    expect(() => assertAuditClean({ status: "clean" })).not.toThrow();
  });

  it("drops inherited npm settings that would change the resolution", () => {
    const env = consumerResolutionEnv({
      PATH: "/bin",
      npm_config_dry_run: "true",
      npm_config_omit: "optional",
      npm_config_legacy_peer_deps: "true",
      npm_config_global: "true",
      npm_config_registry: "https://registry.npmjs.org/",
    });
    expect(env).toEqual({
      PATH: "/bin",
      npm_config_dry_run: "false",
      npm_config_global: "false",
      npm_config_registry: "https://registry.npmjs.org/",
    });
  });

  it("allows only the inert OpenTelemetry API facade in the shipped tree", () => {
    const lock = {
      packages: {
        "": {},
        "node_modules/@opentelemetry/api": entry("1.10.0"),
        "node_modules/@microsoft/teams.api": entry("2.2.1"),
      },
    };
    expect(findForbiddenTelemetryPackages(lock)).toEqual([]);
    expect(() => assertNoTelemetryPackages(lock)).not.toThrow();

    const withExporter = {
      packages: {
        ...lock.packages,
        "node_modules/@opentelemetry/sdk-node": entry("0.301.2"),
        "node_modules/x/node_modules/@opentelemetry/exporter-trace-otlp-proto": entry("0.301.2"),
        "node_modules/alias": { ...entry("2.0.0"), name: "@opentelemetry/core" },
      },
    };
    expect(findForbiddenTelemetryPackages(withExporter)).toEqual([
      "@opentelemetry/core",
      "@opentelemetry/exporter-trace-otlp-proto",
      "@opentelemetry/sdk-node",
    ]);
    expect(() => assertNoTelemetryPackages(withExporter)).toThrow(/@opentelemetry\/sdk-node/);
  });

  it("refuses deprecated packages in the shipped tree and fails closed without a packages map", () => {
    const clean = { packages: { "": {}, "node_modules/yaml": entry("2.8.3") } };
    expect(findDeprecatedPackages(clean)).toEqual([]);
    expect(() => assertNoDeprecatedPackages(clean)).not.toThrow();

    const withDeprecated = {
      packages: {
        ...clean.packages,
        "node_modules/a/node_modules/node-domexception": {
          ...entry("1.0.0"),
          deprecated: "Use your platform's native DOMException instead",
        },
        "node_modules/b/node_modules/node-domexception": {
          ...entry("1.0.0"),
          deprecated: "Use your platform's native DOMException instead",
        },
        "node_modules/alias": {
          ...entry("4.2.0"),
          name: "crypto-js",
          deprecated: "no longer maintained",
        },
      },
    };
    expect(findDeprecatedPackages(withDeprecated)).toEqual([
      "crypto-js@4.2.0: no longer maintained",
      "node-domexception@1.0.0: Use your platform's native DOMException instead",
    ]);
    expect(() => assertNoDeprecatedPackages(withDeprecated)).toThrow(/2 deprecated package/);
    expect(() => findDeprecatedPackages({})).toThrow(/deprecation status is unknown/);
  });

  it("declares node-domexception as an alias to Enclawed's own replacement package", () => {
    const manifest = buildPublishManifest(
      { name: "enclawed", dependencies: {} },
      { dependencies: { yaml: "2.8.3" }, optionalDependencies: {} },
    );
    expect(manifest.dependencies).toEqual({
      "node-domexception": "npm:@enclawed/node-domexception@1.0.0",
      yaml: "2.8.3",
    });
    expect(manifest).not.toHaveProperty("bundleDependencies");
    // The shrinkwrap must carry the alias as our package, never the registry one.
    expect(
      validateShrinkwrap(manifest, {
        lockfileVersion: 3,
        packages: {
          "": {},
          "node_modules/yaml": entry("2.8.3"),
          "node_modules/node-domexception": { ...entry("1.0.0"), name: "node-domexception" },
        },
      }),
    ).toEqual([
      "npm-shrinkwrap.json node-domexception is node-domexception, not @enclawed/node-domexception",
    ]);
  });

  it("ships a replacement that is Node's own DOMException and nothing else", async () => {
    const replacement = (await import("../../packages/node-domexception/index.js")) as {
      default: unknown;
    };
    expect(replacement.default).toBe(globalThis.DOMException);
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../../packages/node-domexception/package.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(pkg).toMatchObject({
      name: "@enclawed/node-domexception",
      version: "1.0.0",
      main: "index.js",
      license: "MIT",
      engines: { node: ">=17" },
      publishConfig: { access: "public" },
    });
    expect(pkg).not.toHaveProperty("dependencies");
  });

  it("uses the npm running the pack when there is one", () => {
    expect(packNpm({ npm_execpath: "/opt/npm/bin/npm-cli.js" })).toEqual({
      cmd: process.execPath,
      args: ["/opt/npm/bin/npm-cli.js"],
    });
    expect(packNpm({}).args).toEqual([]);
  });
});

describe("shrinkwrap validation", () => {
  const pkg = { dependencies: { yaml: "2.8.3" } };

  it("accepts a complete shrinkwrap", () => {
    expect(
      validateShrinkwrap(pkg, {
        lockfileVersion: 3,
        packages: { "": {}, "node_modules/yaml": entry("2.8.3") },
      }),
    ).toEqual([]);
  });

  it("rejects an entry without integrity", () => {
    const { integrity: _drop, ...noIntegrity } = entry("2.8.3");
    expect(
      validateShrinkwrap(pkg, {
        lockfileVersion: 3,
        packages: { "": {}, "node_modules/yaml": noIntegrity },
      }),
    ).toEqual(["node_modules/yaml: missing sha512 integrity"]);
  });

  it("rejects a floating range, a missing dependency and a version mismatch", () => {
    expect(
      validateShrinkwrap(
        { dependencies: { yaml: "^2.8.3", grammy: "1.42.0", zod: "4.0.0" } },
        {
          lockfileVersion: 3,
          packages: {
            "": {},
            "node_modules/yaml": entry("2.8.3"),
            "node_modules/zod": entry("4.1.0"),
          },
        },
      ),
    ).toEqual([
      'package.json dependencies.yaml is "^2.8.3", not an exact version',
      "npm-shrinkwrap.json pins yaml@2.8.3, package.json pins ^2.8.3",
      "npm-shrinkwrap.json has no entry for grammy",
      "npm-shrinkwrap.json pins zod@4.1.0, package.json pins 4.0.0",
    ]);
  });

  it("checks an alias entry's real package name", () => {
    expect(
      validateShrinkwrap(
        { dependencies: { alias: "npm:@scope/real@1.0.0" } },
        {
          lockfileVersion: 3,
          packages: { "": {}, "node_modules/alias": { ...entry("1.0.0"), name: "@scope/evil" } },
        },
      ),
    ).toEqual(["npm-shrinkwrap.json alias is @scope/evil, not @scope/real"]);
  });

  it("fills a missing integrity from another entry for the same tarball", () => {
    const lock = {
      packages: {
        "": {},
        "node_modules/a": entry("1.0.0"),
        "node_modules/b/node_modules/a": { version: "1.0.0", resolved: entry("1.0.0").resolved },
        "node_modules/c": {
          version: "2.0.0",
          resolved: "https://registry.npmjs.org/c/-/c-2.0.0.tgz",
        },
      },
    };
    fillMissingIntegrity(lock, () => null);
    expect(lock.packages["node_modules/b/node_modules/a"]).toMatchObject({ integrity: sha });
    expect(lock.packages["node_modules/c"]).not.toHaveProperty("integrity");
    expect(validateShrinkwrap({}, { lockfileVersion: 3, ...lock })).toEqual([
      "node_modules/c: missing sha512 integrity",
    ]);
  });

  it("reports a missing shrinkwrap file", () => {
    const root = createTempDir("enclawed-shrinkwrap-missing-");
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(pkg));
    expect(checkShrinkwrapFiles(root)).toEqual(["npm-shrinkwrap.json is missing"]);
  });

  it("refuses to pack while an earlier pack's manifest backup is still present", () => {
    const root = createTempDir("enclawed-shrinkwrap-backup-");
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "x" }));
    fs.writeFileSync(path.join(root, "package.json.prepack-orig"), JSON.stringify({ name: "x" }));
    expect(() => prepack(root)).toThrow(/previous pack did not finish/);
    postpack(root);
    expect(fs.existsSync(path.join(root, "package.json.prepack-orig"))).toBe(false);
  });
});
