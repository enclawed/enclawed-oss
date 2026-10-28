export declare const PROJECT_NAME: "enclawed";
export declare const LEGACY_PROJECT_NAMES: readonly ["openclaw"];
/**
 * The current package.json key under which the runtime reads plugin metadata
 * (`{ "enclawed": { "extensions": [...] } }`). New plugins MUST use this key.
 */
export declare const MANIFEST_KEY: "enclawed";
/**
 * Legacy package.json keys still recognized by the loader for plugins that
 * have not yet migrated (`{ "openclaw": { "extensions": [...] } }`). The
 * loader prefers MANIFEST_KEY when both are present; never writes these.
 */
export declare const LEGACY_MANIFEST_KEYS: readonly ["openclaw"];
export declare const LEGACY_PLUGIN_MANIFEST_FILENAMES: readonly ["openclaw.plugin.json"];
export declare const LEGACY_CANVAS_HANDLER_NAMES: readonly ["openclaw"];
export declare const MACOS_APP_SOURCES_DIR: "apps/macos/Sources/Enclawed";
/**
 * Legacy macOS sources directory names. Existing checkouts that still ship
 * the upstream "OpenClaw" sources dir layout continue to be findable by
 * cron-protocol conformance tests via this fallback list; new code points at
 * MACOS_APP_SOURCES_DIR only.
 */
export declare const LEGACY_MACOS_APP_SOURCES_DIRS: readonly ["apps/macos/Sources/OpenClaw"];
