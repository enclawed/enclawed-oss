import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Settings audit X3: the weakening values of this plugin's config are declared
// as configContracts.dangerousFlags, so the enclaved flavor refuses them unless
// the admin policy allows the exact path.

type Flag = { path: string; equals: unknown };
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "enclawed.plugin.json"),
    "utf8",
  ),
) as {
  configSchema: Record<string, unknown>;
  configContracts?: { dangerousFlags?: Flag[] };
};

function schemaAt(dotted: string): { enum?: unknown[] } | undefined {
  let node: unknown = manifest.configSchema;
  for (const seg of dotted.split(".")) {
    node = (node as { properties?: Record<string, unknown> } | undefined)?.properties?.[seg];
  }
  return node as { enum?: unknown[] } | undefined;
}

describe("codex dangerous config flags", () => {
  const flags = manifest.configContracts?.dangerousFlags ?? [];

  it("attack: declares every weakening value as a dangerous flag", () => {
    expect(flags).toEqual(
      expect.arrayContaining([
        { path: "appServer.sandbox", equals: "danger-full-access" },
        { path: "appServer.approvalPolicy", equals: "never" },
      ]),
    );
  });

  it("FP: each declared flag names a real schema value, and safe values are not declared", () => {
    for (const flag of flags) {
      expect(schemaAt(flag.path)?.enum).toContain(flag.equals);
    }
    expect(flags.some((f) => f.equals === "workspace-write" || f.equals === "on-request")).toBe(
      false,
    );
  });
});
