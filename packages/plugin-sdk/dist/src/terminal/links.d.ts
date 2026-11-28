export declare const DOCS_REPO_URL = "https://github.com/enclawed/enclawed-oss";
export declare const DOCS_ROOT_URL = "https://github.com/enclawed/enclawed-oss/tree/main/docs";
/**
 * Map a docs path such as `/cli/config#examples` to the Markdown file under
 * `docs/` that holds the page (`cli/config.md`) plus any `#anchor` suffix.
 */
export declare function resolveDocsFile(path: string): {
    file: string;
    anchor: string;
};
/** Full GitHub URL for a docs path; an empty path yields the docs root. */
export declare function resolveDocsUrl(path: string | undefined | null): string;
export declare function formatDocsLink(path: string | undefined | null, label?: string, opts?: {
    fallback?: string;
    force?: boolean;
}): string;
