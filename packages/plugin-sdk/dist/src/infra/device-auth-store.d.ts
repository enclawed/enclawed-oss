import { type DeviceAuthEntry } from "../shared/device-auth-store.js";
export declare function loadDeviceAuthToken(params: {
    deviceId: string;
    role: string;
    /** Gateway URL the token is (to be) used with; tokens are bound to its origin. */
    gatewayUrl: string;
    env?: NodeJS.ProcessEnv;
}): DeviceAuthEntry | null;
export declare function storeDeviceAuthToken(params: {
    deviceId: string;
    role: string;
    gatewayUrl: string;
    token: string;
    scopes?: string[];
    env?: NodeJS.ProcessEnv;
}): DeviceAuthEntry;
export declare function clearDeviceAuthToken(params: {
    deviceId: string;
    role: string;
    gatewayUrl: string;
    env?: NodeJS.ProcessEnv;
}): void;
