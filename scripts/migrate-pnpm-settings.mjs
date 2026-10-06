#!/usr/bin/env node
// Move the package.json `pnpm` field into pnpm-workspace.yaml.
//
// pnpm stopped reading `pnpm.*` from package.json and now warns:
//
//   [WARN] The "pnpm" field in package.json is no longer read by pnpm.
//          The following keys were ignored: "pnpm.overrides".
//
// That warning is not cosmetic. `overrides` is where transitive
// dependencies get pinned to patched versions, so an ignored block is a
// set of security pins that silently stopped applying. Where a key
// exists in BOTH files the YAML value is what pnpm currently uses and
// the package.json value is the one being dropped — usually the newer
// bump, since bumps kept landing in the file nobody noticed was dead.
//
//   node scripts/migrate-pnpm-settings.mjs --check [--tree <path>]
//   node scripts/migrate-pnpm-settings.mjs         [--tree <path>]
//
// --check reports what would change and exits non-zero if anything
// would. Every conflict is printed with both values and the winner, so
// the version choices are reviewable rather than silent.
//
// --prefer selects the winner on a conflict: "package-json" (default,
// adopts the dropped bump) or "yaml" (keeps what pnpm resolves today).

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: process.argv.slice(2),
  strict: true,
  options: {
    tree: { type: "string" },
    check: { type: "boolean", default: false },
    prefer: { type: "string", default: "package-json" },
  },
});

if (values.prefer !== "package-json" && values.prefer !== "yaml") {
  process.stderr.write(`--prefer must be "package-json" or "yaml"\n`);
  process.exit(64);
}

const root = path.resolve(values.tree ?? process.cwd());
const packageJsonPath = path.join(root, "package.json");
const workspacePath = path.join(root, "pnpm-workspace.yaml");

for (const file of [packageJsonPath, workspacePath]) {
  if (!fs.existsSync(file)) {
    process.stderr.write(`not found: ${file}\n`);
    process.exit(2);
  }
}

const packageJsonText = fs.readFileSync(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonText);
const pnpmField = packageJson.pnpm;

if (!pnpmField || Object.keys(pnpmField).length === 0) {
  process.stdout.write(`${root}: package.json has no \`pnpm\` field; nothing to migrate.\n`);
  process.exit(0);
}

const workspaceText = fs.readFileSync(workspacePath, "utf8");

/**
 * Locate one top-level block by line. The block is never re-rendered:
 * these files carry a comment above almost every pin explaining which
 * advisory it answers, and a YAML round-trip — or any parser that treats
 * a `# ...` line as an entry — destroys that audit trail. Only the
 * specific lines being changed are rewritten.
 */
function findBlock(lines, key) {
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start === -1) {
    return null;
  }
  let end = start + 1;
  while (end < lines.length && (lines[end].startsWith("  ") || lines[end].trim() === "")) {
    end += 1;
  }
  while (end > start + 1 && lines[end - 1].trim() === "") {
    end -= 1;
  }
  return { start, end };
}

/** Split `  key: value` into its parts, or null for comments and blanks. */
function parseEntryLine(line) {
  if (!line.startsWith("  ")) {
    return null;
  }
  const body = line.slice(2);
  if (body.startsWith("#") || body.trim() === "") {
    return null;
  }
  if (body.startsWith('"')) {
    const match = /^"((?:[^"\\]|\\.)*)"(\s*:\s*)(.*)$/u.exec(body);
    if (!match) {
      return null;
    }
    return { key: match[1], prefixLength: 2 + 1 + match[1].length + 1 + match[2].length };
  }
  const colon = body.indexOf(":");
  if (colon === -1) {
    return null;
  }
  const afterColon = body.slice(colon + 1);
  const spacing = afterColon.length - afterColon.trimStart().length;
  return { key: body.slice(0, colon).trim(), prefixLength: 2 + colon + 1 + spacing };
}

function readValue(line, entry) {
  return line.slice(entry.prefixLength).trim().replace(/^"|"$/gu, "");
}

function writeValue(line, entry, value) {
  return line.slice(0, entry.prefixLength) + JSON.stringify(value);
}

const report = [];

let nextWorkspaceText = workspaceText;
let changed = false;

for (const [fieldName, fieldValue] of Object.entries(pnpmField)) {
  if (fieldValue === null || typeof fieldValue !== "object" || Array.isArray(fieldValue)) {
    report.push(`  ${fieldName}: unsupported shape; move it by hand`);
    continue;
  }
  const incoming = Object.entries(fieldValue);
  if (incoming.length === 0) {
    continue;
  }

  const lines = nextWorkspaceText.split("\n");
  const block = findBlock(lines, fieldName);

  if (!block) {
    // Nothing in the YAML yet, so there is no commentary to preserve.
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    lines.push(
      "",
      `${fieldName}:`,
      ...incoming.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`),
      "",
    );
    nextWorkspaceText = lines.join("\n");
    report.push(
      `  ${fieldName}: added ${incoming.length} entr${incoming.length === 1 ? "y" : "ies"}`,
    );
    changed = true;
    continue;
  }

  // Index the entry lines, ignoring comments and blanks entirely.
  const located = new Map();
  for (let i = block.start + 1; i < block.end; i += 1) {
    const entry = parseEntryLine(lines[i]);
    if (entry) {
      located.set(entry.key, { index: i, entry });
    }
  }

  const appended = [];
  for (const [name, version] of incoming) {
    const found = located.get(name);
    if (!found) {
      appended.push(`  ${JSON.stringify(name)}: ${JSON.stringify(version)}`);
      report.push(`  ${fieldName}["${name}"]: ADDED ${version} (was applied nowhere)`);
      changed = true;
      continue;
    }
    const current = readValue(lines[found.index], found.entry);
    if (current === version) {
      continue;
    }
    const winner = values.prefer === "yaml" ? current : version;
    report.push(
      `  ${fieldName}["${name}"]: CONFLICT yaml=${current} package.json=${version} -> ${winner}`,
    );
    if (winner !== current) {
      // Rewrite only this line's value; its key text and the comment
      // block above it are untouched.
      lines[found.index] = writeValue(lines[found.index], found.entry, winner);
      changed = true;
    }
  }

  if (appended.length > 0) {
    lines.splice(block.end, 0, ...appended);
  }
  nextWorkspaceText = lines.join("\n");
}

// Drop the field itself, preserving the file's exact formatting around it.
// A non-greedy regex is not safe here: the field contains nested objects
// whose closing braces look identical to its own, so the match ends early
// and leaves fragments behind. Scan for the true matching brace instead,
// skipping over string literals.
function removeTopLevelField(text, field) {
  const opener = new RegExp(`\\n([ \\t]*)"${field}":\\s*\\{`, "u").exec(text);
  if (!opener) {
    return null;
  }
  let i = text.indexOf("{", opener.index);
  let depth = 0;
  let inString = false;
  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    }
  }
  if (depth !== 0) {
    return null;
  }
  let end = i + 1;
  let start = opener.index;
  if (text[end] === ",") {
    end += 1;
  } else {
    // The field was last, so the comma that separated it from the
    // previous entry is now dangling.
    const before = text.slice(0, start);
    const comma = before.lastIndexOf(",");
    if (comma !== -1 && before.slice(comma + 1).trim() === "") {
      start = comma;
    }
  }
  return text.slice(0, start) + text.slice(end);
}

const nextPackageJsonText = removeTopLevelField(packageJsonText, "pnpm");
if (nextPackageJsonText === null) {
  process.stderr.write("could not locate the `pnpm` field to remove; aborting without writing\n");
  process.exit(2);
}
JSON.parse(nextPackageJsonText); // fail loudly rather than write invalid JSON

process.stdout.write(`${root}\n`);
process.stdout.write(report.length > 0 ? `${report.join("\n")}\n` : "  (no override changes)\n");
process.stdout.write(
  `  package.json: remove the \`pnpm\` field (${Object.keys(pnpmField).join(", ")})\n`,
);

if (values.check) {
  process.stdout.write("\n--check: nothing written. Re-run without --check to apply.\n");
  process.exit(changed ? 1 : 0);
}

fs.writeFileSync(workspacePath, nextWorkspaceText);
fs.writeFileSync(packageJsonPath, nextPackageJsonText);
process.stdout.write(
  "\nWritten. Re-run `pnpm install` to refresh the lockfile against the merged overrides.\n",
);
