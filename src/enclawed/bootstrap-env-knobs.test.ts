// End-to-end: in the enclaved flavor, bootstrap refuses to start while a
// user-environment knob relocates or switches off hardware-root evidence, the
// broker or the bundled plugin tree, and on an invalid ENCLAWEDER_ROOT in any
// flavor. Runs in a child process (a successful enclaved bootstrap freezes
// globalThis.fetch and net.Socket).

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const here = import.meta.dirname;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "boot-env-knobs-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const CHILD = (bootstrapPath: string) => `
import { bootstrapEnclawed } from ${JSON.stringify(bootstrapPath)};
const rt = await bootstrapEnclawed({
  preloadModules: false, clusterMode: false, hpcPolicy: null, fipsRequired: false,
  auditPath: process.env.CHILD_AUDIT,
  adminPolicy: {
    admin: { source: { kind: "root-file", path: "<test>" }, doc: JSON.parse(process.env.CHILD_ADMIN) },
    ignored: [],
    invalid: null,
  },
  // Keep a host's real Enclaweder (and its latches) out of this test.
  hardwareRoot: false,
});
await rt.audit.flush();
console.log(JSON.stringify({ flavor: rt.flavor }));
process.exit(0);
`;

function boot(extraEnv: Record<string, string>, adminDoc: Record<string, unknown>) {
  const state = path.join(dir, "state");
  mkdirSync(state, { recursive: true });
  const script = path.join(dir, "child.mts");
  writeFileSync(script, CHILD(path.join(here, "bootstrap.ts")));
  return spawnSync(process.execPath, ["--import", "tsx", script], {
    cwd: path.resolve(here, "../.."),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: dir,
      ENCLAWED_STATE_DIR: state,
      CHILD_AUDIT: path.join(dir, "audit.jsonl"),
      CHILD_ADMIN: JSON.stringify(adminDoc),
      ...extraEnv,
    },
  });
}

const ENCLAVED = { v: 1, flavor: "enclaved" };

describe("bootstrap refuses environment knobs", () => {
  it(
    "attack: enclaved refuses ENCLAWEDER_STATE_DIR, the forensic webhook and the bundled-plugin kill switch",
    { timeout: 120_000 },
    () => {
      const res = boot(
        {
          ENCLAWEDER_STATE_DIR: path.join(dir, "empty"),
          ENCLAWEDER_FORENSIC_WEBHOOK: "https://attacker.example/collect",
          ENCLAWED_DISABLE_BUNDLED_PLUGINS: "1",
        },
        ENCLAVED,
      );
      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/refusing to start/);
      expect(res.stderr).toMatch(/ENCLAWEDER_STATE_DIR=/);
      expect(res.stderr).toMatch(/ENCLAWEDER_FORENSIC_WEBHOOK=/);
      expect(res.stderr).toMatch(/ENCLAWED_DISABLE_BUNDLED_PLUGINS=1/);
    },
  );

  it(
    "attack: enclaved refuses ENCLAWEDER_ROOT=optional and ENCLAWEDER_BROKER=off from the user env",
    { timeout: 120_000 },
    () => {
      const res = boot({ ENCLAWEDER_ROOT: "optional", ENCLAWEDER_BROKER: "off" }, ENCLAVED);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/ENCLAWEDER_ROOT=optional/);
      expect(res.stderr).toMatch(/ENCLAWEDER_BROKER=off/);
    },
  );

  it(
    "attack: an invalid ENCLAWEDER_ROOT refuses startup in the open flavor too",
    { timeout: 120_000 },
    () => {
      const res = boot({ ENCLAWEDER_ROOT: "Required" }, { v: 1, flavor: "open" });
      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/ENCLAWEDER_ROOT="Required" is not accepted/);
    },
  );

  it(
    "FP: enclaved starts with no knobs, with ENCLAWEDER_ROOT=required, and with optional when the admin allows it",
    { timeout: 120_000 },
    () => {
      for (const [env, doc] of [
        [{}, ENCLAVED],
        [{ ENCLAWEDER_ROOT: "required" }, ENCLAVED],
        [{ ENCLAWEDER_ROOT: "optional" }, { ...ENCLAVED, allow: { hardwareRootOptional: true } }],
      ] as const) {
        const res = boot(env, doc);
        expect(res.status, res.stderr).toBe(0);
        expect(JSON.parse(res.stdout.trim().split("\n").pop()!)).toEqual({ flavor: "enclaved" });
      }
    },
  );
});
