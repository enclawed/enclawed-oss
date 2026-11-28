// Signals a rank's whole process tree.
//
// A rank that is an agent starts tools, and a tool may start an MPI job. The
// MPI launcher runs its process manager in a session of its own (MPICH's
// hydra_pmi_proxy calls setsid), so that job's ranks are outside the agent's
// process group. A signal to the group alone would leave them running, so the
// supervisor signals every descendant it can see.
// On Linux the tree comes from the parent links in /proc; elsewhere only the
// process itself is signalled.

import { readdirSync, readFileSync } from "node:fs";

/** `root` and every live descendant, parents before children. */
export function processTree(root: number): number[] {
  let entries: string[];
  try {
    entries = readdirSync("/proc");
  } catch {
    return [root];
  }
  const children = new Map<number, number[]>();
  for (const name of entries) {
    if (!/^\d+$/.test(name)) {
      continue;
    }
    let stat: string;
    try {
      stat = readFileSync(`/proc/${name}/stat`, "utf8");
    } catch {
      continue; // exited while we looked
    }
    // The command name is in parentheses and may contain spaces; the parent
    // pid is the second field after the closing one.
    const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
    const list = children.get(ppid) ?? [];
    list.push(Number(name));
    children.set(ppid, list);
  }
  const out: number[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const pid = queue.shift() as number;
    out.push(pid);
    queue.push(...(children.get(pid) ?? []));
  }
  return out;
}

/**
 * Sends `sig` to `root` and every descendant. The tree is read before
 * anything is signalled: once a parent dies, its children are reparented and
 * no longer reachable through it. A kill first stops the whole tree and reads
 * it again, so no process can start a child that escapes.
 */
export function signalTree(root: number, sig: NodeJS.Signals): void {
  let pids = processTree(root);
  if (sig === "SIGKILL") {
    send(pids, "SIGSTOP");
    pids = [...new Set([...pids, ...processTree(root)])];
  }
  send(pids, sig);
}

function send(pids: readonly number[], sig: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, sig);
    } catch {
      // already gone
    }
  }
}
