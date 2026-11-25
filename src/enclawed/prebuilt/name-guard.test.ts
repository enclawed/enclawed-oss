// The prebuilt name guard: used only when its bytes match the digest bundled
// at build time, copied fresh before use, and re-checked before every exec.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NAME_GUARD_PREBUILT } from "./name-guard.generated.js";
import {
  nameGuardUnchanged,
  prebuiltCandidates,
  prebuiltNameGuard,
  recordedGuardDigest,
} from "./name-guard.js";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-prebuilt-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("prebuilt name guard", () => {
  it("false positive: the shipped linux-x64 guard verifies, is copied fresh, and is a static ELF", () => {
    const real = prebuiltCandidates("x64").find((p) => fs.existsSync(p));
    expect(real).toBeTruthy();
    const g = prebuiltNameGuard(path.join(dir, "s1"), {
      arch: "x64",
      candidates: [real as string],
    });
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.binary).not.toBe(real);
      expect(fs.readFileSync(g.binary).subarray(0, 4).toString("latin1")).toBe("\x7fELF");
      expect(nameGuardUnchanged(g.binary, g.sha256)).toBeNull();
    }
  });

  it("attack: a guard binary that is not the one built is refused, and a verified copy changed afterwards is caught before exec", () => {
    const fake = path.join(dir, "fake-guard");
    fs.writeFileSync(fake, '#!/bin/sh\nexec "$@"\n');
    const r = prebuiltNameGuard(path.join(dir, "s2"), { arch: "x64", candidates: [fake] });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? "" : r.reason).toMatch(/does not match the digest recorded at build time/);
    const real = prebuiltCandidates("x64").find((p) => fs.existsSync(p)) as string;
    const g = prebuiltNameGuard(path.join(dir, "s3"), { arch: "x64", candidates: [real] });
    if (!g.ok) {
      throw new Error(g.reason);
    }
    fs.chmodSync(g.binary, 0o755);
    fs.appendFileSync(g.binary, "x");
    expect(nameGuardUnchanged(g.binary, g.sha256)).toMatch(/changed after it was verified/);
  });

  it("an arch with no recorded digest has no prebuilt guard (the caller builds from source)", () => {
    expect(recordedGuardDigest("riscv64")).toBeNull();
    expect(prebuiltNameGuard(path.join(dir, "s4"), { arch: "riscv64", candidates: [] }).ok).toBe(
      false,
    );
  });

  it("the recorded digests are well-formed and the source digest is recorded", () => {
    expect(NAME_GUARD_PREBUILT.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(recordedGuardDigest("x64")).toMatch(/^[0-9a-f]{64}$/);
  });
});
