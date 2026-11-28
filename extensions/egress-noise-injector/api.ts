export * from "@enclawed/egress-core";
export { resolveNoiseOptions } from "./src/config.js";
export { buildNoiseInjectorStage } from "./src/stage.js";
export {
  collapsePunctuationRuns,
  collapseWhitespaceRuns,
  defaultNoiseOptions,
  injectNoise,
  normalizeTypography,
  type NoiseOptions,
  type NoiseResult,
} from "./src/noise.js";
