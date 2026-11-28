import { note } from "../terminal/note.js";

/**
 * Contained Python: does the interpreter a contained run would start meet the
 * guard's minimum (Python 3.14)? Quiet when there is no python3 or when it does.
 * Read-only: runs the interpreter isolated only to ask its version.
 */
export async function noteContainedPython(): Promise<void> {
  const { containedPythonStatus } = await import("../enclawed/adapter/python-reader.js");
  const status = containedPythonStatus();
  if (!status.program || !status.unsupported) {
    return;
  }
  note(
    [
      `- ${status.unsupported} (${status.program}).`,
      "- Python lines are not run contained: each asks a person. Install Python 3.14 or newer to run them contained.",
    ].join("\n"),
    "Contained Python",
  );
}
