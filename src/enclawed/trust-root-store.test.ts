import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TRUST_ROOT,
  getTrustRoot,
  setTrustRoot,
} from "./trust-root.js";
import {
  addPersistedSigner,
  applyPersistedTrustOverlay,
  readPersistedTrustRoot,
  writePersistedTrustRoot,
  type PersistedSignerInput,
} from "./trust-root-store.js";

const SAMPLE_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZv8=
-----END PUBLIC KEY-----
`;

const baseSigner: PersistedSignerInput = {
  keyId: "ops-test-2026",
  publicKeyPem: SAMPLE_PEM,
  approvedClearance: ["public", "internal"],
  description: "ops test signer",
};

let tmpdirPath: string;
let filePath: string;

beforeEach(async () => {
  tmpdirPath = await mkdtemp(join(tmpdir(), "enclawed-trust-store-"));
  filePath = join(tmpdirPath, "trust-root.json");
});

afterEach(() => {
  // Reset the runtime trust root after every test so other tests in the
  // same vitest worker observe the default again.
  setTrustRoot([...DEFAULT_TRUST_ROOT]);
});

describe("trust-root-store", () => {
  it("readPersistedTrustRoot returns undefined when file does not exist", async () => {
    const result = await readPersistedTrustRoot({ filePath });
    expect(result).toBeUndefined();
  });

  it("writePersistedTrustRoot round-trips", async () => {
    await writePersistedTrustRoot({ v: 1, signers: [baseSigner] }, { filePath });
    const read = await readPersistedTrustRoot({ filePath });
    expect(read?.signers).toHaveLength(1);
    expect(read?.signers[0]?.keyId).toBe(baseSigner.keyId);
  });

  it("readPersistedTrustRoot rejects bad shapes", async () => {
    await writeFile(filePath, JSON.stringify({ v: 2 }));
    await expect(readPersistedTrustRoot({ filePath })).rejects.toThrow(/schema/);
  });

  it("readPersistedTrustRoot rejects unknown clearance tokens", async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        v: 1,
        signers: [{ ...baseSigner, approvedClearance: ["definitely-not-a-clearance"] }],
      }),
    );
    await expect(readPersistedTrustRoot({ filePath })).rejects.toThrow();
  });

  it("addPersistedSigner appends a new signer and applies it to the live root", async () => {
    const result = await addPersistedSigner(baseSigner, { filePath });
    expect(result.replaced).toBe(false);
    expect(result.path).toBe(filePath);

    const live = getTrustRoot();
    expect(live.some((s) => s.keyId === baseSigner.keyId)).toBe(true);

    const file = await readPersistedTrustRoot({ filePath });
    expect(file?.signers).toHaveLength(1);
  });

  it("addPersistedSigner replaces an existing entry by keyId", async () => {
    await addPersistedSigner(baseSigner, { filePath });
    const updated = await addPersistedSigner(
      { ...baseSigner, description: "rotated description" },
      { filePath },
    );
    expect(updated.replaced).toBe(true);

    const file = await readPersistedTrustRoot({ filePath });
    expect(file?.signers).toHaveLength(1);
    expect(file?.signers[0]?.description).toBe("rotated description");
  });

  it("rejects malformed PEM blobs", async () => {
    await expect(
      addPersistedSigner(
        { ...baseSigner, publicKeyPem: "not-a-pem" },
        { filePath },
      ),
    ).rejects.toThrow(/PEM/);
  });

  it("applyPersistedTrustOverlay merges signers on top of DEFAULT_TRUST_ROOT", async () => {
    await writePersistedTrustRoot({ v: 1, signers: [baseSigner] }, { filePath });
    const before = getTrustRoot().length;
    const result = await applyPersistedTrustOverlay({ filePath });
    expect("applied" in result && result.applied).toBe(1);
    const after = getTrustRoot();
    // Bundled-dev signer is still there.
    expect(after.some((s) => s.keyId === "enclawed-bundled-dev-2026")).toBe(true);
    // Persisted signer landed.
    expect(after.some((s) => s.keyId === baseSigner.keyId)).toBe(true);
    expect(after.length).toBe(before + 1);
  });
});
