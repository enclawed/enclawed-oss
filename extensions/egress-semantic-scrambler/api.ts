export * from "@enclawed/egress-core";
export { resolveSemanticScramblerConfig, type SemanticScramblerConfig } from "./src/config.js";
export { buildSemanticScramblerStage } from "./src/stage.js";
export {
  canonicalizeSynonyms,
  defaultScramblerOptions,
  expandContractions,
  passiveToActive,
  scramble,
  SYNONYM_RINGS,
  type ScramblerOptions,
  type ScrambleResult,
} from "./src/scrambler.js";
