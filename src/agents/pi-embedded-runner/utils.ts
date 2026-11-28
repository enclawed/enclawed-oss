import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ReasoningLevel, ThinkLevel } from "../../auto-reply/thinking.js";

export function mapThinkingLevel(level?: ThinkLevel): ThinkingLevel {
  // pi-agent-core supports "xhigh"; Enclawed enables it for specific models.
  if (!level) {
    return "off";
  }
  // "adaptive" maps to "medium" at the pi-agent-core layer.  The Pi SDK
  // provider then translates this to `thinking.type: "adaptive"` with
  // `output_config.effort: "medium"` for models that support it (Opus 4.6,
  // Sonnet 4.6).
  if (level === "adaptive") {
    return "medium";
  }
  // Enclawed exposes "max" as a UX synonym for the strongest reasoning effort
  // pi-agent-core supports; surface it as "xhigh" upstream so provider
  // translators do not see an unknown level.
  if (level === "max") {
    return "xhigh";
  }
  return level;
}

export type { ReasoningLevel, ThinkLevel };
