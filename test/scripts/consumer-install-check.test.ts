import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deprecationWarnings,
  metadataMismatches,
  harvestCache,
  scratchNpmEnv,
  seedCache,
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

  it("shares warm third-party content read-only and never warms the package under test", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seed-cache-"));
    try {
      const content = (root: string, rel: string) => path.join(root, "_cacache", "content-v2", rel);
      const warm = path.join(tmp, "warm");
      const third = path.join("sha512", "ab", "cd", "third");
      fs.mkdirSync(path.dirname(content(warm, third)), { recursive: true });
      fs.writeFileSync(content(warm, third), "third-party");
      // A check's cache: the warm content, hard-linked.
      const check = path.join(tmp, "check");
      seedCache(warm, check);
      expect(fs.statSync(content(check, third)).ino).toBe(fs.statSync(content(warm, third)).ino);
      // What the check fetched goes back to the warm cache, read-only; the package under test does not.
      const fetched = path.join("sha512", "ef", "01", "fetched");
      const own = path.join("sha512", "99", "88", "own");
      for (const rel of [fetched, own]) {
        fs.mkdirSync(path.dirname(content(check, rel)), { recursive: true });
        fs.writeFileSync(content(check, rel), rel);
      }
      harvestCache(check, warm, new Set([own]));
      expect(fs.readFileSync(content(warm, fetched), "utf8")).toBe(fetched);
      expect(fs.statSync(content(warm, fetched)).mode & 0o222).toBe(0);
      expect(fs.existsSync(content(warm, own))).toBe(false);
      // No warm cache yet: nothing to seed.
      seedCache(path.join(tmp, "none"), path.join(tmp, "empty"));
      expect(fs.existsSync(path.join(tmp, "empty"))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
