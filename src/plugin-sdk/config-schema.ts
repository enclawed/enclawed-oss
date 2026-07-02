/** Root Enclawed configuration Zod schema — the full `enclawed.json` shape. */
export { EnclawedSchema } from "../config/zod-schema.js";

export { validateJsonSchemaValue } from "../plugins/schema-validator.js";

/**
 * Generic JSON-Schema object shape passed to `validateJsonSchemaValue`.
 *
 * Mirrors the loose JSON-Schema bag accepted by the validator and the schema
 * baseline helpers. Exposed here so plugin authors can annotate manifest
 * snapshots without importing core internals.
 */
export type JsonSchemaObject = Record<string, unknown> & {
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaObject;
  items?: JsonSchemaObject | JsonSchemaObject[];
  enum?: unknown[];
  const?: unknown;
};
