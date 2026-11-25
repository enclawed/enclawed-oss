import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AuditLogger, buildRecord, verifyChain } from "./audit-log.js";
import { AUDIT_SECRET_PLACEHOLDER, redactAuditString } from "./audit-redact.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-redact-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

// Stand-ins built at run time in the real formats (no literal secret in the source).
const rnd = (alphabet: string, n: number) =>
  Array.from({ length: n }, (_, i) => alphabet[(i * 7 + 3) % alphabet.length]).join("");
const AN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SECRETS: Record<string, string> = {
  github: `ghp_${rnd(AN, 36)}`,
  huggingface: `hf_${rnd(AN, 34)}`,
  digitalocean: `dop_v1_${rnd("0123456789abcdef", 64)}`,
  sendgrid: `SG.${rnd(AN, 22)}.${rnd(AN, 43)}`,
  anthropic: `sk-ant-api03-${rnd(AN, 40)}`,
  aws: `AKIA${rnd("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", 16)}`,
  npm: `npm_${rnd(AN, 36)}`,
};

describe("the audit log never stores a secret value", () => {
  for (const [family, secret] of Object.entries(SECRETS)) {
    it(`${family} token in a command is removed before the record is hashed and written`, () => {
      const out = redactAuditString(`curl -H "Authorization: Bearer ${secret}" https://x.test`);
      expect(out).not.toContain(secret);
      expect(out).toContain(AUDIT_SECRET_PLACEHOLDER);
    });
  }

  it("a credential-shaped NAME=value assignment keeps the name, loses the value", () => {
    const value = rnd(AN, 24);
    const out = redactAuditString(`export DEPLOY_TOKEN=${value} && ./deploy.sh`);
    expect(out).not.toContain(value);
    expect(out).toContain("DEPLOY_TOKEN=");
  });

  it("a private-key block is removed whole", () => {
    const body = rnd(AN, 64);
    const out = redactAuditString(
      `cat key\n-----BEGIN OPENSSH PRIVATE KEY-----\n${body}\n-----END OPENSSH PRIVATE KEY-----\nok`,
    );
    expect(out).not.toContain(body);
    expect(out).toMatch(/ok$/);
  });

  it("false positive: ordinary payload text, paths, digests and ids are kept", () => {
    for (const s of [
      "git commit -m 'fix the parser'",
      "/home/user/project/src/index.ts",
      "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "toolu_01AbCdEfGhIjKlMnOpQrStUv",
      "session.start",
    ]) {
      expect(redactAuditString(s)).toBe(s);
    }
  });

  it("the written record and its hash chain carry the redacted payload, and verify", async () => {
    const file = path.join(dir, "audit.jsonl");
    const log = new AuditLogger({ filePath: file });
    for (const secret of Object.values(SECRETS)) {
      await log.append({
        type: "tool.pre",
        actor: "t",
        level: null,
        payload: { command: `run --key ${secret}`, nested: [{ env: `X=${secret}` }] },
      });
    }
    await log.close?.();
    const text = fs.readFileSync(file, "utf8");
    for (const secret of Object.values(SECRETS)) {
      expect(text).not.toContain(secret);
    }
    const verified = await verifyChain(file);
    expect(verified.ok).toBe(true);
    expect(text.trim().split("\n")).toHaveLength(Object.keys(SECRETS).length);
    const rec = buildRecord({
      prevHash: "0".repeat(64),
      type: "t",
      actor: "a",
      level: null,
      payload: { s: SECRETS.huggingface },
    });
    expect(JSON.stringify(rec)).not.toContain(SECRETS.huggingface);
  });
});
