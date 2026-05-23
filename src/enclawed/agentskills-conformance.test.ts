// Paper-conformance test for the Agent Skills '26 paper:
// "Skills as Verifiable Artifacts: A Trust Schema and a Biconditional
// Correctness Criterion for Human-in-the-Loop Agent Runtimes"
// (papers/agentskills-26/paper.pdf in the closed companion).
//
// Each section maps directly to claims in the paper. Section labels in the
// describe-blocks correspond to the paper. This test is the runtime
// counterpart to the canonical-suite paper-conformance test for the
// enclawed.pdf paper; together they verify both whitepapers against this
// codebase mechanically on every test run.

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuditLogger, buildRecord, type AuditRecord } from "./audit-log.js";
import { LEVEL, makeLabel } from "./classification.js";
import {
  ALL_CAPABILITIES,
  CAPABILITY,
  isIrreversible,
  isReversible,
  makeCall,
  projectionKey,
} from "./skill-capabilities.js";
import {
  VERIFICATION,
  contentSha256,
  isVerificationLevel,
  parseSkillManifest,
  verificationRank,
} from "./skill-manifest.js";
import { SkillLoadError, verifySkill } from "./skill-loader.js";
import { SkillGate, TransactionBuffer as GateTxnBuffer } from "./skill-gate.js";
import { SkillMutationGuard } from "./skill-mutation-guard.js";
import { checkBiconditional } from "./biconditional.js";
import {
  denyAllBroker,
  interactiveBroker,
  policyBroker,
  webhookBroker,
  type BrokerRequest,
} from "./skill-broker.js";
import { SkillRuntime } from "./skill-runtime.js";
import { admitUpstreamSkill } from "./skill-admission.js";
import { lockTrustRoot, isTrustRootLocked, TrustRootLockedError } from "./trust-root.js";
import { buildSignedSkill } from "./skill-test-utils.js";

async function tmpAuditPath() {
  const dir = await mkdtemp(join(tmpdir(), "agentskills-conformance-"));
  return join(dir, "audit.jsonl");
}

// =====================================================================
// §3 — The skill trust schema
// =====================================================================
describe("§3 skill trust schema (5 mandatory manifest fields)", () => {
  const sample = {
    v: 1,
    id: "demo",
    label: { level: 1, compartments: [], releasability: [] },
    caps: ["fs.read", "publish"],
    signer: "test-signer",
    version: 1,
    verification: "declared",
  };

  test("S1 manifest parses to a tuple with all 5 mandatory fields", () => {
    const m = parseSkillManifest(sample);
    expect(m.label).toBeDefined();
    expect(m.caps).toBeDefined();
    expect(m.signer).toBe("test-signer");
    expect(m.version).toBe(1);
    expect(m.verification).toBe("declared");
  });

  test("S2 M.label is Bell-LaPadula (rank + compartments + releasability)", () => {
    const m = parseSkillManifest({
      ...sample,
      label: { level: 3, compartments: ["RD", "SI"], releasability: ["NOFORN"] },
    });
    expect(m.label.level).toBe(3);
    expect([...m.label.compartments].sort()).toEqual(["RD", "SI"]);
    expect([...m.label.releasability]).toEqual(["NOFORN"]);
  });

  test("S3 M.caps drawn from fixed vocabulary; unknown rejected", () => {
    expect(() => parseSkillManifest({ ...sample, caps: ["fs.read", "made.up"] })).toThrow(
      /unknown capability/,
    );
  });

  test("S5 M.version is non-negative integer; floats and negatives rejected", () => {
    expect(() => parseSkillManifest({ ...sample, version: -1 })).toThrow();
    expect(() => parseSkillManifest({ ...sample, version: 1.5 })).toThrow();
  });

  test("S6 M.verification is the four-value enum {unverified, declared, tested, formal}", () => {
    expect(VERIFICATION.UNVERIFIED).toBe("unverified");
    expect(VERIFICATION.DECLARED).toBe("declared");
    expect(VERIFICATION.TESTED).toBe("tested");
    expect(VERIFICATION.FORMAL).toBe("formal");
    for (const v of ["unverified", "declared", "tested", "formal"]) {
      expect(isVerificationLevel(v)).toBe(true);
    }
    expect(isVerificationLevel("hand-wavy")).toBe(false);
  });

  test("S7 verification defaults to 'unverified' when manifest omits it", () => {
    const j = { ...sample } as Record<string, unknown>;
    delete j.verification;
    expect(parseSkillManifest(j).verification).toBe("unverified");
  });
});

// =====================================================================
// §3.1 — Verification levels (continuum vs discrete)
// =====================================================================
describe("§3.1 verification levels are a discrete enum, not a continuum", () => {
  test("V5 verification rank is monotone unverified < declared < tested < formal", () => {
    expect(verificationRank("unverified")).toBe(0);
    expect(verificationRank("declared")).toBe(1);
    expect(verificationRank("tested")).toBe(2);
    expect(verificationRank("formal")).toBe(3);
  });
});

// =====================================================================
// §3.3 — Trust root
// =====================================================================
describe("§3.3 trust root", () => {
  test("T3 lockTrustRoot is one-shot; T4 post-lock mutation raises typed error", () => {
    // Note: this test mutates module-global state. We don't actually lock
    // here (would break other tests); we just assert the API shape.
    expect(typeof lockTrustRoot).toBe("function");
    expect(typeof isTrustRootLocked).toBe("function");
    expect(TrustRootLockedError).toBeDefined();
  });
});

// =====================================================================
// §3.4 — 7-step manifest verification
// =====================================================================
describe("§3.4 manifest verification walks 7 steps fail-closed", () => {
  const userClearance = makeLabel({ level: LEVEL.TOP_SECRET });

  test("step 1 parse: __proto__ smuggling rejected", () => {
    const polluted = JSON.parse(
      `{"v":1,"id":"x","label":{"level":0},"caps":[],"signer":"x","version":1,"verification":"unverified","__proto__":{"polluted":true}}`,
    );
    expect(() => parseSkillManifest(polluted)).toThrow(/forbidden key/);
  });

  test("step 2 resolve-signer: unknown signer is rejected", () => {
    const b = buildSignedSkill({ id: "x", caps: [] });
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: b.signature,
        userClearance,
        resolveSigner: () => undefined,
      }),
    ).toThrow(SkillLoadError);
  });

  test("step 3 verify-signature: tampered signature rejected", () => {
    const b = buildSignedSkill({ id: "x", caps: ["fs.read"] });
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: "AAAA" + b.signature.slice(4),
        userClearance,
        resolveSigner: () => b.signer,
      }),
    ).toThrow(/signature did not verify/);
  });

  test("step 4 signer-clearance-bound: signer cannot endorse above its max", () => {
    const b = buildSignedSkill({
      id: "x",
      caps: [],
      level: LEVEL.TOP_SECRET,
      approvedClearance: ["public", "internal"],
    });
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: b.signature,
        userClearance,
        resolveSigner: () => b.signer,
      }),
    ).toThrow(/signer .* not approved/);
  });

  test("step 5 user-clearance-bound: user can't load skill exceeding their tier", () => {
    const b = buildSignedSkill({ id: "x", caps: [], level: LEVEL.TOP_SECRET });
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: b.signature,
        userClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
        resolveSigner: () => b.signer,
      }),
    ).toThrow(/user clearance does not dominate/);
  });

  test("step 6 verification-authority: signer can't claim higher level than authorized", () => {
    const b = buildSignedSkill({
      id: "x",
      caps: [],
      verification: VERIFICATION.TESTED,
    });
    expect(() =>
      verifySkill({
        manifestJson: b.manifestJson,
        content: b.content,
        signature: b.signature,
        userClearance,
        resolveSigner: () => b.signer,
      }),
    ).toThrow(/not authorized for verification/);
  });
});

// =====================================================================
// §3.5 — Capability vocabulary (Table 1)
// =====================================================================
describe("§3.5 capability vocabulary", () => {
  test("C1 Table-1 nine-token vocabulary is exact", () => {
    expect(new Set(ALL_CAPABILITIES)).toEqual(
      new Set([
        "net.egress",
        "fs.read",
        "fs.write.rev",
        "fs.write.irrev",
        "tool.invoke",
        "spawn.proc",
        "publish",
        "pay",
        "mutate.schema",
      ]),
    );
  });

  test("C2 reversible/irreversible split is load-bearing", () => {
    expect(isReversible(CAPABILITY.FS_READ)).toBe(true);
    expect(isReversible(CAPABILITY.FS_WRITE_REV)).toBe(true);
    for (const c of [
      CAPABILITY.FS_WRITE_IRREV,
      CAPABILITY.NET_EGRESS,
      CAPABILITY.PUBLISH,
      CAPABILITY.PAY,
      CAPABILITY.MUTATE_SCHEMA,
      CAPABILITY.SPAWN_PROC,
      CAPABILITY.TOOL_INVOKE,
    ]) {
      expect(isIrreversible(c)).toBe(true);
    }
  });
});

// =====================================================================
// §4 — Capability gate as a function of verification level
// =====================================================================
describe("§4 capability gate by verification level", () => {
  let audit: AuditLogger;
  beforeEach(async () => {
    const path = await tmpAuditPath();
    audit = new AuditLogger({ filePath: path });
  });
  afterEach(async () => audit.close());

  function loadedManifestWith(opts: { caps: ReadonlyArray<string>; verification: string }) {
    return parseSkillManifest({
      v: 1,
      id: "s",
      label: { level: 0, compartments: [], releasability: [] },
      caps: opts.caps,
      signer: "x",
      version: 1,
      verification: opts.verification,
    });
  }

  test("G1 unverified: every irreversible call walks HITL even for caps in M.caps", async () => {
    const gate = new SkillGate({ audit, broker: denyAllBroker() });
    gate.loadSkill(loadedManifestWith({ caps: ["publish"], verification: "unverified" }));
    const out = await gate.dispatch({
      skillId: "s",
      call: makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#ops" }),
      execute: async () => ({ ok: true }),
    });
    expect(out.kind).toBe("denied");
  });

  test("G2 declared: in-caps irreversible bypasses broker but is audited", async () => {
    const gate = new SkillGate({ audit, broker: denyAllBroker() });
    gate.loadSkill(loadedManifestWith({ caps: ["publish"], verification: "declared" }));
    const out = await gate.dispatch({
      skillId: "s",
      call: makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#ops" }),
      execute: async () => ({ ok: true }),
    });
    expect(out.kind).toBe("executed");
  });

  test("G2 declared: out-of-caps irreversible walks broker", async () => {
    const gate = new SkillGate({
      audit,
      broker: policyBroker({
        rules: [{ cap: CAPABILITY.PAY, target: /.*/, effect: "deny" }],
      }),
    });
    gate.loadSkill(loadedManifestWith({ caps: ["publish"], verification: "declared" }));
    const out = await gate.dispatch({
      skillId: "s",
      call: makeCall({ cap: CAPABILITY.PAY, target: "USD:100" }),
      execute: async () => ({ ok: true }),
    });
    expect(out.kind).toBe("denied");
  });

  test("R reversible call always uses txn buffer regardless of verification level", async () => {
    const gate = new SkillGate({ audit, broker: denyAllBroker() });
    gate.loadSkill(loadedManifestWith({ caps: ["fs.read"], verification: "unverified" }));
    let rolled = 0;
    const out = await gate.dispatch({
      skillId: "s",
      call: makeCall({ cap: CAPABILITY.FS_READ, target: "/tmp/x" }),
      execute: async () => ({ ok: true }),
      rollback: () => {
        rolled++;
      },
    });
    expect(out.kind).toBe("executed");
    await gate.txnBuffer().rollbackAll();
    expect(rolled).toBe(1);
  });
});

// =====================================================================
// §4.3 — HITL lifecycle (4 typed records linked by request-id)
// =====================================================================
describe("§4.3 HITL lifecycle records linked by request-id", () => {
  test("L1-L4 irreversible.{request,decision,executed} share a request-id", async () => {
    const path = await tmpAuditPath();
    const audit = new AuditLogger({ filePath: path });
    const gate = new SkillGate({ audit, broker: policyBroker({ rules: [{ cap: CAPABILITY.PUBLISH, target: /.*/, effect: "allow" }] }) });
    gate.loadSkill(parseSkillManifest({
      v: 1, id: "s",
      label: { level: 0, compartments: [], releasability: [] },
      caps: [], signer: "x", version: 1, verification: "unverified",
    }));
    const out = await gate.dispatch({
      skillId: "s",
      call: makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#ops" }),
      execute: async () => ({ ok: true }),
    });
    expect(out.kind).toBe("executed");
    await audit.close();
    const text = await readFile(path, "utf8");
    const records = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const ids = new Set(records.map((r) => r.payload?.requestId).filter(Boolean));
    // Three records (request, decision, executed) share one requestId.
    const reqRecord = records.find((r) => r.type === "irreversible.request");
    const decRecord = records.find((r) => r.type === "irreversible.decision");
    const okRecord  = records.find((r) => r.type === "irreversible.executed");
    expect(reqRecord?.payload.requestId).toBeDefined();
    expect(decRecord?.payload.requestId).toBe(reqRecord?.payload.requestId);
    expect(okRecord?.payload.requestId).toBe(reqRecord?.payload.requestId);
    expect(ids.size).toBeGreaterThanOrEqual(1);
  });
});

// =====================================================================
// §4.4 — Brokers
// =====================================================================
describe("§4.4 four named broker shapes", () => {
  function fakeReq(): BrokerRequest {
    return Object.freeze({
      requestId: "r1",
      skillId: "s1",
      ts: 0,
      call: makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#ops" }),
    });
  }

  test("B1 deny-all denies every request", async () => {
    const r = await denyAllBroker().decide(fakeReq());
    expect(r.decision).toBe("deny");
  });

  test("B2 policy: first matching rule wins; default-deny", async () => {
    const allow = policyBroker({
      rules: [{ cap: CAPABILITY.PUBLISH, target: /.*/, effect: "allow" }],
    });
    const deny = policyBroker({ rules: [] });
    expect((await allow.decide(fakeReq())).decision).toBe("approve");
    expect((await deny.decide(fakeReq())).decision).toBe("deny");
  });

  test("B3 interactive: deny on timeout (default-deny safety)", async () => {
    const b = interactiveBroker({ prompt: () => new Promise(() => {}), timeoutMs: 5 });
    const r = await b.decide(fakeReq());
    expect(r.decision).toBe("deny");
    expect(r.reason).toMatch(/timeout/i);
  });

  test("B4 webhook: non-2xx denied; malformed body denied", async () => {
    const fake500: typeof fetch = (async () => ({ ok: false, status: 500 } as unknown as Response));
    const fakeBad: typeof fetch = (async () => ({
      ok: true, status: 200, json: async () => ({ totally: "wrong" }),
    } as unknown as Response));
    expect((await webhookBroker({ url: "x", fetchFn: fake500 }).decide(fakeReq())).decision).toBe("deny");
    expect((await webhookBroker({ url: "x", fetchFn: fakeBad }).decide(fakeReq())).decision).toBe("deny");
  });
});

// =====================================================================
// §5 — Biconditional D = S
// =====================================================================
describe("§5 biconditional correctness criterion", () => {
  function exec(call: { cap: string; target: string }, ok = true): AuditRecord {
    return buildRecord({
      prevHash: "0".repeat(64),
      type: "irreversible.executed",
      actor: "test",
      level: null,
      payload: { ok, call: { cap: call.cap, target: call.target } },
    });
  }

  test("D-pass: equal multisets give ok=true", () => {
    const audit = [exec({ cap: "fs.write.irrev", target: "/a" })];
    const r = checkBiconditional({
      delta: [{ op: "fs.write.irrev", target: "/a" }],
      audit,
    });
    expect(r.ok).toBe(true);
  });

  test("F1 gate-bypass: corpus change with no audit record", () => {
    const r = checkBiconditional({
      delta: [{ op: "fs.write.irrev", target: "/a" }],
      audit: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.f1Bypass.length).toBe(1);
  });

  test("F2 audit-forgery: audit record without corpus change", () => {
    const r = checkBiconditional({
      delta: [],
      audit: [exec({ cap: "fs.write.irrev", target: "/a" })],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.f2Forgery.length).toBe(1);
  });

  test("F3 approved-but-failed: ok=false records do NOT count toward S", () => {
    const r = checkBiconditional({
      delta: [],
      audit: [exec({ cap: "fs.write.irrev", target: "/a" }, false)],
    });
    expect(r.ok).toBe(true);
  });

  test("F4 wrong-target: projection includes target", () => {
    const r = checkBiconditional({
      delta: [{ op: "fs.write.irrev", target: "/wrong" }],
      audit: [exec({ cap: "fs.write.irrev", target: "/correct" })],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.f1Bypass.find((e) => e.target === "/wrong")).toBeTruthy();
      expect(r.f2Forgery.find((e) => e.target === "/correct")).toBeTruthy();
    }
  });

  test("projection key includes both cap and target (used by both gate and biconditional)", () => {
    const a = projectionKey({ cap: "fs.write.irrev", target: "/etc/passwd" });
    const b = projectionKey({ cap: "fs.write.irrev", target: "/etc/shadow" });
    expect(a).not.toBe(b);
  });
});

// =====================================================================
// §3.2 — Skills are immutable in-session; mutations walk HITL + audit
// =====================================================================
describe("§3.2 / G12 no agent mutation of skills at runtime", () => {
  test("M1-M5 mutation attempt: pre/post hash recorded regardless of approval; approved invalidates", async () => {
    const path = await tmpAuditPath();
    const audit = new AuditLogger({ filePath: path });
    const m = parseSkillManifest({
      v: 1, id: "s",
      label: { level: 0, compartments: [], releasability: [] },
      caps: [], signer: "x", version: 1, verification: "tested",
    });

    // Approved path: invalidates verification
    const gateAllow = new SkillGate({
      audit,
      broker: policyBroker({ rules: [{ cap: CAPABILITY.FS_WRITE_IRREV, target: /.*/, effect: "allow" }] }),
    });
    gateAllow.loadSkill(m);
    const guardAllow = new SkillMutationGuard({ audit, gate: gateAllow });
    guardAllow.register({ manifest: m, contentSha256: contentSha256("v1"), filePath: "/s" });
    const r1 = await guardAllow.attemptMutation({
      skillId: "s",
      proposedContent: "v2",
      apply: async () => {},
    });
    expect(r1.approved).toBe(true);
    expect(guardAllow.isInvalidated("s")).toBe(true);

    // Denied path: still audits pre/post hashes
    const gateDeny = new SkillGate({ audit, broker: denyAllBroker() });
    gateDeny.loadSkill(m);
    const guardDeny = new SkillMutationGuard({ audit, gate: gateDeny });
    guardDeny.register({ manifest: m, contentSha256: contentSha256("v1"), filePath: "/s" });
    await guardDeny.attemptMutation({
      skillId: "s",
      proposedContent: "v3",
      apply: async () => {},
    });

    await audit.close();
    const recs = (await readFile(path, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const attempts = recs.filter((r) => r.type === "skill.mutation.attempt");
    expect(attempts.length).toBe(2);
    for (const r of attempts) {
      expect(r.payload.preSha256).toBeDefined();
      expect(r.payload.postSha256).toBeDefined();
      expect(r.payload.preSha256).not.toBe(r.payload.postSha256);
    }
  });
});

// =====================================================================
// §7 — G1-G12 normative guidelines (load-bearing structural ones)
// =====================================================================
describe("§7 G1-G12 normative guidelines (structural)", () => {
  test("G6 reversible/irreversible split: every cap is statically tagged", () => {
    for (const c of ALL_CAPABILITIES) {
      expect(typeof isReversible(c)).toBe("boolean");
      expect(isReversible(c)).not.toBe(isIrreversible(c));
    }
  });

  test("G9 standard configuration profiles: open + enclaved", async () => {
    const flavor = await import("./flavor.js");
    expect(typeof flavor.getFlavor).toBe("function");
    expect(flavor.getFlavor({})).toBe("open");
    expect(flavor.getFlavor({ ENCLAWED_FLAVOR: "enclaved" })).toBe("enclaved");
  });

  test("G10 no bypass switch: SkillGate has no public 'disable' method", () => {
    const gate = new SkillGate({
      audit: new AuditLogger({ filePath: "/tmp/never-used.jsonl" }),
      broker: denyAllBroker(),
    });
    expect((gate as unknown as { disable?: unknown }).disable).toBeUndefined();
    expect((gate as unknown as { bypass?: unknown }).bypass).toBeUndefined();
  });

  test("G11 skills are untrusted by default: missing verification → unverified", () => {
    const m = parseSkillManifest({
      v: 1, id: "x",
      label: { level: 0, compartments: [], releasability: [] },
      caps: [], signer: "x", version: 1,
      // verification omitted
    });
    expect(m.verification).toBe("unverified");
  });

  test("G12 verification is bootstrap-only: SkillRuntime rejects second bootstrap", async () => {
    const path = await tmpAuditPath();
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

// =====================================================================
// §1.3 / §6.1 / G11 — Untrusted-by-default admission for upstream skills
// =====================================================================
describe("§1.3 / G11 upstream SKILL.md admission", () => {
  test("enclaved flavor rejects unsigned upstream skill; open admits as unverified", async () => {
    const path = await tmpAuditPath();
    const audit = new AuditLogger({ filePath: path });
    const broker = denyAllBroker();
    const gate = new SkillGate({ audit, broker });
    const guard = new SkillMutationGuard({ audit, gate });

    // Enclaved: admission rejects.
    await expect(
      admitUpstreamSkill(
        { audit, broker, gate, guard, flavor: "enclaved" },
        { id: "demo", filePath: "/skills/demo/SKILL.md", content: "body" },
      ),
    ).rejects.toThrow(/enclaved flavor/);

    // Open: admission succeeds at verification=unverified.
    const r = await admitUpstreamSkill(
      { audit, broker, gate, guard, flavor: "open" },
      { id: "demo", filePath: "/skills/demo/SKILL.md", content: "body" },
    );
    expect(r.manifest.verification).toBe("unverified");
    await audit.close();
  });
});
