import { s as updateSessionStoreEntry } from "./store-BojxuYyw.js";
import "./sessions-BhMvlzjx.js";
import { u as resolveStorePath } from "./paths-Lozvxyih.js";
//#region src/agents/pi-embedded-subscribe.handlers.compaction.runtime.ts
async function reconcileSessionStoreCompactionCountAfterSuccess(params) {
	const { sessionKey, agentId, configStore, observedCompactionCount, now = Date.now() } = params;
	if (!sessionKey || observedCompactionCount <= 0) return;
	return (await updateSessionStoreEntry({
		storePath: resolveStorePath(configStore, { agentId }),
		sessionKey,
		update: async (entry) => {
			const currentCount = Math.max(0, entry.compactionCount ?? 0);
			const nextCount = Math.max(currentCount, observedCompactionCount);
			if (nextCount === currentCount) return null;
			return {
				compactionCount: nextCount,
				updatedAt: Math.max(entry.updatedAt ?? 0, now)
			};
		}
	}))?.compactionCount;
}
//#endregion
export { reconcileSessionStoreCompactionCountAfterSuccess };
