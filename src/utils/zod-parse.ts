// Zod 4 introduced an internal `_zod.version` discriminator on every schema
// that pins literal major/minor numbers (e.g. 4.4 vs 4.3). When the call site
// resolves a different zod version from the helper's declaration (workspace
// packages pin their own zod range), constraining on `z.ZodType` /
// `core.SomeType` / `core.$ZodType` fails because the version literals don't
// match. The helpers only need `.safeParse`, so we use a minimal structural
// constraint that's version-agnostic.
type SafeParseable<TOutput> = {
  safeParse(value: unknown): { success: true; data: TOutput } | { success: false };
};

type InferSafeParseOutput<S> = S extends SafeParseable<infer O> ? O : never;

export function safeParseWithSchema<S extends SafeParseable<unknown>>(
  schema: S,
  value: unknown,
): InferSafeParseOutput<S> | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? (parsed.data as InferSafeParseOutput<S>) : null;
}

export function safeParseJsonWithSchema<S extends SafeParseable<unknown>>(
  schema: S,
  raw: string,
): InferSafeParseOutput<S> | null {
  try {
    return safeParseWithSchema(schema, JSON.parse(raw));
  } catch {
    return null;
  }
}
