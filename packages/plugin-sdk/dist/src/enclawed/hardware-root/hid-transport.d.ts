export declare const ENCLAWEDER_VID = 4617;
export declare const ENCLAWEDER_PID = 57600;
/**
 * The whole platform-dependent surface: two report operations and a
 * close. `readReport` is non-blocking and returns 0 when nothing is
 * pending, mirroring the EAGAIN the hidraw path already handles.
 */
export interface HidTransport {
    writeReport(report: Buffer): void;
    readReport(into: Buffer): number;
    close(): void;
}
export type HidBackend = "hidraw" | "node-hid" | "none";
/** Which backend this platform will use, without opening anything. */
export declare function hidBackend(): HidBackend;
/** Every attached enclaweder, as opaque handles for openHid(). */
export declare function listEnclawederPaths(): string[];
/**
 * The USB/Bluetooth identity a hidraw node reports, parsed from its uevent's exact
 * `HID_ID=bbbb:vvvvvvvv:pppppppp` line (finding H10). HID_NAME and HID_UNIQ are strings the
 * peripheral supplies about itself, so nothing is ever matched against them.
 */
export declare function parseHidId(uevent: string): {
    bus: number;
    vid: number;
    pid: number;
} | null;
/**
 * Why a pinned device path (ENCLAWEDER_HIDRAW or an explicit option) must not be opened, or
 * null (finding H10): on Linux it must be a /dev/hidrawN node whose sysfs identity is the
 * Enclaweder's VID:PID, so protocol frames are never written to some other HID device.
 */
export declare function pinnedPathRefusal(path: string): string | null;
export declare function openHid(path: string): HidTransport;
/**
 * Why this process must not open the device node itself, or null (finding N16, H14). A process
 * outside the initial user namespace reaches the hardware root only through the host's broker;
 * ENCLAWEDER_DEVICE=deny (set by test and benchmark harnesses) refuses every direct open.
 */
export declare function directOpenRefusal(): string | null;
