// The real Enclaweder is never a test fixture.
//
// Test suites have touched the founder's real Enclaweder more than once: a hardware test that
// ran in the default suite whenever a device was attached, and a process running an old build
// that bound the real device and wrote the real latch. So the framework itself refuses, under
// any test runner, both opening a real device node and writing the real user's hardware-root
// state, unless the run is deliberately a live-device one. Simulated devices (an injected
// transport) and throwaway state paths are unaffected.
import os from "node:os";
import path from "node:path";

/**
 * The one deliberate opt-in that lets a process under a test runner open a REAL Enclaweder.
 * Its value must be exactly this string: a stray `=1` in a shell profile is not consent.
 */
export const LIVE_DEVICE_TEST_ENV = "ENCLAWEDER_LIVE_DEVICE_TEST";
export const LIVE_DEVICE_TEST_ACK = "I_UNDERSTAND";

/** True when this process runs under a test runner (vitest, node --test, jest, NODE_ENV=test). */
export function underTestRunner(): boolean {
  const e = process.env;
  if (
    e.VITEST ||
    e.VITEST_WORKER_ID ||
    e.VITEST_POOL_ID ||
    e.JEST_WORKER_ID ||
    e.NODE_TEST_CONTEXT
  ) {
    return true;
  }
  if ((e.NODE_ENV ?? "").trim().toLowerCase() === "test") {
    return true;
  }
  const argv = [...process.execArgv, ...(e.NODE_OPTIONS ?? "").split(/\s+/)];
  return argv.some((a) => a === "--test" || a.startsWith("--test=") || a.startsWith("--test-"));
}

/**
 * Why a test-runner process must not touch the real device, or null. Test suites have touched
 * the founder's real Enclaweder more than once (a hardware test in the default suite, a stale
 * build binding the real device and latch), so under any test runner every real-device open is
 * refused unless ENCLAWEDER_LIVE_DEVICE_TEST=I_UNDERSTAND is set. Simulated devices (an injected
 * transport) never come through here.
 */
export function testRunnerRefusal(): string | null {
  if (!underTestRunner() || process.env[LIVE_DEVICE_TEST_ENV] === LIVE_DEVICE_TEST_ACK) {
    return null;
  }
  return `a test runner may not open a real Enclaweder; set ${LIVE_DEVICE_TEST_ENV}=${LIVE_DEVICE_TEST_ACK} only for a deliberate live-device run (pnpm test:device)`;
}

/** The real user's home, from the password database: HOME is whatever the caller exported. */
function realHome(): string | null {
  try {
    return os.userInfo().homedir || null;
  } catch {
    return null;
  }
}

/**
 * Why a test-runner process must not write `file`, or null: the real user's hardware-root
 * latch, its journal and history (`~/.enclawed-hw-root*`) and the forensic log
 * (`~/.enclawed-forensics*`), whatever HOME says. Throwaway paths are fine.
 */
export function realStateWriteRefusal(file: string): string | null {
  if (!underTestRunner() || process.env[LIVE_DEVICE_TEST_ENV] === LIVE_DEVICE_TEST_ACK) {
    return null;
  }
  const home = realHome();
  if (!home) {
    return null;
  }
  const abs = path.resolve(file);
  const base = path.basename(abs);
  if (path.dirname(abs) === path.resolve(home) && /^\.enclawed-(hw-root|forensics)/.test(base)) {
    return `a test runner may not write the real ${abs}; give the test its own state path (or set ${LIVE_DEVICE_TEST_ENV}=${LIVE_DEVICE_TEST_ACK} for a deliberate live-device run)`;
  }
  return null;
}
