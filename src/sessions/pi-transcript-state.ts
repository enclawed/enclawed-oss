/**
 * pi-coding-agent >= 0.87 persists its prompt and tool state in the session
 * transcript as `role: "system"` message entries: structured prompt sections
 * (`sections`, e.g. preamble and the workspace cwd) and tool declarations
 * (`toolsAdded` / `toolsRemoved`, with full parameter schemas). They are
 * request-building state, not conversation: Enclawed replaces the prompt at
 * request time, and surfaces that show history (chat history, the HTTP/SSE
 * history API, live transcript events, MCP and the sessions_history tool) must
 * not expose or count them. Enclawed's own synthetic system markers (for
 * example compaction dividers tagged with `__enclawed`) carry none of these
 * fields and are unaffected.
 *
 * Leaf module: no imports, so any history surface can use it.
 */
export function isPiTranscriptStateMessage(message: unknown): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const record = message as Record<string, unknown>;
  if (record.role !== "system") {
    return false;
  }
  return "sections" in record || "toolsAdded" in record || "toolsRemoved" in record;
}
