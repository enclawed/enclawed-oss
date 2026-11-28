// End-to-end: an enclaved bootstrap refuses every loosening attempt from
// user-writable sources, records the refusals, installs the raw-socket guard,
// and ignores the user trust-root overlay. Runs in a child process because a
// successful enclaved bootstrap freezes globalThis.fetch and net.Socket.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isFipsEnabled } from "./crypto-fips.js";

const here = import.meta.dirname;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "boot-posture-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const CHILD = (bootstrapPath: string) => `
import { bootstrapEnclawed } from ${JSON.stringify(bootstrapPath)};
import { getTrustRoot } from ${JSON.stringify(path.join(here, "trust-root.ts"))};
import net from "node:net";
const rt = await bootstrapEnclawed({
  preloadModules: false, clusterMode: false, hpcPolicy: null,
  // FIPS is not available on test hosts; the programmatic option is the
  // embedding app's (trusted) choice, unlike ENCLAWED_FIPS_REQUIRED=0.
  ...(process.env.CHILD_FIPS === "env" ? {} : { fipsRequired: false }),
  auditPath: process.env.CHILD_AUDIT,
  // enclawed-oss ships no flavor pin: the admin policy selects "enclaved".
  adminPolicy: {
    admin: { source: { kind: "root-file", path: "<test>" }, doc: process.env.CHILD_ADMIN ? JSON.parse(process.env.CHILD_ADMIN) : { v: 1, flavor: "enclaved" } },
    ignored: [],
    invalid: null,
  },
  // Keep a host's real Enclaweder (and its latches) out of this test.
  hardwareRoot: false,
});
let socketDenied = null;
try { net.connect({ host: "203.0.113.7", port: 443 }).on("error", () => {}); socketDenied = false; }
catch (e) { socketDenied = String(e.message); }
await rt.audit.flush();
console.log(JSON.stringify({
  flavor: rt.flavor,
  enforce: rt.policy.enforceAllowlists,
  providers: [...rt.policy.allowedProviders],
  commandNetwork: rt.policy.commandNetwork,
  fipsRequired: rt.fipsRequired,
  bundledDev: getTrustRoot().find((s) => s.keyId === "enclawed-bundled-dev-2026")?.approvedClearance,
  attacker: getTrustRoot().some((s) => s.keyId === "attacker"),
  socketDenied,
}));
process.exit(0);
`;

describe("enclaved bootstrap: loosening from user-writable sources is refused", () => {
  it(
    "refuses ENCLAWED_FLAVOR=open, ENCLAWED_FIPS_REQUIRED=0, user-config loosening and the trust overlay",
    { timeout: 120_000 },
    () => {
      const state = path.join(dir, "state");
      mkdirSync(state);
      writeFileSync(
        path.join(state, "enclawed.json"),
        JSON.stringify({
          enclawed: {
            policy: {
              enforceAllowlists: false,
              commandNetwork: "host",
              allowedProviders: ["local-model", "openai"],
            },
          },
        }),
      );
      const pem = readFileSync(path.join(here, "trust-root.ts"), "utf8").match(
        /-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----\n/,
      )![0];
      writeFileSync(
        path.join(state, "trust-root.json"),
        JSON.stringify({
          v: 1,
          signers: [
            {
              keyId: "enclawed-bundled-dev-2026",
              publicKeyPem: pem,
              approvedClearance: ["top-secret-sci"],
            },
            { keyId: "attacker", publicKeyPem: pem, approvedClearance: ["top-secret-sci"] },
          ],
        }),
      );
      const script = path.join(dir, "child.mts");
      writeFileSync(script, CHILD(path.join(here, "bootstrap.ts")));
      const audit = path.join(dir, "audit.jsonl");
      const res = spawnSync(process.execPath, ["--import", "tsx", script], {
        cwd: path.resolve(here, "../.."),
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          HOME: dir,
          ENCLAWED_STATE_DIR: state,
          ENCLAWED_CONFIG_PATH: path.join(state, "enclawed.json"),
          ENCLAWED_FLAVOR: "open",
          ENCLAWED_FIPS_REQUIRED: "0",
          ENCLAWED_AUDIT_PATH: "/dev/null",
          CHILD_AUDIT: audit,
        },
      });
      expect(res.status, res.stderr).toBe(0);
      const out = JSON.parse(res.stdout.trim().split("\n").pop()!);
      expect(out).toMatchObject({
        flavor: "enclaved",
        enforce: true,
        providers: ["local-model"],
        commandNetwork: "none",
        bundledDev: ["public", "internal"],
        attacker: false,
      });
      expect(out.socketDenied).toMatch(/egress denied/);
      expect(res.stderr).toMatch(/REFUSED: ENCLAWED_FLAVOR="open"/);
      const records = readFileSync(audit, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as { type: string; payload: Record<string, unknown> });
      const refused = records.find((r) => r.type === "enclawed.policy.refused");
      const settings = (refused?.payload.refusals as Array<{ setting: string }>).map(
        (r) => r.setting,
      );
      expect(settings).toEqual(
        expect.arrayContaining([
          "ENCLAWED_FLAVOR=open",
          "ENCLAWED_AUDIT_PATH=/dev/null",
          expect.stringMatching(/enforceAllowlists=false/),
          expect.stringMatching(/commandNetwork="host"/),
          'enclawed.policy.allowedProviders += "openai"',
          expect.stringMatching(/user trust-root overlay ignored/),
        ]),
      );
      const boot = records.find((r) => r.type === "enclawed.boot");
      expect(boot?.payload).toMatchObject({ flavor: "enclaved", rawSocketGuard: true });
      expect(records.some((r) => r.type === "egress.deny")).toBe(true);
    },
  );

  it.skipIf(isFipsEnabled())(
    "refuses ENCLAWED_FIPS_REQUIRED=0: the FIPS requirement stays, so a non-FIPS host refuses to start",
    { timeout: 120_000 },
    () => {
      const state = path.join(dir, "state");
      mkdirSync(state);
      const script = path.join(dir, "child.mts");
      writeFileSync(script, CHILD(path.join(here, "bootstrap.ts")));
      const res = spawnSync(process.execPath, ["--import", "tsx", script], {
        cwd: path.resolve(here, "../.."),
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          HOME: dir,
          ENCLAWED_STATE_DIR: state,
          ENCLAWED_CONFIG_PATH: path.join(state, "enclawed.json"),
          ENCLAWED_FIPS_REQUIRED: "0",
          CHILD_FIPS: "env",
          CHILD_AUDIT: path.join(dir, "audit.jsonl"),
        },
      });
      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/FIPS mode|FIPS_NOT_ENABLED/);
    },
  );

  it(
    "warns and records a FIPS downgrade the admin policy chose (no longer silent)",
    { timeout: 120_000 },
    () => {
      const state = path.join(dir, "state");
      mkdirSync(state);
      const script = path.join(dir, "child.mts");
      writeFileSync(script, CHILD(path.join(here, "bootstrap.ts")));
      const audit = path.join(dir, "audit.jsonl");
      const res = spawnSync(process.execPath, ["--import", "tsx", script], {
        cwd: path.resolve(here, "../.."),
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          HOME: dir,
          ENCLAWED_STATE_DIR: state,
          ENCLAWED_CONFIG_PATH: path.join(state, "enclawed.json"),
          CHILD_FIPS: "env",
          CHILD_ADMIN: JSON.stringify({ v: 1, flavor: "enclaved", fipsRequired: false }),
          CHILD_AUDIT: audit,
        },
      });
      expect(res.status, res.stderr).toBe(0);
      expect(res.stderr).toMatch(/enclaved flavor is running without the FIPS requirement/);
      const boot = readFileSync(audit, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as { type: string; payload: Record<string, unknown> })
        .find((r) => r.type === "enclawed.boot");
      expect(boot?.payload).toMatchObject({ fipsRequired: false, fipsDowngrade: true });
    },
  );
});
