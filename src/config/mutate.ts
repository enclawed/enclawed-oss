import {
  readConfigFileSnapshotForWrite,
  resolveConfigSnapshotHash,
  writeConfigFile,
  type ConfigWriteOptions,
} from "./io.js";
import type { ConfigFileSnapshot, EnclawedConfig } from "./types.js";

export type ConfigMutationBase = "runtime" | "source";

export class ConfigMutationConflictError extends Error {
  readonly currentHash: string | null;

  constructor(message: string, params: { currentHash: string | null }) {
    super(message);
    this.name = "ConfigMutationConflictError";
    this.currentHash = params.currentHash;
  }
}

export type ConfigReplaceResult = {
  path: string;
  previousHash: string | null;
  snapshot: ConfigFileSnapshot;
  nextConfig: EnclawedConfig;
};

function assertBaseHashMatches(snapshot: ConfigFileSnapshot, expectedHash?: string): string | null {
  const currentHash = resolveConfigSnapshotHash(snapshot) ?? null;
  if (expectedHash !== undefined && expectedHash !== currentHash) {
    throw new ConfigMutationConflictError("config changed since last load", {
      currentHash,
    });
  }
  return currentHash;
}

export type ConfigReplaceAfterWritePolicy = {
  /**
   * Post-write activation policy. `"auto"` lets the host pick a deterministic
   * default (publish the new snapshot to live runtime callers); the legacy
   * `"none"` value keeps the new config staged without publishing.
   */
  mode: "auto" | "none";
  /** Optional human-readable reason recorded with the post-write action. */
  reason?: string;
};

export async function replaceConfigFile(params: {
  nextConfig: EnclawedConfig;
  baseHash?: string;
  snapshot?: ConfigFileSnapshot;
  writeOptions?: ConfigWriteOptions;
  /**
   * Optional post-write activation policy forwarded from plugin mutation
   * callers. Accepted for compatibility with bundled channel/plugin code; the
   * default behavior matches `"auto"`.
   */
  afterWrite?: ConfigReplaceAfterWritePolicy;
}): Promise<ConfigReplaceResult> {
  const prepared =
    params.snapshot && params.writeOptions
      ? { snapshot: params.snapshot, writeOptions: params.writeOptions }
      : await readConfigFileSnapshotForWrite();
  const { snapshot, writeOptions } = prepared;
  const previousHash = assertBaseHashMatches(snapshot, params.baseHash);
  await writeConfigFile(params.nextConfig, {
    baseSnapshot: snapshot,
    ...writeOptions,
    ...params.writeOptions,
  });
  return {
    path: snapshot.path,
    previousHash,
    snapshot,
    nextConfig: params.nextConfig,
  };
}

export async function mutateConfigFile<T = void>(params: {
  base?: ConfigMutationBase;
  baseHash?: string;
  writeOptions?: ConfigWriteOptions;
  /**
   * Optional post-write activation policy forwarded from plugin mutation
   * callers. Accepted for compatibility with bundled channel/plugin code; the
   * default behavior matches `"auto"`.
   */
  afterWrite?: ConfigReplaceAfterWritePolicy;
  mutate: (
    draft: EnclawedConfig,
    context: { snapshot: ConfigFileSnapshot; previousHash: string | null },
  ) => Promise<T | void> | T | void;
}): Promise<ConfigReplaceResult & { result: T | undefined }> {
  const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
  const previousHash = assertBaseHashMatches(snapshot, params.baseHash);
  const baseConfig = params.base === "runtime" ? snapshot.runtimeConfig : snapshot.sourceConfig;
  const draft = structuredClone(baseConfig) as EnclawedConfig;
  const result = (await params.mutate(draft, { snapshot, previousHash })) as T | undefined;
  await writeConfigFile(draft, {
    ...writeOptions,
    ...params.writeOptions,
  });
  return {
    path: snapshot.path,
    previousHash,
    snapshot,
    nextConfig: draft,
    result,
  };
}
