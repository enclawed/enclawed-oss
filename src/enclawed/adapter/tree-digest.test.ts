// Tree digests of large trees: the incremental hash cache (stat identity with
// the change time), a full rehash at pin time, streaming hashes, and bounds
// raised so a large legitimate environment can be pinned.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256File, treeDigest, treeHashCache } from "./tree-digest.js";

let root: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-tree-digest-")));
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const tree = (name: string, files: Record<string, string>) => {
  const d = path.join(root, name);
  for (const [f, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), body);
  }
  return d;
};

describe("the incremental hash cache", () => {
  it("false positive: a cached tree digests the same as a full rehash, and a saved cache is reused", () => {
    const d = tree("t1", { "a.py": "print(1)\n", "pkg/b.py": "x = 2\n" });
    const full = treeDigest(d).digest;
    const file = path.join(root, "state", "hash-cache.json");
    const pinTime = treeHashCache(file, { refresh: true });
    expect(treeDigest(d, { cache: pinTime }).digest).toBe(full);
    pinTime.save();
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    // Launch: every hash from the cache (a cache that would lie is not consulted
    // for files whose identity changed; here nothing changed).
    let reads = 0;
    const launch = treeHashCache(file);
    const counting = {
      get: (f: string, id: string) => {
        const v = launch.get(f, id);
        reads += v ? 1 : 0;
        return v;
      },
      set: launch.set,
    };
    expect(treeDigest(d, { cache: counting }).digest).toBe(full);
    expect(reads).toBe(2);
  });

  it("attack: a file rewritten with the same size and its modification time set back is hashed again", () => {
    const d = tree("t2", { "mod.py": "safe = 1\n" });
    const file = path.join(root, "state", "c2.json");
    const c = treeHashCache(file, { refresh: true });
    const pinned = treeDigest(d, { cache: c }).digest;
    c.save();
    const p = path.join(d, "mod.py");
    const st = fs.statSync(p, { bigint: true });
    fs.writeFileSync(p, "evil = 1\n");
    // The modification time set back to the nanosecond (what a user can do).
    const ns = st.mtimeNs;
    const stamp = `@${ns / 1_000_000_000n}.${String(ns % 1_000_000_000n).padStart(9, "0")}`;
    expect(spawnSync("touch", ["-m", "-d", stamp, p]).status).toBe(0);
    const now = fs.statSync(p, { bigint: true });
    expect(now.size).toBe(st.size);
    expect(now.mtimeNs).toBe(st.mtimeNs);
    expect(now.ino).toBe(st.ino);
    expect(treeDigest(d, { cache: treeHashCache(file) }).digest).not.toBe(pinned);
  });

  it("attack: a forged cache entry for a stale identity is not used; pin time reads nothing from the cache", () => {
    const d = tree("t3", { "x.py": "a\n" });
    const file = path.join(root, "state", "c3.json");
    const real = treeDigest(d).digest;
    const p = path.join(d, "x.py");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ v: 1, files: { [p]: ["0:0:2:0:0", "0".repeat(64)] } }));
    expect(treeDigest(d, { cache: treeHashCache(file) }).digest).toBe(real);
    // Even an entry naming the live identity is ignored at pin time.
    const live = (() => {
      const st = fs.lstatSync(p, { bigint: true });
      return `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`;
    })();
    fs.writeFileSync(file, JSON.stringify({ v: 1, files: { [p]: [live, "0".repeat(64)] } }));
    expect(treeDigest(d, { cache: treeHashCache(file, { refresh: true }) }).digest).toBe(real);
  });

  it("false positive: a tree over the old bounds (more than 50,000 files) is pinned; large files hash by streaming", () => {
    const d = path.join(root, "big");
    fs.mkdirSync(d);
    for (let i = 0; i < 260; i++) {
      const sub = path.join(d, `d${i}`);
      fs.mkdirSync(sub);
      for (let j = 0; j < 200; j++) {
        fs.writeFileSync(path.join(sub, `f${j}.py`), "");
      }
    }
    const r = treeDigest(d);
    expect(r.files).toBe(52_000);
    const big = path.join(root, "big.bin");
    const buf = Buffer.alloc(5 * 1024 * 1024 + 7, 7);
    fs.writeFileSync(big, buf);
    expect(sha256File(big)).toBe(createHash("sha256").update(buf).digest("hex"));
  }, 120_000);
});
