// The toolchain a contained build sees (./build-mode.ts): vendor trees are
// offered read-only only when they hold no credential file; links are kept
// with their chain; a tree's bin goes on PATH.

import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildToolchainPath, buildToolchainTrees } from "./build-mode.js";
import { tempTree } from "./test-helpers.js";

let root: string;
let usrLocal: string;
let opt: string;
beforeAll(() => {
  root = tempTree("build-mode");
  usrLocal = path.join(root, "usr-local");
  opt = path.join(root, "opt");
  for (const d of [
    "usr-local/cuda-13.1/bin",
    "usr-local/mpich/bin",
    "usr-local/etc",
    "usr-local/leaky/share",
    "opt/rocm/bin",
    "opt/vendor/certs",
    "opt/keys/conf",
  ]) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
  fs.symlinkSync(path.join(usrLocal, "cuda-13.1"), path.join(usrLocal, "cuda"));
  fs.symlinkSync("/nonexistent/x", path.join(usrLocal, "dangling"));
  fs.mkdirSync(path.join(root, "home-tree"));
  fs.symlinkSync(path.join(root, "home-tree"), path.join(usrLocal, "points-out"));
  fs.writeFileSync(path.join(usrLocal, "leaky", "share", ".env"), "TOKEN=x\n");
  // A CA bundle is no secret; a private key is.
  fs.writeFileSync(path.join(opt, "vendor", "certs", "ca.pem"), "-----BEGIN CERTIFICATE-----\nx\n");
  fs.writeFileSync(
    path.join(opt, "keys", "conf", "server.key"),
    "-----BEGIN PRIVATE KEY-----\nx\n",
  );
});
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("contained build: vendor toolchain trees", () => {
  it("offers trees and links to them; never a tree with a credential file, configuration, a dangling link or a link out", () => {
    const trees = buildToolchainTrees([usrLocal, opt]);
    expect(trees.toSorted()).toEqual(
      [
        path.join(usrLocal, "cuda"),
        path.join(usrLocal, "cuda-13.1"),
        path.join(usrLocal, "mpich"),
        path.join(opt, "rocm"),
        path.join(opt, "vendor"),
      ].toSorted(),
    );
    expect(buildToolchainPath(trees)).toContain(path.join(usrLocal, "cuda", "bin"));
    expect(buildToolchainPath(trees)).toContain(path.join(opt, "rocm", "bin"));
    expect(buildToolchainPath(trees)).not.toContain(path.join(opt, "vendor", "bin"));
  });
});

describe("contained build: the name guard's build names", () => {
  it("only a build's guard makes its own thread names writable and refuses every path in .git and every .pth file; a pinned run's does not", async () => {
    const { nameGuardConfig } = await import("./name-guard.js");
    const build = nameGuardConfig(["/p"], [], [], null, [], [], false, "project-script", [], {
      build: true,
    }).split("\n");
    const pinned = nameGuardConfig(["/p"], [], [], null, [], [], false, "project-script").split(
      "\n",
    );
    for (const l of ["commwrite 1", "dir .git", "suffix .pth"]) {
      expect(build).toContain(l);
      expect(pinned).not.toContain(l);
    }
    expect(build.some((l) => l.startsWith("exempt "))).toBe(false);
    expect(pinned).toContain("exempt node_modules");
  });
});
