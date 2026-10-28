import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { processTree, signalTree } from "./proc-tree.js";

const linux = existsSync("/proc/self/stat");

function state(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0];
  } catch {
    return null;
  }
}

async function until(cond: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) {
      throw new Error("timed out");
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe.runIf(linux)("signalTree", () => {
  it("reaches a grandchild that moved to a process group of its own", async () => {
    // sh starts a grandchild in a new session (as a nested supervisor does with
    // its program), then waits on a child of its own.
    const root = spawn("sh", ["-c", "setsid sleep 30 & sleep 30"], {
      detached: true,
      stdio: "ignore",
    });
    const rootPid = root.pid as number;
    await until(() => processTree(rootPid).length >= 3);
    const tree = processTree(rootPid);
    expect(tree[0]).toBe(rootPid);

    signalTree(rootPid, "SIGSTOP");
    await until(() => tree.every((pid) => state(pid) === "T"));

    signalTree(rootPid, "SIGCONT");
    await until(() => tree.every((pid) => state(pid) !== "T"));

    signalTree(rootPid, "SIGKILL");
    await until(() => tree.every((pid) => state(pid) === null || state(pid) === "Z"));
  });
});
