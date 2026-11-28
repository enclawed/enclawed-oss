// enclawed adapter kit: a host that silently drops the adapter's settings.
//
// The adapter's hooks reach the host through a settings file it generates
// (requirement R3). A host that rejects that file (a value it does not accept,
// a loader bug) runs with NONE of it, hooks included, and no hook is there to
// notice. A host may say so on stderr (a header line saying the files did
// not load, then one line per dropped file). So:
//
//   - Headless, the launcher reads the host's stderr through
//     settingsDropWatcher; a dropped-file line naming the adapter's settings
//     directory, after the host's header, stops the host at once.
//   - Interactive, the host owns the terminal and its stderr cannot be read
//     without changing what the person sees. Before the launch the adapter
//     runs the real host once headless on the same settings content, with
//     every command hook replaced by a neutral command (neutralizeHookCommands:
//     same structure, so the same validation, and nothing runs), and
//     prevalidateSettings refuses the launch when that run reports the file
//     dropped. How to run the host so the one-shot run does nothing (no
//     transcript, no MCP server, no model call that leaves the machine) is the
//     adapter's: it hands the kit a `run` function.
//
// The header and the line format are host data the adapter passes (a RegExp).
// Lines that name other settings files (the user's own) do not count.
//
// Ported from codenclawed's launcher.mjs (settingsDropWatcher) and
// prevalidate.mjs.

/** How long the one-shot prevalidation run may take before the adapter kills it (internal constant). */
export const PREVALIDATE_RUN_MS = 20_000;

const BUFFER_CHARS = 65_536;

/**
 * A stderr reader: call it with each chunk; `onDrop(line)` fires once, for the
 * first line after the host's header (`header` matches the header text) that
 * names `settingsDir`. Returns whether a drop was seen (so far).
 */
export function settingsDropWatcher(o: {
  settingsDir: string;
  header: RegExp;
  onDrop: (line: string) => void;
}): (chunk: string) => boolean {
  let buf = "";
  let afterHeader: number | null = null;
  let fired = false;
  // A global or sticky RegExp keeps state between exec calls: use a copy without it.
  const header = new RegExp(o.header.source, o.header.flags.replace(/[gy]/g, ""));
  return (chunk: string) => {
    if (fired) {
      return true;
    }
    buf += chunk;
    let dropFront = 0;
    if (buf.length > BUFFER_CHARS) {
      dropFront = buf.length - BUFFER_CHARS;
      buf = buf.slice(dropFront);
    }
    if (afterHeader !== null) {
      afterHeader = Math.max(0, afterHeader - dropFront);
    } else {
      const m = header.exec(buf);
      if (m) {
        // The dropped-file lines start on the line after the header's.
        const nl = buf.indexOf("\n", m.index + m[0].length);
        afterHeader = nl < 0 ? buf.length : nl + 1;
      }
    }
    if (afterHeader === null || o.settingsDir === "") {
      return false;
    }
    const line = buf
      .slice(afterHeader)
      .split("\n")
      .find((l) => l.includes(o.settingsDir));
    if (line === undefined) {
      return false;
    }
    fired = true;
    o.onDrop(line.trim());
    return true;
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * A copy of a host `hooks` block (event -> groups -> hooks) whose command
 * hooks all run `neutral` instead: the structure the host validates is the
 * same, and nothing the block names runs. Anything not of that shape is kept
 * as it is (the host validates it the same way).
 */
export function neutralizeHookCommands(hooks: unknown, neutral: string): unknown {
  if (!isRecord(hooks)) {
    return hooks;
  }
  const out: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(hooks)) {
    out[event] = Array.isArray(groups)
      ? groups.map((g: unknown) =>
          isRecord(g) && Array.isArray(g.hooks)
            ? {
                ...g,
                hooks: g.hooks.map((h: unknown) =>
                  isRecord(h) && h.type === "command" ? { ...h, command: neutral } : h,
                ),
              }
            : g,
        )
      : groups;
  }
  return out;
}

export type PrevalidateResult =
  | Readonly<{ ok: true; code: "loaded"; ran: true }>
  | Readonly<{ ok: true; code: "not-run"; ran: false; note: string }>
  | Readonly<{ ok: false; code: "settings-dropped"; line: string }>;

/**
 * The interactive guard's decision. `run` starts the host once headless on the
 * neutralized copy and feeds its stderr to `onStderr`; when `onStderr` returns
 * true (a drop was seen) the adapter kills the run at once. `run` must kill it
 * after PREVALIDATE_RUN_MS. It resolves true when the host ran, false when it
 * could not start. A drop refuses the launch; a host that could not be run
 * leaves the launch to the live guards (the transcript watch stops the
 * session at its first unchecked call).
 */
export async function prevalidateSettings(o: {
  settingsDir: string;
  header: RegExp;
  run: (io: { onStderr: (chunk: string) => boolean; deadlineMs: number }) => Promise<boolean>;
}): Promise<PrevalidateResult> {
  // A holder, not a `let`: the drop is recorded from inside the callback.
  const seen: { line: string | null } = { line: null };
  const watch = settingsDropWatcher({
    settingsDir: o.settingsDir,
    header: o.header,
    onDrop: (line) => {
      seen.line = line;
    },
  });
  let ran: boolean;
  try {
    ran = await o.run({ onStderr: watch, deadlineMs: PREVALIDATE_RUN_MS });
  } catch (err) {
    ran = false;
    if (seen.line === null) {
      return {
        ok: true,
        code: "not-run",
        ran: false,
        note: `the prevalidation run failed (${err instanceof Error ? err.message : String(err)})`,
      };
    }
  }
  if (seen.line !== null) {
    return { ok: false, code: "settings-dropped", line: seen.line };
  }
  return ran
    ? { ok: true, code: "loaded", ran: true }
    : { ok: true, code: "not-run", ran: false, note: "the host could not be started" };
}
