import { describe, expect, it } from "vitest";
import {
  ensureEnclawedExecMarkerOnProcess,
  markEnclawedExecEnv,
  ENCLAWED_CLI_ENV_VALUE,
  ENCLAWED_CLI_ENV_VAR,
} from "./enclawed-exec-env.js";

describe("markEnclawedExecEnv", () => {
  it("returns a cloned env object with the exec marker set", () => {
    const env = { PATH: "/usr/bin", ENCLAWED_CLI: "0" };
    const marked = markEnclawedExecEnv(env);

    expect(marked).toEqual({
      PATH: "/usr/bin",
      ENCLAWED_CLI: ENCLAWED_CLI_ENV_VALUE,
    });
    expect(marked).not.toBe(env);
    expect(env.ENCLAWED_CLI).toBe("0");
  });
});

describe("ensureEnclawedExecMarkerOnProcess", () => {
  it.each([
    {
      name: "mutates and returns the provided process env",
      env: { PATH: "/usr/bin" } as NodeJS.ProcessEnv,
    },
    {
      name: "overwrites an existing marker on the provided process env",
      env: { PATH: "/usr/bin", [ENCLAWED_CLI_ENV_VAR]: "0" } as NodeJS.ProcessEnv,
    },
  ])("$name", ({ env }) => {
    expect(ensureEnclawedExecMarkerOnProcess(env)).toBe(env);
    expect(env[ENCLAWED_CLI_ENV_VAR]).toBe(ENCLAWED_CLI_ENV_VALUE);
  });

  it("defaults to mutating process.env when no env object is provided", () => {
    const previous = process.env[ENCLAWED_CLI_ENV_VAR];
    delete process.env[ENCLAWED_CLI_ENV_VAR];

    try {
      expect(ensureEnclawedExecMarkerOnProcess()).toBe(process.env);
      expect(process.env[ENCLAWED_CLI_ENV_VAR]).toBe(ENCLAWED_CLI_ENV_VALUE);
    } finally {
      if (previous === undefined) {
        delete process.env[ENCLAWED_CLI_ENV_VAR];
      } else {
        process.env[ENCLAWED_CLI_ENV_VAR] = previous;
      }
    }
  });
});
