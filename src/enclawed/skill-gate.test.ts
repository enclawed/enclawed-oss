import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuditLogger } from "./audit-log.js";
import { CAPABILITY, makeCall } from "./skill-capabilities.js";
import {
  type SkillManifest,
  VERIFICATION,
  parseSkillManifest,
} from "./skill-manifest.js";
import { SkillGate } from "./skill-gate.js";
import { denyAllBroker, policyBroker } from "./skill-broker.js";

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skill-gate-"));
  return join(dir, "audit.jsonl");
}

function manifestWith(opts: {
  caps: ReadonlyArray<string>;
  verification: typeof VERIFICATION[keyof typeof VERIFICATION];
}): SkillManifest {
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

describe("skill-gate", () => {
  let audit: AuditLogger;
  let path: string;

  beforeEach(async () => {
    path = await tmpFile();
    audit = new AuditLogger({ filePath: path });
  });
  afterEach(async () => audit.close());

  test("unverified skill: every irreversible call walks broker", async () => {
    const gate = new SkillGate({ audit, broker: denyAllBroker() });
    gate.loadSkill(manifestWith({ caps: ["publish"], verification: VERIFICATION.UNVERIFIED }));

    const out = await gate.dispatch({
      skillId: "s",
      call: makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#ops" }),
      execute: async () => ({ ok: true }),
    });
    expect(out.kind).toBe("denied");

    await audit.close();
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    const types = lines.map((l) => JSON.parse(l).type);
    expect(types).toContain("irreversible.request");
    expect(types).toContain("irreversible.decision");
    expect(types).not.toContain("irreversible.executed");
  });

  test("declared skill: in-caps irreversible bypasses broker but is audited", async () => {
    const gate = new SkillGate({ audit, broker: denyAllBroker() });
    gate.loadSkill(manifestWith({ caps: ["publish"], verification: VERIFICATION.DECLARED }));
    let executed = 0;
    const out = await gate.dispatch({
      skillId: "s",
      call: makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#ops" }),
      execute: async () => {
        executed++;
        return { ok: true };
      },
    });
    expect(out.kind).toBe("executed");
    expect(executed).toBe(1);

    await audit.close();
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    const types = lines.map((l) => JSON.parse(l).type);
    expect(types).toContain("irreversible.request");
    expect(types).toContain("irreversible.decision");
    expect(types).toContain("irreversible.executed");
  });

  test("declared skill: out-of-caps irreversible walks broker", async () => {
    const gate = new SkillGate({
      audit,
      broker: policyBroker({
        rules: [{ cap: CAPABILITY.PAY, target: /.*/, effect: "deny" }],
      }),
    });
    gate.loadSkill(manifestWith({ caps: ["publish"], verification: VERIFICATION.DECLARED }));
    const out = await gate.dispatch({
      skillId: "s",
      call: makeCall({ cap: CAPABILITY.PAY, target: "USD:100" }),
      execute: async () => ({ ok: true }),
    });
    expect(out.kind).toBe("denied");
  });

  test("reversible call always executes through txn buffer", async () => {
    const gate = new SkillGate({ audit, broker: denyAllBroker() });
    gate.loadSkill(manifestWith({ caps: ["fs.read"], verification: VERIFICATION.UNVERIFIED }));
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
    expect(gate.txnBuffer().size()).toBe(1);
    await gate.txnBuffer().rollbackAll();
    expect(rolled).toBe(1);
  });

  test("execute-error on irreversible writes irreversible.error not executed", async () => {
    const gate = new SkillGate({ audit, broker: denyAllBroker() });
    gate.loadSkill(manifestWith({ caps: ["publish"], verification: VERIFICATION.DECLARED }));
    const out = await gate.dispatch({
      skillId: "s",
      call: makeCall({ cap: CAPABILITY.PUBLISH, target: "irc://#ops" }),
      execute: async () => ({ ok: false, reason: "host down" }),
    });
    expect(out.kind).toBe("error");

    await audit.close();
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    const types = lines.map((l) => JSON.parse(l).type);
    expect(types).toContain("irreversible.error");
    expect(types).not.toContain("irreversible.executed");
  });

  test("call to unloaded skill is denied at gate", async () => {
    const gate = new SkillGate({ audit, broker: denyAllBroker() });
    const out = await gate.dispatch({
      skillId: "ghost",
      call: makeCall({ cap: CAPABILITY.PUBLISH, target: "x" }),
      execute: async () => ({ ok: true }),
    });
    expect(out.kind).toBe("denied");
  });
});
