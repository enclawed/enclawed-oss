import { t as formatTerminalLink } from "./terminal-link-DyR9auMT.js";
//#region src/terminal/links.ts
const DOCS_REPO_URL = "https://github.com/enclawed/enclawed-oss";
const DOCS_ROOT_URL = `${DOCS_REPO_URL}/tree/main/docs`;
const DOCS_FILE_ROOT_URL = `${DOCS_REPO_URL}/blob/main/docs`;
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
	"web"
]);
const DOCS_PATH_ALIASES = {
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
	"providers/deepinfra": "providers"
};
function normalizeDocsPage(page) {
	const trimmed = page.trim().replace(/^\/+|\/+$/g, "");
	return DOCS_PATH_ALIASES[trimmed] ?? trimmed;
}
/**
* Map a docs path such as `/cli/config#examples` to the Markdown file under
* `docs/` that holds the page (`cli/config.md`) plus any `#anchor` suffix.
*/
function resolveDocsFile(path) {
	const hashIndex = path.indexOf("#");
	const anchor = hashIndex >= 0 ? path.slice(hashIndex) : "";
	const page = normalizeDocsPage(hashIndex >= 0 ? path.slice(0, hashIndex) : path);
	if (!page) return {
		file: "index.md",
		anchor
	};
	if (page.endsWith(".md") || page.endsWith(".mdx")) return {
		file: page,
		anchor
	};
	return {
		file: DOCS_DIRECTORY_INDEXES.has(page) ? `${page}/index.md` : `${page}.md`,
		anchor
	};
}
/** Full GitHub URL for a docs path; an empty path yields the docs root. */
function resolveDocsUrl(path) {
	const trimmed = typeof path === "string" ? path.trim() : "";
	if (!trimmed) return DOCS_ROOT_URL;
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	const { file, anchor } = resolveDocsFile(trimmed);
	if (file === "index.md" && !anchor) return DOCS_ROOT_URL;
	return `${DOCS_FILE_ROOT_URL}/${file}${anchor}`;
}
function formatDocsLink(path, label, opts) {
	const url = resolveDocsUrl(path);
	return formatTerminalLink(label ?? url, url, {
		fallback: opts?.fallback ?? url,
		force: opts?.force
	});
}
//#endregion
export { DOCS_ROOT_URL as n, formatDocsLink as r, DOCS_REPO_URL as t };
