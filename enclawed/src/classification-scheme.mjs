// .mjs twin of src/enclawed/classification-scheme.ts. Standalone canonical
// reference for the node:test suite under enclawed/test/.
// See the .ts file for the schema and rationale.

function normalizeName(s) { return String(s).trim().toUpperCase(); }

function makeLevel(rank, canonicalName, aliases = []) {
  return Object.freeze({ rank, canonicalName, aliases: Object.freeze(aliases.slice()) });
}

function freezeScheme(s) {
  return Object.freeze({
    id: s.id,
    description: s.description,
    levels: Object.freeze(s.levels.slice().sort((a, b) => a.rank - b.rank)),
    validCompartments: s.validCompartments ? Object.freeze(s.validCompartments.slice()) : undefined,
    validReleasability: s.validReleasability ? Object.freeze(s.validReleasability.slice()) : undefined,
  });
}

export const DEFAULT_SCHEME = freezeScheme({
  id: 'enclawed-default',
  description: 'Default merged scheme: generic-industry canonical names with US-gov aliases on the same numeric ladder.',
  levels: [
    makeLevel(0, 'PUBLIC', ['UNCLASSIFIED', 'U', 'P']),
    makeLevel(1, 'INTERNAL', ['CUI', 'I']),
    makeLevel(2, 'CONFIDENTIAL', ['C']),
    makeLevel(3, 'RESTRICTED', ['SECRET', 'S', 'R']),
    makeLevel(4, 'RESTRICTED-PLUS', ['TOP SECRET', 'TS', 'R+']),
    makeLevel(5, 'SCI', ['TOP SECRET//SCI', 'TS//SCI', 'RESTRICTED-PLUS//SCI']),
  ],
});

export const US_GOVERNMENT_SCHEME = freezeScheme({
  id: 'us-government',
  description: 'US-government classification ladder.',
  levels: [
    makeLevel(0, 'UNCLASSIFIED', ['U', 'PUBLIC']),
    makeLevel(1, 'CUI', ['INTERNAL']),
    makeLevel(2, 'CONFIDENTIAL', ['C']),
    makeLevel(3, 'SECRET', ['S', 'RESTRICTED']),
    makeLevel(4, 'TOP SECRET', ['TS', 'RESTRICTED-PLUS']),
    makeLevel(5, 'TOP SECRET//SCI', ['TS//SCI', 'SCI']),
  ],
  validReleasability: ['NOFORN', 'REL TO USA', 'FVEY', 'ORCON', 'PROPIN'],
});

export const HEALTHCARE_HIPAA_SCHEME = freezeScheme({
  id: 'healthcare-hipaa',
  description: 'Healthcare scheme oriented around HIPAA / GDPR Art. 9 special-category data.',
  levels: [
    makeLevel(0, 'PUBLIC', []),
    makeLevel(1, 'INTERNAL', []),
    makeLevel(2, 'PHI', ['PROTECTED-HEALTH-INFORMATION']),
    makeLevel(3, 'SENSITIVE-PHI', ['PSYCH', 'GENETIC', 'HIV-STATUS', 'SUD']),
    makeLevel(4, 'RESEARCH-EMBARGOED', ['EMBARGO', 'PRE-PUBLICATION']),
  ],
  validCompartments: ['MENTAL-HEALTH', 'GENETICS', 'HIV', 'SUD', 'MINOR', 'VIP'],
  validReleasability: ['NDA', 'EYES_ONLY', 'DO_NOT_FORWARD', 'BAA-COVERED'],
});

export const FINANCIAL_SERVICES_SCHEME = freezeScheme({
  id: 'financial-services',
  description: 'Financial-services scheme around MNPI, insider lists, privileged communications.',
  levels: [
    makeLevel(0, 'PUBLIC', []),
    makeLevel(1, 'INTERNAL', []),
    makeLevel(2, 'CONFIDENTIAL', []),
    makeLevel(3, 'MNPI', ['MATERIAL-NON-PUBLIC-INFORMATION', 'INSIDER']),
    makeLevel(4, 'PRIVILEGED-COUNSEL', ['ATTORNEY-CLIENT', 'LEGAL-PRIVILEGE']),
  ],
  validCompartments: ['M_AND_A', 'DEAL_TEAM', 'RESTRICTED_LIST', 'TRADING_DESK', 'AUDIT'],
  validReleasability: ['NDA', 'EYES_ONLY', 'DO_NOT_FORWARD', 'REGULATOR-DISCLOSURE'],
});

export const GENERIC_3_TIER_SCHEME = freezeScheme({
  id: 'generic-3-tier',
  description: 'Smallest viable scheme: Public, Internal, Restricted.',
  levels: [
    makeLevel(0, 'PUBLIC', []),
    makeLevel(1, 'INTERNAL', []),
    makeLevel(2, 'RESTRICTED', ['CONFIDENTIAL', 'SENSITIVE']),
  ],
});

export const BUILT_IN_SCHEMES = Object.freeze({
  default: DEFAULT_SCHEME,
  'us-government': US_GOVERNMENT_SCHEME,
  'healthcare-hipaa': HEALTHCARE_HIPAA_SCHEME,
  'financial-services': FINANCIAL_SERVICES_SCHEME,
  'generic-3-tier': GENERIC_3_TIER_SCHEME,
});

export function parseClassificationScheme(raw) {
  if (raw === null || typeof raw !== 'object') throw new TypeError('scheme must be a JSON object');
  const id = String(raw.id ?? '').trim();
  if (!id) throw new Error('scheme.id is required');
  const description = String(raw.description ?? '').trim();
  if (!Array.isArray(raw.levels) || raw.levels.length === 0) {
    throw new Error('scheme.levels must be a non-empty array');
  }
  const seenRanks = new Set();
  const seenNames = new Set();
  const levels = [];
  for (const lv of raw.levels) {
    if (lv === null || typeof lv !== 'object') throw new Error('each level must be an object');
    const rank = Number(lv.rank);
    if (!Number.isInteger(rank) || rank < 0) throw new Error(`level.rank must be a non-negative integer, got ${lv.rank}`);
    if (seenRanks.has(rank)) throw new Error(`duplicate rank ${rank}`);
    seenRanks.add(rank);
    if (typeof lv.canonicalName !== 'string') {
      throw new TypeError(`level rank=${rank} canonicalName must be a string`);
    }
    const canonicalName = lv.canonicalName.trim();
    if (!canonicalName) throw new Error(`level rank=${rank} missing canonicalName`);
    const aliases = Array.isArray(lv.aliases) ? lv.aliases.map(String) : [];
    for (const n of [canonicalName, ...aliases]) {
      const norm = normalizeName(n);
      if (seenNames.has(norm)) throw new Error(`duplicate name across scheme: "${n}"`);
      seenNames.add(norm);
    }
    levels.push(makeLevel(rank, canonicalName, aliases));
  }
  const sorted = [...seenRanks].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i) {
      throw new Error(`scheme ranks must be contiguous 0..${sorted.length - 1}, got ${JSON.stringify(sorted)}`);
    }
  }
  const validCompartments = Array.isArray(raw.validCompartments) && raw.validCompartments.length > 0
    ? raw.validCompartments.map(String) : undefined;
  const validReleasability = Array.isArray(raw.validReleasability) && raw.validReleasability.length > 0
    ? raw.validReleasability.map(String) : undefined;
  return freezeScheme({ id, description, levels, validCompartments, validReleasability });
}

let activeScheme = DEFAULT_SCHEME;

export function getActiveScheme() { return activeScheme; }
export function setActiveScheme(scheme) { activeScheme = scheme; }
export function resetActiveScheme() { activeScheme = DEFAULT_SCHEME; }

export function levelByRank(rank, scheme = activeScheme) {
  return scheme.levels.find((lv) => lv.rank === rank);
}

export function clearanceNameToRank(name, scheme = activeScheme) {
  const norm = normalizeName(name);
  for (const lv of scheme.levels) {
    if (normalizeName(lv.canonicalName) === norm) return lv.rank;
    for (const a of lv.aliases) if (normalizeName(a) === norm) return lv.rank;
  }
  return undefined;
}

export function maxRank(scheme = activeScheme) {
  return scheme.levels[scheme.levels.length - 1]?.rank ?? 0;
}

// Loads a scheme from a built-in id, or falls through to a JSON file path.
// HARDENING: validates the file path against an explicit allowlist when
// `opts.allowedDirs` is provided, and wraps JSON.parse so a malformed file
// surfaces a clear "scheme JSON parse failed at <path>" error instead of
// the bare SyntaxError.
export async function loadSchemeByName(name, opts = {}) {
  const built = BUILT_IN_SCHEMES[name];
  if (built) return built;
  const path = await import('node:path');
  if (Array.isArray(opts.allowedDirs) && opts.allowedDirs.length > 0) {
    const resolved = path.resolve(name);
    const ok = opts.allowedDirs.some((d) => {
      const dr = path.resolve(d);
      const rel = path.relative(dr, resolved);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    });
    if (!ok) {
      throw new Error(`scheme path "${name}" is outside allowed directories`);
    }
  }
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(name, 'utf8');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error(`scheme JSON parse failed at ${name}: ${e.message}`); }
  return parseClassificationScheme(parsed);
}
