import { s as normalizeStringEntries } from "./string-normalization-QLwZvaSN.js";
import "./uninstall-CyCWtcGD.js";
//#region src/config/channel-compat-normalization.ts
function asObjectRecord(value) {
	return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function hasLegacyAccountStreamingAliases(value, match) {
	const accounts = asObjectRecord(value);
	if (!accounts) return false;
	return Object.values(accounts).some((account) => match(account));
}
function ensureNestedRecord(owner, key) {
	const existing = asObjectRecord(owner[key]);
	if (existing) return { ...existing };
	return {};
}
function allowFromListsMatch(left, right) {
	if (!Array.isArray(left) || !Array.isArray(right)) return false;
	const normalizedLeft = normalizeStringEntries(left);
	const normalizedRight = normalizeStringEntries(right);
	if (normalizedLeft.length !== normalizedRight.length) return false;
	return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}
function normalizeLegacyDmAliases(params) {
	let changed = false;
	let updated = params.entry;
	const rawDm = updated.dm;
	const dm = asObjectRecord(rawDm) ? structuredClone(rawDm) : null;
	let dmChanged = false;
	const topDmPolicy = updated.dmPolicy;
	const legacyDmPolicy = dm?.policy;
	if (topDmPolicy === void 0 && legacyDmPolicy !== void 0) {
		updated = {
			...updated,
			dmPolicy: legacyDmPolicy
		};
		changed = true;
		if (dm) {
			delete dm.policy;
			dmChanged = true;
		}
		params.changes.push(`Moved ${params.pathPrefix}.dm.policy → ${params.pathPrefix}.dmPolicy.`);
	} else if (topDmPolicy !== void 0 && legacyDmPolicy !== void 0 && topDmPolicy === legacyDmPolicy) {
		if (dm) {
			delete dm.policy;
			dmChanged = true;
			params.changes.push(`Removed ${params.pathPrefix}.dm.policy (dmPolicy already set).`);
		}
	}
	if (params.promoteAllowFrom !== false) {
		const topAllowFrom = updated.allowFrom;
		const legacyAllowFrom = dm?.allowFrom;
		if (topAllowFrom === void 0 && legacyAllowFrom !== void 0) {
			updated = {
				...updated,
				allowFrom: legacyAllowFrom
			};
			changed = true;
			if (dm) {
				delete dm.allowFrom;
				dmChanged = true;
			}
			params.changes.push(`Moved ${params.pathPrefix}.dm.allowFrom → ${params.pathPrefix}.allowFrom.`);
		} else if (topAllowFrom !== void 0 && legacyAllowFrom !== void 0 && allowFromListsMatch(topAllowFrom, legacyAllowFrom)) {
			if (dm) {
				delete dm.allowFrom;
				dmChanged = true;
				params.changes.push(`Removed ${params.pathPrefix}.dm.allowFrom (allowFrom already set).`);
			}
		}
	}
	if (dm && asObjectRecord(rawDm) && dmChanged) if (Object.keys(dm).length === 0) {
		if (updated.dm !== void 0) {
			const { dm: _ignored, ...rest } = updated;
			updated = rest;
			changed = true;
			params.changes.push(`Removed empty ${params.pathPrefix}.dm after migration.`);
		}
	} else {
		updated = {
			...updated,
			dm
		};
		changed = true;
	}
	return {
		entry: updated,
		changed
	};
}
function normalizeLegacyStreamingAliases(params) {
	const beforeStreaming = params.entry.streaming;
	const hadLegacyStreamMode = params.entry.streamMode !== void 0;
	const hasLegacyFlatFields = params.entry.chunkMode !== void 0 || params.entry.blockStreaming !== void 0 || params.entry.blockStreamingCoalesce !== void 0 || params.includePreviewChunk === true && params.entry.draftChunk !== void 0 || params.entry.nativeStreaming !== void 0;
	if (!(hadLegacyStreamMode || typeof beforeStreaming === "boolean" || typeof beforeStreaming === "string" || hasLegacyFlatFields)) return {
		entry: params.entry,
		changed: false
	};
	let updated = { ...params.entry };
	let changed = false;
	const streaming = ensureNestedRecord(updated, "streaming");
	const block = ensureNestedRecord(streaming, "block");
	const preview = ensureNestedRecord(streaming, "preview");
	if ((hadLegacyStreamMode || typeof beforeStreaming === "boolean" || typeof beforeStreaming === "string") && streaming.mode === void 0) {
		streaming.mode = params.resolvedMode;
		if (hadLegacyStreamMode) params.changes.push(`Moved ${params.pathPrefix}.streamMode → ${params.pathPrefix}.streaming.mode (${params.resolvedMode}).`);
		else if (typeof beforeStreaming === "boolean") params.changes.push(`Moved ${params.pathPrefix}.streaming (boolean) → ${params.pathPrefix}.streaming.mode (${params.resolvedMode}).`);
		else if (typeof beforeStreaming === "string") params.changes.push(`Moved ${params.pathPrefix}.streaming (scalar) → ${params.pathPrefix}.streaming.mode (${params.resolvedMode}).`);
		changed = true;
	}
	if (hadLegacyStreamMode) {
		delete updated.streamMode;
		changed = true;
	}
	if (updated.chunkMode !== void 0 && streaming.chunkMode === void 0) {
		streaming.chunkMode = updated.chunkMode;
		delete updated.chunkMode;
		params.changes.push(`Moved ${params.pathPrefix}.chunkMode → ${params.pathPrefix}.streaming.chunkMode.`);
		changed = true;
	}
	if (updated.blockStreaming !== void 0 && block.enabled === void 0) {
		block.enabled = updated.blockStreaming;
		delete updated.blockStreaming;
		params.changes.push(`Moved ${params.pathPrefix}.blockStreaming → ${params.pathPrefix}.streaming.block.enabled.`);
		changed = true;
	}
	if (params.includePreviewChunk === true && updated.draftChunk !== void 0 && preview.chunk === void 0) {
		preview.chunk = updated.draftChunk;
		delete updated.draftChunk;
		params.changes.push(`Moved ${params.pathPrefix}.draftChunk → ${params.pathPrefix}.streaming.preview.chunk.`);
		changed = true;
	}
	if (updated.blockStreamingCoalesce !== void 0 && block.coalesce === void 0) {
		block.coalesce = updated.blockStreamingCoalesce;
		delete updated.blockStreamingCoalesce;
		params.changes.push(`Moved ${params.pathPrefix}.blockStreamingCoalesce → ${params.pathPrefix}.streaming.block.coalesce.`);
		changed = true;
	}
	if (updated.nativeStreaming !== void 0 && streaming.nativeTransport === void 0 && params.resolvedNativeTransport !== void 0) {
		streaming.nativeTransport = params.resolvedNativeTransport;
		delete updated.nativeStreaming;
		params.changes.push(`Moved ${params.pathPrefix}.nativeStreaming → ${params.pathPrefix}.streaming.nativeTransport.`);
		changed = true;
	} else if (typeof beforeStreaming === "boolean" && streaming.nativeTransport === void 0 && params.resolvedNativeTransport !== void 0) {
		streaming.nativeTransport = params.resolvedNativeTransport;
		params.changes.push(`Moved ${params.pathPrefix}.streaming (boolean) → ${params.pathPrefix}.streaming.nativeTransport.`);
		changed = true;
	}
	if (Object.keys(preview).length > 0) streaming.preview = preview;
	if (Object.keys(block).length > 0) streaming.block = block;
	updated.streaming = streaming;
	if (hadLegacyStreamMode && params.resolvedMode === "off" && params.offModeLegacyNotice !== void 0) params.changes.push(params.offModeLegacyNotice(params.pathPrefix));
	return {
		entry: updated,
		changed
	};
}
/**
* Compose the legacy-alias migration steps that channel doctor flows run as a
* single unit: top-level dm-alias promotion, streaming-key promotion, and the
* same passes for per-account configs. Lets channel plugins describe their
* migration intent declaratively instead of stitching the pieces together.
*/
function normalizeLegacyChannelAliases(params) {
	let updated = params.entry;
	let changed = false;
	if (params.normalizeDm) {
		const dmResult = normalizeLegacyDmAliases({
			entry: updated,
			pathPrefix: params.pathPrefix,
			changes: params.changes,
			...params.promoteAllowFrom !== void 0 ? { promoteAllowFrom: params.promoteAllowFrom } : {}
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
			...streamingOptions.includePreviewChunk !== void 0 ? { includePreviewChunk: streamingOptions.includePreviewChunk } : {},
			...streamingOptions.resolvedNativeTransport !== void 0 ? { resolvedNativeTransport: streamingOptions.resolvedNativeTransport } : {},
			...streamingOptions.offModeLegacyNotice !== void 0 ? { offModeLegacyNotice: streamingOptions.offModeLegacyNotice } : {}
		});
		updated = streamingResult.entry;
		changed = changed || streamingResult.changed;
	}
	const accounts = asObjectRecord(updated.accounts);
	if (accounts && (params.normalizeAccountDm || params.resolveStreamingOptions || params.normalizeAccountExtra)) {
		let accountsChanged = false;
		const nextAccounts = { ...accounts };
		for (const [accountId, accountValue] of Object.entries(accounts)) {
			const account = asObjectRecord(accountValue);
			if (!account) continue;
			let accountEntry = account;
			let perAccountChanged = false;
			const accountPathPrefix = `${params.pathPrefix}.accounts.${accountId}`;
			if (params.normalizeAccountDm) {
				const dmResult = normalizeLegacyDmAliases({
					entry: accountEntry,
					pathPrefix: accountPathPrefix,
					changes: params.changes,
					...params.promoteAllowFrom !== void 0 ? { promoteAllowFrom: params.promoteAllowFrom } : {}
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
					...streamingOptions.includePreviewChunk !== void 0 ? { includePreviewChunk: streamingOptions.includePreviewChunk } : {},
					...streamingOptions.resolvedNativeTransport !== void 0 ? { resolvedNativeTransport: streamingOptions.resolvedNativeTransport } : {},
					...streamingOptions.offModeLegacyNotice !== void 0 ? { offModeLegacyNotice: streamingOptions.offModeLegacyNotice } : {}
				});
				accountEntry = streamingResult.entry;
				perAccountChanged = perAccountChanged || streamingResult.changed;
			}
			if (params.normalizeAccountExtra) {
				const extraResult = params.normalizeAccountExtra({
					account: accountEntry,
					pathPrefix: accountPathPrefix
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
			updated = {
				...updated,
				accounts: nextAccounts
			};
			changed = true;
		}
	}
	return {
		entry: updated,
		changed
	};
}
function hasLegacyStreamingAliases(value, options) {
	const entry = asObjectRecord(value);
	if (!entry) return false;
	return entry.streamMode !== void 0 || typeof entry.streaming === "boolean" || typeof entry.streaming === "string" || entry.chunkMode !== void 0 || entry.blockStreaming !== void 0 || entry.blockStreamingCoalesce !== void 0 || options?.includePreviewChunk === true && entry.draftChunk !== void 0 || options?.includeNativeTransport === true && entry.nativeStreaming !== void 0;
}
//#endregion
export { normalizeLegacyDmAliases as a, normalizeLegacyChannelAliases as i, hasLegacyAccountStreamingAliases as n, normalizeLegacyStreamingAliases as o, hasLegacyStreamingAliases as r, asObjectRecord as t };
