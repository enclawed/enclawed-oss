import {
  listBundledChannelPlugins,
} from "../../../src/channels/plugins/bundled.js";
import type { ChannelPlugin } from "../../../src/channels/plugins/types.js";
import type { EnclawedConfig } from "../../../src/config/config.js";
import { channelPluginSurfaceKeys, type ChannelPluginSurface } from "./manifest.js";

type SurfaceContractEntry = {
  id: string;
  plugin: Pick<
    ChannelPlugin,
    | "id"
    | "actions"
    | "setup"
    | "status"
    | "outbound"
    | "messaging"
    | "threading"
    | "directory"
    | "gateway"
  >;
  surfaces: readonly ChannelPluginSurface[];
};

type ThreadingContractEntry = {
  id: string;
  plugin: Pick<ChannelPlugin, "id" | "threading">;
};

type DirectoryContractEntry = {
  id: string;
  plugin: Pick<ChannelPlugin, "id" | "directory">;
  coverage: "lookups" | "presence";
  cfg?: EnclawedConfig;
  accountId?: string;
};

// Line + Matrix bundled-channel runtime setup quarantined to attic/ pending
// enclawed security review (channels stripped from this fork; see
// attic/README.md). When a channel returns, register its runtime here.

let surfaceContractRegistryCache: SurfaceContractEntry[] | undefined;
let threadingContractRegistryCache: ThreadingContractEntry[] | undefined;
let directoryContractRegistryCache: DirectoryContractEntry[] | undefined;

export function getSurfaceContractRegistry(): SurfaceContractEntry[] {
  surfaceContractRegistryCache ??= listBundledChannelPlugins().map((plugin) => ({
    id: plugin.id,
    plugin,
    surfaces: channelPluginSurfaceKeys.filter((surface) => Boolean(plugin[surface])),
  }));
  return surfaceContractRegistryCache;
}

export function getThreadingContractRegistry(): ThreadingContractEntry[] {
  threadingContractRegistryCache ??= getSurfaceContractRegistry()
    .filter((entry) => entry.surfaces.includes("threading"))
    .map((entry) => ({
      id: entry.id,
      plugin: entry.plugin,
    }));
  return threadingContractRegistryCache;
}

const directoryPresenceOnlyIds = new Set(["whatsapp", "zalouser"]);

export function getDirectoryContractRegistry(): DirectoryContractEntry[] {
  directoryContractRegistryCache ??= getSurfaceContractRegistry()
    .filter((entry) => entry.surfaces.includes("directory"))
    .map((entry) => ({
      id: entry.id,
      plugin: entry.plugin,
      coverage: directoryPresenceOnlyIds.has(entry.id) ? "presence" : "lookups",
    }));
  return directoryContractRegistryCache;
}
