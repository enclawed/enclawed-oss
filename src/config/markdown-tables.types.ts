import type { MarkdownTableMode } from "./types.base.js";
import type { EnclawedConfig } from "./types.enclawed.js";

export type ResolveMarkdownTableModeParams = {
  cfg?: Partial<EnclawedConfig>;
  channel?: string | null;
  accountId?: string | null;
};

export type ResolveMarkdownTableMode = (
  params: ResolveMarkdownTableModeParams,
) => MarkdownTableMode;
