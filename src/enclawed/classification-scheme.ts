// User-configurable classification scheme.
//
// A classification scheme defines:
//   - the ordered ladder of levels (rank 0..N) for the BLP lattice
//   - canonical names + aliases for each rank
//   - optional valid-compartment + valid-releasability whitelists
//
// The deploying organization picks one of the built-in presets, OR ships
// its own scheme as JSON, OR programmatically calls `setActiveScheme()`.
// Default: a merged generic-industry + US-government scheme that keeps
// out-of-the-box behavior backwards-compatible with prior enclawed releases.
//
// Presets included:
//   DEFAULT_SCHEME            — generic-industry tiers, US-gov aliases
//   US_GOVERNMENT_SCHEME       — canonical names are US-gov, aliases include generic
//   HEALTHCARE_HIPAA_SCHEME    — Public / Internal / PHI / Sensitive-PHI / Research-Embargoed
//   FINANCIAL_SERVICES_SCHEME  — Public / Internal / Confidential / MNPI / Privileged-Counsel
//   GENERIC_3_TIER_SCHEME      — Public / Internal / Restricted (smallest viable scheme)
//
// JSON schema for a custom scheme (validated by parseClassificationScheme):
//
//   {
//     "id": "acme-2026",
//     "description": "ACME Corp internal data classification policy v3.2",
//     "levels": [
//       { "rank": 0, "canonicalName": "Public", "aliases": ["P"] },
//       { "rank": 1, "canonicalName": "Internal", "aliases": ["I"] },
//       { "rank": 2, "canonicalName": "Customer Data", "aliases": [] },
//       { "rank": 3, "canonicalName": "Privileged", "aliases": ["legal"] }
//     ],
//     "validCompartments": ["FINANCE", "ENG", "LEGAL"],   // optional
//     "validReleasability": ["NDA", "EYES_ONLY"]            // optional
//   }
//
// Ranks must be 0..N contiguous and unique. Names + aliases must be unique
// across the whole scheme (case-insensitive after normalization).

export type SchemeLevel = Readonly<{
  rank: number;
  canonicalName: string;
  aliases: ReadonlyArray<string>;
}>;

export type ClassificationScheme = Readonly<{
  id: string;
  description: string;
  levels: ReadonlyArray<SchemeLevel>;
  validCompartments?: ReadonlyArray<string>;
  validReleasability?: ReadonlyArray<string>;
}>;

function normalizeName(s: string): string {
  return s.trim().toUpperCase();
}

function makeLevel(
  rank: number,
  canonicalName: string,
  aliases: string[] = [],
): SchemeLevel {
  return Object.freeze({
    rank,
    canonicalName,
    aliases: Object.freeze(aliases.slice()),
  });
}

function freezeScheme(s: {
  id: string;
  description: string;
  levels: SchemeLevel[];
  validCompartments?: string[];
  validReleasability?: string[];
}): ClassificationScheme {
  return Object.freeze({
    id: s.id,
    description: s.description,
    levels: Object.freeze(s.levels.slice().sort((a, b) => a.rank - b.rank)),
    validCompartments: s.validCompartments ? Object.freeze(s.validCompartments.slice()) : undefined,
    validReleasability: s.validReleasability ? Object.freeze(s.validReleasability.slice()) : undefined,
  });
}

// ----- built-in presets -----

export const DEFAULT_SCHEME: ClassificationScheme = freezeScheme({
  id: "enclawed-default",
  description:
    "Default merged scheme: generic-industry canonical names with US-gov aliases on the same numeric ladder.",
  levels: [
    makeLevel(0, "PUBLIC", ["UNCLASSIFIED", "U", "P"]),
    makeLevel(1, "INTERNAL", ["CUI", "I"]),
    makeLevel(2, "CONFIDENTIAL", ["C"]),
    makeLevel(3, "RESTRICTED", ["SECRET", "S", "R"]),
    makeLevel(4, "RESTRICTED-PLUS", ["TOP SECRET", "TS", "R+"]),
    makeLevel(5, "SCI", ["TOP SECRET//SCI", "TS//SCI", "RESTRICTED-PLUS//SCI"]),
  ],
});

export const US_GOVERNMENT_SCHEME: ClassificationScheme = freezeScheme({
  id: "us-government",
  description:
    "US-government classification ladder: UNCLASSIFIED, CUI, CONFIDENTIAL, SECRET, TOP SECRET, TOP SECRET//SCI.",
  levels: [
    makeLevel(0, "UNCLASSIFIED", ["U", "PUBLIC"]),
    makeLevel(1, "CUI", ["INTERNAL"]),
    makeLevel(2, "CONFIDENTIAL", ["C"]),
    makeLevel(3, "SECRET", ["S", "RESTRICTED"]),
    makeLevel(4, "TOP SECRET", ["TS", "RESTRICTED-PLUS"]),
    makeLevel(5, "TOP SECRET//SCI", ["TS//SCI", "SCI"]),
  ],
  validReleasability: ["NOFORN", "REL TO USA", "FVEY", "ORCON", "PROPIN"],
});

export const HEALTHCARE_HIPAA_SCHEME: ClassificationScheme = freezeScheme({
  id: "healthcare-hipaa",
  description:
    "Healthcare scheme oriented around HIPAA / GDPR Art. 9 special-category data: Public, Internal, PHI, Sensitive PHI, Research Embargoed.",
  levels: [
    makeLevel(0, "PUBLIC", []),
    makeLevel(1, "INTERNAL", []),
    makeLevel(2, "PHI", ["PROTECTED-HEALTH-INFORMATION"]),
    makeLevel(3, "SENSITIVE-PHI", ["PSYCH", "GENETIC", "HIV-STATUS", "SUD"]),
    makeLevel(4, "RESEARCH-EMBARGOED", ["EMBARGO", "PRE-PUBLICATION"]),
  ],
  validCompartments: ["MENTAL-HEALTH", "GENETICS", "HIV", "SUD", "MINOR", "VIP"],
  validReleasability: ["NDA", "EYES_ONLY", "DO_NOT_FORWARD", "BAA-COVERED"],
});

export const FINANCIAL_SERVICES_SCHEME: ClassificationScheme = freezeScheme({
  id: "financial-services",
  description:
    "Financial-services scheme oriented around material non-public information (MNPI), insider lists, and privileged communications.",
  levels: [
    makeLevel(0, "PUBLIC", []),
    makeLevel(1, "INTERNAL", []),
    makeLevel(2, "CONFIDENTIAL", []),
    makeLevel(3, "MNPI", ["MATERIAL-NON-PUBLIC-INFORMATION", "INSIDER"]),
    makeLevel(4, "PRIVILEGED-COUNSEL", ["ATTORNEY-CLIENT", "LEGAL-PRIVILEGE"]),
  ],
  validCompartments: ["M_AND_A", "DEAL_TEAM", "RESTRICTED_LIST", "TRADING_DESK", "AUDIT"],
  validReleasability: ["NDA", "EYES_ONLY", "DO_NOT_FORWARD", "REGULATOR-DISCLOSURE"],
});

export const GENERIC_3_TIER_SCHEME: ClassificationScheme = freezeScheme({
  id: "generic-3-tier",
  description: "Smallest viable scheme: Public, Internal, Restricted.",
  levels: [
    makeLevel(0, "PUBLIC", []),
    makeLevel(1, "INTERNAL", []),
    makeLevel(2, "RESTRICTED", ["CONFIDENTIAL", "SENSITIVE"]),
  ],
});

export const BUILT_IN_SCHEMES: Readonly<Record<string, ClassificationScheme>> = Object.freeze({
  default: DEFAULT_SCHEME,
  "us-government": US_GOVERNMENT_SCHEME,
  "healthcare-hipaa": HEALTHCARE_HIPAA_SCHEME,
  "financial-services": FINANCIAL_SERVICES_SCHEME,
  "generic-3-tier": GENERIC_3_TIER_SCHEME,
});

// ----- validation -----

export function parseClassificationScheme(raw: unknown): ClassificationScheme {
  if (raw === null || typeof raw !== "object") {
    throw new TypeError("scheme must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  if (!id) throw new Error("scheme.id is required");
  const description = String(o.description ?? "").trim();
  if (!Array.isArray(o.levels) || o.levels.length === 0) {
    throw new Error("scheme.levels must be a non-empty array");
  }
  const seenRanks = new Set<number>();
  const seenNames = new Set<string>();
  const levels: SchemeLevel[] = [];
  for (const lvIn of o.levels as unknown[]) {
    if (lvIn === null || typeof lvIn !== "object") {
      throw new Error("each level must be an object");
    }
    const lv = lvIn as Record<string, unknown>;
    const rank = Number(lv.rank);
    if (!Number.isInteger(rank) || rank < 0) {
      throw new Error(`level.rank must be a non-negative integer, got ${String(lv.rank)}`);
    }
    if (seenRanks.has(rank)) throw new Error(`duplicate rank ${rank}`);
    seenRanks.add(rank);
    if (typeof lv.canonicalName !== "string") {
      throw new TypeError(`level rank=${rank} canonicalName must be a string`);
    }
    const canonicalName = lv.canonicalName.trim();
    if (!canonicalName) throw new Error(`level rank=${rank} missing canonicalName`);
    const aliases: string[] = Array.isArray(lv.aliases)
      ? (lv.aliases as unknown[]).map((a) => String(a))
      : [];
    for (const n of [canonicalName, ...aliases]) {
      const norm = normalizeName(n);
      if (seenNames.has(norm)) {
        throw new Error(`duplicate name across scheme: "${n}"`);
      }
      seenNames.add(norm);
    }
    levels.push(makeLevel(rank, canonicalName, aliases));
  }
  // Ranks must be contiguous 0..N.
  const sorted = [...seenRanks].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i) {
      throw new Error(`scheme ranks must be contiguous 0..${sorted.length - 1}, got ${JSON.stringify(sorted)}`);
    }
  }
  const validCompartments =
    Array.isArray(o.validCompartments) && o.validCompartments.length > 0
      ? (o.validCompartments as unknown[]).map((c) => String(c))
      : undefined;
  const validReleasability =
    Array.isArray(o.validReleasability) && o.validReleasability.length > 0
      ? (o.validReleasability as unknown[]).map((c) => String(c))
      : undefined;
  return freezeScheme({ id, description, levels, validCompartments, validReleasability });
}

// ----- active scheme registry -----

let activeScheme: ClassificationScheme = DEFAULT_SCHEME;

export function getActiveScheme(): ClassificationScheme {
  return activeScheme;
}

export function setActiveScheme(scheme: ClassificationScheme): void {
  activeScheme = scheme;
}

export function resetActiveScheme(): void {
  activeScheme = DEFAULT_SCHEME;
}

// ----- helpers consumed by classification + module-manifest -----

export function levelByRank(rank: number, scheme: ClassificationScheme = activeScheme): SchemeLevel | undefined {
  return scheme.levels.find((lv) => lv.rank === rank);
}

export function clearanceNameToRank(
  name: string,
  scheme: ClassificationScheme = activeScheme,
): number | undefined {
  const norm = normalizeName(name);
  for (const lv of scheme.levels) {
    if (normalizeName(lv.canonicalName) === norm) return lv.rank;
    for (const a of lv.aliases) {
      if (normalizeName(a) === norm) return lv.rank;
    }
  }
  return undefined;
}

export function maxRank(scheme: ClassificationScheme = activeScheme): number {
  return scheme.levels[scheme.levels.length - 1]?.rank ?? 0;
}

// Loads a scheme from a built-in id, or falls through to a JSON file path.
// HARDENING: validates the file path against an explicit allowlist when
// `opts.allowedDirs` is provided, and wraps JSON.parse so a malformed file
// surfaces a clear "scheme JSON parse failed at <path>" error instead of
// the bare SyntaxError.
export async function loadSchemeByName(
  name: string,
  opts: { allowedDirs?: string[] } = {},
): Promise<ClassificationScheme> {
  const built = BUILT_IN_SCHEMES[name];
  if (built) return built;
  const path = await import("node:path");
  if (Array.isArray(opts.allowedDirs) && opts.allowedDirs.length > 0) {
    const resolved = path.resolve(name);
    const ok = opts.allowedDirs.some((d) => {
      const dr = path.resolve(d);
      const rel = path.relative(dr, resolved);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    });
    if (!ok) {
      throw new Error(`scheme path "${name}" is outside allowed directories`);
    }
  }
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(name, "utf8");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    throw new Error(`scheme JSON parse failed at ${name}: ${(e as Error).message}`);
  }
  return parseClassificationScheme(parsed);
}
