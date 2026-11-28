/**
 * The one deliberate opt-in that lets a process under a test runner open a REAL Enclaweder.
 * Its value must be exactly this string: a stray `=1` in a shell profile is not consent.
 */
export declare const LIVE_DEVICE_TEST_ENV = "ENCLAWEDER_LIVE_DEVICE_TEST";
export declare const LIVE_DEVICE_TEST_ACK = "I_UNDERSTAND";
/** True when this process runs under a test runner (vitest, node --test, jest, NODE_ENV=test). */
export declare function underTestRunner(): boolean;
/**
 * Why a test-runner process must not touch the real device, or null. Test suites have touched
 * the founder's real Enclaweder more than once (a hardware test in the default suite, a stale
 * build binding the real device and latch), so under any test runner every real-device open is
 * refused unless ENCLAWEDER_LIVE_DEVICE_TEST=I_UNDERSTAND is set. Simulated devices (an injected
 * transport) never come through here.
 */
export declare function testRunnerRefusal(): string | null;
/**
 * Why a test-runner process must not write `file`, or null: the real user's hardware-root
 * latch, its journal and history (`~/.enclawed-hw-root*`) and the forensic log
 * (`~/.enclawed-forensics*`), whatever HOME says. Throwaway paths are fine.
 */
export declare function realStateWriteRefusal(file: string): string | null;
