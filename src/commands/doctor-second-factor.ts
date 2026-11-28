// Doctor: second-factor enrollments that are not a second factor any more.
//
// A "packed" enrollment counts only while its stored registration proves a
// recognized hardware security key (src/enclawed/auth/gate.ts factorRefusal):
// a software or virtual authenticator (Chromium's, for one), or an enrollment
// from before Enclawed 2.0.3 that kept nothing to verify, is refused at use.
// Doctor names each one with how to enroll a replacement and remove it.

import { secondFactorStatus } from "../enclawed/auth/gate.js";
import { note } from "../terminal/note.js";

/** The refusals and warnings doctor reports for the second factor (empty: nothing to report). */
export async function secondFactorDoctorLines(
  env: NodeJS.ProcessEnv = process.env,
  stateDir?: string,
): Promise<string[]> {
  try {
    const s = await secondFactorStatus({
      env,
      ...(stateDir ? { stateDir } : {}),
      interactive: false,
    });
    return s.warnings.filter((w) => /is not a second factor/.test(w)).map((w) => `- ${w}`);
  } catch (err) {
    return [`- the second-factor store could not be read: ${String(err)}`];
  }
}

export async function noteSecondFactorWarnings(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const lines = await secondFactorDoctorLines(env);
  if (lines.length > 0) {
    note(lines.join("\n"), "Second factor");
  }
}
