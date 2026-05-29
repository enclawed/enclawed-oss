import { describe, expect, test } from "vitest";

import { buildRecord, type AuditRecord } from "./audit-log.js";
import { checkBiconditional } from "./biconditional.js";

const GENESIS = "0".repeat(64);

function exec(call: { cap: string; target: string }, ok = true): AuditRecord {
  return buildRecord({
    prevHash: GENESIS,
    type: "irreversible.executed",
    actor: "test",
    level: null,
    payload: { ok, call: { cap: call.cap, target: call.target } },
  });
}

describe("biconditional", () => {
  test("D = S: passes", () => {
    const audit = [
      exec({ cap: "fs.write.irrev", target: "/a" }),
      exec({ cap: "publish", target: "irc://#ops" }),
    ];
    const delta = [
      { op: "fs.write.irrev", target: "/a" },
      { op: "publish", target: "irc://#ops" },
    ];
    const r = checkBiconditional({ delta, audit });
    expect(r.ok).toBe(true);
  });

  test("F1 gate bypass: corpus changed without an audit record", () => {
    const audit: AuditRecord[] = [];
    const delta = [{ op: "fs.write.irrev", target: "/a" }];
    const r = checkBiconditional({ delta, audit });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.f1Bypass.length).toBeGreaterThan(0);
      expect(r.f2Forgery.length).toBe(0);
    }
  });

  test("F2 audit forgery: audit record without a corpus change", () => {
    const audit = [exec({ cap: "fs.write.irrev", target: "/a" })];
    const r = checkBiconditional({ delta: [], audit });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.f2Forgery.length).toBeGreaterThan(0);
    }
  });

  test("F3 approved-but-failed: ok=false records do NOT count toward S", () => {
    const audit = [exec({ cap: "fs.write.irrev", target: "/a" }, false)];
    const delta: { op: string; target: string }[] = [];
    const r = checkBiconditional({ delta, audit });
    expect(r.ok).toBe(true);
  });

  test("F3 silent host-failure that still mutated: surfaces as F1", () => {
    const audit = [exec({ cap: "fs.write.irrev", target: "/a" }, false)];
    const delta = [{ op: "fs.write.irrev", target: "/a" }];
    const r = checkBiconditional({ delta, audit });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.f1Bypass.length).toBeGreaterThan(0);
  });

  test("F4 wrong-target: caught because projection includes target", () => {
    const audit = [exec({ cap: "fs.write.irrev", target: "/correct" })];
    const delta = [{ op: "fs.write.irrev", target: "/wrong" }];
    const r = checkBiconditional({ delta, audit });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.f1Bypass.find((e) => e.target === "/wrong")).toBeTruthy();
      expect(r.f2Forgery.find((e) => e.target === "/correct")).toBeTruthy();
    }
  });

  test("multiset count is enforced: two of the same op are not the same as one", () => {
    const audit = [exec({ cap: "fs.write.irrev", target: "/a" })];
    const delta = [
      { op: "fs.write.irrev", target: "/a" },
      { op: "fs.write.irrev", target: "/a" },
    ];
    const r = checkBiconditional({ delta, audit });
    expect(r.ok).toBe(false);
  });
});
