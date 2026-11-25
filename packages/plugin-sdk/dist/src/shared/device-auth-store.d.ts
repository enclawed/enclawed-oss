import { type DeviceAuthEntry, type DeviceAuthStore } from "./device-auth.js";
export type { DeviceAuthEntry, DeviceAuthStore } from "./device-auth.js";
export type DeviceAuthStoreAdapter = {
    readStore: () => DeviceAuthStore | null;
    writeStore: (store: DeviceAuthStore) => void;
};
export declare function loadDeviceAuthTokenFromStore(params: {
    adapter: DeviceAuthStoreAdapter;
    deviceId: string;
    role: string;
    gatewayOrigin: string | null;
}): DeviceAuthEntry | null;
export declare function storeDeviceAuthTokenInStore(params: {
    adapter: DeviceAuthStoreAdapter;
    deviceId: string;
    role: string;
    gatewayOrigin: string | null;
    token: string;
    scopes?: string[];
}): DeviceAuthEntry;
export declare function clearDeviceAuthTokenFromStore(params: {
    adapter: DeviceAuthStoreAdapter;
    deviceId: string;
    role: string;
    gatewayOrigin: string | null;
}): void;
