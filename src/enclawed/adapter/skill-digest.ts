// enclawed adapter kit: the content digest of a skill directory, the pin
// skill admission (./skills.ts) attests and per-call skill attribution
// (./skill-conformance.ts) and the skill launcher (./contained-launch.ts)
// check again. Kept apart from ./skills.ts so the decision path does not
// load the formal pipeline.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalJson } from "../mcp-tool-pins.js";

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const sha256Hex = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/**
 * The digest of every file in the skill's directory (SKILL.md included). A
 * symbolic link, a special file or an oversized file is a problem: its
 * content is not pinned.
 */
export function contentDigest(dir: string): {
  digest: string;
  files: Record<string, string>;
  problems: string[];
} {
  const files: Record<string, string> = {};
  const problems: string[] = [];
  let count = 0;
  const walk = (d: string) => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(d, { withFileTypes: true });
    } catch (err) {
      problems.push(
        `cannot list ${d}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`,
      );
      return;
    }
    for (const e of names.toSorted((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      const rel = path.relative(dir, p).split(path.sep).join("/");
      if (++count > MAX_FILES) {
        problems.push(`more than ${MAX_FILES} files`);
        return;
      }
      if (e.isSymbolicLink()) {
        problems.push(`${rel} is a symbolic link`);
      } else if (e.isDirectory()) {
        walk(p);
      } else if (e.isFile()) {
        try {
          const st = fs.statSync(p);
          if (st.size > MAX_FILE_BYTES) {
            problems.push(`${rel} is larger than ${MAX_FILE_BYTES} bytes`);
            continue;
          }
          files[rel] = sha256Hex(fs.readFileSync(p));
        } catch (err) {
          problems.push(
            `cannot read ${rel}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`,
          );
        }
      } else {
        problems.push(`${rel} is not a regular file`);
      }
    }
  };
  walk(dir);
  return { digest: sha256Hex(canonicalJson(files)), files, problems };
}
