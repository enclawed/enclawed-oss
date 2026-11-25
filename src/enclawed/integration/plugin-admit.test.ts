// Admission is bound to what boot-time verification vouched for: the install
// path and the manifest content, not just the plugin id.

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveBundledPluginsDir } from "../../plugins/bundled-dir.js";
import { defaultEnclavedPolicy } from "../policy.js";
import { clearRuntime, type EnclawedRuntime, setRuntime } from "../runtime.js";
import { clearModuleBindings } from "./module-binding.js";
import { admitPluginCandidate } from "./plugin-admit.js";
import { preloadModuleDecisions } from "./preload.js";

const SIGNED_FIXTURE = path.resolve(import.meta.dirname, "../../../extensions/acpx");

let dir: string;
let records: Array<{ type: string; payload: unknown }>;

async function bootWith(root: string, flavor: "enclaved" | "open"): Promise<void> {
  const moduleDecisions = await preloadModuleDecisions(root, { flavor });
  records = [];
  setRuntime({
    flavor,
    policy: defaultEnclavedPolicy(),
    audit: {
      append: async (r: { type: string; payload: unknown }) => {
        records.push(r);
      },
    } as unknown as EnclawedRuntime["audit"],
    restoreFetch: () => {},
    fipsRequired: flavor === "enclaved",
    moduleDecisions,
  });
}

function copyPlugin(to: string): void {
  mkdirSync(to, { recursive: true });
  for (const f of ["enclawed.module.json", "enclawed.plugin.json"]) {
    cpSync(path.join(SIGNED_FIXTURE, f), path.join(to, f));
  }
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "plugin-admit-"));
  copyPlugin(path.join(dir, "bundled", "acpx"));
  copyPlugin(path.join(dir, "attacker", "acpx"));
});

afterEach(() => {
  clearRuntime();
  clearModuleBindings();
  rmSync(dir, { recursive: true, force: true });
});

describe("plugin admission binding", () => {
  it("admits the verified plugin from its verified path", async () => {
    await bootWith(path.join(dir, "bundled"), "enclaved");
    const d = admitPluginCandidate({
      pluginId: "acpx",
      rootDir: path.join(dir, "bundled", "acpx"),
    });
    expect(d.admit).toBe(true);
  });

  it("refuses a same-id plugin from another path, and logs the collision", async () => {
    await bootWith(path.join(dir, "bundled"), "enclaved");
    const d = admitPluginCandidate({
      pluginId: "acpx",
      rootDir: path.join(dir, "attacker", "acpx"),
    });
    expect(d.admit).toBe(false);
    expect(d.admit ? "" : d.reason).toMatch(/verified plugin with this id is at/);
    await new Promise((r) => setImmediate(r));
    expect(records.map((r) => r.type)).toContain("plugin.admit.collision");
  });

  it("refuses the verified path when its manifest changed after boot", async () => {
    await bootWith(path.join(dir, "bundled"), "enclaved");
    writeFileSync(
      path.join(dir, "bundled", "acpx", "enclawed.plugin.json"),
      JSON.stringify({ id: "acpx", configSchema: { type: "object" } }),
    );
    const d = admitPluginCandidate({
      pluginId: "acpx",
      rootDir: path.join(dir, "bundled", "acpx"),
    });
    expect(d.admit).toBe(false);
  });

  it("refuses the shadow in the open flavor too (it would inherit the signed decision)", async () => {
    await bootWith(path.join(dir, "bundled"), "open");
    const d = admitPluginCandidate({
      pluginId: "acpx",
      rootDir: path.join(dir, "attacker", "acpx"),
    });
    expect(d.admit).toBe(false);
  });
});

// Audit follow-up (#8): a bundled tree relocated with ENCLAWED_BUNDLED_PLUGINS_DIR
// gets the same verification as the default tree. Startup preloads decisions
// for the directory resolveBundledPluginsDir() returns (src/entry.ts), and
// admission binds each decision to that directory, so a plugin is verified
// wherever the tree lives and nothing outside the verified tree rides on it.
describe("relocated bundled tree (ENCLAWED_BUNDLED_PLUGINS_DIR)", () => {
  async function bootFromOverride(override: string, flavor: "enclaved" | "open") {
    const root = resolveBundledPluginsDir({ ENCLAWED_BUNDLED_PLUGINS_DIR: override });
    expect(root).toBe(override);
    await bootWith(root as string, flavor);
  }

  it("FP: a signed plugin in the relocated tree is admitted from that tree", async () => {
    await bootFromOverride(path.join(dir, "attacker"), "enclaved");
    expect(
      admitPluginCandidate({ pluginId: "acpx", rootDir: path.join(dir, "attacker", "acpx") }).admit,
    ).toBe(true);
  });

  it("attack: an unsigned plugin in the relocated tree is refused in the enclaved flavor", async () => {
    const unsigned = path.join(dir, "attacker", "unsigned");
    mkdirSync(unsigned, { recursive: true });
    writeFileSync(
      path.join(unsigned, "enclawed.module.json"),
      JSON.stringify({
        v: 1,
        id: "unsigned",
        publisher: "x",
        version: "1.0.0",
        clearance: "internal",
        capabilities: ["fs.read"],
        verification: "tested",
        netAllowedHosts: [],
      }),
    );
    await bootFromOverride(path.join(dir, "attacker"), "enclaved");
    const d = admitPluginCandidate({ pluginId: "unsigned", rootDir: unsigned });
    expect(d.admit).toBe(false);
  });

  it("attack: decisions made under the open rules never admit in the enclaved flavor", async () => {
    const unsigned = path.join(dir, "attacker", "unsigned");
    mkdirSync(unsigned, { recursive: true });
    writeFileSync(
      path.join(unsigned, "enclawed.module.json"),
      JSON.stringify({
        v: 1,
        id: "unsigned",
        publisher: "x",
        version: "1.0.0",
        clearance: "internal",
        capabilities: ["fs.read"],
        verification: "tested",
        netAllowedHosts: [],
      }),
    );
    // Preload under the open rules (warn-only), then run enclaved.
    const moduleDecisions = await preloadModuleDecisions(path.join(dir, "attacker"), {
      flavor: "open",
    });
    expect(moduleDecisions.get("unsigned")?.allowed).toBe(true);
    setRuntime({
      flavor: "enclaved",
      policy: defaultEnclavedPolicy(),
      audit: { append: async () => {} } as unknown as EnclawedRuntime["audit"],
      restoreFetch: () => {},
      fipsRequired: true,
      moduleDecisions,
    });
    const d = admitPluginCandidate({ pluginId: "unsigned", rootDir: unsigned });
    expect(d.admit ? "" : d.reason).toMatch(/made under the "open" flavor/);
  });

  it("attack: switching the tree after startup does not carry the verified decisions", async () => {
    await bootWith(path.join(dir, "bundled"), "enclaved");
    const moved = resolveBundledPluginsDir({
      ENCLAWED_BUNDLED_PLUGINS_DIR: path.join(dir, "attacker"),
    });
    for (const flavor of ["enclaved", "open"] as const) {
      await bootWith(path.join(dir, "bundled"), flavor);
      expect(
        admitPluginCandidate({ pluginId: "acpx", rootDir: path.join(moved as string, "acpx") })
          .admit,
      ).toBe(false);
    }
  });
});
