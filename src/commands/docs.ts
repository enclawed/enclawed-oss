import { formatCliCommand } from "../cli/command-format.js";
import type { RuntimeEnv } from "../runtime.js";
import { DOCS_REPO_URL, DOCS_ROOT_URL, formatDocsLink } from "../terminal/links.js";
import { formatTerminalLink } from "../terminal/terminal-link.js";
import { isRich, theme } from "../terminal/theme.js";

// There is no hosted docs site or docs search service: the docs are the
// Markdown files under `docs/` in the public enclawed-oss repository. A query
// becomes a GitHub code search scoped to that directory.
export function buildDocsSearchUrl(query: string): string {
  const repo = DOCS_REPO_URL.replace(/^https:\/\/github\.com\//, "");
  const q = `repo:${repo} path:docs ${query}`;
  return `https://github.com/search?q=${encodeURIComponent(q)}&type=code`;
}

export async function docsSearchCommand(queryParts: string[], runtime: RuntimeEnv) {
  const query = queryParts.join(" ").trim();
  if (!query) {
    if (isRich()) {
      runtime.log(`${theme.muted("Docs:")} ${formatDocsLink("/", DOCS_ROOT_URL)}`);
      runtime.log(`${theme.muted("Search:")} ${formatCliCommand('enclawed docs "your query"')}`);
    } else {
      runtime.log(`Docs: ${DOCS_ROOT_URL}`);
      runtime.log(`Search: ${formatCliCommand('enclawed docs "your query"')}`);
    }
    return;
  }

  const url = buildDocsSearchUrl(query);
  if (isRich()) {
    runtime.log(`${theme.heading("Docs search:")} ${theme.info(query)}`);
    runtime.log(formatTerminalLink(url, url, { fallback: url }));
    return;
  }
  runtime.log(`Docs search: ${query}`);
  runtime.log(url);
}
