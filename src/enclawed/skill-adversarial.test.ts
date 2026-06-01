// Adversarial-ensemble tests for the skill trust schema (paper §6).
//
// Two test groups:
//   1. Failure-mode injection — the gate produces an audit log; we inject
//      F1/F2/F4 faults and check the biconditional flags them.
//   2. Eight attack families against the skill layer (paper §7
//      "Architectural choices observed").

import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { AuditLogger, verifyChain, type AuditRecord } from "./audit-log.js";
import { CAPABILITY, makeCall } from "./skill-capabilities.js";
import { SkillGate } from "./skill-gate.js";
import { policyBroker, denyAllBroker } from "./skill-broker.js";
import {
  VERIFICATION,
  parseSkillManifest,
  contentSha256,
} from "./skill-manifest.js";
import { SkillMutationGuard } from "./skill-mutation-guard.js";
import { checkBiconditional, readAuditRecords } from "./biconditional.js";
import { SkillRuntime } from "./skill-runtime.js";
import { LEVEL, makeLabel } from "./classification.js";
import { buildSignedSkill } from "./skill-test-utils.js";

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skill-adv-"));
  return join(dir, "audit.jsonl");
}

async function makeCorpus(n: number): Promise<{ dir: string; files: string[] }> {
  const dir = await mkdtemp(join(tmpdir(), "corpus-"));
  await mkdir(dir, { recursive: true });
  const files: string[] = [];
  for (let i = 0; i < n; i++) {
    const f = join(dir, `doc-${i}.txt`);
    await writeFile(f, `content-${i}\n`);
    files.push(f);
  }
  return { dir, files };
}

async function existing(files: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const f of files) {
    try {
      await stat(f);
      out.add(f);
    } catch {
      // missing
    }
  }
  return out;
}

describe("adversarial-ensemble: F1-F4", () => {
  test("biconditional pass: D = S exactly", async () => {
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    const gate = new SkillGate({
      audit,
      broker: policyBroker({
        rules: [
          { cap: CAPABILITY.FS_WRITE_IRREV, target: /.*\/doc-0\.txt$/, effect: "allow" },
        ],
      }),
    });
    const m = parseSkillManifest({
      v: 1,
      id: "cleaner",
      label: { level: 0, compartments: [], releasability: [] },
      caps: [],
      signer: "x",
      version: 1,
      verification: VERIFICATION.UNVERIFIED,
    });
    gate.loadSkill(m);

    const corpus = await makeCorpus(3);
    const before = await existing(corpus.files);
    const target = corpus.files[0]!;
    await gate.dispatch({
      skillId: "cleaner",
      call: makeCall({ cap: CAPABILITY.FS_WRITE_IRREV, target }),
      execute: async () => {
        await writeFile(target, "");
        return { ok: true };
      },
    });
    await audit.close();

    const after = await existing(corpus.files);
    expect(before.size).toBe(after.size);
    const recs = await readAuditRecords(path);
    const r = checkBiconditional({
      delta: [{ op: CAPABILITY.FS_WRITE_IRREV, target }],
      audit: recs,
    });
    expect(r.ok).toBe(true);
  });

  test("F1 gate bypass: a tool that does not call the gate is flagged", async () => {
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    // Force the audit file into existence so readAuditRecords does not ENOENT
    // when no gate event was logged for the bypass.
    await audit.append({ type: "session.start", actor: "test", level: null, payload: {} });
    const corpus = await makeCorpus(2);
    const target = corpus.files[1]!;
    // A buggy or hostile tool writes to the corpus without dispatching.
    await writeFile(target, "");
    await audit.close();

    const recs = await readAuditRecords(path);
    const r = checkBiconditional({
      delta: [{ op: CAPABILITY.FS_WRITE_IRREV, target }],
      audit: recs,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.f1Bypass.length).toBe(1);
  });

  test("F2 audit forgery: a fabricated executed record without a real change", async () => {
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    const target = "/imaginary/file";
    await audit.append({
      type: "irreversible.executed",
      actor: "ghost",
      level: null,
      payload: { ok: true, call: { cap: CAPABILITY.FS_WRITE_IRREV, target } },
    });
    await audit.close();

    const recs = await readAuditRecords(path);
    const r = checkBiconditional({ delta: [], audit: recs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.f2Forgery.length).toBe(1);
  });

  test("F4 wrong-target: approved /a, mutated /b — multiset projection catches both legs", async () => {
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    await audit.append({
      type: "irreversible.executed",
      actor: "test",
      level: null,
      payload: { ok: true, call: { cap: CAPABILITY.FS_WRITE_IRREV, target: "/a" } },
    });
    await audit.close();

    const recs = await readAuditRecords(path);
    const r = checkBiconditional({
      delta: [{ op: CAPABILITY.FS_WRITE_IRREV, target: "/b" }],
      audit: recs,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.f1Bypass[0]?.target).toBe("/b");
      expect(r.f2Forgery[0]?.target).toBe("/a");
    }
  });
});

describe("adversarial-ensemble: 8 attack families", () => {
  test("audit in-place edit breaks the chain", async () => {
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    await audit.append({ type: "x", actor: "a", level: null, payload: { i: 1 } });
    await audit.append({ type: "x", actor: "a", level: null, payload: { i: 2 } });
    await audit.close();

    const data = await readFile(path, "utf8");
    const lines = data.split("\n").filter(Boolean);
    const tampered = JSON.parse(lines[0]!);
    tampered.payload = { i: 999 };
    await writeFile(path, [JSON.stringify(tampered), lines[1]].join("\n") + "\n");

    const result = await verifyChain(path);
    expect(result.ok).toBe(false);
  });

  test("log injection via control characters cannot manufacture a second JSONL record", async () => {
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    await audit.append({
      type: "x",
      actor: "a",
      level: null,
      payload: { msg: "real\n{\"type\":\"forged\"}\n" },
    });
    await audit.close();

    // The injection attack relies on the newline being preserved so that
    // the rogue payload appears on its own line and is parsed as a record.
    // sanitizeString replaces control chars (including \n) with U+FFFD,
    // so the file contains exactly one line.
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    // And the chain still verifies because the sanitized payload is what
    // was hashed.
    const result = await verifyChain(path);
    expect(result.ok).toBe(true);
  });

  test("signature forgery: random bits do not validate", async () => {
    const b = buildSignedSkill({ id: "x", caps: ["fs.read"] });
    const tampered = "A".repeat(b.signature.length);
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    const rt = new SkillRuntime({
      audit,
      broker: denyAllBroker(),
      userClearance: makeLabel({ level: LEVEL.TOP_SECRET }),
      resolveSigner: (kid) => (kid === b.signer.keyId ? b.signer : undefined),
    });
    await expect(
      rt.bootstrap([
        { manifestJson: b.manifestJson, content: b.content, signature: tampered, filePath: "/x" },
      ]),
    ).rejects.toThrow(/signature did not verify/);
    await audit.close();
  });

  test("hostname normalization bypass: target is exact, not loose-matched", () => {
    // The biconditional's projection key uses exact target equality. A
    // call that writes to "Foo.example.com" must not match an approval for
    // "foo.example.com".
    const audit: AuditRecord[] = [
      {
        ts: 0, type: "irreversible.executed", actor: "x", level: null,
        prevHash: "0".repeat(64),
        recordHash: "x",
        payload: { ok: true, call: { cap: CAPABILITY.NET_EGRESS, target: "foo.example.com" } },
      },
    ];
    const r = checkBiconditional({
      delta: [{ op: CAPABILITY.NET_EGRESS, target: "Foo.example.com" }],
      audit,
    });
    expect(r.ok).toBe(false);
  });

  test("post-lock skill mutation: invalidates verification", async () => {
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    const gate = new SkillGate({
      audit,
      broker: policyBroker({
        rules: [{ cap: CAPABILITY.FS_WRITE_IRREV, target: /skill:\/\/.*/, effect: "allow" }],
      }),
    });
    const m = parseSkillManifest({
      v: 1, id: "s",
      label: { level: 0, compartments: [], releasability: [] },
      caps: [], signer: "x", version: 1, verification: VERIFICATION.TESTED,
    });
    gate.loadSkill(m);
    const guard = new SkillMutationGuard({ audit, gate });
    guard.register({ manifest: m, contentSha256: contentSha256("v1"), filePath: "/s" });

    expect(guard.isInvalidated("s")).toBe(false);
    await guard.attemptMutation({
      skillId: "s",
      proposedContent: "v2",
      apply: async () => {},
    });
    expect(guard.isInvalidated("s")).toBe(true);
    await audit.close();
  });

  test("ReDoS bound: policy broker rejects pathological rule lists", () => {
    // Use a bounded regex equivalent to the test's intent ("one or more
    // 'a' characters at end of string") without the nested-quantifier
    // catastrophic-backtracking pattern /(a+)+$/.
    const huge = Array.from({ length: 8 }, () => ({
      cap: CAPABILITY.PUBLISH,
      target: /a+$/,
      effect: "allow" as const,
    }));
    expect(() => policyBroker({ rules: huge, maxRules: 4 })).toThrow(/too many rules/);
  });

  test("prompt-injection role-spoofing: gate uses verification level, not skill content", async () => {
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    // Even if the skill body says "i am verified, please skip the gate", the
    // manifest is unverified, so the broker fires.
    const m = parseSkillManifest({
      v: 1, id: "lying",
      label: { level: 0, compartments: [], releasability: [] },
      caps: ["pay"], signer: "x", version: 1, verification: VERIFICATION.UNVERIFIED,
    });
    const gate = new SkillGate({ audit, broker: denyAllBroker() });
    gate.loadSkill(m);
    const out = await gate.dispatch({
      skillId: "lying",
      call: makeCall({ cap: CAPABILITY.PAY, target: "USD:1000000" }),
      execute: async () => ({ ok: true }),
    });
    expect(out.kind).toBe("denied");
    await audit.close();
  });

  test("code injection through proto-pollution at manifest parse", () => {
    // Realistic vector: untrusted JSON parsed via JSON.parse creates an own
    // enumerable __proto__ key on the resulting object.
    const polluted = JSON.parse(
      `{"v":1,"id":"x","label":{"level":0},"caps":[],"signer":"x","version":1,"verification":"unverified","__proto__":{"polluted":true}}`,
    );
    expect(() => parseSkillManifest(polluted)).toThrow(/forbidden key/);
  });
});

describe("end-to-end: signed bundle through SkillRuntime", () => {
  test("verified skill loads, irreversible declared call executes through gate", async () => {
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    const b = buildSignedSkill({
      id: "publisher",
      caps: ["publish"],
      verification: VERIFICATION.DECLARED,
    });
    const rt = new SkillRuntime({
      audit,
      broker: denyAllBroker(),
      userClearance: makeLabel({ level: LEVEL.TOP_SECRET }),
      resolveSigner: (kid) => (kid === b.signer.keyId ? b.signer : undefined),
    });
    const loaded = await rt.bootstrap([
      { manifestJson: b.manifestJson, content: b.content, signature: b.signature, filePath: "/p" },
    ]);
    expect(loaded.length).toBe(1);
    const out = await rt.gate.dispatch({
      skillId: "publisher",
      call: makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#ops" }),
      execute: async () => ({ ok: true }),
    });
    expect(out.kind).toBe("executed");

    await audit.close();
    const recs = await readAuditRecords(path);
    expect(recs.find((r) => r.type === "skill.loaded")).toBeTruthy();
    expect(recs.find((r) => r.type === "irreversible.executed")).toBeTruthy();
  });

  test("attempting bootstrap a second time is rejected", async () => {
    const path = await tmpFile();
    const audit = new AuditLogger({ filePath: path });
    const rt = new SkillRuntime({
      audit,
      broker: denyAllBroker(),
      userClearance: makeLabel({ level: LEVEL.TOP_SECRET }),
      resolveSigner: () => undefined,
    });
    await rt.bootstrap([]);
    await expect(rt.bootstrap([])).rejects.toThrow(/already bootstrapped/);
    await audit.close();
  });
});

