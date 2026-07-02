export const ENCLAWED_OWNER_ONLY_CORE_TOOL_NAMES = ["cron", "gateway", "nodes"] as const;

const ENCLAWED_OWNER_ONLY_CORE_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  ENCLAWED_OWNER_ONLY_CORE_TOOL_NAMES,
);

export function isEnclawedOwnerOnlyCoreToolName(toolName: string): boolean {
  return ENCLAWED_OWNER_ONLY_CORE_TOOL_NAME_SET.has(toolName);
}
