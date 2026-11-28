import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveDocsFile } from "./links.js";

// Every docs link the CLI can emit must land on a Markdown file that exists
// under docs/. There is no hosted docs site; links resolve to
// github.com/enclawed/enclawed-oss/blob/main/docs/<file>.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS_DIR = path.join(REPO_ROOT, "docs");
const SOURCE_ROOTS = ["src", "extensions", "modules", "ui/src"];
const SKIP_DIRS = new Set(["node_modules", "dist", "test-utils", "test-helpers", "test-support"]);
const SOURCE_FILE = /\.(?:ts|tsx|mts|js|mjs)$/;
const TEST_FILE =
  /\.(?:test|e2e\.test|live\.test|test-support|test-helpers)\.(?:ts|tsx|mts|js|mjs)$/;
const MANIFEST_FILE = /^(?:package|enclawed\.plugin)\.json$/;

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        walk(path.join(dir, entry.name), out);
      }
    } else if (
      (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) ||
      MANIFEST_FILE.test(entry.name)
    ) {
      out.push(path.join(dir, entry.name));
    }
  }
}

type DocsRef = { file: string; source: string; ref: string };

function collectDocsRefs(): { refs: DocsRef[]; staleHosts: string[] } {
  const files: string[] = [];
  for (const root of SOURCE_ROOTS) {
    walk(path.join(REPO_ROOT, root), files);
  }
  const refs: DocsRef[] = [];
  const staleHosts: string[] = [];
  const patterns: Array<{ re: RegExp; toFile: (match: string) => string }> = [
    // formatDocsLink("/cli/config", ...) and docsLink("/channels/x", ...)
    {
      re: /(?:formatDocsLink|\bdocsLink)\(\s*["'`]([^"'`$]*)["'`]/g,
      toFile: (p) => resolveDocsFile(p).file,
    },
    // docsPath: "/channels/x" (plugin/channel/provider metadata, TS and JSON)
    {
      re: /["']?docsPath["']?\s*:\s*["'`]([^"'`$]*)["'`]/g,
      toFile: (p) => resolveDocsFile(p).file,
    },
    // Hardcoded links straight to a docs file in the public repo
    {
      re: /github\.com\/enclawed\/enclawed-oss\/blob\/main\/docs\/([A-Za-z0-9_\-./]+\.mdx?)/g,
      toFile: (p) => p,
    },
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const source = path.relative(REPO_ROOT, file);
    for (const { re, toFile } of patterns) {
      for (const match of text.matchAll(re)) {
        const ref = match[1] ?? "";
        if (/^https?:/i.test(ref)) {
          continue;
        }
        refs.push({ file: toFile(ref), source, ref });
      }
    }
    if (/docs\.enclawed\.(?:ai|com)|\benclawed\.ai\b/.test(text)) {
      staleHosts.push(source);
    }
  }
  return { refs, staleHosts };
}

describe("CLI docs links", () => {
  const { refs, staleHosts } = collectDocsRefs();

  it("finds the docs link call sites", () => {
    expect(refs.length).toBeGreaterThan(100);
  });

  it("every docs link resolves to a file under docs/", () => {
    const missing = refs
      .filter((r) => !fs.existsSync(path.join(DOCS_DIR, r.file)))
      .map((r) => `${r.source}: ${r.ref} -> docs/${r.file}`);
    expect(missing).toEqual([]);
  });

  it("no source file links to a docs host that does not exist", () => {
    expect(staleHosts).toEqual([]);
  });
});
