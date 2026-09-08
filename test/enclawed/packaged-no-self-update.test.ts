// A packaged build must not check for its own updates.
//
// This is a store requirement, not a preference: the store distributes the
// software and owns its updates, so a packaged build that probes a remote for
// a newer version of itself is doing the one thing it must not — whatever it
// then does with the answer.
//
// The test asserts on the thing that would actually be observed: no
// subprocess. Asserting only on the returned value would still pass if the
// check spawned git first and discarded the result.

import { describe, expect, it, vi } from "vitest";

const spawned: string[] = [];
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (cmd: string, ...rest: unknown[]) => {
      spawned.push(cmd);
      return (actual.spawn as (...a: unknown[]) => unknown)(cmd, ...rest);
    },
  };
});

const { checkForUpdates } =
  await import("../../enclawed-apps/executive-assistant/src/scheduler/update-check.ts");
const { deploymentMode, isPackagedBuild, updateOwner, gitUpdateCheckAllowed } =
  await import("../../enclawed-apps/executive-assistant/src/deployment.ts");

const asEnv = (v?: string): NodeJS.ProcessEnv =>
  (v === undefined ? {} : { ENCLAWED_DEPLOYMENT: v }) as NodeJS.ProcessEnv;

describe("deployment mode", () => {
  it("is repo by default", () => {
    expect(deploymentMode(asEnv())).toBe("repo");
    expect(isPackagedBuild(asEnv())).toBe(false);
  });

  it("distinguishes the two packaged shapes, which need opposite behaviour", () => {
    // The whole reason this is not a boolean: a store build must never look
    // for updates, and a standalone build must, because nobody else will.
    expect(deploymentMode(asEnv("store"))).toBe("store");
    expect(deploymentMode(asEnv("standalone"))).toBe("standalone");
    expect(isPackagedBuild(asEnv("store"))).toBe(true);
    expect(isPackagedBuild(asEnv("standalone"))).toBe(true);
  });

  it("names who owns updates in each shape", () => {
    expect(updateOwner(asEnv())).toBe("git");
    expect(updateOwner(asEnv("store"))).toBe("store");
    expect(updateOwner(asEnv("standalone"))).toBe("self");
  });

  it("allows the git check only where there is a checkout to check", () => {
    expect(gitUpdateCheckAllowed(asEnv())).toBe(true);
    expect(gitUpdateCheckAllowed(asEnv("store"))).toBe(false);
    expect(gitUpdateCheckAllowed(asEnv("standalone"))).toBe(false);
  });

  it("treats an unrecognised value as repo rather than guessing a mode", () => {
    expect(deploymentMode(asEnv("packaged"))).toBe("repo");
    expect(deploymentMode(asEnv(""))).toBe("repo");
  });
});

describe("packaged builds do not run the git update check", () => {
  it("refuses without spawning anything", async () => {
    const before = process.env.ENCLAWED_DEPLOYMENT;
    process.env.ENCLAWED_DEPLOYMENT = "store";
    spawned.length = 0;
    try {
      const result = await checkForUpdates({ repoRoot: process.cwd() });
      expect(result.kind).toBe("unavailable");
      // The point of the test: git was never invoked, nor `which`/`where`
      // looking for it.
      expect(spawned, `spawned: ${spawned.join(", ")}`).toHaveLength(0);
    } finally {
      if (before === undefined) {
        delete process.env.ENCLAWED_DEPLOYMENT;
      } else {
        process.env.ENCLAWED_DEPLOYMENT = before;
      }
    }
  });

  it("DOES spawn in repo mode, which is what makes the assertion above mean something", async () => {
    // Without this, "no spawns" could just mean the spy is not wired up and
    // the test would pass no matter what the code did.
    const before = process.env.ENCLAWED_DEPLOYMENT;
    delete process.env.ENCLAWED_DEPLOYMENT;
    spawned.length = 0;
    try {
      await checkForUpdates({
        repoRoot: process.cwd(),
        // Keep it short: reaching the network is not the point, spawning is.
        fetchTimeoutMs: 1_000,
        revParseTimeoutMs: 1_000,
      });
      expect(spawned.length, "repo mode spawned nothing: the spy is not observing").toBeGreaterThan(
        0,
      );
    } finally {
      if (before !== undefined) {
        process.env.ENCLAWED_DEPLOYMENT = before;
      }
    }
  });

  it("says why, in words an operator can act on", async () => {
    const before = process.env.ENCLAWED_DEPLOYMENT;
    process.env.ENCLAWED_DEPLOYMENT = "store";
    try {
      const result = await checkForUpdates({ repoRoot: process.cwd() });
      expect(result.kind === "unavailable" && result.reason).toMatch(/application store/i);
    } finally {
      if (before === undefined) {
        delete process.env.ENCLAWED_DEPLOYMENT;
      } else {
        process.env.ENCLAWED_DEPLOYMENT = before;
      }
    }
  });
});
