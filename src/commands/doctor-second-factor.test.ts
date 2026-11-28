import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { secondFactorDoctorLines } from "./doctor-second-factor.js";

let stateDir: string;

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-doctor-2fa-"));
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

// Never the person's own config or home: everything under the test's directory.
const env = (): NodeJS.ProcessEnv => ({
  ...process.env,
  HOME: stateDir,
  ENCLAWED_STATE_DIR: stateDir,
  ENCLAWED_CONFIG_PATH: path.join(stateDir, "enclawed.json"),
});

function writeStore(credentials: unknown[]): void {
  fs.mkdirSync(path.join(stateDir, "auth"), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(stateDir, "auth", "factors.json"),
    JSON.stringify({ v: 1, rpId: "enclawed.local", credentials, failures: 0, lockedUntil: null }),
    { mode: 0o600 },
  );
}

const cred = (fmt: string, extra: Record<string, unknown> = {}) => ({
  id: fmt === "packed" ? "a1b2c3d4" : "e5f6a7b8",
  label: fmt === "packed" ? "chromium" : "laptop",
  credentialId: "AAAA",
  kind: "passkey",
  alg: -7,
  publicKeyCose: "AAAA",
  signCount: 0,
  aaguid: "01020304-0506-0708-0102-030405060708",
  attestation: {
    fmt,
    aaguid: "01020304-0506-0708-0102-030405060708",
    certSha256: "00",
    certSubject: "C=US, O=Chromium, OU=Authenticator Attestation, CN=Batch Certificate",
    certIssuer: "C=US, O=Chromium, OU=Authenticator Attestation, CN=Batch Certificate",
    allowedAs: null,
  },
  enrolledAt: 1,
  lastUsedAt: null,
  ...extra,
});

describe("doctor: second factor", () => {
  it("names a packed enrollment that is not a second factor, with how to replace it", async () => {
    writeStore([cred("packed")]);
    const lines = await secondFactorDoctorLines(env(), stateDir);
    expect(lines.join("\n")).toMatch(/a1b2c3d4 \(chromium\) is not a second factor/);
    expect(lines.join("\n")).toMatch(/enclawed auth enroll/);
    expect(lines.join("\n")).toMatch(/enclawed auth remove a1b2c3d4/);
  });

  it("reports nothing for a store without such enrollments (a TPM passkey is not re-judged here)", async () => {
    expect(await secondFactorDoctorLines(env(), stateDir)).toEqual([]);
    writeStore([cred("tpm")]);
    expect(await secondFactorDoctorLines(env(), stateDir)).toEqual([]);
  });
});
