import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addPersistedSigner,
  applyPersistedTrustOverlay,
  readPersistedTrustRoot,
  writePersistedTrustRoot,
  type PersistedSignerInput,
} from "./trust-root-store.js";
import { DEFAULT_TRUST_ROOT, getTrustRoot, setTrustRoot } from "./trust-root.js";

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
    const result = await addPersistedSigner(baseSigner, { filePath, flavor: "open" });
    expect(result.replaced).toBe(false);
    expect(result.path).toBe(filePath);

    const live = getTrustRoot();
    expect(live.some((s) => s.keyId === baseSigner.keyId)).toBe(true);

    const file = await readPersistedTrustRoot({ filePath });
    expect(file?.signers).toHaveLength(1);
  });

  it("addPersistedSigner replaces an existing entry by keyId", async () => {
    await addPersistedSigner(baseSigner, { filePath, flavor: "open" });
    const updated = await addPersistedSigner(
      { ...baseSigner, description: "rotated description" },
      { filePath, flavor: "open" },
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
        { filePath, flavor: "open" },
      ),
    ).rejects.toThrow(/PEM/);
  });

  it("applyPersistedTrustOverlay merges signers on top of DEFAULT_TRUST_ROOT", async () => {
    await writePersistedTrustRoot({ v: 1, signers: [baseSigner] }, { filePath });
    const before = getTrustRoot().length;
    const result = await applyPersistedTrustOverlay({ filePath, flavor: "open" });
    expect("applied" in result && result.applied).toBe(1);
    const after = getTrustRoot();
    // Bundled-dev signer is still there.
    expect(after.some((s) => s.keyId === "enclawed-bundled-dev-2026")).toBe(true);
    // Persisted signer landed.
    expect(after.some((s) => s.keyId === baseSigner.keyId)).toBe(true);
    expect(after.length).toBe(before + 1);
  });

  it("enclaved: ignores the user overlay entirely, even a new keyId", async () => {
    await writePersistedTrustRoot({ v: 1, signers: [baseSigner] }, { filePath });
    const result = await applyPersistedTrustOverlay({ filePath, flavor: "enclaved" });
    expect(result.applied).toBe(0);
    expect(result.refused.join("\n")).toMatch(/user trust-root overlay ignored/);
    expect(getTrustRoot().some((s) => s.keyId === baseSigner.keyId)).toBe(false);
  });

  it("enclaved: the user overlay cannot replace a shipped signer's clearance", async () => {
    await writePersistedTrustRoot(
      {
        v: 1,
        signers: [
          {
            keyId: "enclawed-bundled-dev-2026",
            publicKeyPem: SAMPLE_PEM,
            approvedClearance: ["top-secret-sci"],
          },
        ],
      },
      { filePath },
    );
    await applyPersistedTrustOverlay({ filePath, flavor: "enclaved" });
    const s = getTrustRoot().find((x) => x.keyId === "enclawed-bundled-dev-2026");
    expect(s?.approvedClearance).toEqual(["public", "internal"]);
    expect(s?.publicKeyPem).not.toBe(SAMPLE_PEM);
  });

  it("open: the user overlay may add, but never replace a shipped signer", async () => {
    await writePersistedTrustRoot(
      {
        v: 1,
        signers: [
          baseSigner,
          {
            keyId: "enclawed-bundled-dev-2026",
            publicKeyPem: SAMPLE_PEM,
            approvedClearance: ["secret"],
          },
        ],
      },
      { filePath },
    );
    const result = await applyPersistedTrustOverlay({ filePath, flavor: "open" });
    expect(result.applied).toBe(1);
    expect(result.refused.join("\n")).toMatch(/would replace an existing signer/);
    const s = getTrustRoot().find((x) => x.keyId === "enclawed-bundled-dev-2026");
    expect(s?.approvedClearance).toEqual(["public", "internal"]);
  });

  it("admin-policy signers are added in enclaved; they cannot replace shipped ones", async () => {
    const result = await applyPersistedTrustOverlay({
      filePath,
      flavor: "enclaved",
      adminSigners: [
        baseSigner,
        {
          keyId: "enclawed-community-2026",
          publicKeyPem: SAMPLE_PEM,
          approvedClearance: ["secret"],
        },
      ],
    });
    expect(result.applied).toBe(1);
    expect(getTrustRoot().some((s) => s.keyId === baseSigner.keyId)).toBe(true);
    expect(result.refused.join("\n")).toMatch(/enclawed-community-2026/);
  });

  it("trust add refuses in the enclaved flavor and for shipped keyIds", async () => {
    await expect(addPersistedSigner(baseSigner, { filePath, flavor: "enclaved" })).rejects.toThrow(
      /\/etc\/enclawed\/policy\.json/,
    );
    await expect(
      addPersistedSigner(
        { ...baseSigner, keyId: "enclawed-bundled-dev-2026" },
        { filePath, flavor: "open" },
      ),
    ).rejects.toThrow(/shipped signer/);
  });
});
