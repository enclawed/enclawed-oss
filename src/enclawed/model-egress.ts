// Checks on requests Enclawed makes over the network, applied where the
// request is actually sent (the SSRF-guarded fetch every provider, web tool
// and media download goes through), not only on globalThis.fetch.
//
//   - Host allowlist: when the policy enforces allowlists, a host not on
//     `enclawed.policy.allowedHosts` is refused before its name is resolved,
//     so a refused request leaks nothing through DNS either.
//   - Requests the model asked for (web_fetch, web_search, media links in a
//     reply) are scanned for secrets before they go out. A URL or body that
//     carries a credential, a private key or a classification marking is
//     refused, audited and reported: the model may request communication,
//     but not with that in it.

import { logWarn } from "../logger.js";
import { scan } from "./dlp-scanner.js";
import { getRuntime } from "./runtime.js";

export class EgressPolicyError extends Error {
  override name = "EgressPolicyError";
  constructor(
    message: string,
    public readonly code: "host-not-allowed" | "secret-in-request",
  ) {
    super(message);
  }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

/** Refuse a host the policy does not allow. A no-op when allowlists are not enforced. */
export function assertHostAllowedByPolicy(url: URL): void {
  const runtime = getRuntime();
  if (!runtime || !runtime.policy.enforceAllowlists) {
    return;
  }
  const host = normalizeHost(url.hostname);
  for (const allowed of runtime.policy.allowedHosts) {
    if (normalizeHost(allowed) === host) {
      return;
    }
  }
  runtime.audit
    .append({ type: "egress.deny", actor: "process", level: null, payload: { host } })
    .catch(() => {});
  throw new EgressPolicyError(
    `egress denied: ${host} is not on enclawed.policy.allowedHosts`,
    "host-not-allowed",
  );
}

// DLP findings that must never leave in a request the model asked for:
// credentials, keys, tokens and classification markings. Personal data and
// prompt-injection shapes are left out: a search for an address or a quoted
// phrase is a normal request. So are the scanner's loose token shapes, which
// also match ordinary words ("task-management" looks like "sk-...").
const NEVER_SENT = new Set([
  "industry-classification-banner",
  "us-classification-banner",
  "us-doe-restricted-data",
  "us-sci-codeword",
  "aws-access-key-id",
  "gcp-service-account",
  "azure-storage-key",
  "github-token",
  "gitlab-token",
  "openai-key",
  "anthropic-key",
  "slack-bot-token",
  "stripe-key",
  "jwt",
  "pem-private-key",
]);

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replaceAll("+", " "));
  } catch {
    return text;
  }
}

function bodyText(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body.subarray(0, 1024 * 1024)).toString("latin1");
  }
  return "";
}

// A real OpenAI key is `sk-` then a run of base62 with no internal hyphens;
// the scanner's pattern also matches a hyphenated slug ("sk-task-manager").
// Treat an `sk-` match (but not the distinctive `sk-ant-` Anthropic one) as a
// key only when its body has no hyphen, so an ordinary slug in a URL is not a
// false positive that blocks a legitimate request.
function looksLikeRealKey(id: string, match: string): boolean {
  if (id !== "openai-key") {
    return true;
  }
  const body = match.replace(/^sk-/, "");
  return !body.includes("-");
}

/** The secret families a model-requested URL or body carries. */
export function secretsInModelRequest(url: string, body?: unknown): string[] {
  const text = `${url}\n${decoded(url)}\n${bodyText(body)}`;
  const ids = scan(text, { onOversize: "truncate" })
    .filter((f) => NEVER_SENT.has(f.id) && looksLikeRealKey(f.id, f.match))
    .map((f) => f.id);
  return [...new Set(ids)];
}

/** Refuse, audit and report a model-requested request that carries a secret. */
export function assertModelRequestCarriesNoSecrets(params: {
  url: string;
  body?: unknown;
  /** Which tool or path asked for it (web_fetch, media, ...). */
  via: string;
}): void {
  const found = secretsInModelRequest(params.url, params.body);
  if (found.length === 0) {
    return;
  }
  let host = "";
  try {
    host = new URL(params.url).hostname;
  } catch {
    /* reported without a host */
  }
  getRuntime()
    ?.audit.append({
      type: "egress.dlp.block",
      actor: params.via,
      level: null,
      payload: { host, dlp: found },
    })
    .catch(() => {});
  const message =
    `Enclawed blocked a request the model asked for (${params.via}) to ${host || "a URL"}: ` +
    `it carried ${found.join(", ")}. Nothing was sent.`;
  logWarn(message);
  throw new EgressPolicyError(message, "secret-in-request");
}
