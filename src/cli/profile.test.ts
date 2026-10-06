import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "enclawed",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "enclawed", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("leaves gateway --dev for subcommands after leading root options", () => {
    const res = parseCliProfileArgs([
      "node",
      "enclawed",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual([
      "node",
      "enclawed",
      "--no-color",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "enclawed", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "enclawed", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "enclawed", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "enclawed", "status"]);
  });

  it("parses interleaved --profile after the command token", () => {
    const res = parseCliProfileArgs(["node", "enclawed", "status", "--profile", "work", "--deep"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "enclawed", "status", "--deep"]);
  });

  it("parses interleaved --dev after the command token", () => {
    const res = parseCliProfileArgs(["node", "enclawed", "status", "--dev"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "enclawed", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "enclawed", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "enclawed", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "enclawed", "--profile", "work", "--dev", "status"]],
    ["interleaved after command", ["node", "enclawed", "status", "--profile", "work", "--dev"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".enclawed-dev");
    expect(env.ENCLAWED_PROFILE).toBe("dev");
    expect(env.ENCLAWED_STATE_DIR).toBe(expectedStateDir);
    expect(env.ENCLAWED_CONFIG_PATH).toBe(path.join(expectedStateDir, "enclawed.json"));
    expect(env.ENCLAWED_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      ENCLAWED_STATE_DIR: "/custom",
      ENCLAWED_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.ENCLAWED_STATE_DIR).toBe("/custom");
    expect(env.ENCLAWED_GATEWAY_PORT).toBe("19099");
    expect(env.ENCLAWED_CONFIG_PATH).toBe(path.join("/custom", "enclawed.json"));
  });

  it("uses ENCLAWED_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      ENCLAWED_HOME: "/srv/enclawed-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/enclawed-home");
    expect(env.ENCLAWED_STATE_DIR).toBe(path.join(resolvedHome, ".enclawed-work"));
    expect(env.ENCLAWED_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".enclawed-work", "enclawed.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "enclawed doctor --fix",
      env: {},
      expected: "enclawed doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "enclawed doctor --fix",
      env: { ENCLAWED_PROFILE: "default" },
      expected: "enclawed doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "enclawed doctor --fix",
      env: { ENCLAWED_PROFILE: "Default" },
      expected: "enclawed doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "enclawed doctor --fix",
      env: { ENCLAWED_PROFILE: "bad profile" },
      expected: "enclawed doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "enclawed --profile work doctor --fix",
      env: { ENCLAWED_PROFILE: "work" },
      expected: "enclawed --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "enclawed --dev doctor",
      env: { ENCLAWED_PROFILE: "dev" },
      expected: "enclawed --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("enclawed doctor --fix", { ENCLAWED_PROFILE: "work" })).toBe(
      "enclawed --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("enclawed doctor --fix", { ENCLAWED_PROFILE: "  jbenclawed  " })).toBe(
      "enclawed --profile jbenclawed doctor --fix",
    );
  });

  it("handles command with no args after enclawed", () => {
    expect(formatCliCommand("enclawed", { ENCLAWED_PROFILE: "test" })).toBe(
      "enclawed --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm enclawed doctor", { ENCLAWED_PROFILE: "work" })).toBe(
      "pnpm enclawed --profile work doctor",
    );
  });

  it("inserts --container when a container hint is set", () => {
    expect(
      formatCliCommand("enclawed gateway status --deep", { ENCLAWED_CONTAINER_HINT: "demo" }),
    ).toBe("enclawed --container demo gateway status --deep");
  });

  it("ignores unsafe container hints", () => {
    expect(
      formatCliCommand("enclawed gateway status --deep", {
        ENCLAWED_CONTAINER_HINT: "demo; rm -rf /",
      }),
    ).toBe("enclawed gateway status --deep");
  });

  it("preserves both --container and --profile hints", () => {
    expect(
      formatCliCommand("enclawed doctor", {
        ENCLAWED_CONTAINER_HINT: "demo",
        ENCLAWED_PROFILE: "work",
      }),
    ).toBe("enclawed --container demo doctor");
  });

  it("does not prepend --container for update commands", () => {
    expect(formatCliCommand("enclawed update", { ENCLAWED_CONTAINER_HINT: "demo" })).toBe(
      "enclawed update",
    );
    expect(
      formatCliCommand("pnpm enclawed update --channel beta", { ENCLAWED_CONTAINER_HINT: "demo" }),
    ).toBe("pnpm enclawed update --channel beta");
  });
});
