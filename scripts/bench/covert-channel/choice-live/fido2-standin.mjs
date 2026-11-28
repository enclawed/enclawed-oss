// Software stand-in for a FIDO2 security key, for the live choice-channel
// experiment only. THIS IS NOT A SECURITY KEY: its private keys are files in
// the run's throwaway HOME.
//
// The gateway and the agent CLI refuse to start a session without an enrolled
// second factor (src/enclawed/auth/gate.ts); the experiment runs unattended,
// inside iso.sh's namespace, where no authenticator is visible. This program
// plays the authenticator through the product's own, unmodified path: it
// speaks the command-line interface of libfido2's tools (`fido2-token -L/-I`,
// `fido2-cred -M`, `fido2-assert -G`), which is the transport the product uses
// for every security key (src/enclawed/auth/libfido2.ts). iso.sh installs three
// wrappers named after those tools on the namespace's PATH, after checking that
// no real libfido2 tool exists in the system directories the product searches
// first. Every decision stays the product's: `enclawed auth enroll` verifies
// the packed attestation (signature, certificate rules, non-zero AAGUID) and
// stores the public key; `enclawed auth unlock` verifies a signed assertion
// (rpIdHash, UP, UV, not backup-eligible, signature, strictly increasing
// counter) and issues the headless-start ticket the gateway and each agent run
// consume. Nothing in the product is configured, flagged or skipped.
//
// Its attestation certificate is self-issued (OU=Authenticator Attestation,
// CA:FALSE, a random AAGUID). A deployment that pins authenticator models
// (enclawed.auth.allowedAuthenticators) would refuse it; the experiment's
// throwaway config sets no allowlist, which is the product's default.
//
//   node fido2-standin.mjs token -L | token -I <dev>
//   node fido2-standin.mjs cred -M -v <dev> <alg>          (stdin: libfido2 cred input)
//   node fido2-standin.mjs assert -G [-t opt=bool ...] <dev> (stdin: libfido2 assert input)
import { execFileSync } from "node:child_process";
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const STANDIN_DEVICE = "standin://choice-live-software-authenticator";
const HOME = os.homedir();

// Refuse to run anywhere but a throwaway HOME (iso.sh's sandbox under TMPDIR).
function stateDir() {
  const realHome = process.env.TRIPWIRE_REAL_HOME;
  if (!realHome || path.resolve(HOME) === path.resolve(realHome)) {
    throw new Error("fido2-standin runs only inside iso.sh's sandbox HOME");
  }
  const dir = path.join(HOME, ".fido2-standin");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

const stateFile = () => path.join(stateDir(), "state.json");

function loadState() {
  const file = stateFile();
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  // First use: an attestation key and a self-issued attestation certificate.
  const dir = stateDir();
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const keyPem = privateKey.export({ format: "pem", type: "pkcs8" });
  const keyFile = path.join(dir, "attestation-key.pem");
  fs.writeFileSync(keyFile, keyPem, { mode: 0o600 });
  const der = execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-new",
      "-key",
      keyFile,
      "-sha256",
      "-days",
      "60",
      "-subj",
      "/C=US/O=Enclawed choice-live bench/OU=Authenticator Attestation/CN=software stand-in authenticator (not a security key)",
      "-addext",
      "basicConstraints=critical,CA:FALSE",
      "-outform",
      "DER",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const state = {
    aaguid: randomUUID().replaceAll("-", ""),
    attestationKeyPem: keyPem,
    attestationCertB64: Buffer.from(der).toString("base64"),
    credentials: {},
  };
  saveState(state);
  return state;
}

function saveState(state) {
  const tmp = `${stateFile()}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, stateFile());
}

/** CBOR byte string (major type 2), as libfido2 prints authenticator data. */
function cborBytes(buf) {
  const n = buf.length;
  const head =
    n < 24
      ? Buffer.from([0x40 | n])
      : n < 256
        ? Buffer.from([0x58, n])
        : Buffer.from([0x59, n >> 8, n & 0xff]);
  return Buffer.concat([head, buf]);
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

/** COSE_Key for an ES256 public key: {1: 2, 3: -7, -1: 1, -2: x, -3: y}. */
function coseEs256(publicKey) {
  const jwk = publicKey.export({ format: "jwk" });
  return Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(jwk.y, "base64url"),
  ]);
}

const rpIdHash = (rpId) => createHash("sha256").update(rpId).digest();
const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

function readInput() {
  return fs.readFileSync(0, "utf8").split(/\r?\n/);
}

function token(args) {
  if (args[0] === "-L") {
    process.stdout.write(
      `${STANDIN_DEVICE}: vendor=0x0000, product=0x0000 (software stand-in authenticator, choice-live bench)\n`,
    );
    return 0;
  }
  if (args[0] === "-I" && args[1] === STANDIN_DEVICE) {
    const { aaguid } = loadState();
    process.stdout.write(
      [
        "proto: 0x02",
        "major: 0x01",
        "minor: 0x00",
        "build: 0x00",
        "caps: 0x04 (wink, cbor, msg)",
        "version strings: FIDO_2_0, FIDO_2_1",
        "extension strings: ",
        `aaguid: ${aaguid}`,
        "options: rk, up, uv, noplat, noclientPin",
        "algorithms: es256 (public-key)",
        "",
      ].join("\n"),
    );
    return 0;
  }
  return 1;
}

function cred(args) {
  // fido2-cred -M -v <dev> <alg>
  if (args[0] !== "-M" || args.at(-2) !== STANDIN_DEVICE || args.at(-1) !== "es256") {
    return 1;
  }
  const [cdhB64, rpId] = readInput();
  const cdh = Buffer.from(cdhB64.trim(), "base64");
  const state = loadState();
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const credentialId = randomBytes(32);
  const authData = Buffer.concat([
    rpIdHash(rpId.trim()),
    Buffer.from([FLAG_UP | FLAG_UV | FLAG_AT]),
    u32(0),
    Buffer.from(state.aaguid, "hex"),
    Buffer.from([credentialId.length >> 8, credentialId.length & 0xff]),
    credentialId,
    coseEs256(publicKey),
  ]);
  const attSig = sign("sha256", Buffer.concat([authData, cdh]), {
    key: createPrivateKey(state.attestationKeyPem),
    dsaEncoding: "der",
  });
  state.credentials[credentialId.toString("base64")] = {
    rpId: rpId.trim(),
    keyPem: privateKey.export({ format: "pem", type: "pkcs8" }),
    signCount: 0,
  };
  saveState(state);
  process.stdout.write(
    [
      cdh.toString("base64"),
      rpId.trim(),
      "packed",
      cborBytes(authData).toString("base64"),
      credentialId.toString("base64"),
      attSig.toString("base64"),
      state.attestationCertB64,
      "",
    ].join("\n"),
  );
  return 0;
}

function assertion(args) {
  // fido2-assert -G [-t up=..] [-t uv=..] <dev>
  if (args[0] !== "-G" || args.at(-1) !== STANDIN_DEVICE) {
    return 1;
  }
  const opts = new Map();
  for (let i = 1; i < args.length - 1; i++) {
    if (args[i] === "-t") {
      const [k, v] = String(args[++i]).split("=");
      opts.set(k, v === "true");
    }
  }
  const [cdhB64, rpIdLine, credB64] = readInput();
  const rpId = rpIdLine.trim();
  const state = loadState();
  const credKey = Buffer.from(credB64.trim(), "base64").toString("base64");
  const c = state.credentials[credKey];
  if (!c || c.rpId !== rpId) {
    return 1; // not this authenticator's credential
  }
  const up = opts.get("up") !== false;
  const uv = opts.get("uv") === true || opts.get("pin") === true;
  // Every assertion, a probe (up=false) included, advances the counter.
  c.signCount += 1;
  saveState(state);
  const cdh = Buffer.from(cdhB64.trim(), "base64");
  const authData = Buffer.concat([
    rpIdHash(rpId),
    Buffer.from([(up ? FLAG_UP : 0) | (uv ? FLAG_UV : 0)]),
    u32(c.signCount),
  ]);
  const sig = sign("sha256", Buffer.concat([authData, cdh]), {
    key: createPrivateKey(c.keyPem),
    dsaEncoding: "der",
  });
  process.stdout.write(
    [
      cdh.toString("base64"),
      rpId,
      cborBytes(authData).toString("base64"),
      sig.toString("base64"),
      "",
    ].join("\n"),
  );
  return 0;
}

const [tool, ...rest] = process.argv.slice(2);
const handlers = { token, cred, assert: assertion };
const handler = handlers[tool];
if (!handler) {
  process.stderr.write(`fido2-standin: unknown tool ${tool}\n`);
  process.exit(2);
}
process.exitCode = handler(rest);
