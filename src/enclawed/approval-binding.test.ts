import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { describeResourceChange, resolveFsResource } from "./approval-binding.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "approval-binding-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("approval target identity", () => {
  it("an in-place write keeps the approved identity", async () => {
    const p = path.join(root, "kept.txt");
    fs.writeFileSync(p, "v1");
    const approved = await resolveFsResource(p);
    fs.appendFileSync(p, "+more");
    expect(describeResourceChange(approved, await resolveFsResource(p))).toBeNull();
  });

  it("attack: a file deleted and recreated under the same name is another file, even when the inode number is reused", async () => {
    const p = path.join(root, "swapped.txt");
    fs.writeFileSync(p, "v1");
    const approved = await resolveFsResource(p);
    // The inode number of a deleted file is free at once; the same (dev, ino) on the new file
    // is the case a (dev, ino) comparison alone misses. Its birth time is new.
    const reused = { ...approved, born: approved.born === null ? null : `${approved.born}1` };
    if (approved.born !== null) {
      expect(describeResourceChange(approved, reused)).toMatch(/replaced by another file/);
    }
    fs.rmSync(p);
    fs.writeFileSync(`${p}.n`, "o");
    fs.renameSync(`${p}.n`, p);
    expect(describeResourceChange(approved, await resolveFsResource(p))).toMatch(
      /replaced by another file/,
    );
  });

  it("attack: a directory renamed away and recreated is another directory", async () => {
    const dir = path.join(root, "docs");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "v1");
    const approved = await resolveFsResource(path.join(dir, "a.txt"));
    const parentReused = {
      ...approved,
      parent: {
        ...approved.parent,
        born: approved.parent.born === null ? null : `${approved.parent.born}1`,
      },
    };
    if (approved.parent.born !== null) {
      expect(describeResourceChange(approved, parentReused)).toMatch(/renamed or replaced/);
    }
  });

  it("an identity recorded without birth times (an older stored hold) compares as before", async () => {
    const p = path.join(root, "legacy.txt");
    fs.writeFileSync(p, "v1");
    const now = await resolveFsResource(p);
    const legacy = JSON.parse(JSON.stringify(now)) as Record<string, unknown> & {
      parent: Record<string, unknown>;
    };
    delete legacy.born;
    delete legacy.parent.born;
    expect(describeResourceChange(legacy as never, now)).toBeNull();
  });
});
