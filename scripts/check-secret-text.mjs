#!/usr/bin/env node
// Refuses a public snapshot that carries secret-shaped text, in ANY tracked
// text file (code, docs, fixtures, data), not only the in-vivo corpora that
// scripts/scrub-invivo-csv.mjs cleans. Fails closed: a file that cannot be
// read is a finding.
//
// Patterns match credentials at their real shape and length (an Anthropic or
// OpenAI key, a GitHub token, an AWS access key id, a Slack or Stripe live
// token, a Google API key, a PEM private key with a real body), so short test
// stand-ins such as "sk-ant-oat01-test-token" are not findings. A line that
// says it is fake (fake, dummy, placeholder, example, test-only, AKIAIOSFODNN7EXAMPLE,
// an all-A body, a ten-character ascending run such as 0123456789) is not a finding
// either. Anything else a human has judged
// fake is recorded in security/secret-scan-reviewed.txt by fingerprint (path
// + line text), like security/hardware-disclosure-reviewed.txt.
//
//   git ls-files | node scripts/check-secret-text.mjs [--print-reviewed]
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readSync, statSync } from "node:fs";

const REVIEWED_FILE = "security/secret-scan-reviewed.txt";
const MAX_BYTES = 8 * 1024 * 1024;

const RULES = [
  { id: "anthropic-key", re: /\bsk-ant-[a-z]{2,4}\d{2}-[A-Za-z0-9_-]{80,}/ },
  {
    id: "openai-key",
    re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}/,
  },
  { id: "openai-key", re: /\bsk-proj-[A-Za-z0-9_-]{100,}/ },
  { id: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/ },
  { id: "github-pat", re: /\bgithub_pat_[A-Za-z0-9_]{80,}/ },
  { id: "aws-access-key-id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: "slack-token", re: /\bxox[baprs]-\d{8,}-\d{8,}-[A-Za-z0-9-]{20,}/ },
  { id: "stripe-live-key", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{24,}/ },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/ },
];
// A PEM header is a finding only with a real key body after it (a line of
// base64 at least this long within the next few lines).
const PEM_BODY = /^[A-Za-z0-9+/=]{60,}$/;
// A ten-character ascending run (0123456789, abcdefghij) never occurs in a real
// random token; the tests' stand-ins are made of them.
const FAKE =
  /fake|dummy|placeholder|example|test-only|not-a-real|redacted|AKIAIOSFODNN7EXAMPLE|AAAAAAAAAAAAAAAA|x{16,}|\.\.\.|0123456789|1234567890|abcdefghij/i;

function readStdinList() {
  const chunks = [];
  const buf = Buffer.alloc(1 << 16);
  for (;;) {
    let n;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch (err) {
      if (err.code === "EAGAIN") {
        continue;
      }
      if (err.code === "EOF") {
        break;
      }
      throw err;
    }
    if (n === 0) {
      break;
    }
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks)
    .toString("utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const fingerprint = (file, line) =>
  createHash("sha256").update(`${file}\0${line.trim()}`).digest("hex").slice(0, 16);

function loadReviewed() {
  const out = new Set();
  if (existsSync(REVIEWED_FILE)) {
    for (const raw of readFileSync(REVIEWED_FILE, "utf8").split("\n")) {
      const line = raw.replace(/#.*$/, "").trim();
      if (line) {
        out.add(line.split(/\s+/)[0]);
      }
    }
  }
  return out;
}

const printReviewed = process.argv.includes("--print-reviewed");
const reviewed = loadReviewed();
const findings = [];
const unreadable = [];
let scanned = 0;
for (const file of readStdinList()) {
  let st;
  try {
    st = statSync(file);
  } catch {
    continue; // listed but not on disk (a deleted path in the index): nothing to publish
  }
  if (!st.isFile()) {
    continue;
  }
  let buf;
  try {
    buf = readFileSync(file);
  } catch (err) {
    unreadable.push(`${file}: ${err.code ?? err.message}`);
    continue;
  }
  if (buf.length > MAX_BYTES || buf.subarray(0, 8000).includes(0)) {
    continue; // binary or very large generated data; the CSV corpora have their own scrubber
  }
  scanned++;
  const lines = buf.toString("utf8").split("\n");
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (!rule.re.test(line) || FAKE.test(line)) {
        continue;
      }
      if (rule.id === "private-key") {
        const body = lines.slice(i + 1, i + 4).map((l) => l.trim().replace(/\\n.*$/, ""));
        const inline = line.split(/\\n/).slice(1, 3);
        if (![...body, ...inline].some((l) => PEM_BODY.test(l.trim()))) {
          continue;
        }
      }
      if (!reviewed.has(fingerprint(file, line))) {
        findings.push({ file, n: i + 1, id: rule.id, line });
      }
      break;
    }
  });
}

if (printReviewed) {
  for (const f of findings) {
    console.log(`${fingerprint(f.file, f.line)}  # ${f.file}:${f.n} ${f.id}`);
  }
  process.exit(0);
}
if (unreadable.length > 0 || findings.length > 0) {
  for (const u of unreadable) {
    console.error(`unreadable: ${u}`);
  }
  console.error(`${findings.length} line(s) carry secret-shaped text:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.n}  [${f.id}]\n      ${f.line.trim().slice(0, 160)}`);
  }
  console.error(
    `\nRemove the secret (and rotate it), or, if it is a fake a human has checked, record it:\n` +
      `  git ls-files | node scripts/check-secret-text.mjs --print-reviewed >> ${REVIEWED_FILE}\n` +
      `(that appends every finding listed above; delete the lines you have not judged).`,
  );
  process.exit(1);
}
console.log(`  ok — no secret-shaped text in ${scanned} text files`);
