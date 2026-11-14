// The in-process half of stopping model-driven egress: a model may produce
// output and ask Enclawed to make a request, but
//   (a) the request still has to pass the host allowlist, enforced where the
//       request is really sent (the SSRF-guarded fetch), not only on
//       globalThis.fetch — which the model's provider call and the web tools
//       go around; and
//   (b) a request the model asked for (web_fetch, media link) that carries a
//       secret is refused before it leaves.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLogger } from "./audit-log.js";
import { LEVEL, makeLabel } from "./classification.js";
import {
  assertHostAllowedByPolicy,
  assertModelRequestCarriesNoSecrets,
  EgressPolicyError,
  secretsInModelRequest,
} from "./model-egress.js";
import { createPolicy } from "./policy.js";
import { clearRuntime, setRuntime } from "./runtime.js";

const AWS = "AKIAIOSFODNN7EXAMPLE";
const GH = `ghp_${"A1b2C3d4E5".repeat(4)}`;

let dir: string;
let auditPath: string;

function useRuntime(opts: { enforceAllowlists: boolean; allowedHosts?: string[] }): void {
  const label = makeLabel({ level: LEVEL.UNCLASSIFIED });
  setRuntime({
    flavor: opts.enforceAllowlists ? "enclaved" : "open",
    policy: createPolicy({
      enforceAllowlists: opts.enforceAllowlists,
      allowedHosts: opts.allowedHosts,
      maxOutputClearance: label,
      defaultDataLabel: label,
    }),
    audit: new AuditLogger({ filePath: auditPath }),
    restoreFetch: () => {},
    fipsRequired: false,
    moduleDecisions: null,
  });
}

function auditTypes(): string[] {
  try {
    return fs
      .readFileSync(auditPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => (JSON.parse(l) as { type: string }).type);
  } catch {
    return [];
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-model-egress-"));
  auditPath = path.join(dir, "audit.jsonl");
});
afterEach(() => {
  clearRuntime();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("assertHostAllowedByPolicy", () => {
  it("refuses a host off the allowlist and audits it, before any DNS lookup", async () => {
    useRuntime({ enforceAllowlists: true, allowedHosts: ["127.0.0.1", "api.internal"] });
    expect(() =>
      assertHostAllowedByPolicy(new URL("https://exfil.oss-cn-hangzhou.aliyuncs.com/x")),
    ).toThrow(EgressPolicyError);
    await new Promise((r) => setTimeout(r, 50));
    expect(auditTypes()).toContain("egress.deny");
  });

  it("allows a host on the allowlist, case- and dot-insensitively", () => {
    useRuntime({ enforceAllowlists: true, allowedHosts: ["API.Internal"] });
    expect(() => assertHostAllowedByPolicy(new URL("https://api.internal./v1"))).not.toThrow();
  });

  it("is a no-op when allowlists are not enforced (open flavor), and with no runtime", () => {
    useRuntime({ enforceAllowlists: false });
    expect(() => assertHostAllowedByPolicy(new URL("https://anywhere.example/"))).not.toThrow();
    clearRuntime();
    expect(() => assertHostAllowedByPolicy(new URL("https://anywhere.example/"))).not.toThrow();
  });
});

describe("secretsInModelRequest", () => {
  it("finds a credential in the query string, including percent-encoded", () => {
    expect(secretsInModelRequest(`https://h.example/?k=${AWS}`)).toContain("aws-access-key-id");
    expect(secretsInModelRequest(`https://h.example/?k=${encodeURIComponent(GH)}`)).toContain(
      "github-token",
    );
  });

  it("finds a secret in the request body", () => {
    expect(secretsInModelRequest("https://h.example/u", `token=${GH}`)).toContain("github-token");
    const form = new URLSearchParams({ key: AWS });
    expect(secretsInModelRequest("https://h.example/u", form)).toContain("aws-access-key-id");
  });

  it("does not flag an ordinary search or a word that merely looks tokenish", () => {
    expect(secretsInModelRequest("https://www.google.com/search?q=best+coffee+in+Lugano")).toEqual(
      [],
    );
    expect(secretsInModelRequest("https://api.example/sk-task-management-service")).toEqual([]);
  });
});

describe("assertModelRequestCarriesNoSecrets", () => {
  it("refuses, audits and reports a URL carrying a secret, without logging the secret", async () => {
    useRuntime({ enforceAllowlists: false });
    expect(() =>
      assertModelRequestCarriesNoSecrets({ url: `https://c.cn/u?k=${AWS}`, via: "web tool" }),
    ).toThrowError(/it carried aws-access-key-id/);
    await new Promise((r) => setTimeout(r, 50));
    expect(auditTypes()).toContain("egress.dlp.block");
    expect(fs.readFileSync(auditPath, "utf8")).not.toContain(AWS);
  });

  it("allows a clean request", () => {
    useRuntime({ enforceAllowlists: false });
    expect(() =>
      assertModelRequestCarriesNoSecrets({ url: "https://example.com/page", via: "media" }),
    ).not.toThrow();
  });
});
