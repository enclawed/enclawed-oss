// Deterministic date / time extraction from inbound email bodies.
//
// Why: the LLM tool-use loop kept hallucinating dates ("next Monday"
// → today; "block 4pm" → today 11am–4pm). We pin the date-parsing
// step to chrono-node and inject the parsed candidates into the user
// prompt as a fixed table the LLM is told to copy from. The LLM still
// owns the intent decision (schedule? cancel? ignore?) but not the
// arithmetic.
//
// chrono-node returns a ParsedResult per detected datetime, each with
// a known text span in the source, an interpreted Date, and (for
// ranges like "3pm to 4pm" or "next monday 9-11am") a paired end.
// We normalise each result to:
//
//   { text:    "next Monday at 3pm",  // verbatim source span
//     startsAtIso: "2026-06-01T15:00:00.000Z",
//     endsAtIso:   "2026-06-01T15:30:00.000Z" | undefined,
//   }
//
// Duration is left for the LLM only when the email gave a single
// instant; when the email said "9-11am" the end-iso is pre-computed
// and the LLM is forbidden from re-deriving it.
//
// Reference time is always passed in — we use the same `now` clock
// the date-anchor block uses, so the LLM sees a consistent picture
// of "today" across both blocks.

import * as chrono from "chrono-node";

export type DatetimeCandidate = Readonly<{
  /** Verbatim source span the candidate was parsed from. */
  text: string;
  /** ISO 8601 in UTC, always with Z suffix. */
  startsAtIso: string;
  /** Present only when the source span contained an explicit end. */
  endsAtIso?: string;
}>;

export function extractDatetimeCandidates(
  body: string,
  now: Date,
): ReadonlyArray<DatetimeCandidate> {
  if (!body || body.trim().length === 0) {
    return [];
  }
  const results = chrono.parse(body, now, { forwardDate: true });
  const out: DatetimeCandidate[] = [];
  for (const r of results) {
    const start = r.start;
    const startDate = start.date();
    if (!startDate || Number.isNaN(startDate.getTime())) {
      continue;
    }
    const candidate: DatetimeCandidate = {
      text: r.text.trim(),
      startsAtIso: startDate.toISOString(),
      ...(r.end
        ? {
            endsAtIso: r.end.date().toISOString(),
          }
        : {}),
    };
    out.push(Object.freeze(candidate));
  }
  // Deduplicate identical (text, startsAtIso) pairs — chrono
  // occasionally produces near-duplicate hits for overlapping phrases.
  const seen = new Set<string>();
  const deduped: DatetimeCandidate[] = [];
  for (const c of out) {
    const k = `${c.text}|${c.startsAtIso}|${c.endsAtIso ?? ""}`;
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    deduped.push(c);
  }
  return Object.freeze(deduped);
}

/**
 * Format the candidates as a fixed-shape table for the LLM user
 * prompt. The LLM is told (in the tool schema) to copy the iso
 * values from this block verbatim. Empty input becomes "(none)".
 */
export function renderDatetimeCandidates(candidates: ReadonlyArray<DatetimeCandidate>): string {
  if (candidates.length === 0) {
    return "  (none detected)";
  }
  return candidates
    .map((c) => {
      const endPart = c.endsAtIso ? ` → ${c.endsAtIso}` : "";
      return `  • "${c.text}" → ${c.startsAtIso}${endPart}`;
    })
    .join("\n");
}
