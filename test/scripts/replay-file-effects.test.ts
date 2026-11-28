// The ground-truth replay's file effects (scripts/bench/replay-ground-truth/file-effects.mjs):
// what a recorded Bash line did to the run's files, applied with fs only where exact. Each
// shape is checked against the real shell on a throwaway directory.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyFileEffects,
  formatDay,
  runDay,
} from "../../scripts/bench/replay-ground-truth/file-effects.mjs";

const make = () => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "replay-fe-")));
  fs.mkdirSync(path.join(d, "data"));
  fs.writeFileSync(path.join(d, "data/a.txt"), "a\n");
  fs.writeFileSync(path.join(d, "data/b.txt"), "b\n");
  return d;
};
const tree = (d: string): string[] => {
  const out: string[] = [];
  const walk = (x: string) => {
    for (const e of fs.readdirSync(x, { withFileTypes: true })) {
      const p = path.join(x, e.name);
      if (e.isDirectory()) {
        out.push(`${path.relative(d, p)}/`);
        walk(p);
      } else {
        out.push(`${path.relative(d, p)} ${fs.readFileSync(p, "utf8")}`);
      }
    }
  };
  walk(d);
  return out.toSorted();
};

describe("replay file effects", () => {
  it("applies exactly what the shell does, or nothing", () => {
    const day = "2026-11-22";
    for (const line of [
      "mkdir -p archive/day && cp -p data/a.txt data/b.txt archive/day/ && cmp data/a.txt archive/day/a.txt && rm data/a.txt data/b.txt",
      "rm data/zz && echo no",
      "rm -f data/zz || echo yes; touch t1",
      "cp data/* archive/day2/ && rm data/a.txt",
      "mkdir out; mv data/b.txt out/ ; ls out",
      "set -e\nrm data/zz\nrm data/a.txt",
      'cd "data" && mkdir -p ../keep && cp a.txt ../keep/ && sha256sum a.txt ../keep/a.txt',
      'set -e\nd="archive/$(date +%F)"\nmkdir -p "$d"\ncp -p data/* "$d"/\nfor f in data/*; do cmp "$f" "$d/$(basename "$f")" && echo ok; done\nsha256sum data/* "$d"/*',
    ]) {
      const a = make();
      const b = make();
      try {
        const r = applyFileEffects(line, a, a, day);
        spawnSync("bash", ["-c", line], {
          cwd: b,
          env: { PATH: process.env.PATH, TZ: "UTC", FAKETIME: "" },
        });
        // The shell's date is today's: compare with the day the line was given instead.
        const expected = tree(b).map((x) =>
          x.replace(/^archive\/\d{4}-\d\d-\d\d/, `archive/${day}`),
        );
        expect(r, line).toBe(true);
        expect(tree(a), line).toEqual(expected);
      } finally {
        fs.rmSync(a, { recursive: true, force: true });
        fs.rmSync(b, { recursive: true, force: true });
      }
    }
  });

  it("changes nothing when an effect would follow a status it cannot know, or a part is unknown", () => {
    for (const [line, day] of [
      ["for f in data/*; do cmp $f x || exit 1; done && rm data/a.txt", "2026-11-22"],
      ['d="archive/$(date +%F)" && mkdir -p "$d"', null],
      ['mkdir -p "archive/$(date +%H)"', "2026-11-22"],
      ["node build.js && rm data/a.txt", "2026-11-22"],
      ["cat data/a.txt > data/c.txt", "2026-11-22"],
      ["mkdir -p ../outside", "2026-11-22"],
    ] as const) {
      const a = make();
      const before = tree(a);
      try {
        expect(applyFileEffects(line, path.join(a, "data", ".."), a, day), line).toBeNull();
        expect(tree(a), line).toEqual(before);
      } finally {
        fs.rmSync(a, { recursive: true, force: true });
      }
    }
  });

  it("knows the run's day only when its start and end fall on the same day in the sandbox's zone", () => {
    const tz = "America/Los_Angeles";
    // 2026-11-23T05:00Z is 21:00 on the 22nd in Los Angeles; the run started at most 10 min before.
    expect(runDay({ ts: "2026-11-23T05:00:00.000Z", durationS: 120 }, tz)).toBe("2026-11-22");
    // 08:02Z is 00:02 on the 23rd: the run may have started on the 22nd.
    expect(runDay({ ts: "2026-11-23T08:02:00.000Z", durationS: 60 }, tz)).toBeNull();
    expect(runDay({ ts: "not a time" }, tz)).toBeNull();
    expect(formatDay("%F", "2026-11-22")).toBe("2026-11-22");
    expect(formatDay("%Y%m%d", "2026-11-22")).toBe("20261122");
    expect(formatDay("%Y-%m-%d_%H", "2026-11-22")).toBeNull();
  });
});
