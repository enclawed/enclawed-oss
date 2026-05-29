import { normalizeStringEntries } from "../shared/string-normalization.js";

type CompatMutationResult = {
  entry: Record<string, unknown>;
  changed: boolean;
};

export function asObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function hasLegacyAccountStreamingAliases(
  value: unknown,
  match: (entry: unknown) => boolean,
): boolean {
  const accounts = asObjectRecord(value);
  if (!accounts) {
    return false;
  }
  return Object.values(accounts).some((account) => match(account));
}

function ensureNestedRecord(owner: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = asObjectRecord(owner[key]);
  if (existing) {
    return { ...existing };
  }
  return {};
}

function allowFromListsMatch(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }
  const normalizedLeft = normalizeStringEntries(left);
  const normalizedRight = normalizeStringEntries(right);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function normalizeLegacyDmAliases(params: {
  entry: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
  promoteAllowFrom?: boolean;
}): CompatMutationResult {
  let changed = false;
  let updated: Record<string, unknown> = params.entry;
  const rawDm = updated.dm;
  const dm = asObjectRecord(rawDm) ? (structuredClone(rawDm) as Record<string, unknown>) : null;
  let dmChanged = false;

  const topDmPolicy = updated.dmPolicy;
  const legacyDmPolicy = dm?.policy;
  if (topDmPolicy === undefined && legacyDmPolicy !== undefined) {
    updated = { ...updated, dmPolicy: legacyDmPolicy };
    changed = true;
    if (dm) {
      delete dm.policy;
      dmChanged = true;
    }
    params.changes.push(`Moved ${params.pathPrefix}.dm.policy → ${params.pathPrefix}.dmPolicy.`);
  } else if (
    topDmPolicy !== undefined &&
    legacyDmPolicy !== undefined &&
    topDmPolicy === legacyDmPolicy
  ) {
    if (dm) {
      delete dm.policy;
      dmChanged = true;
      params.changes.push(`Removed ${params.pathPrefix}.dm.policy (dmPolicy already set).`);
    }
  }

  if (params.promoteAllowFrom !== false) {
    const topAllowFrom = updated.allowFrom;
    const legacyAllowFrom = dm?.allowFrom;
    if (topAllowFrom === undefined && legacyAllowFrom !== undefined) {
      updated = { ...updated, allowFrom: legacyAllowFrom };
      changed = true;
      if (dm) {
        delete dm.allowFrom;
        dmChanged = true;
      }
      params.changes.push(
        `Moved ${params.pathPrefix}.dm.allowFrom → ${params.pathPrefix}.allowFrom.`,
      );
    } else if (
      topAllowFrom !== undefined &&
      legacyAllowFrom !== undefined &&
      allowFromListsMatch(topAllowFrom, legacyAllowFrom)
    ) {
      if (dm) {
        delete dm.allowFrom;
        dmChanged = true;
        params.changes.push(`Removed ${params.pathPrefix}.dm.allowFrom (allowFrom already set).`);
      }
    }
  }

  if (dm && asObjectRecord(rawDm) && dmChanged) {
    const keys = Object.keys(dm);
    if (keys.length === 0) {
      if (updated.dm !== undefined) {
        const { dm: _ignored, ...rest } = updated;
        updated = rest;
        changed = true;
        params.changes.push(`Removed empty ${params.pathPrefix}.dm after migration.`);
      }
    } else {
      updated = { ...updated, dm };
      changed = true;
    }
  }

  return { entry: updated, changed };
}

export function normalizeLegacyStreamingAliases(params: {
  entry: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
  resolvedMode: string;
  includePreviewChunk?: boolean;
  resolvedNativeTransport?: unknown;
  offModeLegacyNotice?: (pathPrefix: string) => string;
}): CompatMutationResult {
  const beforeStreaming = params.entry.streaming;
  const hadLegacyStreamMode = params.entry.streamMode !== undefined;
  const hasLegacyFlatFields =
    params.entry.chunkMode !== undefined ||
    params.entry.blockStreaming !== undefined ||
    params.entry.blockStreamingCoalesce !== undefined ||
    (params.includePreviewChunk === true && params.entry.draftChunk !== undefined) ||
    params.entry.nativeStreaming !== undefined;
  const shouldNormalize =
    hadLegacyStreamMode ||
    typeof beforeStreaming === "boolean" ||
    typeof beforeStreaming === "string" ||
    hasLegacyFlatFields;
  if (!shouldNormalize) {
    return { entry: params.entry, changed: false };
  }

  let updated = { ...params.entry };
  let changed = false;
  const streaming = ensureNestedRecord(updated, "streaming");
  const block = ensureNestedRecord(streaming, "block");
  const preview = ensureNestedRecord(streaming, "preview");

  if (
    (hadLegacyStreamMode ||
      typeof beforeStreaming === "boolean" ||
      typeof beforeStreaming === "string") &&
    streaming.mode === undefined
  ) {
    streaming.mode = params.resolvedMode;
    if (hadLegacyStreamMode) {
      params.changes.push(
        `Moved ${params.pathPrefix}.streamMode → ${params.pathPrefix}.streaming.mode (${params.resolvedMode}).`,
      );
    } else if (typeof beforeStreaming === "boolean") {
      params.changes.push(
        `Moved ${params.pathPrefix}.streaming (boolean) → ${params.pathPrefix}.streaming.mode (${params.resolvedMode}).`,
      );
    } else if (typeof beforeStreaming === "string") {
      params.changes.push(
        `Moved ${params.pathPrefix}.streaming (scalar) → ${params.pathPrefix}.streaming.mode (${params.resolvedMode}).`,
      );
    }
    changed = true;
  }
  if (hadLegacyStreamMode) {
    delete updated.streamMode;
    changed = true;
  }
  if (updated.chunkMode !== undefined && streaming.chunkMode === undefined) {
    streaming.chunkMode = updated.chunkMode;
    delete updated.chunkMode;
    params.changes.push(
      `Moved ${params.pathPrefix}.chunkMode → ${params.pathPrefix}.streaming.chunkMode.`,
    );
    changed = true;
  }
  if (updated.blockStreaming !== undefined && block.enabled === undefined) {
    block.enabled = updated.blockStreaming;
    delete updated.blockStreaming;
    params.changes.push(
      `Moved ${params.pathPrefix}.blockStreaming → ${params.pathPrefix}.streaming.block.enabled.`,
    );
    changed = true;
  }
  if (
    params.includePreviewChunk === true &&
    updated.draftChunk !== undefined &&
    preview.chunk === undefined
  ) {
    preview.chunk = updated.draftChunk;
    delete updated.draftChunk;
    params.changes.push(
      `Moved ${params.pathPrefix}.draftChunk → ${params.pathPrefix}.streaming.preview.chunk.`,
    );
    changed = true;
  }
  if (updated.blockStreamingCoalesce !== undefined && block.coalesce === undefined) {
    block.coalesce = updated.blockStreamingCoalesce;
    delete updated.blockStreamingCoalesce;
    params.changes.push(
      `Moved ${params.pathPrefix}.blockStreamingCoalesce → ${params.pathPrefix}.streaming.block.coalesce.`,
    );
    changed = true;
  }
  if (
    updated.nativeStreaming !== undefined &&
    streaming.nativeTransport === undefined &&
    params.resolvedNativeTransport !== undefined
  ) {
    streaming.nativeTransport = params.resolvedNativeTransport;
    delete updated.nativeStreaming;
    params.changes.push(
      `Moved ${params.pathPrefix}.nativeStreaming → ${params.pathPrefix}.streaming.nativeTransport.`,
    );
    changed = true;
  } else if (
    typeof beforeStreaming === "boolean" &&
    streaming.nativeTransport === undefined &&
    params.resolvedNativeTransport !== undefined
  ) {
    streaming.nativeTransport = params.resolvedNativeTransport;
    params.changes.push(
      `Moved ${params.pathPrefix}.streaming (boolean) → ${params.pathPrefix}.streaming.nativeTransport.`,
    );
    changed = true;
  }

  if (Object.keys(preview).length > 0) {
    streaming.preview = preview;
  }
  if (Object.keys(block).length > 0) {
    streaming.block = block;
  }
  updated.streaming = streaming;
  if (
    hadLegacyStreamMode &&
    params.resolvedMode === "off" &&
    params.offModeLegacyNotice !== undefined
  ) {
    params.changes.push(params.offModeLegacyNotice(params.pathPrefix));
  }
  return { entry: updated, changed };
}

export type NormalizeLegacyChannelAliasesStreamingOptions = {
  resolvedMode: string;
  includePreviewChunk?: boolean;
  resolvedNativeTransport?: unknown;
  offModeLegacyNotice?: (pathPrefix: string) => string;
};

export type NormalizeLegacyChannelAliasesAccountExtraParams = {
  account: Record<string, unknown>;
  pathPrefix: string;
};

export type NormalizeLegacyChannelAliasesAccountExtraResult = {
  entry: Record<string, unknown>;
  changed: boolean;
};

export type NormalizeLegacyChannelAliasesParams = {
  entry: Record<string, unknown>;
  pathPrefix: string;
  changes: string[];
  normalizeDm?: boolean;
  normalizeAccountDm?: boolean;
  promoteAllowFrom?: boolean;
  resolveStreamingOptions?: (
    entry: Record<string, unknown>,
  ) => NormalizeLegacyChannelAliasesStreamingOptions;
  normalizeAccountExtra?: (
    params: NormalizeLegacyChannelAliasesAccountExtraParams,
  ) => NormalizeLegacyChannelAliasesAccountExtraResult;
};

/**
 * Compose the legacy-alias migration steps that channel doctor flows run as a
 * single unit: top-level dm-alias promotion, streaming-key promotion, and the
 * same passes for per-account configs. Lets channel plugins describe their
 * migration intent declaratively instead of stitching the pieces together.
 */
export function normalizeLegacyChannelAliases(
  params: NormalizeLegacyChannelAliasesParams,
): CompatMutationResult {
  let updated: Record<string, unknown> = params.entry;
  let changed = false;

  if (params.normalizeDm) {
    const dmResult = normalizeLegacyDmAliases({
      entry: updated,
      pathPrefix: params.pathPrefix,
      changes: params.changes,
      ...(params.promoteAllowFrom !== undefined
        ? { promoteAllowFrom: params.promoteAllowFrom }
        : {}),
    });
    updated = dmResult.entry;
    changed = changed || dmResult.changed;
  }

  if (params.resolveStreamingOptions) {
    const streamingOptions = params.resolveStreamingOptions(updated);
    const streamingResult = normalizeLegacyStreamingAliases({
      entry: updated,
      pathPrefix: params.pathPrefix,
      changes: params.changes,
      resolvedMode: streamingOptions.resolvedMode,
      ...(streamingOptions.includePreviewChunk !== undefined
        ? { includePreviewChunk: streamingOptions.includePreviewChunk }
        : {}),
      ...(streamingOptions.resolvedNativeTransport !== undefined
        ? { resolvedNativeTransport: streamingOptions.resolvedNativeTransport }
        : {}),
      ...(streamingOptions.offModeLegacyNotice !== undefined
        ? { offModeLegacyNotice: streamingOptions.offModeLegacyNotice }
        : {}),
    });
    updated = streamingResult.entry;
    changed = changed || streamingResult.changed;
  }

  const accounts = asObjectRecord(updated.accounts);
  if (
    accounts &&
    (params.normalizeAccountDm ||
      params.resolveStreamingOptions ||
      params.normalizeAccountExtra)
  ) {
    let accountsChanged = false;
    const nextAccounts: Record<string, unknown> = { ...accounts };
    for (const [accountId, accountValue] of Object.entries(accounts)) {
      const account = asObjectRecord(accountValue);
      if (!account) {
        continue;
      }
      let accountEntry: Record<string, unknown> = account;
      let perAccountChanged = false;
      const accountPathPrefix = `${params.pathPrefix}.accounts.${accountId}`;

      if (params.normalizeAccountDm) {
        const dmResult = normalizeLegacyDmAliases({
          entry: accountEntry,
          pathPrefix: accountPathPrefix,
          changes: params.changes,
          ...(params.promoteAllowFrom !== undefined
            ? { promoteAllowFrom: params.promoteAllowFrom }
            : {}),
        });
        accountEntry = dmResult.entry;
        perAccountChanged = perAccountChanged || dmResult.changed;
      }

      if (params.resolveStreamingOptions) {
        const streamingOptions = params.resolveStreamingOptions(accountEntry);
        const streamingResult = normalizeLegacyStreamingAliases({
          entry: accountEntry,
          pathPrefix: accountPathPrefix,
          changes: params.changes,
          resolvedMode: streamingOptions.resolvedMode,
          ...(streamingOptions.includePreviewChunk !== undefined
            ? { includePreviewChunk: streamingOptions.includePreviewChunk }
            : {}),
          ...(streamingOptions.resolvedNativeTransport !== undefined
            ? { resolvedNativeTransport: streamingOptions.resolvedNativeTransport }
            : {}),
          ...(streamingOptions.offModeLegacyNotice !== undefined
            ? { offModeLegacyNotice: streamingOptions.offModeLegacyNotice }
            : {}),
        });
        accountEntry = streamingResult.entry;
        perAccountChanged = perAccountChanged || streamingResult.changed;
      }

      if (params.normalizeAccountExtra) {
        const extraResult = params.normalizeAccountExtra({
          account: accountEntry,
          pathPrefix: accountPathPrefix,
        });
        accountEntry = extraResult.entry;
        perAccountChanged = perAccountChanged || extraResult.changed;
      }

      if (perAccountChanged) {
        nextAccounts[accountId] = accountEntry;
        accountsChanged = true;
      }
    }
    if (accountsChanged) {
      updated = { ...updated, accounts: nextAccounts };
      changed = true;
    }
  }

  return { entry: updated, changed };
}

export function hasLegacyStreamingAliases(
  value: unknown,
  options?: { includePreviewChunk?: boolean; includeNativeTransport?: boolean },
): boolean {
  const entry = asObjectRecord(value);
  if (!entry) {
    return false;
  }
  return (
    entry.streamMode !== undefined ||
    typeof entry.streaming === "boolean" ||
    typeof entry.streaming === "string" ||
    entry.chunkMode !== undefined ||
    entry.blockStreaming !== undefined ||
    entry.blockStreamingCoalesce !== undefined ||
    (options?.includePreviewChunk === true && entry.draftChunk !== undefined) ||
    (options?.includeNativeTransport === true && entry.nativeStreaming !== undefined)
  );
}
