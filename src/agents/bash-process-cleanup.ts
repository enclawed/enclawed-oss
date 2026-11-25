import { killProcessTree } from "../process/kill-tree.js";
import { getProcessSupervisor } from "../process/supervisor/index.js";
import { listRunningSessions } from "./bash-process-registry.js";

/**
 * Ends every exec session still running in the background and returns how
 * many it ended. The process registry lives in this process's memory, so once
 * a one-shot run exits nobody can poll or kill its background sessions again;
 * left alone they keep the CLI from exiting (an open PTY holds the event loop)
 * or outlive it as orphans.
 */
export function terminateBackgroundExecSessions(): number {
  const supervisor = getProcessSupervisor();
  let ended = 0;
  for (const session of listRunningSessions()) {
    const record = supervisor.getRecord(session.id);
    if (record && record.state !== "exited") {
      supervisor.cancel(session.id, "manual-cancel");
      ended++;
      continue;
    }
    const pid = session.pid ?? session.child?.pid;
    if (typeof pid === "number" && Number.isFinite(pid) && pid > 0) {
      killProcessTree(pid);
      ended++;
    }
  }
  return ended;
}
