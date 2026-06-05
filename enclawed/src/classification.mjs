// Bell-LaPadula data-classification labels. Sector-neutral and FULLY
// CONFIGURABLE: the ordered ladder of levels (and their canonical / alias
// names) is data-driven via classification-scheme.mjs. The deploying
// organization picks a built-in preset (default, us-government,
// healthcare-hipaa, financial-services, generic-3-tier) or ships its own
// scheme as JSON. See enclawed/FORK.md for the full caveat list.

import {
  clearanceNameToRank,
  getActiveScheme,
  levelByRank,
  maxRank,
} from './classification-scheme.mjs';

export const TIER = Object.freeze({
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
  RESTRICTED_PLUS: 4,
  SCI: 5,
});

// Backwards-compatible US-gov alias on the same numeric ladder.
export const LEVEL = Object.freeze({
  UNCLASSIFIED: TIER.PUBLIC,
  CUI: TIER.INTERNAL,
  CONFIDENTIAL: TIER.CONFIDENTIAL,
  SECRET: TIER.RESTRICTED,
  TOP_SECRET: TIER.RESTRICTED_PLUS,
  TOP_SECRET_SCI: TIER.SCI,
});

export const TIER_NAME_GENERIC = Object.freeze({
  0: 'PUBLIC',
  1: 'INTERNAL',
  2: 'CONFIDENTIAL',
  3: 'RESTRICTED',
  4: 'RESTRICTED-PLUS',
  5: 'RESTRICTED-PLUS//SCI',
});

export const TIER_NAME_US_GOV = Object.freeze({
  0: 'UNCLASSIFIED',
  1: 'CUI',
  2: 'CONFIDENTIAL',
  3: 'SECRET',
  4: 'TOP SECRET',
  5: 'TOP SECRET//SCI',
});

// Default presentation table — flip to TIER_NAME_US_GOV in format() for
// US-government banner output.
export const LEVEL_NAME = TIER_NAME_GENERIC;

// Generic "highest-tier user" template — appropriate for the most sensitive
// person/role at a typical deploying organization (e.g. a financial-services
// fraud-investigations lead, a healthcare CISO with PHI access, an R&D
// principal investigator with embargoed-research access).
export const HIGHEST_TIER_TEMPLATE = Object.freeze({
  level: TIER.RESTRICTED_PLUS,
  compartments: ['all-categories'],
});

// US-gov-specific presets. Optional; use when actually operating against
// US-gov classification guidance.
export const DOE_Q_TEMPLATE = Object.freeze({
  level: TIER.RESTRICTED_PLUS,
  compartments: ['RD', 'FRD', 'NSI'],
  releasability: ['NOFORN'],
});

export const DOE_L_TEMPLATE = Object.freeze({
  level: TIER.RESTRICTED,
  compartments: ['RD', 'FRD'],
  releasability: ['NOFORN'],
});

// Legacy presentation tables — preserved as fallbacks for nameStyle pinning.
// Runtime format() defaults to the active scheme's canonical names.
const LEGACY_NAME_GENERIC = Object.freeze({
  0: 'PUBLIC', 1: 'INTERNAL', 2: 'CONFIDENTIAL', 3: 'RESTRICTED',
  4: 'RESTRICTED-PLUS', 5: 'RESTRICTED-PLUS//SCI',
});
const LEGACY_NAME_US_GOV = Object.freeze({
  0: 'UNCLASSIFIED', 1: 'CUI', 2: 'CONFIDENTIAL', 3: 'SECRET',
  4: 'TOP SECRET', 5: 'TOP SECRET//SCI',
});

function normalizeFrozenList(arr) {
  if (!arr) return Object.freeze([]);
  const src = arr instanceof Set ? [...arr] : arr;
  const dedup = [...new Set(src.map(String))].sort();
  return Object.freeze(dedup);
}

export function makeLabel({ level, compartments, releasability } = {}) {
  const scheme = getActiveScheme();
  const max = maxRank(scheme);
  if (!Number.isInteger(level) || level < 0 || level > max) {
    throw new TypeError(
      `invalid classification level ${level}: scheme "${scheme.id}" supports ranks 0..${max}`,
    );
  }
  return Object.freeze({
    level,
    compartments: normalizeFrozenList(compartments),
    releasability: normalizeFrozenList(releasability),
  });
}

function listHas(list, value) { return list.indexOf(value) !== -1; }
function listSize(list) { return list.length; }

export const PUBLIC = makeLabel({ level: TIER.PUBLIC });
// Backwards-compatible US-gov alias.
export const UNCLASSIFIED = PUBLIC;

// Bell-LaPadula dominance: a >= b iff a.level >= b.level AND
// b.compartments is a subset of a.compartments. Releasability caveats are
// treated as additional-restriction tags (intersection).
export function dominates(a, b) {
  if (a.level < b.level) return false;
  for (const c of b.compartments) {
    if (!listHas(a.compartments, c)) return false;
  }
  return true;
}

// Least-upper-bound: derivative classification of two inputs.
export function combine(a, b) {
  return makeLabel({
    level: Math.max(a.level, b.level),
    compartments: [...a.compartments, ...b.compartments],
    releasability: [...a.releasability, ...b.releasability],
  });
}

// Format as standard banner marking. Default uses the active scheme's
// canonical name. nameStyle:'us-gov' or 'generic' pin a fixed legacy table
// regardless of the active scheme.
export function format(label, opts = {}) {
  let head;
  if (opts.nameStyle === 'us-gov') {
    head = LEGACY_NAME_US_GOV[label.level] ?? `LEVEL_${label.level}`;
  } else if (opts.nameStyle === 'generic') {
    head = LEGACY_NAME_GENERIC[label.level] ?? `LEVEL_${label.level}`;
  } else {
    const lv = levelByRank(label.level);
    head = lv?.canonicalName ?? `LEVEL_${label.level}`;
  }
  const parts = [head];
  if (listSize(label.compartments) > 0) parts.push(label.compartments.join('/'));
  if (listSize(label.releasability) > 0) parts.push(label.releasability.join('/'));
  return parts.join('//');
}

const FALLBACK_RELEASABILITY = new Set([
  'NDA', 'EYES_ONLY', 'VENDOR_ONLY', 'INTERNAL_ONLY', 'DO_NOT_FORWARD',
  'NOFORN', 'REL TO USA', 'FVEY', 'ORCON', 'PROPIN',
]);

export function parse(s) {
  if (typeof s !== 'string') throw new TypeError('parse expects a string');
  const scheme = getActiveScheme();
  const segments = s.trim().split('//').map((x) => x.trim()).filter(Boolean);
  if (segments.length === 0) throw new Error('empty classification string');
  let head = segments[0];
  let consumed = 1;
  let level;
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
  const compartments = [];
  const releasability = [];
  for (let i = consumed; i < segments.length; i++) {
    const tokens = segments[i].split('/').map((t) => t.trim()).filter(Boolean);
    const isRel = tokens.length > 0 && tokens.every((t) => releasabilitySet.has(t.toUpperCase()));
    if (isRel) {
      tokens.forEach((t) => releasability.push(t));
    } else {
      tokens.forEach((t) => compartments.push(t));
    }
  }
  return makeLabel({ level, compartments, releasability });
}

// no-read-up: subject can only read objects it dominates.
export function canRead(subjectClearance, objectLabel) {
  return dominates(subjectClearance, objectLabel);
}

// no-write-down (strict): subject can only write at >= its own level.
export function canWrite(subjectClearance, objectLabel) {
  return dominates(objectLabel, subjectClearance);
}
