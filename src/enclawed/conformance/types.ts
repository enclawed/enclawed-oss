// Types and helpers shared by the conformance checks.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEgressRunner } from "@enclawed/egress-core";
import { makeLabel, LEVEL } from "../classification.js";
import type { Flavor } from "../flavor.js";
import { createPolicy } from "../policy.js";
import { setRuntime, type EnclawedRuntime } from "../runtime.js";

export type ConformanceStatus = "pass" | "fail" | "skip";

export type ConformanceCheck = Readonly<{
  /** Stable id (also the README's invariant id). */
  id: string;
  /** Short name of the guarantee. */
  title: string;
  /** What a PASS proves, in plain terms. */
  proves: string;
  /** What to do when it fails. */
  remedy: string;
  /** Throws on a failure; returns { skip } when the check cannot run here. */
  run: () => Promise<void | { skip: string }>;
}>;

export type ConformanceCheckResult = Readonly<{
  id: string;
  title: string;
  proves: string;
  status: ConformanceStatus;
  detail?: string;
  remedy?: string;
  durationMs?: number;
}>;

export type ConformanceReport = Readonly<{
  ok: boolean;
  passed: number;
  failed: number;
  skipped: number;
  results: readonly ConformanceCheckResult[];
}>;

export class ConformanceSkip {
  constructor(readonly skip: string) {}
}

/** A failed expectation inside a check. */
export function expectThat(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

type PolicyInput = Parameters<typeof createPolicy>[0];

export type SandboxAudit = { type: string; payload: Record<string, unknown> }[];

/**
 * Install a sandbox runtime (the given flavor and policy, an in-memory
 * audit sink) for the rest of the check. The runner restores the process
 * runtime afterwards.
 */
export function installSandboxRuntime(
  flavor: Flavor,
  policy: Partial<PolicyInput> = {},
): SandboxAudit {
  const records: SandboxAudit = [];
  setRuntime({
    flavor,
    policy: createPolicy({
      enforceAllowlists: false,
      maxOutputClearance: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      defaultDataLabel: makeLabel({ level: LEVEL.UNCLASSIFIED }),
      ...policy,
    } as PolicyInput),
    audit: {
      append: async (r: { type: string; payload: Record<string, unknown> }) => {
        records.push(r);
      },
      flush: async () => {},
      failure: null,
    },
    restoreFetch: () => {},
    fipsRequired: false,
    moduleDecisions: null,
  } as unknown as EnclawedRuntime);
  return records;
}

/** A throwaway directory, removed when `run` settles. */
export async function withTempDir<T>(prefix: string, run: (dir: string) => Promise<T>): Promise<T> {
  // Random root from mkdtemp; the label only names a subdirectory inside it.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "enclawed-conformance-"));
  try {
    const dir = path.join(root, prefix.replace(/[^A-Za-z0-9_-]/g, "_") || "check");
    await fs.mkdir(dir, { mode: 0o700 });
    return await run(dir);
  } finally {
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }
}

/** Run with environment variables set (undefined removes one), then restore them. */
export async function withEnv<T>(
  vars: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return await run();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

/**
 * Whether the egress pipeline runs on this installation. An edition that
 * licenses the covert-channel suite refuses to run it unlicensed (fail
 * closed); the checks then verify the refusal instead of the mediation.
 */
export async function egressSuiteLicensed(): Promise<boolean> {
  try {
    await createEgressRunner({ stages: [] })("probe", { kind: "channel", id: "conformance" });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "EgressUnlicensedError") {
      return false;
    }
    throw err;
  }
}
