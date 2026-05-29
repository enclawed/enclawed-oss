import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuditLogger } from "./audit-log.js";
import { policyBroker, denyAllBroker } from "./skill-broker.js";
import { CAPABILITY } from "./skill-capabilities.js";
import { SkillGate } from "./skill-gate.js";
import { SkillMutationGuard } from "./skill-mutation-guard.js";
import {
  VERIFICATION,
  contentSha256,
  parseSkillManifest,
} from "./skill-manifest.js";

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mutation-guard-"));
  return join(dir, "audit.jsonl");
}

function manifestWith(caps: ReadonlyArray<string>, verification: string) {
  return parseSkillManifest({
    v: 1,
    id: "s",
    label: { level: 0, compartments: [], releasability: [] },
    caps,
    signer: "x",
    version: 1,
    verification,
  });
}

describe("skill-mutation-guard", () => {
  let audit: AuditLogger;
  let path: string;

  beforeEach(async () => {
    path = await tmpFile();
    audit = new AuditLogger({ filePath: path });
  });
  afterEach(async () => audit.close());

  test("mutation attempt is recorded with pre/post hashes regardless of approval", async () => {
    const gate = new SkillGate({ audit, broker: denyAllBroker() });
    const m = manifestWith([], VERIFICATION.DECLARED);
    gate.loadSkill(m);
    const guard = new SkillMutationGuard({ audit, gate });
    guard.register({ manifest: m, contentSha256: contentSha256("v1"), filePath: "/skill.md" });

    const r = await guard.attemptMutation({
      skillId: "s",
      proposedContent: "v2",
      apply: async () => {},
    });
    expect(r.approved).toBe(false);
    expect(guard.isInvalidated("s")).toBe(false);

    await audit.close();
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    const records = lines.map((l) => JSON.parse(l));
    const attempt = records.find((r) => r.type === "skill.mutation.attempt");
    expect(attempt?.payload.preSha256).toBe(contentSha256("v1"));
    expect(attempt?.payload.postSha256).toBe(contentSha256("v2"));
    expect(records.some((r) => r.type === "skill.mutation.denied")).toBe(true);
  });

  test("approved mutation invalidates the skill and updates the recorded hash", async () => {
    const gate = new SkillGate({
      audit,
      broker: policyBroker({
        rules: [{ cap: CAPABILITY.FS_WRITE_IRREV, target: /skill:\/\/.*/, effect: "allow" }],
      }),
    });
    const m = manifestWith(["fs.read"], VERIFICATION.UNVERIFIED);
    gate.loadSkill(m);
    const guard = new SkillMutationGuard({ audit, gate });
    guard.register({ manifest: m, contentSha256: contentSha256("v1"), filePath: "/skill.md" });

    let applied = false;
    const r = await guard.attemptMutation({
      skillId: "s",
      proposedContent: "v2",
      apply: async () => {
        applied = true;
      },
    });
    expect(r.approved).toBe(true);
    expect(applied).toBe(true);
    expect(guard.isInvalidated("s")).toBe(true);

    await audit.close();
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    const records = lines.map((l) => JSON.parse(l));
    const committed = records.find((r) => r.type === "skill.mutation.committed");
    expect(committed?.payload.requiresReverification).toBe(true);
    expect(committed?.payload.postSha256).toBe(contentSha256("v2"));
  });
});
