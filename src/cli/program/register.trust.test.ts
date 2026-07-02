import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TRUST_ROOT, setTrustRoot } from "../../enclawed/trust-root.js";
import { registerTrustCommand } from "./register.trust.js";

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

describe("registerTrustCommand", () => {
  async function runCli(args: string[]) {
    const program = new Command();
    registerTrustCommand(program);
    await program.parseAsync(args, { from: "user" });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists at least the bundled-dev signer in human output", async () => {
    await runCli(["trust", "list"]);
    const printed = mocks.runtime.log.mock.calls.map((args) => String(args[0])).join("\n");
    // The default trust root always contains the bundled dev signer that
    // signs every shipped extensions/<id>/enclawed.module.json.
    expect(printed).toContain("enclawed-bundled-dev-2026");
    expect(printed).toContain("trust root:");
    expect(mocks.runtime.exit).not.toHaveBeenCalled();
  });

  it("emits JSON shape when --json is set", async () => {
    await runCli(["trust", "list", "--json"]);

    expect(mocks.runtime.writeJson).toHaveBeenCalledTimes(1);
    const payload = mocks.runtime.writeJson.mock.calls[0]?.[0] as {
      locked: boolean;
      signers: Array<{ keyId: string; approvedClearance: string[]; description: string }>;
    };
    expect(Array.isArray(payload.signers)).toBe(true);
    expect(payload.signers.length).toBeGreaterThan(0);
    expect(payload.signers.some((s) => s.keyId === "enclawed-bundled-dev-2026")).toBe(true);
    for (const s of payload.signers) {
      expect(typeof s.keyId).toBe("string");
      expect(Array.isArray(s.approvedClearance)).toBe(true);
    }
  });
});

const SAMPLE_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZv8=
-----END PUBLIC KEY-----
`;

describe("registerTrustCommand: trust add", () => {
  let tmp: string;
  let pemPath: string;
  let storePath: string;
  let originalState: string | undefined;
  let originalHome: string | undefined;

  async function runCli(args: string[]) {
    const program = new Command();
    registerTrustCommand(program);
    await program.parseAsync(args, { from: "user" });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    tmp = await mkdtemp(join(tmpdir(), "enclawed-trust-add-cli-"));
    pemPath = join(tmp, "ops.pub.pem");
    storePath = join(tmp, ".enclawed", "trust-root.json");
    await writeFile(pemPath, SAMPLE_PEM);
    originalState = process.env.ENCLAWED_STATE_DIR;
    originalHome = process.env.HOME;
    process.env.ENCLAWED_STATE_DIR = join(tmp, ".enclawed");
  });

  afterEach(() => {
    if (originalState === undefined) delete process.env.ENCLAWED_STATE_DIR;
    else process.env.ENCLAWED_STATE_DIR = originalState;
    if (originalHome !== undefined) process.env.HOME = originalHome;
    setTrustRoot([...DEFAULT_TRUST_ROOT]);
  });

  it("adds a signer from a PEM file and writes the overlay store", async () => {
    await runCli([
      "trust",
      "add",
      "--signer",
      "ops-cli-2026",
      "--ed25519",
      pemPath,
      "--clearance",
      "public,internal",
      "--description",
      "added via cli test",
      "--json",
    ]);

    expect(mocks.runtime.exit).not.toHaveBeenCalled();
    expect(mocks.runtime.writeJson).toHaveBeenCalledTimes(1);
    const payload = mocks.runtime.writeJson.mock.calls[0]?.[0] as {
      ok: boolean;
      path: string;
      replaced: boolean;
      appliedLive: boolean;
    };
    expect(payload.ok).toBe(true);
    expect(payload.path).toBe(storePath);
    expect(payload.replaced).toBe(false);
    expect(payload.appliedLive).toBe(true);

    const raw = JSON.parse(await readFile(storePath, "utf8")) as {
      signers: Array<{ keyId: string }>;
    };
    expect(raw.signers.some((s) => s.keyId === "ops-cli-2026")).toBe(true);
  });

  it("rejects when neither --ed25519 nor --pem-inline is supplied", async () => {
    await runCli(["trust", "add", "--signer", "no-pem", "--json"]);
    expect(mocks.runtime.exit).toHaveBeenCalledWith(1);
  });

  it("rejects unknown clearance tokens", async () => {
    await runCli([
      "trust",
      "add",
      "--signer",
      "bad-clearance",
      "--ed25519",
      pemPath,
      "--clearance",
      "definitely-not-real",
      "--json",
    ]);
    expect(mocks.runtime.exit).toHaveBeenCalledWith(1);
  });
});
