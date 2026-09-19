export type BrowserProfileConfig = {
    /** CDP port for this profile. Allocated once at creation, persisted permanently. */
    cdpPort?: number;
    /** CDP URL for this profile (use for remote Chrome). */
    cdpUrl?: string;
    /** Explicit user data directory for existing-session Chrome MCP attachment. */
    userDataDir?: string;
    /** Profile driver (default: enclawed). */
    driver?: "enclawed" | "clawd" | "existing-session";
    /** If true, never launch a browser for this profile; only attach. Falls back to browser.attachOnly. */
    attachOnly?: boolean;
    /** Profile color (hex). Auto-assigned at creation. */
    color: string;
    /** Per-profile Chrome executable override; falls back to the browser-level setting. */
    executablePath?: string;
    /** Per-profile headless override; falls back to the browser-level setting. */
    headless?: boolean;
    /** Per-profile Chrome MCP launch command override. */
    mcpCommand?: string;
    /** Per-profile Chrome MCP launch arguments override. */
    mcpArgs?: string[];
};
/**
 * Per-browser tab housekeeping configuration consumed by the local Chrome
 * driver to close stale tabs while preserving the user's active session.
 */
export type BrowserTabCleanupConfig = {
    enabled?: boolean;
    /** Idle minutes after which a tab becomes eligible for cleanup. */
    idleMinutes?: number;
    /** Maximum tabs kept per session before older idle tabs are reaped. */
    maxTabsPerSession?: number;
    /** Interval in minutes between cleanup sweeps. */
    sweepMinutes?: number;
};
export type BrowserSnapshotDefaults = {
    /** Default snapshot mode (applies when mode is not provided). */
    mode?: "efficient";
};
export type BrowserSsrFPolicyConfig = {
    /** If true, permit browser navigation to private/internal networks. Default: true */
    dangerouslyAllowPrivateNetwork?: boolean;
    /**
     * Explicitly allowed hostnames (exact-match), including blocked names like localhost.
     * Example: ["localhost", "metadata.internal"]
     */
    allowedHostnames?: string[];
    /**
     * Hostname allowlist patterns for browser navigation.
     * Supports exact hosts and "*.example.com" wildcard subdomains.
     */
    hostnameAllowlist?: string[];
};
export type BrowserConfig = {
    enabled?: boolean;
    /** If false, disable browser act:evaluate (arbitrary JS). Default: true */
    evaluateEnabled?: boolean;
    /** Base URL of the CDP endpoint (for remote browsers). Default: loopback CDP on the derived port. */
    cdpUrl?: string;
    /** Remote CDP HTTP timeout (ms). Default: 1500. */
    remoteCdpTimeoutMs?: number;
    /** Remote CDP WebSocket handshake timeout (ms). Default: max(remoteCdpTimeoutMs * 2, 2000). */
    remoteCdpHandshakeTimeoutMs?: number;
    /** Accent color for the enclawed browser profile (hex). Default: #FF4500 */
    color?: string;
    /** Override the browser executable path (all platforms). */
    executablePath?: string;
    /** Start Chrome headless (best-effort). Default: false */
    headless?: boolean;
    /** Pass --no-sandbox to Chrome (Linux containers). Default: false */
    noSandbox?: boolean;
    /** If true: never launch; only attach to an existing browser. Default: false */
    attachOnly?: boolean;
    /** Starting local CDP port for auto-assigned browser profiles. Default derives from gateway port. */
    cdpPortRangeStart?: number;
    /** Default profile to use when profile param is omitted. Default: "chrome" */
    defaultProfile?: string;
    /** Named browser profiles with explicit CDP ports or URLs. */
    profiles?: Record<string, BrowserProfileConfig>;
    /** Default snapshot options (applied by the browser tool/CLI when unset). */
    snapshotDefaults?: BrowserSnapshotDefaults;
    /** SSRF policy for browser navigation/open-tab operations. */
    ssrfPolicy?: BrowserSsrFPolicyConfig;
    /**
     * Additional Chrome launch arguments.
     * Useful for stealth flags, window size overrides, or custom user-agent strings.
     * Example: ["--window-size=1920,1080", "--disable-infobars"]
     */
    extraArgs?: string[];
    /** Default timeout in ms for individual browser actions (default: 60000). */
    actionTimeoutMs?: number;
    /** Local Chrome launch timeout in ms (default: 30000). */
    localLaunchTimeoutMs?: number;
    /** Local CDP readiness probe timeout in ms (default: 8000). */
    localCdpReadyTimeoutMs?: number;
    /** Tab cleanup policy for local-driver browsers. */
    tabCleanup?: BrowserTabCleanupConfig;
};
