import { t as formatTerminalLink } from "./terminal-link-DyR9auMT.js";
import { n as defaultRuntime } from "./runtime-1ULlIz69.js";
import { n as DOCS_ROOT_URL, r as formatDocsLink, t as DOCS_REPO_URL } from "./links-CpzyPPKB.js";
import { n as isRich, r as theme } from "./theme-m3fOXe3B.js";
import { t as formatCliCommand } from "./command-format-CIMQTLvQ.js";
import { n as runCommandWithRuntime } from "./cli-utils-0UxwpDtv.js";
//#region src/commands/docs.ts
function buildDocsSearchUrl(query) {
	const q = `repo:${DOCS_REPO_URL.replace(/^https:\/\/github\.com\//, "")} path:docs ${query}`;
	return `https://github.com/search?q=${encodeURIComponent(q)}&type=code`;
}
async function docsSearchCommand(queryParts, runtime) {
	const query = queryParts.join(" ").trim();
	if (!query) {
		if (isRich()) {
			runtime.log(`${theme.muted("Docs:")} ${formatDocsLink("/", DOCS_ROOT_URL)}`);
			runtime.log(`${theme.muted("Search:")} ${formatCliCommand("enclawed docs \"your query\"")}`);
		} else {
			runtime.log(`Docs: ${DOCS_ROOT_URL}`);
			runtime.log(`Search: ${formatCliCommand("enclawed docs \"your query\"")}`);
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
//#endregion
//#region src/cli/docs-cli.ts
function registerDocsCli(program) {
	program.command("docs").description("Search the Enclawed docs (GitHub code search over docs/)").argument("[query...]", "Search query").addHelpText("after", () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/docs", "docs/cli/docs.md")}\n`).action(async (queryParts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			await docsSearchCommand(queryParts, defaultRuntime);
		});
	});
}
//#endregion
export { registerDocsCli };
