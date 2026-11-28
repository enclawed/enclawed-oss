/** Provider key formats: a fixed prefix and a minimum length of key alphabet after it. */
export declare const PROVIDER_TOKENS: readonly Readonly<{
    id: string;
    re: RegExp;
}>[];
/** Every provider key format in a text. */
export declare function providerTokenFindings(text: string): {
    id: string;
    match: string;
}[];
/** Is the text, as a file named `name`, a secret? Returns what kind, or null. */
export declare function secretInText(text: string, name: string, dlp: (text: string) => readonly {
    id: string;
}[]): string | null;
/**
 * The secret a regular file holds, read whole, or null (not a regular file,
 * empty, larger than the bound, unreadable). `dlp`: the framework's
 * credential formats (credentials.ts credentialFindings).
 */
export declare function secretContentOf(file: string, dlp: (text: string) => readonly {
    id: string;
}[]): string | null;
export declare const SECRET_ASSIGNMENT_PLACEHOLDER = "[secret value removed by Enclawed]";
/**
 * Every credential-shaped assignment's value in a text replaced, whatever
 * file or program printed it (`aws_secret_access_key = ...` read through a
 * link, a token in a config dump): content, not path, decides.
 */
export declare function redactSecretAssignments(text: string): {
    text: string;
    removed: number;
};
