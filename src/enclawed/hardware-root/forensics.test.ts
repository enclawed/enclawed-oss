import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  captureForensics,
  recordForensics,
  captureAndRecordTamper,
  setForensicContext,
  forensicLogPath,
} from "./forensics.js";

function tmp(): string {
  return path.join(os.tmpdir(), `forensics-${crypto.randomBytes(6).toString("hex")}.jsonl`);
}

describe("hardware-root forensics", () => {
  beforeEach(() => {
    setForensicContext({}); // context is additive; tests set their own below
  });

  it("captures device + host + network signal", () => {
    const snap = captureForensics("enclaweder reported ZEROIZED", {
      serial: "ENCLW-0039",
      pubkey: "769bd1ec",
      status: "DIRTY",
    });
    expect(snap.schema).toBe("enclaweder.forensics.v1");
    expect(snap.trigger).toBe("enclaweder reported ZEROIZED");
    expect(snap.device?.serial).toBe("ENCLW-0039");
    expect((snap.host as { hostname?: string }).hostname).toBe(os.hostname());
    expect(Array.isArray(snap.network.interfaces)).toBe(true);
    expect(snap.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("includes app-registered session context (who/where)", () => {
    setForensicContext({ operator: "alfredo", sourceIp: "203.0.113.9", sessionId: "s-42" });
    const snap = captureForensics("tamper", null);
    expect(snap.session).toMatchObject({
      operator: "alfredo",
      sourceIp: "203.0.113.9",
      sessionId: "s-42",
    });
  });

  it("writes an append-only, hash-chained log that survives (local file)", async () => {
    const log = tmp();
    process.env.ENCLAWEDER_FORENSIC_LOG = log;
    try {
      const a = await captureAndRecordTamper("disconnect", {
        serial: "A",
        pubkey: "x",
        status: "DIRTY",
      });
      const b = await captureAndRecordTamper("disconnect", {
        serial: "A",
        pubkey: "x",
        status: "DIRTY",
      });
      const lines = fs
        .readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      expect(lines).toHaveLength(2);
      // second record chains to the first (tamper-evident append-only)
      expect(lines[0].prevHash).toBeNull();
      expect(lines[1].prevHash).toBe(a.hash);
      expect(b.prevHash).toBe(a.hash);
      expect(forensicLogPath()).toBe(log);
    } finally {
      delete process.env.ENCLAWEDER_FORENSIC_LOG;
      fs.rmSync(log, { force: true });
    }
  });

  it("recordForensics never throws even if the sink is unwritable", async () => {
    process.env.ENCLAWEDER_FORENSIC_LOG = "/proc/nonexistent/forensics.jsonl"; // unwritable
    try {
      await expect(recordForensics(captureForensics("t", null))).resolves.toBeUndefined();
    } finally {
      delete process.env.ENCLAWEDER_FORENSIC_LOG;
    }
  });
});
