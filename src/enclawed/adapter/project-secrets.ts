// enclawed adapter kit: a recursive project search must not hand the model
// what the project's secret files hold (M6).
//
// `grep -rn TOKEN .`, a search tool over the project, `find . -exec cat {} +`
// read every file below the project, `.env` files included. Asking on every
// search would ask on nearly every search, so instead the result is cleaned
// before the model reads it:
//
//   - a line a search labels with a secret file's path (`.env:3:KEY=v`,
//     `.env-3-KEY=v`, `config/.env.local:KEY=v`) loses its content;
//   - the values the project's secret files hold (the values of `.env`-style
//     files, the string values of credentials/secrets JSON) are removed
//     wherever they appear, whatever the output's format.
//
// A value is removed when its key is credential-shaped (any value of four
// characters or more) or when it is long and mixed (sixteen or more
// characters with letters and digits): `PORT=3000` or `DEBUG=true` stay, so
// ordinary output is not changed. Templates (`.env.example`, ...) are not
// secret files.

import fs from "node:fs";
import path from "node:path";
import { credentialFindings, credentialPathOf } from "./credentials.js";
import { credentialLike } from "./env-trust.js";
import { secretContentOf } from "./secret-content.js";

const MAX_ENTRIES = 5000;
const MAX_DEPTH = 8;
const MAX_FILE_BYTES = 256 * 1024;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  ".venv",
  "venv",
  "__pycache__",
]);

export const SECRET_LINE_PLACEHOLDER = "[content of a secret file removed by Enclawed]";
export const SECRET_VALUE_PLACEHOLDER = "[secret value removed by Enclawed]";

/**
 * The secret files below `dir` (bounded walk, directory links not followed).
 * A link is a secret file when it is named like one or when what it resolves
 * to is a credential store (`home`'s too) or a secret by its content: the
 * target is returned, since that is what a read through the link shows.
 */
export function secretFilesBelow(dir: string, home: string | null = null): string[] {
  const out: string[] = [];
  let left = MAX_ENTRIES;
  const stack: [string, number][] = [[dir, 0]];
  while (stack.length && left > 0) {
    const [d, depth] = stack.pop() as [string, number];
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (--left < 0) {
        break;
      }
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (depth < MAX_DEPTH && !SKIP_DIRS.has(e.name)) {
          stack.push([p, depth + 1]);
        }
      } else if (e.isFile() && credentialPathOf(p, null)) {
        out.push(p);
      } else if (e.isSymbolicLink()) {
        let real: string;
        try {
          real = fs.realpathSync(p);
          if (!fs.statSync(real).isFile()) {
            continue;
          }
        } catch {
          continue; // a dangling link shows nothing
        }
        if (
          credentialPathOf(p, null) ||
          credentialPathOf(real, home) ||
          secretContentOf(real, credentialFindings)
        ) {
          out.push(real);
        }
      }
    }
  }
  return out.toSorted();
}

const MIXED = /^(?=.*[A-Za-z])(?=.*\d)\S{16,}$/;

function worth(key: string, value: string): boolean {
  const v = value.trim();
  if (v.length < 4) {
    return false;
  }
  return credentialLike(key) || MIXED.test(v);
}

function jsonValues(v: unknown, key: string, out: Set<string>, depth = 0): void {
  if (depth > 16) {
    return;
  }
  if (typeof v === "string") {
    if (worth(key, v)) {
      out.add(v.trim());
    }
  } else if (Array.isArray(v)) {
    for (const x of v) {
      jsonValues(x, key, out, depth + 1);
    }
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      jsonValues(x, k.toUpperCase(), out, depth + 1);
    }
  }
}

/** The secret values a file holds (dotenv lines, or the string values of a JSON document). */
export function secretValuesOf(file: string): string[] {
  let text: string;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) {
      return [];
    }
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = new Set<string>();
  try {
    jsonValues(JSON.parse(text), "", out);
    return [...out];
  } catch {
    /* not JSON: dotenv lines */
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[=:]\s*(.*)$/.exec(line);
    if (!m) {
      continue;
    }
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (worth(m[1].toUpperCase(), v)) {
      out.add(v);
    }
  }
  return [...out];
}

/** A search line labeled with a file path: path:..., path-N-... (grep -A/-B context). */
const LABELED = /^([^\s:]+?)(?::|-\d+-)/;

/** Clean one text: labeled lines of secret files lose their content; known secret values are removed. */
export function redactProjectSecrets(
  text: string,
  values: readonly string[],
  base = "/",
): { text: string; removed: number } {
  let removed = 0;
  const lines = text.split("\n").map((line) => {
    const m = LABELED.exec(line);
    if (m && credentialPathOf(path.resolve(base, m[1]), null)) {
      removed++;
      return `${m[1]}: ${SECRET_LINE_PLACEHOLDER}`;
    }
    return line;
  });
  let out = lines.join("\n");
  // Longest first, so a value that contains another is removed whole.
  for (const v of [...values].toSorted((a, b) => b.length - a.length)) {
    const parts = out.split(v);
    removed += parts.length - 1;
    out = parts.join(SECRET_VALUE_PLACEHOLDER);
  }
  return { text: out, removed };
}

/** Apply redactProjectSecrets to every string inside a tool result (same shape back). */
export function redactProjectSecretsIn(
  v: unknown,
  values: readonly string[],
  base = "/",
  depth = 0,
): { value: unknown; removed: number } {
  if (typeof v === "string") {
    const r = redactProjectSecrets(v, values, base);
    return { value: r.text, removed: r.removed };
  }
  if (depth > 32 || !v || typeof v !== "object") {
    return { value: v, removed: 0 };
  }
  let removed = 0;
  if (Array.isArray(v)) {
    const out = v.map((x: unknown) => {
      const r = redactProjectSecretsIn(x, values, base, depth + 1);
      removed += r.removed;
      return r.value;
    });
    return { value: removed ? out : v, removed };
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    const r = redactProjectSecretsIn(x, values, base, depth + 1);
    removed += r.removed;
    out[k] = r.value;
  }
  return { value: removed ? out : v, removed };
}

/** The values to remove for a project: every secret file below it (and every secret a link in it reaches), read now. */
export function projectSecretValues(projectDir: string, home: string | null = null): string[] {
  const out = new Set<string>();
  for (const f of new Set(secretFilesBelow(projectDir, home))) {
    for (const v of secretValuesOf(f)) {
      out.add(v);
    }
  }
  return [...out];
}
