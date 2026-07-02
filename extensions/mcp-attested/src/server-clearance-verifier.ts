// Verifies that a remote MCP server holds at least the caller's required
// clearance tier before any tool call is dispatched. The server presents a
// signed "clearance assertion" — a tiny JSON document signed by a key in
// the local enclawed trust root — over its initial handshake. The structure
// is deliberately the same shape as enclawed.module.json so server
// operators reuse the same offline signing flow.
//
// Sector-neutral: works for any setting that needs attested peer trust —
// internal-only services in a financial enterprise (clearance: "restricted"),
// PHI-handling MCP servers in healthcare (clearance: "restricted-plus"),
// embargoed-research data services in regulated R&D, classified-enclave
// servers in government work, etc.
//
// Wire protocol assumed (HTTP/JSON for clarity; in production this would
// run over a mutually-authenticated TLS channel inside the local enclave
// network):
//
//   GET <serverUrl>/.well-known/enclawed-clearance.json
//   ->  {
//         "v": 1,
//         "id":         "<server id>",
//         "publisher":  "<publisher>",
//         "version":    "<server build version>",
//         "clearance":  "restricted-plus",       // generic
//             // — or US-gov alias "q-cleared", "top-secret", etc.
//         "capabilities": ["mcp-server"],
//         "signerKeyId": "<trust-root key id>",
//         "signature":   "<base64 ed25519 signature over canonical body>"
//       }
//
// This file only implements the verification side. The transport (fetch
// the assertion) is intentionally injectable so the test suite can hand
// in a stub.

import {
  canonicalManifestBytes,
  type ClearanceLevel,
  meetsClearance,
  type ModuleManifest,
  parseManifest,
} from "../../../enclawed/ts/module-manifest.js";
import { verifyManifestSignature } from "../../../enclawed/ts/module-signing.js";
import { findSigner } from "../../../enclawed/ts/trust-root.js";

export type ClearanceVerifyResult =
  | { ok: true; clearance: ClearanceLevel; signerKeyId: string }
  | { ok: false; reason: string };

export async function verifyServerClearance(
  serverUrl: string,
  required: ClearanceLevel = "restricted-plus",
  fetcher: (
    url: string,
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> = (u) =>
    fetch(u) as unknown as ReturnType<typeof fetcher>,
): Promise<ClearanceVerifyResult> {
  // Strip trailing slash so we don't end up with double-slash URLs.
  const base = serverUrl.replace(/\/+$/, "");
  const url = `${base}/.well-known/enclawed-clearance.json`;
  let raw: unknown;
  try {
    const r = await fetcher(url);
    if (!r.ok) return { ok: false, reason: `clearance fetch HTTP ${r.status}` };
    raw = await r.json();
  } catch (e) {
    return { ok: false, reason: `clearance fetch failed: ${(e as Error).message}` };
  }
  let manifest: ModuleManifest;
  try {
    manifest = parseManifest(raw);
  } catch (e) {
    return { ok: false, reason: `clearance manifest invalid: ${(e as Error).message}` };
  }
  if (!manifest.capabilities.includes("mcp-server")) {
    return { ok: false, reason: "server clearance manifest does not declare mcp-server capability" };
  }
  if (!manifest.signerKeyId || !manifest.signature) {
    return { ok: false, reason: "server clearance manifest is unsigned" };
  }
  const signer = findSigner(manifest.signerKeyId);
  if (!signer) {
    return {
      ok: false,
      reason: `server clearance signer "${manifest.signerKeyId}" not in trust root`,
    };
  }
  // Signer freshness: a signer key past its notAfter is rejected, mirroring the
  // module loader.
  if (
    signer.notAfter &&
    Number.isFinite(Date.parse(signer.notAfter)) &&
    Date.parse(signer.notAfter) < Date.now()
  ) {
    return {
      ok: false,
      reason: `server clearance signer "${signer.keyId}" expired (${signer.notAfter})`,
    };
  }
  if (!signer.approvedClearance.includes(manifest.clearance)) {
    return {
      ok: false,
      reason: `signer "${signer.keyId}" not approved for clearance "${manifest.clearance}"`,
    };
  }
  if (
    !verifyManifestSignature(
      canonicalManifestBytes(manifest),
      manifest.signature,
      signer.publicKeyPem,
    )
  ) {
    return { ok: false, reason: "server clearance signature verification failed" };
  }
  if (!meetsClearance(manifest.clearance, required)) {
    return {
      ok: false,
      reason: `server clearance "${manifest.clearance}" below required "${required}"`,
    };
  }
  // Endpoint binding: if the signed assertion lists allowed hosts, the host we
  // connected to MUST be one of them. Defeats replay of a valid assertion from a
  // different origin.
  if (manifest.netAllowedHosts && manifest.netAllowedHosts.length > 0) {
    let host = "";
    let hostname = "";
    try {
      const u = new URL(base);
      host = u.host;
      hostname = u.hostname;
    } catch {
      return { ok: false, reason: `server clearance: cannot parse server URL "${base}"` };
    }
    const bound = manifest.netAllowedHosts.some((h) => h === host || h === hostname);
    if (!bound) {
      return {
        ok: false,
        reason: `server clearance not valid for host "${hostname}" (bound to: ${manifest.netAllowedHosts.join(", ")})`,
      };
    }
  }
  return { ok: true, clearance: manifest.clearance, signerKeyId: signer.keyId };
}
