// enclawed adapter kit: a secret recognized by what a file holds, wherever
// the file is.
//
// Path rules (./credentials.ts) know the credential stores and the secret
// file names. A token can sit anywhere else: a deploy token pasted into
// config/railway-token.txt, a key in notes.txt. A read of such a file puts
// the secret into the model's context, and from there into the model
// provider's hands, so it is decided like a read of a credential store. A
// file is recognized as holding a secret when, read whole (regular files up
// to an internal bound):
//
//   - it carries a credential format the framework's DLP scanner knows, or
//     a provider key format below (fixed prefixes and lengths), or a private
//     key block; or
//   - its name says it holds a secret (token, secret, credential, password,
//     api key, auth, bearer) and its content is nothing but one to three
//     token-shaped values (with an optional NAME= in front): no prose, no
//     code.
//
// The same provider formats are removed from tool results and refused in
// outbound arguments (./credentials.ts credentialFindings).

import fs from "node:fs";
import path from "node:path";
import { credentialLike } from "./env-trust.js";

/** Provider key formats: a fixed prefix and a minimum length of key alphabet after it. */
export const PROVIDER_TOKENS: readonly Readonly<{ id: string; re: RegExp }>[] = [
  { id: "stripe-key", re: /\b[rsp]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  {
    id: "openai-or-anthropic-key",
    re: /\bsk-(?:proj-|ant-(?:api|admin)\d{2}-|live-|svcacct-)?[A-Za-z0-9_-]{32,}/g,
  },
  { id: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { id: "github-token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g },
  { id: "gitlab-token", re: /\bglpat-[A-Za-z0-9_-]{20,}/g },
  { id: "npm-token", re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: "pypi-token", re: /\bpypi-[A-Za-z0-9_-]{50,}/g },
  { id: "huggingface-token", re: /\bhf_[A-Za-z0-9]{30,}/g },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}/g },
  { id: "google-oauth-token", re: /\bya29\.[0-9A-Za-z_-]{20,}/g },
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { id: "digitalocean-token", re: /\bdo[opr]_v1_[a-f0-9]{64}\b/g },
  { id: "sendgrid-key", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g },
  { id: "shopify-token", re: /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/g },
];

/** Every provider key format in a text. */
export function providerTokenFindings(text: string): { id: string; match: string }[] {
  const out: { id: string; match: string }[] = [];
  for (const { id, re } of PROVIDER_TOKENS) {
    for (const m of text.matchAll(re)) {
      out.push({ id, match: m[0] });
    }
  }
  return out;
}

const SECRET_NAME =
  /(^|[._-])(tokens?|secrets?|credentials?|creds|passw(or)?d|pass|apikey|api[-_]?keys?|auth|bearer|pat|private[-_]?key)([._-]|$)/i;
const TOKEN_VALUE = /^[A-Za-z0-9._~+/=:-]{12,512}$/;
const PRIVATE_KEY_BLOCK = /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/;

/** Largest file read whole for this check. */
const MAX_BYTES = 64 * 1024;

/** A token-shaped value: key alphabet only, both letters and digits. */
function tokenShaped(v: string): boolean {
  return TOKEN_VALUE.test(v) && /[A-Za-z]/.test(v) && /\d/.test(v);
}

/** Is the text, as a file named `name`, a secret? Returns what kind, or null. */
export function secretInText(
  text: string,
  name: string,
  dlp: (text: string) => readonly { id: string }[],
): string | null {
  const formats = [...dlp(text), ...providerTokenFindings(text)].map((f) => f.id);
  if (formats.length) {
    return `a credential (${[...new Set(formats)].toSorted().join(", ")})`;
  }
  if (PRIVATE_KEY_BLOCK.test(text)) {
    return "a private key";
  }
  if (!SECRET_NAME.test(name)) {
    return null;
  }
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0 || lines.length > 3) {
    return null;
  }
  const values = lines.map((l) => {
    const m = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*[=:]\s*["']?(.*?)["']?$/.exec(l);
    return m ? m[1] : l;
  });
  return values.every(tokenShaped) ? "a token (by its file name and content)" : null;
}

/**
 * The secret a regular file holds, read whole, or null (not a regular file,
 * empty, larger than the bound, unreadable). `dlp`: the framework's
 * credential formats (credentials.ts credentialFindings).
 */
export function secretContentOf(
  file: string,
  dlp: (text: string) => readonly { id: string }[],
): string | null {
  let text: string;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) {
      return null;
    }
    text = fs.readFileSync(file, "latin1");
  } catch {
    return null;
  }
  return secretInText(text, path.basename(file), dlp);
}

export const SECRET_ASSIGNMENT_PLACEHOLDER = "[secret value removed by Enclawed]";

// NAME = value, NAME: value, "NAME": "value", NAME => value (INI, dotenv,
// YAML, JSON, shell, code): the value when the name is credential-shaped and
// the value token-shaped.
const ASSIGNMENT =
  /(^|[\s{,;(])(["']?)([A-Za-z_][A-Za-z0-9_.-]{1,64})\2(\s*(?:=>|=|:)\s*)(["']?)([A-Za-z0-9._~+/=:-]{12,512})\5/gm;

/**
 * Every credential-shaped assignment's value in a text replaced, whatever
 * file or program printed it (`aws_secret_access_key = ...` read through a
 * link, a token in a config dump): content, not path, decides.
 */
export function redactSecretAssignments(text: string): { text: string; removed: number } {
  let removed = 0;
  const out = text.replace(
    ASSIGNMENT,
    (
      all: string,
      lead: string,
      q: string,
      name: string,
      sep: string,
      vq: string,
      value: string,
    ) => {
      if (!credentialLike(name) || !tokenShaped(value)) {
        return all;
      }
      removed++;
      return `${lead}${q}${name}${q}${sep}${vq}${SECRET_ASSIGNMENT_PLACEHOLDER}${vq}`;
    },
  );
  return { text: out, removed };
}
