export * from "@enclawed/egress-core";
export { buildTaintTrackerStage } from "./src/stage.js";
export { luhnValid, scanSecrets, type SecretMatch } from "./src/secrets.js";
export { resolveTaintTrackerConfig, type TaintTrackerConfig } from "./src/config.js";
export {
  createTaintStore,
  sharedTaintStore,
  tagSensitiveValue,
  TAINT_SCOPE_ALL,
  type TagSensitiveValueOptions,
  type TaintStore,
  type TaintCheck,
} from "./src/taint-store.js";
