export * from "@enclawed/egress-core";
export { resolveBehavioralOptions } from "./src/config.js";
export { buildBehavioralInvariantsStage } from "./src/stage.js";
export {
  coefficientOfVariation,
  createBehavioralMonitor,
  defaultBehavioralOptions,
  type BehavioralMonitor,
  type BehavioralOptions,
} from "./src/invariants.js";
