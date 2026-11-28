// zz-h3: what a later tool of the person runs from the project without a
// decision: yarn's own code (its releases, plugins and editor SDKs), its PnP
// loader, dev servers' caches of transformed code, and the file a protected
// yarn configuration names to run in place of yarn.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { namedByYarnrc } from "../adapter/path-rules.js";
import { implicitExecTarget, yarnPathTargets } from "./exec-caches.js";

describe("implicit execution caches", () => {
  it.each([
    "/p/.yarn/releases/yarn-4.5.0.cjs",
    "/p/.yarn/plugins/@yarnpkg/plugin-x.cjs",
    "/p/.yarn/sdks/eslint/bin/eslint.js",
    "/p/.pnp.cjs",
    "/p/.pnp.loader.mjs",
    "/p/.pnp.data.json",
    "/p/.angular/cache/19.0.0/x.js",
    "/p/.next/cache/webpack/client/0.pack",
  ])("%s is one", (p) => {
    expect(implicitExecTarget(p)).toBe(true);
  });

  it.each(["/p/.yarn/cache/x.zip", "/p/.next/server/page.js", "/p/src/pnp.cjs", "/p/yarn.lock"])(
    "%s is not",
    (p) => {
      expect(implicitExecTarget(p)).toBe(false);
    },
  );
});

describe("the file a yarn configuration names to run", () => {
  it("yarnPath (berry) and yarn-path (classic), quoted or not, relative to the file", () => {
    const files: Record<string, string> = {
      "/p/.yarnrc.yml": 'nodeLinker: pnp\nyarnPath: ".yarn/releases/yarn-4.cjs"  # pinned\n',
      "/p/sub/.yarnrc": "yarn-path ../tools/yarn.js\n",
    };
    expect(yarnPathTargets(["/p", "/p/sub"], (f) => files[f] ?? null)).toEqual([
      "/p/.yarn/releases/yarn-4.cjs",
      "/p/tools/yarn.js",
    ]);
  });

  it("pnpm's hook file, named by pnpm-workspace.yaml or .npmrc", () => {
    const files: Record<string, string> = {
      "/p/pnpm-workspace.yaml": "packages:\n  - pkgs/*\npnpmfile: hooks.cjs\n",
      "/p/.npmrc": "global-pnpmfile=/p/tools/g.cjs\n",
    };
    expect(yarnPathTargets(["/p"], (f) => files[f] ?? null)).toEqual([
      "/p/hooks.cjs",
      "/p/tools/g.cjs",
    ]);
  });

  it("a write to it is a write of a protected file", () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-yarnpath-")));
    try {
      fs.writeFileSync(path.join(root, ".yarnrc.yml"), "yarnPath: tools/run.cjs\n");
      expect(namedByYarnrc(root, path.join(root, "tools/run.cjs"), root)).toBe(true);
      expect(namedByYarnrc(root, path.join(root, "tools/other.cjs"), root)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
