import {
  readConfigFileSnapshotForWrite,
  resolveConfigSnapshotHash,
  writeConfigFile,
} from "./io.js";
import type {
  ConfigReplaceResult,
  MutateConfigFileParams,
  MutateConfigFileResult,
  ReplaceConfigFileParams,
} from "./mutate.types.js";
import type { ConfigFileSnapshot, EnclawedConfig } from "./types.js";

export type {
  ConfigMutationBase,
  ConfigReplaceAfterWritePolicy,
  ConfigReplaceResult,
} from "./mutate.types.js";

export class ConfigMutationConflictError extends Error {
  readonly currentHash: string | null;

  constructor(message: string, params: { currentHash: string | null }) {
    super(message);
    this.name = "ConfigMutationConflictError";
    this.currentHash = params.currentHash;
  }
}

function assertBaseHashMatches(snapshot: ConfigFileSnapshot, expectedHash?: string): string | null {
  const currentHash = resolveConfigSnapshotHash(snapshot) ?? null;
  if (expectedHash !== undefined && expectedHash !== currentHash) {
    throw new ConfigMutationConflictError("config changed since last load", {
      currentHash,
    });
  }
  return currentHash;
}

export async function replaceConfigFile(
  params: ReplaceConfigFileParams,
): Promise<ConfigReplaceResult> {
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

export async function mutateConfigFile<T = void>(
  params: MutateConfigFileParams<T>,
): Promise<MutateConfigFileResult<T>> {
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
