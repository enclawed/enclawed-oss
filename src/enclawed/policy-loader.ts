// JSON-driven loader for the `enclawed.policy.*` config block.
//
// This produces the same Policy object that createPolicy() returns, but
// sourced from a JSON document on disk (typically `~/.enclawed/enclawed.json`).
// Schema:
//
//   {
//     "enclawed": {
//       "policy": {
//         "enforceAllowlists": true,
//         "allowedHosts":     ["gmail.googleapis.com", "127.0.0.1"],
//         "allowedChannels":  ["mcp.workspace"],
//         "allowedProviders": ["local-model"],
//         "allowedTools":     [],
//         "maxOutputClearance": "UNCLASSIFIED" | { "level": 0, "compartments": [] },
//         "defaultDataLabel":   "UNCLASSIFIED" | { "level": 0, "compartments": [], "releasability": [] }
//       }
//     }
//   }
//
// `maxOutputClearance` / `defaultDataLabel` accept either:
//   * a string the active classification scheme parses (e.g. "UNCLASSIFIED",
//     "TOP SECRET//SCI"), or
//   * an object with `{ level: number, compartments?: string[], releasability?: string[] }`.
//
// The loader is forgiving on absence: missing keys fall through to the
// supplied default. Unknown top-level keys are ignored (forward-compat).

import { parse as parseClassification, makeLabel, type Label } from "./classification.js";
import { createPolicy, type Policy } from "./policy.js";

export type EnclawedPolicyJson = {
  enforceAllowlists?: boolean;
  allowedHosts?: string[];
  allowedChannels?: string[];
  allowedProviders?: string[];
  allowedTools?: string[];
  maxOutputClearance?: string | LabelJson;
  defaultDataLabel?: string | LabelJson;
};

export type LabelJson = {
  level: number;
  compartments?: string[];
  releasability?: string[];
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function parseLabel(input: unknown, fieldName: string): Label {
  if (typeof input === "string") {
    return parseClassification(input);
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.level !== "number") {
      throw new TypeError(`${fieldName}.level must be a number`);
    }
    const compartments = obj.compartments;
    if (compartments !== undefined && !isStringArray(compartments)) {
      throw new TypeError(`${fieldName}.compartments must be a string array`);
    }
    const releasability = obj.releasability;
    if (releasability !== undefined && !isStringArray(releasability)) {
      throw new TypeError(`${fieldName}.releasability must be a string array`);
    }
    return makeLabel({
      level: obj.level,
      compartments: compartments as string[] | undefined,
      releasability: releasability as string[] | undefined,
    });
  }
  throw new TypeError(`${fieldName} must be a classification string or label object`);
}

export function parsePolicyJson(
  raw: unknown,
  defaults: {
    maxOutputClearance: Label;
    defaultDataLabel: Label;
    enforceAllowlists?: boolean;
  },
): Policy {
  if (raw === undefined || raw === null) {
    return createPolicy({
      enforceAllowlists: defaults.enforceAllowlists ?? true,
      maxOutputClearance: defaults.maxOutputClearance,
      defaultDataLabel: defaults.defaultDataLabel,
    });
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("enclawed.policy must be an object");
  }
  const cfg = raw as EnclawedPolicyJson;

  for (const key of ["allowedHosts", "allowedChannels", "allowedProviders", "allowedTools"] as const) {
    const value = cfg[key];
    if (value !== undefined && !isStringArray(value)) {
      throw new TypeError(`enclawed.policy.${key} must be a string array`);
    }
  }
  if (cfg.enforceAllowlists !== undefined && typeof cfg.enforceAllowlists !== "boolean") {
    throw new TypeError("enclawed.policy.enforceAllowlists must be a boolean");
  }

  const maxOutputClearance =
    cfg.maxOutputClearance !== undefined
      ? parseLabel(cfg.maxOutputClearance, "enclawed.policy.maxOutputClearance")
      : defaults.maxOutputClearance;
  const defaultDataLabel =
    cfg.defaultDataLabel !== undefined
      ? parseLabel(cfg.defaultDataLabel, "enclawed.policy.defaultDataLabel")
      : defaults.defaultDataLabel;

  return createPolicy({
    enforceAllowlists: cfg.enforceAllowlists ?? defaults.enforceAllowlists ?? true,
    allowedChannels: cfg.allowedChannels,
    allowedProviders: cfg.allowedProviders,
    allowedTools: cfg.allowedTools,
    allowedHosts: cfg.allowedHosts,
    maxOutputClearance,
    defaultDataLabel,
  });
}

export function extractPolicyBlock(rawDocument: unknown): unknown {
  if (!rawDocument || typeof rawDocument !== "object" || Array.isArray(rawDocument)) {
    return undefined;
  }
  const top = rawDocument as Record<string, unknown>;
  const enclawed = top.enclawed;
  if (!enclawed || typeof enclawed !== "object" || Array.isArray(enclawed)) {
    return undefined;
  }
  const inner = (enclawed as Record<string, unknown>).policy;
  return inner;
}

export function loadPolicyFromJson(
  rawDocument: unknown,
  defaults: {
    maxOutputClearance: Label;
    defaultDataLabel: Label;
    enforceAllowlists?: boolean;
  },
): Policy {
  const block = extractPolicyBlock(rawDocument);
  return parsePolicyJson(block, defaults);
}
