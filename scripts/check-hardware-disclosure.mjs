#!/usr/bin/env node
// Refuses a public snapshot that describes Enclaweder internals.
//
// enclawed-oss may carry what the host driver strictly needs to talk to the
// device: USB framing, signature tags, certificate layout, public root keys.
// It must not describe how the device is built: firmware source, hardware,
// provisioning tooling, how the models differ inside, or measured performance.
// That line was crossed once, in code comments, and again through a committed
// build in dist/ after the source had been fixed.
//
// So this scans every file of the snapshot (dist/ and untracked files
// included) and fails on anything that looks like hardware internals. A
// match is not always a leak: after a human has looked at the line and judged
// it fine, record it in security/hardware-disclosure-reviewed.txt and the
// check stops flagging that exact line. Edit the line and it is flagged again.
//
//   node scripts/check-hardware-disclosure.mjs [--print-reviewed] < file-list
//
// The file list (one path per line, repo-relative) is read from stdin; with
// no stdin it defaults to tracked plus untracked-but-not-ignored files.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readSync, statSync } from "node:fs";

const REVIEWED_FILE = "security/hardware-disclosure-reviewed.txt";
const MAX_BYTES = 8 * 1024 * 1024;

/** Each rule names what it protects; the message is what the operator reads. */
const RULES = [
  {
    id: "firmware-path",
    re: /\bfirmware\/[\w./-]+/i,
    why: "a path into the device firmware source",
  },
  {
    id: "provisioning-tool",
    re: /\bprovisioning\/[\w./-]*\.(?:py|hex|c|h|json|sh|toml)\b/i,
    why: "a path into the manufacturing / provisioning tooling",
  },
  {
    id: "private-tree-path",
    re: /\benclaweder\/(?:integration|firmware|hardware|provisioning|board|pcb)\b/i,
    why: "a path into the private Enclaweder tree",
  },
  {
    id: "firmware-c-source",
    re: /\b(?:proto|dispatch|anchor|attest|enroll|crypto|usb|hid|boot|ledger|gate)\.[ch]\b/i,
    why: "a reference to a device C source file",
  },
  {
    id: "silicon",
    // "Apple Silicon" is a Mac, and "asic-e" is a MIME type; neither is ours.
    re: /(?<!apple )\bsilicon\b|\b(?:microcontroller|mcu|asic(?!-)|fpga|secure element|pcb|bill of materials|stm32\w*|nrf5\d\w*|esp32\w*|rp2040|atecc\d*\w*|se05\d\w*|optiga)\b/i,
    why: "hardware architecture (chips, boards, silicon)",
  },
  {
    id: "sku-architecture",
    re: /\b(?:base|pro)\b[^.\n]{0,80}\b(?:same|different|differ)\b[^.\n]{0,40}\bfirmware\b/i,
    why: "how the SKUs differ internally",
  },
  {
    id: "device-timing",
    re: /\b\d+(?:\.\d+)?\s?ms\s?\/\s?(?:attest|attestation|sign|signature|challenge|op)\b/i,
    why: "a measured device performance figure (NDA-grade)",
  },
];

function defaultFileList() {
  const run = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 << 20 });
  return [
    ...run(["ls-files"]).split("\n"),
    ...run(["ls-files", "--others", "--exclude-standard"]).split("\n"),
  ].filter(Boolean);
}

function readStdinList() {
  if (process.stdin.isTTY) {
    return null;
  }
  // fd 0 rather than "/dev/stdin" for portability; a pipe that is not ready
  // yet throws EAGAIN, so read it in a loop instead of in one call.
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
  const text = Buffer.concat(chunks).toString("utf8");
  const list = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

/** A reviewed line is identified by its file and a hash of its trimmed text. */
function fingerprint(file, line) {
  return createHash("sha256").update(`${file}\0${line.trim()}`).digest("hex").slice(0, 16);
}

function loadReviewed() {
  const out = new Set();
  if (!existsSync(REVIEWED_FILE)) {
    return out;
  }
  for (const raw of readFileSync(REVIEWED_FILE, "utf8").split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line) {
      out.add(line.split(/\s+/)[0]);
    }
  }
  return out;
}

const files = readStdinList() ?? defaultFileList();
const reviewed = loadReviewed();
const printReviewed = process.argv.includes("--print-reviewed");
const findings = [];

for (const file of files) {
  if (file === REVIEWED_FILE || file === "scripts/check-hardware-disclosure.mjs") {
    continue; // the rules themselves, and the list of reviewed lines
  }
  let buf;
  try {
    const st = statSync(file);
    if (!st.isFile() || st.size > MAX_BYTES) {
      continue;
    }
    buf = readFileSync(file);
  } catch {
    continue; // listed but gone: nothing to publish
  }
  if (buf.subarray(0, 8000).includes(0)) {
    continue; // binary
  }
  const lines = buf.toString("utf8").split("\n");
  lines.forEach((text, i) => {
    for (const rule of RULES) {
      if (rule.re.test(text)) {
        const fp = fingerprint(file, text);
        if (!reviewed.has(fp)) {
          findings.push({ file, lineNo: i + 1, text: text.trim(), rule, fp });
        }
        break; // one finding per line is enough to make a human look
      }
    }
  });
}

if (printReviewed) {
  // For the operator who has checked every finding and judged it fine.
  for (const f of findings) {
    console.log(`${f.fp}  # ${f.file}:${f.lineNo} ${f.rule.id}`);
  }
  process.exit(0);
}

if (findings.length > 0) {
  console.error(
    `${findings.length} line(s) may describe Enclaweder internals and need a human to check them:\n`,
  );
  for (const f of findings) {
    const shown = f.text.length > 160 ? `${f.text.slice(0, 157)}...` : f.text;
    console.error(`  ${f.file}:${f.lineNo}  [${f.rule.id}: ${f.rule.why}]`);
    console.error(`      ${shown}`);
  }
  console.error(
    `\nFix each line, or, if it is fine to publish, record it as reviewed:\n` +
      `  node scripts/check-hardware-disclosure.mjs --print-reviewed >> ${REVIEWED_FILE}\n` +
      `(that appends every finding listed above; delete the lines you have not judged).`,
  );
  process.exit(1);
}
console.log(`  ok — no unreviewed hardware internals in ${files.length} files`);
