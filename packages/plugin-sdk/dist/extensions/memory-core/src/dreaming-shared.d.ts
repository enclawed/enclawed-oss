export { asNullableRecord as asRecord } from "@enclawed/plugin-sdk/text-runtime";
export { formatErrorMessage } from "@enclawed/plugin-sdk/error-runtime";
export declare function normalizeTrimmedString(value: unknown): string | undefined;
export declare function includesSystemEventToken(cleanedBody: string, eventText: string): boolean;
