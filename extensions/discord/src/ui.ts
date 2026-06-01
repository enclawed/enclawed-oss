import type { EnclawedConfig } from "@enclawed/plugin-sdk/config-types";
import { Container } from "./internal/discord.js";
import { normalizeDiscordAccentColor, resolveDiscordAccentColor } from "./ui-colors.js";

type DiscordContainerComponents = ConstructorParameters<typeof Container>[0];

export class DiscordUiContainer extends Container {
  constructor(params: {
    cfg: EnclawedConfig;
    accountId?: string | null;
    components?: DiscordContainerComponents;
    accentColor?: string;
    spoiler?: boolean;
  }) {
    const accentOverride = normalizeDiscordAccentColor(params.accentColor);
    const accentColor =
      accentOverride ?? resolveDiscordAccentColor({ cfg: params.cfg, accountId: params.accountId });
    super(params.components, { accentColor, spoiler: params.spoiler });
  }
}
