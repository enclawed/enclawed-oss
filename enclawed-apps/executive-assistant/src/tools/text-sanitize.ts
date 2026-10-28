// Pure text sanitisation, kept free of framework imports so it is
// unit-testable without the workspace resolution the scheduler needs.

/**
 * Codepoints that carry meaning to a model but are invisible to the
 * operator reading the same mail: zero-width joiners and spaces, the
 * BOM, word-joiner, and the bidirectional overrides that can reorder
 * rendered text away from what the bytes say. They are the textual
 * steganography channel -- an instruction can be hidden in them and the
 * human reviewing the thread sees nothing.
 */
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
/** C0/C1 controls except tab, newline and carriage return. */
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/**
 * Strip the invisible channel before the text reaches the model.
 *
 * Deliberately AFTER detection, never before: the DLP scanner and the
 * Stage-0 classifier both look for runs of these codepoints as evidence
 * of an injection attempt, and sanitising first would erase what they
 * are meant to catch. The order the operator asked for, and the one the
 * pipeline now implements, is: log the message verbatim, analyse it,
 * sanitise it, and only then hand it to the LLM.
 */
export function stripInvisibleChannel(text: string): string {
  return text.replace(INVISIBLE_RE, "").replace(CONTROL_RE, "");
}
