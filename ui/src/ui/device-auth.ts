import {
  clearDeviceAuthTokenFromStore,
  type DeviceAuthEntry,
  loadDeviceAuthTokenFromStore,
  storeDeviceAuthTokenInStore,
} from "../../../src/shared/device-auth-store.js";
import { type DeviceAuthStore, normalizeGatewayOrigin } from "../../../src/shared/device-auth.js";
import { getSafeLocalStorage } from "../local-storage.ts";

const STORAGE_KEY = "enclawed.device.auth.v1";

function readStore(): DeviceAuthStore | null {
  try {
    const raw = getSafeLocalStorage()?.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DeviceAuthStore;
    if (!parsed || parsed.version !== 1) {
      return null;
    }
    if (!parsed.deviceId || typeof parsed.deviceId !== "string") {
      return null;
    }
    if (!parsed.tokens || typeof parsed.tokens !== "object") {
      return null;
    }
    if (Object.keys(parsed.tokens).length > 0) {
      // Migration: role-only tokens from older builds are not bound to any
      // gateway. Drop them (the device re-pairs) instead of guessing an origin.
      const migrated: DeviceAuthStore = { ...parsed, tokens: {} };
      writeStore(migrated);
      return migrated;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStore(store: DeviceAuthStore) {
  try {
    // The Control UI never keeps un-keyed tokens.
    getSafeLocalStorage()?.setItem(STORAGE_KEY, JSON.stringify({ ...store, tokens: {} }));
  } catch {
    // best-effort
  }
}

/**
 * Origin a stored device token is bound to, for a gateway URL as the client
 * would open it (relative URLs resolve against the page). Null = no binding:
 * the caller must not send or store a device token for that URL.
 */
export function resolveDeviceTokenGatewayOrigin(gatewayUrl: string): string | null {
  const base = typeof location !== "undefined" ? location.href : undefined;
  return normalizeGatewayOrigin(gatewayUrl, base);
}

export function loadDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  gatewayUrl: string;
}): DeviceAuthEntry | null {
  return loadDeviceAuthTokenFromStore({
    adapter: { readStore, writeStore },
    deviceId: params.deviceId,
    role: params.role,
    gatewayOrigin: resolveDeviceTokenGatewayOrigin(params.gatewayUrl),
  });
}

export function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  gatewayUrl: string;
  token: string;
  scopes?: string[];
}): DeviceAuthEntry {
  return storeDeviceAuthTokenInStore({
    adapter: { readStore, writeStore },
    deviceId: params.deviceId,
    role: params.role,
    gatewayOrigin: resolveDeviceTokenGatewayOrigin(params.gatewayUrl),
    token: params.token,
    scopes: params.scopes,
  });
}

export function clearDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  gatewayUrl: string;
}) {
  clearDeviceAuthTokenFromStore({
    adapter: { readStore, writeStore },
    deviceId: params.deviceId,
    role: params.role,
    gatewayOrigin: resolveDeviceTokenGatewayOrigin(params.gatewayUrl),
  });
}
