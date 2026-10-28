// Lazy-loading boundary for `enclawed netcage serve` (see AGENTS.md dynamic
// import guardrail): the CLI command imports this, never serve.ts directly.
export { netCageSupport } from "./cage.js";
export { serveCaged, type ServeHandle, type ServeOptions } from "./serve.js";
