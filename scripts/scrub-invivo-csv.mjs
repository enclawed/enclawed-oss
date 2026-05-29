#!/usr/bin/env node
// Scrub the content column of in-vivo CSVs (template-path + cross-LLM)
// of any DLP-detectable shape. Two passes:
//
//   1. Production dlpRedact (from enclawed/src/dlp-scanner.mjs) at
//      minSeverity='low' — same call the harness's streamCsvWrite uses.
//   2. Publish-aggressive supplementary pass: catches shorter / sloppier
//      secret-shaped tokens that the production gate (rightly) does not
//      fire on for legit traffic but that we must not ship in published
//      artifacts (e.g., LLM-fabricated fake keys with 5-19 char tails,
//      repeated-character "sk--------" placeholders, AWS-shaped tokens
//      whose trailing-alnum context broke the production regex's word
//      boundary).
//
// Usage:
//   node scripts/scrub-invivo-csv.mjs [paths...]
//
// If no paths are given, defaults to scrubbing
//   docs/adversarial-in-vivo-samples.csv  +  docs/cross-llm/*.csv*
// in place. .gz files are decompressed, scrubbed, and re-gzipped.
//
// Reports per file: rows scanned, rows whose content column was rewritten,
// total characters redacted. Exits non-zero on any error.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { redact as dlpRedact } from '../enclawed/src/dlp-scanner.mjs';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SELF_DIR, '..');

// Publish-aggressive supplementary patterns. Deliberately a SUPERSET of the
// production gate's strict catalog so the published artifact is safe to share
// with secret-scanning pipelines (gh secret-scanning, gitleaks, trufflehog).
// Each pattern is replaced with [REDACTED].
//
// We deliberately omit the leading \b on every pattern: LLM output frequently
// glues a secret-shaped token to a preceding word character (\nsk-..., _AKIA...,
// ID:ghp_...). \b would skip those; the over-redaction risk on legit text is
// acceptable for the publish-safety use case (this scrubber runs on artifact
// CSVs only, never on the production gate's hot path).
const PUBLISH_PATTERNS = [
  // Short / fake / placeholder OpenAI / Anthropic key shapes (sk-XXX, sk-ant-...).
  /sk-(?:ant-)?[A-Za-z0-9_-]{3,}/gi,
  // Any AKIA/ASIA-prefixed run (catches LLM-hallucinated AWS keys at any
  // length; production regex requires 16+).
  /(?:AKIA|ASIA)[A-Z0-9]{1,}/g,
  // Slack-token shapes at any length >=3.
  /xox[abprs]-[A-Za-z0-9-]{3,}/g,
  // GitHub PAT shapes at any length >=3.
  /gh[pousr]_[A-Za-z0-9]{3,}/g,
  // GitLab PAT shapes at any length >=3.
  /glpat-[A-Za-z0-9_-]{3,}/g,
  // Stripe-key shapes (sk_test, pk_live, rk_test, etc.) at any length >=3.
  /(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]{3,}/g,
  // JWT-prefixed shapes at any length (catches partial / truncated tokens).
  /eyJ[A-Za-z0-9._-]{8,}/g,
  // PEM headers of any kind.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
];

function publishScrub(text) {
  if (typeof text !== 'string' || text.length === 0) return text;
  let out = text;
  for (const re of PUBLISH_PATTERNS) {
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}

function scrubContent(content) {
  // Pass 1: production DLP at minSeverity='low' (matches the harness's
  // own streamCsvWrite path so future runs and historical runs converge).
  let out = dlpRedact(content, { minSeverity: 'low' });
  // Pass 2: publish-aggressive supplementary patterns.
  out = publishScrub(out);
  return out;
}

// Minimal RFC-4180 CSV parser sufficient for our shape. Each cell is either
// unquoted (no comma, no quote, no newline) or quoted with embedded quotes
// doubled. Newlines within quoted cells are preserved.
function* parseCsvRows(text) {
  let i = 0;
  const n = text.length;
  let row = [];
  let cell = '';
  let inQuoted = false;
  while (i < n) {
    const c = text[i];
    if (inQuoted) {
      if (c === '"') {
        if (i + 1 < n && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuoted = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"') { inQuoted = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; i++; continue; }
    if (c === '\n') {
      row.push(cell);
      yield row;
      row = []; cell = ''; i++; continue;
    }
    if (c === '\r') { i++; continue; }   // strip \r in CRLF
    cell += c; i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    yield row;
  }
}

function csvEsc(s) {
  if (s == null) return '""';
  const str = String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// Re-emit a row preserving the harness's quoting rules: oss_block_reason,
// enc_block_reason, and content always carry quotes; other columns are bare.
// We mirror that to keep diffs against fresh harness runs minimal.
function emitRow(row) {
  // header columns:
  //   channel,fCat,label,oc_delivered,oss_delivered,enc_delivered,
  //   oss_block_reason,enc_block_reason,content
  const [chan, fcat, label, oc, oss, enc, ossBR, encBR, content] = row;
  return [
    chan, fcat, label, oc, oss, enc,
    csvEsc(ossBR), csvEsc(encBR), csvEsc(content),
  ].join(',');
}

function scrubCsvText(text) {
  let out = '';
  let rowsScanned = 0;
  let rowsChanged = 0;
  let charsBefore = 0;
  let charsAfter = 0;
  let isHeader = true;
  for (const row of parseCsvRows(text)) {
    rowsScanned++;
    if (isHeader) {
      isHeader = false;
      out += row.join(',') + '\n';
      continue;
    }
    if (row.length < 9) {
      // Tolerate truncated final row (e.g., from an interrupted writer).
      out += row.join(',') + '\n';
      continue;
    }
    const before = row[8];
    const after  = scrubContent(before);
    if (before !== after) {
      rowsChanged++;
      charsBefore += before.length;
      charsAfter  += after.length;
      row[8] = after;
    }
    out += emitRow(row) + '\n';
  }
  return { out, rowsScanned, rowsChanged, charsBefore, charsAfter };
}

function decompressGz(p) {
  // Always go through system `gunzip -c`: it handles (a) concatenated gzip
  // streams (some cross-LLM CSVs are appended in multiple writer sessions
  // and Node's gunzipSync stops at the first member), (b) trailing garbage
  // / truncated tails (the streaming writer occasionally did not flush
  // cleanly; gunzip emits what it can recover and exits non-zero).
  const r = spawnSync('gunzip', ['-c', p], { encoding: 'buffer' });
  if (r.error) throw r.error;
  if (r.stdout.length === 0 && r.status !== 0) {
    throw new Error(`gunzip "${p}" exit=${r.status}: ${r.stderr.toString('utf8').trim()}`);
  }
  if (r.status !== 0) {
    process.stderr.write(`  ${path.basename(p)}: gunzip recovered ${r.stdout.length} bytes ` +
      `(exit=${r.status}: ${r.stderr.toString('utf8').trim()})\n`);
  }
  return r.stdout.toString('utf8');
}

function scrubFile(p) {
  const isGz = p.endsWith('.gz');
  let text;
  try {
    text = isGz ? decompressGz(p) : readFileSync(p, 'utf8');
  } catch (e) {
    process.stderr.write(`error reading ${p}: ${e.message}\n`);
    return null;
  }
  const result = scrubCsvText(text);
  // Write back.
  let outBuf;
  if (isGz) {
    outBuf = gzipSync(Buffer.from(result.out, 'utf8'), { level: 6 });
  } else {
    outBuf = Buffer.from(result.out, 'utf8');
  }
  writeFileSync(p, outBuf);
  return result;
}

function expandDefaults() {
  const tplPath = path.join(REPO_ROOT, 'docs', 'adversarial-in-vivo-samples.csv');
  const xllmDir = path.join(REPO_ROOT, 'docs', 'cross-llm');
  const out = [];
  if (existsSync(tplPath)) out.push(tplPath);
  if (existsSync(xllmDir) && statSync(xllmDir).isDirectory()) {
    for (const f of readdirSync(xllmDir).sort()) {
      if (/^adversarial-in-vivo-samples-.+\.csv(\.gz)?$/.test(f)) {
        out.push(path.join(xllmDir, f));
      }
    }
  }
  return out;
}

const args = process.argv.slice(2);
const targets = args.length > 0 ? args : expandDefaults();
if (targets.length === 0) {
  console.error('no CSV files found to scrub');
  process.exit(1);
}

let totalRows = 0, totalChanged = 0, anyError = false;
for (const p of targets) {
  process.stderr.write(`scrubbing ${path.relative(REPO_ROOT, p)} ...\n`);
  const r = scrubFile(p);
  if (!r) { anyError = true; continue; }
  totalRows += r.rowsScanned;
  totalChanged += r.rowsChanged;
  process.stderr.write(
    `  rows=${r.rowsScanned}, content rewritten=${r.rowsChanged}, ` +
    `chars: ${r.charsBefore}->${r.charsAfter}\n`
  );
}
process.stderr.write(`\nDone. ${totalRows} rows scanned, ${totalChanged} content cells rewritten across ${targets.length} files.\n`);
process.exit(anyError ? 1 : 0);
