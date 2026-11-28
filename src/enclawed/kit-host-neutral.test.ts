// The kit stays generic: outside tests, nothing in src/enclawed, the
// enclawed/ framework tree or the docs shipped in the package names a host
// product, a host version or a host-behavior detail. Host facts are data each
// adapter declares. The only exceptions are stable identifiers (a key, a
// package name) that a cross-host security catalog needs, listed below with
// the reason each is kept.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Host product names and host versions, as prose. */
export const HOST_NAME_PATTERNS: readonly RegExp[] = [
  /claude[ -]code/gi,
  /claude desktop/gi,
  /\bCodex\b/g,
  /\bCursor\b/g,
  /gemini[ -]cli/gi,
  /\bAntigravity\b/gi,
  /\bCopilot\b/g,
  /\bWindsurf\b/gi,
  /\bKiro\b/g,
  /\bOpenCode\b/g,
  /qwen[ -]code/gi,
  // A host version (2.1.326 and the like).
  /\b2\.1\.\d{3}\b/g,
];

/** Stable identifiers kept on purpose: [repo-relative file, exact text, reason]. */
export const ALLOWED_IDENTIFIERS: readonly (readonly [string, string, string])[] = [
  [
    "src/enclawed/adapter/rule-decisions.ts",
    '".windsurf",',
    "a directory name in EXEC_CONFIG_NAMES.segments: writes there configure what another agent host runs, so the kit must name it",
  ],
  [
    "src/enclawed/adapter/env-trust.ts",
    '"claude-code": {',
    "KNOWN_HOST_ENV key (an adapter host id): the cross-host environment catalog stays in the kit so an adapter that forgets a name cannot weaken the check",
  ],
  [
    "src/enclawed/adapter/exec-provenance.ts",
    '"@anthropic-ai/claude-code"',
    "npm package name in AGENT_PACKAGES: recognizing a nested agent started through a package runner",
  ],
  [
    "src/enclawed/adapter/exec-provenance.ts",
    '"@qwen-code/qwen-code"',
    "npm package name in AGENT_PACKAGES: recognizing a nested agent started through a package runner",
  ],
  [
    "src/enclawed/adapter/exec-provenance.ts",
    '"@google/gemini-cli"',
    "npm package name in AGENT_PACKAGES: recognizing a nested agent started through a package runner",
  ],
];

function isTestFile(rel: string): boolean {
  const base = path.basename(rel);
  return (
    /\.test\.(?:ts|mts|mjs|js)$/.test(base) ||
    /^test-helpers?\b/.test(base) ||
    rel.split("/").some((seg) => seg === "test" || seg === "__tests__" || seg === "node_modules")
  );
}

function walk(dir: string, exts: readonly string[], out: string[]): void {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "test" && e.name !== "__tests__") {
        walk(p, exts, out);
      }
    } else if (e.isFile() && exts.some((x) => e.name.endsWith(x))) {
      out.push(p);
    }
  }
}

/** The files the guard scans, repo-relative. */
export function scannedFiles(): string[] {
  const out: string[] = [];
  walk(path.join(REPO, "src/enclawed"), [".ts", ".md"], out);
  walk(path.join(REPO, "enclawed/src"), [".mjs", ".js", ".ts", ".md"], out);
  walk(path.join(REPO, "enclawed/ts"), [".mjs", ".js", ".ts", ".md"], out);
  walk(path.join(REPO, "docs/reference/templates"), [".md"], out);
  for (const f of ["enclawed/README.md", "enclawed/FORK.md"]) {
    if (fs.existsSync(path.join(REPO, f))) {
      out.push(path.join(REPO, f));
    }
  }
  return out
    .map((p) => path.relative(REPO, p).split(path.sep).join("/"))
    .filter((rel) => !isTestFile(rel))
    .toSorted();
}

/** Every host name a file's text carries outside its allowed identifiers: "line: match". */
export function hostNamesIn(rel: string, text: string): string[] {
  let masked = text;
  for (const [file, ident] of ALLOWED_IDENTIFIERS) {
    if (file === rel) {
      masked = masked.split(ident).join(" ".repeat(ident.length));
    }
  }
  const found: string[] = [];
  for (const re of HOST_NAME_PATTERNS) {
    for (const m of masked.matchAll(new RegExp(re.source, re.flags))) {
      const line = masked.slice(0, m.index).split("\n").length;
      found.push(`${rel}:${line}: ${m[0]}`);
    }
  }
  return found;
}

describe("the kit names no host product or host version", () => {
  it("finds a host name in prose, but not an allowed identifier", () => {
    expect(hostNamesIn("x.ts", "// as Claude Code 2.1.326 does")).toEqual([
      "x.ts:1: Claude Code",
      "x.ts:1: 2.1.326",
    ]);
    expect(hostNamesIn("x.ts", "a Cursor rule; the Gemini CLI; Codex")).toHaveLength(3);
    expect(hostNamesIn("x.ts", "nextCursor; cursor = r; const codex = 1")).toEqual([]);
    expect(
      hostNamesIn(
        "src/enclawed/adapter/exec-provenance.ts",
        '  "@anthropic-ai/claude-code": "claude",',
      ),
    ).toEqual([]);
    expect(
      hostNamesIn("src/enclawed/adapter/host.ts", '  "@anthropic-ai/claude-code"'),
    ).toHaveLength(1);
  });

  it("scans the kit, the framework tree and the shipped templates", () => {
    const files = scannedFiles();
    expect(files).toContain("src/enclawed/adapter/host-prompt.ts");
    expect(files).toContain("src/enclawed/adapter/README.md");
    expect(files.some((f) => f.startsWith("enclawed/src/"))).toBe(true);
    expect(files.some((f) => f.endsWith(".test.ts"))).toBe(false);
  });

  it("no scanned file names a host product or version", () => {
    const found = scannedFiles().flatMap((rel) =>
      hostNamesIn(rel, fs.readFileSync(path.join(REPO, rel), "utf8")),
    );
    expect(found).toEqual([]);
  });

  it("every allowed identifier is still there (no stale exception)", () => {
    for (const [file, ident] of ALLOWED_IDENTIFIERS) {
      expect(fs.readFileSync(path.join(REPO, file), "utf8"), `${file}: ${ident}`).toContain(ident);
    }
  });
});
