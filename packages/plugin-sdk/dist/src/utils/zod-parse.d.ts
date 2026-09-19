type SafeParseable<TOutput> = {
    safeParse(value: unknown): {
        success: true;
        data: TOutput;
    } | {
        success: false;
    };
};
type InferSafeParseOutput<S> = S extends SafeParseable<infer O> ? O : never;
export declare function safeParseWithSchema<S extends SafeParseable<unknown>>(schema: S, value: unknown): InferSafeParseOutput<S> | null;
export declare function safeParseJsonWithSchema<S extends SafeParseable<unknown>>(schema: S, raw: string): InferSafeParseOutput<S> | null;
export {};
