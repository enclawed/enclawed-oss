// The protected inode index: files and directories (a bind-mounted protected
// directory has its inode under another path), a precomputed index used only
// while its digest matches, and the adapter's state walked first.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  nodeFsProbe,
  protectedInodeIndex,
  writeProtectedInodeIndex,
  type ProtectedSet,
} from "./fs-probe.js";

let root: string;
let state: string;
let prot: ProtectedSet;

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "enclawed-protinode-")));
  state = path.join(root, "state");
  fs.mkdirSync(path.join(state, "sub"), { recursive: true });
  fs.writeFileSync(path.join(state, "audit.log"), "x\n");
  fs.writeFileSync(path.join(state, "sub", "policy.json"), "{}\n");
  prot = { paths: [state], prefixes: [] };
});
afterAll(() => {
  spawnSync("umount", [path.join(root, "bound")]);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("protected inodes", () => {
  it("attack: a hard link to a protected file, from outside, is that file", () => {
    const link = path.join(root, "innocent.txt");
    fs.linkSync(path.join(state, "audit.log"), link);
    expect(nodeFsProbe().hardLink(link, prot)).toMatchObject({
      kind: "protected",
      match: path.join(state, "audit.log"),
    });
  });

  it("attack: a new file under a bind mount of a protected directory is protected (when the mount can be made)", (ctx) => {
    const bound = path.join(root, "bound");
    fs.mkdirSync(bound);
    const m = spawnSync("mount", ["--bind", state, bound]);
    if (m.status !== 0) {
      ctx.skip();
    }
    expect(nodeFsProbe().hardLink(path.join(bound, "sub", "new.json"), prot)).toMatchObject({
      kind: "protected",
    });
    expect(nodeFsProbe().hardLink(path.join(bound, "audit.log"), prot)).toMatchObject({
      kind: "protected",
    });
  });

  it("false positive: an ordinary file and a new file outside the protected trees are not protected", () => {
    fs.writeFileSync(path.join(root, "own.txt"), "y\n");
    expect(nodeFsProbe().hardLink(path.join(root, "own.txt"), prot)).toBeNull();
    expect(nodeFsProbe().hardLink(path.join(root, "nope", "new.txt"), prot)).toBeNull();
  });

  it("a precomputed index is used while its digest matches and ignored when it was changed", () => {
    const file = path.join(root, "index.json");
    const w = writeProtectedInodeIndex(prot, file);
    expect(w.complete).toBe(true);
    expect(w.entries).toBeGreaterThan(2);
    const withIx: ProtectedSet = { ...prot, inodeIndex: { file, digest: w.digest } };
    expect(protectedInodeIndex(withIx).precomputed).toBe(true);
    fs.writeFileSync(file, JSON.stringify({ v: 1, complete: true, entries: [] }));
    expect(protectedInodeIndex({ ...withIx }).precomputed).toBe(false);
    // Still protected through the live walk.
    expect(protectedInodeIndex({ ...withIx }).map.size).toBeGreaterThan(2);
  });

  it("the state paths are walked first, so a small walk budget still covers them", () => {
    const big = path.join(root, "big");
    fs.mkdirSync(big);
    for (let i = 0; i < 50; i++) {
      fs.writeFileSync(path.join(big, `f${i}`), "");
    }
    const st = path.join(root, "head.json");
    fs.writeFileSync(st, "{}");
    const roots = [big, ...[1, 2, 3, 4].map((i) => path.join(big, `f${i}`))];
    const ix = protectedInodeIndex({ paths: roots, prefixes: [], statePaths: [st] }, 3);
    expect(ix.complete).toBe(false);
    expect([...ix.map.values()]).toContain(st);
  });
});
