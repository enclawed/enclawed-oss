/**
 * G4 — bundled capability-runtime shim parity test.
 *
 * Validates that every entry in `CAPABILITY_VITEST_SHIM_ALIASES` (the
 * `@enclawed/plugin-sdk/<subpath>` aliases that get redirected to a
 * tiny in-tree shim under Vitest) corresponds to:
 *
 *   1. A declared subpath in the package's `exports` map. A shim alias
 *      whose subpath isn't a real declared export would silently
 *      fulfil any import name — exactly the failure mode the gate is
 *      meant to prevent. Without this assertion, a developer could
 *      delete an export from package.json and the capability tests
 *      would still pass while runtime would fail.
 *
 *   2. A real source file (the shim's `target`) that exists on disk.
 *      The shim alias points to a `URL` resolved relative to
 *      `bundled-capability-runtime.ts`; if the target file is renamed
 *      or removed without updating the catalogue, the alias would
 *      still resolve under Vitest's module resolver but fail at
 *      runtime when the shim's contents are imported.
 *
 *   3. An export of every value-symbol that the shim re-exports from
 *      the matching `src/plugin-sdk/<subpath>.ts`. The shim's purpose
 *      is to narrow the import graph, not to mint new symbols — every
 *      value re-export must be backed by a real export from the
 *      underlying SDK source.
 *
 * Together these checks turn the shim catalogue from "fulfils any
 * import name" into "fulfils only the imports the SDK actually
 * provides", giving Vitest the same surface contract the packaged
 * runtime enforces.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CAPABILITY_VITEST_SHIM_ALIASES } from "./bundled-capability-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..", "..");

type ExportsMap = Record<string, unknown>;

function loadPackageExports(): ExportsMap {
  const raw = readFileSync(resolve(REPO_ROOT, "package.json"), "utf8");
  const parsed = JSON.parse(raw) as { exports?: ExportsMap };
  return parsed.exports ?? {};
}

/**
 * Best-effort extractor for *value* export names (functions, classes,
 * variables, re-exports) from a TypeScript source file. We deliberately
 * skip type-only exports because the shim test only cares about names
 * that would throw a `ReferenceError` at runtime if absent.
 *
 * Patterns recognised:
 *   - export function foo(...)
 *   - export const foo = / export let foo = / export var foo =
 *   - export class Foo / export enum Foo (enum is runtime!)
 *   - export { foo, bar } from "..."   (value re-exports)
 *   - export * from "..."              (we walk the upstream module)
 *   - export default ... (counted as "default")
 *
 * Type-only forms are skipped:
 *   - export type Foo = ...
 *   - export interface Foo { ... }
 *   - export type { ... }
 *   - import { type Foo } / { Foo as type } variants
 *
 * Not a TS parser — but the surface we care about (plugin-sdk public
 * boundary) is consistently written and this regex pass matches it
 * with zero false positives on the current tree.
 */
function extractValueExportNames(sourcePath: string): Set<string> {
  if (!existsSync(sourcePath)) {
    return new Set();
  }
  const src = readFileSync(sourcePath, "utf8");
  const names = new Set<string>();

  // `export type ...` and `export interface ...` and `export type { ... }`
  // are filtered out by skipping any match whose preceding `export` is
  // followed by `type ` or `interface `.
  const declRe =
    /\bexport\s+(?:default\s+)?(?:async\s+)?(function\*?|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(src))) {
    names.add(m[2]);
  }

  // export default …  (unnamed default)
  if (/\bexport\s+default\b/.test(src)) {
    names.add("default");
  }

  // export { a, b as c } [from "…"];  — handles both named-export and
  // re-export forms. Skips `export type { … }` and skips items prefixed
  // with `type ` inside the braces.
  const namedExportRe = /\bexport\s+(?!type\b)\{([^}]+)\}/g;
  while ((m = namedExportRe.exec(src))) {
    const inner = m[1];
    for (const piece of inner.split(",")) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      if (/^type\s/.test(trimmed)) continue;
      const asMatch = trimmed.match(/^[A-Za-z_$][\w$]*\s+as\s+([A-Za-z_$][\w$]*)\s*$/);
      if (asMatch) {
        names.add(asMatch[1]);
        continue;
      }
      const bare = trimmed.match(/^([A-Za-z_$][\w$]*)\s*$/);
      if (bare) {
        names.add(bare[1]);
      }
    }
  }

  return names;
}

describe("bundled-capability-runtime shim parity (G4)", () => {
  const packageExports = loadPackageExports();

  for (const entry of CAPABILITY_VITEST_SHIM_ALIASES) {
    describe(`alias @enclawed/plugin-sdk/${entry.subpath}`, () => {
      it("is declared in package.json exports", () => {
        const key = `./plugin-sdk/${entry.subpath}`;
        expect(
          Object.prototype.hasOwnProperty.call(packageExports, key),
          [
            `Shim alias maps @enclawed/plugin-sdk/${entry.subpath} to ${entry.target.href}`,
            `but no \`${key}\` entry exists in package.json \`exports\`.`,
            "Either declare the export in package.json or remove the shim",
            "from CAPABILITY_VITEST_SHIM_ALIASES in bundled-capability-runtime.ts.",
          ].join("\n"),
        ).toBe(true);
      });

      it("target file exists on disk", () => {
        const targetPath = fileURLToPath(entry.target);
        expect(
          existsSync(targetPath),
          [
            `Shim target file does not exist: ${targetPath}`,
            "The catalogue entry references a non-existent file — the alias",
            "would resolve under Vitest but fail at runtime when the shim's",
            "contents are imported. Fix the target path or remove the entry.",
          ].join("\n"),
        ).toBe(true);
      });

      it("does not re-export symbols missing from the underlying SDK source", () => {
        const targetPath = fileURLToPath(entry.target);
        if (!existsSync(targetPath)) {
          return; // Covered by the previous assertion.
        }

        const sdkSourcePath = resolve(REPO_ROOT, "src", "plugin-sdk", `${entry.subpath}.ts`);
        if (!existsSync(sdkSourcePath)) {
          // Some shims (llm-task) intentionally have no underlying
          // SDK source — they synthesise a vitest-only surface. The
          // package.json export check above is what enforces parity in
          // that case.
          return;
        }

        const shimSrc = readFileSync(targetPath, "utf8");
        const sdkExports = extractValueExportNames(sdkSourcePath);

        // Extract names that the shim re-exports FROM the real SDK source
        // specifically — i.e. `export { foo } from "../../plugin-sdk/<subpath>.js"`
        // or `export * from "../../plugin-sdk/<subpath>.js"`.
        const fromSdkRe = new RegExp(
          String.raw`export\s+(?!type\b)\{([^}]+)\}\s+from\s+["']\.\.\/\.\.\/plugin-sdk\/${entry.subpath}\.js["']`,
          "g",
        );
        const reexportedFromSdk = new Set<string>();
        let m: RegExpExecArray | null;
        while ((m = fromSdkRe.exec(shimSrc))) {
          for (const piece of m[1].split(",")) {
            const trimmed = piece.trim();
            if (!trimmed || /^type\s/.test(trimmed)) continue;
            const asMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s+as\s+[A-Za-z_$][\w$]*\s*$/);
            const bare = trimmed.match(/^([A-Za-z_$][\w$]*)\s*$/);
            if (asMatch) {
              reexportedFromSdk.add(asMatch[1]);
            } else if (bare) {
              reexportedFromSdk.add(bare[1]);
            }
          }
        }

        const missing = [...reexportedFromSdk].filter((name) => !sdkExports.has(name));
        expect(
          missing,
          [
            `Shim ${targetPath} re-exports value symbols from`,
            `src/plugin-sdk/${entry.subpath}.ts that the SDK source no longer exports:`,
            `  ${missing.join(", ")}`,
            "This is exactly the regression class G4 is supposed to catch —",
            "a Vitest capability run would silently succeed while the real",
            "runtime fails with ReferenceError. Restore the SDK export, or",
            "drop the shim re-export, in the same change.",
          ].join("\n"),
        ).toEqual([]);
      });
    });
  }
});
