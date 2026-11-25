import {
  type DeviceAuthEntry,
  type DeviceAuthStore,
  normalizeDeviceAuthRole,
  normalizeDeviceAuthScopes,
} from "./device-auth.js";
export type { DeviceAuthEntry, DeviceAuthStore } from "./device-auth.js";

export type DeviceAuthStoreAdapter = {
  readStore: () => DeviceAuthStore | null;
  writeStore: (store: DeviceAuthStore) => void;
};

// Device tokens are bound to the gateway origin that minted them
// (CVE-2026-25253 class: a token stored for gateway A must never be offered to
// gateway B, e.g. after a person confirms a crafted `gatewayUrl` link). Every
// operation takes the normalized origin (`normalizeGatewayOrigin`); the legacy
// role-only `tokens` map is never read, so un-keyed tokens from older builds
// are dropped and the device re-pairs with each gateway.

function cloneGateways(
  store: DeviceAuthStore | null,
  deviceId: string,
): Record<string, Record<string, DeviceAuthEntry>> {
  if (!store || store.deviceId !== deviceId || !store.gateways) {
    return {};
  }
  const out: Record<string, Record<string, DeviceAuthEntry>> = {};
  for (const [origin, roles] of Object.entries(store.gateways)) {
    if (roles && typeof roles === "object") {
      out[origin] = { ...roles };
    }
  }
  return out;
}

function legacyTokens(
  store: DeviceAuthStore | null,
  deviceId: string,
): Record<string, DeviceAuthEntry> {
  return store && store.deviceId === deviceId && store.tokens ? { ...store.tokens } : {};
}

export function loadDeviceAuthTokenFromStore(params: {
  adapter: DeviceAuthStoreAdapter;
  deviceId: string;
  role: string;
  gatewayOrigin: string | null;
}): DeviceAuthEntry | null {
  const store = params.adapter.readStore();
  if (!store || store.deviceId !== params.deviceId || !params.gatewayOrigin) {
    return null;
  }
  const role = normalizeDeviceAuthRole(params.role);
  const roles = store.gateways?.[params.gatewayOrigin];
  const entry = roles && typeof roles === "object" ? roles[role] : undefined;
  if (!entry || typeof entry.token !== "string") {
    return null;
  }
  return entry;
}

export function storeDeviceAuthTokenInStore(params: {
  adapter: DeviceAuthStoreAdapter;
  deviceId: string;
  role: string;
  gatewayOrigin: string | null;
  token: string;
  scopes?: string[];
}): DeviceAuthEntry {
  const role = normalizeDeviceAuthRole(params.role);
  const entry: DeviceAuthEntry = {
    token: params.token,
    role,
    scopes: normalizeDeviceAuthScopes(params.scopes),
    updatedAtMs: Date.now(),
  };
  if (!params.gatewayOrigin) {
    // No origin means no binding: refuse to persist rather than store un-keyed.
    return entry;
  }
  const existing = params.adapter.readStore();
  const gateways = cloneGateways(existing, params.deviceId);
  gateways[params.gatewayOrigin] = { ...gateways[params.gatewayOrigin], [role]: entry };
  params.adapter.writeStore({
    version: 1,
    deviceId: params.deviceId,
    tokens: legacyTokens(existing, params.deviceId),
    gateways,
  });
  return entry;
}

export function clearDeviceAuthTokenFromStore(params: {
  adapter: DeviceAuthStoreAdapter;
  deviceId: string;
  role: string;
  gatewayOrigin: string | null;
}): void {
  const store = params.adapter.readStore();
  if (!store || store.deviceId !== params.deviceId || !params.gatewayOrigin) {
    return;
  }
  const role = normalizeDeviceAuthRole(params.role);
  if (!store.gateways?.[params.gatewayOrigin]?.[role]) {
    return;
  }
  const gateways = cloneGateways(store, store.deviceId);
  const roles = { ...gateways[params.gatewayOrigin] };
  delete roles[role];
  if (Object.keys(roles).length === 0) {
    delete gateways[params.gatewayOrigin];
  } else {
    gateways[params.gatewayOrigin] = roles;
  }
  params.adapter.writeStore({
    version: 1,
    deviceId: store.deviceId,
    tokens: legacyTokens(store, store.deviceId),
    gateways,
  });
}
