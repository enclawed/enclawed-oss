// Minimal vCard parser sufficient for the secretary's contact-gating
// lookup. We need exactly two things off each card: the display name
// (FN, or the assembled N components) and the list of email
// addresses. Phone numbers come along for free since the parse is
// already line-oriented.
//
// vCard 3.0 (RFC 6350 predecessor) and vCard 4.0 (RFC 6350) share
// the line-format spec — content-line is `NAME[;PARAM=value]*:VALUE`
// with logical lines unfolded across leading-whitespace continuations.
// Both Google Contacts and Apple iCloud export 3.0; some servers
// negotiate 4.0. The parser handles either by ignoring VERSION.
//
// We do NOT attempt full vCard semantic preservation (X-ABLabel,
// PHOTO embedded blobs, structured ADR, etc.) — those are out of
// scope for the secretary's contact gate. The parser drops what it
// does not recognise rather than throwing, so a malformed entry in
// the address book does not break list_contacts.

export type ParsedContact = Readonly<{
  uid: string;
  displayName: string;
  emails: ReadonlyArray<string>;
  phones: ReadonlyArray<string>;
}>;

type ContentLine = Readonly<{
  name: string;
  params: ReadonlyMap<string, string>;
  value: string;
}>;

// RFC 6350 §3.2: a logical line may be split across CRLF + LWSP
// (space or tab) continuations. Reverse the split before parsing
// individual properties.
function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseLine(line: string): ContentLine | null {
  // Find the first `:` not inside a quoted parameter value. vCard
  // parameter values can be DQUOTE-wrapped, but the secretary's
  // sources rarely use that — fall through to plain string-split.
  const colon = line.indexOf(":");
  if (colon < 0) {
    return null;
  }
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = head.indexOf(";");
  const name = semi < 0 ? head : head.slice(0, semi);
  const params = new Map<string, string>();
  if (semi >= 0) {
    const paramSpec = head.slice(semi + 1);
    // Naive: split on ';' — parameter values that contain literal
    // ';' would lose information, but no contact source we target
    // emits that.
    for (const p of paramSpec.split(";")) {
      const eq = p.indexOf("=");
      if (eq < 0) {
        params.set("TYPE", p.toUpperCase());
        continue;
      }
      params.set(p.slice(0, eq).toUpperCase(), p.slice(eq + 1));
    }
  }
  return { name: name.toUpperCase(), params, value };
}

function assembleN(value: string): string {
  // N: Family;Given;Additional;Prefix;Suffix
  const parts = value.split(";").map((p) => p.trim());
  const given = parts[1] ?? "";
  const family = parts[0] ?? "";
  return [given, family]
    .filter((p) => p.length > 0)
    .join(" ")
    .trim();
}

export function parseVCard(rawIn: string): ParsedContact | null {
  if (!rawIn || typeof rawIn !== "string") {
    return null;
  }
  const lines = unfold(rawIn);
  let uid = "";
  let fn = "";
  let nDerived = "";
  const emails: string[] = [];
  const phones: string[] = [];
  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) {
      continue;
    }
    switch (parsed.name) {
      case "UID":
        uid = parsed.value.trim();
        break;
      case "FN":
        fn = parsed.value.trim();
        break;
      case "N":
        nDerived = assembleN(parsed.value);
        break;
      case "EMAIL": {
        const addr = parsed.value.trim().toLowerCase();
        if (addr.length > 0 && !emails.includes(addr)) {
          emails.push(addr);
        }
        break;
      }
      case "TEL": {
        const num = parsed.value.trim();
        if (num.length > 0 && !phones.includes(num)) {
          phones.push(num);
        }
        break;
      }
      default:
        // ignore everything else
        break;
    }
  }
  const displayName = fn || nDerived;
  if (!uid && displayName.length === 0 && emails.length === 0) {
    return null;
  }
  return Object.freeze({
    uid: uid || `vcard:${displayName || emails[0] || "unknown"}`,
    displayName: displayName || emails[0] || "(no name)",
    emails: Object.freeze(emails),
    phones: Object.freeze(phones),
  });
}
