// The readers that decide what a contained run may do query the filesystem
// only through the containment's view (./view-fs.ts): a direct query would see
// this host's files where the containment shows its own.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const here = path.dirname(new URL(import.meta.url).pathname);
const QUERY =
  /\bfs\.(?:existsSync|statSync|lstatSync|realpathSync|readdirSync|accessSync|readFileSync|readlinkSync|openSync|opendirSync|promises|stat|lstat|readdir|readFile|access|realpath|readlink|open)\b/g;

/**
 * Direct queries allowed in a reader module, by the code they sit in and why.
 * engine.ts decides what a command changes and what Enclawed keeps of it
 * (history, backups, snapshots); its reads of files the line writes never
 * decide what runs in the containment.
 */
const ALLOWED: Record<string, readonly (readonly [RegExp, string])[]> = {
  "engine.ts": [
    [
      /\bfs\.\w+/,
      "history, backup and snapshot reads of files the line changes (not containment decisions)",
    ],
  ],
};

describe("the readers query the filesystem only through the view", () => {
  for (const file of ["contained-exec.ts", "python-reader.ts", "engine.ts"]) {
    it(file, () => {
      const text = fs.readFileSync(path.join(here, file), "utf8");
      const found = [...text.matchAll(QUERY)].map((m) => {
        const line = text.slice(0, m.index).split("\n").length;
        return `${file}:${line}: ${m[0]}`;
      });
      const allowed = ALLOWED[file] ?? [];
      const left = found.filter((f) => !allowed.some(([re]) => re.test(f)));
      expect(left).toEqual([]);
    });
  }
  // path.resolve/join/relative take `..` off a name without asking the
  // filesystem. In the readers they are sound only because every word of every
  // command (argv, assignment values, redirect targets; script and package-script
  // lines included) is first refused when one of its `..` steps back over a link
  // (contained-exec.ts checkCommand, dotDotOverLink), and the paths Python
  // imports are joined from directories the view resolved. The number of uses is
  // recorded: a new one is reviewed against that rule before the count moves.
  // (+1: regenerated() joins a project directory with fixed lockfile names, no line word.)
  // (+13: mv, ln -s, tar, chmod, the in-place compressors, inReach and inScratchOnly resolve the line's
  // own words, each first checked by the `..` rule, and join them with names the view listed.)
  // (+18: a project virtual environment (projectVenv, venvOfPythonPath, sessionVenvPython,
  // sessionVenvBin): the line's python word, checked by the `..` rule, its directory joined with
  // fixed names (pyvenv.cfg, bin/python3, lib/pythonX.Y/site-packages) and realpaths the view
  // resolved; the session's PATH entries only when none has a `.` or `..` component.)
  // (+2: projectVenv's taint mark, a fixed name joined with the environment's realpath.)
  // (+2: projectVenv's trust message, the environment's realpath relative to the project and
  // its pyvenv.cfg joined to it for the git-tracked check.)
  // (+3: pytestConfigOptions, pytest's settings files joined by fixed names to the run's
  // directory and the ones above it in the project (dirname only), and named in messages.)
  const PATH_CALLS: Record<string, number> = { "contained-exec.ts": 115, "python-reader.ts": 13 };
  for (const [file, max] of Object.entries(PATH_CALLS)) {
    it(`${file}: no path.normalize, the recorded path.resolve/join/relative uses, and the .. rule in place`, () => {
      const text = fs.readFileSync(path.join(here, file), "utf8");
      expect(text).not.toMatch(/\bpath\.normalize\(/);
      const n = text.match(/\bpath\.(?:resolve|join|relative)\(/g)?.length ?? 0;
      expect(n).toBeLessThanOrEqual(max);
      if (file === "contained-exec.ts") {
        expect(text).toMatch(/const over = dotDotOverLink\(cwd, w\);/);
        // Every command's words are the ones its shell passes (file patterns
        // expanded) before any path is taken from them: in the line and in scripts.
        expect(text).toMatch(/c = expandedCommand\(scan, c\);\n\s*const before = prev;/);
        expect(text).toMatch(
          /for \(const c0 of p\.commands\) \{\n\s*const c = expandedCommand\(scan, c0\);/,
        );
      }
    });
  }

  it("the view itself refuses links into the containment's own files", async () => {
    const { resolveViewPath, viewFs, withViewRecord } = await import("./view-fs.js");
    expect(resolveViewPath("/", "/proc/self/root/usr").kind).toBe("refused");
    const r = withViewRecord(() => {
      try {
        return viewFs.existsSync("/proc/self/root/.enclawed/real");
      } catch {
        return false;
      }
    });
    expect(r.refused).toMatch(/leads into/);
    expect(withViewRecord(() => viewFs.existsSync("/dev/null")).refused).toBeNull();
  });
});
