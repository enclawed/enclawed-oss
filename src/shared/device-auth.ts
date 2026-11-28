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

// A WebSocket client may be handed an http(s) URL for the same server
// (browsers and `ws` both accept it); it names the same origin as ws(s).
const WS_SCHEMES: Readonly<Record<string, { scheme: string; defaultPort: string }>> = {
  "ws:": { scheme: "ws:", defaultPort: "80" },
  "http:": { scheme: "ws:", defaultPort: "80" },
  "wss:": { scheme: "wss:", defaultPort: "443" },
  "https:": { scheme: "wss:", defaultPort: "443" },
};

/**
 * Normalized gateway origin (`scheme://host:port`) that a stored device token is
 * bound to. Only ws:/wss: (and the equivalent http:/https:) URLs have an
 * origin; anything else (unparsable, file:, javascript:) returns null, and a caller holding null must
 * neither send nor store a device token. Userinfo, path, query and fragment
 * are not part of the origin; the default port is made explicit so `wss://h`
 * and `wss://h:443` are the same gateway.
 */
export function normalizeGatewayOrigin(url: string, base?: string): string | null {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = base ? new URL(trimmed, base) : new URL(trimmed);
  } catch {
    return null;
  }
  const mapped = WS_SCHEMES[parsed.protocol.toLowerCase()];
  if (!mapped) {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return null;
  }
  return `${mapped.scheme}//${hostname}:${parsed.port || mapped.defaultPort}`;
}

export function normalizeDeviceAuthRole(role: string): string {
  return role.trim();
}

export function normalizeDeviceAuthScopes(scopes: string[] | undefined): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  const out = new Set<string>();
  for (const scope of scopes) {
    const trimmed = scope.trim();
    if (trimmed) {
      out.add(trimmed);
    }
  }
  if (out.has("operator.admin")) {
    out.add("operator.read");
    out.add("operator.write");
  } else if (out.has("operator.write")) {
    out.add("operator.read");
  }
  return [...out].toSorted();
}
