// The package exports the application SDK as "./framework" (dist/framework.js
// plus dist/framework.d.ts). Apps such as the executive assistant import it,
// so the build must emit both files.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repo = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(repo, p), "utf8");

describe('package export "./framework"', () => {
  const exp = (JSON.parse(read("package.json")) as { exports: Record<string, unknown> }).exports[
    "./framework"
  ] as { types: string; default: string };

  it("points at dist/framework.{js,d.ts}", () => {
    expect(exp).toEqual({ types: "./dist/framework.d.ts", default: "./dist/framework.js" });
  });

  it("is a tsdown core entry and has emitted declarations", () => {
    expect(read("tsdown.config.ts")).toMatch(/\bframework: "src\/framework\.ts"/);
    const dts = JSON.parse(read("tsconfig.plugin-sdk.dts.json")) as { include: string[] };
    expect(dts.include).toContain("src/framework.ts");
    expect(read("scripts/write-plugin-sdk-entry-dts.ts")).toMatch(/dist\/framework\.d\.ts/);
  });

  it.skipIf(!existsSync(path.join(repo, "dist", "entry.js")))(
    "the built dist contains both files",
    () => {
      expect(existsSync(path.join(repo, exp.default))).toBe(true);
      expect(existsSync(path.join(repo, exp.types))).toBe(true);
    },
  );
});
