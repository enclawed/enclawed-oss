// Semantic scrambler — collapses the fine-grained linguistic variation an
// attacker uses to encode bits in *word and grammar choice*.
//
// Linguistic steganography hides data not in invisible characters or
// whitespace (handled by the canonicalizer and noise injector) but in choices
// a human reader does not register as meaningful: which synonym was used,
// whether a contraction was expanded, whether a clause is active or passive.
// Each such choice is a covert bit.
//
// The scrambler is deterministic and LLM-free. It maps every member of a
// linguistic equivalence class to one canonical representative: every synonym
// in a ring collapses to the ring's canonical word, every contraction expands
// to its full form, agentive passive constructions normalize toward active.
// Because the mapping is idempotent and many-to-one, whatever variant the
// attacker chose, the output is fixed — the word-choice channel carries no
// information.
//
// The transforms are meaning-preserving but lossy at the surface (the user's
// exact wording changes), so the stage defaults to audit mode.

export type ScramblerOptions = {
  expandContractions: boolean;
  canonicalizeSynonyms: boolean;
  passiveToActive: boolean;
};

export const defaultScramblerOptions: ScramblerOptions = {
  expandContractions: true,
  canonicalizeSynonyms: true,
  passiveToActive: true,
};

export type ScramblerFinding = {
  severity: "info" | "low" | "medium" | "high";
  code: string;
  message: string;
  estimatedBits: number;
};

export type ScrambleResult = { text: string; findings: ScramblerFinding[] };

// --- synonym rings --------------------------------------------------------
// Words within a ring are treated as interchangeable; every member maps to
// the FIRST (canonical) member. Rings are curated conservatively toward
// single part-of-speech, broadly context-insensitive sets; substitution is
// meaning-approximately-preserving, not a proof of semantic identity.
export const SYNONYM_RINGS: readonly (readonly string[])[] = [
  ["large", "huge", "massive", "enormous", "gigantic"],
  ["small", "tiny", "minuscule", "miniature"],
  ["important", "crucial", "vital", "essential"],
  ["difficult", "tough", "challenging", "demanding"],
  ["easy", "simple", "straightforward", "effortless"],
  ["begin", "commence", "initiate"],
  ["finish", "conclude", "finalize"],
  ["repair", "mend", "fix"],
  ["modify", "alter", "amend"],
  ["verify", "confirm", "validate"],
  ["obtain", "acquire", "procure"],
  ["error", "fault", "defect", "flaw"],
  ["problem", "issue", "difficulty"],
  ["reply", "response", "answer"],
  ["notify", "inform", "alert"],
  ["happy", "glad", "pleased", "delighted"],
  ["angry", "furious", "irate"],
  ["frequently", "often", "regularly", "repeatedly"],
  ["rarely", "seldom", "infrequently"],
  ["perhaps", "maybe", "possibly"],
  ["additionally", "moreover", "furthermore"],
  ["therefore", "thus", "hence", "consequently"],
  ["accurate", "precise", "exact"],
  ["rapidly", "quickly", "swiftly"],
];

const SYNONYM_MAP = new Map<string, string>();
for (const ring of SYNONYM_RINGS) {
  for (const word of ring) {
    SYNONYM_MAP.set(word, ring[0]!);
  }
}

// --- contractions ---------------------------------------------------------
// Each contraction expands to one canonical full form. Ambiguous forms
// (it's = it is / it has) are normalized to the dominant expansion.
const CONTRACTIONS: Readonly<Record<string, string>> = {
  dont: "do not",
  doesnt: "does not",
  didnt: "did not",
  wont: "will not",
  wouldnt: "would not",
  cant: "cannot",
  couldnt: "could not",
  shouldnt: "should not",
  mustnt: "must not",
  isnt: "is not",
  arent: "are not",
  wasnt: "was not",
  werent: "were not",
  hasnt: "has not",
  havent: "have not",
  hadnt: "had not",
  im: "i am",
  youre: "you are",
  were2: "we are",
  theyre: "they are",
  ive: "i have",
  youve: "you have",
  weve: "we have",
  theyve: "they have",
  ill2: "i will",
  youll: "you will",
  well2: "we will",
  theyll: "they will",
  id2: "i would",
  youd: "you would",
  wed2: "we would",
  theyd: "they would",
  its2: "it is",
  thats: "that is",
  theres: "there is",
  heres: "here is",
  whats: "what is",
  lets: "let us",
  whos: "who is",
};

/** Apply the casing of `original` onto `replacement`. */
function applyCase(original: string, replacement: string): string {
  if (original.length > 1 && original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement[0]!.toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

const APOSTROPHE = "['’]";
const CONTRACTION_RE = new RegExp(`\\b([A-Za-z]+)${APOSTROPHE}([A-Za-z]+)\\b`, "g");

/** Expand contractions to one canonical full form. */
export function expandContractions(input: string): string {
  return input.replace(CONTRACTION_RE, (match, a: string, b: string) => {
    // Disambiguate the handful of collisions by suffixing the lookup key.
    const bare = `${a}${b}`.toLowerCase();
    const keyed =
      bare === "were"
        ? "were2"
        : bare === "well"
          ? "well2"
          : bare === "id"
            ? "id2"
            : bare === "wed"
              ? "wed2"
              : bare === "ill"
                ? "ill2"
                : bare === "its"
                  ? "its2"
                  : bare;
    const expansion = CONTRACTIONS[keyed] ?? CONTRACTIONS[bare];
    return expansion ? applyCase(match, expansion) : match;
  });
}

const WORD_RE = /\b[A-Za-z]+\b/g;

/** Collapse every synonym-ring member to the ring's canonical word. */
export function canonicalizeSynonyms(input: string): string {
  return input.replace(WORD_RE, (word) => {
    const canonical = SYNONYM_MAP.get(word.toLowerCase());
    if (!canonical || canonical === word.toLowerCase()) {
      return word;
    }
    return applyCase(word, canonical);
  });
}

// Agentive passive with a regular (-ed) verb: "X was deleted by Y" -> active
// "Y deleted X". Restricted to regular verbs (participle == past tense) so the
// rewrite stays grammatical, and to short noun phrases so the match is safe.
const PASSIVE_RE =
  /\b([a-z][a-z]*(?:\s+[a-z]+){0,2})\s+(?:was|were)\s+([a-z]+ed)\s+by\s+([a-z][a-z]*(?:\s+[a-z]+){0,2})\b/gi;

/** Normalize agentive passive constructions toward active voice. */
export function passiveToActive(input: string): string {
  return input.replace(PASSIVE_RE, (_m, object: string, verb: string, agent: string) => {
    return `${agent.toLowerCase()} ${verb.toLowerCase()} ${object.toLowerCase()}`;
  });
}

/** Run the configured scrambler transforms and report what each collapsed. */
export function scramble(input: string, options?: Partial<ScramblerOptions>): ScrambleResult {
  const opts = { ...defaultScramblerOptions, ...options };
  const findings: ScramblerFinding[] = [];
  let text = input;

  if (opts.expandContractions) {
    const next = expandContractions(text);
    if (next !== text) {
      findings.push({
        severity: "low",
        code: "contraction-expand",
        message: "expanded contractions to canonical full form",
        estimatedBits: (text.match(CONTRACTION_RE) ?? []).length,
      });
      text = next;
    }
  }

  if (opts.passiveToActive) {
    const next = passiveToActive(text);
    if (next !== text) {
      findings.push({
        severity: "low",
        code: "voice-normalize",
        message: "normalized agentive passive constructions toward active voice",
        estimatedBits: (text.match(PASSIVE_RE) ?? []).length,
      });
      text = next;
    }
  }

  if (opts.canonicalizeSynonyms) {
    let swapped = 0;
    const next = text.replace(WORD_RE, (word) => {
      const canonical = SYNONYM_MAP.get(word.toLowerCase());
      if (!canonical || canonical === word.toLowerCase()) {
        return word;
      }
      swapped++;
      return applyCase(word, canonical);
    });
    if (next !== text) {
      findings.push({
        severity: "medium",
        code: "synonym-canonicalize",
        message: `collapsed ${swapped} synonym choice(s) to the canonical word`,
        estimatedBits: swapped,
      });
      text = next;
    }
  }

  return { text, findings };
}
