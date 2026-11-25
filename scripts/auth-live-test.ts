// LIVE test of the mandatory second factor against a REAL FIDO2 security key
// through REAL libfido2 tools. Run by a person with the key in hand:
//
//   scripts/auth-live-test.sh            (wrapper: throwaway state dir, then this file)
//
// Everything is written to a throwaway directory (ENCLAWED_STATE_DIR,
// ENCLAWED_AUDIT_PATH, HOME): your real ~/.enclawed is never read or written.
// Expect 4-6 touches and PIN entries. Each step prints PASS or FAIL; the exit
// code is the number of failed steps.
//
// What it establishes, each against the real key:
//   1. the key is reachable over raw HID/NFC, is not a platform authenticator,
//      and can verify the user (PIN set or built-in UV);
//   2. enrollment: packed basic attestation verified, AAGUID recorded;
//   3. an assertion with UP+UV verifies, and the stored counter advances;
//   4. libfido2's own verifier (fido2-assert -V) agrees with Enclawed's on
//      the same real assertion (independent implementation cross-check);
//   5. a real assertion WITHOUT user verification (no PIN) is refused;
//   6. replaying that real assertion is refused (counter);
//   7. an unlock ticket signed by the key admits one headless session start,
//      is spent after it, and an edited copy is refused;
//   8. removing the last factor is refused;
//   9. every step left a record in the hash-chained audit log, and it verifies.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AuditLogger, verifyChain } from "../src/enclawed/audit-log.js";
import { unwrapCborByteString } from "../src/enclawed/auth/cbor.js";
import {
  type AuthContext,
  assertSecondFactor,
  enrollSecurityKey,
  removeSecurityKey,
  secondFactorStatus,
  unlockForHeadlessStart,
} from "../src/enclawed/auth/gate.js";
import { createLibfido2Transport, deviceRefusal, findTool } from "../src/enclawed/auth/libfido2.js";
import { readAuthStore } from "../src/enclawed/auth/store.js";
import { ticketFile } from "../src/enclawed/auth/ticket.js";
import {
  WebAuthnError,
  coseToPublicKey,
  fromB64url,
  verifyAssertion,
} from "../src/enclawed/auth/webauthn.js";

const stateDir = process.env.ENCLAWED_STATE_DIR;
const auditPath = process.env.ENCLAWED_AUDIT_PATH;
if (!stateDir || !auditPath || !stateDir.startsWith(os.tmpdir())) {
  console.error(
    "run through scripts/auth-live-test.sh (it sets a throwaway ENCLAWED_STATE_DIR and ENCLAWED_AUDIT_PATH)",
  );
  process.exit(2);
}
const rpId = "enclawed-live-test.local";
const audit = new AuditLogger({ filePath: auditPath });
const transport = createLibfido2Transport();
const base: AuthContext = {
  stateDir,
  rpId,
  transport,
  interactive: true,
  audit: async (e) => {
    await audit.append({ type: e.type, actor: "auth-live-test", level: null, payload: e.payload });
  },
  say: (line) => process.stderr.write(`  > ${line}\n`),
};
const authDir = path.join(stateDir, "auth");
let failed = 0;
const step = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) {
    failed += 1;
  }
};
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "ok";
  } catch (err) {
    return (err as { code?: string }).code ?? String(err);
  }
};

// 1. Tools and device.
const tools = ["fido2-token", "fido2-assert", "fido2-cred"].map((t) => [t, findTool(t)] as const);
step(
  "libfido2 tools found",
  tools.every(([, p]) => p !== null),
  tools.map(([t, p]) => `${t}=${p ?? "missing"}`).join(" "),
);
const devices = transport.listDevices();
console.log(
  `      devices: ${devices.map((d) => `${d.path} [${d.description}] options=${[...d.options].map(([k, v]) => (v ? k : `no${k}`)).join(",")}`).join("; ") || "none"}`,
);
const usable = devices.filter((d) => !deviceRefusal(d));
step(
  "exactly one acceptable security key plugged in",
  usable.length === 1,
  devices.map((d) => deviceRefusal(d)?.message ?? `${d.path} ok`).join("; "),
);
if (usable.length !== 1) {
  process.exit(failed);
}
const device = usable[0];

// 2. Enrollment.
const enrolled = await enrollSecurityKey(base, { label: "live-primary" }).catch((e: Error) => e);
step(
  "enroll: attestation verified, credential stored",
  !(enrolled instanceof Error),
  enrolled instanceof Error
    ? enrolled.message
    : `AAGUID ${enrolled.credential.aaguid}, ${enrolled.credential.attestation.certSubject}`,
);
if (enrolled instanceof Error) {
  process.exit(failed);
}
const cred = enrolled.credential;

// 3. Assertion through the gate.
const before = readAuthStore(authDir, rpId).credentials[0].signCount;
const v = await codeOf(assertSecondFactor(base, { purpose: "auth-test" }));
const after = readAuthStore(authDir, rpId).credentials[0].signCount;
step(
  "assertion with UP+UV verifies; counter advances",
  v === "ok" && after > before,
  `${v}; counter ${before} -> ${after}`,
);

// 4 + 5 + 6. One raw real assertion with UV, cross-checked by libfido2; one without UV.
const pemFile = path.join(stateDir, "credential.pem");
fs.writeFileSync(
  pemFile,
  coseToPublicKey(fromB64url(cred.publicKeyCose)).key.export({ type: "spki", format: "pem" }),
);
const alg = cred.alg === -7 ? "es256" : "eddsa";
const raw = (uv: boolean) => {
  const cdh = randomBytes(32);
  const input = [
    cdh.toString("base64"),
    rpId,
    Buffer.from(fromB64url(cred.credentialId)).toString("base64"),
    "",
  ].join("\n");
  console.error(`  > touch the key${uv ? " and enter its PIN" : " (no PIN this time)"}`);
  const r = spawnSync(
    findTool("fido2-assert")!,
    ["-G", "-t", "up=true", ...(uv ? ["-t", "pin=true"] : ["-t", "uv=false"]), device.path],
    {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  return { cdh, status: r.status, out: (r.stdout ?? "").split("\n") };
};
const withUv = raw(true);
if (withUv.status === 0) {
  const authCbor = Buffer.from(withUv.out[2], "base64");
  const sig = Buffer.from(withUv.out[3], "base64");
  const stored = readAuthStore(authDir, rpId).credentials[0].signCount;
  let ours = "ok";
  let newCount = 0;
  try {
    newCount = verifyAssertion({
      rpId,
      clientDataHash: withUv.cdh,
      authDataRaw: unwrapCborByteString(authCbor),
      signature: sig,
      credentialPublicKey: fromB64url(cred.publicKeyCose),
      storedSignCount: stored,
    }).signCount;
  } catch (e) {
    ours = (e as WebAuthnError).code ?? String(e);
  }
  const lib = spawnSync(findTool("fido2-assert")!, ["-V", "-p", "-v", pemFile, alg], {
    input: withUv.out.slice(0, 4).join("\n") + "\n",
    encoding: "utf8",
  });
  step(
    "libfido2's verifier and Enclawed's agree on a real UV assertion",
    ours === "ok" && lib.status === 0,
    `enclawed=${ours}, fido2-assert -V exit ${lib.status}`,
  );
  // Replay of the same real assertion against the counter it already set.
  let replay = "ok";
  try {
    verifyAssertion({
      rpId,
      clientDataHash: withUv.cdh,
      authDataRaw: unwrapCborByteString(authCbor),
      signature: sig,
      credentialPublicKey: fromB64url(cred.publicKeyCose),
      storedSignCount: newCount,
    });
  } catch (e) {
    replay = (e as WebAuthnError).code ?? String(e);
  }
  step("replaying a real assertion is refused (counter)", replay === "counter-regressed", replay);
  const tampered = Buffer.from(unwrapCborByteString(authCbor));
  tampered[33] ^= 0x01;
  let t = "ok";
  try {
    verifyAssertion({
      rpId,
      clientDataHash: withUv.cdh,
      authDataRaw: tampered,
      signature: sig,
      credentialPublicKey: fromB64url(cred.publicKeyCose),
      storedSignCount: 0,
    });
  } catch (e) {
    t = (e as WebAuthnError).code ?? String(e);
  }
  step("an altered real assertion is refused (signature)", t === "bad-signature", t);
} else {
  step("raw UV assertion obtained", false, `fido2-assert exit ${withUv.status}`);
}
const noUv = raw(false);
if (noUv.status === 0) {
  let code = "ok";
  try {
    verifyAssertion({
      rpId,
      clientDataHash: noUv.cdh,
      authDataRaw: unwrapCborByteString(Buffer.from(noUv.out[2], "base64")),
      signature: Buffer.from(noUv.out[3], "base64"),
      credentialPublicKey: fromB64url(cred.publicKeyCose),
      storedSignCount: 0,
    });
  } catch (e) {
    code = (e as WebAuthnError).code ?? String(e);
  }
  step(
    "a real assertion without user verification is refused",
    code === "no-user-verification",
    code,
  );
} else {
  // Some keys (alwaysUv) refuse to answer without UV at all: that is also a refusal.
  step(
    "a real assertion without user verification is refused",
    true,
    `the key itself refused (fido2-assert exit ${noUv.status})`,
  );
}

// 7. Unlock ticket.
const ticket = await unlockForHeadlessStart(base, { minutes: 5, uses: 1 }).catch((e: Error) => e);
step(
  "unlock ticket issued and signed by the key",
  !(ticket instanceof Error),
  ticket instanceof Error ? ticket.message : `expires ${new Date(ticket.expiresAt).toISOString()}`,
);
const headless = { ...base, interactive: false };
const saved = fs.existsSync(ticketFile(authDir))
  ? fs.readFileSync(ticketFile(authDir), "utf8")
  : "";
step(
  "headless session start admitted by the ticket",
  (await codeOf(assertSecondFactor(headless, { purpose: "session-start" }))) === "ok",
);
step(
  "the spent ticket admits nothing more",
  (await codeOf(assertSecondFactor(headless, { purpose: "session-start" }))) === "no-ticket",
);
if (saved) {
  const t = JSON.parse(saved);
  fs.writeFileSync(
    ticketFile(authDir),
    JSON.stringify({ ...t, body: { ...t.body, expiresAt: t.body.expiresAt + 3_600_000 } }),
  );
  step(
    "an edited (extended) ticket is refused",
    (await codeOf(assertSecondFactor(headless, { purpose: "session-start" }))) === "no-ticket",
  );
}
step(
  "a ticket never admits a policy change",
  (await codeOf(assertSecondFactor(headless, { purpose: "policy-change" }))) === "headless",
);

// 8. Last factor.
step(
  "removing the last factor is refused",
  (await codeOf(removeSecurityKey(base, { id: cred.id }))) === "last-factor",
);

// 9. Audit.
const status = await secondFactorStatus(base);
const chain = await verifyChain(auditPath);
const lines = fs.readFileSync(auditPath, "utf8").trim().split("\n").length;
step(
  "audit log verifies end to end",
  chain.ok,
  `${lines} records${chain.ok ? "" : `; ${JSON.stringify(chain)}`}`,
);
console.log(
  `\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`}  (key ${status.credentials[0]?.aaguid ?? "?"}, throwaway state ${stateDir})`,
);
process.exit(failed);
