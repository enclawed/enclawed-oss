import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogger } from "../../enclawed/audit-log.js";
import { registerAuditCommand } from "./register.audit.js";

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

async function makeChainedLog(entryCount: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "enclawed-audit-cli-"));
  const path = join(dir, "audit.jsonl");
  const log = new AuditLogger({ filePath: path });
  for (let i = 0; i < entryCount; i++) {
    await log.append({
      type: "unit.test",
      actor: "vitest",
      level: null,
      payload: { i },
    });
  }
  await log.close();
  return path;
}

describe("registerAuditCommand", () => {
  async function runCli(args: string[]) {
    const program = new Command();
    registerAuditCommand(program);
    await program.parseAsync(args, { from: "user" });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports chain ok for an untampered log", async () => {
    const path = await makeChainedLog(3);
    await runCli(["audit", "verify", path]);

    expect(mocks.runtime.exit).not.toHaveBeenCalled();
    const printed = mocks.runtime.log.mock.calls.map((args) => String(args[0])).join("\n");
    expect(printed).toContain("verified 3 entries");
    expect(printed).toContain("chain ok");
  });

  it("emits JSON when --json is set", async () => {
    const path = await makeChainedLog(2);
    await runCli(["audit", "verify", path, "--json"]);

    expect(mocks.runtime.writeJson).toHaveBeenCalledTimes(1);
    const payload = mocks.runtime.writeJson.mock.calls[0]?.[0] as {
      ok: boolean;
      count: number;
      path: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.count).toBe(2);
    expect(payload.path).toBe(path);
  });

  it("detects tampering and exits 1", async () => {
    const path = await makeChainedLog(3);
    // Corrupt the middle line in place — preserves JSONL shape but breaks
    // the chain hash.
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(path, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const rec = JSON.parse(lines[1]!);
    rec.payload.i = 999;
    lines[1] = JSON.stringify(rec);
    await writeFile(path, lines.join("\n") + "\n");

    await runCli(["audit", "verify", path]);

    expect(mocks.runtime.exit).toHaveBeenCalledWith(1);
    const errored = mocks.runtime.error.mock.calls.map((args) => String(args[0])).join("\n");
    expect(errored).toContain("chain broken at entry 1");
  });

  it("exits 1 when the file does not exist", async () => {
    await runCli(["audit", "verify", "/nonexistent/audit.jsonl"]);
    expect(mocks.runtime.exit).toHaveBeenCalledWith(1);
  });
});
