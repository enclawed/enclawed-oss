export declare const INTERNAL_RUNTIME_CONTEXT_BEGIN = "<<<BEGIN_ENCLAWED_INTERNAL_CONTEXT>>>";
export declare const INTERNAL_RUNTIME_CONTEXT_END = "<<<END_ENCLAWED_INTERNAL_CONTEXT>>>";
export declare function escapeInternalRuntimeContextDelimiters(value: string): string;
export declare function stripInternalRuntimeContext(text: string): string;
export declare function hasInternalRuntimeContext(text: string): boolean;
