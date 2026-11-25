import { describe, expect, it } from "vitest";
import {
  deprecationWarnings,
  metadataMismatches,
  scratchNpmEnv,
} from "../../scripts/ci/consumer-install-check.mjs";

describe("consumer install check", () => {
  it("runs npm with a scratch HOME and cache and drops inherited npm settings", () => {
    const env = scratchNpmEnv(
      {
        PATH: "/bin",
        HOME: "/home/real",
        npm_config_dry_run: "true",
        npm_config_prefix: "/usr/local",
        NPM_CONFIG_OMIT: "optional",
        npm_execpath: "/opt/npm/bin/npm-cli.js",
        npm_config_registry: "https://mirror.example.invalid/",
      },
      "/scratch/home",
      "/scratch/cache",
    );
    expect(env).toEqual({
      PATH: "/bin",
      HOME: "/scratch/home",
      USERPROFILE: "/scratch/home",
      npm_config_cache: "/scratch/cache",
      npm_config_registry: "https://mirror.example.invalid/",
      NO_COLOR: "1",
    });
  });

  it("finds npm deprecation warnings in npm 9 and npm 10+ output", () => {
    const output = [
      "added 1 package",
      "npm WARN deprecated node-domexception@1.0.0: Use your platform's native DOMException instead",
      "npm warn deprecated crypto-js@4.2.0: no longer maintained",
      "npm warn EBADENGINE something else",
    ].join("\n");
    expect(deprecationWarnings(output)).toHaveLength(2);
    expect(deprecationWarnings("added 868 packages")).toEqual([]);
  });

  it("flags registry metadata missing dependencies the tarball's package.json has (enclawed 2.0.1)", () => {
    const tarball = {
      name: "enclawed",
      dependencies: { ws: "8.18.3", imapflow: "1.7.8" },
      optionalDependencies: { "node-hid": "3.2.0" },
    };
    // What `npm publish` from the folder uploaded: the list from before prepack.
    const registry = {
      dependencies: { ws: "^8.18.0", "node-hid": "^3.2.0" },
      optionalDependencies: { "node-hid": "^3.2.0" },
    };
    const found = metadataMismatches(registry, tarball);
    expect(found.join("\n")).toContain("dependencies: 3 differ");
    expect(found.join("\n")).toContain("imapflow");
    expect(found.join("\n")).toContain("optionalDependencies: 1 differ");
  });

  it("accepts metadata npm normalized from the same package.json", () => {
    const tarball = {
      name: "enclawed",
      bin: "enclawed.mjs",
      dependencies: { ws: "8.18.3" },
      optionalDependencies: { "node-hid": "3.2.0" },
      engines: { node: ">=22.14.0" },
    };
    // npm lists optional dependencies under dependencies too and expands a string bin.
    const registry = {
      bin: { enclawed: "enclawed.mjs" },
      dependencies: { "node-hid": "3.2.0", ws: "8.18.3" },
      optionalDependencies: { "node-hid": "3.2.0" },
      engines: { node: ">=22.14.0" },
      peerDependencies: {},
    };
    expect(metadataMismatches(registry, tarball)).toEqual([]);
  });
});
