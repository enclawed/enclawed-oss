#!/usr/bin/env node
/**
 * post-bundle-smoke.mjs
 *
 * Catches plugin-load regressions in the *published artifact*, not the
 * source tree.
 *
 * It runs in three layers, each independently meaningful:
 *
 *   1. STATIC SCAN (always)
 *      Walks `extensions/`, parses every `import ... from "@enclawed/plugin-sdk/<subpath>"`
 *      and every `export ... from "@enclawed/plugin-sdk/<subpath>"`, then verifies:
 *        - the subpath is declared in root `package.json` exports
 *        - the source file `src/plugin-sdk/<subpath>.ts` (or sibling) exists
 *        - every value-symbol imported is exported by that source file
 *      Catches the "ReferenceError: X is not defined" class (Class A) and the
 *      "Cannot find module .../plugin-sdk/root-alias.cjs/X" class (Class B)
 *      before any build runs.
 *
 *   2. BUILT-ARTIFACT SCAN (when `dist/` exists)
 *      Confirms each declared `./plugin-sdk/<subpath>` export resolves to a
 *      real file under `dist/`. Catches missing emit when the bundler is
 *      configured but a subpath was added to package.json exports without a
 *      matching entry source.
 *
 *   3. PACKAGED-INSTALL SCAN (opt-in via --tarball)
 *      Loads the published tarball into a clean temp workspace, runs
 *      `<bin>/enclawed plugins doctor --json`, parses the JSON, and asserts
 *      zero failures other than an explicit allowlist.
 *
 * Allowlisting:
 *   `--allow-plugin <id>` may be repeated. Plugin IDs in the allowlist are
 *   excluded from the failure totals. Use only for known-orthogonal failures
 *   (version-floor peer-dep mismatches, intentionally-stripped plugins) that
 *   the team has triaged and accepted.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function writeStdoutSync(text) {
  // process.stdout.write is async-on-pipe; for large reports we need a
  // blocking write or downstream readers see a truncated head.
  const buf = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buf.length) {
    const written = writeSync(1, buf, offset, buf.length - offset);
    if (written <= 0) break;
    offset += written;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

const VALUE_SYMBOL_RE = /^([A-Z_][A-Z0-9_]*|[a-z_][a-zA-Z0-9_]*)$/;
const SOURCE_EXTENSIONS = [".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs"];

function parseArgs(argv) {
  const args = {
    tarball: null,
    json: false,
    allowPlugins: new Set(),
    strict: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tarball") {
      args.tarball = argv[i + 1];
      i += 1;
    } else if (arg === "--allow-plugin") {
      args.allowPlugins.add(argv[i + 1]);
      i += 1;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--strict") {
      args.strict = true;
    }
  }
  return args;
}

/**
 * Extract the last balanced top-level JSON object (or array) from a string.
 *
 * Handles multi-line pretty-printed JSON, JSON interleaved with non-JSON
 * status lines (e.g. \"loading…\" stdout printed by the doctor before the
 * final report), and properly skips braces inside string literals (with
 * escape support).
 *
 * Strategy:
 *  - Scan left-to-right for the start of every top-level `{` or `[`
 *  - For each candidate start, walk forward tracking depth + string state
 *  - On depth returning to zero, record the [start, end] slice as a
 *    candidate balanced object/array
 *  - Return the LAST such slice (the doctor's final JSON object always
 *    follows any preliminary output)
 *
 * Returns null when no balanced object/array can be located.
 *
 * @param {string} input
 * @returns {string | null}
 */
export function extractLastJsonObject(input) {
  if (typeof input !== "string" || input.length === 0) {
    return null;
  }
  let lastParseable = null;
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch !== "{" && ch !== "[") {
      i += 1;
      continue;
    }
    const openChar = ch;
    const closeChar = ch === "{" ? "}" : "]";
    const start = i;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let j = i; j < input.length; j += 1) {
      const c = input[j];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c === "\\") {
          escaped = true;
        } else if (c === '"') {
          inString = false;
        }
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === openChar) {
        depth += 1;
      } else if (c === closeChar) {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end >= 0) {
      const candidate = input.slice(start, end + 1);
      // Brace-balance is necessary but not sufficient — strings like
      // \"[doctor] bye\" are bracket-balanced but not valid JSON. Validate
      // with JSON.parse so non-JSON noise (log lines, ANSI-coloured
      // status text wrapped in [brackets]) is filtered out.
      try {
        JSON.parse(candidate);
        lastParseable = candidate;
      } catch {
        // not parseable JSON — ignore
      }
      i = end + 1;
    } else {
      // Unbalanced; abandon this candidate and keep scanning past the
      // opening brace so we don't infinite-loop.
      i = start + 1;
    }
  }
  return lastParseable;
}

function walkSourceFiles(rootDir, files = []) {
  let entries;
  try {
    entries = readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(full, files);
    } else if (/\.(m?ts|m?js|c?ts|cjs|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

function readPackageExports() {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  const exported = new Set();
  for (const key of Object.keys(pkg.exports ?? {})) {
    if (key.startsWith("./plugin-sdk/")) {
      exported.add(key.slice("./plugin-sdk/".length));
    }
  }
  return exported;
}

function parseImportClauses(src) {
  // Yields { kind, symbols, isType, subpath }
  // kind: "import" | "export-from"
  // We only return value (non-type) value-name symbols; everything inside a
  // `type {}` import is filtered out.
  const importRe =
    /(?:^|\n)\s*import\s+(?<typeOnly>type\s+)?(?:(?<default>\w+)\s*,\s*)?\{(?<list>[^}]+)\}\s*from\s+["']enclawed\/plugin-sdk\/(?<subpath>[a-zA-Z0-9_-]+)["']/g;
  const exportFromRe =
    /(?:^|\n)\s*export\s+(?<typeOnly>type\s+)?\{(?<list>[^}]+)\}\s+from\s+["']enclawed\/plugin-sdk\/(?<subpath>[a-zA-Z0-9_-]+)["']/g;
  const bareImportRe =
    /(?:^|\n)\s*import\s+(?<name>\w+)\s+from\s+["']enclawed\/plugin-sdk\/(?<subpath>[a-zA-Z0-9_-]+)["']/g;

  const out = [];

  function pushList(rawList, subpath, isType, kind) {
    const symbols = rawList
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        // Inline `type X` within a non-type import block.
        const isInlineType = /^type\s+/.test(entry);
        const cleaned = entry.replace(/^type\s+/, "");
        const asMatch = cleaned.match(/^(\w+)(?:\s+as\s+\w+)?$/);
        if (!asMatch) return null;
        return { name: asMatch[1], isType: isInlineType };
      })
      .filter((entry) => entry && VALUE_SYMBOL_RE.test(entry.name));
    if (!symbols.length) return;
    out.push({ kind, subpath, symbols, isType });
  }

  for (const re of [importRe, exportFromRe]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const isType = Boolean(m.groups.typeOnly);
      pushList(m.groups.list, m.groups.subpath, isType, re === importRe ? "import" : "export-from");
    }
  }

  bareImportRe.lastIndex = 0;
  let m;
  while ((m = bareImportRe.exec(src)) !== null) {
    out.push({
      kind: "default-import",
      subpath: m.groups.subpath,
      symbols: [{ name: m.groups.name, isType: false }],
      isType: false,
    });
  }

  return out;
}

function findSdkSourceFile(subpath) {
  const baseDir = join(REPO_ROOT, "src", "plugin-sdk");
  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = join(baseDir, subpath + ext);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function readExportedValueSymbols(sourceFile, seen = new Set()) {
  if (seen.has(sourceFile)) return new Set();
  seen.add(sourceFile);
  let src;
  try {
    src = readFileSync(sourceFile, "utf8");
  } catch {
    return new Set();
  }

  const exported = new Set();

  // export function foo / export const foo / export class foo / export enum foo
  const declRe =
    /export\s+(?:async\s+)?(?:function\*?|const|let|var|class|enum|interface|type)\s+(\w+)/g;
  for (const m of src.matchAll(declRe)) {
    exported.add(m[1]);
  }

  // export { foo, bar as baz }
  const namedRe = /export\s+\{([^}]+)\}/g;
  for (const m of src.matchAll(namedRe)) {
    for (const part of m[1].split(",")) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const asMatch = cleaned.match(/^(?:type\s+)?\w+\s+as\s+(\w+)$/);
      if (asMatch) {
        exported.add(asMatch[1]);
        continue;
      }
      const bare = cleaned.match(/^(?:type\s+)?(\w+)$/);
      if (bare) exported.add(bare[1]);
    }
  }

  // export * from "./other"   — follow into the next file in the same package.
  const starRe = /export\s+\*\s+from\s+["']([^"']+)["']/g;
  for (const m of src.matchAll(starRe)) {
    const target = m[1];
    let candidatePath = null;
    if (target.startsWith(".")) {
      const base = join(dirname(sourceFile), target.replace(/\.js$/, ""));
      for (const ext of [
        "",
        ".ts",
        ".mts",
        ".cts",
        ".tsx",
        ".js",
        ".mjs",
        ".cjs",
        "/index.ts",
        "/index.mts",
        "/index.js",
      ]) {
        const candidate = base + ext;
        if (!existsSync(candidate)) continue;
        // Skip directories — the "" ext can match a sibling directory of
        // the same name (e.g. `src/logging/` alongside `src/logging.ts`)
        // and readFileSync then EISDIR's, the catch swallows the error,
        // and the entire re-export chain silently returns nothing.
        try {
          if (statSync(candidate).isDirectory()) continue;
        } catch {
          continue;
        }
        candidatePath = candidate;
        break;
      }
    }
    if (candidatePath) {
      for (const s of readExportedValueSymbols(candidatePath, seen)) {
        exported.add(s);
      }
    } else {
      // External or unresolved re-export — be conservative and mark wildcard so
      // we don't flag false positives downstream.
      exported.add("__WILDCARD__");
    }
  }

  return exported;
}

function staticScan() {
  const exported = readPackageExports();
  const extensionFiles = walkSourceFiles(join(REPO_ROOT, "extensions"));
  const missingSubpaths = new Map(); // subpath -> Set of (file)
  const missingSymbols = new Map(); // `${subpath}::${sym}` -> Set of (file)
  const symbolCache = new Map();

  for (const file of extensionFiles) {
    let src;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const clause of parseImportClauses(src)) {
      const { subpath } = clause;
      const sourceFile = findSdkSourceFile(subpath);
      const isExported = exported.has(subpath);
      if (!sourceFile || !isExported) {
        if (!missingSubpaths.has(subpath)) missingSubpaths.set(subpath, new Set());
        missingSubpaths.get(subpath).add(file);
        continue;
      }
      // Source exists. Check value symbols.
      if (!symbolCache.has(sourceFile)) {
        symbolCache.set(sourceFile, readExportedValueSymbols(sourceFile));
      }
      const available = symbolCache.get(sourceFile);
      if (available.has("__WILDCARD__")) {
        continue; // Conservative: can't prove a miss.
      }
      for (const symbol of clause.symbols) {
        if (clause.isType || symbol.isType) continue;
        if (available.has(symbol.name)) continue;
        const key = `${subpath}::${symbol.name}`;
        if (!missingSymbols.has(key)) missingSymbols.set(key, new Set());
        missingSymbols.get(key).add(file);
      }
    }
  }

  return {
    missingSubpaths: [...missingSubpaths.entries()]
      .map(([subpath, files]) => ({ subpath, files: [...files].sort() }))
      .sort((a, b) => a.subpath.localeCompare(b.subpath)),
    missingSymbols: [...missingSymbols.entries()]
      .map(([key, files]) => {
        const [subpath, name] = key.split("::");
        return { subpath, name, files: [...files].sort() };
      })
      .sort((a, b) => a.subpath.localeCompare(b.subpath) || a.name.localeCompare(b.name)),
  };
}

function bundleArtifactScan() {
  const distDir = join(REPO_ROOT, "dist");
  if (!existsSync(distDir)) {
    return { ran: false, reason: "dist/ not present (run `pnpm build` first)" };
  }
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  const missing = [];
  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    if (!key.startsWith("./plugin-sdk/")) continue;
    const target = typeof value === "string" ? value : value?.default;
    if (typeof target !== "string") continue;
    const resolved = resolve(REPO_ROOT, target);
    if (!existsSync(resolved)) {
      missing.push({ exportKey: key, expectedFile: target });
    }
  }
  return { ran: true, missing };
}

function packagedInstallScan(tarballPath, allowPlugins) {
  if (!tarballPath) {
    return { ran: false, reason: "no --tarball provided" };
  }
  const absoluteTarball = resolve(tarballPath);
  if (!existsSync(absoluteTarball)) {
    return { ran: false, reason: `tarball not found: ${absoluteTarball}` };
  }
  const tmp = mkdtempSync(join(tmpdir(), "enclawed-bundle-smoke-"));
  try {
    // When this smoke runs under `npm publish --dry-run` (via prepublishOnly →
    // prepublish-strict), npm exports `npm_config_dry_run=true`. The tarball
    // install below would inherit it and install nothing, leaving no
    // node_modules/.bin and failing the doctor scan spuriously. This temp
    // install must always run for real (it is a throwaway workspace), so strip
    // any inherited dry-run flag.
    const installEnv = { ...process.env, NPM_CONFIG_LOGLEVEL: "error" };
    delete installEnv.npm_config_dry_run;
    delete installEnv["npm_config_dry-run"];
    delete installEnv.NPM_CONFIG_DRY_RUN;
    const installResult = spawnSync(
      "npm",
      ["install", "--no-fund", "--no-audit", "--silent", absoluteTarball],
      {
        cwd: tmp,
        stdio: ["ignore", "inherit", "inherit"],
        env: installEnv,
      },
    );
    if (installResult.status !== 0) {
      return {
        ran: true,
        installFailed: true,
        exitCode: installResult.status,
        signal: installResult.signal,
      };
    }
    // Locate the installed bin entry.
    const installed = join(tmp, "node_modules");
    let binDir = join(installed, ".bin");
    if (!existsSync(binDir)) {
      return {
        ran: true,
        installFailed: true,
        exitCode: -1,
        reason: `no .bin directory after install at ${binDir}`,
      };
    }
    const enclawedBin = join(binDir, "enclawed");
    if (!existsSync(enclawedBin)) {
      return {
        ran: true,
        installFailed: true,
        exitCode: -1,
        reason: `no enclawed bin at ${enclawedBin}`,
      };
    }
    const result = spawnSync(enclawedBin, ["plugins", "doctor", "--json"], {
      cwd: tmp,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      encoding: "utf8",
    });
    if (result.status !== 0) {
      return {
        ran: true,
        commandFailed: true,
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }
    let parsed;
    try {
      // doctor --json may print multi-line pretty-printed JSON interleaved
      // with non-JSON status lines. Walk braces to extract the last
      // balanced top-level object (or array) and JSON.parse that.
      const lastObject = extractLastJsonObject(result.stdout);
      if (lastObject === null) {
        throw new Error("no balanced JSON object found in doctor --json output");
      }
      parsed = JSON.parse(lastObject);
    } catch (err) {
      return {
        ran: true,
        parseFailed: true,
        stdout: result.stdout,
        error: String(err),
      };
    }
    const violations = [];
    for (const entry of parsed.plugins ?? []) {
      if (entry.status === "error" && !allowPlugins.has(entry.id)) {
        violations.push({
          kind: "plugin-error",
          id: entry.id,
          error: entry.error,
          failurePhase: entry.failurePhase,
        });
      }
    }
    for (const diag of parsed.diagnostics ?? []) {
      if (diag.level !== "error") continue;
      if (diag.pluginId && allowPlugins.has(diag.pluginId)) continue;
      violations.push({
        kind: "diagnostic",
        pluginId: diag.pluginId,
        message: diag.message,
      });
    }
    return {
      ran: true,
      doctorSummary: parsed.summary,
      pluginCount: parsed.plugins?.length ?? 0,
      violations,
    };
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const staticResult = staticScan();
  const bundleResult = bundleArtifactScan();
  const packagedResult = packagedInstallScan(args.tarball, args.allowPlugins);

  if (args.json) {
    // Write through a synchronous fd so big reports don't get sliced by the
    // pipe-buffer high-water mark when consumers use spawnSync + JSON.parse.
    const payload = JSON.stringify(
      { static: staticResult, bundle: bundleResult, packaged: packagedResult },
      null,
      2,
    );
    writeStdoutSync(`${payload}\n`);
  } else {
    const out = [];
    out.push("=== Static scan (extensions/ -> src/plugin-sdk/) ===");
    if (staticResult.missingSubpaths.length === 0 && staticResult.missingSymbols.length === 0) {
      out.push("  OK: every imported plugin-sdk subpath and value-symbol resolves.");
    } else {
      out.push(`  Missing subpath files (Class B): ${staticResult.missingSubpaths.length}`);
      for (const entry of staticResult.missingSubpaths.slice(0, 20)) {
        out.push(`    - ${entry.subpath}  (first user: ${entry.files[0]})`);
      }
      if (staticResult.missingSubpaths.length > 20) {
        out.push(`    ... ${staticResult.missingSubpaths.length - 20} more`);
      }
      out.push(`  Missing value symbols (Class A): ${staticResult.missingSymbols.length}`);
      for (const entry of staticResult.missingSymbols.slice(0, 20)) {
        out.push(`    - @enclawed/plugin-sdk/${entry.subpath} :: ${entry.name}`);
      }
      if (staticResult.missingSymbols.length > 20) {
        out.push(`    ... ${staticResult.missingSymbols.length - 20} more`);
      }
    }
    out.push("");
    out.push("=== Bundle artifact scan ===");
    if (!bundleResult.ran) {
      out.push(`  Skipped: ${bundleResult.reason}`);
    } else if (bundleResult.missing.length === 0) {
      out.push("  OK: every package.json plugin-sdk export resolves to an emitted file.");
    } else {
      out.push(`  Missing emitted artifacts: ${bundleResult.missing.length}`);
      for (const entry of bundleResult.missing.slice(0, 20)) {
        out.push(`    - ${entry.exportKey}  ->  ${entry.expectedFile}`);
      }
    }
    out.push("");
    out.push("=== Packaged-install scan ===");
    if (!packagedResult.ran) {
      out.push(`  Skipped: ${packagedResult.reason}`);
    } else if (packagedResult.installFailed || packagedResult.commandFailed || packagedResult.parseFailed) {
      out.push("  FAILED:");
      out.push(`    ${JSON.stringify(packagedResult, null, 2)}`);
    } else if (packagedResult.violations.length === 0) {
      out.push(
        `  OK: ${packagedResult.pluginCount} plugins loaded; no errors after allowlist.`,
      );
    } else {
      out.push(`  Violations: ${packagedResult.violations.length}`);
      for (const v of packagedResult.violations.slice(0, 50)) {
        out.push(`    - ${JSON.stringify(v)}`);
      }
    }
    process.stdout.write(out.join("\n") + "\n");
  }

  // Exit behavior:
  //   - In default mode the script always exits 0 so devs can read the report.
  //   - --strict makes it exit 1 if ANY layer found a violation that isn't
  //     accounted for. CI passes --strict.
  if (!args.strict) return 0;
  if (staticResult.missingSubpaths.length > 0) return 1;
  if (staticResult.missingSymbols.length > 0) return 1;
  if (bundleResult.ran && bundleResult.missing.length > 0) return 1;
  if (packagedResult.ran) {
    if (packagedResult.installFailed || packagedResult.commandFailed || packagedResult.parseFailed) {
      return 1;
    }
    if ((packagedResult.violations ?? []).length > 0) return 1;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
