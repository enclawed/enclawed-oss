import {
  defineLegacyConfigMigration,
  getAgentsList,
  getRecord,
  type LegacyConfigMigrationSpec,
  type LegacyConfigRule,
} from "../../../config/legacy.shared.js";

// Bundled channel plugins removed from Enclawed. Their `channels.<id>` sections,
// per-channel queue overrides, and heartbeat targets are no longer part of the
// config contract; doctor drops them so old configs keep loading. zalouser (Zalo
// personal account) was removed because its zca-js client depends on the
// deprecated crypto-js; the official Zalo channel (`zalo`) is unaffected.
export const REMOVED_CHANNEL_IDS: readonly string[] = ["feishu", "qqbot", "zalouser"];

const REMOVED_CHANNEL_ID_SET: ReadonlySet<string> = new Set(REMOVED_CHANNEL_IDS);

function isRemovedChannelId(value: unknown): value is string {
  return typeof value === "string" && REMOVED_CHANNEL_ID_SET.has(value.trim().toLowerCase());
}

function hasRemovedChannelKey(value: unknown): boolean {
  const record = getRecord(value);
  return record !== null && Object.keys(record).some((key) => isRemovedChannelId(key));
}

function hasRemovedHeartbeatTarget(agent: unknown): boolean {
  return isRemovedChannelId(getRecord(getRecord(agent)?.heartbeat)?.target);
}

const REMOVED_CHANNEL_MESSAGE_SUFFIX =
  'is no longer supported (the channel plugin was removed). Run "enclawed doctor --fix" to remove it.';

const REMOVED_CHANNEL_RULES: LegacyConfigRule[] = [
  ...REMOVED_CHANNEL_IDS.map((channelId): LegacyConfigRule => ({
    path: ["channels", channelId],
    message: `channels.${channelId} ${REMOVED_CHANNEL_MESSAGE_SUFFIX}`,
  })),
  {
    path: ["messages", "queue", "byChannel"],
    message: `messages.queue.byChannel entries for removed channels ${REMOVED_CHANNEL_MESSAGE_SUFFIX}`,
    match: hasRemovedChannelKey,
  },
  {
    path: ["messages", "queue", "debounceMsByChannel"],
    message: `messages.queue.debounceMsByChannel entries for removed channels ${REMOVED_CHANNEL_MESSAGE_SUFFIX}`,
    match: hasRemovedChannelKey,
  },
  {
    path: ["agents", "defaults", "heartbeat", "target"],
    message: `agents.defaults.heartbeat.target naming a removed channel ${REMOVED_CHANNEL_MESSAGE_SUFFIX}`,
    match: isRemovedChannelId,
  },
  {
    path: ["agents", "list"],
    message: `agents.list[].heartbeat.target naming a removed channel ${REMOVED_CHANNEL_MESSAGE_SUFFIX}`,
    match: (value) => Array.isArray(value) && value.some(hasRemovedHeartbeatTarget),
  },
];

function removeRemovedChannelKeys(
  record: Record<string, unknown> | null,
  pathLabel: string,
  changes: string[],
): void {
  if (!record) {
    return;
  }
  for (const key of Object.keys(record)) {
    if (isRemovedChannelId(key)) {
      delete record[key];
      changes.push(`Removed ${pathLabel}.${key} (the ${key} channel plugin was removed).`);
    }
  }
}

// A heartbeat target naming a removed channel can no longer be delivered; drop the
// target and its channel-specific recipient so the heartbeat falls back to its default.
function removeRemovedHeartbeatTarget(
  agent: Record<string, unknown> | null,
  pathLabel: string,
  changes: string[],
): void {
  const heartbeat = getRecord(agent?.heartbeat);
  if (!heartbeat || !isRemovedChannelId(heartbeat.target)) {
    return;
  }
  const target = heartbeat.target;
  delete heartbeat.target;
  delete heartbeat.to;
  changes.push(
    `Removed ${pathLabel}.heartbeat.target "${target}" (the channel plugin was removed).`,
  );
}

export const LEGACY_CONFIG_MIGRATIONS_REMOVED_CHANNELS: LegacyConfigMigrationSpec[] = [
  defineLegacyConfigMigration({
    id: "channels.removed-channel-plugins",
    describe: "Remove config for channel plugins that were removed from Enclawed",
    legacyRules: REMOVED_CHANNEL_RULES,
    apply: (raw, changes) => {
      removeRemovedChannelKeys(getRecord(raw.channels), "channels", changes);

      const queue = getRecord(getRecord(raw.messages)?.queue);
      removeRemovedChannelKeys(getRecord(queue?.byChannel), "messages.queue.byChannel", changes);
      removeRemovedChannelKeys(
        getRecord(queue?.debounceMsByChannel),
        "messages.queue.debounceMsByChannel",
        changes,
      );

      const agents = getRecord(raw.agents);
      removeRemovedHeartbeatTarget(getRecord(agents?.defaults), "agents.defaults", changes);
      getAgentsList(agents).forEach((agent, index) => {
        removeRemovedHeartbeatTarget(getRecord(agent), `agents.list.${index}`, changes);
      });
    },
  }),
];
