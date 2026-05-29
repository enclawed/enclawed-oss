// Bell-LaPadula data-classification labels. Sector-neutral by default and
// FULLY CONFIGURABLE: the ordered ladder of levels (and their canonical /
// alias names) is data-driven via classification-scheme.ts. The deploying
// organization can pick a built-in preset (`enclawed-default`,
// `us-government`, `healthcare-hipaa`, `financial-services`,
// `generic-3-tier`) or ship its own scheme as JSON.
//
// See enclawed/FORK.md for the full caveat list — this is a hardening
// scaffold, not an accredited cross-domain solution.

import {
  clearanceNameToRank,
  getActiveScheme,
  levelByRank,
  maxRank,
} from "./classification-scheme.js";

// Numeric ladder used everywhere internally. Names below are presentational.
export const TIER = Object.freeze({
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
  RESTRICTED_PLUS: 4,
  SCI: 5,
} as const);

// Backwards-compatible US-government alias. Same numeric values; pick the
// vocabulary that fits the deploying organization's policy.
export const LEVEL = Object.freeze({
  UNCLASSIFIED: TIER.PUBLIC,
  CUI: TIER.INTERNAL,
  CONFIDENTIAL: TIER.CONFIDENTIAL,
  SECRET: TIER.RESTRICTED,
  TOP_SECRET: TIER.RESTRICTED_PLUS,
  TOP_SECRET_SCI: TIER.SCI,
} as const);

export type Level = (typeof TIER)[keyof typeof TIER];

// Legacy presentation tables — preserved for callers that bypass the active
// scheme (e.g. for fixed test output). The runtime `format()` consults the
// active scheme by default.
const LEGACY_NAME_GENERIC: Record<number, string> = Object.freeze({
  0: "PUBLIC",
  1: "INTERNAL",
  2: "CONFIDENTIAL",
  3: "RESTRICTED",
  4: "RESTRICTED-PLUS",
  5: "RESTRICTED-PLUS//SCI",
});

const LEGACY_NAME_US_GOV: Record<number, string> = Object.freeze({
  0: "UNCLASSIFIED",
  1: "CUI",
  2: "CONFIDENTIAL",
  3: "SECRET",
  4: "TOP SECRET",
  5: "TOP SECRET//SCI",
});

export type Label = Readonly<{
  level: Level;
  compartments: ReadonlyArray<string>;
  releasability: ReadonlyArray<string>;
}>;

// Generic "highest-tier user" template — appropriate for the most sensitive
// person/role at a typical deploying organization (e.g. a financial-services
// fraud-investigations lead, a healthcare CISO with PHI access, an R&D
// principal investigator with embargoed-research access).
export const HIGHEST_TIER_TEMPLATE: Label = makeLabel({
  level: TIER.RESTRICTED_PLUS,
  compartments: ["all-categories"],
});

// US-government-specific presets. Optional; use these when the deploying
// organization actually operates against US-gov classification guidance.
//   DOE Q clearance ≈ Top Secret + Restricted Data per Atomic Energy Act.
//   DOE L clearance ≈ Secret + Restricted Data.
export const DOE_Q_TEMPLATE: Label = makeLabel({
  level: TIER.RESTRICTED_PLUS,
  compartments: ["RD", "FRD", "NSI"],
  releasability: ["NOFORN"],
});

export const DOE_L_TEMPLATE: Label = makeLabel({
  level: TIER.RESTRICTED,
  compartments: ["RD", "FRD"],
  releasability: ["NOFORN"],
});

export const PUBLIC: Label = makeLabel({ level: TIER.PUBLIC });
// Backwards-compatible US-gov alias.
export const UNCLASSIFIED: Label = PUBLIC;

function normalizeFrozenList(arr?: Iterable<string>): ReadonlyArray<string> {
  if (!arr) return Object.freeze([]);
  const dedup = [...new Set([...arr].map(String))].sort();
  return Object.freeze(dedup);
}

export function makeLabel(input: {
  level: Level | number;
  compartments?: Iterable<string>;
  releasability?: Iterable<string>;
}): Label {
  const scheme = getActiveScheme();
  const max = maxRank(scheme);
  if (!Number.isInteger(input.level) || input.level < 0 || input.level > max) {
    throw new TypeError(
      `invalid classification level ${String(input.level)}: scheme "${scheme.id}" supports ranks 0..${max}`,
    );
  }
  return Object.freeze({
    level: input.level as Level,
    compartments: normalizeFrozenList(input.compartments),
    releasability: normalizeFrozenList(input.releasability),
  });
}

export function dominates(a: Label, b: Label): boolean {
  if (a.level < b.level) return false;
  for (const c of b.compartments) {
    if (!a.compartments.includes(c)) return false;
  }
  return true;
}

export function combine(a: Label, b: Label): Label {
  return makeLabel({
    level: Math.max(a.level, b.level) as Level,
    compartments: [...a.compartments, ...b.compartments],
    releasability: [...a.releasability, ...b.releasability],
  });
}

export type NameStyle = "generic" | "us-gov" | "active-scheme";

export function format(label: Label, opts?: { nameStyle?: NameStyle }): string {
  let head: string;
  if (opts?.nameStyle === "us-gov") {
    head = LEGACY_NAME_US_GOV[label.level] ?? `LEVEL_${label.level}`;
  } else if (opts?.nameStyle === "generic") {
    head = LEGACY_NAME_GENERIC[label.level] ?? `LEVEL_${label.level}`;
  } else {
    // Default: use the active scheme's canonical name.
    const lv = levelByRank(label.level);
    head = lv?.canonicalName ?? `LEVEL_${label.level}`;
  }
  const parts: string[] = [head];
  if (label.compartments.length > 0) parts.push(label.compartments.join("/"));
  if (label.releasability.length > 0) parts.push(label.releasability.join("/"));
  return parts.join("//");
}

// Releasability tokens recognized across sectors. The active scheme can
// also declare its own validReleasability list which takes precedence;
// this set is the fallback heuristic when the scheme does not specify one.
const FALLBACK_RELEASABILITY = new Set([
  "NDA", "EYES_ONLY", "VENDOR_ONLY", "INTERNAL_ONLY", "DO_NOT_FORWARD",
  "NOFORN", "REL TO USA", "FVEY", "ORCON", "PROPIN",
]);

export function parse(input: string): Label {
  if (typeof input !== "string") throw new TypeError("parse expects a string");
  const scheme = getActiveScheme();
  const segments = input
    .trim()
    .split("//")
    .map((x) => x.trim())
    .filter(Boolean);
  if (segments.length === 0) throw new Error("empty classification string");
  // Try to consume up to two leading segments as the head — supports
  // multi-segment heads like "TOP SECRET//SCI" that the scheme may declare
  // as a single canonical name.
  let head = segments[0] ?? "";
  let consumed = 1;
  // Prefer the longest matching head: try the two-segment combo first
  // ("TOP SECRET//SCI") so it wins over the bare "TOP SECRET" when both
  // are valid scheme names.
  let level: number | undefined;
  if (segments.length >= 2) {
    const combo = `${head}//${segments[1]}`;
    const comboLevel = clearanceNameToRank(combo, scheme);
    if (comboLevel !== undefined) {
      level = comboLevel;
      consumed = 2;
      head = combo;
    }
  }
  if (level === undefined) {
    level = clearanceNameToRank(head, scheme);
  }
  if (level === undefined) {
    throw new Error(`unrecognized classification head: "${head}" (scheme "${scheme.id}")`);
  }
  const releasabilitySet = scheme.validReleasability
    ? new Set(scheme.validReleasability.map((t) => t.toUpperCase()))
    : FALLBACK_RELEASABILITY;
  const compartments: string[] = [];
  const releasability: string[] = [];
  for (let i = consumed; i < segments.length; i++) {
    const tokens = (segments[i] ?? "")
      .split("/")
      .map((t) => t.trim())
      .filter(Boolean);
    const isRel = tokens.length > 0 && tokens.every((t) => releasabilitySet.has(t.toUpperCase()));
    if (isRel) {
      tokens.forEach((t) => releasability.push(t));
    } else {
      tokens.forEach((t) => compartments.push(t));
    }
  }
  return makeLabel({ level, compartments, releasability });
}

export function canRead(subject: Label, object: Label): boolean {
  return dominates(subject, object);
}

export function canWrite(subject: Label, object: Label): boolean {
  return dominates(object, subject);
}
