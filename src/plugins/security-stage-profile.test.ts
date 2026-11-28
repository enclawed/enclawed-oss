import { describe, expect, it } from "vitest";
import type { EnclawedConfig } from "../config/types.enclawed.js";
import { createEmptyPluginRegistry } from "./registry-empty.js";
import type { PluginRegistry } from "./registry-types.js";
import {
  assertRequiredSecurityStagesLoaded,
  assertSecurityStagesEnforced,
  evaluateSecurityStages,
  SecurityStageWeakenedError,
  type SecurityStageManifest,
} from "./security-stage-profile.js";

// Settings audit X2: a security stage's enable flag and mode may only be
// tightened in an enforcing profile (the enclaved flavor, or any profile that
// enables the stage by default).

const REQUIRED: SecurityStageManifest = {
  id: "stage-required",
  origin: "bundled",
  securityStage: true,
  enabledByDefault: true,
};
const OPTIONAL: SecurityStageManifest = {
  id: "stage-optional",
  origin: "bundled",
  securityStage: true,
};
const PLAIN: SecurityStageManifest = { id: "plain", origin: "bundled", enabledByDefault: true };
const MANIFESTS = [REQUIRED, OPTIONAL, PLAIN];

function settings(config: EnclawedConfig, flavor: "open" | "enclaved"): string[] {
  return evaluateSecurityStages({ config, manifests: MANIFESTS, flavor }).weakenings.map(
    (w) => w.setting,
  );
}

function entries(value: Record<string, unknown>): EnclawedConfig {
  return { plugins: { entries: value } } as EnclawedConfig;
}

describe("security stages in an enforcing profile", () => {
  describe("attack: switching a required stage off is refused in every flavor", () => {
    for (const flavor of ["open", "enclaved"] as const) {
      it(`plugins.entries.<id>.enabled=false (${flavor})`, () => {
        expect(settings(entries({ "stage-required": { enabled: false } }), flavor)).toEqual([
          "plugins.entries.stage-required.enabled=false",
        ]);
      });
      it(`plugins.enabled=false, deny, or an allow list that leaves it out (${flavor})`, () => {
        expect(settings({ plugins: { enabled: false } }, flavor)).toEqual([
          "plugins.enabled=false",
        ]);
        expect(settings({ plugins: { deny: ["stage-required"] } }, flavor)).toEqual([
          "plugins.deny contains stage-required",
        ]);
        expect(settings({ plugins: { allow: ["plain"] } }, flavor)).toEqual([
          "plugins.allow leaves out stage-required",
        ]);
      });
    }
  });

  it("attack: a required stage's own enabled:false or audit/off mode is refused", () => {
    for (const flavor of ["open", "enclaved"] as const) {
      expect(
        settings(entries({ "stage-required": { config: { enabled: false } } }), flavor),
      ).toEqual(["plugins.entries.stage-required.config.enabled=false"]);
      for (const mode of ["audit", "off", " Audit "]) {
        expect(settings(entries({ "stage-required": { config: { mode } } }), flavor)).toEqual([
          `plugins.entries.stage-required.config.mode=${mode}`,
        ]);
      }
    }
  });

  it("attack: in the enclaved flavor an enabled optional stage may not be weakened either", () => {
    const enabled = (config: Record<string, unknown>) =>
      entries({ "stage-optional": { enabled: true, config } });
    expect(settings(enabled({ enabled: false }), "enclaved")).toEqual([
      "plugins.entries.stage-optional.config.enabled=false",
    ]);
    expect(settings(enabled({ mode: "audit" }), "enclaved")).toEqual([
      "plugins.entries.stage-optional.config.mode=audit",
    ]);
  });

  it("FP: an optional stage left off is at its default and never refused", () => {
    for (const flavor of ["open", "enclaved"] as const) {
      expect(settings(entries({ "stage-optional": { enabled: false } }), flavor)).toEqual([]);
      expect(settings({ plugins: { deny: ["stage-optional"] } }, flavor)).toEqual([]);
    }
  });

  it("FP: the open flavor leaves an optional stage's own settings alone", () => {
    const cfg = entries({ "stage-optional": { enabled: true, config: { mode: "audit" } } });
    expect(settings(cfg, "open")).toEqual([]);
  });

  it("FP: enforce, a non-egress mode value, and enabled:true are accepted", () => {
    for (const flavor of ["open", "enclaved"] as const) {
      for (const config of [{ mode: "enforce" }, { mode: "poisson" }, { enabled: true }, {}]) {
        expect(settings(entries({ "stage-required": { config } }), flavor)).toEqual([]);
      }
    }
  });

  it("FP: a plain plugin (no securityStage) may be switched off", () => {
    expect(
      settings(entries({ plain: { enabled: false, config: { enabled: false } } }), "enclaved"),
    ).toEqual([]);
  });

  it("reports the required stages so the caller can check they loaded", () => {
    const profile = evaluateSecurityStages({ config: {}, manifests: MANIFESTS, flavor: "open" });
    expect(profile.requiredIds).toEqual(["stage-required"]);
  });

  it("assertSecurityStagesEnforced throws with the offending settings", () => {
    expect(() =>
      assertSecurityStagesEnforced({
        config: entries({ "stage-required": { enabled: false } }),
        manifests: MANIFESTS,
        flavor: "enclaved",
      }),
    ).toThrow(SecurityStageWeakenedError);
    expect(() =>
      assertSecurityStagesEnforced({
        config: entries({ "stage-required": { enabled: false } }),
        manifests: MANIFESTS,
        flavor: "enclaved",
        context: "config reload",
      }),
    ).toThrow(/refusing config reload: .*plugins\.entries\.stage-required\.enabled=false/);
    expect(() =>
      assertSecurityStagesEnforced({ config: {}, manifests: MANIFESTS, flavor: "enclaved" }),
    ).not.toThrow();
  });

  describe("a stage refused by plugin admission (tampered or unsigned)", () => {
    const refusedRequired = {
      id: "stage-required",
      origin: "bundled" as const,
      enabledByDefault: true,
      reason: "signature verification failed",
    };
    const refusedOptional = {
      id: "stage-optional",
      origin: "bundled" as const,
      reason: "unsigned",
    };
    const evaluate = (config: EnclawedConfig, flavor: "open" | "enclaved") =>
      evaluateSecurityStages({
        config,
        manifests: [PLAIN],
        refused: [refusedRequired, refusedOptional],
        flavor,
      }).weakenings.map((w) => w.setting);

    it("attack: a required stage refused by admission refuses start", () => {
      for (const flavor of ["open", "enclaved"] as const) {
        expect(evaluate({}, flavor)).toEqual([
          "stage-required refused by plugin admission (signature verification failed)",
        ]);
      }
    });

    it("attack: in the enclaved flavor an enabled optional stage refused by admission refuses start", () => {
      expect(evaluate(entries({ "stage-optional": { enabled: true } }), "enclaved")).toEqual([
        "stage-required refused by plugin admission (signature verification failed)",
        "stage-optional refused by plugin admission (unsigned)",
      ]);
    });

    it("FP: a refused optional stage that is off, or any optional stage in open, is not refused", () => {
      expect(
        evaluate(entries({ "stage-required": { enabled: true } }), "enclaved").filter((s) =>
          s.startsWith("stage-optional"),
        ),
      ).toEqual([]);
      expect(
        evaluate(entries({ "stage-optional": { enabled: true } }), "open").filter((s) =>
          s.startsWith("stage-optional"),
        ),
      ).toEqual([]);
    });

    it("assertSecurityStagesEnforced reads the refused stages", () => {
      expect(() =>
        assertSecurityStagesEnforced({
          config: {},
          manifests: [PLAIN],
          refused: [refusedRequired],
          flavor: "open",
        }),
      ).toThrow(/refused by plugin admission/);
    });
  });

  describe("required stages must load", () => {
    const registryWith = (status?: "loaded" | "disabled" | "error"): PluginRegistry => {
      const registry = createEmptyPluginRegistry();
      if (status) {
        registry.plugins.push({
          id: "stage-required",
          status,
        } as PluginRegistry["plugins"][number]);
      }
      return registry;
    };

    it("attack: a required stage missing from the startup set refuses start", () => {
      expect(() =>
        assertRequiredSecurityStagesLoaded(["stage-required"], { pluginIds: ["plain"] }),
      ).toThrow(/not in the gateway startup plugin set/);
    });

    it("attack: a required stage that did not load refuses start", () => {
      for (const status of [undefined, "disabled", "error"] as const) {
        expect(() =>
          assertRequiredSecurityStagesLoaded(["stage-required"], {
            registry: registryWith(status),
          }),
        ).toThrow(/did not load/);
      }
    });

    it("FP: a loaded required stage passes", () => {
      expect(() =>
        assertRequiredSecurityStagesLoaded(["stage-required"], { pluginIds: ["stage-required"] }),
      ).not.toThrow();
      expect(() =>
        assertRequiredSecurityStagesLoaded(["stage-required"], {
          registry: registryWith("loaded"),
        }),
      ).not.toThrow();
      expect(() => assertRequiredSecurityStagesLoaded([], { pluginIds: [] })).not.toThrow();
    });
  });
});
