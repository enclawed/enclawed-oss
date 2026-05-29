import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPolicyCommand } from "./register.policy.js";

const mocks = vi.hoisted(() => ({
  runtime: {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
    writeJson: vi.fn(),
    writeStdout: vi.fn(),
  },
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: mocks.runtime,
}));

describe("registerPolicyCommand", () => {
  async function runCli(args: string[]) {
    const program = new Command();
    registerPolicyCommand(program);
    await program.parseAsync(args, { from: "user" });
  }

  let tmp: string;
  let configPath: string;
  let originalState: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmp = await mkdtemp(join(tmpdir(), "enclawed-policy-cli-"));
    await mkdir(join(tmp, ".enclawed"), { recursive: true });
    configPath = join(tmp, ".enclawed", "enclawed.json");
    originalState = process.env.ENCLAWED_STATE_DIR;
    process.env.ENCLAWED_STATE_DIR = join(tmp, ".enclawed");
  });

  afterEach(() => {
    if (originalState === undefined) delete process.env.ENCLAWED_STATE_DIR;
    else process.env.ENCLAWED_STATE_DIR = originalState;
  });

  it("reads the enclawed.policy block and prints it (JSON)", async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        enclawed: {
          policy: {
            enforceAllowlists: true,
            allowedHosts: ["gmail.googleapis.com", "127.0.0.1"],
            allowedChannels: ["mcp.workspace"],
          },
        },
      }),
    );

    await runCli(["policy", "show", "--config", configPath, "--json"]);

    expect(mocks.runtime.exit).not.toHaveBeenCalled();
    expect(mocks.runtime.writeJson).toHaveBeenCalledTimes(1);
    const payload = mocks.runtime.writeJson.mock.calls[0]?.[0] as {
      enforceAllowlists: boolean;
      allowedHosts: string[];
      allowedChannels: string[];
    };
    expect(payload.enforceAllowlists).toBe(true);
    expect(payload.allowedHosts).toEqual(["127.0.0.1", "gmail.googleapis.com"]);
    expect(payload.allowedChannels).toEqual(["mcp.workspace"]);
  });

  it("falls back to flavor defaults when no config exists", async () => {
    await runCli(["policy", "show", "--config", join(tmp, "missing.json"), "--json"]);

    expect(mocks.runtime.exit).not.toHaveBeenCalled();
    const payload = mocks.runtime.writeJson.mock.calls[0]?.[0] as {
      source: string;
      allowedHosts: string[];
    };
    expect(payload.source).toMatch(/flavor-default/);
  });

  it("exits 1 on invalid JSON in the config file", async () => {
    await writeFile(configPath, "{ not json");
    await runCli(["policy", "show", "--config", configPath, "--json"]);
    expect(mocks.runtime.exit).toHaveBeenCalledWith(1);
  });

  it("exits 1 on schema violations (e.g. allowedHosts as string)", async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        enclawed: { policy: { allowedHosts: "gmail.googleapis.com" } },
      }),
    );
    await runCli(["policy", "show", "--config", configPath, "--json"]);
    expect(mocks.runtime.exit).toHaveBeenCalledWith(1);
  });

  it("emits human-readable output when --json is not set", async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        enclawed: {
          policy: { allowedHosts: ["api.example.com"], allowedChannels: ["ops"] },
        },
      }),
    );
    await runCli(["policy", "show", "--config", configPath]);
    const printed = mocks.runtime.log.mock.calls.map((args) => String(args[0])).join("\n");
    expect(printed).toContain("policy:");
    expect(printed).toContain('"api.example.com"');
    expect(printed).toContain('"ops"');
  });
});
