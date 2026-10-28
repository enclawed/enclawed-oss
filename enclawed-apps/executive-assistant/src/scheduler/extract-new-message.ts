// Split a reply-style email body into the NEW message (what the
// principal just wrote) and the QUOTED HISTORY (everything that came
// before, prefixed by ">", an "On <date>... wrote:" attribution
// line, an Outlook-style header block, or a dashed separator).
//
// The Stage-1 prompt needs this split because the principal's
// follow-up reply often contains the full prior thread inline.
// Without separation the LLM sees the original "find enclawed-oss"
// task in every reply and re-issues web_search even when the actual
// new question is something else entirely.
//
// Heuristics-only. No LLM round-trip. Robust to the formats Gmail,
// Outlook, Apple Mail, and most other clients produce.

export type SplitBody = Readonly<{
  /** What the principal just wrote, top-of-body, before any quoted block. */
  newContent: string;
  /** Everything from the first quote-marker onwards. May be empty. */
  quotedContext: string;
}>;

export function extractNewMessageContent(body: string): SplitBody {
  const lines = body.split(/\r?\n/);
  let quoteStart = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const t = raw.trim();
    // Pattern 1: a line starting with ">" is the start of a quoted
    // block in every plain-text mail format we care about.
    if (t.startsWith(">")) {
      quoteStart = i;
      break;
    }
    // Pattern 2: "On <date>, <name> wrote:" attribution line.
    // Apple Mail / Gmail / Thunderbird all emit this.
    if (/^On\s.{4,}\swrote:?$/i.test(t)) {
      quoteStart = i;
      break;
    }
    // Pattern 3: Outlook-style header block. The hidden underscore
    // run is the visual separator, immediately followed by a "From:"
    // header.
    if (/^_{8,}$/.test(t)) {
      quoteStart = i;
      break;
    }
    // Pattern 4: "From: <addr>" / "Sent: <date>" / "To:" / "Subject:"
    // header block from an Outlook forward.
    if (
      /^From:\s/.test(t) &&
      i + 1 < lines.length &&
      /^(Sent|Date):\s/.test((lines[i + 1] ?? "").trim())
    ) {
      quoteStart = i;
      break;
    }
    // Pattern 5: "----- Original Message -----" separator.
    if (/^-{4,}\s*Original\s+Message/i.test(t)) {
      quoteStart = i;
      break;
    }
    // Pattern 6: bare-date-then-from line some mobile clients emit,
    // e.g. "On Jun 3, 2026, at 10:42, Hanne Chloe <…> wrote:"
    if (/^On\s+\w{3}\s+\d{1,2},\s+\d{4},/i.test(t)) {
      quoteStart = i;
      break;
    }
  }
  // Trim trailing "Sent from my iPhone"-style sign-offs from the new
  // content — they're not the principal's question, just signature
  // noise the model otherwise treats as part of the request.
  let newLines = lines.slice(0, quoteStart);
  while (newLines.length > 0) {
    const tail = (newLines[newLines.length - 1] ?? "").trim();
    if (!tail || /^Sent from my /i.test(tail) || /^--$/.test(tail) || /^—\s*$/.test(tail)) {
      newLines = newLines.slice(0, -1);
      continue;
    }
    break;
  }
  return Object.freeze({
    newContent: newLines.join("\n").trim(),
    quotedContext: lines.slice(quoteStart).join("\n").trim(),
  });
}
