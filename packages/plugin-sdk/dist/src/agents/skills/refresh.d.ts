import type { EnclawedConfig } from "../../config/types.enclawed.js";
export { bumpSkillsSnapshotVersion, getSkillsSnapshotVersion, registerSkillsChangeListener, shouldRefreshSnapshotForVersion, type SkillsChangeEvent, } from "./refresh-state.js";
export declare const DEFAULT_SKILLS_WATCH_IGNORED: RegExp[];
export declare function ensureSkillsWatcher(params: {
    workspaceDir: string;
    config?: EnclawedConfig;
}): void;
export declare function resetSkillsRefreshForTest(): Promise<void>;
