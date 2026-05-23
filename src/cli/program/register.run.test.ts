import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseTaskFile,
  parseVarAssignments,
  registerRunCommand,
  substituteVars,
} from "./register.run.js";

const mocks = vi.hoisted(() => ({
  runtime: {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
    writeJson: vi.fn(),
    writeStdout: vi.fn(),
  },
  agentCliCommand: vi.fn(async (_opts: Record<string, unknown>) => undefined),
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: mocks.runtime,
}));

vi.mock("../../commands/agent-via-gateway.js", () => ({
  agentCliCommand: mocks.agentCliCommand,
}));

vi.mock("../deps.js", () => ({
  createDefaultDeps: () => ({}),
}));

describe("parseTaskFile", () => {
  it("extracts system + user sections", () => {
    const out = parseTaskFile(
      [
        "# Title",
        "",
        "## System",
        "You are a secretary.",
        "",
        "## User",
        "Look at the last 24h of inbox.",
      ].join("\n"),
    );
    expect(out.systemPrompt).toContain("You are a secretary.");
    expect(out.userMessage).toContain("Look at the last 24h");
  });

  it("accepts `## Message` as a user alias", () => {
    const out = parseTaskFile("## Message\nhello");
    expect(out.userMessage).toBe("hello");
    expect(out.systemPrompt).toBeUndefined();
  });

  it("rejects files with no user section", () => {
    expect(() => parseTaskFile("## System\nonly system")).toThrow(/User/);
  });
});

describe("substituteVars", () => {
  it("replaces named placeholders", () => {
    expect(substituteVars("Hello {{name}}.", { name: "world" })).toBe("Hello world.");
  });

  it("leaves unknown placeholders intact", () => {
    expect(substituteVars("Hello {{name}}.", {})).toBe("Hello {{name}}.");
  });

  it("ignores whitespace inside braces", () => {
    expect(substituteVars("Hi {{ name }}.", { name: "Alice" })).toBe("Hi Alice.");
  });
});

describe("parseVarAssignments", () => {
  it("parses k=v pairs", () => {
    expect(parseVarAssignments(["a=1", "b=two"])).toEqual({ a: "1", b: "two" });
  });

  it("rejects missing equals", () => {
    expect(() => parseVarAssignments(["nope"])).toThrow();
  });

  it("rejects bad identifier", () => {
    expect(() => parseVarAssignments(["1bad=value"])).toThrow();
  });
});

describe("registerRunCommand", () => {
  async function runCli(args: string[]) {
    const program = new Command();
    registerRunCommand(program);
    await program.parseAsync(args, { from: "user" });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches the parsed task message through agentCliCommand", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enclawed-run-cli-"));
    const file = join(dir, "task.md");
    await writeFile(
      file,
      "## System\nbe terse.\n\n## User\nsay hi to {{name}}.\n",
      "utf8",
    );

    await runCli(["run", file, "--var", "name=alice", "--agent", "secretary"]);

    expect(mocks.runtime.exit).not.toHaveBeenCalled();
    expect(mocks.agentCliCommand).toHaveBeenCalledTimes(1);
    const opts = mocks.agentCliCommand.mock.calls[0]![0];
    expect(opts.message).toContain("say hi to alice.");
    expect(opts.agent).toBe("secretary");
    expect(opts.extraSystemPrompt).toContain("be terse.");
  });

  it("loops up to --max-steps", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enclawed-run-cli-"));
    const file = join(dir, "task.md");
    await writeFile(file, "## User\nlook up the weather.\n", "utf8");

    await runCli(["run", file, "--max-steps", "3"]);

    expect(mocks.agentCliCommand).toHaveBeenCalledTimes(3);
  });

  it("rejects max-steps=0", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enclawed-run-cli-"));
    const file = join(dir, "task.md");
    await writeFile(file, "## User\nx\n", "utf8");
    await runCli(["run", file, "--max-steps", "0"]);
    expect(mocks.runtime.exit).toHaveBeenCalledWith(1);
  });

  it("rejects nonexistent task file", async () => {
    await runCli(["run", "/nonexistent/task.md"]);
    expect(mocks.runtime.exit).toHaveBeenCalledWith(1);
  });

  it("rejects malformed --var entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enclawed-run-cli-"));
    const file = join(dir, "task.md");
    await writeFile(file, "## User\nx\n", "utf8");
    await runCli(["run", file, "--var", "novalue"]);
    expect(mocks.runtime.exit).toHaveBeenCalledWith(1);
  });
});
