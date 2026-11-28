export type HardwareRootMode = "auto" | "required" | "optional";
export declare class HardwareRootModeError extends Error {
    readonly value: string;
    name: string;
    constructor(value: string);
}
/**
 * Parse ENCLAWEDER_ROOT. Unset (or set to the empty string) is "auto": a
 * device on the bus is bound and enforced, and none means software-only.
 * Throws HardwareRootModeError for anything but the exact accepted words.
 */
export declare function parseHardwareRootMode(raw: string | undefined): HardwareRootMode;
/** The mode from `env` (default process.env); throws on an invalid value. */
export declare function hardwareRootMode(env?: NodeJS.ProcessEnv): HardwareRootMode;
