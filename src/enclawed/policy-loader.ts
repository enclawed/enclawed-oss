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
//         "commandNetwork":   "none" | "host",
//         "preApprovedIrreversibleTools": [],
//         "scratchPaths":     ["/srv/agent-scratch"],
//         "history": {
//           "maxFileBytes":   16777216,
//           "maxTotalBytes":  1073741824,
//           "maxAgeDays":     30,
//           "noHistoryPaths": ["/data/datasets/**"],
//           "noHistoryTools": []
//         },
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
// `preApprovedIrreversibleTools` lists canonical agent tool ids (for example
// "message", "exec") that the enclaved flavor runs without asking a person.
// Ids are trimmed and lowercased; empty ids and the "*" wildcard are refused,
// so pre-approval is always a deliberate, per-tool choice.
//
// `scratchPaths` are absolute directories where agent writes need no history
// (history is irrelevant there). `history` sets the write-history caps and
// the opt-outs: writes to `noHistoryPaths` (absolute paths or `*`/`**`
// globs) or by `noHistoryTools` keep no history and so become irreversible.
// Entries covering the filesystem root or a whole home directory are refused.
//
// The loader is forgiving on absence: missing keys fall through to the
// supplied default. Unknown top-level keys are ignored (forward-compat).

import { parse as parseClassification, makeLabel, type Label } from "./classification.js";
import { validateOperatorPathEntry } from "./history-paths.js";
import {
  type CommandNetwork,
  createPolicy,
  HISTORY_MAX_AGE_DAYS,
  HISTORY_MIN_AGE_DAYS,
  type Policy,
} from "./policy.js";

export type EnclawedPolicyJson = {
  enforceAllowlists?: boolean;
  allowedHosts?: string[];
  allowedChannels?: string[];
  allowedProviders?: string[];
  allowedTools?: string[];
  commandNetwork?: CommandNetwork;
  preApprovedIrreversibleTools?: string[];
  scratchPaths?: string[];
  history?: HistoryPolicyJson;
  maxOutputClearance?: string | LabelJson;
  defaultDataLabel?: string | LabelJson;
};

export type HistoryPolicyJson = {
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxAgeDays?: number;
  noHistoryPaths?: string[];
  noHistoryTools?: string[];
};

const HISTORY_KEYS = new Set([
  "maxFileBytes",
  "maxTotalBytes",
  "maxAgeDays",
  "noHistoryPaths",
  "noHistoryTools",
]);

function normalizeToolIds(ids: string[] | undefined, field: string): string[] | undefined {
  const out = ids?.map((id) => id.trim().toLowerCase());
  for (const id of out ?? []) {
    if (id.length === 0 || id === "*") {
      throw new TypeError(`${field} entries must be tool ids (no empty ids or "*")`);
    }
  }
  return out;
}

// Tool ids and host names compare lowercased everywhere they are checked
// (tool ids by the gate, hosts by the egress guard), so the allowlists are
// normalized the same way preApprovedIrreversibleTools is: a policy that says
// "Read" or "Docs.Example.com" must match, not silently allow nothing.
function normalizeList(values: string[] | undefined): string[] | undefined {
  return values?.map((v) => v.trim().toLowerCase());
}

function parseHistoryJson(raw: unknown): HistoryPolicyJson | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("enclawed.policy.history must be an object");
  }
  const cfg = raw as Record<string, unknown>;
  for (const key of Object.keys(cfg)) {
    if (!HISTORY_KEYS.has(key)) {
      throw new TypeError(`enclawed.policy.history.${key} is not a known setting`);
    }
  }
  for (const key of ["maxFileBytes", "maxTotalBytes"] as const) {
    const v = cfg[key];
    if (v !== undefined && !(typeof v === "number" && Number.isSafeInteger(v) && v > 0)) {
      throw new TypeError(`enclawed.policy.history.${key} must be a positive integer`);
    }
  }
  // Bounded (settings audit #1): a tiny age pruned restore points within one
  // prune interval, so a write admitted as reversible became unrecoverable.
  const age = cfg.maxAgeDays;
  if (
    age !== undefined &&
    !(
      typeof age === "number" &&
      Number.isFinite(age) &&
      age >= HISTORY_MIN_AGE_DAYS &&
      age <= HISTORY_MAX_AGE_DAYS
    )
  ) {
    throw new TypeError(
      `enclawed.policy.history.maxAgeDays must be a number from ${HISTORY_MIN_AGE_DAYS} to ${HISTORY_MAX_AGE_DAYS}`,
    );
  }
  for (const key of ["noHistoryPaths", "noHistoryTools"] as const) {
    if (cfg[key] !== undefined && !isStringArray(cfg[key])) {
      throw new TypeError(`enclawed.policy.history.${key} must be a string array`);
    }
  }
  return {
    maxFileBytes: cfg.maxFileBytes as number | undefined,
    maxTotalBytes: cfg.maxTotalBytes as number | undefined,
    maxAgeDays: age,
    noHistoryPaths: (cfg.noHistoryPaths as string[] | undefined)?.map((p) =>
      validateOperatorPathEntry(p, "enclawed.policy.history.noHistoryPaths", { allowGlob: true }),
    ),
    noHistoryTools: normalizeToolIds(
      cfg.noHistoryTools as string[] | undefined,
      "enclawed.policy.history.noHistoryTools",
    ),
  };
}

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
      compartments: compartments,
      releasability: releasability,
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

  for (const key of [
    "allowedHosts",
    "allowedChannels",
    "allowedProviders",
    "allowedTools",
    "preApprovedIrreversibleTools",
    "scratchPaths",
  ] as const) {
    const value = cfg[key];
    if (value !== undefined && !isStringArray(value)) {
      throw new TypeError(`enclawed.policy.${key} must be a string array`);
    }
  }
  if (cfg.enforceAllowlists !== undefined && typeof cfg.enforceAllowlists !== "boolean") {
    throw new TypeError("enclawed.policy.enforceAllowlists must be a boolean");
  }
  if (
    cfg.commandNetwork !== undefined &&
    cfg.commandNetwork !== "none" &&
    cfg.commandNetwork !== "host"
  ) {
    throw new TypeError('enclawed.policy.commandNetwork must be "none" or "host"');
  }

  const preApprovedIrreversibleTools = normalizeToolIds(
    cfg.preApprovedIrreversibleTools,
    "enclawed.policy.preApprovedIrreversibleTools",
  );
  const scratchPaths = cfg.scratchPaths?.map((p) =>
    validateOperatorPathEntry(p, "enclawed.policy.scratchPaths", { allowGlob: false }),
  );
  const history = parseHistoryJson(cfg.history);

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
    allowedTools: normalizeList(cfg.allowedTools),
    allowedHosts: normalizeList(cfg.allowedHosts),
    commandNetwork: cfg.commandNetwork,
    preApprovedIrreversibleTools,
    scratchPaths,
    history,
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
