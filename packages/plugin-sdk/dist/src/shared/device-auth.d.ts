export type DeviceAuthEntry = {
    token: string;
    role: string;
    scopes: string[];
    updatedAtMs: number;
};
export type DeviceAuthStore = {
    version: 1;
    deviceId: string;
    /**
     * Legacy role-keyed tokens, not bound to any gateway. Gateway clients never
     * read them (a token minted by one gateway must not be offered to another);
     * they stay in the file only for older clients that still share it.
     */
    tokens: Record<string, DeviceAuthEntry>;
    /** Device tokens keyed by normalized gateway origin, then by role. */
    gateways?: Record<string, Record<string, DeviceAuthEntry>>;
};
/**
 * Normalized gateway origin (`scheme://host:port`) that a stored device token is
 * bound to. Only ws:/wss: (and the equivalent http:/https:) URLs have an
 * origin; anything else (unparsable, file:, javascript:) returns null, and a caller holding null must
 * neither send nor store a device token. Userinfo, path, query and fragment
 * are not part of the origin; the default port is made explicit so `wss://h`
 * and `wss://h:443` are the same gateway.
 */
export declare function normalizeGatewayOrigin(url: string, base?: string): string | null;
export declare function normalizeDeviceAuthRole(role: string): string;
export declare function normalizeDeviceAuthScopes(scopes: string[] | undefined): string[];
