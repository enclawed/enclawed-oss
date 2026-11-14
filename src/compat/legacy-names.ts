// Central project-name + manifest-key constants.
//
// The enclawed fork uses the project name "enclawed" everywhere. The legacy
// upstream OpenClaw name is kept here as a backward-compat reader so that
// existing plugin packages on disk (third-party plugins that still ship the
// old `"openclaw":` key in package.json, plugin-manifest files keyed
// "openclaw", etc.) continue to load. New code MUST emit the new names.
//
// Migration is read-only: discovery, validation, and registry helpers consult
// LEGACY_MANIFEST_KEYS as a fallback when MANIFEST_KEY is absent; they never
// write the legacy key.
export const PROJECT_NAME = "enclawed" as const;

export const LEGACY_PROJECT_NAMES = ["openclaw"] as const;

/**
 * The current package.json key under which the runtime reads plugin metadata
 * (`{ "enclawed": { "extensions": [...] } }`). New plugins MUST use this key.
 */
export const MANIFEST_KEY = PROJECT_NAME;

/**
 * Legacy package.json keys still recognized by the loader for plugins that
 * have not yet migrated (`{ "openclaw": { "extensions": [...] } }`). The
 * loader prefers MANIFEST_KEY when both are present; never writes these.
 */
export const LEGACY_MANIFEST_KEYS = LEGACY_PROJECT_NAMES;

export const LEGACY_PLUGIN_MANIFEST_FILENAMES = ["openclaw.plugin.json"] as const;

export const LEGACY_CANVAS_HANDLER_NAMES = ["openclaw"] as const;

export const MACOS_APP_SOURCES_DIR = "apps/macos/Sources/Enclawed" as const;

/**
 * Legacy macOS sources directory names. Existing checkouts that still ship
 * the upstream "OpenClaw" sources dir layout continue to be findable by
 * cron-protocol conformance tests via this fallback list; new code points at
 * MACOS_APP_SOURCES_DIR only.
 */
export const LEGACY_MACOS_APP_SOURCES_DIRS = ["apps/macos/Sources/OpenClaw"] as const;
