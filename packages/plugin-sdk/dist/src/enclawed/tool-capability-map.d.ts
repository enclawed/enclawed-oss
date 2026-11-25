import { type CapabilityToken } from "./skill-capabilities.js";
export type ToolCapabilityClass = Readonly<{
    capability: CapabilityToken;
    /** True when the call needs no human approval. */
    reversible: boolean;
    /** Why a non-reversible capability is still treated as reversible, if it is. */
    exemption?: "read-only-retrieval";
}>;
/** Classify a canonical tool id. Unknown tools are `tool.invoke` (irreversible). */
export declare function classifyToolCall(toolId: string): ToolCapabilityClass;
/** Tools whose calls write or delete files, classified per target. */
export declare function isFsWriteTool(toolId: string): boolean;
/**
 * Publish `classifyToolCall` on the shared classifier slot so plugin-side
 * consumers (for example the egress action batcher, which collapses repeats
 * only of read-only tools) classify tools by this map instead of a copy.
 */
export declare function publishToolCapabilityClassifier(): void;
