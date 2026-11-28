import { formatTerminalLink } from "./terminal-link.js";

// There is no hosted docs site. The docs live as Markdown under `docs/` in the
// public enclawed-oss repository, so CLI "Docs:" links point at GitHub.
export const DOCS_REPO_URL = "https://github.com/enclawed/enclawed-oss";
export const DOCS_ROOT_URL = `${DOCS_REPO_URL}/tree/main/docs`;
const DOCS_FILE_ROOT_URL = `${DOCS_REPO_URL}/blob/main/docs`;

// Docs sections whose landing page is `docs/<section>/index.md` rather than
// `docs/<section>.md`.
const DOCS_DIRECTORY_INDEXES = new Set([
  "automation",
  "channels",
  "cli",
  "gateway",
  "gateway/security",
  "help",
  "install",
  "nodes",
  "platforms",
  "providers",
  "tools",
  "web",
]);

// Short or legacy doc paths that callers (including third-party plugins via
// `docsPath`) still pass. Each maps to the page that actually exists under
// `docs/`. The short channel/tool aliases mirror the `redirects` table in
// docs/docs.json; the rest point commands and plugins without a dedicated
// page at the nearest existing page.
const DOCS_PATH_ALIASES: Readonly<Record<string, string>> = {
  discord: "channels/discord",
  imessage: "channels/imessage",
  mattermost: "channels/mattermost",
  signal: "channels/signal",
  slack: "channels/slack",
  telegram: "channels/telegram",
  whatsapp: "channels/whatsapp",
  plugin: "tools/plugin",
  skills: "tools/skills",
  security: "gateway/security",
  sandbox: "cli/sandbox",
  faq: "help/faq",
  "start/faq": "help/faq",
  troubleshooting: "help/troubleshooting",
  windows: "platforms/windows",
  "cli/audit": "cli",
  "cli/demo": "cli",
  "cli/trust": "cli",
  "cli/run": "cli/agent",
  "cli/migrate-services": "cli/daemon",
  "plugins/google-meet": "tools/plugin",
  "providers/cerebras": "providers",
  "providers/deepinfra": "providers",
};

function normalizeDocsPage(page: string): string {
  const trimmed = page.trim().replace(/^\/+|\/+$/g, "");
  return DOCS_PATH_ALIASES[trimmed] ?? trimmed;
}

/**
 * Map a docs path such as `/cli/config#examples` to the Markdown file under
 * `docs/` that holds the page (`cli/config.md`) plus any `#anchor` suffix.
 */
export function resolveDocsFile(path: string): { file: string; anchor: string } {
  const hashIndex = path.indexOf("#");
  const anchor = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const page = normalizeDocsPage(hashIndex >= 0 ? path.slice(0, hashIndex) : path);
  if (!page) {
    return { file: "index.md", anchor };
  }
  if (page.endsWith(".md") || page.endsWith(".mdx")) {
    return { file: page, anchor };
  }
  return {
    file: DOCS_DIRECTORY_INDEXES.has(page) ? `${page}/index.md` : `${page}.md`,
    anchor,
  };
}

/** Full GitHub URL for a docs path; an empty path yields the docs root. */
export function resolveDocsUrl(path: string | undefined | null): string {
  const trimmed = typeof path === "string" ? path.trim() : "";
  if (!trimmed) {
    return DOCS_ROOT_URL;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const { file, anchor } = resolveDocsFile(trimmed);
  if (file === "index.md" && !anchor) {
    return DOCS_ROOT_URL;
  }
  return `${DOCS_FILE_ROOT_URL}/${file}${anchor}`;
}

export function formatDocsLink(
  path: string | undefined | null,
  label?: string,
  opts?: { fallback?: string; force?: boolean },
): string {
  // When a caller has no docsPath, link to the docs root rather than crashing
  // the onboarding/channel-selection flows that pass meta.docsPath through
  // here unguarded. The typed contract says docsPath is required, but a
  // handful of channel plugins and catalog rows leave it unset at runtime.
  const url = resolveDocsUrl(path);
  return formatTerminalLink(label ?? url, url, {
    fallback: opts?.fallback ?? url,
    force: opts?.force,
  });
}
