import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLogger } from "../audit-log.js";
import { LEVEL, makeLabel } from "../classification.js";
import { createPolicy } from "../policy.js";
import { clearRuntime, setRuntime } from "../runtime.js";
import { createNetCageReporter, dlpFindingsOf, type NetCageAlert } from "./alert.js";
import type { NetCageAttempt } from "./cage.js";

const SECRET = "AKIAIOSFODNN7EXAMPLE";

function attempt(over: Partial<NetCageAttempt> = {}): NetCageAttempt {
  return {
    type: "attempt",
    transport: "tcp",
    dst: "198.18.0.1",
    port: 443,
    bytes: 10,
    protocol: "tls",
    name: "bucket.oss-cn-hangzhou.aliyuncs.com",
    request: null,
    sample: "",
    at: new Date().toISOString(),
    ...over,
  };
}

let dir: string;
let auditPath: string;

async function records(n: number): Promise<Record<string, unknown>[]> {
  const deadline = Date.now() + 3000;
  for (;;) {
    let out: Record<string, unknown>[] = [];
    try {
      out = fs
        .readFileSync(auditPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch {
      /* not yet */
    }
    if (out.length >= n || Date.now() > deadline) {
      return out;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-alert-"));
  auditPath = path.join(dir, "audit.jsonl");
  const label = makeLabel({ level: LEVEL.UNCLASSIFIED });
  setRuntime({
    flavor: "open",
    policy: createPolicy({ maxOutputClearance: label, defaultDataLabel: label }),
    audit: new AuditLogger({ filePath: auditPath }),
    restoreFetch: () => {},
    fipsRequired: false,
    moduleDecisions: null,
  });
});
afterEach(() => {
  clearRuntime();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("createNetCageReporter", () => {
  it("alerts once per destination and counts the repeats (564 retries are one alert)", async () => {
    const alerts: NetCageAlert[] = [];
    const r = createNetCageReporter({
      source: "exec",
      label: "zcode",
      notify: (a) => alerts.push(a),
    });
    for (let i = 0; i < 564; i++) {
      r.onEvent(attempt());
    }
    r.onEvent(attempt({ name: "other.example" }));
    expect(alerts.map((a) => a.attempt.name)).toEqual([
      "bucket.oss-cn-hangzhou.aliyuncs.com",
      "other.example",
    ]);
    expect(r.attempts()).toBe(565);
    expect(r.summary()).toContain("564 × tcp to bucket.oss-cn-hangzhou.aliyuncs.com");
    expect(alerts[0].message).toBe(
      "Enclawed blocked a command the model ran (zcode) from reaching the network: " +
        "a TLS connection to bucket.oss-cn-hangzhou.aliyuncs.com. Nothing left this machine.",
    );
  });

  it("audits every attempt with DLP ids and a hash, never the bytes", async () => {
    const r = createNetCageReporter({ source: "model-server", label: "qwen", notify: () => {} });
    const body = `POST /u HTTP/1.1\r\nHost: c.example\r\n\r\nkey=${SECRET}`;
    r.onEvent(
      attempt({
        protocol: "http",
        name: "c.example",
        request: "POST /u",
        sample: Buffer.from(body).toString("base64"),
      }),
    );
    const [rec] = await records(1);
    expect(rec.type).toBe("egress.cage.attempt");
    expect(rec.actor).toBe("model-server");
    const p = rec.payload as Record<string, unknown>;
    expect(p.dlp).toContain("aws-access-key-id");
    expect(p.sampleSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readFileSync(auditPath, "utf8")).not.toContain(SECRET);
  });

  it("names the secret family in the alert for the model server", () => {
    const alerts: NetCageAlert[] = [];
    const r = createNetCageReporter({
      source: "model-server",
      label: "glm",
      notify: (a) => alerts.push(a),
    });
    r.onEvent(attempt({ sample: Buffer.from(SECRET).toString("base64") }));
    expect(alerts[0].message).toContain("Enclawed blocked the model server (glm)");
    expect(alerts[0].message).toContain("It carried aws-access-key-id");
    expect(alerts[0].message).not.toContain(SECRET);
  });

  it("describes DNS, HTTP, bare packets and plain TCP attempts", () => {
    const msgs: string[] = [];
    const r = createNetCageReporter({
      source: "exec",
      label: "x",
      notify: (a) => msgs.push(a.message),
    });
    r.onEvent(
      attempt({ transport: "udp", protocol: "dns", name: "a.example", dst: null, port: 53 }),
    );
    r.onEvent(attempt({ protocol: "http", name: "b.example", request: "PUT /x" }));
    r.onEvent(
      attempt({ transport: "ip", protocol: "unknown", name: null, dst: null, port: 0, packets: 3 }),
    );
    r.onEvent(attempt({ protocol: "unknown", name: null, dst: "203.0.113.9", port: 4444 }));
    expect(msgs[0]).toContain("a DNS lookup of a.example");
    expect(msgs[1]).toContain("an HTTP PUT /x to b.example");
    expect(msgs[2]).toContain("3 packet(s) to an address off this machine");
    expect(msgs[3]).toContain("a TCP connection to 203.0.113.9:4444");
  });

  it("stops auditing after the cap but keeps counting and alerting", async () => {
    const r = createNetCageReporter({ source: "exec", label: "flood", notify: () => {} });
    for (let i = 0; i < 1005; i++) {
      r.onEvent(attempt({ name: `n${i % 3}.example` }));
    }
    expect(r.attempts()).toBe(1005);
    await new Promise((res) => setTimeout(res, 300));
    const n = (await records(1000)).filter((x) => x.type === "egress.cage.attempt").length;
    expect(n).toBe(1000);
  });

  it("records notices, ignores ready events, and survives a throwing notifier", async () => {
    const r = createNetCageReporter({
      source: "exec",
      label: "x",
      notify: () => {
        throw new Error("boom");
      },
    });
    r.onEvent({ type: "ready", at: "" });
    r.onEvent({ type: "notice", message: "could not hide /run", at: "" });
    expect(() => r.onEvent(attempt())).not.toThrow();
    const recs = await records(2);
    expect(recs.map((x) => x.type)).toEqual(["egress.cage.notice", "egress.cage.attempt"]);
  });

  it("works without a runtime (no audit), still alerting", () => {
    clearRuntime();
    const alerts: NetCageAlert[] = [];
    const r = createNetCageReporter({ source: "exec", label: "x", notify: (a) => alerts.push(a) });
    r.onEvent(attempt());
    expect(alerts).toHaveLength(1);
  });
});

describe("dlpFindingsOf", () => {
  it("scans the decoded bytes and tolerates empty or bad input", () => {
    expect(dlpFindingsOf("")).toEqual([]);
    expect(dlpFindingsOf("%%%not base64").length).toBeGreaterThanOrEqual(0);
    expect(dlpFindingsOf(Buffer.from(SECRET).toString("base64")).map((f) => f.id)).toContain(
      "aws-access-key-id",
    );
  });
});
