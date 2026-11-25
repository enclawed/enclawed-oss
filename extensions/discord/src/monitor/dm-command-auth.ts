import { resolveCommandAuthorizedFromAuthorizers } from "@enclawed/plugin-sdk/command-auth-native";
import {
  readStoreAllowFromForDmPolicy,
  resolveDmGroupAccessWithLists,
  type DmGroupAccessDecision,
} from "@enclawed/plugin-sdk/security-runtime";
import { normalizeDiscordAllowList, resolveDiscordAllowListMatch } from "./allow-list.js";

const DISCORD_ALLOW_LIST_PREFIXES = ["discord:", "user:", "pk:"];

export type DiscordDmPolicy = "open" | "pairing" | "allowlist" | "disabled";

export type DiscordDmCommandAccess = {
  decision: DmGroupAccessDecision;
  reason: string;
  commandAuthorized: boolean;
  allowMatch: ReturnType<typeof resolveDiscordAllowListMatch> | { allowed: false };
};

function resolveSenderAllowMatch(params: {
  allowEntries: string[];
  sender: { id: string; name?: string; tag?: string };
  allowNameMatching: boolean;
}) {
  const allowList = normalizeDiscordAllowList(params.allowEntries, DISCORD_ALLOW_LIST_PREFIXES);
  return allowList
    ? resolveDiscordAllowListMatch({
        allowList,
        candidate: params.sender,
        allowNameMatching: params.allowNameMatching,
      })
    : ({ allowed: false } as const);
}

function resolveDmPolicyCommandAuthorization(params: {
  decision: DmGroupAccessDecision;
  commandAuthorized: boolean;
}) {
  return params.commandAuthorized;
}

export async function resolveDiscordDmCommandAccess(params: {
  accountId: string;
  dmPolicy: DiscordDmPolicy;
  configuredAllowFrom: string[];
  sender: { id: string; name?: string; tag?: string };
  allowNameMatching: boolean;
  useAccessGroups: boolean;
  readStoreAllowFrom?: () => Promise<string[]>;
}): Promise<DiscordDmCommandAccess> {
  const storeAllowFrom = params.readStoreAllowFrom
    ? params.dmPolicy === "open"
      ? []
      : await params.readStoreAllowFrom().catch(() => [])
    : await readStoreAllowFromForDmPolicy({
        provider: "discord",
        accountId: params.accountId,
        dmPolicy: params.dmPolicy,
        shouldRead: params.dmPolicy !== "open",
      });

  const access = resolveDmGroupAccessWithLists({
    isGroup: false,
    dmPolicy: params.dmPolicy,
    allowFrom: params.configuredAllowFrom,
    groupAllowFrom: [],
    storeAllowFrom,
    isSenderAllowed: (allowEntries) =>
      resolveSenderAllowMatch({
        allowEntries,
        sender: params.sender,
        allowNameMatching: params.allowNameMatching,
      }).allowed,
  });

  const allowMatch = resolveSenderAllowMatch({
    allowEntries: access.effectiveAllowFrom,
    sender: params.sender,
    allowNameMatching: params.allowNameMatching,
  });

  const commandAuthorized = resolveCommandAuthorizedFromAuthorizers({
    useAccessGroups: params.useAccessGroups,
    authorizers: [
      {
        configured: access.effectiveAllowFrom.length > 0,
        allowed: allowMatch.allowed,
      },
    ],
    modeWhenAccessGroupsOff: "configured",
  });

  // A Discord DM can be opened by anyone who shares a guild, so `open` on its
  // own is not consent to be messaged: the allowlist has to say so, either by
  // matching this sender or by carrying a `*` wildcard.
  const decision: DmGroupAccessDecision =
    params.dmPolicy === "open" && !allowMatch.allowed ? "block" : access.decision;

  return {
    decision,
    reason: decision === access.decision ? access.reason : "dmPolicy=open (not allowlisted)",
    commandAuthorized:
      decision === "allow"
        ? resolveDmPolicyCommandAuthorization({
            decision,
            commandAuthorized,
          })
        : false,
    allowMatch,
  };
}
