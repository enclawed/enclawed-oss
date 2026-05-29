// Vitest harness for the enclawed framework. Mirrors the standalone
// node:test suite under enclawed/test/ but runs inside Enclawed's vitest
// pipeline so the integration is exercised end-to-end with the upstream
// build.

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AuditLogger, verifyChain } from "./audit-log.js";
import {
  canRead,
  canWrite,
  combine,
  DOE_Q_TEMPLATE,
  dominates,
  format,
  LEVEL,
  makeLabel,
  parse,
  UNCLASSIFIED,
} from "./classification.js";
import { decryptAtRest, encryptAtRest, isFipsEnabled } from "./crypto-fips.js";
import { highestSeverity, redact, scan } from "./dlp-scanner.js";
import { createEgressGuard, EgressDeniedError, installEgressGuard } from "./egress-guard.js";
import { checkChannel, checkProvider, defaultClassifiedPolicy } from "./policy.js";
import { clearRuntime, getRuntime, setRuntime } from "./runtime.js";
import { withSecret, zeroize } from "./zeroize.js";

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "enclawed-vitest-"));
  return join(dir, "audit.jsonl");
}

describe("classification", () => {
  test("makeLabel rejects bogus level", () => {
    expect(() => makeLabel({ level: 99 as never })).toThrow(/invalid classification level/);
  });

  test("UNCLASSIFIED is the bottom", () => {
    const ts = makeLabel({ level: LEVEL.TOP_SECRET });
    expect(dominates(ts, UNCLASSIFIED)).toBe(true);
    expect(dominates(UNCLASSIFIED, ts)).toBe(false);
  });

  test("compartment containment is enforced", () => {
    const subj = makeLabel({ level: LEVEL.TOP_SECRET, compartments: ["SI"] });
    const obj = makeLabel({ level: LEVEL.SECRET, compartments: ["SI", "TK"] });
    expect(dominates(subj, obj)).toBe(false);
  });

  test("combine = least-upper-bound", () => {
    const a = makeLabel({ level: LEVEL.SECRET, compartments: ["RD"] });
    const b = makeLabel({ level: LEVEL.TOP_SECRET, compartments: ["SI"] });
    const c = combine(a, b);
    expect(c.level).toBe(LEVEL.TOP_SECRET);
    expect([...c.compartments]).toEqual(["RD", "SI"]);
  });

  test("format/parse round-trip for common markings (us-gov style)", () => {
    for (const s of ["UNCLASSIFIED", "CUI", "SECRET", "TOP SECRET//SI//NOFORN"]) {
      expect(format(parse(s), { nameStyle: "us-gov" })).toBe(s);
    }
  });

  test("Q clearance dominates SECRET//RD", () => {
    const q = makeLabel(DOE_Q_TEMPLATE);
    const obj = makeLabel({ level: LEVEL.SECRET, compartments: ["RD"] });
    expect(canRead(q, obj)).toBe(true);
  });

  test("canWrite enforces no-write-down", () => {
    const subj = makeLabel({ level: LEVEL.SECRET });
    expect(canWrite(subj, makeLabel({ level: LEVEL.TOP_SECRET }))).toBe(true);
    expect(canWrite(subj, UNCLASSIFIED)).toBe(false);
  });

  test("labels are immutable", () => {
    const l = makeLabel({ level: LEVEL.SECRET, compartments: ["RD"] });
    expect(Object.isFrozen(l)).toBe(true);
    expect(Object.isFrozen(l.compartments)).toBe(true);
  });
});

describe("policy", () => {
  test("default classified policy denies cloud channels and providers", () => {
    const p = defaultClassifiedPolicy();
    expect(checkChannel(p, "whatsapp").allowed).toBe(false);
    expect(checkChannel(p, "discord").allowed).toBe(false);
    expect(checkProvider(p, "openai").allowed).toBe(false);
    expect(checkProvider(p, "anthropic").allowed).toBe(false);
    expect(checkChannel(p, "web-loopback").allowed).toBe(true);
    expect(checkProvider(p, "local-model").allowed).toBe(true);
  });
});

describe("egress-guard", () => {
  const fakeFetch = (async (input: unknown) => ({ ok: true, url: String(input) })) as unknown as typeof fetch;

  test("blocks unallowed host", async () => {
    const g = createEgressGuard({ allowedHosts: ["127.0.0.1"], fetchImpl: fakeFetch });
    await expect(g("https://evil.example.com/")).rejects.toBeInstanceOf(EgressDeniedError);
  });

  test("allows host on the list", async () => {
    const g = createEgressGuard({ allowedHosts: ["localhost"], fetchImpl: fakeFetch });
    const r = (await g("http://localhost/x")) as { ok: boolean };
    expect(r.ok).toBe(true);
  });

  test("install/restore lifecycle", () => {
    const orig = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    const restore = installEgressGuard({ allowedHosts: ["localhost"] });
    expect((globalThis.fetch as { __enclawedGuard?: boolean }).__enclawedGuard).toBe(true);
    restore();
    globalThis.fetch = orig;
  });
});

describe("audit-log", () => {
  test("append + verify chain", async () => {
    const path = await tmpFile();
    const a = new AuditLogger({ filePath: path, clock: () => 1000 });
    await a.append({ type: "boot", actor: "u", level: null, payload: { x: 1 } });
    await a.append({ type: "act", actor: "u", level: null, payload: { x: 2 } });
    await a.close();
    const r = await verifyChain(path);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.count).toBe(2);
  });

  test("in-place tamper breaks chain", async () => {
    const path = await tmpFile();
    const a = new AuditLogger({ filePath: path, clock: () => 1000 });
    await a.append({ type: "t", actor: "u", level: null, payload: { x: 1 } });
    await a.append({ type: "t", actor: "u", level: null, payload: { x: 2 } });
    await a.close();
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    const tampered = JSON.parse(lines[0]!);
    tampered.payload.x = 999;
    lines[0] = JSON.stringify(tampered);
    await writeFile(path, lines.join("\n") + "\n");
    const r = await verifyChain(path);
    expect(r.ok).toBe(false);
  });
});

describe("dlp-scanner", () => {
  test("detects banner + DOE RD + AWS keys + PEM + SSN", () => {
    const text =
      "TOP SECRET//SI//NOFORN ; FORMERLY RESTRICTED DATA ; AKIA1234567890ABCDEF ;" +
      " -----BEGIN RSA PRIVATE KEY----- ; SSN 123-45-6789";
    const ids = scan(text).map((f) => f.id);
    expect(ids).toContain("us-classification-banner");
    expect(ids).toContain("us-doe-restricted-data");
    expect(ids).toContain("aws-access-key-id");
    expect(ids).toContain("pem-private-key");
    expect(ids).toContain("us-ssn");
    expect(highestSeverity(scan(text))).toBe("critical");
  });

  test("redact removes high-severity matches", () => {
    expect(redact("k=AKIA1234567890ABCDEF tail")).not.toMatch(/AKIA1234567890ABCDEF/);
  });
});

describe("crypto-fips", () => {
  test("AES-256-GCM round-trip + AAD binding", () => {
    const env = encryptAtRest("payload", "pw", { aad: "ctx-A" });
    expect(decryptAtRest(env, "pw").toString("utf8")).toBe("payload");
    const bad = { ...env, aad: Buffer.from("ctx-B").toString("base64") };
    expect(() => decryptAtRest(bad, "pw")).toThrow();
  });

  test("ciphertext is non-deterministic", () => {
    const a = encryptAtRest("same", "pw");
    const b = encryptAtRest("same", "pw");
    expect(a.ct).not.toBe(b.ct);
  });

  test("isFipsEnabled returns a boolean (no FIPS expected on dev hosts)", () => {
    expect(typeof isFipsEnabled()).toBe("boolean");
  });
});

describe("zeroize", () => {
  test("zeroize fills Buffer", () => {
    const b = Buffer.from("secret");
    zeroize(b);
    for (const c of b) expect(c).toBe(0);
  });

  test("withSecret zeroizes on throw", async () => {
    const b = Buffer.from("secret");
    await expect(withSecret(b, async () => { throw new Error("boom"); })).rejects.toThrow(/boom/);
    for (const c of b) expect(c).toBe(0);
  });
});

describe("runtime", () => {
  beforeEach(() => clearRuntime());
  afterEach(() => clearRuntime());

  test("getRuntime returns null until setRuntime", async () => {
    expect(getRuntime()).toBeNull();
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    setRuntime({
      flavor: "open",
      policy: defaultClassifiedPolicy(),
      audit,
      restoreFetch: () => {},
      fipsRequired: false,
      moduleDecisions: null,
    });
    expect(getRuntime()).not.toBeNull();
    await audit.close();
  });
});
