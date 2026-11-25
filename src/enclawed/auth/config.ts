// `enclawed.auth` in enclawed.json: what an administrator may tune about the
// mandatory second factor. Every knob only narrows. There is no key that
// turns the second factor off, makes UV optional, admits a platform
// authenticator, or grants a grace period: such a key would be an escape
// hatch, so none exists. Unknown keys, and values out of range, are refused
// (the gate then refuses too: a broken auth block never fails open).
//
//   unlockMinutes          default lifetime of an unlock ticket (default 10)
//   maxUnlockMinutes       the longest ticket `auth unlock --minutes` may ask
//                          for (default and hard maximum 480 = 8 hours)
//   allowedAuthenticators  [{ aaguid, description?, attestationCas: [PEM or
//                          absolute path to a PEM file, ...] }]: when present
//                          and non-empty, only these authenticator models may
//                          enroll, and their attestation certificate must be
//                          issued by one of the listed CAs

import fs from "node:fs";
import path from "node:path";
import { resolveDefaultConfigPath } from "../../infra/workspace-dir.js";
import { TICKET_DEFAULT_MINUTES, TICKET_HARD_MAX_MINUTES } from "./ticket.js";
import type { AllowedAuthenticator } from "./webauthn.js";

export type AuthConfig = {
  unlockMinutes: number;
  maxUnlockMinutes: number;
  allowedAuthenticators: AllowedAuthenticator[];
};

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

export function defaultAuthConfig(): AuthConfig {
  return {
    unlockMinutes: TICKET_DEFAULT_MINUTES,
    maxUnlockMinutes: TICKET_HARD_MAX_MINUTES,
    allowedAuthenticators: [],
  };
}

const AAGUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function minutes(v: unknown, key: string, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > max) {
    throw new AuthConfigError(`enclawed.auth.${key} must be a whole number from 1 to ${max}`);
  }
  return v;
}

function loadPem(entry: unknown, where: string): string {
  if (typeof entry !== "string" || entry.trim() === "") {
    throw new AuthConfigError(`${where} must be PEM text or an absolute path to a PEM file`);
  }
  if (entry.includes("-----BEGIN CERTIFICATE-----")) {
    return entry;
  }
  if (!path.isAbsolute(entry)) {
    throw new AuthConfigError(`${where}: ${entry} is not an absolute path`);
  }
  try {
    return fs.readFileSync(entry, "utf8");
  } catch (err) {
    throw new AuthConfigError(`${where}: cannot read ${entry}: ${String(err)}`);
  }
}

/** Parse the `enclawed.auth` block (undefined = defaults). Throws AuthConfigError. */
export function parseAuthConfig(block: unknown): AuthConfig {
  const cfg = defaultAuthConfig();
  if (block === undefined || block === null) {
    return cfg;
  }
  if (typeof block !== "object" || Array.isArray(block)) {
    throw new AuthConfigError("enclawed.auth must be an object");
  }
  const b = block as Record<string, unknown>;
  for (const key of Object.keys(b)) {
    if (!["unlockMinutes", "maxUnlockMinutes", "allowedAuthenticators"].includes(key)) {
      throw new AuthConfigError(`enclawed.auth.${key} is not a recognized setting`);
    }
  }
  if (b.maxUnlockMinutes !== undefined) {
    cfg.maxUnlockMinutes = minutes(b.maxUnlockMinutes, "maxUnlockMinutes", TICKET_HARD_MAX_MINUTES);
  }
  if (b.unlockMinutes !== undefined) {
    cfg.unlockMinutes = minutes(b.unlockMinutes, "unlockMinutes", cfg.maxUnlockMinutes);
  } else {
    cfg.unlockMinutes = Math.min(cfg.unlockMinutes, cfg.maxUnlockMinutes);
  }
  if (b.allowedAuthenticators !== undefined) {
    if (!Array.isArray(b.allowedAuthenticators)) {
      throw new AuthConfigError("enclawed.auth.allowedAuthenticators must be an array");
    }
    cfg.allowedAuthenticators = b.allowedAuthenticators.map((raw, i) => {
      const where = `enclawed.auth.allowedAuthenticators[${i}]`;
      if (!raw || typeof raw !== "object") {
        throw new AuthConfigError(`${where} must be an object`);
      }
      const e = raw as Record<string, unknown>;
      const aaguid = typeof e.aaguid === "string" ? e.aaguid.toLowerCase() : "";
      if (!AAGUID_RE.test(aaguid)) {
        throw new AuthConfigError(`${where}.aaguid must be a UUID`);
      }
      if (!Array.isArray(e.attestationCas) || e.attestationCas.length === 0) {
        throw new AuthConfigError(
          `${where}.attestationCas must list the CA certificate(s) that issue this model's attestation`,
        );
      }
      return {
        aaguid,
        description: typeof e.description === "string" ? e.description : undefined,
        attestationCas: e.attestationCas.map((c, j) => loadPem(c, `${where}.attestationCas[${j}]`)),
      };
    });
  }
  return cfg;
}

/** Read `enclawed.auth` from the resolved enclawed config file. A missing file means defaults. */
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  let doc: unknown;
  try {
    const { path: configPath } = resolveDefaultConfigPath({ env });
    let raw: string;
    try {
      raw = fs.readFileSync(configPath, "utf8");
    } catch {
      return defaultAuthConfig();
    }
    doc = JSON.parse(raw);
  } catch (err) {
    throw new AuthConfigError(`cannot read the enclawed config: ${String(err)}`);
  }
  const block =
    doc && typeof doc === "object"
      ? (doc as { enclawed?: { auth?: unknown } }).enclawed?.auth
      : undefined;
  return parseAuthConfig(block);
}
