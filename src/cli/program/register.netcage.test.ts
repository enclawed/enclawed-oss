import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { parsePorts, registerNetcageCommand } from "./register.netcage.js";

describe("parsePorts", () => {
  it("defaults to ollama's port, splits comma lists, dedupes, and validates", () => {
    expect(parsePorts(undefined)).toEqual([11434]);
    expect(parsePorts([])).toEqual([11434]);
    expect(parsePorts(["8000", "8000", "1234"])).toEqual([8000, 1234]);
    expect(parsePorts(["11434,1234"])).toEqual([11434, 1234]);
    expect(() => parsePorts(["0"])).toThrow(/invalid/);
    expect(() => parsePorts(["70000"])).toThrow(/invalid/);
    expect(() => parsePorts(["abc"])).toThrow(/invalid/);
  });
});

describe("registerNetcageCommand", () => {
  it("registers a netcage command with a serve subcommand", () => {
    const program = new Command();
    registerNetcageCommand(program);
    const netcage = program.commands.find((c) => c.name() === "netcage");
    expect(netcage).toBeDefined();
    expect(netcage!.commands.map((c) => c.name())).toContain("serve");
  });
});
