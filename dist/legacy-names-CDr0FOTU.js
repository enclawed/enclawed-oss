//#region src/compat/legacy-names.ts
const PROJECT_NAME = "enclawed";
const LEGACY_PROJECT_NAMES = ["openclaw"];
/**
* The current package.json key under which the runtime reads plugin metadata
* (`{ "enclawed": { "extensions": [...] } }`). New plugins MUST use this key.
*/
const MANIFEST_KEY = PROJECT_NAME;
/**
* Legacy package.json keys still recognized by the loader for plugins that
* have not yet migrated (`{ "openclaw": { "extensions": [...] } }`). The
* loader prefers MANIFEST_KEY when both are present; never writes these.
*/
const LEGACY_MANIFEST_KEYS = LEGACY_PROJECT_NAMES;
//#endregion
export { MANIFEST_KEY as n, LEGACY_MANIFEST_KEYS as t };
