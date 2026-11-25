// A record longer than the tail-scan window (a session-start record that
// measures many files) must not make the next logger refuse the log as
// having an invalid tail: the scan widens until it holds the whole line.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AuditLogger, verifyChain } from "./audit-log.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-audit-long-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("audit log tail scan", () => {
  it("a log whose last record is over 64 KiB is appended to by a new logger, and the chain still verifies", async () => {
    const filePath = path.join(dir, "audit.jsonl");
    const big = Object.fromEntries(
      Array.from({ length: 2000 }, (_, i) => [`src/file-${i}.mjs`, "a".repeat(64)]),
    );
    const a = new AuditLogger({ filePath });
    await a.append({
      type: "session.start",
      actor: "t",
      level: null,
      payload: { measurements: big },
    });
    await a.close();
    expect(fs.statSync(filePath).size).toBeGreaterThan(64 * 1024);
    const b = new AuditLogger({ filePath });
    await b.append({ type: "after", actor: "t", level: null, payload: {} });
    await b.close();
    const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).prevHash).toBe(JSON.parse(lines[0]).recordHash);
    expect((await verifyChain(filePath)).ok).toBe(true);
  });

  it("attack: a torn last line is still refused", async () => {
    const filePath = path.join(dir, "torn.jsonl");
    const a = new AuditLogger({ filePath });
    await a.append({ type: "x", actor: "t", level: null, payload: {} });
    await a.close();
    fs.appendFileSync(filePath, '{"ts":1,"type":"half');
    const b = new AuditLogger({ filePath });
    await expect(b.append({ type: "y", actor: "t", level: null, payload: {} })).rejects.toThrow(
      /not valid JSONL/,
    );
    await b.close().catch(() => {});
  });
});
