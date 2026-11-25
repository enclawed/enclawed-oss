import { describe, expect, it } from "vitest";
import type { AdminPolicy } from "./admin-policy.js";
import { ENCLAVED_REFUSED_ENV_VARS, findRefusedEnvKnobs } from "./boot-posture.js";
import {
  HardwareRootModeError,
  hardwareRootMode,
  parseHardwareRootMode,
} from "./hardware-root/root-mode.js";

// Settings audit #7, #9-#13: user-environment knobs that relocate or switch off
// hardware-root evidence, latches, the broker or the bundled plugin tree.

function admin(allow: Record<string, unknown> = {}): AdminPolicy {
  return {
    source: { kind: "root-file", path: "/etc/enclawed/policy.json" },
    doc: { v: 1, allow },
  } as AdminPolicy;
}

describe("parseHardwareRootMode (one strict parser)", () => {
  it("FP: accepts exactly required, optional and unset", () => {
    expect(parseHardwareRootMode(undefined)).toBe("auto");
    expect(parseHardwareRootMode("")).toBe("auto");
    expect(parseHardwareRootMode("required")).toBe("required");
    expect(parseHardwareRootMode("optional")).toBe("optional");
    expect(hardwareRootMode({ ENCLAWEDER_ROOT: "required" })).toBe("required");
  });

  it.each([
    "Required",
    "REQUIRED",
    " required",
    "required ",
    "1",
    "true",
    "0",
    "false",
    "off",
    "yes",
  ])("attack: refuses %j", (value) => {
    expect(() => parseHardwareRootMode(value)).toThrow(HardwareRootModeError);
  });
});

describe("findRefusedEnvKnobs", () => {
  it("attack: an invalid ENCLAWEDER_ROOT refuses startup in every flavor", () => {
    for (const flavor of ["open", "enclaved"] as const) {
      const refused = findRefusedEnvKnobs({
        flavor,
        env: { ENCLAWEDER_ROOT: "Required" },
        admin: null,
      });
      expect(refused.map((r) => r.source)).toEqual(["ENCLAWEDER_ROOT"]);
    }
  });

  it("attack: every relocation/disable knob is refused in the enclaved flavor", () => {
    for (const name of ENCLAVED_REFUSED_ENV_VARS) {
      const refused = findRefusedEnvKnobs({
        flavor: "enclaved",
        env: { [name]: "/tmp/x" },
        admin: null,
      });
      expect(refused).toEqual([{ source: name, setting: `${name}=/tmp/x` }]);
    }
    expect(
      findRefusedEnvKnobs({
        flavor: "enclaved",
        env: {
          ENCLAWED_DISABLE_BUNDLED_PLUGINS: "1",
          ENCLAWEDER_FORENSIC_WEBHOOK: "https://evil.example/x",
        },
        admin: admin({ dangerousConfigFlags: ["x"] }),
      }),
    ).toHaveLength(2);
  });

  it("attack: ENCLAWEDER_BROKER=off is refused in the enclaved flavor, in any spelling", () => {
    for (const value of ["off", "OFF", " 0", "false"]) {
      expect(
        findRefusedEnvKnobs({ flavor: "enclaved", env: { ENCLAWEDER_BROKER: value }, admin: null }),
      ).toHaveLength(1);
    }
  });

  it("attack: ENCLAWEDER_ROOT=optional from the user env is refused in the enclaved flavor", () => {
    expect(
      findRefusedEnvKnobs({
        flavor: "enclaved",
        env: { ENCLAWEDER_ROOT: "optional" },
        admin: null,
      }),
    ).toEqual([{ source: "ENCLAWEDER_ROOT", setting: "ENCLAWEDER_ROOT=optional" }]);
    expect(
      findRefusedEnvKnobs({
        flavor: "enclaved",
        env: { ENCLAWEDER_ROOT: "optional" },
        admin: admin({ hardwareRootOptional: false }),
      }),
    ).toHaveLength(1);
  });

  it("FP: the admin policy can allow ENCLAWEDER_ROOT=optional (device retirement)", () => {
    expect(
      findRefusedEnvKnobs({
        flavor: "enclaved",
        env: { ENCLAWEDER_ROOT: "optional" },
        admin: admin({ hardwareRootOptional: true }),
      }),
    ).toEqual([]);
  });

  it("attack: ENCLAWED_BUNDLED_PLUGINS_DIR is refused in the enclaved flavor", () => {
    for (const admin_ of [
      null,
      admin(),
      admin({ bundledPluginsDir: "/opt/enclawed/extensions" }),
    ]) {
      const refused = findRefusedEnvKnobs({
        flavor: "enclaved",
        env: { ENCLAWED_BUNDLED_PLUGINS_DIR: "/home/u/evil-tree" },
        admin: admin_,
      });
      expect(refused).toEqual([
        {
          source: "ENCLAWED_BUNDLED_PLUGINS_DIR",
          setting: "ENCLAWED_BUNDLED_PLUGINS_DIR=/home/u/evil-tree",
        },
      ]);
    }
  });

  it("FP: the directory the admin policy names is accepted", () => {
    for (const value of [
      "/opt/enclawed/extensions",
      "/opt/enclawed/extensions/",
      " /opt/enclawed/x/../extensions ",
    ]) {
      expect(
        findRefusedEnvKnobs({
          flavor: "enclaved",
          env: { ENCLAWED_BUNDLED_PLUGINS_DIR: value },
          admin: admin({ bundledPluginsDir: "/opt/enclawed/extensions" }),
        }),
      ).toEqual([]);
    }
  });

  it("FP: user-specific and unset values start normally", () => {
    const env = {
      ENCLAWEDER_ROOT: "required",
      ENCLAWEDER_HIDRAW: "/dev/hidraw3",
      ENCLAWEDER_BROKER: "/run/user/1000/enclawed/broker.sock",
      ENCLAWED_DISABLE_BUNDLED_PLUGINS: "",
      ENCLAWED_BUNDLED_PLUGINS_DIR: "",
      HOME: "/home/u",
    };
    expect(findRefusedEnvKnobs({ flavor: "enclaved", env, admin: null })).toEqual([]);
    expect(findRefusedEnvKnobs({ flavor: "enclaved", env: {}, admin: null })).toEqual([]);
  });

  it("FP: the open flavor keeps the knobs (only the strict ENCLAWEDER_ROOT parse applies)", () => {
    const env: NodeJS.ProcessEnv = {
      ENCLAWEDER_ROOT: "optional",
      ENCLAWEDER_BROKER: "off",
      ENCLAWED_BUNDLED_PLUGINS_DIR: "/home/u/tree",
    };
    for (const name of ENCLAVED_REFUSED_ENV_VARS) {
      env[name] = "1";
    }
    expect(findRefusedEnvKnobs({ flavor: "open", env, admin: null })).toEqual([]);
  });
});
