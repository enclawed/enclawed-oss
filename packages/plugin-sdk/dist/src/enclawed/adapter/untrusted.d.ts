export declare const DEFAULT_QUOTE_MAX = 200;
/**
 * The text of a value from outside Enclawed (a hook payload, a settings
 * file, a record, a thrown value). A string is itself; a number, boolean,
 * bigint, null or undefined reads as String() reads it; a symbol as its
 * description form; an Error as "Name: message". Any other object is
 * serialized deliberately as JSON (a function, or a value JSON cannot
 * hold, as its type tag), never as "[object Object]", so two different
 * objects never read as the same text.
 */
export declare function textOf(value: unknown): string;
/** One agent-controlled value, rendered for Enclawed's own messages: a JSON string literal, possibly with a note. */
export declare function quoteUntrusted(value: unknown, opts?: {
    max?: number;
}): string;
/** A path Enclawed computed: bare when it is plain printable ASCII, quoted otherwise. */
export declare function showPath(p: unknown): string;
/**
 * Free text that mixes Enclawed's wording with values from elsewhere (an
 * error message): hidden characters stripped, controls and newlines escaped,
 * notice imitations neutralized, length capped. Not quoted.
 */
export declare function sanitizeText(value: unknown, opts?: {
    max?: number;
    neutralize?: boolean;
}): string;
