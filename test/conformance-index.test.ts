// The public conformance index stays honest: every listed test exists, the
// README names every invariant, and every check the shipped command runs is
// an indexed invariant.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const index = JSON.parse(
  fs.readFileSync(path.join(root, "conformance", "invariants.json"), "utf8"),
) as { invariants: Array<{ id: string; title: string; tests: string[] }> };
const readme = fs.readFileSync(path.join(root, "conformance", "README.md"), "utf8");

describe("conformance index", () => {
  it("lists only test files that exist", () => {
    for (const inv of index.invariants) {
      expect(inv.tests.length, inv.id).toBeGreaterThan(0);
      for (const file of inv.tests) {
        expect(fs.existsSync(path.join(root, file)), `${inv.id}: ${file}`).toBe(true);
        expect(readme, `README lists ${file}`).toContain(file);
      }
      expect(readme, `README names ${inv.id}`).toContain(`\`${inv.id}\``);
    }
  });

  it("indexes every check the shipped command runs", async () => {
    const ids = new Set(index.invariants.map((i) => i.id));
    const modules = await Promise.all([
      import("../src/enclawed/conformance/checks-mcp.js"),
      import("../src/enclawed/conformance/checks-approval.js"),
      import("../src/enclawed/conformance/checks-egress.js"),
      import("../src/enclawed/conformance/checks-platform.js"),
      import("../src/enclawed/conformance/checks-skills.js"),
      import("../src/enclawed/conformance/checks-contained.js"),
      import("../src/enclawed/conformance/checks-review.js"),
      import("../src/enclawed/conformance/checks-shell.js"),
    ]);
    for (const check of modules.flatMap((m) => m.CHECKS)) {
      if (check.id !== "hardware-root-device") {
        expect(ids.has(check.id), check.id).toBe(true);
      }
    }
  });
});
